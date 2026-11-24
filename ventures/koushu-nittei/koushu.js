/* 講習会の受講日程表 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var WD = "日月火水木金土";

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
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === "") q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
  }
  function norm(s) { s = String(s == null ? "" : s); if (s.normalize) s = s.normalize("NFKC"); return s.replace(/\s+/g, " ").trim(); }
  function key(s) { return norm(s).toLowerCase().replace(/[\s・･\-ー－_／\/()（）「」【】\[\]]/g, ""); }

  // ---------- 日付・時刻 ----------
  var DAY = 86400000;
  function dn(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / DAY); }
  function ymd(n) { var t = new Date(n * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() }; }
  function valid(y, m, d) { if (m < 1 || m > 12 || d < 1 || d > 31) return false; var t = ymd(dn(y, m, d)); return t.y === y && t.m === m && t.d === d; }
  function md(n) { var t = ymd(n); return t.m + "/" + t.d + "(" + WD[t.w] + ")"; }
  function iso(n) { var t = ymd(n); return t.y + "-" + (t.m < 10 ? "0" : "") + t.m + "-" + (t.d < 10 ? "0" : "") + t.d; }
  function hm(x) { if (x == null) return ""; return Math.floor(x / 60) + ":" + (x % 60 < 10 ? "0" : "") + (x % 60); }
  function tspan(s) { return s.s == null ? "時刻なし" : hm(s.s) + (s.e != null ? "〜" + hm(s.e) : ""); }
  // 年のない日付は、始めの月より前の月なら翌年
  function yearOf(m, base) { return m < base.m ? base.y + 1 : base.y; }

  // 1行の日程：「講座名 日付… 時刻〜時刻 [定員N] [場所・講師]」
  var DATE1 = "(?:(\\d{4})\\s*[\\/\\-\\.年]\\s*)?(\\d{1,2})\\s*[\\/\\.月]\\s*(\\d{1,2})\\s*日?(?:\\s*[(（][日月火水木金土]曜?日?[)）])?";
  var TIME1 = "(\\d{1,2})\\s*(?:[:：]\\s*(\\d{2})|時\\s*(?:(\\d{1,2})\\s*分|(半))?)";
  function parseTime(s) {
    var re = new RegExp("^" + TIME1), m = s.match(re);
    if (!m) return null;
    var h = +m[1], mi = m[2] != null ? +m[2] : m[3] != null ? +m[3] : m[4] ? 30 : 0;
    if (h > 24 || mi > 59) return { bad: true, len: m[0].length };
    return { v: h * 60 + mi, len: m[0].length };
  }
  function parseScheduleLine(line, base) {
    var s = norm(String(line).replace(/\t/g, " ")).replace(/^[・\-*]\s*/, "");
    var res = { course: "", dates: [], s: null, e: null, cap: 0, place: "", bad: "" };
    var reD = new RegExp(DATE1), m0 = s.match(reD);
    if (!m0) { res.bad = "日付が読めません（12/25 のように書いてください）"; return res; }
    res.course = norm(s.slice(0, m0.index).replace(/[:：,、]\s*$/, ""));
    var rest = s.slice(m0.index), dates = [], last = null, exclude = [];
    // 「日曜・土日を除く」
    rest = rest.replace(/[(（]?\s*((?:[日月火水木金土]曜?日?\s*[・、,]?\s*)+)(?:は)?\s*(?:を)?除く\s*[)）]?/g, function (_, ws) { ws.replace(/[日月火水木金土]/g, function (w) { exclude.push(WD.indexOf(w)); }); return " "; });
    rest = rest.replace(/[(（]?\s*祝日?(?:は)?\s*(?:を)?除く\s*[)）]?/g, function () { res.noteHol = true; return " "; });
    var reStart = new RegExp("^\\s*" + DATE1), reRange = new RegExp("^\\s*(?:[~〜～]|から|ー|-)\\s*(?:" + DATE1 + "|(\\d{1,2})\\s*日?(?![\\d:：時]))"), reMore = new RegExp("^\\s*[・、,，]\\s*(?:" + DATE1 + "|(\\d{1,2})\\s*日?(?![\\d:：時\\/月]))");
    function mk(y, mo, d) {
      var yy = y ? +y : yearOf(+mo, base);
      if (!valid(yy, +mo, +d)) return null;
      return dn(yy, +mo, +d);
    }
    var m = rest.match(reStart);
    while (m) {
      var n = mk(m[1], m[2], m[3]);
      if (n == null) { res.bad = "存在しない日付です（" + norm(m[0]) + "）"; return res; }
      last = { y: ymd(n).y, m: ymd(n).m }; rest = rest.slice(m[0].length);
      var r = rest.match(reRange);
      if (r) {
        var b = r[3] != null ? mk(r[1], r[2], r[3]) : (function () { var d = +r[4], mm = last.m, yy = last.y; return valid(yy, mm, d) ? dn(yy, mm, d) : null; })();
        if (b == null) { res.bad = "存在しない日付です（" + norm(r[0]) + "）"; return res; }
        if (b < n) b = mk(ymd(b).y + 1, ymd(b).m, ymd(b).d);
        if (b - n > 62) { res.bad = "期間が長すぎます（62日まで）"; return res; }
        for (var k = n; k <= b; k++) dates.push(k);
        rest = rest.slice(r[0].length);
      } else dates.push(n);
      // 「・26・27」「、1/5」
      var more;
      while ((more = rest.match(reMore))) {
        var n2;
        if (more[3] != null) n2 = mk(more[1], more[2], more[3]);
        else { var dd = +more[4]; n2 = valid(last.y, last.m, dd) ? dn(last.y, last.m, dd) : null; }
        if (n2 == null) { res.bad = "存在しない日付です（" + norm(more[0]) + "）"; return res; }
        if (n2 < dates[dates.length - 1] && more[3] == null) { res.bad = "日付の順が読めません（" + norm(more[0]) + "）"; return res; }
        rest = rest.slice(more[0].length);
        var r2 = rest.match(reRange);
        if (r2) {
          var b2 = r2[3] != null ? mk(r2[1], r2[2], r2[3]) : (valid(ymd(n2).y, ymd(n2).m, +r2[4]) ? dn(ymd(n2).y, ymd(n2).m, +r2[4]) : null);
          if (b2 == null || b2 < n2 || b2 - n2 > 62) { res.bad = "期間が読めません（" + norm(r2[0]) + "）"; return res; }
          for (var k2 = n2; k2 <= b2; k2++) dates.push(k2);
          rest = rest.slice(r2[0].length);
        } else dates.push(n2);
        last = { y: ymd(n2).y, m: ymd(n2).m };
      }
      m = rest.match(new RegExp("^\\s*[・、,，]?\\s*" + DATE1));
    }
    if (exclude.length) dates = dates.filter(function (n) { return exclude.indexOf(ymd(n).w) < 0; });
    var seen = {}; dates = dates.filter(function (n) { if (seen[n]) return false; seen[n] = 1; return true; }).sort(function (a, b) { return a - b; });
    if (!dates.length) { res.bad = "日付が残りません（除く曜日を確かめてください）"; return res; }
    res.dates = dates;
    // 時刻
    rest = rest.replace(/^\s*[,、]?\s*/, "");
    var t1 = parseTime(rest);
    if (t1) {
      if (t1.bad) { res.bad = "時刻が読めません"; return res; }
      res.s = t1.v; rest = rest.slice(t1.len);
      var mt = rest.match(/^\s*(?:[~〜～\-ー－]|から)\s*/);
      if (mt) {
        var t2 = parseTime(rest.slice(mt[0].length));
        if (!t2 || t2.bad) { res.bad = "終わりの時刻が読めません"; return res; }
        res.e = t2.v; rest = rest.slice(mt[0].length + t2.len);
      } else {
        var du = rest.match(/^\s*[(（]?\s*(\d{1,3})\s*分(?:間)?\s*[)）]?/);
        if (du) { res.e = res.s + +du[1]; rest = rest.slice(du[0].length); }
      }
      if (res.e != null && res.e <= res.s) { res.bad = "終わりの時刻が始まりより前です"; return res; }
    }
    // 定員
    rest = rest.replace(/(?:定員|上限)\s*[:：]?\s*(\d{1,4})\s*(?:名|人)?/, function (_, c) { res.cap = +c; return " "; });
    res.place = norm(rest.replace(/^[,、:：\s]+/, ""));
    if (!res.course) { res.bad = "講座名がありません（行の先頭に講座名を書いてください）"; return res; }
    return res;
  }
  // 日程の一覧 → 講座 { name, key, sessions:[{n,s,e,place}], cap, lines:[] }
  function parseSchedule(text, base) {
    var courses = [], byKey = {}, bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line, li) {
      var s = norm(line);
      if (!s || /^#/.test(s)) return;
      if (li === 0 && /^(講座|科目|コース|講習)(名)?\s/.test(s) && !new RegExp(DATE1).test(s)) return; // 見出し行
      var r = parseScheduleLine(line, base);
      if (r.bad) { bad.push({ line: li + 1, text: line, why: r.bad }); return; }
      var k = key(r.course), c = byKey[k];
      if (!c) { c = byKey[k] = { name: r.course, key: k, sessions: [], cap: 0, lines: [] }; courses.push(c); }
      if (r.cap) c.cap = r.cap;
      c.lines.push(li + 1);
      r.dates.forEach(function (n) { c.sessions.push({ n: n, s: r.s, e: r.e, place: r.place, line: li + 1 }); });
    });
    courses.forEach(function (c) { c.sessions.sort(function (a, b) { return a.n - b.n || (a.s == null ? -1 : a.s) - (b.s == null ? -1 : b.s); }); });
    return { courses: courses, byKey: byKey, bad: bad };
  }

  // ---------- 申込の一覧 ----------
  var NO = /^(×|x|✕|✖|-|－|ー|―|0|0回|なし|無|無し|いいえ|no|false|不可|欠|未)$/i;
  function isMark(v) { v = norm(v); return v !== "" && !NO.test(v); }
  var PAT = {
    name: /^(生徒|児童|受講者|氏名|名前|お名前|生徒名|氏名\(漢字\)|なまえ|name)$/i,
    grade: /^(学年|組|クラス|学校|学年\/組|grade)$/i,
    course: /^(講座|講座名|申込講座|受講講座|科目|教科|コース|申込|申し込み|受講|course)$/i
  };
  function findCourse(sch, v) {
    var k = key(v); if (!k) return null;
    if (sch.byKey[k]) return sch.byKey[k];
    // 見出しが「中3数学（12/25〜）」のように講座名を含むとき（いちばん長いもの）
    var best = null;
    sch.courses.forEach(function (c) { if (c.key.length >= 2 && k.indexOf(c.key) >= 0 && (!best || c.key.length > best.key.length)) best = c; });
    return best;
  }
  function guessCols(headers, rows, sch) {
    var g = { name: null, grade: null, course: null, courses: [] }, used = {};
    headers.forEach(function (h, i) { var x = norm(h); if (g.name == null && PAT.name.test(x)) { g.name = i; used[i] = 1; } });
    if (g.name == null) headers.forEach(function (h, i) { if (g.name == null && /名/.test(h) && !/講座|科目|コース|学校/.test(h)) { g.name = i; used[i] = 1; } });
    headers.forEach(function (h, i) { if (!used[i] && g.grade == null && PAT.grade.test(norm(h))) { g.grade = i; used[i] = 1; } });
    // 見出しが講座名なら「生徒×講座」の表
    headers.forEach(function (h, i) { if (!used[i] && findCourse(sch, h)) g.courses.push(i); });
    if (!g.courses.length) headers.forEach(function (h, i) { if (!used[i] && g.course == null && PAT.course.test(norm(h))) { g.course = i; used[i] = 1; } });
    if (!g.courses.length && g.course == null) {
      // 見出しが講座名でなくても、○ばかりの列は講座の列とみなす
      headers.forEach(function (h, i) {
        if (used[i]) return;
        var f = rows.map(function (r) { return norm(r[i]); }).filter(Boolean);
        if (f.length && f.every(function (v) { return v.length <= 3 && (/^[○◯●◎✓✔レ〇oO1申済]$/.test(v) || NO.test(v)); })) g.courses.push(i);
      });
    }
    if (g.name == null) for (var i = 0; i < headers.length; i++) if (!used[i] && g.courses.indexOf(i) < 0) { g.name = i; break; }
    g.mode = g.courses.length ? "matrix" : "long";
    return g;
  }
  function splitCourses(v, sch) {
    var parts = norm(v).split(/\s*[、,，\/／;；\n]\s*/).filter(Boolean), out = [];
    parts.forEach(function (p) {
      if (sch.byKey[key(p)] || !/[・･]/.test(p)) { out.push(p); return; }
      var q = p.split(/\s*[・･]\s*/).filter(Boolean);
      if (q.every(function (x) { return findCourse(sch, x); })) out = out.concat(q); else out.push(p);
    });
    return out;
  }

  // ---------- 計算 ----------
  // o: { cols, schedule(text), base:{y,m}, rowBase, limit }
  function run(headers, rows, o) {
    var sch = parseSchedule(o.schedule, o.base), C = o.cols, checks = [];
    var students = [], byName = {}, unknown = {}, cut = 0;
    rows.forEach(function (r, i) {
      var name = norm(r[C.name]);
      if (!name || /^(合計|計|小計|total)$/i.test(name)) return;
      var grade = C.grade != null ? norm(r[C.grade]) : "";
      var k = key(name) + "|" + key(grade), st = byName[k];
      if (!st) {
        if (students.length >= o.limit) { cut++; return; }
        st = byName[k] = { name: name, grade: grade, row: i + o.rowBase, rows: [], courses: [], ckeys: {} };
        students.push(st);
      } else if (C.mode === "matrix") checks.push({ row: i + o.rowBase, name: name, lv: "w", why: "同じ名前の行が " + st.row + " 行目にもあります（申込をまとめました）" });
      st.rows.push(i + o.rowBase);
      var raws = [];
      if (C.mode === "matrix") C.courses.forEach(function (ci) { if (isMark(r[ci])) raws.push({ text: headers[ci], col: ci }); });
      else if (C.course != null) splitCourses(r[C.course], sch).forEach(function (t) { raws.push({ text: t }); });
      raws.forEach(function (x) {
        var c = findCourse(sch, x.text);
        if (!c) { var uk = key(x.text); (unknown[uk] = unknown[uk] || { text: x.text, rows: [] }).rows.push(i + o.rowBase); return; }
        if (st.ckeys[c.key]) { if (C.mode !== "matrix") checks.push({ row: i + o.rowBase, name: name, lv: "w", why: "「" + c.name + "」の申込が2回あります（1回にしました）" }); return; }
        st.ckeys[c.key] = 1; st.courses.push(c);
      });
    });
    // 生徒ごとのコマ
    var conflicts = [];
    students.forEach(function (st) {
      var ss = [];
      st.courses.forEach(function (c) { c.sessions.forEach(function (s) { ss.push({ n: s.n, s: s.s, e: s.e, place: s.place, course: c.name }); }); });
      ss.sort(function (a, b) { return a.n - b.n || (a.s == null ? -1 : a.s) - (b.s == null ? -1 : b.s) || a.course.localeCompare(b.course, "ja"); });
      st.sessions = ss;
      st.dayN = ss.reduce(function (a, s, i) { return a + (i === 0 || ss[i - 1].n !== s.n ? 1 : 0); }, 0);
      for (var i = 0; i < ss.length; i++) for (var j = i + 1; j < ss.length && ss[j].n === ss[i].n; j++) {
        var a = ss[i], b = ss[j], kind = null;
        if (a.course === b.course) continue;
        if (a.s != null && b.s != null) {
          var ae = a.e != null ? a.e : a.s + 1, be = b.e != null ? b.e : b.s + 1;
          if (a.s < be && b.s < ae) kind = "時間が重なります";
        } else kind = "同じ日（時刻なしのため重なりは分かりません）";
        if (kind) { a.clash = b.clash = true; conflicts.push({ name: st.name, grade: st.grade, row: st.row, n: a.n, a: a, b: b, why: kind, hard: kind === "時間が重なります" }); }
      }
      if (!st.courses.length) checks.push({ row: st.row, name: st.name, lv: "w", why: "申込のある講座がありません" });
    });
    // 講座ごと
    sch.courses.forEach(function (c) {
      c.students = students.filter(function (st) { return st.ckeys[c.key]; });
      if (c.cap && c.students.length > c.cap) checks.push({ row: "", name: c.name, lv: "e", why: "定員 " + c.cap + " 名に対して申込が " + c.students.length + " 名です（" + (c.students.length - c.cap) + " 名多い）" });
    });
    // 同じ場所・同じ時間の講座
    var places = [], all = [];
    sch.courses.forEach(function (c) { c.sessions.forEach(function (s) { if (s.place && s.s != null) all.push({ c: c, s: s }); }); });
    all.sort(function (p, q) { return p.s.n - q.s.n || p.s.s - q.s.s; });
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length && all[j].s.n === all[i].s.n; j++) {
      var A = all[i], B = all[j];
      if (A.c === B.c || key(A.s.place) !== key(B.s.place)) continue;
      var ae = A.s.e != null ? A.s.e : A.s.s + 1, be = B.s.e != null ? B.s.e : B.s.s + 1;
      if (A.s.s < be && B.s.s < ae) places.push({ n: A.s.n, place: A.s.place, a: A.c.name + " " + tspan(A.s), b: B.c.name + " " + tspan(B.s) });
    }
    // 日ごと
    var dayMap = {};
    sch.courses.forEach(function (c) { c.sessions.forEach(function (s) { (dayMap[s.n] = dayMap[s.n] || []).push({ course: c.name, s: s.s, e: s.e, place: s.place, people: c.students.length }); }); });
    var days = Object.keys(dayMap).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      var L = dayMap[n].sort(function (p, q) { return (p.s == null ? -1 : p.s) - (q.s == null ? -1 : q.s) || p.course.localeCompare(q.course, "ja"); });
      var names = {}; students.forEach(function (st) { if (st.sessions.some(function (s) { return s.n === n; })) names[st.name + "|" + st.grade] = 1; });
      return { n: n, list: L, people: Object.keys(names).length };
    });
    var unk = Object.keys(unknown).map(function (k) { return unknown[k]; });
    sch.courses.forEach(function (c) { if (!c.students.length) checks.push({ row: "", name: c.name, lv: "w", why: "この講座の申込がありません（申込の表の講座名と同じ書き方か確かめてください）" }); });
    var slots = students.reduce(function (a, st) { return a + st.sessions.length; }, 0);
    return { courses: sch.courses, schBad: sch.bad, students: students, conflicts: conflicts, places: places, days: days, unknown: unk, checks: checks, cut: cut, slots: slots };
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n") + "\r\n";
  }

  var K = { WD: WD, decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, key: key, dn: dn, ymd: ymd, md: md, iso: iso, hm: hm, tspan: tspan, isMark: isMark,
    parseScheduleLine: parseScheduleLine, parseSchedule: parseSchedule, guessCols: guessCols, splitCourses: splitCourses, findCourse: findCourse, run: run, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.KOUSHU = K;
})(typeof window !== "undefined" ? window : globalThis);
