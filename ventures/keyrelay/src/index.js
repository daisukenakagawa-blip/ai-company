// KeyRelay — Lemon Squeezy License API と同じ形で動くライセンスキーのサーバー（Cloudflare Workers + D1）
//
// 販売者のアプリは、接続先を
//   https://api.lemonsqueezy.com/v1/licenses/...  →  https://<host>/<tenant>/v1/licenses/...
// に変えるだけで、activate / validate / deactivate をそのまま使える。
// 既存のキーと有効化（instance）は、販売者の Lemon Squeezy API キーで取り込む（終了日 2027-03-31 より前に）。
// 新しい販売は、販売者自身の Stripe（Managed Payments など）の Webhook でキーを発行する。お金には触れない。

import { LANDING, TERMS } from "./landing.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
});
const now = () => new Date().toISOString();
const enc = new TextEncoder();
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function readParams(req) {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) { try { return await req.json(); } catch { return {}; } }
  const f = await req.formData().catch(() => null);
  const o = {}; if (f) for (const [k, v] of f.entries()) o[k] = String(v);
  return o;
}

// ---------- License API（Lemon Squeezy と同じ形） ----------
const META_KEYS = ["store_id", "order_id", "order_item_id", "product_id", "product_name", "variant_id", "variant_name", "customer_id", "customer_name", "customer_email"];
async function usage(db, keyId) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM instances WHERE key_id = ?").bind(keyId).first();
  return r ? r.n : 0;
}
function effectiveStatus(row, n) {
  if (row.status === "disabled") return "disabled";
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return "expired";
  return n > 0 ? "active" : "inactive";
}
async function keyView(db, row) {
  const n = await usage(db, row.id);
  return {
    id: row.id, status: effectiveStatus(row, n), key: row.key,
    activation_limit: row.activation_limit, activation_usage: n,
    created_at: row.created_at, expires_at: row.expires_at || null,
  };
}
function metaView(row) {
  let m = {}; try { m = JSON.parse(row.meta || "{}"); } catch {}
  const o = {}; for (const k of META_KEYS) o[k] = m[k] ?? null;
  return o;
}
const instView = (i) => i ? { id: i.id, name: i.name, created_at: i.created_at } : null;

async function findKey(db, tenant, key) {
  if (!key) return null;
  return db.prepare("SELECT * FROM license_keys WHERE tenant_id = ? AND key = ?").bind(tenant, String(key).trim()).first();
}
async function countCall(db, tenant) {
  const day = now().slice(0, 10);
  await db.prepare("INSERT INTO usage_daily (tenant_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(tenant_id, day) DO UPDATE SET calls = calls + 1").bind(tenant, day).run();
}

async function activate(db, tenant, p) {
  const flag = "activated";
  if (!p.license_key || !p.instance_name) return json({ [flag]: false, error: "The license_key and instance_name fields are required." }, 422);
  const row = await findKey(db, tenant, p.license_key);
  if (!row) return json({ [flag]: false, error: "license_key not found." }, 404);
  const n = await usage(db, row.id);
  const st = effectiveStatus(row, n);
  if (st === "disabled" || st === "expired") return json({ [flag]: false, error: `This license key is ${st}.`, license_key: await keyView(db, row), meta: metaView(row) }, 400);
  if (row.activation_limit != null && n >= row.activation_limit) {
    return json({ [flag]: false, error: "This license key has reached the activation limit.", license_key: await keyView(db, row), meta: metaView(row) }, 400);
  }
  const inst = { id: crypto.randomUUID(), name: String(p.instance_name).slice(0, 200), created_at: now() };
  await db.prepare("INSERT INTO instances (id, key_id, name, created_at) VALUES (?, ?, ?, ?)").bind(inst.id, row.id, inst.name, inst.created_at).run();
  return json({ [flag]: true, error: null, license_key: await keyView(db, row), instance: instView(inst), meta: metaView(row) });
}
async function validate(db, tenant, p) {
  if (!p.license_key) return json({ valid: false, error: "The license_key field is required." }, 422);
  const row = await findKey(db, tenant, p.license_key);
  if (!row) return json({ valid: false, error: "license_key not found." }, 404);
  let inst = null;
  if (p.instance_id) {
    inst = await db.prepare("SELECT * FROM instances WHERE id = ? AND key_id = ?").bind(String(p.instance_id), row.id).first();
    if (!inst) return json({ valid: false, error: "license_key instance not found.", license_key: await keyView(db, row), instance: null, meta: metaView(row) }, 404);
  }
  const view = await keyView(db, row);
  const ok = view.status !== "disabled" && view.status !== "expired";
  return json({ valid: ok, error: ok ? null : `This license key is ${view.status}.`, license_key: view, instance: instView(inst), meta: metaView(row) });
}
async function deactivate(db, tenant, p) {
  const flag = "deactivated";
  if (!p.license_key || !p.instance_id) return json({ [flag]: false, error: "The license_key and instance_id fields are required." }, 422);
  const row = await findKey(db, tenant, p.license_key);
  if (!row) return json({ [flag]: false, error: "license_key not found." }, 404);
  const r = await db.prepare("DELETE FROM instances WHERE id = ? AND key_id = ?").bind(String(p.instance_id), row.id).run();
  if (!r.meta || !r.meta.changes) return json({ [flag]: false, error: "license_key instance not found.", license_key: await keyView(db, row), meta: metaView(row) }, 404);
  return json({ [flag]: true, error: null, license_key: await keyView(db, row), meta: metaView(row) });
}

