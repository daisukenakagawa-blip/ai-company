/* 面談の日程の割り当て — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function clean(s) { return String(s == null ? "" : s).replace(/[\s　]+/g, " ").trim(); }
  function key(s) { s = String(s == null ? "" : s); if (s.normalize) s = s.normalize("NFKC"); return s.replace(/\s+/g, "").toLowerCase(); }
  function norm(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    return s.replace(/[〜~‐－−–—―]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // ---------- 日付・時刻 ----------
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(min) { return Math.floor(min / 60) + ":" + pad(min % 60); }
  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function validYMD(y, m, d) { var dt = new Date(Date.UTC(y, m - 1, d)); return m >= 1 && m <= 12 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
  // 年のない「11/25」は、今日から60日より前なら来年として扱う
  function resolveYear(m, d, today) {
    var t = today || new Date(), y = t.getFullYear();
    var tn = dayNum(y, t.getMonth() + 1, t.getDate());
    if (validYMD(y, m, d) && dayNum(y, m, d) < tn - 60) y++;
    return y;
  }
  function dateLabel(sl) { return sl.m + "月" + sl.d + "日（" + WD[sl.wd] + "）"; }
  function shortDate(sl) { return sl.m + "/" + sl.d + "（" + WD[sl.wd] + "）"; }

  var CLOCK = "(午前|午後)?\\s*(\\d{1,2})(?::(\\d{2})|時(?:(\\d{1,2})分?|(半))?)";
  function clockMin(m, o) { // m: match, o: offset of the 5 groups
    var h = +m[o + 1], mi = m[o + 2] != null ? +m[o + 2] : (m[o + 3] != null ? +m[o + 3] : (m[o + 4] ? 30 : 0));
    if (mi >= 60) return null;
    if (m[o] === "午後" && h < 12) h += 12;
    if (m[o] === "午前" && h === 12) h = 0;
    if (h > 24) return null;
    return h * 60 + mi;
  }
  var RE_RANGE = new RegExp(CLOCK + "\\s*(?:-|から)\\s*" + CLOCK + "\\s*(?:まで)?");
  var RE_FROM = new RegExp(CLOCK + "\\s*(?:以降|以後|から|-\\s*$|~\\s*$|すぎ|過ぎ)");
  var RE_UNTIL = new RegExp("(?:^|\\s|-)\\s*" + CLOCK + "\\s*(?:まで|以前|前)|^-\\s*" + CLOCK);
  var RE_ONE = new RegExp(CLOCK);
  var BLANK = /^(|-|ー|なし|無し|特になし|とくになし|未定|n\/a|na)$/;
  var ANY = /いつでも|何時でも|なんでも|どこでも|どれでも|全部|すべて|全て|終日|どの日でも|問わ/;

  // 1つの希望の書き方（「11/25 15時以降」「11月26日午後」「木曜」「14:00-15:00」「いつでも」）を読む
  // 戻り値：{ y, m, d, dom, wd, from, to, at } または null（読めない）
  function parseItem(s) {
    var t = norm(s), r = { y: null, m: null, d: null, dom: null, wd: null, from: 0, to: 1440, at: null }, got = false, x;
    if (BLANK.test(t)) return null;
    if (ANY.test(t)) { got = true; t = t.replace(ANY, " "); }
    // 日付
    if ((x = t.match(/(\d{4})[\/.年-](\d{1,2})[\/.月-](\d{1,2})日?/))) { r.y = +x[1]; r.m = +x[2]; r.d = +x[3]; }
    else if ((x = t.match(/(?:令和|r)(\d{1,2}|元)[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/))) { r.y = 2018 + (x[1] === "元" ? 1 : +x[1]); r.m = +x[2]; r.d = +x[3]; }
    else if ((x = t.match(/(\d{1,2})\/(\d{1,2})/)) || (x = t.match(/(\d{1,2})月(\d{1,2})日?/))) { r.m = +x[1]; r.d = +x[2]; }
    else if ((x = t.match(/(?:^|[^\d:時])(\d{1,2})日/))) { r.dom = +x[1]; }
    if (x) {
      if (r.m != null && (r.m < 1 || r.m > 12 || r.d < 1 || r.d > 31)) return null;
      if (r.dom != null && (r.dom < 1 || r.dom > 31)) return null;
      got = true; t = t.replace(x[0], " ");
    }
    // 曜日（日付があれば飾りとして読み飛ばす）
    if ((x = t.match(/([月火水木金土日])曜日?/)) || (x = t.match(/[(（]([月火水木金土日])[)）]/))) {
      if (r.m == null && r.dom == null) r.wd = WD.indexOf(x[1]);
      got = true; t = t.replace(x[0], " ");
    }
    // 時刻
    var a, b;
    if ((x = t.match(RE_RANGE))) { a = clockMin(x, 1); b = clockMin(x, 6); if (a == null || b == null || b <= a) return null; r.from = a; r.to = b; got = true; }
    else if ((x = t.match(RE_FROM))) { a = clockMin(x, 1); if (a == null) return null; r.from = a; got = true; }
    else if ((x = t.match(RE_UNTIL))) { b = x[2] != null ? clockMin(x, 1) : clockMin(x, 6); if (b == null) return null; r.to = b; got = true; }
    else if ((x = t.match(/(午前|午後)?\s*(\d{1,2})時台/))) { a = +x[2] + (x[1] === "午後" && +x[2] < 12 ? 12 : 0); if (a > 23) return null; r.from = a * 60; r.to = a * 60 + 60; got = true; }
    else if ((x = t.match(RE_ONE))) { a = clockMin(x, 1); if (a == null) return null; r.at = a; got = true; }
    else if (/午前|朝/.test(t)) { r.to = 720; got = true; }
    else if (/夕方/.test(t)) { r.from = 960; got = true; }
    else if (/夜/.test(t)) { r.from = 1080; got = true; }
    else if (/午後|昼から|昼以降/.test(t)) { r.from = 720; got = true; }
    return got ? r : null;
  }
  // セル1つを「、」「,」「;」「・」改行で区切って読む。年なしの日付は前の項目の日付を引き継がない（そのまま）
  function splitItems(s) {
    s = String(s == null ? "" : s).replace(/([\d日時分半)）])\s*(?:または|もしくは|か)(?!ら)\s*(?=\d)/g, "$1、");
    return s.split(/[、,，;；\n\r]|・|\s(?:または|か|or)\s/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function parseCell(s) {
    var items = [], bad = [];
    splitItems(s).forEach(function (p) {
      if (BLANK.test(norm(p))) return;
      var it = parseItem(p);
      if (it) items.push(it); else bad.push(p);
    });
    return { items: items, bad: bad };
  }
  function matches(it, sl) {
    if (it.m != null && (it.m !== sl.m || it.d !== sl.d || (it.y != null && it.y !== sl.y))) return false;
    if (it.dom != null && it.dom !== sl.d) return false;
    if (it.wd != null && it.wd !== sl.wd) return false;
    if (it.at != null) return sl.start <= it.at && it.at < sl.end;
    return sl.start >= it.from && sl.end <= it.to;
  }

  // ---------- 面談の枠 ----------
  // lines：「11/25(水) 14:00-17:00」「11/26 13:30-15:00、15:30-17:00」を1行に1日
  function makeSlots(text, len, gap, rooms, today) {
    var slots = [], problems = [], days = [];
    len = Math.max(1, Math.round(len) || 0); gap = Math.max(0, Math.round(gap) || 0);
    rooms = rooms && rooms.length ? rooms : [""];
    String(text || "").split(/\r?\n/).forEach(function (line, li) {
      if (!line.trim()) return;
      var parts = String(line).split(/[、,，;；]/), date = null, ranges = [];
      parts.forEach(function (p, pi) {
        var it = parseItem(p);
        if (it && it.m != null) { if (!date) date = it; }
        if (it && (it.from > 0 || it.to < 1440) && it.at == null) ranges.push([it.from, it.to]);
        else if (pi === 0 && it && it.m != null && it.from === 0 && it.to === 1440) { /* 日付だけ */ }
        else if (p.trim()) problems.push((li + 1) + "行目「" + p.trim() + "」を時間帯として読めませんでした（例：14:00-17:00）");
      });
      if (!date) { problems.push((li + 1) + "行目に日付がありません（例：11/25 14:00-17:00）"); return; }
      var y = date.y != null ? date.y : resolveYear(date.m, date.d, today);
      if (!validYMD(y, date.m, date.d)) { problems.push((li + 1) + "行目の日付「" + date.m + "/" + date.d + "」はありません"); return; }
      if (!ranges.length) { problems.push((li + 1) + "行目に時間帯がありません（例：11/25 14:00-17:00）"); return; }
      var dn = dayNum(y, date.m, date.d), wd = new Date(dn * 86400000).getUTCDay();
      if (days.indexOf(dn) >= 0) problems.push((li + 1) + "行目の " + date.m + "/" + date.d + " は、ほかの行と同じ日です（同じ日の時間帯は1行に「、」で並べてください）");
      days.push(dn);
      ranges.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (rg) {
        rooms.forEach(function (rm, ri) {
          for (var t = rg[0]; t + len <= rg[1]; t += len + gap) slots.push({ y: y, m: date.m, d: date.d, wd: wd, day: dn, start: t, end: t + len, room: ri, roomName: rm });
        });
        if (rg[0] + len > rg[1]) problems.push((li + 1) + "行目の " + hm(rg[0]) + "-" + hm(rg[1]) + " は、1回の時間（" + len + "分）より短いため枠がありません");
      });
    });
    slots.sort(function (a, b) { return a.day - b.day || a.start - b.start || a.room - b.room; });
    slots.forEach(function (s, i) { s.id = i; });
    return { slots: slots, problems: problems };
  }

  // ---------- 希望の読み取り ----------
  var MARK_OK = /^(○|◯|〇|◎|●|ok|可|はい|yes|y|o|◇)$/;
  var MARK_MAYBE = /^(△|▲|できれば避けたい|調整可|微妙)$/;
  var MARK_NG = /^(|×|✕|✖|x|不可|ng|いいえ|no|n|-|ー)$/;
  // opt: { mode: "mark"|"wish"|"ng", cols: [列番号], slots, headers }
  // 戻り値：{ rank: [人][枠] = 0,1,2…（-1 は入れない）, nRank, labels, noAns: [bool], problems: [] }
  function buildPrefs(rows, opt) {
    var S = opt.slots, n = rows.length, rank = [], noAns = [], problems = [], badCells = [], unknownMarks = 0;
    var labels;
    if (opt.mode === "mark") {
      labels = ["○", "△"];
      var colSlots = opt.cols.map(function (c) {
        var pc = parseCell(opt.headers[c]);
        var set = S.map(function (sl) { return pc.items.some(function (it) { return matches(it, sl); }); });
        if (!pc.items.length) problems.push("列「" + opt.headers[c] + "」の見出しを日時として読めませんでした");
        else if (!set.some(Boolean)) problems.push("列「" + opt.headers[c] + "」の日時に当たる面談の枠がありません");
        return set;
      });
      rows.forEach(function (r, i) {
        var rk = S.map(function () { return -1; }), any = false;
        opt.cols.forEach(function (c, ci) {
          var v = norm(r[c]).replace(/\s/g, ""), k;
          if (v !== "") any = true;
          if (MARK_OK.test(v)) k = 0; else if (MARK_MAYBE.test(v)) k = 1; else { if (!MARK_NG.test(v)) unknownMarks++; return; }
          colSlots[ci].forEach(function (on, s) { if (on && (rk[s] < 0 || k < rk[s])) rk[s] = k; });
        });
        rank.push(rk); noAns.push(!any);
      });
      if (unknownMarks) problems.push("○・△・× として読めない記入が " + unknownMarks + " か所あり、× として扱いました");
    } else if (opt.mode === "wish") {
      labels = opt.cols.map(function (_, k) { return "第" + (k + 1) + "希望"; });
      rows.forEach(function (r, i) {
        var rk = S.map(function () { return -1; }), any = false;
        opt.cols.forEach(function (c, k) {
          var pc = parseCell(r[c]);
          if (pc.items.length || pc.bad.length) any = true;
          pc.bad.forEach(function (b) { badCells.push((i + 2) + "行目「" + b + "」"); });
          S.forEach(function (sl, s) { if (pc.items.some(function (it) { return matches(it, sl); }) && (rk[s] < 0 || k < rk[s])) rk[s] = k; });
        });
        rank.push(rk); noAns.push(!any);
      });
    } else { // ng：都合の悪い日時の列
      labels = ["都合のよい時間"];
      var c = opt.cols[0];
      rows.forEach(function (r, i) {
        var pc = parseCell(r[c]);
        pc.bad.forEach(function (b) { badCells.push((i + 2) + "行目「" + b + "」"); });
        rank.push(S.map(function (sl) { return pc.items.some(function (it) { return matches(it, sl); }) ? -1 : 0; }));
        noAns.push(false);
      });
    }
    if (badCells.length) problems.push("日時として読めない書き方があり、その部分は使っていません：" + badCells.slice(0, 8).join("、") + (badCells.length > 8 ? " ほか" + (badCells.length - 8) + "件" : ""));
    return { rank: rank, nRank: labels.length, labels: labels, noAns: noAns, problems: problems };
  }

  // ---------- 割り当て（ハンガリー法） ----------
  // a[i][j] のコスト行列（n ≤ m）で、合計が最小になる割り当て。戻り値 p[i] = j
  function hungarian(a, n, m) {
    var INF = Infinity, u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    for (var i = 1; i <= n; i++) {
      p[0] = i; var j0 = 0, minv = new Float64Array(m + 1).fill(INF), used = new Uint8Array(m + 1);
      do {
        used[j0] = 1; var i0 = p[j0], delta = INF, j1 = 0, row = a[i0 - 1];
        for (var j = 1; j <= m; j++) if (!used[j]) {
          var cur = row[j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jx = way[j0]; p[j0] = p[jx]; j0 = jx; } while (j0);
    }
    var res = new Int32Array(n).fill(-1);
    for (var jj = 1; jj <= m; jj++) if (p[jj]) res[p[jj] - 1] = jj - 1;
    return res;
  }

  // P: buildPrefs の結果、opt: { slots, allowOutside, fillNoAnswer, groups: [[人番号…]]（続けての枠にする組） }
  // 戻り値：{ a: [人] = 枠番号 or -1, kind: [人] = 0.. 希望の順位 / "out" / "noans" / null, groupOk: [bool], cost }
  function assign(P, opt) {
    var S = opt.slots, n = P.rank.length, m = S.length;
    var BIG = (m + 1) * (n + 1), OUT = (P.nRank + 3) * BIG, UN = OUT * (n + 2), NG = UN * 4;
    function cost(i, s) {
      var r = P.rank[i][s];
      if (P.noAns[i]) return opt.fillNoAnswer ? OUT + s : NG;
      if (r >= 0) return r * BIG + s;
      return opt.allowOutside ? OUT + s : NG;
    }
    // 続けての枠（同じ日・同じ部屋で隣り合う枠）
    var next = S.map(function () { return -1; });
    for (var s = 0; s < m; s++) for (var t = s + 1; t < m; t++) {
      if (S[t].day !== S[s].day) break;
      if (S[t].room === S[s].room && S[t].start >= S[s].end) { next[s] = t; break; }
    }
    var groups = (opt.groups || []).filter(function (g) { return g.length >= 2; });
    var inGroup = new Int32Array(n).fill(-1);
    groups.forEach(function (g, gi) { g.forEach(function (i) { inGroup[i] = gi; }); });
    var blocks = groups.map(function (g) {
      var out = [];
      for (var s0 = 0; s0 < m; s0++) {
        var seq = [s0], c = 0, ok = true;
        while (seq.length < g.length) { var nx = next[seq[seq.length - 1]]; if (nx < 0 || S[nx].start - S[seq[seq.length - 1]].end > 30) { ok = false; break; } seq.push(nx); }
        if (!ok) continue;
        for (var k = 0; k < g.length; k++) { var cc = cost(g[k], seq[k]); if (cc >= NG) { ok = false; break; } c += cc; }
        if (ok) out.push({ seq: seq, cost: c });
      }
      out.sort(function (x, y) { return x.cost - y.cost; });
      return out;
    });
    function solveRest(chosen) {
      var taken = new Uint8Array(m), a = new Int32Array(n).fill(-1), total = 0;
      chosen.forEach(function (b, gi) { if (b) b.seq.forEach(function (s, k) { taken[s] = 1; a[groups[gi][k]] = s; }); if (b) total += b.cost; });
      var rest = []; for (var i = 0; i < n; i++) if (a[i] < 0) rest.push(i);
      var free = []; for (s = 0; s < m; s++) if (!taken[s]) free.push(s);
      if (rest.length) {
        var cols = free.length + rest.length;
        var mat = rest.map(function (i) {
          var row = new Float64Array(cols);
          for (var j = 0; j < free.length; j++) row[j] = cost(i, free[j]);
          for (j = free.length; j < cols; j++) row[j] = UN;
          return row;
        });
        var r = hungarian(mat, rest.length, cols);
        rest.forEach(function (i, x) {
          var j = r[x];
          if (j >= 0 && j < free.length && mat[x][j] < NG) { a[i] = free[j]; total += mat[x][j]; } else total += UN;
        });
      }
      return { a: a, total: total };
    }
    // 組：選べる枠の少ない組から順に、ほかの組と重ならない一番よい続きの枠を選ぶ
    var order = groups.map(function (_, gi) { return gi; }).sort(function (x, y) { return blocks[x].length - blocks[y].length; });
    var chosen = groups.map(function () { return null; });
    function freeOf(b, gi) {
      return b.seq.every(function (s) { return chosen.every(function (o, oj) { return oj === gi || !o || o.seq.indexOf(s) < 0; }); });
    }
    order.forEach(function (gi) { for (var x = 0; x < blocks[gi].length; x++) if (freeOf(blocks[gi][x], gi)) { chosen[gi] = blocks[gi][x]; break; } });
    var best = solveRest(chosen);
    // 組の枠を入れ替えて、全体がよくなるか試す（人数が多いときは候補を絞る）
    if (groups.length) {
      var lim = n > 150 ? 6 : n > 60 ? 15 : 40;
      for (var pass = 0; pass < 2; pass++) {
        var improved = false;
        order.forEach(function (gi) {
          var cand = blocks[gi].slice(0, lim);
          cand.forEach(function (b) {
            if (b === chosen[gi] || !freeOf(b, gi)) return;
            var keep = chosen[gi]; chosen[gi] = b;
            var r = solveRest(chosen);
            if (r.total < best.total - 1e-6) { best = r; improved = true; } else chosen[gi] = keep;
          });
        });
        if (!improved) break;
      }
    }
    var a = Array.prototype.slice.call(best.a);
    return { a: a, groupOk: groups.map(function (g, gi) { return !!chosen[gi]; }), groups: groups, blocksCount: blocks.map(function (b) { return b.length; }) };
  }
  // 割り当ての種類：0..（希望の順位）、"out"（希望外）、"noans"（回答なし）、"ng"（入れない枠に手で入れた）、null（未定）
  function kindOf(P, i, s) {
    if (s == null || s < 0) return null;
    if (P.noAns[i]) return "noans";
    var r = P.rank[i][s];
    return r >= 0 ? r : "out";
  }
  function kindLabel(P, k) {
    if (k == null) return "未定";
    if (k === "noans") return "回答なし";
    if (k === "out") return "希望外";
    return P.labels[k];
  }
  // 集計と、入れられなかった人の理由
  function report(P, S, a, groups) {
    var n = a.length, cnt = {}, un = [];
    for (var i = 0; i < n; i++) {
      var k = kindOf(P, i, a[i]);
      var lb = kindLabel(P, k); cnt[lb] = (cnt[lb] || 0) + 1;
      if (a[i] < 0) {
        var can = P.noAns[i] ? -1 : P.rank[i].filter(function (r) { return r >= 0; }).length;
        un.push({ i: i, why: P.noAns[i] ? "回答がありません" : can === 0 ? "希望・都合に合う面談の枠がありません" : "希望の枠（" + can + "枠）がほかの人で埋まりました" });
      }
    }
    // 同じ枠に2人以上（手で動かしたとき）
    var used = {}, dup = [];
    a.forEach(function (s, i) { if (s >= 0) { if (used[s] != null) dup.push([used[s], i]); else used[s] = i; } });
    var gBad = (groups || []).map(function (g) {
      var ss = g.map(function (i) { return a[i]; });
      if (ss.some(function (s) { return s < 0; })) return true;
      for (var k = 1; k < ss.length; k++) { var x = S[ss[k - 1]], y = S[ss[k]]; if (x.day !== y.day || x.room !== y.room || y.start < x.end || y.start - x.end > 30) return true; }
      for (k = 1; k < ss.length; k++) { var between = S.filter(function (z) { return z.day === S[ss[k]].day && z.room === S[ss[k]].room && z.start >= S[ss[k - 1]].end && z.end <= S[ss[k]].start; }); if (between.length) return true; }
      return false;
    });
    return { counts: cnt, unassigned: un, dup: dup, groupBad: gBad, free: S.length - Object.keys(used).length };
  }

  // ---------- 列の推定 ----------
  function guessName(headers) {
    var pr = [/^(氏名|名前|お名前|生徒名|児童名|園児名|お子様のお名前|お子さまのお名前)$/, /氏名|名前|生徒|児童|園児/, /保護者/];
    for (var p = 0; p < pr.length; p++) for (var i = 0; i < headers.length; i++) if (pr[p].test(headers[i])) return i;
    return 0;
  }
  function isTimeHeader(h) { var pc = parseCell(h); return pc.items.length > 0 && !pc.bad.length && pc.items.every(function (it) { return it.m != null || it.dom != null || it.wd != null; }); }
  function guessMode(headers, rows) {
    var wish = []; headers.forEach(function (h, i) { if (/希望/.test(h) && !/しない|不可|悪い/.test(h)) wish.push(i); });
    if (wish.length) return { mode: "wish", cols: wish };
    var marks = []; headers.forEach(function (h, i) { if (isTimeHeader(h)) marks.push(i); });
    if (marks.length) return { mode: "mark", cols: marks };
    for (var i = 0; i < headers.length; i++) if (/都合の悪い|都合が悪い|不可|ng|無理|できない/i.test(headers[i])) return { mode: "ng", cols: [i] };
    return { mode: "wish", cols: [] };
  }
  function guessSib(headers) {
    for (var i = 0; i < headers.length; i++) if (/兄弟|姉妹|きょうだい|続けて|連続/.test(headers[i])) return i;
    return -1;
  }
  // 同じ値（空欄以外）の人をまとめる。並びは名簿の順
  function groupsBy(rows, col) {
    if (col < 0) return [];
    var m = {}, order = [];
    rows.forEach(function (r, i) { var k = key(r[col]); if (!k || BLANK.test(k)) return; if (!m[k]) { m[k] = []; order.push(k); } m[k].push(i); });
    return order.map(function (k) { return m[k]; }).filter(function (g) { return g.length >= 2; });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var API = { decodeBytes: decodeBytes, parseCSV: parseCSV, clean: clean, key: key, norm: norm, parseItem: parseItem, parseCell: parseCell, matches: matches,
    makeSlots: makeSlots, buildPrefs: buildPrefs, hungarian: hungarian, assign: assign, kindOf: kindOf, kindLabel: kindLabel, report: report,
    guessName: guessName, guessMode: guessMode, guessSib: guessSib, groupsBy: groupsBy, isTimeHeader: isTimeHeader,
    hm: hm, dateLabel: dateLabel, shortDate: shortDate, resolveYear: resolveYear, WD: WD, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MENDAN = API;
})(this);
