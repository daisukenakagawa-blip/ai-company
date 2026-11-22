# 周知（10日目・marketing）

## 店内ガイド5本目（公開）
- 「年賀状の宛名印刷の前に、Excel の住所録を整える方法（郵便番号・建物名・出さない人）」
- https://genhayl-shop.pages.dev/guide/excel-jushoroku-atena-junbi.html
- note の投稿待ち記事（001 宛名印刷の方法）と重ならないよう、**住所録の中身を直す式**に絞った（note は印刷方法の比較と縦書きのきまり）
- 確認したこと
  - 郵便番号の式（ASC・SUBSTITUTE・TEXT）を、1050023／105-0023／〒105-0023／全角／600001（0落ち）／060-0001／空白入り／12345／長音入り／空欄の10通りで計算し、結果が記事のとおりになることを確認（LibreOffice で計算）
  - 住所と建物名を分ける式を、半角空白・全角空白・空白なし・空白2つの4通りで確認
  - Word の「はがき宛名面印刷ウィザード」の手順は、窓の杜（Office 2021）と FMV サポート Q&A の記載のとおりに書き、版で画面が違うことを明記。Mac 版 Word の有無は確認できなかったので書いていない
  - 道具の紹介は最後に1回。「出す」の列で × ／喪中の行を印刷しない機能は atena.js で確認
  - PC・スマホ幅（390px）で横スクロールなし、ページのエラーなし
- sitemap.xml とガイド一覧に追加済み

## X
- 11/25（水）12:00 に上のガイドの紹介を予約（Typefully draft 12116552、made_with_ai）
- 予約中：11/23 12:00（CSV 文字化け）、11/24 12:00（新旧の表の比較）、11/25 12:00（住所録の整え方）
- 今月の無料枠：残り10件 → 予約3件の投稿後は7件

## note
- 今朝は実行できず（前提の設定がまだ）：環境変数 NOTE_EMAIL／NOTE_PASSWORD が未設定、note.com への接続も拒否（HTTP 000）。再試行はしていない

出典
- 窓の杜「Word で年賀状の宛名を印刷」：https://forest.watch.impress.co.jp/docs/serial/offitech/1375884.html
- FMV サポート Q&A：https://www.fmworld.net/cs/azbyclub/qanavi/jsp/qacontents.jsp?PID=5610-1486
- All About：https://allabout.co.jp/gm/gc/297900/2/
