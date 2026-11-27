"""x402 Bazaar の需要計測（Ver.3.0 実証B の下調べ。2026-11-28 オーナー承認。0円・登録不要）。

Coinbase の公開の discovery API（API キー不要、docs.cdp.coinbase.com/x402/bazaar）から掲載サービスを全件読み、
直近30日の呼び出し数（quality.l30DaysTotalCalls）と支払った相手の数（quality.l30DaysUniquePayers）を
分野別に集計する。外部への登録・支払いはしない。読むだけ。

使い方:  python3 ventures/_gap/x402_bazaar.py            （ネットから取得）
         python3 ventures/_gap/x402_bazaar.py --file x.json （保存した応答で集計、試験用）
出力:    workspace/market-gaps/x402/bazaar-YYYY-MM-DD.md と .json
注意：数字は Coinbase の公表値。自社の支払いは含めない（当社はまだ支払っていない）。
"""
import json, os, re, sys, time, datetime, urllib.request, urllib.parse

API = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "market-gaps", "x402")
# 当社の既存機能に近い分野（重複除去・整形・変換）と、その他の分野の見分け
FIELDS = {
    "データ整形・重複除去・変換": r"dedup|duplicate|merge|csv|xlsx|excel|spreadsheet|convert|transform|clean|normaliz|table|json to|to json",
    "検索・Web 取得": r"search|scrap|crawl|serp|web page|browse|fetch",
    "金融・暗号資産": r"price|token|crypto|swap|defi|wallet|trading|market data|stock|onchain|on-chain",
    "AI 生成（文章・画像）": r"llm|gpt|image gen|generate|completion|chat|summar|translat",
    "天気・地図・その他データ": r"weather|geo|map|news|sports",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "genhayl-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_all(limit=100, max_pages=600):
    items, offset = [], 0
    for _ in range(max_pages):
        d = get(API + "?" + urllib.parse.urlencode({"type": "http", "limit": limit, "offset": offset}))
        page = d.get("items", [])
        items += page
        total = (d.get("pagination") or {}).get("total")
        offset += len(page)
        if not page or (total is not None and offset >= total):
            break
        time.sleep(0.5)  # 過負荷を避ける
    return items


def field_of(it):
    text = " ".join(str(it.get(k) or "") for k in ("description", "serviceName", "resource")) + " " + " ".join(it.get("tags") or [])
    text = text.lower()
    for name, pat in FIELDS.items():
        if re.search(pat, text):
            return name
    return "その他"


USDC = {"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # Base
        "0x036cbd53842c5426634e7929541ec2318f3dcf7e",  # Base Sepolia（試験網）
        "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v",  # Solana（小文字化）
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}  # Ethereum


def usd(it):
    # v2 は accepts[].amount（USDC は小数6桁）、v1 は maxAmountRequired。USDC 以外・不明は None
    for a in it.get("accepts") or []:
        asset = str(a.get("asset") or "").lower()
        if asset and asset not in USDC:
            continue  # USDC 以外（桁が違う）は金額に換算しない
        v = a.get("amount", a.get("maxAmountRequired"))
        try:
            x = int(v) / 1e6
        except (TypeError, ValueError):
            continue
        if x <= 100:  # 1回100ドル超は異常値として扱わない
            return x
    return None


def summarize(items):
    rows = []
    for it in items:
        q = it.get("quality") or {}
        rows.append({"field": field_of(it), "service": it.get("serviceName") or "", "resource": it.get("resource"),
                     "calls30": q.get("l30DaysTotalCalls") or 0, "payers30": q.get("l30DaysUniquePayers") or 0,
                     "usd": usd(it), "curated": bool(it.get("curated"))})
    agg = {}
    for r in rows:
        a = agg.setdefault(r["field"], {"services": 0, "with_payers": 0, "payers2plus": 0, "payers10plus": 0, "calls30": 0, "payers30": 0, "est_usd30": 0.0})
        a["services"] += 1
        a["with_payers"] += r["payers30"] > 0
        a["payers2plus"] += r["payers30"] >= 2  # 支払い元1つだけ＝作者自身の試験の可能性が高い
        a["payers10plus"] += r["payers30"] >= 10
        a["calls30"] += r["calls30"]
        a["payers30"] += r["payers30"]
        if r["usd"] is not None:
            a["est_usd30"] += r["usd"] * r["calls30"]
    return rows, agg


def write(rows, agg, day):
    os.makedirs(OUT, exist_ok=True)
    json.dump({"date": day, "count": len(rows), "by_field": agg, "rows": rows},
              open(os.path.join(OUT, f"bazaar-{day}.json"), "w"), ensure_ascii=False, indent=1)
    L = [f"# x402 Bazaar の需要（{day}、Coinbase の公開 discovery API）", "",
         f"- 掲載サービス {len(rows)} 件。数字は Coinbase の公表値（直近30日）。推定売上＝1回の価格×呼び出し数（上限の目安。自分への支払い・試験を含む可能性がある）",
         "- 「支払った相手の数」は別々の支払い元のアドレスの数で、利用者の数・企業の数ではない。支払い元が1つだけのサービスは、作者自身の試験の可能性が高い（推測）", "",
         "| 分野 | サービス数 | 支払い元1以上 | 2以上 | 10以上 | 30日の呼び出し | 30日の支払い元 | 推定売上（30日、USD、USDC のみ） |", "|---|---|---|---|---|---|---|---|"]
    for k, a in sorted(agg.items(), key=lambda x: -x[1]["payers30"]):
        L.append(f"| {k} | {a['services']} | {a['with_payers']} | {a['payers2plus']} | {a['payers10plus']} | {a['calls30']} | {a['payers30']} | {a['est_usd30']:.2f} |")
    L += ["", "## 支払い元の多い上位20件", "", "| 分野 | サービス | 価格 USD | 30日の呼び出し | 30日の支払い元 | URL |", "|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: -r["payers30"])[:20]:
        L.append(f"| {r['field']} | {r['service'][:40]} | {r['usd'] if r['usd'] is not None else '不明'} | {r['calls30']} | {r['payers30']} | {r['resource']} |")
    L += ["", "## 当社の機能に近い分野（データ整形・重複除去・変換）", ""]
    near = [r for r in rows if r["field"] == "データ整形・重複除去・変換"]
    L += [f"- {r['service'][:50]}｜{r['usd']}｜呼び出し {r['calls30']}｜支払い元 {r['payers30']}｜{r['resource']}" for r in sorted(near, key=lambda r: -r["payers30"])[:30]] or ["- 該当なし"]
    open(os.path.join(OUT, f"bazaar-{day}.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    return os.path.join(OUT, f"bazaar-{day}.md")


def main():
    day = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
    if "--file" in sys.argv:
        d = json.load(open(sys.argv[sys.argv.index("--file") + 1]))
        items = d.get("items", d.get("resources", []))
    else:
        try:
            items = fetch_all()
        except Exception as e:
            print(f"取得できない：{type(e).__name__} {e}（実行環境の許可サイトに api.cdp.coinbase.com が必要）")
            sys.exit(2)
    rows, agg = summarize(items)
    print(write(rows, agg, day), len(rows), "件")


if __name__ == "__main__":
    main()
