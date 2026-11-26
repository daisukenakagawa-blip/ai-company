# AgentMint Factory（Apify で収益を生む Actor の工場）

2026-11-26 オーナー指示で開始。条件：初期費用0円・有料プラン禁止・外部の有料 API 禁止・架空の数字禁止・既存の AgentMint 環境を壊さない（この置き場所は ventures/agentmint-factory/ のみ。agentmint-mvp の Worker・D1 には触れない）。公開や費用が発生する操作は事前にオーナーが確認する。

## 循環（AI が繰り返す）
1. 調査：`research/collect_store.py`（Store 全件、約4分）→ `research/analyze.py`（分野ごとの需要と競合）→ `research/details.py`（失敗率）
2. 開発：`actors/<name>/`（Apify SDK、手元の試験 `npm test`）
3. 販売：`deploy.py`（非公開で作成・ビルド・試験実行。公開と料金設定はオーナーの確認後）
4. 記録：`tracker/track.py`（毎日 GitHub Actions、`data/ledger.csv`・`data/DASHBOARD.md`）。月曜の朝は 1 を自動で再実行

## 現在の方針（2026-11-27）
- 新しい商品開発は停止。Dataset Merge & Dedup の収益化を優先。公開・料金・KYC はオーナー承認制：`PUBLISH_GUIDE.md`
- 料金の整合性（二重課金の防止）：`check_pricing.py`。自律性の範囲：`AUTONOMY.md`。集客：`ACQUISITION.md`

## 費用0円
- `COST_POLICY.md`（規程と公式文書の確認）、`guard.py`（無料枠の80%・確認不能で開発・試験を自動停止）

## 方針
- 他社サイトのデータ取得（スクレイピング）の Actor は作らない（会社の方針。各サイトの規約の問題）。利用者のデータを加工する道具に絞る
- 自分の試験実行は実績に数えない。売上は Console の Analytics の書き出しで確認できたものだけ
- 調査の結果：`research/REPORT-2026-11-26.md`
