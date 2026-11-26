// End-to-end with a local HTTP server and local Apify storage (no Apify account, no external network).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const run$ = promisify(execFile);

const ROOT = new URL('..', import.meta.url).pathname;
const ST = join(ROOT, 'storage-e2e');
const big = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3366cc' } }).composite([{ input: Buffer.from('<svg width="1600" height="1200"><circle cx="800" cy="600" r="500" fill="orange"/></svg>') }]).jpeg({ quality: 95 }).toBuffer();
const pngImg = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 1 } } }).png().toBuffer();
let flaky = 0;
const server = createServer((req, res) => {
    if (req.url.startsWith('/photo.jpg')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(big); }
    if (req.url === '/logo.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(pngImg); }
    if (req.url === '/flaky.png') { if (flaky++ < 1) { res.writeHead(503); return res.end(); } res.writeHead(200); return res.end(pngImg); }
    if (req.url === '/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html></html>'); }
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
    return { ok, rows, stats: existsSync(o) ? JSON.parse(readFileSync(o)) : null, kv: readdirSync(join(ST, 'key_value_stores', 'default')) };
}

// 1. list of URLs: success, resize, retry after 503, errors are reported and not fatal
setup({ imageUrls: [`${B}/photo.jpg`, `${B}/logo.png`, `${B}/flaky.png`, `${B}/missing.png`, `${B}/page.html`, 'ftp://nope'], format: 'webp', maxWidth: 800 });
let r = await run();
assert.ok(r.ok, 'run ok');
const byUrl = Object.fromEntries(r.rows.map((x) => [x.sourceUrl.replace(B, ''), x]));
assert.equal(byUrl['/photo.jpg'].status, 'ok');
assert.equal(byUrl['/photo.jpg'].width, 800);
assert.ok(byUrl['/photo.jpg'].bytesAfter < byUrl['/photo.jpg'].bytesBefore);
assert.equal(byUrl['/flaky.png'].status, 'ok', 'retried after 503');
assert.equal(byUrl['/missing.png'].status, 'error');
assert.equal(byUrl['/page.html'].status, 'error');
assert.equal(r.stats.succeeded, 3); assert.equal(r.stats.failed, 2); // ftp:// is ignored as invalid input
assert.ok(r.kv.some((f) => f.endsWith('-photo.webp')), 'image stored in key-value store');

// 2. URLs from a dataset field (nested + arrays), dedup of repeated URLs
setup({ datasetId: 'scraped', urlField: 'media.images', format: 'jpeg', quality: 70 }, { scraped: [{ media: { images: [`${B}/photo.jpg`, `${B}/logo.png`] } }, { media: { images: [`${B}/photo.jpg`] } }] });
r = await run();
assert.ok(r.ok); assert.equal(r.stats.requested, 2); assert.equal(r.stats.succeeded, 2);

// 3. pay-per-event: budget for 2 images (local SDK prices each event at $1), failures are never charged
setup({ imageUrls: [`${B}/missing.png`, `${B}/photo.jpg?a`, `${B}/photo.jpg?b`, `${B}/photo.jpg?c`, `${B}/photo.jpg?d`], concurrency: 1 });
r = await run({ ACTOR_TEST_PAY_PER_EVENT: '1', APIFY_ACTOR_PRICING_INFO: JSON.stringify({ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { 'image-processed': { eventTitle: 'Image processed', eventPriceUsd: 1 } } } }), APIFY_CHARGED_ACTOR_EVENT_COUNTS: '{}', ACTOR_MAX_TOTAL_CHARGE_USD: '2.5' });
assert.ok(r.ok, 'budget run ok');
assert.equal(r.stats.succeeded, 2, `succeeded ${r.stats.succeeded}`);
assert.equal(r.stats.stoppedAtChargeLimit, true);

// 4. bad input fails with a clear message
setup({ imageUrls: [], format: 'webp' });
r = await run();
assert.equal(r.ok, false);

server.close();
rmSync(ST, { recursive: true, force: true });
console.log('e2e ok');
