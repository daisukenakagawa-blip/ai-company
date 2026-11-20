# genhayl-shop に置くファイル（工房のセッションから push できないため、ここに用意）

このフォルダの中身を、そのまま公開リポジトリ `daisukenakagawa-blip/genhayl-shop` の直下にコピーしてください。

- `index.html` … 商品一覧のトップ
- `tokushoho.html` … 特定商取引法に基づく表記（`ventures/_legal/tokushoho.html` と同じ。書き換えなし）
- `csv-seikei/index.html` … 商品ページ（購入ボタンは Payment Link 作成後に差し替え）
- `csv-seikei/tool.html` … 決済後の納品物（ツール本体）
- `jusho-bunkatsu/index.html` … 商品ページ（住所の列分割・500円。購入ボタンは Payment Link 作成後に差し替え）
- `jusho-bunkatsu/tool.html` と `split.js` … 決済後の納品物（ツール本体）
- `shimei-bunkatsu/index.html` と `tool.html`・`shimei.js` … 氏名の姓名分割・ふりがな統一（500円）
- `csv-sabun/index.html` と `tool.html`・`sabun.js` … 2つの CSV の差分比較（980円）
- `csv-ketsugo/index.html` と `tool.html`・`ketsugo.js` … 複数 CSV の結合（500円）
- `csv-bunkatsu/index.html` と `tool.html`・`bunkatsu.js` … 大きな CSV の分割（500円）
- `mojicode-henkan/index.html` と `tool.html`・`henkan.js` … 文字コード・改行コードの変換（500円）

## 消さないこと
- `index.html` の `<meta name="google-site-verification" ...>` は Google Search Console の所有権確認用（7日目にオーナーが登録）。トップを作り直すときも必ず残す
- `sitemap.xml` は商品を追加したら1行足す
