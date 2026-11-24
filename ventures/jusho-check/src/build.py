# 住所録の郵便番号・住所チェック：店に置くファイルを書き出す
#   python3 ventures/jusho-check/src/build.py
# 書き出し先 ventures/_shop/jusho-check/
#   index.html（商品ページ）、demo.html・demo.js（お試し版：先頭30行）
#   app/index.html・app/app.js（製品版：functions/jusho-check/app/_middleware.js で購入者だけに見せる）
#   check.js、data/zipdata.txt、vendor/xlsx.full.min.js
import os, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.dirname(HERE)
OUT = os.path.join(V, "..", "_shop", "jusho-check")
LIMIT = 30
for d in ["", "app", "data", "vendor"]:
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
rd = lambda p: open(os.path.join(HERE, p), encoding="utf-8").read()
def wr(p, s):
    with open(os.path.join(OUT, p), "w", encoding="utf-8") as f: f.write(s)
app = rd("app.js")
assert "const LIMIT = 0;" in app
wr("app/app.js", app)
wr("demo.js", app.replace("const LIMIT = 0;", f"const LIMIT = {LIMIT};"))
wr("check.js", rd("check.js"))
shutil.copy(os.path.join(V, "data", "zipdata.txt"), os.path.join(OUT, "data", "zipdata.txt"))
for f in os.listdir(os.path.join(V, "vendor")):
    shutil.copy(os.path.join(V, "vendor", f), os.path.join(OUT, "vendor", f))
tpl = rd("tool.html")
def tool(**k):
    s = tpl
    for a, b in k.items(): s = s.replace("{{" + a + "}}", b)
    assert "{{" not in s, s[s.index("{{"):s.index("{{") + 20]
    return s
demo_banner = (f'<div class="banner"><b>お試し版</b>：すべての機能を使えます。点検するのは<b>先頭 {LIMIT} 行まで</b>です（保存も {LIMIT} 行まで）。'
               '全部の行を点検するには <a href="./#buy">製品版（1,980円・買い切り）</a> をお使いください。</div>')
app_banner = ('<div class="banner" id="keyBox" hidden><b>ご購入ありがとうございます。</b>次のリンクを保存しておくと、別のパソコンやブラウザでも製品版を開けます（ほかの人には教えないでください）。<br>'
              '<input id="keyUrl" readonly style="width:100%;font-size:12px;margin-top:6px" onclick="this.select()"></div>'
              '<script>(function(){var m=location.hash.match(/key=([^&]+)/);if(m){var u=decodeURIComponent(m[1]);'
              'document.addEventListener("DOMContentLoaded",function(){document.getElementById("keyBox").hidden=false;document.getElementById("keyUrl").value=u;});'
              'history.replaceState(null,"",location.pathname);}})();</script>')
wr("demo.html", tool(TITLE="お試し版", ROBOTS="index,follow", BANNER=demo_banner, TOP="../", PAGE="./", VENDOR="vendor/", DATA="data/zipdata.txt", CHECK="check.js", APPJS="demo.js"))
wr("app/index.html", tool(TITLE="製品版", ROBOTS="noindex,nofollow", BANNER=app_banner, TOP="../../", PAGE="../", VENDOR="../vendor/", DATA="../data/zipdata.txt", CHECK="../check.js", APPJS="app.js"))
print("built", OUT)
