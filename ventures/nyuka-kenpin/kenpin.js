/* 入荷の検品の照合 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // 数として読む。「1,200」「12個」「¥300」「３．５」。空欄は null、読めなければ NaN
  function num(v) {
    var s = norm(v).replace(/[,，]/g, "").replace(/^[¥￥]/, "").replace(/(円|個|本|枚|箱|袋|冊|ケース|cs|c\/s|kg|g|L|l|ml|mL|m|台|組|セット|式|缶|パック|点|pc|pcs|ea)$/i, "").trim();
    if (s === "" || s === "-" || s === "ー" || s === "―") return null;
    s = s.replace(/^[△▲−‐]/, "-");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function round(x) { return Math.round(x * 1000) / 1000; }
  function fmt(x) { if (x == null || isNaN(x)) return ""; x = round(x); var p = String(Math.abs(x)).split("."); return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : ""); }

  // ---------- 列の推定 ----------
  // 「発注数」「納品数」「入荷数」なども数量として取る。単価・金額は数量より先に取る
  var ROLES = [
    ["price", /単価|仕入値|仕入れ値|原価|price/i],
    ["amount", /金額|小計|合計|amount/i],
    ["code", /品番|商品コード|品目コード|JAN|型番|SKU|商品番号|品目番号|部品番号|item ?(code|no)/i],
    ["code", /^(?!.*(得意先|仕入先|取引先|顧客|伝票|注文|発注|納品|店舗|倉庫)).*(コード|code)/i],
    ["lot", /入数|入り数|ケース入|ロット/i],
    ["name", /品名|商品名|品目|名称|名前|アイテム|item|name|商品|品物|内容|摘要/i],
    ["qty", /数量|発注数|注文数|納品数|入荷数|出荷数|受注数|個数|数|qty|quantity/i],
    ["unit", /単位|unit/i]
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

  // ---------- 突き合わせの鍵 ----------
  // opt.hyphen: ハイフン・空白・記号の違いを同じとみなす / opt.zero: 数字だけの番号の先頭の0の違いを同じとみなす
  function codeKey(v, opt) {
    var s = norm(v).toUpperCase();
    if (s === "") return "";
    if (!opt || opt.hyphen !== false) s = s.replace(/[\s\-‐‑–—―ー−_.\/・]/g, "");
    if (opt && opt.zero && /^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
    return s;
  }
  // 品名：全角・半角、大文字・小文字、空白、カッコの種類の違いを同じとみなす
  function nameKey(v) {
    return norm(v).toLowerCase().replace(/[\s]/g, "").replace(/[【\[［〔(（《〈「『]/g, "(").replace(/[】\]］〕)）》〉」』]/g, ")").replace(/[‐‑–—―−]/g, "-");
  }

  // 表の1行ずつを読み、鍵ごとにまとめる。side: "a"（注文）/"b"（届いた）
  // opt.by: "code" | "name" | "auto"（品番があれば品番、なければ品名）
  function collect(rows, cols, opt) {
    var map = {}, order = [], errs = [], skip = 0;
    rows.forEach(function (r, i) {
      function get(k) { return cols[k] == null || cols[k] === "" ? "" : r[cols[k]]; }
      var code = clean(get("code")), name = clean(get("name")), qRaw = get("qty"), q = num(qRaw), unit = clean(get("unit"));
      var price = cols.price == null ? null : num(get("price"));
      if (!code && !name && (q == null)) { skip++; return; }
      var key = "", kind = "";
      var by = opt.by || "auto";
      if ((by === "code" || by === "auto") && codeKey(code, opt)) { key = "c:" + codeKey(code, opt); kind = "code"; }
      else if ((by === "name" || by === "auto") && nameKey(name)) { key = "n:" + nameKey(name); kind = "name"; }
      if (!key) { errs.push({ i: i, code: code, name: name, err: by === "code" ? "品番が空欄" : "品番・品名が空欄" }); return; }
      if (q == null) { errs.push({ i: i, key: key, code: code, name: name, err: "数量が空欄" }); return; }
      if (isNaN(q)) { errs.push({ i: i, key: key, code: code, name: name, err: "数量が数字でない（" + norm(qRaw) + "）" }); return; }
      var g = map[key];
      if (!g) { g = map[key] = { key: key, kind: kind, code: code, name: name, qty: 0, rows: [], prices: [], units: [], names: [] }; order.push(key); }
      g.qty = round(g.qty + q);
      g.rows.push(i);
      if (!g.code && code) g.code = code;
      if (!g.name && name) g.name = name;
      if (name && g.names.indexOf(name) < 0) g.names.push(name);
      if (price != null && !isNaN(price) && g.prices.indexOf(price) < 0) g.prices.push(price);
      if (unit && g.units.indexOf(unit) < 0) g.units.push(unit);
    });
    return { map: map, order: order, errs: errs, skip: skip };
  }

  // 照合。戻り値 res の status：ok（一致）/short（不足）/over（多い）/missing（届いていない）/extra（注文にない）
  function run(rowsA, colsA, rowsB, colsB, opt) {
    opt = opt || {};
    var A = collect(rowsA, colsA, opt), B = collect(rowsB, colsB, opt), res = [], seen = {};
    function item(key) {
      var a = A.map[key], b = B.map[key];
      var x = { key: key, a: a || null, b: b || null, code: (a && a.code) || (b && b.code) || "", name: (a && a.name) || (b && b.name) || "",
        qa: a ? a.qty : null, qb: b ? b.qty : null, diff: 0, notes: [] };
      if (a && b) {
        x.diff = round(b.qty - a.qty);
        x.status = x.diff === 0 ? "ok" : x.diff < 0 ? "short" : "over";
        if (a.kind === "code" && b.names.length && a.names.length && nameKey(a.names[0]) !== nameKey(b.names[0])) { x.warn = true; x.notes.push("品名が違う（注文：" + a.names[0] + "／届いた：" + b.names[0] + "）"); }
        if (a.prices.length === 1 && b.prices.length === 1 && a.prices[0] !== b.prices[0]) { x.priceDiff = x.warn = true; x.notes.push("単価が違う（注文 " + fmt(a.prices[0]) + "／届いた " + fmt(b.prices[0]) + "）"); }
        if (a.units.length && b.units.length && a.units.join() !== b.units.join()) { x.warn = true; x.notes.push("単位が違う（注文 " + a.units.join("・") + "／届いた " + b.units.join("・") + "）"); }
      } else if (a) { x.status = "missing"; x.diff = round(-a.qty); }
      else { x.status = "extra"; x.diff = b.qty; }
      [["注文", a], ["届いた明細", b]].forEach(function (p) {
        var g = p[1]; if (!g) return;
        if (g.rows.length > 1) x.notes.push(p[0] + "に " + g.rows.length + " 行（合計して比べました）");
        if (g.prices.length > 1) x.notes.push(p[0] + "の単価が行ごとに違う（" + g.prices.map(fmt).join("・") + "）");
      });
      if (x.qa != null && x.qa < 0 || x.qb != null && x.qb < 0) { x.warn = true; x.notes.push("マイナスの数量があります"); }
      return x;
    }
    var errKeyA = {}, errKeyB = {};
    A.errs.forEach(function (e) { if (e.key) (errKeyA[e.key] = errKeyA[e.key] || []).push(e.i); });
    B.errs.forEach(function (e) { if (e.key) (errKeyB[e.key] = errKeyB[e.key] || []).push(e.i); });
    var item0 = item;
    item = function (key) {
      var x = item0(key);
      if (errKeyA[key]) { x.warn = true; x.errRowsA = errKeyA[key]; x.notes.push("注文にこの品の数量が読めない行があります（照合に入れていません）"); }
      if (errKeyB[key]) { x.warn = true; x.errRowsB = errKeyB[key]; x.notes.push("届いた明細にこの品の数量が読めない行があります（照合に入れていません）"); }
      return x;
    };
    A.order.forEach(function (k) { seen[k] = 1; res.push(item(k)); });
    B.order.forEach(function (k) { if (!seen[k]) res.push(item(k)); });
    // 届いていない品と注文にない品で、品名が同じ・品番が同じものを「品番か品名の書き違いでは」と組にする
    var miss = res.filter(function (x) { return x.status === "missing"; }), ext = res.filter(function (x) { return x.status === "extra"; });
    var byName = {}, byCode = {};
    ext.forEach(function (e) {
      if (e.name) (byName[nameKey(e.name)] = byName[nameKey(e.name)] || []).push(e);
      if (e.code) { var ck = codeKey(e.code, { hyphen: true, zero: true }); (byCode[ck] = byCode[ck] || []).push(e); }
    });
    miss.forEach(function (m) {
      var cand = [], seenE = [];
      if (m.code) (byCode[codeKey(m.code, { hyphen: true, zero: true })] || []).forEach(function (e) { cand.push([e, "品番の書き方だけが違う"]); });
      if (m.name) (byName[nameKey(m.name)] || []).forEach(function (e) { cand.push([e, "品名が同じで品番が違う"]); });
      cand.forEach(function (c) {
        var e = c[0], why = c[1];
        if (seenE.indexOf(e) >= 0) return; seenE.push(e);
        m.notes.push(why + "：届いた「" + (e.code || e.name) + "」" + fmt(e.qb) + " ではありませんか");
        e.notes.push(why + "：注文の「" + (m.code || m.name) + "」" + fmt(m.qa) + " ではありませんか");
        m.pair = e; e.pair = m;
      });
    });
    var count = { ok: 0, short: 0, over: 0, missing: 0, extra: 0, price: 0 };
    res.forEach(function (x) { count[x.status]++; if (x.priceDiff) count.price++; });
    return { res: res, count: count, errA: A.errs, errB: B.errs, skipA: A.skip, skipB: B.skip };
  }

  var LABEL = { ok: "一致", short: "不足", over: "多い", missing: "届いていない", extra: "注文にない" };

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, num: num, fmt: fmt, round: round, guessColumns: guessColumns, codeKey: codeKey, nameKey: nameKey, collect: collect, run: run, LABEL: LABEL, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KENPIN = api;
})(this);
