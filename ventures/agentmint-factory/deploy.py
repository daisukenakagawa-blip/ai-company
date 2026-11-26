"""AgentMint Factory — Phase 3：Actor を Apify に「非公開で」作成・更新し、ビルドして試験実行する。
使い方: APIFY_TOKEN=... python3 deploy.py actors/dataset-merge-dedup
- 公開（Store 掲載）・料金の設定はしない（オーナーの確認後に Console で行う）
- 既存の Actor（AgentMint など）には触れない：同じ名前の Actor だけを更新する
- 始める前に guard.py（費用0円の見張り）を通す。STOP なら何もしない
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
TOKEN = os.environ["APIFY_TOKEN"]
API = "https://api.apify.com/v2"
SKIP = {"node_modules", "storage", "storage-e2e", ".git"}

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r).get("data")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read()[:300]}")

def files(root):
    out = []
    for d, dirs, fs in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP]
        for f in fs:
            p = os.path.join(d, f)
            if f == "package-lock.json": continue
            out.append({"name": os.path.relpath(p, root), "format": "TEXT", "content": open(p, encoding="utf-8").read()})
    return out

def guard():
    """費用0円の見張り。STOP（無料枠の80%以上・確認不能・有料プラン等）なら何もしないで終わる"""
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard.py")], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-1500:])
        raise SystemExit("Budget guard: STOP（デプロイ・試験を行わない）")

def main(root):
    guard()
    meta = json.load(open(os.path.join(root, ".actor", "actor.json")))
    me = call("GET", "/users/me")
    name = meta["name"]
    version = {"versionNumber": meta["version"], "sourceType": "SOURCE_FILES", "buildTag": "latest", "sourceFiles": files(root)}
    existing = {a["name"]: a for a in (call("GET", "/acts?my=1&limit=1000") or {}).get("items", [])}
    if name in existing:
        act = call("PUT", f"/acts/{existing[name]['id']}", {"versions": [version], "title": meta["title"], "description": meta["description"]})
        print("updated", act["id"])
    else:
        act = call("POST", "/acts", {"name": name, "title": meta["title"], "description": meta["description"], "isPublic": False, "versions": [version]})
        print("created", act["id"])
    b = call("POST", f"/acts/{act['id']}/builds?version={meta['version']}&tag=latest&waitForFinish=60")
    while b["status"] in ("READY", "RUNNING"):
        time.sleep(5); b = call("GET", f"/actor-builds/{b['id']}")
    print("build", b["status"])
    if b["status"] != "SUCCEEDED": raise SystemExit("build failed")
    test = {"items": [{"url": "https://ex.com/1?utm_source=a", "n": 1}, {"url": "https://ex.com/1", "n": 2}, {"url": "https://ex.com/2", "n": 3}],
            "dedupFields": ["url"], "ignoreUrlTracking": True}
    run = call("POST", f"/acts/{act['id']}/runs?waitForFinish=120&memory=256&timeout=120", test)
    print("test run", run["status"], run["id"])
    items = json.load(urllib.request.urlopen(urllib.request.Request(f"{API}/datasets/{run['defaultDatasetId']}/items", headers={"Authorization": f"Bearer {TOKEN}"})))
    assert [i["n"] for i in items] == [1, 3], items
    print(f"OK: https://console.apify.com/actors/{act['id']}  (private, user {me['username']})")

if __name__ == "__main__":
    main(sys.argv[1])
