import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRange, extractPdf } from '../src/lib.js';
import { makePdf } from './make.mjs';

test('page ranges', () => {
    assert.deepEqual(parsePageRange('', 3), [1, 2, 3]);
    assert.deepEqual(parsePageRange('1-2, 5', 10), [1, 2, 5]);
    assert.deepEqual(parsePageRange('8-', 10), [8, 9, 10]);
    assert.deepEqual(parsePageRange('-2', 10), [1, 2]);
    assert.deepEqual(parsePageRange('3,1,3', 5), [1, 3]);
    assert.deepEqual(parsePageRange('20', 5), []);
    assert.throws(() => parsePageRange('a-b', 5));
});
test('extracts text per page with lines and metadata', async () => {
    const pdf = await makePdf([['Invoice 2026-001', 'Total: 1,250.00 EUR'], ['Page two line']], { title: 'Invoice', author: 'ACME' });
    const r = await extractPdf(pdf);
    assert.equal(r.pageCount, 2);
    assert.equal(r.title, 'Invoice'); assert.equal(r.author, 'ACME');
    assert.match(r.pages[0].text, /Invoice 2026-001\nTotal: 1,250.00 EUR/);
    assert.equal(r.pages[1].text, 'Page two line');
    assert.equal(r.textFound, true);
    assert.ok(r.wordCount >= 7);
});
test('page selection and cap', async () => {
    const pdf = await makePdf([['A'], ['B'], ['C'], ['D']]);
    let r = await extractPdf(pdf, { pages: '2-3' });
    assert.deepEqual(r.pages.map((p) => p.text), ['B', 'C']);
    r = await extractPdf(pdf, { maxPages: 1 });
    assert.equal(r.pagesExtracted, 1); assert.equal(r.truncated, true);
});
test('blank (scanned-like) PDF has no text', async () => {
    const r = await extractPdf(await makePdf([[]]));
    assert.equal(r.textFound, false);
});
test('garbage is rejected', async () => {
    await assert.rejects(extractPdf(Buffer.from('hello')));
});
