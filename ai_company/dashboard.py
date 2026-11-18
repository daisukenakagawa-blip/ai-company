"""reports/index.html にダッシュボードを書き出す"""
import html
import os

from . import state as st

STATUS = {"pending": ("承認待ち", "#b45309"), "approved": ("承認済", "#15803d"), "done": ("実行済", "#1d4ed8"),
          "rejected": ("却下", "#6b7280"), "blocked": ("法務NG", "#b91c1c")}


def build(s):
    rev, cost, profit = st.totals(s)
    e = html.escape
    biz = s["business"]
    appr_rows = "".join(
        f"<tr><td>#{a['id']}</td><td><span class='tag' style='background:{STATUS.get(a['status'], ('', '#444'))[1]}'>"
        f"{STATUS.get(a['status'], (a['status'],))[0]}</span></td><td><b>{e(a['title'])}</b><br><small>{e(a['action'])}</small>"
        f"<br><small class='mut'>法務: {e(a.get('review', ''))}</small></td><td>{a.get('est_cost_jpy', 0):,}円</td></tr>"
        for a in reversed(s["approvals"][-40:]))
    hist_rows = "".join(
        f"<tr><td>{h['day']}日目</td><td>{e(h['date'])}</td><td>{e(h['summary'][:220])}…</td>"
        f"<td><a href='{e(os.path.basename(h.get('report', '')))}'>日報</a></td></tr>"
        for h in reversed(s["history"][-30:]))
    led_rows = "".join(
        f"<tr><td>{e(x['date'])}</td><td>{'売上' if x['type'] == 'revenue' else '費用'}</td>"
        f"<td>{x['amount_jpy']:,}円</td><td>{e(x['memo'])}</td></tr>" for x in reversed(s["ledger"][-30:]))
    dec = "".join(f"<li>{d['day']}日目: {e(d['text'])}</li>" for d in reversed(s["decisions"][-10:]))
    page = f"""<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(s['name'])} ダッシュボード</title>
<style>
body{{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;margin:0;background:#f6f7f9;color:#111}}
.wrap{{max-width:1000px;margin:auto;padding:24px}} h1{{margin:0 0 4px}} .mut{{color:#6b7280}}
.kpi{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}}
.k{{background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 2px #0001}} .k b{{font-size:22px;display:block}}
section{{background:#fff;border-radius:12px;padding:16px;margin:14px 0;box-shadow:0 1px 2px #0001}}
table{{width:100%;border-collapse:collapse;font-size:14px}} td{{border-top:1px solid #eee;padding:8px;vertical-align:top}}
.tag{{color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;white-space:nowrap}}
@media(max-width:700px){{.kpi{{grid-template-columns:repeat(2,1fr)}}}}
</style></head><body><div class="wrap">
<h1>{e(s['name'])}</h1><div class="mut">運営 {s['day']}日目 ・ フェーズ: {e(s['phase'])}</div>
<div class="kpi"><div class="k">累計売上<b>{rev:,}円</b></div><div class="k">累計費用<b>{cost:,}円</b></div>
<div class="k">利益<b>{profit:,}円</b></div><div class="k">承認待ち<b>{sum(a['status'] == 'pending' for a in s['approvals'])}件</b></div></div>
<section><h3>現在の事業</h3>{('<b>' + e(biz.get('name', '')) + '</b><p>' + e(biz.get('summary', '')) + '</p><small class=mut>顧客: ' + e(biz.get('target', '')) + ' ／ 収益モデル: ' + e(biz.get('revenue_model', '')) + '</small>') if biz else '<span class=mut>調査中（未決定）</span>'}</section>
<section><h3>承認依頼</h3><table>{appr_rows or '<tr><td class=mut>なし</td></tr>'}</table></section>
<section><h3>最近の意思決定</h3><ul>{dec or '<li class=mut>なし</li>'}</ul></section>
<section><h3>日報</h3><table>{hist_rows or '<tr><td class=mut>なし</td></tr>'}</table></section>
<section><h3>帳簿</h3><table>{led_rows or '<tr><td class=mut>記録なし</td></tr>'}</table></section>
</div></body></html>"""
    os.makedirs(st.REPORT_DIR, exist_ok=True)
    path = os.path.join(st.REPORT_DIR, "index.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    return path
