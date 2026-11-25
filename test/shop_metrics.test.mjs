// 店の自社計測の試験。実行：node test/shop_metrics.test.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import url from "node:url";
// shop_gate.test.mjs と同じく、JSON の import を Node で読めるよう一時フォルダに写して試す
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-"));
fs.mkdirSync(path.join(tmp, "lib")); fs.mkdirSync(path.join(tmp, "functions/api"), { recursive: true });
for (const f of ["lib/shop_links.json", "lib/shop_metrics.js", "functions/_middleware.js", "functions/api/ev.js", "functions/api/stats.js"]) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
fs.writeFileSync(path.join(tmp, "lib/shop_license.js"), fs.readFileSync(path.join(root, "lib/shop_license.js"), "utf8").replace(/from "(.*shop_links\.json)";/, 'from "$1" with { type: "json" };'));
const M = await import(path.join(tmp, "lib/shop_metrics.js"));
const MW = await import(path.join(tmp, "functions/_middleware.js"));
const EV = await import(path.join(tmp, "functions/api/ev.js"));
const ST = await import(path.join(tmp, "functions/api/stats.js"));
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const kv = () => { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); } }; };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const req = (p, h = {}, init = {}) => { const r = new Request("https://genhayl-shop.pages.dev" + p, { headers: { "User-Agent": UA, ...h }, ...init }); return r; };
const today = M.jstDate();
const day = env => JSON.parse(env.UNLOCKS.m.get("m:" + today));

let env = { UNLOCKS: kv() };
t("商品ページの閲覧を数える", await M.recordView(req("/kibou-kyuu/", { Referer: "https://www.google.com/" }), env));
await M.recordView(req("/kibou-kyuu/demo.html", { Referer: "https://genhayl-shop.pages.dev/kibou-kyuu/" }), env);
await M.recordView(req("/?ref=x_post"), env);
let d = day(env);
t("閲覧 3", Object.values(d.pv).reduce((a, b) => a + b, 0) === 3);
t("流入元：google と ref", d.src["www.google.com"] === 1 && d.src["ref:x_post"] === 1);
t("店の中の移動は入口に数えない", !d.entry["/kibou-kyuu/demo.html"]);
t("ボットは数えない", !(await M.recordView(req("/kibou-kyuu/", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }), env)));
t("Playwright は数えない", !(await M.recordView(req("/", { "User-Agent": UA + " HeadlessChrome Playwright" }), env)));
t("画像・API は数えない", !(await M.recordView(req("/kibou-kyuu/screenshot-tool.png"), env)) && !(await M.recordView(req("/api/stats"), env)));
await M.recordView(req("/kibou-kyuu/", { Cookie: "gs_owner=1" }), env);
d = day(env);
t("オーナーは別に数え、閲覧に入れない", d.own === 1 && d.pv["/kibou-kyuu/"] === 1);
t("IP や UA は保存しない", !/Mozilla|Chrome|\d+\.\d+\.\d+\.\d+/.test(env.UNLOCKS.m.get("m:" + today)));

// 出来事
const evr = (b, h = {}) => req("/api/ev", h, { method: "POST", body: JSON.stringify(b) });
t("購入ボタンのクリック", await M.recordEvent(evr({ t: "buy", p: "/kibou-kyuu/" }), env));
t("お試しの利用", await M.recordEvent(evr({ t: "demo_use", p: "/kibou-kyuu/demo.html" }), env));
t("知らない出来事は数えない", !(await M.recordEvent(evr({ t: "hack", p: "/kibou-kyuu/" }), env)));
t("おかしなパスは数えない", !(await M.recordEvent(evr({ t: "buy", p: "https://evil/" }), env)));
t("壊れた本文でも落ちない", !(await M.recordEvent(req("/api/ev", {}, { method: "POST", body: "{{{" }), env)));
const r204 = await EV.onRequestPost({ request: evr({ t: "buy", p: "/nafuda/" }), env });
t("/api/ev は 204", r204.status === 204);

// 上限
const env2 = { UNLOCKS: kv() };
for (let i = 0; i < M.DAY_CAP + 5; i++) await M.recordView(req("/"), env2);
t("1日の上限で止める", JSON.parse(env2.UNLOCKS.m.get("m:" + today)).n === M.DAY_CAP);
t("KV が無くても落ちない", (await M.recordView(req("/"), {})) === false);
const broken = { UNLOCKS: { get: async () => { throw new Error("x"); }, put: async () => { throw new Error("x"); } } };
t("KV の失敗でも落ちない", (await M.recordView(req("/"), broken)) === false);

// 集計
const s = await M.readStats(env, 3);
t("集計：閲覧3・入口2・購入ボタン2・お試し1・オーナー1", s.total.pv === 3 && s.total.entries === 2 && s.total.buy === 2 && s.total.demo_use === 1 && s.total.owner === 1);
t("集計：3日分", s.days.length === 3 && s.days[2].date === today);
const sr = await ST.onRequestGet({ request: req("/api/stats?days=7"), env });
t("/api/stats は JSON・noindex", sr.headers.get("X-Robots-Tag") === "noindex" && (await sr.json()).days.length === 7);

// middleware
const next = async () => new Response("<html><body>x</body></html>", { headers: { "Content-Type": "text/html" } });
const env3 = { UNLOCKS: kv() };
const r1 = await MW.onRequest({ request: req("/kibou-kyuu/"), env: env3, next });
t("middleware：商品ページは表示され、数える", r1.status === 200 && day(env3).pv["/kibou-kyuu/"] === 1);
const r2 = await MW.onRequest({ request: req("/?owner=1"), env: env3, next });
t("owner=1 で印を付けて元のページへ", r2.status === 302 && /gs_owner=1/.test(r2.headers.get("Set-Cookie")) && r2.headers.get("Location") === "/");
const r3 = await MW.onRequest({ request: req("/nafuda/tool.html"), env: env3, next });
t("製品版の鍵は今までどおり（キー無し→商品ページへ）", r3.status === 302);
const r4 = await MW.onRequest({ request: req("/"), env: broken, next });
t("計測が壊れてもページは出る", r4.status === 200);
t("差し込むスクリプトは購入ボタンとお試しだけ", M.BEACON.includes("stripe") && M.BEACON.includes("demo_use") && M.BEACON.length < 800);
t("差し込み先：商品ページとお試し版", M.wantsBeacon(new URL("https://x/kibou-kyuu/")) && M.wantsBeacon(new URL("https://x/kibou-kyuu/demo.html")) && !M.wantsBeacon(new URL("https://x/")) && !M.wantsBeacon(new URL("https://x/kibou-kyuu/tool.html")) && !M.wantsBeacon(new URL("https://x/guide/")));
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
