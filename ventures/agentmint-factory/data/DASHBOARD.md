# AgentMint Factory ダッシュボード（2026-11-26）

## 費用0円の見張り

- 判定：**OK**（2026-11-26T17:03:14+00:00）
- Apify：プラン FREE、今月の利用 $0.01781788894054325 / 上限 $5（0.0036）
- GitHub：公開リポジトリ=True
- 外部への支払い：0円

## 商品別の損益（売上・手数料・計算費は Console の Analytics の書き出しが無ければ「未確認」）

外部＝公開の統計から自分（オーナー・AI の試験）の実行を引いた数。自分の試験は実績に数えない。

| 商品 | 状態 | 外部の利用者（30日） | 外部の実行（30日） | 自分の実行（30日） | 失敗率 | 有料利用者 | 売上 USD | 手数料 USD | 計算費 USD | 純利益 USD | 自分の試験費 USD（無料枠） |
|---|---|---|---|---|---|---|---|---|---|---|---|
| preponderant_swift/dataset-merge-dedup | private・公開準備完了 2026-11-27（オーナーの公開待ち） | 0 | 0 | 3 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.00044 |
| preponderant_swift/image-convert-compress | private・開発停止中（2026-11-27 オーナー方針） | 0 | 0 | 2 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.0003 |
| preponderant_swift/pdf-text-extract | private・開発停止中（2026-11-27 オーナー方針） | 0 | 0 | 1 |  | 未確認 | 未確認 | 未確認 | 未確認 | 未確認 | 0.00018 |

## 料金設定の確認（二重課金の防止）

| 商品 | Apify 上の設定 | 問題 |
|---|---|---|
| dataset-merge-dedup | 未設定（無料。公開しても誰にも課金されない） | なし |
| image-convert-compress | 未設定（無料。公開しても誰にも課金されない） | なし |
| pdf-text-extract | 未設定（無料。公開しても誰にも課金されない） | なし |

## 競合（公開 API）

| Actor | 30日利用者 | 30日実行 | 失敗率 |
|---|---|---|---|
| lukaskrivka/dedup-datasets-limited-permissions | 590 | 1903 | 0.641 |
| humble-echidna/dataset-transform | 106 | 1015 | 0.01 |
| rl1987/jq-helper | 70 | 140 | 0.007 |
| nerolabs/dataset-filter-transform | 62 | 991 | 0.082 |
| saliga/dataset-merge-dedupe | 57 | 357 | 0.014 |
| tidydata/merge-dedupe-datasets | 55 | 497 | 0.006 |
| marielise.dev/image-converter | 103 | 892 | 0.129 |
| gazidev/base64-file-converter | 30 | 121 | 0.0 |
| memo23/pdf-text-extractor | 177 | 21580 | 0.001 |
| automation-lab/pdf-text-extractor | 128 | 1068 | 0.006 |
