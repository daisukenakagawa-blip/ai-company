import { Actor, log } from 'apify';
import { validateOptions, processImage, outputKey, FORMATS } from './lib.js';

const EVENT = 'image-processed'; // charged only for images that were converted successfully
const MAX_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 30000;

async function download(url) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageConvertCompress/0.1; +https://apify.com)' } });
            if (!res.ok) {
                const e = new Error(`HTTP ${res.status}`); e.retry = res.status >= 500 || res.status === 429; throw e;
            }
            const len = Number(res.headers.get('content-length') || 0);
            if (len > MAX_BYTES) throw Object.assign(new Error(`file larger than ${MAX_BYTES / 1048576} MB`), { retry: false });
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > MAX_BYTES) throw Object.assign(new Error(`file larger than ${MAX_BYTES / 1048576} MB`), { retry: false });
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
    const opt = validateOptions(input);
    const concurrency = Math.min(Math.max(input.concurrency || 5, 1), 10);
    const maxImages = input.maxImages || 0;

    // Collect URLs: a plain list and/or a field of an existing dataset (e.g. a scraper's image URLs)
    let urls = (input.imageUrls || []).map((u) => (typeof u === 'string' ? u : u?.url)).filter(Boolean);
    if (input.datasetId) {
        const field = input.urlField || 'imageUrl';
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
    if (maxImages) urls = urls.slice(0, maxImages);
    if (!urls.length) throw new Error('No image URLs. Provide "imageUrls" and/or "datasetId" + "urlField" (http/https URLs).');
    log.info(`Processing ${urls.length} image(s) -> ${opt.format}, quality ${opt.quality}${opt.maxWidth || opt.maxHeight ? `, max ${opt.maxWidth || '-'}x${opt.maxHeight || '-'}` : ''}`);

    const store = await Actor.openKeyValueStore();
    const stats = { requested: urls.length, succeeded: 0, failed: 0, keptOriginal: 0, bytesIn: 0, bytesOut: 0, stoppedAtChargeLimit: false };
    let next = 0;
    let stop = false;
    const ppe = () => Actor.getChargingManager().getPricingInfo().isPayPerEvent;

    async function worker() {
        while (!stop) {
            const i = next++;
            if (i >= urls.length) return;
            const url = urls[i];
            // Respect the user's maximum cost per run: do not start an image that could not be paid for.
            if (ppe() && Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(EVENT) < 1) {
                stop = true; stats.stoppedAtChargeLimit = true; return;
            }
            try {
                const src = await download(url);
                let { buffer, info } = await processImage(src, opt);
                let note = null;
                if (opt.skipIfLarger && buffer.length >= src.length && info.inputFormat === (opt.format === 'jpeg' ? 'jpeg' : opt.format) && !opt.maxWidth && !opt.maxHeight) {
                    buffer = src; note = 'original kept (already smaller)'; stats.keptOriginal++;
                }
                // Charge before storing, so a run that hit the user's budget stops cleanly.
                if (ppe()) {
                    const c = await Actor.charge({ eventName: EVENT, count: 1 });
                    if (c.chargedCount < 1) { stop = true; stats.stoppedAtChargeLimit = true; return; }
                    if (c.eventChargeLimitReached) { stop = true; stats.stoppedAtChargeLimit = true; }
                }
                const key = outputKey(url, i, opt.format);
                await store.setValue(key, buffer, { contentType: FORMATS[opt.format] });
                stats.succeeded++; stats.bytesIn += src.length; stats.bytesOut += buffer.length;
                await Actor.pushData({
                    sourceUrl: url, status: 'ok', outputKey: key, outputUrl: store.getPublicUrl(key), format: opt.format,
                    width: info.width, height: info.height, inputFormat: info.inputFormat, inputWidth: info.inputWidth, inputHeight: info.inputHeight,
                    bytesBefore: src.length, bytesAfter: buffer.length, savedPercent: Math.round((1 - buffer.length / src.length) * 1000) / 10, note,
                });
            } catch (e) {
                stats.failed++;
                await Actor.pushData({ sourceUrl: url, status: 'error', error: String(e.message || e).slice(0, 300) });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    stats.savedPercent = stats.bytesIn ? Math.round((1 - stats.bytesOut / stats.bytesIn) * 1000) / 10 : 0;
    await Actor.setValue('OUTPUT', stats);
    const msg = `${stats.succeeded} converted, ${stats.failed} failed (not charged), saved ${stats.savedPercent}%${stats.stoppedAtChargeLimit ? ' - stopped at your maximum cost per run' : ''}`;
    log.info(msg);
    await Actor.exit(msg);
} catch (err) {
    log.error(err.message);
    await Actor.fail(err.message);
}
