"""予算管理の試験（有料 API は呼ばない。偽のクライアントを使う）。実行: python3 ops/ai_budget/test_budget.py"""
import hashlib, importlib.util, json, os, shutil, sys, tempfile, threading, types, unittest

SRC = os.path.dirname(os.path.abspath(__file__))


def load_module(tmp):
    for n in ("limits.json", "pricing.json", "allocation.json", "budget.py"):
        shutil.copy(os.path.join(SRC, n), tmp)
    spec = importlib.util.spec_from_file_location(f"budget_{id(tmp)}", os.path.join(tmp, "budget.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    json.dump({"rate": 150.0, "at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}, open(os.path.join(tmp, "fx.json"), "w"))
    return m


class Usage:
    def __init__(self, i, o, **k):
        self.input_tokens, self.output_tokens = i, o
        self.cache_creation_input_tokens = k.get("cw", 0); self.cache_read_input_tokens = k.get("cr", 0)
        self.server_tool_use = None


class FakeClient:
    def __init__(self, usage=lambda: Usage(1000, 500)):
        self.calls = 0; self.usage = usage; self.retries = None
        self.messages = types.SimpleNamespace(create=self._create)

    def with_options(self, max_retries):
        self.retries = max_retries; return self

    def _create(self, **kw):
        self.calls += 1
        return types.SimpleNamespace(usage=self.usage(), content=[])


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.b = load_module(self.tmp)
        os.environ["AI_BUDGET_LIMITS_SHA256"] = hashlib.sha256(open(os.path.join(self.tmp, "limits.json"), "rb").read()).hexdigest()
        os.environ.pop("AI_KILL_SWITCH", None)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def call(self, client=None, **kw):
        args = dict(purpose="research", priority="normal", model="claude-haiku-5-5", system="s", messages=[{"role": "user", "content": "hi"}], max_tokens=1000)
        args.update(kw)
        return self.b.guarded_call(client or FakeClient(), **args)

    def seed(self, jpy, purpose="development"):
        self.b.record({"at_jst": self.b.jst_now().isoformat(), "purpose": purpose, "priority": "normal", "jpy": jpy, "status": "ok"})

    def test_ok_records_cost(self):
        c = FakeClient(); self.call(c)
        e = self.b._ledger()[-1]
        # Haiku 5.5: (1000*0.10 + 500*0.50)/1e6 USD × 150円 × 1.13
        self.assertAlmostEqual(e["jpy"], (1000 * 0.10 + 500 * 0.50) / 1e6 * 150 * 1.13, places=3)
        self.assertEqual(c.retries, 1)

    def test_limits_hash_missing_or_changed(self):
        os.environ["AI_BUDGET_LIMITS_SHA256"] = ""
        with self.assertRaises(self.b.BudgetBlocked): self.call()
        os.environ["AI_BUDGET_LIMITS_SHA256"] = "0" * 64
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    def test_kill_switch_and_stop_file(self):
        os.environ["AI_KILL_SWITCH"] = "1"
        c = FakeClient()
        with self.assertRaises(self.b.BudgetBlocked): self.call(c)
        os.environ.pop("AI_KILL_SWITCH")
        open(self.b.STOP_FILE, "w").write("x")
        with self.assertRaises(self.b.BudgetBlocked): self.call(c)
        self.assertEqual(c.calls, 0)

    def test_unknown_model(self):
        with self.assertRaises(self.b.BudgetBlocked): self.call(model="claude-unknown")

    def test_hard_stop_90(self):
        self.seed(4499)  # 90% = 4500円
        c = FakeClient()
        with self.assertRaises(self.b.BudgetBlocked): self.call(c, purpose="research", max_tokens=16000, priority="high")
        self.assertEqual(c.calls, 0)

    def test_low_priority_stops_at_80(self):
        self.seed(4000)
        with self.assertRaises(self.b.BudgetBlocked): self.call(priority="low")
        self.call(priority="high")  # 高い優先度は 90% までは動く

    def test_purpose_allocation(self):
        self.seed(800, purpose="research")
        with self.assertRaises(self.b.BudgetBlocked): self.call(purpose="research")
        self.call(purpose="qa")

    def test_allocation_sum_must_match(self):
        a = json.load(open(os.path.join(self.tmp, "allocation.json"))); a["allocation_jpy"]["research"] += 1
        json.dump(a, open(os.path.join(self.tmp, "allocation.json"), "w"))
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    def test_per_call_cap(self):
        # Opus で巨大な入力 → 1回100円を超える見積もり
        with self.assertRaises(self.b.BudgetBlocked): self.call(model="claude-opus-5-5", messages=[{"role": "user", "content": "あ" * 200000}], purpose="development")

    def test_loop_guard_per_run(self):
        lim = json.load(open(os.path.join(self.tmp, "limits.json")))
        c = FakeClient()
        with self.assertRaises(self.b.BudgetBlocked):
            for _ in range(lim["max_calls_per_run"] + 1):
                self.call(c, purpose="development")
        self.assertEqual(c.calls, lim["max_calls_per_run"])

    def test_usage_missing_stops(self):
        c = FakeClient(usage=lambda: None)
        with self.assertRaises(self.b.BudgetBlocked): self.call(c)
        self.assertTrue(os.path.exists(self.b.STOP_FILE))
        self.assertEqual(self.b._ledger()[-1]["status"], "usage_unknown")
        with self.assertRaises(self.b.BudgetBlocked): self.call(FakeClient())

    def test_alert_50(self):
        self.seed(2499)
        self.call(purpose="qa", max_tokens=16000)  # 少しでも足せば 50% を超える…とは限らないので金額で確かめる
        a = json.load(open(self.b.ALERTS)) if os.path.exists(self.b.ALERTS) else {}
        month = self.b.jst_now().strftime("%Y-%m")
        self.assertEqual("50%" in a.get(month, []), self.b.spent()["month_jpy"] >= 2500)
        self.seed(10); self.call(purpose="qa")
        self.assertIn("50%", json.load(open(self.b.ALERTS))[month])

    def test_fx_fallback_is_conservative(self):
        os.remove(os.path.join(self.tmp, "fx.json"))
        lim = json.load(open(os.path.join(self.tmp, "limits.json")))
        rate, src = self.b.fx_rate(lim, fetch=False)
        self.assertEqual((rate, src), (165.0, "fallback"))

    def test_concurrency_serialized(self):
        """同時に呼んでも、予約と記録はロックの中で順番に行われ、上限を超えない"""
        self.seed(4490)
        results = []
        def worker():
            try: self.call(purpose="development", max_tokens=200); results.append("ok")
            except self.b.BudgetBlocked: results.append("blocked")
        ts = [threading.Thread(target=worker) for _ in range(8)]
        [t.start() for t in ts]; [t.join() for t in ts]
        self.assertLessEqual(self.b.spent()["month_jpy"], 4500)

    def test_output_tokens_capped(self):
        seen = {}
        c = FakeClient(); orig = c._create
        def create(**kw): seen.update(kw); return orig(**kw)
        c.messages = types.SimpleNamespace(create=create)
        self.call(c, max_tokens=999999, purpose="development")
        self.assertEqual(seen["max_tokens"], 16000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
