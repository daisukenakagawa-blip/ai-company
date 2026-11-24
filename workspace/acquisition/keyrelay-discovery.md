# KeyRelay：移行する人が実際に探す経路（2026-11-24 調査）

## 一次資料で確かめた事実（取得日 2026-11-24）
- LS 公式の移行ページ（https://docs.lemonsqueezy.com/migration）：11/16 新規登録停止、**12/2 移行ツール公開**、2027年1月中旬が移行開始の推奨期限、2027-03-31 取引停止
- LS 公式（https://docs.lemonsqueezy.com/migration/digital-fulfillment）："Managed Payments doesn't deliver files, download links, or license keys."。選択肢は自前で作るか "Use a third-party fulfillment provider"（**事業者名の記載なし**）。期限までに移行しないと "customers may lose access to their license keys"。**詳しい案内は 12/2 のツール公開に合わせて出す**と記載
- LS 公式比較表（https://docs.lemonsqueezy.com/migration/comparison）：ライセンスキーは Managed Payments では "Not included. Connect a fulfillment or licensing app, or build your own integration."
- License API の停止日は明記なし（店は 2027-03-31 まで通常どおり、と記載）
- パートナー一覧・掲載申請の窓口は見当たらない
- HN：反応は小さい（ledger.md 参照）。競合 LicenseSpring が移行者に返信済み
- GitHub コード検索：`api.lemonsqueezy.com/v1/licenses/validate` を含む公開コードは 525件ヒット、上位100件で82リポジトリ（**利用者数ではない**。公開・既定ブランチのみ）
- npm：LS ライセンス API の小さなクライアント（例 lemonsqueezy-license-manager）、競合 SDK（@licentric/sdk）あり

## 経路の評価（AI の判断）
| 経路 | 根拠 | 規約・方法 | 区分 | 判断 |
|---|---|---|---|---|
| Stripe App Marketplace の licensing app | LS 公式が「licensing app をつなげ」と案内。移行先 Managed Payments の利用者がそこで探す | Stripe Apps の開発・審査が必要。費用は未確認 | C | **最有力。実現性を次に調べる** |
| 12/2 の LS 公式の詳しい案内 | 公式が予告 | 読むだけ | A | 12/2 に読む。第三者の掲載方法が出るか確認 |
| KeyRelay サイトの移行ガイド（英語） | 公式に License API の扱いが書かれておらず、開発者が検索する疑問が具体的 | 自社サイトの更新 | B 相当（未承認のため C） | 文面を作って承認依頼 |
| 既存の OSS クライアントに「接続先 URL を変えられる」改善を提案 | 公開コードで LS ライセンス API を直接呼ぶものが多い | 頼まれていない宣伝の PR は不可。汎用の改善として役立つ場合のみ | C | 保留 |
| Show HN | 反応が小さい | | C | 保留（オーナー判断 11/24） |
| 公開リポジトリの作者への連絡 | | 無差別営業に当たる | ― | **しない** |
