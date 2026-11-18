"""会社の状態（JSON で保存）"""
import json
import os
from datetime import datetime

BASE = os.getenv("AI_COMPANY_HOME", os.getcwd())
STATE_DIR = os.path.join(BASE, "state")
WORK_DIR = os.path.join(BASE, "workspace")
REPORT_DIR = os.path.join(BASE, "reports")
STATE_FILE = os.path.join(STATE_DIR, "company.json")


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def default_state(name="AIカンパニー"):
    return {
        "name": name,
        "founded": now(),
        "day": 0,
        "phase": "探索",
        "business": None,
        "ledger": [],          # {"date","type":"revenue|cost","amount_jpy","memo"}
        "approvals": [],       # {"id","day","role","title","action","reason","est_cost_jpy","status","owner_note","review"}
        "decisions": [],       # {"day","text"}
        "history": [],         # {"day","date","summary"}
        "owner_messages": [],  # オーナーからの指示 {"date","text","read"}
    }


def load():
    if not os.path.exists(STATE_FILE):
        return default_state()
    with open(STATE_FILE, encoding="utf-8") as f:
        return json.load(f)


def save(state):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def totals(state):
    rev = sum(x["amount_jpy"] for x in state["ledger"] if x["type"] == "revenue")
    cost = sum(x["amount_jpy"] for x in state["ledger"] if x["type"] == "cost")
    return rev, cost, rev - cost


def next_approval_id(state):
    return max([a["id"] for a in state["approvals"]], default=0) + 1
