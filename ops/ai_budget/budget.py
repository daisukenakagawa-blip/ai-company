"""AI API の予算管理（2026-11-27 オーナー指示 Ver.2.0：追加支出は月5,000円・年60,000円まで）。

有料の AI API は、必ずこのモジュールの guarded_call() を通して呼ぶ。直接 client.messages.create を呼ばない
（scan_direct_calls.py が検出して止める）。

この仕組みは「内側の歯止め」。外側の歯止め（AI が変えられないもの）は Anthropic Console 側の設定
（契約付属の API クレジットだけを使い、支払い方法・自動チャージなし／ワークスペースの使用上限）で、オーナーが管理する。

安全装置（どれかに当たれば呼び出さない＝Fail Closed）
- 緊急停止：全社＝ops/ai_budget/STOP か AI_KILL_SWITCH=1／事業部ごと＝ops/ai_budget/STOP-d1 など か AI_KILL_SWITCH_D1=1（GitHub の変数から渡す）
- 事業部ごとの配分（allocation.json の divisions_jpy。合計5,000円固定、経営本部が変えてよい）。全事業部で同じ1つの予算・台帳を使う
- 改ざん防止：budget.py・limits.json・pricing.json をまとめた SHA-256 が、オーナーだけが設定する GitHub の変数
  AI_BUDGET_SHA256 と一致しない → 停止（開発 AI がこの3つを変えると、オーナーが確認するまで有料 API は動かない）
- 料金表に無いモデル・料金表が古い（pricing_max_age_days 超）→ 停止
- 呼ぶ前に、見積もりの上限額を台帳に「予約」として書く → 呼ぶ → 実額との差を「精算」として書く。
  通信の切断・タイムアウト・例外で精算できなかった呼び出しは、予約額をそのまま使ったものとして残る（多めに数える）
- 自動の再試行はしない（max_retries=0）。同じ実行の中の呼び出し回数・金額、1日の回数・金額に上限
- 月（UTC の暦月。Anthropic の使用上限は毎月1日にリセット）の 50% で通知、80% で優先度 low を停止、90% で全停止
- 為替は高め（fx_buffer）、料金は多め（price_buffer）、税・カード手数料（tax_and_fee_multiplier）を上乗せして円にする
- 応答に使用量（usage）が無い → 予約額のまま記録し、STOP を作って以後止める
- 同時実行：同じ環境ではファイルロック。GitHub Actions では concurrency グループ "paid-ai" で1本ずつ
残り10%（90%〜100%）は、為替・未反映の請求・税金の予備として使わない。
"""
import contextlib, datetime, fcntl, hashlib, json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, "ledger.jsonl")
ALERTS = os.path.join(HERE, "alerts.json")
FX_FILE = os.path.join(HERE, "fx.json")
STOP_FILE = os.path.join(HERE, "STOP")
LOCK_FILE = os.path.join(HERE, ".lock")
PROTECTED = ("budget.py", "limits.json", "pricing.json")
PRIORITIES = ("high", "normal", "low")
_run = {"calls": 0, "jpy": 0.0, "id": (f"gh-{os.environ['GITHUB_RUN_ID']}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
                                      if os.environ.get("GITHUB_RUN_ID") else f"local-{os.getpid()}")}


class BudgetBlocked(Exception):
    """予算・安全装置の理由で呼び出さなかった"""


def _load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def manifest_sha256():
    h = hashlib.sha256()
    for n in PROTECTED:
        with open(os.path.join(HERE, n), "rb") as f:
            h.update(n.encode() + b"\0" + f.read() + b"\0")
    return h.hexdigest()


def limits():
    want = os.environ.get("AI_BUDGET_SHA256", "").strip().lower()
    if not want:
        raise BudgetBlocked("AI_BUDGET_SHA256 が未設定（オーナーが GitHub の変数に設定するまで有料 API は使わない）")
    got = manifest_sha256()
    if want != got:
        raise BudgetBlocked(f"予算管理のファイル（{', '.join(PROTECTED)}）が承認された内容と違う（{got[:12]}…）。オーナーの確認が必要")
    return _load("limits.json")


