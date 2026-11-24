// 決済完了後の入口：/api/unlock?p=<商品>&session_id=<Stripe の Checkout Session ID>
// Stripe に「支払い済みか」を問い合わせ、確かめられたら製品版を開く印（Cookie）を渡す。
import { PRODUCTS, makeToken, htmlPage } from "../../lib/license.js";
const DAYS = 400;
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") || "";
  const sid = url.searchParams.get("session_id") || "";
  const prod = PRODUCTS[slug];
  if (!prod || !/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid)) {
    return htmlPage(400, "リンクが正しくありません", "<p>購入後に表示されたリンク（またはメールのリンク）から、もう一度開いてください。</p>");
  }
  if (!env.STRIPE_KEY) {
    return htmlPage(503, "ただいま準備中です", "<p>購入の確認の仕組みを準備しています。お手数ですが、しばらくしてからもう一度このページを開いてください。解決しない場合は、特定商取引法に基づく表記のお問い合わせ先までご連絡ください。</p>");
  }
  let s;
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}`, { headers: { Authorization: `Bearer ${env.STRIPE_KEY}` } });
    if (r.status === 404) return htmlPage(403, "購入を確認できませんでした", "<p>この購入番号は見つかりませんでした。購入後に表示されたリンクから開いてください。</p>");
    if (!r.ok) throw new Error("stripe " + r.status);
    s = await r.json();
  } catch (e) {
    return htmlPage(502, "購入の確認に失敗しました", "<p>決済サービスへの問い合わせがうまくいきませんでした。少し待ってから、このページを再読み込みしてください。</p>");
  }
  if (s.payment_status !== "paid" || (s.metadata || {}).slug !== slug) {
    return htmlPage(403, "購入を確認できませんでした", "<p>このリンクの支払いが完了していないか、別の商品の購入です。決済が完了してから数分たっても開けない場合は、お問い合わせ先までご連絡ください。</p>");
  }
  const token = await makeToken(env.STRIPE_KEY, slug, sid, DAYS);
  const back = `${url.origin}/api/unlock?p=${slug}&session_id=${sid}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${prod.app}#key=${encodeURIComponent(back)}`,
      "Set-Cookie": `jc_${slug}=${encodeURIComponent(token)}; Path=/${slug}/; Max-Age=${DAYS * 86400}; Secure; HttpOnly; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
