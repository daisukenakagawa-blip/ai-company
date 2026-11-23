/* 記録の自己ベストと伸び — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  // 名前・種目を同じものとして扱うためのキー（空白の有無・全角半角・大文字小文字をそろえる）
  function keyOf(s) { return norm(s).replace(/[\s・]/g, "").toLowerCase().replace(/ｍ/g, "m"); }

  // ---------- 日付 ----------
  // 戻り値：{day（1970-01-01 からの日数）, label} か null
  function dayOf(y, m, d) {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, m - 1, d), dt = new Date(t);
    if (dt.getUTCMonth() !== m - 1) return null;
    return { day: Math.round(t / 864e5), label: y + "/" + m + "/" + d };
  }
  function dayLabel(day) { var t = new Date(day * 864e5); return t.getUTCFullYear() + "/" + (t.getUTCMonth() + 1) + "/" + t.getUTCDate(); }
  function dayIso(day) { var t = new Date(day * 864e5), m = t.getUTCMonth() + 1, d = t.getUTCDate(); return t.getUTCFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d; }
  // ctx.year：年のない日付の年。ctx.fiscal：年度（4月始まり）として 1〜3月を次の年にする
  function parseDate(v, ctx) {
    ctx = ctx || {};
    var s = norm(v).replace(/[（(][^）)]*[）)]/g, "").replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?$/, "").trim(), mm;
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = Math.floor(parseFloat(s));
      if (x > 20000 && x < 120000) return { day: x - 25569, label: dayLabel(x - 25569) };
      return null;
    }
    if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?$/))) return dayOf(+mm[1], +mm[2], +mm[3]);
    if ((mm = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return dayOf(+mm[1], +mm[2], +mm[3]);
    if ((mm = s.match(/^令和\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/))) return dayOf(2018 + (mm[1] === "元" ? 1 : +mm[1]), +mm[2], +mm[3]);
    if ((mm = s.match(/^R\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})$/i))) return dayOf(2018 + (+mm[1]), +mm[2], +mm[3]);
    if ((mm = s.match(/^(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?$/))) {
      var y = ctx.year || new Date().getFullYear(), m = +mm[1];
      if (ctx.fiscal && m <= 3) y += 1;
      return dayOf(y, m, +mm[2]);
    }
    return null;
  }

  // ---------- 記録 ----------
  // 記録なしとして扱う書き方（DNS・棄権など）
  var NONE_RE = /^(dns|dnf|dq|nm|nr|nt|ns|欠|欠場|欠席|休|休み|棄権|途中棄権|失格|記録なし|なし|計測なし|ファウル|f|x|×|✕|-|－|—|―|ー|―)$/i;
  function decimalsOf(str) { var m = String(str).match(/\.(\d+)$/); return m ? m[1].length : 0; }
  // 中の「(+1.5)」「（-0.3）」を風として取り出す
  function splitWind(s) {
    var mm = s.match(/^(.*?)\s*[(\[]\s*(?:風\s*)?([+-]?\d+(?:\.\d+)?)\s*(?:m\/?s)?\s*[)\]]\s*$/i);
    if (mm) return { s: mm[1].trim(), wind: parseFloat(mm[2]) };
    return { s: s, wind: null };
  }
  // タイム（小さいほど良い）を千分の1秒の整数で読む
  function parseTime(s) {
    var mm, ms, dec = 0;
    s = s.replace(/[″"]/g, ".").replace(/[′']/g, ":").replace(/\s/g, "");
    // 1時間02分03秒4 / 1時間2分3秒
    if ((mm = s.match(/^(\d+)時間(\d{1,2})分(\d{1,2})(?:秒(\d+)?)?$/))) { ms = (+mm[1] * 3600 + +mm[2] * 60 + +mm[3]) * 1000 + frac(mm[4]); dec = mm[4] ? mm[4].length : 0; }
    // 1分05秒20 / 1分5秒 / 1分05.20 / 1分05秒
    else if ((mm = s.match(/^(\d+)分(\d{1,2})(?:[.秒](\d+)?)?秒?$/))) { ms = (+mm[1] * 60 + +mm[2]) * 1000 + frac(mm[3]); dec = mm[3] ? mm[3].length : 0; }
    // 12秒34 / 12秒
    else if ((mm = s.match(/^(\d+)秒(\d+)?$/))) { ms = +mm[1] * 1000 + frac(mm[2]); dec = mm[2] ? mm[2].length : 0; }
    // 1:02:03.4（時:分:秒）
    else if ((mm = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/))) { ms = (+mm[1] * 3600 + +mm[2] * 60 + +mm[3]) * 1000 + frac(mm[4]); dec = mm[4] ? mm[4].length : 0; }
    // 1:05.20 / 1:05
    else if ((mm = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/))) { if (+mm[2] >= 60) return null; ms = (+mm[1] * 60 + +mm[2]) * 1000 + frac(mm[3]); dec = mm[3] ? mm[3].length : 0; }
    // 1.05.20（分.秒.1/100秒）
    else if ((mm = s.match(/^(\d+)\.(\d{2})\.(\d{1,3})$/))) { if (+mm[2] >= 60) return null; ms = (+mm[1] * 60 + +mm[2]) * 1000 + frac(mm[3]); dec = mm[3].length; }
    // 12.34 / 65.2 / 12
    else if ((mm = s.match(/^(\d+)(?:\.(\d+))?秒?$/))) { ms = +mm[1] * 1000 + frac(mm[2]); dec = mm[2] ? mm[2].length : 0; }
    else return null;
    return { v: ms, dec: Math.min(dec, 3) };
    function frac(d) { if (!d) return 0; return Math.round(parseFloat("0." + d) * 1000); }
  }
  // 距離・高さ・回数・点数（大きいほど良い）を千分の1の整数で読む
  function parseBig(s) {
    var mm, v, dec = 0, unit = "";
    s = s.replace(/\s/g, "").replace(/,/g, "");
    // 5m20 / 5m20cm / 5m5
    if ((mm = s.match(/^(\d+)m(\d{1,2})(?:cm)?$/i))) { v = +mm[1] + +mm[2] / 100; dec = 2; unit = "m"; }
    else if ((mm = s.match(/^(\d+(?:\.\d+)?)cm$/i))) { v = parseFloat(mm[1]) / 100; dec = Math.max(2, decimalsOf(mm[1]) + 2); unit = "m"; }
    else if ((mm = s.match(/^(\d+(?:\.\d+)?)m$/i))) { v = parseFloat(mm[1]); dec = decimalsOf(mm[1]); unit = "m"; }
    else if ((mm = s.match(/^(\d+(?:\.\d+)?)(回|点|本|個|kg|秒)?$/i))) { v = parseFloat(mm[1]); dec = decimalsOf(mm[1]); unit = mm[2] || ""; }
    else return null;
    return { v: Math.round(v * 1000), dec: Math.min(dec, 3), unit: unit };
  }
  // 記録の欄を読む。dir="low"（タイム）/"high"（距離・回数）
  // 戻り値：{st:"ok", v, dec, unit, wind} / {st:"none", label} / {st:"bad"} / null（空欄）
  function readRecord(raw, dir) {
    var s = norm(raw);
    if (!s) return null;
    var w = splitWind(s);
    s = w.s;
    if (NONE_RE.test(s)) return { st: "none", label: s };
    var r = dir === "high" ? parseBig(s) : parseTime(s);
    if (!r) return { st: "bad" };
    r.st = "ok"; r.wind = w.wind;
    return r;
  }
  // 種目名から良い方向を推定（距離・高さ・回数は大きいほど良い）
  var HIGH_RE = /跳|投|砲|やり|槍|円盤|ハンマー|ボール|回数|握力|反復|上体起こし|長座|前屈|シャトル|けんすい|懸垂|腕立て|縄跳|なわとび|リフティング|点数|得点|距離|高さ|飛距離|スロー|ジャンプ|ゴール数|本数/i;
  function guessDir(eventName, samples) {
    var s = norm(eventName);
    if (HIGH_RE.test(s)) return "high";
    if ((samples || []).some(function (x) { return /:|分|秒|'|"|′|″/.test(norm(x)); })) return "low";
    if ((samples || []).some(function (x) { return /\dm\d|cm$|回$|点$/i.test(norm(x).replace(/\s/g, "")); })) return "high";
    return "low";
  }

  // ---------- 表示用 ----------
  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
  function fmtTime(ms, dec) {
    var neg = ms < 0; ms = Math.abs(ms);
    var unit = Math.pow(10, 3 - dec), q = Math.round(ms / unit) * unit;
    var totalS = Math.floor(q / 1000), f = q % 1000;
    var h = Math.floor(totalS / 3600), m = Math.floor(totalS % 3600 / 60), sec = totalS % 60;
    var fs = dec > 0 ? "." + pad(Math.round(f / unit), dec) : "";
    var out = h > 0 ? h + ":" + pad(m, 2) + ":" + pad(sec, 2) + fs : m > 0 ? m + ":" + pad(sec, 2) + fs : sec + fs;
    return (neg ? "-" : "") + out;
  }
  function fmtNum(v, dec) { return (v / 1000).toFixed(dec); }
  function fmtVal(v, ev) {
    if (v == null) return "";
    if (ev.dir === "low") return fmtTime(v, ev.dec);
    return fmtNum(v, ev.dec) + (ev.unit === "m" ? "m" : ev.unit && ev.unit !== "秒" ? ev.unit : "");
  }
  // 伸び（良くなった量。正＝良くなった）を言葉にする
  function fmtGain(g, ev) {
    if (g == null) return "";
    if (g === 0) return "同じ";
    var a = Math.abs(g);
    if (ev.dir === "low") return (a >= 60000 ? fmtTime(a, ev.dec) : fmtNum(a, ev.dec)) + "秒" + (g > 0 ? "短縮" : "遅い");
    var u = ev.unit === "m" ? "m" : ev.unit && ev.unit !== "秒" ? ev.unit : "";
    return (g > 0 ? "+" : "-") + fmtNum(a, ev.dec) + u;
  }
  // CSV・Excel 用の数値（タイムは秒、距離は m などそのまま）
  function numOut(v, ev) { return v == null ? "" : +(v / 1000).toFixed(ev.dec); }

  // ---------- 列の推定 ----------
  var COLS = {
    date: /^(日付|日|年月日|実施日|測定日|記録日|大会日|開催日|date)$|日付|測定日|実施日/i,
    name: /^(名前|氏名|選手|選手名|生徒|児童|名|name|なまえ)$|氏名|選手名|名前/i,
    event: /^(種目|競技|項目|種別|event|測定項目)$|種目/i,
    rec: /^(記録|タイム|結果|time|record|成績|測定値|値)$|記録|タイム/i,
    wind: /^(風|風速|wind|追風|追い風)$|風速/i,
    group: /^(組|学年|クラス|チーム|性別|所属|部|学校|class|team|男女|区分)$|学年|クラス|所属/i,
    meet: /^(大会|大会名|記録会|会|meet|試合|練習会|回|場所|会場)$|大会|記録会/i
  };
  function guessCols(headers) {
    var c = {}, used = {};
    ["rec", "date", "name", "event", "wind", "group", "meet"].forEach(function (k) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        var h = norm(headers[i]);
        if (k === "rec" && /風|記録会|記録日|大会|回数$/.test(h) && !/^(記録|回数)$/.test(h)) continue;
        if (COLS[k].test(h)) { c[k] = i; used[i] = 1; return; }
      }
    });
    return c;
  }
  // 1行に1人（種目が横）の表で、種目らしい列（記録の書かれた列）を選ぶ
  function guessEventCols(headers, rows, cols) {
    var skip = {}; ["date", "name", "group", "meet", "wind"].forEach(function (k) { if (cols[k] != null) skip[cols[k]] = 1; });
    var out = [];
    headers.forEach(function (h, i) {
      if (skip[i]) return;
      var hn = norm(h);
      if (/^(番号|no\.?|#|備考|メモ|ふりがな|フリガナ|よみ|読み|性別|合計|平均|順位|総合|得点合計)$/i.test(hn)) return;
      var vals = rows.map(function (r) { return norm(r[i]); }).filter(Boolean);
      if (!vals.length) return;
      var ok = vals.filter(function (v) { return /\d/.test(v) || NONE_RE.test(v); }).length;
      if (ok / vals.length >= 0.6) out.push(i);
    });
    return out;
  }
  function guessShape(headers, rows) {
    var c = guessCols(headers);
    if (c.event != null && c.rec != null) return "long";
    return guessEventCols(headers, rows, c).length >= 2 ? "wide" : "long";
  }

  // ---------- 表から記録の一覧を作る ----------
  // o: {shape, cols, eventCols, headers, year, fiscal, fixedEvent}
  // 戻り値：[{row, day, dayLabel, seq, name, nkey, group, meet, event, ekey, raw, windRaw}]
  function toEntries(headers, rows, o) {
    var c = o.cols || {}, out = [], ctx = { year: o.year, fiscal: o.fiscal }, seq = 0, lastName = "", badDates = [];
    rows.forEach(function (r, ri) {
      var name = c.name != null ? norm(r[c.name]) : "";
      if (!name) return;
      if (/^(合計|平均|計|小計|最高|最低)$/.test(name)) return;
      var d = null;
      if (c.date != null) {
        var dv = norm(r[c.date]);
        if (dv) { d = parseDate(dv, ctx); if (!d) badDates.push({ row: ri, value: dv }); }
      }
      var base = { row: ri, day: d ? d.day : null, dayLabel: d ? d.label : (c.date != null ? norm(r[c.date]) : ""), name: name, nkey: keyOf(name),
        group: c.group != null ? norm(r[c.group]) : "", meet: c.meet != null ? norm(r[c.meet]) : "" };
      if (o.shape === "wide") {
        (o.eventCols || []).forEach(function (ci) {
          var raw = norm(r[ci]);
          if (!raw) return;
          out.push(Object.assign({}, base, { seq: seq++, event: norm(headers[ci]), ekey: keyOf(headers[ci]), raw: raw, windRaw: "" }));
        });
      } else {
        var ev = c.event != null ? norm(r[c.event]) : norm(o.fixedEvent || "記録");
        var raw = c.rec != null ? norm(r[c.rec]) : "";
        if (!ev || !raw) return;
        out.push(Object.assign({}, base, { seq: seq++, event: ev, ekey: keyOf(ev), raw: raw, windRaw: c.wind != null ? norm(r[c.wind]) : "" }));
      }
    });
    out.badDates = badDates;
    return out;
  }

  // 種目の一覧と、推定した方向
  function eventsOf(entries) {
    var map = {}, list = [];
    entries.forEach(function (e) {
      var ev = map[e.ekey];
      if (!ev) { ev = map[e.ekey] = { key: e.ekey, name: e.event, samples: [], n: 0 }; list.push(ev); }
      ev.n++;
      if (ev.samples.length < 30) ev.samples.push(e.raw);
    });
    list.forEach(function (ev) { ev.guess = guessDir(ev.name, ev.samples); });
    return list;
  }

  // ---------- 集計 ----------
  // o: {dirs:{ekey:"low"|"high"}, windLimit (null なら風を見ない), limit (人数)}
  function run(entries, o) {
    o = o || {};
    var dirs = o.dirs || {}, windLimit = o.windLimit == null ? null : o.windLimit;
    var limit = o.limit || Infinity;
    // 人の並び（最初に出た順）。お試し版はここで人数を制限
    var people = [], pmap = {};
    entries.forEach(function (e) {
      if (!pmap[e.nkey]) { pmap[e.nkey] = { key: e.nkey, name: e.name, group: e.group, idx: people.length }; people.push(pmap[e.nkey]); }
      else if (!pmap[e.nkey].group && e.group) pmap[e.nkey].group = e.group;
    });
    var cut = people.length > limit;
    var allowed = {}; people.slice(0, limit).forEach(function (p) { allowed[p.key] = 1; });
    var evs = {}, evList = [];
    var recs = [], bad = [], noneN = 0;
    entries.forEach(function (e) {
      if (!allowed[e.nkey]) return;
      var dir = dirs[e.ekey] || guessDir(e.event, [e.raw]);
      var ev = evs[e.ekey];
      if (!ev) { ev = evs[e.ekey] = { key: e.ekey, name: e.event, dir: dir, dec: 0, unit: "", n: 0 }; evList.push(ev); }
      var r = readRecord(e.raw, dir);
      if (!r) return;
      var wind = r.wind != null ? r.wind : null;
      if (e.windRaw) { var wv = parseFloat(norm(e.windRaw).replace(/m\/?s$/i, "").replace(/^\+/, "")); if (!isNaN(wv)) wind = wv; }
      var rec = { e: e, ev: ev, st: r.st, v: r.st === "ok" ? r.v : null, wind: wind, label: r.label || "" };
      if (r.st === "ok") {
        ev.dec = Math.max(ev.dec, r.dec);
        if (r.unit && !ev.unit) ev.unit = r.unit;
        rec.aided = windLimit != null && wind != null && wind > windLimit;
        ev.n++;
      } else if (r.st === "bad") bad.push({ row: e.row, name: e.name, event: e.event, value: e.raw, day: e.dayLabel });
      else noneN++;
      recs.push(rec);
    });
    function better(a, b, ev) { return ev.dir === "low" ? a < b : a > b; }
    function gain(from, to, ev) { return ev.dir === "low" ? from - to : to - from; }
    // 人×種目ごとに、日付→元の順で並べて自己ベストを追う
    var pairs = {}, pairList = [];
    recs.forEach(function (rc) {
      var k = rc.e.nkey + "\u0001" + rc.ev.key, P = pairs[k];
      if (!P) { P = pairs[k] = { key: k, person: pmap[rc.e.nkey], ev: rc.ev, recs: [] }; pairList.push(P); }
      P.recs.push(rc);
    });
    var noDate = recs.some(function (rc) { return rc.e.day == null; });
    function ord(a, b) {
      var da = a.e.day, db = b.e.day;
      if (da != null && db != null && da !== db) return da - db;
      if (da == null && db != null) return 1;
      if (da != null && db == null) return -1;
      return a.e.seq - b.e.seq;
    }
    pairList.forEach(function (P) {
      P.recs.sort(ord);
      var best = null, prev = null, first = null, n = 0, pbN = 0;
      P.recs.forEach(function (rc) {
        if (rc.st !== "ok") { rc.mark = rc.st === "bad" ? "読めない" : "記録なし"; return; }
        n++;
        rc.diffPrev = prev != null ? gain(prev.v, rc.v, P.ev) : null;
        rc.prevBest = best ? best.v : null;
        if (rc.aided) { rc.mark = "追い風参考"; prev = rc; return; }
        if (!best) { rc.mark = "初記録"; best = rc; first = rc; }
        else if (better(rc.v, best.v, P.ev)) { rc.mark = "自己ベスト"; rc.diffBest = gain(best.v, rc.v, P.ev); best = rc; pbN++; P.lastPB = rc; }
        else if (rc.v === best.v) { rc.mark = "タイ"; rc.diffBest = 0; }
        else { rc.mark = ""; rc.diffBest = gain(best.v, rc.v, P.ev); }
        prev = rc;
      });
      var oks = P.recs.filter(function (rc) { return rc.st === "ok"; });
      P.n = n; P.nAll = P.recs.length; P.best = best; P.first = first; P.pbN = pbN;
      P.last = oks.length ? oks[oks.length - 1] : null;
      P.gainTotal = best && first ? gain(first.v, best.v, P.ev) : null;
      P.lastIsPB = !!(P.last && P.last.mark === "自己ベスト");
    });
    // 並び：人の順 → 種目の順
    var evIdx = {}; evList.forEach(function (ev, i) { evIdx[ev.key] = i; });
    pairList.sort(function (a, b) { return a.person.idx - b.person.idx || evIdx[a.ev.key] - evIdx[b.ev.key]; });
    // 日ごと（大会ごと）
    var dmap = {}, days = [];
    recs.forEach(function (rc) {
      var k = (rc.e.day != null ? rc.e.day : "?" + rc.e.dayLabel) + "\u0001" + rc.e.meet, D = dmap[k];
      if (!D) { D = dmap[k] = { key: k, day: rc.e.day, label: rc.e.day != null ? dayLabel(rc.e.day) : (rc.e.dayLabel || "（日付なし）"), meet: rc.e.meet, n: 0, people: {}, pb: [], first: 0, none: 0 }; days.push(D); }
      D.n++; D.people[rc.e.nkey] = 1;
      if (rc.mark === "自己ベスト") D.pb.push(rc);
      if (rc.mark === "初記録") D.first++;
      if (rc.st !== "ok") D.none++;
    });
    days.forEach(function (D) { D.peopleN = Object.keys(D.people).length; delete D.people; });
    days.sort(function (a, b) { return (a.day == null) - (b.day == null) || (a.day || 0) - (b.day || 0) || (a.meet < b.meet ? -1 : a.meet > b.meet ? 1 : 0); });
    // 種目ごとの順位（自己ベストの良い順。同じ記録は同じ順位）
    var ranks = evList.map(function (ev) {
      var list = pairList.filter(function (P) { return P.ev === ev && P.best; }).slice();
      list.sort(function (a, b) { return ev.dir === "low" ? a.best.v - b.best.v : b.best.v - a.best.v; });
      var rk = 0, prevV = null;
      list.forEach(function (P, i) { if (P.best.v !== prevV) { rk = i + 1; prevV = P.best.v; } P.rank = rk; });
      return { ev: ev, list: list };
    });
    var pbTotal = recs.filter(function (rc) { return rc.mark === "自己ベスト"; }).length;
    return { people: people.slice(0, limit), peopleAll: people.length, cut: cut, events: evList, recs: recs, pairs: pairList, days: days, ranks: ranks,
      bad: bad, noneN: noneN, okN: recs.filter(function (rc) { return rc.st === "ok"; }).length, pbTotal: pbTotal, noDate: noDate,
      badDates: entries.badDates || [] };
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, keyOf: keyOf, parseDate: parseDate, dayLabel: dayLabel, dayIso: dayIso,
    parseTime: parseTime, parseBig: parseBig, readRecord: readRecord, guessDir: guessDir, fmtTime: fmtTime, fmtVal: fmtVal, fmtGain: fmtGain, numOut: numOut,
    guessCols: guessCols, guessEventCols: guessEventCols, guessShape: guessShape, toEntries: toEntries, eventsOf: eventsOf, run: run, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = K;
  else root.KIROKU = K;
})(this);
