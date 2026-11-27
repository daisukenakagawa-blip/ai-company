# Ver.3.0 需要起点型の収益構造：最初の調査（2026-11-28）

調べ方：公式の一次資料（公式サイト・文書・規約・公開統計・公開 API）を読んだ。確認できない項目は「未確認」、推測は「推測：」と書いた。外部への登録・応募・投稿・支払いは一切していない。調べた収益化の場は **57件**（下の一覧）、加えて集客の場が23件。

## 結論（3行）
1. **AI が自分だけで参加でき、実際にお金が動いている場は2つだけ**でした。①**API・道具の市場**（Apify は開発者に累計400万ドル超を支払い）②**機械どうしの少額決済 x402**（累計約5,000万ドル。ただし自分への支払いなどを除いた、エージェントによる本当の購入は全世界で月5,000〜11,000ドル程度、TRM Labs 2026-09-09）。
2. 「報奨金・課題・コンペ・人の作業」の市場は、**AI だけの参加を規約で禁止しているか、縮小・閉鎖しているか、AI エージェントが殺到しています**。HackerOne は完全自律の hackbot を禁止、MTurk は 2026-09-30 閉鎖、Code4rena は 2026-05 終了。Algora の $3 の報奨に約35件の応募があります。「AI 専用」をうたう高額報奨は、払われる根拠がありません。
3. **75点以上の候補はありません**（最高 62点）。100円以内で支払い需要を確かめられる実験は2つです。**①Apify の Actor への直リンクの流入づくり**（0円・既存の口座）**②x402 の有料エンドポイントでの外部エージェントの支払いの計測**（0円。ただし USDC の受け取りに法務・税務の確認とウォレットが必要）。

## 1. 調べた場（57件）と収益構造の分類（12種）

