"""1日分の会社運営サイクル"""
import json
import os
import re

from . import state as st
from .llm import LLM, BudgetExceeded, extract_json
from .roles import ROLES, WORKER_ROLES, WORKER_OUTPUT_FORMAT, system_prompt

MAX_TASKS = int(os.getenv("MAX_TASKS_PER_DAY", "4"))


def _safe_name(name):
    name = re.sub(r"[^\w.\-]", "_", name)[:80]
    return name or "output.md"


def company_context(s):
    rev, cost, profit = st.totals(s)
    biz = s["business"]
    lines = [
        f"会社名: {s['name']} / 運営{s['day']}日目 / フェーズ: {s['phase']}",
        f"現在の事業: {json.dumps(biz, ensure_ascii=False) if biz else 'なし'}",
        f"累計売上: {rev:,}円 / 累計費用: {cost:,}円 / 利益: {profit:,}円",
    ]
    if s["decisions"]:
        lines.append("過去の主な意思決定:\n" + "\n".join(f"- {d['day']}日目: {d['text']}" for d in s["decisions"][-12:]))
    if s["history"]:
        lines.append("直近の日報要約:\n" + "\n".join(f"- {h['day']}日目: {h['summary'][:400]}" for h in s["history"][-5:]))
    pend = [a for a in s["approvals"] if a["status"] == "pending"]
    done = [a for a in s["approvals"] if a["status"] in ("approved", "rejected", "done")][-10:]
    if pend:
        lines.append("オーナー承認待ち:\n" + "\n".join(f"- #{a['id']} {a['title']}" for a in pend))
    if done:
        lines.append("オーナーの判断結果:\n" + "\n".join(
            f"- #{a['id']} {a['title']} → {a['status']} {('（' + a['owner_note'] + '）') if a.get('owner_note') else ''}"
            for a in done))
    msgs = [m for m in s["owner_messages"] if not m.get("read")]
    if msgs:
        lines.append("★オーナーからの指示（最優先）:\n" + "\n".join(f"- {m['text']}" for m in msgs))
    return "\n".join(lines)


