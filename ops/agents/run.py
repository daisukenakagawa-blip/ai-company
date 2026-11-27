"""Phase C：役割ごとの AI（2026-11-27 Ver.2.0）。必要な場面でだけ AI を呼ぶ、イベント駆動の小さな実行係。

方針
- 集計・監視・データ取得はプログラム（費用0円）。AI は「判断・文章・分類」にだけ使う
- 有料 API は ops/ai_budget/budget.py の guarded_call() だけを通す（直接呼ばない）
- 予算は売上に近い仕事から使う（priority high＝既存商品が見つかる・買われるための仕事）
- AI の出力は「提案ファイル」。外部への公開・価格の変更・投稿はしない（オーナー承認制）。実績・数字は作らせない

役割（ROLES）：model は料金表のキー。モデルは難しさで使い分ける（1円あたりの成果を最大にする）
使い方：python3 ops/agents/run.py <job>   （job: listing_review / gap_triage）
"""
import datetime, json, os, sys, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ops", "ai_budget"))
import budget  # noqa: E402

OUT = os.path.join(ROOT, "ops", "agents", "out")
ROLES = {
    "ceo":       {"purpose": "planning",    "model": "claude-opus-5-5",   "max_tokens": 3000},
    "research":  {"purpose": "research",    "model": "claude-haiku-5-5",  "max_tokens": 4000},
    "product":   {"purpose": "planning",    "model": "claude-sonnet-5-5", "max_tokens": 4000},
    "developer": {"purpose": "development", "model": "claude-sonnet-5-5", "max_tokens": 8000},
    "marketing": {"purpose": "marketing",   "model": "claude-sonnet-5-5", "max_tokens": 4000},
    "qa":        {"purpose": "qa",          "model": "claude-haiku-5-5",  "max_tokens": 2000},
    "finance":   {"purpose": "reporting",   "model": "claude-haiku-5-5",  "max_tokens": 1500},
}
RULES = ("あなたは GENHAYL AIカンパニーの社員です。日本語で、事実と推測を分けて書きます。"
         "渡されたデータに無い数字・実績・利用者の声は作りません。外部への公開・投稿・価格変更は提案に留めます。")


def ask(client, division, role, task, prompt, priority="normal", tools=None, max_searches=0):
    r = ROLES[role]
    resp = budget.guarded_call(client, division=division, purpose=r["purpose"], priority=priority, model=r["model"], max_tokens=r["max_tokens"],
                               task=f"{role}:{task}", system=[{"type": "text", "text": RULES, "cache_control": {"type": "ephemeral"}}],
                               messages=[{"role": "user", "content": prompt}], tools=tools, max_searches=max_searches)
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")


def _get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)["data"]


def save(name, text, meta):
    os.makedirs(OUT, exist_ok=True)
    day = datetime.date.today().isoformat()
    p = os.path.join(OUT, f"{day}-{name}.md")
    with open(p, "w", encoding="utf-8") as f:
        f.write(f"<!-- {json.dumps(meta, ensure_ascii=False)} -->\n{text}\n")
    return p


# ---- 仕事1：Marketing AI — 公開商品の掲載の見直し（売上に一番近い。priority high） ----
def listing_review(client, slug="preponderant_swift/dataset-merge-dedup", queries=("merge datasets", "deduplicate", "remove duplicates", "dedup")):
    mine = _get(f"https://api.apify.com/v2/acts/{slug.replace('/', '~')}")
    build = _get(f"https://api.apify.com/v2/acts/{slug.replace('/', '~')}/builds/default")
    comp = {}
    for q in queries:
        for it in _get(f"https://api.apify.com/v2/store?search={urllib.parse.quote(q)}&limit=8")["items"]:
            key = f"{it['username']}/{it['name']}"
            comp.setdefault(key, {"title": it.get("title"), "description": (it.get("description") or "")[:300],
                                  "users30": (it.get("stats") or {}).get("totalUsers30Days"), "queries": []})["queries"].append(q)
    data = {"mine": {"title": mine.get("title"), "description": mine.get("description"), "seoTitle": mine.get("seoTitle"),
                     "stats": mine.get("stats"), "readme_head": (build.get("readme") or "")[:3500]},
            "store_results": comp}
    prompt = ("Apify Store で当社の Actor が検索に出ず、外部の利用者が0です。下のデータ（公開 API で取得）だけを根拠に、"
              "(1) 検索に出ない・選ばれない原因の仮説（データの根拠つき）、(2) 題名・説明・SEO 題名・README 冒頭の具体的な書き換え案"
              "（英語、Apify の文字数の目安を守る）、(3) 競合に対する差別化の一文、(4) やってはいけないこと（誇張・他社名の不当な使用）を書いてください。"
              "数字はデータにあるものだけ使ってください。\n\n" + json.dumps(data, ensure_ascii=False)[:20000])
    text = ask(client, "d1", "marketing", "listing_review", prompt, priority="high")
    return save("listing-review", text, {"job": "listing_review", "slug": slug, "inputs": "Apify public API"})


# ---- 仕事2：Research AI — Gap Engine の手がかりの一次選別（安いモデルで件数をさばく） ----
def gap_triage(client):
    d = os.path.join(ROOT, "workspace", "market-gaps")
    files = sorted(f for f in os.listdir(d) if f.startswith("signals-") and f.endswith(".json"))
    if not files:
        return None
    sig = json.load(open(os.path.join(d, files[-1]), encoding="utf-8"))
    rows = [{"name": n["name"], "kinds": n["kinds"], "repos": n["distinct_repos"], "examples": [e["title"] for e in n["examples"][:2]]}
            for n in sig["names"][:60]]
    prompt = ("GitHub の公開 Issue から機械的に集めた『サービス終了・API 廃止・値上げ・移行先さがし』の手がかりです。"
              "各行を A（有料の外部サービスの変化で、利用者の業務や売上が止まりうる）/B（要確認）/C（雑音：自社コードの内部の話・一覧への追加依頼など）に分け、"
              "A と B だけ、一次資料で確かめるべき点を1行で書いてください。表で出力。\n\n" + json.dumps(rows, ensure_ascii=False))
    text = ask(client, "d1", "research", "gap_triage", prompt, priority="normal")
    return save("gap-triage", text, {"job": "gap_triage", "source": files[-1]})


JOBS = {"listing_review": listing_review, "gap_triage": gap_triage}

if __name__ == "__main__":
    import anthropic
    job = sys.argv[1]
    try:
        p = JOBS[job](anthropic.Anthropic(max_retries=0))
        print("saved", p)
    except budget.BudgetBlocked as e:
        print("予算管理が止めた:", e)
