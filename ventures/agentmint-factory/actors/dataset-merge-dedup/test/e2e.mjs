// End-to-end: runs src/main.js as a child process against local storage (no Apify account needed).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const ST = join(ROOT, 'storage-e2e');

function setup(input, datasets) {
    rmSync(ST, { recursive: true, force: true });
    for (const [id, items] of Object.entries(datasets)) {
        const d = join(ST, 'datasets', id); mkdirSync(d, { recursive: true });
        items.forEach((it, i) => writeFileSync(join(d, `${String(i + 1).padStart(9, '0')}.json`), JSON.stringify(it)));
    }
    const kv = join(ST, 'key_value_stores', 'default'); mkdirSync(kv, { recursive: true });
    writeFileSync(join(kv, 'INPUT.json'), JSON.stringify(input));
}
function run(env = {}) {
    let ok = true;
    try { execFileSync('node', ['src/main.js'], { cwd: ROOT, env: { ...process.env, CRAWLEE_STORAGE_DIR: ST, APIFY_LOCAL_STORAGE_DIR: ST, ...env }, stdio: 'pipe' }); }
    catch { ok = false; }
    const d = join(ST, 'datasets', 'default');
    let out = [];
    try { out = readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(d, f)))); } catch {}
    let stats = null;
    try { stats = JSON.parse(readFileSync(join(ST, 'key_value_stores', 'default', 'OUTPUT.json'))); } catch {}
    return { ok, out, stats };
}

const A = [{ url: 'https://ex.com/1', name: 'One', price: 10 }, { url: 'https://ex.com/2', name: 'Two', price: 200 }, { url: 'https://ex.com/1', name: 'One dup' }];
const B = [{ url: 'HTTPS://EX.COM/1 ', name: 'One B', price: 10, email: 'x@y.z' }, { url: 'https://ex.com/3?utm_source=n', name: 'Three' }, { url: 'https://ex.com/3', name: 'Three clean', email: 'a@b.c', price: 5 }, { name: 'no url' }];

// 1. merge + dedup by url (first)
setup({ datasetIds: ['dsA', 'dsB'], dedupFields: ['url'] }, { dsA: A, dsB: B });
let r = run();
assert.ok(r.ok, 'run 1 ok');
assert.deepEqual(r.out.map((x) => x.name), ['One', 'Two', 'Three', 'Three clean', 'no url']);
assert.equal(r.stats.duplicatesRemoved, 2);
assert.equal(r.stats.inputItems, 7);

// 2. ignore UTM + keep mostComplete + source field + filter
setup({ datasetIds: ['dsA', 'dsB'], dedupFields: ['url'], ignoreUrlTracking: true, keep: 'mostComplete', addSourceField: true, filters: [{ field: 'url', op: 'exists' }] }, { dsA: A, dsB: B });
r = run();
assert.ok(r.ok);
assert.deepEqual(r.out.map((x) => x.name), ['One B', 'Two', 'Three clean']);
assert.equal(r.out[0]._sourceDatasetId, 'dsB');
assert.equal(r.stats.filteredOut, 1);

// 3. pay-per-event budget: locally the SDK prices every event at $1 , so budget $2.5 -> only 2 items written, run still succeeds
setup({ datasetIds: ['dsA', 'dsB'], dedupFields: ['url'] }, { dsA: A, dsB: B });
r = run({ ACTOR_TEST_PAY_PER_EVENT: '1', APIFY_ACTOR_PRICING_INFO: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { 'result-item': { eventTitle: 'Result item', eventPriceUsd: 0.001 } } } }), APIFY_CHARGED_ACTOR_EVENT_COUNTS: '{}', ACTOR_MAX_TOTAL_CHARGE_USD: '2.5' });
assert.ok(r.ok, 'budget run ok');
assert.equal(r.out.length, 2, `budget: expected 2 got ${r.out.length}`);
assert.equal(r.stats.stoppedAtChargeLimit, true);

// 4. bad input fails clearly
setup({ datasetIds: [] }, {});
r = run();
assert.equal(r.ok, false);

// 5. scale: 120k items, 50% duplicates
const big = Array.from({ length: 120000 }, (_, i) => ({ id: i % 60000, v: 'x'.repeat(20) }));
setup({ datasetIds: ['big'], dedupFields: ['id'], fieldsToOmit: ['v'] }, { big });
const t = Date.now(); r = run();
assert.ok(r.ok); assert.equal(r.out.length, 60000); assert.deepEqual(Object.keys(r.out[0]), ['id']);
console.log(`e2e ok (120k items in ${((Date.now() - t) / 1000).toFixed(1)}s)`);
rmSync(ST, { recursive: true, force: true });
