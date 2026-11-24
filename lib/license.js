// 買った人だけが製品版を開けるようにする（Cloudflare Pages Functions、無料枠）
// 署名の鍵は Pages の環境変数 STRIPE_KEY（Stripe の制限付きキー：Checkout Sessions の読み取りのみ）を使う。
// ここにキーを書かないこと。
export const PRODUCTS = {
  "jusho-check": { app: "/jusho-check/app/", page: "/jusho-check/" },
};
const enc = new TextEncoder();
async function sign(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode("genhayl-license:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function makeToken(secret, slug, sid, days) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const body = `${slug}.${exp}.${sid}`;
  return `${body}.${await sign(secret, body)}`;
}
export async function checkToken(secret, slug, token) {
  if (!secret || !token) return false;
  const p = token.split(".");
  if (p.length !== 4 || p[0] !== slug) return false;
  if (!(+p[1] > Date.now() / 1000)) return false;
  const want = await sign(secret, `${p[0]}.${p[1]}.${p[2]}`);
  if (want.length !== p[3].length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ p[3].charCodeAt(i);
  return diff === 0;
}
export function getCookie(request, name) {
  const h = request.headers.get("Cookie") || "";
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}
export function htmlPage(status, title, body) {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}｜GENHAYL</title>
<style>body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#f7f7f5;color:#1f2937;line-height:1.8;margin:0}main{max-width:640px;margin:0 auto;padding:40px 16px}a{color:#0f766e}</style></head>
<body><main><h1 style="font-size:22px">${title}</h1>${body}<p style="font-size:13px;margin-top:32px"><a href="/">GENHAYL の小さな道具</a>　<a href="/tokushoho.html">特定商取引法に基づく表記（お問い合わせ先）</a></p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
