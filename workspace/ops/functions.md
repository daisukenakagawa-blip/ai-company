# 各機能の仕組み（Ver.2.0 第8条、2026-11-24 設計）

方針：役職名で文章を作るのではなく、決まった入力を読み、決まった処理をし、決まった出力を残す。実行は毎朝の定期タスク（1回/日、Claude のクラウド実行）。イベント駆動（Stripe Webhook など）は Cloudflare の無料枠内で、必要になった時点で追加する（現在は KeyRelay の Webhook のみ）。

| 機能 | 入力 | 処理 | 出力 | 実行条件 | 失敗時 |
|---|---|---|---|---|---|
| CFO（数値） | Stripe API（決済・返金・手数料）、KeyRelay `/stats`、Cloudflare Web Analytics、`state/company.json` | 第三者の決済だけを数える（自己テスト除外）。純利益を計算 | `workspace/metrics/YYYY-MM-DD.json`（**未実装：次に作る**）、日報の数字 | 毎朝 | 取れない値は「未確認」と書き、推測しない |
| 研究開発（市場） | `ventures/_gap/scan.py` の出力、一次資料 | 候補の真偽を一次資料で確認、ledger に評価 | `workspace/market-gaps/ledger.md` | 毎朝、評価は2件まで | 検索の失敗件数を記録。資料が読めなければ「未確認」 |
| マーケティング（集客） | `workspace/acquisition/channels.md` | 経路を1つ調べ、到達数の測り方と規約を確認 | 同ファイルの評価、実装案 | 毎朝1件 | 規約が確認できない経路は「保留」 |
| 法務 | 承認依頼の内容、各規約 | 違法・規約違反・費用・誇張・権限（autonomy.md）を判定 | 承認依頼の `legal` 欄 | 外部への行動の前に必ず | 判定できなければ C 扱いでオーナーへ |
| 運用 | 店・KeyRelay の自己テスト（`/selftest`、`node test/*.mjs`） | 試験を流し、壊れていないか確認 | `workspace/ops/runs.md` | 毎朝、変更の push 前 | 失敗したら push しない。本番が壊れていればオーナーに通知 |
| CEO | 上の出力すべて、inbox | 撤退基準（第10条）で各事業の原因を分類し、今日のタスクを4件に絞る | 日報（第11条の8項目） | 毎朝 | 数字がそろわなくても日報は出し、欠けを明記 |

## 次に作るもの（優先順）
1. `ai_company/metrics.py`：Stripe と KeyRelay と Analytics から主要指標と純利益を JSON に保存（自己テスト・オーナー操作を除く判定つき）
2. 漏斗（訪問→登録→利用→決済開始→購入→継続）の記録形式を店と KeyRelay で共通化
