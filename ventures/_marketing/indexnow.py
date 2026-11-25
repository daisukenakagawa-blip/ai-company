"""IndexNow で、店の新しい・変わったページを検索エンジン（Bing・Yandex・Naver・Seznam・Yep など）に知らせる。
GitHub Actions（.github/workflows/shop-growth.yml）から実行する（この実行環境からは api.indexnow.org に接続できない）。
送るのは店（genhayl-shop.pages.dev）の URL だけ。sitemap.xml の lastmod が前回の送信より新しいものだけを送る。
403・422・429 が返ったら止めて記録する（2026-11-25 オーナー承認：AI の判断で実行してよい）。
"""
import json, os, re, sys, urllib.request, urllib.error, datetime
HOST = "genhayl-shop.pages.dev"
KEY = "ab621d3c9922c75eebbcfe39798e9afd"
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, "..", ".."))
STATE = os.path.join(BASE, "indexnow_state.json")
LOG = os.path.join(BASE, "indexnow_log.md")

def main():
    sm = open(os.path.join(ROOT, "ventures/_shop/sitemap.xml"), encoding="utf-8").read()
    urls = re.findall(r"<url><loc>(https://%s/[^<]*)</loc>(?:<lastmod>([0-9-]+)</lastmod>)?" % re.escape(HOST), sm)
    st = json.load(open(STATE)) if os.path.exists(STATE) else {"sent": {}, "stopped": ""}
    if st.get("stopped"):
        print("停止中:", st["stopped"]); return 0
    todo = [u for u, lm in urls if st["sent"].get(u, "") < (lm or "0")]
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    if not todo:
        print("送る URL なし"); return 0
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": todo[:10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        code = urllib.request.urlopen(req, timeout=30).status
    except urllib.error.HTTPError as e:
        code = e.code
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"| {today} | {len(todo)} | {code} |\n")
    print("IndexNow", code, len(todo))
    if code in (200, 202):
        lm = dict(urls)
        for u in todo: st["sent"][u] = lm.get(u) or today
    elif code in (403, 422, 429):
        st["stopped"] = f"{today} HTTP {code}（公式の停止条件。原因を確かめてから state の stopped を消す）"
    json.dump(st, open(STATE, "w"), ensure_ascii=False, indent=0)
    return 0

if __name__ == "__main__":
    sys.exit(main())
