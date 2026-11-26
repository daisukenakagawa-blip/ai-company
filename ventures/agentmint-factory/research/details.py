"""上位候補の Actor ごとに、公開 API から直近30日の実行結果（成功・失敗・時間切れ）とブックマーク数を取る。"""
import json, sys, time, urllib.request
slugs = sys.argv[1:]
for s in slugs:
    try:
        with urllib.request.urlopen(f"https://api.apify.com/v2/acts/{s.replace('/', '~')}", timeout=60) as r:
            d = json.load(r)["data"]
        st = d.get("stats") or {}; rs = st.get("publicActorRunStats30Days") or {}
        tot = rs.get("TOTAL") or 0
        bad = (rs.get("FAILED") or 0) + (rs.get("TIMED-OUT") or 0) + (rs.get("ABORTED") or 0)
        print(json.dumps({"slug": s, "u30": st.get("totalUsers30Days"), "runs30": tot, "fail_rate": round(bad / tot, 3) if tot else None,
                          "failed": rs.get("FAILED"), "timeout": rs.get("TIMED-OUT"), "bookmarks": st.get("bookmarkCount"),
                          "created": d.get("createdAt", "")[:10], "modified": d.get("modifiedAt", "")[:10]}))
    except Exception as e:
        print(json.dumps({"slug": s, "error": str(e)[:80]}))
    time.sleep(0.5)
