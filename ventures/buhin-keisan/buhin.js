/* 部品表の必要数と作れる数 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function clean(s) { return String(s == null ? "" : s).replace(/[\s　]+/g, " ").trim(); }

  // 数として読む。「1,200」「12個」「0.25m」「３」。空欄は null、読めなければ NaN
  function num(v) {
    var s = norm(v).replace(/[,，]/g, "").replace(/(個|本|枚|箱|袋|冊|ケース|cs|kg|g|L|l|ml|mL|cm|mm|m|台|組|セット|式|缶|パック|点|pc|pcs|ea|巻|粒|玉|足|着|部|個入)$/i, "").trim();
    if (s === "" || s === "-" || s === "ー" || s === "―") return null;
    s = s.replace(/^[△▲−‐]/, "-");
    if (!/^-?\d+(\.\d+)?$/.test(s) && !/^-?\.\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }
  var EPS = 1e-9;
  function round(x) { return Math.round(x * 1e6) / 1e6; }
  function fmt(x) {
    if (x == null || isNaN(x)) return "";
    x = Math.round(x * 1000) / 1000;
    var p = String(Math.abs(x)).split(".");
    return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : "");
  }

  // ---------- 列の推定 ----------
  function pick(headers, used, res) {
    for (var r = 0; r < res.length; r++) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (res[r].test(norm(headers[i]))) { used[i] = 1; return i; }
      }
    }
    return null;
  }
  // 部品表：親（製品・セット）・親の名前・子（部品・材料・中身）・子の名前・数（1個あたり）・単位
  function guessBom(headers) {
    var used = {}, c = {};
    var P = "(製品|親|セット|完成品|商品|作る物|作るもの|上位)", C = "(部品|子|材料|中身|構成品|構成|資材|原料|下位)";
    c.parent = pick(headers, used, [new RegExp("^" + P + ".*(コード|番号|品番|ID|code)", "i"), new RegExp("^親"), new RegExp(P + "(?!.*(名|数))")]);
    c.child = pick(headers, used, [new RegExp("^" + C + ".*(コード|番号|品番|ID|code)", "i"), new RegExp("^子"), new RegExp(C + "(?!.*(名|数))")]);
    c.qty = pick(headers, used, [/員数|使用数|必要数|1個あたり|1つあたり|あたり|所要|数量|個数|qty|quantity/i, /数/]);
    c.childName = pick(headers, used, [new RegExp(C + ".*(名|の名前)"), /名称|品名|名前|name/i]);
    c.parentName = pick(headers, used, [new RegExp(P + ".*(名|の名前)")]);
    c.unit = pick(headers, used, [/単位|unit/i]);
    Object.keys(c).forEach(function (k) { if (c[k] == null) delete c[k]; });
    // 見出しで決まらないときは、左から 親・子・数
    if (c.parent == null && c.child == null && headers.length >= 3) { c.parent = 0; c.child = 1; if (c.qty == null) c.qty = 2; }
    return c;
  }
  // 在庫：品番・名前・在庫数
  function guessStock(headers) {
    var used = {}, c = {};
    c.qty = pick(headers, used, [/在庫|有り高|手持ち|残数|残り|現在数|数量|個数|qty|stock/i, /数/]);
    c.code = pick(headers, used, [/品番|コード|番号|部品|材料|品目|SKU|JAN|型番|code|id/i]);
    c.name = pick(headers, used, [/品名|名称|名前|商品名|name/i]);
    Object.keys(c).forEach(function (k) { if (c[k] == null) delete c[k]; });
    if (c.code == null && c.name == null && headers.length >= 2) { c.code = 0; if (c.qty == null) c.qty = headers.length - 1; }
    return c;
  }

  // ---------- 突き合わせの鍵 ----------
  function codeKey(v, opt) {
    var s = norm(v).toUpperCase();
    if (s === "") return "";
    if (!opt || opt.hyphen !== false) s = s.replace(/[\s\-‐‑–—―−_.\/・]/g, "");
    else s = s.replace(/\s+/g, " ");
    return s;
  }

  // ---------- 部品表を読む ----------
  // 戻り値 g：items[key] = {key, code, name, unit, children:[{key, qty, rows}], parents:{}}
  function buildBom(rows, cols, opt) {
    opt = opt || {};
    var items = {}, order = [], errs = [], dups = [], skip = 0;
    function get(r, k) { return cols[k] == null || cols[k] === "" ? "" : r[cols[k]]; }
    function item(code, name) {
      var key = codeKey(code, opt);
      var it = items[key];
      if (!it) { it = items[key] = { key: key, code: code, name: "", unit: "", children: [], childIdx: {}, parents: {} }; order.push(key); }
      if (!it.name && name) it.name = name;
      return it;
    }
    rows.forEach(function (r, i) {
      var p = clean(get(r, "parent")), c = clean(get(r, "child")), qRaw = get(r, "qty"), q = num(qRaw);
      var pn = clean(get(r, "parentName")), cn = clean(get(r, "childName")), un = clean(get(r, "unit"));
      if (!p && !c && q == null) { skip++; return; }
      if (!codeKey(p, opt)) { errs.push({ i: i, parent: p, child: c, err: "親（製品）が空欄" }); return; }
      if (!codeKey(c, opt)) { errs.push({ i: i, parent: p, child: c, err: "子（部品）が空欄" }); return; }
      if (q == null) { errs.push({ i: i, parent: p, child: c, err: "数が空欄" }); return; }
      if (isNaN(q)) { errs.push({ i: i, parent: p, child: c, err: "数が数字でない（" + norm(qRaw) + "）" }); return; }
      if (q < 0) { errs.push({ i: i, parent: p, child: c, err: "数がマイナス（" + fmt(q) + "）" }); return; }
      var P = item(p, pn), C = item(c, cn);
      if (un && !C.unit) C.unit = un;
      if (P.key === C.key) { errs.push({ i: i, parent: p, child: c, err: "親と子が同じ" }); return; }
      var e = P.childIdx[C.key];
      if (e) { e.qty = round(e.qty + q); e.rows.push(i); dups.push({ parent: P.key, child: C.key, rows: e.rows }); }
      else { e = P.childIdx[C.key] = { key: C.key, qty: q, rows: [i] }; P.children.push(e); }
      C.parents[P.key] = 1;
    });
    // 段（いちばん上の製品を 0 とし、いちばん深い位置の段を使う）と循環の検出
    var level = {}, state = {}, cycles = [];
    function visit(k, d, path) {
      if (state[k] === 1) { cycles.push(path.slice(path.indexOf(k)).concat(k)); return; }
      if (level[k] != null && level[k] >= d && state[k] === 2) return;
      level[k] = Math.max(level[k] == null ? 0 : level[k], d);
      state[k] = 1; path.push(k);
      items[k].children.forEach(function (e) { visit(e.key, d + 1, path); });
      path.pop(); state[k] = 2;
    }
    var tops = order.filter(function (k) { return !Object.keys(items[k].parents).length && items[k].children.length; });
    tops.forEach(function (k) { visit(k, 0, []); });
    // 親のない輪（全部が循環）も拾う
    order.forEach(function (k) { if (state[k] == null && items[k].children.length) visit(k, 0, []); });
    var seenCyc = {};
    cycles = cycles.filter(function (c) { var s = c.slice(0, -1).sort().join(">"); if (seenCyc[s]) return false; seenCyc[s] = 1; return true; });
    var dupSeen = {};
    dups = dups.filter(function (d) { var s = d.parent + ">" + d.child; if (dupSeen[s]) return false; dupSeen[s] = 1; return true; });
    return { items: items, order: order, tops: tops, level: level, errs: errs, dups: dups, cycles: cycles, skip: skip, opt: opt };
  }

  // ---------- 在庫を読む ----------
  function buildStock(rows, cols, opt) {
    var map = {}, errs = [], dups = {}, names = {};
    function get(r, k) { return cols[k] == null || cols[k] === "" ? "" : r[cols[k]]; }
    rows.forEach(function (r, i) {
      var code = clean(get(r, "code")), name = clean(get(r, "name")), qRaw = get(r, "qty"), q = num(qRaw);
      var key = codeKey(code || name, opt);
      if (!key && q == null) return;
      if (!key) { errs.push({ i: i, code: code, err: "品番が空欄" }); return; }
      if (q == null) { errs.push({ i: i, code: code || name, err: "在庫数が空欄" }); return; }
      if (isNaN(q)) { errs.push({ i: i, code: code || name, err: "在庫数が数字でない（" + norm(qRaw) + "）" }); return; }
      if (map[key] != null) dups[key] = (dups[key] || 1) + 1;
      map[key] = round((map[key] || 0) + q);
      if (name && !names[key]) names[key] = name;
    });
    return { map: map, errs: errs, dups: dups, names: names };
  }

  // ---------- 展開（必要数の計算） ----------
  // plan: {key: 作る数}。opt.net: 途中の部品（半製品）の在庫を先に使う
  // 戻り値 need[key] = {gross（必要数の合計）, use（使う在庫）, make（作る数／不足）}
  function explode(g, plan, stock, opt) {
    opt = opt || {};
    var gross = {}, keys = Object.keys(g.level).concat(Object.keys(plan).filter(function (k) { return g.level[k] == null; }));
    Object.keys(plan).forEach(function (k) { if (plan[k] > 0) gross[k] = round((gross[k] || 0) + plan[k]); });
    keys.sort(function (a, b) { return (g.level[a] || 0) - (g.level[b] || 0); });
    var out = {};
    keys.forEach(function (k) {
      var q = gross[k] || 0;
      if (!q) return;
      var it = g.items[k], has = it && it.children.length, s = stock && stock[k] != null ? stock[k] : null;
      var o = out[k] = { gross: q, stock: s, use: 0, make: q };
      if (has) {
        if (opt.net && s != null && s > 0 && !plan[k]) { o.use = Math.min(s, q); }
        else if (opt.net && s != null && s > 0 && plan[k]) {
          // 作る数を直接入れた途中の部品は、その数は作る。ほかの製品の分にだけ在庫を使う
          var other = round(q - plan[k]); o.use = Math.min(s, Math.max(0, other));
        }
        o.make = round(q - o.use);
        if (o.make > 0) it.children.forEach(function (e) { gross[e.key] = round((gross[e.key] || 0) + o.make * e.qty); });
      } else {
        o.use = s == null ? 0 : Math.min(Math.max(s, 0), q);
        o.make = round(q - o.use); // 末端の部品：足りない数
      }
    });
    return out;
  }
  function isLeaf(g, k) { var it = g.items[k]; return !it || !it.children.length; }

  // 製品ごとの内訳（途中の在庫は使わずに、その製品だけを作るときの必要数）
  function breakdown(g, plan) {
    var by = {};
    Object.keys(plan).forEach(function (p) {
      if (!(plan[p] > 0)) return;
      var one = {}; one[p] = plan[p];
      var r = explode(g, one, null, {});
      Object.keys(r).forEach(function (k) { if (k !== p && isLeaf(g, k)) (by[k] = by[k] || []).push([p, r[k].gross]); });
    });
    return by;
  }

  // ---------- 必要数の計算（画面の本体） ----------
  function run(g, plan, stockMap, opt) {
    opt = opt || {};
    var hasStock = !!stockMap;
    var need = explode(g, plan, stockMap, opt), by = breakdown(g, plan), res = [];
    Object.keys(need).forEach(function (k) {
      var n = need[k], it = g.items[k] || { code: k, name: "", unit: "", children: [], parents: {} };
      var leaf = !it.children.length, isTopPlan = plan[k] > 0 && !Object.keys(it.parents).length;
      if (isTopPlan && !leaf) return; // 作る製品そのものは一覧に入れない
      var x = { key: k, code: it.code, name: it.name || (opt.names && opt.names[k]) || "", unit: it.unit, level: g.level[k] == null ? 0 : g.level[k], leaf: leaf,
        need: n.gross, stock: hasStock ? n.stock : null, short: 0, rest: null, use: n.use, make: n.make, notes: [] };
      if (leaf) {
        if (hasStock) {
          if (n.stock == null) { x.short = n.gross; x.notes.push("在庫の表にない（在庫 0 として計算）"); }
          else { x.short = Math.max(0, round(n.gross - Math.max(0, n.stock))); x.rest = round(n.stock - n.gross); if (n.stock < 0) x.notes.push("在庫がマイナス（0 として計算）"); }
        }
        if (plan[k] > 0 && !Object.keys(it.parents).length) x.notes.push("部品表に中身がない品（この品そのものを数えました）");
        var bsum = by[k] ? by[k].reduce(function (a, p) { return a + p[1]; }, 0) : 0, pre = Math.abs(bsum - n.gross) > EPS ? "（途中の部品の在庫を使う前の数）" : "";
        if (by[k] && by[k].length > 1) x.notes.push("内訳" + pre + "：" + by[k].map(function (p) { return label(g, p[0]) + " " + fmt(p[1]); }).join("・"));
        else if (by[k] && by[k].length === 1 && Object.keys(plan).filter(function (p) { return plan[p] > 0; }).length > 1) x.notes.push("内訳：" + label(g, by[k][0][0]) + " の分だけ");
      } else {
        x.notes.push(n.use > 0 ? "途中の部品：在庫 " + fmt(n.use) + " を使い、" + fmt(n.make) + " を作る" : "途中の部品：" + fmt(n.make) + " を作る");
      }
      x.status = !hasStock ? "need" : !leaf ? "mid" : x.short > EPS ? "short" : "ok";
      res.push(x);
    });
    res.sort(function (a, b) { return (a.leaf === b.leaf ? 0 : a.leaf ? -1 : 1) || g.order.indexOf(a.key) - g.order.indexOf(b.key); });
    var count = { leaf: 0, short: 0, ok: 0, mid: 0, nostock: 0 };
    res.forEach(function (x) { if (x.leaf) { count.leaf++; if (x.status === "short") count.short++; if (x.status === "ok") count.ok++; if (hasStock && x.stock == null) count.nostock++; } else count.mid++; });
    return { res: res, count: count };
  }
  function label(g, k) { var it = g.items[k]; return it ? (it.name ? it.code + "（" + it.name + "）" : it.code) : k; }

  // ---------- 在庫であと何個作れるか（製品ごとに、ほかの製品は作らないとして） ----------
  function feasible(g, k, n, stock, opt) {
    var p = {}; p[k] = n;
    var r = explode(g, p, stock, opt), shortList = [];
    Object.keys(r).forEach(function (x) { if (isLeaf(g, x) && x !== k && r[x].make > EPS) shortList.push(x); });
    if (isLeaf(g, k)) { var s = stock[k] || 0; if (n > s + EPS) shortList.push(k); }
    return shortList;
  }
  function canMake(g, k, stock, opt) {
    opt = opt || {};
    var it = g.items[k];
    if (!it || !it.children.length) return { n: Math.max(0, Math.floor((stock[k] || 0) + EPS)), limit: [k], missing: [] };
    var LIM = 1e7;
    if (feasible(g, k, 1, stock, opt).length) return { n: 0, limit: feasible(g, k, 1, stock, opt), missing: missingLeaves(g, k, stock) };
    var lo = 1, hi = 2;
    while (hi <= LIM && !feasible(g, k, hi, stock, opt).length) { lo = hi; hi *= 2; }
    if (hi > LIM) return { n: null, limit: [], missing: [] }; // 数を使わない部品だけなど
    while (hi - lo > 1) { var m = Math.floor((lo + hi) / 2); if (feasible(g, k, m, stock, opt).length) hi = m; else lo = m; }
    return { n: lo, limit: feasible(g, k, lo + 1, stock, opt), missing: missingLeaves(g, k, stock) };
  }
  function missingLeaves(g, k, stock) {
    var p = {}; p[k] = 1;
    return Object.keys(explode(g, p, null, {})).filter(function (x) { return x !== k && isLeaf(g, x) && stock[x] == null; });
  }
  // 作れる数の一覧。targets：計算する製品の鍵（既定はいちばん上の製品）
  function makeable(g, stock, opt, targets) {
    targets = targets || g.tops;
    return targets.map(function (k) {
      var r = canMake(g, k, stock, opt), it = g.items[k];
      var per = explode(g, (function () { var o = {}; o[k] = 1; return o; })(), null, {});
      var leaves = Object.keys(per).filter(function (x) { return x !== k && isLeaf(g, x); }).length;
      return { key: k, code: it ? it.code : k, name: it ? it.name : "", n: r.n, limit: r.limit, missing: r.missing, parts: leaves, top: !(it && Object.keys(it.parents).length) };
    });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, num: num, fmt: fmt, round: round, guessBom: guessBom, guessStock: guessStock, codeKey: codeKey,
    buildBom: buildBom, buildStock: buildStock, explode: explode, run: run, canMake: canMake, makeable: makeable, label: label, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BUHIN = api;
})(this);
