# GENHAYL Market Gap Engine — 第1段：市場の変化を GitHub の公開 Issue から見つける
#
# 使い方:  python3 ventures/_gap/scan.py [日数=14]
# 出力:    workspace/market-gaps/signals-YYYY-MM-DD.json と .md（候補の一覧。評価は人／Claude が根拠を確かめて行う）
#
# 仕組み:
#  - GitHub の公式検索 API（gh api search/issues）だけを使う（規約に沿った取得。1分あたりの回数制限を守るため間を空ける）
#  - 「サービス終了・API 廃止・無料プラン終了・値上げ・開発終了・移行」を示す言い回しを Issue の題名から探す
#  - 題名から対象の名前（例: "Last.FM API", "Lemon Squeezy"）を取り出し、同じ対象に触れている「別々のリポジトリの数」で並べる
# 注意:
#  - リポジトリの数は「影響を受けた開発者がいる」という手がかりにすぎない。利用者数・購入者数としては扱わない
#  - 公開リポジトリだけが対象。非公開の利用は数えられない
import json, os, re, subprocess, sys, time, datetime, collections

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 14
since = (datetime.date.today() - datetime.timedelta(days=DAYS)).isoformat()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "market-gaps")

# 変化の種類 → 検索語（題名に含むもの）
QUERIES = {
    "サービス終了": ['"shutting down"', '"shut down" service', '"sunsetting"', '"is being discontinued"', '"will be discontinued"', 'discontinued service'],
    "API の廃止": ['"api deprecation"', '"api is deprecated"', '"api will be removed"', '"api sunset"', '"api shutdown"', '"end of life" api'],
    "無料プランの終了": ['"no longer free"', '"free tier" removed', '"free plan" ending', '"free tier" ending', '"removing free"'],
    "大幅な値上げ": ['"price increase"', '"pricing change"', '"new pricing"'],
    "開発終了（OSS）": ['"no longer maintained"', '"project is archived"', '"looking for maintainers"', '"unmaintained" alternative'],
    "移行先さがし": ['"migrate from"', '"migration from"', '"alternative to"', '"replacement for"'],
    "買収に伴う変更": ['"acquired by"', 'acquisition deprecated'],
}
# 対象名の取り出し（題名の型）
PATTERNS = [
    r"^(?P<s>[A-Z][\w.\- ]{1,40}?)\s+(?:is\s+|will\s+be\s+|are\s+)?(?:shutting down|being discontinued|discontinued|sunsetting|deprecated|no longer free|end of life|EOL|archived|acquired)",
    r"(?:migrate|migration|moving|move) (?:away )?(?:from|off) (?P<s>[A-Z][\w.\-]{1,30}(?: [A-Z][\w.\-]{1,20})?)",
    r"(?:alternative to|replacement for|replace) (?P<s>[A-Z][\w.\-]{1,30}(?: [A-Z][\w.\-]{1,20})?)",
    r"(?P<s>[A-Z][\w.\-]{1,30}(?: [A-Z][\w.\-]{1,20})?)(?:'s)? (?:free (?:tier|plan)|API) (?:is )?(?:removed|ending|ends|no longer|deprecated|shutting down|sunset)",
]
NOISE = re.compile(r"^(The|This|It|App|Server|Project|Repo|Repository|Device|Bot|Shutdown|Shutting|Process|Container|Service|Worker|Thread|Node|Python|Docs?|README|Support|Add|Fix|Remove|Update|Bump|Feature|Bug|Chore|Feat|Plan|RFC|Issue|Error|Test|Tests|Migrate|Migration|Deprecated|Replace|Use|Move)$", re.I)

