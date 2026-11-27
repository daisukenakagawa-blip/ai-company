"""全社経営ダッシュボード（Ver.2.2）。リポジトリ直下の DASHBOARD.md を作る。iPhone の GitHub アプリ・ブラウザで読める。

数字の出どころ（作らない。取れないものは「未確認」、古いものは「計測不能」と書く）
- AI API 費用・事業部別の予算残高：ops/ai_budget/ledger.jsonl（予算管理の台帳）
- 第1事業部（Apify）：ventures/agentmint-factory/data/ledger.csv（公開統計−自分の試験）と MONITOR.md
- 店の閲覧：workspace/acquisition/raw/metrics-latest.json（saved_at が36時間より古ければ計測不能）
- 売上・有料顧客：ops/hq/sales.json（毎朝の経営の実行で Stripe・Apify の書き出しから記録）。無い・古ければ未確認
- 承認待ち：state/company.json。新規事業の候補：ops/hq/candidates.json
使い方：python3 ops/hq/dashboard.py
"""
import csv, datetime, json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ops", "ai_budget"))
import budget  # noqa: E402

NOW = datetime.datetime.now(datetime.timezone.utc)
JST = NOW + datetime.timedelta(hours=9)


def load(rel, default=None):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def age_hours(iso):
    try:
        return (NOW - datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))).total_seconds() / 3600
    except Exception:
        return None


def nz(v):
    return "未確認" if v is None else v


def yen(v):
    return "未確認" if v is None else f"{v:,.0f}円"


