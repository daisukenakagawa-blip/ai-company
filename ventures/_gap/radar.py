"""Market Change Radar（2026-11-28 オーナー指示：市場の変化から新規需要を発見する仕組みの強化）。費用0円の収集係。

監視する変化（CATEGORIES の12種）を、規約で許された無料の公開 API から集め、重複を除いて保存する。評価（誰が困り、何に払うか）は
ops/agents/run.py の radar_analyze（有料 AI、予算管理を通す）と、毎朝の Claude（一次資料・競合・価格の確認）が行う。

情報源（どれも公式の公開 API。取得に失敗しても他は続ける。失敗は記録に残し「0件」とは書かない）
- Hacker News（Algolia の公開検索 API）：発表・利用者の反応（点数・コメント数）・不満・「代わりはある？」の質問
- endoflife.date（公開 API）：ソフトウェアのサポート終了日（180日以内）
- Federal Register（米国官報の公開 API）：新しい規則（AI・プライバシー・決済・電子商取引）
- GitHub の公開 Issue：既存の ventures/_gap/scan.py の出力（signals-*.json）を取り込む

出力
- workspace/market-gaps/radar/radar-YYYY-MM-DD.jsonl：今回はじめて見た手がかり（1行1件）
- workspace/market-gaps/radar/seen.json：見た手がかりの id（重複除去。積み上がるデータ資産）
- workspace/market-gaps/radar/sources-YYYY-MM-DD.json：情報源ごとの件数と失敗
使い方：python3 ventures/_gap/radar.py [日数=3]
"""
import datetime, glob, hashlib, json, os, sys, time, urllib.parse, urllib.request

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "market-gaps", "radar")
TODAY = datetime.date.today()
UA = {"User-Agent": "GENHAYL-market-radar/1.0 (research; contact via github.com/daisukenakagawa-blip)"}

# 監視する変化 → Hacker News での検索語（題名・本文の言い回し）
CATEGORIES = {
    "service_shutdown": ["shutting down", "is shutting down", "sunsetting", "end of service", "discontinued"],
    "api_deprecation": ["API deprecated", "API sunset", "API shutdown", "deprecating the API", "API will be removed"],
    "api_pricing": ["API pricing", "API price increase", "now charging for API", "API no longer free"],
    "free_plan_removed": ["free tier", "free plan removed", "no longer free", "ending free plan"],
    "software_eol": ["end of life", "EOL", "end of support", "no longer supported"],
    "terms_change": ["terms of service change", "new terms", "license change", "relicense"],
    "regulation": ["new regulation", "new law", "EU AI Act", "compliance deadline", "FTC rule"],
    "new_ai_tech": ["launches API", "new model API", "agent API", "MCP server"],
    "new_marketplace": ["marketplace launch", "app store for agents", "new marketplace", "plugin store"],
    "user_complaints": ["alternative to", "frustrated with", "moving away from", "migrating off"],
    "supply_shortage": ["Ask HN: is there a", "Ask HN: looking for", "wish there was", "no good tool for"],
    "agent_commerce": ["agent payments", "agentic commerce", "x402", "AI agents buy", "machine payments"],
}
REG_TERMS = ["artificial intelligence", "privacy", "payments", "e-commerce", "data broker"]


def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def rid(*parts):
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def from_hn(since_ts):
    out, errs = [], []
    for cat, terms in CATEGORIES.items():
        for t in terms:
            q = urllib.parse.urlencode({"query": t, "tags": "story", "numericFilters": f"created_at_i>{since_ts}", "hitsPerPage": 30})
            try:
                hits = get(f"https://hn.algolia.com/api/v1/search_by_date?{q}")["hits"]
            except Exception as e:
                errs.append(f"hn:{t}: {type(e).__name__}"); continue
            for h in hits:
                title = h.get("title") or ""
                if t.lower().split(":")[-1].strip() not in title.lower() and cat not in ("supply_shortage", "user_complaints"):
                    continue  # 本文だけの一致は雑音が多いので、題名に語があるものに限る
                out.append({"id": rid("hn", h["objectID"]), "category": cat, "source": "hackernews", "title": title,
                            "url": h.get("url") or f"https://news.ycombinator.com/item?id={h['objectID']}",
                            "discussion": f"https://news.ycombinator.com/item?id={h['objectID']}", "hn_id": h["objectID"],
                            "points": h.get("points") or 0, "comments": h.get("num_comments") or 0,
                            "created": h.get("created_at", "")[:10], "matched": t})
            time.sleep(0.3)
    return out, errs


