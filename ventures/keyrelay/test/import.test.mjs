// Lemon Squeezy 取り込みのテスト：node:sqlite で D1 の代わりを作り、LS API は偽物の fetch で返す
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { importLemonSqueezy } from "../src/index.js";
const sq = new DatabaseSync(":memory:");
sq.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const db = { prepare(sql) { return { bind(...a) { const st = sq.prepare(sql);
  return { first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }), run: async () => { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } }; } }; } };
const pages = {
  "https://api.lemonsqueezy.com/v1/license-keys?page[size]=100": { data: [
    { id: "11", attributes: { key: "AAAA-1111", activation_limit: 3, expires_at: null, store_id: 1, order_id: 9, order_item_id: 8, product_id: 7, user_name: "U1", user_email: "u1@example.com", disabled: false } },
    { id: "12", attributes: { key: "BBBB-2222", activation_limit: null, expires_at: "2020-01-01T00:00:00Z", disabled: false } }],
    links: { next: "https://api.lemonsqueezy.com/v1/license-keys?page[number]=2" } },
  "https://api.lemonsqueezy.com/v1/license-keys?page[number]=2": { data: [ { id: "13", attributes: { key: "CCCC-3333", activation_limit: 1, disabled: true } } ], links: {} },
  "https://api.lemonsqueezy.com/v1/license-key-instances?page[size]=100": { data: [
    { id: "1", attributes: { license_key_id: 11, identifier: "f1b2c3d4-0000-4000-8000-000000000001", name: "Laptop", created_at: "2025-05-01T00:00:00Z" } },
    { id: "2", attributes: { license_key_id: 99, identifier: "x", name: "orphan" } }], links: {} },
};
const fakeFetch = async (u, o) => { if (o.headers.Authorization !== "Bearer ls_test") return new Response("", { status: 401 }); return new Response(JSON.stringify(pages[u])); };
sq.exec("INSERT INTO tenants (id,name,admin_token_hash,created_at) VALUES ('t1','T','x','now')");
const r1 = await importLemonSqueezy(db, "t1", "ls_test", fakeFetch);
const r2 = await importLemonSqueezy(db, "t1", "ls_test", fakeFetch);
const rows = sq.prepare("SELECT key,status,activation_limit,expires_at FROM license_keys ORDER BY key").all();
const inst = sq.prepare("SELECT id,key_id,name FROM instances").all();
console.log(JSON.stringify(r1), JSON.stringify(r2)); console.log(JSON.stringify(rows)); console.log(JSON.stringify(inst));
const ok = r1.imported_keys === 3 && r1.imported_instances === 1 && r2.imported_keys === 0 && r2.skipped_existing_keys === 3 && r2.imported_instances === 0 && rows.find(r => r.key === "CCCC-3333").status === "disabled";
let bad = false; try { await importLemonSqueezy(db, "t1", "wrong", fakeFetch); } catch { bad = true; }
console.log(ok && bad ? "PASS" : "FAIL");
