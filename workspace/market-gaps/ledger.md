# 市場機会の評価台帳

評価の項目は CLAUDE.md の「市場機会の評価」。根拠のない数値は「未確認」。GitHub の数は利用者数・購入者数として扱わない。

| 日付 | 対象 | 変化 | 判定 | 詳細 |
|---|---|---|---|---|
| 2026-11-24 | Lemon Squeezy | 2027-03-31 にサービス終了。移行先にライセンスキー機能なし | 実験中（KeyRelay） | `ventures/keyrelay/FACTS.md` |

### 追記（2026-11-24 深夜）Hacker News の反応（hn.algolia.com 公式 API、取得日 2026-11-24）
- 終了の投稿は 11/16〜11/17 に4本、最大でも 11 ポイント・コメント3件。反応は小さい（事実）
- ライセンス管理に触れたコメントは1件：「昨日デスクトップアプリ販売のために登録し、ライセンス管理に期待していた。代わりを探す」（https://news.ycombinator.com/item?id=50518944 のスレッド、bbx）（事実）
- そのコメントに競合の LicenseSpring が自社の宣伝で返信済み（同スレッド）（事実）。既存の競合が移行者を取りに来ている
- 解釈（AI の推測）：HN 上の移行需要の表明は今のところ1件。HN 投稿だけでは到達が限られる可能性が高い。競合（LicenseSpring・Keygen など）に対し、KeyRelay の優位は「LS と同じ API で、アプリ側の変更が URL 1か所」である点に絞られる
| 2026-11-25 | Last.fm API | 12/1 から API キーの持ち主に Pro（有料）が必要。持たないキーは停止（公式投稿 11/18 の転載で確認） | 不採用（C） | `workspace/day-012/researcher/market_gaps.md`。公式 Pro が約月5ユーロ（未確認）で、受け皿の単価が取れない。趣味の用途が中心で「止まると売上が止まる」条件にも当たらない |
| 2026-11-25 | npm の未修正パッケージ（extract-zip ほか） | 修正版のない脆弱性 | 不採用（C） | `workspace/day-012/researcher/lts_forks.md`。@keep-lts が同型の fork を無料公開済み、DL は本家の0.1%前後 |
| 2026-11-26 | 国内 SaaS の契約価格（案2 拠出型ベンチマーク） | 大口ほど価格非公開（主要20件中11件が一部・非公開） | 不採用（C） | `workspace/day-013/researcher/market_gaps.md`。マネーフォワード Admina の Vendor プランが3,000件超の価格データで診断・交渉代行を提供済み。当社はデータ・到達の両方で劣る |
| 2026-11-26 | 年賀状の宛名印刷（Google Workspace Marketplace） | 同業アドオンが 11/20 に掲載更新、Pro 月500円 | 記録のみ（経路の候補） | `workspace/day-013/marketing/channel_workspace_marketplace.md`。作り直しとオーナーの Google アカウント作業が必要なため見送り |
| 2026-11-27 | Google Custom Search JSON API | 2027-01-01 までに移行が必要（公式ブログ「Updates to our Web Search Products & Programmable Search Engine Capabilities」2026-01-20：「Your transition to an alternative solution needs to be completed by January 1, 2027.」）。公式の代替は Vertex AI Search（50ドメインまで）・全 Web 検索は問い合わせ | 不採用（C） | `workspace/day-014/researcher/market_gaps.md`。需要は本物（OSS の移行 Issue あり）だが、Brave・Firecrawl・Apify などが移行ガイドで既に受け皿を出している。当社は検索の索引を持たず、Google の結果の取得は規約違反、他社 API の再販は費用発生。止まると売上が止まる API ではあるが、勝てる資産がない |
| 2026-11-28 | Libraries.io API | 11/30 に API 終了（shields.io の公開 Issue #12320 の題名。libraries.io は sonarsource.com に転送） | 不採用（C） | `workspace/day-015/researcher/market_gaps.md`。全パッケージ市場の索引が要り、無料の代替（ecosyste.ms 等、未確認）が先行。払う主体なし |
| 2026-11-28 | Last.fm API（再確認） | 12/1 から Pro 必須（Pro 月 $4.99）。ListenBrainz への移行要望が別々の2リポジトリ | 不採用（C）のまま | 受け皿は無料。払う上限が Pro の額 |
