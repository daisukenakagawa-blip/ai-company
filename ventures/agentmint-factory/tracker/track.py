"""AgentMint Factory — Phase 4：商品別の売上・手数料・計算費・純利益と、外部への支払い（常に0円であること）を毎日記録する。

使い方:  python3 tracker/track.py   （APIFY_TOKEN があれば自分の試験の費用と利用枠も読む）
出力:    data/ledger.csv（1日1行×商品）と data/DASHBOARD.md

数字の出どころ（架空の数字は書かない。取れないものは「未確認」）:
- 利用者数・実行回数・失敗率：公開 API GET /v2/acts/{id}（自分の試験実行も含まれる）
- 自分の試験の計算費：GET /v2/acts/{id}/runs の各実行の usageTotalUsd（今月分の合計）。無料枠の $5 から引かれる（支払いではない）
- 売上・Apify 手数料・他の利用者の実行の計算費：公式の API が無い。Console の Insights → Analytics の
  「Export JSON」を data/revenue/<actor名>-YYYY-MM.json に置くと読む。無ければ「未確認」
- 計算式（Apify 公式文書）：手数料 = 売上 × 20%。利益 = 0.8 × 売上 − 計算費。月の利益がマイナスなら Apify がその月を 0 とする
  （monthly-payouts.md）。作者のカードへの請求の記載は無い
- 外部への支払い：Apify のプランが FREE で、GitHub のリポジトリが公開なら 0円（guard.py の判定を data/budget-status.json から読む）
"""
import csv, datetime, glob, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
TOKEN = os.environ.get("APIFY_TOKEN", "")
FEE = 0.20

def get(url, auth=False):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"} if auth and TOKEN else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["data"]

def public_stats(slug):
    try:
        d = get(f"https://api.apify.com/v2/acts/{slug.replace('/', '~')}", auth=True)
    except Exception as e:
        return {"error": str(e)[:60]}
    s = d.get("stats") or {}; rs = s.get("publicActorRunStats30Days") or {}
    tot = rs.get("TOTAL") or 0
    bad = sum(rs.get(k) or 0 for k in ("FAILED", "TIMED-OUT", "ABORTED"))
    return {"id": d.get("id"), "u7": s.get("totalUsers7Days", 0), "u30": s.get("totalUsers30Days", 0), "users_all": s.get("totalUsers", 0),
            "runs30": tot, "fail_rate30": round(bad / tot, 3) if tot else "", "bookmarks": s.get("bookmarkCount", 0), "public": d.get("isPublic")}

_ME = None
def my_user_id():
    global _ME
    if _ME is None and TOKEN:
        try: _ME = get("https://api.apify.com/v2/users/me", auth=True)["id"]
        except Exception: _ME = ""
    return _ME

def own_runs(actor_id):
    """自分（オーナー・AI の試験）が動かした実行。runs の userId が自分のものだけを数える。
    戻り値：直近30日の実行数・今月の費用（無料枠から引かれる分）"""
    if not TOKEN or not actor_id or not my_user_id(): return None
    try:
        runs = get(f"https://api.apify.com/v2/acts/{actor_id}/runs?desc=1&limit=1000", auth=True)["items"]
    except Exception:
        return None
    me = my_user_id()
    mine = [r for r in runs if r.get("userId") in (me, None)]  # 一覧に userId が無ければ自分の実行とみなす（外部の数を多く見積もらないため）
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)).isoformat()
    month = datetime.date.today().strftime("%Y-%m")
    return {"runs30": sum(1 for r in mine if (r.get("startedAt") or "") >= since[:19]),
            "cost_month": round(sum((r.get("usageTotalUsd") or 0) for r in mine if (r.get("startedAt") or "").startswith(month)), 5)}

def revenue(slug):
    name = slug.split("/")[-1]
    files = sorted(glob.glob(os.path.join(DATA, "revenue", f"{name}-*.json")))
    if not files: return {}
    try:
        d = json.load(open(files[-1]))
    except Exception:
        return {}
    pick = lambda *ks: next((d[k] for k in ks if isinstance(d.get(k), (int, float))), None)
    return {"file": os.path.basename(files[-1]), "revenue": pick("revenueUsd", "revenue"),
            "platform_cost": pick("platformCostUsd", "platformCosts", "costs"), "paying_users": pick("payingUsers", "paidUsers")}

