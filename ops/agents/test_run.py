"""Phase C の試験（有料 API は呼ばない。偽のクライアントと偽の Apify 応答）"""
import os, sys, tempfile, shutil, types, json, unittest, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, "ops", "ai_budget"))
import budget, run  # noqa


class Fake:
    def __init__(self): self.kw = None; self.messages = types.SimpleNamespace(create=self.create)
    def with_options(self, **k): return self
    def create(self, **kw):
        self.kw = kw
        u = types.SimpleNamespace(input_tokens=2000, output_tokens=800, cache_creation_input_tokens=0, cache_read_input_tokens=0, server_tool_use=None)
        return types.SimpleNamespace(usage=u, model=kw["model"], content=[types.SimpleNamespace(type="text", text="提案")])


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        budget.LEDGER = os.path.join(self.tmp, "l.jsonl"); budget.ALERTS = os.path.join(self.tmp, "a.json")
        budget.STOP_FILE = os.path.join(self.tmp, "STOP"); budget.LOCK_FILE = os.path.join(self.tmp, ".lock")
        budget.FX_FILE = os.path.join(self.tmp, "fx.json")
        json.dump({"rate": 150, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}, open(budget.FX_FILE, "w"))
        budget.pricing = lambda lim, today=None: json.load(open(os.path.join(ROOT, "ops", "ai_budget", "pricing.json")))
        os.environ["AI_BUDGET_SHA256"] = budget.manifest_sha256()
        run.OUT = os.path.join(self.tmp, "out")

    def tearDown(self): shutil.rmtree(self.tmp)

    def test_listing_review_uses_marketing_budget_and_saves(self):
        run._get = lambda url: ({"items": [{"username": "x", "name": "y", "title": "T", "description": "d", "stats": {"totalUsers30Days": 5}}]}
                                if "/store?" in url else {"title": "mine", "stats": {}, "readme": "r"})
        c = Fake(); p = run.listing_review(c)
        self.assertTrue(os.path.exists(p))
        self.assertEqual(c.kw["model"], "claude-sonnet-5-5")
        led = budget._ledger()
        self.assertEqual(led[0]["purpose"], "marketing"); self.assertEqual(led[0]["priority"], "high")

    def test_all_roles_have_priced_models_and_valid_purposes(self):
        prices = json.load(open(os.path.join(ROOT, "ops", "ai_budget", "pricing.json")))["models"]
        alloc = json.load(open(os.path.join(ROOT, "ops", "ai_budget", "allocation.json")))["allocation_jpy"]
        for r in run.ROLES.values():
            self.assertIn(r["model"], prices); self.assertIn(r["purpose"], alloc)


if __name__ == "__main__":
    unittest.main(verbosity=2)
