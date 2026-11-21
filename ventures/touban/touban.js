/* 当番表の自動作成 — 割り当ての計算（画面なし。Node でもテストできる）
   メンバーの名前・出られない日は、このブラウザの外へ送信しない */
(function (root) {
  "use strict";
  var E = root.Eigyo || (typeof require !== "undefined" ? require("./eigyo.js") : null);
  var WD = "日月火水木金土";

  function norm(s) { return String(s == null ? "" : s).normalize("NFKC").replace(/[​-‍﻿]/g, "").trim(); }

  /* 「12/24」「2026/12/24」「12/24-12/28」「12月24日」を通し日数に。年がなければ期間の中に入る年を選ぶ */
  function resolveMD(m, d, range) {
    var y0 = E.ymd(range.start).y, y1 = E.ymd(range.end).y;
    for (var y = y0; y <= y1; y++) {
      var n = E.dn(y, m, d);
      if (E.ymd(n).m === m && n >= range.start && n <= range.end) return n;
    }
    var t = E.dn(y0, m, d);
    return E.ymd(t).m === m ? t : null;
  }
  function parseOneDate(s, range) {
    var m;
    s = s.replace(/[\(（][日月火水木金土][\)）]/g, "");
    if ((m = s.match(/^(\d{4})[\/\-\.年](\d{1,2})[\/\-\.月](\d{1,2})日?$/))) {
      var n = E.dn(+m[1], +m[2], +m[3]);
      return E.ymd(n).m === +m[2] ? n : null;
    }
    if ((m = s.match(/^(\d{1,2})[\/\-\.月](\d{1,2})日?$/))) return resolveMD(+m[1], +m[2], range);
    return null;
  }

  /* 出られない日の書き方：曜日（「月」「水曜」「土日」）、日付、日付の範囲（12/24-12/28、12/24〜12/28） */
  function parseNG(text, range) {
    var out = { w: {}, dates: {}, bad: [] };
    var toks = norm(text).replace(/[〜~～]/g, "~").replace(/\s*~\s*/g, "~").split(/[\s,、，;；・]+/).filter(Boolean);
    toks.forEach(function (t) {
      var m;
      if ((m = t.match(/^([日月火水木金土](曜日?)?)+$/))) {
        t.replace(/[日月火水木金土]/g, function (c) { out.w[WD.indexOf(c)] = true; return c; });
        return;
      }
      if ((m = t.match(/^(.+?)~(.+)$/))) {
        var a = parseOneDate(m[1], range), b0 = m[2];
        // 「12/24~28」のように後ろが日だけなら、前の月を使う
        if (/^\d{1,2}日?$/.test(b0) && a != null) { var ta = E.ymd(a); b0 = ta.y + "/" + ta.m + "/" + parseInt(b0, 10); }
        var b = parseOneDate(b0, range);
        if (a != null && b != null && b >= a && b - a <= 400) { for (var n = a; n <= b; n++) out.dates[n] = true; return; }
        out.bad.push(t); return;
      }
      var d = parseOneDate(t, range);
      if (d != null) { out.dates[d] = true; return; }
      out.bad.push(t);
    });
    return out;
  }

  /* 1行1人。「名前」「名前,出られない日…」「名前<TAB>出られない日」。Excel から貼り付けた表もそのまま読める */
  function parseMembers(text, range) {
    var lines = String(text || "").split(/\r?\n/), list = [], seen = {}, warn = [];
    lines.forEach(function (line, i) {
      if (!norm(line)) return;
      var cells = line.indexOf("\t") >= 0 ? line.split("\t") : line.split(/[,，]/);
      var name = norm(cells[0]).replace(/\s+/g, " ");
      if (!name || /^(名前|氏名|メンバー|なまえ)$/.test(name)) return;
      var ng = parseNG(cells.slice(1).join(" "), range);
      if (seen[name]) { warn.push((i + 1) + "行目「" + name + "」は名前が重なっています（別の人として扱います。区別できる名前にしてください）"); }
      seen[name] = true;
      ng.bad.forEach(function (b) { warn.push((i + 1) + "行目「" + name + "」の「" + b + "」は日付・曜日として読めませんでした"); });
      list.push({ name: name, ngW: ng.w, ngD: ng.dates, line: i + 1 });
    });
    return { members: list, warn: warn };
  }

  /* 係：「掃除 2」「受付」→ {name, count} */
  function parseRoles(text) {
    var out = [];
    String(text || "").split(/\r?\n/).forEach(function (l) {
      var s = norm(l); if (!s) return;
      var m = s.match(/^(.*?)[\s:：]*(\d{1,2})\s*(人|名)?$/);
      var name = m && m[1] ? m[1] : s, c = m ? Math.max(1, Math.min(20, +m[2])) : 1;
      if (m && !m[1]) { name = "当番"; }
      out.push({ name: name.trim() || "当番", count: c });
    });
    if (!out.length) out.push({ name: "当番", count: 1 });
    return out;
  }

  /* 当番の日の一覧 */
  function scheduleDays(opt) {
    var days = [];
    for (var n = opt.start; n <= opt.end; n++) {
      var t = E.ymd(n), hol = (opt.skipHolidays && E.holidayName) ? E.holidayName(n) : null;
      if (!opt.weekdays[t.w]) continue;
      if (hol) continue;
      if (opt.skipDates && opt.skipDates[n]) continue;
      days.push(n);
      if (days.length > 3700) break;
    }
    return days;
  }

  /* 割り当て。回数の少ない人から。同じ回数なら、前に入った日が古い人 → 名簿の順。
     opt.noConsecutive：前の当番の日に入った人は、ほかに入れる人がいる限り外す
     opt.prior：前回までの回数 {名前: 回数}（続きから作るとき） */
  function assign(members, roles, days, opt) {
    opt = opt || {};
    var st = members.map(function (m, i) {
      var p = (opt.prior && opt.prior[m.name]) || 0;
      return { m: m, i: i, total: p, byRole: {}, last: -1, dates: [] };
    });
    var rows = [], shortage = 0, prevDay = [];
    // それぞれの人が、残りの当番の日のうち何日出られるか
    st.forEach(function (s) { s.left = days.filter(function (n) { return !s.m.ngW[E.ymd(n).w] && !s.m.ngD[n]; }).length; });
    days.forEach(function (n, di) {
      var w = E.ymd(n).w, today = {}, row = { n: n, roles: [], short: [] };
      roles.forEach(function (r) {
        var got = [];
        for (var k = 0; k < r.count; k++) {
          var cand = st.filter(function (s) { return !today[s.i] && !s.m.ngW[w] && !s.m.ngD[n]; });
          if (!cand.length) break;
          cand.sort(function (a, b) {
            // 前の当番の日にも入った人は、回数を1回多いものとして比べる（連続はできる限り避けるが、偏りは広げない）
            var ca = opt.noConsecutive && prevDay.indexOf(a.i) >= 0 ? 1 : 0, cb = opt.noConsecutive && prevDay.indexOf(b.i) >= 0 ? 1 : 0;
            if (a.total + ca !== b.total + cb) return (a.total + ca) - (b.total + cb);
            if (ca !== cb) return ca - cb;
            if (a.total !== b.total) return a.total - b.total;
            // 同じ回数なら、この先に出られる日が少ない人を先に（出られない日の多い人が少なくなりすぎないように）
            if (a.left !== b.left) return a.left - b.left;
            var ra = a.byRole[r.name] || 0, rb = b.byRole[r.name] || 0;
            if (ra !== rb) return ra - rb;
            if (a.last !== b.last) return a.last - b.last;
            return a.i - b.i;
          });
          var s = cand[0];
          today[s.i] = true; s.total++; s.byRole[r.name] = (s.byRole[r.name] || 0) + 1; s.last = di;
          s.dates.push({ n: n, role: r.name });
          got.push(s.m.name);
        }
        if (got.length < r.count) { row.short.push(r.name + " " + (r.count - got.length) + "人不足"); shortage += r.count - got.length; }
        row.roles.push(got);
      });
      st.forEach(function (s) { if (!s.m.ngW[w] && !s.m.ngD[n]) s.left--; });
      prevDay = Object.keys(today).map(Number);
      rows.push(row);
    });
    var counts = st.map(function (s) {
      return { name: s.m.name, total: s.total - ((opt.prior && opt.prior[s.m.name]) || 0), withPrior: s.total, byRole: s.byRole, dates: s.dates };
    });
    return { rows: rows, counts: counts, shortage: shortage };
  }

  function fmtDay(n, style) {
    var t = E.ymd(n);
    if (style === "iso") return t.y + "-" + (t.m < 10 ? "0" : "") + t.m + "-" + (t.d < 10 ? "0" : "") + t.d;
    if (style === "md") return t.m + "/" + t.d;
    return t.y + "/" + t.m + "/" + t.d;
  }

  /* CSV の表（日付・曜日・係ごとの列・不足） */
  function toTable(res, roles, opt) {
    opt = opt || {};
    var head = ["日付", "曜日"];
    roles.forEach(function (r) { head.push(r.name); });
    head.push("備考");
    var body = res.rows.map(function (row) {
      var a = [fmtDay(row.n, opt.dateStyle), WD[E.ymd(row.n).w]];
      row.roles.forEach(function (g) { a.push(g.join(opt.sep || "・")); });
      a.push(row.short.join(" "));
      return a;
    });
    return [head].concat(body);
  }
  function countTable(res, roles) {
    var head = ["名前", "回数"];
    if (roles.length > 1) roles.forEach(function (r) { head.push(r.name); });
    head.push("当番の日");
    return [head].concat(res.counts.map(function (c) {
      var a = [c.name, String(c.total)];
      if (roles.length > 1) roles.forEach(function (r) { a.push(String(c.byRole[r.name] || 0)); });
      a.push(c.dates.map(function (d) { return fmtDay(d.n, "md") + (roles.length > 1 ? "(" + d.role + ")" : ""); }).join(" "));
      return a;
    }));
  }

  /* 前回の回数表（「名前,回数」）を読む */
  function parsePrior(text) {
    var o = {};
    String(text || "").split(/\r?\n/).forEach(function (l) {
      var c = l.indexOf("\t") >= 0 ? l.split("\t") : l.split(/[,，]/);
      var name = norm(c[0]).replace(/\s+/g, " "), v = parseInt(norm(c[1] || ""), 10);
      if (name && !isNaN(v)) o[name] = v;
    });
    return o;
  }

  var api = { parseNG: parseNG, parseMembers: parseMembers, parseRoles: parseRoles, scheduleDays: scheduleDays, assign: assign, toTable: toTable, countTable: countTable, parsePrior: parsePrior, fmtDay: fmtDay, WD: WD };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Touban = api;
})(typeof window !== "undefined" ? window : globalThis);
