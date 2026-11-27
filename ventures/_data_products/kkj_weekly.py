"""実証C（2026-11-28 オーナー承認）：BOOTH 用「業種別の入札情報 週まとめ」を作る。
出典：官公需情報ポータルサイト 検索API（https://www.kkj.go.jp/、公式 API のみ。画面は取得しない）。
利用規約（第3条：出典の明記とリンク・過負荷の禁止）に従う。1回ずつ間を空けて問い合わせる。
使い方：python3 ventures/_data_products/kkj_weekly.py 清掃・警備 [日数=7]
出力：ventures/_data_products/out/kkj-<業種>-<開始>_<終了>/（CSV〔Excel 用 BOM 付き〕・README.txt・summary.md）
"""
import csv, datetime, os, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

SEGMENTS = {"清掃・警備": ["清掃", "警備"], "翻訳・通訳": ["翻訳", "通訳"], "イベント・会議運営": ["イベント", "催事", "運営業務"]}
HERE = os.path.dirname(os.path.abspath(__file__))
FIELDS = [("issued", "公告日"), ("deadline", "入札書の提出期限"), ("pref", "都道府県"), ("org", "機関"), ("name", "件名"),
          ("cat", "種別"), ("proc", "手続きの種類"), ("url", "公告の URL（各機関のページ）")]


def search(q, since):
    url = "https://www.kkj.go.jp/api/?" + urllib.parse.urlencode({"Query": q, "CFT_Issue_Date": f"{since}/", "Count": 1000})
    for i in range(3):  # 通信の一時的な切断に備えて、間を空けて3回まで
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                root = ET.fromstring(r.read())
            break
        except OSError:
            if i == 2: raise
            time.sleep(10)
    for x in root.iter("SearchResult"):
        g = lambda t: (x.findtext(t) or "").strip()
        yield {"key": g("Key"), "name": g("ProjectName"), "org": g("OrganizationName"), "pref": g("PrefectureName"),
               "cat": g("Category"), "proc": g("ProcedureType"), "issued": g("CftIssueDate")[:10],
               "deadline": g("TenderSubmissionDeadline")[:10], "url": g("ExternalDocumentURI")}


def main():
    seg = sys.argv[1] if len(sys.argv) > 1 else "清掃・警備"
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    end = datetime.date.today() - datetime.timedelta(days=1)
    start = end - datetime.timedelta(days=days - 1)
    seen = {}
    for w in SEGMENTS[seg]:
        for it in search(w, start.isoformat()):
            if w in it["name"] and start.isoformat() <= it["issued"] <= end.isoformat():
                seen.setdefault(it["key"] or it["url"], it)
        time.sleep(3)
    rows = sorted(seen.values(), key=lambda i: (i["issued"], i["pref"]), reverse=True)
    out = os.path.join(HERE, "out", f"kkj-{seg}-{start}_{end}")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, f"入札_{seg}_{start}_{end}.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow([j for _, j in FIELDS])
        for r in rows: w.writerow([r[k] for k, _ in FIELDS])
    prefs = {}
    for r in rows: prefs[r["pref"] or "不明"] = prefs.get(r["pref"] or "不明", 0) + 1
    summ = [f"# {seg}の入札情報 週まとめ（公告日 {start}〜{end}）", "", f"- 件数：{len(rows)}件（件名に「{'」「'.join(SEGMENTS[seg])}」を含む案件。重複を除いた数）",
            "- 都道府県別：" + "、".join(f"{k} {v}" for k, v in sorted(prefs.items(), key=lambda x: -x[1]))]
    open(os.path.join(out, "summary.md"), "w", encoding="utf-8").write("\n".join(summ) + "\n")
    readme = f"""{seg}の入札情報 週まとめ（公告日 {start}〜{end}）

出典：官公需情報ポータルサイト（中小企業庁） https://www.kkj.go.jp/
この一覧は、官公需情報ポータルサイトの検索 API で取得した情報を、件名に「{'」「'.join(SEGMENTS[seg])}」を含む案件に絞り、重複を除いて並べ替えたものです（GENHAYL が加工して作成）。
内容は各機関の公告が正です。入札に参加する前に、必ず「公告の URL」から各機関の公告・仕様書を確かめてください。
官公需情報ポータルサイトに載っていない案件は含まれません。件名に該当の語を含まない案件も含まれません。
提出期限が空欄の案件は、元のデータに期限がないものです。

ファイル：入札_{seg}_{start}_{end}.csv（Excel でそのまま開けます。UTF-8）
列：{'・'.join(j for _, j in FIELDS)}
"""
    open(os.path.join(out, "README.txt"), "w", encoding="utf-8").write(readme)
    print(out, len(rows), prefs)


if __name__ == "__main__":
    main()