def from_eol(days_ahead=180):
    # v1 API の一括取得（1回の呼び出しで全製品。製品ごとに数百回呼ばない）
    try:
        products = get("https://endoflife.date/api/v1/products/full", timeout=60).get("result", [])
    except Exception as e:
        return [], [f"eol:full: {type(e).__name__}"]
    out, limit = [], TODAY + datetime.timedelta(days=days_ahead)
    for p in products:
        name = p.get("name", "")
        for c in p.get("releases", []) or []:
            eol = c.get("eolFrom") or c.get("eol")
            if isinstance(eol, str) and len(eol) == 10:
                try:
                    d = datetime.date.fromisoformat(eol)
                except ValueError:
                    continue
                if TODAY <= d <= limit:
                    out.append({"id": rid("eol", name, str(c.get("name")), eol), "category": "software_eol", "source": "endoflife.date",
                                "title": f"{p.get('label', name)} {c.get('name')} のサポート終了 {eol}", "url": f"https://endoflife.date/{name}",
                                "eol": eol, "extended_support": c.get("eoesFrom"), "created": TODAY.isoformat()})
    return out, ([] if products else ["eol: 製品が0件（形式の変更？）"])


def from_federal_register(since):
    out, errs = [], []
    for t in REG_TERMS:
        q = urllib.parse.urlencode({"conditions[term]": t, "conditions[type][]": "RULE", "conditions[publication_date][gte]": since,
                                    "per_page": 20, "order": "newest"}, doseq=True)
        try:
            docs = get(f"https://www.federalregister.gov/api/v1/documents.json?{q}").get("results", [])
        except Exception as e:
            errs.append(f"fr:{t}: {type(e).__name__}"); continue
        for d in docs:
            out.append({"id": rid("fr", d["document_number"]), "category": "regulation", "source": "federalregister",
                        "title": d.get("title", ""), "url": d.get("html_url", ""), "agencies": [a.get("name") for a in d.get("agencies", [])][:3],
                        "effective": d.get("effective_on"), "created": d.get("publication_date"), "matched": t})
    return out, errs


def from_github_signals():
    files = sorted(glob.glob(os.path.join(ROOT, "workspace", "market-gaps", "signals-*.json")))
    if not files:
        return [], ["github: signals-*.json が無い"]
    sig = json.load(open(files[-1], encoding="utf-8"))
    out = []
    for n in sig.get("names", [])[:80]:
        out.append({"id": rid("gh", n["name"], os.path.basename(files[-1])[8:18]), "category": "github_issues", "source": "github",
                    "title": f"{n['name']}（{'・'.join(n['kinds'])}、{n['distinct_repos']} リポジトリ）", "url": (n.get("examples") or [{}])[0].get("url", ""),
                    "repos": n["distinct_repos"], "examples": [e.get("title") for e in n.get("examples", [])[:3]], "created": TODAY.isoformat()})
    return out, []


def main():
    os.makedirs(OUT, exist_ok=True)
    seen_p = os.path.join(OUT, "seen.json")
    seen = set(json.load(open(seen_p)) if os.path.exists(seen_p) else [])
    since = TODAY - datetime.timedelta(days=DAYS)
    since_ts = int(datetime.datetime.combine(since, datetime.time(), datetime.timezone.utc).timestamp())
    report, new = {}, []
    for name, fn in (("hackernews", lambda: from_hn(since_ts)), ("endoflife", from_eol),
                     ("federalregister", lambda: from_federal_register(since.isoformat())), ("github", from_github_signals)):
        try:
            items, errs = fn()
        except Exception as e:
            items, errs = [], [f"{name}: {type(e).__name__}: {e}"]
        fresh = []
        for it in items:
            if it["id"] in seen:
                continue
            seen.add(it["id"]); it["seen_at"] = TODAY.isoformat(); fresh.append(it)
        new += fresh
        report[name] = {"fetched": len(items), "new": len(fresh), "errors": errs[:10], "measurable": not (errs and not items)}
    with open(os.path.join(OUT, f"radar-{TODAY}.jsonl"), "a", encoding="utf-8") as f:
        for it in new:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    json.dump(sorted(seen), open(seen_p, "w"))
    json.dump({"date": TODAY.isoformat(), "days": DAYS, "sources": report, "new_total": len(new)},
              open(os.path.join(OUT, f"sources-{TODAY}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"new_total": len(new), **{k: (v["fetched"], v["new"], len(v["errors"])) for k, v in report.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