def allocation(lim):
    d = _load("allocation.json")
    a = d["divisions_jpy"]
    if sum(a.values()) != lim["monthly_budget_jpy"]:
        raise BudgetBlocked(f"事業部の配分の合計 {sum(a.values())} 円が月の予算 {lim['monthly_budget_jpy']} 円と違う")
    if any(v < 0 for v in a.values()):
        raise BudgetBlocked("事業部の配分に負の値がある")
    return a, set(d.get("purposes", []))


def pricing(lim, today=None):
    p = _load("pricing.json")
    today = today or utc_now().date()
    age = (today - datetime.date.fromisoformat(p["checked"])).days
    if age > lim["pricing_max_age_days"]:
        raise BudgetBlocked(f"料金表が {age} 日前のもの（{lim['pricing_max_age_days']} 日を超えた）。公式の料金を確かめて更新するまで止める")
    return p


def fx_rate(lim, fetch=True):
    """1ドル何円か（高め）。直近の値、取れなければ既定値（円安側）。どちらにも fx_buffer を掛ける"""
    rate, src = None, "fallback"
    try:
        with open(FX_FILE) as f:
            d = json.load(f)
        if (utc_now() - datetime.datetime.fromisoformat(d["at"])).total_seconds() / 3600 <= lim["fx_max_age_hours"]:
            rate, src = float(d["rate"]), "fx.json"
    except Exception:
        pass
    if rate is None and fetch:
        try:  # 欧州中央銀行の参照レート（無料・キー不要）
            with urllib.request.urlopen("https://api.frankfurter.app/latest?from=USD&to=JPY", timeout=15) as r:
                rate, src = float(json.load(r)["rates"]["JPY"]), "frankfurter"
            with open(FX_FILE, "w") as f:
                json.dump({"rate": rate, "at": utc_now().isoformat(), "source": "frankfurter.app (ECB)"}, f)
        except Exception:
            rate = None
    if rate is None:
        rate = float(lim["fx_fallback_jpy_per_usd"]); src = "fallback"
    return max(rate, lim["fx_fallback_jpy_per_usd"] * 0.8) * lim["fx_buffer"], src


def usd_cost(prices, model, input_tokens, output_tokens, cache_write=0, cache_read=0, searches=0, batch=False):
    p = prices["models"].get(model)
    if not p:
        raise BudgetBlocked(f"料金表に無いモデル: {model}")
    if p.get("long") and input_tokens + cache_write + cache_read > p.get("long_prompt_tokens", 10**12):
        p = p["long"]
    usd = (input_tokens * p["input"] + output_tokens * p["output"] + cache_write * p["cache_write_5m"] + cache_read * p["cache_read"]) / 1e6
    if batch:
        usd *= prices["batch_discount"]
    return usd + searches * prices["web_search_usd_per_1000"] / 1000


def estimate_input_tokens(*texts):
    """呼ぶ前の見積もり（上限寄り）：日本語は1文字≒1トークン以上になりうるので、文字数をそのまま使う"""
    return sum(len(t) for t in texts if t) + 50


