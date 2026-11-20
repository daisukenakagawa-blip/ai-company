# 集客経路の調査（8日目・researcher）

調査日：2026-11-21

## いまの状況（事実）
- 店（https://genhayl-shop.pages.dev/）は14商品を販売中。Search Console 登録とサイトマップ送信は 11/20（オーナー作業）
- Web 検索で `site:genhayl-shop.pages.dev` を調べたが、店のページはまだ1件も出てこない（サイトマップ送信から約1日）
- Stripe の本番アカウントで、店の Payment Link 経由の決済画面は **まだ1回も開かれていない**（cfo 確認）
  → 問題は「買われない」ではなく「見つかっていない」

## 検索からの流入について
- Google は、クロールとインデックス登録に数日〜数週間かかることがあり、時期は保証されないと説明している
  - 出典：Google 検索のクロールとインデックス登録に関するよくある質問 https://developers.google.com/search/help/crawling-index-faq?hl=ja
  - 出典：ウェブサイトを Google に表示させる https://developers.google.com/search/docs/basics/get-on-google?hl=JA
  - 出典：サイトマップ レポート https://support.google.com/webmasters/answer/7451001?hl=ja
- 他のサイトからリンクされると、Google がページを見つけやすくなる（同上の「Google に表示させる」）
- 「CSV Shift_JIS 変換 無料」などで検索すると、無料の変換ページや解説記事（Qiita、クラスメソッドなど）が上位に並ぶ
  - 例：https://www.luft.co.jp/cgi/character-code.php 、https://qiita.com/sakutto-panda/items/ea2796d02f3061a918b6 、https://dev.classmethod.jp/articles/javascript-create-shiftjis-csv/
  - → 単純な文字コード変換は無料の競合が多い。有料で選ばれる理由は「日本の事務データ向けの細かい処理」と「ファイルを送らない（ブラウザ内で完結）」の2点に絞って伝える
- 名簿の重複・表記ゆれは、Excel の「重複の削除」の解説記事が多い（完全一致のみ）。ココナラには人が手作業で行う有料サービスもある
  - 例：https://atmarkit.itmedia.co.jp/ait/articles/1808/06/news020.html 、https://business.ntt-east.co.jp/column/bizdrive/excel-remove-duplicates.html 、https://coconala.com/services/4333821
  - → 「Excel の重複の削除では見つからない重複」は、有料ツールの説明として筋がよい

## 元手0円で使える経路（候補）
| 経路 | 費用 | 見込み | オーナー作業 | 判断 |
|---|---|---|---|---|
| Google 検索（待つ＋各ページの説明を充実） | 0円 | 数週間後から | なし | 続ける。今日、説明文（meta description）が無い7ページに追加済み |
| note に「困りごとの解決法」記事を書き、最後に道具を紹介 | 0円 | 投稿直後から少し。外部リンクにもなる | 投稿（約5分） | **今日の承認依頼 #15** |
| X などの SNS | 0円 | フォロワー0からでは小さい | アカウント運用 | 今は見送り |
| ココナラに出品 | 出品は無料、販売時に手数料 | 人の作業サービスの市場。外部の決済へ誘導する形は避けるべき | 出品・対応 | 見送り（自動納品の方針と合わない） |
| 広告 | 有料 | — | — | 禁止（元手0円） |

## note の規約について（未確認点）
- note のヘルプセンター（https://www.help-note.com/hc/ja/articles/4409942508697 ほか）にガイドラインがあるが、本文を読み切れていない。
  **「自社の道具の紹介リンクを記事に入れてよいか」は、投稿前にオーナーが確認すること**を承認依頼の条件にする
