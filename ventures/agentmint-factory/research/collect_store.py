"""AgentMint Factory — Phase 1: Apify Store の公開 API（認証不要）から全 Actor を集める。
出力: data/store-YYYY-MM-DD.jsonl（1行1 Actor、必要な項目だけ）
"""
import json, os, sys, time, datetime, urllib.request
OUT = os.path.join(os.path.dirname(__file__), "..", "data")
API = "https://api.apify.com/v2/store?limit=1000&offset={}"

def price_summary(p):
    p = p or {}
    m = p.get("pricingModel") or "FREE"
    out = {"model": m}
    if m == "PAY_PER_EVENT":
        ev = ((p.get("pricingPerEvent") or {}).get("actorChargeEvents") or {})
        prim = None
        for k, e in ev.items():
            if k == "apify-actor-start": continue
            price = e.get("eventPriceUsd")
            if price is None and e.get("eventTieredPricingUsd"):
                price = (e["eventTieredPricingUsd"].get("FREE") or {}).get("tieredEventPriceUsd")
            if e.get("isPrimaryEvent") or prim is None:
                prim = {"event": k, "title": e.get("eventTitle"), "usd": price}
        out["primary"] = prim
    elif m == "PRICE_PER_DATASET_ITEM":
        out["per_1000_usd"] = p.get("pricePerUnitUsd", 0) * 1000 if p.get("pricePerUnitUsd") is not None else None
    elif m == "FLAT_PRICE_PER_MONTH":
        out["monthly_usd"] = p.get("pricePerUnitUsd")
    return out

def main():
    os.makedirs(OUT, exist_ok=True)
    today = datetime.date.today().isoformat()
    path = os.path.join(OUT, f"store-{today}.jsonl")
    off, total, n = 0, None, 0
    with open(path, "w", encoding="utf-8") as f:
        while total is None or off < total:
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(API.format(off), timeout=120) as r:
                        d = json.load(r)["data"]
                    break
                except Exception as e:
                    if attempt == 3: raise
                    time.sleep(5 * (attempt + 1))
            total = d["total"]
            for a in d["items"]:
                s = a.get("stats") or {}
                f.write(json.dumps({
                    "id": a["id"], "slug": f'{a["username"]}/{a["name"]}', "title": a.get("title") or "",
                    "desc": (a.get("description") or "")[:300], "cats": [c for c in (a.get("categories") or []) if c != "RUN"],
                    "verified": a.get("isVerified"), "notice": a.get("notice"),
                    "u7": s.get("totalUsers7Days") or 0, "u30": s.get("totalUsers30Days") or 0, "u90": s.get("totalUsers90Days") or 0,
                    "uall": s.get("totalUsers") or 0, "runs": s.get("totalRuns") or 0,
                    "rating": s.get("actorReviewRating"), "reviews": s.get("actorReviewCount") or 0,
                    "price": price_summary(a.get("currentPricingInfo")),
                }, ensure_ascii=False) + "\n"); n += 1
            off += 1000
            print(f"{min(off,total)}/{total}", file=sys.stderr, flush=True)
            time.sleep(1)
    print(path, n)

if __name__ == "__main__":
    main()
