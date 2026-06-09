// Auto-update odds.json (1X2 / h2h) from The Odds API.
//   - Set repo secret ODDS_API_KEY (https://the-odds-api.com/ -> free key, 500 req/month)
//   - Env: ODDS_SPORT (default 'soccer_fifa_world_cup'), ODDS_REGIONS (default 'eu').
// Matches API events to our results.json matches by team name (same JP map as update.mjs),
// orients home/away to our match, averages h2h across bookmakers, and writes odds.json.
// Output: { updated, odds: { "<GSid or home|away>": { h, d, a } } }
// Until ODDS_API_KEY is set, this exits 0 without changes (workflow stays green).
import fs from 'node:fs';

const API_KEY = process.env.ODDS_API_KEY;
const SPORT   = process.env.ODDS_SPORT   || 'soccer_fifa_world_cup';
const REGIONS = process.env.ODDS_REGIONS || 'eu';
const BASE    = 'https://api.the-odds-api.com/v4';

// English/variant name -> Japanese name (matches config/results)
const JP = {
  'france':'フランス','spain':'スペイン','argentina':'アルゼンチン','england':'イングランド','portugal':'ポルトガル',
  'brazil':'ブラジル','netherlands':'オランダ','morocco':'モロッコ','belgium':'ベルギー','germany':'ドイツ',
  'croatia':'クロアチア','colombia':'コロンビア','senegal':'セネガル','mexico':'メキシコ',
  'united states':'アメリカ','usa':'アメリカ','united states of america':'アメリカ',
  'uruguay':'ウルグアイ','japan':'日本','switzerland':'スイス','iran':'イラン','ir iran':'イラン',
  'turkiye':'トルコ','turkey':'トルコ','ecuador':'エクアドル','austria':'オーストリア',
  'korea republic':'韓国','south korea':'韓国','korea':'韓国','republic of korea':'韓国',
  'australia':'オーストラリア','algeria':'アルジェリア','egypt':'エジプト','canada':'カナダ','norway':'ノルウェー',
  'panama':'パナマ','cote divoire':'コートジボワール','ivory coast':'コートジボワール',
  'sweden':'スウェーデン','paraguay':'パラグアイ','czechia':'チェコ','czech republic':'チェコ',
  'scotland':'スコットランド','tunisia':'チュニジア',
  'congo dr':'コンゴ民主共和国','dr congo':'コンゴ民主共和国','democratic republic of the congo':'コンゴ民主共和国','dr congo the':'コンゴ民主共和国',
  'uzbekistan':'ウズベキスタン','qatar':'カタール','iraq':'イラク','south africa':'南アフリカ',
  'saudi arabia':'サウジアラビア','jordan':'ヨルダン',
  'bosnia and herzegovina':'ボスニア・ヘルツェゴビナ','bosnia herzegovina':'ボスニア・ヘルツェゴビナ',
  'cape verde':'カーボベルデ','cabo verde':'カーボベルデ','ghana':'ガーナ',
  'haiti':'ハイチ','curacao':'キュラソー','new zealand':'ニュージーランド'
};
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();
const jp = name => { const n = norm(name); return JP[n] || null; };
const avg = arr => arr.length ? +(arr.reduce((s,x)=>s+x,0)/arr.length).toFixed(2) : null;

async function fetchOdds(){
  const url = `${BASE}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=h2h&oddsFormat=decimal`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Odds API '+res.status+' '+(await res.text()).slice(0,200));
  return res.json();
}

// Average h2h across bookmakers -> { HT, AT, h, d, a } in API home/away orientation
function consensus(ev){
  const h=[], d=[], a=[];
  for(const bk of ev.bookmakers||[]){
    const mk=(bk.markets||[]).find(m=>m.key==='h2h'); if(!mk) continue;
    for(const o of mk.outcomes||[]){
      if(o.name===ev.home_team) h.push(o.price);
      else if(o.name===ev.away_team) a.push(o.price);
      else d.push(o.price); // Draw
    }
  }
  return { HT: jp(ev.home_team), AT: jp(ev.away_team), h: avg(h), d: avg(d), a: avg(a) };
}

async function main(){
  if(!API_KEY){ console.log('ODDS_API_KEY not set — skipping odds update'); process.exit(0); }
  let events;
  try{ events = await fetchOdds(); }
  catch(e){ console.error('odds fetch failed:', e.message); process.exit(1); }

  const results = JSON.parse(fs.readFileSync('results.json','utf8'));
  // event lookup keyed by JP "home|away" (API orientation)
  const ev = new Map();
  for(const e of events){
    const c = consensus(e);
    if(!c.HT || !c.AT || c.h==null) continue;
    ev.set(c.HT+'|'+c.AT, {h:c.h, d:c.d, a:c.a});
  }
  const pick = (home, away) => {
    const f = ev.get(home+'|'+away);
    if(f) return {h:f.h, d:f.d, a:f.a};
    const r = ev.get(away+'|'+home);             // reversed orientation
    if(r) return {h:r.a, d:r.d, a:r.h};
    return null;
  };

  const odds = {};
  for(const m of results.gsMatches||[]){ const o = pick(m.home, m.away); if(o) odds[m.id] = o; }
  for(const m of results.koMatches||[]){ const o = pick(m.home, m.away); if(o) odds[m.home+'|'+m.away] = o; }

  fs.writeFileSync('odds.json', JSON.stringify({ updated: new Date().toISOString(), odds }, null, 1));
  console.log('odds updated:', Object.keys(odds).length, 'matches');
}
main();
