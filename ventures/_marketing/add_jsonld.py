"""店の商品ページに構造化データ（schema.org SoftwareApplication）を入れ、llms.txt を作る。何度実行しても同じ結果になる。
評価・レビューは本物がないため入れない（Google の案内：SoftwareApplication のリッチリザルトには評価が必要。入れなくても構造化データとしては有効）
"""
import json, os, re, html
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOP = os.path.join(ROOT, "ventures/_shop")
HOST = "https://genhayl-shop.pages.dev"
MARK = re.compile(r'\n?<script type="application/ld\+json" id="ld-product">.*?</script>', re.S)
items = []
for slug in sorted(os.listdir(SHOP)):
    p = os.path.join(SHOP, slug, "index.html")
    if slug in ("guide",) or slug.startswith("ops-") or not os.path.isfile(p): continue
    s = open(p, encoding="utf-8").read()
    h1 = re.search(r"<h1>(.*?)</h1>", s, re.S); desc = re.search(r'<meta name="description" content="(.*?)">', s, re.S)
    price = re.search(r'class="price">\s*([\d,]+)円', s)
    if not (h1 and desc and price): print("skip", slug); continue
    name = html.unescape(re.sub("<.*?>", "", h1.group(1))).strip()
    d = html.unescape(desc.group(1)).strip()
    amt = int(price.group(1).replace(",", ""))
    ld = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": name, "description": d,
          "url": f"{HOST}/{slug}/", "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web ブラウザ（Chrome・Safari・Edge・Firefox）", "inLanguage": "ja",
          "offers": {"@type": "Offer", "price": str(amt), "priceCurrency": "JPY", "url": f"{HOST}/{slug}/", "availability": "https://schema.org/InStock"},
          "publisher": {"@type": "Organization", "name": "GENHAYL", "url": HOST + "/"}}
    if os.path.isfile(os.path.join(SHOP, slug, "demo.html")):
        ld["sameAs"] = None; ld.pop("sameAs")
    tag = '\n<script type="application/ld+json" id="ld-product">' + json.dumps(ld, ensure_ascii=False) + "</script>"
    s2 = MARK.sub("", s).replace("</head>", tag + "\n</head>", 1)
    for q in (p, os.path.join(ROOT, "ventures", slug, "index.html")):
        if os.path.isfile(q):
            t = open(q, encoding="utf-8").read()
            if "<h1>" in t: open(q, "w", encoding="utf-8").write(MARK.sub("", t).replace("</head>", tag + "\n</head>", 1))
    items.append((name, slug, amt, d, os.path.isfile(os.path.join(SHOP, slug, "demo.html"))))
lines = ["# GENHAYL の小さな道具", "", "> 名簿・出欠・シフト・宛名・CSV の整理など、事務や教室・サークルの世話役向けの、ブラウザだけで動く道具の店です。データは送信せず、ブラウザの中で処理します。各道具は買い切り（Stripe で決済）で、多くは無料のお試し版があります。", "",
         f"- [使い方ガイド]({HOST}/guide/): Excel だけでできる直し方と、手作業が大変なときの道具の使い方", f"- [特定商取引法に基づく表記]({HOST}/tokushoho.html)", "", "## 道具"]
for name, slug, amt, d, demo in items:
    lines.append(f"- [{name}]({HOST}/{slug}/): {amt}円・買い切り" + (f"、[無料のお試し版]({HOST}/{slug}/demo.html)" if demo else "") + f"。{d[:140]}")
open(os.path.join(SHOP, "llms.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(len(items), "pages")
