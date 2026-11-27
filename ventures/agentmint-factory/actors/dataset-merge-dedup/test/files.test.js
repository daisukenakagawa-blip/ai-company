import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseFile, detectDelimiter } from '../src/lib.js';

test('csv with quotes, escaped quotes, newline in field, BOM, CRLF', () => {
    const t = '﻿name,note,url\r\n"Acme, Inc.","He said ""hi""",https://a.com/1\r\nBeta,"line1\nline2",https://a.com/2\r\n';
    assert.deepEqual(parseCsv(t), [
        { name: 'Acme, Inc.', note: 'He said "hi"', url: 'https://a.com/1' },
        { name: 'Beta', note: 'line1\nline2', url: 'https://a.com/2' },
    ]);
});
test('semicolon and tab delimiters are detected', () => {
    assert.equal(detectDelimiter('a;b;c'), ';');
    assert.equal(detectDelimiter('a\tb\tc'), '\t');
    assert.deepEqual(parseCsv('a;b\n1;2\n'), [{ a: '1', b: '2' }]);
});
test('duplicate and empty headers get unique names; short rows padded', () => {
    assert.deepEqual(parseCsv('a,a,\n1,2\n'), [{ a: '1', a_2: '2', column3: '' }]);
});
test('json array, {items:[]}, single object and jsonl', () => {
    assert.deepEqual(parseFile('[{"x":1},{"x":2}]', { url: 'f.json' }), [{ x: 1 }, { x: 2 }]);
    assert.deepEqual(parseFile('{"items":[{"x":1}]}', { url: 'f.json' }), [{ x: 1 }]);
    assert.deepEqual(parseFile('{"x":1}\n{"x":2}\n', { url: 'f.jsonl' }), [{ x: 1 }, { x: 2 }]);
    assert.deepEqual(parseFile('{"x":1}\n{"x":2}\n', { url: 'https://h/download' }), [{ x: 1 }, { x: 2 }]);
});
test('format by content type and sniffing', () => {
    assert.deepEqual(parseFile('a,b\n1,2', { contentType: 'text/csv' }), [{ a: '1', b: '2' }]);
    assert.deepEqual(parseFile('a,b\n1,2', { url: 'https://h/export?x=1' }), [{ a: '1', b: '2' }]);
    assert.throws(() => parseFile('{"x":1}\nnot json', { url: 'f.jsonl' }), /line 2/);
});
import { isPrivateAddress, safeFetch } from '../src/lib.js';
test('private and metadata addresses are refused', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
        assert.equal(isPrivateAddress(ip), true, ip);
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});
test('redirect to a private address is refused', async () => {
    const lookup = async (h) => [{ address: h === 'good.example' ? '93.184.216.34' : '10.0.0.5' }];
    const fetchImpl = async (u) => (u.startsWith('https://good.example')
        ? { status: 302, headers: new Map([['location', 'http://internal.example/secret']]) }
        : { status: 200, headers: new Map() });
    await assert.rejects(safeFetch('https://good.example/a.csv', { lookup, fetchImpl }), /private or local/);
    await assert.rejects(safeFetch('http://169.254.169.254/x', { lookup, fetchImpl }), /private or local/);
});
