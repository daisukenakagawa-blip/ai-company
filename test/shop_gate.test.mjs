// 店の鍵（Fail Closed）の試験。Stripe は偽物の応答で置き換える。実行：node test/shop_gate.test.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import url from "node:url";
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
fs.mkdirSync(path.join(tmp, "lib")); fs.mkdirSync(path.join(tmp, "functions/api"), { recursive: true });
fs.copyFileSync(path.join(root, "lib/shop_links.json"), path.join(tmp, "lib/shop_links.json"));
const fix = s => s.replace(/from "(.*shop_links\.json)";/, 'from "$1" with { type: "json" };');
fs.writeFileSync(path.join(tmp, "lib/shop_license.js"), fix(fs.readFileSync(path.join(root, "lib/shop_license.js"), "utf8")));
fs.copyFileSync(path.join(root, "functions/_middleware.js"), path.join(tmp, "functions/_middleware.js"));
fs.copyFileSync(path.join(root, "functions/api/unlock.js"), path.join(tmp, "functions/api/unlock.js"));
const L = await import(path.join(tmp, "lib/shop_license.js"));
const MW = await import(path.join(tmp, "functions/_middleware.js"));
const UN = await import(path.join(tmp, "functions/api/unlock.js"));
const LINKS = JSON.parse(fs.readFileSync(path.join(root, "lib/shop_links.json")));
const [plink, info] = Object.entries(LINKS).find(([, v]) => v.slug === "nafuda");
const [plink2] = Object.entries(LINKS).find(([, v]) => v.slug !== "nafuda");
const now = () => Math.floor(Date.now() / 1000);
const SID = "cs_live_aaaaaaaaaaaaaaaa";
let sessions = {};
const good = (o = {}) => ({ payment_link: plink, status: "complete", payment_status: "paid", mode: "payment", livemode: true, currency: "jpy", amount_total: info.amount, created: now() - 60,
  payment_intent: { status: "succeeded", latest_charge: { refunded: false, amount_refunded: 0, disputed: false } }, ...o });
const stripeFetch = async (u) => { const id = u.split("/sessions/")[1].split("?")[0]; const s = sessions[id];
  if (s === "error") return new Response("x", { status: 500 }); if (!s) return new Response("{}", { status: 404 }); return new Response(JSON.stringify(s), { status: 200 }); };
const ENV = { STRIPE_KEY: "rk_test_dummy", STRIPE_FETCH: stripeFetch };
const nextOK = async () => new Response("TOOL", { status: 200 });
const mw = (p, env = ENV, cookie = "") => MW.onRequest({ request: new Request("https://x.dev" + p, { headers: cookie ? { Cookie: cookie } : {} }), env, next: nextOK });
const un = (q, env = ENV) => UN.onRequestGet({ request: new Request("https://x.dev/api/unlock?" + q), env });
const cookieOf = r => (r.headers.get("Set-Cookie") || "").split(";")[0];
let pass = 0, failN = 0;
const t = (name, cond) => { if (cond) pass++; else failN++; console.log((cond ? "PASS " : "FAIL ") + name); };

