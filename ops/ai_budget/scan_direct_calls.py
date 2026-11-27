"""予算管理を通さない AI API の直接呼び出しを探す（見つかれば終了コード 3）。

対象：リポジトリの .py .js .mjs .ts .yml .yaml。ops/ai_budget/ の中は除く。
- `.messages.create(` `.messages.stream(` `api.anthropic.com` `api.openai.com` `generativelanguage.googleapis.com`
- ワークフローで有料 AI のキー（secrets.ANTHROPIC_API_KEY など）を使うのは、許可したワークフロー（ALLOWED_WORKFLOWS）だけ
- 許可したワークフローは concurrency: paid-ai を持つこと
これは開発 AI の誤りを見つけるための検査で、意図的な回避までは防げない。外側の歯止めは Anthropic Console の設定（オーナー管理）。
"""
import os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SKIP_DIRS = {".git", "node_modules", "__pycache__", "disabled-workflows"}
ALLOWED_WORKFLOWS = {"ai-paid.yml"}
CALLS = re.compile(r"\.messages\.(create|stream)\(|api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com")
KEYS = re.compile(r"secrets\.(ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|MISTRAL_API_KEY|COHERE_API_KEY)")


def scan(root=ROOT):
    problems = []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        rel_d = os.path.relpath(d, root)
        if rel_d.startswith(os.path.join("ops", "ai_budget")):
            continue
        for fn in files:
            if not fn.endswith((".py", ".js", ".mjs", ".ts", ".yml", ".yaml")):
                continue
            p = os.path.join(d, fn); rel = os.path.relpath(p, root)
            try:
                text = open(p, encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if CALLS.search(line) and "scan-ok" not in line:
                    problems.append(f"{rel}:{i}: 予算管理を通さない AI API の呼び出し: {line.strip()[:100]}")
            if rel.startswith(os.path.join(".github", "workflows")) and KEYS.search(text):
                if fn not in ALLOWED_WORKFLOWS:
                    problems.append(f"{rel}: 許可していないワークフローが有料 AI のキーを使っている")
                elif not re.search(r"concurrency:\s*\n\s*group:\s*paid-ai", text):
                    problems.append(f"{rel}: concurrency グループ paid-ai が無い（同時実行の防止）")
    return problems


if __name__ == "__main__":
    ps = scan(sys.argv[1] if len(sys.argv) > 1 else ROOT)
    print("\n".join(ps) if ps else "OK: 直接呼び出しなし")
    sys.exit(3 if ps else 0)
