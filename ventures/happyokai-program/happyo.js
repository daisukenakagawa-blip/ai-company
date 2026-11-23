/* 発表会のプログラムと時刻表 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  // 名前を同じ人として扱うためのキー（空白・全角半角・大文字小文字をそろえる）
  function keyOf(s) { return norm(s).replace(/\s/g, "").toLowerCase(); }

  // ---------- 時間 ----------
  // 演奏・発表の長さ → 秒。「3」「3分」「3.5」「3:30」「3分30秒」「210秒」「3'30"」「0:03:30」「約4分」
  function parseDur(v) {
    var s = norm(v).replace(/[約およそ]|程度|ほど|くらい|ぐらい|前後/g, "").replace(/分間/g, "分").replace(/\s/g, "");
    if (!s) return null;
    var m;
    if ((m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/))) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) return (+m[1]) * 60 + (+m[2]);
    if ((m = s.match(/^(\d+(?:\.\d+)?)分(?:(\d+)秒)?$/))) return Math.round(parseFloat(m[1]) * 60) + (m[2] ? +m[2] : 0);
    if ((m = s.match(/^(\d+)秒$/))) return +m[1];
    if ((m = s.match(/^(\d+)'(\d{1,2})(?:"|'')?$/))) return (+m[1]) * 60 + (+m[2]);
    if ((m = s.match(/^(\d+)'$/))) return (+m[1]) * 60;
    if ((m = s.match(/^(\d+)時間(?:(\d+)分)?$/))) return (+m[1]) * 3600 + (m[2] ? +m[2] * 60 : 0);
    if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round(parseFloat(m[1]) * 60);
    return NaN;
  }
  // 時刻 → その日の0時からの秒。「13:00」「13:00:00」「13時」「13時30分」「午後1時30分」「1:30PM」
  function parseClock(v) {
    var s = norm(v).replace(/\s/g, "").replace(/から|〜|~|開始|開演|ごろ|頃/g, "");
    if (!s) return null;
    var pm = /^(午後|pm)/i.test(s) || /pm$/i.test(s), am = /^(午前|am)/i.test(s) || /am$/i.test(s);
    s = s.replace(/^(午前|午後|am|pm)/i, "").replace(/(am|pm)$/i, "");
    var m, h, mi = 0, se = 0;
    if ((m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) { h = +m[1]; mi = +m[2]; se = m[3] ? +m[3] : 0; }
    else if ((m = s.match(/^(\d{1,2})時(?:(\d{1,2})分|半)?$/))) { h = +m[1]; mi = /半$/.test(s) ? 30 : (m[2] ? +m[2] : 0); }
    else return NaN;
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h > 29 || mi > 59 || se > 59) return NaN;
    return h * 3600 + mi * 60 + se;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // 秒 → 「13:05」（分未満は切り捨て）。withSec で「13:05:30」
  function clock(t, withSec) {
    if (t == null || !isFinite(t)) return "";
    var neg = t < 0; t = Math.abs(Math.floor(t));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (neg ? "-" : "") + h + ":" + pad(m) + (withSec ? ":" + pad(s) : "");
  }
  // 秒 → 「3分30秒」「4分」
  function durLabel(t) {
    if (t == null || !isFinite(t)) return "";
    t = Math.round(t);
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + "時間" : "") + (m || (h && s) ? m + "分" : "") + (s ? s + "秒" : "") || "0分";
  }
  // 秒 → 「3:30」
  function durMS(t) { if (t == null || !isFinite(t)) return ""; t = Math.round(t); return Math.floor(t / 60) + ":" + pad(t % 60); }

  // ---------- 列の推定 ----------
  var COLS = [
    ["fixed", /開始|開演|時刻|スタート/],
    ["dur", /時間|所要|長さ|分数|尺|演奏時間|分$/],
    ["order", /^(順|順番|出演順|発表順|出番|no\.?|番号|#|№)$/i],
    ["composer", /作曲|作者|作詞|振付/],
    ["name", /名前|氏名|出演者|演奏者|出場者|発表者|出演|団体|チーム|生徒/],
    ["title", /曲|演目|作品|タイトル|題名|内容|種目|プログラム/],
    ["part", /部$|^部|区分|クラス|グループ|コース|学年|組/],
    ["memo", /備考|メモ|注意|伴奏|楽器|連絡/]
  ];
  function guessCols(headers) {
    var c = {}, used = {};
    COLS.forEach(function (d) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (d[1].test(norm(headers[i]))) { c[d[0]] = i; used[i] = 1; return; }
      }
    });
    return c;
  }

  // ---------- 行の種類 ----------
  var BREAK_RE = /休憩|休み時間|中休み|インターミッション|休息|休けい/;
  // 行 → 項目。kind: act（出演）／item（あいさつ・講評など、名前のない進行）／break（休憩）／head（部の見出し）
  function toItems(rows, cfg) {
    var c = cfg.cols || {}, defDur = cfg.defDur == null ? 180 : cfg.defDur, split = cfg.split !== false;
    function cell(r, k) { return c[k] == null ? "" : norm(r[c[k]]); }
    var items = [], bad = [];
    rows.forEach(function (r, ri) {
      var row = ri + 1 + (cfg.headRows || 0);
      var name = cell(r, "name"), title = cell(r, "title"), durRaw = cell(r, "dur"), fixRaw = cell(r, "fixed");
      if (!name && !title && !durRaw && !fixRaw) return;
      var it = { row: row, name: name, title: title, composer: cell(r, "composer"), part: cell(r, "part"), memo: cell(r, "memo"), orderRaw: cell(r, "order"), durRaw: durRaw, fixRaw: fixRaw, flags: [] };
      var o = parseFloat(norm(it.orderRaw).replace(/[^\d.]/g, ""));
      it.order = isFinite(o) ? o : null;
      if (BREAK_RE.test(name) || BREAK_RE.test(title)) it.kind = "break";
      else if (!name && !durRaw && (/第.+部|^\S*部$/.test(title))) it.kind = "head";
      else if (!name) it.kind = "item";
      else it.kind = "act";
      var d = parseDur(durRaw);
      if (it.kind === "head") it.dur = 0;
      else if (d == null) {
        it.dur = it.kind === "act" ? defDur : (it.kind === "break" ? 600 : 0);
        it.flags.push("時間が空欄のため " + durLabel(it.dur) + " で計算");
        bad.push({ row: row, name: name || title, why: "時間が空欄（" + durLabel(it.dur) + " で計算）", raw: durRaw });
      } else if (isNaN(d)) {
        it.dur = it.kind === "act" ? defDur : 0;
        it.flags.push("時間「" + durRaw + "」が読めないため " + durLabel(it.dur) + " で計算");
        bad.push({ row: row, name: name || title, why: "時間が読めない（" + durLabel(it.dur) + " で計算）", raw: durRaw });
      } else it.dur = d;
      var f = parseClock(fixRaw);
      if (f != null && isNaN(f)) { bad.push({ row: row, name: name || title, why: "開始時刻が読めない（無視して計算）", raw: fixRaw }); f = null; }
      it.fixed = f;
      it.people = it.kind === "act" ? splitNames(name, split) : [];
      items.push(it);
    });
    if (items.some(function (x) { return x.order != null; })) {
      items = items.map(function (x, i) { return [x, i]; }).sort(function (a, b) {
        var p = a[0].order, q = b[0].order;
        if (p != null && q != null && p !== q) return p - q;
        return a[1] - b[1];
      }).map(function (x) { return x[0]; });
    }
    return { items: items, bad: bad };
  }
  // 「青木さくら・田中ゆい」「青木、田中」「A & B」→ 1人ずつ。かっこの中（「（連弾）」など）は名前に含めない
  function splitNames(s, split) {
    var base = norm(s).replace(/[（(][^）)]*[）)]/g, "").trim();
    if (!split) return base ? [base] : [];
    return base.split(/\s*[・、,，&＆\/／]\s*|\s+と\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ---------- 時刻の計算 ----------
  // opt: start（秒）, change（出演と出演の間の入れ替え・秒）, callMode "min"|"acts", callN, gather（分・0＝なし）, endAt（秒・任意）, gapMin（同じ人の出番のあいだに空けたい組数）, limit
  function run(items, opt) {
    opt = opt || {};
    var t = opt.start || 0, change = opt.change || 0, limit = opt.limit || Infinity;
    var list = [], acts = [], prev = null, cut = 0, num = 0, lastBreakEnd = null;
    for (var i = 0; i < items.length; i++) {
      var src = items[i];
      if (src.kind === "act" && acts.length >= limit) { cut++; continue; }
      if (cut && src.kind !== "act") continue;
      var it = Object.assign({}, src, { flags: src.flags.slice() });
      if (it.kind === "head") {
        if (it.fixed != null) { if (it.fixed > t) it.wait = it.fixed - t, t = it.fixed; else if (it.fixed < t) it.late = t - it.fixed; }
        it.start = t; it.end = t; list.push(it); continue;
      }
      if (prev && prev.kind !== "break" && it.kind !== "break") t += change;
      if (it.fixed != null) {
        if (it.fixed > t) { it.wait = it.fixed - t; t = it.fixed; }
        else if (it.fixed < t) { it.late = t - it.fixed; it.flags.push("予定の " + clock(it.fixed) + " より " + durLabel(it.late) + " 遅れ"); }
      }
      it.start = t; it.end = t + it.dur; t = it.end;
      if (it.kind === "break") lastBreakEnd = it.end;
      if (it.kind === "act") { it.num = ++num; it.idx = acts.length; it.breakEnd = lastBreakEnd; acts.push(it); }
      list.push(it); prev = it;
    }
    var first = list.length ? list[0].start : (opt.start || 0);
    // 呼び出し（袖入り）と集合
    acts.forEach(function (a, k) {
      if (opt.callMode === "acts") {
        var j = k - (opt.callN || 0);
        a.call = j >= 0 ? acts[j].start : first;
        if (j < 0) a.callPre = true;
        // 休憩をはさむときは、休憩の終わる5分前（それより前の組の開始が遅ければその時刻）
        var be = a.breakEnd;
        if (be != null && (j < 0 ? first : acts[j].start) < be) { a.call = Math.max(a.call, be - 300); a.callPre = false; a.callBreak = true; }
      } else {
        a.call = a.start - (opt.callN || 0) * 60;
        a.callNote = (opt.callN || 0) + "分前";
        if (a.call < first) a.callPre = true;
      }
      a.gather = opt.gather ? Math.min(a.call, a.start - opt.gather * 60) : null;
    });
    // 1人ごと
    var pmap = {}, people = [];
    acts.forEach(function (a) {
      a.people.forEach(function (n) {
        var k = keyOf(n);
        if (!pmap[k]) { pmap[k] = { key: k, name: n, apps: [], part: a.part }; people.push(pmap[k]); }
        pmap[k].apps.push(a);
      });
    });
    var gapMin = opt.gapMin == null ? 1 : opt.gapMin, close = [];
    people.forEach(function (p) {
      for (var j = 1; j < p.apps.length; j++) {
        var a = p.apps[j - 1], b = p.apps[j], between = b.idx - a.idx - 1;
        if (between < gapMin) close.push({ person: p, a: a, b: b, between: between, rest: b.start - a.end });
      }
      p.first = p.apps[0];
    });
    var end = list.length ? list[list.length - 1].end : first, over = null;
    if (opt.endAt != null) over = end - opt.endAt;
    // 呼び出し表（時刻順）
    var calls = [];
    acts.forEach(function (a) {
      if (a.gather != null && a.gather < a.call) calls.push({ t: a.gather, type: "集合", act: a });
      calls.push({ t: a.call, type: "袖へ", act: a });
    });
    calls.sort(function (x, y) { return x.t - y.t || x.act.idx - y.act.idx || (x.type === "集合" ? -1 : 1); });
    var breakT = 0, actT = 0, itemT = 0, waitT = 0;
    list.forEach(function (x) { if (x.kind === "break") breakT += x.dur; else if (x.kind === "act") actT += x.dur; else itemT += x.dur; waitT += x.wait || 0; });
    return { list: list, acts: acts, people: people, close: close, calls: calls, start: first, end: end, over: over, endAt: opt.endAt, cut: cut,
      total: { acts: acts.length, people: people.length, actT: actT, breakT: breakT, itemT: itemT, waitT: waitT, changeT: end - first - actT - breakT - itemT - waitT, span: end - first } };
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var H = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, keyOf: keyOf, parseDur: parseDur, parseClock: parseClock, clock: clock, durLabel: durLabel, durMS: durMS,
    guessCols: guessCols, toItems: toItems, splitNames: splitNames, run: run, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = H;
  else root.HAPPYO = H;
})(this);
