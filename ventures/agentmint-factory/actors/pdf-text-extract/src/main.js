import { Actor, log } from 'apify';
import { extractPdf } from './lib.js';

const EVENT = 'pdf-processed'; // charged only for PDFs where text was extracted
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 60000;

async function download(url) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PdfTextExtract/0.1; +https://apify.com)' } });
            if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.retry = res.status >= 500 || res.status === 429; throw e; }
            if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw Object.assign(new Error('file larger than 50 MB'), { retry: false });
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > MAX_BYTES) throw Object.assign(new Error('file larger than 50 MB'), { retry: false });
            if (buf.subarray(0, 1024).indexOf('%PDF') === -1) throw Object.assign(new Error('not a PDF file'), { retry: false });
            return buf;
        } catch (e) {
            lastErr = e;
            if (e.retry === false || attempt === 3) break;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
        } finally { clearTimeout(t); }
    }
    throw new Error(lastErr?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (lastErr?.message || 'download failed'));
}

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const { pages = '', maxPagesPerPdf = 500, includePages = true, includeFullText = true, password, maxPdfs = 0 } = input;
    const concurrency = Math.min(Math.max(input.concurrency || 3, 1), 6);
    let urls = (input.pdfUrls || []).map((u) => (typeof u === 'string' ? u : u?.url)).filter(Boolean);
    if (input.datasetId) {
        const field = input.urlField || 'pdfUrl';
        const ds = await Actor.openDataset(input.datasetId, { forceCloud: Actor.isAtHome() });
        for (let offset = 0; ; offset += 1000) {
            const { items } = await ds.getData({ offset, limit: 1000 });
            for (const it of items) {
                const v = field.split('.').reduce((o, k) => (o == null ? o : o[k]), it);
                for (const u of Array.isArray(v) ? v : [v]) if (typeof u === 'string') urls.push(u);
            }
            if (items.length < 1000) break;
        }
    }
    urls = [...new Set(urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)))];
    if (maxPdfs) urls = urls.slice(0, maxPdfs);
    if (!urls.length) throw new Error('No PDF URLs. Provide "pdfUrls" and/or "datasetId" + "urlField" (http/https URLs).');
    log.info(`Extracting text from ${urls.length} PDF(s)`);

    const stats = { requested: urls.length, succeeded: 0, noText: 0, failed: 0, pages: 0, stoppedAtChargeLimit: false };
    const ppe = () => Actor.getChargingManager().getPricingInfo().isPayPerEvent;
    let next = 0;
    let stop = false;
    async function worker() {
        while (!stop) {
            const i = next++;
            if (i >= urls.length) return;
            const url = urls[i];
            if (ppe() && Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(EVENT) < 1) { stop = true; stats.stoppedAtChargeLimit = true; return; }
            try {
                const buf = await download(url);
                const r = await extractPdf(buf, { pages, maxPages: maxPagesPerPdf, password });
                if (!r.textFound) {
                    stats.noText++;
                    await Actor.pushData({ url, status: 'no-text', pageCount: r.pageCount, note: 'No text layer found (probably a scanned PDF). OCR is not included. Not charged.' });
                    continue;
                }
                if (ppe()) {
                    const c = await Actor.charge({ eventName: EVENT, count: 1 });
                    if (c.chargedCount < 1) { stop = true; stats.stoppedAtChargeLimit = true; return; }
                    if (c.eventChargeLimitReached) { stop = true; stats.stoppedAtChargeLimit = true; }
                }
                stats.succeeded++; stats.pages += r.pagesExtracted;
                const row = { url, status: 'ok', ...r };
                if (!includeFullText) delete row.text;
                if (!includePages) delete row.pages;
                await Actor.pushData(row);
            } catch (e) {
                stats.failed++;
                const msg = /password/i.test(e?.name + e?.message) ? 'PDF is password-protected (set "password")' : String(e?.message || e).slice(0, 300);
                await Actor.pushData({ url, status: 'error', error: msg });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    await Actor.setValue('OUTPUT', stats);
    const msg = `${stats.succeeded} PDFs extracted (${stats.pages} pages), ${stats.noText} without text, ${stats.failed} failed — only successful PDFs are charged${stats.stoppedAtChargeLimit ? '. Stopped at your maximum cost per run' : ''}`;
    log.info(msg);
    await Actor.exit(msg);
} catch (err) {
    log.error(err.message);
    await Actor.fail(err.message);
}
