/* 班分け・グループ分け — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  // 名前を比べるときの形（全角半角・空白の違いを無視）
  function key(s) { s = String(s == null ? "" : s); if (s.normalize) s = s.normalize("NFKC"); return s.replace(/\s+/g, "").toLowerCase(); }
  function numOf(v) {
    var s = clean(v); if (s.normalize) s = s.normalize("NFKC");
    s = s.replace(/,/g, "").replace(/(点|歳|才|cm|kg)$/i, "");
    return /^-?\d+(\.\d+)?$/.test(s) ? +s : null;
  }

  // ---------- 乱数（番号が同じなら同じ結果） ----------
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, R) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- 班の名前 ----------
  var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function label(style, i) {
    if (style === "abc") return (i < 26 ? ABC[i] : ABC[Math.floor(i / 26) - 1] + ABC[i % 26]) + "班";
    if (style === "group") return "グループ" + (i + 1);
    if (style === "team") return "チーム" + (i + 1);
    return (i + 1) + "班";
  }
  // 「2」「2班」「B」「B班」「グループ2」などを班の番号（0始まり）に。読めなければ null
  function parseFixed(v, style, k) {
    var s = clean(v); if (s.normalize) s = s.normalize("NFKC"); s = s.replace(/\s/g, "");
    if (!s) return null;
    for (var i = 0; i < k; i++) if (key(label(style, i)) === key(s)) return i;
    var m = s.match(/^(?:第)?(\d+)(?:班|組|グループ|チーム|g)?$/i) || s.match(/^(?:グループ|チーム|班|group|team)(\d+)$/i);
    if (m) { var n = +m[1] - 1; return n >= 0 && n < k ? n : -1; }
    m = s.match(/^([a-z]{1,2})(?:班|組)?$/i);
    if (m) { var t = m[1].toUpperCase(), n2 = t.length === 1 ? ABC.indexOf(t) : (ABC.indexOf(t[0]) + 1) * 26 + ABC.indexOf(t[1]); return n2 >= 0 && n2 < k ? n2 : -1; }
    return -1;
  }

  // ---------- 班の大きさ ----------
  // mode "count": k 班に分ける / "size": 1班 m 人を目安に分ける（班の数は 人数÷m を切り上げ）
  function sizesFor(N, mode, v) {
    var k = mode === "size" ? Math.max(1, Math.ceil(N / Math.max(1, v))) : Math.max(1, Math.min(v, N || 1));
    var base = Math.floor(N / k), extra = N % k, out = [];
    for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  // ---------- 条件の読み取り（1行に1組。区切りは、，・／/タブ） ----------
  function parsePairs(text, names) {
    var idx = {}, dup = {};
    names.forEach(function (n, i) { var k = key(n); if (!k) return; if (idx[k] != null) dup[k] = 1; else idx[k] = i; });
    var sets = [], problems = [];
    String(text || "").split(/\r?\n/).forEach(function (line, li) {
      var parts = line.split(/[,、，・\/／\t]|\s{2,}|　/).map(clean).filter(Boolean);
      if (!parts.length) return;
      if (parts.length < 2) { problems.push((li + 1) + "行目「" + clean(line) + "」：名前を2人以上、区切って書いてください"); return; }
      var ids = [], bad = false;
      parts.forEach(function (p) {
        var k = key(p);
        if (idx[k] == null) { problems.push((li + 1) + "行目「" + p + "」が名簿に見つかりません"); bad = true; }
        else { if (dup[k]) problems.push((li + 1) + "行目「" + p + "」は名簿に同じ名前が複数あります（最初の人として扱います）"); if (ids.indexOf(idx[k]) < 0) ids.push(idx[k]); }
      });
      if (!bad && ids.length >= 2) sets.push({ ids: ids, line: li + 1 });
    });
    return { sets: sets, problems: problems };
  }

  // ---------- 班分け ----------
  // P: [{ cat: [値...], num: 数|null, fixed: 班|null, prev: 値 }], opt: { sizes, sep: [[i,j..]], tog: [[i,j..]], seed, iters }
  var W = { sep: 1000, tog: 1000, bal: 10, num: 10, prev: 3 };
  function solve(P, opt) {
    var N = P.length, sizes = opt.sizes.slice(), k = sizes.length, R = rng(opt.seed || 1);
    var nCat = P.length ? P[0].cat.length : 0;
    // 属性ごとの値の番号と、全体の数
    var catIds = [], catTot = [];
    for (var c = 0; c < nCat; c++) {
      var m = {}, tot = [];
      P.forEach(function (p) { var v = p.cat[c]; if (m[v] == null) { m[v] = tot.length; tot.push(0); } tot[m[v]]++; });
      catIds.push(P.map(function (p) { return m[p.cat[c]]; })); catTot.push(tot);
    }
    var nums = P.map(function (p) { return p.num; }), hasNum = nums.some(function (x) { return x != null; });
    var nn = 0, ns = 0, ns2 = 0; nums.forEach(function (x) { if (x != null) { nn++; ns += x; ns2 += x * x; } });
    var nMean = nn ? ns / nn : 0, nVar = nn > 1 ? Math.max(1e-9, (ns2 - ns * ns / nn) / nn) : 1;
    var sepOf = P.map(function () { return []; });
    (opt.sep || []).forEach(function (s) { s.forEach(function (a) { s.forEach(function (b) { if (a !== b) sepOf[a].push(b); }); }); });
    var togOf = P.map(function () { return []; }), tog = opt.tog || [];
    tog.forEach(function (s, si) { s.forEach(function (a) { togOf[a].push(si); }); });
    var prevKey = P.map(function (p) { return p.prev ? key(p.prev) : ""; });

    // 初めの割り当て：決めてある人 → 一緒にする組 → 残りを属性の順に蛇行で配る
    var g = new Array(N).fill(-1), room = sizes.slice(), fixedMask = new Array(N).fill(false);
    P.forEach(function (p, i) { if (p.fixed != null && p.fixed >= 0 && p.fixed < k) { g[i] = p.fixed; room[p.fixed]--; fixedMask[i] = true; } });
    var order = shuffle(P.map(function (_, i) { return i; }), R);
    // 一緒にする組（決めてある人がいればその班へ）
    tog.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (s) {
      var target = -1;
      s.forEach(function (i) { if (g[i] >= 0) target = g[i]; });
      var need = s.filter(function (i) { return g[i] < 0; });
      if (target < 0) { var best = -1; for (var j = 0; j < k; j++) if (best < 0 || room[j] > room[best]) best = j; target = best; }
      need.forEach(function (i) { g[i] = target; room[target]--; });
    });
    var rest = order.filter(function (i) { return g[i] < 0; });
    var sk = function (i) { return P[i].cat.join("\u0001"); };
    rest.sort(function (a, b) { var x = sk(a), y = sk(b); return x < y ? -1 : x > y ? 1 : 0; }); // 安定ソート：同じ属性の中は乱数の順
    var dir = 1, pos = Math.floor(R() * k);
    rest.forEach(function (i) {
      var tries = 0;
      while (room[pos] <= 0 && tries < 2 * k) { pos += dir; if (pos >= k) { pos = k - 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; } tries++; }
      if (room[pos] <= 0) { var b = 0; for (var j = 1; j < k; j++) if (room[j] > room[b]) b = j; pos = b; }
      g[i] = pos; room[pos]--;
      pos += dir; if (pos >= k) { pos = k - 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
    });

    // 班ごとの数え上げ
    var members = []; for (var j0 = 0; j0 < k; j0++) members.push([]);
    g.forEach(function (gi, i) { members[gi].push(i); });
    function groupCost(j) {
      var mem = members[j], sz = mem.length, cost = 0;
      for (var c = 0; c < nCat; c++) {
        var cnt = catTot[c].map(function () { return 0; });
        mem.forEach(function (i) { cnt[catIds[c][i]]++; });
        for (var v = 0; v < cnt.length; v++) { var e = catTot[c][v] * sz / N, d = cnt[v] - e; cost += W.bal * d * d; }
      }
      if (hasNum) {
        var s = 0, n = 0; mem.forEach(function (i) { if (nums[i] != null) { s += nums[i]; n++; } });
        if (n) { var d2 = s / n - nMean; cost += W.num * n * d2 * d2 / nVar; }
      }
      var pc = {}, pairs = 0, sepv = 0;
      mem.forEach(function (i) { var pk = prevKey[i]; if (pk) { pairs += pc[pk] || 0; pc[pk] = (pc[pk] || 0) + 1; } });
      mem.forEach(function (i) { sepOf[i].forEach(function (b) { if (g[b] === j) sepv++; }); });
      return cost + W.prev * pairs + W.sep * sepv / 2;
    }
    function togCost(si) {
      var s = tog[si], cnt = {}, mx = 0;
      s.forEach(function (i) { cnt[g[i]] = (cnt[g[i]] || 0) + 1; if (cnt[g[i]] > mx) mx = cnt[g[i]]; });
      return W.tog * (s.length - mx);
    }
    var gc = members.map(function (_, j) { return groupCost(j); });
    var tc = tog.map(function (_, si) { return togCost(si); });
    function total() { return gc.reduce(function (a, b) { return a + b; }, 0) + tc.reduce(function (a, b) { return a + b; }, 0); }
    var movable = P.map(function (_, i) { return i; }).filter(function (i) { return !fixedMask[i]; });
    function trySwap(a, b, temp) {
      var ga = g[a], gb = g[b];
      if (ga === gb) return false;
      var ts = {}; togOf[a].forEach(function (s) { ts[s] = 1; }); togOf[b].forEach(function (s) { ts[s] = 1; });
      var tl = Object.keys(ts).map(Number);
      var before = gc[ga] + gc[gb] + tl.reduce(function (x, s) { return x + tc[s]; }, 0);
      var ma = members[ga], mb = members[gb];
      ma[ma.indexOf(a)] = b; mb[mb.indexOf(b)] = a; g[a] = gb; g[b] = ga;
      var nga = groupCost(ga), ngb = groupCost(gb), ntc = tl.map(togCost);
      var after = nga + ngb + ntc.reduce(function (x, y) { return x + y; }, 0), d = after - before;
      if (d <= 1e-9 || (temp > 0 && R() < Math.exp(-d / temp))) {
        gc[ga] = nga; gc[gb] = ngb; tl.forEach(function (s, x) { tc[s] = ntc[x]; }); return d < -1e-9;
      }
      ma[ma.indexOf(b)] = a; mb[mb.indexOf(a)] = b; g[a] = ga; g[b] = gb;
      return false;
    }
    var M = movable.length;
    if (M >= 2 && k >= 2) {
      var iters = opt.iters || Math.min(300000, Math.max(20000, 300 * N));
      var t0 = 5;
      for (var it = 0; it < iters; it++) {
        var a = movable[Math.floor(R() * M)], b = movable[Math.floor(R() * M)];
        trySwap(a, b, t0 * (1 - it / iters));
      }
      // 仕上げ：良くなる入れ替えがなくなるまで（大きな名簿は回数を抑える）
      for (var pass = 0; pass < (N <= 400 ? 20 : 3); pass++) {
        var improved = false;
        for (var x = 0; x < M; x++) for (var y = x + 1; y < M; y++) if (trySwap(movable[x], movable[y], 0)) improved = true;
        if (!improved) break;
      }
    }
    return { g: g, cost: total() };
  }

  // ---------- 結果の点検 ----------
  // 班ごとの人数・属性の内訳・数の平均・前回同じ班だった組、条件を満たせなかったもの
  function report(P, g, k, opt) {
    var nCat = P.length ? P[0].cat.length : 0, groups = [];
    for (var j = 0; j < k; j++) groups.push({ n: 0, cats: [], numSum: 0, numN: 0, prevPairs: [] });
    var vals = [];
    for (var c = 0; c < nCat; c++) {
      var seen = {}, list = [];
      P.forEach(function (p) { if (!seen[p.cat[c]]) { seen[p.cat[c]] = 1; list.push(p.cat[c]); } });
      list.sort(function (a, b) { return a === "" ? 1 : b === "" ? -1 : a < b ? -1 : a > b ? 1 : 0; });
      vals.push(list);
      groups.forEach(function (G) { var o = {}; list.forEach(function (v) { o[v] = 0; }); G.cats.push(o); });
    }
    var byPrev = [];
    P.forEach(function (p, i) {
      var G = groups[g[i]]; if (!G) return;
      G.n++;
      for (var c = 0; c < nCat; c++) G.cats[c][p.cat[c]]++;
      if (p.num != null) { G.numSum += p.num; G.numN++; }
    });
    for (var j2 = 0; j2 < k; j2++) {
      var mem = []; P.forEach(function (p, i) { if (g[i] === j2) mem.push(i); });
      var pk = {}; mem.forEach(function (i) { var x = P[i].prev ? key(P[i].prev) : ""; if (x) (pk[x] = pk[x] || []).push(i); });
      Object.keys(pk).forEach(function (x) { var a = pk[x]; for (var u = 0; u < a.length; u++) for (var w = u + 1; w < a.length; w++) groups[j2].prevPairs.push([a[u], a[w]]); });
    }
    groups.forEach(function (G) { G.numMean = G.numN ? G.numSum / G.numN : null; });
    var sepBad = [], togBad = [];
    (opt.sep || []).forEach(function (s) { for (var u = 0; u < s.length; u++) for (var w = u + 1; w < s.length; w++) if (g[s[u]] === g[s[w]]) sepBad.push([s[u], s[w]]); });
    (opt.tog || []).forEach(function (s) { var g0 = g[s[0]]; if (s.some(function (i) { return g[i] !== g0; })) togBad.push(s); });
    // 属性ごとの、班による人数の差（最多－最少）
    var spread = vals.map(function (list, c) {
      return list.map(function (v) {
        var a = groups.map(function (G) { return G.cats[c][v]; });
        return { value: v, min: Math.min.apply(null, a), max: Math.max.apply(null, a) };
      });
    });
    return { groups: groups, vals: vals, sepBad: sepBad, togBad: togBad, spread: spread, prevTotal: groups.reduce(function (a, G) { return a + G.prevPairs.length; }, 0) };
  }

  // ---------- 列の推定 ----------
  function guessName(headers) {
    for (var i = 0; i < headers.length; i++) if (/氏名|名前|なまえ|お名前|^name$|参加者|メンバー|生徒名|児童名|社員名/i.test(headers[i])) return i;
    return 0;
  }
  function guessBalance(headers, rows) {
    var out = [];
    headers.forEach(function (h, i) {
      if (!/性別|男女|学年|年生|部署|所属|部門|課|年代|クラス|組$|学校|地区|地域|支店|事業所|経験|役割|職種/.test(h)) return;
      var d = {}; rows.forEach(function (r) { d[clean(r[i])] = 1; });
      var n = Object.keys(d).length;
      if (n >= 2 && n <= Math.max(2, Math.min(30, rows.length / 2))) out.push(i);
    });
    return out;
  }
  function guessPrev(headers) {
    for (var i = 0; i < headers.length; i++) if (/前回|前の班|昨年|去年|前年/.test(headers[i])) return i;
    return -1;
  }
  function guessFixed(headers) {
    for (var i = 0; i < headers.length; i++) if (/固定|指定の班|決めて|班の指定/.test(headers[i])) return i;
    return -1;
  }

  function fix(x, d) { return x == null || isNaN(x) ? "-" : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var API = { decodeBytes: decodeBytes, parseCSV: parseCSV, clean: clean, key: key, numOf: numOf, rng: rng, label: label, parseFixed: parseFixed,
    sizesFor: sizesFor, parsePairs: parsePairs, solve: solve, report: report, guessName: guessName, guessBalance: guessBalance,
    guessPrev: guessPrev, guessFixed: guessFixed, fix: fix, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.HANWAKE = API;
})(this);
