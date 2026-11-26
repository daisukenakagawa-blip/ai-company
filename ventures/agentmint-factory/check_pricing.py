"""料金設定と課金イベントの整合性の確認（二重課金の防止）。

各商品の .actor/pricing.json（意図した料金）と、
  ① Apify 上の実際の料金設定（GET /v2/acts/{id} の pricingInfos。要 APIFY_TOKEN）
  ② コードが課金しているイベント（src/*.js の Actor.charge / pushData のイベント名）
を突き合わせる。結果は data/pricing-check.json。不一致があれば終了コード 4。
二重課金の典型：apify-default-dataset-item（データセットへの書き込みで自動課金）と、
同じ出力に対する独自イベント（Actor.charge や pushData(items, 'event')）の両方に価格がある場合。
"""
import glob, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = os.environ.get("APIFY_TOKEN", "")
SYN = {"apify-default-dataset-item", "apify-actor-start"}

def code_events(root):
    ev = set()
    for f in glob.glob(os.path.join(root, "src", "*.js")):
        t = open(f, encoding="utf-8").read()
        consts = dict(re.findall(r"const\s+(\w+)\s*=\s*'([a-z0-9-]+)'", t))
        for m in re.finditer(r"charge\(\{\s*eventName:\s*([\w']+)", t):
            v = m.group(1); ev.add(v.strip("'") if v.startswith("'") else consts.get(v, v))
        for m in re.finditer(r"pushData\([^,()]+,\s*([\w']+)\)", t):
            v = m.group(1); ev.add(v.strip("'") if v.startswith("'") else consts.get(v, v))
    return ev

def actual_pricing(actor_id):
    req = urllib.request.Request(f"https://api.apify.com/v2/acts/{actor_id}", headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)["data"]
    infos = d.get("pricingInfos") or []
    if not infos: return None, d.get("isPublic")
    cur = sorted(infos, key=lambda p: p.get("startedAt") or "")[-1]
    evs = {k: {"price": v.get("eventPriceUsd", (v.get("eventTieredPricingUsd") or {}).get("FREE", {}).get("tieredEventPriceUsd"))}
           for k, v in ((cur.get("pricingPerEvent") or {}).get("actorChargeEvents") or {}).items()}
    return {"model": cur.get("pricingModel"), "events": evs, "startedAt": cur.get("startedAt"),
            "plusUsage": bool(cur.get("isPayPerEventPlusUsage") or cur.get("payPerEventPlusUsage"))}, d.get("isPublic")

def main():
    ids = {a["slug"].split("/")[-1]: a.get("id") for a in json.load(open(os.path.join(HERE, "tracker", "actors.json")))["actors"]}
    out, bad = [], False
    for p in sorted(glob.glob(os.path.join(HERE, "actors", "*", ".actor", "pricing.json"))):
        root = os.path.dirname(os.path.dirname(p)); name = os.path.basename(root)
        want = json.load(open(p)); code = code_events(root)
        r = {"actor": name, "code_charges": sorted(code), "intended": {k: v["priceUsd"] for k, v in want["events"].items()}, "problems": []}
        custom_in_code = code - SYN
        if "apify-default-dataset-item" in want["events"] and custom_in_code:
            r["problems"].append(f"二重課金の恐れ：既定のデータセット課金に加えてコードが {sorted(custom_in_code)} を課金している")
        for e in custom_in_code - set(want["events"]):
            r["problems"].append(f"コードが課金するイベント {e} が料金案に無い")
        if not TOKEN or not ids.get(name):
            r["actual"] = "未確認（トークンか Actor ID が無い）"
        else:
            try:
                act, public = actual_pricing(ids[name]); r["isPublic"] = public
            except Exception as e:
                act = "error"; r["problems"].append(f"Apify から料金設定を読めない: {str(e)[:60]}")
            if act is None:
                r["actual"] = "未設定（無料。公開しても誰にも課金されない）"
            elif act != "error":
                r["actual"] = act
                if act["model"] != want["pricingModel"]: r["problems"].append(f"料金方式が違う：{act['model']}")
                for e in want.get("forbiddenEvents", []):
                    if e in act["events"]: r["problems"].append(f"使わないはずのイベント {e} に価格がある")
                if "apify-default-dataset-item" in act["events"] and (set(act["events"]) - SYN) & code:
                    r["problems"].append("二重課金：既定のデータセット課金と、コードが課金する独自イベントの両方に価格がある")
                for e, v in want["events"].items():
                    a = act["events"].get(e)
                    if a is None and e != "apify-actor-start": r["problems"].append(f"{e} が設定されていない")
                    elif a and v["priceUsd"] and a["price"] is not None and abs(a["price"] - v["priceUsd"]) > 1e-12 and e != "apify-actor-start":
                        r["problems"].append(f"{e} の価格が案と違う：{a['price']}（案 {v['priceUsd']}）")
                if act["plusUsage"] and not want.get("payPerEventPlusUsage"): r["problems"].append("Pay per event + usage が有効になっている")
        r["ok"] = not r["problems"]; bad |= not r["ok"]; out.append(r)
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, "data", "pricing-check.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    sys.exit(4 if bad else 0)

if __name__ == "__main__":
    main()