def main():
    div = load("ops/hq/divisions.json", {})
    st = budget.status()
    alloc = st.get("division_budget_jpy", {})
    by_div = st.get("by_division", {})
    sales = load("ops/hq/sales.json")
    sales_ok = bool(sales) and (age_hours(sales.get("updated_at", "")) or 1e9) <= 36
    S = (sales or {}).get("divisions", {}) if sales_ok else {}

    def money(d, k):
        return S.get(d, {}).get(k) if sales_ok else None

    L = [f"# 全社経営ダッシュボード", "", f"更新：{JST:%Y-%m-%d %H:%M} JST（自動）。**取れない数字は「未確認」、古い数字は「計測不能」**。自己テスト・自分の操作は外部の実績に入れない。", ""]
    # 全社
    revs = [money(d, "revenue_jpy") for d in ("d1", "d2")]
    total_rev = None if (not sales_ok or any(v is None for v in revs)) else sum(revs)  # 1つでも未確認なら全社も未確認
    ai_month = st.get("month_jpy", 0)
    total_profit = None if total_rev is None else total_rev - ai_month - sum((money(d, "other_cost_jpy") or 0) for d in ("d1", "d2"))
    stop = "停止中" if st.get("stopped") else "動作可"
    L += ["## 全社", "", "| 項目 | 値 |", "|---|---|",
          f"| 今月の売上（全社） | {yen(total_rev)} |",
          f"| 今月の純利益（全社、AI API 費用を含む） | {yen(total_profit)} |",
          f"| 今月の AI API 費用（台帳、UTC の暦月） | {ai_month:,.1f}円 |",
          f"| 有料 API を止める額までの残り（5,000円の90%） | {st.get('remaining_jpy_before_hard_stop', 0):,.1f}円 |",
          f"| 予算消化率 | {st.get('used_ratio', 0) * 100:.1f}% |",
          f"| 今日の AI API 費用・回数 | {st.get('today_jpy', 0):,.1f}円・{st.get('today_calls', 0)}回 |",
          f"| 有料 API の全社停止 | {stop} |", ""]
    if not sales_ok:
        L += ["> 売上・有料顧客：記録（ops/hq/sales.json）が無いか36時間より古いため **未確認**。", ""]
    # 事業部
    L += ["## 事業部別", "", "| 事業部 | 今月の売上 | 今月の純利益 | AI API 費用 | 予算（配分） | 予算残高 | 外部利用者 | 有料顧客 | 公開中の商品 | 停止 |", "|---|---|---|---|---|---|---|---|---|---|"]
    assets = div.get("assets", [])
    for d in ("d1", "d2", "hq"):
        name = div.get("divisions", {}).get(d, {}).get("name", d)
        used = by_div.get(d, 0.0)
        rev = money(d, "revenue_jpy")
        prof = None if rev is None else rev - used - (money(d, "other_cost_jpy") or 0)
        pub = sum(1 for a in assets if a["division"] == d and a["status"].startswith(("公開", "販売中")))
        stopped = "停止中" if d in st.get("stopped_divisions", []) else "—"
        L.append(f"| {name} | {yen(rev) if d != 'hq' else '—'} | {yen(prof) if d != 'hq' else '—'} | {used:,.1f}円 | {alloc.get(d, 0):,}円 | {alloc.get(d, 0) - used:,.1f}円 | "
                 f"{nz(S.get(d, {}).get('external_users')) if d != 'hq' else '—'} | {nz(S.get(d, {}).get('paying_customers')) if d != 'hq' else '—'} | {pub if d != 'hq' else '—'} | {stopped} |")
    L.append(f"| 予備費 | — | — | — | {alloc.get('reserve', 0):,}円 | — | — | — | — | — |")
    L.append("")
    # 商品別
    L += ["## 商品・資産別", "", "| 事業部 | 商品・資産 | 状態 | 収益源 |", "|---|---|---|---|"]
    for a in assets:
        L.append(f"| {a['division']} | {a['name']} | {a['status']} | {a['revenue_source']} |")
    L.append("")
    # 第1事業部の実測（Apify）
    rows = []
    try:
        rows = list(csv.DictReader(open(os.path.join(ROOT, "ventures/agentmint-factory/data/ledger.csv"), encoding="utf-8")))
    except Exception:
        pass
    if rows:
        last = max(r["date"] for r in rows)
        L += [f"### 第1事業部：Apify の実測（{last}、公開統計−自分の試験）", "", "| 商品 | 外部利用者(30日) | 外部実行(30日) | 有料利用者 | 売上 USD |", "|---|---|---|---|---|"]
        for r in rows:
            if r["date"] == last:
                L.append(f"| {r['slug'].split('/')[-1]} | {r['external_users30']} | {r['external_runs30']} | {r['paying_users']} | {r['revenue_usd']} |")
        L.append("")
    # 第2事業部：店の閲覧
    m = load("workspace/acquisition/raw/metrics-latest.json")
    if m and m.get("days") and (age_hours(m.get("saved_at", "")) or 1e9) <= 36:
        last7 = m["days"][-7:]
        L += ["### 第2事業部：GENHAYL SHOP の閲覧（自社計測、直近7日）", "", "| 日付 | 閲覧 | 入口 | 購入ボタン | お試し |", "|---|---|---|---|---|"]
        L += [f"| {x['date']} | {x['pv']} | {x['entries']} | {x['buy']} | {x['demo_use']} |" for x in last7]
        L.append("")
    else:
        L += ["### 第2事業部：GENHAYL SHOP の閲覧", "", "計測不能（保存が無いか36時間より古い）", ""]
    # 候補・承認・作業
    cands = load("ops/hq/candidates.json", {}).get("candidates", [])
    L += ["## 新規事業の候補", ""]
    if cands:
        L += ["| 事業部 | 候補 | 点数 | 状態 |", "|---|---|---|---|"] + [f"| {c.get('division')} | {c.get('name')} | {c.get('score', '—')} | {c.get('status', '')} |" for c in cands[:10]]
    else:
        L.append("（調査中）")
    s = load("state/company.json", {})
    pend = [a for a in s.get("approvals", []) if a.get("status") == "pending"]
    L += ["", "## 承認待ち", ""] + ([f"- #{a['id']} {a['title']}" for a in pend] or ["なし"])
    try:
        runs = [l for l in open(os.path.join(ROOT, "workspace/ops/runs.md"), encoding="utf-8") if l.startswith("| 20")][-3:]
    except Exception:
        runs = []
    L += ["", "## AI の最近の作業（実行記録）", ""] + ([r.rstrip() for r in runs] if runs else ["記録なし"])
    L += ["", "## 緊急停止（iPhone の GitHub アプリから）", "",
          "- 全社：`ops/ai_budget/STOP` というファイルを作る（中身は理由を1行）。または リポジトリの Settings → Variables の `AI_KILL_SWITCH` を `1`",
          "- 事業部ごと：`ops/ai_budget/STOP-d1`・`STOP-d2`・`STOP-hq` を作る。または `AI_KILL_SWITCH_D1` などを `1`",
          "- 再開：そのファイルを消す（変数は `0` か削除）", ""]
    with open(os.path.join(ROOT, "DASHBOARD.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
