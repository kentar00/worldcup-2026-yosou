// Auto-update results.json from a football results API.
// Default implementation: football-data.org v4.
//   - Set repo secret FOOTBALL_API_KEY (https://www.football-data.org/ → free token)
//   - Verify the competition code for the 2026 World Cup (default "WC").
// To switch providers (e.g. API-Football), replace fetchMatches() only;
// keep the normalized shape: {home, away, homeScore, awayScore, penHome, penAway, stage, finished}
import fs from 'node:fs';

const API_KEY = process.env.FOOTBALL_API_KEY;
const COMP    = process.env.COMP_CODE || 'WC';
const BASE    = 'https://api.football-data.org/v4';

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
const STAGE = {LAST_32:'R32', LAST_16:'R16', QUARTER_FINALS:'QF', SEMI_FINALS:'SF', FINAL:'F'};

const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,'').trim();
function jp(...cands){ for(const c of cands){ const n=norm(c); if(JP[n]) return JP[n]; } return null; }

async function fetchMatches(){
  const res = await fetch(`${BASE}/competitions/${COMP}/matches`, {headers:{'X-Auth-Token':API_KEY}});
  if(!res.ok) throw new Error('API '+res.status+' '+(await res.text()).slice(0,200));
  const data = await res.json();
  return (data.matches||[]).map(m=>({
    id: m.id,
    home: jp(m.homeTeam?.name, m.homeTeam?.shortName, m.homeTeam?.tla),
    away: jp(m.awayTeam?.name, m.awayTeam?.shortName, m.awayTeam?.tla),
    homeScore: m.score?.fullTime?.home,
    awayScore: m.score?.fullTime?.away,
    penHome: m.score?.penalties?.home, penAway: m.score?.penalties?.away,
    stage: m.stage, finished: m.status==='FINISHED'
  }));
}

// 得点者を試合詳細から取得（football-data.org の /v4/matches/{id} は goals を含む）
async function fetchScorers(id){
  if(id==null) return null;
  try{
    const res = await fetch(`${BASE}/matches/${id}`, {headers:{'X-Auth-Token':API_KEY}});
    if(!res.ok) return null;
    const d = await res.json();
    const goals = d.goals || [];
    if(!goals.length) return [];
    return goals.map(g=>({
      player: g.scorer?.name || '',
      minute: g.minute!=null ? g.minute : null,
      team: jp(g.team?.name, g.team?.tla) || g.team?.name || ''
    })).filter(s=>s.player);
  }catch{ return null; }
}

async function main(){
  // キー待ち: 未設定なら成功扱いで終了（他スクリプト odds/stats/news と同じ運用。手動更新を上書きしない）
  if(!API_KEY){ console.log('FOOTBALL_API_KEY not set — skipping results update (manual data preserved)'); process.exit(0); }
  const results = JSON.parse(fs.readFileSync('results.json','utf8'));
  let matches;
  try{ matches = await fetchMatches(); }
  catch(e){ console.error('fetch failed:', e.message); process.exit(1); }

  let gs=0, ko=0;
  for(const m of matches){
    if(!m.finished || !m.home || !m.away || m.homeScore==null) continue;
    if(m.stage==='GROUP_STAGE'){
      const f = results.gsMatches.find(x => (x.home===m.home&&x.away===m.away)||(x.home===m.away&&x.away===m.home));
      if(f){
        if(f.home===m.home){f.hs=m.homeScore; f.as=m.awayScore;} else {f.hs=m.awayScore; f.as=m.homeScore;}
        gs++;
        if(!f.scorers || !f.scorers.length){ const sc = await fetchScorers(m.id); if(sc && sc.length) f.scorers = sc; }
      }
    } else if(STAGE[m.stage]){
      const round = STAGE[m.stage];
      let winner=null;
      if(m.homeScore>m.awayScore) winner=m.home;
      else if(m.awayScore>m.homeScore) winner=m.away;
      else if(m.penHome!=null && m.penAway!=null) winner = m.penHome>m.penAway ? m.home : m.away;
      if(winner){
        const ex = results.koMatches.find(x => x.round===round && ((x.home===m.home&&x.away===m.away)||(x.home===m.away&&x.away===m.home)));
        if(ex){ ex.winner=winner; } else { results.koMatches.push({round, home:m.home, away:m.away, winner}); }
        ko++;
      }
    }
  }
  fs.writeFileSync('results.json', JSON.stringify(results,null,1));
  console.log(`updated  GS:${gs}  KO:${ko}`);
}
main();
