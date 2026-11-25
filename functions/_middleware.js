// 製品版（/<商品>/tool.html と /<商品>/tool）は、購入を確かめた印（Cookie）がある人だけに見せる
// Fail Closed：キーが無い・印が無い・署名が合わない・確かめ直しに失敗した場合は開かない
import { readToken, verifyPurchase, makeToken, getCookie, cookieHeader, isProduct, page } from "../lib/shop_license.js";
import { recordView, BEACON, wantsBeacon } from "../lib/shop_metrics.js";
const TOOL = /^\/([a-z0-9-]+)\/tool(?:\.html)?$/;
const PRODUCT = /^\/([a-z0-9-]+)\/$/;
const NOTE = `<div style="background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;padding:12px 16px;margin:12px;border-radius:8px;font-size:14px;line-height:1.7">製品版は、購入後に表示されるリンクから開けます。購入済みで開けない場合は、ページ下の「特定商取引法に基づく表記」にあるお問い合わせ先までご連絡ください。</div>`;
const notice = res => (res.headers.get("Content-Type") || "").includes("text/html")
  ? new HTMLRewriter().on("body", { element(e) { e.prepend(NOTE, { html: true }); } }).transform(res) : res;
// 商品ページ・お試し版に計測の小さなスクリプトを差し込む（HTMLRewriter が無い試験環境ではそのまま返す）
const beacon = res => (typeof HTMLRewriter !== "undefined" && res.status === 200 && (res.headers.get("Content-Type") || "").includes("text/html"))
  ? new HTMLRewriter().on("body", { element(e) { e.append(BEACON, { html: true }); } }).transform(res) : res;
// オーナーの閲覧を計測から外す印：/?owner=1 を一度開く（owner=0 で外す）
const ownerSwitch = (u) => {
  const v = u.searchParams.get("owner"); if (v !== "1" && v !== "0") return null;
  u.searchParams.delete("owner");
  return new Response(null, { status: 302, headers: { Location: u.pathname + (u.search || ""), "Cache-Control": "no-store",
    "Set-Cookie": v === "1" ? "gs_owner=1; Path=/; Max-Age=34560000; Secure; SameSite=Lax" : "gs_owner=; Path=/; Max-Age=0; Secure; SameSite=Lax" } });
};
const locked = (slug, request) => Response.redirect(new URL(`/${slug}/?locked=1`, request.url).toString(), 302);

export async function onRequest({ request, env, next, waitUntil }) {
  const u = new URL(request.url);
  const sw = ownerSwitch(new URL(request.url)); if (sw) return sw;
  try { const rec = recordView(request, env || {}); if (waitUntil) waitUntil(rec); else await rec; } catch (e) { }
  const pm = u.pathname.match(PRODUCT);
  if (pm && u.searchParams.get("locked") === "1" && isProduct(pm[1])) return beacon(notice(await next()));
  const m = u.pathname.match(TOOL);
  if (!m) { const res = await next(); return wantsBeacon(u) ? beacon(res) : res; }
  const slug = m[1];
  if (!isProduct(slug) || !env.STRIPE_KEY) return locked(slug, request);
  const t = await readToken(env.STRIPE_KEY, slug, getCookie(request, `gs_${slug}`));
  if (!t.ok) return locked(slug, request);
  let setCookie = null;
  if (!t.fresh) { // 確かめ直しの時期：返金・取り消しが無いかを Stripe に聞く
    const v = await verifyPurchase(env, slug, t.sid);
    if (!v.ok) return page(v.code, v.title, `<p>${v.msg}</p><p><a href="/${slug}/">商品ページへ</a></p>`);
    setCookie = cookieHeader(slug, await makeToken(env.STRIPE_KEY, slug, t.sid));
  }
  const res = await next();
  const h = new Headers(res.headers);
  h.set("Cache-Control", "private, no-store"); h.set("X-Robots-Tag", "noindex");
  if (setCookie) h.append("Set-Cookie", setCookie);
  return new Response(res.body, { status: res.status, headers: h });
}
