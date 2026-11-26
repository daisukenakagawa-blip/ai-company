import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupKey, passesFilters, validateFilters, reshape, flatten, completeness, normalizeValue } from '../src/lib.js';
const N = { trim: true, lowercase: true, collapseWhitespace: true, stripUrlNoise: false };

test('dedup key ignores case/space when normalizing', () => {
    assert.equal(dedupKey({ n: 'ACME  Inc ' }, ['n'], N), dedupKey({ n: 'acme inc' }, ['n'], N));
    assert.notEqual(dedupKey({ n: 'ACME' }, ['n'], { }), dedupKey({ n: 'acme' }, ['n'], { }));
});
test('whole-item key is order independent', () => {
    assert.equal(dedupKey({ a: 1, b: { c: 2, d: 3 } }, [], N), dedupKey({ b: { d: 3, c: 2 }, a: 1 }, [], N));
});
test('empty key fields -> null (never a duplicate)', () => {
    assert.equal(dedupKey({ x: 1 }, ['url'], N), null);
    assert.equal(dedupKey({ url: '' }, ['url'], N), null);
});
test('nested paths and multi-field keys', () => {
    assert.equal(dedupKey({ name: 'A', addr: { city: 'X' } }, ['name', 'addr.city'], N), dedupKey({ name: 'a', addr: { city: 'x' } }, ['name', 'addr.city'], N));
    assert.notEqual(dedupKey({ name: 'A', addr: { city: 'X' } }, ['name', 'addr.city'], N), dedupKey({ name: 'A', addr: { city: 'Y' } }, ['name', 'addr.city'], N));
});
test('URL tracking noise', () => {
    const U = { ...N, stripUrlNoise: true };
    assert.equal(normalizeValue('https://www.Example.com/a/?utm_source=x&id=2#top', U), 'https://example.com/a/?id=2');
    assert.equal(dedupKey({ u: 'https://example.com/a/' }, ['u'], U), dedupKey({ u: 'https://www.example.com/a?utm_medium=y' }, ['u'], U));
    assert.notEqual(dedupKey({ u: 'https://example.com/a?id=1' }, ['u'], U), dedupKey({ u: 'https://example.com/a?id=2' }, ['u'], U));
});
test('filters', () => {
    const f = [{ field: 'price', op: 'lt', value: 100 }, { field: 'email', op: 'exists' }];
    assert.equal(passesFilters({ price: 50, email: 'a@b.c' }, f), true);
    assert.equal(passesFilters({ price: 150, email: 'a@b.c' }, f), false);
    assert.equal(passesFilters({ price: 50 }, f), false);
    assert.equal(passesFilters({ price: null, email: 'x' }, [{ field: 'price', op: 'lt', value: 1 }]), false);
    assert.equal(passesFilters({ t: 'Senior Engineer' }, [{ field: 't', op: 'regex', value: '^senior' }]), true);
    assert.throws(() => validateFilters([{ field: 'a', op: 'like' }]));
    assert.throws(() => validateFilters([{ field: 'a', op: 'regex', value: '(' }]));
});
test('reshape keep/omit/rename/flatten', () => {
    const it = { title: 'T', meta: { a: 1, b: 2 }, tags: ['x', 'y'], junk: 1 };
    assert.deepEqual(reshape(it, { fieldsToKeep: ['title', 'meta.a'] }), { title: 'T', meta: { a: 1 } });
    assert.deepEqual(reshape(it, { fieldsToOmit: ['junk', 'meta.b'], renameFields: { title: 'name' } }), { meta: { a: 1 }, tags: ['x', 'y'], name: 'T' });
    assert.deepEqual(reshape(it, { fieldsToOmit: ['junk'], flattenNested: true }), { title: 'T', 'meta.a': 1, 'meta.b': 2, tags: 'x; y' });
    assert.equal(it.junk, 1, 'input not mutated');
});
test('flatten arrays of objects to JSON', () => {
    assert.deepEqual(flatten({ a: [{ x: 1 }] }), { a: '[{"x":1}]' });
});
test('completeness counts non-empty leaves', () => {
    assert.equal(completeness({ a: 1, b: '', c: null, d: { e: 'x' }, f: [] }), 2);
});
