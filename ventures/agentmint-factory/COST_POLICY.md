# AgentMint Factory 費用0円の運営規程（2026-11-26 オーナー指示）

収益が0円でも、外部への支払いが0円になる構造を保つ。

## 禁止（自動でも手動でも AI は行わない）
- Apify の有料プランへの変更、クレジットカードの登録・課金、利用枠の上限の引き上げ
- 無料枠を超える利用（Apify 月 $5・GitHub Actions）
- 外部の有料 API（AI の API を含む）の利用
- 非公開リポジトリでの Actions の実行、標準以外のランナー（larger runners）の利用
- オーナーの支払いが発生しうる操作の自動実行（公開・料金設定・支払い情報の登録はオーナーが判断）

## 自動の見張り（guard.py）
- 実行のたびに確認：Apify のプランが FREE か／今月の利用額 ÷ 上限（GET /v2/users/me/limits）／GitHub のリポジトリが公開か／標準ランナーだけか
- **80% 以上、確認できない、FREE でない、非公開**のどれかなら STOP（終了コード3）。デプロイ・ビルド・試験実行（deploy.py と deploy ワークフロー）は STOP なら始まらない
- 毎日 7:17 JST に自動で確認し、STOP なら GitHub の Issue でオーナーに知らせる（Issue の作成は無料）
- 記録・市場調査（Apify の公開 API の読み取りだけ）は STOP 中も続ける。公開 API の読み取りは Apify の利用枠を使わない【未確認：公式文書での明記は見つけていない。月の利用額の変化で確かめる】

## 公式文書で確認したこと（2026-11-26）
| 項目 | 内容 | 出典 |
|---|---|---|
| Apify 無料プラン | 月 $5 の前払い枠、カード不要 | https://apify.com/pricing |
| 枠を使い切ったとき | 無料プランは翌月の周期まで利用停止（超過料金は有料プランだけ） | https://apify.com/pricing（FAQ） |
| 自分の Actor の実行 | 自分のアカウントの利用額になる（無料枠から引かれる） | https://apify.com/pricing（FAQ） |
| 公開・課金なしの Actor | 動かした人が自分の枠で払う（作者の負担なし） | https://docs.apify.com/actors/running/actors-in-store.md 、Actor 利用規約 2.1 |
| 公開・Pay per event の Actor | 利益 = 0.8 × 売上 − 計算費。無料プランの利用者は売上に数えず、その計算費は Apify が負担 | https://docs.apify.com/actors/monetize/pricing-and-costs.md |
| 赤字になったとき | その月のその Actor の利益を Apify が 0 にする（作者への請求の記載なし） | https://docs.apify.com/actors/monetize/monthly-payouts.md 、Store 掲載規約 10.2.1 |
| 注意 | 一般規約 7.3・7.5：登録済みのカードに料金・超過料金を請求できる → **カードを登録しないことが0円の前提** | https://docs.apify.com/legal/general-terms-and-conditions.md |
| GitHub Actions | 公開リポジトリの標準ランナーは無料・無制限 | docs.github.com …/choose-the-runner-for-a-job |
| GitHub の非公開リポジトリ | 支払い方法が無ければ無料枠を使い切った時点で停止（請求なし） | docs.github.com …/product-billing/github-actions |
| GitHub の利用量の API | 個人の「Plan」読み取り権限のトークンが必要。既定の GITHUB_TOKEN では読めない → 非公開なら STOP | docs.github.com/en/rest/billing/usage |

## 未確認（推測で埋めない）
- Apify のアカウントにカードが登録されていないこと（API で確かめる方法が無い。オーナーに確認）
- 無料アカウントが自動で有料に切り替わることが無いこと（そうした記載は見つからなかった）
- 公開・Pay per event の Actor で赤字のとき、作者のカードに請求が来ないこと（記載は「利益を0にする」だけ）→ **カード未登録なら請求先が無い**

## 商品別の損益（tracker/track.py → data/DASHBOARD.md）
売上／手数料（20%）／計算費／純利益（=0.8×売上−計算費、赤字は0）／自分の試験費（無料枠から）／外部への支払い（円）
売上・計算費は公式 API が無いため、Console の Analytics の書き出し（data/revenue/）が無ければ「未確認」
