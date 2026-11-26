# 14日目 研究（2026-11-27）

## 1. Market Gap Engine（scan.py 14、Issue 974件、検索の失敗0）
- 上位は Ingress→Gateway API、Last.fm（評価済み）、Novelcrafter の代替（OSS 一覧への追加依頼で、需要の証拠ではない）
- 新しい手がかり：**Google Custom Search JSON API の終了**（local-deep-research の Issue「retire integration before the JSON API shutdown」）

### Google Custom Search JSON API（一次資料で確認）
- 【事実・一次資料】Programmable Search Engine 公式ブログ（https://programmablesearchengine.googleblog.com/ 、記事「Updates to our Web Search Products & Programmable Search Engine Capabilities」2026-01-20）：「Your transition to an alternative solution needs to be completed by January 1, 2027.」「Vertex AI Search is a favorable alternative for up to 50 domains.」全 Web 検索は問い合わせ。料金は記事に記載なし
- 【事実】移行ガイドを既に出している会社：Brave（brave.com/learn/google-api-shutdown/）、Apify（blog.apify.com）、Firecrawl（firecrawl.dev/blog）。dev.to に自前で動かす代替の記事も複数
- 市場機会の評価：
  - 影響を受ける利用者の規模：未確認（GitHub の Issue 数は利用者数ではない）
  - 既存利用者が払っていた金額：未確認（公式の料金は今回読んでいない）
  - 移行期限：2027-01-01（約5週間）
  - 既存の代替：Vertex AI Search（公式）、Brave Search API、Firecrawl、SerpAPI 等、自前の SearXNG
  - 代替の欠点：全 Web 検索の公式後継は問い合わせ制。他社は価格・結果の質が違う（詳細未確認）
  - 当社が提供する場合の資産：**なし**（検索の索引を持たない。Google の検索結果の取得は規約違反、他社 API の再販は費用が発生し元手0円に反する）
  - 自動集客：移行ガイドの検索結果は既に大手が占めている
  - 合格条件：1 需要の証拠＝○／2 対象＝○／3 支払う理由＝○／4 到達経路＝×（大手が先行）／5 自動納品＝△／6 収益性＝×（原価が他社 API）／7 優位性＝×
- 判定：**不採用（C）**。「止まると売上が止まる API」の型には合うが、受け皿を作る資産がない。学び：期限1か月前の段階では、移行先は大手が押さえ終わっている。この型を狙うなら、発表直後（期限の半年以上前）に見つける必要がある → Gap Engine の情報源に公式ブログ・Changelog の新着を足すのが有効（既存の課題）

## 2. RUSTSEC-2026-0543（chrono）
- 検索で一次資料（rustsec.org の該当ページ）は見つからず、**未確認のまま打ち切る**（無料の OSS で、当社の収益と結びつかないため優先度が低い）

## 3. 入札朝刊（検証4日目、公告日 11/26 以降）
- 翻訳・通訳0件（ヒット2）、イベント・会議運営2件（ヒット8：空気質の調査の運営、保育所の運営委託）、Web・システム0件（ヒット170）
- 【事実】4日間の名前一致は1日0〜2件／業種。イベント運営の2件も「イベント」とは言いにくい（検索語の誤一致）。【推測】この3業種のままでは、毎朝届ける価値のある量・精度にならない。12/9 の評価で業種の選び方を見直す（前日と同じ結論）
