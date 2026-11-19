# 置き場所の規約確認（7日目・researcher）

調査日：2026-11-19

## 結論
- **GitHub Pages は、有料販売の店には使えない可能性が高い。** 規約で「オンラインビジネスや、主に商取引のためのサイト、商用SaaS を動かす無料ホスティングとしての利用」が禁止されている。genhayl-shop は購入ボタン付きの商品一覧なので、これに当たるおそれがある
- **Cloudflare Pages の無料プランには、商用利用を禁じる記載は見当たらない**（上限ページの範囲。利用規約の全文は未確認）。上限は今の規模なら十分
- 推奨：販売用の置き場所を Cloudflare Pages に変える（オーナー承認が必要。#14）

## GitHub Pages（出典：GitHub Docs「GitHub Pages limits」）
規約の原文（抜粋）：
> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business,"
> "or any other website that is primarily directed at either facilitating commercial transactions"
> "providing commercial software as a service (SaaS)."

あわせて「パスワードやカード番号を送るような取引には使わない」とも書かれている（決済は Stripe 側の画面なので、この点は問題なし）。

## Cloudflare Pages 無料プラン（出典：Cloudflare Docs「Pages limits」、2026-11-18 更新）
- ビルド：月500回、同時1件、1回20分まで
- ファイル数：1サイト2万件まで、1ファイル25MiBまで
- プロジェクト：1アカウント100件まで
- 上限ページに商用利用の制限は書かれていない。費用は0円

## 補足：Cloudflare Pages ならデプロイの壁も同時に消える
Cloudflare Pages は非公開リポジトリにも接続でき、「出力ディレクトリ」に指定したフォルダだけを公開する。
ai-company リポジトリをつなぎ、出力を `ventures/_shop` にすれば、工房が ai-company に push するだけで自動で公開される（genhayl-shop への push 権限が要らない）。公開されるのは `ventures/_shop` の中身だけで、会社の記録は公開されない。

## 出典
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://developers.cloudflare.com/pages/platform/limits
