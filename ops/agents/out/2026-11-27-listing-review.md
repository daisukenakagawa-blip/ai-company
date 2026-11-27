<!-- {"job": "listing_review", "slug": "preponderant_swift/dataset-merge-dedup", "inputs": "Apify public API"} -->
# Apify Store 可視性の診断と改善案（Dataset Merge & Dedup）

前提：根拠は渡されたデータのみです。Store 検索の順位ロジックそのものは分かりません。以下の「原因」はすべて仮説です。

## 事実の整理

- 当社の指標：totalBuilds 4、totalRuns 8、totalUsers 1、直近7/30/90日のユーザーは 0、レビュー 0、ブックマーク 0。最終実行は 2026-11-27。
- 競合の直近30日ユーザー数：lukaskrivka/dedup-datasets-limited-permissions 593、tidydata 55、saliga 57、humble-echidna 106、gazidev 26、nerolabs/dataset-filter-transform 60、tinplatelabs 8、nerolabs/dataset-cleaner-exporter 3。
- 競合が検索で拾われているクエリ（データ上）は "merge datasets"、"deduplicate"、"remove duplicates"、"dedup"。当社のクエリ別データは無い（`queries` 欄が無い）。当社が検索に出ていないかどうかは、データからは確認できていない。

## (1) 原因の仮説（根拠つき）

1. **検索クエリの一致が弱い（仮説）。**
   競合の題名・説明には "Merge Datasets" "Remove Duplicates" "Deduplicate" といった検索語がそのまま入っている（tidydata の題名は "Merge Datasets & Remove Duplicates"）。当社の題名は "Combine, Deduplicate, Filter Datasets" で、"Merge" と "Dedup" は入っているが、"remove duplicates" の語は SEO 題名の末尾にしか無い。説明文の冒頭も "Merge Apify datasets and CSV/JSON files…" で、"remove duplicates" は文中にあり、冒頭には無い。

2. **実績シグナルが無い（仮説）。**
   当社はユーザー 1、レビュー 0、ブックマーク 0、直近90日のユーザー 0。上位の競合は 30日で 55〜593 ユーザーある。Store が利用実績を順位に使う場合、新規の当社は不利になる。ただし、どの程度効くかはデータから分からない。

3. **競合の訴求点が多い（事実）。**
   競合は Excel / Google Sheets 入力、「新規行のみ（only new items）」、join / VLOOKUP、CSV/Excel 出力、MCP / n8n 対応を前面に出している。当社は CSV/JSON の URL 入力と MCP は書いているが、題名・説明では前面に出していない。

4. **README 冒頭が AI エージェント向け表で始まる（仮説）。**
   当社の README は、最初の画面が機械可読の表（Actor ID、API 呼び出し等）になっている。人間の利用者が「何ができるか」を最初に掴みにくい可能性がある。一方、AI エージェント向けとしては有用なので、削除ではなく順序の見直しに留めたい。

5. **実利用が当社自身によるものである可能性（推測）。**
   totalRuns 8 に対し totalUsers 1 で、直近90日の外部ユーザーは 0。この 1 ユーザーが当社自身かどうかは、データでは分からない。要確認。

## (2) 書き換え案（英語・文字数は目安）

Apify の目安は、題名 40〜50 字、SEO 題名 40〜50 字前後、説明 100〜200 字程度（SEO 説明は 140 字前後）。以下の字数は私が数えた概算なので、公開前に Console で再確認してください。

**題名（約 50 字）**
> Merge Datasets & Remove Duplicates — CSV, JSON, Apify

**SEO 題名（約 50 字）**
> Merge Datasets & Remove Duplicates | Dedup CSV, JSON

**説明（約 190 字）**
> Merge Apify datasets and CSV/JSON files, remove duplicates by the fields you choose (ignores case, spaces and URL tracking parameters), keep the first, last or most complete copy, filter and reshape rows. Pay only per output item.

**README 冒頭案**
```
# Merge Datasets & Remove Duplicates

Combine the results of several scraper runs into one clean dataset: merge Apify datasets and CSV/TSV/JSON/JSONL files, remove duplicates by the fields you choose, filter rows and reshape fields — in one run.

- Deduplicate by any field; case, spaces and URL tracking parameters are ignored
- Keep the first, last or most complete copy
- Pay per output item; removed duplicates and filtered rows are free
- Works with limited permissions and from AI agents via the Apify MCP server

Try it free: start with an empty input {} to run a built-in 6-item sample.

(以降は現行の "For AI agents" の表)
```
注意：「Works with limited permissions」は当社 README に "Limited permissions" の記載があるため使える。Excel / Google Sheets 対応は、当社が実装していない限り書かない。

## (3) 差別化の一文

> Pay only for the rows you keep — duplicates and filtered-out rows are free — with an AI-agent-readable README that states the cost cap and input schema before you run.

根拠：当社 README に「Removed duplicates and filtered rows are free」「Hard cost cap」「Cost before running」の記載がある。価格比較は、saliga が $0.50 / 1,000 rows、tinplatelabs が $0.05 / 1,000 rows（2026-11-29 以降）、当社が $0.20 / 1,000 items と、課金単位が異なる（出力行、読み込み行など）。安いと断定せず、「課金対象は出力のみ」という事実の表現に留めるのが安全。

## (4) やってはいけないこと

- 競合の題名・説明・README の文言のコピー、競合名を当社の題名・SEO 題名・説明・キーワードに入れること（商標・誤認の問題）。
- 実装していない機能（Excel、Google Sheets、join / VLOOKUP、「新規行のみ」）を書くこと。
- 「最速」「最安」「No.1」など、根拠データの無い比較・最上級表現。
- 利用者数・レビュー・評価の捏造、社員や関係者によるレビュー・実行の水増し。
- 実績のない「trusted by」等の表現。
- 検索語の羅列（キーワードスタッフィング）。

## 次のアクション（提案、承認後に実施）

- 上記の題名・説明・README を公開前にレビューする（公開はこちらでは実行しない）。
- 変更後 2〜4 週間で、Store 検索での表示順位と 30日ユーザーを再取得して比較する。
- 当社 1 ユーザーの正体（自社かどうか）を確認する。
