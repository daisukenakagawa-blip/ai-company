"""予算管理の試験（有料 API は呼ばない。偽のクライアントを使う）。実行: python3 ops/ai_budget/test_budget.py"""
import datetime, importlib.util, json, multiprocessing, os, shutil, sys, tempfile, threading, types, unittest

SRC = os.path.dirname(os.path.abspath(__file__))


def load_module(tmp, name=None):
    spec = importlib.util.spec_from_file_location(name or f"budget_{id(tmp)}_{os.getpid()}", os.path.join(tmp, "budget.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def prepare(tmp):
    for n in ("limits.json", "pricing.json", "allocation.json", "budget.py"):
        shutil.copy(os.path.join(SRC, n), tmp)
    p = json.load(open(os.path.join(tmp, "pricing.json"))); p["checked"] = datetime.date.today().isoformat()
    json.dump(p, open(os.path.join(tmp, "pricing.json"), "w"))
    json.dump({"rate": 150.0, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(os.path.join(tmp, "fx.json"), "w"))


class Usage:
    def __init__(self, i, o, cw=0, cr=0):
        self.input_tokens, self.output_tokens = i, o
        self.cache_creation_input_tokens = cw; self.cache_read_input_tokens = cr
        self.server_tool_use = None


class FakeClient:
    def __init__(self, usage=lambda: Usage(1000, 500), fail=None):
        self.calls = 0; self.usage = usage; self.fail = fail; self.opts = None
        self.messages = types.SimpleNamespace(create=self._create)

    def with_options(self, **kw):
        self.opts = kw; return self

    def _create(self, **kw):
        self.calls += 1
        if self.fail:
            raise self.fail
        return types.SimpleNamespace(usage=self.usage(), content=[], model=kw["model"] + "-20261101")


ARGS = dict(purpose="research", priority="normal", model="claude-haiku-5-5", system="s", messages=[{"role": "user", "content": "hi"}], max_tokens=1000)


def _proc_worker(tmp, sha, q):
    os.environ["AI_BUDGET_SHA256"] = sha
    b = load_module(tmp, f"bp{os.getpid()}")
    try:
        b.guarded_call(FakeClient(), **{**ARGS, "purpose": "development", "max_tokens": 200}); q.put("ok")
    except b.BudgetBlocked:
        q.put("blocked")


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); prepare(self.tmp)
        self.b = load_module(self.tmp)
        os.environ["AI_BUDGET_SHA256"] = self.b.manifest_sha256()
        os.environ.pop("AI_KILL_SWITCH", None)
        self.lim = json.load(open(os.path.join(self.tmp, "limits.json")))

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def call(self, client=None, **kw):
        return self.b.guarded_call(client or FakeClient(), **{**ARGS, **kw})

    def seed(self, jpy, purpose="development", when=None, today=False):
        """月の使用額を作る。既定は月初（今日の上限に当たらないように）。今日が1日なら月の試験は飛ばす"""
        now = self.b.utc_now()
        if when is None and not today:
            if now.day == 1:
                self.skipTest("月初の1日は、今日と月初が同じ日になるため飛ばす")
            when = now.replace(day=1, hour=0, minute=0)
        self.b.record({"at_utc": (when or now).isoformat(), "purpose": purpose, "kind": "reserve", "jpy": jpy})

    def k(self):
        return 150.0 * self.lim["fx_buffer"] * self.lim["tax_and_fee_multiplier"] * self.lim["price_buffer"]

    # 基本
    def test_reserve_then_settle_equals_actual(self):
        c = FakeClient(); self.call(c)
        led = self.b._ledger()
        self.assertEqual([x["kind"] for x in led], ["reserve", "settle"])
        actual = (1000 * 0.10 + 500 * 0.50) / 1e6 * self.k()
        self.assertAlmostEqual(sum(x["jpy"] for x in led), actual, places=3)
        self.assertEqual(led[-1]["model_returned"], "claude-haiku-5-5-20261101")
        self.assertIn("seconds", led[-1])

    def test_no_automatic_retry_and_timeout(self):
        c = FakeClient(); self.call(c)
        self.assertEqual(c.opts, {"max_retries": 0, "timeout": self.lim["request_timeout_sec"]})

    # 通信の切断・タイムアウト：予約額が残る（多めに数える）、自動の再試行なし
    def test_disconnect_keeps_reservation(self):
        c = FakeClient(fail=ConnectionError("reset"))
        with self.assertRaises(ConnectionError): self.call(c)
        led = self.b._ledger()
        self.assertEqual([x["kind"] for x in led], ["reserve", "error"])
        self.assertGreater(self.b.spent()["month_jpy"], 0)
        self.assertEqual(c.calls, 1)

    def test_timeouts_cannot_loop_past_run_cap(self):
        c = FakeClient(fail=TimeoutError("timeout"))
        n = 0
        while True:
            try: self.call(c, purpose="development")
            except TimeoutError: n += 1
            except self.b.BudgetBlocked: break
        self.assertLessEqual(c.calls, self.lim["max_calls_per_run"])
        self.assertLessEqual(self.b.spent()["day_jpy"], self.lim["max_cost_per_run_jpy"])

    # 改ざん・設定
    def test_manifest_hash_missing_or_changed(self):
        os.environ["AI_BUDGET_SHA256"] = ""
        with self.assertRaises(self.b.BudgetBlocked): self.call()
        os.environ["AI_BUDGET_SHA256"] = self.b.manifest_sha256()
        with open(os.path.join(self.tmp, "budget.py"), "a") as f: f.write("\n# 開発 AI が書き換えた\n")
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    def test_price_change_requires_owner(self):
        p = json.load(open(os.path.join(self.tmp, "pricing.json"))); p["models"]["claude-haiku-5-5"]["output"] = 0.01
        json.dump(p, open(os.path.join(self.tmp, "pricing.json"), "w"))
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    def test_stale_pricing_stops(self):
        old = datetime.date.today() - datetime.timedelta(days=self.lim["pricing_max_age_days"] + 1)
        p = json.load(open(os.path.join(self.tmp, "pricing.json"))); p["checked"] = old.isoformat()
        json.dump(p, open(os.path.join(self.tmp, "pricing.json"), "w"))
        os.environ["AI_BUDGET_SHA256"] = self.b.manifest_sha256()
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    def test_kill_switch_and_stop_file(self):
        os.environ["AI_KILL_SWITCH"] = "1"; c = FakeClient()
        with self.assertRaises(self.b.BudgetBlocked): self.call(c)
        os.environ.pop("AI_KILL_SWITCH")
        open(self.b.STOP_FILE, "w").write("x")
        with self.assertRaises(self.b.BudgetBlocked): self.call(c)
        self.assertEqual(c.calls, 0)

    def test_unknown_model(self):
        with self.assertRaises(self.b.BudgetBlocked): self.call(model="claude-unknown")

    # 上限
    def test_hard_stop_90(self):
        self.seed(4499); c = FakeClient()
        with self.assertRaises(self.b.BudgetBlocked): self.call(c, priority="high", max_tokens=16000, purpose="qa")
        self.assertEqual(c.calls, 0)

    def test_low_priority_stops_at_80(self):
        self.seed(4000)
        with self.assertRaises(self.b.BudgetBlocked): self.call(priority="low")
        self.call(priority="high")

    def test_purpose_allocation_and_sum(self):
        self.seed(800, purpose="research")
        with self.assertRaises(self.b.BudgetBlocked): self.call(purpose="research")
        self.call(purpose="qa")
        a = json.load(open(os.path.join(self.tmp, "allocation.json"))); a["allocation_jpy"]["qa"] += 1
        json.dump(a, open(os.path.join(self.tmp, "allocation.json"), "w"))
        with self.assertRaises(self.b.BudgetBlocked): self.call(purpose="qa")

    def test_per_call_cap(self):
        with self.assertRaises(self.b.BudgetBlocked):
            self.call(model="claude-opus-5-5", messages=[{"role": "user", "content": "あ" * 200000}], purpose="development")

    def test_day_cap(self):
        self.seed(self.lim["max_cost_per_day_jpy"] - 0.0001, purpose="qa", today=True)
        with self.assertRaises(self.b.BudgetBlocked): self.call(purpose="development")

    def test_output_tokens_capped(self):
        seen = {}; c = FakeClient(); orig = c._create
        c.messages = types.SimpleNamespace(create=lambda **kw: (seen.update(kw), orig(**kw))[1])
        self.call(c, max_tokens=999999, purpose="development")
        self.assertEqual(seen["max_tokens"], self.lim["max_output_tokens_cap"])

    def test_usage_missing_stops(self):
        with self.assertRaises(self.b.BudgetBlocked): self.call(FakeClient(usage=lambda: None))
        self.assertTrue(os.path.exists(self.b.STOP_FILE))
        self.assertGreater(self.b.spent()["month_jpy"], 0)  # 予約額のまま残る
        with self.assertRaises(self.b.BudgetBlocked): self.call()

    # 月末・月初：UTC の暦月で集計（Anthropic の使用上限は毎月1日にリセット）
    def test_month_boundary_utc(self):
        nov_end = datetime.datetime(2026, 11, 30, 23, 0, tzinfo=datetime.timezone.utc)
        self.seed(4400, when=nov_end)
        dec1_jst_but_nov_utc = datetime.datetime(2026, 11, 30, 16, 0, tzinfo=datetime.timezone.utc)  # 日本時間 12/1 1:00
        self.assertEqual(self.b.spent(now=dec1_jst_but_nov_utc)["month_jpy"], 4400)  # 日本時間で月が変わっても、まだ11月として数える
        dec1_utc = datetime.datetime(2026, 12, 1, 0, 30, tzinfo=datetime.timezone.utc)
        self.assertEqual(self.b.spent(now=dec1_utc)["month_jpy"], 0)

    # 為替：既定値は円安側、さらに上乗せ
    def test_fx_fallback_is_conservative(self):
        os.remove(os.path.join(self.tmp, "fx.json"))
        rate, src = self.b.fx_rate(self.lim, fetch=False)
        self.assertEqual(src, "fallback")
        self.assertAlmostEqual(rate, 165 * self.lim["fx_buffer"])

    def test_alerts(self):
        self.seed(2500, purpose="qa"); self.call(purpose="development")
        self.assertIn("50%", json.load(open(self.b.ALERTS))[self.b.utc_now().strftime("%Y-%m")])

    # 同時実行：スレッドとプロセス（GitHub Actions の重複実行を同じ台帳で再現）
    def test_concurrency_threads(self):
        self.seed(4490, purpose="qa")
        def w():
            try: self.call(purpose="development", max_tokens=200)
            except self.b.BudgetBlocked: pass
        ts = [threading.Thread(target=w) for _ in range(10)]; [t.start() for t in ts]; [t.join() for t in ts]
        self.assertLessEqual(self.b.spent()["month_jpy"], 4500)

    def test_concurrency_processes(self):
        self.seed(4490, purpose="qa")
        q = multiprocessing.Queue()
        ps = [multiprocessing.Process(target=_proc_worker, args=(self.tmp, self.b.manifest_sha256(), q)) for _ in range(6)]
        [p.start() for p in ps]; [p.join() for p in ps]
        self.assertLessEqual(self.b.spent()["month_jpy"], 4500)

    # 直接呼び出しの検出
    def test_scanner_finds_direct_call(self):
        spec = importlib.util.spec_from_file_location("scan", os.path.join(SRC, "scan_direct_calls.py"))
        s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, ".github", "workflows"))
        open(os.path.join(root, "x.py"), "w").write("client.messages.create(model='m')\n")
        open(os.path.join(root, ".github", "workflows", "evil.yml"), "w").write("env:\n  K: ${{ secrets.ANTHROPIC_API_KEY }}\n")
        ps = s.scan(root); shutil.rmtree(root)
        self.assertEqual(len(ps), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
