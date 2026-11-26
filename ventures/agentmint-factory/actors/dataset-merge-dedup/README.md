# Dataset Merge & Dedup

Combine the results of several scraper runs into **one clean dataset**: merge any number of Apify datasets, remove duplicates by the fields you choose, filter rows, and reshape fields — in one run. Built for large datasets: it streams items page by page and, in the default mode, keeps only a short hash of each key in memory.

## What it does

- **Merge** any number of datasets, in the order you list them
- **Deduplicate** by one or more fields (`url`, or `name` + `address.city`, nested paths supported), or by the whole item
- **Smart matching**: optionally ignore case and extra spaces (`"ACME Inc "` = `"acme inc"`), and URL tracking noise (`utm_*`, `fbclid`, `gclid`, `#fragment`, trailing `/`, `www.`)
- **Choose which copy survives**: first seen, last seen, or the **most complete** copy (most non-empty fields)
- **Filter** rows with simple conditions: `eq`, `neq`, `contains`, `notContains`, `exists`, `notExists`, `gt`, `gte`, `lt`, `lte`, `regex`
- **Reshape**: keep only some fields, drop fields, rename fields, flatten nested objects for CSV/Excel
- **Run report**: the `OUTPUT` record in the key-value store tells you how many items were read, filtered out, removed as duplicates and written, per source dataset

Items without any value in the dedup fields are never treated as duplicates of each other — they are kept.

## Typical uses

- You ran the same scraper several times (or several scrapers) and need one list without repeats
- Daily runs: merge yesterday's and today's results and keep the **latest** version of each record
- Lead lists: keep only rows that have an email, drop internal fields, flatten for a spreadsheet

## Try it in 10 seconds

Click **Start** without choosing any dataset: the Actor runs on a built-in 6-item sample and shows how duplicates (same URL with a tracking parameter, `www.` or a trailing slash) are removed. It writes 4 items. Then pick your own datasets in **Datasets to merge**.

## Input example

```json
{
  "datasetIds": ["<dataset ID 1>", "<dataset ID 2>"],
  "dedupFields": ["url"],
  "ignoreUrlTracking": true,
  "keep": "mostComplete",
  "filters": [{ "field": "email", "op": "exists" }],
  "fieldsToOmit": ["debug"],
  "flattenNested": true
}
```

You can also send items directly with `"items": [...]` when calling the Actor through the API.

## Output

Items go to the run's default dataset (export as JSON, CSV, Excel, etc.). Summary in the key-value store record `OUTPUT`:

```json
{ "inputItems": 7, "filteredOut": 1, "duplicatesRemoved": 2, "itemsWithoutKey": 0, "outputItems": 4,
  "stoppedAtChargeLimit": false, "sources": [{ "datasetId": "...", "read": 3, "kept": 2 }] }
```

## Use through the API

```bash
curl -X POST "https://api.apify.com/v2/acts/<username>~dataset-merge-dedup/run-sync-get-dataset-items?token=<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"datasetIds":["<id1>","<id2>"],"dedupFields":["url"]}'
```

It also works as an **integration** after another Actor finishes: pass the finished run's `defaultDatasetId` in `datasetIds`.

## Pricing

Pay per event: you pay only for **items written to the output dataset** (plus Apify's small standard start fee). Removed duplicates and filtered-out rows are free. There is exactly one paid result event, so nothing is charged twice. The current price is shown on the Actor's page.

**Spending limit**: if you set a maximum cost per run, the Actor writes items until that limit is reached, then stops cleanly and says so in the status message and in `OUTPUT.stoppedAtChargeLimit`. Raise the limit to process the rest.

## Memory

- `keep: first` (default) keeps only a 28-byte hash per unique key — millions of items fit in 1 GB
- `keep: last` and `keep: mostComplete` must hold the winning copy of every unique item until the end; give the run more memory for very large datasets

## Limits and notes

- Only reads datasets you give it; it does not access any website
- `regex` filters are case-insensitive
- Comparison normalization never changes the values written to the output
