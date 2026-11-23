/* 時間帯ごとの人数と不足チェック — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";

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
    return s.replace(/[\s]+/g, " ").trim();
  }
  var BLANK = /^(|-|ー|―|‐|－|なし|無し|n\/a|na)$/i;

  // ---------- 時刻（「9:00」「9時30分」「午後1時」「0930」「2026/11/24 9:00」） ----------
  function parseClock(s) {
    var t = norm(s).toLowerCase().replace(/(\d)t(\d)/, "$1 $2");
    if (BLANK.test(t)) return { blank: true };
    var m, pm = null;
    if ((m = t.match(/(午前|午後|am|pm|a\.m\.|p\.m\.)/))) pm = /午後|pm|p\.m\./.test(m[1]);
    var x = t.replace(/(午前|午後|a\.m\.|p\.m\.|am|pm)/g, " ").replace(/まで$/, "").trim();
    var h, mi = 0;
    if ((m = x.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) { h = +m[1]; mi = +m[2]; if (m[3] && +m[3] >= 60) return { err: "時刻として読めません" }; }
    else if ((m = x.match(/(?:^|\s|日)(\d{1,2})時(?:(\d{1,2})分?|(半))?$/))) { h = +m[1]; mi = m[2] != null ? +m[2] : (m[3] ? 30 : 0); }
    else if ((m = x.match(/^(\d{3,4})$/))) { var n = m[1].length === 3 ? "0" + m[1] : m[1]; h = +n.slice(0, 2); mi = +n.slice(2); }
    else if ((m = x.match(/^(\d{1,2})$/))) { h = +m[1]; }
    else return { err: "時刻として読めません" };
    if (mi >= 60) return { err: "分が60以上です" };
    if (pm !== null) {
      if (h > 12) return { err: "午前・午後と13時以降が一緒です" };
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (h > 30) return { err: "時刻として読めません" };
    return { min: h * 60 + mi };
  }

  // ---------- 日付 ----------
  var ERA = { "令和": 2018, "r": 2018, "平成": 1988, "h": 1988 };
  function parseDate(s, defYear) {
    var t = norm(s).toLowerCase().replace(/(\d)t(\d)/, "$1 $2"), m, y = null, mo, d;
    if (BLANK.test(t)) return null;
    t = t.replace(/\([^)]*\)/g, "").trim();                 // 「11/24(月)」の曜日
    t = t.replace(/\s.*$/, "").trim();                      // 後ろの時刻
    if ((m = t.match(/^(令和|平成|r|h)(\d{1,2}|元)[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/))) {
      y = ERA[m[1]] + (m[2] === "元" ? 1 : +m[2]); mo = +m[3]; d = +m[4];
    } else if ((m = t.match(/^(\d{4})[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) { y = 2000 + +m[3]; mo = +m[1]; d = +m[2]; } // Excel の表示「11/24/26」
    else if ((m = t.match(/^(\d{1,2})[\/月-](\d{1,2})日?$/))) { mo = +m[1]; d = +m[2]; y = defYear || null; }
    else return null;
    if (y == null || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return null;
    return { y: y, m: mo, d: d, day: Math.round(dt.getTime() / 86400000) };
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dayLabel(day) {
    var dt = new Date(day * 86400000);
    return dt.getUTCFullYear() + "/" + pad(dt.getUTCMonth() + 1) + "/" + pad(dt.getUTCDate()) + "（" + WD[dt.getUTCDay()] + "）";
  }
  function hm(min) { // 1日の中の分 → 「9:05」。24時以降は「翌1:00」
    min = Math.round(min);
    var nx = min >= 1440 ? "翌" : "";
    if (min >= 1440) min -= 1440;
    return nx + Math.floor(min / 60) + ":" + pad(min % 60);
  }
  function stamp(abs) { var day = Math.floor(abs / 1440); return dayLabel(day) + " " + hm(abs - day * 1440); }
  function dur(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + "時間" : "") + (m || !h ? m + "分" : ""); }

  // ---------- 1つのセルの時間帯（「9:00〜10:30」「10時-12時」「2026/11/24 13:00~15:00」） ----------
  var TPART = "(\\d{1,2}:\\d{2}|\\d{1,2}時(?:\\d{1,2}分|半)?|\\d{1,2})";
  var RANGE = new RegExp("^(.*?)" + TPART + "\\s*(?:〜|~|-|–|—|−|ｰ|ー|から)\\s*(?:翌日?\\s*)?" + TPART + "\\s*(?:まで)?$");
  function splitRange(s) {
    var t = norm(s).replace(/\s*(〜|~|から)\s*/g, "$1");
    var m = t.match(RANGE);
    if (!m) return null;
    return { prefix: m[1].trim(), start: m[2], end: m[3] };
  }


  // ---------- 列の推定 ----------
  var OFF = /^(休|休み|公休|有休|有給|年休|代休|欠|欠勤|×|x|お休み|off|休日)$/i;
  var GUESS = [
    ["range", /^(時間帯|勤務時間|シフト|出勤時間|予約時間|利用時間|時間|枠|shift|time ?slot)$/i],
    ["bstart", /^(休憩開始|休憩入|休憩から|break ?start)/i],
    ["bend", /^(休憩終了|休憩戻|休憩まで|break ?end)/i],
    ["brange", /^(休憩|休憩時間|break)$/i],
    ["start", /^(開始|開始時刻|出勤|出勤時刻|始業|入り|入|来店|入室|チェックイン|予約開始|start|from|begin|in)$/i],
    ["end", /^(終了|終了時刻|退勤|退勤時刻|終業|上がり|退室|チェックアウト|予約終了|end|to|until|finish|out)$/i],
    ["date", /^(日付|勤務日|出勤日|利用日|予約日|日にち|日|年月日|date|day)$/i],
    ["group", /^(職種|部署|売場|担当|持ち場|ポジション|役割|部門|チーム|グループ|資格|種別|position|role|team|group)$/i],
    ["person", /^(氏名|名前|スタッフ|従業員|社員|職員|メンバー|予約者|利用者|お客様|顧客|name|staff|member|person)/i],
    ["count", /^(人数|名様|名数|人|people|pax|guests?)$/i]
  ];
  function guessColumns(headers, rows) {
    var map = {};
    headers.forEach(function (h, i) {
      var t = norm(h).replace(/\s/g, "").replace(/[（(].*$/, "");
      for (var k = 0; k < GUESS.length; k++) {
        if (map[GUESS[k][0]] == null && GUESS[k][1].test(t)) { map[GUESS[k][0]] = i; return; }
      }
    });
    if (map.range != null && rows.length) {
      var ok = 0, all = 0;
      rows.slice(0, 30).forEach(function (r) { var v = norm(r[map.range]); if (!v || OFF.test(v)) return; all++; if (splitRange(v)) ok++; });
      if (all && ok / all < 0.5) { if (map.start == null) map.start = map.range; delete map.range; }
    }
    if (map.start != null && map.end != null) delete map.range;
    if (map.bstart != null && map.bend != null) delete map.brange;
    return map;
  }

  // ---------- 勤務・予約を読む ----------
  // opt: { map:{person,group,date,start,end,range,bstart,bend,brange,count}, mode:"two"|"one", year, overnight }
  function cellRange(raw, year) { // 「9:00〜17:00」→ {s,e}（分、日付は別）
    var sp = splitRange(raw); if (!sp) return null;
    var a = parseClock(sp.start), b = parseClock(sp.end);
    if (a.min == null || b.min == null) return null;
    return { s: a.min, e: b.min, prefix: sp.prefix ? parseDate(sp.prefix, year) : null };
  }
  function buildRecords(rows, opt) {
    var M = opt.map, recs = [], errors = [], blanks = 0, offs = 0;
    rows.forEach(function (r, i) {
      var sTxt, eTxt, base = null;
      var person = M.person != null ? norm(r[M.person]) : "";
      var group = M.group != null ? norm(r[M.group]) : "";
      if (opt.mode === "one") {
        var raw = norm(r[M.range]);
        if (!raw) { blanks++; return; }
        if (OFF.test(raw)) { offs++; return; }
        var sp = splitRange(raw);
        if (!sp) { errors.push({ i: i, row: r, note: "時間帯として読めません（「9:00〜17:00」の形）" }); return; }
        sTxt = sp.start; eTxt = sp.end;
        if (sp.prefix) base = parseDate(sp.prefix, opt.year);
      } else {
        sTxt = norm(r[M.start]); eTxt = norm(r[M.end]);
        if (!sTxt && !eTxt) { blanks++; return; }
        if (OFF.test(sTxt) || OFF.test(eTxt)) { offs++; return; }
      }
      if (!base && M.date != null) base = parseDate(r[M.date], opt.year);
      var sd = parseDate(sTxt, opt.year) || base;
      var ed = parseDate(eTxt, opt.year) || sd;
      if (!sd) { errors.push({ i: i, row: r, note: M.date != null ? "日付が読めません" : "日付がありません（日付の列を選ぶか、開始を「2026/11/24 9:00」の形に）" }); return; }
      var sc = parseClock(sTxt), ec = parseClock(eTxt);
      if (sc.blank || sc.err) { errors.push({ i: i, row: r, note: "開始の時刻が" + (sc.blank ? "空欄です" : "読めません") }); return; }
      if (ec.blank || ec.err) { errors.push({ i: i, row: r, note: "終了の時刻が" + (ec.blank ? "空欄です" : "読めません") }); return; }
      var s = sd.day * 1440 + sc.min, e = ed.day * 1440 + ec.min, note = [];
      if (e <= s && ed.day === sd.day && opt.overnight && ec.min < sc.min) { e += 1440; note.push("翌日までとみなしました"); }
      if (e === s) { errors.push({ i: i, row: r, note: "開始と終了が同じです" }); return; }
      if (e < s) { errors.push({ i: i, row: r, note: "終了が開始より前です" }); return; }
      if (e - s > 2 * 1440) { errors.push({ i: i, row: r, note: "2日を超えています（日付を確かめてください）" }); return; }
      // 休憩（勤務の中の時刻。開始より前の時刻なら翌日とみなす）
      var brk = [];
      function addBreak(bs, be) {
        var d0 = Math.floor(s / 1440) * 1440, a = d0 + bs, b = d0 + be;
        if (a < s) { a += 1440; b += 1440; }
        if (b <= a) b += 1440;
        if (a < s || b > e) { note.push("休憩が勤務の時間の外です（休憩を引いていません）"); return; }
        brk.push([a, b]);
      }
      if (M.brange != null) {
        var bt = norm(r[M.brange]);
        if (bt && !BLANK.test(bt)) {
          bt.split(/[,、，\/／]/).forEach(function (part) {
            part = part.trim(); if (!part) return;
            var cr = cellRange(part, opt.year);
            if (cr) addBreak(cr.s, cr.e);
            else if (/^\d+\s*(分|min|m)?$/i.test(part) || /時間/.test(part)) note.push("休憩が長さだけなので時刻に置けません（引いていません）");
            else note.push("休憩が読めません（引いていません）");
          });
        }
      } else if (M.bstart != null && M.bend != null) {
        var a1 = parseClock(r[M.bstart]), b1 = parseClock(r[M.bend]);
        if (a1.min != null && b1.min != null) addBreak(a1.min, b1.min);
        else if (!(a1.blank && b1.blank)) note.push("休憩の時刻が読めません（引いていません）");
      }
      var cnt = 1;
      if (M.count != null) {
        var cv = norm(r[M.count]).replace(/(人|名|名様|様)$/, "");
        if (cv !== "") {
          if (!/^\d+$/.test(cv) || +cv < 1) { errors.push({ i: i, row: r, note: "人数が数として読めません" }); return; }
          cnt = +cv;
        }
      }
      // 休憩を除いた時間
      var parts = [[s, e]];
      brk.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (b) {
        var nx = [];
        parts.forEach(function (p) {
          if (b[1] <= p[0] || b[0] >= p[1]) { nx.push(p); return; }
          if (b[0] > p[0]) nx.push([p[0], b[0]]);
          if (b[1] < p[1]) nx.push([b[1], p[1]]);
        });
        parts = nx;
      });
      recs.push({ i: i, row: r, s: s, e: e, parts: parts, breaks: brk, person: person, group: group, cnt: cnt, note: note.join("、") });
    });
    return { recs: recs, errors: errors, blanks: blanks, offs: offs };
  }

  // ---------- 必要な人数の決まり ----------
  // 1行に1つ：「9:00-12:00 2」「土日 10:00〜18:00 4人」「平日 12:00-13:00 3」「11/29 9:00-17:00 5」
  var WDC = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
  function parseRules(text, year) {
    var rules = [], errors = [];
    String(text || "").split(/\r?\n/).forEach(function (line, n) {
      var t = norm(line).replace(/#.*$/, "").trim();
      if (!t) return;
      var m = t.match(/^(.*?)\s*(\d{1,2}(?::\d{2}|時(?:\d{1,2}分|半)?)?)\s*(?:〜|~|-|–|—|−|から)\s*(\d{1,2}(?::\d{2}|時(?:\d{1,2}分|半)?)?)\s*(?:まで)?\s*[:：=＝]?\s*(\d+)\s*(人|名)?(?:以上)?$/);
      if (!m) { errors.push({ line: n + 1, text: line, note: "「9:00-12:00 2」の形で書いてください" }); return; }
      var a = parseClock(m[2]), b = parseClock(m[3]);
      if (a.min == null || b.min == null) { errors.push({ line: n + 1, text: line, note: "時刻が読めません" }); return; }
      var from = a.min, to = b.min; if (to <= from) to += 1440;
      var head = m[1].trim(), days = null, date = null;
      if (head && !/^(毎日|全日|全部|すべて|全て|いつも)$/.test(head)) {
        var d = parseDate(head, year);
        if (d) date = d.day;
        else if (/^平日$/.test(head)) days = [1, 2, 3, 4, 5];
        else if (/^(土日|週末)$/.test(head)) days = [0, 6];
        else if (/^(土日祝|土日・祝)$/.test(head)) { days = [0, 6]; }
        else {
          var h2 = head.replace(/曜日?|[・,、\s]/g, "");
          var rg = h2.match(/^([日月火水木金土])[〜~\-]([日月火水木金土])$/);
          if (rg) { days = []; for (var k = WDC[rg[1]]; ; k = (k + 1) % 7) { days.push(k); if (k === WDC[rg[2]]) break; } }
          else if (/^[日月火水木金土]+$/.test(h2)) days = h2.split("").map(function (c) { return WDC[c]; });
          else { errors.push({ line: n + 1, text: line, note: "曜日・日付が読めません（「平日」「土日」「月水金」「11/29」など）" }); return; }
        }
      }
      rules.push({ line: n + 1, from: from, to: to, need: +m[4], days: days, date: date, text: t });
    });
    return { rules: rules, errors: errors };
  }
  // その日の、ある時刻（日の中の分、24時以降も可）に必要な人数。後ろの行ほど優先。日付の指定は曜日より優先
  function needAt(rules, day, min) {
    var wd = ((day % 7) + 7 + 4) % 7, best = null, bestDate = null;
    rules.forEach(function (r) {
      if (min < r.from || min >= r.to) return;
      if (r.date != null) { if (r.date === day) bestDate = r.need; return; }
      if (r.days && r.days.indexOf(wd) < 0) return;
      best = r.need;
    });
    return bestDate != null ? bestDate : best;
  }

  // ---------- 時間帯ごとの人数 ----------
  // opt: { step, from, to（日の中の分）, how:"full"|"any", group:""|名前, days:[...] 省略で記録のある日 }
  function countSlots(recs, rules, opt) {
    var step = opt.step || 30, from = opt.from, to = opt.to;
    var list = recs.filter(function (r) { return !opt.group || r.group === opt.group; });
    var daySet = {};
    list.forEach(function (r) { daySet[Math.floor(r.s / 1440)] = true; });
    var days = opt.days || Object.keys(daySet).map(Number).sort(function (a, b) { return a - b; });
    var slots = []; for (var t = from; t < to; t += step) slots.push([t, Math.min(t + step, to)]);
    var out = days.map(function (day) {
      var base = day * 1440;
      var near = list.filter(function (r) { return r.s < base + to && r.e > base + from; });
      var cells = slots.map(function (sl) {
        var a = base + sl[0], b = base + sl[1], n = 0, who = [];
        near.forEach(function (r) {
          var hit = false;
          if (opt.how === "any") hit = r.parts.some(function (p) { return p[0] < b && p[1] > a; });
          else hit = r.parts.some(function (p) { return p[0] <= a && p[1] >= b; });
          if (hit) { n += r.cnt; who.push(r); }
        });
        var need = rules ? needAt(rules, day, sl[0]) : null;
        return { from: sl[0], to: sl[1], n: n, need: need, short: need != null && n < need ? need - n : 0, who: who };
      });
      var mx = -1, mxAt = null, mn = null, mnAt = null, shortSlots = 0;
      cells.forEach(function (c) {
        if (c.n > mx) { mx = c.n; mxAt = c; }
        if (c.need != null && (mn == null || c.n < mn)) { mn = c.n; mnAt = c; }
        if (c.short) shortSlots++;
      });
      var people = {}, work = 0;
      near.forEach(function (r) {
        people[r.person || ("行" + r.i)] = 1;
        r.parts.forEach(function (p) { work += Math.max(0, Math.min(p[1], base + to) - Math.max(p[0], base + from)) * r.cnt; });
      });
      return { day: day, cells: cells, max: Math.max(mx, 0), maxAt: mxAt, minNeedN: mn, minAt: mnAt, shortSlots: shortSlots, people: Object.keys(people).length, workMin: work };
    });
    return { slots: slots, days: out };
  }

  // 不足の続いている時間帯をまとめる（同じ日で、続いていて、人数と必要数が同じ枠）
  function shortages(res) {
    var out = [];
    res.days.forEach(function (d) {
      var cur = null;
      d.cells.forEach(function (c) {
        if (!c.short) { cur = null; return; }
        if (cur && cur.to === c.from && cur.n === c.n && cur.need === c.need) { cur.to = c.to; return; }
        cur = { day: d.day, from: c.from, to: c.to, n: c.n, need: c.need, short: c.short, who: c.who };
        out.push(cur);
      });
    });
    return out;
  }

  function groupsOf(recs) { var g = {}; recs.forEach(function (r) { if (r.group) g[r.group] = (g[r.group] || 0) + 1; }); return Object.keys(g).sort(); }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, parseClock: parseClock, parseDate: parseDate, splitRange: splitRange,
    guessColumns: guessColumns, buildRecords: buildRecords, parseRules: parseRules, needAt: needAt, countSlots: countSlots,
    shortages: shortages, groupsOf: groupsOf, dayLabel: dayLabel, hm: hm, stamp: stamp, dur: dur, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NINZU = api;
})(this);
