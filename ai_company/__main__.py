"""AIカンパニー CLI

  python -m ai_company init "会社名"        会社を設立（状態ファイル作成）
  python -m ai_company run [--days N]        1日（またはN日）分の経営サイクルを実行
  python -m ai_company apply day.json       エージェントが行った1日分の結果を取り込む
  python -m ai_company context               CEO 会議用の現況テキストを表示
  python -m ai_company status                現況を表示
  python -m ai_company approvals             承認依頼の一覧
  python -m ai_company approve ID [メモ]     承認する（実行したら done ID）
  python -m ai_company reject ID [理由]      却下する
  python -m ai_company done ID [結果メモ]    オーナーが実行し終えたことを報告
  python -m ai_company revenue 金額 メモ     売上を記帳
  python -m ai_company cost 金額 メモ        費用を記帳
  python -m ai_company tell "指示"           CEO にオーナーから指示を出す（次回の会議で最優先）
  python -m ai_company dashboard             ダッシュボード HTML を再生成
"""
import os
import sys

from . import state as st


def _load_env():
    path = os.path.join(st.BASE, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def _set_status(aid, status, note):
    s = st.load()
    for a in s["approvals"]:
        if a["id"] == aid:
            a["status"], a["owner_note"] = status, note
            st.save(s)
            print(f"#{aid} を {status} にしました: {a['title']}")
            return
    print(f"#{aid} が見つかりません")


def main(argv):
    _load_env()
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]

    if cmd == "init":
        if os.path.exists(st.STATE_FILE):
            print("既に設立済みです（state/company.json）。やり直す場合は state/ を削除してください。")
            return
        st.save(st.default_state(args[0] if args else "AIカンパニー"))
        print("会社を設立しました。次は: python -m ai_company run")

    elif cmd == "run":
        from .company import run_day
        days = int(args[args.index("--days") + 1]) if "--days" in args else 1
        backend = os.getenv("AI_BACKEND", "cli")
        model = os.getenv("AI_MODEL", "" if backend == "cli" else "claude-sonnet-5-5")
        budget = float(os.getenv("MAX_COST_USD_PER_DAY", "1.0"))
        for _ in range(days):
            run_day(backend=backend, model=model, max_cost_usd=budget)

    elif cmd == "apply":
        from .company import apply_day
        apply_day(args[0])

    elif cmd == "context":
        from .company import company_context
        print(company_context(st.load()))

    elif cmd == "status":
        s = st.load()
        rev, cost, profit = st.totals(s)
        print(f"{s['name']} ／ {s['day']}日目 ／ フェーズ: {s['phase']}")
        print(f"事業: {s['business']['name'] if s['business'] else '未決定'}")
        print(f"売上 {rev:,}円 ／ 費用 {cost:,}円 ／ 利益 {profit:,}円")
        print(f"承認待ち: {sum(a['status'] == 'pending' for a in s['approvals'])}件")
        if s["history"]:
            print(f"最新の日報: {s['history'][-1]['report']}")

    elif cmd == "approvals":
        s = st.load()
        show_all = "--all" in args
        for a in s["approvals"]:
            if show_all or a["status"] == "pending":
                print(f"#{a['id']} [{a['status']}] ({a['role']}) {a['title']}\n    実行内容: {a['action']}\n"
                      f"    理由: {a['reason']}\n    費用: {a.get('est_cost_jpy', 0)}円 ／ 法務: {a.get('review', '')}\n")

    elif cmd in ("approve", "reject", "done"):
        _set_status(int(args[0]), {"approve": "approved", "reject": "rejected", "done": "done"}[cmd], " ".join(args[1:]))

    elif cmd in ("revenue", "cost"):
        s = st.load()
        s["ledger"].append({"date": st.now(), "type": cmd, "amount_jpy": int(args[0]), "memo": " ".join(args[1:])})
        st.save(s)
        print(f"{'売上' if cmd == 'revenue' else '費用'} {int(args[0]):,}円 を記帳しました")

    elif cmd == "tell":
        s = st.load()
        s["owner_messages"].append({"date": st.now(), "text": " ".join(args), "read": False})
        st.save(s)
        print("CEO に伝えました（次回の run で反映）")

    elif cmd == "dashboard":
        from .dashboard import build
        print(build(st.load()))

    else:
        print(f"不明なコマンド: {cmd}\n{__doc__}")


if __name__ == "__main__":
    main(sys.argv[1:])
