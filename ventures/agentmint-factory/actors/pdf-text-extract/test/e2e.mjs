import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { makePdf } from './make.mjs';
const run$ = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const ST = join(ROOT, 'storage-e2e');
const good = await makePdf([['Hello world', 'Second line'], ['Page 2']]);
const blank = await makePdf([[]]);
const server = createServer((req, res) => {
    if (req.url.startsWith('/good.pdf')) { res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(good); }
    if (req.url === '/blank.pdf') { res.writeHead(200); return res.end(blank); }
    if (req.url === '/page.html') { res.writeHead(200); return res.end('<html>no</html>'); }
    res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, r));
const B = `http://127.0.0.1:${server.address().port}`;
function setup(input, datasets = {}) {
    rmSync(ST, { recursive: true, force: true });
    for (const [id, items] of Object.entries(datasets)) {
        const d = join(ST, 'datasets', id); mkdirSync(d, { recursive: true });
        items.forEach((it, i) => writeFileSync(join(d, `${String(i + 1).padStart(9, '0')}.json`), JSON.stringify(it)));
    }
    const kv = join(ST, 'key_value_stores', 'default'); mkdirSync(kv, { recursive: true });
    writeFileSync(join(kv, 'INPUT.json'), JSON.stringify(input));
}
async function run(env = {}) {
    let ok = true;
    try { await run$('node', ['src/main.js'], { cwd: ROOT, env: { ...process.env, CRAWLEE_STORAGE_DIR: ST, ...env } }); } catch { ok = false; }
    const d = join(ST, 'datasets', 'default');
    const rows = existsSync(d) ? readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(d, f)))) : [];
    const o = join(ST, 'key_value_stores', 'default', 'OUTPUT.json');
    return { ok, rows, stats: existsSync(o) ? JSON.parse(readFileSync(o)) : null };
}
setup({ pdfUrls: [`${B}/good.pdf`, `${B}/blank.pdf`, `${B}/page.html`, `${B}/missing.pdf`] });
let r = await run();
assert.ok(r.ok);
const by = Object.fromEntries(r.rows.map((x) => [x.url.replace(B, ''), x]));
assert.equal(by['/good.pdf'].status, 'ok'); assert.match(by['/good.pdf'].text, /Hello world\nSecond line/);
assert.equal(by['/blank.pdf'].status, 'no-text');
assert.equal(by['/page.html'].error, 'not a PDF file');
assert.equal(by['/missing.pdf'].status, 'error');
assert.deepEqual([r.stats.succeeded, r.stats.noText, r.stats.failed], [1, 1, 2]);

setup({ datasetId: 'docs', urlField: 'files.pdf', includePages: false }, { docs: [{ files: { pdf: `${B}/good.pdf` } }, { files: { pdf: [`${B}/good.pdf`] } }] });
r = await run();
assert.ok(r.ok); assert.equal(r.stats.requested, 1); assert.equal(r.rows[0].pages, undefined);

// pay-per-event budget: 2 PDFs affordable (local SDK: $1 per event), the no-text PDF is not charged
setup({ pdfUrls: [`${B}/blank.pdf`, `${B}/good.pdf?1`, `${B}/good.pdf?2`, `${B}/good.pdf?3`], concurrency: 1 });
r = await run({ ACTOR_TEST_PAY_PER_EVENT: '1', APIFY_ACTOR_PRICING_INFO: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { 'pdf-processed': { eventTitle: 'PDF processed', eventPriceUsd: 1 } } } }), APIFY_CHARGED_ACTOR_EVENT_COUNTS: '{}', ACTOR_MAX_TOTAL_CHARGE_USD: '2.5' });
assert.ok(r.ok); assert.equal(r.stats.succeeded, 2); assert.equal(r.stats.noText, 1); assert.equal(r.stats.stoppedAtChargeLimit, true);

setup({ pdfUrls: [] }); r = await run(); assert.equal(r.ok, false);
server.close(); rmSync(ST, { recursive: true, force: true });
console.log('e2e ok');
