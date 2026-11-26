import { Actor, log } from 'apify';
import { dedupKey, completeness, passesFilters, validateFilters, reshape } from './lib.js';

const EVENT = 'result-item'; // pay-per-event: one charge per item written to the output dataset
const PAGE = 5000;

await Actor.init();
try {
    const input = (await Actor.getInput()) ?? {};
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

    const flush = async () => {
        if (!buffer.length) return;
        const res = await Actor.pushData(buffer, EVENT);
        // On pay-per-event runs the SDK only writes as many items as the user's budget allows.
        const written = Actor.getChargingManager().getPricingInfo().isPayPerEvent ? res.chargedCount : buffer.length;
        stats.outputItems += written;
        if (written < buffer.length || res.eventChargeLimitReached) { stats.stoppedAtChargeLimit = true; stop = true; }
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
    await Actor.setValue('OUTPUT', stats);
    log.info(`Done: ${stats.inputItems} read, ${stats.filteredOut} filtered out, ${stats.duplicatesRemoved} duplicates removed, ${stats.outputItems} written.`);
    if (stats.stoppedAtChargeLimit) log.warning('Stopped early: the maximum cost you set for this run was reached. Raise "Maximum cost per run" to process the rest.');
    await Actor.exit(`${stats.outputItems} items written, ${stats.duplicatesRemoved} duplicates removed.`);
} catch (err) {
    log.error(err.message);
    await Actor.fail(err.message);
}
