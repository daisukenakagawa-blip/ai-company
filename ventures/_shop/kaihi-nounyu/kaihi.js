/* 会費・月謝の納入状況の一覧 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function transpose(rows) {
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0), out = [];
    for (var c = 0; c < w; c++) out.push(rows.map(function (r) { return r[c] == null ? "" : r[c]; }));
    return out;
  }

  // ---------- 月 ----------
  // 月の番号 mk = 年*12 + (月-1)
  function mkOf(y, m) { return y * 12 + (m - 1); }
  function ymOf(mk) { return { y: Math.floor(mk / 12), m: mk % 12 + 1 }; }
  function mLabel(mk) { var o = ymOf(mk); return o.y + "年" + o.m + "月"; }
  function mShort(mk) { return ymOf(mk).m + "月"; }
  function mIso(mk) { var o = ymOf(mk); return o.y + "-" + (o.m < 10 ? "0" : "") + o.m; }

  // 見出しなどから「何年何月分」を読む。年のない「4月」は ctx.year を使い、月が前より小さくなったら次の年
  // 戻り値：{mk, noYear} か null
  function parseMonth(v, ctx) {
    ctx = ctx || {};
    var s = norm(v);
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = parseFloat(s);
      if (x > 20000 && x < 120000) { var t = new Date((Math.floor(x) - 25569) * 864e5); return done(t.getUTCFullYear(), t.getUTCMonth() + 1, false); }
      return null;
    }
    s = s.replace(/[（(][^）)]*[）)]/g, "").replace(/\s*(分|会費|月謝|集金|納入|部費|会費分|月謝分)+\s*$/g, "").replace(/^(会費|月謝|部費)\s*/, "")
      .replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?$/, "").trim();
    var mm, y, m, noYear = false;
    if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*(月)?\s*([-\/.]\s*\d{1,2}\s*日?|\d{1,2}\s*日)?$/))) { y = +mm[1]; m = +mm[2]; }
    else if ((mm = s.match(/^(\d{4})(\d{2})$/))) { y = +mm[1]; m = +mm[2]; }
    else if ((mm = s.match(/^令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月$/))) { y = 2018 + (mm[1] === "元" ? 1 : +mm[1]); m = +mm[2]; }
    else if ((mm = s.match(/^R\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})$/i))) { y = 2018 + (+mm[1]); m = +mm[2]; }
    else if ((mm = s.match(/^(\d{1,2})\s*月$/))) { m = +mm[1]; noYear = true; }
    else return null;
    if (m < 1 || m > 12) return null;
    if (noYear) {
      y = ctx.year || new Date().getFullYear();
      if (ctx.prevMonth != null && m < ctx.prevMonth) ctx.year = y = y + 1;
      ctx.prevMonth = m;
      if (!ctx.year) ctx.year = y;
      return { mk: mkOf(y, m), noYear: true };
    }
    return done(y, m, false);
    function done(y2, m2, ny) {
      if (y2 < 1900 || y2 > 2200) return null;
      ctx.year = y2; ctx.prevMonth = m2;
      return { mk: mkOf(y2, m2), noYear: ny };
    }
  }

  // ---------- 金額・記号 ----------
  // 金額として読めれば数値、読めなければ null（「3,000」「¥3000」「3000円」「3千円」）
  function parseAmount(v) {
    var s = norm(v).replace(/[¥￥,，、\s]/g, "").replace(/円$/, "");
    var mm;
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    if ((mm = s.match(/^(\d+(?:\.\d+)?)千$/))) return Math.round(parseFloat(mm[1]) * 1000);
    if ((mm = s.match(/^(\d+(?:\.\d+)?)万$/))) return Math.round(parseFloat(mm[1]) * 10000);
    return null;
  }
  function isDateLike(s) {
    s = norm(s);
    return /^(\d{4}\s*[-\/.年]\s*)?\d{1,2}\s*[-\/.月]\s*\d{1,2}\s*日?$/.test(s) || /^(令和|R)\s*\d/.test(s) && /\d{1,2}\s*[月.\/]\s*\d{1,2}/.test(s);
  }
  var CATS = ["P", "A", "X"];
  var CAT_NAME = { P: "納入済み", A: "未納", X: "対象外" };
  var DEFAULT_MAP = {
    P: "済,済み,○,◯,〇,◎,✓,✔,レ,v,入金,入金済,入金済み,納,納入,納入済,完納,領収,受領,集金済,支払済,払,ok,1",
    A: "×,✕,✖,x,未,未納,未払,未払い,未入金,未集金,0,滞納,なし",
    X: "免,免除,休,休会,退,退会,入会前,対象外,不要,-,ー,―,—,/"
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
  // 1つのマスを読む → {k:"P"|"A"|"X"|"B"|"U", amt:数値|null, date:bool}
  function readCell(raw, map) {
    var s = norm(raw), low = s.toLowerCase();
    if (!s) return { k: "B", amt: null };
    if (map[low] != null) return { k: map[low], amt: null };
    var a = parseAmount(s);
    if (a != null) return { k: "P", amt: a };
    if (isDateLike(s)) return { k: "P", amt: null, date: true };
    // 「済(4/10)」「3000 4/12」「済 3,000円」のように2つ以上書いたもの：金額 → 記号 → 日付 の順に使う
    var toks = s.split(/[\s()（）\[\]［］:：・\/]+/).filter(Boolean);
    if (/\d+\s*[\/.-]\s*\d+/.test(s)) {
      // 日付の「/」で切れないよう、括弧と空白だけで区切り直す
      toks = s.split(/[\s()（）\[\]［］:：・]+/).filter(Boolean);
    }
    if (toks.length > 1) {
      var amt = null, sym = null, dt = false;
      toks.forEach(function (t) {
        var tl = norm(t).toLowerCase();
        if (map[tl] != null) { if (sym == null) sym = map[tl]; return; }
        var x = parseAmount(t); if (x != null) { if (amt == null) amt = x; return; }
        if (isDateLike(t)) { dt = true; return; }
        // 「入金済4/10」のような続け書き
        var mm = tl.match(/^(.*?)(\d{1,2}[\/.月]\d{1,2}日?)$/);
        if (mm && map[mm[1]] != null) { if (sym == null) sym = map[mm[1]]; dt = true; return; }
        sym = sym || "?";
      });
      if (sym === "?") sym = null;
      if (sym === "X" || sym === "A") return { k: sym, amt: null };
      if (amt != null) return { k: "P", amt: amt };
      if (sym === "P" || dt) return { k: "P", amt: null, date: dt };
    }
    var m2 = low.match(/^(.*?)(\d{1,2}[\/.月]\d{1,2}日?)$/);
    if (m2 && map[m2[1]] != null) return { k: map[m2[1]], amt: null, date: true };
    return { k: "U", amt: null };
  }

  // ---------- 列の推定 ----------
  var RE_NAME = /氏名|名前|なまえ|お名前|^name$|会員名|生徒|児童|団員|部員|選手|保護者|世帯|家族名|メンバー/i;
  var RE_GROUP = /組|クラス|学年|班|チーム|所属|部門|コース|グループ|地区|区|町|号棟|棟/i;
  var RE_DUE = /月額|会費額|月謝額|^会費$|^月謝$|^部費$|^金額$|^単価$|請求額|1か月|1ヶ月|毎月/i;
  var RE_NOTM = /合計|計$|未納|納入額|残|備考|メモ|番号|^no\.?$|ふりがな|フリガナ|よみ|カナ|電話|メール|住所|入会日|退会日/i;
  var RE_MONTH = /^(対象)?月$|対象月|何月分|^月分$|^年月$|会費の月|月謝の月/i;
  var RE_PAY = /金額|入金額|納入額|支払額|額$/i, RE_PAY2 = /^(?!.*(日|日付|日時)$).*(状態|状況|納入|入金|済|支払)/i;

  function guessWide(headers, rows) {
    var w = headers.length, months = [], name = null, group = null, due = null, ctx = {};
    for (var c = 0; c < w; c++) {
      if (RE_NOTM.test(norm(headers[c])) || RE_NAME.test(norm(headers[c]))) continue;
      if (parseMonth(headers[c], ctx)) months.push(c);
    }
    for (c = 0; c < w; c++) { var h = norm(headers[c]); if (months.indexOf(c) < 0 && RE_NAME.test(h) && !/ふりがな|フリガナ|よみ|カナ/.test(h)) { name = c; break; } }
    if (name == null) {
      for (c = 0; c < w; c++) {
        if (months.indexOf(c) >= 0 || RE_NOTM.test(norm(headers[c])) || RE_GROUP.test(norm(headers[c])) || RE_DUE.test(norm(headers[c]))) continue;
        var txt = rows.filter(function (r) { var v = norm(r[c]); return v && parseAmount(v) == null; }).length;
        if (txt >= rows.length * 0.6) { name = c; break; }
      }
    }
    for (c = 0; c < w; c++) { if (c !== name && months.indexOf(c) < 0 && RE_GROUP.test(norm(headers[c])) && !RE_DUE.test(norm(headers[c]))) { group = c; break; } }
    for (c = 0; c < w; c++) {
      if (c === name || c === group || months.indexOf(c) >= 0) continue;
      if (RE_DUE.test(norm(headers[c]))) {
        var nums = rows.filter(function (r) { return parseAmount(r[c]) != null; }).length;
        if (nums >= Math.max(1, rows.length * 0.5)) { due = c; break; }
      }
    }
    return { name: name, group: group, due: due, months: months };
  }
  function guessLong(headers, rows) {
    var cols = {}, used = {};
    function pick(k, re) { for (var i = 0; i < headers.length; i++) if (!used[i] && re.test(norm(headers[i]))) { cols[k] = i; used[i] = 1; return; } }
    pick("month", RE_MONTH); pick("name", RE_NAME); pick("pay", RE_PAY); if (cols.pay == null) pick("pay", RE_PAY2); pick("group", RE_GROUP);
    if (cols.month == null) {
      for (var c = 0; c < headers.length; c++) {
        if (used[c]) continue;
        var n = rows.slice(0, 50).filter(function (r) { var v = norm(r[c]); return /月/.test(v) && parseMonth(v, {}); }).length;
        if (n >= Math.min(3, rows.length)) { cols.month = c; used[c] = 1; break; }
      }
    }
    return cols;
  }
  function guessShape(headers, rows) {
    var g = guessWide(headers, rows);
    if (g.months.length >= 2) return "wide";
    var l = guessLong(headers, rows);
    if (l.month != null && l.name != null) return "long";
    return "wide";
  }

  // ---------- 表をそろえる ----------
  // 戻り値：{months:[{mk,label,col}], people:[{name,group,row,due,cells:[raw|null|[raw...]]}], dup, skipped}
  function buildWide(headers, rows, cols, o) {
    o = o || {};
    var ctx = { year: o.year || null }, rowBase = o.rowBase || 2;
    var months = [], seen = {};
    (cols.months || []).forEach(function (c) {
      var p = parseMonth(headers[c], ctx);
      if (!p) { months.push({ mk: null, label: norm(headers[c]) || "列" + (c + 1), col: c }); return; }
      months.push({ mk: p.mk, label: mLabel(p.mk), col: c, dupOf: seen[p.mk] != null ? seen[p.mk] : null });
      if (seen[p.mk] == null) seen[p.mk] = c;
    });
    var people = [], idx = {}, dup = [], skipped = [];
    rows.forEach(function (r, i) {
      var name = cols.name != null ? norm(r[cols.name]) : "";
      var cells = months.map(function (m) { return r[m.col] == null ? "" : String(r[m.col]); });
      if (!name) {
        if (cells.some(function (v) { return norm(v); })) skipped.push({ row: i + rowBase, why: "名前が空欄" });
        return;
      }
      if (/^(合計|計|小計|総計|集金額|納入額|人数|未納額)$/.test(name)) { skipped.push({ row: i + rowBase, why: "「" + name + "」の行は集計の行として飛ばしました" }); return; }
      var grp = cols.group != null ? norm(r[cols.group]) : "";
      var key = name.replace(/\s/g, "") + "\u0000" + grp;
      if (idx[key] != null) { dup.push({ row: i + rowBase, name: name, first: people[idx[key]].row }); return; }
      idx[key] = people.length;
      var dueRaw = cols.due != null ? r[cols.due] : "";
      people.push({ name: name, group: grp, row: i + rowBase, due: parseAmount(dueRaw), dueRaw: norm(dueRaw), cells: cells });
    });
    return { months: months, people: people, dup: dup, skipped: skipped, missingIsBlank: false };
  }
  // 1行に1件（名前・何月分・金額や済）の記録から。同じ人・同じ月が2件以上なら金額を足す。記録のない月は空欄
  function buildLong(headers, rows, cols, o) {
    o = o || {};
    var rowBase = o.rowBase || 2, mset = {}, people = [], pidx = {}, skipped = [], unread = [];
    function person(name, group, row) {
      var key = name.replace(/\s/g, "");
      if (pidx[key] == null) { pidx[key] = people.length; people.push({ name: name, group: group || "", row: row, map: {}, due: null, dueRaw: "" }); }
      var p = people[pidx[key]];
      if (!p.group && group) p.group = group;
      return p;
    }
    String(o.roster || "").split(/\r?\n/).forEach(function (line) {
      var parts = line.split(/\t|,/).map(norm);
      if (!parts[0]) return;
      var p = person(parts[0], parts[1] || "", null);
      var d = parts[2] != null ? parseAmount(parts[2]) : null;
      if (d != null) { p.due = d; p.dueRaw = parts[2]; }
    });
    rows.forEach(function (r, i) {
      var name = cols.name != null ? norm(r[cols.name]) : "";
      var mv = cols.month != null ? r[cols.month] : "";
      if (!name && !norm(mv)) return;
      if (!name) { skipped.push({ row: i + rowBase, why: "名前が空欄" }); return; }
      var p = parseMonth(mv, { year: o.year || null });
      if (!p) { skipped.push({ row: i + rowBase, why: norm(mv) ? "「" + norm(mv) + "」を月として読めません" : "月が空欄" }); return; }
      mset[p.mk] = 1;
      var pp = person(name, cols.group != null ? norm(r[cols.group]) : "", i + rowBase);
      var v = cols.pay != null ? String(r[cols.pay] == null ? "" : r[cols.pay]) : "済";
      (pp.map[p.mk] = pp.map[p.mk] || []).push({ v: v, row: i + rowBase });
      if (pp.row == null) pp.row = i + rowBase;
    });
    var mks = Object.keys(mset).map(Number);
    if (o.fromMk != null && o.toMk != null) { for (var k = o.fromMk; k <= o.toMk; k++) if (!mset[k]) mks.push(k); }
    mks.sort(function (a, b) { return a - b; });
    return {
      months: mks.map(function (mk) { return { mk: mk, label: mLabel(mk) }; }),
      people: people.map(function (p) { return { name: p.name, group: p.group, row: p.row, due: p.due, dueRaw: p.dueRaw, cells: mks.map(function (mk) { return p.map[mk] ? p.map[mk].map(function (x) { return x.v; }) : null; }) }; }),
      dup: [], skipped: skipped, missingIsBlank: true
    };
  }

  // ---------- 集計 ----------
  // o: {map, fee(初めの月額), blank:"unpaid"|"skip", fromMk, toMk, limit, perMonthFee:{mk:額}}
  // 状態：F 納入済み / H 一部 / A 未納 / X 対象外 / N 数えない（空欄を数えない設定） / U 読めない
  function evalCell(raw, due, map, blankUnpaid) {
    var list = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);
    var rs = list.map(function (v) { return readCell(v, map); }).filter(function (x) { return x.k !== "B"; });
    if (!rs.length) return blankUnpaid ? { s: "A", paid: 0, short: due, over: 0 } : { s: "N", paid: 0, short: 0, over: 0 };
    if (rs.some(function (x) { return x.k === "U"; })) return { s: "U", paid: 0, short: 0, over: 0, raw: list.map(norm).filter(Boolean).join("／") };
    if (rs.some(function (x) { return x.k === "X"; })) return { s: "X", paid: 0, short: 0, over: 0 };
    var amt = 0, hasAmt = false, full = false;
    rs.forEach(function (x) { if (x.amt != null) { amt += x.amt; hasAmt = true; } else if (x.k === "P") full = true; });
    if (!hasAmt && !full) return { s: "A", paid: 0, short: due, over: 0 };
    if (full && !hasAmt) return { s: "F", paid: due, short: 0, over: 0 };
    if (full) amt = Math.max(amt, due);              // 「済」と金額が両方ある → 済を優先
    if (amt <= 0) return { s: "A", paid: 0, short: due, over: 0 };
    if (due > 0 && amt < due) return { s: "H", paid: amt, short: due - amt, over: 0 };
    return { s: "F", paid: amt, short: 0, over: due > 0 ? amt - due : 0 };
  }
  function run(model, o) {
    o = o || {};
    var map = o.map || makeMap(), fee = +o.fee || 0, blankUnpaid = o.blank !== "skip", pmf = o.perMonthFee || {};
    var people = model.people.slice(0, o.limit || Infinity);
    var use = [], outside = 0;
    model.months.forEach(function (m, j) {
      if (m.mk != null && ((o.fromMk != null && m.mk < o.fromMk) || (o.toMk != null && m.mk > o.toMk))) { outside++; return; }
      use.push(j);
    });
    var months = use.map(function (j) { return model.months[j]; });
    var unknown = [], noDue = 0;
    var per = people.map(function (p) {
      var c = { F: 0, H: 0, A: 0, X: 0, N: 0, U: 0 }, cells = [], paid = 0, short = 0, over = 0, dueSum = 0, unpaidM = [];
      var base = p.due != null ? p.due : fee;
      use.forEach(function (j, k) {
        var m = model.months[j];
        var due = p.due != null ? p.due : (m.mk != null && pmf[m.mk] != null ? +pmf[m.mk] : fee);
        var e = evalCell(p.cells[j], due, map, blankUnpaid);
        c[e.s]++; cells.push(e);
        if (e.s === "U") unknown.push({ name: p.name, row: p.row, month: m.label, value: e.raw });
        if (e.s === "F" || e.s === "H" || e.s === "A") { dueSum += due; paid += e.paid; short += e.short; over += e.over; }
        if (e.s === "A" || e.s === "H") unpaidM.push({ k: k, label: m.label, mk: m.mk, s: e.s, short: e.short, paid: e.paid });
      });
      if (base <= 0 && p.due == null) noDue++;
      return { name: p.name, group: p.group, row: p.row, due: p.due, base: base, c: c, cells: cells, paid: paid, short: short, over: over, dueSum: dueSum, unpaid: unpaidM, target: c.F + c.H + c.A };
    });
    // 月ごと
    var byMonth = months.map(function (m, k) {
      var x = { label: m.label, mk: m.mk, target: 0, F: 0, H: 0, A: 0, X: 0, N: 0, U: 0, due: 0, paid: 0, short: 0 };
      per.forEach(function (r) {
        var e = r.cells[k]; x[e.s]++;
        if (e.s === "F" || e.s === "H" || e.s === "A") { x.target++; x.paid += e.paid; x.short += e.short; x.due += e.paid + e.short - (e.over || 0); }
      });
      x.rate = x.target ? x.F / x.target : null;
      return x;
    });
    // 組ごと
    var groups = [], gIdx = {};
    per.forEach(function (r) {
      var g = r.group || "";
      if (gIdx[g] == null) { gIdx[g] = groups.length; groups.push({ name: g, n: 0, unpaidPeople: 0, target: 0, F: 0, paid: 0, short: 0 }); }
      var G = groups[gIdx[g]]; G.n++; G.target += r.target; G.F += r.c.F; G.paid += r.paid; G.short += r.short; if (r.unpaid.length) G.unpaidPeople++;
    });
    groups.forEach(function (G) { G.rate = G.target ? G.F / G.target : null; });
    // 未納の一覧（1行1件）
    var lines = [];
    per.forEach(function (r) { r.unpaid.forEach(function (u) { lines.push({ name: r.name, group: r.group, label: u.label, mk: u.mk, s: u.s, short: u.short, paid: u.paid }); }); });
    var T = { target: 0, F: 0, paid: 0, short: 0, over: 0, unpaidPeople: 0 };
    per.forEach(function (r) { T.target += r.target; T.F += r.c.F; T.paid += r.paid; T.short += r.short; T.over += r.over; if (r.unpaid.length) T.unpaidPeople++; });
    T.rate = T.target ? T.F / T.target : null;
    return {
      months: months, per: per, byMonth: byMonth, groups: groups, lines: lines, unknown: unknown, outside: outside, total: T,
      noDue: noDue, cut: model.people.length - people.length,
      undated: months.filter(function (m) { return m.mk == null; }).length
    };
  }
  function yen(n) { n = Math.round(n || 0); return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "円"; }
  function pct(r) { return r == null ? "—" : (Math.round(r * 1000) / 10).toFixed(1) + "%"; }
  function rate100(r) { return r == null ? "" : Math.round(r * 1000) / 10; }
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, transpose: transpose, mkOf: mkOf, ymOf: ymOf, mLabel: mLabel, mShort: mShort, mIso: mIso,
    parseMonth: parseMonth, parseAmount: parseAmount, isDateLike: isDateLike, CATS: CATS, CAT_NAME: CAT_NAME, DEFAULT_MAP: DEFAULT_MAP, makeMap: makeMap,
    readCell: readCell, evalCell: evalCell, guessWide: guessWide, guessLong: guessLong, guessShape: guessShape, buildWide: buildWide, buildLong: buildLong,
    run: run, yen: yen, pct: pct, rate100: rate100, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.KAIHI = K;
})(this);
