"""AI API の予算管理（2026-11-27 オーナー指示 Ver.2.0：月5,000円・年60,000円）。

有料の AI API は、必ずこのモジュールの guarded_call() を通して呼ぶ。直接 client.messages.create を呼ばない。

安全装置（どれかに当たれば呼び出さない＝Fail Closed）
- 緊急停止：ops/ai_budget/STOP があるか、環境変数 AI_KILL_SWITCH=1
- 上限ファイルの改ざん防止：limits.json の SHA-256 が、オーナーだけが設定できる GitHub の変数 AI_BUDGET_LIMITS_SHA256 と一致しない
- 料金表に無いモデル・料金表が無い・為替が分からない（保守的な既定値を使う）
- 呼び出し前の見積もり（上限値）を足すと、月の 90%（hard_stop_ratio）を超える → 全停止
- 月の 80% 以上では優先度 low の処理を止める。50% で通知（alerts.json → ワークフローが Issue を作る）
- 年の上限、用途別の配分、1回の上限額、1回の実行・1日の呼び出し回数、出力トークンの上限、再試行の回数
- 同時実行：ファイルロックの中で「見積もりの予約 → 呼び出し → 実額の記録」。ワークフロー側も concurrency で1本に絞る
- 応答に使用量（usage）が無い → 見積もりの上限額を使ったものとして記録し、STOP を作って以後止める
残り10%（90%〜100%）は、為替・未反映の請求・税金の予備として使わない。
費用は円で記録する：USD × 為替 × tax_and_fee_multiplier（税・カードの為替手数料の上乗せ）。
"""
import contextlib, datetime, fcntl, hashlib, json, math, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, "ledger.jsonl")
ALERTS = os.path.join(HERE, "alerts.json")
FX_FILE = os.path.join(HERE, "fx.json")
STOP_FILE = os.path.join(HERE, "STOP")
LOCK_FILE = os.path.join(HERE, ".lock")
PRIORITIES = ("high", "normal", "low")
_run_calls = 0


class BudgetBlocked(Exception):
    """予算・安全装置の理由で呼び出さなかった"""


def _load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def jst_now():
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)


def limits():
    p = os.path.join(HERE, "limits.json")
    raw = open(p, "rb").read()
    want = os.environ.get("AI_BUDGET_LIMITS_SHA256", "").strip().lower()
    got = hashlib.sha256(raw).hexdigest()
    if not want:
        raise BudgetBlocked("AI_BUDGET_LIMITS_SHA256 が未設定（オーナーが GitHub の変数に設定するまで有料 API は使わない）")
    if want != got:
        raise BudgetBlocked(f"limits.json が承認された内容と違う（sha256 {got[:12]}…）。オーナーの確認が必要")
    return json.loads(raw)


def allocation(lim):
    a = _load("allocation.json")["allocation_jpy"]
    if sum(a.values()) != lim["monthly_budget_jpy"]:
        raise BudgetBlocked(f"用途別の配分の合計 {sum(a.values())} 円が月の予算 {lim['monthly_budget_jpy']} 円と違う")
    return a


def fx_rate(lim, fetch=True):
    """1ドル何円か。直近のものを使い、取れなければ保守的な既定値（高めの円安）"""
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        d = json.load(open(FX_FILE))
        age = (now - datetime.datetime.fromisoformat(d["at"])).total_seconds() / 3600
        if age <= lim["fx_max_age_hours"]:
            return max(d["rate"], 1.0), "fx.json"
    except Exception:
        pass
    if fetch:
        try:  # 欧州中央銀行の参照レート（無料・キー不要）
            with urllib.request.urlopen("https://api.frankfurter.app/latest?from=USD&to=JPY", timeout=15) as r:
                rate = float(json.load(r)["rates"]["JPY"])
            json.dump({"rate": rate, "at": now.isoformat(), "source": "frankfurter.app (ECB)"}, open(FX_FILE, "w"))
            return max(rate, lim["fx_fallback_jpy_per_usd"] * 0.8), "frankfurter"
        except Exception:
            pass
    return float(lim["fx_fallback_jpy_per_usd"]), "fallback"


def price(model, prompt_tokens=0):
    p = _load("pricing.json")["models"].get(model)
    if not p:
        raise BudgetBlocked(f"料金表に無いモデル: {model}")
    if p.get("long") and prompt_tokens > p.get("long_prompt_tokens", 10**12):
        return p["long"]
    return p


