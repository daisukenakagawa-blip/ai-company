/* 座席表の作成 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function nfkc(s) { s = String(s == null ? "" : s); return s.normalize ? s.normalize("NFKC") : s; }

  // ---------- 乱数（番号が同じなら同じ結果） ----------
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, R) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- 席の並び ----------
  // school: rows 行（前から）× cols 列（左から）、aisle 列ごとに通路（0 は通路なし）
  //   order "row"：前の行から左→右 / "col"：左の列から前→後ろ
  // island: irows × icols 個の島、1つの島は srows × scols 席。番号は島ごとに続けて振る
  function buildSeats(o) {
    var seats = [];
    if (o.type === "island") {
      var IR = Math.max(1, o.irows | 0), IC = Math.max(1, o.icols | 0), SR = Math.max(1, o.srows | 0), SC = Math.max(1, o.scols | 0);
      var no = 0, isl = 0;
      for (var ir = 0; ir < IR; ir++) for (var ic = 0; ic < IC; ic++) {
        for (var sr = 0; sr < SR; sr++) for (var sc = 0; sc < SC; sc++) {
          seats.push({ no: ++no, r: ir * SR + sr, c: ic * SC + sc, gr: ir * (SR + 1) + sr, gc: ic * (SC + 1) + sc, block: isl, row: ir, island: isl + 1, inIsland: sr * SC + sc + 1 });
        }
        isl++;
      }
      return { seats: seats, gridRows: IR * (SR + 1) - 1, gridCols: IC * (SC + 1) - 1, type: "island", islands: IR * IC };
    }
    var R = Math.max(1, o.rows | 0), C = Math.max(1, o.cols | 0), A = Math.max(0, o.aisle | 0);
    var gcOf = function (c) { return A ? c + Math.floor(c / A) : c; };
    var tmp = [];
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) tmp.push({ r: r, c: c, gr: r, gc: gcOf(c), block: A ? Math.floor(c / A) : 0, row: r });
    if (o.order === "col") tmp.sort(function (a, b) { return a.c - b.c || a.r - b.r; });
    tmp.forEach(function (s, i) { s.no = i + 1; seats.push(s); });
    return { seats: seats, gridRows: R, gridCols: gcOf(C - 1) + 1, type: "school" };
  }
  // 隣どうしの席の組（席の添字の組）
  // school：同じ行で通路をはさまない左右。frontBack なら前後も
  // island：同じ島の席すべて
  function neighbors(L, frontBack) {
    var S = L.seats, pairs = [], at = {};
    S.forEach(function (s, i) { at[s.r + "," + s.c] = i; });
    if (L.type === "island") {
      for (var i = 0; i < S.length; i++) for (var j = i + 1; j < S.length; j++) if (S[i].block === S[j].block) pairs.push([i, j]);
      return pairs;
    }
    S.forEach(function (s, i) {
      var rgt = at[s.r + "," + (s.c + 1)];
      if (rgt != null && S[rgt].block === s.block) pairs.push([i, rgt]);
      if (frontBack) { var bk = at[(s.r + 1) + "," + s.c]; if (bk != null) pairs.push([i, bk]); }
    });
    return pairs;
  }

  // 「3, 7, 10-12」「10〜12」を席番号の一覧に。読めない部分は bad に
  function parseNums(text, max) {
    var out = {}, bad = [];
    nfkc(text).split(/[,、\s;]+/).forEach(function (t) {
      if (!t) return;
      var m = t.match(/^(\d+)(?:[-~〜ー－](\d+))?$/);
      if (!m) { bad.push(t); return; }
      var a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) { var x = a; a = b; b = x; }
      if (a < 1 || b > max) { bad.push(t); return; }
      for (var i = a; i <= b; i++) out[i] = 1;
    });
    return { set: out, bad: bad };
  }
  // 決めてある席の値（「12」「12番」「No.12」）を席番号に。空欄は null、読めなければ -1
  function parseSeatNo(v, max) {
    var s = nfkc(clean(v)).replace(/\s/g, "");
    if (!s) return null;
    var m = s.match(/^(?:no\.?|#|第)?(\d+)(?:番|席)?$/i);
    if (!m) return -1;
    var n = +m[1];
    return n >= 1 && n <= max ? n : -1;
  }
  // 「前の方にする」列：○・1・はい・希望 などが入っていれば true
  function truthy(v) {
    var s = nfkc(clean(v)).toLowerCase();
    if (!s) return false;
    return !/^(0|×|x|いいえ|なし|無|不要|no|false|-|ー)$/.test(s);
  }
  // 並べ替え用の比較（数を含むものは数として。日本語は読みではなく文字の順）
  function cmpVal(a, b) {
    var x = nfkc(clean(a)), y = nfkc(clean(b));
    if (x === "" && y !== "") return 1;
    if (y === "" && x !== "") return -1;
    var nx = /^-?\d+(\.\d+)?$/.test(x.replace(/,/g, "")) ? +x.replace(/,/g, "") : null, ny = /^-?\d+(\.\d+)?$/.test(y.replace(/,/g, "")) ? +y.replace(/,/g, "") : null;
    if (nx != null && ny != null) return nx - ny;
    return x.localeCompare(y, "ja", { numeric: true });
  }

  // ---------- 割り当て ----------
  // P：[{fixed: 席番号|null, front: bool, cat: 値 or "", key: 並べ替えの値}]
  // o：{ order: "list"|"sort"|"random", seed, desc, avoid: bool, frontBack: bool, unused: {席番号:1} }
  // 返り値：{ seatOf: 人→席の添字 or -1, personAt: 席の添字→人 or -1, problems: [], overflow: [人] }
  function assign(L, P, o) {
    o = o || {};
    var S = L.seats, n = S.length, R = rng(o.seed || 1), problems = [];
    var unused = o.unused || {};
    var personAt = S.map(function () { return -1; }), seatOf = P.map(function () { return -1; });
    var noIdx = {}; S.forEach(function (s, i) { noIdx[s.no] = i; });
    // 1) 決めてある席
    P.forEach(function (p, i) {
      if (p.fixed == null) return;
      var si = noIdx[p.fixed];
      if (si == null) return;
      if (unused[p.fixed]) { problems.push({ t: "unusedFixed", i: i, no: p.fixed }); return; }
      if (personAt[si] >= 0) { problems.push({ t: "dupFixed", i: i, other: personAt[si], no: p.fixed }); return; }
      personAt[si] = i; seatOf[i] = si;
    });
    // 2) 残りの人の順番
    var rest = []; P.forEach(function (p, i) { if (seatOf[i] < 0) rest.push(i); });
    if (o.order === "random") shuffle(rest, R);
    else if (o.order === "sort") rest.sort(function (a, b) { var d = cmpVal(P[a].key, P[b].key); return (o.desc ? -d : d) || a - b; });
    var pri = rest.filter(function (i) { return P[i].front; }), nor = rest.filter(function (i) { return !P[i].front; });
    // 3) 空いている席
    var free = []; S.forEach(function (s, i) { if (!unused[s.no] && personAt[i] < 0) free.push(i); });
    var byNo = free.slice(); // 席番号の順
    var byFront = free.slice().sort(function (a, b) { return S[a].r - S[b].r || S[a].no - S[b].no; });
    var taken = {};
    pri.forEach(function (i) { for (var k = 0; k < byFront.length; k++) if (!taken[byFront[k]]) { taken[byFront[k]] = 1; personAt[byFront[k]] = i; seatOf[i] = byFront[k]; return; } });
    nor.forEach(function (i) { for (var k = 0; k < byNo.length; k++) if (!taken[byNo[k]]) { taken[byNo[k]] = 1; personAt[byNo[k]] = i; seatOf[i] = byNo[k]; return; } });
    var overflow = []; P.forEach(function (p, i) { if (seatOf[i] < 0 && !problems.some(function (q) { return q.i === i; })) overflow.push(i); });
    // 4) 隣どうしで同じ値にしない（入れ替えをくり返す）
    if (o.avoid) improve(L, P, personAt, seatOf, unused, o.frontBack, R);
    return { seatOf: seatOf, personAt: personAt, problems: problems, overflow: overflow };
  }
  function same(P, a, b) { return a >= 0 && b >= 0 && P[a].cat !== "" && P[a].cat === P[b].cat; }
  function sameCount(L, P, personAt, pairs) { var c = 0; pairs.forEach(function (q) { if (same(P, personAt[q[0]], personAt[q[1]])) c++; }); return c; }
  function improve(L, P, personAt, seatOf, unused, frontBack, R) {
    var S = L.seats, pairs = neighbors(L, frontBack), adj = S.map(function () { return []; });
    pairs.forEach(function (q) { adj[q[0]].push(q[1]); adj[q[1]].push(q[0]); });
    // 動かしてよい席：使う席で、決めてある人がいない席。前の方にする人は、前の方にする人どうしでだけ入れ替える
    var movable = [];
    S.forEach(function (s, i) { if (unused[s.no]) return; var p = personAt[i]; if (p >= 0 && P[p].fixed != null && seatOf[p] === i) return; movable.push(i); });
    if (movable.length < 2) return;
    function grp(si) { var p = personAt[si]; return p < 0 ? 0 : (P[p].front ? 1 : 0); }
    function local(si, p) { var c = 0; adj[si].forEach(function (t) { if (same(P, p, personAt[t])) c++; }); return c; }
    var iters = Math.min(200000, 400 * movable.length + 2000);
    for (var it = 0; it < iters; it++) {
      var a = movable[Math.floor(R() * movable.length)], b = movable[Math.floor(R() * movable.length)];
      if (a === b) continue;
      var pa = personAt[a], pb = personAt[b];
      if (pa < 0 && pb < 0) continue;
      if (grp(a) !== grp(b) && pa >= 0 && pb >= 0) continue;
      if ((pa >= 0 && P[pa].front && pb < 0) || (pb >= 0 && P[pb].front && pa < 0)) continue; // 前の方の人を空席へ動かさない
      var before = local(a, pa) + local(b, pb);
      personAt[a] = pb; personAt[b] = pa;
      var after = local(a, pb) + local(b, pa);
      if (after > before || (after === before && R() < 0.7)) { personAt[a] = pa; personAt[b] = pb; }
      else { if (pa >= 0) seatOf[pa] = b; if (pb >= 0) seatOf[pb] = a; }
    }
  }
  // 隣どうしで同じ値の組（席の添字の組）
  function samePairs(L, P, personAt, frontBack) {
    return neighbors(L, frontBack).filter(function (q) { return same(P, personAt[q[0]], personAt[q[1]]); });
  }

  // 見た向き：front "top"＝前を上（座る人から見た向き）／"bottom"＝前を下（前に立つ人から見た向き。上下左右を入れ替える）
  function viewPos(L, s, front) {
    if (front === "bottom") return { gr: L.gridRows - 1 - s.gr, gc: L.gridCols - 1 - s.gc };
    return { gr: s.gr, gc: s.gc };
  }

  function guessName(headers) {
    for (var i = 0; i < headers.length; i++) if (/氏名|名前|なまえ|お名前|^name$|参加者|受験者|生徒名|児童名|社員名|メンバー/i.test(headers[i])) return i;
    return 0;
  }
  function guessFixed(headers) {
    for (var i = 0; i < headers.length; i++) if (/席番号|座席|^席$|指定席|決めてある席/.test(headers[i])) return i;
    return -1;
  }
  function guessFront(headers) {
    for (var i = 0; i < headers.length; i++) if (/前の席|前方|前列|配慮|前希望/.test(headers[i])) return i;
    return -1;
  }
  function guessAvoid(headers, rows) {
    for (var i = 0; i < headers.length; i++) {
      if (!/部署|所属|学校|出身|会社|チーム|クラス|組|支店|地区/.test(headers[i])) continue;
      var v = {}; rows.forEach(function (r) { v[clean(r[i])] = 1; });
      var k = Object.keys(v).length; if (k >= 2 && k <= Math.max(2, rows.length / 2)) return i;
    }
    return -1;
  }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var API = { decodeBytes: decodeBytes, parseCSV: parseCSV, clean: clean, rng: rng, buildSeats: buildSeats, neighbors: neighbors, parseNums: parseNums,
    parseSeatNo: parseSeatNo, truthy: truthy, cmpVal: cmpVal, assign: assign, samePairs: samePairs, sameCount: sameCount, viewPos: viewPos,
    guessName: guessName, guessFixed: guessFixed, guessFront: guessFront, guessAvoid: guessAvoid, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ZASEKI = API;
})(this);
