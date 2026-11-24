// 製品版（/<商品>/tool.html と /<商品>/tool）は、購入を確かめた印（Cookie）がある人だけに見せる
import { checkToken, getCookie } from "../lib/shop_license.js";
const TOOL = /^\/([a-z0-9-]+)\/tool(?:\.html)?$/;
export async function onRequest({ request, env, next }) {
  const m = new URL(request.url).pathname.match(TOOL);
  if (!m || !env.STRIPE_KEY) return next();
  const slug = m[1];
  if (await checkToken(env.STRIPE_KEY, slug, getCookie(request, `gs_${slug}`))) {
    const res = await next();
    const h = new Headers(res.headers); h.set("Cache-Control", "private, no-store"); h.set("X-Robots-Tag", "noindex");
    return new Response(res.body, { status: res.status, headers: h });
  }
  return Response.redirect(new URL(`/${slug}/?locked=1`, request.url).toString(), 302);
}
