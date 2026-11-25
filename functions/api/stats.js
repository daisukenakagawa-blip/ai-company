// 計測の集計（日ごとの閲覧・入口・流入元・購入ボタン・お試しの利用）。数だけで個人の情報は含まない
import { readStats } from "../../lib/shop_metrics.js";
export async function onRequestGet({ request, env }) {
  const d = Math.min(60, Math.max(1, parseInt(new URL(request.url).searchParams.get("days") || "14", 10) || 14));
  return new Response(JSON.stringify(await readStats(env, d), null, 1), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
