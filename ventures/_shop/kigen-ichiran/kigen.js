/* 期限の一覧 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
    text = String(text).replace(/^\ufeff/, "");
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
  function clean(s) { return String(s == null ? "" : s).replace(/[\s\u3000]+/g, " ").trim(); }

  // ---------- 日付 ----------
  // 日付は「1970-01-01 からの日数」（整数）で持つ。時差の影響を受けない
  function dayNum(y, m, d) {
    var t = Date.UTC(y, m - 1, d), dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(t / 864e5);
  }
  function ymdOf(n) { var d = new Date(n * 864e5); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
  function iso(n) { var a = ymdOf(n); return a[0] + "-" + ("0" + a[1]).slice(-2) + "-" + ("0" + a[2]).slice(-2); }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function wday(n) { return WD[new Date(n * 864e5).getUTCDay()]; }
  function jp(n) { var a = ymdOf(n); return a[0] + "/" + a[1] + "/" + a[2] + "（" + wday(n) + "）"; }
  var ERA = { "令和": 2018, "R": 2018, "平成": 1988, "H": 1988, "昭和": 1925, "S": 1925 };

  // 日付として読む。返り値 { n: 日数, note: 注意 } / null（空欄）/ { err: 理由 }
  function parseDate(v) {
    var raw = norm(v);
    if (raw === "" || raw === "-" || raw === "ー" || raw === "―" || raw === "なし") return null;
    var s = raw.replace(/[（(][日月火水木金土祝]{1,2}[)）]/g, "").replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, "").replace(/まで$/, "").trim();
    var m, y, n, note = "";
    if ((m = s.match(/^(令和|平成|昭和|R|H|S)\s*(\d{1,2}|元)\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})\s*日?$/i))) {
      y = ERA[m[1].toUpperCase()] + (m[2] === "元" ? 1 : +m[2]);
      n = dayNum(y, +m[3], +m[4]);
    } else if ((m = s.match(/^(\d{4})\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})\s*日?$/))) {
      n = dayNum(+m[1], +m[2], +m[3]);
    } else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
      n = dayNum(+m[1], +m[2], +m[3]);
    } else if ((m = s.match(/^(令和|平成|昭和|R|H|S)?\s*(\d{4}|\d{1,2}|元)\s*[年.\/\-]\s*(\d{1,2})\s*月?$/i)) && (m[1] || m[2].length === 4)) {
      y = m[1] ? ERA[m[1].toUpperCase()] + (m[2] === "元" ? 1 : +m[2]) : +m[2];
      if (+m[3] >= 1 && +m[3] <= 12) { n = dayNum(y, +m[3] + 1 > 12 ? 1 : +m[3] + 1, 1); if (+m[3] === 12) n = dayNum(y + 1, 1, 1); if (n != null) n -= 1; note = "日がないため月末として計算"; }
    } else if ((m = s.match(/^(\d{5})(\.\d+)?$/)) && +m[1] >= 25569 && +m[1] <= 73050) {
      n = +m[1] - 25569; note = "Excel の日付の番号（" + m[1] + "）として読みました";
    } else {
      return { err: "日付として読めない（" + raw + "）" };
    }
    if (n == null) return { err: "ない日付（" + raw + "）" };
    return { n: n, note: note };
  }
  // 「30」「30日」「30日前」「1か月」「2ヶ月前」→ 日数。空欄は null、読めなければ NaN
  function parseDays(v) {
    var s = norm(v).replace(/前$/, "").replace(/から$/, "").trim(), m;
    if (s === "") return null;
    if ((m = s.match(/^(\d+)\s*日?$/))) return +m[1];
    if ((m = s.match(/^(\d+)\s*(か月|ヶ月|ケ月|カ月|箇月|ヵ月|月)$/))) return +m[1] * 30;
    if ((m = s.match(/^(\d+)\s*週間?$/))) return +m[1] * 7;
    return NaN;
  }
  // 「済み」の列：空欄・「未」「×」「いいえ」「0」「-」などは未、ほかは済み
  function isDone(v) {
    var s = norm(v);
    if (s === "") return false;
    return !/^(未|未了|未対応|未完了|未更新|まだ|×|✕|x|no|false|0|-|ー|―|いいえ|未提出)$/i.test(s);
  }

  // ---------- 列の推定 ----------
  var ROLES = [
    ["done", /済|完了|対応状況|状況|ステータス|status|done/i],
    ["lead", /何日前|日前|通知|知らせ|リマインド|予告|lead/i],
    ["who", /担当|責任者|管理者|所有者|持ち主|氏名|社員|owner|担当者/i],
    ["cat", /区分|種類|種別|分類|カテゴリ|category|type/i],
    ["memo", /備考|メモ|注意|補足|note|memo/i],
    ["name", /項目|件名|品名|名称|資格|契約|物件|車両|設備|商品|内容|item|name/i]
  ];
  var DATE_RE = /期限|期日|満了|有効|更新日|更新予定|締切|締め切り|しめきり|車検|点検日|交換日|有効期限|賞味|消費|使用期限|expire|due|deadline|期日|終了日|まで/i;
  function guessColumns(headers, rows) {
    var cols = { dates: [] }, used = {};
    headers.forEach(function (h, i) { if (DATE_RE.test(norm(h)) && !/何日前|日前|通知|済|完了/.test(norm(h))) { cols.dates.push(i); used[i] = 1; } });
    if (!cols.dates.length && rows && rows.length) {
      // 見出しで決まらないときは、中身の半分以上が日付として読める列
      headers.forEach(function (h, i) {
        var ok = 0, all = 0;
        rows.slice(0, 50).forEach(function (r) { var p = parseDate(r[i]); if (p) { all++; if (!p.err) ok++; } });
        if (all && ok / all >= 0.5 && !/^\d+$/.test(norm(rows[0][i]))) { cols.dates.push(i); used[i] = 1; }
      });
    }
    ROLES.forEach(function (rr) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (rr[1].test(norm(headers[i]))) { cols[rr[0]] = i; used[i] = 1; return; }
      }
    });
    if (cols.name == null) for (var i = 0; i < headers.length; i++) if (!used[i]) { cols.name = i; break; }
    return cols;
  }

  // ---------- 一覧を作る ----------
  // opt: { base: 基準日の日数, soon: 「もうすぐ」の日数, next: 「近いうち」の日数 }
  var BUCKETS = [["over", "期限切れ"], ["soon", "もうすぐ"], ["next", "近いうち"], ["later", "先"], ["done", "済み"]];
  function build(rows, headers, cols, opt) {
    var items = [], errs = [], blank = [];
    var multi = cols.dates.length > 1;
    rows.forEach(function (r, i) {
      function get(k) { return cols[k] == null ? "" : clean(r[cols[k]]); }
      var name = get("name"), any = r.some(function (v) { return clean(v) !== ""; });
      if (!any) return;
      var lead = cols.lead == null ? null : parseDays(r[cols.lead]), leadNote = "";
      if (lead != null && isNaN(lead)) { leadNote = "何日前の欄が読めないため " + opt.soon + " 日で計算（" + norm(r[cols.lead]) + "）"; lead = null; }
      var done = cols.done == null ? false : isDone(r[cols.done]);
      var got = 0;
      cols.dates.forEach(function (ci) {
        var p = parseDate(r[ci]), kind = multi ? clean(headers[ci]) : "";
        if (p == null) return;
        got++;
        var base = { i: i, name: name, kind: kind, cat: get("cat"), who: get("who"), memo: get("memo"), doneText: get("done") };
        if (p.err) { base.err = p.err; errs.push(base); return; }
        var warn = lead != null ? lead : opt.soon;
        var x = base; x.date = p.n; x.days = p.n - opt.base; x.warn = warn; x.lead = lead;
        x.notes = [p.note, leadNote].filter(Boolean);
        x.done = done;
        if (done) x.b = "done";
        else if (x.days < 0) x.b = "over";
        else if (x.days <= warn) x.b = "soon";
        else if (x.days <= Math.max(opt.next, warn)) x.b = "next";
        else x.b = "later";
        x.notice = p.n - warn; // 知らせ始める日
        items.push(x);
      });
      if (!got) blank.push({ i: i, name: name });
    });
    items.sort(function (a, b) { return a.date - b.date || a.i - b.i; });
    var count = { over: 0, soon: 0, next: 0, later: 0, done: 0, err: errs.length, blank: blank.length, total: items.length };
    items.forEach(function (x) { count[x.b]++; });
    return { items: items, errs: errs, blank: blank, count: count };
  }
  function daysText(x) {
    if (x.days < 0) return -x.days + " 日過ぎ";
    if (x.days === 0) return "今日";
    return "あと " + x.days + " 日";
  }

  // ---------- 保存 ----------
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  // ---------- カレンダー（.ics） ----------
  function icsEsc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  // 1行 75 バイトごとに折り返す（UTF-8 の文字の途中では切らない）
  function fold(line) {
    var out = [], cur = "", bytes = 0, limit = 75;
    for (var k = 0; k < line.length; k++) {
      var ch = line[k], code = line.charCodeAt(k);
      if (code >= 0xd800 && code <= 0xdbff && k + 1 < line.length) { ch += line[++k]; }
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function hash(s) { var h = 5381; for (var k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0; return h.toString(36); }
  function d8(n) { return iso(n).replace(/-/g, ""); }
  // opt: { alarm: 日数 or null, notice: true なら「知らせ始める日」も予定にする, stamp: "20261122T000000Z" }
  function toICS(items, opt) {
    opt = opt || {};
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GENHAYL//kigen-ichiran//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:期限の一覧"];
    var stamp = opt.stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    items.forEach(function (x) {
      var title = x.name + (x.kind ? "（" + x.kind + "）" : "");
      var desc = [x.cat ? "区分：" + x.cat : "", x.who ? "担当：" + x.who : "", x.memo ? "備考：" + x.memo : "", "期限：" + jp(x.date)].filter(Boolean).join("\n");
      function ev(day, sum, tag, alarm) {
        L.push("BEGIN:VEVENT", "UID:" + hash(tag + "|" + x.i + "|" + title + "|" + x.date) + "-" + tag + "@genhayl-shop.pages.dev", "DTSTAMP:" + stamp,
          "DTSTART;VALUE=DATE:" + d8(day), "DTEND;VALUE=DATE:" + d8(day + 1), "SUMMARY:" + icsEsc(sum), "DESCRIPTION:" + icsEsc(desc), "TRANSP:TRANSPARENT");
        if (alarm != null) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(sum), "TRIGGER:-P" + alarm + "D", "END:VALARM");
        L.push("END:VEVENT");
      }
      ev(x.date, "【期限】" + title, "d", opt.alarm);
      if (opt.notice && x.warn > 0 && x.notice > (opt.base == null ? -Infinity : opt.base - 1)) ev(x.notice, "【" + x.warn + "日前】" + title + "（期限 " + jp(x.date) + "）", "n", null);
    });
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, parseDate: parseDate, parseDays: parseDays, isDone: isDone, dayNum: dayNum, iso: iso, jp: jp, wday: wday,
    guessColumns: guessColumns, build: build, daysText: daysText, BUCKETS: BUCKETS, toCSV: toCSV, toICS: toICS, fold: fold };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KIGEN = api;
})(this);