// ---------- 管理 ----------
async function tenantOf(db, id) { return db.prepare("SELECT * FROM tenants WHERE id = ?").bind(id).first(); }
async function authed(req, t) {
  const h = req.headers.get("Authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  return tok && safeEq(await sha256hex(tok), t.admin_token_hash);
}
function newKey() { return crypto.randomUUID().toUpperCase(); }

async function createKey(db, tenant, { activation_limit, expires_at, meta, source = "manual", source_ref = null, key = null }) {
  const k = key || newKey();
  await db.prepare("INSERT INTO license_keys (tenant_id, key, status, activation_limit, expires_at, created_at, source, source_ref, meta) VALUES (?, ?, 'inactive', ?, ?, ?, ?, ?, ?)")
    .bind(tenant, k, activation_limit ?? null, expires_at ?? null, now(), source, source_ref, JSON.stringify(meta || {})).run();
  return findKey(db, tenant, k);
}

// Lemon Squeezy から既存のキーと有効化を取り込む（販売者の LS API キーを使う。キーは保存しない）
async function importLemonSqueezy(db, tenant, apiKey, fetchImpl = fetch) {
  const H = { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` };
  const idMap = new Map(); let keys = 0, insts = 0, skipped = 0;
  let url = "https://api.lemonsqueezy.com/v1/license-keys?page[size]=100";
  while (url) {
    const r = await fetchImpl(url, { headers: H });
    if (!r.ok) throw new Error(`license-keys ${r.status}`);
    const j = await r.json();
    for (const d of j.data || []) {
      const a = d.attributes || {};
      const exists = await findKey(db, tenant, a.key);
      if (exists) { idMap.set(String(d.id), exists.id); skipped++; continue; }
      const row = await createKey(db, tenant, {
        key: a.key, activation_limit: a.activation_limit ?? null, expires_at: a.expires_at ?? null,
        source: "lemonsqueezy", source_ref: String(d.id),
        meta: { store_id: a.store_id, order_id: a.order_id, order_item_id: a.order_item_id, product_id: a.product_id, customer_id: a.customer_id, customer_name: a.user_name, customer_email: a.user_email },
      });
      if (a.disabled) await db.prepare("UPDATE license_keys SET status = 'disabled' WHERE id = ?").bind(row.id).run();
      idMap.set(String(d.id), row.id); keys++;
    }
    url = j.links && j.links.next ? j.links.next : null;
  }
  url = "https://api.lemonsqueezy.com/v1/license-key-instances?page[size]=100";
  while (url) {
    const r = await fetchImpl(url, { headers: H });
    if (!r.ok) throw new Error(`license-key-instances ${r.status}`);
    const j = await r.json();
    for (const d of j.data || []) {
      const a = d.attributes || {};
      const kid = idMap.get(String(a.license_key_id));
      if (!kid || !a.identifier) continue;
      const res = await db.prepare("INSERT OR IGNORE INTO instances (id, key_id, name, created_at) VALUES (?, ?, ?, ?)")
        .bind(a.identifier, kid, a.name || "", a.created_at || now()).run();
      if (res.meta && res.meta.changes) insts++;
    }
    url = j.links && j.links.next ? j.links.next : null;
  }
  return { imported_keys: keys, skipped_existing_keys: skipped, imported_instances: insts };
}

// 販売者自身の Stripe の Webhook：支払いが済んだらキーを発行する
async function stripeWebhook(db, t, req) {
  const body = await req.text();
  const sig = req.headers.get("Stripe-Signature") || "";
  const parts = Object.fromEntries(sig.split(",").map((s) => s.split("=")).filter((x) => x.length === 2));
  if (!t.stripe_webhook_secret || !parts.t || !parts.v1) return json({ error: "signature missing" }, 400);
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return json({ error: "timestamp out of tolerance" }, 400);
  const want = await hmacHex(t.stripe_webhook_secret, `${parts.t}.${body}`);
  if (!safeEq(want, parts.v1)) return json({ error: "bad signature" }, 400);
  const ev = JSON.parse(body);
  if (ev.type !== "checkout.session.completed") return json({ received: true, ignored: ev.type });
  const s = ev.data.object;
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return json({ received: true, ignored: "unpaid" });
  const dup = await db.prepare("SELECT id FROM license_keys WHERE tenant_id = ? AND source_ref = ?").bind(t.id, s.id).first();
  if (dup) return json({ received: true, duplicate: true });
  const md = s.metadata || {};
  const limit = md.activation_limit != null ? Number(md.activation_limit) : t.default_activation_limit;
  const row = await createKey(db, t.id, {
    activation_limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    expires_at: md.license_days ? new Date(Date.now() + Number(md.license_days) * 864e5).toISOString() : null,
    source: "stripe", source_ref: s.id,
    meta: { order_id: s.id, product_name: md.product_name || null, customer_name: s.customer_details?.name || null, customer_email: s.customer_details?.email || null },
  });
  return json({ received: true, license_key_id: row.id });
}

function claimPage(t, row) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const body = row
    ? `<p>ご購入ありがとうございます。ライセンスキーは次のとおりです。</p><p style="font:20px ui-monospace,monospace;background:#f3f4f6;padding:12px;border-radius:8px;user-select:all">${esc(row.key)}</p><p>このキーは大切に保管してください。</p>`
    : `<meta http-equiv="refresh" content="3"><p>お支払いを確認しています。数秒後に自動で再読み込みします。</p>`;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.name)}</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px"><h1 style="font-size:20px">${esc(t.name)}</h1>${body}</body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const db = env.DB;
    if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization", "Access-Control-Allow-Methods": "GET, POST" } });
    const seg = url.pathname.split("/").filter(Boolean);
    try {
      // 登録（ベータ：無料）
      if (!seg[0] && req.method === "GET") return new Response(LANDING, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (seg[0] === "terms" && req.method === "GET") return new Response(TERMS, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      // 需要の検証用：個人情報を含まない集計だけを公開する
      if (seg[0] === "stats" && req.method === "GET" && seg.length === 1) {
        const q = async (sql) => (await db.prepare(sql).first()).n;
        const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        return json({
          workspaces: await q("SELECT COUNT(*) AS n FROM tenants"),
          workspaces_with_keys: await q("SELECT COUNT(DISTINCT tenant_id) AS n FROM license_keys"),
          keys_total: await q("SELECT COUNT(*) AS n FROM license_keys"),
          keys_imported_from_lemonsqueezy: await q("SELECT COUNT(*) AS n FROM license_keys WHERE source = 'lemonsqueezy'"),
          keys_issued_via_stripe: await q("SELECT COUNT(*) AS n FROM license_keys WHERE source = 'stripe'"),
          activations: await q("SELECT COUNT(*) AS n FROM instances"),
          license_api_calls_last_7_days: (await db.prepare("SELECT COALESCE(SUM(calls),0) AS n FROM usage_daily WHERE day >= ?").bind(since).first()).n,
        });
      }
      if (seg[0] === "signup" && req.method === "POST") {
        const ip = req.headers.get("CF-Connecting-IP") || "local";
        const ih = (await sha256hex("kr-signup:" + ip)).slice(0, 32), day = now().slice(0, 10);
        const c = await db.prepare("SELECT n FROM signups WHERE ip_hash = ? AND day = ?").bind(ih, day).first();
        if (c && c.n >= 5) return json({ error: "too many workspaces created today from this network" }, 429);
        await db.prepare("INSERT INTO signups (ip_hash, day, n) VALUES (?, ?, 1) ON CONFLICT(ip_hash, day) DO UPDATE SET n = n + 1").bind(ih, day).run();
        const p = await readParams(req);
        const id = String(p.id || "").toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(id) || ["stats", "terms", "signup", "admin", "api", "www"].includes(id)) return json({ error: "id must be 3-32 chars of a-z, 0-9, - (reserved words not allowed)" }, 422);
        if (await tenantOf(db, id)) return json({ error: "id already taken" }, 409);
        const token = "kr_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        await db.prepare("INSERT INTO tenants (id, name, admin_token_hash, default_activation_limit, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(id, String(p.name || id).slice(0, 80), await sha256hex(token), Number(p.default_activation_limit) || 1, now()).run();
        return json({ tenant: id, admin_token: token, license_api_base: `${url.origin}/${id}/v1/licenses` }, 201);
      }
      const t = await tenantOf(db, seg[0]);
      if (!t) return json({ error: "tenant not found" }, 404);
      const rest = seg.slice(1).join("/");
      if (req.method === "POST" && rest.startsWith("v1/licenses/")) {
        await countCall(db, t.id);
        const p = await readParams(req);
        if (rest === "v1/licenses/activate") return activate(db, t.id, p);
        if (rest === "v1/licenses/validate") return validate(db, t.id, p);
        if (rest === "v1/licenses/deactivate") return deactivate(db, t.id, p);
      }
      if (rest === "webhooks/stripe" && req.method === "POST") return stripeWebhook(db, t, req);
      if (rest === "claim" && req.method === "GET") {
        const sid = url.searchParams.get("session_id") || "";
        const row = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid) ? await db.prepare("SELECT * FROM license_keys WHERE tenant_id = ? AND source_ref = ?").bind(t.id, sid).first() : null;
        return claimPage(t, row);
      }
      if (rest.startsWith("admin/")) {
        if (!(await authed(req, t))) return json({ error: "unauthorized" }, 401);
        const p = req.method === "POST" ? await readParams(req) : {};
        if (rest === "admin/settings" && req.method === "POST") {
          await db.prepare("UPDATE tenants SET stripe_webhook_secret = COALESCE(?, stripe_webhook_secret), default_activation_limit = COALESCE(?, default_activation_limit), name = COALESCE(?, name) WHERE id = ?")
            .bind(p.stripe_webhook_secret ?? null, p.default_activation_limit != null ? Number(p.default_activation_limit) : null, p.name ?? null, t.id).run();
          return json({ ok: true });
        }
        if (rest === "admin/import/lemonsqueezy" && req.method === "POST") {
          if (!p.api_key) return json({ error: "api_key required" }, 422);
          return json(await importLemonSqueezy(db, t.id, String(p.api_key)));
        }
        if (rest === "admin/keys" && req.method === "POST") {
          const row = await createKey(db, t.id, { activation_limit: p.activation_limit != null ? Number(p.activation_limit) : t.default_activation_limit, expires_at: p.expires_at || null, meta: p.meta || {} });
          return json(await keyView(db, row), 201);
        }
        const m = rest.match(/^admin\/keys\/([^/]+)\/(disable|enable)$/);
        if (m && req.method === "POST") {
          const r = await db.prepare("UPDATE license_keys SET status = ? WHERE tenant_id = ? AND key = ?").bind(m[2] === "disable" ? "disabled" : "inactive", t.id, decodeURIComponent(m[1])).run();
          return json({ ok: !!(r.meta && r.meta.changes) });
        }
        if (rest === "admin/delete" && req.method === "POST") {
          await db.prepare("DELETE FROM instances WHERE key_id IN (SELECT id FROM license_keys WHERE tenant_id = ?)").bind(t.id).run();
          await db.prepare("DELETE FROM license_keys WHERE tenant_id = ?").bind(t.id).run();
          await db.prepare("DELETE FROM usage_daily WHERE tenant_id = ?").bind(t.id).run();
          await db.prepare("DELETE FROM tenants WHERE id = ?").bind(t.id).run();
          return json({ deleted: true });
        }
        if (rest === "admin/stats" && req.method === "GET") {
          const k = await db.prepare("SELECT COUNT(*) AS n FROM license_keys WHERE tenant_id = ?").bind(t.id).first();
          const i = await db.prepare("SELECT COUNT(*) AS n FROM instances JOIN license_keys ON instances.key_id = license_keys.id WHERE license_keys.tenant_id = ?").bind(t.id).first();
          const u = await db.prepare("SELECT day, calls FROM usage_daily WHERE tenant_id = ? ORDER BY day DESC LIMIT 30").bind(t.id).all();
          return json({ keys: k.n, instances: i.n, calls_last_30_days: u.results });
        }
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "internal error" }, 500);
    }
  },
};

export { importLemonSqueezy };
