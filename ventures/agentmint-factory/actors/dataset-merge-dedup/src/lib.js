// Pure helpers (no Apify dependency) so they can be unit-tested.
import { createHash } from 'node:crypto';

export function getPath(obj, path) {
    if (obj == null) return undefined;
    if (!path.includes('.')) return obj[path];
    let cur = obj;
    for (const p of path.split('.')) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
}

function deletePath(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null || typeof cur !== 'object') return;
        cur = cur[parts[i]];
    }
    if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
}

// Stable JSON (sorted keys) so {a:1,b:2} and {b:2,a:1} are the same item.
export function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

export function normalizeValue(v, opts) {
    if (typeof v === 'string') {
        let s = v;
        if (opts.trim) s = s.trim();
        if (opts.collapseWhitespace) s = s.replace(/\s+/g, ' ');
        if (opts.lowercase) s = s.toLowerCase();
        if (opts.stripUrlNoise && /^https?:\/\//i.test(s)) {
            try {
                const u = new URL(s);
                u.hash = '';
                for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
                s = u.toString().replace(/\/$/, '');
                s = s.replace(/^https?:\/\/www\./i, (m) => m.replace(/www\./i, ''));
            } catch { /* not a URL */ }
        }
        return s;
    }
    if (Array.isArray(v)) return v.map((x) => normalizeValue(x, opts));
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = normalizeValue(v[k], opts);
        return o;
    }
    return v;
}

// Returns a short hash for the dedup key, or null when every key field is empty
// (items with no key are never treated as duplicates of each other).
export function dedupKey(item, fields, opts) {
    let material;
    if (!fields || fields.length === 0) {
        material = stableStringify(normalizeValue(item, opts));
    } else {
        const vals = fields.map((f) => normalizeValue(getPath(item, f), opts));
        if (vals.every((v) => v === undefined || v === null || v === '')) return null;
        material = stableStringify(vals);
    }
    return createHash('sha1').update(material).digest('base64');
}

export function completeness(item) {
    let n = 0;
    const walk = (v) => {
        if (v === null || v === undefined || v === '') return;
        if (Array.isArray(v)) { if (v.length) n++; v.forEach(walk); return; }
        if (typeof v === 'object') { Object.values(v).forEach(walk); return; }
        n++;
    };
    walk(item);
    return n;
}

const OPS = {
    eq: (a, b) => String(a) === String(b),
    neq: (a, b) => String(a) !== String(b),
    contains: (a, b) => a != null && String(a).toLowerCase().includes(String(b).toLowerCase()),
    notContains: (a, b) => a == null || !String(a).toLowerCase().includes(String(b).toLowerCase()),
    exists: (a) => a !== undefined && a !== null && a !== '',
    notExists: (a) => a === undefined || a === null || a === '',
    gt: (a, b) => a !== null && a !== '' && Number(a) > Number(b),
    gte: (a, b) => a !== null && a !== '' && Number(a) >= Number(b),
    lt: (a, b) => a !== null && a !== '' && Number(a) < Number(b),
    lte: (a, b) => a !== null && a !== '' && Number(a) <= Number(b),
    regex: (a, b) => a != null && new RegExp(b, 'i').test(String(a)),
};

export function validateFilters(filters) {
    for (const f of filters || []) {
        if (!f || typeof f.field !== 'string' || !f.field) throw new Error(`Filter needs a "field": ${JSON.stringify(f)}`);
        if (!OPS[f.op]) throw new Error(`Unknown filter op "${f.op}". Use one of: ${Object.keys(OPS).join(', ')}`);
        if (f.op === 'regex') new RegExp(f.value); // throws on invalid pattern
    }
}

export function passesFilters(item, filters) {
    for (const f of filters || []) if (!OPS[f.op](getPath(item, f.field), f.value)) return false;
    return true;
}

export function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v, key, out);
        else if (Array.isArray(v)) out[key] = v.every((x) => x === null || typeof x !== 'object') ? v.join('; ') : JSON.stringify(v);
        else out[key] = v;
    }
    return out;
}

export function reshape(item, { fieldsToKeep, fieldsToOmit, renameFields, flattenNested }) {
    let out;
    if (fieldsToKeep && fieldsToKeep.length) {
        out = {};
        for (const f of fieldsToKeep) {
            const v = getPath(item, f);
            if (v !== undefined) setPath(out, f, v);
        }
    } else {
        out = structuredClone(item);
    }
    for (const f of fieldsToOmit || []) deletePath(out, f);
    for (const [from, to] of Object.entries(renameFields || {})) {
        const v = getPath(out, from);
        if (v !== undefined && to) { deletePath(out, from); setPath(out, to, v); }
    }
    return flattenNested ? flatten(out) : out;
}
