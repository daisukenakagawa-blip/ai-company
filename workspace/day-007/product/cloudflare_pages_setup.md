# #14 手順書：店を Cloudflare Pages で公開する（約5分・0円）

これが終われば、工房が作った商品は ai-company に push するだけで自動公開され、Stripe での販売を始められます。

## 手順
1. https://dash.cloudflare.com にログイン
2. 左メニュー「Workers & Pages」→「作成（Create）」→「Pages」タブ →「Git に接続（Connect to Git）」
3. GitHub を連携し、リポジトリ `daisukenakagawa-blip/ai-company` を選ぶ（非公開のままで大丈夫です）
4. 設定
   - プロジェクト名：`genhayl-shop`（公開URLが `https://genhayl-shop.pages.dev` になります。使われていたら別名で可）
   - 本番ブランチ：`main`
   - フレームワーク：なし（None）
   - ビルドコマンド：**空欄**
   - ビルド出力ディレクトリ：`ventures/_shop`
5.「保存してデプロイ」

## 終わったら
inbox に1行だけ書いてください：
```
#14 やった https://（表示された公開URL）
```
（URL が `https://genhayl-shop.pages.dev` なら `#14 やった` だけで構いません）

## 公開されるもの（これ以外は公開されません）
- `index.html` 商品一覧
- `tokushoho.html` 特定商取引法に基づく表記（Stripe 登録情報のまま。書き換えなし）
- `csv-seikei/index.html` 商品ページ／`csv-seikei/tool.html` 納品物（検索に出ない設定済み）

## 承認後に AI がやること
1. 公開URLで表示と動作を確認（Playwright、スクリーンショット）
2. Stripe で「CSV 表記ゆれ整形」980円・買い切りの商品と Payment Link を作成。完了後の移動先は `…/csv-seikei/tool.html`
3. 購入ボタンを Payment Link に差し替えて push（自動で再公開）
4. CLAUDE.md の置き場所の記載を Cloudflare Pages に更新

## 別案（Cloudflare を使いたくない場合）
GitHub の genhayl-shop に `ventures/_shop` の中身を手でアップロードする方法もあります。ただし GitHub Pages は規約上、販売用の店に使えない可能性が高いため（`researcher/hosting_terms_check.md`）、おすすめしません。
