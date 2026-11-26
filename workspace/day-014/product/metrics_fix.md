# 14日目 保守：店の計測から脆弱性探しを除く（2026-11-27）

- 問題：11/26 の閲覧11件のうち7件が /.git/・/admin/backup/・/v1/kv/・/v2/keys/・/_profiler/・/wp-content/uploads/・/config/ など店に無いパスへのアクセス（国 NL）。末尾が「/」なので閲覧として数えていた
- 修正：`lib/shop_metrics.js` の `pagePath` で、トップ・`/tokushoho.html`・`/guide/…`・商品（`lib/shop_links.json` にある slug）以外は数えない
- 試験：`node test/shop_metrics.test.mjs` 29 PASS（2項目追加：脆弱性探しは数えない／ガイドと特商法表記は数える）、`node test/shop_gate.test.mjs` 32 PASS
- 影響：鍵（製品版の閲覧制限）は変わらない。過去の記録は書き換えない（日報で除外して読む）
- 本番の反映：push 後の Cloudflare Pages の自動デプロイ。本番での動作は明日の計測で確認（未確認）
