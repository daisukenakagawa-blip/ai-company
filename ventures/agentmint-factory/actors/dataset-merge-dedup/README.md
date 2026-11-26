# Dataset Merge & Dedup

Combine the results of several scraper runs into **one clean dataset**: merge any number of Apify datasets, remove duplicates by the fields you choose, filter rows, and reshape fields — in one run. Built for large datasets: it streams items page by page and, in the default mode, keeps only a short hash of each key in memory.

## For AI agents (machine-readable summary)

| Key | Value |
|---|---|
| Actor ID | `preponderant_swift/dataset-merge-dedup` |
| Purpose | Merge Apify datasets (or inline JSON items), remove duplicates by chosen fields, filter and reshape. Reads only the data you pass; never accesses websites |
| Input | `datasetIds` (string[]) and/or `items` (object[]); options below. Full JSON Schema (no token needed): `GET https://api.apify.com/v2/acts/preponderant_swift~dataset-merge-dedup/builds/default` → `data.inputSchema`. OpenAPI: `GET https://api.apify.com/v2/acts/preponderant_swift~dataset-merge-dedup/builds/default/openapi.json` |
| Output | Default dataset = the kept items (same fields as input after reshaping). Key-value record `OUTPUT` = run summary (counts) |
| Pricing (Pay per event) | `apify-default-dataset-item` **$0.0002 per output item** ($0.20 / 1,000). `apify-actor-start` **$0.00005** per run (per GB of memory, minimum 1). Platform usage is included (not charged separately). Removed duplicates and filtered rows are free |
| Cost before running | Upper bound = `0.00005 × max(1, memoryGB) + 0.0002 × (sum of itemCount of all input datasets + number of inline items)`. Get `itemCount` with `GET https://api.apify.com/v2/datasets/{datasetId}`. Actual cost is lower when duplicates or filtered rows are removed |
| Hard cost cap | Set `maxTotalChargeUsd` when starting the run (API option) — the Actor stops cleanly at the cap and reports `OUTPUT.stoppedAtChargeLimit: true`. Or set `maxItems` in the input |
| Typical latency | Seconds for thousands of items (streams 5,000 items per page) |
| Memory | 256 MB–4 GB. `keep: "first"` needs ~28 bytes per unique key; `last` / `mostComplete` hold one copy per unique item |
| Permissions | Limited permissions (reads only the datasets it is given) — usable from the Apify MCP server |
| Free trial run | Start with an empty input `{}`: runs on a built-in 6-item sample and writes 4 items |

### Call it from an MCP client

- Apify MCP server (`https://mcp.apify.com`): search for "dataset merge dedup", then `call-actor` with actor `preponderant_swift/dataset-merge-dedup`. `call-actor` returns the run status and storage IDs; read the items from the default dataset
- Expose only this Actor as a tool: `https://mcp.apify.com?tools=preponderant_swift/dataset-merge-dedup` (tool name `preponderant_swift--dataset-merge-dedup`)
- Authentication: OAuth, or header `Authorization: Bearer <APIFY_TOKEN>`

### Minimal calls

```json
{ "datasetIds": ["<id1>", "<id2>"], "dedupFields": ["url"] }
```

```json
{ "items": [{"url": "https://a.com/1?utm_source=x"}, {"url": "https://a.com/1"}], "dedupFields": ["url"], "ignoreUrlTracking": true }
```

### Errors (run status FAILED, message in the status message)

| Cause | Message (starts with) | Fix |
|---|---|---|
| `keep` is not first / last / mostComplete | `"keep" must be first, last or mostComplete.` | Use one of the three values |
| Filter without a field | `Filter needs a "field"` | Each filter needs `field` (string) |
| Unknown filter operator | `Unknown filter op` | Use eq, neq, contains, notContains, exists, notExists, gt, gte, lt, lte, regex |
| Invalid regular expression | `Invalid regular expression` | Fix the `value` of the regex filter |
| Dataset ID not found or not readable with your token | Apify API error (e.g. record not found) | Pass a dataset ID your token can read |

Not an error: reaching the spending cap (`stoppedAtChargeLimit: true`, status SUCCEEDED).

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

- Inline `items` are limited by Apify's maximum run input size; use datasets for large data
- Terms: you must have the right to process the data you pass. The Actor keeps no copy outside your own run storage (Apify's storage retention applies)

- Only reads datasets you give it; it does not access any website
- `regex` filters are case-insensitive
- Comparison normalization never changes the values written to the output
