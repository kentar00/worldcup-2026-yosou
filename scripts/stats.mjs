// Auto-update stats.json from API-Football (api-sports.io).
//   - Set repo secret API_FOOTBALL_KEY (https://www.api-football.com/ -> free key, 100 req/day)
//   - Env: AF_LEAGUE (default '1' = World Cup), AF_SEASON (default '2026').
// For each FINISHED group-stage match not yet in stats.json, fetches statistics / players(ratings)
// / events from API-Football, maps team names to Japanese, and writes the per-match stats object.
// Output stats[GSid] = { possession[h,a], shots[h,a], shotsOnTarget[h,a], goals[], cards[], lineups{home,away}, subs{home,away} }
// Until API_FOOTBALL_KEY is set, exits 0 without changes (workflow stays green).
import fs from 'node:fs';

const API_KEY = process.env.API_FOOTBALL_KEY;
const LEAGUE  = process.env.AF_LEAGUE || '1';
const SEASON  = process.env.AF_SEASON || '2026';
const BASE    = 'https://v3.football.api-sports.io';
const HDRS    = { 'x-apisports-key': API_KEY };
const MAX_MATCHES = Number(process.env.AF_MAX || 12); // per run, to respect free-tier limits

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
  'congo dr':'コンゴ民主共和国','dr congo':'コンゴ民主共和国','democratic republic of the congo':'コンゴ民主共和国',
  'uzbekistan':'ウズベキスタン','qatar':'カタール','iraq':'イラク','south africa':'南アフリカ',
  'saudi arabia':'サウジアラビア','jordan':'ヨルダン',
  'bosnia and herzegovina':'ボスニア・ヘルツェゴビナ','bosnia herzegovina':'ボスニア・ヘルツェゴビナ',
  'cape verde':'カーボベルデ','cabo verde':'カーボベルデ','ghana':'ガーナ',
  'haiti':'ハイチ','curacao':'キュラソー','new zealand':'ニュージーランド'
};
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();
const jp = name => JP[norm(name)] || null;
const num = v => { const n = parseInt(String(v??'').replace(/[^0-9]/g,''),10); return isNaN(n)?0:n; };

async function af(path){
  const r = await fetch(BASE+path, { headers: HDRS });
  if(!r.ok) throw new Error('API-Football '+r.status+' '+(await r.text()).slice(0,160));
  const d = await r.json();
  return d.response || [];
}

async function main(){
  if(!API_KEY){ console.log('API_FOOTBALL_KEY not set — skipping stats update'); process.exit(0); }
  const results = JSON.parse(fs.readFileSync('results.json','utf8'));
  let stats = {};
  try { stats = JSON.parse(fs.readFileSync('stats.json','utf8')).stats || {}; } catch {}

  const todo = (results.gsMatches||[]).filter(m => m.hs!=null && m.as!=null && !stats[m.id]).slice(0, MAX_MATCHES);
  if(!todo.length){ console.log('no new finished matches to fetch'); process.exit(0); }

  let fixtures;
  try { fixtures = await af(`/fixtures?league=${LEAGUE}&season=${SEASON}`); }
  catch(e){ console.error('fixtures fetch failed:', e.message); process.exit(1); }
  const fxMap = new Map();
  for(const f of fixtures){
    const h = jp(f.teams?.home?.name), a = jp(f.teams?.away?.name);
    if(h && a) fxMap.set(h+'|'+a, f.fixture.id);
  }
  const findFixture = (home, away) => fxMap.get(home+'|'+away) || fxMap.get(away+'|'+home) || null;

  let done = 0;
  for(const m of todo){
    const fid = findFixture(m.home, m.away);
    if(!fid){ console.error('no fixture for', m.id, m.home, m.away); continue; }
    try {
      const [statsRes, players, events, lineupsRes] = await Promise.all([
        af(`/fixtures/statistics?fixture=${fid}`),
        af(`/fixtures/players?fixture=${fid}`),
        af(`/fixtures/events?fixture=${fid}`),
        af(`/fixtures/lineups?fixture=${fid}`),
      ]);
      const stat = (tname, type) => {
        const e = statsRes.find(x => jp(x.team?.name) === tname);
        const s = e?.statistics?.find(z => z.type === type);
        return s ? s.value : null;
      };
      const obj = {};
      const ph = stat(m.home,'Ball Possession'), pa = stat(m.away,'Ball Possession');
      if(ph!=null || pa!=null) obj.possession = [num(ph), num(pa)];
      obj.shots = [num(stat(m.home,'Total Shots')), num(stat(m.away,'Total Shots'))];
      obj.shotsOnTarget = [num(stat(m.home,'Shots on Goal')), num(stat(m.away,'Shots on Goal'))];

      // ratings (player-level) by id and by name
      const g0 = p => p.statistics?.[0]?.games || {};
      const ratById = new Map(), ratByName = new Map();
      for(const e of players){ for(const p of (e.players||[])){ const r = g0(p).rating!=null ? Number(g0(p).rating) : null; if(p.player?.id!=null) ratById.set(p.player.id, r); if(p.player?.name) ratByName.set(p.player.name, r); } }
      // lineups: formation + startXI with grid/pos/number + rating
      const teamLineup = tname => {
        const e = lineupsRes.find(x => jp(x.team?.name) === tname);
        if(!e) return null;
        return {
          formation: e.formation || null,
          players: (e.startXI || []).map(s => { const pl = s.player || {}; return { no: pl.number ?? null, name: pl.name, pos: pl.pos || null, grid: pl.grid || null, rating: ratById.has(pl.id) ? ratById.get(pl.id) : null }; }),
        };
      };
      obj.lineups = { home: teamLineup(m.home), away: teamLineup(m.away) };
      const ratOf = name => ratByName.has(name) ? ratByName.get(name) : null;

      const goals = [], cards = [], subsH = [], subsA = [];
      for(const ev of events){
        const tname = jp(ev.team?.name), min = ev.time?.elapsed ?? null;
        if(ev.type === 'Goal'){ goals.push({ player: ev.player?.name, team: tname, minute: min }); }
        else if(ev.type === 'Card'){ cards.push({ player: ev.player?.name, team: tname, minute: min, type: /red/i.test(ev.detail||'')?'R':'Y' }); }
        else if(ev.type === 'subst'){
          const rec = { minute: min, in: ev.player?.name, out: ev.assist?.name, rating: ratOf(ev.player?.name) };
          if(tname === m.home) subsH.push(rec); else if(tname === m.away) subsA.push(rec);
        }
      }
      if(goals.length) obj.goals = goals;
      if(cards.length) obj.cards = cards;
      obj.subs = { home: subsH, away: subsA };
      stats[m.id] = obj;
      done++;
    } catch(e){ console.error('match', m.id, 'failed:', e.message); }
  }

  fs.writeFileSync('stats.json', JSON.stringify({ updated: new Date().toISOString(), source: 'API-Football', stats }, null, 1));
  console.log('stats updated:', done, 'matches /', Object.keys(stats).length, 'total');
}
main();
