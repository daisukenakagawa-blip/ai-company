"""Phase C：役割ごとの AI（2026-11-27 Ver.2.0）。必要な場面でだけ AI を呼ぶ、イベント駆動の小さな実行係。

方針
- 集計・監視・データ取得はプログラム（費用0円）。AI は「判断・文章・分類」にだけ使う
- 有料 API は ops/ai_budget/budget.py の guarded_call() だけを通す（直接呼ばない）
- 予算は売上に近い仕事から使う（priority high＝既存商品が見つかる・買われるための仕事）
- AI の出力は「提案ファイル」。外部への公開・価格の変更・投稿はしない（オーナー承認制）。実績・数字は作らせない

役割（ROLES）：model は料金表のキー。モデルは難しさで使い分ける（1円あたりの成果を最大にする）
使い方：python3 ops/agents/run.py <job>   （job: listing_review / gap_triage / radar_analyze）。結果は job-log.jsonl に記録
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
# 考える工程（thinking）の設定（2026-11-28：既定では Sonnet・Haiku 5.5 も考える工程が入り、max_tokens を使い切って本文が空になった。
# 公式資料：Haiku は disabled、Sonnet は between_tools（最初に考えない）、Opus は止められないので effort で抑える）
THINKING = {
    "claude-haiku-5-5": {"thinking": {"type": "disabled"}},
    "claude-sonnet-5-5": {"thinking": {"type": "between_tools"}},
    "claude-opus-5-5": {"output_config": {"effort": "medium"}},
}
RULES = ("あなたは GENHAYL AIカンパニーの社員です。日本語で、事実と推測を分けて書きます。"
         "渡されたデータに無い数字・実績・利用者の声は作りません。外部への公開・投稿・価格変更は提案に留めます。")


def ask(client, division, role, task, prompt, priority="normal", tools=None, max_searches=0):
    r = ROLES[role]
    resp = budget.guarded_call(client, division=division, purpose=r["purpose"], priority=priority, model=r["model"], max_tokens=r["max_tokens"],
                               task=f"{role}:{task}", system=[{"type": "text", "text": RULES, "cache_control": {"type": "ephemeral"}}],
                               messages=[{"role": "user", "content": prompt}], tools=tools, max_searches=max_searches,
                               extra_body=THINKING.get(r["model"], {}))
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    if not text.strip():  # 2026-11-28：考える工程（thinking）が max_tokens を使い切り、本文が空だった。原因が分かるよう記録する
        kinds = [getattr(b, "type", "?") for b in resp.content]
        text = f"（本文なし：stop_reason={getattr(resp, 'stop_reason', '?')}、応答の部品={kinds}。設定の見直しが必要）"
    return text


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


# ---- 仕事3：Market Change Radar の分析（2026-11-28 オーナー指示）。収集は ventures/_gap/radar.py（0円）、AI は2段階 ----
# 1段目 Haiku：新しい手がかりを一度に分類し「誰が困り、何に払うか」の見込みで上位を選ぶ（安い）
# 2段目 Sonnet：上位3件だけ、元の発表の本文と利用者の反応（HN のコメント）を読ませ、収益機会として評価する
# 新しい手がかりが無ければ AI を呼ばない（予算の消化を目的にしない）。競合・価格の裏付けは毎朝の Claude が一次資料で行う
RADAR = os.path.join(ROOT, "workspace", "market-gaps", "radar")
CRITERIA = ["paying_customers", "first_mover", "automation", "recurring", "low_owner_work", "moat"]


def _json_block(text):
    import re
    m = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.S) or re.search(r"(\[\s*\{.*\}\s*\])", text, re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except Exception:
        return None


def _page_text(url, limit=4000):
    import html, re
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GENHAYL-market-radar/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            if "html" not in (r.headers.get("Content-Type") or "") and "text" not in (r.headers.get("Content-Type") or ""):
                return ""
            raw = r.read(600000).decode("utf-8", "ignore")
    except Exception as e:
        return f"（取得できず：{type(e).__name__}）"
    raw = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()[:limit]


def _hn_comments(hn_id, n=15, limit=3000):
    import html, re
    try:
        item = _getraw(f"https://hn.algolia.com/api/v1/items/{hn_id}")
    except Exception:
        return ""
    out = []
    def walk(c):
        for ch in c.get("children", []) or []:
            if ch.get("text") and len(out) < n:
                out.append(re.sub(r"<[^>]+>", " ", html.unescape(ch["text"]))[:300])
            walk(ch)
    walk(item)
    return "\n- ".join([""] + out)[:limit]


def _getraw(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "GENHAYL-market-radar/1.0"}), timeout=30) as r:
        return json.load(r)


def radar_analyze(client, top_n=3, days=7):
    os.makedirs(RADAR, exist_ok=True)
    done_p = os.path.join(RADAR, "analyzed.json")
    done = set(json.load(open(done_p)) if os.path.exists(done_p) else [])
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    rows = []
    for f in sorted(os.listdir(RADAR)):
        if f.startswith("radar-") and f.endswith(".jsonl") and f[6:16] >= since:
            rows += [json.loads(l) for l in open(os.path.join(RADAR, f), encoding="utf-8") if l.strip()]
    rows = [r for r in rows if r["id"] not in done]
    if not rows:
        return None  # 新しい手がかりが無い日は AI を呼ばない
    rows.sort(key=lambda r: (r.get("points", 0) + 2 * r.get("comments", 0) + 5 * r.get("repos", 0)), reverse=True)
    rows = rows[:150]
    brief = [{"id": r["id"], "cat": r["category"], "src": r["source"], "title": r["title"][:140], "pts": r.get("points"), "cmt": r.get("comments"),
              "repos": r.get("repos"), "eol": r.get("eol")} for r in rows]
    p1 = ("市場の変化の手がかり（機械的に収集）です。各行について『この変化で誰が困り、何にお金を払う可能性があるか』を考え、"
          "収益機会になりうるものだけを最大8件選んでください。当社は元手0円・AI だけで開発・納品・集客まで自動で行う会社です。"
          "選ぶ基準：実際にお金を払う顧客がいる／競合より先に入れる／提供を自動化できる／継続収益／オーナーの作業が少ない／独自データ・技術で模倣が難しい。"
          "ニュースとして面白いだけのもの、当社が作れないもの（ハードウェア・規制対応の代行など人手の要るもの）は選ばないでください。"
          "出力は JSON 配列だけ：[{\"id\":..., \"who_affected\":\"誰が困るか\", \"what_they_pay_for\":\"何に払うか\", \"quick_score\":0〜10}]\n\n"
          + json.dumps(brief, ensure_ascii=False))
    t1 = ask(client, "d2", "research", "radar_triage", p1, priority="normal")
    picks = _json_block(t1) or []
    json.dump(sorted(done | {r["id"] for r in rows}), open(done_p, "w"))  # 分類に出したものは分析済み（同じものに二度払わない）
    by_id = {r["id"]: r for r in rows}
    picks = [p for p in picks if isinstance(p, dict) and p.get("id") in by_id]
    picks.sort(key=lambda p: -(p.get("quick_score") or 0))
    out_md = [f"# Market Change Radar {datetime.date.today()}", "", f"新しい手がかり {len(rows)} 件 → 1段目（Haiku）で {len(picks)} 件を選別。"
              "以下は AI の分析で、競合・価格・需要の裏付けは未確認（毎朝の確認で一次資料に当たる）。", "",
              "## 1段目の選別", "", "| 点 | 種類 | 手がかり | 誰が困るか | 何に払うか |", "|---|---|---|---|---|"]
    for p in picks:
        r = by_id[p["id"]]
        out_md.append(f"| {p.get('quick_score')} | {r['category']} | [{r['title'][:70]}]({r['url']}) | {str(p.get('who_affected'))[:80]} | {str(p.get('what_they_pay_for'))[:80]} |")
    analyzed = 0
    for p in [p for p in picks if (p.get("quick_score") or 0) >= 6][:top_n]:
        r = by_id[p["id"]]
        ctx = {"signal": r, "page_text": _page_text(r["url"]) if r.get("url") else "", "user_reactions": _hn_comments(r["hn_id"]) if r.get("hn_id") else ""}
        p2 = ("次の市場の変化を、当社（元手0円・AI だけで開発・納品・集客を自動で行う）の収益機会として評価してください。根拠は下の『発表の本文』と『利用者の反応』だけ。"
              "そこに無い事実（競合名・価格・利用者数）は『要確認』と書き、推測と事実を分けてください。\n"
              "見出し：1. 何が変わるか（事実・日付）／2. 誰が困るか（具体的な顧客像と規模の手がかり）／3. 何にお金を払うか（払う主体・支払い条件・想定価格は推測と明記）"
              "／4. 利用者の反応（コメントからの引用は要約で）／5. 確認すべき競合と価格（要確認の一覧）／6. 顧客への到達経路（営業・SNS なしで顧客が来る理由）"
              "／7. 0円で需要を確かめる方法（対象・期間・成功条件・撤退条件）／8. 判定（作る価値があるか、理由）。"
              f"最後に JSON：{{\"title\":\"短い事業名\",\"scores\":{{{', '.join(f'\"{c}\":0〜5' for c in CRITERIA)}}},\"verdict\":\"検証する|見送り|要追加調査\"}}"
              "\n\n" + json.dumps(ctx, ensure_ascii=False)[:14000])
        t2 = ask(client, "d2", "product", "radar_deep", p2, priority="normal")
        j = _json_block(t2) if "{" in t2 else None
        j = j if isinstance(j, dict) else {}
        sc = j.get("scores") or {}
        total = round(sum(min(5, max(0, int(sc.get(c, 0) or 0))) for c in CRITERIA) / 30 * 100) if sc else None
        out_md += ["", f"## {j.get('title') or r['title'][:60]}（6項目 {total if total is not None else '未採点'}点／100、{j.get('verdict', '未判定')}）", "",
                   f"手がかり：[{r['title']}]({r['url']})" + (f"・[議論]({r['discussion']})" if r.get("discussion") else ""), "", t2]
        try:
            sys.path.insert(0, os.path.join(ROOT, "ops", "knowledge")); import kb
            kb.add("opportunity", {"id": f"radar-{r['id']}", "date": datetime.date.today().isoformat(), "division": "d2",
                                   "title": (j.get("title") or r["title"])[:120], "source_type": "推測", "evidence": r["url"],
                                   "evidence_strength": "弱（AI の分析・未確認）", "score": total, "status": j.get("verdict", "要追加調査"),
                                   "category": r["category"], "scores": sc})
        except Exception as e:
            out_md.append(f"\n（知識データへの記録を見送り：{str(e)[:120]}）")
        analyzed += 1
    return save("radar", "\n".join(out_md), {"job": "radar_analyze", "new_signals": len(rows), "picked": len(picks), "deep": analyzed})


JOBS = {"listing_review": listing_review, "gap_triage": gap_triage, "radar_analyze": radar_analyze}
JOB_LOG = os.path.join(ROOT, "ops", "agents", "job-log.jsonl")


def run_job(job, client):
    """仕事を1つ動かし、成否・API の回数・失敗・費用・成果物を job-log.jsonl に記録する（費用対効果の改善のため）"""
    n0 = len(budget._ledger()); t0 = datetime.datetime.now(datetime.timezone.utc)
    status, path, err = "ok", None, ""
    try:
        path = JOBS[job](client)
        if path is None:
            status = "skipped"  # 新しい入力が無く AI を呼ばなかった
    except budget.BudgetBlocked as e:
        status, err = "blocked", str(e)[:160]
    except Exception as e:
        status, err = "failed", f"{type(e).__name__}: {str(e)[:160]}"
    new = budget._ledger()[n0:]
    settles = [x for x in new if x.get("kind") == "settle"]
    empty = bool(path) and "（本文なし" in open(path, encoding="utf-8").read()
    rec = {"at": t0.isoformat(timespec="seconds"), "job": job, "status": "empty_output" if (status == "ok" and empty) else status,
           "api_calls": len(settles) + sum(1 for x in new if x.get("kind") == "error"), "api_errors": sum(1 for x in new if x.get("kind") == "error"),
           "jpy": round(sum(x.get("actual_jpy", 0) for x in settles) + sum(a.get("jpy", 0) for a, b in zip(new, new[1:]) if a.get("kind") == "reserve" and b.get("kind") == "error"), 2),  # 失敗した呼び出しは予約額を使ったものとして数える
           "output": os.path.relpath(path, ROOT) if path else None, "error": err,
           "seconds": round((datetime.datetime.now(datetime.timezone.utc) - t0).total_seconds(), 1)}
    with open(JOB_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec

if __name__ == "__main__":
    import anthropic
    print(json.dumps(run_job(sys.argv[1], anthropic.Anthropic(max_retries=0)), ensure_ascii=False))
