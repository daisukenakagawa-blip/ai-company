// 試験：Playwright で実際のブラウザに表を描画し、core.js の展開と CSV を確かめる。拡張機能としての読み込みも確かめる
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const core = readFileSync(path.join(DIR, 'src/core.js'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(DIR, 'test/fixture.html'));
await page.addScriptTag({ content: core });
const r = await page.evaluate(() => {
  const C = self.TableExportCore, t = document.getElementById('t1');
  return { rep: C.tableToMatrix(t, 'repeat'), first: C.tableToMatrix(t, 'first'), csv: C.toCSV(C.tableToMatrix(t, 'repeat')), tsv: C.toTSV(C.tableToMatrix(t)), d: C.describe(t, 0) };
});
assert.deepEqual(r.rep, [
  ['部署', '件数', '件数', '備考'],
  ['部署', '工事', '物品', 'メモ'],
  ['総務課', '3', '5', '=SUM(A1)'],
  ['総務課', '1', '2', '"引用",カンマ'],
  ['財政課', 'なし', 'なし', '改行\nあり'],
]);
assert.deepEqual(r.first[1], ['', '工事', '物品', 'メモ']);
assert.deepEqual(r.first[3], ['', '1', '2', '"引用",カンマ']);
assert.ok(r.csv.startsWith('﻿部署,件数,件数,備考\r\n'), 'BOM と見出し');
assert.ok(r.csv.includes(`'=SUM(A1)`), '式の先頭に \' を付ける');
assert.ok(r.csv.includes('"""引用"",カンマ"'), '引用符とカンマのエスケープ');
assert.ok(r.csv.includes('"改行\nあり"'), 'セル内の改行は引用符で囲む');
assert.ok(!r.tsv.includes('改行\nあり') && r.tsv.includes('改行 あり'), 'TSV は改行を空白に');
assert.equal(r.d.rows, 5); assert.equal(r.d.cols, 4); assert.equal(r.d.merged, true); assert.equal(r.d.label, '入札結果');
// 数値の負数は式扱いしない
const neg = await page.evaluate(() => self.TableExportCore.toCSV([['-5', '-x']]));
assert.ok(neg.includes('-5,') && neg.includes("'-x"));
await browser.close();

// 拡張機能として読み込めるか（manifest の検査）
const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${DIR}`, `--load-extension=${DIR}`] });
let [sw] = ctx.serviceWorkers();
const pages = ctx.pages();
// 展開した拡張の ID はフォルダの絶対パスの SHA-256 から決まる（先頭32桁を a〜p に置き換え）
const { createHash } = await import('node:crypto');
const id = [...createHash('sha256').update(DIR).digest('hex').slice(0, 32)].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
const p2 = await ctx.newPage();
const errors = []; p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto(`chrome-extension://${id}/src/popup.html`);
await p2.waitForFunction(() => document.getElementById('msg').textContent !== '表を探しています…', null, { timeout: 10000 });
const msg = await p2.textContent('#msg');
assert.equal(errors.length, 0, 'popup にエラーなし: ' + errors.join(';'));
console.log('拡張機能として読み込み OK（popup の表示：' + msg + '）');
await ctx.close();
console.log('table-export tests ok');