def _ledger():
    if not os.path.exists(LEDGER):
        return []
    with open(LEDGER, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def spent(entries=None, now=None):
    """UTC の暦月・暦年・日で集計（予約・精算・記録のすべての jpy の合計）"""
    now = now or utc_now()
    e = entries if entries is not None else _ledger()
    month, year, day = now.strftime("%Y-%m"), now.strftime("%Y"), now.strftime("%Y-%m-%d")
    out = {"month_jpy": 0.0, "year_jpy": 0.0, "day_jpy": 0.0, "day_calls": 0, "by_purpose": {}, "by_division": {}}
    for x in e:
        t = x["at_utc"]
        if t.startswith(year):
            out["year_jpy"] += x["jpy"]
        if t.startswith(month):
            out["month_jpy"] += x["jpy"]
            out["by_purpose"][x["purpose"]] = out["by_purpose"].get(x["purpose"], 0) + x["jpy"]
            dv = x.get("division", "?")
            out["by_division"][dv] = out["by_division"].get(dv, 0) + x["jpy"]
        if t.startswith(day):
            out["day_jpy"] += x["jpy"]
            out["day_calls"] += 1 if x.get("kind") == "reserve" else 0
    return out


def check(purpose, priority, est_jpy, lim, now=None, division=None):
    """呼び出してよいか。だめなら BudgetBlocked"""
    if os.path.exists(STOP_FILE):
        with open(STOP_FILE, encoding="utf-8") as f:
            raise BudgetBlocked("緊急停止中（ops/ai_budget/STOP）: " + f.read()[:200])
    on = lambda v: os.environ.get(v, "").strip().lower() in ("1", "true", "yes", "on")
    if on("AI_KILL_SWITCH"):
        raise BudgetBlocked("緊急停止中（AI_KILL_SWITCH）")
    alloc, purposes = allocation(lim)
    if division not in alloc or division == "reserve":
        raise BudgetBlocked(f"事業部が不正: {division}")
    df = os.path.join(HERE, f"STOP-{division}")
    if os.path.exists(df) or on(f"AI_KILL_SWITCH_{division.upper()}"):
        raise BudgetBlocked(f"{division} の緊急停止中")
    if priority not in PRIORITIES:
        raise BudgetBlocked(f"優先度が不正: {priority}")
    if purpose not in purposes:
        raise BudgetBlocked(f"用途が不正: {purpose}")
    s = spent(now=now)
    m = lim["monthly_budget_jpy"]
    rules = [
        (est_jpy > lim["max_cost_per_call_jpy"], f"1回の見積もり {est_jpy:.1f} 円が上限 {lim['max_cost_per_call_jpy']} 円を超える"),
        (_run["calls"] >= lim["max_calls_per_run"], f"1回の実行の呼び出し回数の上限 {lim['max_calls_per_run']} に到達（無限ループ防止）"),
        (_run["jpy"] + est_jpy > lim["max_cost_per_run_jpy"], f"1回の実行の金額の上限 {lim['max_cost_per_run_jpy']} 円に達する"),
        (s["day_calls"] >= lim["max_calls_per_day"], f"1日の呼び出し回数の上限 {lim['max_calls_per_day']} に到達"),
        (s["day_jpy"] + est_jpy > lim["max_cost_per_day_jpy"], f"1日の金額の上限 {lim['max_cost_per_day_jpy']} 円に達する"),
        (s["month_jpy"] + est_jpy > m * lim["hard_stop_ratio"], f"月の予算の {int(lim['hard_stop_ratio']*100)}% に達するため停止（使用 {s['month_jpy']:.0f} 円＋見積もり {est_jpy:.0f} 円）"),
        (s["year_jpy"] + est_jpy > lim["annual_budget_jpy"] * lim["hard_stop_ratio"], "年の予算の上限に達するため停止"),
        (priority == "low" and s["month_jpy"] + est_jpy > m * lim["low_priority_stop_ratio"], f"月の予算の {int(lim['low_priority_stop_ratio']*100)}% 以上のため、優先度 low は止める"),
        (s["by_division"].get(division, 0) + est_jpy > alloc[division], f"事業部「{division}」の配分 {alloc[division]} 円を超える（使用 {s['by_division'].get(division, 0):.0f} 円）"),
    ]
    for hit, why in rules:
        if hit:
            raise BudgetBlocked(why)
    return s


def _alerts(lim, month_jpy):
    m = lim["monthly_budget_jpy"]
    try:
        with open(ALERTS) as f:
            a = json.load(f)
    except Exception:
        a = {}
    key = utc_now().strftime("%Y-%m")
    cur = a.get(key, [])
    for name, r in (("50%", lim["notify_ratio"]), ("80%", lim["low_priority_stop_ratio"]), ("90%", lim["hard_stop_ratio"])):
        if month_jpy >= m * r and name not in cur:
            cur.append(name)
    a[key] = cur
    with open(ALERTS, "w") as f:
        json.dump(a, f, ensure_ascii=False, indent=1)
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
    entry.setdefault("at_utc", utc_now().isoformat(timespec="seconds"))
    entry.setdefault("run", _run["id"])
    with open(LEDGER, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        f.flush(); os.fsync(f.fileno())


def guarded_call(client, *, division, purpose, priority, model, system, messages, max_tokens, task="", tools=None, max_searches=0, **kw):
    """予算の確認 → 予約 → 呼び出し → 精算。戻り値は API の応答。止めたときは BudgetBlocked"""
    lim = limits()
    prices = pricing(lim)
    max_tokens = min(int(max_tokens), lim["max_output_tokens_cap"])
    text = (system if isinstance(system, str) else json.dumps(system, ensure_ascii=False)) + json.dumps(messages, ensure_ascii=False)
    in_est = estimate_input_tokens(text) * (1 + max_searches)  # 検索結果も入力に入る（上限寄り）
    rate, fx_src = fx_rate(lim)
    k = rate * lim["tax_and_fee_multiplier"] * lim["price_buffer"]  # USD → 円（多めに）
    est_jpy = usd_cost(prices, model, in_est, max_tokens, searches=max_searches) * k
    base = {"division": division, "purpose": purpose, "priority": priority, "task": task[:120], "model": model, "jpy_per_usd": round(k, 2), "fx_source": fx_src}
    with _locked():
        check(purpose, priority, est_jpy, lim, division=division)
        _run["calls"] += 1; _run["jpy"] += est_jpy
        record({**base, "kind": "reserve", "jpy": round(est_jpy, 4)})  # 先に予約（切断・例外でもこの額が残る）
        args = dict(model=model, system=system, messages=messages, max_tokens=max_tokens, **kw)
        if tools:
            args["tools"] = tools
        t0 = time.time()
        try:
            resp = client.with_options(max_retries=lim["max_retries"], timeout=lim["request_timeout_sec"]).messages.create(**args)
        except Exception as e:
            record({**base, "kind": "error", "jpy": 0, "error": f"{type(e).__name__}: {str(e)[:160]}", "note": "予約額を使ったものとして残す"})
            raise
        sec = round(time.time() - t0, 2)
        u = getattr(resp, "usage", None)
        if u is None or getattr(u, "input_tokens", None) is None or getattr(u, "output_tokens", None) is None:
            record({**base, "kind": "settle", "jpy": 0, "status": "usage_unknown", "seconds": sec})
            with open(STOP_FILE, "w", encoding="utf-8") as f:
                f.write(f"{utc_now().isoformat()} 使用量が応答に無かったため停止（{model}）。確認後にこのファイルを消す\n")
            raise BudgetBlocked("使用量が取得できないため停止した（予約額のまま記録）")
        st = getattr(u, "server_tool_use", None)
        searches = (getattr(st, "web_search_requests", 0) if st else 0) or 0
        cw, cr = getattr(u, "cache_creation_input_tokens", 0) or 0, getattr(u, "cache_read_input_tokens", 0) or 0
        usd = usd_cost(prices, model, u.input_tokens, u.output_tokens, cw, cr, searches)
        jpy = usd * k
        _run["jpy"] += jpy - est_jpy
        record({**base, "kind": "settle", "jpy": round(jpy - est_jpy, 4), "actual_jpy": round(jpy, 4), "usd": round(usd, 6),
                "model_returned": getattr(resp, "model", ""), "input_tokens": u.input_tokens, "output_tokens": u.output_tokens,
                "cache_write": cw, "cache_read": cr, "searches": searches, "seconds": sec, "status": "ok"})
        _alerts(lim, spent()["month_jpy"])
    return resp


def status():
    """日報・ダッシュボード用の集計（API を呼ばない）"""
    try:
        lim = _load("limits.json")
    except Exception:
        return {"error": "limits.json を読めない"}
    s = spent(); m = lim["monthly_budget_jpy"]
    return {"month_utc": utc_now().strftime("%Y-%m"), "month_jpy": round(s["month_jpy"], 1),
            "remaining_jpy_before_hard_stop": round(m * lim["hard_stop_ratio"] - s["month_jpy"], 1),
            "used_ratio": round(s["month_jpy"] / m, 4), "year_jpy": round(s["year_jpy"], 1),
            "today_jpy": round(s["day_jpy"], 1), "today_calls": s["day_calls"],
            "by_purpose": {k: round(v, 1) for k, v in s["by_purpose"].items()},
            "by_division": {k: round(v, 1) for k, v in s["by_division"].items()},
            "division_budget_jpy": _load("allocation.json")["divisions_jpy"],
            "stopped": os.path.exists(STOP_FILE),
            "stopped_divisions": [d for d in ("d1", "d2", "hq") if os.path.exists(os.path.join(HERE, f"STOP-{d}"))],
            "manifest_sha256": manifest_sha256()}


if __name__ == "__main__":
    print(json.dumps(status(), ensure_ascii=False, indent=1))
