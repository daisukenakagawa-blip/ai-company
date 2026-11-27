// End-to-end for fileUrls: serves a CSV and a JSON file from a local HTTP server, merges them with a dataset.
import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const ST = join(ROOT, 'storage-files-e2e');
const files = {
    '/a.csv': ['text/csv', 'url;name\nhttps://ex.com/1?utm_source=x;One\nhttps://ex.com/2;Two\n'],
    '/b.json': ['application/json', JSON.stringify([{ url: 'https://www.ex.com/1/', name: 'One again' }, { url: 'https://ex.com/3', name: 'Three' }])],
};
const srv = http.createServer((req, res) => {
    const f = files[req.url];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f[0] }); res.end(f[1]);
}).listen(0);
const port = srv.address().port;

function runWith(input) {
    rmSync(ST, { recursive: true, force: true });
    const kv = join(ST, 'key_value_stores', 'default'); mkdirSync(kv, { recursive: true });
    writeFileSync(join(kv, 'INPUT.json'), JSON.stringify(input));
    return new Promise((resolve) => execFile('node', ['src/main.js'], { cwd: ROOT, env: { ...process.env, CRAWLEE_STORAGE_DIR: ST, APIFY_LOCAL_STORAGE_DIR: ST } }, (err) => {
        let out = [];
        try { const d = join(ST, 'datasets', 'default'); out = readdirSync(d).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(d, f)))); } catch {}
        let stats = null; try { stats = JSON.parse(readFileSync(join(ST, 'key_value_stores', 'default', 'OUTPUT.json'))); } catch {}
        resolve({ ok: !err, out, stats });
    }));
}

let r = await runWith({ fileUrls: [`http://127.0.0.1:${port}/a.csv`, `http://127.0.0.1:${port}/b.json`], dedupFields: ['url'], ignoreUrlTracking: true });
assert.ok(r.ok, 'files run ok');
assert.deepEqual(r.out.map((x) => x.name), ['One', 'Two', 'Three']);
assert.equal(r.stats.duplicatesRemoved, 1);
assert.equal(r.stats.sources.length, 2);
r = await runWith({ fileUrls: [`http://127.0.0.1:${port}/missing.csv`] });
assert.ok(!r.ok, '404 fails the run');
r = await runWith({ fileUrls: ['ftp://x/y.csv'] });
assert.ok(!r.ok, 'non-http url rejected');
srv.close();
rmSync(ST, { recursive: true, force: true });
console.log('files e2e ok');
