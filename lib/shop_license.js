// 店（genhayl-shop）の製品版を、買った人だけが開けるようにする（Cloudflare Pages Functions、無料枠）
// 鍵は Pages のシークレット STRIPE_KEY（Stripe の制限付きキー。ここにキーを書かない）。
// Fail Closed：キーが無い・Stripe に確かめられない・署名が合わない場合は、製品版を開かない。
import LINKS from "./shop_links.json";

const enc = new TextEncoder();
export const RECHECK_DAYS = 7;      // この日数ごとに、返金されていないかを Stripe に確かめ直す
export const UNLOCK_HOURS = 72;     // 決済から何時間以内なら、決済ID で製品版を開けるか（決済ID の使い回しを制限）
export const COOKIE_DAYS = 400;

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode("genhayl-shop:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 印の中身：商品.次に確かめ直す時刻.決済ID.署名
export async function makeToken(secret, slug, sid, now = Date.now()) {
  const recheck = Math.floor(now / 1000) + RECHECK_DAYS * 86400;
  const body = `${slug}.${recheck}.${sid}`;
  return `${body}.${await sign(secret, body)}`;
}

// 戻り値：{ ok:false } 署名が合わない／別の商品 ／ { ok:true, fresh:bool, sid }
export async function readToken(secret, slug, token, now = Date.now()) {
  if (!secret || !token) return { ok: false };
  const p = token.split(".");
  if (p.length !== 4 || p[0] !== slug || !/^\d+$/.test(p[1]) || !/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(p[2])) return { ok: false };
  const want = await sign(secret, `${p[0]}.${p[1]}.${p[2]}`);
  if (want.length !== p[3].length) return { ok: false };
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ p[3].charCodeAt(i);
  if (d !== 0) return { ok: false };
  return { ok: true, fresh: +p[1] > now / 1000, sid: p[2] };
}

// Stripe に決済を問い合わせ、この商品の正しい支払いで、返金・取り消しが無いかを確かめる
// 戻り値：{ ok:true } / { ok:false, code, title, msg }
export async function verifyPurchase(env, slug, sid, { fresh = false, now = Date.now() } = {}) {
  if (!env.STRIPE_KEY) return fail(503, "購入の確認ができません", "ただいま購入の確認ができない状態です。お手数ですが、特定商取引法に基づく表記のお問い合わせ先までご連絡ください。");
  let s;
  try {
    const q = "expand[]=payment_intent&expand[]=payment_intent.latest_charge";
    const r = await (env.STRIPE_FETCH || fetch)(`https://api.stripe.com/v1/checkout/sessions/${sid}?${q}`, { headers: { Authorization: `Bearer ${env.STRIPE_KEY}` } });
    if (r.status === 404) return fail(403, "購入を確認できませんでした", "この購入は見つかりませんでした。購入後に表示されたリンクから開いてください。");
    if (!r.ok) throw new Error(String(r.status));
    s = await r.json();
  } catch (e) {
    return fail(502, "購入の確認に失敗しました", "決済サービスへの問い合わせがうまくいきませんでした。少し待ってから、このページを再読み込みしてください。");
  }
  const want = LINKS[s.payment_link];
  const live = sid.startsWith("cs_live_");
  const ok = want && want.slug === slug && s.status === "complete" && s.payment_status === "paid" && s.mode === "payment"
    && s.livemode === live && s.currency === want.currency && s.amount_total === want.amount;
  if (!ok) return fail(403, "購入を確認できませんでした", "支払いが完了していないか、別の商品の購入です。数分たっても開けない場合は、お問い合わせ先までご連絡ください。");
  const pi = s.payment_intent, ch = pi && pi.latest_charge;
  if (!pi || typeof pi !== "object" || pi.status !== "succeeded" || !ch || typeof ch !== "object")
    return fail(502, "購入の確認に失敗しました", "支払いの状態を確かめられませんでした。少し待ってから、このページを再読み込みしてください。");
  if (ch.refunded || ch.amount_refunded > 0 || ch.disputed) return fail(403, "この購入は返金または取り消し済みです", "返金・取り消しされた購入では、製品版は使えません。");
  if (fresh && now / 1000 - s.created > UNLOCK_HOURS * 3600)
    return fail(403, "このリンクの有効期限が切れています", `購入後のリンクは ${UNLOCK_HOURS} 時間以内に開いてください。すでに購入済みで開けない場合は、お問い合わせ先までご連絡ください。`);
  return { ok: true };
}
function fail(code, title, msg) { return { ok: false, code, title, msg }; }

export function getCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) { try { return decodeURIComponent(part.slice(i + 1)); } catch { return ""; } }
  }
  return "";
}
export function cookieHeader(slug, token) {
  return `gs_${slug}=${encodeURIComponent(token)}; Path=/${slug}/; Max-Age=${COOKIE_DAYS * 86400}; Secure; HttpOnly; SameSite=Lax`;
}
export function isProduct(slug) { return Object.values(LINKS).some(v => v.slug === slug); }

export function page(status, title, body) {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}｜GENHAYL</title><style>body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#f7f7f5;color:#1f2937;line-height:1.8;margin:0}main{max-width:640px;margin:0 auto;padding:40px 16px}a{color:#0f766e}</style></head><body><main><h1 style="font-size:22px">${title}</h1>${body}<p style="font-size:13px;margin-top:32px"><a href="/">GENHAYL の小さな道具</a>　<a href="/tokushoho.html">特定商取引法に基づく表記（お問い合わせ先）</a></p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
