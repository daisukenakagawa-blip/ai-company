// 店の自社計測（Ver.2.5 第3条）。プライバシーに配慮した最小限の集計だけを KV（UNLOCKS）に日ごとに保存する
// 保存するもの：ページごとの閲覧数、外部からの入口（流入元のドメイン・ref= の値）、国、購入ボタン・お試しの利用のクリック数
// 保存しないもの：IP アドレス、端末の識別子、Cookie による追跡、URL の検索語。来訪者に Cookie は付けない（オーナーの除外用 Cookie だけ）
// ボット・自分の操作：ボットらしい User-Agent は保存しない。オーナーは /?owner=1 を一度開くと以降「オーナー」として別に数える
// 計測の失敗はページの表示に影響させない（すべて try/catch）

import { isProduct } from "./shop_license.js";
export const DAY_CAP = 800; // KV の無料枠（1日1,000回の書き込み）を超えないよう、1日の記録はここまで
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack|skype|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl|wget|httpclient|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|scrapy|feedfetcher|validator|semrush|ahrefs|mj12|dotbot|petal|yandex|baidu|bytespider|gptbot|chatgpt|oai-searchbot|claude|anthropic|perplexity|ccbot|applebot|amazonbot|duckduckbot/i;

export function jstDate(ms = Date.now()) { return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
export function isBot(ua) { return !ua || ua.length < 20 || BOT.test(ua); }
export function isOwner(request) { return /(?:^|;\s*)gs_owner=1(?:;|$)/.test(request.headers.get("Cookie") || ""); }

// 閲覧として数えるパス：HTML のページだけ（/、/x/、/x/demo.html、/guide/x.html など）。/api と画像・JS は数えない
export function pagePath(u) {
  const p = u.pathname;
  if (p.startsWith("/api/")) return null;
  // 店に実在するページだけ（/.git/・/wp-content/ などの脆弱性探しのアクセスは数えない。2026-11-27）
  const seg = p.split("/")[1] || "";
  if (!(p === "/" || p === "/tokushoho.html" || seg === "guide" || isProduct(seg))) return null;
  if (p.endsWith("/") || p.endsWith(".html")) return p.length > 120 ? null : p;
  if (/^\/[a-z0-9-]+\/tool$/.test(p)) return p + ".html";
  return null;
}
export function source(request, u) {
  const ref = u.searchParams.get("ref");
  if (ref && /^[a-z0-9_.-]{1,30}$/i.test(ref)) return "ref:" + ref.toLowerCase();
  const r = request.headers.get("Referer") || "";
  if (!r) return "（直接・不明）";
  try { const h = new URL(r).hostname; return h === u.hostname ? null : h.slice(0, 80); } catch (e) { return "（不明）"; }
}

async function bump(env, date, fn) {
  const kv = env.UNLOCKS; if (!kv) return false;
  const key = `m:${date}`;
  let d = null; try { d = JSON.parse((await kv.get(key)) || "null"); } catch (e) { }
  d = d || { n: 0, pv: {}, entry: {}, src: {}, cc: {}, ev: {}, own: 0, over: 0 };
  if (d.n >= DAY_CAP) { return false; }
  d.n++; fn(d);
  await kv.put(key, JSON.stringify(d), { expirationTtl: 400 * 86400 });
  return true;
}
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };

// ページの閲覧（middleware から呼ぶ）
export async function recordView(request, env) {
  try {
    if (request.method !== "GET") return false;
    const u = new URL(request.url), path = pagePath(u);
    if (!path || isBot(request.headers.get("User-Agent"))) return false;
    if (isOwner(request)) return await bump(env, jstDate(), d => { d.own++; });
    const src = source(request, u), cc = (request.cf && request.cf.country) || "??";
    return await bump(env, jstDate(), d => {
      inc(d.pv, path);
      if (src) { inc(d.src, src); inc(d.entry, path); inc(d.cc, cc); }
    });
  } catch (e) { return false; }
}

