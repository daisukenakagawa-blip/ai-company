/* シフト表の集計と点検 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var WDC = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
  function wdOf(day) { return ((day % 7) + 11) % 7; } // 1970/1/1 は木曜
  function dayOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function ymd(day) { var t = new Date(day * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function dayLabel(day, short) { var o = ymd(day); return (short ? "" : o.y + "/") + o.m + "/" + o.d + "（" + WD[wdOf(day)] + "）"; }
  function hm(min) { // 1日の中の分 → 「9:05」、24時以降は「翌1:00」
    min = Math.round(min);
    var nx = min >= 1440 ? "翌" : "";
    if (min >= 1440) min -= 1440;
    return nx + Math.floor(min / 60) + ":" + pad(min % 60);
  }
  function hours(min) { min = Math.round(min); return Math.floor(min / 60) + ":" + pad(min % 60); } // 「168:30」
  function dec(min) { return Math.round(min / 60 * 100) / 100; }

  // ---------- 時刻 ----------
  function parseClock(s) {
    var t = norm(s).replace(/^翌日?\s*/, ""), m, h, mi = 0, nx = /^翌/.test(norm(s));
    if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) { h = +m[1]; mi = +m[2]; }
    else if ((m = t.match(/^(\d{1,2})時(?:(\d{1,2})分?|(半))?$/))) { h = +m[1]; mi = m[2] != null ? +m[2] : (m[3] ? 30 : 0); }
    else if ((m = t.match(/^(\d{1,2})(?:\.(\d))?$/))) { h = +m[1]; mi = m[2] ? Math.round(+("0." + m[2]) * 60) : 0; }
    else return null;
    if (mi >= 60 || h > 36) return null;
    return h * 60 + mi + (nx ? 1440 : 0);
  }
  var TP = "((?:翌日?)?\\s*(?:\\d{1,2}:\\d{2}|\\d{1,2}時(?:\\d{1,2}分?|半)?|\\d{1,2}(?:\\.\\d)?))";
  var RANGE = new RegExp("^(.*?)" + TP + "\\s*(?:〜|~|-|–|—|−|ー|―|から)\\s*" + TP + "\\s*(?:まで)?(.*)$");
  function parseRange(s) { // 「9:00-17:00」「22時〜翌6時」→ {s,e,rest}
    var t = norm(s).replace(/[〜~]/g, "〜"), m = t.match(RANGE);
    if (!m) return null;
    var a = parseClock(m[2]), b = parseClock(m[3]);
    if (a == null || b == null || a >= 1440) return null;
    if (b <= a) b += 1440;
    if (b - a > 1440) return null;
    return { pre: m[1].trim(), s: a, e: b, rest: (m[4] || "").trim() };
  }
  function parseLen(s) { // 「60」「60分」「1時間」「1:00」「1.5h」→ 分
    var t = norm(s).replace(/^休憩?\s*/, ""), m;
    if (!t) return null;
    if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) return +m[1] * 60 + +m[2];
    if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(時間|h)(?:\s*(\d+)\s*分?)?$/i))) return Math.round(+m[1] * 60) + (m[3] ? +m[3] : 0);
    if ((m = t.match(/^(\d+)\s*(分|m|min)?$/i))) return +m[1];
    return null;
  }

  // ---------- 記号の表 ----------
  var OFFW = /^(休|休み|公休|公|お休み|休日|定休|希望休|希休|off|×|x|-|ー|―|・)$/i;
  var PAIDW = /^(有|有休|有給|年休|有給休暇|年次有給休暇)$/;
  var DEFAULT_CODES = "早 7:00-16:00 休憩60\n中 10:00-19:00 休憩60\n遅 13:00-22:00 休憩60\n夜 22:00-翌7:00 休憩120\n休 休み\n公 休み\n希 休み\n有 有休";
  function parseCodes(text) {
    var codes = {}, order = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line, n) {
      var t = norm(line).replace(/^([^\s\d:=]+)\s*[:=]\s*/, "$1 ");
      if (!t || /^[#＃]/.test(t)) return;
      var sp = t.indexOf(" ");
      if (sp < 0) { bad.push({ line: n + 1, why: "記号のあとに時刻か「休み」を書いてください" }); return; }
      var code = t.slice(0, sp), rest = t.slice(sp + 1).trim(), c = null, m;
      if (/^(休|休み|公休|お休み|休日|off)$/i.test(rest)) c = { kind: "off" };
      else if ((m = rest.match(/^(年次有給休暇|有給休暇|有休|有給|年休|有)(?:\s+(.*))?$/))) {
        var hl = m[2] ? parseLen(m[2]) : 0;
        if (m[2] && hl == null) { bad.push({ line: n + 1, why: "有休の時間が読めません（「有休 8時間」のように）" }); return; }
        c = { kind: "paid", paid: hl || 0 };
      } else {
        var r = parseRange(rest.replace(/\s*(休憩|休)\s*\S+$/, ""));
        if (!r) { bad.push({ line: n + 1, why: "時刻が読めません（「7:00-16:00 休憩60」のように）" }); return; }
        var bm = rest.match(/(?:休憩|休)\s*(\S+)$/), brk = 0;
        if (bm) { brk = parseLen(bm[1]); if (brk == null) { bad.push({ line: n + 1, why: "休憩の長さが読めません（「休憩60」「休憩1時間」）" }); return; } }
        else if (r.rest) { brk = parseLen(r.rest); if (brk == null) { bad.push({ line: n + 1, why: "時刻のあとが読めません：" + r.rest }); return; } }
        if (brk >= r.e - r.s) { bad.push({ line: n + 1, why: "休憩が勤務の長さ以上です" }); return; }
        c = { kind: "work", s: r.s, e: r.e, brk: brk };
      }
      var key = code.toLowerCase();
      if (!codes[key]) order.push(code);
      c.code = code; codes[key] = c;
    });
    return { codes: codes, order: order, bad: bad };
  }
  function directBreak(len, rule) {
    if (rule === "law") return len > 480 ? 60 : len > 360 ? 45 : 0;
    var n = +rule; return n > 0 && len > 360 ? n : 0;
  }
  // 1つのマス → {kind:'empty'|'work'|'off'|'paid'|'bad'}
  function parseCell(v, C, opt) {
    var t = norm(v);
    if (!t) return { kind: "empty" };
    var key = t.toLowerCase(), c = C.codes[key];
    if (c) return clone(c);
    var base = t.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim(); // 「早(研修)」→ 早
    if (base !== t && C.codes[base.toLowerCase()]) { c = clone(C.codes[base.toLowerCase()]); c.memo = t.slice(base.length).trim(); return c; }
    var r = parseRange(t);
    if (r && (!r.pre || C.codes[r.pre.toLowerCase()]) && !r.rest) {
      var len = r.e - r.s, b = directBreak(len, opt && opt.directBreak);
      return { kind: "work", code: r.pre || "時刻", s: r.s, e: r.e, brk: b, direct: true };
    }
    if (OFFW.test(t)) return { kind: "off", code: t };
    if (PAIDW.test(t)) return { kind: "paid", code: t, paid: 0 };
    return { kind: "bad", code: t };
  }
  function clone(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  // ---------- 見出しの日付 ----------
  // 「1」「1日」「1(日)」「11/1」「11/1(日)」「11月1日」「2026/11/01」「11/1/26」
  function dayHead(v) {
    var t = norm(v), m, wd = null;
    if (!t) return null;
    var w = t.match(/[(（]?\s*([日月火水木金土])(?:曜日?)?\s*[)）]?$/);
    if (w && t.length > w[0].length) { wd = WDC[w[1]]; t = t.slice(0, t.length - w[0].length).trim(); }
    t = t.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, "");
    if ((m = t.match(/^(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?$/))) return ok(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return ok(2000 + +m[3], +m[1], +m[2]);
    if ((m = t.match(/^(\d{1,2})[\/月](\d{1,2})日?$/))) return ok(null, +m[1], +m[2]);
    if ((m = t.match(/^(\d{1,2})日?$/))) return ok(null, null, +m[1]);
    return null;
    function ok(y, mo, d) {
      if (d < 1 || d > 31 || (mo != null && (mo < 1 || mo > 12))) return null;
      return { y: y, m: mo, d: d, wd: wd };
    }
  }
  function isWdCell(v) { var t = norm(v).replace(/[()（）曜日]/g, function (c) { return c === "日" ? c : ""; }); return /^[日月火水木金土]$/.test(t) ? WDC[t] : null; }

  var NAMEH = /^(氏名|名前|お名前|スタッフ|スタッフ名|従業員|従業員名|社員|職員|メンバー|名|name|staff)$/i;
  var GROUPH = /^(職種|部署|売場|持ち場|ポジション|役割|部門|チーム|グループ|資格|区分|雇用形態|所属|担当|position|role|team|group)$/i;
  var SKIPNAME = /^(合計|計|小計|総計|人数|出勤人数|出勤者数|人員|必要人数|備考|メモ|.*の人数|.*人数計?)$/;

  // 表の形を推定：見出しの行・日付の列・名前の列・曜日の行
  function findLayout(rows) {
    var best = null;
    rows.slice(0, 20).forEach(function (r, ri) {
      var hits = [];
      r.forEach(function (v, ci) { var h = dayHead(v); if (h) hits.push({ ci: ci, h: h }); });
      // 先頭の連続した塊（「No.」の列などを外す）：最初に「日」が現れる位置から、次の数字が続く所まで
      if (hits.length >= 5 && (!best || hits.length > best.hits.length)) best = { ri: ri, hits: hits };
    });
    if (!best) return { err: "日付が並んだ見出しの行が見つかりません（「1」「2」…や「11/1」「11/2」…を横に並べた行が必要です）" };
    // 左端に「No.」の数字の列があっても、日付は右に並んだ塊。塊の始まり：隣どうしの列が続く最長の並び
    var hs = best.hits, runs = [], cur = [hs[0]];
    for (var i = 1; i < hs.length; i++) { if (hs[i].ci - hs[i - 1].ci <= 2) cur.push(hs[i]); else { runs.push(cur); cur = [hs[i]]; } }
    runs.push(cur);
    runs.sort(function (a, b) { return b.length - a.length; });
    var dcols = runs[0], head = rows[best.ri], first = dcols[0].ci;
    // 曜日の行（見出しのすぐ下）
    var wdRow = -1, nx = rows[best.ri + 1];
    if (nx) { var c = 0; dcols.forEach(function (d) { if (isWdCell(nx[d.ci]) != null) c++; }); if (c >= dcols.length / 2) wdRow = best.ri + 1; }
    var dataFrom = (wdRow >= 0 ? wdRow : best.ri) + 1;
    // 名前の列：日付より左。見出しで決まらなければ、文字の多い列
    var nameCol = null, groupCol = null, cand = [];
    for (var ci = 0; ci < first; ci++) {
      var h = norm(head[ci]);
      if (NAMEH.test(h) && nameCol == null) nameCol = ci;
      else if (GROUPH.test(h) && groupCol == null) groupCol = ci;
      var txt = 0;
      rows.slice(dataFrom, dataFrom + 40).forEach(function (r) { var v = norm(r[ci]); if (v && !/^[\d.\-\/:]+$/.test(v)) txt++; });
      cand.push({ ci: ci, txt: txt });
    }
    if (nameCol == null) { var c2 = cand.filter(function (x) { return x.ci !== groupCol; }).sort(function (a, b) { return b.txt - a.txt || a.ci - b.ci; })[0]; nameCol = c2 && c2.txt ? c2.ci : null; }
    if (nameCol == null) return { err: "日付の列より左に、名前の列が見つかりません" };
    return { headRow: best.ri, wdRow: wdRow, dataFrom: dataFrom, dcols: dcols.map(function (d) { return d.ci; }), heads: dcols.map(function (d) { return d.h; }), nameCol: nameCol, groupCol: groupCol };
  }

  // 見出し → 日（1970/1/1 からの日数）。月の指定は {y,m}（最初の列の月）
  function headDays(heads, ym, wdRowCells) {
    var out = [], y = ym.y, m = ym.m, prev = null, prevD = null, mism = 0, bad = [];
    heads.forEach(function (h, i) {
      var day;
      if (h.y != null) { day = dayOf(h.y, h.m, h.d); y = h.y; m = h.m; }
      else if (h.m != null) {
        if (prev != null && h.m < m) y++;
        m = h.m; day = dayOf(y, m, h.d);
      } else {
        if (prevD != null && h.d <= prevD) { m++; if (m > 12) { m = 1; y++; } }
        day = dayOf(y, m, h.d);
      }
      var o = ymd(day);
      if (o.d !== h.d) bad.push(i); // 2/30 など
      var w = h.wd != null ? h.wd : (wdRowCells ? isWdCell(wdRowCells[i]) : null);
      if (w != null && w !== wdOf(day)) mism++;
      out.push(day); prev = day; prevD = h.d;
    });
    return { days: out, mism: mism, bad: bad };
  }
  // 曜日の書いてある見出しから、合う月を探す（今日の3か月前〜12か月後）
  function guessMonth(heads, wdRowCells, today) {
    var full = heads.filter(function (h) { return h.y != null; })[0];
    if (full) return { y: full.y, m: full.m, sure: true };
    var hasWd = heads.some(function (h, i) { return h.wd != null || (wdRowCells && isWdCell(wdRowCells[i]) != null); });
    var t = ymd(today), first = heads[0], cands = [];
    if (first.m != null) { [0, 1, -1].forEach(function (dy) { cands.push({ y: t.y + dy, m: first.m }); }); }
    else [0, 1, -1, 2, 3, -2, -3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (k) { var mm = t.m + k, yy = t.y; while (mm > 12) { mm -= 12; yy++; } while (mm < 1) { mm += 12; yy--; } cands.push({ y: yy, m: mm }); });
    if (!hasWd) return first.m != null ? { y: t.y, m: first.m, sure: false } : null;
    for (var i = 0; i < cands.length; i++) {
      var r = headDays(heads, cands[i], wdRowCells);
      if (!r.mism && !r.bad.length) return { y: cands[i].y, m: cands[i].m, sure: true };
    }
    return null;
  }

  // ---------- 必要な人数 ----------
  // 「早 2」「計 5」「土日 計 6」「平日 遅 2」「日 計 3」「12/31 計 3」。下の行が優先
  function parseNeed(text) {
    var rules = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line, n) {
      var t = norm(line); if (!t || /^[#＃]/.test(t)) return;
      var tk = t.split(" "), num = tk.pop(), m = String(num).match(/^(\d+)人?$/);
      if (!m || !tk.length) { bad.push({ line: n + 1, why: "「早 2」「土日 計 6」のように、最後に人数を書いてください" }); return; }
      var code = tk.pop(), spec = tk.join(""), wds = null, date = null, dm;
      if (spec) {
        if (spec === "平日") wds = [1, 2, 3, 4, 5];
        else if (spec === "土日" || spec === "土日祝") wds = [0, 6];
        else if ((dm = spec.match(/^(\d{1,2})[\/月](\d{1,2})日?$/))) date = { m: +dm[1], d: +dm[2] };
        else if (/^[日月火水木金土]+(曜日?)?$/.test(spec)) wds = spec.replace(/曜日?/, "").split("").map(function (c) { return WDC[c]; });
        else { bad.push({ line: n + 1, why: "「平日」「土日」「月水金」「12/31」のどれかで書いてください：" + spec }); return; }
      }
      rules.push({ code: /^(計|合計|全体|全員)$/.test(code) ? "*" : code.toLowerCase(), wds: wds, date: date, n: +m[1], line: n + 1 });
    });
    return { rules: rules, bad: bad };
  }
  function needFor(rules, day, code) {
    var o = ymd(day), w = wdOf(day), v = null, dated = null;
    rules.forEach(function (r) {
      if (r.code !== code) return;
      if (r.date) { if (r.date.m === o.m && r.date.d === o.d) dated = r.n; return; }
      if (!r.wds || r.wds.indexOf(w) >= 0) v = r.n;
    });
    return dated != null ? dated : v;
  }

  // ---------- 全体の計算 ----------
  function run(rows, opt) {
    opt = opt || {};
    var L = opt.layout || findLayout(rows);
    if (L.err) return { err: L.err };
    var C = parseCodes(opt.codes != null ? opt.codes : DEFAULT_CODES);
    var wdCells = L.wdRow >= 0 ? L.dcols.map(function (ci) { return rows[L.wdRow][ci]; }) : null;
    var today = opt.today || Math.floor(Date.now() / 86400000);
    var ym = opt.ym || guessMonth(L.heads, wdCells, today) || { y: ymd(today).y, m: ymd(today).m };
    var HD = headDays(L.heads, ym, wdCells), days = HD.days;
    var lim = { streak: opt.streak, gap: opt.gap, week: opt.week, day: opt.day, month: opt.month, minOff: opt.minOff };
    var weekStart = opt.weekStart == null ? 0 : opt.weekStart;
    var people = [], bad = [], recs = [], dupe = {}, seen = {}, groupSet = {}, cut = 0;
    var limit = opt.limit || Infinity;
    for (var ri = L.dataFrom; ri < rows.length; ri++) {
      var r = rows[ri], name = norm(r[L.nameCol]);
      if (!name || SKIPNAME.test(name)) continue;
      if (people.length >= limit) { cut++; continue; }
      if (seen[name]) { dupe[name] = (dupe[name] || 1) + 1; }
      seen[name] = true;
      var P = { name: name, label: dupe[name] ? name + "（" + dupe[name] + "）" : name, row: ri + 1, group: L.groupCol != null ? norm(r[L.groupCol]) : "", shifts: [], byCode: {}, work: 0, nWork: 0, nOff: 0, nEmpty: 0, nPaid: 0, paidMin: 0, nNight: 0, flags: [] };
      if (P.group) groupSet[P.group] = 1;
      L.dcols.forEach(function (ci, k) {
        if (HD.bad.indexOf(k) >= 0) return;
        var x = parseCell(r[ci], C, opt), day = days[k];
        x.day = day; x.col = k;
        if (x.kind === "bad") { bad.push({ name: P.label, day: day, v: x.code, row: ri + 1 }); return; }
        if (x.kind === "empty") { P.nEmpty++; return; }
        P.byCode[x.code] = (P.byCode[x.code] || 0) + 1;
        if (x.kind === "off") { P.nOff++; return; }
        if (x.kind === "paid") { P.nPaid++; P.paidMin += x.paid || 0; recs.push({ day: day, name: P.label, group: P.group, code: x.code, kind: "paid", paid: x.paid || 0 }); return; }
        x.S = day * 1440 + x.s; x.E = day * 1440 + x.e; x.work = x.e - x.s - x.brk;
        P.shifts.push(x); P.nWork++; P.work += x.work; if (x.e > 1440) P.nNight++;
        recs.push({ day: day, name: P.label, group: P.group, code: x.code, kind: "work", s: x.s, e: x.e, brk: x.brk, work: x.work, memo: x.memo || "" });
      });
      P.nRest = P.nOff + (opt.emptyIsWork ? 0 : P.nEmpty);
      check(P, lim, weekStart, days);
      people.push(P);
    }
    // 日ごとの人数
    var codesUsed = {}, codeOrder = [];
    C.order.forEach(function (c) { if (C.codes[c.toLowerCase()].kind === "work") codeOrder.push(c); });
    recs.forEach(function (x) { if (x.kind === "work" && codeOrder.indexOf(x.code) < 0) codeOrder.push(x.code); codesUsed[x.code] = 1; });
    codeOrder = codeOrder.filter(function (c) { return codesUsed[c]; });
    var N = parseNeed(opt.need || "");
    var group = opt.group || "";
    var daily = days.map(function (day) {
      var cnt = {}, tot = 0, paid = 0, workMin = 0;
      recs.forEach(function (x) {
        if (x.day !== day || (group && x.group !== group)) return;
        if (x.kind === "paid") { paid++; return; }
        cnt[x.code] = (cnt[x.code] || 0) + 1; tot++; workMin += x.work;
      });
      var short = [];
      codeOrder.concat(["*"]).forEach(function (c) {
        var need = needFor(N.rules, day, c === "*" ? "*" : c.toLowerCase());
        var have = c === "*" ? tot : (cnt[c] || 0);
        if (need != null && have < need) short.push({ code: c === "*" ? "計" : c, have: have, need: need });
      });
      return { day: day, cnt: cnt, tot: tot, paid: paid, workMin: workMin, short: short };
    });
    // 記号ごとの人の回数の列
    var personCodes = codeOrder.slice();
    var flags = [];
    people.forEach(function (P) { P.flags.forEach(function (f) { flags.push({ name: P.label, kind: f.kind, day: f.day, text: f.text }); }); });
    daily.forEach(function (d) { d.short.forEach(function (s) { flags.push({ name: "（日ごと）", kind: "人数", day: d.day, text: s.code + " " + s.have + "人（必要 " + s.need + "人）" }); }); });
    flags.sort(function (a, b) { return a.day - b.day || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    var dupes = Object.keys(dupe);
    return {
      layout: L, ym: ym, days: days, wdMismatch: HD.mism, badDays: HD.bad, codes: C, need: N, people: people, recs: recs,
      bad: bad, daily: daily, codeOrder: codeOrder, personCodes: personCodes, flags: flags, dupes: dupes, groups: Object.keys(groupSet).sort(), cut: cut
    };
  }

  // 1人の点検
  function check(P, lim, weekStart, days) {
    var sh = P.shifts.slice().sort(function (a, b) { return a.S - b.S; });
    var first = days.length ? Math.min.apply(null, days) : 0, last = days.length ? Math.max.apply(null, days) : 0;
    // 連続勤務（勤務の始まる日が続く日数）
    var wd = {}; sh.forEach(function (x) { wd[x.day] = 1; });
    var ds = Object.keys(wd).map(Number).sort(function (a, b) { return a - b; }), maxS = 0, i = 0;
    while (i < ds.length) {
      var j = i; while (j + 1 < ds.length && ds[j + 1] === ds[j] + 1) j++;
      var len = j - i + 1; if (len > maxS) maxS = len;
      if (lim.streak > 0 && len > lim.streak) P.flags.push({ kind: "連続勤務", day: ds[i], text: len + "日続けて勤務（" + dayLabel(ds[i], true) + "〜" + dayLabel(ds[j], true) + "）" + (ds[i] === first ? "。表の前の日も勤務なら、さらに長くなります" : "") });
      i = j + 1;
    }
    P.maxStreak = maxS;
    // 勤務の間隔・重なり
    var minGap = null;
    for (var k = 1; k < sh.length; k++) {
      var g = sh[k].S - sh[k - 1].E;
      if (g < 0) { P.flags.push({ kind: "重なり", day: sh[k].day, text: "前の勤務（" + dayLabel(sh[k - 1].day, true) + " " + sh[k - 1].code + "、" + hm(sh[k - 1].e) + "まで）と時間が重なっています" }); continue; }
      if (minGap == null || g < minGap) minGap = g;
      if (lim.gap > 0 && g < lim.gap * 60) P.flags.push({ kind: "勤務の間隔", day: sh[k].day, text: dayLabel(sh[k - 1].day, true) + " " + sh[k - 1].code + "（" + hm(sh[k - 1].e) + "まで）→ " + dayLabel(sh[k].day, true) + " " + sh[k].code + "（" + hm(sh[k].s) + "から）：間が " + hours(g) + "" });
    }
    P.minGap = minGap;
    // 1日の時間
    if (lim.day > 0) sh.forEach(function (x) { if (x.work > lim.day * 60) P.flags.push({ kind: "1日の時間", day: x.day, text: x.code + " " + hm(x.s) + "〜" + hm(x.e) + "（休憩 " + x.brk + "分）＝ " + hours(x.work) }); });
    // 週ごと（週の始まりの曜日から7日。勤務の始まる日で数える）
    var wk = {};
    sh.forEach(function (x) { var w0 = x.day - ((wdOf(x.day) - weekStart + 7) % 7); wk[w0] = (wk[w0] || 0) + x.work; });
    P.weeks = Object.keys(wk).map(Number).sort(function (a, b) { return a - b; }).map(function (w0) { return { start: w0, min: wk[w0], partial: w0 < first || w0 + 6 > last }; });
    P.maxWeek = P.weeks.reduce(function (a, w) { return Math.max(a, w.min); }, 0);
    if (lim.week > 0) P.weeks.forEach(function (w) { if (w.min > lim.week * 60) P.flags.push({ kind: "週の時間", day: w.start, text: dayLabel(w.start, true) + "からの週 " + hours(w.min) + (w.partial ? "（表の外の日を含む週。表の中の日だけで数えています）" : "") }); });
    if (lim.month > 0 && P.work > lim.month * 60) P.flags.push({ kind: "表の合計", day: first, text: "表の期間の合計 " + hours(P.work) + "（決めた上限 " + lim.month + "時間）" });
    if (lim.minOff > 0 && P.nRest < lim.minOff) P.flags.push({ kind: "休みの日数", day: first, text: "休み " + P.nRest + "日（決めた日数 " + lim.minOff + "日）" });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var API = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, parseClock: parseClock, parseRange: parseRange, parseLen: parseLen,
    parseCodes: parseCodes, parseCell: parseCell, dayHead: dayHead, findLayout: findLayout, headDays: headDays, guessMonth: guessMonth,
    parseNeed: parseNeed, needFor: needFor, run: run, toCSV: toCSV, hm: hm, hours: hours, dec: dec, dayLabel: dayLabel, ymd: ymd, wdOf: wdOf, dayOf: dayOf,
    WD: WD, DEFAULT_CODES: DEFAULT_CODES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.SHIFT = API;
})(this);
