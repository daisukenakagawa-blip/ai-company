/* 名簿の重複・よく似た行の検出（ブラウザ／Node 共通のロジック） */
(function (root) {
  "use strict";

  // ---------- 正規化 ----------
  const ITAIJI = { "髙": "高", "﨑": "崎", "嵜": "崎", "邊": "辺", "邉": "辺", "齋": "斎", "齊": "斎", "濵": "浜", "濱": "浜",
    "澤": "沢", "櫻": "桜", "廣": "広", "國": "国", "眞": "真", "實": "実", "惠": "恵", "德": "徳", "冨": "富", "槇": "槙",
    "籠": "篭", "瀨": "瀬", "藪": "薮", "壽": "寿", "龍": "竜", "曾": "曽", "條": "条", "淺": "浅", "會": "会", "學": "学" };
  const KANSUJI = { "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

  function base(s) {
    s = String(s == null ? "" : s).normalize("NFKC");
    s = s.replace(/[​-‍﻿ ]/g, " ").replace(/\s+/g, " ").trim();
    return s;
  }
  function hira2kata(s) { return s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)); }
  function itaiji(s) { return s.replace(/[髙﨑嵜邊邉齋齊濵濱澤櫻廣國眞實惠德冨槇籠瀨藪壽龍曾條淺會學]/g, c => ITAIJI[c] || c); }
  function kanNum(str) { // 「十二」「二十三」程度まで
    if (/^[〇一二三四五六七八九]+$/.test(str) && !/十/.test(str) && str.length > 1) return +str.split("").map(c => KANSUJI[c]).join("");
    let n = 0, cur = 0;
    for (const c of str) {
      if (c === "十") { n += (cur || 1) * 10; cur = 0; } else cur = KANSUJI[c];
    }
    return n + cur;
  }

  const N = {
    text(s) { return hira2kata(base(s).toLowerCase()); },
    name(s) {
      s = itaiji(hira2kata(base(s)));
      s = s.replace(/(様|さま|サマ|殿|さん|サン|御中)$/, "");
      return s.replace(/[\s・･.,、。]/g, "").toLowerCase();
    },
    company(s) {
      s = hira2kata(base(s));
      s = s.replace(/[(（]\s*(株|有|合|同|名|資|社)\s*[)）]/g, "")
        .replace(/株式会社|有限会社|合同会社|合名会社|合資会社|一般社団法人|一般財団法人|カブシキガイシャ|ユウゲンガイシャ/g, "")
        .replace(/[\s・･.,、。]/g, "");
      return itaiji(s).toLowerCase();
    },
    phone(s) {
      s = base(s).replace(/[^\d+]/g, "");
      if (s.startsWith("+81")) s = "0" + s.slice(3).replace(/^0/, "");
      s = s.replace(/\+/g, "");
      return s.length >= 6 ? s : "";
    },
    email(s) { return base(s).toLowerCase().replace(/\s/g, "").replace(/^mailto:/, ""); },
    address(s) {
      s = itaiji(hira2kata(base(s)));
      s = s.replace(/^〒?\s*\d{3}-?\d{4}\s*/, "");
      s = s.replace(/[ヶケが]/g, "ヶ").replace(/[\s,、]/g, "");
      s = s.replace(/([〇一二三四五六七八九十]+)(丁目|番地|番|号)/g, (m, k, u) => kanNum(k) + u);
      s = s.replace(/(\d+)丁目/g, "$1-").replace(/(\d+)番地?/g, "$1-").replace(/(\d+)号/g, "$1-");
      s = s.replace(/[‐‑‒–—―ー−－]/g, "-").replace(/(\d)-(?=\D|$)/g, "$1").replace(/-+/g, "-");
      return s.toLowerCase();
    },
    postal(s) { s = base(s).replace(/\D/g, ""); return s.length === 7 ? s : ""; },
  };

  // ---------- 列の種類の推定 ----------
  const TYPES = ["text", "name", "company", "phone", "email", "address", "postal"];
  const TYPE_LABEL = { text: "そのまま（文字）", name: "氏名", company: "会社名", phone: "電話番号", email: "メールアドレス", address: "住所", postal: "郵便番号" };
  function guessType(head, values) {
    const h = base(head).toLowerCase();
    if (/mail|メール/.test(h)) return "email";
    if (/電話|tel|携帯|phone|fax|連絡先/.test(h)) return "phone";
    if (/郵便|〒|zip|postal/.test(h)) return "postal";
    if (/住所|所在地|address/.test(h)) return "address";
    if (/会社|法人|企業|社名|取引先|屋号|company/.test(h)) return "company";
    if (/氏名|名前|お名前|フリガナ|ふりがな|カナ|かな|name|姓|名$/.test(h)) return "name";
    const v = values.filter(x => base(x)).slice(0, 50);
    if (v.length) {
      const r = re => v.filter(x => re.test(base(x))).length / v.length;
      if (r(/^[^@\s]+@[^@\s]+\.[^@\s]+$/) > .7) return "email";
      if (r(/^\+?[\d\-() ]{10,15}$/) > .7) return "phone";
      if (r(/^〒?\d{3}-?\d{4}$/) > .7) return "postal";
      if (r(/(都|道|府|県).+(市|区|町|村)/) > .6) return "address";
    }
    return "text";
  }
  // 既定の使い方：exact=一致したら同じ、fuzzy=似ていれば同じ（他の fuzzy 列と全部そろったとき）、off=使わない
  function guessUse(type) {
    if (type === "phone" || type === "email") return "exact";
    if (type === "name" || type === "company" || type === "address") return "fuzzy";
    return "off";
  }

  // ---------- 類似度 ----------
  function bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.substr(i, 2)); return a; }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const L = 1 - lev(a, b) / Math.max(a.length, b.length);
    if (a.length < 3 || b.length < 3) return L;
    const A = bigrams(a), B = bigrams(b), cnt = new Map();
    A.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    let hit = 0; B.forEach(x => { const c = cnt.get(x); if (c) { hit++; cnt.set(x, c - 1); } });
    const D = 2 * hit / (A.length + B.length);
    return Math.max(L, D);
  }

  // ---------- 本体 ----------
  // cols: [{index, type, use}]  opt: {threshold:0.85}
  function detect(rows, cols, opt) {
    opt = opt || {};
    const th = opt.threshold == null ? 0.85 : opt.threshold;
    const exact = cols.filter(c => c.use === "exact"), fuzzy = cols.filter(c => c.use === "fuzzy");
    const n = rows.length;
    const norm = rows.map(r => cols.map(c => N[c.type](r[c.index])));
    // 住所の番地・部屋番号（数字の並び）。違えば別の住所とみなす（「1-2-3」と「1-2-3 101号室」は同じ扱い）
    const nums = rows.map((r, i) => cols.map((c, p) => c.type === "address" ? ((norm[i][p].match(/\d+/g) || []).join("-") + "-") : ""));
    const numsOk = (i, j, p) => { const a = nums[i][p], b = nums[j][p]; return a === "-" || b === "-" || a.startsWith(b) || b.startsWith(a); };
    const pos = new Map(cols.map((c, i) => [c, i]));
    const parent = [...Array(n).keys()];
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const reasons = new Map(); // "i|j" -> 理由
    function link(i, j, why) {
      const a = find(i), b = find(j);
      const k = i < j ? i + "|" + j : j + "|" + i;
      if (!reasons.has(k)) reasons.set(k, why);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
    // 1) 完全一致の列
    exact.forEach(c => {
      const p = pos.get(c), m = new Map();
      for (let i = 0; i < n; i++) {
        const v = norm[i][p]; if (!v) continue;
        if (m.has(v)) link(m.get(v), i, { kind: "exact", col: c.index, value: rows[i][c.index] });
        else m.set(v, i);
      }
    });
    // 2) あいまい一致：全部の fuzzy 列（両方に値がある列）が閾値以上
    let compared = 0;
    const fuzzyOrder = fuzzy.slice().sort((a, b) => (b.type === "address") - (a.type === "address"));
    if (fuzzy.length) {
      const p0 = pos.get(fuzzy[0]);
      // 候補の絞り込み：最初の fuzzy 列の2文字の組を共有する行どうし
      const idx = new Map();
      for (let i = 0; i < n; i++) {
        const v = norm[i][p0]; if (!v) continue;
        const g = v.length < 3 ? [v] : [...new Set(bigrams(v))];
        g.forEach(x => { if (!idx.has(x)) idx.set(x, []); idx.get(x).push(i); });
      }
      const LIMIT = 400; // 1つの2文字組に行が多すぎる場合（「株式」など）は候補に使わない
      for (let i = 0; i < n; i++) {
        const v = norm[i][p0]; if (!v) continue;
        const g = v.length < 3 ? [v] : [...new Set(bigrams(v))];
        const usable = g.filter(x => (idx.get(x) || []).length <= LIMIT).length;
        const need = v.length < 3 ? 1 : Math.max(1, Math.floor(usable * (th - 0.25)));
        const cnt = new Map();
        g.forEach(x => { const L = idx.get(x); if (!L || L.length > LIMIT) return; L.forEach(j => { if (j > i) cnt.set(j, (cnt.get(j) || 0) + 1); }); });
        if (g.every(x => (idx.get(x) || []).length > LIMIT)) { // すべて多すぎる場合は全件と比べる（小さい表のみ）
          if (n <= 3000) for (let j = i + 1; j < n; j++) cnt.set(j, need);
        }
        cnt.forEach((c, j) => {
          if (c < need) return;
          compared++;
          const scores = []; let ok = false, used = 0;
          for (const f of fuzzyOrder) {
            const p = pos.get(f), a = norm[i][p], b = norm[j][p];
            if (!a || !b) continue;
            if (f.type === "address" && !numsOk(i, j, p)) { scores.length = 0; used = 0; break; }
            let s = similarity(a, b); used++;
            // 住所：片方がもう片方の続き（建物名・部屋番号が付いているだけ）なら、ほぼ同じとみなす
            if (f.type === "address" && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 8) s = Math.max(s, 0.95);
            scores.push({ col: f.index, s });
          }
          if (scores.length) {
            const mn = Math.min(...scores.map(x => x.s)), avg = scores.reduce((t, x) => t + x.s, 0) / scores.length;
            // すべての列が基準以上、または2列以上で平均が基準以上かつ一番低い列も基準−15点以上（「次郎」と「二郎」のような1文字違い）
            ok = mn >= th || (scores.length >= 2 && avg >= th && mn >= th - 0.15);
          }
          if (ok && used >= Math.min(fuzzy.length, opt.minCols || 2) && norm[i][p0] && norm[j][p0]) link(i, j, { kind: "fuzzy", scores });
        });
      }
    }
    // グループにまとめる
    const g = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r).push(i); }
    const groups = [...g.values()].filter(x => x.length > 1).map((members, gi) => {
      const why = [];
      reasons.forEach((w, k) => { const [a, b] = k.split("|").map(Number); if (members.includes(a)) why.push(Object.assign({ a, b }, w)); });
      const filled = i => rows[i].filter(v => base(v) !== "").length;
      const keep = members.slice().sort((a, b) => filled(b) - filled(a) || a - b)[0];
      return { id: gi + 1, members, why, keep };
    });
    return { groups, compared, rowsInGroups: groups.reduce((s, x) => s + x.members.length, 0) };
  }

  function reasonText(w, head) {
    if (w.kind === "exact") return `${head[w.col] || "列"}が一致`;
    return w.scores.map(s => `${head[s.col] || "列"} ${Math.round(s.s * 100)}%`).join("・") + " で似ている";
  }

  // 重複をまとめた表（残す行だけ。fill=true なら残す行の空欄を同じグループの他の行の値で埋める）
  function dedupe(head, rows, groups, opt) {
    opt = opt || {};
    const drop = new Set(), fillMap = new Map();
    groups.filter(g => g.on !== false).forEach(g => {
      g.members.forEach(i => { if (i !== g.keep) drop.add(i); });
      if (opt.fill) {
        const r = rows[g.keep].slice();
        for (let c = 0; c < head.length; c++) if (!base(r[c])) {
          const o = g.members.find(i => base(rows[i][c]));
          if (o != null) r[c] = rows[o][c];
        }
        fillMap.set(g.keep, r);
      }
    });
    const out = [head.slice()];
    rows.forEach((r, i) => { if (!drop.has(i)) out.push(fillMap.get(i) || r); });
    return { table: out, removed: drop.size };
  }

  // 全行に判定列を付けた表
  function annotate(head, rows, groups) {
    const info = new Map();
    groups.forEach(g => g.members.forEach(i => info.set(i, { g: g.id, keep: i === g.keep, on: g.on !== false,
      why: [...new Set(g.why.filter(w => w.a === i || w.b === i).map(w => reasonText(w, head)))].join(" / ") })));
    const out = [["重複グループ", "判定", "理由"].concat(head)];
    rows.forEach((r, i) => {
      const x = info.get(i);
      out.push([x ? String(x.g) : "", x ? (!x.on ? "重複ではない（手動）" : x.keep ? "残す" : "重複") : "", x ? x.why : ""].concat(r));
    });
    return out;
  }

  const api = { N, TYPES, TYPE_LABEL, guessType, guessUse, similarity, detect, dedupe, annotate, reasonText };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Meibo = api;
})(this);