// ブラウザからの出来事（/api/ev）：buy＝購入ボタンのクリック、demo_use＝お試し版で操作した
const EVENTS = { buy: 1, demo_use: 1 };
export async function recordEvent(request, env) {
  try {
    if (isBot(request.headers.get("User-Agent"))) return false;
    const body = JSON.parse((await request.text()).slice(0, 500) || "{}");
    const t = String(body.t || ""), p = String(body.p || "");
    if (!EVENTS[t] || !/^\/[a-z0-9-]+\/(?:demo\.html|index\.html)?$/.test(p)) return false;
    if (isOwner(request)) return await bump(env, jstDate(), d => { d.own++; });
    return await bump(env, jstDate(), d => { inc(d.ev, t + " " + p); });
  } catch (e) { return false; }
}

// 集計の読み出し（/api/stats?days=14）。数字だけで、個人を特定できる情報は持っていない
export async function readStats(env, days = 14, now = Date.now()) {
  const out = { days: [], total: { pv: 0, entries: 0, buy: 0, demo_use: 0, owner: 0 }, pages: {}, sources: {}, countries: {}, events: {}, note: "" };
  if (!env.UNLOCKS) { out.note = "KV（UNLOCKS）が紐づいていないため計測していません"; return out; }
  for (let i = days - 1; i >= 0; i--) {
    const date = jstDate(now - i * 86400e3);
    let d = null; try { d = JSON.parse((await env.UNLOCKS.get(`m:${date}`)) || "null"); } catch (e) { }
    if (!d) { out.days.push({ date, pv: 0, entries: 0, buy: 0, demo_use: 0, owner: 0, capped: false }); continue; }
    const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
    const ev = k => Object.entries(d.ev || {}).filter(([x]) => x.startsWith(k + " ")).reduce((a, [, v]) => a + v, 0);
    const row = { date, pv: sum(d.pv), entries: sum(d.src), buy: ev("buy"), demo_use: ev("demo_use"), owner: d.own || 0, capped: d.n >= DAY_CAP };
    out.days.push(row);
    for (const k of ["pv", "entries", "buy", "demo_use", "owner"]) out.total[k] += row[k];
    for (const [k, v] of Object.entries(d.pv || {})) out.pages[k] = (out.pages[k] || 0) + v;
    for (const [k, v] of Object.entries(d.src || {})) out.sources[k] = (out.sources[k] || 0) + v;
    for (const [k, v] of Object.entries(d.cc || {})) out.countries[k] = (out.countries[k] || 0) + v;
    for (const [k, v] of Object.entries(d.ev || {})) out.events[k] = (out.events[k] || 0) + v;
  }
  const top = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 60));
  out.pages = top(out.pages); out.sources = top(out.sources); out.countries = top(out.countries); out.events = top(out.events);
  out.note = "ボットらしいアクセスとオーナーの閲覧は除外（オーナーは owner に件数だけ）。entries＝外部・直接から来た最初のページ。KV の性質上、同時のアクセスで少なめに数えることがある（最低値として扱う）。1日 " + DAY_CAP + " 件で記録を止める（capped）";
  return out;
}

// 商品ページ・お試し版に差し込む小さなスクリプト（購入ボタンのクリックと、お試し版での最初の操作だけを送る）
export const BEACON = `<script>(function(){function s(t){try{var b=JSON.stringify({t:t,p:location.pathname});if(navigator.sendBeacon)navigator.sendBeacon("/api/ev",b);else fetch("/api/ev",{method:"POST",body:b,keepalive:true})}catch(e){}}var u=0;document.addEventListener("click",function(e){var el=e.target&&e.target.closest?e.target:null;if(!el)return;var a=el.closest("a");if(a&&/^https:\\/\\/buy\\.stripe\\.com\\//.test(a.href)){s("buy");return}if(!u&&/\\/demo\\.html$/.test(location.pathname)&&el.closest("button,input[type=file]")){u=1;s("demo_use")}},true)})();</script>`;
export function wantsBeacon(u) { return /^\/[a-z0-9-]+\/(?:index\.html|demo\.html)?$/.test(u.pathname) && u.pathname !== "/guide/"; }