def run_day(backend="cli", model="", max_cost_usd=1.0, log=print):
    s = st.load()
    s["day"] += 1
    day = s["day"]
    llm = LLM(backend, model, max_cost_usd)
    day_dir = os.path.join(st.WORK_DIR, f"day-{day:03d}")
    os.makedirs(day_dir, exist_ok=True)
    ctx = company_context(s)
    results = []
    report_md = ""

    try:
        # 1. CEO が計画を立てる ------------------------------------------------
        log(f"■ {day}日目 開始 — CEO が計画中…")
        roles_desc = "\n".join(f"- {k}: {ROLES[k]['title']}" for k in WORKER_ROLES)
        plan_prompt = f"""{ctx}

今日の経営会議です。状況を踏まえて今日の方針とタスクを決めてください。
- 事業が未決定なら、まず調査させ、十分な材料があれば1つに決めて business に入れる。
- 事業が決まっていれば、最初の売上に最短でつながるタスクを優先する。
- 割り振れる社員:
{roles_desc}
- タスクは最大{MAX_TASKS}件。各タスクの instructions は具体的に（何を・どの形式で・どの水準まで）。

次の JSON だけを ```json ブロックで出力:
{{"phase": "探索|立ち上げ|販売|改善|拡大",
  "business": null または {{"name": "", "summary": "", "target": "", "revenue_model": ""}},
  "decisions": ["今日の意思決定（理由つき）"],
  "tasks": [{{"role": "researcher|product|marketing|cfo", "title": "", "instructions": ""}}]}}"""
        plan = extract_json(llm.ask(system_prompt("ceo", s["name"]), plan_prompt, role="ceo_plan"))
        s["phase"] = plan.get("phase") or s["phase"]
        if plan.get("business"):
            s["business"] = plan["business"]
        for d in plan.get("decisions", []):
            s["decisions"].append({"day": day, "text": d})
        for m in s["owner_messages"]:
            m["read"] = True
        tasks = [t for t in plan.get("tasks", []) if t.get("role") in WORKER_ROLES][:MAX_TASKS]
        log(f"  フェーズ: {s['phase']} / タスク {len(tasks)}件")

        # 2. 各社員がタスクを実行 ------------------------------------------------
        new_approvals = []
        for t in tasks:
            role = t["role"]
            log(f"  → {ROLES[role]['title']}: {t['title']}")
            prompt = f"""{ctx}

【CEO からのタスク】{t['title']}
{t['instructions']}

{WORKER_OUTPUT_FORMAT}"""
            try:
                out = extract_json(llm.ask(system_prompt(role, s["name"]), prompt,
                                           role=role, use_search=ROLES[role]["search"]))
            except BudgetExceeded:
                raise
            except Exception as e:
                log(f"    ⚠ 失敗: {e}")
                results.append({"role": role, "task": t["title"], "summary": f"失敗: {e}", "files": []})
                continue
            files = []
            role_dir = os.path.join(day_dir, role)
            os.makedirs(role_dir, exist_ok=True)
            for d in out.get("deliverables", []):
                fn = _safe_name(d.get("filename", "output.md"))
                path = os.path.join(role_dir, fn)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(d.get("content", ""))
                files.append(os.path.relpath(path, st.BASE))
            for a in out.get("approval_requests", []):
                a["role"] = role
                new_approvals.append(a)
            results.append({"role": role, "task": t["title"], "summary": out.get("summary", ""),
                            "notes": out.get("notes", ""), "files": files})

        # 3. 法務が承認依頼を審査 -----------------------------------------------
        if new_approvals:
            log(f"  法務が承認依頼 {len(new_approvals)}件を審査中…")
            listing = json.dumps([{"id": i, **a} for i, a in enumerate(new_approvals)], ensure_ascii=False, indent=1)
            rv_prompt = f"""{ctx}

次の承認依頼（オーナーに実行してもらう行動）を審査してください。
法令・規約違反の恐れ、元手0円ルール違反（est_cost_jpy>0 で売上で賄えない）、虚偽表示があれば ng。
{listing}

次の JSON だけを ```json ブロックで出力:
{{"reviews": [{{"id": 0, "verdict": "ok|ng", "comment": ""}}], "general": "全体所見"}}"""
            try:
                rv = extract_json(llm.ask(system_prompt("compliance", s["name"]), rv_prompt, role="compliance"))
                verdicts = {r["id"]: r for r in rv.get("reviews", [])}
            except BudgetExceeded:
                raise
            except Exception as e:
                log(f"    ⚠ 審査失敗（全件を要注意として登録）: {e}")
                verdicts = {}
            for i, a in enumerate(new_approvals):
                r = verdicts.get(i, {"verdict": "要確認", "comment": "審査未完了"})
                s["approvals"].append({
                    "id": st.next_approval_id(s), "day": day, "role": a["role"],
                    "title": a.get("title", ""), "action": a.get("action", ""), "reason": a.get("reason", ""),
                    "est_cost_jpy": a.get("est_cost_jpy", 0),
                    "status": "pending" if r["verdict"] != "ng" else "blocked",
                    "review": f"{r['verdict']}: {r.get('comment', '')}", "owner_note": "",
                })

        # 4. CEO の日報 -------------------------------------------------------
        log("  CEO が日報を作成中…")
        res_txt = "\n\n".join(
            f"[{ROLES[r['role']]['title']}] {r['task']}\n{r['summary']}\n申し送り: {r.get('notes', '')}\n成果物: {', '.join(r['files'])}"
            for r in results)
        pend = [a for a in s["approvals"] if a["status"] == "pending"]
        report_prompt = f"""{company_context(s)}

今日の各社員の結果:
{res_txt}

オーナー（人間）向けの日報を Markdown で書いてください。構成:
# {day}日目 日報
## 今日の結論（3行）
## 進捗と成果物
## オーナーにお願いしたいこと（承認待ち {len(pend)}件の要点。なければ「なし」）
## 数字（売上・費用・利益、今後の見込み）
## 明日やること"""
        report_md = llm.ask(system_prompt("ceo", s["name"]), report_prompt, role="ceo_report")

    except BudgetExceeded as e:
        log(f"  ⛔ {e}。ここまでの結果を保存して終了します。")
        report_md = report_md or f"# {day}日目 日報\n\n予算上限に達したため途中で終了しました。\n\n" + "\n".join(
            f"- {r['task']}: {r['summary']}" for r in results)

    # 5. 保存 -------------------------------------------------------------------
    os.makedirs(st.REPORT_DIR, exist_ok=True)
    rpath = os.path.join(st.REPORT_DIR, f"day-{day:03d}.md")
    with open(rpath, "w", encoding="utf-8") as f:
        f.write(report_md)
    summary = re.sub(r"\s+", " ", report_md)[:600]
    s["history"].append({"day": day, "date": st.now(), "summary": summary,
                         "cost_usd": round(llm.cost_usd, 4), "report": os.path.relpath(rpath, st.BASE)})
    st.save(s)
    from .dashboard import build
    build(s)
    log(f"■ {day}日目 終了（API費用 約${llm.cost_usd:.3f}） 日報: {rpath}")
    return s


