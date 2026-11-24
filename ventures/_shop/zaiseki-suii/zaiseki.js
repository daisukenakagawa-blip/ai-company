/* 在籍人数の月ごとの推移 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var E = root.Eigyo || (typeof require !== "undefined" ? require("./eigyo.js") : null);

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
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n") + "\r\n";
  }

  // ---------- 日付 ----------
  function dn(y, m, d) { return E.dn(y, m, d); }
  function ymd(n) { return E.ymd(n); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function fmt(n) { var t = ymd(n); return t.y + "/" + t.m + "/" + t.d; }
  function months(y, m, k) {
    var a = [];
    for (var i = 0; i < k; i++) { var yy = y + Math.floor((m - 1 + i) / 12), mm = (m - 1 + i) % 12 + 1; a.push({ y: yy, m: mm, a: dn(yy, mm, 1), b: dn(yy, mm, dim(yy, mm)) }); }
    return a;
  }
  function mIndex(n) { var t = ymd(n); return t.y * 12 + t.m - 1; }
  /* 日付1つ。end=true のとき「2026/4」のような月だけの書き方を月末にする */
  function oneDate(s, end) {
    s = norm(s).replace(/\s*[\(（][^)）]*[\)）]\s*$/, "");
    if (!s) return { empty: true };
    var m = s.match(/^(\d{4})\s*[\/\-\.年]\s*(\d{1,2})\s*月?$/) || s.match(/^(\d{4})(\d{2})$/);
    var era = s.match(/^(令和|平成|R|H)\s*(\d{1,2}|元)\s*[年\.\/\-]\s*(\d{1,2})\s*月?$/i);
    if (era) { var base = /^(令和|R)$/i.test(era[1]) ? 2018 : 1988; m = [s, String(base + (era[2] === "元" ? 1 : +era[2])), era[3]]; }
    if (m && +m[2] >= 1 && +m[2] <= 12) { var y = +m[1], mo = +m[2]; return { n: end ? dn(y, mo, dim(y, mo)) : dn(y, mo, 1), monthOnly: true }; }
    var r = E.parseDate(s);
    if (r.n == null) return { bad: true, why: r.why || "日付として読めない" };
    return { n: r.n };
  }
  /* 休会の期間：「2026/5/1〜2026/7/31」「2026/5〜7」「2026/5〜」。複数は「、」「;」改行で区切る */
  function parseSpans(s) {
    var out = [], bad = [];
    norm(String(s == null ? "" : s).replace(/\r?\n/g, "、")).split(/\s*[、;；]\s*|\s*,\s*(?=\d{4}|令和|平成)/).forEach(function (part) {
      part = part.replace(/^休会\s*[:：]?\s*/, "").trim();
      if (!part) return;
      var mm = part.split(/\s*(?:〜|~|～|から|ー|―)\s*/);
      if (mm.length > 2) { bad.push(part); return; }
      var a = oneDate(mm[0], false);
      if (a.n == null) { bad.push(part); return; }
      var b = { n: null };
      if (mm.length === 2 && norm(mm[1]).replace(/まで$/, "")) {
        var t = norm(mm[1]).replace(/まで$/, ""), ya = ymd(a.n);
        if (/^\d{1,2}$/.test(t) || /^\d{1,2}月$/.test(t)) { var mo = parseInt(t, 10); var yy = mo < ya.m ? ya.y + 1 : ya.y; b = mo >= 1 && mo <= 12 ? { n: dn(yy, mo, dim(yy, mo)) } : { bad: true }; }
        else if (/^\d{1,2}\/\d{1,2}$/.test(t)) { var p = t.split("/"), yy2 = +p[0] < ya.m ? ya.y + 1 : ya.y; b = oneDate(yy2 + "/" + t, true); }
        else b = oneDate(t, true);
        if (b.n == null) { bad.push(part); return; }
      } else if (mm.length === 1) {
        if (a.monthOnly) b = { n: oneDate(mm[0], true).n }; // 「2026/5」だけなら5月の1か月
        else { bad.push(part); return; }                    // 日付1つだけでは期間にならない
      }
      if (b.n != null && b.n < a.n) { bad.push(part); return; }
      out.push({ a: a.n, b: b.n, text: part });
    });
    return { spans: out, bad: bad };
  }

  // ---------- 列の推定 ----------
  var PAT = {
    join: /(入会|入塾|入校|入部|入団|入所|入園|入社|加入|登録日|開始日|受講開始)/,
    leave: /(退会|退塾|退校|退部|退団|退所|退園|退社|脱退|終了日|受講終了)/,
    ks: /休会.*(開始|始|から|自)|休会日/,
    ke: /休会.*(終了|終|まで|至|復帰)|復帰/,
    kt: /休会/,
    group: /(コース|クラス|科目|教室|種別|部門|講座|学年|校舎|所属|組)/,
    name: /(氏名|名前|生徒|会員|児童|メンバー|部員|お名前)/
  };
  function guessCols(headers) {
    var g = {}, used = {};
    function pick(k, test) { for (var i = 0; i < headers.length; i++) { if (used[i]) continue; if (test(norm(headers[i]))) { g[k] = i; used[i] = 1; return; } } }
    pick("join", function (h) { return PAT.join.test(h) && !/日数|回数|理由|金/.test(h); });
    pick("leave", function (h) { return PAT.leave.test(h) && !/日数|回数|理由|金/.test(h); });
    pick("ks", function (h) { return PAT.ks.test(h); });
    pick("ke", function (h) { return PAT.ke.test(h); });
    pick("kt", function (h) { return PAT.kt.test(h) && !/理由|回数|金/.test(h); });
    pick("name", function (h) { return PAT.name.test(h) && !/番号|ID|No|かな|カナ|ふりがな|フリガナ/i.test(h); });
    pick("group", function (h) { return PAT.group.test(h) && !/日|名前/.test(h); });
    if (g.name == null) pick("name", function (h) { return /名/.test(h) && !/かな|カナ/.test(h); });
    if (g.name == null) pick("name", function () { return true; });
    return g;
  }

  // ---------- 計算 ----------
  /* o: {cols, y, m, k, kyuIn:true(休会中も在籍に数える), limit, rowBase} */
  function run(headers, rows, o) {
    var C = o.cols || {}, MS = months(o.y, o.m, o.k), A = MS[0].a, B = MS[MS.length - 1].b;
    var checks = [], people = [], cut = 0, rb = o.rowBase || 2;
    var limit = o.limit || Infinity, used = 0;
    rows.forEach(function (r, i) {
      var row = i + rb, name = norm(r[C.name]);
      if (!name && !(C.join != null && norm(r[C.join]))) return;
      if (/^(合計|小計|計|総計|total)$/i.test(name)) return;
      if (used >= limit) { cut++; return; }
      used++;
      var P = { row: row, name: name || "（名前なし）", group: C.group != null ? norm(r[C.group]) : "", kyu: [], notes: [], ok: true };
      var jt = C.join != null ? norm(r[C.join]) : "", lt = C.leave != null ? norm(r[C.leave]) : "";
      P.joinText = jt; P.leaveText = lt;
      var j = oneDate(jt, false), l = oneDate(lt, true);
      if (j.empty) { P.ok = false; checks.push({ row: row, name: P.name, lv: "e", why: "入会日が空欄です（数えていません）" }); }
      else if (j.n == null) { P.ok = false; checks.push({ row: row, name: P.name, lv: "e", why: "入会日が読めません：「" + jt + "」（数えていません）" }); }
      else { P.join = j.n; if (j.monthOnly) P.notes.push("入会は月だけ（1日として数えています）"); }
      if (!l.empty) {
        if (l.n == null) { checks.push({ row: row, name: P.name, lv: "w", why: "退会日が読めません：「" + lt + "」（在籍が続いているとして数えています）" }); }
        else { P.leave = l.n; if (l.monthOnly) P.notes.push("退会は月だけ（月末として数えています）"); }
      }
      if (P.ok && P.leave != null && P.leave < P.join) { P.ok = false; checks.push({ row: row, name: P.name, lv: "e", why: "退会日（" + fmt(P.leave) + "）が入会日（" + fmt(P.join) + "）より前です（数えていません）" }); }
      // 休会
      var ktexts = [];
      if (C.ks != null && norm(r[C.ks])) ktexts.push(norm(r[C.ks]) + (C.ke != null && norm(r[C.ke]) ? "〜" + norm(r[C.ke]) : "〜"));
      else if (C.ke != null && norm(r[C.ke])) checks.push({ row: row, name: P.name, lv: "w", why: "休会の終わりだけがあり、始まりがありません（休会として数えていません）" });
      if (C.kt != null && norm(r[C.kt])) ktexts.push(norm(r[C.kt]));
      ktexts.forEach(function (t) {
        var ps = parseSpans(t);
        ps.bad.forEach(function (b) { checks.push({ row: row, name: P.name, lv: "w", why: "休会の期間が読めません：「" + b + "」（休会として数えていません）" }); });
        ps.spans.forEach(function (s) { P.kyu.push(s); });
      });
      P.kyu.sort(function (p, q) { return p.a - q.a; });
      if (P.ok) P.kyu.forEach(function (s) {
        if (s.a < P.join || (P.leave != null && s.a > P.leave)) checks.push({ row: row, name: P.name, lv: "w", why: "休会の始まり（" + fmt(s.a) + "）が在籍の期間の外です" });
        if (s.b == null && P.leave == null) P.notes.push("休会の終わりが空欄（今も休会中として数えています）");
      });
      people.push(P);
    });
    // 同じ名前：期間が重なれば重複の疑い、重ならなければ再入会
    var byName = {};
    people.forEach(function (P) { if (P.ok) (byName[P.name] = byName[P.name] || []).push(P); });
    Object.keys(byName).forEach(function (k) {
      var L = byName[k]; if (L.length < 2) return;
      L.sort(function (p, q) { return p.join - q.join; });
      for (var i = 1; i < L.length; i++) {
        var prev = L[i - 1], cur = L[i];
        if (prev.leave == null || prev.leave >= cur.join) checks.push({ row: cur.row, name: k, lv: "w", why: "同じ名前の行（" + prev.row + " 行目）と在籍の期間が重なっています。同じ人なら1人を2回数えています（別の人なら問題ありません）" });
        else { cur.notes.push("再入会（前回 " + fmt(prev.join) + "〜" + fmt(prev.leave) + "）"); cur.rejoin = true; }
      }
    });
    function inK(P, n) { for (var i = 0; i < P.kyu.length; i++) { var s = P.kyu[i]; if (s.a <= n && (s.b == null || n <= s.b)) return true; } return false; }
    // 月末で在籍している：入会日 <= 月末 かつ（退会なし または 退会日 > 月末）。退会日はその日まで在籍
    function atEnd(P, n) { return P.ok && P.join <= n && (P.leave == null || P.leave > n); }
    var OK = people.filter(function (P) { return P.ok; });
    var groups = [];
    if (C.group != null) { var gs = {}; OK.forEach(function (P) { var g = P.group || "（空欄）"; if (!gs[g]) { gs[g] = 1; groups.push(g); } }); }
    var startN = A - 1;
    var start = OK.filter(function (P) { return atEnd(P, startN); }).length;
    var res = MS.map(function (M, mi) {
      var prevEnd = M.a - 1;
      var x = { y: M.y, m: M.m, a: M.a, b: M.b, begin: 0, joins: 0, leaves: 0, end: 0, kyu: 0, during: 0, kyuStart: 0, byG: {}, joinNames: [], leaveNames: [] };
      OK.forEach(function (P) {
        if (atEnd(P, prevEnd)) x.begin++;
        if (P.join >= M.a && P.join <= M.b) { x.joins++; x.joinNames.push(P.name); }
        if (P.leave != null && P.leave >= M.a && P.leave <= M.b) { x.leaves++; x.leaveNames.push(P.name); }
        if (P.join <= M.b && (P.leave == null || P.leave >= M.a)) x.during++;
        P.kyu.forEach(function (s) { if (s.a >= M.a && s.a <= M.b && s.a >= P.join && (P.leave == null || s.a <= P.leave)) x.kyuStart++; });
        if (atEnd(P, M.b)) {
          var k = inK(P, M.b);
          if (k) x.kyu++;
          if (k && !o.kyuIn) return;
          x.end++;
          if (C.group != null) { var g = P.group || "（空欄）"; x.byG[g] = (x.byG[g] || 0) + 1; }
        }
      });
      if (!o.kyuIn) { // 休会中を在籍に数えないとき、月初も同じ決まりにする
        x.begin = OK.filter(function (P) { return atEnd(P, prevEnd) && !inK(P, prevEnd); }).length;
      }
      x.active = o.kyuIn ? x.end - x.kyu : x.end;
      return x;
    });
    // コースごとの入会・退会（期間の合計）
    var gSum = groups.map(function (g) {
      var j = 0, l = 0;
      OK.forEach(function (P) { if ((P.group || "（空欄）") !== g) return; if (P.join >= A && P.join <= B) j++; if (P.leave != null && P.leave >= A && P.leave <= B) l++; });
      return { g: g, joins: j, leaves: l, first: res[0].byG[g] || 0, last: res[res.length - 1].byG[g] || 0 };
    });
    // 1人ごと
    var endM = mIndex(B);
    people.forEach(function (P) {
      if (!P.ok) { P.status = "数えていない"; P.months = null; return; }
      if (P.join > B) { P.status = "期間の後に入会"; P.months = 0; }
      else {
        var last = P.leave != null && P.leave <= B ? P.leave : B;
        P.months = mIndex(last) - mIndex(P.join) + 1;
        P.inRange = Math.max(0, Math.min(mIndex(last), endM) - Math.max(mIndex(P.join), mIndex(A)) + 1);
        if (P.leave != null && P.leave < A) P.inRange = 0;
        if (P.leave != null && P.leave <= B) P.status = "退会（" + fmt(P.leave) + "）";
        else P.status = inK(P, B) ? "休会中" : "在籍";
      }
      P.kyuText = P.kyu.map(function (s) { return fmt(s.a) + "〜" + (s.b != null ? fmt(s.b) : ""); }).join("、");
    });
    var tot = { joins: res.reduce(function (a, x) { return a + x.joins; }, 0), leaves: res.reduce(function (a, x) { return a + x.leaves; }, 0) };
    tot.start = res[0].begin; tot.end = res[res.length - 1].end;
    tot.avg = Math.round(res.reduce(function (a, x) { return a + x.end; }, 0) / res.length * 10) / 10;
    tot.max = Math.max.apply(null, res.map(function (x) { return x.end; }));
    tot.min = Math.min.apply(null, res.map(function (x) { return x.end; }));
    checks.sort(function (p, q) { return p.row - q.row; });
    return { months: res, people: people, groups: groups, gSum: gSum, checks: checks, cut: cut, tot: tot, counted: OK.length, start: start };
  }
  function tenure(m) { if (m == null) return ""; var y = Math.floor(m / 12), r = m % 12; return (y ? y + "年" : "") + (r || !y ? r + "か月" : ""); }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, toCSV: toCSV, months: months, oneDate: oneDate, parseSpans: parseSpans, guessCols: guessCols, run: run, fmt: fmt, dn: dn, tenure: tenure };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ZAISEKI = api;
})(typeof window !== "undefined" ? window : globalThis);
