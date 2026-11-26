"""AgentMint Factory — Phase 4：売上・利用者・実行コスト・純利益を毎日記録する。

使い方:  python3 tracker/track.py            （APIFY_TOKEN があれば自分のアカウントの費用も読む）
出力:    data/ledger.csv（1日1行×商品）と data/DASHBOARD.md

情報源と限界（架空の数字は書かない。取れないものは「未確認」）:
- 利用者数・実行回数・失敗率：公開 API GET /v2/acts/{id}（認証不要）。自分の試験実行も含まれる
- 自分のアカウントの費用：GET /v2/users/me/usage/monthly（要 APIFY_TOKEN）
- 売上・Apify 側の費用控除後の利益：公式の API が見当たらない（2026-11-26、docs.apify.com）。
  Console の Insights → Analytics の「Export JSON」を data/revenue/<slug名>-YYYY-MM.json に置くと読み込む。無ければ「未確認」
- 純利益 = 0.8 × 売上 − Apify が差し引く計算費（Analytics の値）− 当社の追加支出（0円）
"""
import csv, datetime, glob, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
TOKEN = os.environ.get("APIFY_TOKEN", "")

def get(url, auth=False):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"} if auth and TOKEN else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["data"]

def public_stats(slug):
    try:
        d = get(f"https://api.apify.com/v2/acts/{slug.replace('/', '~')}")
    except Exception as e:
        return {"error": str(e)[:60]}
    s = d.get("stats") or {}; rs = s.get("publicActorRunStats30Days") or {}
    tot = rs.get("TOTAL") or 0
    bad = sum(rs.get(k) or 0 for k in ("FAILED", "TIMED-OUT", "ABORTED"))
    return {"u7": s.get("totalUsers7Days", 0), "u30": s.get("totalUsers30Days", 0), "users_all": s.get("totalUsers", 0),
            "runs30": tot, "fail_rate30": round(bad / tot, 3) if tot else "", "bookmarks": s.get("bookmarkCount", 0),
            "public": d.get("isPublic")}

def revenue(slug):
    """Console の Analytics の書き出し（JSON）があれば、その月の売上・費用を返す。形式が違えば未確認のまま"""
    name = slug.split("/")[-1]
    files = sorted(glob.glob(os.path.join(DATA, "revenue", f"{name}-*.json")))
    if not files: return None
    try:
        d = json.load(open(files[-1]))
        rev = d.get("revenueUsd") or d.get("revenue")
        cost = d.get("platformCostUsd") or d.get("costs") or d.get("platformCosts")
        paid = d.get("payingUsers") or d.get("paidUsers")
        return {"file": os.path.basename(files[-1]), "revenue_usd": rev, "cost_usd": cost, "paying_users": paid}
    except Exception:
        return None

def main():
    cfg = json.load(open(os.path.join(HERE, "actors.json")))
    today = datetime.date.today().isoformat()
    usage = None
    if TOKEN:
        try:
            u = get("https://api.apify.com/v2/users/me/usage/monthly", auth=True)
            usage = round(u.get("totalUsageCreditsUsdAfterVolumeDiscount", u.get("totalUsageCreditsUsdBeforeVolumeDiscount", 0)) or 0, 4)
        except Exception as e:
            usage = f"error:{str(e)[:40]}"
    rows = []
    for a in cfg["actors"]:
        slug = a["slug"]
        if slug.startswith("OWNER_USERNAME/"):
            rows.append({"date": today, "slug": slug, "status": a["status"], "note": "未公開（Apify にまだ作成していない）"}); continue
        st = public_stats(slug); rv = revenue(slug)
        gross = rv and rv.get("revenue_usd"); cost = rv and rv.get("cost_usd")
        net = round(0.8 * gross - (cost or 0), 4) if isinstance(gross, (int, float)) else "未確認"
        rows.append({"date": today, "slug": slug, "status": a["status"], **st,
                     "paying_users": (rv or {}).get("paying_users", "未確認"), "revenue_usd": gross if gross is not None else "未確認",
                     "platform_cost_usd": cost if cost is not None else "未確認", "net_profit_usd": net,
                     "own_account_usage_usd_month": usage if usage is not None else "未確認（トークンなし）", "note": ""})
    comp = [{"slug": c, **public_stats(c)} for c in cfg.get("competitors", [])]
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, "ledger.csv")
    fields = ["date", "slug", "status", "public", "u7", "u30", "users_all", "runs30", "fail_rate30", "bookmarks", "paying_users",
              "revenue_usd", "platform_cost_usd", "net_profit_usd", "own_account_usage_usd_month", "error", "note"]
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if new: w.writeheader()
        for r in rows: w.writerow(r)
    md = [f"# AgentMint Factory ダッシュボード（{today}）", "",
          "自分の試験実行は公開 API の数に含まれる。売上・利益は Console の Analytics の書き出しが無ければ「未確認」。", "",
          "## 当社の Actor", "", "| 商品 | 状態 | 30日利用者 | 30日実行 | 失敗率 | 有料利用者 | 売上 USD | 費用 USD | 純利益 USD |", "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['slug']} | {r['status']} | {r.get('u30','—')} | {r.get('runs30','—')} | {r.get('fail_rate30','—')} | {r.get('paying_users','—')} | {r.get('revenue_usd','—')} | {r.get('platform_cost_usd','—')} | {r.get('net_profit_usd','—')} |")
    md += ["", "## 競合（公開 API）", "", "| Actor | 30日利用者 | 30日実行 | 失敗率 |", "|---|---|---|---|"]
    for c in comp:
        md.append(f"| {c['slug']} | {c.get('u30','?')} | {c.get('runs30','?')} | {c.get('fail_rate30','?')} |")
    open(os.path.join(DATA, "DASHBOARD.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("\n".join(md))

if __name__ == "__main__":
    main()
