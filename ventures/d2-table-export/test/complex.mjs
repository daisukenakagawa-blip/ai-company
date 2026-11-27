import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('file://' + path.join(DIR, 'test/complex.html'));
await p.addScriptTag({ content: readFileSync(path.join(DIR, 'src/core.js'), 'utf8') });
const r = await p.evaluate(() => { const C = self.TableExportCore; const g = (id) => C.tableToMatrix(document.getElementById(id)); return { c1: g('c1'), c2: g('c2'), c3csv: C.toCSV(g('c3')) }; });
assert.deepEqual(r.c1, [
  ['都道府県', '人口（人）', '人口（人）', '人口（人）'],
  ['都道府県', '総数', '男', '女'],
  ['北海道', '5,092,000', '2,410,000', '2,682,000'],
  ['青森県', '1,184,000', '561,000', '623,000'],
  ['注：推計値', '注：推計値', '注：推計値', '注：推計値'],
]);
// 入れ子の表：外側の行だけを数え、rowspan は表の行数で打ち切る
assert.equal(r.c2.length, 2); assert.equal(r.c2[1][0], 'A'); assert.equal(r.c2[1][1], '内側'); assert.equal(r.c2[0][2], '');
assert.ok(r.c3csv.includes('="090-1234-5678"') && r.c3csv.includes('="0600001"') && r.c3csv.includes('="1234567890123"') && r.c3csv.includes(',-5'));
await b.close(); console.log('complex tables ok');
