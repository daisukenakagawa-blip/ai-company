# KeyRelay（試作・未公開）

Lemon Squeezy License API と同じ形で動くライセンスキーのサーバー。Cloudflare Workers + D1。
LS は 2027-03-31 に決済を止める。移行先の Stripe Managed Payments はライセンスキーを発行しない。

- アプリ側は接続先を `https://api.lemonsqueezy.com/v1/licenses/` → `https://<host>/<tenant>/v1/licenses/` に変えるだけ
- 既存のキーと有効化済みの端末 ID を、販売者の LS API キーで取り込む（`POST /<tenant>/admin/import/lemonsqueezy`）
- 新しい販売は、販売者自身の Stripe の `checkout.session.completed` Webhook でキーを発行（`/<tenant>/webhooks/stripe`）。購入後は `/<tenant>/claim?session_id={CHECKOUT_SESSION_ID}` でキーを表示
- お金には触れない（販売者自身の Stripe に入る）

## 手元での確認
```
wrangler d1 execute keyrelay --local --file schema.sql
wrangler dev --local
node test/import.test.mjs
```
