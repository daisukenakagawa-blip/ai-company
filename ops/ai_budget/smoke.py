"""初回の有料 API の試験（オーナー指示：最大100円以内）。ai-paid.yml から1回だけ動かす。

1. 予算管理が有効か（キー・AI_BUDGET_SHA256・緊急停止）を確かめる。未設定なら API を呼ばずに終わる
2. Models API（無料）で、実際に使えるモデル ID を記録する
3. Haiku 5.5 に小さな依頼を1回だけ送る（guarded_call 経由。見積もりの上限は1円未満）
4. 消費トークン・費用・実行時間・結果を smoke-result.json に記録する
"""
import datetime, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import budget  # noqa: E402

OUT = os.path.join(HERE, "smoke-result.json")
MODEL = os.environ.get("SMOKE_MODEL", "claude-haiku-5-5")


def save(d):
    d["at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(json.dumps(d, ensure_ascii=False, indent=1))


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return save({"status": "未実行", "reason": "ANTHROPIC_API_KEY が未設定（オーナーの設定待ち）"})
    try:
        budget.limits()
    except budget.BudgetBlocked as e:
        return save({"status": "未実行", "reason": str(e), "manifest_sha256": budget.manifest_sha256()})
    import anthropic
    client = anthropic.Anthropic(max_retries=0)
    try:
        ids = [m.id for m in client.models.list(limit=100).data]  # 無料（課金されない）
    except Exception as e:
        return save({"status": "失敗", "step": "models.list", "error": f"{type(e).__name__}: {str(e)[:200]}"})
    known = json.load(open(os.path.join(HERE, "pricing.json")))["models"]
    model = MODEL if MODEL in ids else next((i for i in ids if i.startswith(MODEL)), None)
    if not model:
        return save({"status": "未実行", "reason": f"{MODEL} が Models API の一覧に無い。料金表を正式 ID に合わせる必要あり（オーナー確認）",
                     "models_available": ids, "pricing_keys": list(known)})
    if model not in known:
        # 料金表のキーは別名。日付つきの正式 ID が返ったら、料金は別名のものを使う（正式 ID を記録して後で料金表に足す）
        call_model, price_key = MODEL, MODEL
    else:
        call_model, price_key = model, model
    before = budget.status()
    t0 = time.time()
    try:
        resp = budget.guarded_call(client, purpose="qa", priority="high", model=call_model, max_tokens=200, task="初回の有料 API 試験",
                                   system="あなたは試験用の応答係です。指示どおり短く答えてください。",
                                   messages=[{"role": "user", "content": "「予算管理の試験は成功」とだけ返してください。"}])
    except budget.BudgetBlocked as e:
        return save({"status": "止めた（予算管理）", "reason": str(e), "models_available": ids})
    except Exception as e:
        return save({"status": "失敗", "step": "messages", "error": f"{type(e).__name__}: {str(e)[:200]}", "budget": budget.status()})
    led = [x for x in budget._ledger() if x.get("kind") == "settle"][-1]
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    save({"status": "成功", "model_requested": call_model, "model_returned": getattr(resp, "model", ""), "models_available": ids,
          "input_tokens": led.get("input_tokens"), "output_tokens": led.get("output_tokens"), "usd": led.get("usd"),
          "jpy_recorded": led.get("actual_jpy"), "jpy_per_usd_used": led.get("jpy_per_usd"), "seconds": round(time.time() - t0, 2),
          "result_text": text[:200], "budget_before": before, "budget_after": budget.status()})


if __name__ == "__main__":
    main()
