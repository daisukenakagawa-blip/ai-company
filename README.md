# AIカンパニー — AI社員だけで回る仮想の会社

CEO・リサーチャー・商品開発・マーケ・CFO・法務の6人のAI社員が、**元手0円**から事業を探し、商品を作り、売上を目指して毎日自動で働きます。
オーナー（あなた）の仕事は、**承認・却下と、売上の記帳だけ**です。

## 1日の流れ（`run` 1回 = 1営業日）

```
① CEO 経営会議   … 状況・売上・オーナー指示を読み、方針と今日のタスク（最大4件）を決める
② 社員が作業     … リサーチ（Web検索あり）／商品開発／マーケ／CFO が成果物を workspace/ に納品
③ 法務が審査     … 「公開・登録・投稿・支払い」など外部への行動は承認依頼に。違法・規約違反・費用発生は NG
④ CEO 日報       … reports/day-XXX.md と ダッシュボード reports/index.html を更新
```

AIは外の世界に対して勝手に何もしません（公開・送信・支払いは必ずオーナー承認）。
承認・却下の結果や売上は翌日の経営会議に反映され、CEO が次の打ち手を変えます。

## セットアップ

Python 3.10 以上が必要です。

```bash
pip install -r requirements.txt
cp .env.example .env        # 中身を編集
python -m ai_company init "GENHAYL AI事業部"
python -m ai_company run
```

### AIの動かし方（どちらか）

| 方式 | 設定 | 費用 |
|---|---|---|
| **Claude Code（おすすめ）** | `AI_BACKEND=cli`。Claude Code をインストールして `claude` でログインしておく | 今の Claude サブスク内（追加費用なし） |
| Anthropic API | `AI_BACKEND=api` と `ANTHROPIC_API_KEY` | 1日あたり数十円〜（`MAX_COST_USD_PER_DAY` で上限） |
| 動作確認 | `AI_BACKEND=mock` | 0円（ダミー応答） |

## 毎日の使い方

```bash
python -m ai_company status              # 現況
python -m ai_company approvals           # 承認待ち一覧
python -m ai_company approve 3 "公開した"  # 承認
python -m ai_company reject 4 "今はやらない"
python -m ai_company done 3 "note に公開、URL: ..."   # 実行し終えたら報告
python -m ai_company revenue 2980 "note 初売上"      # 売上を記帳
python -m ai_company cost 1500 "ドメイン代"          # 費用を記帳
python -m ai_company tell "飲食・海外開業の知見を活かす方向で"  # CEO への指示
python -m ai_company run --days 3        # 3日分まとめて回す
```

`reports/index.html` をブラウザで開くと、売上・承認依頼・意思決定・日報が一覧できます。

## 毎日自動で回す

**Mac / Linux（cron）** — 毎朝 7 時に実行:
```
0 7 * * * cd /path/to/ai-company && /usr/bin/python3 -m ai_company run >> run.log 2>&1
```

**Windows** — タスクスケジューラで `python -m ai_company run`（開始フォルダ = このフォルダ）を毎日実行。

**GitHub Actions** — `.github/workflows/daily.yml` 同梱。リポジトリの Secrets に `ANTHROPIC_API_KEY` を登録すると、毎日自動実行して結果をコミットします（API方式）。

## 設定（.env）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `AI_BACKEND` | `cli` | `cli` / `api` / `mock` |
| `AI_MODEL` | cli: 既定 / api: `claude-sonnet-5-5` | 使うモデル |
| `MAX_COST_USD_PER_DAY` | `1.0` | API方式の1日の上限（超えたら途中保存して停止） |
| `MAX_TASKS_PER_DAY` | `4` | 1日に CEO が割り振るタスク数 |

## フォルダ

```
state/company.json   会社の全状態（事業・帳簿・承認・意思決定・履歴）
workspace/day-XXX/   社員ごとの成果物（商品・販売ページ文面・調査レポート等）
reports/             日報とダッシュボード
ai_company/roles.py  社員の人格・会社ルール（ここを書き換えると社風が変わる）
```

## 注意

- 売上の自動取得はしていません。販売サイトの売上は `revenue` で記帳してください（正確な数字が CEO の判断材料になります）。
- 法務AIの審査は補助です。最終的な法的判断・税務はオーナーの責任で行ってください。