| # | 収益構造 | 場 | 実際の支払い実績（一次資料） | AI 単独で参加 | 日本から | 判定 |
|---|---|---|---|---|---|---|
| 1 | 機械どうしの従量決済 | x402・Bazaar・Agentic.Market（Coinbase）／Stripe Machine Payments（MPP）／Stripe ACS・ACP／Google AP2／Skyfire／Nevermined／Crossmint | x402：累計1.65億件・約5,000万ドル（Coinbase 2026-04-20）。エージェントの実需は月約1万ドル（TRM Labs）。Stripe 系・Skyfire・Nevermined は未確認 | 可（x402 は決済が通ると自動で掲載） | x402 は推測で可。**Stripe の SPT・ACS は対応国に日本なし** | x402 だけが候補 |
| 2 | エージェントどうしの仕事 | Virtuals ACP／Olas Mech Marketplace／Fetch.ai Agentverse／Versine／Payman | Olas：手数料の累計 111,232ドル・A2A 取引1,507万件（公式 2026-11-27）。Virtuals：aGDP 3億ドル超（定義は未確認） | 可（Virtuals の開発者規約に明記） | 未確認（制裁対象国以外） | Olas は需要が予測に偏り**当社の禁止に該当**。Virtuals は暗号資産のトークン経済と一体 |
| 3 | エージェント向けの懸賞市場 | ClawTasks／TaskMarket／BasedAgents／0xWork | TaskMarket：累計 1,395ドル（第三者の記事）。ClawTasks は有料の懸賞を終了中 | 可 | 未確認 | 買い手がいない。不採用 |
| 4 | OSS の報奨金 | Algora／Opire／IssueHunt／Polar／Bountysource／Gitcoin／Superteam Earn／tea.xyz／GitHub Sponsors／Replit Bounties | Bountysource は破産、Gitcoin の Bounties は移管、Polar・IssueHunt は事業転換。Algora は2026年6月以降の新しい報奨0件（公開検索で実測） | 規約に記載なし。リポジトリ側が AI の PR を閉じる例が多い | 可（Stripe Connect の本人確認） | 不採用（下の 4 章） |
| 5 | 監査コンテスト・脆弱性の報奨 | Code4rena／Sherlock／Cantina／Immunefi／huntr／HackerOne／Bugcrowd | Immunefi「$140M+」（自社発表）。Code4rena は終了 | **禁止または人の確認が必須**（HackerOne「Hackbots must not operate in a fully autonomous manner」、Cantina 規約 4(v)(g)） | 可（KYC 必須） | 不採用 |
| 6 | 賞金付きの AI・データコンペ | Kaggle／DrivenData／Zindi／AIcrowd／ARC Prize／Ocean Data Challenges | DrivenData：賞金の累計 550万ドル超。Ocean：2025年の1位 1,405ドル | 参加は自然人に限るものが多い。ARC は外部の LLM API 禁止、Zindi は AutoML 禁止 | 大会による（DOE GEMS は米国籍のみ） | 単発・人が前提。不採用 |
| 7 | プロトコルの報酬 | Bittensor のサブネット | 発行は1日約3,600 TAO（公式の文書） | 可（機械の参加が前提） | 記載なし | TAO の購入が必要で元手0円・投資に近い性質に反する。不採用 |
| 8 | API・道具の市場 | Apify Store（出品中）／RapidAPI／Zyla API Hub／APILayer／Make のアプリ | Apify：開発者への支払いは累計400万ドル超、2025年9月だけで56万ドル超。RapidAPI・Zyla は未確認（Zyla は「月30億回」と自社発表） | 可 | 可（Apify は運営中。RapidAPI は PayPal のみ・手数料25%） | **候補** |
| 9 | データ市場 | AWS Data Exchange／Snowflake Marketplace／Datarade／Hugging Face | AWS：データ製品3,500件超。売上は未確認 | 可 | AWS は日本の個人も可。Snowflake は有料アカウントが必要、Datarade は法人のみ | 売れる独自データが無いため保留 |
| 10 | 人の作業の市場 | Amazon MTurk／DataAnnotation／Outlier／Upwork／Expensify（Upwork 経由） | MTurk は 2026-09-30 閉鎖 | **禁止**（MTurk の規約、Upwork は自動の提案を禁止）。DataAnnotation などは本人の身分証が必要 | — | **当社の禁止（受託）に該当** |
| 11 | 有償の執筆案件 | Write for Apify | 1記事 $500、募集中（公式ページ） | AI 執筆の可否は未確認 | 未確認 | 人の名義の単発案件。24時間の装置にはならない |
| 12 | 紹介報酬・デジタル納品 | Apify アフィリエイト／Gumroad | Apify アフィリエイト：紹介した顧客の支払いの20〜30% | 可 | Gumroad は日本の銀行へ円で入金 | 紹介する相手を集める経路が先に必要 |

## 2. 新しい基準での採点（上位5件。100点満点）

配点：実際の支払い需要25・自動受注と納品20・集客依存の低さ20・純利益15・継続10・差別化5・初期費用5

| 順位 | 候補 | 需要 | 自動 | 集客 | 利益 | 継続 | 差別化 | 初期 | 合計 | 扱い |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Apify の既存 Actor（重複除去）に直リンクで流入を作る | 15 | 20 | 8 | 6 | 6 | 2 | 5 | **62** | 小規模な実験（0円） |
| 2 | x402 の有料エンドポイント（既存の重複除去を1回0.01ドル）。Agentic.Market に自動掲載 | 10 | 20 | 16 | 3 | 5 | 2 | 4 | **60** | 実験候補（法務・税務の確認後） |
| 3 | Virtuals ACP の提供エージェント | 8 | 20 | 14 | 4 | 6 | 2 | 3 | **57** | 保留（トークン経済・Sandbox の卒業が必要） |
| 4 | Zyla・RapidAPI への同じ機能の API 出品 | 8 | 18 | 12 | 5 | 6 | 2 | 5 | **56** | 実験候補（オーナーのアカウントが必要） |
| 5 | AWS Data Exchange に、権利のあるデータを無料で出品 | 6 | 18 | 12 | 3 | 8 | 3 | 5 | **55** | 保留（売れる独自データが無い） |
| 参考 | Write for Apify（$500/記事） | 22 | 6 | 18 | 13 | 4 | 3 | 5 | 71 | 自律ではない単発の受注。AI 執筆の可否が未確認 |
| 参考 | Algora の OSS 報奨 | 10 | 5 | 18 | 2 | 2 | 1 | 5 | 43 | 不採用 |

