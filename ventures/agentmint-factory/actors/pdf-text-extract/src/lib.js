// PDF text extraction core (pdf.js, pure JavaScript; no external services).
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

// "1-3,7,10-" -> sorted unique page numbers within 1..count
export function parsePageRange(spec, count) {
    if (!spec || !String(spec).trim()) return Array.from({ length: count }, (_, i) => i + 1);
    const out = new Set();
    for (const part of String(spec).split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
        if (!m || (!m[1] && !m[3])) throw new Error(`Invalid page range "${part}". Use e.g. "1-3,7,10-".`);
        const a = m[1] ? Number(m[1]) : 1;
        const b = m[2] ? (m[3] ? Number(m[3]) : count) : a;
        for (let p = Math.max(1, a); p <= Math.min(count, b); p++) out.add(p);
    }
    return [...out].sort((x, y) => x - y);
}

// Rebuild lines from positioned text items: break on explicit EOL or when the baseline moves.
export function itemsToText(items) {
    let out = '';
    let lastY = null;
    let lastXEnd = null;
    for (const it of items) {
        if (!('str' in it)) continue;
        const y = it.transform ? Math.round(it.transform[5]) : null;
        const x = it.transform ? it.transform[4] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
        else if (lastXEnd !== null && x !== null && x - lastXEnd > 1.5 && !out.endsWith(' ') && !out.endsWith('\n') && it.str && !it.str.startsWith(' ')) out += ' ';
        out += it.str;
        if (it.hasEOL) out += '\n';
        lastY = y;
        lastXEnd = x !== null && it.width != null ? x + it.width : null;
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdf(data, { pages: pageSpec = '', maxPages = 500, password } = {}) {
    const task = getDocument({ data: new Uint8Array(data), password, verbosity: VerbosityLevel.ERRORS, isEvalSupported: false, useSystemFonts: false, disableFontFace: true });
    let doc;
    try { doc = await task.promise; } catch (e) { await task.destroy().catch(() => {}); throw e; }
    try {
        const numPages = doc.numPages;
        let wanted = parsePageRange(pageSpec, numPages);
        const truncated = wanted.length > maxPages;
        if (truncated) wanted = wanted.slice(0, maxPages);
        const meta = await doc.getMetadata().catch(() => ({}));
        const info = meta.info || {};
        const pages = [];
        for (const n of wanted) {
            const page = await doc.getPage(n);
            const tc = await page.getTextContent();
            pages.push({ page: n, text: itemsToText(tc.items) });
            page.cleanup();
        }
        const text = pages.map((p) => p.text).join('\n\n');
        return {
            pageCount: numPages, pagesExtracted: pages.length, truncated,
            title: info.Title || null, author: info.Author || null, subject: info.Subject || null, keywords: info.Keywords || null,
            creator: info.Creator || null, producer: info.Producer || null, creationDate: info.CreationDate || null, modDate: info.ModDate || null,
            textFound: text.replace(/\s/g, '').length > 0, charCount: text.length, wordCount: (text.match(/\S+/g) || []).length,
            text, pages,
        };
    } finally {
        await task.destroy();
    }
}
