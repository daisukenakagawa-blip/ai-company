/* 振替レッスンの残り回数 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  // 名前を同じ人として扱うためのキー（空白の有無・全角半角・大文字小文字をそろえる）
  function keyOf(s) { return norm(s).replace(/[\s・]/g, "").toLowerCase(); }

  // ---------- 日付 ----------
  // 日付は 1970-01-01 からの日数（整数）で扱う
  function dayOf(y, m, d) {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, m - 1, d), dt = new Date(t);
    if (dt.getUTCMonth() !== m - 1) return null;
    return Math.round(t / 864e5);
  }
  function ymd(day) { var t = new Date(day * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function dayLabel(day) { if (day == null) return ""; var a = ymd(day); return a.y + "/" + a.m + "/" + a.d; }
  function dayIso(day) { if (day == null) return ""; var a = ymd(day); return a.y + "-" + (a.m < 10 ? "0" : "") + a.m + "-" + (a.d < 10 ? "0" : "") + a.d; }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dayLabelW(day) { if (day == null) return ""; return dayLabel(day) + "(" + WD[((day % 7) + 11) % 7] + ")"; }
  function lastDayOfMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  // n か月後の同じ日（ない日は月末）
  function addMonths(day, n) {
    var a = ymd(day), m0 = a.m - 1 + n, y = a.y + Math.floor(m0 / 12), m = ((m0 % 12) + 12) % 12 + 1;
    return dayOf(y, m, Math.min(a.d, lastDayOfMonth(y, m)));
  }
  function todayDay() { var t = new Date(); return dayOf(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  // ctx.year：年のない日付の年。ctx.fiscal：年度（4月始まり）として 1〜3月を次の年にする
  function parseDate(v, ctx) {
    ctx = ctx || {};
    var s = norm(v).replace(/[（(][^）)]*[）)]/g, "").replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?$/, "").trim(), mm;
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = Math.floor(parseFloat(s));
      if (x > 20000 && x < 120000) return x - 25569;
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

  // ---------- 種類（欠席・振替など） ----------
  // abs：欠席（振替できる）／absNo：欠席（振替なし）／use：振替で受講／add：振替を足す／sub：振替を減らす／skip：数えない
  var KINDS = ["abs", "absNo", "use", "add", "sub", "skip"];
  var KIND_LABEL = { abs: "欠席（振替できる）", absNo: "欠席（振替なし）", use: "振替で受講", add: "振替を足す（調整）", sub: "振替を減らす（調整・取消）", skip: "数えない" };
  function guessKind(v) {
    var s = norm(v).replace(/\s/g, "");
    if (!s) return "skip";
    if (/休会|退会|入会|休講|教室休|休校|祝日|振替休日|出席|^[○〇◯o]$/i.test(s)) return "skip";
    if (/無断|連絡なし|連絡無|当日欠|振替なし|振替無|振替不可|対象外|振替できない|振替しない/.test(s)) return "absNo";
    if (/付与|追加|加算|プラス|^\+\d*$/.test(s)) return "add";
    if (/失効|取消|取り消|減算|マイナス|放棄|^[-－]\d*$/.test(s)) return "sub";
    if (/振替|振り替|振替え|^振$|補講|振出/.test(s)) return "use";
    if (/欠|休|^[×✕xｘ]$|不参加/i.test(s)) return "abs";
    return "skip";
  }

  // ---------- 列の推定 ----------
  var COLS = {
    src: /振替元|元の欠席|欠席日.*分|対象の欠席|どの欠席/,
    makeup: /^(振替日|振替先|振替受講日|振替の日|振替実施日|振替予定日|振替レッスン日|振替)$|振替日|振替受講日|振替実施/,
    date: /^(日付|日|年月日|実施日|レッスン日|欠席日|日時|date|受講日|記録日)$|日付|欠席日|レッスン日/i,
    name: /^(名前|氏名|生徒|生徒名|児童|会員|会員名|名|name|なまえ|お名前|受講者)$|氏名|生徒名|名前|会員名/i,
    kind: /^(種類|区分|内容|出欠|欠席・振替|種別|状態|type|欠席\/振替|記録)$|種類|区分|出欠/i,
    count: /^(回数|数|件数|コマ数|count)$|回数/i,
    group: /^(クラス|コース|組|曜日|時間帯|学年|教室|class|course|講座|枠)$|クラス|コース/i,
    memo: /^(メモ|備考|理由|note|memo|コメント)$|備考|メモ/i
  };
  function guessCols(headers) {
    var c = {}, used = {};
    ["src", "makeup", "date", "name", "kind", "count", "group", "memo"].forEach(function (k) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        var h = norm(headers[i]);
        if (k === "date" && /振替/.test(h) && !/欠席/.test(h)) continue;
        if (COLS[k].test(h)) { c[k] = i; used[i] = 1; return; }
      }
    });
    return c;
  }
  // 日付が見出しになっている列（名前×日付の出欠表）
  function guessDateCols(headers, ctx, skip) {
    var out = [];
    headers.forEach(function (h, i) { if (!(skip && skip[i]) && parseDate(h, ctx) != null) out.push(i); });
    return out;
  }
  function guessShape(headers, rows, ctx) {
    var c = guessCols(headers);
    if (guessDateCols(headers, ctx).length >= 3) return "wide";
    if (c.kind != null) return "long";
    if (c.makeup != null && c.date != null) return "pair";
    return "long";
  }

  // ---------- 表 → 記録（entry） ----------
  // cfg：{shape, cols, dateCols, ctx, kindMap}
  // entry：{row, day, name, key, group, raw, kind, n, srcDay, memo}
  function toEntries(headers, rows, cfg) {
    var c = cfg.cols || {}, ctx = cfg.ctx || {}, km = cfg.kindMap || {}, out = [], bad = [];
    function kindOf(raw) { var k = norm(raw); return km.hasOwnProperty(k) ? km[k] : guessKind(k); }
    function cell(r, k) { return c[k] == null ? "" : r[c[k]]; }
    function cnt(v) { var s = norm(v); if (!s) return 1; var x = parseFloat(s.replace(/回|コマ/g, "")); return isFinite(x) && x >= 0 ? Math.round(x) : NaN; }
    rows.forEach(function (r, ri) {
      var rowNo = ri + (cfg.headRows == null ? 2 : cfg.headRows + 1);
      var name = norm(cell(r, "name")), group = norm(cell(r, "group")), memo = norm(cell(r, "memo"));
      if (cfg.shape === "wide") {
        if (!name) return;
        (cfg.dateCols || []).forEach(function (ci) {
          var raw = norm(r[ci]); if (!raw) return;
          var kind = kindOf(raw); if (kind === "skip") return;
          var day = parseDate(headers[ci], ctx);
          out.push({ row: rowNo, col: headers[ci], day: day, name: name, key: keyOf(name), group: group, raw: raw, kind: kind, n: 1, srcDay: null, memo: "" });
        });
        return;
      }
      if (cfg.shape === "pair") {
        var dRaw = norm(cell(r, "date")), mRaw = norm(cell(r, "makeup"));
        if (!name && !dRaw) return;
        if (!name) { bad.push({ row: rowNo, raw: dRaw, why: "名前がない" }); return; }
        var d0 = parseDate(dRaw, ctx);
        if (d0 == null) { bad.push({ row: rowNo, raw: dRaw, name: name, why: dRaw ? "欠席日が読めない" : "欠席日がない" }); return; }
        var kind0 = "abs";
        if (c.kind != null) { kind0 = kindOf(cell(r, "kind")); if (kind0 === "skip" || kind0 === "use") kind0 = "abs"; }
        if (mRaw && parseDate(mRaw, ctx) == null && guessKind(mRaw) === "absNo") kind0 = "absNo";
        out.push({ row: rowNo, day: d0, name: name, key: keyOf(name), group: group, raw: "欠席", kind: kind0, n: 1, srcDay: null, memo: memo });
        if (mRaw && kind0 === "abs") {
          var d1 = parseDate(mRaw, ctx);
          if (d1 != null) out.push({ row: rowNo, day: d1, name: name, key: keyOf(name), group: group, raw: "振替", kind: "use", n: 1, srcDay: d0, memo: memo });
          else if (guessKind(mRaw) !== "skip" && guessKind(mRaw) !== "abs") bad.push({ row: rowNo, raw: mRaw, name: name, why: "振替日が読めない" });
        }
        return;
      }
      var raw = norm(cell(r, "kind")), dr = norm(cell(r, "date"));
      if (!name && !raw && !dr) return;
      var kind = kindOf(raw);
      if (kind === "skip") return;
      if (!name) { bad.push({ row: rowNo, raw: raw, why: "名前がない" }); return; }
      var day = parseDate(dr, ctx);
      if (day == null) { bad.push({ row: rowNo, raw: dr, name: name, why: dr ? "日付が読めない" : "日付がない" }); return; }
      var n = cnt(cell(r, "count"));
      if (isNaN(n)) { bad.push({ row: rowNo, raw: norm(cell(r, "count")), name: name, why: "回数が読めない" }); return; }
      if (n === 0) return;
      var src = null, srcRaw = norm(cell(r, "src"));
      if (srcRaw) { src = parseDate(srcRaw, ctx); if (src == null) bad.push({ row: rowNo, raw: srcRaw, name: name, why: "振替元の欠席日が読めない（指定なしとして数えました）" }); }
      out.push({ row: rowNo, day: day, name: name, key: keyOf(name), group: group, raw: raw, kind: kind, n: n, srcDay: src, memo: memo });
    });
    return { entries: out, bad: bad };
  }
  // 表に出てくる種類の書き方と件数（画面で種類の割り当てを選ぶため）
  function kindValues(headers, rows, cfg) {
    var c = cfg.cols || {}, seen = {}, list = [];
    function add(v) { v = norm(v); if (!v) return; if (!seen[v]) { seen[v] = { v: v, n: 0, guess: guessKind(v) }; list.push(seen[v]); } seen[v].n++; }
    rows.forEach(function (r) {
      if (cfg.shape === "wide") (cfg.dateCols || []).forEach(function (ci) { add(r[ci]); });
      else if (cfg.shape === "long" && c.kind != null) add(r[c.kind]);
    });
    return list;
  }

  // ---------- 期限 ----------
  // rule：{type:"months"|"days"|"monthEnd"|"fiscal"|"none", n}
  function expiryOf(day, rule) {
    var n = Math.max(0, Math.floor(+rule.n || 0)), a;
    switch (rule.type) {
      case "months": return addMonths(day, n);
      case "days": return day + n;
      case "monthEnd": a = ymd(day); return addMonths(dayOf(a.y, a.m, 1), n + 1) - 1;
      case "fiscal": a = ymd(day); return dayOf(a.m >= 4 ? a.y + 1 : a.y, 3, 31);
      default: return null;
    }
  }
  function ruleLabel(rule) {
    var n = Math.max(0, Math.floor(+rule.n || 0));
    switch (rule.type) {
      case "months": return "欠席日から" + n + "か月後の同じ日まで";
      case "days": return "欠席日から" + n + "日後まで";
      case "monthEnd": return n === 0 ? "欠席した月の末日まで" : "欠席した月の" + n + "か月後の末日まで";
      case "fiscal": return "その年度の末（3月31日）まで";
      default: return "期限なし";
    }
  }

  // ---------- 集計 ----------
  // opt：{rule, cap（1か月に振替できる欠席の数。0＝制限なし）, advance（先に振替を受けて、あとの欠席を充てる）, asof, soon（日数）, limit（人数）}
  var ORDER = { abs: 0, add: 0, absNo: 0, use: 1, sub: 2 };
  // 先に振替を受けた行（振替日が欠席日より前）は、欠席のあとに数える
  function sd(e) { return e.kind === "use" && e.srcDay != null && e.srcDay > e.day ? e.srcDay : e.day; }
  function run(entries, opt) {
    opt = opt || {};
    var rule = opt.rule || { type: "months", n: 2 }, cap = Math.max(0, +opt.cap || 0), asof = opt.asof == null ? todayDay() : opt.asof;
    var soon = opt.soon == null ? 14 : +opt.soon, limit = opt.limit || Infinity;
    var people = [], byKey = {}, cut = 0, credSeq = 0;
    entries.forEach(function (e, i) {
      e.seq = i;
      var P = byKey[e.key];
      if (P === undefined) {
        if (people.length >= limit) { cut++; byKey[e.key] = false; return; }
        P = byKey[e.key] = { key: e.key, name: e.name, group: e.group, ev: [], credits: [] };
        people.push(P);
      }
      if (P === false) return;
      if (!P.group && e.group) P.group = e.group;
      P.ev.push(e);
    });
    var used = [];
    people.forEach(function (P) {
      P.ev.sort(function (a, b) { return sd(a) - sd(b) || ORDER[a.kind] - ORDER[b.kind] || a.seq - b.seq; });
      var debts = [], monthN = {};
      P.absN = 0; P.absNoN = 0; P.capped = 0; P.useN = 0; P.noCredit = 0; P.subN = 0; P.subMiss = 0; P.addN = 0; P.lateN = 0;
      function newCredit(e) {
        var c = { id: ++credSeq, day: e.day, exp: expiryOf(e.day, rule), from: e, used: null, usedBy: null, sub: false, person: P };
        if (opt.advance && debts.length) { var d = debts.shift(); c.used = d.e.day; c.usedBy = d.e; d.u.credit = c; d.u.settled = true; }
        P.credits.push(c);
        return c;
      }
      function pick(day, srcDay) {
        var c, open = P.credits.filter(function (x) { return x.used == null && !x.sub; });
        if (srcDay != null) {
          c = open.filter(function (x) { return x.day === srcDay; })[0];
          if (c) return c;
        }
        var ok = open.filter(function (x) { return x.day <= day && (x.exp == null || x.exp >= day); });
        ok.sort(function (a, b) { return (a.exp == null) - (b.exp == null) || (a.exp || 0) - (b.exp || 0) || a.day - b.day || a.id - b.id; });
        return ok[0] || null;
      }
      P.ev.forEach(function (e) {
        e.units = [];
        var k, c;
        for (k = 0; k < e.n; k++) {
          if (e.kind === "abs") {
            P.absN++;
            var mk = Math.floor(ymd(e.day).y * 12 + ymd(e.day).m);
            monthN[mk] = (monthN[mk] || 0) + 1;
            if (cap && monthN[mk] > cap) { P.capped++; e.units.push({ capped: true }); continue; }
            e.units.push({ credit: newCredit(e) });
          } else if (e.kind === "add") {
            P.addN++; e.units.push({ credit: newCredit(e) });
          } else if (e.kind === "absNo") {
            P.absNoN++; e.units.push({ noEarn: true });
          } else if (e.kind === "use") {
            P.useN++;
            c = pick(e.day, e.srcDay);
            if (c) {
              c.used = e.day; c.usedBy = e;
              var u = { credit: c };
              if (c.exp != null && c.exp < e.day) { u.late = true; P.lateN++; }
              if (e.srcDay != null && c.day !== e.srcDay) u.srcMiss = true;
              e.units.push(u);
            } else {
              var u2 = { credit: null, srcMiss: e.srcDay != null };
              if (opt.advance) { u2.advance = true; debts.push({ e: e, u: u2 }); }
              else P.noCredit++;
              e.units.push(u2);
            }
          } else if (e.kind === "sub") {
            P.subN++;
            c = pick(e.day, null);
            if (c) { c.sub = true; c.subDay = e.day; c.subBy = e; e.units.push({ credit: c }); }
            else { P.subMiss++; e.units.push({ credit: null }); }
          }
        }
      });
      P.debtOpen = debts.length;
      P.noCredit += debts.length; // 最後まで欠席で充てられなかった先取り
      // 期限と残り（基準日で判定）
      P.earned = P.credits.length;
      P.used = 0; P.expired = 0; P.remain = 0; P.soonN = 0; P.cancel = 0; P.remainList = []; P.expiredList = [];
      P.credits.forEach(function (c) {
        if (c.used != null) { P.used++; c.st = "used"; }
        else if (c.sub) { P.cancel++; c.st = "sub"; }
        else if (c.exp != null && c.exp < asof) { P.expired++; c.st = "expired"; P.expiredList.push(c); }
        else {
          P.remain++; c.st = "remain"; P.remainList.push(c);
          c.left = c.exp == null ? null : c.exp - asof;
          if (c.exp != null && c.exp - asof <= soon) { c.soon = true; P.soonN++; }
        }
      });
      P.remainList.sort(function (a, b) { return (a.exp == null) - (b.exp == null) || (a.exp || 0) - (b.exp || 0) || a.day - b.day; });
      P.nextExp = P.remainList.length && P.remainList[0].exp != null ? P.remainList[0].exp : null;
      P.nextExpN = P.nextExp == null ? 0 : P.remainList.filter(function (c) { return c.exp === P.nextExp; }).length;
      P.lastDay = P.ev.length ? P.ev[P.ev.length - 1].day : null;
      used = used.concat(P.ev);
    });
    // 記録ごとの印
    used.forEach(function (e) { var m = markOf(e, asof); e.mark = m.t; e.cls = m.c; });
    used.sort(function (a, b) { return a.day - b.day || a.seq - b.seq; });
    // 期限が近い・切れた振替の一覧（人をまたいで期限の順）
    var soonList = [], expList = [];
    people.forEach(function (P) {
      P.remainList.forEach(function (c) { if (c.soon) soonList.push(c); });
      P.expiredList.forEach(function (c) { expList.push(c); });
    });
    soonList.sort(function (a, b) { return a.exp - b.exp || a.day - b.day; });
    expList.sort(function (a, b) { return b.exp - a.exp || a.day - b.day; });
    var T = { absN: 0, absNoN: 0, earned: 0, used: 0, expired: 0, remain: 0, soonN: 0, noCredit: 0, capped: 0, cancel: 0, lateN: 0 };
    people.forEach(function (P) { Object.keys(T).forEach(function (k) { T[k] += P[k] || 0; }); });
    return { people: people, cut: cut, recs: used, soonList: soonList, expList: expList, total: T, asof: asof, rule: rule, cap: cap, soon: soon, advance: !!opt.advance };
  }
  function leftLabel(n) { return n == null ? "期限なし" : n === 0 ? "今日まで" : "あと" + n + "日"; }
  function markOf(e, asof) {
    var parts = [], cls = "";
    e.units.forEach(function (u) {
      var c = u.credit;
      if (e.kind === "abs" || e.kind === "add") {
        if (u.capped) { parts.push("1か月の上限を超えた欠席（振替なし）"); cls = cls || "cap"; return; }
        var ex = c.exp == null ? "期限なし" : "期限 " + dayLabel(c.exp);
        if (c.st === "used") parts.push("振替済み（" + dayLabel(c.used) + "・" + ex + "）"), cls = cls || "used";
        else if (c.st === "sub") parts.push("取消（" + dayLabel(c.subDay) + "）"), cls = cls || "nr";
        else if (c.st === "expired") parts.push("期限切れ（" + dayLabel(c.exp) + "）"), cls = "exp";
        else parts.push("残り（" + ex + "・" + leftLabel(c.left) + "）"), cls = c.soon ? "soon" : (cls || "rem");
      } else if (e.kind === "absNo") { parts.push("振替なしの欠席"); cls = "nr"; }
      else if (e.kind === "use") {
        if (c) {
          var t = dayLabel(c.day) + (c.from.kind === "add" ? " に足した分" : " の欠席分");
          if (u.settled) t = "先に振替 → " + dayLabel(c.day) + " の欠席で充当";
          else if (c.day > e.day) t = "先に振替（" + dayLabel(c.day) + " の欠席分）";
          if (u.late) t += "（期限 " + dayLabel(c.exp) + " を過ぎて使用）";
          if (u.srcMiss) t += "（指定の欠席日の分がなく、ほかの分を使用）";
          parts.push(t); cls = u.late || u.srcMiss ? (cls || "warn") : (cls || "used");
        } else if (u.advance) { parts.push("先に振替（まだ欠席で充てていない）"); cls = "warn"; }
        else { parts.push("振替の残りがないのに受講" + (u.srcMiss ? "（指定の欠席日の分がない）" : "")); cls = "warn"; }
      } else if (e.kind === "sub") {
        if (c) parts.push(dayLabel(c.day) + " の分を取消"), cls = cls || "nr";
        else { parts.push("取り消す振替がない"); cls = "warn"; }
      }
    });
    return { t: parts.join("／"), c: cls };
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var F = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, keyOf: keyOf, parseDate: parseDate, dayOf: dayOf, dayLabel: dayLabel, dayLabelW: dayLabelW, dayIso: dayIso,
    addMonths: addMonths, todayDay: todayDay, KINDS: KINDS, KIND_LABEL: KIND_LABEL, guessKind: guessKind, guessCols: guessCols, guessDateCols: guessDateCols, guessShape: guessShape,
    toEntries: toEntries, kindValues: kindValues, expiryOf: expiryOf, ruleLabel: ruleLabel, run: run, leftLabel: leftLabel, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = F;
  else root.FURIKAE = F;
})(this);
