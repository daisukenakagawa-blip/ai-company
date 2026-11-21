# 周知（9日目・marketing）

## 使い方ガイド（1日1本）
- 追加：「Excel で新旧2つの表を比べて『増えた行・なくなった行・変わった値』を見つける方法」
  - https://genhayl-shop.pages.dev/guide/excel-hyou-hikaku.html （ガイド一覧・sitemap.xml に追加）
  - 元：`ventures/_guide_src/build.py`
- 式の確認：同じ表を作って LibreOffice で計算し、期待どおりか確かめた
  - COUNTIF で「追加」「削除」→ OK
  - VLOOKUP で「変更」→ OK。複数列まとめての SUMPRODUCT＋INDEX/MATCH → OK
  - 落とし穴：空欄→0 は `VLOOKUP(...)=D2` だと見落とし、`&""` を付けると「変更」になる → 確認済み
  - 落とし穴：数値 123 と文字 "0123" は COUNTIF で一致しない → 確認済み
  - 大文字小文字を「=」が区別しない点は Excel の仕様（LibreOffice では未確認のため、記事では EXACT を案内するのみ）
- 紹介した道具：2つの CSV の差分比較（980円）。書いた機能は商品ページの記載どおり
- スマホ幅（390px）で横スクロールなし、ページのエラーなし

## X（Typefully、@wl53o6）
- 11/24（火）12:00 にガイド紹介を予約（draft 12094558、made_with_ai 付き）。記録：`ventures/_marketing/x_posts.md`
- 無料枠：今月の残り10件（予約中2件が投稿されると残り8件）
- 11/23 12:00 の初投稿（文字化けガイド）は予約のまま
