"""AgentMint Factory — 費用0円の見張り（Budget Guard）

開発・試験（Apify 上でのビルド・実行）の前に必ず呼ぶ。次のどれかに当たれば STOP（終了コード 3）:
  - Apify の今月の利用額が上限の 80% 以上             GET /v2/users/me/limits（current.monthlyUsageUsd / limits.maxMonthlyUsageUsd）
  - Apify の利用額・上限・プランが読めない
  - Apify のプランが無料（FREE）ではない             GET /v2/users/me（plan.id）
  - GitHub のリポジトリが公開でない（非公開だと Actions が有料枠を消費する。公開リポジトリの標準ランナーは無料・無制限）
  - GitHub の公開状態が読めない
  - 標準ランナー（ubuntu-latest 等）以外を使うワークフローがある
根拠（公式文書、2026-11-26 確認）:
  - Apify 無料プラン：月 $5 の前払い枠、カード不要、使い切ると翌月まで利用停止（https://apify.com/pricing）
  - GitHub：公開リポジトリの標準ランナーは無料・無制限（docs.github.com …/choose-the-runner-for-a-job）
出力: data/budget-status.json（毎回上書き）と、終了コード 0=OK / 3=STOP
"""
import datetime, glob, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
THRESHOLD = 0.80
STD_RUNNER = re.compile(r"^(ubuntu|windows|macos)-(latest|\d[\d.]*)$")

def get(url, headers):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        return json.load(r)

def check_apify(token):
    if not token:
        return {"ok": False, "reason": "APIFY_TOKEN が無いため Apify の利用枠を確認できない"}
    h = {"Authorization": f"Bearer {token}"}
    try:
        me = get("https://api.apify.com/v2/users/me", h)["data"]
        lim = get("https://api.apify.com/v2/users/me/limits", h)["data"]
    except Exception as e:
        return {"ok": False, "reason": f"Apify API に接続できない: {str(e)[:80]}"}
    plan = (me.get("plan") or {}).get("id")
    used = (lim.get("current") or {}).get("monthlyUsageUsd")
    cap = (lim.get("limits") or {}).get("maxMonthlyUsageUsd")
    cyc = lim.get("monthlyUsageCycle") or {}
    out = {"plan": plan, "monthly_usage_usd": used, "max_monthly_usage_usd": cap, "cycle_end": cyc.get("endAt")}
    if not isinstance(used, (int, float)) or not isinstance(cap, (int, float)) or cap <= 0:
        return {**out, "ok": False, "reason": "Apify の利用額または上限が読めない"}
    if str(plan).upper() != "FREE":
        return {**out, "ok": False, "reason": f"Apify のプランが無料ではない（{plan}）。有料プランは禁止"}
    ratio = used / cap
    out["usage_ratio"] = round(ratio, 4)
    if ratio >= THRESHOLD:
        return {**out, "ok": False, "reason": f"Apify の無料枠の {ratio:.0%} を使用（80% で停止）"}
    return {**out, "ok": True}

def check_github(token, repo):
    out = {"repo": repo}
    try:
        h = {"Accept": "application/vnd.github+json"}
        if token: h["Authorization"] = f"Bearer {token}"
        d = get(f"https://api.github.com/repos/{repo}", h)
        out["private"] = d.get("private")
    except Exception as e:
        return {**out, "ok": False, "reason": f"GitHub のリポジトリ情報を読めない: {str(e)[:80]}"}
    if out["private"] is not False:
        return {**out, "ok": False, "reason": "リポジトリが公開でない（非公開では Actions の無料枠を消費する。残量はこの仕組みでは読めない）"}
    bad = []
    for f in glob.glob(os.path.join(ROOT, ".github", "workflows", "*.y*ml")):
        for m in re.finditer(r"runs-on:\s*([^\n#]+)", open(f, encoding="utf-8").read()):
            v = m.group(1).strip().strip("'\"")
            if not STD_RUNNER.match(v):
                bad.append(f"{os.path.basename(f)}: {v}")
    if bad:
        return {**out, "ok": False, "reason": "標準ランナー以外（有料になりうる）: " + ", ".join(bad)}
    return {**out, "ok": True, "note": "公開リポジトリの標準ランナーは無料・無制限（GitHub 公式文書）"}

def main():
    repo = os.environ.get("GITHUB_REPOSITORY", "daisukenakagawa-blip/ai-company")
    status = {"checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
              "threshold": THRESHOLD,
              "apify": check_apify(os.environ.get("APIFY_TOKEN", "")),
              "github": check_github(os.environ.get("GITHUB_TOKEN", ""), repo)}
    status["decision"] = "OK" if status["apify"]["ok"] and status["github"]["ok"] else "STOP"
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    json.dump(status, open(os.path.join(HERE, "data", "budget-status.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(status, ensure_ascii=False, indent=1))
    sys.exit(0 if status["decision"] == "OK" else 3)

if __name__ == "__main__":
    main()
