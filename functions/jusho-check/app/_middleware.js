// 製品版（/jusho-check/app/ 以下）は、購入を確かめた印（Cookie）がある人だけに見せる
import { checkToken, getCookie } from "../../../lib/license.js";
const SLUG = "jusho-check";
export async function onRequest({ request, env, next }) {
  const ok = await checkToken(env.STRIPE_KEY, SLUG, getCookie(request, `jc_${SLUG}`));
  if (ok) {
    const res = await next();
    const h = new Headers(res.headers);
    h.set("Cache-Control", "private, no-store");
    h.set("X-Robots-Tag", "noindex");
    return new Response(res.body, { status: res.status, headers: h });
  }
  return Response.redirect(new URL(`/${SLUG}/?locked=1`, request.url).toString(), 302);
}