点の根拠
- 1位：需要は実在します（同種の競合の30日利用者 55〜593人、Apify Demand Map）。ただし当社の Actor は検索に出ない（11/19 の検索変更）ので、最初の流入は自分で作る必要があります。売上の単価が小さい（$0.20/1,000件、無料プランの利用者は作者の売上にならない）ため、利益の点は低くしています
- 2位：決済が通ると登録なしで自動掲載されるので、集客依存は低いです。ただし市場全体のエージェントの実需が月約1万ドルと小さく、利益の点は低くしています

## 3. 最有力候補の小規模実証計画

### 実証A：Apify の Actor への直リンクの流入（0円、2週間：11/29〜12/12）
- 目的：外部の利用が1件でも付けば、検索に自動で戻るか（公式ブログ）、有料プランの利用者が払うかを確かめる
- 内容（どれも外部への行動なので承認が必要）：
  1. Apify Discord の 🚀actor-promotion チャンネルに1回だけ紹介を投稿する（先にチャンネルのルールを読む。AI が下書きし、オーナーが自分のアカウントで確かめて投稿。Apify の行動規範は AI の出力をそのまま投稿することを禁止）
  2. Console の Insights タブの推奨に対応する（オーナーが画面を確かめる。手直しは題名・説明・README の承認済みの範囲で AI が行う）
- 成功の条件：自社以外の利用者1人以上（Apify の公開統計）
- 撤退の条件：14日間で外部の利用者0人
- 注：分類は公開 API で確認したところ、既に CLEAN_VALIDATE_AND_DEDUPLICATE_DATASETS が付いています（調査員の1人が「付いていない」と報告しましたが、当社の実測を採用）

### 実証B：x402 の外部エージェントの支払い（0円、30日）
- 先にやること（0円・承認不要）：Bazaar の検索 API で分野別の「30日の呼び出し数」と「支払った相手の数」を集計し、データ整形の分野に支払いがあるかを確かめる。**実行環境から api.cdp.coinbase.com が 403 で遮断されているため、オーナーに許可サイトへの追加を頼む必要があります**
- 需要があれば：既存の重複除去を Cloudflare Workers に置き、1回0.01ドルの x402 エンドポイントにする（手元で試作し、試験まで）。公開・受け取りのウォレットはオーナー承認。USDC で事業収入を受け取る扱い（資金決済法の電子決済手段、税務）は専門家への確認が必要（法的な判断はしていません）
- 成功の条件：自分以外のアドレスからの支払い1件以上（ブロックチェーン上の記録）
- 撤退の条件：30日で外部の支払い0件

## 4. 「集客経路はほぼ試し終えた」の再検証
- **誤りでした。** 実際にやったのは、自社サイトの手入れ（IndexNow・構造化データ・llms.txt）、X と note、Apify への公開の3種類だけです。宣伝が正式に許された場・ディレクトリ・公式の販売促進は、まだ1件も実行していません
- ただし「AI が書いて AI が投稿する」形で使える場は、ほとんどありません。HN（Show HN を含む）は AI が書いた文と自動投稿を明文で禁止、dev.to は AI を使った記事での自社宣伝を禁止、Zenn は機械の自動生成の文章をスパムとして禁止しています。Product Hunt・AlternativeTo・Discord はオーナー個人のアカウントが前提です
- まだ試していない正当な経路（効果が高そうな順）：
  1. Apify Discord の 🚀actor-promotion（上の実証A）
  2. KeyRelay を AlternativeTo・SaaSHub に「Lemon Squeezy の代わり」として無料登録。12/2 の LS の移行ツール公開に合わせる
  3. Write for Apify（$500、募集中。AI 執筆の可否を先に確認）
  4. 店を Microsoft Store に PWA として載せる（個人の開発者は登録料0円。オーナーの本人確認が必要）
  5. KeyRelay の OpenAPI 定義を作り、APIs.guru に登録

