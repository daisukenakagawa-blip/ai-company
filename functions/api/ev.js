// 計測：購入ボタンのクリックとお試し版の利用（lib/shop_metrics.js）。中身は数だけで、個人を特定する情報は保存しない
import { recordEvent } from "../../lib/shop_metrics.js";
export async function onRequestPost({ request, env, waitUntil }) {
  const p = recordEvent(request, env); if (waitUntil) waitUntil(p); else await p;
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
