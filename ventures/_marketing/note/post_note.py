# note への自動投稿（オーナー指示 2026-11-22「note も自動で」「公開まで完全自動」）
#
# 使い方:
#   python3 ventures/_marketing/note/post_note.py --dry-run   # 次に出す記事を確認するだけ（note に接続しない）
#   python3 ventures/_marketing/note/post_note.py             # 条件を満たせば1本だけ公開する
#
# 前提（オーナーの作業）:
#   - 実行環境のネットワーク許可に note.com・editor.note.com・*.st-note.com を追加（st-note.com は画面の JS・画像の置き場所。ないとログインボタンが押せない）
#   - 実行環境の環境変数に NOTE_EMAIL と NOTE_PASSWORD を設定（リポジトリには絶対に書かない）
#
# 安全装置:
#   - 公開は7日に1本まで（note_posts.md の最終公開日から判定）。量産しない
#   - 画面の要素が1つでも見つからなければ、公開せずに止まる（下書きが残ることはある）
#   - 各段階のスクリーンショットを scratch に残す（リポジトリには入れない）
import argparse, datetime, glob, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(HERE, "queue")
POSTED = os.path.join(HERE, "posted")
LOG = os.path.join(HERE, "..", "note_posts.md")
MIN_DAYS = 7
JST = datetime.timezone(datetime.timedelta(hours=9))


def next_article():
    files = sorted(glob.glob(os.path.join(QUEUE, "*.md")))
    if not files:
        return None
    path = files[0]
    s = open(path, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n(.*)", s, re.S)
    meta = dict(l.split(":", 1) for l in m.group(1).splitlines() if ":" in l)
    tags = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
    return {"path": path, "title": meta["title"].strip(), "tags": tags, "body": m.group(2).strip()}


def last_post_date():
    if not os.path.exists(LOG):
        return None
    dates = re.findall(r"^\| (\d{4}-\d{2}-\d{2}) \| 公開済み", open(LOG, encoding="utf-8").read(), re.M)
    return max(datetime.date.fromisoformat(d) for d in dates) if dates else None


def to_html(md):
    import markdown
    return markdown.markdown(md, extensions=["sane_lists", "nl2br"])


def log(date, state, title, url, src):
    if not os.path.exists(LOG):
        open(LOG, "w", encoding="utf-8").write(
            "# note 投稿記録\n\n公開は7日に1本まで。同じ記事・言い換え記事は出さない。\n\n"
            "| 日付（JST） | 状態 | タイトル | URL | 元ファイル |\n|---|---|---|---|---|\n")
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"| {date} | {state} | {title} | {url} | {src} |\n")


def publish(a, shots):
    from playwright.sync_api import sync_playwright
    email, pw = os.environ.get("NOTE_EMAIL"), os.environ.get("NOTE_PASSWORD")
    if not email or not pw:
        raise SystemExit("NOTE_EMAIL / NOTE_PASSWORD が環境変数にありません（オーナーの設定待ち）")
    n = [0]
    def shot(p, name):
        n[0] += 1
        p.screenshot(path=os.path.join(shots, f"{n[0]:02d}-{name}.png"))
    with sync_playwright() as pwr:
        b = pwr.chromium.launch()
        p = b.new_page(locale="ja-JP", viewport={"width": 1280, "height": 900})
        p.set_default_timeout(30000)
        # 1. ログイン
        p.goto("https://note.com/login", wait_until="domcontentloaded")
        p.wait_for_timeout(2000)
        p.locator("input#email, input[type=email], input[name=login]").first.fill(email)
        p.locator("input#password, input[type=password]").first.fill(pw)
        shot(p, "login")
        p.get_by_role("button", name=re.compile("ログイン")).first.click()
        p.wait_for_timeout(5000)
        if "/login" in p.url:
            shot(p, "login-failed")
            raise SystemExit("ログインできませんでした（画像認証・二段階認証・パスワード違いの可能性）。公開していません")
        # 2. 新しい記事
        p.goto("https://note.com/notes/new", wait_until="domcontentloaded")
        p.wait_for_timeout(5000)
        title = p.locator("textarea[placeholder*='タイトル'], input[placeholder*='タイトル']").first
        title.wait_for()
        title.fill(a["title"])
        body = p.locator("div.ProseMirror[contenteditable=true]").first
        body.click()
        p.evaluate("""(html) => {
            const el = document.querySelector('div.ProseMirror[contenteditable=true]');
            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', html.replace(/<[^>]+>/g, ''));
            el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
        }""", to_html(a["body"]))
        p.wait_for_timeout(3000)
        got = p.evaluate("document.querySelector('div.ProseMirror').innerText.length")
        shot(p, "editor")
        if got < len(re.sub(r"\s", "", a["body"])) * 0.6:
            raise SystemExit(f"本文の貼り付けが不完全です（{got}文字）。公開していません。下書きが残っている場合があります")
        # 3. 公開設定
        p.get_by_role("button", name=re.compile("公開に進む")).first.click()
        p.wait_for_timeout(4000)
        shot(p, "publish-settings")
        for t in a["tags"]:
            box = p.locator("input[placeholder*='ハッシュタグ']").first
            box.fill(t)
            box.press("Enter")
            p.wait_for_timeout(500)
        shot(p, "tags")
        p.get_by_role("button", name=re.compile("^投稿する$|^公開する$")).first.click()
        p.wait_for_timeout(8000)
        shot(p, "after-publish")
        # 4. 公開URLを確かめる
        url = p.url
        m = re.search(r"https://note\.com/[^/]+/n/n[0-9a-z]+", url + " " + p.content())
        b.close()
        if not m:
            raise SystemExit(f"公開後の記事URLを確認できませんでした（{url}）。note の画面で確認してください")
        return m.group(0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    today = datetime.datetime.now(JST).date()
    a = next_article()
    if not a:
        print("キューに記事がありません"); return
    last = last_post_date()
    if last and (today - last).days < MIN_DAYS:
        print(f"前回の公開（{last}）から{MIN_DAYS}日たっていないため、今日は公開しません"); return
    print("次の記事:", a["title"], "| タグ:", a["tags"], "| 本文", len(a["body"]), "文字")
    if args.dry_run:
        out = os.path.join(tempfile.gettempdir(), "note_preview.html")
        open(out, "w", encoding="utf-8").write(f"<h1>{a['title']}</h1>" + to_html(a["body"]))
        print("プレビュー:", out); return
    shots = tempfile.mkdtemp(prefix="note_shots_")
    print("スクリーンショット:", shots)
    url = publish(a, shots)
    src = os.path.basename(a["path"])
    shutil.move(a["path"], os.path.join(POSTED, src))
    log(today.isoformat(), "公開済み", a["title"], url, src)
    print("公開しました:", url)


if __name__ == "__main__":
    main()
