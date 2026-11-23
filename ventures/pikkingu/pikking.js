/* ピッキングリストと仕分け表 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // 数として読む。「1,200」「12個」「３」。空欄は null、読めなければ NaN
  function num(v) {
    var s = norm(v).replace(/[,，]/g, "").replace(/(個|本|枚|箱|袋|冊|ケース|cs|kg|g|L|l|ml|mL|m|台|組|セット|缶|パック|点|pc|pcs|ea|コ)$/i, "").trim();
    if (s === "" || s === "-" || s === "ー" || s === "―") return null;
    s = s.replace(/^[△▲−‐]/, "-");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function round(x) { return Math.round(x * 1000) / 1000; }
  function fmt(x) { if (x == null || isNaN(x)) return ""; x = round(x); var p = String(Math.abs(x)).split("."); return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : ""); }

  // ---------- 列の推定 ----------
  var ROLES = [
    ["shelf", /棚番|棚番号|ロケーション|ロケ|保管場所|置き場|棚|location|bin/i],
    ["order", /注文番号|受注番号|注文ID|注文No|受注No|オーダー番号|伝票番号|order ?(id|no|number)?$|^注文$|^受注$/i],
    ["code", /品番|商品コード|品目コード|JAN|型番|SKU|商品番号|品目番号|item ?(code|no)/i],
    ["code", /^(?!.*(得意先|仕入先|取引先|顧客|会員|伝票|注文|受注|郵便|店舗|倉庫|配送)).*(コード|code)/i],
    ["qty", /数量|注文数|受注数|出荷数|個数|^数$|qty|quantity/i],
    ["dest", /お届け先|届け先|配送先|送付先|宛名|氏名|名前|お客様|顧客名|購入者|得意先名|会社名|ship ?to|customer/i],
    ["name", /品名|商品名|品目|名称|アイテム|item|^商品$|product|内容/i]
  ];
  function guessColumns(headers) {
    var cols = {}, used = {};
    ROLES.forEach(function (rr) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i] || cols[rr[0]] != null) continue;
        if (rr[1].test(norm(headers[i]))) { cols[rr[0]] = i; used[i] = 1; return; }
      }
    });
    return cols;
  }

  // ---------- 鍵・並べ方 ----------
  function codeKey(v, opt) {
    var s = norm(v).toUpperCase();
    if (s === "") return "";
    if (!opt || opt.hyphen !== false) s = s.replace(/[\s\-‐‑–—―ー−_.\/・]/g, "");
    return s;
  }
  function nameKey(v) {
    return norm(v).toLowerCase().replace(/\s/g, "").replace(/[【\[［〔(（《〈「『]/g, "(").replace(/[】\]］〕)）》〉」』]/g, ")");
  }
  // 棚番の自然な順：「A-2」<「A-10」、「1-2-3」<「1-10-1」。空欄は最後
  function shelfParts(s) {
    s = norm(s).toUpperCase();
    var out = [], m, re = /(\d+)|([^\d]+)/g;
    while ((m = re.exec(s))) out.push(m[1] != null ? +m[1] : m[2].replace(/[\s\-‐‑–—―ー−_.\/・]/g, "-"));
    return out;
  }
  function shelfCmp(a, b) {
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    var x = shelfParts(a), y = shelfParts(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      if (i >= x.length) return -1; if (i >= y.length) return 1;
      var p = x[i], q = y[i];
      if (p === q) continue;
      if (typeof p === "number" && typeof q === "number") return p - q;
      if (typeof p === "number") return -1; if (typeof q === "number") return 1;
      return p < q ? -1 : 1;
    }
    return 0;
  }

  // ---------- 商品マスタ（品番 → 棚番） ----------
  function master(rows, cols, opt) {
    var map = {}, dup = [];
    if (!rows || !rows.length || cols.code == null || cols.shelf == null) return { map: map, dup: dup, n: 0 };
    var n = 0;
    rows.forEach(function (r, i) {
      var k = codeKey(r[cols.code], opt), sh = clean(r[cols.shelf]);
      if (!k || !sh) return;
      if (map[k] && map[k].shelf !== sh) { dup.push({ i: i, code: clean(r[cols.code]), a: map[k].shelf, b: sh }); return; }
      if (!map[k]) { map[k] = { shelf: sh, name: cols.name != null ? clean(r[cols.name]) : "" }; n++; }
    });
    return { map: map, dup: dup, n: n };
  }

  // ---------- 明細の読み取り ----------
  // opt.inherit: 注文番号が空欄の行は上の行と同じ注文とみなす
  function collect(rows, cols, opt, mst) {
    opt = opt || {};
    var lines = [], errs = [], skip = 0, prev = "", prevDest = "";
    rows.forEach(function (r, i) {
      var code = cols.code != null ? clean(r[cols.code]) : "", name = cols.name != null ? clean(r[cols.name]) : "";
      var order = cols.order != null ? clean(r[cols.order]) : "", dest = cols.dest != null ? clean(r[cols.dest]) : "";
      var rawQ = cols.qty != null ? r[cols.qty] : "";
      if (!code && !name && clean(rawQ) === "") { skip++; return; }
      if (cols.order != null && !order && opt.inherit !== false) { order = prev; if (!dest) dest = prevDest; }
      if (order) { prevDest = dest || (order === prev ? prevDest : ""); prev = order; }
      var q = num(rawQ), err = "";
      if (!code && !name) err = "品番・品名が空欄";
      else if (q == null) err = "数量が空欄";
      else if (isNaN(q)) err = "数量が数字でない（" + clean(rawQ) + "）";
      else if (q <= 0) err = q === 0 ? "数量が0" : "数量がマイナス（" + fmt(q) + "）";
      if (err) { errs.push({ i: i, order: order, code: code, name: name, err: err }); return; }
      var shelf = cols.shelf != null ? clean(r[cols.shelf]) : "", from = shelf ? "明細" : "";
      var ck = code ? codeKey(code, opt) : "";
      if (!shelf && ck && mst && mst.map[ck]) { shelf = mst.map[ck].shelf; from = "マスタ"; }
      if (!name && ck && mst && mst.map[ck]) name = mst.map[ck].name;
      lines.push({ i: i, order: order, dest: dest, code: code, name: name, qty: q, shelf: shelf, from: from, key: ck ? "C:" + ck : "N:" + nameKey(name) });
    });
    return { lines: lines, errs: errs, skip: skip };
  }

  // ---------- 集品・仕分け ----------
  function itemCmp(a, b) { return shelfCmp(a.shelf, b.shelf) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
  function build(lines) {
    var items = {}, order = [];
    lines.forEach(function (l) {
      var it = items[l.key];
      if (!it) { it = items[l.key] = { key: l.key, code: l.code, name: l.name, shelf: l.shelf, qty: 0, shelves: [], names: [], orders: [], ordMap: {}, rows: [] }; order.push(it); }
      it.qty = round(it.qty + l.qty); it.rows.push(l.i);
      if (!it.shelf && l.shelf) it.shelf = l.shelf;
      if (!it.name && l.name) it.name = l.name;
      if (l.shelf && it.shelves.indexOf(l.shelf) < 0) it.shelves.push(l.shelf);
      if (l.name && it.names.indexOf(l.name) < 0) it.names.push(l.name);
      var ok = l.order || "";
      if (it.ordMap[ok] == null) { it.ordMap[ok] = it.orders.length; it.orders.push({ order: ok, qty: 0 }); }
      var o = it.orders[it.ordMap[ok]]; o.qty = round(o.qty + l.qty);
    });
    order.forEach(function (it) {
      it.notes = [];
      if (!it.shelf) it.notes.push("棚番なし");
      if (it.shelves.length > 1) it.notes.push("棚番が " + it.shelves.length + " か所（" + it.shelves.join("・") + "）");
      if (it.names.length > 1) it.notes.push("品名が違う行あり（" + it.names.join("／") + "）");
    });
    return order.sort(itemCmp);
  }
  // opt.batch: 1つのまとまりの注文の数（0 は全部で1つ）
  function run(lines, opt) {
    opt = opt || {};
    var ords = [], om = {};
    lines.forEach(function (l) {
      var k = l.order || "";
      if (om[k] == null) { om[k] = ords.length; ords.push({ order: k, dest: l.dest, lines: [] }); }
      var o = ords[om[k]]; o.lines.push(l); if (!o.dest && l.dest) o.dest = l.dest;
    });
    ords.forEach(function (o, n) {
      o.no = n + 1;
      o.lines = o.lines.slice().sort(function (a, b) { return shelfCmp(a.shelf, b.shelf) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || a.i - b.i; });
      o.qty = round(o.lines.reduce(function (s, l) { return s + l.qty; }, 0));
      var seen = {}; o.kinds = 0; o.lines.forEach(function (l) { if (!seen[l.key]) { seen[l.key] = 1; o.kinds++; } });
    });
    var size = opt.batch > 0 ? Math.floor(opt.batch) : ords.length || 1, batches = [];
    for (var s = 0; s < ords.length; s += size) {
      var part = ords.slice(s, s + size), ls = [];
      part.forEach(function (o) { ls = ls.concat(o.lines); });
      var items = build(ls);
      batches.push({ no: batches.length + 1, orders: part, items: items, qty: round(ls.reduce(function (a, l) { return a + l.qty; }, 0)), lines: ls.length });
    }
    var all = build(lines);
    return { batches: batches, orders: ords, items: all, count: { orders: ords.length, items: all.length, lines: lines.length, qty: round(lines.reduce(function (a, l) { return a + l.qty; }, 0)), noShelf: all.filter(function (x) { return !x.shelf; }).length, multiShelf: all.filter(function (x) { return x.shelves.length > 1; }).length } };
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, num: num, fmt: fmt, round: round, guessColumns: guessColumns, codeKey: codeKey, nameKey: nameKey, shelfCmp: shelfCmp, master: master, collect: collect, build: build, run: run, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PIKKING = api;
})(this);