def usd_cost(model, input_tokens, output_tokens, cache_write=0, cache_read=0, searches=0, batch=False):
    p = price(model, input_tokens + cache_write + cache_read)
    usd = (input_tokens * p["input"] + output_tokens * p["output"] + cache_write * p["cache_write_5m"] + cache_read * p["cache_read"]) / 1e6
    if batch:
        usd *= _load("pricing.json")["batch_discount"]
    return usd + searches * _load("pricing.json")["web_search_usd_per_1000"] / 1000


def estimate_input_tokens(*texts):
    """呼び出し前の見積もり（上限寄り）：日本語は1文字≒1トークン以上になりうるので、文字数をそのまま使う"""
    return sum(len(t) for t in texts if t) + 50


def _ledger():
    if not os.path.exists(LEDGER):
        return []
    return [json.loads(l) for l in open(LEDGER, encoding="utf-8") if l.strip()]


def spent(entries=None, now=None):
    now = now or jst_now()
    e = entries if entries is not None else _ledger()
    month = now.strftime("%Y-%m"); year = now.strftime("%Y"); day = now.strftime("%Y-%m-%d")
    out = {"month_jpy": 0.0, "year_jpy": 0.0, "day_calls": 0, "by_purpose": {}}
    for x in e:
        t = x["at_jst"]
        if t.startswith(year):
            out["year_jpy"] += x["jpy"]
        if t.startswith(month):
            out["month_jpy"] += x["jpy"]
            out["by_purpose"][x["purpose"]] = out["by_purpose"].get(x["purpose"], 0) + x["jpy"]
        if t.startswith(day):
            out["day_calls"] += 1
    return out


def check(purpose, priority, est_jpy, lim=None):
    """呼び出してよいか。だめなら BudgetBlocked。よければ現状を返す"""
    if os.path.exists(STOP_FILE):
        raise BudgetBlocked("緊急停止中（ops/ai_budget/STOP）: " + open(STOP_FILE, encoding="utf-8").read()[:200])
    if os.environ.get("AI_KILL_SWITCH", "").strip().lower() in ("1", "true", "yes", "on"):
        raise BudgetBlocked("緊急停止中（AI_KILL_SWITCH）")
    lim = lim or limits()
    alloc = allocation(lim)
    if priority not in PRIORITIES:
        raise BudgetBlocked(f"優先度が不正: {priority}")
    if purpose not in alloc or purpose == "reserve":
        raise BudgetBlocked(f"用途が不正: {purpose}")
    s = spent()
    m = lim["monthly_budget_jpy"]
    if est_jpy > lim["max_cost_per_call_jpy"]:
        raise BudgetBlocked(f"1回の見積もり {est_jpy:.1f} 円が上限 {lim['max_cost_per_call_jpy']} 円を超える")
    if _run_calls >= lim["max_calls_per_run"]:
        raise BudgetBlocked(f"1回の実行の呼び出し回数の上限 {lim['max_calls_per_run']} に到達（無限ループ防止）")
    if s["day_calls"] >= lim["max_calls_per_day"]:
        raise BudgetBlocked(f"1日の呼び出し回数の上限 {lim['max_calls_per_day']} に到達")
    if s["month_jpy"] + est_jpy > m * lim["hard_stop_ratio"]:
        raise BudgetBlocked(f"月の予算の {int(lim['hard_stop_ratio']*100)}% に達するため停止（使用 {s['month_jpy']:.0f} 円＋見積もり {est_jpy:.0f} 円）")
    if s["year_jpy"] + est_jpy > lim["annual_budget_jpy"] * lim["hard_stop_ratio"]:
        raise BudgetBlocked("年の予算の上限に達するため停止")
    if priority == "low" and s["month_jpy"] + est_jpy > m * lim["low_priority_stop_ratio"]:
        raise BudgetBlocked(f"月の予算の {int(lim['low_priority_stop_ratio']*100)}% 以上のため、優先度 low の処理は止める")
    if s["by_purpose"].get(purpose, 0) + est_jpy > alloc[purpose]:
        raise BudgetBlocked(f"用途「{purpose}」の配分 {alloc[purpose]} 円を超える（使用 {s['by_purpose'].get(purpose, 0):.0f} 円）")
    return s


