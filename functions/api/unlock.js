// 決済完了後の入口：/api/unlock?p=<商品>&session_id={CHECKOUT_SESSION_ID}
// Stripe に「支払い済みか・どの商品の Payment Link か」を問い合わせ、確かめられたら製品版を開く印（Cookie）を渡す
import { makeToken, page } from "../../lib/shop_license.js";
import LINKS from "../../lib/shop_links.json";
const DAYS = 400;
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") || "";
  const sid = url.searchParams.get("session_id") || "";
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !Object.values(LINKS).includes(slug)) return page(400, "リンクが正しくありません", "<p>購入後に表示されたリンクから、もう一度開いてください。</p>");
  const tool = `/${slug}/tool.html`;
  if (!env.STRIPE_KEY) return Response.redirect(new URL(tool, request.url).toString(), 302); // 鍵の設定前は今までどおり
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) return page(400, "リンクが正しくありません", "<p>購入後に表示されたリンクから、もう一度開いてください。</p>");
  let s;
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}`, { headers: { Authorization: `Bearer ${env.STRIPE_KEY}` } });
    if (r.status === 404) return page(403, "購入を確認できませんでした", "<p>この購入は見つかりませんでした。購入後に表示されたリンクから開いてください。</p>");
    if (!r.ok) throw new Error(String(r.status));
    s = await r.json();
  } catch (e) {
    return page(502, "購入の確認に失敗しました", "<p>決済サービスへの問い合わせがうまくいきませんでした。少し待ってから、このページを再読み込みしてください。</p>");
  }
  if (s.payment_status !== "paid" || LINKS[s.payment_link] !== slug) return page(403, "購入を確認できませんでした", "<p>支払いが完了していないか、別の商品の購入です。数分たっても開けない場合は、お問い合わせ先までご連絡ください。</p>");
  const token = await makeToken(env.STRIPE_KEY, slug, sid, DAYS);
  return new Response(null, { status: 302, headers: {
    Location: tool,
    "Set-Cookie": `gs_${slug}=${encodeURIComponent(token)}; Path=/${slug}/; Max-Age=${DAYS * 86400}; Secure; HttpOnly; SameSite=Lax`,
    "Cache-Control": "no-store" } });
}
