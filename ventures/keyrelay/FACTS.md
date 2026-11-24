# KeyRelay の前提となる事実（一次資料で確認したもの）

確認日 2026-11-24。一次資料＝当事者の公式ページ。

| 事実 | 出典（一次資料） | 状態 |
|---|---|---|
| LS は 2026-11-16 に新規の店舗登録を停止 | https://www.lemonsqueezy.com/blog/saying-goodbye-to-lemon-squeezy | 確認済み |
| LS は 2027-03-31 に決済（定期課金の更新を含む）を止める。延長しない | 同上、https://docs.lemonsqueezy.com/migration | 確認済み |
| 移行先の推奨は Stripe Managed Payments。移行ツールは 12月2日に提供予定 | 同上 | 確認済み |
| Managed Payments はライセンスキーを発行しない（"Not included. Connect a fulfillment or licensing app, or build your own integration."） | https://docs.lemonsqueezy.com/migration/comparison | 確認済み |
| LS の License API 単体の停止日 | LS の License API のページには個別の日付なし。サイト全体の告知は 2027-03-31 にサービス終了 | **未確認**（API 単体の日付は明記なし） |
| LS の License API の仕様（activate/validate/deactivate、フォーム形式、毎分60回） | https://docs.lemonsqueezy.com/api/license-api | 確認済み |
| LS 本体 API の license-keys / license-key-instances の項目 | https://docs.lemonsqueezy.com/api/license-keys/the-license-key-object ほか | 確認済み |
| 影響を受ける販売者の数 | LS は公表していない | **未確認** |
| 公開コードで LS の License API を呼ぶファイル数（validate 525、activate 268、2026-11-24） | GitHub コード検索 | 参考値。**利用者数・購入者数ではない** |
| 競合：Keygen（無料は100ユーザーまで、上は有料） | https://keygen.sh/pricing | 調査担当が読んだ値。自分で再確認していない |
| 競合：Polar（決済代行＋ライセンスキー） | https://polar.sh/docs | 調査担当が読んだ値。自分で再確認していない |
| 競合：Paddle はキーを発行しない（"generate keys in your own app"） | https://developer.paddle.com/migrate/other-platforms/lemon-squeezy.md | 調査担当が読んだ値。自分で再確認していない |

## 競合（2026-11-25 確認）
- Clavem（https://clavem.io/）：Stripe App で Stripe と接続、Managed Payments 対応を明記。LS License API を使うアプリは「ホスト名を api.clavem.io に変えるだけ」。LS キーを端末の起動記録・元の注文 ID ごと取り込み（1万件まで無料）。無料枠（有効ライセンス100件）、年290〜1,990ドル、従量 0.30ドル/件。**KeyRelay と同じ価値提案の直接競合**
- Dodo（https://docs.dodopayments.com/migrate-to-dodo）：LS キーの取り込みあり（起動記録は移らない）
- Creem：LS キーは "Doesn't move yet"（https://docs.creem.io/getting-started/migrate）
- Paddle：キーは利用者が作り直す（https://developer.paddle.com/migrate/other-platforms/lemon-squeezy.md）
- Stripe App Marketplace：公開は1アカウント1アプリ、審査4営業日、英語のみ、課金は開発者が自分で請求（https://docs.stripe.com/stripe-apps/publish-app）
