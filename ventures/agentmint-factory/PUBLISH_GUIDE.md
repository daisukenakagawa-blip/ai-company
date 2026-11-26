# Dataset Merge & Dedup 公開・料金設定・KYC の手順（オーナー用、2026-11-27）

AI は公開・料金設定・支払い情報・本人確認を行わない（オーナー承認制）。下の順で進める。
公式文書：publish.md / set-up-monetization.md / monthly-payouts.md（docs.apify.com/actors/…）

## 0. 準備（AI が済ませたこと）
- 非公開の Actor：https://console.apify.com/actors/W9KGGw1Z6grJa8bdz
- 英語の説明（README）、入力・出力スキーマ、SEO 題名・説明、カテゴリ、権限を絞った実行（limited permissions）
- 何も入力せずに実行しても成功し、結果が4件出る（Apify が毎日行う自動試験の条件：既定の入力で5分以内に成功し、結果が空でない）
- 課金するのは Apify の標準イベント「apify-default-dataset-item」1つだけ。コードからの独自の課金は無い（二重課金しない）

## 1. 料金を設定する（Publishing タブ → Monetization）
1. Console 左の Development → My Actors → 「Dataset Merge & Dedup」→ 上のタブ **Publishing**
2. **Monetization** の欄 → **Set up monetization**
3. 支払い情報（billing details）と受け取り方法を入れる画面が出たら入力する
   - 受け取りは **PayPal か Wise** をおすすめ（最低額 $20。銀行送金は $100 以上で手数料 $10〜50）
   - **クレジットカードは登録しない**（運営費0円の前提）。もしカードの入力を求められたら、そこで止めて AI に知らせる
4. 料金方式：**Pay per event**
5. イベントの設定（Actor pricing）
   - **apify-default-dataset-item**：価格 **$0.0002**（1,000件で $0.20）。題名 "Result item"、説明 "One item written to the output dataset. Removed duplicates and filtered-out rows are free."
   - **apify-actor-start**：そのまま（既定 $0.00005。最初の5秒の計算費が無料になる）
   - **独自イベント（Add event）は作らない**（作ると二重課金の原因になる）
6. **Pay per event + usage は オフ のまま**（オンにすると利用者に計算費も請求し、品質スコアも下がる）
7. Primary event：**apify-default-dataset-item** を選ぶ
8. Review で上の内容を確認して保存
- 注意：無料プランの利用者の支払いは収益に数えられない（その計算費は Apify 負担）。利益 = 売上 × 0.8 − 計算費。赤字の月は 0 扱い

## 2. 公開する（Publishing タブ）
1. 同じ Publishing タブの各欄（Display information、Monetization、Sample output、Output schema、Actor permissions）がすべて「完了」になっていることを確認
   - Display information：アイコン（ロゴ）が未設定なら任意の画像を設定（AI は画像を入れられない）。説明・SEO は設定済み
   - 初めての公開なら、**Store Publishing Terms への同意**を求められる
2. **Publish on Store** を押す
3. 確認：シークレットウィンドウで https://apify.com/preponderant_swift/dataset-merge-dedup が開けば公開済み
4. 公開したら「公開した」と AI に伝える（記録の状態を「公開」に変え、外部の利用の記録を始める）

## 3. 本人確認（KYC）と受け取り
1. Development → **Insights** → **Payouts** タブ → **Verify identity**
2. 個人：法的な身分証と同じ氏名、身分証（運転免許証・マイナンバーカード等）の鮮明な写真。スクリーンショット・コピー・破損したものは不可
3. 確認が終わるまでの収益は翌月へ繰り越し（失われない）
4. 毎月11日に請求書が作られ、14日に自動承認、21〜25日に支払い

## 4. 売上の記録（月1回でよい）
- Development → **Insights** → **Analytics** → **Export JSON**
- 書き出したファイルを GitHub の ventures/agentmint-factory/data/revenue/dataset-merge-dedup-YYYY-MM.json として置く（または AI に渡す）
- 売上・有料利用者・計算費は、この書き出しが無いと「未確認」のまま（売上を読む公式 API が無いため）

## 無料プランについて（確認できたこと・できないこと）
- 公式文書に「無料プランでは公開・課金・受け取りができない」という記載は無い（明示的に「できる」という記載も無い）。Publishing タブで実際に進めて確かめる
- 求められる条件として書かれているのは：Store Publishing Terms への同意、支払い情報、本人確認（受け取り時、または full permissions の Actor・11個以上の公開時）
- 有料プランへの切り替えを求められたら、そこで止める（運営費0円の規程）
