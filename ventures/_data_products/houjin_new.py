"""実証C（2026-11-28 オーナー承認）：BOOTH 用「新設法人の一覧 週まとめ」を作る。
出典：国税庁 法人番号公表サイトの差分データ（https://www.houjin-bangou.nta.go.jp/download/sabun/ 、登録不要・公共データ利用規約 第1.0版）。
出典の表記と「加工して作成」の表記が必要。国が作成したかのように見せない。電話・メールは元データに無く、含めない。
ダウンロードは画面の操作（JavaScript）なので Playwright で行う。1日1ファイルを間を空けて取得（過負荷にしない）。
使い方（GitHub Actions で）：python3 ventures/_data_products/houjin_new.py [日数=7]
出力：ventures/_data_products/out/houjin-new-<開始>_<終了>/（CSV・README.txt・summary.md・sample.csv）
"""
import csv, datetime, glob, io, os, sys, time, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "https://www.houjin-bangou.nta.go.jp/download/sabun/index.html"
RAW = os.path.join(HERE, "raw")
# 差分 CSV の列（リソース定義書 4.1版。CSV に見出しは無い。0始まり）
C = dict(seq=0, num=1, proc=2, corr=3, upd=4, chg=5, name=6, kind=8, pref=9, city=10, street=11, post=15, assigned=22, latest=23, kana=28, hide=29)
KINDS = {"301": "株式会社", "305": "合同会社"}


def download(max_files):
    from playwright.sync_api import sync_playwright
    os.makedirs(RAW, exist_ok=True)
    got = []
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(accept_downloads=True)
        pg.goto(PAGE, wait_until="networkidle")
        open(os.path.join(RAW, "page.html"), "w", encoding="utf-8").write(pg.content())
        # 「CSV形式・Unicode」の見出しの後にある zip のリンク（新しい順に並んでいる想定。違えば page.html で直す）
        links = pg.locator("xpath=//*[contains(normalize-space(.),'CSV形式・Unicode')]/following::a[contains(.,'zip')]")
        n = min(links.count(), max_files)
        print("Unicode の zip リンク", links.count(), "件、取得", n)
        for i in range(n):
            with pg.expect_download(timeout=120000) as d:
                links.nth(i).click()
            f = os.path.join(RAW, d.value.suggested_filename); d.value.save_as(f); got.append(f)
            print("取得", os.path.basename(f)); time.sleep(5)
        b.close()
    return got


def rows_from(zf):
    with zipfile.ZipFile(zf) as z:
        for nm in z.namelist():
            if nm.lower().endswith(".csv"):
                b = z.read(nm)
                for enc in ("utf-8-sig", "cp932"):  # Unicode 版と Shift-JIS 版のどちらでも読む
                    try:
                        text = b.decode(enc); break
                    except UnicodeDecodeError:
                        continue
                else:
                    raise ValueError(f"文字コードを判定できない: {nm}")
                print(os.path.basename(zf), nm, enc)
                for r in csv.reader(io.StringIO(text)):
                    yield r


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    files = sorted(glob.glob(os.path.join(RAW, "*.zip"))) or download(days)
    out_rows, total_new, skipped_late, skipped_kind, bad = {}, 0, 0, 0, 0
    dates = []
    for zf in files:
        for r in rows_from(zf):
            if len(r) < 24 or not (r[C["num"]].isdigit() and len(r[C["num"]]) == 13):
                bad += 1; continue
            if r[C["proc"]] != "01" or r[C["corr"]] == "1" or (len(r) > C["hide"] and r[C["hide"]] == "1"):
                continue
            total_new += 1
            if r[C["kind"]] not in KINDS:
                skipped_kind += 1; continue
            # 公表日（更新年月日）と指定年月日が離れている＝過去の設立の遅れた公表。週まとめでは公表週の新規だけを残す
            upd, asg = r[C["upd"]], r[C["assigned"]]
            dates.append(upd)
            try:
                late = (datetime.date.fromisoformat(upd) - datetime.date.fromisoformat(asg)).days > 7
            except ValueError:
                late = True
            if late:
                skipped_late += 1; continue
            out_rows[r[C["num"]]] = [r[C["num"]], r[C["name"]], r[C["kana"]] if len(r) > C["kana"] else "", KINDS[r[C["kind"]]], asg,
                                     r[C["pref"]], r[C["city"]], r[C["street"]], r[C["post"]]]
    if not dates:
        print("新規の行が無い（列の位置かファイルを確かめる）", "不正な行", bad); sys.exit(1)
    start, end = min(dates), max(dates)
    out = os.path.join(HERE, "out", f"houjin-new-{start}_{end}")
    os.makedirs(out, exist_ok=True)
    head = ["法人番号", "商号又は名称", "フリガナ", "法人種別", "法人番号指定年月日", "都道府県", "市区町村", "丁目番地等", "郵便番号"]
    rows = sorted(out_rows.values(), key=lambda x: (x[4], x[5], x[1]))
    with open(os.path.join(out, f"新設法人_{start}_{end}.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(head); w.writerows(rows)
    with open(os.path.join(out, "sample.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f); w.writerow(head); w.writerows(rows[:5])
    prefs = {}
    for x in rows: prefs[x[5]] = prefs.get(x[5], 0) + 1
    kinds = {}
    for x in rows: kinds[x[3]] = kinds.get(x[3], 0) + 1
    summ = [f"# 新設法人の一覧 週まとめ（公表日 {start}〜{end}）", "",
            f"- 掲載：{len(rows)}社（{'、'.join(f'{k} {v}' for k, v in kinds.items())}）",
            f"- 除外：新規の指定 {total_new}件のうち、株式会社・合同会社以外 {skipped_kind}件、指定日から8日以上後の公表（過去の設立）{skipped_late}件",
            f"- 読めなかった行：{bad}",
            "- 都道府県別（上位10）：" + "、".join(f"{k} {v}" for k, v in sorted(prefs.items(), key=lambda x: -x[1])[:10]),
            f"- 元のファイル：{', '.join(os.path.basename(z) for z in files)}"]
    open(os.path.join(out, "summary.md"), "w", encoding="utf-8").write("\n".join(summ) + "\n")
    readme = f"""新設法人の一覧 週まとめ（公表日 {start}〜{end}）

出典：国税庁法人番号公表サイト（国税庁）（https://www.houjin-bangou.nta.go.jp/download/sabun/index.html）を加工して作成
加工の内容：差分データのうち「新規」の法人番号の指定から、株式会社・合同会社で、指定日から7日以内に公表されたものを選び、重複を除いて並べ替えました（GENHAYL）。
このデータは国税庁が作成したものではなく、内容は国税庁によって保証されたものではありません。
電話番号・メールアドレス・代表者名は含みません（元データにありません）。
この一覧を使って広告の電子メールを送る場合は、特定電子メール法（事前の同意など）に従ってください。

ファイル：新設法人_{start}_{end}.csv（Excel でそのまま開けます。UTF-8）
列：{'・'.join(head)}
"""
    open(os.path.join(out, "README.txt"), "w", encoding="utf-8").write(readme)
    print(out, len(rows), summ[2])


if __name__ == "__main__":
    main()
