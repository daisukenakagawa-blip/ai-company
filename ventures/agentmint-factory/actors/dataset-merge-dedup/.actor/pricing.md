# 料金の設定（Console の Publication → Monetization で設定する。コードでは設定できない）

- 方式：Pay per event
- イベント：`result-item`（題名 "Result item"、説明 "Charged for each item written to the output dataset. Removed duplicates and filtered-out rows are free."）
  - 価格案：$0.0002 / 件（= $0.20 / 1,000件）。競合の有料版は $0.00025〜$0.002 / 件（2026-11-26、Store API）。無料の lukaskrivka/dedup-datasets-limited-permissions は直近30日の失敗率 63.8%
- **`apify-default-dataset-item` は削除する**（既定で有効。残すと二重請求になる）
- `apify-actor-start` は既定のまま（$0.00005 / GB、Apify が最初の5秒の計算費を負担）
- 「Pay per event + usage」は使わない
- 注意（公式文書）：無料プランの利用者の支払いは収益に数えられない。利益 = 0.8 × 売上 − 計算費
