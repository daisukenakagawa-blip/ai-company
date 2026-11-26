# 14日目 保守：店の計測から脆弱性探しを除く（2026-11-27）

- 問題：11/26 の閲覧11件のうち7件が /.git/・/admin/backup/・/v1/kv/・/v2/keys/・/_profiler/・/wp-content/uploads/・/config/ など店に無いパスへのアクセス（国 NL）。末尾が「/」なので閲覧として数えていた
- 修正：`lib/shop_metrics.js` の `pagePath` で、トップ・`/tokushoho.html`・`/guide/…`・商品（`lib/shop_links.json` にある slug）以外は数えない
- 試験：`node test/shop_metrics.test.mjs` 29 PASS（2項目追加：脆弱性探しは数えない／ガイドと特商法表記は数える）、`node test/shop_gate.test.mjs` 32 PASS
- 影響：鍵（製品版の閲覧制限）は変わらない。過去の記録は書き換えない（日報で除外して読む）
- 本番の反映：push 後の Cloudflare Pages の自動デプロイ。本番での動作は明日の計測で確認（未確認）

## 追記：#17 完了（2026-11-27 8:14 JST、オーナー）
- Dataset Merge & Dedup を Apify Store に公開：https://apify.com/preponderant_swift/dataset-merge-dedup
- 料金：Pay per event。Result item（apify-default-dataset-item）$0.20／1,000件、Actor start $0.00005、Pay per event + usage はオフ、独自イベントなし、Primary event＝Result item
- 公開プロフィール：表示名 GENHAYL SHOP。受け取り：PayPal。本人確認：提出済み・審査中（最大5営業日。確認までの収益は繰り越し）
- 次：外部の利用者・実行を毎日記録（data/DASHBOARD.md）。売上・有料利用者は Console の Analytics の書き出しが無ければ「未確認」
