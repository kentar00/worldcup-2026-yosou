// 戦力指数（100点満点）算出スクリプト ＝ 実績(Elo) ＋ タレント(市場価値log) ＋ 開催国
// 重みはブックメーカーの優勝オッズ(市場の総意)へ回帰でフィット（恣意性を排す）。
// 入力はすべて公開・定量データ（手動収集の一括入力）。再実行で strength.json を再生成。
//   Elo: eloratings.net (2026-06-16) / FIFA: 2026-06-11ランキング
//   市場価値・平均年齢: Transfermarkt / 優勝オッズ: BetMGM 全48チーム盤 (2026-06-15)
import fs from 'node:fs';

// jp, elo, fifa, valueM(€m), avgAge, outrightOdds(decimal), host(US/CA/MX=1)
const D=[
["メキシコ",1896,1687.48,192,26.3,51,1],["南アフリカ",1527,1428.38,49,26.8,1001,0],["韓国",1771,1591.63,139,27.7,201,0],["チェコ",1696,1505.74,188,27.0,301,0],
["カナダ",1777,1559.48,199,25.8,151,1],["ボスニア・ヘルツェゴビナ",1596,1387.22,146,26.4,251,0],["カタール",1437,1450.31,20,28.6,1001,0],["スイス",1885,1650.06,333,27.7,67,0],
["ブラジル",1986,1765.86,928,28.6,10,0],["モロッコ",1866,1755.10,448,24.7,41,0],["ハイチ",1528,1293.10,56,27.1,2501,0],["スコットランド",1768,1503.34,170,28.8,151,0],
["アメリカ",1820,1671.23,386,26.4,34,1],["パラグアイ",1816,1505.35,154,27.8,301,0],["オーストラリア",1799,1579.34,77,27.3,101,0],["トルコ",1813,1605.73,474,26.7,126,0],
["ドイツ",1954,1735.77,947,27.5,15,0],["キュラソー",1453,1294.77,26,27.5,2501,0],["コートジボワール",1728,1540.87,522,25.1,101,0],["エクアドル",1864,1598.52,369,23.8,101,0],
["オランダ",1972,1753.57,754,26.6,19,0],["日本",1925,1661.58,271,27.4,51,0],["スウェーデン",1727,1509.79,406,26.9,81,0],["チュニジア",1570,1476.41,70,26.1,751,0],
["ベルギー",1879,1742.24,548,27.0,34,0],["エジプト",1711,1562.37,116,28.4,251,0],["イラン",1756,1619.58,32,28.7,501,0],["ニュージーランド",1578,1275.58,34,27.6,1001,0],
["スペイン",2129,1874.71,1220,26.1,5.5,0],["カーボベルデ",1606,1371.11,49,29.2,1001,0],["サウジアラビア",1598,1423.88,41,27.9,1001,0],["ウルグアイ",1870,1673.07,359,26.5,67,0],
["フランス",2084,1870.70,1520,26.5,5.5,0],["セネガル",1839,1684.07,478,26.4,81,0],["イラク",1592,1446.28,21,26.0,1001,0],["ノルウェー",1929,1557.44,590,26.3,34,0],
["アルゼンチン",2128,1877.27,808,27.0,10,0],["アルジェリア",1759,1571.03,257,25.5,251,0],["オーストリア",1857,1597.40,245,28.0,151,0],["ヨルダン",1653,1387.74,20,27.4,1001,0],
["ポルトガル",1967,1767.85,1010,27.4,8,0],["コンゴ民主共和国",1674,1474.43,144,28.5,751,0],["ウズベキスタン",1698,1458.73,85,27.5,1001,0],["コロンビア",1998,1698.35,302,29.5,41,0],
["イングランド",2055,1828.02,1360,26.6,8,0],["クロアチア",1881,1714.87,387,27.9,81,0],["ガーナ",1557,1346.88,235,26.0,501,0],["パナマ",1683,1539.16,35,29.2,1001,0],
];
const ln=Math.log;
const R=D.map(r=>({jp:r[0],elo:r[1],fifa:r[2],val:r[3],age:r[4],odds:r[5],host:r[6],lnval:ln(r[3]),smkt:-ln(r[5])}));
const mean=a=>a.reduce((x,c)=>x+c,0)/a.length, sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
function ols(y,X){const n=X.length,p=X[0].length;const A=Array.from({length:p},()=>Array(p).fill(0)),c=Array(p).fill(0);
 for(let i=0;i<n;i++)for(let a=0;a<p;a++){c[a]+=X[i][a]*y[i];for(let b=0;b<p;b++)A[a][b]+=X[i][a]*X[i][b];}
 const M=A.map((r,i)=>[...r,c[i]]);
 for(let col=0;col<p;col++){let pv=col;for(let r=col+1;r<p;r++)if(Math.abs(M[r][col])>Math.abs(M[pv][col]))pv=r;[M[col],M[pv]]=[M[pv],M[col]];const d=M[col][col];for(let k=col;k<=p;k++)M[col][k]/=d;for(let r=0;r<p;r++)if(r!==col){const f=M[r][col];for(let k=col;k<=p;k++)M[r][k]-=f*M[col][k];}}
 const b=M.map(r=>r[p]),yh=X.map(row=>row.reduce((s,v,j)=>s+v*b[j],0));
 const yb=mean(y),r2=1-y.reduce((s,c2,i)=>s+(c2-yh[i])**2,0)/y.reduce((s,c2)=>s+(c2-yb)**2,0);
 return {b,yh,r2};}
const y=R.map(r=>r.smkt);
const fit=ols(y,R.map(r=>[1,r.elo,r.lnval,r.host]));
const yh=fit.yh;
const eloA=R.map(r=>r.elo),lvA=R.map(r=>r.lnval);
// 偏差値 = 50 + 10 * z (平均50・標準偏差10)
const zdev=(v,a)=>{const mm=mean(a),ss=sd(a);return Math.round(50+10*(v-mm)/ss);};
const preds=["elo","lnval","host"];const beta=preds.map((p,i)=>fit.b[i+1]*sd(R.map(r=>r[p]))/sd(y));
const wsum=beta.reduce((s,x)=>s+Math.abs(x),0);
const w=beta.map(x=>Math.round(100*Math.abs(x)/wsum));

const teams={};
R.forEach((r,i)=>{teams[r.jp]={
  dev:zdev(yh[i],yh),            // 総合戦力偏差値
  recDev:zdev(r.elo,eloA),       // 実績(Elo) 偏差値
  talDev:zdev(r.lnval,lvA),      // タレント(市場価値log) 偏差値
  elo:r.elo, fifa:r.fifa, valueM:r.val, age:r.age, odds:r.odds, host:r.host
};});
const out={
  updated:"2026-06-21",
  meta:{
    scale:"偏差値（平均50・標準偏差10）",
    weights:{rec:w[0],tal:w[1],host:w[2]},
    r2:Math.round(fit.r2*1000)/1000,
    sources:"Elo: eloratings.net (6/16) / FIFA: 6/11ランキング / 市場価値・年齢: Transfermarkt / 優勝オッズ: BetMGM全48チーム盤 (6/15)"
  },
  teams
};
fs.writeFileSync("strength.json", JSON.stringify(out,null,1));
console.log("strength.json written:",Object.keys(teams).length,"teams / R^2",out.meta.r2,"/ 重み 実績"+w[0]+"% タレント"+w[1]+"% 開催国"+w[2]+"%");
