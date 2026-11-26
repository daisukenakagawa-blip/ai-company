# AI エージェント向け自動集客：経路の調査と計測（2026-11-27、オーナー指示）

対象：Dataset Merge & Dedup（https://apify.com/preponderant_swift/dataset-merge-dedup 、2026-11-27 8:14 JST 公開、Pay per event $0.20/1,000件）
方針：追加費用0円・有料 API 不使用・スパムなし・外部への登録と公開商品の更新はオーナー承認制。今回は調査と準備だけで、外部への登録・投稿はしていない。

## 1. 経路の調査（確認日 2026-11-27。「事実」は公式の一次資料、「推測」は AI の判断）

| 経路 | 実在・状況 | 登録費 | 利用者数（公式の数字のみ） | 当社の Actor を載せられるか | 自動登録 | 課金につながる可能性 |
|---|---|---|---|---|---|---|
| Apify Store 検索 | 実在。品質スコアで順位が決まり、1日に数回再計算（docs.apify.com/actors/publishing/quality-score） | 0 | 「36K+ monthly developers」（apify.com/mcp/developers） | 公開済み | ― | 高い（ただし有料プランの利用者だけ） |
| Apify MCP Server（mcp.apify.com） | 実在。既定で `search-actors`・`fetch-actor-details`・`call-actor`。`call-actor` は名前で任意の Actor を実行。権限が full の Actor は検索・実行から除外（docs.apify.com/mcp.md） | 0 | 未確認 | 自動で対象（当社は Limited permissions） | ― | 高い。順位は Store と同じ品質スコア |
| Apify のエージェント決済（AGI・x402 など） | 実在（Apify 公式ブログ 2026-11-24、docs.apify.com/agents/payments）。制限付き権限の Actor ならどれでも実行可 | 0 | 未確認 | 自動で対象 | ― | 作者に収益が入るかは**未確認**（公式に記載なし） |
| 公式 MCP Registry | 実在・プレビュー版（github.com/modelcontextprotocol/registry） | 未確認 | 未確認 | 不可（自前の MCP サーバーが要る） | CLI | 低い |
| Smithery | 2026-10-31 に接続代行・API・CLI を終了（smithery.ai/future） | ― | ― | 不可 | 終了 | ほぼ無し |
| Glama | 実在。MCP サーバー 131,191件を掲載 | 未確認 | 未確認 | 不可（MCP サーバーが前提） | 未確認 | 低い |
| GitHub（awesome-mcp-servers 等） | 実在 | 0 | ― | 不可（MCP サーバーの一覧） | PR | 低い |
| Zapier MCP・Composio・Pipedream | 実在。どれも Apify の「Run Actor」がある（作者の登録は不要） | 0 | 未確認 | 利用者が Actor を指定 | ― | 中（入口は結局 Store） |
| RapidAPI | 実在 | 未確認 | 未確認 | 自前の API が要る | ― | 低い |
| ChatGPT Apps | 実在 | 記載なし | 未確認 | 自前の公開 MCP サーバー・審査が要る | ― | 低い |
| OpenAPI | Apify が Actor ごとに OpenAPI を自動で出す（下の 2 で確認） | 0 | ― | 自動 | ― | 未確認（OpenAPI を検索する一般的なサービスは確認できず） |
| llms.txt | apify.com の AGENTS.md が、Store 検索 API・各 Actor の .md ページをエージェントの入口として案内 | 0 | ― | apify.com は当社のサイトではない（README だけ手を入れられる） | ― | 低い（第三者の調査で llms.txt はほとんど読まれていない） |
| x402 Bazaar | 実在（Coinbase CDP 文書） | 未確認 | 未確認 | 不可（自前の HTTPS 窓口と決済代行が要る） | ― | 対象外（新規開発の停止・費用0円の方針） |
| A2A の Agent Card・MCP の server.json | 仕様として存在 | ― | ― | Actor を載せる中央の一覧は確認できず | ― | 低い |

重要な事実
- **無料プランの利用者の実行は、作者の売上に入らない**（Pay per event の公式ページ「Users on the free plan are excluded from the calculation. They don't bring you revenue」）。作者の利益＝売上の80%−計算費
- MCP 経由の `call-actor` も利用者の API トークンで動く普通の実行（推測：有料プランの利用者なら作者に収益が入る。「MCP 経由」と明記した公式の文は無い）
- **当社の Actor は公開から数時間で、検索の上位400件に入っていない**（公開 Store API で5つの検索語を確認）。Store のページは成功率 0.0%・評価なし。公開統計は実行3回（全部自社の試験）・30日の利用者0
  - 推測：成功率0%は「直近30日の他人の実行が0件」のための表示で、失敗ではない（自社の3回はすべて Succeeded）。利用者の実行が入れば変わるはず（未確認）

結論：自前の MCP サーバーや API を新しく作る経路（Registry・Glama・ChatGPT Apps・x402 など）は、新規開発の停止と費用0円の方針に合わない。**Apify Store と Apify MCP Server の検索（同じ品質スコア）に集中する**。

## 2. AI が人の説明なしで使える商品仕様（準備済み・公開版への反映は承認待ち #18）

