/* 出欠表の出席率の集計 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";

  // ---------- 読み込み ----------
  function decodeBytes(buf) {
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) u = u.subarray(3);
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(u), enc: "UTF-8" }; }
    catch (e) { return { text: new TextDecoder("shift_jis").decode(u), enc: "Shift_JIS" }; }
  }
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var first = text.split(/\r?\n/)[0] || "";
    var delim = (first.split("\t").length > first.split(",").length) ? "\t" : ",";
    var rows = [], row = [], f = "", q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"' && f === "") q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
  }
  function norm(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    return s.replace(/\s+/g, " ").trim();
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function transpose(rows) {
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0), out = [];
    for (var c = 0; c < w; c++) out.push(rows.map(function (r) { return r[c] == null ? "" : r[c]; }));
    return out;
  }

  // ---------- 日付 ----------
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
  function fromDayNo(n) { var t = new Date(n * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() }; }
  function validYMD(y, m, d) { if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false; var t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
  function ymdStr(dn) { var o = fromDayNo(dn); return o.y + "-" + pad(o.m) + "-" + pad(o.d); }
  function mdStr(dn) { var o = fromDayNo(dn); return o.m + "/" + o.d + "(" + WD[o.wd] + ")"; }

  // 日付の読み取り。年のない「4/5」「4月5日」は ctx.year を使い、月が前の列より小さくなったら次の年にする
  // 戻り値：{dn, noYear} か null
  function parseDate(v, ctx) {
    ctx = ctx || {};
    var s = norm(v);
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = parseFloat(s);
      if (x > 20000 && x < 120000) return { dn: Math.floor(x) - 25569, noYear: false };
      return null;
    }
    s = s.replace(/[（(][日月火水木金土祝]{1,2}(曜日?)?[）)]/g, " ").replace(/[日月火水木金土]曜日?$/g, " ")
      .replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?$/, "").replace(/\s+/g, " ").trim();
    var y, m, d, mm, noYear = false;
    if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/))) { y = 2018 + (mm[1] === "元" ? 1 : +mm[1]); m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^R\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})$/i))) { y = 2018 + (+mm[1]); m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(\d{1,2})\s*[\/月.-]\s*(\d{1,2})\s*日?$/))) {
      m = +mm[1]; d = +mm[2]; noYear = true;
      y = ctx.year || new Date().getFullYear();
      if (ctx.prevMonth != null && m < ctx.prevMonth) { ctx.year = y = y + 1; }
      ctx.prevMonth = m;
    }
    else return null;
    if (!validYMD(y, m, d)) return null;
    if (!noYear) { ctx.year = y; ctx.prevMonth = m; }
    return { dn: dayNo(y, m, d), noYear: noYear };
  }

  // ---------- 記号 ----------
  var CATS = ["P", "L", "E", "A", "X"];
  var CAT_NAME = { P: "出席", L: "遅刻", E: "早退", A: "欠席", X: "数えない", B: "空欄", U: "読めない" };
  var DEFAULT_MAP = {
    P: "○,◯,〇,◎,出,出席,1,✓,✔,レ,v,参加,有,済,P",
    L: "遅,遅刻,△,L",
    E: "早,早退,▲,E",
    A: "×,✕,✖,x,欠,欠席,0,不参加,無,A",
    X: "公,公欠,忌,忌引,免,出停,停,-,ー,―,/,休会,対象外"
  };
  function makeMap(spec) {
    var map = {};
    CATS.forEach(function (k) {
      String(spec && spec[k] != null ? spec[k] : DEFAULT_MAP[k]).split(/[,、，\n]/).forEach(function (t) {
        t = norm(t).toLowerCase();
        if (t && map[t] == null) map[t] = k;
      });
    });
    return map;
  }
  function classify(raw, map) {
    var s = norm(raw).toLowerCase();
    if (!s) return "B";
    if (map[s] != null) return map[s];
    // 「○(遅)」「出席（遅刻）」のように括弧で補足 → 括弧の中を優先
    var p = s.match(/^(.+?)[(（](.+)[)）]$/);
    if (p) { var a = map[norm(p[2])], b = map[norm(p[1])]; if (a) return a; if (b) return b; }
    return "U";
  }

  // ---------- 列の推定 ----------
  var RE_NAME = /氏名|名前|なまえ|お名前|^name$|選手|生徒|部員|会員|児童|団員|メンバー|参加者/i;
  var RE_GROUP = /組|クラス|学年|班|チーム|所属|部門|コース|グループ|パート|ポジション|^class$|^group$/i;
  var RE_NOTSES = /合計|出席率|出席数|欠席数|回数|率|%|^計$|小計|備考|メモ|番号|^no\.?$|ふりがな|フリガナ|よみ|カナ|電話|メール|住所/i;
  var RE_DATE = /日付|日時|練習日|実施日|開催日|活動日|^date$/i;
  var RE_STATUS = /出欠|出席|状況|区分|^status$|参加/i;

  function guessWide(headers, rows, map) {
    var w = headers.length, sessions = [], name = null, group = null, ctx = {};
    for (var c = 0; c < w; c++) {
      var h = headers[c];
      if (RE_NOTSES.test(norm(h)) || RE_NAME.test(norm(h))) continue;
      var nonEmpty = 0, ok = 0;
      rows.forEach(function (r) { var v = norm(r[c]); if (v) { nonEmpty++; if (classify(v, map) !== "U") ok++; } });
      var isDate = !!parseDate(h, ctx);
      if ((isDate && (nonEmpty === 0 || ok / nonEmpty >= 0.5)) || (nonEmpty > 0 && ok / nonEmpty >= 0.7 && !RE_GROUP.test(norm(h)))) sessions.push(c);
    }
    for (c = 0; c < w; c++) { if (sessions.indexOf(c) < 0 && RE_NAME.test(norm(headers[c])) && !/ふりがな|フリガナ|よみ|カナ/.test(norm(headers[c]))) { name = c; break; } }
    if (name == null) {
      for (c = 0; c < w; c++) {
        if (sessions.indexOf(c) >= 0 || RE_NOTSES.test(norm(headers[c])) || RE_GROUP.test(norm(headers[c]))) continue;
        var txt = rows.filter(function (r) { var v = norm(r[c]); return v && !/^\d+$/.test(v); }).length;
        if (txt >= rows.length * 0.6) { name = c; break; }
      }
    }
    for (c = 0; c < w; c++) { if (c !== name && sessions.indexOf(c) < 0 && RE_GROUP.test(norm(headers[c]))) { group = c; break; } }
    return { name: name, group: group, sessions: sessions };
  }
  function guessLong(headers, rows) {
    var cols = {}, used = {};
    function pick(k, re) { for (var i = 0; i < headers.length; i++) if (!used[i] && re.test(norm(headers[i]))) { cols[k] = i; used[i] = 1; return; } }
    pick("date", RE_DATE); pick("name", RE_NAME); pick("status", RE_STATUS); pick("group", RE_GROUP);
    if (cols.date == null) {
      for (var c = 0; c < headers.length; c++) {
        if (used[c]) continue;
        var n = rows.slice(0, 50).filter(function (r) { return parseDate(r[c], {}); }).length;
        if (n >= Math.min(3, rows.length)) { cols.date = c; used[c] = 1; break; }
      }
    }
    return cols;
  }
  // 表の形の推定：見出しに日付が2つ以上か、記号の列が2つ以上なら「名前×日付」の表
  function guessShape(headers, rows, map) {
    var g = guessWide(headers, rows, map);
    if (g.sessions.length >= 2) return "wide";
    var l = guessLong(headers, rows);
    if (l.date != null && l.name != null) return "long";
    return "wide";
  }

  // ---------- 出欠表をそろえる ----------
  // 戻り値：{sessions:[{label,dn}], people:[{name,group,row,cells:[raw]}], dup:[...], skipped:[...]}
  function buildWide(headers, rows, cols, o) {
    o = o || {};
    var ctx = { year: o.year || null }, rowBase = o.rowBase || 2;
    var sessions = (cols.sessions || []).map(function (c) {
      var p = parseDate(headers[c], ctx);
      return { label: norm(headers[c]) || "列" + (c + 1), dn: p ? p.dn : null, col: c };
    });
    var people = [], idx = {}, dup = [], skipped = [];
    rows.forEach(function (r, i) {
      var name = cols.name != null ? norm(r[cols.name]) : "";
      var cells = sessions.map(function (s) { return r[s.col] == null ? "" : String(r[s.col]); });
      if (!name) {
        if (cells.some(function (v) { return norm(v); })) skipped.push({ row: i + rowBase, why: "名前が空欄" });
        return;
      }
      if (/^(合計|計|小計|出席数|出席者数|人数|欠席数|出席率)$/.test(name)) { skipped.push({ row: i + rowBase, why: "「" + name + "」の行は集計の行として飛ばしました" }); return; }
      var key = name.replace(/\s/g, "") + "\u0000" + (cols.group != null ? norm(r[cols.group]) : "");
      if (idx[key] != null) { dup.push({ row: i + rowBase, name: name, first: people[idx[key]].row }); return; }
      idx[key] = people.length;
      people.push({ name: name, group: cols.group != null ? norm(r[cols.group]) : "", row: i + rowBase, cells: cells });
    });
    return { sessions: sessions, people: people, dup: dup, skipped: skipped, missingIsAbsent: false };
  }
  // 1行に1件（日付・名前・出欠）の記録から。出欠の列がなければ「来た人だけの記録」とみなし、記録のない人は欠席
  function buildLong(headers, rows, cols, o) {
    o = o || {};
    var rowBase = o.rowBase || 2, ses = {}, sesList = [], people = [], pidx = {}, skipped = [], dup = [];
    var hasStatus = cols.status != null;
    function person(name, group, row) {
      var key = name.replace(/\s/g, "");
      if (pidx[key] == null) { pidx[key] = people.length; people.push({ name: name, group: group || "", row: row, map: {} }); }
      var p = people[pidx[key]];
      if (!p.group && group) p.group = group;
      return p;
    }
    String(o.roster || "").split(/\r?\n/).forEach(function (line) {
      var parts = line.split(/\t|,/).map(norm);
      if (parts[0]) person(parts[0], parts[1] || "", null);
    });
    rows.forEach(function (r, i) {
      var name = cols.name != null ? norm(r[cols.name]) : "";
      var dv = cols.date != null ? r[cols.date] : "";
      if (!name && !norm(dv)) return;
      if (!name) { skipped.push({ row: i + rowBase, why: "名前が空欄" }); return; }
      var p = parseDate(dv, { year: o.year || null });
      var key, label, dn = null;
      if (p) { dn = p.dn; key = "d" + dn; label = mdStr(dn); }
      else if (norm(dv)) { key = "s" + norm(dv); label = norm(dv); }
      else { skipped.push({ row: i + rowBase, why: "日付が空欄" }); return; }
      if (!ses[key]) { ses[key] = { label: label, dn: dn, key: key, first: i }; sesList.push(ses[key]); }
      var pp = person(name, cols.group != null ? norm(r[cols.group]) : "", i + rowBase);
      var st = hasStatus ? String(r[cols.status] == null ? "" : r[cols.status]) : "○";
      if (pp.map[key] != null && norm(pp.map[key]) && norm(st)) dup.push({ row: i + rowBase, name: name, label: label });
      if (pp.map[key] == null || norm(st)) pp.map[key] = st;
      if (pp.row == null) pp.row = i + rowBase;
    });
    sesList.sort(function (a, b) {
      if (a.dn != null && b.dn != null) return a.dn - b.dn;
      if (a.dn != null) return -1; if (b.dn != null) return 1;
      return a.first - b.first;
    });
    return {
      sessions: sesList.map(function (s) { return { label: s.label, dn: s.dn }; }),
      people: people.map(function (p) { return { name: p.name, group: p.group, row: p.row, cells: sesList.map(function (s) { return p.map[s.key] == null ? null : p.map[s.key]; }) }; }),
      dup: dup, skipped: skipped, missingIsAbsent: !hasStatus
    };
  }

  // ---------- 集計 ----------
  // o: {map, blank:"skip"|"absent", lateOk:bool, from, to(dn), threshold(%), streak(回), limit(人)}
  function run(model, o) {
    o = o || {};
    var map = o.map || makeMap(), lateOk = o.lateOk !== false, blankAbs = o.blank === "absent";
    var people = model.people.slice(0, o.limit || Infinity);
    // 期間で回を選ぶ
    var useIdx = [], outside = 0;
    model.sessions.forEach(function (s, j) {
      if ((o.from != null || o.to != null) && (s.dn == null || (o.from != null && s.dn < o.from) || (o.to != null && s.dn > o.to))) { outside++; return; }
      useIdx.push(j);
    });
    // 記号を区分に
    var cat = people.map(function (p) {
      return useIdx.map(function (j) {
        var v = p.cells[j];
        if (v == null) return model.missingIsAbsent ? "A" : "B";
        var k = classify(v, map);
        if (k === "B" && blankAbs) k = "A";
        return k;
      });
    });
    // 全員が空欄（記録なし）の回は活動のない回として外す
    var empty = [], keep = [];
    useIdx.forEach(function (j, t) {
      var any = cat.some(function (row) { return row[t] !== "B"; });
      if (any || blankAbs) keep.push(t); else empty.push(model.sessions[j].label);
    });
    var sessions = keep.map(function (t) { return model.sessions[useIdx[t]]; });
    if (blankAbs) {
      // 空欄＝欠席でも、元の表で全員が空欄の回は外す（活動のなかった日）
      var keep2 = [], ses2 = [];
      keep.forEach(function (t, k) {
        var j = useIdx[t];
        var allBlank = people.every(function (p) { var v = p.cells[j]; return v == null ? !model.missingIsAbsent : !norm(v); });
        if (allBlank) empty.push(model.sessions[j].label); else { keep2.push(t); ses2.push(sessions[k]); }
      });
      keep = keep2; sessions = ses2;
    }
    var unknown = [];
    var per = people.map(function (p, i) {
      var c = { P: 0, L: 0, E: 0, A: 0, X: 0, B: 0, U: 0 }, marks = [], run0 = 0, maxRun = 0, lastAtt = null;
      keep.forEach(function (t, k) {
        var x = cat[i][t]; c[x]++; marks.push(x);
        var j = useIdx[t];
        if (x === "U") unknown.push({ name: p.name, row: p.row, session: model.sessions[j].label, value: norm(p.cells[j]) });
        if (x === "A") { run0++; if (run0 > maxRun) maxRun = run0; }
        else if (x === "P" || x === "L" || x === "E") { run0 = 0; lastAtt = k; }
      });
      var target = c.P + c.L + c.E + c.A, att = c.P + (lateOk ? c.L + c.E : 0);
      return {
        name: p.name, group: p.group, row: p.row, c: c, marks: marks, target: target, att: att,
        rate: target ? att / target : null, maxRun: maxRun, recentRun: run0,
        lastAtt: lastAtt == null ? null : sessions[lastAtt]
      };
    });
    // 回ごと
    var bySes = sessions.map(function (s, k) {
      var c = { P: 0, L: 0, E: 0, A: 0, X: 0, B: 0, U: 0 };
      per.forEach(function (r) { c[r.marks[k]]++; });
      var target = c.P + c.L + c.E + c.A, att = c.P + (lateOk ? c.L + c.E : 0);
      return { label: s.label, dn: s.dn, c: c, target: target, att: att, rate: target ? att / target : null };
    });
    // 月ごと（日付の分かる回だけ）
    var months = [], mIdx = {};
    sessions.forEach(function (s, k) {
      if (s.dn == null) return;
      var f = fromDayNo(s.dn), key = f.y + "-" + pad(f.m);
      if (mIdx[key] == null) { mIdx[key] = months.length; months.push({ key: key, label: f.y + "年" + f.m + "月", ks: [] }); }
      months[mIdx[key]].ks.push(k);
    });
    months.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var byMonth = per.map(function (r) {
      return months.map(function (m) {
        var t = 0, a = 0;
        m.ks.forEach(function (k) { var x = r.marks[k]; if (x === "P" || x === "L" || x === "E" || x === "A") t++; if (x === "P" || (lateOk && (x === "L" || x === "E"))) a++; });
        return { target: t, att: a, rate: t ? a / t : null };
      });
    });
    // 組ごと
    var groups = [], gIdx = {};
    per.forEach(function (r) {
      var g = r.group || "";
      if (gIdx[g] == null) { gIdx[g] = groups.length; groups.push({ name: g, n: 0, target: 0, att: 0, flagged: 0 }); }
      var G = groups[gIdx[g]]; G.n++; G.target += r.target; G.att += r.att;
    });
    // 気になる人
    var th = o.threshold == null ? 70 : +o.threshold, st = o.streak == null ? 3 : +o.streak;
    var flagged = [];
    per.forEach(function (r) {
      var why = [];
      if (th > 0 && r.rate != null && r.rate * 100 < th - 1e-9) why.push("出席率 " + pct(r.rate) + "（" + th + "% 未満）");
      if (st > 0 && r.recentRun >= st) why.push("直近 " + r.recentRun + " 回続けて欠席");
      if (why.length) { r.flag = why; flagged.push(r); groups[gIdx[r.group || ""]].flagged++; }
    });
    groups.forEach(function (G) { G.rate = G.target ? G.att / G.target : null; });
    var T = { target: 0, att: 0 };
    per.forEach(function (r) { T.target += r.target; T.att += r.att; });
    return {
      sessions: sessions, per: per, bySes: bySes, months: months, byMonth: byMonth, groups: groups, flagged: flagged,
      unknown: unknown, empty: empty, outside: outside, total: { target: T.target, att: T.att, rate: T.target ? T.att / T.target : null },
      hasDates: sessions.some(function (s) { return s.dn != null; }), undated: sessions.filter(function (s) { return s.dn == null; }).length,
      cut: model.people.length - people.length
    };
  }
  function pct(r) { return r == null ? "—" : (Math.round(r * 1000) / 10).toFixed(1) + "%"; }
  function rate100(r) { return r == null ? "" : Math.round(r * 1000) / 10; }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, transpose: transpose, parseDate: parseDate, dayNo: dayNo, fromDayNo: fromDayNo,
    ymdStr: ymdStr, mdStr: mdStr, WD: WD, CATS: CATS, CAT_NAME: CAT_NAME, DEFAULT_MAP: DEFAULT_MAP, makeMap: makeMap, classify: classify,
    guessWide: guessWide, guessLong: guessLong, guessShape: guessShape, buildWide: buildWide, buildLong: buildLong, run: run, pct: pct, rate100: rate100, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.SHUSSEKI = K;
})(this);
