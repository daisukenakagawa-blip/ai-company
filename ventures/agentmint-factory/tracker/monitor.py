"""AgentMint Factory — 公開商品の継続監視（2026-11-27 オーナー指示）。

公開日を起点に、毎日1行を data/monitor.csv に足し、1・3・7・14・30日目の値を data/MONITOR.md にまとめる。
使い方:  python3 tracker/monitor.py   （track.py の後に実行。ledger.csv の当日の行を使う）

記録するもの（架空の数字は書かない）
- 外部利用者・外部実行（30日）：ledger.csv（公開統計 − 自分の試験。track.py が計算）。取れなければ「計測不能」
- 有料利用・売上・純利益：公式 API が無い。Console の Analytics の書き出しが無ければ「未確認」
- 検索掲載：Apify Store の公開検索 API（/v2/store?search=）で、検索語ごとの順位（上位200件に無ければ「圏外」）
- 利用者からの評価：レビュー数・平均点・ブックマーク数（公開 API）
- 競合との比較：同じ検索語の上位の競合の30日利用者
- AI による利用か人による利用か：Apify の公開統計では区別できないので「不明」
"""
import csv, datetime, json, os, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
MILESTONES = [1, 3, 7, 14, 30]
# 公開した商品ごとの公開日と、利用者が探しそうな検索語（Store・MCP の search-actors は同じ検索を使う）
PUBLISHED = {
    "preponderant_swift/dataset-merge-dedup": {
        "published": "2026-11-27",
        "queries": ["merge datasets", "deduplicate dataset", "dataset dedup", "remove duplicates", "merge dedup"],
    },
}
FIELDS = ["date", "slug", "day", "external_users30", "external_runs30", "users_all", "paying_users", "revenue_usd", "net_profit_usd",
          "reviews", "rating", "bookmarks", "ranks", "top_competitor", "ai_or_human", "status"]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as r:
        return json.load(r)["data"]


def rank(slug, query):
    """Store 検索での順位（1始まり）。上位200件に無ければ「圏外」、失敗は「計測不能」"""
    try:
        for offset in (0, 100):
            items = get(f"https://api.apify.com/v2/store?search={urllib.parse.quote(query)}&limit=100&offset={offset}")["items"]
            for i, it in enumerate(items):
                if f"{it.get('username')}/{it.get('name')}" == slug:
                    return offset + i + 1, items
            if len(items) < 100:
                break
        return "圏外", items if offset == 0 else []
    except Exception:
        return "計測不能", []


def ledger_row(slug, date):
    """track.py が今回書いた行（ledger の日付は実行環境の日付なので、JST の日付とずれることがある → 直近2日以内の最新行）"""
    p = os.path.join(DATA, "ledger.csv")
    if not os.path.exists(p):
        return None
    lim = (datetime.date.fromisoformat(date) - datetime.timedelta(days=1)).isoformat()
    rows = [r for r in csv.DictReader(open(p, encoding="utf-8")) if r["slug"] == slug and r["date"] >= lim]
    return rows[-1] if rows else None


def main():
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date().isoformat()  # JST の日付
    out = os.path.join(DATA, "monitor.csv")
    old = list(csv.DictReader(open(out, encoding="utf-8"))) if os.path.exists(out) else []
    old = [r for r in old if r["date"] != today]  # 同じ日に2回動いたら上書き
    new = []
    for slug, cfg in PUBLISHED.items():
        day = (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(cfg["published"])).days
        try:
            a = get(f"https://api.apify.com/v2/acts/{slug.replace('/', '~')}")
            st = a.get("stats") or {}
            reviews, rating, bookmarks, status = st.get("actorReviewCount", 0), st.get("actorReviewRating", 0), st.get("bookmarkCount", 0), "ok"
            users_all = st.get("totalUsers", "")
        except Exception as e:
            reviews = rating = bookmarks = users_all = "計測不能"; status = f"計測不能: {str(e)[:60]}"
        ranks, top = [], ""
        for q in cfg["queries"]:
            r, items = rank(slug, q)
            ranks.append(f"{q}={r}")
            if not top and items:
                c = items[0]
                top = f"{c.get('username')}/{c.get('name')} ({(c.get('stats') or {}).get('totalUsers30Days', '?')}人/30日)"
        lr = ledger_row(slug, today)
        new.append({"date": today, "slug": slug, "day": day,
                    "external_users30": lr["external_users30"] if lr else "計測不能",
                    "external_runs30": lr["external_runs30"] if lr else "計測不能",
                    "users_all": users_all,
                    "paying_users": lr["paying_users"] if lr else "未確認",
                    "revenue_usd": lr["revenue_usd"] if lr else "未確認",
                    "net_profit_usd": lr["net_profit_usd"] if lr else "未確認",
                    "reviews": reviews, "rating": rating, "bookmarks": bookmarks,
                    "ranks": "; ".join(ranks), "top_competitor": top, "ai_or_human": "不明（公開統計では区別できない）", "status": status})
    rows = sorted(old + new, key=lambda r: (r["slug"], r["date"]))
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)

    md = ["# 公開商品の継続監視", "",
          "公開日を起点に 1・3・7・14・30日目の値。外部＝公開統計から自分（オーナー・AI の試験）の実行を引いた数。検索ボットや脆弱性探しは Apify の実行に現れない。",
          "AI による利用か人による利用かは、Apify の公開統計では区別できないため「不明」。取得に失敗した日は「計測不能」（0人とは書かない）。", ""]
    for slug, cfg in PUBLISHED.items():
        md += [f"## {slug}（公開 {cfg['published']}）", "",
               "| 日目 | 日付 | 外部利用者(30日) | 外部実行(30日) | 有料利用者 | 売上 USD | 純利益 USD | 評価（件・平均） | ブックマーク | 検索順位 | 検索1位の競合 |",
               "|---|---|---|---|---|---|---|---|---|---|---|"]
        mine = {int(r["day"]): r for r in rows if r["slug"] == slug}
        for m in MILESTONES:
            r = mine.get(m)
            if r:
                md.append(f"| {m} | {r['date']} | {r['external_users30']} | {r['external_runs30']} | {r['paying_users']} | {r['revenue_usd']} | {r['net_profit_usd']} | {r['reviews']}・{r['rating']} | {r['bookmarks']} | {r['ranks']} | {r['top_competitor']} |")
            else:
                due = (datetime.date.fromisoformat(cfg["published"]) + datetime.timedelta(days=m)).isoformat()
                md.append(f"| {m} | {due} | " + ("計測不能（この日の記録なし）" if due < today else "（未到来）") + " | | | | | | | | |")
        last = max(mine) if mine else None
        if last is not None and last not in MILESTONES:
            r = mine[last]
            md += ["", f"最新（{last}日目・{r['date']}）：外部利用者 {r['external_users30']}、外部実行 {r['external_runs30']}、検索 {r['ranks']}"]
        md.append("")
    open(os.path.join(DATA, "MONITOR.md"), "w", encoding="utf-8").write("\n".join(md))
    print("\n".join(md))


if __name__ == "__main__":
    main()
