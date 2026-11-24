// 決済完了後の入口：/api/unlock?p=<商品>&session_id={CHECKOUT_SESSION_ID}
// Stripe に支払い状態・商品・金額・返金を問い合わせ、確かめられたら製品版を開く印（Cookie）を渡す。確かめられなければ開かない（Fail Closed）
import { makeToken, verifyPurchase, cookieHeader, isProduct, page } from "../../lib/shop_license.js";
const MAX_DEVICES = 3;
const BAD = () => page(400, "リンクが正しくありません", "<p>購入後に表示されたリンクから、もう一度開いてください。</p>");

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") || "";
  const sid = url.searchParams.get("session_id") || "";
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !isProduct(slug)) return BAD();
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return BAD();
  const v = await verifyPurchase(env, slug, sid, { fresh: true });
  if (!v.ok) return page(v.code, v.title, `<p>${v.msg}</p>`);
  // 決済ID の使い回し防止：KV（UNLOCKS）が紐づいていれば、1件の購入で開ける端末を MAX_DEVICES 台までにする
  if (env.UNLOCKS) {
    const k = `u:${sid}`;
    const n = parseInt((await env.UNLOCKS.get(k)) || "0", 10);
    if (n >= MAX_DEVICES) return page(403, "開ける端末の上限に達しました", `<p>1件の購入で製品版を開けるのは ${MAX_DEVICES} 台までです。別の端末で開く必要がある場合は、お問い合わせ先までご連絡ください。</p>`);
    await env.UNLOCKS.put(k, String(n + 1), { expirationTtl: 30 * 86400 });
  }
  return new Response(null, { status: 302, headers: {
    Location: `/${slug}/tool.html`,
    "Set-Cookie": cookieHeader(slug, await makeToken(env.STRIPE_KEY, slug, sid)),
    "Cache-Control": "no-store" } });
}
