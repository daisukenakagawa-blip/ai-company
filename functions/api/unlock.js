// 決済完了後の入口：/api/unlock?p=<商品>&session_id={CHECKOUT_SESSION_ID}
// Stripe に支払い状態・商品・金額・返金を問い合わせ、確かめられたら製品版を開く印（Cookie）を渡す。確かめられなければ開かない（Fail Closed）
import { makeToken, verifyPurchase, cookieHeader, isProduct, page } from "../../lib/shop_license.js";
const BAD = () => page(400, "リンクが正しくありません", "<p>購入後に表示されたリンクから、もう一度開いてください。</p>");

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") || "";
  const sid = url.searchParams.get("session_id") || "";
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !isProduct(slug)) return BAD();
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return BAD();
  const v = await verifyPurchase(env, slug, sid, { fresh: true });
  if (!v.ok) return page(v.code, v.title, `<p>${v.msg}</p>`);
  return new Response(null, { status: 302, headers: {
    Location: `/${slug}/tool.html`,
    "Set-Cookie": cookieHeader(slug, await makeToken(env.STRIPE_KEY, slug, sid)),
    "Cache-Control": "no-store" } });
}
