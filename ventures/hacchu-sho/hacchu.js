/* 発注点チェックと発注書 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // 数として読む。「1,200」「12個」「¥300」「△3」「-3」「３．５」。空欄は null、読めなければ NaN
  function num(v) {
    var s = norm(v).replace(/[,，]/g, "").replace(/^[¥￥]/, "").replace(/(円|個|本|枚|箱|袋|冊|ケース|cs|kg|g|L|l|ml|mL|m|台|組|セット|式|缶|パック|点)$/i, "").trim();
    if (s === "" || s === "-" || s === "ー" || s === "―") return null;
    s = s.replace(/^[△▲−‐]/, "-");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function clean(s) { return String(s == null ? "" : s).replace(/[\s\u3000]+/g, " ").trim(); } // 品名などは字の形を変えない
  function round(x) { return Math.round(x * 1000) / 1000; }
  function fmt(x) { if (x == null || isNaN(x)) return ""; x = round(x); var p = String(Math.abs(x)).split("."); return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : ""); }

  // ---------- 列の推定 ----------
  // 順番が大事：「発注単位」「目標在庫」などを先に取り、残りから「在庫」「単位」を取る
  var ROLES = [
    ["moq", /最小発注|最低発注|最小ロット|moq/i],
    ["lot", /発注単位|ロット|入数|入り数|発注の単位|lot/i],
    ["point", /発注点|最低在庫|下限|安全在庫|補充点|reorder|min/i],
    ["target", /目標|最大在庫|上限|定数|適正在庫|max/i],
    ["inc", /入荷予定|発注済|発注残|未入荷|注文済/i],
    ["daily", /1日|一日|日販|日あたり|日当たり|per ?day|daily/i],
    ["sup", /仕入先|仕入れ先|発注先|取引先|購入先|メーカー|業者|supplier|vendor/i],
    ["price", /単価|仕入値|仕入れ値|原価|price/i],
    ["code", /品番|コード|JAN|型番|SKU|code/i],
    ["name", /品名|商品名|品目|名称|名前|アイテム|item|name|商品|品物/i],
    ["unit", /単位|unit/i],
    ["stock", /現在|在庫|残数|残量|残り|数量|stock|qty/i]
  ];
  function guessColumns(headers) {
    var cols = {}, used = {};
    ROLES.forEach(function (rr) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (rr[1].test(norm(headers[i]))) { cols[rr[0]] = i; used[i] = 1; return; }
      }
    });
    return cols;
  }

  // ---------- 1行の計算 ----------
  // opt.rule: "le"（発注点以下で発注）/"lt"（発注点を下回ったら）
  function calcRow(r, i, cols, opt) {
    opt = opt || {};
    function get(k) { return cols[k] == null || cols[k] === "" ? "" : r[cols[k]]; }
    function n(k) { return cols[k] == null || cols[k] === "" ? null : num(r[cols[k]]); }
    var x = { i: i, name: clean(get("name")), code: clean(get("code")), sup: clean(get("sup")), unit: clean(get("unit")),
      stock: n("stock"), point: n("point"), target: n("target"), lot: n("lot"), moq: n("moq"), inc: n("inc"), price: n("price"), daily: n("daily"),
      need: false, qty: 0, notes: [], err: "" };
    if (!x.name && !x.code && x.stock == null && x.point == null) { x.skip = true; return x; }
    var bad = [];
    [["stock", "現在の在庫数"], ["point", "発注点"]].forEach(function (p) {
      if (x[p[0]] == null) bad.push(p[1] + "が空欄"); else if (isNaN(x[p[0]])) bad.push(p[1] + "が数字でない（" + norm(get(p[0])) + "）");
    });
    [["target", "目標在庫"], ["lot", "発注単位"], ["moq", "最小発注数"], ["inc", "入荷予定"], ["price", "単価"], ["daily", "1日の使用数"]].forEach(function (p) {
      if (x[p[0]] != null && isNaN(x[p[0]])) { bad.push(p[1] + "が数字でない（" + norm(get(p[0])) + "）"); x[p[0]] = null; }
    });
    if (bad.length && (x.stock == null || isNaN(x.stock) || x.point == null || isNaN(x.point))) { x.err = bad.join("、"); return x; }
    if (bad.length) x.notes.push(bad.join("、") + "のため使っていません");
    if (x.stock < 0) x.notes.push("在庫がマイナスです");
    var lot = x.lot;
    if (lot == null) lot = 1;
    else if (lot <= 0) { x.notes.push("発注単位が0以下のため1として計算"); lot = 1; }
    x.lotUsed = lot;
    x.avail = round(x.stock + (x.inc || 0));
    if (x.daily != null && x.daily > 0) x.days = Math.floor(x.avail / x.daily * 10) / 10;
    x.need = opt.rule === "lt" ? x.avail < x.point : x.avail <= x.point;
    var availTxt = x.inc ? "在庫 " + fmt(x.stock) + " ＋ 入荷予定 " + fmt(x.inc) + " ＝ " + fmt(x.avail) : "在庫 " + fmt(x.avail);
    x.check = availTxt + (x.need ? (opt.rule === "lt" ? " ＜ " : " ≦ ") : (opt.rule === "lt" ? " ≧ " : " ＞ ")) + "発注点 " + fmt(x.point);
    if (!x.need) return x;
    var k, how;
    var useTarget = x.target != null && x.target > x.avail;
    if (x.target != null && !useTarget) x.notes.push("目標在庫が今の在庫以下のため、発注点を上回る最小の数で計算");
    if (useTarget) {
      var want = round(x.target - x.avail);
      k = Math.max(1, Math.ceil(want / lot - 1e-9));
      how = "目標 " + fmt(x.target) + " − " + fmt(x.avail) + " ＝ " + fmt(want);
    } else {
      var gap = x.point - x.avail;
      k = opt.rule === "lt" ? Math.max(1, Math.ceil(gap / lot - 1e-9)) : Math.floor(gap / lot + 1e-9) + 1;
      k = Math.max(1, k);
      how = "発注点 " + fmt(x.point) + (opt.rule === "lt" ? " 以上" : " を上回る") + "まで";
    }
    var qty = round(k * lot);
    if (lot !== 1) how += " → " + fmt(lot) + " ずつで " + fmt(qty);
    if (x.moq != null && x.moq > qty) {
      qty = round(Math.ceil(x.moq / lot - 1e-9) * lot);
      how += " → 最小発注数 " + fmt(x.moq) + " に合わせて " + fmt(qty);
    }
    x.qty = qty; x.how = how; x.after = round(x.avail + qty);
    return x;
  }

  function run(rows, cols, opt) {
    var res = rows.map(function (r, i) { return calcRow(r, i, cols, opt); }).filter(function (x) { return !x.skip; });
    var c = { total: res.length, need: 0, ok: 0, err: 0 };
    res.forEach(function (x) { if (x.err) c.err++; else if (x.need) c.need++; else c.ok++; });
    return { res: res, count: c };
  }

  // 仕入先ごとにまとめる（出てきた順）。qtyOf(x) は手で直した数を返す
  var NOSUP = "（仕入先の指定なし）";
  function groupBySupplier(res, qtyOf) {
    var map = {}, order = [];
    res.forEach(function (x) {
      var q = qtyOf ? qtyOf(x) : x.qty;
      if (x.err || !(q > 0)) return;
      var s = x.sup || NOSUP;
      if (!map[s]) { map[s] = { sup: s, items: [], total: 0, hasPrice: true, priced: 0 }; order.push(s); }
      var g = map[s], amt = x.price != null ? round(q * x.price) : null;
      g.items.push({ x: x, qty: q, amount: amt });
      if (amt == null) g.hasPrice = false; else { g.total = round(g.total + amt); g.priced++; }
    });
    return order.map(function (s) { return map[s]; });
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, num: num, fmt: fmt, round: round, guessColumns: guessColumns, calcRow: calcRow, run: run, groupBySupplier: groupBySupplier, NOSUP: NOSUP, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HACCHU = api;
})(this);
