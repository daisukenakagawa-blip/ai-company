/* 予約の重なりチェック — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  var GUESS = [
    ["range", /^(時間帯|利用時間|予約時間|時間|枠|time ?slot|slot)$/i],
    ["start", /^(開始|開始時刻|開始日時|利用開始|貸出|貸出日時|出発|出庫|入室|チェックイン|start|from|begin)/i],
    ["end", /^(終了|終了時刻|終了日時|利用終了|返却|返却予定|返却日時|帰着|入庫|退室|チェックアウト|end|to|until|finish)/i],
    ["date", /^(日付|利用日|予約日|使用日|実施日|日にち|日|年月日|date|day)$/i],
    ["res", /^(会議室|部屋|室|場所|施設|設備|備品|物品|貸出品|品名|車|車両|社用車|車名|リソース|対象|予約対象|resource|room|facility|car|item)/i],
    ["person", /^(予約者|申込者|申請者|利用者|使用者|担当|担当者|氏名|名前|部署|name|user|person|owner)/i],
    ["purpose", /^(用途|目的|件名|内容|会議名|行き先|備考|purpose|title|subject|memo|note)/i]
  ];
  function guessColumns(headers, rows) {
    var map = {};
    headers.forEach(function (h, i) {
      var t = norm(h).replace(/\s/g, "");
      for (var k = 0; k < GUESS.length; k++) {
        if (map[GUESS[k][0]] == null && GUESS[k][1].test(t)) { map[GUESS[k][0]] = i; return; }
      }
    });
    // 「時間」列が「9:00〜10:00」でなく「9:00」だけなら、開始とみなす
    if (map.range != null && rows.length) {
      var ok = 0, all = 0;
      rows.slice(0, 30).forEach(function (r) { var v = norm(r[map.range]); if (!v) return; all++; if (splitRange(v)) ok++; });
      if (all && ok / all < 0.5) { if (map.start == null) map.start = map.range; delete map.range; }
    }
    if (map.start != null && map.end != null) delete map.range;
    // 物の列が見出しで決まらなければ、日付・時刻でない最初の列
    if (map.res == null) {
      for (var i = 0; i < headers.length; i++) {
        if (i === map.start || i === map.end || i === map.date || i === map.range || i === map.person || i === map.purpose) continue;
        var v = rows.length ? norm(rows[0][i]) : "";
        if (v && !parseDate(v, 2000) && parseClock(v).err) { map.res = i; break; }
      }
    }
    return map;
  }

  // ---------- 予約を読む ----------
  // opt: { map:{res,date,start,end,range,person,purpose}, mode:"two"|"one", year, overnight }
  function buildRecords(rows, opt) {
    var M = opt.map, recs = [], errors = [], blanks = 0;
    rows.forEach(function (r, i) {
      var res = M.res != null ? norm(r[M.res]) : "（全体）";
      var sTxt, eTxt, base = null;
      if (opt.mode === "one") {
        var raw = norm(r[M.range]);
        if (!raw && !(M.date != null && norm(r[M.date]))) { blanks++; return; }
        var sp = splitRange(raw);
        if (!sp) { errors.push({ i: i, row: r, note: "時間帯として読めません（「9:00〜10:30」の形）" }); return; }
        sTxt = sp.start; eTxt = sp.end;
        if (sp.prefix) base = parseDate(sp.prefix, opt.year);
      } else {
        sTxt = norm(r[M.start]); eTxt = norm(r[M.end]);
        if (!sTxt && !eTxt) { blanks++; return; }
      }
      if (!res) { errors.push({ i: i, row: r, note: "予約する物（部屋・車など）が空欄です" }); return; }
      if (!base && M.date != null) base = parseDate(r[M.date], opt.year);
      var sd = parseDate(sTxt, opt.year) || base;
      var ed = parseDate(eTxt, opt.year) || sd;
      if (!sd) { errors.push({ i: i, row: r, note: M.date != null ? "日付が読めません" : "日付がありません（日付の列を選ぶか、開始を「2026/11/24 9:00」の形に）" }); return; }
      var sc = parseClock(sTxt), ec = parseClock(eTxt);
      if (sc.blank || sc.err) { errors.push({ i: i, row: r, note: "開始の時刻が" + (sc.blank ? "空欄です" : "読めません") }); return; }
      if (ec.blank || ec.err) { errors.push({ i: i, row: r, note: "終了の時刻が" + (ec.blank ? "空欄です" : "読めません") }); return; }
      var s = sd.day * 1440 + sc.min, e = ed.day * 1440 + ec.min, note = "";
      if (e <= s && ed.day === sd.day && opt.overnight && ec.min < sc.min) { e += 1440; note = "翌日までの予約とみなしました"; }
      if (e === s) { errors.push({ i: i, row: r, note: "開始と終了が同じです" }); return; }
      if (e < s) { errors.push({ i: i, row: r, note: "終了が開始より前です" }); return; }
      if (e - s > 31 * 1440) { errors.push({ i: i, row: r, note: "31日を超える予約です（日付を確かめてください）" }); return; }
      recs.push({
        i: i, row: r, res: res, s: s, e: e, note: note,
        person: M.person != null ? norm(r[M.person]) : "",
        purpose: M.purpose != null ? norm(r[M.purpose]) : ""
      });
    });
    return { recs: recs, errors: errors, blanks: blanks };
  }

  // ---------- 重なりを探す ----------
  // gap：前の予約の終わりから次の予約の始まりまでに空けたい分（片付け・清掃・移動）
  function findOverlaps(recs, gap) {
    gap = gap || 0;
    var by = {}, out = [];
    recs.forEach(function (r) { (by[r.res] = by[r.res] || []).push(r); });
    Object.keys(by).forEach(function (res) {
      var list = by[res].slice().sort(function (a, b) { return a.s - b.s || a.e - b.e || a.i - b.i; });
      var active = [];
      list.forEach(function (r) {
        active = active.filter(function (a) { return a.e + gap > r.s; });
        active.forEach(function (a) {
          var ov = Math.min(a.e, r.e) - r.s;
          var kind = ov > 0 ? "重なり" : "間隔不足";
          if (a.s === r.s && a.e === r.e) kind = (a.person && a.person === r.person) ? "同じ予約が2回" : "同じ時間に2件";
          out.push({ res: res, a: a, b: r, from: r.s, to: Math.min(a.e, r.e), min: Math.max(ov, 0), shortBy: ov > 0 ? 0 : gap + ov, kind: kind });
        });
        active.push(r);
      });
    });
    out.sort(function (x, y) { return x.res < y.res ? -1 : x.res > y.res ? 1 : x.from - y.from; });
    var hit = {};
    out.forEach(function (o) { hit[o.a.i] = true; hit[o.b.i] = true; });
    return { list: out, hit: hit };
  }

  // ---------- 物ごと・日ごとの空き時間 ----------
  // open/close：1日の中の分（例 540, 1080）。days を省くと、予約のある日すべて
  function freeSlots(recs, open, close, minFree) {
    var resSet = {}, daySet = {};
    recs.forEach(function (r) {
      resSet[r.res] = true;
      for (var d = Math.floor(r.s / 1440); d * 1440 < r.e; d++) daySet[d] = true;
    });
    var ress = Object.keys(resSet).sort(), days = Object.keys(daySet).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    days.forEach(function (day) {
      var o = day * 1440 + open, c = day * 1440 + close;
      ress.forEach(function (res) {
        var busy = recs.filter(function (r) { return r.res === res && r.s < c && r.e > o; })
          .map(function (r) { return [Math.max(r.s, o), Math.min(r.e, c)]; })
          .sort(function (a, b) { return a[0] - b[0]; });
        var merged = [];
        busy.forEach(function (b) { var L = merged[merged.length - 1]; if (L && b[0] <= L[1]) L[1] = Math.max(L[1], b[1]); else merged.push(b.slice()); });
        var free = [], cur = o, used = 0;
        merged.forEach(function (b) { if (b[0] - cur >= (minFree || 1)) free.push([cur - day * 1440, b[0] - day * 1440]); cur = Math.max(cur, b[1]); used += b[1] - b[0]; });
        if (c - cur >= (minFree || 1)) free.push([cur - day * 1440, c - day * 1440]);
        var cnt = recs.filter(function (r) { return r.res === res && Math.floor(r.s / 1440) === day; }).length;
        out.push({ day: day, res: res, count: cnt, used: used, free: free, freeMin: free.reduce(function (a, f) { return a + f[1] - f[0]; }, 0) });
      });
    });
    return out;
  }
  function freeText(free) { return free.length ? free.map(function (f) { return hm(f[0]) + "〜" + hm(f[1]); }).join("、") : "なし"; }

  // ---------- 1日の表（タイムライン）用：重ならないように段に分ける ----------
  function lanes(recs) {
    var sorted = recs.slice().sort(function (a, b) { return a.s - b.s || b.e - a.e; }), ends = [];
    return sorted.map(function (r) {
      var k = 0; while (k < ends.length && ends[k] > r.s) k++;
      ends[k] = r.e; return { r: r, lane: k };
    });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, parseClock: parseClock, parseDate: parseDate,
    splitRange: splitRange, guessColumns: guessColumns, buildRecords: buildRecords, findOverlaps: findOverlaps,
    freeSlots: freeSlots, freeText: freeText, lanes: lanes, dayLabel: dayLabel, hm: hm, stamp: stamp, dur: dur, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YOYAKU = api;
})(this);
