# 機能のモジュール一覧（Ver.2.5：将来 API として切り出せる境界）

現段階では**商品化のための追加開発はしない**。既存のコードを、この表の境界で保守する（入力・出力をはっきりさせ、事業固有の値をコードに埋め込まない）。

| 機能 | 今のコード・データ | 入力 → 出力 | 将来の API 候補 |
|---|---|---|---|
| 市場調査 | `ventures/_gap/scan.py`（GitHub の公開 Issue）、`demand_map.py`（Apify Store）、`kkj_digest.py`（官公需） | 期間・情報源 → 手がかりの一覧（JSON） | Opportunity Radar |
| 需要発掘 | 調査用エージェントの報告 → `ops/knowledge/data/opportunity.jsonl` | 市場 → 需要の証拠（確からしさ付き） | Market Discovery |
| 競合分析 | `ventures/agentmint-factory/tracker/monitor.py`（Store の順位・競合）、`research/collect_store.py` | 商品・検索語 → 順位・競合の利用者・価格 | Competitor Intelligence |
| 新規事業評価 | 100点の採点（`ops/hq/candidates.json`）、合格条件7項目 | 候補 → 点数・判定・撤退条件 | Business Evaluation |
| 収益性分析 | `ops/hq/dashboard.py`、`ventures/agentmint-factory/tracker/track.py` | 売上・費用 → 純利益（未確認を区別） | （内部） |
| 商品企画・開発 | `ops/agents/run.py`（役割ごとの AI）、各 `ventures/*` | 企画 → 試作・試験 | Product Strategy |
| 集客戦略 | `workspace/acquisition/`、`ventures/_marketing/`、AI 向けの README | 商品 → 経路の評価・実施 | Growth Optimization |
| 販売管理 | Stripe（Payment Link・鍵 `lib/shop_license.js`）、Apify の料金設定の確認 `check_pricing.py` | 注文 → 権限・記録 | （内部） |
| 経営判断 | `ai_company`（日報・決定の記録）、`ops/knowledge/data/decision.jsonl` | 状況 → 判断・予測、後で結果 | Autonomous Business |
| 予算管理 | `ops/ai_budget/`（全社5,000円、事業部別） | 呼び出し → 許可・記録 | （内部の安全装置。販売しない） |
| 自動改善 | 予測と実績の差（decision の prediction と outcome） | 判断の履歴 → 学び | （データが溜まってから） |
| リスク管理 | `guard.py`（費用0円の見張り）、`scan_direct_calls.py`、法務審査 | 変更・行動 → 止める／承認依頼 | （内部） |

## 第3事業部の設立条件（`ops/hq/divisions.json` の d3）
外部の有料顧客／AI 費用込みで黒字／3か月以上の連続黒字／複数事業で収益化／オーナーの介入が少ない／判断と成果の関係を検証済み／外部での再現性／経営システム自体への有料需要。**全部満たしたらオーナーに提案する。それまで販売・宣伝・追加支出はしない**（実績のないシステムを稼げるものとして宣伝しない）。

## 販売形式の比較（将来の検討メモ。今は決めない）
| 形式 | 向く相手 | 長所 | 短所 |
|---|---|---|---|
| 個別 API の従量課金 | 開発者・AI エージェント | 小さく始められる、Apify・x402 と相性 | 単価が低い |
| 月額 SaaS（ダッシュボード） | 個人開発者・小さな会社 | 継続収益 | 問い合わせ対応が増える |
| 法人ライセンス | 事業会社 | 単価が高い | 営業が要る（当社の方針に合わない） |
| データの定期提供 | 調査会社・投資家以外の事業者 | 独自データが資産になる | 再販売の権利の確認が必須 |
差別化の源泉は「実際に運営した結果（予測と実績の差）」のデータ。外部の AI API の転売にはしない。
