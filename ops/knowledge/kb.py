"""経営の知識データ（Ver.2.5：将来の第3事業部の独自データ資産）。日報ではなく、分析・再利用できる構造化データ（JSON Lines）として貯める。

置き場所：ops/knowledge/data/<種類>.jsonl（1行1記録、追記のみ。直すときは同じ id で新しい行を足し、最後の行を正とする）
種類と必須の項目（SCHEMA）：
- opportunity：調べた市場・事業機会（評価の根拠・確からしさ・点数）
- decision：経営判断（根拠・予測）と、後で書く結果（outcome）
- experiment：集客施策・販売実験（期間・成功条件・結果）
- product：開発した商品（開発費・状態）
- outcome：売上・純利益・利用者などの実績（期間ごと、実測だけ）
- exit：撤退した事業と理由
入れてはいけないもの：個人情報（氏名・メール・住所・電話）、顧客の機密、API キー・トークン、再販売の権利がないデータ（他社の有料データ・規約で再配布できない本文の転載）。check() が簡易に検出して拒否する
使い方：python3 ops/knowledge/kb.py stats ／ python3 ops/knowledge/kb.py check
"""
import datetime, glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SCHEMA = {
    "opportunity": ["id", "date", "division", "title", "source_type", "evidence", "evidence_strength", "score", "status"],
    "decision": ["id", "date", "division", "decision", "basis", "prediction", "outcome"],
    "experiment": ["id", "date", "division", "target", "channel", "start", "end", "success_criteria", "result"],
    "product": ["id", "date", "division", "name", "status", "dev_cost_jpy", "ai_cost_jpy", "channel"],
    "outcome": ["id", "period", "division", "metric", "value", "measured"],
    "exit": ["id", "date", "division", "name", "reason", "lesson"],
}
SOURCE_TYPES = {"第三者確認", "公式", "自己申告", "推計", "未確認", "実測", "推測"}
SECRET = re.compile(r"(sk_(live|test)_[0-9A-Za-z]{8,}|rk_live_[0-9A-Za-z]{8,}|ghp_[0-9A-Za-z]{20,}|AKIA[0-9A-Z]{16}|sk-ant-[0-9A-Za-z\-_]{10,}|apify_api_[0-9A-Za-z]{10,})")
PII = re.compile(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b0\d{1,4}-\d{1,4}-\d{3,4}\b|〒\s?\d{3}-\d{4})")


def check_record(kind, rec):
    errs = []
    if kind not in SCHEMA:
        return [f"不明な種類: {kind}"]
    for f in SCHEMA[kind]:
        if f not in rec:
            errs.append(f"{kind}:{rec.get('id')} に {f} が無い")
    if kind == "opportunity" and rec.get("source_type") not in SOURCE_TYPES:
        errs.append(f"{rec.get('id')}: source_type は {sorted(SOURCE_TYPES)} のどれか")
    if kind == "outcome" and rec.get("measured") is not True and rec.get("value") is not None:
        errs.append(f"{rec.get('id')}: 実績（outcome）は実測だけ。未確認は value=null")
    text = json.dumps(rec, ensure_ascii=False)
    if SECRET.search(text):
        errs.append(f"{rec.get('id')}: 秘密情報（キー・トークン）らしき文字列がある")
    if PII.search(text):
        errs.append(f"{rec.get('id')}: 個人情報（メール・電話・郵便番号）らしき文字列がある")
    return errs


def add(kind, rec):
    errs = check_record(kind, rec)
    if errs:
        raise ValueError("; ".join(errs))
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, f"{kind}.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def load(kind):
    p = os.path.join(DATA, f"{kind}.jsonl")
    if not os.path.exists(p):
        return []
    latest = {}
    for line in open(p, encoding="utf-8"):
        if line.strip():
            r = json.loads(line); latest[r["id"]] = r
    return list(latest.values())


def check_all():
    errs = []
    for p in glob.glob(os.path.join(DATA, "*.jsonl")):
        kind = os.path.basename(p)[:-6]
        for line in open(p, encoding="utf-8"):
            if line.strip():
                errs += check_record(kind, json.loads(line))
    return errs


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "check":
        e = check_all(); print("\n".join(e) if e else "OK"); sys.exit(1 if e else 0)
    print(json.dumps({k: len(load(k)) for k in SCHEMA}, ensure_ascii=False))
