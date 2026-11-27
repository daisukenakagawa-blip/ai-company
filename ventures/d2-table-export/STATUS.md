# 第2事業部 試作：Chrome 拡張「表を Excel へ」（2026-11-27）

- 状態：**手元の試作のみ。公開していない**（Chrome Web Store の開発者登録＝登録料と Google アカウントはオーナー承認が必要）
- 根拠：`workspace/research/2026-11-27/d2-market-research.md`（同種の Table Capture は利用者約20万・Pro は年額課金）
- 差別化の仮説（未検証）：結合セル（rowspan/colspan）の正しい展開、BOM 付き UTF-8（Excel で文字化けしない）、CSV インジェクション対策、ページの内容を外部に送らない
- 権限：activeTab と scripting だけ（押したタブだけ読む。常時の閲覧権限なし）
- 有料版（未実装）：無料版の利用者が集まってから。候補は複数の表の一括保存・Excel（.xlsx）直接保存
- 法務：他社名・ロゴなし。誇張なし。個人情報を集めない（ページの内容は送信しない）
- 試験：`node test/run.mjs`（Playwright で結合セルの表を展開して確かめる）