## 5. Apify の検索変更（公式情報）
- 公式ブログ「Apify Store search is changing」（2026-11-19）：混雑した分類では、実際の利用と付加価値がある Actor を優先し、利用の少ない Actor は正確な名前で検索しても出さない。今後数か月で順次実施。基準の数字・猶予は記載なし。**直リンク経由の利用も実績に数える**。利用が付けば自動で戻る（申請不要）
- 公式の助言：用途を絞る、自分で流入を作る（コミュニティ・SNS・記事で直リンクを共有）、Insights タブの推奨に対応する、README・入力の説明・試しやすい価格、Google 検索を狙う

## 6. 学んだこと（この構造が今うまくいかない理由）
- 「既に対価が設定された需要」は、ほぼすべて**人の名義・本人確認・人の確認**を条件にしています。運営側が AI の大量提出に苦しんでいて、2026年は規約がむしろ厳しくなりました（curl・ESLint・Nextcloud の報奨中止、GitHub の PR 制限、Bugcrowd の停止規定）
- AI だけで受け取れるお金は、今は**AI が使う道具の利用料**（Apify・x402）に集中しています。当社の強み（AI が24時間保守できる）を活かせるのもここです
- 結論：第3事業部は「報奨を取りに行く」より、「**AI エージェントが自動で見つけて自動で払う売り場（Apify・x402）に、需要のある道具を置く**」に絞るのが、根拠のある方向です

## 出典（調査員が実際に読んだページ。主なもの）
- x402・Agentic.Market：https://www.coinbase.com/developer-platform/discover/launches/agentic-market ・ https://docs.cdp.coinbase.com/x402/bazaar ・ https://www.trmlabs.com/trm-tech-blog/whos-actually-paying-measuring-ai-agent-payments-onchain
- Stripe：https://docs.stripe.com/payments/machine ・ https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md
- Olas：https://olas.network/mech-marketplace ・ https://olas.network/data ／ Virtuals：https://app.virtuals.io/acp_developer_agreement.pdf
- Apify：https://blog.apify.com/apify-store-search-update/ ・ https://docs.apify.com/actors/promote.md ・ https://apify.com/write-for-apify ・ https://docs.apify.com/legal/affiliate-program-terms-and-conditions ・ https://docs.apify.com/legal/community-code-of-conduct ・ https://natlawreview.com/press-releases/apify-bets-1m-independent-developers-building-ais-missing-tools
- 報奨金：https://algora.io/bounties ・ https://github.com/coollabsio/coolify/issues/8266 ・ https://github.com/tscircuit/pcb-viewer/issues/163 ・ https://www.hackerone.com/policies/code-of-conduct ・ https://www.cantina.security/terms/competitions ・ https://immunefi.com/rules/ ・ https://www.theblock.co/news/regulation/2026-05-13-immufefi-absorb-code4rena-bug-bounty-customers-shutdown-decision-401179 ・ https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/ ・ https://socket.dev/blog/eslint-ends-paid-contributor-program
- コンペ・データ・作業：https://www.drivendata.org/competitions/ ・ https://www.zindi.africa/rules ・ https://docs.arcprize.org/arc-prize-2026.md ・ https://aws.amazon.com/blogs/awsmarketplace/aws-marketplace-and-aws-data-exchange-now-support-sellers-and-data-providers-from-japan ・ https://docs.rapidapi.com/docs/payouts-and-finance ・ https://www.zylalabs.com/monetize-your-api ・ https://www.mturk.com/participation-agreement ・ https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly
- 集客の場：https://news.ycombinator.com/showhn.html ・ https://dev.to/guidelines-for-ai-assisted-articles-on-dev ・ https://zenn.dev/terms ・ https://alternativeto.net/faq ・ https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer
- 法規制（事実のみ）：https://www.fsa.go.jp/common/shinsei/dendai/dentori.html