def apply_day(json_path, log=print):
    """外部エージェント（Claude のスケジュール実行など）が1日分の経営を行った結果を取り込む。

    JSON 形式:
    {"phase": "...", "business": {...} | null, "decisions": ["..."],
     "results": [{"role": "researcher", "task": "...", "summary": "...", "notes": "...",
                  "files": ["workspace/day-001/researcher/x.md"],            # 既に書いたファイル
                  "deliverables": [{"filename": "y.md", "content": "..."}]}], # またはここで渡す
     "approvals": [{"role": "...", "title": "...", "action": "...", "reason": "...", "est_cost_jpy": 0,
                    "verdict": "ok|ng", "review": "法務コメント"}],
     "report_md": "# N日目 日報 ..."}
    """
    with open(json_path, encoding="utf-8") as f:
        d = json.load(f)
    s = st.load()
    s["day"] += 1
    day = s["day"]
    day_dir = os.path.join(st.WORK_DIR, f"day-{day:03d}")
    s["phase"] = d.get("phase") or s["phase"]
    if d.get("business"):
        s["business"] = d["business"]
    for t in d.get("decisions", []):
        s["decisions"].append({"day": day, "text": t})
    for m in s["owner_messages"]:
        m["read"] = True
    for r in d.get("results", []):
        for dv in r.get("deliverables", []):
            p = os.path.join(day_dir, r["role"], _safe_name(dv["filename"]))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(dv["content"])
    for a in d.get("approvals", []):
        s["approvals"].append({
            "id": st.next_approval_id(s), "day": day, "role": a.get("role", ""),
            "title": a.get("title", ""), "action": a.get("action", ""), "reason": a.get("reason", ""),
            "est_cost_jpy": a.get("est_cost_jpy", 0),
            "status": "blocked" if a.get("verdict") == "ng" else "pending",
            "review": f"{a.get('verdict', 'ok')}: {a.get('review', '')}", "owner_note": ""})
    report_md = d.get("report_md", f"# {day}日目 日報")
    os.makedirs(st.REPORT_DIR, exist_ok=True)
    rpath = os.path.join(st.REPORT_DIR, f"day-{day:03d}.md")
    with open(rpath, "w", encoding="utf-8") as f:
        f.write(report_md)
    s["history"].append({"day": day, "date": st.now(), "summary": re.sub(r"\s+", " ", report_md)[:600],
                         "cost_usd": 0, "report": os.path.relpath(rpath, st.BASE)})
    st.save(s)
    from .dashboard import build
    build(s)
    log(f"■ {day}日目 を記録しました。日報: {rpath}")
    return s
