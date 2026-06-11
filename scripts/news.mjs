// Auto-update news.json — サッカー日本代表の最新ニュース（Google ニュースRSS・横断キュレーション）。
// キー不要。複数クエリを取得→重複除去→新着順→上位 NEWS_MAX 件を news.json に書き出す。
// Env: NEWS_QUERIES（カンマ区切り, 既定 "サッカー日本代表,森保ジャパン"）, NEWS_MAX（既定 20）。
import fs from 'node:fs';

const QUERIES = (process.env.NEWS_QUERIES || 'サッカー日本代表,森保ジャパン').split(',').map(s => s.trim()).filter(Boolean);
const MAX = Number(process.env.NEWS_MAX || 20);

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
  const seen = new Set(), uniq = [];
  for(const x of all.sort((a, b) => b.ts - a.ts)){
    const k = x.title; if(seen.has(k)) continue; seen.add(k); uniq.push(x);
  }
  const items = uniq.slice(0, MAX).map(({ title, url, source, date }) => ({ title, url, source, date }));
  fs.writeFileSync('news.json', JSON.stringify({ updated: new Date().toISOString(), source: 'Google ニュース', items }, null, 1));
  console.log('news updated:', items.length, 'items');
}
main();
