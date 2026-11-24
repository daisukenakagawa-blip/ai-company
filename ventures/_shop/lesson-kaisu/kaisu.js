/* 月ごとのレッスン日と回数 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var E = root.Eigyo || (typeof require !== "undefined" ? require("./eigyo.js") : null);
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
  function key(s) { return norm(s).toLowerCase().replace(/[\s・･\-ー－_／\/()（）「」【】]/g, ""); }

  // ---------- 日付 ----------
  function dn(y, m, d) { return E.dn(y, m, d); }
  function ymd(n) { return E.ymd(n); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function md(n) { var t = ymd(n); return t.m + "/" + t.d + "(" + WD[t.w] + ")"; }
  function iso(n) { var t = ymd(n); return t.y + "-" + (t.m < 10 ? "0" : "") + t.m + "-" + (t.d < 10 ? "0" : "") + t.d; }
  // 期間の月の一覧 [{y,m,a,b}]（a・b は月初・月末の通し日）
  function months(y, m, k) {
    var out = [];
    for (var i = 0; i < k; i++) { var yy = y + Math.floor((m - 1 + i) / 12), mm = (m - 1 + i) % 12 + 1; out.push({ y: yy, m: mm, a: dn(yy, mm, 1), b: dn(yy, mm, dim(yy, mm)) }); }
    return out;
  }
  // 年のない「12/24」は、期間の中（なければ期間に近い年）にする
  function oneDate(s, P) {
    s = norm(s).replace(/\s*[(（][日月火水木金土]曜?日?[)）]\s*$/, "");
    var m;
    if ((m = s.match(/^(\d{1,2})\s*[\/\.月]\s*(\d{1,2})\s*日?$/))) {
      var mo = +m[1], d = +m[2], best = null, bd = 1e9;
      for (var y = ymd(P.a).y - 1; y <= ymd(P.b).y + 1; y++) {
        if (mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) continue;
        var n = dn(y, mo, d), dist = n < P.a ? P.a - n : n > P.b ? n - P.b : 0;
        if (dist < bd) { bd = dist; best = n; }
      }
      return best;
    }
    var r = E.parseDate(s);
    return r.n == null ? null : r.n;
  }
  // 休講日・追加の日の一覧。1行に「日付 [対象]」「日付〜日付 [対象]」。対象はコース・組・名前・曜日
  function parseDayLines(text, P, needTarget) {
    var items = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line, li) {
      var raw = line, s = norm(line).replace(/^[・\-*]\s*/, "");
      if (!s || /^#/.test(s)) return;
      var m = s.match(/^((?:\d{4}\s*[\/\-\.年]\s*)?\d{1,2}\s*[\/\.\-月]\s*\d{1,2}\s*日?(?:\s*[(（][日月火水木金土]曜?日?[)）])?)(?:\s*(?:[~〜～]|から|-(?=\s*(?:\d{4}\s*[\/年]\s*)?\d{1,2}\s*[\/\.月]))\s*((?:\d{4}\s*[\/\-\.年]\s*)?\d{1,2}\s*[\/\.\-月]\s*\d{1,2}\s*日?(?:\s*[(（][日月火水木金土]曜?日?[)）])?))?\s*(?:[:：,、]\s*)?(.*)$/);
      if (!m) { bad.push({ line: li + 1, text: raw, why: "日付が読めません" }); return; }
      var a = oneDate(m[1].replace(/年/, "/").replace(/月/, "/").replace(/日/, ""), P), b = m[2] ? oneDate(m[2].replace(/年/, "/").replace(/月/, "/").replace(/日/, ""), P) : a;
      if (a == null || b == null) { bad.push({ line: li + 1, text: raw, why: "存在しない日付です" }); return; }
      if (b < a || b - a > 120) { bad.push({ line: li + 1, text: raw, why: "期間の向きが逆か、長すぎます（120日まで）" }); return; }
      var rest = norm(m[3] || ""), target = "", note = "";
      var mm = rest.match(/^(.*?)\s*[(（](.*)[)）]$/);
      if (mm) { rest = mm[1]; note = mm[2]; }
      var tm = rest.match(/^(?:対象\s*[:：=]?\s*)?(.+?)(?:\s*(?:だけ|のみ))$/);
      if (tm) target = tm[1]; else target = rest;
      if (/^(全員|全体|全部|すべて|教室|休講|休み|お休み|休業|振替|振替日|追加)$/.test(target)) { note = note || target; target = ""; }
      if (needTarget && !target) { bad.push({ line: li + 1, text: raw, why: "誰のレッスン日か（曜日・コース・組・名前）を、日付のあとに書いてください" }); return; }
      for (var n = a; n <= b; n++) items.push({ n: n, target: target, tkey: key(target), wd: /^[日月火水木金土]曜?日?$/.test(target) ? WD.indexOf(target[0]) : -1, note: note, line: li + 1 });
    });
    return { items: items, bad: bad };
  }

  // ---------- 曜日の読み取り ----------
  var EN = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  // 戻り値 {days:[{w, nth:null|[1,3]}], bad, why}
  function parseWeekdays(v) {
    var s = norm(v), days = [], seen = {};
    if (!s) return { days: [], empty: true };
    if (/隔週/.test(s)) return { days: [], bad: true, why: "隔週は読めません（「第1・3土」のように書くか、休講日・追加の日で調整してください）" };
    s = s.replace(/\d{1,2}\s*[:：]\s*\d{2}(\s*[~〜～\-]\s*\d{1,2}\s*[:：]\s*\d{2})?/g, " ")
      .replace(/\d{1,2}\s*時(\s*\d{1,2}\s*分)?(半)?(\s*[~〜～\-]\s*\d{1,2}\s*時(\s*\d{1,2}\s*分)?)?/g, " ")
      .replace(/\d+\s*分/g, " ").replace(/毎週|毎月|月\s*\d+\s*回|週\s*\d+\s*回|祝日|祝|曜日|曜|から|より|〜|~|～/g, function (x) { return x === "曜日" || x === "曜" ? "曜" : " "; });
    function add(w, nth) {
      var k = w + ":" + (nth ? nth.join(",") : "");
      if (seen[k]) return; seen[k] = 1; days.push({ w: w, nth: nth });
    }
    // 第1・3土、第2・第4水
    s = s.replace(/第\s*([1-5](?:\s*[・,、\/]\s*第?\s*[1-5])*)\s*([日月火水木金土])曜?/g, function (_, ns, w) {
      var nth = ns.match(/[1-5]/g).map(Number).sort(); add(WD.indexOf(w), nth.filter(function (x, i) { return nth.indexOf(x) === i; })); return " ";
    });
    s = s.replace(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?/gi, function (_, w) { add(EN[w.toLowerCase()], null); return " "; });
    s = s.replace(/([日月火水木金土])曜?/g, function (_, w) { add(WD.indexOf(w), null); return " "; });
    var left = s.replace(/[\s・,、\/／&＆+＋|｜()（）]+/g, "");
    if (!days.length) return { days: [], bad: true, why: "曜日が読めません" };
    return { days: days, left: left };
  }

  // ---------- 列の推定 ----------
  var PAT = {
    name: /^(氏名|名前|生徒|生徒名|児童|会員|会員名|お名前|受講者|受講生|子ども|子供)(の?名前|名|氏名)?$/,
    wd: /(曜日|曜|レッスン日|受講日|通う日|日時|時間割|枠)/,
    course: /(コース|クラス|講座|科目|種目|プラン|レッスン|教科|楽器)/,
    group: /^(組|班|学年|教室|校舎|担当|講師|先生|クラス分け|時間帯)$/,
    join: /(入会|入塾|入校|開始日|受講開始)/,
    leave: /(退会|退塾|退校|終了日|受講終了)/
  };
  function guessCols(headers, rows) {
    var g = {}, used = {};
    function pick(k, test) { for (var i = 0; i < headers.length; i++) { if (used[i]) continue; if (test(norm(headers[i]), i)) { g[k] = i; used[i] = 1; return; } } }
    pick("name", function (h) { return PAT.name.test(h); });
    pick("join", function (h) { return PAT.join.test(h); });
    pick("leave", function (h) { return PAT.leave.test(h); });
    pick("wd", function (h) { return PAT.wd.test(h) && !/回数/.test(h); });
    pick("course", function (h) { return PAT.course.test(h) && !/回数/.test(h); });
    pick("group", function (h) { return PAT.group.test(h); });
    if (g.name == null) pick("name", function (h) { return /名/.test(h) && !/コース|クラス/.test(h); });
    if (g.wd == null) pick("wd", function (h, i) {
      var f = rows.filter(function (r) { return norm(r[i]) !== ""; }), ok = f.filter(function (r) { return !parseWeekdays(r[i]).bad; });
      return f.length && ok.length >= f.length * 0.8 && f.every(function (r) { return norm(r[i]).length <= 20; });
    });
    if (g.name == null) pick("name", function () { return true; });
    return g;
  }

  // ---------- 計算 ----------
  /* o: {cols, y, m, k(月数), off(text), add(text), holidays, nenmatsu, fifth, cap, useJoin, rowBase, limit} */
  function run(headers, rows, o) {
    var C = o.cols, MS = months(o.y, o.m, o.k || 1), P = { a: MS[0].a, b: MS[MS.length - 1].b };
    var OFF = parseDayLines(o.off, P, false), ADD = parseDayLines(o.add, P, true);
    var checks = [], lines = [], cut = 0, rowBase = o.rowBase || 2;
    function holi(n) {
      var t = ymd(n);
      if (o.nenmatsu && ((t.m === 12 && t.d >= 29) || (t.m === 1 && t.d <= 3))) return "年末年始";
      if (o.holidays) { var h = E.holidayName(n); if (h) return h; }
      return null;
    }
    // 全員に共通の休み（対象なし）
    var offAll = {}; OFF.items.forEach(function (it) { if (!it.target) offAll[it.n] = it.note || "休講日"; });
    var offT = OFF.items.filter(function (it) { return it.target; });
    var usedOffT = {}, usedAdd = {};
    function matchT(it, L) {
      if (it.wd >= 0) return L.days.some(function (d) { return d.w === it.wd; });
      return it.tkey && (it.tkey === key(L.course) || it.tkey === key(L.group) || it.tkey === key(L.name));
    }
    rows.forEach(function (r, i) {
      var name = C.name != null ? norm(r[C.name]) : "";
      var row = i + rowBase;
      if (!name) return;
      if (/^(合計|計|小計|総計)$/.test(name)) return;
      if (lines.length >= (o.limit || Infinity)) { cut++; return; }
      var L = { row: row, name: name, course: C.course != null ? norm(r[C.course]) : "", group: C.group != null ? norm(r[C.group]) : "", wdText: C.wd != null ? norm(r[C.wd]) : "", src: r, notes: [] };
      var W = parseWeekdays(L.wdText);
      L.days = W.days;
      if (W.empty) { L.bad = true; checks.push({ row: row, name: name, lv: "e", why: "曜日が空欄です（0回にしています）" }); }
      else if (W.bad) { L.bad = true; checks.push({ row: row, name: name, lv: "e", why: W.why + "：「" + L.wdText + "」（0回にしています）" }); }
      else if (W.left && /[^\d]/.test(W.left) && W.left.length > 0) L.notes.push("曜日の欄の「" + W.left + "」は読み飛ばしました");
      L.join = null; L.leave = null;
      if (o.useJoin && C.join != null && norm(r[C.join])) { var j = E.parseDate(norm(r[C.join])); if (j.n == null) checks.push({ row: row, name: name, lv: "w", why: "入会日が読めません：「" + norm(r[C.join]) + "」（初めから数えています）" }); else L.join = j.n; }
      if (o.useJoin && C.leave != null && norm(r[C.leave])) { var q = E.parseDate(norm(r[C.leave])); if (q.n == null) checks.push({ row: row, name: name, lv: "w", why: "退会日が読めません：「" + norm(r[C.leave]) + "」（最後まで数えています）" }); else L.leave = q.n; }
      L.months = MS.map(function (M) {
        var lessons = [], offs = [], before = 0, after = 0;
        for (var n = M.a; n <= M.b; n++) {
          var t = ymd(n), nth = Math.ceil(t.d / 7);
          var hit = L.days.some(function (d) { return d.w === t.w && (!d.nth || d.nth.indexOf(nth) >= 0); });
          var adds = ADD.items.filter(function (it) { return it.n === n && matchT(it, L); });
          if (!hit && !adds.length) continue;
          if (L.join != null && n < L.join) { before++; continue; }
          if (L.leave != null && n > L.leave) { after++; continue; }
          if (adds.length) { adds.forEach(function (it) { usedAdd[it.line] = 1; }); lessons.push({ n: n, add: true, note: adds[0].note || "追加の日" }); continue; }
          var why = offAll[n] || null;
          if (!why) { var ot = offT.filter(function (it) { return it.n === n && matchT(it, L); }); if (ot.length) { why = ot[0].note || "休講日（" + ot[0].target + "）"; usedOffT[ot[0].line] = 1; } }
          if (!why) why = holi(n);
          if (!why && o.fifth && nth === 5) why = "第5週";
          if (why) offs.push({ n: n, why: why }); else lessons.push({ n: n });
        }
        lessons.sort(function (p, q) { return p.n - q.n; });
        var capped = [];
        if (o.cap > 0 && lessons.length > o.cap) { capped = lessons.splice(o.cap); capped.forEach(function (x) { offs.push({ n: x.n, why: "月" + o.cap + "回まで" }); }); offs.sort(function (p, q) { return p.n - q.n; }); }
        var st = "";
        if (L.join != null && L.join > M.b) st = "入会前";
        else if (L.leave != null && L.leave < M.a) st = "退会";
        else if (before) st = "途中から（入会 " + md(L.join) + "）";
        else if (after) st = "途中まで（退会 " + md(L.leave) + "）";
        return { y: M.y, m: M.m, count: lessons.length, lessons: lessons, offs: offs, capped: capped.length, status: st };
      });
      L.total = L.months.reduce(function (a, x) { return a + x.count; }, 0);
      if (!L.bad) L.months.forEach(function (x) {
        if (!x.count && !/入会前|退会/.test(x.status)) checks.push({ row: row, name: name, lv: "w", why: x.m + "月のレッスンが0回です（休講日・入会日・退会日を確かめてください）" });
        if (x.capped) checks.push({ row: row, name: name, lv: "i", why: x.m + "月は上限の" + o.cap + "回を超えた " + x.capped + " 回を外しました" });
      });
      lines.push(L);
    });
    // 同じ名前・同じコースの行
    var dup = {};
    lines.forEach(function (L) { var k = key(L.name) + "|" + key(L.course); if (dup[k]) checks.push({ row: L.row, name: L.name, lv: "w", why: "同じ名前・同じコースの行が " + dup[k] + " 行目にもあります（両方数えています）" }); else dup[k] = L.row; });
    // 使われなかった対象つきの行
    var warnLines = [];
    OFF.items.forEach(function (it) { if (it.target && !usedOffT[it.line] && !lines.some(function (L) { return matchT(it, L); })) warnLines.push({ kind: "休講日", line: it.line, why: "「" + it.target + "」に当たる人がいません（コース・組・名前・曜日と同じ書き方にしてください）" }); });
    ADD.items.forEach(function (it) { if (!usedAdd[it.line] && !lines.some(function (L) { return matchT(it, L); })) warnLines.push({ kind: "追加の日", line: it.line, why: "「" + it.target + "」に当たる人がいません（コース・組・名前・曜日と同じ書き方にしてください）" }); });
    var wl = {}; warnLines = warnLines.filter(function (w) { var k = w.kind + w.line; if (wl[k]) return false; wl[k] = 1; return true; });
    // 1人ごと（同じ名前の行をまとめる）
    var per = [], pm = {};
    lines.forEach(function (L) {
      var k = key(L.name);
      if (!pm[k]) { pm[k] = { name: L.name, group: L.group, lines: [], months: MS.map(function () { return 0; }), total: 0 }; per.push(pm[k]); }
      var p = pm[k]; p.lines.push(L); L.months.forEach(function (x, i) { p.months[i] += x.count; }); p.total += L.total;
    });
    // 曜日ごとの暦（対象つきの休み・追加の日・第N週の指定・入会日は含めない、ふだんの週1回の人の日）
    var byWd = [];
    MS.forEach(function (M, mi) {
      for (var w = 0; w < 7; w++) {
        var ls = [], os = [];
        for (var n = M.a; n <= M.b; n++) {
          var t = ymd(n); if (t.w !== w) continue;
          var why = offAll[n] || holi(n) || (o.fifth && Math.ceil(t.d / 7) === 5 ? "第5週" : null);
          if (why) os.push({ n: n, why: why }); else ls.push(n);
        }
        if (o.cap > 0 && ls.length > o.cap) ls.splice(o.cap).forEach(function (n) { os.push({ n: n, why: "月" + o.cap + "回まで" }); });
        os.sort(function (p, q) { return p.n - q.n; });
        var people = lines.filter(function (L) { return L.days.some(function (d) { return d.w === w; }); }).length;
        byWd.push({ y: M.y, m: M.m, mi: mi, w: w, lessons: ls, offs: os, people: people });
      }
    });
    // 日ごと（実際にレッスンのある日の人数）
    var dayMap = {};
    lines.forEach(function (L) { L.months.forEach(function (x) { x.lessons.forEach(function (s) { var d = dayMap[s.n] || (dayMap[s.n] = { n: s.n, people: 0, add: 0, names: [] }); d.people++; if (s.add) d.add++; d.names.push(L.course ? L.name + "（" + L.course + "）" : L.name); }); }); });
    var days = Object.keys(dayMap).map(function (k) { return dayMap[k]; }).sort(function (p, q) { return p.n - q.n; });
    var tot = MS.map(function (M, i) { return lines.reduce(function (a, L) { return a + L.months[i].count; }, 0); });
    return { months: MS, lines: lines, per: per, byWd: byWd, days: days, checks: checks, offBad: OFF.bad, addBad: ADD.bad, warnLines: warnLines, cut: cut, totals: tot, offN: OFF.items.length, addN: ADD.items.length };
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n") + "\r\n";
  }

  var K = { WD: WD, decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, key: key, md: md, iso: iso, months: months, oneDate: oneDate, parseDayLines: parseDayLines, parseWeekdays: parseWeekdays, guessCols: guessCols, run: run, toCSV: toCSV, dn: dn, ymd: ymd };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.KAISU = K;
})(typeof window !== "undefined" ? window : globalThis);
