/* ケース・バラの数の換算 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
  function fix(x) { return Math.round(x * 1e6) / 1e6; } // 0.1 などの小数の誤差を消す
  function fmt(x) {
    if (x == null || isNaN(x)) return "";
    x = Math.round(x * 100) / 100;
    var p = String(Math.abs(x)).split(".");
    return (x < 0 ? "-" : "") + p[0].replace(/\B(?=(\d{3})+$)/g, ",") + (p[1] ? "." + p[1] : "");
  }

  // ---------- 単位 ----------
  // 3段：cs（ケース）・bl（ボール・中箱）・pc（バラ）。各段の呼び方は利用者が変えられる。先頭の呼び方を表示に使う
  var DEF_UNITS = {
    cs: "ケース,ケ,CS,C/S,C,カートン,CT,CTN",
    bl: "ボール,ボ,BL,B,中箱,内箱,インナー",
    pc: "個,バラ,コ,ヶ,本,枚,袋,缶,点,冊,足,P,PC,PCS,EA"
  };
  function unitKey(s) { return norm(s).replace(/\s/g, "").toUpperCase(); }
  function parseUnits(o) {
    var map = {}, disp = {}, dup = [];
    ["cs", "bl", "pc"].forEach(function (lv) {
      var list = String(o && o[lv] != null ? o[lv] : DEF_UNITS[lv]).split(/[,、，\n]/).map(function (x) { return norm(x).replace(/\s/g, ""); }).filter(Boolean);
      disp[lv] = list[0] || { cs: "ケース", bl: "ボール", pc: "個" }[lv];
      list.forEach(function (u) { var k = unitKey(u); if (map[k] && map[k] !== lv) dup.push(u); else map[k] = lv; });
    });
    return { map: map, disp: disp, dup: dup };
  }
  // 整数として読む（「24」「24入」「24個入り」「1,200」）。空欄は null、読めなければ NaN
  function intOf(v) {
    var s = norm(v).replace(/[,，\s]/g, "");
    if (s === "") return null;
    var m = s.match(/^(\d+)(入り?|個入り?|本入り?|枚入り?|入数|個|本|枚|pcs|pc|p)?$/i);
    if (!m) return NaN;
    return parseInt(m[1], 10);
  }
  // 数量の書き方：「2ケース」「1ケース5個」「1C3B4」「2cs+5」「3」「▲2ケース」「1.5ケース」
  // 戻り値 { parts:[{n, lv}] , neg } または { err }
  function parseQty(v, U, defLv) {
    var s = norm(v).replace(/[,，\s]/g, "").replace(/[−‐‑–—―]/g, "-").replace(/＋/g, "+");
    if (s === "") return null;
    var neg = false;
    if (/^[-▲△]/.test(s)) { neg = true; s = s.slice(1); }
    if (s === "") return { err: "数量が読めません" };
    var re = /(\d+(?:\.\d+)?)([^\d.+・、と]*)[+・、と]?/g, m, parts = [], pos = 0;
    while ((m = re.exec(s)) && m[0] !== "") {
      if (m.index !== pos) return { err: "数量が読めません" };
      pos = re.lastIndex;
      var n = parseFloat(m[1]), u = m[2], lv;
      if (u === "") lv = defLv;
      else { lv = U.map[unitKey(u)]; if (!lv) return { err: "単位「" + u + "」が分かりません（単位の呼び方に足せます）" }; }
      if (!lv) return { err: "単位が分かりません" };
      parts.push({ n: n, lv: lv });
    }
    if (pos !== s.length || !parts.length) return { err: "数量が読めません" };
    return { parts: parts, neg: neg };
  }
  function key(s) { return norm(s).replace(/\s/g, "").toUpperCase(); }

  // ---------- 入数の表 ----------
  // cols: { code, name, cs, bl }。品番と品名それぞれの引き当て表を作る。同じ品で入数が違う行は警告
  function buildMaster(rows, cols) {
    var byCode = {}, byName = {}, errs = [], warns = [], n = 0;
    rows.forEach(function (r, i) {
      var code = cols.code != null ? clean(r[cols.code]) : "", name = cols.name != null ? clean(r[cols.name]) : "";
      if (!code && !name) return;
      var cs = cols.cs != null ? intOf(r[cols.cs]) : null, bl = cols.bl != null ? intOf(r[cols.bl]) : null;
      if ((cs !== null && (isNaN(cs) || cs <= 0)) || (bl !== null && (isNaN(bl) || bl <= 0))) { errs.push({ i: i, code: code, name: name, err: "入数が1以上の整数ではありません：" + clean(cols.cs != null ? r[cols.cs] : "") + " / " + clean(cols.bl != null ? r[cols.bl] : "") }); return; }
      if (cs === null && bl === null) { errs.push({ i: i, code: code, name: name, err: "ケース入数もボール入数も空欄" }); return; }
      var e = { i: i, code: code, name: name, cs: cs, bl: bl };
      n++;
      [[byCode, code], [byName, name]].forEach(function (p) {
        if (!p[1]) return;
        var k = key(p[1]), old = p[0][k];
        if (!old) p[0][k] = e;
        else if (old.cs !== e.cs || old.bl !== e.bl) { if (p[0] === byCode || !code) warns.push({ i: i, oldI: old.i, code: code, name: name, err: "同じ品が2回あり、入数が違います（先の行の入数を使います）" }); }
      });
    });
    return { byCode: byCode, byName: byName, errs: errs, warns: warns, n: n };
  }
  function lookup(M, code, name) {
    if (!M) return null;
    if (code && M.byCode[key(code)]) return M.byCode[key(code)];
    if (name && M.byName[key(name)]) return M.byName[key(name)];
    return null;
  }

  // ---------- 換算 ----------
  // ケース・ボール・バラに分ける（大きい単位から順に）。入数がない段は使わない
  function split(total, cs, bl) {
    var neg = total < 0, x = Math.abs(total), c = 0, b = 0;
    if (cs) { c = Math.floor(x / cs); x -= c * cs; }
    if (bl && (!cs || bl < cs)) { b = Math.floor(x / bl); x -= b * bl; }
    var f = neg ? -1 : 1;
    return { c: c * f, b: b * f, p: x * f };
  }
  function label(sp, U, hasCs, hasBl) {
    var a = [], neg = sp.c < 0 || sp.b < 0 || sp.p < 0;
    if (hasCs && sp.c) a.push(Math.abs(sp.c) + U.disp.cs);
    if (hasBl && sp.b) a.push(Math.abs(sp.b) + U.disp.bl);
    if (sp.p || !a.length) a.push(Math.abs(sp.p) + U.disp.pc);
    return (neg ? "-" : "") + a.join(" ");
  }
  // 発注用のまとめ：ケース・ボール単位に切り上げ
  function roundUp(total, cs, bl, mode) {
    var u = mode === "cs" ? cs : mode === "bl" ? bl : 0;
    if (!mode || mode === "none") return null;
    if (!u) return { err: mode === "cs" ? "ケース入数がないため切り上げできません" : "ボール入数がないため切り上げできません" };
    if (total <= 0) return { v: total, units: total / u, add: 0 };
    var k = Math.ceil(total / u);
    return { v: k * u, units: k, add: k * u - total };
  }
  // o: { units: parseUnits の結果, defLv: 単位のない数の単位, master: buildMaster の結果, round: "none"|"cs"|"bl" }
  function run(rows, cols, o) {
    var U = o.units, items = [], errs = [], sums = [], sidx = {}, missing = {}, c = { total: 0, conv: 0, err: 0, missing: 0, memo: 0 };
    rows.forEach(function (r, i) {
      var code = cols.code != null ? clean(r[cols.code]) : "", name = cols.name != null ? clean(r[cols.name]) : "";
      var qv = cols.qty != null ? r[cols.qty] : "";
      if (norm(qv) === "" && !code && !name) return;
      c.total++;
      var base = { i: i, code: code, name: name, raw: clean(qv) + (cols.unit != null && norm(r[cols.unit]) ? "（" + clean(r[cols.unit]) + "）" : "") };
      var defLv = o.defLv;
      if (cols.unit != null && norm(r[cols.unit]) !== "") {
        defLv = U.map[unitKey(r[cols.unit])];
        if (!defLv) { base.err = "単位「" + clean(r[cols.unit]) + "」が分かりません（単位の呼び方に足せます）"; errs.push(base); return; }
      }
      var q = parseQty(qv, U, defLv);
      if (q === null) { base.err = "数量が空欄"; errs.push(base); return; }
      if (q.err) { base.err = q.err; errs.push(base); return; }
      var m = lookup(o.master, code, name), notes = [];
      var cs = cols.cs != null ? intOf(r[cols.cs]) : null, bl = cols.bl != null ? intOf(r[cols.bl]) : null;
      if ((cs !== null && (isNaN(cs) || cs <= 0)) || (bl !== null && (isNaN(bl) || bl <= 0))) { base.err = "この行の入数が1以上の整数ではありません"; errs.push(base); return; }
      if (m) {
        if (cs !== null && m.cs !== null && cs !== m.cs) notes.push("この行のケース入数 " + cs + " と入数の表の " + m.cs + " が違います（この行の値を使います）");
        if (bl !== null && m.bl !== null && bl !== m.bl) notes.push("この行のボール入数 " + bl + " と入数の表の " + m.bl + " が違います（この行の値を使います）");
        if (cs === null) cs = m.cs; if (bl === null) bl = m.bl;
      }
      var tot = 0, need = null;
      q.parts.forEach(function (p) {
        if (p.lv === "cs") { if (!cs) need = "ケース入数"; else tot += p.n * cs; }
        else if (p.lv === "bl") { if (!bl) need = "ボール入数"; else tot += p.n * bl; }
        else tot += p.n;
      });
      if (need) {
        base.err = (m || cs || bl ? need + "がありません" : "入数の表にない品です") + "（" + need + "が分からないため換算できません）";
        if (!m && !cs && !bl) { base.missing = true; var mk = key(code) + "\t" + key(name); if (!missing[mk]) { missing[mk] = { code: code, name: name, n: 0 }; c.missing++; } missing[mk].n++; }
        errs.push(base); return;
      }
      tot = Math.round(tot * 1e6) / 1e6;
      if (tot % 1 !== 0) { base.err = "バラの数が整数になりません（" + fmt(tot) + "）"; errs.push(base); return; }
      if (q.neg) tot = -tot;
      if (cs && bl && cs % bl !== 0) notes.push("ケース入数 " + cs + " がボール入数 " + bl + " で割り切れません");
      if (cs && bl && bl >= cs) notes.push("ボール入数がケース入数以上です");
      q.parts.forEach(function (p) {
        if (p.lv === "bl" && cs && bl && bl < cs && p.n * bl >= cs) notes.push(U.disp.bl + "の数が1" + U.disp.cs + "分以上です");
        if (p.lv === "pc" && q.parts.length > 1 && ((bl && bl < (cs || Infinity) && p.n >= bl) || (cs && p.n >= cs))) notes.push("バラの数が" + (bl && p.n >= bl ? "1" + U.disp.bl : "1" + U.disp.cs) + "分以上です");
      });
      if (!m && (cs || bl)) notes.push("入数はこの行の値");
      var sp = split(tot, cs, bl);
      var it = { i: i, code: code, name: name, raw: base.raw, cs: cs, bl: bl, total: tot, sp: sp, text: label(sp, U, !!cs, !!bl), notes: notes, ru: roundUp(tot, cs, bl, o.round) };
      if (it.ru && it.ru.err) notes.push(it.ru.err);
      c.conv++; if (notes.length) c.memo++;
      items.push(it);
      var sk = (code ? "c:" + key(code) : "n:" + key(name));
      if (sidx[sk] == null) { sidx[sk] = sums.length; sums.push({ code: code, name: name, cs: cs, bl: bl, total: 0, rows: 0, notes: [] }); }
      var S = sums[sidx[sk]];
      if (S.cs !== cs || S.bl !== bl) { if (S.notes.indexOf("行によって入数が違います") < 0) S.notes.push("行によって入数が違います"); }
      S.total += tot; S.rows++;
    });
    sums.forEach(function (S) {
      S.sp = split(S.total, S.cs, S.bl); S.text = label(S.sp, U, !!S.cs, !!S.bl);
      S.ru = roundUp(S.total, S.cs, S.bl, o.round);
      if (S.ru && S.ru.err) S.notes.push(S.ru.err);
    });
    c.err = errs.length;
    var miss = Object.keys(missing).map(function (k) { return missing[k]; });
    return { items: items, errs: errs, sums: sums, missing: miss, count: c };
  }

  // ---------- 列の推定 ----------
  var ROLES = [
    ["cs", /ケース入|ケース入数|ｹｰｽ入|C\/?S入|カートン入|ケース当|入数.*ケース|^入数$|^入り数$|case ?(qty|pack)|pack ?size/i],
    ["bl", /ボール入|ボール入数|中箱入|内箱入|インナー|入数.*ボール|ball|inner/i],
    ["unit", /^単位$|単位名|^unit$|uom/i],
    ["qty", /数量|^数$|個数|注文数|発注数|受注数|在庫数|入荷数|出荷数|納品数|実数|^在庫$|qty|quantity/i],
    ["code", /品番|商品コード|品目コード|JAN|型番|SKU|商品番号|item ?(code|no)|^コード$/i],
    ["name", /品名|商品名|品目|名称|アイテム|^商品$|item|product/i]
  ];
  function guessColumns(headers, roles) {
    var cols = {}, used = {};
    ROLES.filter(function (rr) { return !roles || roles.indexOf(rr[0]) >= 0; }).forEach(function (rr) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i] || cols[rr[0]] != null) continue;
        if (rr[1].test(norm(headers[i]))) { cols[rr[0]] = i; used[i] = 1; return; }
      }
    });
    return cols;
  }
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, clean: clean, fmt: fmt, DEF_UNITS: DEF_UNITS, parseUnits: parseUnits, intOf: intOf, parseQty: parseQty,
    buildMaster: buildMaster, lookup: lookup, split: split, label: label, roundUp: roundUp, run: run, guessColumns: guessColumns, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.IRISU = K;
})(this);
