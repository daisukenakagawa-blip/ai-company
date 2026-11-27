# AgentMint Factory ダッシュボード（2026-11-27）

## 費用0円の見張り

- 判定：**OK**（2026-11-27T00:07:31+00:00）
- Apify：プラン FREE、今月の利用 $0.018969779641653292 / 上限 $5（0.0038）
- GitHub：公開リポジトリ=True
- 外部への支払い：0円

## 商品別の損益（売上・手数料・計算費は Console の Analytics の書き出しが無ければ「未確認」）

外部＝公開の統計から自分（オーナー・AI の試験）の実行を引いた数。自分の試験は実績に数えない。

| 商品 | 状態 | 外部の利用者（30日） | 外部の実行（30日） | 自分の実行（30日） | 失敗率 | 有料利用者 | 売上 USD | 手数料 USD | 計算費 USD | 純利益 USD | 自分の試験費 USD（無料枠） |
|---|---|---|---|---|---|---|---|---|---|---|---|
| preponderant_swift/dataset-merge-dedup | 公開 2026-11-27 8:14 JST（Pay per event $0.20/1,000件、本人確認は審査中） | 0 | 0 | 5 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.00073 |
| preponderant_swift/image-convert-compress | private・開発停止中（2026-11-27 オーナー方針） | 0 | 0 | 2 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.0003 |
| preponderant_swift/pdf-text-extract | private・開発停止中（2026-11-27 オーナー方針） | 0 | 0 | 1 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.00018 |

## 料金設定の確認（二重課金の防止）

| 商品 | Apify 上の設定 | 問題 |
|---|---|---|
| dataset-merge-dedup | apify-actor-start $5e-05, apify-default-dataset-item $0.0002 | なし |
| image-convert-compress | 未設定（無料。公開しても誰にも課金されない） | なし |
| pdf-text-extract | 未設定（無料。公開しても誰にも課金されない） | なし |

## 競合（公開 API）

| Actor | 30日利用者 | 30日実行 | 失敗率 |
|---|---|---|---|
| lukaskrivka/dedup-datasets-limited-permissions | 587 | 1913 | 0.642 |
| humble-echidna/dataset-transform | 106 | 1017 | 0.01 |
| rl1987/jq-helper | 70 | 142 | 0.007 |
| nerolabs/dataset-filter-transform | 61 | 1001 | 0.081 |
| saliga/dataset-merge-dedupe | 56 | 362 | 0.014 |
| tidydata/merge-dedupe-datasets | 55 | 499 | 0.006 |
| marielise.dev/image-converter | 103 | 909 | 0.132 |
| gazidev/base64-file-converter | 30 | 127 | 0.0 |
| memo23/pdf-text-extractor | 177 | 21592 | 0.001 |
| automation-lab/pdf-text-extractor | 128 | 1074 | 0.006 |
