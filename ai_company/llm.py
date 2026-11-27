"""LLM バックエンド（Claude Code CLI / Anthropic API / mock）"""
import json
import os
import re
import shutil
import subprocess


class BudgetExceeded(Exception):
    pass


# 役割 → 予算の用途（ops/ai_budget/allocation.json）
ROLE_PURPOSE = {"ceo_plan": "planning", "ceo_report": "reporting", "compliance": "qa", "researcher": "research",
                "marketing": "marketing", "product": "development", "cfo": "reporting"}


class LLM:
    def __init__(self, backend: str, model: str, max_cost_usd: float):
        self.backend = backend
        self.model = model
        self.max_cost_usd = max_cost_usd
        self.cost_usd = 0.0
        self.price_in = float(os.getenv("PRICE_IN_PER_MTOK", "3"))
        self.price_out = float(os.getenv("PRICE_OUT_PER_MTOK", "15"))
        self.search_tool = os.getenv("WEB_SEARCH_TOOL", "web_search_20250305")
        if backend == "api":
            import anthropic
            self.client = anthropic.Anthropic()
        elif backend == "cli" and not shutil.which("claude"):
            raise RuntimeError("claude コマンドが見つかりません。Claude Code をインストールしてログインしてください。")

    # ------------------------------------------------------------------
    def ask(self, system: str, prompt: str, role: str = "", use_search: bool = False) -> str:
        if self.cost_usd >= self.max_cost_usd:
            raise BudgetExceeded(f"1回の実行予算 ${self.max_cost_usd} に到達しました")
        if self.backend == "mock":
            return _mock_answer(role, prompt)
        if self.backend == "cli":
            return self._ask_cli(system, prompt, use_search)
        self._role = role
        return self._ask_api(system, prompt, use_search)

    def _ask_api(self, system, prompt, use_search):
        """有料 API は必ず ops/ai_budget の予算管理を通す（2026-11-27 Ver.2.0）。止められたら BudgetExceeded"""
        budget = _budget_module()
        purpose = ROLE_PURPOSE.get(self._role, "research")
        kwargs = dict(division="hq", purpose=purpose, priority="normal", model=self.model or "claude-haiku-5-5", system=system,
                      messages=[{"role": "user", "content": prompt}], max_tokens=4000, task=self._role)
        if use_search:
            kwargs.update(tools=[{"type": self.search_tool, "name": "web_search", "max_uses": 3}], max_searches=3)
        try:
            resp = budget.guarded_call(self.client, **kwargs)
        except budget.BudgetBlocked as e:
            raise BudgetExceeded(str(e))
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

    def _ask_cli(self, system, prompt, use_search):
        full = f"<役割と規則>\n{system}\n</役割と規則>\n\n{prompt}"
        cmd = ["claude", "-p", "--output-format", "json"]
        if self.model:
            cmd += ["--model", self.model]
        if use_search:
            cmd += ["--allowedTools", "WebSearch,WebFetch"]
        out = subprocess.run(cmd, input=full, capture_output=True, text=True, timeout=900)
        if out.returncode != 0:
            raise RuntimeError(f"claude CLI エラー: {out.stderr[:500]}")
        try:
            data = json.loads(out.stdout)
            self.cost_usd += float(data.get("total_cost_usd", 0) or 0) if os.getenv("CLI_COUNT_COST") else 0
            return data.get("result", "")
        except json.JSONDecodeError:
            return out.stdout


_BUDGET = None


def _budget_module():
    """ops/ai_budget/budget.py を1回だけ読み込む（1回の実行の呼び出し回数を数えるため、同じものを使い回す）"""
    global _BUDGET
    if _BUDGET is None:
        import importlib.util
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ops", "ai_budget", "budget.py")
        spec = importlib.util.spec_from_file_location("ai_budget", path)
        _BUDGET = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_BUDGET)
    return _BUDGET


def extract_json(text: str):
    """応答テキストから JSON を取り出す"""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates = [m.group(1)] if m else []
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e > s:
        candidates.append(text[s:e + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
    raise ValueError("JSON を解析できませんでした:\n" + text[:800])


# ----------------------------------------------------------------------
# mock: APIなしで動作確認するためのダミー応答
def _mock_answer(role: str, prompt: str) -> str:
    if role == "ceo_plan":
        has_biz = "運営1日目" not in prompt
        if not has_biz:
            return json.dumps({
                "phase": "探索",
                "business": None,
                "decisions": ["元手0円で始められるデジタル商品の市場調査から開始する"],
                "tasks": [
                    {"role": "researcher", "title": "元手0円で始められる事業アイデア調査",
                     "instructions": "需要があり在庫不要の事業アイデアを5つ調査し比較せよ"},
                    {"role": "cfo", "title": "初期費用ゼロの前提条件整理", "instructions": "無料で使える販売基盤を整理"},
                ]}, ensure_ascii=False)
        return json.dumps({
            "phase": "立ち上げ",
            "business": {"name": "飲食開業テンプレート販売", "summary": "海外飲食店開業の実務テンプレートをデジタル販売",
                          "target": "個人飲食店オーナー", "revenue_model": "単品販売 2,980円"},
            "decisions": ["事業案Aに決定"],
            "tasks": [
                {"role": "product", "title": "テンプレート第1弾作成", "instructions": "開業チェックリストを作成"},
                {"role": "marketing", "title": "販売ページ文面", "instructions": "noteの販売ページ文案を作成"},
            ]}, ensure_ascii=False)
    if role == "compliance":
        n = prompt.count('"title"')
        return json.dumps({"reviews": [{"id": i, "verdict": "ok", "comment": "問題なし"} for i in range(n)],
                           "general": "規約上の問題は見当たらない"}, ensure_ascii=False)
    if role == "ceo_report":
        return "# 本日のまとめ\n\n- 調査を進めた\n- 明日は事業案を決定する"
    return json.dumps({
        "summary": f"{role} の作業を完了（mock）",
        "deliverables": [{"filename": "output.md", "content": f"# {role} 成果物\n\nダミーの内容です。"}],
        "approval_requests": [{"title": "noteアカウントで販売ページを公開", "action": "note.com に販売ページを公開する",
                               "reason": "最初の売上を立てるため", "est_cost_jpy": 0}] if role == "marketing" else [],
        "notes": ""}, ensure_ascii=False)
