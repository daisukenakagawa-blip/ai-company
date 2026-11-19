# 7日目 CEO 会議メモ

## 状況
- inbox：新しいメモなし
- 事業はアイデア工房（6日目〜）。1件目「CSV 表記ゆれ整形」（980円）は完成・動作確認済み
- **販売が止まっている理由：置き場所（genhayl-shop）に push できない。** 今朝も確認したが、この定期実行は ai-company しか触れず、リポジトリを追加することもできなかった
- 調べたところ、**GitHub Pages は規約上、販売用の店に使えない可能性が高い**ことが分かった
- 旧承認 #11〜#13（競艇）はオーナー指示で却下済み。今の承認待ちは0件

## 決定
1. 置き場所を **Cloudflare Pages（無料）に変える案** をオーナーに出す。ai-company を接続し、`ventures/_shop` だけを公開する。規約の問題と push の問題が一度に解決する
2. 承認依頼はこの1件（#14）だけにする。手順書を5分で終わる形にした
3. 承認までの間に、販売開始の直前作業を済ませる（Stripe の確認、納品ページを検索に出さない設定）
4. 新しい商品づくりは2時間ごとの工房に任せ、朝の会議では重ねない

## 今日のタスク
| 担当 | タスク | 成果物 |
|---|---|---|
| researcher | 置き場所の規約確認（GitHub Pages / Cloudflare Pages） | `researcher/hosting_terms_check.md` |
| product | Cloudflare Pages 公開の手順書、納品ページに noindex を追加 | `product/cloudflare_pages_setup.md`、`ventures/*/csv-seikei/tool.html` |
| cfo | Stripe 販売準備の確認（読み取りのみ） | `cfo/stripe_readiness.md` |
| legal | #14 の審査 | 下記 |

## 法務審査
- #14 Cloudflare Pages での公開：ok。無料プランで費用0円。公開されるのは `ventures/_shop` だけ。特商法表記は Stripe 登録情報のまま同梱。商品は禁止事項に該当しない（`ventures/csv-seikei/STATUS.md`）
- 注意：納品ページ（tool.html）は URL を知っていれば誰でも開ける静的ページ。検索に出ない設定にしたが、完全には防げない。説明と違う売り方（「購入者限定」などの表現）はしない
