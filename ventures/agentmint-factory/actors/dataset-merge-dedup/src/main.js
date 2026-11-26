import { Actor, log } from 'apify';
import { dedupKey, completeness, passesFilters, validateFilters, reshape } from './lib.js';

// Pricing: the ONLY paid event is Apify's synthetic `apify-default-dataset-item` (one charge per item written to the
// default dataset, charged by the platform). No custom event is charged from code, so there is no double charging.
const ITEM_EVENT = 'apify-default-dataset-item';
// Used when the Actor is started with no datasets and no items (e.g. Apify's daily automated test, or a first try
// in Console): a tiny built-in sample shows what the Actor does. It writes 4 items.
const SAMPLE = [
    { url: 'https://example.com/product/1?utm_source=newsletter', name: 'Blue Mug', price: 12 },
    { url: 'https://example.com/product/2', name: 'Red Mug', price: 14 },
    { url: 'https://www.example.com/product/1/', name: 'Blue Mug (duplicate)', price: 12, email: 'shop@example.com' },
    { url: 'https://example.com/product/3', name: 'Green Mug', price: 11 },
    { url: 'https://example.com/product/2#reviews', name: 'Red Mug (duplicate)', price: 14 },
    { url: 'https://example.com/product/4', name: 'Black Mug', price: 15 },
];
const PAGE = 5000;

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
    const sampleMode = !(input.datasetIds || []).length && !(input.items || []).length;
    if (sampleMode) {
        log.warning('No datasets or items were given, so the Actor runs on a built-in 6-item sample (writes 4 items). Pick your datasets in "Datasets to merge" to process your own data.');
        Object.assign(input, { items: SAMPLE, dedupFields: input.dedupFields?.length ? input.dedupFields : ['url'], ignoreUrlTracking: true });
    }
    const {
        datasetIds = [],
        items: inlineItems = [],
        dedupFields = [],
        keep = 'first',
        normalizeKeys = true,
        ignoreUrlTracking = false,
        filters = [],
        fieldsToKeep = [],
        fieldsToOmit = [],
        renameFields = {},
        flattenNested = false,
        addSourceField = false,
        maxItems = 0,
    } = input;

    if (!datasetIds.length && !inlineItems.length) throw new Error('Provide at least one dataset in "datasetIds" (or items in "items").');
    if (!['first', 'last', 'mostComplete'].includes(keep)) throw new Error('"keep" must be first, last or mostComplete.');
    validateFilters(filters);
    const norm = { trim: normalizeKeys, lowercase: normalizeKeys, collapseWhitespace: normalizeKeys, stripUrlNoise: ignoreUrlTracking };
    const shape = { fieldsToKeep, fieldsToOmit, renameFields, flattenNested };

    const stats = { inputItems: 0, filteredOut: 0, duplicatesRemoved: 0, itemsWithoutKey: 0, outputItems: 0, stoppedAtChargeLimit: false, sources: [] };
    const seen = new Set();          // keep=first: hashes only (low memory)
    const held = new Map();          // keep=last|mostComplete: key -> {item, score}
    let buffer = [];
    let stop = false;

    const cm = Actor.getChargingManager();
    const flush = async () => {
        if (!buffer.length) return;
        // Respect the user's "maximum cost per run": write only as many items as can be paid for, then stop cleanly.
        let batch = buffer;
        if (cm.getPricingInfo().isPayPerEvent) {
            const allowed = cm.calculateMaxEventChargeCountWithinLimit(ITEM_EVENT);
            if (allowed < batch.length) { batch = batch.slice(0, Math.max(0, allowed)); stats.stoppedAtChargeLimit = true; stop = true; }
        }
        if (batch.length) await Actor.pushData(batch);
        stats.outputItems += batch.length;
        buffer = [];
    };
    const emit = async (item) => {
        if (maxItems && stats.outputItems + buffer.length >= maxItems) { stop = true; return; }
        buffer.push(item);
        if (buffer.length >= 1000) await flush();
    };

    async function* sources() {
        if (inlineItems.length) yield { id: 'inline', items: inlineItems };
        for (const id of datasetIds) {
            const ds = await Actor.openDataset(id, { forceCloud: Actor.isAtHome() });
            const info = await ds.getInfo();
            log.info(`Reading dataset ${id} (${info?.itemCount ?? '?'} items)`);
            for (let offset = 0; ; offset += PAGE) {
                const { items } = await ds.getData({ offset, limit: PAGE });
                if (!items.length) break;
                yield { id, items };
                if (items.length < PAGE) break;
            }
        }
    }

    const perSource = {};
    let order = 0;
    for await (const { id, items } of sources()) {
        perSource[id] ??= { datasetId: id, read: 0, kept: 0 };
        for (const raw of items) {
            if (stop) break;
            stats.inputItems++; perSource[id].read++;
            if (!passesFilters(raw, filters)) { stats.filteredOut++; continue; }
            const key = dedupKey(raw, dedupFields, norm);
            let item = reshape(raw, shape);
            if (addSourceField) item = { ...item, _sourceDatasetId: id };
            if (key === null) { stats.itemsWithoutKey++; perSource[id].kept++; await emit(item); continue; }
            if (keep === 'first') {
                if (seen.has(key)) { stats.duplicatesRemoved++; continue; }
                seen.add(key); perSource[id].kept++; await emit(item);
            } else {
                const score = keep === 'mostComplete' ? completeness(raw) : 0;
                const prev = held.get(key);
                if (prev) {
                    stats.duplicatesRemoved++;
                    if (keep === 'last' || score > prev.score) held.set(key, { item, score, order: prev.order, src: id });
                } else held.set(key, { item, score, order: order++, src: id });
            }
        }
        if (stop) break;
    }
    if (keep !== 'first' && !stop) {
        for (const v of [...held.values()].sort((a, b) => a.order - b.order)) {
            if (stop) break;
            perSource[v.src].kept++;
            await emit(v.item);
        }
    }
    await flush();
    stats.sources = Object.values(perSource);
    stats.sampleMode = sampleMode;
    await Actor.setValue('OUTPUT', stats);
    log.info(`Done: ${stats.inputItems} read, ${stats.filteredOut} filtered out, ${stats.duplicatesRemoved} duplicates removed, ${stats.outputItems} written.`);
    if (stats.stoppedAtChargeLimit) log.warning('Stopped early: the maximum cost you set for this run was reached. Raise "Maximum cost per run" to process the rest.');
    await Actor.exit(`${stats.outputItems} items written, ${stats.duplicatesRemoved} duplicates removed.`);
} catch (err) {
    log.error(err.message);
    await Actor.fail(err.message);
}
