// Auto-update news.json — サッカー日本代表の最新ニュース（Google ニュースRSS・横断キュレーション）。
// キー不要。複数クエリを取得→重複除去→新着順→上位 NEWS_MAX 件を news.json に書き出す。
// Env: NEWS_QUERIES（カンマ区切り, 既定 "サッカー日本代表,森保ジャパン"）, NEWS_MAX（既定 20）。
import fs from 'node:fs';

const QUERIES = (process.env.NEWS_QUERIES || 'サッカー日本代表 分析,サッカー日本代表 戦術,サッカー日本代表 スタメン予想,サッカー日本代表 プレビュー,森保ジャパン 練習,サッカー日本代表 コラム').split(',').map(s => s.trim()).filter(Boolean);
const MAX = Number(process.env.NEWS_MAX || 20);
// 放送予定・チケット・グッズ・芸能/タレント絡みを除外
const EXCLUDE = /(放送(予定|時間|局|日程)?|テレビ中継|中継|生中継|配信|見逃し|視聴方法|どこで見|地上波|ライブ配信|無料視聴|チケット|発売|販売|グッズ|福袋|くじ|抽選|ガチャ|点灯式|応援ソング|応援イベント|エール|タレント|アイドル|グラビア|声優|お笑い|芸人|女優|俳優|歌手|モデル|コラボ|CMソング|出演|登場|うた)/;
// 分析・予想・戦術・練習・コラム等を優先
const INCLUDE = /(分析|戦術|プレビュー|予想|スタメン|先発|起用|布陣|フォーメーション|采配|評価|コラム|練習|トレーニング|合宿|紅白戦|調整|ミーティング|対策|キーマン|展望|考察|解説|攻略|起用法|テストマッチ|親善試合の|システム)/;

function decode(s){
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

async function feed(q){
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WC2026-news/1.0)' } });
  if(!r.ok) throw new Error('Google News '+r.status);
  const xml = await r.text();
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g; let m;
  while((m = re.exec(xml))){
    const it = m[1];
    const rawTitle = decode((/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(it) || [])[1]);
    const link = ((/<link>([\s\S]*?)<\/link>/.exec(it) || [])[1] || '').trim();
    const source = decode((/<source[^>]*>([\s\S]*?)<\/source>/.exec(it) || [])[1]);
    const pub = ((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it) || [])[1] || '').trim();
    const ts = pub ? Date.parse(pub) : 0;
    let title = rawTitle;                       // Google は末尾に " - 媒体名" を付ける → 除去
    if(source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    if(title && link) out.push({ title, url: link, source, date: pub, ts });
  }
  return out;
}

async function main(){
  let all = [];
  for(const q of QUERIES){
    try { all = all.concat(await feed(q)); }
    catch(e){ console.error('query failed:', q, e.message); }
  }
  if(!all.length){ console.error('no news fetched'); process.exit(1); }
  // 先頭の定型語を除去し、記号・空白・数字を無視して正規化（通信社系の同一記事を集約）
  const strip = t => (t || '').replace(/^(サッカー)?(日本代表|森保ジャパン)[\s、,，：:・]*/, '').trim();
  const normKey = t => strip(t).replace(/[【】\[\]（）()「」『』《》〈〉〔〕"'、。，・！!？?\s＝=―\-—－0-9０-９]/g, '').slice(0, 16);
  const keys = [], uniq = [];
  for(const x of all.sort((a, b) => b.ts - a.ts)){
    const k = normKey(x.title); if(!k) continue;
    let dup = false;
    for(const s of keys){ const same = (s.length >= 10 && k.length >= 10) ? s.slice(0, 10) === k.slice(0, 10) : s === k; if(same){ dup = true; break; } }
    if(dup) continue; keys.push(k); uniq.push(x);
  }
  // 放送/芸能などを除外 → 分析・予想・戦術・練習を優先
  const pool = uniq.filter(x => !EXCLUDE.test(x.title));
  const good = pool.filter(x => INCLUDE.test(x.title));
  const rest = pool.filter(x => !INCLUDE.test(x.title));
  const picked = (good.length >= MAX ? good : good.concat(rest)).slice(0, MAX);
  const items = picked.map(({ title, url, source, date }) => ({ title, url, source, date }));
  console.log(`pool ${pool.length} / 分析系 ${good.length} → ${items.length}件`);
  fs.writeFileSync('news.json', JSON.stringify({ updated: new Date().toISOString(), source: 'Google ニュース', items }, null, 1));
  console.log('news updated:', items.length, 'items');
}
main();
