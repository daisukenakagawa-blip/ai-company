<!-- {"job": "gap_triage", "source": "signals-2026-11-27.json"} -->
以下は、渡されたデータの各行だけを根拠に分類したものです。外部サービスの料金・提供条件・日付など、データに無い事実は書いていません。「確認」列は一次資料（各提供元の公式発表、RustSec のアドバイザリ、公式の変更履歴など）で確かめるべき点です。

分類の基準：
- A：有料の外部サービスの変化で、利用者の業務や売上が止まりうるもの
- B：要確認（外部の変化の可能性はあるが、データだけでは判断できないもの）
- C：雑音（自社コードの内部の話、ライブラリ内の SIGTERM 処理、一覧への追加依頼、内部 API の版管理など）

| 項目 | 分類 | 確認（一次資料で確かめる点） |
|---|---|---|
| Gemini（API の廃止・大幅な値上げ） | A | Gemini API / Vertex AI の公式の廃止スケジュールと、12/1・1/1 とされる値上げの対象モデル・料金表 |
| JSON（search_engine_google_pse の JSON API 終了） | A | Google Programmable Search（PSE）の JSON API 終了日と代替手段の公式告知 |
| Last.FM（12/1 から無料でなくなる） | A | Last.fm API の有料化の開始日・料金・無料枠の条件を公式告知で確認 |
| December（OSSInsight 終了 2026/12/4、Last.FM、値上げ） | A | OSSInsight の終了日とデータ提供条件、Last.fm の公式発表 |
| Supabase（pricing change、Firebase からの移行含む） | A | Supabase の料金改定の対象プラン・適用日・既存契約への影響 |
| Platform（Campaign Management API v5 の sunset 2027-01-26） | A | 提供元の v5 の sunset 日付と、v1 への移行ガイド・互換性 |
| November（Libraries.io API 11/30 停止、NearBlocks API v1 の 11/22 停止） | A | 各 API の停止日・後継 API・利用規約の公式発表 |
| Google（API の廃止日・値上げ） | A | 提供元の API 廃止日程と料金変更の公式発表（Gemini と重複の可能性あり） |
| Keep（広告の自動価格上昇） | A | 有料市場価格に連動する価格上昇の仕組みと、上限・適用時期の公式説明 |
| Notifications（Price increase Recurring payment 項目） | B | 通知の元データが外部サービスの値上げを指すのか、アプリ内の表示の話かの確認 |
| Validate（pricing policy に触れない payload 検証） | C | 自社内部の検証。外部変化なし。※ 行の本文に "Battlemaster"（外部ゲーム由来の語）が出るが、内容は自社の幾何データ置換の話 |
| Evaluate（ESLint/Prettier → Oxc・Biome） | B | 移行対象の各ツールの公式な開発状況・ライセンス・提供形態の変化の有無 |
| RUSTSEC-2024-0436（paste 開発終了） | B | RustSec 公式アドバイザリの対象バージョン・代替推奨・依存先への影響範囲 |
| RUSTSEC-2026-0543（chrono 開発終了、jiff/time が代替） | B | RustSec 公式アドバイザリの内容と、chrono 利用箇所の影響範囲 |
| RUSTSEC-2024-0388（derivative 開発終了） | B | RustSec 公式アドバイザリの代替推奨と、依存関係の範囲 |
| Last.FM 移行（Listenbrainz 代替の要望） | B | Last.fm の料金変更後の正確な条件（上記 A の確認と併せる） |
| Enterprise Live Migrations（Azure DevOps 移行機能の GA） | B | GitHub 公式変更履歴の GA 日付と対象範囲（Azure DevOps 側の提供終了の有無は別途要確認） |
| Runner（macOS 等のホスト Runner 取得失敗） | B | GitHub Actions 側の runner の提供状況・在庫制限の公式情報 |
| Password（1Password 代替の要望、サービス終了の文脈） | C | 一覧への追加依頼・内部の話。外部サービス終了の証拠なし |
| Slint・Omarchy・Android・Store・Redis・SIGTERM・Drain・SHUTTING・DOWN・HTTP・REST・Gateway・Backend・API 廃止系の内部 Issue 等 | C | 自社コードのシャットダウン処理・内部 API の版管理・ログ分類・内部設計の話。外部の変化を示す行なし |
| Injectable・Migrations・Migrate 系（SQLite→PostgreSQL、Neon→Turso、Firebase→Supabase など）・Research・Alternatives・Suggestion・Find・Jev・Assess・Read・SQL・Run 等の移行先さがし | C | 自社内の移行計画・代替候補の一覧・機能要望。外部の値上げや停止の証拠なし（例外として Supabase・Neon 等の料金・提供変化は上記 A/B で確認） |
| Changelog（GitHub Changelog 重複） | C | 単なる機能告知の重複。利用者の業務停止を示す記述なし |
| MCP・Agent・ADR・Document・Define・Public・Advanced・Enhancement・Freeze・Versioned・Gateway・FEATURE・Request・DATE・Legacy・Migrations 等の自社 API 版管理・文書化の話 | C | 自社の API 方針・内部文書の話。外部サービスの変化を示さない |
| RUSTSEC 以外の開発終了（Agent 等の文脈） | C | 上記の該当なし（Agent 行は自社リポジトリ内の運用の話） |

注意：データは機械的な抽出なので、分類の誤りや見落としがありえます。A と判定した項目も、利用者の業務への影響の大きさは実際の契約・利用状況を見て判断してください。この表はあくまで一次資料で確かめるべき点の整理であり、外部への公開、投稿、価格変更の実施は行いません。