// キーが無い
t("キー無し：製品版は商品ページへ", (await mw("/nafuda/tool", {})).status === 302);
t("キー無し：unlock は開かない", (await un(`p=nafuda&session_id=${SID}`, {})).status === 503);
// 印なし・不明な商品
t("印なし：商品ページへ", (await mw("/nafuda/tool.html")).headers.get("Location").endsWith("/nafuda/?locked=1"));
t("存在しない商品の tool：開かない", (await mw("/nosuch/tool")).status === 302);
// 正しい購入
sessions[SID] = good();
let r = await un(`p=nafuda&session_id=${SID}`);
t("正しい購入：製品版へ進み印が出る", r.status === 302 && r.headers.get("Location") === "/nafuda/tool.html" && cookieOf(r).startsWith("gs_nafuda="));
const ck = cookieOf(r);
t("印あり：製品版が開く", (await (await mw("/nafuda/tool", ENV, ck)).text()) === "TOOL");
// 改ざん
const raw = decodeURIComponent(ck.split("=")[1]); const parts = raw.split(".");
const forged = `gs_nafuda=${encodeURIComponent([parts[0], String(+parts[1] + 999999), parts[2], parts[3]].join("."))}`;
t("印の期限を書き換え：開かない", (await mw("/nafuda/tool", ENV, forged)).status === 302);
t("署名を書き換え：開かない", (await mw("/nafuda/tool", ENV, `gs_nafuda=${encodeURIComponent(parts.slice(0, 3).join(".") + ".AAAA")}`)).status === 302);
t("別の鍵で署名された印：開かない", (await mw("/nafuda/tool", { ...ENV, STRIPE_KEY: "other" }, ck)).status === 302);
// 別の商品
const other = Object.values(LINKS).find(v => v.slug !== "nafuda").slug;
t("nafuda の印で別の商品：開かない", (await mw(`/${other}/tool`, ENV, ck.replace("gs_nafuda", "gs_" + other))).status === 302);
t("nafuda の決済で別の商品を unlock：開かない", (await un(`p=${other}&session_id=${SID}`)).status === 403);
// 決済の中身
const cases = { "未払い": { payment_status: "unpaid" }, "未完了": { status: "open" }, "金額違い": { amount_total: 1 }, "通貨違い": { currency: "usd" },
  "テスト決済": { livemode: false }, "別の Payment Link": { payment_link: plink2 }, "Payment Link 無し": { payment_link: null },
  "返金済み": { payment_intent: { status: "succeeded", latest_charge: { refunded: true, amount_refunded: info.amount } } },
  "一部返金": { payment_intent: { status: "succeeded", latest_charge: { refunded: false, amount_refunded: 100 } } },
  "異議申し立て": { payment_intent: { status: "succeeded", latest_charge: { disputed: true, amount_refunded: 0 } } },
  "支払い情報なし": { payment_intent: null } };
for (const [k, o] of Object.entries(cases)) { sessions[SID] = good(o); t(`${k}：unlock で開かない`, (await un(`p=nafuda&session_id=${SID}`)).status >= 400); }
sessions[SID] = good({ created: now() - (L.UNLOCK_HOURS * 3600 + 60) });
t("期限切れの決済ID（使い回し）：開かない", (await un(`p=nafuda&session_id=${SID}`)).status === 403);
sessions[SID] = "error"; t("Stripe 障害：開かない", (await un(`p=nafuda&session_id=${SID}`)).status === 502);
t("存在しない決済：開かない", (await un(`p=nafuda&session_id=cs_live_bbbbbbbbbbbbbbbb`)).status === 403);
t("決済ID の形が不正：開かない", (await un(`p=nafuda&session_id=bad`)).status === 400);
// 確かめ直し（返金後）
const stale = await L.makeToken("rk_test_dummy", "nafuda", SID, Date.now() - (L.RECHECK_DAYS + 1) * 86400000);
const sc = `gs_nafuda=${encodeURIComponent(stale)}`;
sessions[SID] = good({ created: now() - 30 * 86400 });
r = await mw("/nafuda/tool", ENV, sc);
t("確かめ直し・正常（72時間を過ぎていても）：開き、印を更新", (await r.text()) === "TOOL" && (r.headers.get("Set-Cookie") || "").startsWith("gs_nafuda="));
sessions[SID] = good({ payment_intent: { status: "succeeded", latest_charge: { refunded: true, amount_refunded: info.amount } } });
t("確かめ直し・返金後：開かない", (await mw("/nafuda/tool", ENV, sc)).status === 403);
sessions[SID] = "error"; t("確かめ直し・Stripe 障害：開かない", (await mw("/nafuda/tool", ENV, sc)).status === 502);
// 正規購入者の復旧（72時間以内なら、同じリンクで別の端末でも開ける）
sessions[SID] = good();
t("正規購入者：72時間以内は同じリンクで別端末も開ける", (await un(`p=nafuda&session_id=${SID}`)).status === 302);
// 製品版以外は鍵の対象外
t("商品ページ・お試しは鍵なしで見られる", (await (await mw("/nafuda/demo.html")).text()) === "TOOL" && (await (await mw("/nafuda/")).text()) === "TOOL");
console.log(`\n${pass} PASS / ${failN} FAIL`); fs.rmSync(tmp, { recursive: true }); process.exit(failN ? 1 : 0);
