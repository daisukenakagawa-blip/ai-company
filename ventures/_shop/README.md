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
- `bangou-fukugen/index.html` と `tool.html`・`fukugen.js` … Excel で壊れた番号の検出と復元（500円）
- `tate-yoko/index.html` と `tool.html`・`tateyoko.js` … 縦持ち⇔横持ち変換（クロス表）（980円）
- `csv-tenken/index.html` と `tool.html`・`tenken.js` … 壊れた CSV の点検と修復（500円）
- `json-csv/index.html` と `tool.html`・`jsoncsv.js` … JSON ⇔ CSV 変換（500円）
- `retsu-soroe/index.html` と `tool.html`・`soroe.js` … 列そろえ（取込形式テンプレート）（980円）
- `renban-check/index.html` と `tool.html`・`renban.js` … 番号の抜け・重複チェック（500円）
- `atena-hagaki/index.html`・`demo.html`（お試し）・`tool.html`・`atena.js`・`app.js`・`vendor/` … はがきの宛名印刷（980円）
- `atena-label/index.html`・`demo.html`（お試し）・`tool.html`・`atena.js`・`label.js`・`app.js`・`vendor/` … 宛名ラベルの面付け印刷（500円）
- `eigyoubi/index.html` と `tool.html`・`eigyo.js` … 営業日の計算（500円）
- `renrakusaki/index.html` と `tool.html`・`vcard.js` … 連絡先ファイル（.vcf）⇔ CSV 変換（500円）
- `eigyo-calendar/index.html` と `tool.html`・`calendar.js`・`eigyo.js`・`cal.css` … 年間営業カレンダーの作成・印刷（500円）
- `tanaoroshi/index.html`・`demo.html`（お試し）・`tool.html`・`sheet.js`・`app.js`・`vendor/` … 棚卸の記入用シート印刷（500円）
- `nafuda/index.html`・`demo.html`（お試し）・`tool.html`・`nafuda.js`・`app.js`・`vendor/` … 名札・席札の一括印刷（500円）
- `fuutou-atena/index.html`・`demo.html`（お試し）・`tool.html`・`fuutou.js`・`app.js`・`vendor/` … 封筒の宛名印刷（500円）
- `soufujou/index.html`・`demo.html`（お試し）・`tool.html`・`soufu.js`・`app.js`・`vendor/` … 送付状の一括作成（500円）

## 消さないこと
- `index.html` の `<meta name="google-site-verification" ...>` は Google Search Console の所有権確認用（7日目にオーナーが登録）。トップを作り直すときも必ず残す
- `sitemap.xml` は商品を追加したら1行足す
- `touban/index.html`・`demo.html`（お試し）・`tool.html`・`touban.js`・`eigyo.js`・`app.js` … 当番表の自動作成（500円）
- `jikan-goukei/index.html`・`demo.html`（お試し）・`tool.html`・`jikan.js`・`app.js`・`vendor/` … 作業時間の集計（500円）
- `yoyaku-kasanari/index.html`・`demo.html`（お試し）・`tool.html`・`yoyaku.js`・`app.js`・`vendor/` … 予約の重なりチェック（500円）
- `code-kensa/index.html`・`demo.html`（お試し）・`tool.html`・`code.js`・`app.js`・`vendor/` … 商品コードの検査（JAN・ISBN・ITF・UPC）（500円）
- `fukusu-sentaku/index.html`・`demo.html`（お試し）・`tool.html`・`sentaku.js`・`app.js`・`vendor/` … 複数選択の回答の分割と集計（500円）
- `mail-tenken/index.html`・`demo.html`（お試し）・`tool.html`・`mail.js`・`app.js`・`vendor/` … メールアドレス一覧の点検（500円）
- `dankai-hyouka/index.html`・`demo.html`（お試し）・`tool.html`・`dankai.js`・`app.js`・`vendor/` … 段階評価のアンケート集計（500円）
- `han-wake/index.html`・`demo.html`（お試し）・`tool.html`・`hanwake.js`・`app.js`・`vendor/` … 班分け・グループ分け（500円）
- `mendan-wariate/index.html`・`demo.html`（お試し）・`tool.html`・`mendan.js`・`app.js`・`vendor/` … 面談の日程の割り当て（500円）
- `zaseki-hyou/index.html`・`demo.html`（お試し）・`tool.html`・`zaseki.js`・`app.js`・`vendor/` … 座席表の作成（500円）
- `hacchu-sho/index.html`・`demo.html`（お試し）・`tool.html`・`hacchu.js`・`app.js`・`vendor/` … 発注点チェックと発注書（500円）
- `kigen-ichiran/index.html`・`demo.html`（お試し）・`tool.html`・`kigen.js`・`app.js`・`vendor/` … 期限の一覧（500円）
- `nyuka-kenpin/index.html`・`demo.html`（お試し）・`tool.html`・`kenpin.js`・`app.js`・`vendor/` … 入荷の検品の照合（500円）
- `buhin-keisan/index.html`・`demo.html`（お試し）・`tool.html`・`buhin.js`・`app.js`・`vendor/` … 部品表の必要数と作れる数（500円）
- `pikkingu/index.html`・`demo.html`（お試し）・`tool.html`・`pikking.js`・`app.js`・`vendor/` … ピッキングリストと仕分け表（500円）
- `kakaku-kaitei/index.html`・`demo.html`（お試し）・`tool.html`・`kaitei.js`・`app.js`・`vendor/` … 価格改定の一括計算（500円）
- `juchu-jikan/index.html`・`demo.html`（お試し）・`tool.html`・`juchu.js`・`app.js`・`vendor/` … 受注の曜日・時間帯の集計（500円）
- `irisu-kansan/index.html`・`demo.html`（お試し）・`tool.html`・`irisu.js`・`app.js`・`vendor/` … ケース・バラの数の換算（500円）
- `jikantai-ninzu/index.html`・`demo.html`（お試し）・`tool.html`・`ninzu.js`・`app.js`・`vendor/` … 時間帯ごとの人数と不足チェック（500円）