def gh_search(q):
    cmd = ["gh", "api", "-X", "GET", "search/issues", "-f", f"q={q} in:title is:issue created:>={since}", "-f", "per_page=100", "--jq", ".items[] | [.title, .html_url, .repository_url, .created_at] | @json"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        return None, r.stderr.strip()[:200]
    rows = []
    for line in r.stdout.splitlines():
        try:
            t, u, repo, c = json.loads(json.loads(line)) if line.startswith('"') else json.loads(line)
        except Exception:
            continue
        rows.append({"title": t, "url": u, "repo": repo.replace("https://api.github.com/repos/", ""), "created": c[:10]})
    return rows, None

def subject(title):
    for p in PATTERNS:
        m = re.search(p, title)
        if m:
            s = re.sub(r"\s+", " ", m.group("s")).strip(" .:-")
            s = re.sub(r"\s+(is|will|has|are|the|to|and)$", "", s, flags=re.I)
            if len(s) >= 3 and not NOISE.match(s.split(" ")[0]):
                return s
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    found, errors = [], []
    for kind, qs in QUERIES.items():
        for q in qs:
            rows, err = gh_search(q)
            if err:
                errors.append({"query": q, "error": err})
            for r in rows or []:
                r["kind"] = kind
                found.append(r)
            time.sleep(7)  # 検索 API の回数制限（1分あたり約10回）を守る
    groups = collections.defaultdict(lambda: {"kinds": set(), "repos": set(), "items": []})
    for r in found:
        s = subject(r["title"])
        if not s:
            continue
        key = s.lower()
        g = groups[key]
        g["name"] = g.get("name") or s
        g["kinds"].add(r["kind"]); g["repos"].add(r["repo"])
        if len(g["items"]) < 6 and r["url"] not in [i["url"] for i in g["items"]]:
            g["items"].append({"title": r["title"], "url": r["url"], "created": r["created"]})
    ranked = sorted(groups.values(), key=lambda g: (-len(g["repos"]), g["name"]))
    # 題名に出てくる固有名（大文字で始まる1〜3語）を、別々のリポジトリの数で数える（題名の型に当てはまらないものも拾う）
    STOP = set("""The This That It A An And Or For With From To In On Of By As At Is Are Be Will Not No New Old Add Fix Remove Update Bump Use Support Feature Bug Chore Feat Docs Doc README API APIs SDK CLI UI App Apps Server Client Free Plan Tier Pricing Price Change Changes Migrate Migration Migrating Move Moving Replace Replacement Alternative Deprecated Deprecate Deprecation Sunset Sunsetting Shutdown Shutting Down End Life EOL Discontinued Archived Acquired Project Repo Repository Service Services Version Release Issue Issues Error Errors Test Tests Data Model Models Library Package Module Plugin Plugins Action Actions Workflow Build Builds Node Python Java Go Rust Ruby PHP Linux Windows Mac Docker GitHub Code Open Source Community Maintainers Maintainer Maintained Looking Need Needed Please Help Question Proposal RFC Plan Roadmap Phase Task Epic Story Improve Implement Create Make Allow Enable Disable Check Ensure Investigate Consider Should Can Do Does Why How What When""".split())
    phr = collections.defaultdict(lambda: {"repos": set(), "kinds": set(), "ex": []})
    for r in found:
        words = re.findall(r"[A-Z][A-Za-z0-9.+\-]*(?:\s+[A-Z][A-Za-z0-9.+\-]*){0,2}", r["title"])
        seen = set()
        for w in words:
            toks = [t for t in w.split() if t not in STOP]
            if not toks: continue
            k = " ".join(toks)
            if len(k) < 3 or k.lower() in seen: continue
            seen.add(k.lower())
            g = phr[k.lower()]; g["name"] = g.get("name") or k; g["repos"].add(r["repo"]); g["kinds"].add(r["kind"])
            if len(g["ex"]) < 3: g["ex"].append({"title": r["title"], "url": r["url"]})
    names = sorted([g for g in phr.values() if len(g["repos"]) >= 2], key=lambda g: -len(g["repos"]))
    today = datetime.date.today().isoformat()
    data = {"date": today, "window_days": DAYS, "since": since, "issues_scanned": len(found), "errors": errors,
            "names": [{"name": g["name"], "kinds": sorted(g["kinds"]), "distinct_repos": len(g["repos"]), "examples": g["ex"]} for g in names[:80]],
            "signals": [{"subject": g["name"], "kinds": sorted(g["kinds"]), "distinct_repos": len(g["repos"]), "examples": g["items"]} for g in ranked]}
    with open(os.path.join(OUT, f"signals-{today}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    lines = [f"# 市場の変化の手がかり（{today}、直近{DAYS}日の GitHub 公開 Issue）", "",
             f"- 読んだ Issue：{len(found)} 件（検索の失敗 {len(errors)} 件）",
             "- 「リポジトリ数」は、その対象に触れた別々の公開リポジトリの数。利用者数・購入者数ではない", "",
             "| 対象 | 変化の種類 | リポジトリ数 | 例 |", "|---|---|---|---|"]
    for g in data["signals"][:60]:
        ex = "<br>".join(f"[{e['title'][:70]}]({e['url']})" for e in g["examples"][:2])
        lines.append(f"| {g['subject']} | {'・'.join(g['kinds'])} | {g['distinct_repos']} | {ex} |")
    lines += ["", "## 題名によく出てくる名前（2つ以上のリポジトリ）", "", "| 名前 | 変化の種類 | リポジトリ数 | 例 |", "|---|---|---|---|"]
    for g in data["names"][:60]:
        ex = "<br>".join(f"[{e['title'][:70]}]({e['url']})" for e in g["examples"][:2])
        lines.append(f"| {g['name']} | {'・'.join(g['kinds'])} | {g['distinct_repos']} | {ex} |")
    with open(os.path.join(OUT, f"signals-{today}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"issues={len(found)} subjects={len(ranked)} errors={len(errors)}")
    for g in data["names"][:40]:
        print(g["distinct_repos"], g["name"], "|", "・".join(g["kinds"]))

if __name__ == "__main__":
    main()
