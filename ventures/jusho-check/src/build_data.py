# 郵便番号データ（日本郵便公開・著作権の主張なし）を、ブラウザで使う小さな形に変換する。
# 元データ：PyPI の posuto（MIT）に同梱の postaldata.db（日本郵便の KEN_ALL・JIGYOSYO を整えたもの）
# 使い方: python3 build_data.py <postaldata.db> <出力先 zipdata.txt>
# 形式（1行1件、タブ区切り）:
#   1行目: "V\t<版>"、2行目: "P\t都道府県1\t都道府県2…"、3行目: "C\t市区町村1\t…"（"都道府県番号:市区町村"）
#   以降: 郵便番号7桁\t市区町村番号\t町域\t注記\t種類（空=通常, B=ビル・階, O=事業所）
import sqlite3, json, sys, re
db, out = sys.argv[1], sys.argv[2]
c = sqlite3.connect(db)
prefs, cities, rows = [], [], []
pi, ci = {}, {}
def cidx(p, city):
    if p not in pi: pi[p] = len(prefs); prefs.append(p)
    k = f"{pi[p]}:{city}"
    if k not in ci: ci[k] = len(cities); cities.append(k)
    return ci[k]
for (d,) in c.execute("select data from postal_data order by code"):
    d = json.loads(d)
    for e in [d] + d.get("alternates", []):
        note = (e.get("note") or "").replace("\t", " ")
        kind = "B" if re.search(r"階|高層棟", note) else ""
        rows.append((d["postal_code"], cidx(e["prefecture"], e["city"]), e["neighborhood"], note, kind))
for (d,) in c.execute("select data from office_data order by code"):
    d = json.loads(d)
    rows.append((d["postal_code"], cidx(d["prefecture"], d["city"]), d["neighborhood"], (d.get("name") or "").replace("\t", " ").replace("　", " ")[:40], "O"))
ver = sys.argv[3] if len(sys.argv) > 3 else ""
with open(out, "w", encoding="utf-8") as f:
    f.write("V\t" + ver + "\n")
    f.write("P\t" + "\t".join(prefs) + "\n")
    f.write("C\t" + "\t".join(cities) + "\n")
    for r in rows:
        f.write("\t".join(map(str, r)).rstrip("\t") + "\n")
print(len(prefs), len(cities), len(rows))
