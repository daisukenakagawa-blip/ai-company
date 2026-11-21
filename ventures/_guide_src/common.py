import sys
CSS='''body{margin:0;font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#f7f7f5;color:#1f2937;line-height:1.85}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}h1{font-size:25px;line-height:1.5;margin:0 0 8px}h2{font-size:19px;margin:32px 0 8px;border-left:4px solid #0f766e;padding-left:10px}h3{font-size:16px;margin:20px 0 4px}
code,pre{font-family:ui-monospace,Menlo,Consolas,monospace;background:#fff;border:1px solid #e5e7eb;border-radius:6px}code{padding:1px 5px;font-size:14px}pre{padding:10px 12px;overflow-x:auto;font-size:14px;line-height:1.6}
.tw{overflow-x:auto}table{border-collapse:collapse;font-size:14px;background:#fff;width:100%}th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;white-space:nowrap}th{background:#f3f4f6}
.box{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:20px 0}.cta{display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px}
.note{font-size:13px;color:#6b7280}.crumb{font-size:13px}.crumb a,footer a{color:#0f766e}footer{margin-top:40px;font-size:13px}'''
def page(title,desc,body,date="2026-11-21"):
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}｜GENHAYL</title>
<meta name="description" content="{desc}">
<style>{CSS}</style>
</head>
<body>
<main>
<p class="crumb"><a href="../">GENHAYL の小さな道具</a> ＞ <a href="./">使い方ガイド</a></p>
<h1>{title}</h1>
<p class="note">{date} 公開</p>
{body}
<footer><a href="./">ほかのガイド</a>　<a href="../">道具の一覧</a>　<a href="../tokushoho.html">特定商取引法に基づく表記</a></footer>
</main>
</body>
</html>
'''
