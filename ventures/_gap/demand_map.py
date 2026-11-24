# GENHAYL Demand Map — 第1段：お金と利用が実際に流れている場所を、公開データから探す
#
# 使い方:  python3 ventures/_gap/demand_map.py
# 出力:    workspace/demand-map/apify-YYYY-MM-DD.md（要約）と .csv（30日利用者50人以上の道具だけ）
#
# 情報源: Apify Store の公開 API（https://api.apify.com/v2/store、認証不要）。1ページ1000件、間を空けて取得する
# 注意:
#  - 利用者数は Apify 上の「その道具を動かした人の数」。購入者数・売上ではない（無料枠の利用も含む）
#  - 他社サイトのデータ取得（スクレイピング）は、需要の手がかりとして数えるだけ。当社がその道具を作るとは限らない（各サイトの規約を守る）
import csv, json, os, statistics, sys, time, datetime, urllib.request, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "demand-map")
API = "https://api.apify.com/v2/store?limit=1000&offset={}"

def fetch_all():
    items, off, total = [], 0, None
    while total is None or off < total:
        for attempt in range(3):
            try:
                with urllib.request.urlopen(API.format(off), timeout=120) as r:
                    d = json.load(r)["data"]
                break
            except Exception as e:
                if attempt == 2: raise
                time.sleep(5)
        total = d["total"]
        for a in d["items"]:
            s = a.get("stats") or {}
            p = a.get("currentPricingInfo") or {}
            items.append({"id": f'{a["username"]}/{a["name"]}', "title": a.get("title") or "", "cats": [c for c in (a.get("categories") or []) if c != "RUN"],
                          "u30": s.get("totalUsers30Days") or 0, "u90": s.get("totalUsers90Days") or 0, "uall": s.get("totalUsers") or 0,
                          "rating": s.get("actorReviewRating"), "reviews": s.get("actorReviewCount") or 0, "pricing": p.get("pricingModel") or "FREE"})
        off += 1000
        print(f"{min(off,total)}/{total}", file=sys.stderr)
        time.sleep(1)
    return items

def main():
    os.makedirs(OUT, exist_ok=True)
    items = fetch_all()
    today = datetime.date.today().isoformat()
    # カテゴリごとの集計
    cat = collections.defaultdict(list)
    for a in items:
        for c in a["cats"]: cat[c].append(a)
    rows = []
    for c, xs in cat.items():
        u = sorted((x["u30"] for x in xs), reverse=True)
        tot = sum(u)
        if tot < 500: continue
        active = sum(1 for v in u if v >= 10)
        top3 = sum(u[:3]) / tot
        rated = [x["rating"] for x in sorted(xs, key=lambda x: -x["u30"])[:10] if x["rating"] and x["reviews"] >= 3]
        rows.append({"cat": c, "actors": len(xs), "active": active, "u30": tot, "u30_per_active": round(tot / max(active, 1)), "top3_share": round(top3, 2),
                     "top10_rating": round(statistics.mean(rated), 2) if rated else None, "paid_share": round(sum(1 for x in xs if x["pricing"] != "FREE") / len(xs), 2)})
    rows.sort(key=lambda r: -r["u30_per_active"])
    # 需要が大きいのに評価が低い道具（不満のしるし）
    unhappy = sorted([a for a in items if a["u30"] >= 300 and a["rating"] is not None and a["reviews"] >= 5 and a["rating"] < 3.8], key=lambda a: -a["u30"])
    with open(os.path.join(OUT, f"apify-{today}.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "title", "users30", "users90", "users_all", "rating", "reviews", "pricing", "categories"])
        for a in sorted(items, key=lambda a: -a["u30"]):
            if a["u30"] >= 50: w.writerow([a["id"], a["title"], a["u30"], a["u90"], a["uall"], a["rating"] and round(a["rating"], 2), a["reviews"], a["pricing"], "|".join(a["cats"])])
    L = [f"# Demand Map：Apify Store（{today}）", "", f"- 道具の数：{len(items)}。30日利用者の合計：{sum(a['u30'] for a in items)}（利用者数であり購入者数ではない）", "",
         "## カテゴリ別（活発な道具1本あたりの30日利用者が多い順＝需要に対して供給が少ない）", "",
         "| カテゴリ | 道具数 | 活発(30日10人以上) | 30日利用者 | 1本あたり | 上位3本の占有 | 上位10本の評価 | 有料の割合 |", "|---|---|---|---|---|---|---|---|"]
    for r in rows[:40]:
        L.append(f"| {r['cat']} | {r['actors']} | {r['active']} | {r['u30']} | {r['u30_per_active']} | {r['top3_share']} | {r['top10_rating']} | {r['paid_share']} |")
    L += ["", "## 利用が多いのに評価が低い道具（30日300人以上・レビュー5件以上・評価3.8未満）", "", "| 道具 | 30日利用者 | 評価 | レビュー | 料金 |", "|---|---|---|---|---|"]
    for a in unhappy[:40]:
        L.append(f"| [{a['title']}](https://apify.com/{a['id']}) | {a['u30']} | {a['rating']:.2f} | {a['reviews']} | {a['pricing']} |")
    with open(os.path.join(OUT, f"apify-{today}.md"), "w", encoding="utf-8") as f: f.write("\n".join(L) + "\n")
    print(f"actors={len(items)} cats={len(rows)} unhappy={len(unhappy)}")

if __name__ == "__main__":
    main()
