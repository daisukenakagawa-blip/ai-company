# 料金の設定案（Console の Publication → Monetization。公開と同じくオーナーの判断）

- 方式：Pay per event
- イベント：`image-processed`（"Image processed"：変換に成功した画像1枚ごと。失敗は無料）
  - 価格案：$0.001 / 枚（= $1 / 1,000枚）。競合 marielise.dev/image-converter は $0.002 / 件・直近30日の失敗率 13.4%（2026-11-26、Store API）
- **`apify-default-dataset-item` は削除する**（失敗の行にも課金されてしまう）
- 原価の目安（未実測）：512MB で1枚 0.5〜2秒 → 計算費は1,000枚で数セント程度の見込み。公開前に非公開の試験で実測する