def _alerts(lim, month_jpy):
    m = lim["monthly_budget_jpy"]; now = jst_now()
    try:
        a = json.load(open(ALERTS))
    except Exception:
        a = {}
    key = now.strftime("%Y-%m")
    cur = a.get(key, [])
    for name, r in (("50%", lim["notify_ratio"]), ("80%", lim["low_priority_stop_ratio"]), ("90%", lim["hard_stop_ratio"])):
        if month_jpy >= m * r and name not in cur:
            cur.append(name)
    a[key] = cur
    json.dump(a, open(ALERTS, "w"), ensure_ascii=False, indent=1)
    return cur


@contextlib.contextmanager
def _locked():
    with open(LOCK_FILE, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def record(entry):
    with open(LEDGER, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def guarded_call(client, *, purpose, priority, model, system, messages, max_tokens, task="", tools=None, max_searches=0, **kw):
    """予算の確認 → 呼び出し → 実額の記録。戻り値は API の応答。止めたときは BudgetBlocked"""
    global _run_calls
    lim = limits()
    max_tokens = min(int(max_tokens), lim["max_output_tokens_cap"])
    text = (system if isinstance(system, str) else json.dumps(system, ensure_ascii=False)) + json.dumps(messages, ensure_ascii=False)
    in_est = estimate_input_tokens(text) * (1 + max_searches)  # 検索結果も入力に入る（上限寄り）
    rate, fx_src = fx_rate(lim)
    k = rate * lim["tax_and_fee_multiplier"]
    est_jpy = usd_cost(model, in_est, max_tokens, searches=max_searches) * k
    with _locked():
        before = check(purpose, priority, est_jpy, lim)
        _run_calls += 1
        args = dict(model=model, system=system, messages=messages, max_tokens=max_tokens, **kw)
        if tools:
            args["tools"] = tools
        resp = client.with_options(max_retries=lim["max_retries"]).messages.create(**args)
        u = getattr(resp, "usage", None)
        base = {"at_jst": jst_now().isoformat(timespec="seconds"), "purpose": purpose, "priority": priority, "task": task[:120],
                "model": model, "fx": round(rate, 2), "fx_source": fx_src, "est_jpy": round(est_jpy, 3)}
        if u is None or getattr(u, "input_tokens", None) is None or getattr(u, "output_tokens", None) is None:
            record({**base, "jpy": round(est_jpy, 3), "status": "usage_unknown"})
            open(STOP_FILE, "w", encoding="utf-8").write(f"{base['at_jst']} 使用量が応答に無かったため停止（{model}）。確認後にこのファイルを消す\n")
            raise BudgetBlocked("使用量が取得できないため停止した")
        st = getattr(u, "server_tool_use", None)
        searches = getattr(st, "web_search_requests", 0) if st else 0
        usd = usd_cost(model, u.input_tokens, u.output_tokens, getattr(u, "cache_creation_input_tokens", 0) or 0,
                       getattr(u, "cache_read_input_tokens", 0) or 0, searches or 0)
        jpy = usd * k
        record({**base, "status": "ok", "input_tokens": u.input_tokens, "output_tokens": u.output_tokens,
                "cache_write": getattr(u, "cache_creation_input_tokens", 0) or 0, "cache_read": getattr(u, "cache_read_input_tokens", 0) or 0,
                "searches": searches or 0, "usd": round(usd, 6), "jpy": round(jpy, 3)})
        _alerts(lim, before["month_jpy"] + jpy)
    return resp


def status():
    """日報・ダッシュボード用の集計（料金を呼ばない）"""
    try:
        lim = json.load(open(os.path.join(HERE, "limits.json")))
    except Exception:
        return {"error": "limits.json を読めない"}
    s = spent(); m = lim["monthly_budget_jpy"]
    return {"month_jpy": round(s["month_jpy"], 1), "remaining_jpy": round(m * lim["hard_stop_ratio"] - s["month_jpy"], 1),
            "used_ratio": round(s["month_jpy"] / m, 4), "year_jpy": round(s["year_jpy"], 1), "day_calls": s["day_calls"],
            "by_purpose": {k: round(v, 1) for k, v in s["by_purpose"].items()}, "stopped": os.path.exists(STOP_FILE)}


if __name__ == "__main__":
    print(json.dumps(status(), ensure_ascii=False, indent=1))
