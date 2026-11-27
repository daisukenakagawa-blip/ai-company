# AI エージェントがお金を払う市場の調査（2026-11-27、調査用エージェント。登録・購入なし）

## 実際の取引（公表された数字）
- x402：2026-04-20 時点で累計1.65億件超・約5,000万ドル・取引したエージェント48万超（Coinbase 公式）。Visa の分析では洗浄取引・試験を除くと約1,500万ドル・1.1億件（2026-04-21）。TRM Labs（2026-09-09）は商取引らしいもの約2,560万ドル、うちエージェントによるものは0.6〜7.5%、**月あたり約5,000〜11,000ドル**と推計
- Apify のエージェント決済（x402・MPP・カード、前払い）：2026-11-24 開始。件数は未公表。エージェント経由の実行で作者に収益が入るかは公式文書に記載なし（未確認）
- 構想・初期（件数未公表）：Stripe ACP・Agentic Commerce Suite・MPP、Visa・Mastercard のエージェント決済、Skyfire、Cloudflare Monetization Gateway（順番待ち）。OpenAI は 2026-03-24 に ChatGPT 内の Instant Checkout を縮小（報道）

## エージェントが実際に払っている機能（公式の利用者数。売上は未公表）
- 検索 Exa：5,000社超・開発者40万超（2026-05-20）／Web 取得 Firecrawl：利用者150万超（2026-09-22）／ブラウザ Browserbase：有料顧客1,000超（2025-06、報道）／コード実行 E2B：サンドボックス起動20〜30億（同じページで数字が不一致）

## 供給不足の手がかり
- x402 の返金・紛争解決（x402-foundation/x402 issue #508、未解決）、販売者側の発見情報（#2582、提案中）
- 公開 MCP の窓口の約12%が接続できない（modelcontextprotocol/registry #1487、投稿者の測定）
- Apify の「外部ストレージへの出力・同期」：活発な道具は144本中3本、30日利用者1,046人（当社 Demand Map）

## 参入候補（100点満点：需要20/収益15/自動化15/差別化15/獲得10/継続10/AI5/模倣5/費用5）
| 候補 | 点 | 要点 |
|---|---|---|
| A 既存の Dataset Merge & Dedup を磨く | 58 | 競合 humble-echidna/dataset-transform 101人・saliga 58人・tidydata 52人（30日）。作者に入る経路が確認済み。差別化は弱い |
| B データセットを外部ストレージへ出力・同期 | 55 | 供給少・評価高。利用者の認証情報を扱う負担。新規開発の停止に当たる |
| C 法人番号・インボイス番号の確認 Actor | 52 | 競合4本とも30日0〜1人。需要が弱い |
| D 有料窓口（x402/MPP）の事前検査 | 51 | 誰が払うか未確認 |
| E 自前 API を x402 で直接販売 | 44 | エージェントの実需は x402 全体で月1万ドル前後。暗号資産の受け取りに税務・法務の確認が要る |

75点以上の候補は無し。推薦は A（追加開発でなく、既存商品の発見されやすさの改善）。成功条件：14日で外部の実行1件以上かつ Store 検索で圏内。撤退条件：14日間、外部の実行0件で順位も圏外のまま。

出典：coinbase.com/developer-platform/discover/launches/agentic-market、visa.com/en-us/thought-leadership/innovation/agentic-payments-from-the-ground-up、trmlabs.com/trm-tech-blog/whos-actually-paying-measuring-ai-agent-payments-onchain、blog.apify.com/introducing-x402-agentic-payments、docs.apify.com/agents/payments、exa.ai/blog/announcing-series-c、github.com/x402-foundation/x402/issues/508・2582、github.com/modelcontextprotocol/registry/issues/1487
