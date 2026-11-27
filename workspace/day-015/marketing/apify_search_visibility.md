# 経路の評価：Apify Store 検索・MCP の search-actors（2026-11-28）

## 実測（Apify Store の公開 API、自分の操作なし）
- 当社の Actor は Store に載っている（`/v2/store?username=preponderant_swift` で1件、題名は更新後の「Merge Datasets & Remove Duplicates — CSV, JSON, Apify」）
- しかし **検索では、自社の名前・題名そのものでも出てこない**
  - 「dataset-merge-dedup」「Merge Datasets & Remove Duplicates」「dataset merge dedup」「deduplicate dataset」「merge datasets」「dedup」「remove duplicates」：どれも結果に無し
  - 同じ検索で競合（saliga 57人・tidydata・lukaskrivka 593人・humble-echidna 106人など）は出る
- 自動で付いた分類：DEVELOPER_TOOLS・TRANSFORM_AND_PROCESS_DATA・CLEAN_VALIDATE_AND_DEDUPLICATE_DATASETS・GENERIC_SCRAPERS

## 一次資料
- Apify 公式ブログ「Apify Store search is changing: what it means for publishers」（2026-11-19）：混雑した分類では、利用の少ない Actor は Store 検索と分類のページに出さない。引用："If your Actor doesn't have much usage yet, it won't show up at the top of Apify Store search"。公開・直リンク・API での実行はそのまま。利用が付けば自動で戻る（申請不要）。基準の数字・新しい Actor の猶予は**記載なし**。分類は README と出力スキーマから自動で決まる
- 品質スコア（docs.apify.com/actors/publishing/quality-score）：Store 検索と MCP の search-actors の両方で順位に影響。要素は 成功率・利用者数・保存数・再利用・レビュー・説明の明確さ・PPE・限定権限・作者の実績・用語の一致
- 寄稿記事（blog.apify.com/fixing-actors-invisible-to-agents、2026-09-24。公式の仕様ではない）：MCP は入力の説明を500字で切る、既定値のある必須項目は required から外れる、主要な入力が配列でない Actor は候補から外れやすい。→ 当社は required なし・主要入力は配列で、該当する問題は無し（入力スキーマで確認）

## 判断
- **Apify Store・MCP の検索は、外部の利用がゼロのうちは集客経路として働かない**（事実＋公式説明。MCP 側も同じ基準かは未確認だが、公式の品質スコアの文書は両方に効くと書いている）
- 11/27 の「Store と MCP の検索に集中する」という方針は、この条件のもとでは客が来ない。最初の利用者は **直リンク**（README・他の場所から https://apify.com/preponderant_swift/dataset-merge-dedup へ）で来てもらうしかない
- やらないこと：検索に出すために分類を操作する（README を検索対象外の分類に寄せる）、自作の別アカウントで利用者を作る、他人のスレッドへの宣伝。どれも規約違反・偽の実績に当たる
- 直リンクの経路として残るもの（どれも外部への投稿で、承認が必要。今日は出さない）：
  1. 当社の X（承認済みの範囲④）で紹介する → 日本語の利用者は Apify の有料プランと重なりにくく、過去3投稿の訪問も0。効果は低いと見る
  2. 競合で失敗率の高い lukaskrivka（失敗率 64.6%）の利用者が困っている公開の場（Apify の公開 Issue タブ）での回答 → 他人の場での宣伝に当たるため **しない**
- 結論：第1事業部の Dataset Merge & Dedup は「待っても見つからない」状態。追加開発はしない。12/9 の評価で「集客経路が無い」と記録する候補

## 次の確認
- 毎朝、`/v2/store?search=dataset-merge-dedup` で表示されるか（利用が付いたら戻るはず）
- MCP の search-actors で出るかは、Apify のトークンが要るため Actions 側でしか確かめられない（未確認）
