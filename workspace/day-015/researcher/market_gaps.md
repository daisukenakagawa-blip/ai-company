# Market Gap Engine・Radar（2026-11-28）

## 収集（0円）
- `scan.py 14`：GitHub の公開 Issue 984件を読み、`workspace/market-gaps/signals-2026-11-28.md` に書き出し（検索の失敗0）
- Radar（今朝の収集）：新規145件。HN 109・GitHub 80 は取得成功、**endoflife.date と Federal Register は URLError で取れず**（計測不能）
- 有料の分析（ai-paid.yml、5:23 JST）の結果は 7時の時点でまだリポジトリに来ていない（定時実行の遅れ。昨日の結果は最高37点で採用なし）

## 一次資料で確かめたもの

### 1. Last.fm API：12/1 から API キーの持ち主に Pro が必要
- 根拠：公開 Issue（public-apis #9351、11/22）が公式投稿 support.last.fm「API keys will require Pro from 1st December」を引用。公式投稿は robots.txt で取得禁止のため本文は読めず。独 smarthomeassistent.de（11/18）：Pro 月 $4.99・年 $49.99、Home Assistant の公式連携・Navidrome・オープンソースのスクロブラー（Astra）が止まる見込み
- 11/25 に評価済み（C）。今日の新しい事実：移行先として ListenBrainz を求める Issue が別々の2リポジトリ（scan）
- 誰が困り何に払うか：個人の音楽好き・自作連携の利用者。払う上限は Pro の $4.99/月で、受け皿（ListenBrainz）は無料・公開。**当社が払ってもらえる余地は無い → C のまま**

### 2. Libraries.io API の終了（11/30）
- 根拠：shields.io の公開 Issue #12320「Libraries.io API shutting down on November 30th」（題名のみ確認。本文は取得の制限で読めず）。libraries.io のトップは sonarsource.com に転送される（実測 302）
- 誰が困るか：依存関係のバッジ（shields.io）・依存の調査ツール・研究者。代わりは ecosyste.ms（無料・公開）などが既にあるとみられる（未確認）
- 判定：**C（不採用）**。受け皿を作るには全パッケージ市場の索引が要り、無料の代替が先行。払う主体が見えない

### 3. その他（記録のみ）
- OSSInsight（GitHub 分析）12/4 終了（昨日の Radar と同じ）。無料の分析サイトの終了で、払う主体なし → C
- Google Workspace の MCP（Gmail は送信できない）：昨日の Radar で評価済み、作る価値の根拠なし

## 入札朝刊（検証 5日目）
- 11/27 公告：翻訳・通訳1件、イベント・会議運営2件、Web・システム（小規模）1件（212件から絞り込み）。`workspace/kkj-digest/2026-11-28.md`
- 外部には出していない