def main():
    cfg = json.load(open(os.path.join(HERE, "actors.json")))
    today = datetime.date.today().isoformat()
    try:
        budget = json.load(open(os.path.join(DATA, "budget-status.json")))
    except Exception:
        budget = {"decision": "未確認"}
    external_payment = 0 if budget.get("decision") == "OK" or (budget.get("apify", {}).get("plan") == "FREE" and budget.get("github", {}).get("private") is False) else "未確認"
    rows = []
    for a in cfg["actors"]:
        slug = a["slug"]
        st = public_stats(slug); rv = revenue(slug)
        r, c = rv.get("revenue"), rv.get("platform_cost")
        fee = round(r * FEE, 4) if r is not None else "未確認"
        profit = round(max(0.0, (1 - FEE) * r - (c or 0)), 4) if r is not None and c is not None else "未確認"
        own = own_runs(st.get("id"))
        ext_runs = max(0, st["runs30"] - own["runs30"]) if own and isinstance(st.get("runs30"), int) else "未確認"
        ext_users = max(0, st["u30"] - (1 if own["runs30"] else 0)) if own and isinstance(st.get("u30"), int) else "未確認"
        rows.append({"date": today, "slug": slug, "status": a["status"], **{k: v for k, v in st.items() if k != "id"},
                     "own_runs30": own["runs30"] if own else "未確認", "external_runs30": ext_runs, "external_users30": ext_users,
                     "paying_users": rv.get("paying_users", "未確認") if rv.get("paying_users") is not None else "未確認",
                     "revenue_usd": r if r is not None else "未確認", "apify_fee_usd": fee,
                     "platform_cost_usd": c if c is not None else "未確認", "net_profit_usd": profit,
                     "own_test_cost_usd_month": own["cost_month"] if own else "未確認", "external_payment_jpy": external_payment})
    comp = [{"slug": c, **public_stats(c)} for c in cfg.get("competitors", [])]
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, "ledger.csv")
    fields = ["date", "slug", "status", "public", "u7", "u30", "users_all", "runs30", "own_runs30", "external_runs30", "external_users30", "fail_rate30", "bookmarks", "paying_users",
              "revenue_usd", "apify_fee_usd", "platform_cost_usd", "net_profit_usd", "own_test_cost_usd_month", "external_payment_jpy", "error"]
    if os.path.exists(path) and open(path).readline().strip().split(",") != fields:
        os.rename(path, path.replace(".csv", f"-old-{today}.csv"))  # 列が変わったら古い表を残して作り直す
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if new: w.writeheader()
        for r in rows: w.writerow(r)
    ap = budget.get("apify", {})
    md = [f"# AgentMint Factory ダッシュボード（{today}）", "",
          "## 費用0円の見張り", "",
          f"- 判定：**{budget.get('decision')}**（{budget.get('checked_at', '未確認')}）",
          f"- Apify：プラン {ap.get('plan', '未確認')}、今月の利用 ${ap.get('monthly_usage_usd', '未確認')} / 上限 ${ap.get('max_monthly_usage_usd', '未確認')}（{ap.get('usage_ratio', '未確認')}）{'' if ap.get('ok') else '　停止の理由：' + str(ap.get('reason'))}",
          f"- GitHub：公開リポジトリ={budget.get('github', {}).get('private') is False}{'' if budget.get('github', {}).get('ok') else '　停止の理由：' + str(budget.get('github', {}).get('reason'))}",
          f"- 外部への支払い：{external_payment}円", "",
          "## 商品別の損益（売上・手数料・計算費は Console の Analytics の書き出しが無ければ「未確認」）", "",
          "外部＝公開の統計から自分（オーナー・AI の試験）の実行を引いた数。自分の試験は実績に数えない。", "",
          "| 商品 | 状態 | 外部の利用者（30日） | 外部の実行（30日） | 自分の実行（30日） | 失敗率 | 有料利用者 | 売上 USD | 手数料 USD | 計算費 USD | 純利益 USD | 自分の試験費 USD（無料枠） |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['slug']} | {r['status']} | {r.get('external_users30','—')} | {r.get('external_runs30','—')} | {r.get('own_runs30','—')} | {r.get('fail_rate30','—')} | {r['paying_users']} | {r['revenue_usd']} | {r['apify_fee_usd']} | {r['platform_cost_usd']} | {r['net_profit_usd']} | {r['own_test_cost_usd_month']} |")
    try:
        pc = json.load(open(os.path.join(DATA, "pricing-check.json")))
        md += ["", "## 料金設定の確認（二重課金の防止）", "", "| 商品 | Apify 上の設定 | 問題 |", "|---|---|---|"]
        for r in pc:
            act = r.get("actual"); act = act if isinstance(act, str) else ", ".join(f"{k} ${v['price']}" for k, v in act["events"].items())
            md.append(f"| {r['actor']} | {act} | {'; '.join(r['problems']) or 'なし'} |")
    except Exception:
        pass
    md += ["", "## 競合（公開 API）", "", "| Actor | 30日利用者 | 30日実行 | 失敗率 |", "|---|---|---|---|"]
    for c in comp:
        md.append(f"| {c['slug']} | {c.get('u30','?')} | {c.get('runs30','?')} | {c.get('fail_rate30','?')} |")
    open(os.path.join(DATA, "DASHBOARD.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("\n".join(md))

if __name__ == "__main__":
    main()
