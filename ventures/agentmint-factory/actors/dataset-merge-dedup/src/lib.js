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

// ---- Files (CSV / TSV / JSON / JSON Lines) given by URL --------------------------------------------------------
// CSV follows RFC 4180 (quoted fields, "" escapes, line breaks inside quotes). The delimiter (, ; tab |) is detected
// from the header line. A UTF-8 BOM is removed. Every value is kept as a string (no guessing of types).
export function detectDelimiter(headerLine) {
    let best = ',', n = -1;
    for (const d of [',', ';', '\t', '|']) {
        let c = 0, q = false;
        for (const ch of headerLine) { if (ch === '"') q = !q; else if (!q && ch === d) c++; }
        if (c > n) { best = d; n = c; }
    }
    return best;
}

export function parseCsv(text, delimiter) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.slice(0, Math.max(0, text.search(/\r?\n/)) || text.length);
    const d = delimiter || detectDelimiter(firstLine);
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
            if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
            else field += ch;
        } else if (ch === '"' && field === '') q = true;
        else if (ch === d) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) return [];
    const header = rows[0].map((h, i) => (h.trim() || `column${i + 1}`));
    const seen = {};
    const keys = header.map((h) => { seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h}_${seen[h]}` : h; });
    return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

export function parseFile(text, { url = '', contentType = '', format = 'auto' } = {}) {
    const lower = (url.split('?')[0] || '').toLowerCase();
    let f = format;
    if (f === 'auto') {
        if (/json/.test(contentType) && !/ndjson|jsonl/.test(contentType)) f = 'json';
        else if (/ndjson|jsonl/.test(contentType) || /\.(jsonl|ndjson)$/.test(lower)) f = 'jsonl';
        else if (/\.json$/.test(lower)) f = 'json';
        else if (/\.tsv$/.test(lower) || /tab-separated/.test(contentType)) f = 'tsv';
        else if (/\.csv$/.test(lower) || /csv/.test(contentType)) f = 'csv';
        else { const t = text.trimStart(); f = t.startsWith('[') || t.startsWith('{') ? (/^\{[^\n]*\}\s*\n\s*\{/.test(t) ? 'jsonl' : 'json') : 'csv'; }
    }
    if (f === 'json') {
        const v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
        const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.data) ? v.data : [v];
        return arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    }
    if (f === 'jsonl') return text.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
        try { return JSON.parse(l); } catch { throw new Error(`Invalid JSON on line ${i + 1} of ${url || 'file'}`); }
    });
    if (f === 'tsv') return parseCsv(text, '\t');
    if (f === 'csv') return parseCsv(text);
    throw new Error(`Unknown file format "${format}". Use auto, csv, tsv, json or jsonl.`);
}

// ---- Safe download (SSRF protection) ---------------------------------------------------------------------------
// Only public http(s) addresses. Private, loopback, link-local (incl. cloud metadata 169.254.169.254), CGNAT,
// multicast and reserved ranges are refused, also after every redirect (max 5 hops).
export function isPrivateAddress(ip) {
    if (ip.includes(':')) {
        const v = ip.toLowerCase();
        if (v === '::1' || v === '::' ) return true;
        if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
        return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v.replace(/^\[/, ''));
    }
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
    const [a, b] = p;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
        || a >= 224;
}

export async function safeFetch(url, { lookup, fetchImpl = fetch, timeoutMs = 120000, maxRedirects = 5, allowLocal = false } = {}) {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const u = new URL(current);
        if (!/^https?:$/.test(u.protocol)) throw new Error(`File URL must start with http:// or https://: ${current}`);
        const host = u.hostname.replace(/^\[|\]$/g, '');
        const addrs = allowLocal ? [] : /^[\d.]+$/.test(host) || host.includes(':') ? [{ address: host }] : await lookup(host, { all: true });
        if (!allowLocal && (!addrs.length || addrs.some((a) => isPrivateAddress(a.address)))) throw new Error(`Refusing to download from a private or local address: ${current}`);
        const res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), current).toString(); continue; }
        return res;
    }
    throw new Error(`Too many redirects: ${url}`);
}
