"""Phase 1 分析：他社サイトのデータ取得ではなく、手元の計算だけで提供できる道具の分野ごとに、需要と競合を数える。"""
import json, re, sys, statistics, collections
src = sys.argv[1]
xs = [json.loads(l) for l in open(src)]
# 分野（題名・説明・slug の正規表現）。外部の有料 API や他社サイトの取得が要らないものだけ
CLUSTERS = {
 "email-verify(MX/SMTP)": r"email (verif|valid|check)|verify email|bounce",
 "phone-validate(offline)": r"phone (number )?(valid|format|pars)|libphonenumber|e\.?164",
 "dataset-merge/dedup/transform": r"dedup|merge datasets|dataset transform|transform dataset|json to csv|csv to json|dataset (merge|clean)",
 "image-convert/compress/resize": r"image (convert|compress|resiz|optimi)|webp|png to|jpg to|heic",
 "pdf-tools(merge/split/convert)": r"pdf (merge|split|compress|convert|to )|merge pdf|html to pdf|pdf generator|url to pdf",
 "ocr(local)": r"\bocr\b|image to text",
 "screenshot": r"screenshot",
 "domain-availability/whois/rdap/dns": r"whois|rdap|domain availab|dns (look|check|record)|mx record",
 "ssl/security-headers check": r"ssl (check|cert)|security headers|tls check",
 "qr/barcode": r"qr code|barcode",
 "text-utils(lang detect/sentiment/keywords offline)": r"language detect|sentiment|keyword extract|text summar|readability",
 "address-parse/normalize": r"address (pars|normal|valid|standard)|geocod",
 "url-utils(redirect/broken links/status)": r"broken link|redirect (check|chain|trac)|http status|link check|url (expand|unshort)",
 "sitemap/robots": r"sitemap|robots\.txt",
 "html-to-markdown/text": r"html to (markdown|text)|markdown convert|to markdown",
 "data-validation(iban/vat/json schema)": r"\biban\b|vat (number|valid)|json schema|validator",
 "file/format convert(xlsx/xml/yaml)": r"xlsx|excel (to|convert)|xml to|yaml|parquet",
 "rss/feed": r"\brss\b|atom feed|feed (gen|pars)",
 "hash/encode/utils": r"base64|hash|uuid|encoder|decoder",
 "favicon/meta/og tags": r"favicon|open graph|og tags|meta tags",
 "tech-stack detect": r"tech(nology)? stack|wappalyzer|builtwith",
 "accessibility/lighthouse audit": r"lighthouse|accessibility|a11y|seo audit|core web vitals",
}
out = []
for name, rx in CLUSTERS.items():
    r = re.compile(rx, re.I)
    m = [x for x in xs if r.search(x["title"] + " " + x["desc"] + " " + x["slug"])]
    if not m: continue
    m.sort(key=lambda x: -x["u30"])
    tot = sum(x["u30"] for x in m)
    active = [x for x in m if x["u30"] >= 5]
    prices = [x["price"].get("primary", {}) and x["price"]["primary"].get("usd") for x in m[:15]]
    prices = [p for p in prices if p]
    out.append({"cluster": name, "actors": len(m), "active_u30ge5": len(active), "u30_total": tot,
                "top1": m[0]["slug"], "top1_u30": m[0]["u30"], "top1_share": round(m[0]["u30"] / tot, 2) if tot else 0,
                "top3_share": round(sum(x["u30"] for x in m[:3]) / tot, 2) if tot else 0,
                "u30_per_active": round(tot / max(len(active), 1)),
                "median_primary_price_usd_top15": statistics.median(prices) if prices else None,
                "free_in_top10": sum(1 for x in m[:10] if x["price"]["model"] == "FREE"),
                "top10": [(x["slug"], x["u30"], x["reviews"], round(x["rating"] or 0, 1), x["price"]["model"],
                           (x["price"].get("primary") or {}).get("usd")) for x in m[:10]]})
out.sort(key=lambda r: -r["u30_total"])
json.dump(out, open(src.replace(".jsonl", "-clusters.json"), "w"), ensure_ascii=False, indent=1)
for r in out:
    print(f'{r["cluster"]:52s} actors={r["actors"]:5d} active={r["active_u30ge5"]:4d} u30={r["u30_total"]:6d} perActive={r["u30_per_active"]:4d} top1={r["top1_share"]} top3={r["top3_share"]} price={r["median_primary_price_usd_top15"]} free10={r["free_in_top10"]}')
