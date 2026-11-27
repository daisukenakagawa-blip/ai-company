# 実証A：Apify Discord への紹介投稿（2026-11-28 オーナー承認。投稿はオーナーのアカウント）

## 投稿の前に（オーナー、約5分）
1. Apify Discord（https://discord.gg/crawlee-apify-801163717915574323 ）の **#🚀actor-promotion** を開き、ピン留めのルールを読む（頻度・形式の決まりがあれば、それに合わせて下の文を直すか、私に伝えてください）
2. 下の文を読み、内容が正しいか・自分の言葉として出せるかを確かめる（Apify の行動規範：「AI の出力をそのまま投稿しない、投稿前に読んで直す、自分の言葉で」）
3. 投稿は **1回だけ**。他の人のスレッドには貼らない。同じ文を別のチャンネルに出さない
4. 投稿したら、私に「投稿した」と伝える（日時を記録し、Apify の公開統計で外部の利用者を毎朝数えます）

## 投稿文（英語、約120語）

> **Merge Datasets & Remove Duplicates** — combine several Apify datasets and CSV/JSON files into one clean dataset
>
> It is for a common problem when merging several scraper runs: near-duplicates that differ only by URL tracking parameters, letter case or spacing.
>
> - Dedupe by any fields you choose; optionally ignore case, extra spaces and URL tracking params (utm_*, fbclid…)
> - Keep the first, last or most complete copy
> - Inputs: Apify dataset IDs, CSV/TSV/JSON/JSONL file URLs, or inline items
> - Pay per output item ($0.20 / 1,000) — removed duplicates and filtered rows are free
> - Limited permissions, so it also works from the Apify MCP server
>
> Run it with an empty input `{}` to try a built-in 6-item sample.
> https://apify.com/preponderant_swift/dataset-merge-dedup
>
> Feedback on missing options is very welcome.

## 確認済みの事実（文の根拠）
- 機能・価格・入力・限定権限・お試しの `{}`：README と公開の料金設定（Apify の公開 API で 2026-11-28 に確認）
- 体験談・実績・利用者数は書いていない（「It is for a common problem…」は用途の説明）。オーナーが自分の言葉に直してよい

## 測るもの（14日間：投稿日〜+14日）
- 成功：自社以外の利用者1人以上（`/v2/acts/preponderant_swift~dataset-merge-dedup` の stats。自社の試験は除く）
- 追加で見るもの：Store 検索に戻るか（`/v2/store?search=dataset-merge-dedup`）
- 撤退：14日で外部の利用者0人 → この経路の結果として記録し、同じ投稿は繰り返さない

## Insights タブ（オーナー、約3分）
- Apify Console → この Actor → **Insights** タブの推奨の一覧を、スクリーンショットか文字で送ってください。題名・説明・README の範囲（11/28 承認済み）なら私が直します。それ以外（分類・料金など）は改めて確認します

## 実施記録
- **2026-11-28 7:47 JST オーナーが投稿**（Discord「dadayop」、#🚀actor-promotion、上の文のまま。ピン留めは無し。チャンネルの説明「Apify Store に公開した新しい Actor を紹介する場所・Apify Actor 専用」に合致）
- 投稿の直前の基準値（公開 API）：totalUsers 1・totalRuns 11・30日の利用者 0（利用者1・実行11はすべて自社）
- 測定期間：2026-11-28〜12-12。毎朝、外部の利用者（totalUsers−1）と Store 検索への復帰を記録する
- 2026-11-28 7:51 JST オーナーが Console を確認：Actor の画面のタブに Insights は無い（Source・Runs・Builds・Integrations・Monitoring・Tasks・Settings・Publishing）。Publishing の5項目（Display information・Monetization Active・Input schema・Output schema・Actor permissions）はすべて済み。推測：外部の利用が0のため Insights が出ていない。直す点の指摘は無し