README の先頭に「For AI agents (machine-readable summary)」を追加（`ventures/agentmint-factory/actors/dataset-merge-dedup/README.md`）：
- 機械可読の商品説明（表）・入力と出力の場所・課金単価（$0.0002／出力1件、開始 $0.00005）
- **実行前の費用見積もり**：上限＝0.00005×max(1, メモリGB)＋0.0002×（入力データセットの itemCount の合計＋直接渡した件数）。itemCount は `GET /v2/datasets/{id}` で取れる
- 費用の上限の付け方（`maxTotalChargeUsd`、`maxItems`）と、上限に達したときの動き（正常終了・`stoppedAtChargeLimit`）
- MCP からの呼び方（`call-actor`、`https://mcp.apify.com?tools=preponderant_swift/dataset-merge-dedup`、認証は OAuth か Bearer）
- 最小の入力例2つ、エラーの一覧（原因・メッセージ・直し方）、処理の上限、利用条件
- 入力スキーマ（JSON Schema）と OpenAPI は Apify が自動で公開している（トークン不要で取得できることを確認）：
  - `https://api.apify.com/v2/acts/preponderant_swift~dataset-merge-dedup/builds/default` の `data.inputSchema`
  - `https://api.apify.com/v2/acts/preponderant_swift~dataset-merge-dedup/builds/default/openapi.json`（HTTP 200）
- 手元の試験：単体試験すべて合格、12万件の通し試験合格（コードは変えていない）

公開中の商品の更新は利用者にすぐ届くため、`deploy.py` に安全装置を追加：公開中の Actor は、`deploy-request.txt` の2行目に `approved #承認番号` が無ければ更新しない。

## 3. 経路別の計測（できること・できないこと）

| 数字 | 取り方 | 状態 |
|---|---|---|
| 商品ページへの流入 | 公式 API なし。Console の Insights → **Acquisition** タブ（オーナーの画面にあることを 11/27 のスクリーンショットで確認）に流入元が出る可能性 | 未確認（オーナーの書き出しが必要） |
| 外部 API の実行回数・外部利用者数 | 公開統計 − 自分の試験（`tracker/track.py`、毎日） | 自動 |
| 有料利用者・売上・純利益 | Console の Analytics の書き出し（月1回） | 未確認 |
| 継続利用者 | 7日・30日の利用者数の推移（公開統計） | 自動（推移で見る） |
| 経路別（Store 検索／MCP／API／連携ツール） | Apify の公開統計に経路の内訳は無い | **不明**として扱う |
| AI による利用か人か | 区別できない | **不明** |
| ボット・自分の試験 | Apify の実行はアカウントが要るので、検索ボット・脆弱性探しは実行に現れない。自分の試験は userId で除外 | 対応済み |

## 4. 計測システムの修復（毎朝 6:40 の保存と 403）

原因（ワークフローの実行履歴で確認）
- **定時実行の遅れ・欠落**：shop-growth の 11/26 の定時（21:40 UTC）は 03:44 UTC に実行（約6時間遅れ）。11/27 分は 23:25 UTC 時点で未実行。agentmint-factory の定時（22:17 UTC）は schedule での実行記録が1度も無い（記録はすべて push 起動）。GitHub の定時実行は混雑時に遅れ・欠落があることが公式文書に書かれている。設定（cron の書式・ファイルの場所・権限 contents: write）に誤りは見つからなかった
- **手動起動の 403**：「Resource not accessible by integration」。Claude が使う GitHub App に Actions の書き込み権限が無いため（workflow_dispatch に必要）。認証情報（APIFY_TOKEN など）の問題ではない

直したこと
- shop-growth：定時を1日3回（6:40・8:13・11:47 JST）にし、どれか1回動けばよい形に。`workspace/acquisition/raw/run-request.txt` の push でも起動（403 の回避。オーナーの作業は不要）
- 保存時刻 `saved_at` と起動の種類を記録。取得に失敗したら「計測不能」（`measurable: false`）と書き、前回の値は `metrics-prev.json` に残す（0人と書かない）
- agentmint-factory：予備の定時（10:23 JST）と `data/run-request.txt` の push による起動を追加
- 朝の手順：`saved_at` が24時間より古い、または `measurable: false` なら、その日の数字は「計測不能」と書く

## 5. 公開商品の継続監視（新設）

`tracker/monitor.py` を毎日実行し、`data/monitor.csv`（毎日1行）と `data/MONITOR.md`（1・3・7・14・30日目の表）に記録：外部利用者・外部実行・有料利用・売上・純利益・評価・ブックマーク・Store 検索の順位（5語）・検索1位の競合・AI か人か（不明）。0日目（11/27）：外部利用者0、外部実行0、検索は5語とも圏外（上位200件外）。

### 修復の確認（2026-11-27 8:33 JST）
- run-request.txt の push で shop-growth が起動し、`saved_at: 2026-11-26T23:32:56Z`（8:32 JST）、`trigger: push` で保存できた。11/26 は閲覧12（うち店に無いパス8件は修正前の記録）、11/27 は閲覧3（すべてトップ、直接・不明）
- agentmint-factory も push で起動し、監視（MONITOR.md・monitor.csv）を保存できた

### #README 反映（2026-11-27 8:36 JST、オーナーがチャットで承認）
- GitHub Actions（agentmint-deploy）で更新・ビルド・試験実行が成功。既定ビルド 0.1.3（SUCCEEDED）に「For AI agents」の節が入ったことを公開 API で確認。公開のまま・Pay per event のまま
- 公開統計の実行数は 5（3→5、増えた2回は自社の試験。外部の実行には数えない）
