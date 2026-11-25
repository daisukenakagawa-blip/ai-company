# 入札朝刊の検証（発明2、Ver.2.2）：官公需情報ポータルサイトの公式 検索API から、業種ごとの新着案件を集める
# 使い方: python3 ventures/_gap/kkj_digest.py [日数=1]
# 出力:   workspace/kkj-digest/YYYY-MM-DD.md（業種ごとの新着）と log.csv（日ごとの件数。2週間の検証で使う）
# 注意:   公式 API だけを使う（サイトの画面は取得しない。robots.txt はサイト全体を拒否）。1件ずつ間を空けて問い合わせる
#         利用規約 第3条（出典明記とリンク・過負荷禁止）をオーナーが了承（2026-11-25）。外部への公開・送信は承認を得てから
import os, sys, time, csv, datetime, urllib.parse, urllib.request, xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "workspace", "kkj-digest")
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 1
# 業種ごとの検索語（案件名に含まれる語）。小さな会社が多い業種で試す
SEGMENTS = {
    "翻訳・通訳": ["翻訳", "通訳"],
    "イベント・会議運営": ["イベント", "運営業務", "催事"],
    "Web・システム（小規模）": ["ホームページ", "ウェブサイト", "Webサイト", "システム保守"],
}

def search(q, since):
    url = "https://www.kkj.go.jp/api/?" + urllib.parse.urlencode({"Query": q, "CFT_Issue_Date": f"{since}/", "Count": 1000})
    with urllib.request.urlopen(url, timeout=120) as r:
        root = ET.fromstring(r.read())
    for x in root.iter("SearchResult"):
        g = lambda t: (x.findtext(t) or "").strip()
        yield {"key": g("Key"), "name": g("ProjectName"), "org": g("OrganizationName"), "pref": g("PrefectureName"), "cat": g("Category"),
               "issued": g("CftIssueDate")[:10], "deadline": g("TenderSubmissionDeadline")[:10], "url": g("ExternalDocumentURI")}

def main():
    os.makedirs(OUT, exist_ok=True)
    today = datetime.date.today()
    since = (today - datetime.timedelta(days=DAYS)).isoformat()
    lines = [f"# 入札朝刊（社内検証用・{today}、公告日 {since} 以降）", "", "出典：官公需情報ポータルサイト 検索API（https://www.kkj.go.jp/）。社内の検証（規約はオーナー了承 11/25：外部に出すときは出典とリンクを付け、公開・送信は承認を得てから）", ""]
    rows = []
    for seg, words in SEGMENTS.items():
        seen, hits, raw = {}, 0, 0
        for w in words:
            for it in search(w, since):
                raw += 1
                k = it["key"] or it["url"]
                if k not in seen and w in it["name"]:
                    seen[k] = it
            time.sleep(3)
        items = sorted(seen.values(), key=lambda i: i["issued"], reverse=True)
        rows.append([today.isoformat(), seg, raw, len(items)])
        lines += [f"## {seg}（{len(items)}件、重複除去前 {raw}件）", ""]
        for i in items[:50]:
            lines.append(f"- {i['issued']}｜{i['pref']} {i['org']}｜{i['name'][:80]}｜締切 {i['deadline'] or '不明'}｜{i['url']}")
        lines.append("")
    with open(os.path.join(OUT, f"{today}.md"), "w", encoding="utf-8") as f: f.write("\n".join(lines) + "\n")
    new = not os.path.exists(os.path.join(OUT, "log.csv"))
    with open(os.path.join(OUT, "log.csv"), "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new: w.writerow(["date", "segment", "raw_hits", "deduped_name_match"])
        w.writerows(rows)
    for r in rows: print(r)

if __name__ == "__main__":
    main()
