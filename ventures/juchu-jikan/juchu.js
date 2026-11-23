/* 受注の曜日・時間帯の集計 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function fmt(x) {
    if (x == null || isNaN(x)) return "";
    x = Math.round(x * 100) / 100;
    var p = String(Math.abs(x)).split(".");
    return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : "");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- 日付と時刻 ----------
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }   // 1970-01-01 からの日数
  function fromDayNo(n) { var t = new Date(n * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function validYMD(y, m, d) { if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false; var t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
  function ymdStr(o) { return o.y + "-" + pad(o.m) + "-" + pad(o.d); }

  // 1つのセルの日時を読む。戻り値：{dn（日の番号）, y, m, d, h, mi, hasTime, tz} か {err}
  // o.tz === "jst"：時差の書かれた日時（Z・+00:00 など）を日本時間（+09:00）に直す。"asis"：書かれた時刻のまま
  function parseDT(v, o) {
    o = o || {};
    var s = norm(v);
    if (!s) return null;
    // Excel の日付のシリアル値（1900年方式）
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = parseFloat(s);
      if (x > 20000 && x < 120000) {
        var days = Math.floor(x), mins = Math.round((x - days) * 1440);
        if (mins >= 1440) { days++; mins -= 1440; }
        var dn0 = days - 25569, f0 = fromDayNo(dn0), hasT = x !== days;
        return { dn: dn0, y: f0.y, m: f0.m, d: f0.d, h: hasT ? Math.floor(mins / 60) : null, mi: hasT ? mins % 60 : null, hasTime: hasT, tz: false };
      }
    }
    s = s.replace(/[（(][日月火水木金土祝]{1,2}(曜日?)?[）)]/g, " ").replace(/[日月火水木金土]曜日?/g, " ").replace(/\s+/g, " ").trim();
    var y, m, d, rest, mm;
    if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?(.*)$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; rest = mm[4]; }
    else if ((mm = s.match(/^(\d{4})(\d{2})(\d{2})(?:[T\s]?(\d{2})(\d{2})(\d{2})?)?$/))) {
      y = +mm[1]; m = +mm[2]; d = +mm[3];
      rest = mm[4] ? " " + mm[4] + ":" + mm[5] + (mm[6] ? ":" + mm[6] : "") : "";
    }
    else if ((mm = s.match(/^令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(.*)$/))) { y = 2018 + (mm[1] === "元" ? 1 : +mm[1]); m = +mm[2]; d = +mm[3]; rest = mm[4]; }
    else if ((mm = s.match(/^[RＲ]\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})(.*)$/i))) { y = 2018 + (+mm[1]); m = +mm[2]; d = +mm[3]; rest = mm[4]; }
    else return { err: "日付として読めません" };
    if (!validYMD(y, m, d)) return { err: "ない日付です" };
    rest = rest.replace(/^[T\s,]+/, "").trim();
    var h = null, mi = null, tz = false, off = null;
    if (rest) {
      // 時差：Z・+09:00・+0900・UTC・GMT・JST
      var tm = rest.match(/\s*(Z|UTC|GMT|JST|[+-]\d{2}:?\d{2})$/i);
      if (tm) {
        var t = tm[1].toUpperCase();
        off = t === "Z" || t === "UTC" || t === "GMT" ? 0 : t === "JST" ? 540 : (t[0] === "-" ? -1 : 1) * (+t.substr(1, 2) * 60 + +t.replace(":", "").substr(3, 2));
        rest = rest.slice(0, tm.index).trim();
      }
      var pm = null;
      if (/^(午前|AM)/i.test(rest)) { pm = false; rest = rest.replace(/^(午前|AM)\s*/i, ""); }
      else if (/^(午後|PM)/i.test(rest)) { pm = true; rest = rest.replace(/^(午後|PM)\s*/i, ""); }
      if (/\s*(AM|午前)$/i.test(rest)) { pm = false; rest = rest.replace(/\s*(AM|午前)$/i, ""); }
      else if (/\s*(PM|午後)$/i.test(rest)) { pm = true; rest = rest.replace(/\s*(PM|午後)$/i, ""); }
      var t2 = rest.match(/^(\d{1,2})\s*[:時]\s*(\d{1,2})?\s*分?(?:\s*[:]?\s*(\d{1,2}(?:\.\d+)?)\s*秒?)?$/);
      if (!t2) return { err: "時刻として読めません" };
      h = +t2[1]; mi = t2[2] != null ? +t2[2] : 0;
      if (pm !== null) { if (h < 1 || h > 12) return { err: "時刻として読めません" }; h = h % 12 + (pm ? 12 : 0); }
      if (h > 23 || mi > 59) return { err: "ない時刻です（0:00〜23:59）" };
    }
    var dn = dayNo(y, m, d);
    if (h != null && off != null && o.tz !== "asis" && off !== 540) {
      var tot = dn * 1440 + h * 60 + mi + (540 - off);
      dn = Math.floor(tot / 1440); var r = tot - dn * 1440; h = Math.floor(r / 60); mi = r % 60;
      var f1 = fromDayNo(dn); y = f1.y; m = f1.m; d = f1.d; tz = true;
    }
    return { dn: dn, y: y, m: m, d: d, h: h, mi: mi, hasTime: h != null, tz: tz };
  }
  // 時刻だけのセル（日付と時刻が別の列の表）
  function joinDT(dv, tv) {
    var a = norm(dv), b = norm(tv);
    if (!b) return a;
    if (/^0?\.\d+$|^0$/.test(b)) { var mins = Math.round(parseFloat(b) * 1440); b = Math.floor(mins / 60) + ":" + pad(mins % 60); }  // Excel の時刻の小数
    // 日付のセルに 0:00 などの時刻が付いていたら外す
    a = a.replace(/[T\s]+0?0:00(:00)?$/, "");
    return a + " " + b;
  }

  // ---------- 時間帯 ----------
  // 区切りの時刻の一覧（"9,12,15,18" など）から時間帯を作る。0時と24時は自動で足す
  function makeBands(mode, custom) {
    var b = [];
    if (mode === "custom") {
      var list = norm(custom).split(/[,、，\s]+/).filter(Boolean), bad = [];
      list.forEach(function (x) { var n = x.replace(/時$/, ""); if (!/^\d{1,2}$/.test(n) || +n > 24) bad.push(x); else b.push(+n); });
      if (bad.length) return { err: "区切りの時刻は 0〜24 の整数で、カンマ区切りで書いてください（読めない値：" + bad.join("・") + "）" };
    } else {
      var st = +mode || 1;
      for (var h = 0; h < 24; h += st) b.push(h);
    }
    b.push(0, 24);
    b = b.filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(function (p, q) { return p - q; });
    var bands = [];
    for (var i = 0; i + 1 < b.length; i++) bands.push({ from: b[i], to: b[i + 1], label: b[i + 1] - b[i] === 1 ? b[i] + "時台" : b[i] + ":00〜" + (b[i + 1] - 1) + ":59" });
    var idx = [];
    bands.forEach(function (bd, k) { for (var hh = bd.from; hh < bd.to; hh++) idx[hh] = k; });
    return { bands: bands, idx: idx };
  }

  // ---------- 数 ----------
  function num(v) {
    var s = norm(v).replace(/[,¥￥\\円個点件]/g, "").replace(/^▲/, "-").trim();
    if (s === "") return null;
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }

  // ---------- 集計 ----------
  // cols: {dt 日時, date 日付, time 時刻, no 注文番号, qty 点数, amt 金額}
  // o: {tz, bandMode, bandCustom, weekStart(0=日,1=月), from, to ("YYYY-MM-DD"), amtMode("sum"|"first")}
  function run(rows, cols, o) {
    o = o || {};
    var B = makeBands(o.bandMode || "1", o.bandCustom);
    if (B.err) return { err: B.err };
    var nb = B.bands.length, from = null, to = null;
    if (o.from) { var pf = parseDT(o.from); if (pf && !pf.err) from = pf.dn; }
    if (o.to) { var pt = parseDT(o.to); if (pt && !pt.err) to = pt.dn; }
    var errs = [], warns = [], orders = [], byNo = {}, outside = 0, blank = 0, tzConv = 0, qtyBad = [], amtBad = [];
    var hasQty = cols.qty != null, hasAmt = cols.amt != null, useNo = cols.no != null;
    rows.forEach(function (r, i) {
      var raw = cols.dt != null ? r[cols.dt] : joinDT(r[cols.date], cols.time != null ? r[cols.time] : "");
      var no = useNo ? norm(r[cols.no]) : "";
      var q = hasQty ? num(r[cols.qty]) : null, a = hasAmt ? num(r[cols.amt]) : null;
      if (hasQty && q !== null && isNaN(q)) { qtyBad.push({ i: i, raw: r[cols.qty] }); q = null; }
      if (hasAmt && a !== null && isNaN(a)) { amtBad.push({ i: i, raw: r[cols.amt] }); a = null; }
      var ord = useNo && no ? byNo[no] : null;
      if (ord) {   // 同じ注文の2行目以降：点数を足す。日時は1行目のもの
        ord.lines++;
        ord.qty += q || 0;
        if (hasAmt && o.amtMode !== "first") ord.amt += a || 0;
        var p2 = parseDT(raw, o);
        if (p2 && !p2.err && (p2.dn !== ord.dn || p2.h !== ord.h || p2.mi !== ord.mi) && !ord.warned) { warns.push({ i: i, no: no, err: "同じ注文番号で日時が違います（" + (ord.i + (o.hasHead === false ? 1 : 2)) + "行目の日時を使います）" }); ord.warned = 1; }
        return;
      }
      var p = parseDT(raw, o);
      if (!p) { blank++; return; }
      if (p.err) { errs.push({ i: i, no: no, raw: norm(raw), err: p.err }); return; }
      if ((from != null && p.dn < from) || (to != null && p.dn > to)) { outside++; if (useNo && no) byNo[no] = { skip: 1, lines: 1, qty: 0, amt: 0 }; return; }
      if (p.tz) tzConv++;
      var od = { i: i, no: no, dn: p.dn, y: p.y, m: p.m, d: p.d, h: p.h, mi: p.mi, hasTime: p.hasTime, wd: new Date(p.dn * 864e5).getUTCDay(), band: p.hasTime ? B.idx[p.h] : null, qty: q || 0, amt: a || 0, lines: 1 };
      orders.push(od);
      if (useNo && no) byNo[no] = od;
    });
    // 期間：指定がなければデータの最初の日〜最後の日
    var minD = null, maxD = null;
    orders.forEach(function (x) { if (minD === null || x.dn < minD) minD = x.dn; if (maxD === null || x.dn > maxD) maxD = x.dn; });
    var r0 = from != null ? from : minD, r1 = to != null ? to : maxD;
    var occ = [0, 0, 0, 0, 0, 0, 0], days = [], mons = [], monBy = {}, dayBy = {};
    var span = r0 != null && r1 != null ? r1 - r0 + 1 : 0, fill = span > 0 && span <= 3700;
    if (fill) for (var dn = r0; dn <= r1; dn++) {
      var wd = new Date(dn * 864e5).getUTCDay(); occ[wd]++;
      var f = fromDayNo(dn), dy = { dn: dn, date: ymdStr(f), wd: wd, cnt: 0, qty: 0, amt: 0 };
      days.push(dy); dayBy[dn] = dy;
      var mk = f.y + "-" + pad(f.m);
      if (!monBy[mk]) { monBy[mk] = { key: mk, days: 0, cnt: 0, qty: 0, amt: 0 }; mons.push(monBy[mk]); }
      monBy[mk].days++;
    }
    function zero() { var a = []; for (var w = 0; w < 7; w++) { a.push([]); for (var k = 0; k < nb; k++) a[w].push(0); } return a; }
    var M = { cnt: zero(), qty: zero(), amt: zero() }, noTime = { cnt: [0, 0, 0, 0, 0, 0, 0], qty: [0, 0, 0, 0, 0, 0, 0], amt: [0, 0, 0, 0, 0, 0, 0] };
    var tot = { cnt: 0, qty: 0, amt: 0 };
    orders.forEach(function (x) {
      if (x.hasTime) { M.cnt[x.wd][x.band]++; M.qty[x.wd][x.band] += x.qty; M.amt[x.wd][x.band] += x.amt; }
      else { noTime.cnt[x.wd]++; noTime.qty[x.wd] += x.qty; noTime.amt[x.wd] += x.amt; }
      tot.cnt++; tot.qty += x.qty; tot.amt += x.amt;
      var dy = dayBy[x.dn];
      if (dy) { dy.cnt++; dy.qty += x.qty; dy.amt += x.amt; var mk = dy.date.slice(0, 7); monBy[mk].cnt++; monBy[mk].qty += x.qty; monBy[mk].amt += x.amt; }
    });
    var ws = o.weekStart === 0 ? 0 : 1, order = [];
    for (var j = 0; j < 7; j++) order.push((ws + j) % 7);
    // 多い順の上位（件数）
    var cells = [];
    for (var w2 = 0; w2 < 7; w2++) for (var k2 = 0; k2 < nb; k2++) if (M.cnt[w2][k2]) cells.push({ wd: w2, band: k2, cnt: M.cnt[w2][k2], avg: occ[w2] ? M.cnt[w2][k2] / occ[w2] : null });
    cells.sort(function (p, q) { return q.cnt - p.cnt || order.indexOf(p.wd) - order.indexOf(q.wd) || p.band - q.band; });
    return {
      bands: B.bands, order: order, M: M, noTime: noTime, occ: occ, days: fill ? days : [], months: fill ? mons : [], span: span, fill: fill,
      range: r0 != null ? { from: ymdStr(fromDayNo(r0)), to: ymdStr(fromDayNo(r1)) } : null,
      orders: orders, errs: errs, warns: warns, qtyBad: qtyBad, amtBad: amtBad, top: cells.slice(0, 5), tot: tot,
      count: { rows: rows.length, orders: orders.length, err: errs.length, outside: outside, blank: blank, tz: tzConv, noTime: orders.filter(function (x) { return !x.hasTime; }).length, lines: rows.length - errs.length - blank - outside }
    };
  }

  // ---------- 列の推定 ----------
  var ROLES = [
    ["dt", /(注文|受注|購入|申込|受付|作成|登録|決済)?(日時|日付と時刻|タイムスタンプ)|timestamp|created.?at|ordered.?at|date ?time/i],
    ["date", /(注文|受注|購入|申込|受付)?(日|日付|年月日)$|^date$|order ?date/i],
    ["time", /(注文|受注|購入|申込|受付)?(時刻|時間)$|^time$/i],
    ["no", /(注文|受注|伝票|オーダー)(番号|no|ID|コード)|^order ?(no|id|number|#)|^(番号|伝票)$/i],
    ["qty", /数量|点数|個数|受注数|注文数|^数$|qty|quantity/i],
    ["amt", /金額|合計|売上|小計|総額|代金|amount|total|price/i]
  ];
  function guessColumns(headers) {
    var cols = {}, used = {};
    ROLES.forEach(function (rr) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i] || cols[rr[0]] != null) continue;
        if (rr[1].test(norm(headers[i]))) { cols[rr[0]] = i; used[i] = 1; return; }
      }
    });
    if (cols.dt != null) { delete cols.date; delete cols.time; }
    return cols;
  }
  // 見出しで分からないとき、値から日時の列を探す
  function guessByValues(rows, cols) {
    if (cols.dt != null || cols.date != null) return cols;
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0), best = null, bestN = 0;
    for (var c = 0; c < w; c++) {
      if (Object.keys(cols).some(function (k) { return cols[k] === c; })) continue;
      var n = 0, t = 0;
      rows.slice(0, 50).forEach(function (r) { var p = parseDT(r[c]); if (p && !p.err && !/^\d{5}(\.\d+)?$/.test(norm(r[c]))) { n++; if (p.hasTime) t++; } });
      if (n > bestN) { bestN = n; best = { c: c, t: t }; }
    }
    if (best && bestN >= Math.min(3, rows.length)) cols[best.t ? "dt" : "date"] = best.c;
    return cols;
  }
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, fmt: fmt, WD: WD, parseDT: parseDT, joinDT: joinDT, makeBands: makeBands, num: num, run: run, guessColumns: guessColumns, guessByValues: guessByValues, toCSV: toCSV, dayNo: dayNo, ymdStr: ymdStr, fromDayNo: fromDayNo };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.JUCHU = K;
})(this);
