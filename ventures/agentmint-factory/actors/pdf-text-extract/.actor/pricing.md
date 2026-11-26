# 料金の設定案（Console の Publication → Monetization。公開と同じくオーナーの判断）
- 方式：Pay per event／イベント `pdf-processed`（文字を取り出せた PDF 1件ごと。文字の無い PDF・失敗は無料）
- 価格案：$0.002 / 件。競合 memo23/pdf-text-extractor $0.005（30日177人）、automation-lab/pdf-text-extractor $0.00345（128人）（2026-11-26、Store API）
- `apify-default-dataset-item` は削除する（失敗・文字なしの行に課金されてしまう）
- 計算費は非公開の試験で実測してから価格を確定する
