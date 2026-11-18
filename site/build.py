"""『値上げ前夜』サイト生成: data/hikes.json → docs/index.html

    python site/build.py

買いだめ判定（AIが毎日更新）:
  - 保存できる期間（月）×値上げ率で「得点」を出す。保存期間が短い（1ヶ月未満）ものは「買いだめ不向き」
  - 未確認（verified=false）の項目は「確認中」と表示し、判定しない
  - 供給不足の品目や生活必需品で、品薄を招くような買い占めは推奨しない（1〜数ヶ月分まで）
"""
import html
import json
import os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "hikes.json")
OUT = os.path.join(ROOT, "docs", "index.html")
AFF = os.path.join(ROOT, "data", "affiliate.json")  # {"amazon_tag": "...", "rakuten_id": "..."}（オーナーが設定）


def judge(it):
    if not it.get("verified"):
        return "確認中", "#9ca3af", "公式発表を確認しています"
    rate = it.get("rate_max") or 0
    keep = max(it.get("shelf_months") or 0, it.get("freezable_months") or 0)
    if it.get("shelf_months") is None:
        return "前倒し利用", "#2563eb", "サービスの値上げ。発送などを前倒しできるなら改定日前に"
    if keep < 1:
        return "買いだめ不向き", "#6b7280", "日持ちしないため、値上げ前に買い込む効果は小さい"
    months = min(keep * 0.6, 3)  # 期限の6割以内、最大3ヶ月分まで
    save_pct = rate
    if rate >= 8 and keep >= 3:
        return "値上げ前に買う価値あり", "#dc2626", f"保存目安の範囲で〜{months:.0f}ヶ月分。最大{save_pct:g}%の節約"
    if rate >= 4:
        return "少しだけ前倒し", "#d97706", f"次に買う1回分だけ早めに。最大{save_pct:g}%の節約"
    return "様子見でOK", "#16a34a", "値上げ幅が小さいため、無理に買う必要なし"


def days_left(eff):
    try:
        y, m, *d = [int(x) for x in eff.split("-")]
        target = date(y, m, d[0] if d else 1)
        return (target - date.today()).days
    except Exception:
        return None


def build():
    data = json.load(open(DATA, encoding="utf-8"))
    aff = json.load(open(AFF, encoding="utf-8")) if os.path.exists(AFF) else {}
    e = html.escape
    items = sorted(data["items"], key=lambda x: x["effective"])
    cards = []
    for it in items:
        label, color, why = judge(it)
        dl = days_left(it["effective"])
        dl_txt = "改定済み" if dl is not None and dl < 0 else (f"あと{dl}日" if dl is not None else "")
        rate = (f"{it['rate_min']:g}〜{it['rate_max']:g}%" if it.get("rate_max") else "改定率 確認中")
        buy = ""
        if aff.get("amazon_tag") and it.get("verified") and label.startswith("値上げ前"):
            q = e(it["maker"] + " " + it["product"].split("（")[0].split(" ")[0])
            buy = (f"<a class='buy' rel='sponsored nofollow' href='https://www.amazon.co.jp/s?k={q}&tag={e(aff['amazon_tag'])}'>"
                   f"今の価格を見る（Amazon）</a>")
        cards.append(f"""<article>
<div class="top"><span class="dl">{e(dl_txt)}</span><span class="eff">{e(it['effective'])} {e(it.get('basis',''))}</span></div>
<h2>{e(it['maker'])}</h2><p class="prod">{e(it['product'])}</p>
<p class="rate">{e(rate)}{('<br><small>' + e(it['rate_note']) + '</small>') if it.get('rate_note') else ''}</p>
<div class="judge" style="border-color:{color};color:{color}"><b>{e(label)}</b><br><small>{e(why)}</small></div>
{buy}<p class="src">出典：<a href="{e(it['source'])}" rel="nofollow">{e(it['source_name'])}</a></p></article>""")
    pr = "<p class='pr'>【PR】当サイトのリンクには広告（アフィリエイト）を含みます。</p>" if aff else ""
    page = f"""<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>値上げ前夜 ― 値上げの前日をすべて知らせる</title>
<meta name="description" content="食品・日用品・サービスの値上げ予定日をメーカー発表から毎日収集。値上げ前に買うべきか、日持ちと値上げ率からAIが判定します。">
<style>
body{{margin:0;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#fafaf9;color:#1c1917}}
header{{background:#1c1917;color:#fafaf9;padding:28px 20px}} header h1{{margin:0;font-size:28px}} header p{{margin:6px 0 0;color:#d6d3d1}}
main{{max-width:960px;margin:auto;padding:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}}
article{{background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px #0001}}
.top{{display:flex;justify-content:space-between;font-size:13px}} .dl{{background:#dc2626;color:#fff;border-radius:6px;padding:1px 8px;font-weight:700}}
.eff{{color:#78716c}} h2{{font-size:18px;margin:10px 0 2px}} .prod{{margin:0;color:#44403c;font-size:14px}}
.rate{{font-size:20px;font-weight:700;margin:10px 0}} .judge{{border:2px solid;border-radius:10px;padding:8px 10px;font-size:15px}}
.buy{{display:block;text-align:center;margin-top:10px;background:#f59e0b;color:#1c1917;font-weight:700;padding:8px;border-radius:8px;text-decoration:none}}
.src{{font-size:12px;color:#78716c;margin:10px 0 0}} footer{{max-width:960px;margin:auto;padding:0 20px 40px;font-size:12px;color:#78716c}}
.pr{{max-width:960px;margin:12px auto 0;padding:0 20px;font-size:12px;color:#78716c}}
</style></head><body>
<header><h1>値上げ前夜</h1><p>値上げの「前日」を、すべて知らせる。買うなら今日か、AIが判定します。</p></header>
{pr}<main>{''.join(cards)}</main>
<footer>最終更新：{e(data['updated'])}。掲載はメーカー発表、またはそれを報じた報道で確認できたものに限ります。判定は日持ちと値上げ率から機械的に出した目安で、買い占めはおすすめしません。</footer>
</body></html>"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(page)
    print(OUT)


if __name__ == "__main__":
    build()
