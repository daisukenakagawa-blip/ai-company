/* 作業時間の集計 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // ---------- 所要時間（「1:30」「90分」「1.5h」「1時間半」） ----------
  // bareUnit：単位のない数字を "h"（時間）か "m"（分）として読む
  function parseDuration(s, bareUnit) {
    var t = norm(s).replace(/ /g, "").toLowerCase();
    if (BLANK.test(t)) return { blank: true };
    var neg = false, m;
    if (/^-/.test(t)) { neg = true; t = t.slice(1); }
    var v = null, kind = "";
    if ((m = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/))) {
      if (+m[2] >= 60 || (m[3] && +m[3] >= 60)) return { err: "分・秒が60以上です" };
      v = +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 60 : 0); kind = "h:mm";
    } else if ((m = t.match(/^(\d*\.?\d+)$/))) {
      v = bareUnit === "m" ? +m[1] : +m[1] * 60; kind = "単位なし";
    } else if ((m = t.match(/^(?:(\d*\.?\d+)(?:h|hr|hrs|hour|hours|時間))?(?:(\d*\.?\d+)(?:m|min|mins|minute|minutes|分)?|(半))?(?:(\d+)(?:s|sec|秒))?$/))) {
      if (m[1] == null && m[2] == null && m[3] == null && m[4] == null) return { err: "時間として読めません" };
      // 単位のない数字が後ろに付くのは「1時間30」のように時間の後ろだけ
      if (m[2] != null && m[1] == null && !/(m|min|mins|minute|minutes|分)(\d+(s|sec|秒))?$/.test(t)) return { err: "時間として読めません" };
      v = (m[1] != null ? +m[1] * 60 : 0) + (m[2] != null ? +m[2] : 0) + (m[3] ? 30 : 0) + (m[4] != null ? +m[4] / 60 : 0);
      kind = "単位つき";
    } else return { err: "時間として読めません" };
    if (!isFinite(v)) return { err: "時間として読めません" };
    return { min: neg ? -v : v, kind: kind };
  }

  // ---------- 時刻（「9:00」「9時30分」「午後1時」「0930」「2026/11/21 9:00」） ----------
  function parseClock(s) {
    var t = norm(s).toLowerCase();
    if (BLANK.test(t)) return { blank: true };
    var m, pm = null;
    if ((m = t.match(/(午前|午後|am|pm|a\.m\.|p\.m\.)/))) pm = /午後|pm|p\.m\./.test(m[1]);
    var x = t.replace(/(午前|午後|a\.m\.|p\.m\.|am|pm)/g, " ").trim();
    // 日付と時刻が一緒なら、最後の時刻の部分だけを見る
    var h, mi = 0, sec = 0;
    if ((m = x.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) { h = +m[1]; mi = +m[2]; sec = m[3] ? +m[3] : 0; }
    else if ((m = x.match(/(\d{1,2})時(?:(\d{1,2})分?|半)?$/))) { h = +m[1]; mi = m[2] != null ? +m[2] : (/半$/.test(x) ? 30 : 0); }
    else if ((m = x.match(/^(\d{3,4})$/))) { var n = m[1].length === 3 ? "0" + m[1] : m[1]; h = +n.slice(0, 2); mi = +n.slice(2); }
    else if ((m = x.match(/^(\d{1,2})$/))) { h = +m[1]; }
    else return { err: "時刻として読めません" };
    if (mi >= 60 || sec >= 60) return { err: "分が60以上です" };
    if (pm !== null) {
      if (h > 12) return { err: "午前・午後と13時以降が一緒です" };
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (h > 47) return { err: "時刻として読めません" };
    return { min: h * 60 + mi + sec / 60 };
  }

  // ---------- 日付（月別・日別に分けるため） ----------
  var ERA = { "令和": 2018, "r": 2018, "平成": 1988, "h": 1988 };
  function parseDate(s) {
    var t = norm(s).toLowerCase(), m, y = null, mo, d;
    if (BLANK.test(t)) return null;
    t = t.replace(/\s.*$/, function (rest) { return /\d{1,2}:\d{2}/.test(rest) ? "" : rest; }).trim();
    if ((m = t.match(/^(令和|平成|r|h)(\d{1,2}|元)[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/))) {
      y = ERA[m[1]] + (m[2] === "元" ? 1 : +m[2]); mo = +m[3]; d = +m[4];
    } else if ((m = t.match(/^(\d{4})[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) { y = 2000 + +m[3]; mo = +m[1]; d = +m[2]; } // Excel の表示「11/21/26」
    else if ((m = t.match(/^(\d{1,2})[\/月-](\d{1,2})日?$/))) { mo = +m[1]; d = +m[2]; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (y != null) { var dt = new Date(y, mo - 1, d); if (dt.getMonth() !== mo - 1) return null; }
    return { y: y, m: mo, d: d };
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dateKey(dt, unit) {
    if (!dt) return "";
    if (unit === "month") return dt.y != null ? dt.y + "年" + pad(dt.m) + "月" : pad(dt.m) + "月";
    if (unit === "weekday") { if (dt.y == null) return ""; return WD[new Date(dt.y, dt.m - 1, dt.d).getDay()]; }
    return (dt.y != null ? dt.y + "/" : "") + pad(dt.m) + "/" + pad(dt.d);
  }

  // ---------- 列の推定 ----------
  var GUESS = [
    ["start", /^(開始|開始時刻|始業|出勤|出発|入室|start|from|begin)/i],
    ["end", /^(終了|終了時刻|終業|退勤|到着|退室|end|to|finish)/i],
    ["brk", /^(休憩|中断|break)/i],
    ["dur", /(作業時間|所要時間|時間|工数|稼働|分数|duration|hours?|time)$|^(時間|工数|所要|稼働)/i],
    ["date", /^(日付|作業日|年月日|実施日|日にち|日|date|day)$/i],
    ["person", /^(担当|担当者|氏名|名前|作業者|社員|スタッフ|メンバー|者|name|staff|person|member)/i],
    ["project", /^(案件|案件名|プロジェクト|業務|作業内容|作業|内容|顧客|取引先|クライアント|project|task|client)/i]
  ];
  function guessColumns(headers, rows) {
    var map = {};
    headers.forEach(function (h, i) {
      var n = norm(h).replace(/[\s()（）]/g, "");
      for (var k = 0; k < GUESS.length; k++) {
        var f = GUESS[k][0];
        if (map[f] == null && GUESS[k][1].test(n)) { map[f] = i; return; }
      }
    });
    // 見出しで決まらないときは、中身から時間の列を探す
    if (map.dur == null && (map.start == null || map.end == null) && rows && rows.length) {
      var best = -1, bestRate = 0;
      headers.forEach(function (h, i) {
        if (i === map.date || i === map.person || i === map.project) return;
        var ok = 0, all = 0;
        rows.slice(0, 50).forEach(function (r) {
          var v = norm(r[i]); if (!v) return; all++;
          var p = parseDuration(v, "h");
          if (p.min != null && p.kind !== "単位なし" && !parseDate(v)) ok++;
        });
        var rate = all ? ok / all : 0;
        if (rate > bestRate && rate >= 0.6) { best = i; bestRate = rate; }
      });
      if (best >= 0) map.dur = best;
    }
    return map;
  }

  // ---------- 丸め（1件ずつ） ----------
  function roundMin(v, unit, how) {
    if (!unit) return v;
    var q = v / unit, eps = 1e-9;
    if (how === "up") q = Math.ceil(q - eps);
    else if (how === "near") q = Math.floor(q + 0.5 + eps);
    else q = Math.floor(q + eps);
    return q * unit;
  }

  // ---------- 1件ずつ読む ----------
  // opt: { mode:"dur"|"range", map, bareUnit, overnight, roundUnit, roundHow }
  function buildRecords(rows, opt) {
    var map = opt.map || {}, recs = [], errors = [], blanks = 0, bare = 0;
    rows.forEach(function (r, i) {
      var rec = { i: i, row: r, min: null, note: "" };
      if (opt.mode === "range") {
        var a = parseClock(r[map.start]), b = parseClock(r[map.end]);
        if (a.blank && b.blank) { blanks++; rec.note = "空欄"; recs.push(rec); return; }
        if (a.err || a.blank) { rec.note = "開始：" + (a.err || "空欄"); errors.push(rec); recs.push(rec); return; }
        if (b.err || b.blank) { rec.note = "終了：" + (b.err || "空欄"); errors.push(rec); recs.push(rec); return; }
        var v = b.min - a.min;
        if (v < 0) {
          if (opt.overnight) { v += 1440; rec.note = "日をまたぐ"; }
          else { rec.note = "終了が開始より前です"; errors.push(rec); recs.push(rec); return; }
        }
        if (map.brk != null) {
          var k = parseDuration(r[map.brk], opt.brkUnit || "m");
          if (k.err) { rec.note = "休憩：" + k.err; errors.push(rec); recs.push(rec); return; }
          if (!k.blank) { v -= k.min; if (v < 0) { rec.note = "休憩が作業時間より長いです"; errors.push(rec); recs.push(rec); return; } }
        }
        rec.raw = v;
      } else {
        var p = parseDuration(r[map.dur], opt.bareUnit);
        if (p.blank) { blanks++; rec.note = "空欄"; recs.push(rec); return; }
        if (p.err) { rec.note = p.err; errors.push(rec); recs.push(rec); return; }
        if (p.kind === "単位なし") { bare++; rec.note = "単位なし→" + (opt.bareUnit === "m" ? "分" : "時間"); }
        if (p.min < 0) rec.note = (rec.note ? rec.note + "・" : "") + "マイナス";
        rec.raw = p.min;
      }
      rec.min = roundMin(rec.raw, opt.roundUnit, opt.roundHow);
      recs.push(rec);
    });
    return { recs: recs, errors: errors, blanks: blanks, bare: bare };
  }

  // ---------- 分け方 ----------
  // spec: null | { col: i } | { col: i, date: "month"|"day"|"weekday" }
  function keyOf(rec, spec) {
    if (!spec) return "";
    var v = rec.row[spec.col];
    if (spec.date) return dateKey(parseDate(v), spec.date) || "（日付なし）";
    v = norm(v);
    return v === "" ? "（空欄）" : v;
  }
  function sortKeys(keys, spec) {
    if (spec && spec.date === "weekday") return keys.sort(function (a, b) { return "月火水木金土日（".indexOf(a[0]) - "月火水木金土日（".indexOf(b[0]); });
    if (spec && spec.date) return keys.sort(function (a, b) { if (a[0] === "（") return 1; if (b[0] === "（") return -1; return a < b ? -1 : a > b ? 1 : 0; });
    return keys; // 出てきた順
  }
  function aggregate(recs, rowSpec, colSpec) {
    var rowKeys = [], colKeys = [], cell = {}, rowTot = {}, colTot = {}, rowCnt = {}, total = 0, count = 0;
    recs.forEach(function (rec) {
      if (rec.min == null) return;
      var rk = keyOf(rec, rowSpec), ck = keyOf(rec, colSpec);
      if (!(rk in rowTot)) { rowKeys.push(rk); rowTot[rk] = 0; rowCnt[rk] = 0; }
      if (!(ck in colTot)) { colKeys.push(ck); colTot[ck] = 0; }
      var id = rk + "\u0000" + ck;
      cell[id] = (cell[id] || 0) + rec.min;
      rowTot[rk] += rec.min; colTot[ck] += rec.min; rowCnt[rk]++;
      total += rec.min; count++;
    });
    return {
      rowKeys: sortKeys(rowKeys, rowSpec), colKeys: sortKeys(colKeys, colSpec),
      get: function (r, c) { var v = cell[r + "\u0000" + c]; return v == null ? null : v; },
      rowTot: rowTot, colTot: colTot, rowCnt: rowCnt, total: total, count: count
    };
  }

  // ---------- 表示 ----------
  function fmt(min, how) {
    if (min == null) return "";
    var neg = min < 0, a = Math.abs(min);
    if (how === "h") return (neg ? "-" : "") + (Math.round(a / 60 * 100) / 100).toFixed(2);
    if (how === "m") { var r = Math.round(a * 10) / 10; return (neg ? "-" : "") + (r % 1 ? r.toFixed(1) : String(r)); }
    var t = Math.round(a);
    return (neg ? "-" : "") + Math.floor(t / 60) + ":" + pad(t % 60);
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  // 集計表を2次元の配列にする（CSV・印刷用）
  function tableRows(ag, how, labels) {
    var hasCol = ag.colKeys.length > 1 || ag.colKeys[0] !== "";
    var out = [];
    if (hasCol) {
      out.push([labels.row || ""].concat(ag.colKeys, ["合計", "件数"]));
      ag.rowKeys.forEach(function (rk) {
        out.push([rk].concat(ag.colKeys.map(function (ck) { return fmt(ag.get(rk, ck), how); }), [fmt(ag.rowTot[rk], how), ag.rowCnt[rk]]));
      });
      out.push(["合計"].concat(ag.colKeys.map(function (ck) { return fmt(ag.colTot[ck], how); }), [fmt(ag.total, how), ag.count]));
    } else {
      out.push([labels.row || "", "合計", "件数"]);
      ag.rowKeys.forEach(function (rk) { out.push([rk || "全体", fmt(ag.rowTot[rk], how), ag.rowCnt[rk]]); });
      if (ag.rowKeys.length > 1 || ag.rowKeys[0] !== "") out.push(["合計", fmt(ag.total, how), ag.count]);
    }
    return out;
  }

  var api = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm,
    parseDuration: parseDuration, parseClock: parseClock, parseDate: parseDate, dateKey: dateKey,
    guessColumns: guessColumns, roundMin: roundMin, buildRecords: buildRecords,
    aggregate: aggregate, fmt: fmt, toCSV: toCSV, tableRows: tableRows
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JIKAN = api;
})(this);
