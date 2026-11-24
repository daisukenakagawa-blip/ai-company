# 案3（AI 保守の LTS フォーク）の「空白」を数える：人気の npm パッケージのうち、最新版にも脆弱性が残っている（＝本家に修正版がない）もの
# 使い方: python3 ventures/_gap/lts_gaps.py
# 出力:   workspace/demand-map/lts-gaps-YYYY-MM-DD.md
# 情報源: npm の公式 API（検索・週間ダウンロード・パッケージ情報）、OSV の公式 API（querybatch）。すべて公開・認証不要
# 注意:   ダウンロード数にはミラー・CI の取得が含まれ、利用者数ではない
import json, os, sys, time, datetime, urllib.request, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "demand-map")
WORDS = ["util", "http", "parser", "cli", "test", "date", "string", "array", "stream", "crypto", "xml", "yaml", "request", "promise", "json",
         "file", "path", "color", "log", "config", "url", "server", "express", "react", "webpack", "babel", "eslint", "middleware", "template",
         "validation", "cookie", "proxy", "zip", "image", "markdown", "html", "css", "debug", "async", "glob", "semver", "uuid", "ip", "socket"]
MIN_WEEKLY = 1_000_000

def get(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers={"Content-Type": "application/json"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
        except Exception as e:
            if i == 2: print("fail", url[:80], e, file=sys.stderr); return None
            time.sleep(3)

def main():
    os.makedirs(OUT, exist_ok=True)
    names = set()
    for w in WORDS:
        for off in (0, 250):
            d = get(f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(w)}&size=250&from={off}&popularity=1.0&quality=0.0&maintenance=0.0")
            for o in (d or {}).get("objects", []): names.add(o["package"]["name"])
            time.sleep(0.5)
    print("candidates", len(names), file=sys.stderr)
    plain = sorted(n for n in names if not n.startswith("@"))
    weekly = {}
    for i in range(0, len(plain), 120):
        d = get("https://api.npmjs.org/downloads/point/last-week/" + ",".join(plain[i:i+120])) or {}
        for k, v in d.items():
            if v: weekly[k] = v.get("downloads", 0)
        time.sleep(1)
    # スコープ付き（@x/y）は一括取得できないため対象外（時間がかかりすぎる）
    big = sorted([n for n, v in weekly.items() if v >= MIN_WEEKLY], key=lambda n: -weekly[n])
    print("big", len(big), file=sys.stderr)
    meta = {}
    for n in big:
        v = get("https://registry.npmjs.org/" + n.replace("/", "%2F") + "/latest")  # 最新版だけの軽い情報
        if not v: continue
        meta[n] = {"latest": v.get("version"), "deprecated": v.get("deprecated"), "modified": "", "license": v.get("license") if isinstance(v.get("license"), str) else ""}
        time.sleep(0.1)
    rows = []
    ks = [n for n in big if n in meta and meta[n]["latest"]]
    for i in range(0, len(ks), 500):
        q = {"queries": [{"package": {"name": n, "ecosystem": "npm"}, "version": meta[n]["latest"]} for n in ks[i:i+500]]}
        d = get("https://api.osv.dev/v1/querybatch", q) or {"results": []}
        for n, r in zip(ks[i:i+500], d["results"]):
            ids = [v["id"] for v in r.get("vulns", [])]
            if ids: rows.append((n, ids))
    today = datetime.date.today().isoformat()
    L = [f"# LTS の空白：最新版にも脆弱性が残る人気 npm パッケージ（{today}）", "",
         f"- 候補 {len(names)} 件 → 週{MIN_WEEKLY:,}回以上 {len(big)} 件 → 最新版に OSV の脆弱性が残るもの {len(rows)} 件",
         "- 週間ダウンロードは利用者数ではない。既存の fork・大手（HeroDevs・TuxCare 等）が扱っているかは別途確認", "",
         "| パッケージ | 週間DL | 最新版 | 非推奨 | ライセンス | 脆弱性 |", "|---|---|---|---|---|---|"]
    for n, ids in sorted(rows, key=lambda r: -weekly[r[0]]):
        m = meta[n]
        L.append(f"| [{n}](https://www.npmjs.com/package/{n}) | {weekly[n]:,} | {m['latest']} | {'はい' if m['deprecated'] else ''} | {m['license']} | {', '.join(ids[:4])} |")
    with open(os.path.join(OUT, f"lts-gaps-{today}.md"), "w", encoding="utf-8") as f: f.write("\n".join(L) + "\n")
    print(f"candidates={len(names)} big={len(big)} gaps={len(rows)}")

if __name__ == "__main__":
    main()
