/* 価格改定の一括計算 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // 価格として読む。「1,980」「¥1,980」「1980円」「1980-」。空欄は null、読めなければ NaN
  function yen(v) {
    var s = norm(v).replace(/[,，\s]/g, "").replace(/^[¥￥\\]/, "").replace(/(円|-|―|也)$/, "");
    if (s === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  // 税率：10／8。空欄は既定。「10%」「0.1」「軽減」「※」「標準」
  function taxRate(v, def) {
    var s = norm(v).replace(/\s/g, "");
    if (s === "") return def;
    if (/軽減|^(軽|※|\*|★|0?\.08)$|^8(%|$|\D)/.test(s)) return 8;
    if (/標準|^(0?\.10?)$|^10(%|$|\D)/.test(s)) return 10;
    return NaN;
  }

  // ---------- 改定の書き方 ----------
  // 「5%」「+5%」「-3%」「5%上げ」「+30円」「-50」「=1980」「→1980」「1980円に」「据え置き」
  function parseRule(v) {
    var s = norm(v).replace(/[\s,，]/g, "").replace(/[−‐‑–—―ー]/g, "-").replace(/[＋]/g, "+");
    if (s === "") return null;
    if (/^(なし|据え置き|据置き?|変更なし|そのまま|対象外|±?0%?|±?0円|-)$/.test(s)) return { kind: "none", text: "据え置き" };
    var sign = 0, m;
    if ((m = s.match(/^(.*?)(値上げ|上げ|アップ|UP|増)$/i))) { s = m[1]; sign = 1; }
    else if ((m = s.match(/^(.*?)(値下げ|下げ|引き|引|ダウン|DOWN|OFF|オフ|減)$/i))) { s = m[1]; sign = -1; }
    if ((m = s.match(/^([+-]?)(\d+(?:\.\d+)?)%$/))) {
      var p = parseFloat(m[2]) * (m[1] === "-" ? -1 : 1) * (sign === -1 ? -1 : 1);
      if (p <= -100) return { err: "100% 以上の値下げはできません" };
      return { kind: "pct", v: p, text: (p >= 0 ? "+" : "") + fmt(p) + "%" };
    }
    if ((m = s.match(/^([+-]?)(\d+(?:\.\d+)?)円?$/)) && (m[1] || sign)) {
      var a = parseFloat(m[2]) * (m[1] === "-" ? -1 : 1) * (sign === -1 ? -1 : 1);
      return { kind: "add", v: a, text: (a >= 0 ? "+" : "") + fmt(a) + "円" };
    }
    if ((m = s.match(/^[=→>]¥?(\d+(?:\.\d+)?)円?(に)?$/)) || (m = s.match(/^¥?(\d+(?:\.\d+)?)円?に$/))) {
      var n = parseFloat(m[1]);
      if (n <= 0) return { err: "0円以下の価格は指定できません" };
      return { kind: "set", v: n, text: "→" + fmt(n) + "円" };
    }
    return { err: "改定の書き方が分かりません（例：5%、+30円、=1980、据え置き）" };
  }
  function catKey(v) { return norm(v).toLowerCase().replace(/\s/g, ""); }
  // 分類ごとの改定：1行に「分類 改定」（区切りは空白・タブ・カンマ・「：」「=」も可）
  function parseCatRules(text) {
    var map = {}, errs = [], n = 0;
    String(text || "").split(/\r?\n/).forEach(function (line, i) {
      var t = norm(line);
      if (!t) return;
      var m = t.match(/^(.+?)\s*[,\t:：]\s*(.+)$/) || t.match(/^(.+)\s+(\S+)$/);
      if (!m) { errs.push({ line: i + 1, text: line, err: "「分類 改定」の形で書いてください" }); return; }
      var r = parseRule(m[2]);
      if (!r || r.err) { errs.push({ line: i + 1, text: line, err: r ? r.err : "改定が空欄です" }); return; }
      if (!map[catKey(m[1])]) n++;
      map[catKey(m[1])] = r;
    });
    return { map: map, errs: errs, n: n };
  }

  // ---------- 端数の処理 ----------
  // r = { unit: 1|10|100|1000, dir: "up"|"down"|"near" } または { suffix: "8"|"80"|"98"…, dir }
  function rnd(x, dir) { x = fix(x); return dir === "up" ? Math.ceil(x) : dir === "down" ? Math.floor(x) : Math.round(x); }
  function roundPrice(x, r) {
    x = fix(x);
    if (r && r.suffix != null && r.suffix !== "") {
      var s = parseInt(r.suffix, 10), m = Math.pow(10, String(r.suffix).length);
      var up = Math.ceil(fix((x - s) / m)) * m + s, dn = Math.floor(fix((x - s) / m)) * m + s;
      if (up < s) up = s;
      if (dn < s) dn = s;
      if (r.dir === "up") return up;
      if (r.dir === "down") return dn;
      return (up - x) <= (x - dn) ? up : dn;
    }
    var u = (r && r.unit) || 1;
    return rnd(x / u, r && r.dir) * u;
  }
  // 税抜 → 税込（消費税の1円未満の端数は dir で処理）。整数で計算して誤差を出さない
  function inclOf(ex, rate, dir) { return rnd(ex * (100 + rate) / 100, dir); }
  // 税込 → 税抜：その税込価格になる本体価格を探す。なければ ok:false で近い値
  function exclOf(inc, rate, dir) {
    var c = Math.floor(fix(inc * 100 / (100 + rate)));
    for (var n = c - 2; n <= c + 2; n++) if (n >= 0 && inclOf(n, rate, dir) === inc) return { v: n, ok: true };
    return { v: Math.round(fix(inc * 100 / (100 + rate))), ok: false };
  }

  // ---------- 列の推定 ----------
  var ROLES = [
    ["rule", /改定|値上|値下|変更率|上げ幅|アップ率/],
    ["tax", /税率|税区分|軽減|^(消費税|税|tax|tax ?rate)$/i],
    ["cat", /分類|カテゴリ|部門|売場|売り場|ジャンル|区分|category|dept/i],
    ["code", /品番|商品コード|品目コード|JAN|型番|SKU|商品番号|item ?(code|no)|^コード$/i],
    ["price", /価格|売価|単価|定価|値段|金額|本体|price/i],
    ["name", /品名|商品名|品目|名称|アイテム|^商品$|item|product/i]
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
  // 価格の列の見出しから、税込か税抜かを推定（分からなければ null）
  function guessSide(h) {
    h = norm(h);
    if (/税込|込み|総額/.test(h)) return "in";
    if (/税抜|抜き|本体|税別/.test(h)) return "ex";
    return null;
  }

  // ---------- 計算 ----------
  // o: { input: "ex"|"in"（読み込む価格）, side: "ex"|"in"（改定と端数処理をする価格）, def: 10|8,
  //      rule: 全体の改定, cats: 分類ごとの改定 map, round: 端数, taxDir: 消費税の端数, keep: 値上げで前より安くならないように }
  function run(rows, cols, o) {
    var items = [], errs = [], c = { total: 0, changed: 0, same: 0, up: 0, down: 0, memo: 0, cats: {} };
    rows.forEach(function (r, i) {
      var code = cols.code != null ? clean(r[cols.code]) : "", name = cols.name != null ? clean(r[cols.name]) : "";
      var cat = cols.cat != null ? clean(r[cols.cat]) : "";
      var pv = cols.price != null ? r[cols.price] : "";
      var p = yen(pv);
      if (p === null && !code && !name) return;
      var base = { i: i, code: code, name: name, cat: cat, raw: clean(pv) };
      if (p === null) { base.err = "価格が空欄"; errs.push(base); return; }
      if (isNaN(p)) { base.err = "価格が数字ではありません"; errs.push(base); return; }
      if (p <= 0) { base.err = "価格が0円以下"; errs.push(base); return; }
      var rate = taxRate(cols.tax != null ? r[cols.tax] : "", o.def);
      if (isNaN(rate)) { base.err = "税率が読めません（10・8・軽減 など）"; errs.push(base); return; }
      var rule = null, from = "";
      if (cols.rule != null && norm(r[cols.rule]) !== "") {
        rule = parseRule(r[cols.rule]); from = "行";
        if (rule.err) { base.err = rule.err + "：" + clean(r[cols.rule]); errs.push(base); return; }
      }
      if (!rule && cat && o.cats && o.cats[catKey(cat)]) { rule = o.cats[catKey(cat)]; from = "分類"; }
      if (!rule && o.rule) { rule = o.rule; from = "全体"; }
      if (!rule) rule = { kind: "none", text: "据え置き" };
      var notes = [], oldEx, oldIn;
      if (o.input === "in") { oldIn = p; var e0 = exclOf(p, rate, o.taxDir); oldEx = e0.v; if (!e0.ok) notes.push("今の税込価格になる本体価格がありません（税抜は参考値）"); }
      else { oldEx = p; oldIn = inclOf(p, rate, o.taxDir); }
      var b = o.side === "in" ? oldIn : oldEx, nv;
      if (rule.kind === "none") nv = b;
      else if (rule.kind === "set") nv = rule.v;
      else {
        var x = rule.kind === "pct" ? b * (100 + rule.v) / 100 : b + rule.v;
        nv = roundPrice(x, o.round);
        if (o.keep && rule.v > 0 && nv < b) { nv = b; notes.push("端数の処理で前より安くなるため元の価格のまま"); }
        if (o.keep && rule.v < 0 && nv > b) { nv = b; notes.push("端数の処理で前より高くなるため元の価格のまま"); }
      }
      nv = fix(nv);
      if (rule.kind === "pct" && b && Math.abs((nv / b - 1) * 100 - rule.v) > 5) notes.push("端数の処理で、改定率が " + ((nv >= b ? "+" : "") + fmt(Math.round((nv / b - 1) * 1000) / 10)) + "% になります");
      if (nv <= 0) { base.err = "改定後が0円以下になります（" + rule.text + "）"; errs.push(base); return; }
      var newEx, newIn;
      if (o.side === "in") { newIn = nv; var e1 = exclOf(nv, rate, o.taxDir); newEx = e1.v; if (!e1.ok) notes.push("この税込価格になる本体価格がありません（税抜は参考値）"); }
      else { newEx = nv; newIn = inclOf(nv, rate, o.taxDir); }
      if (o.side === "ex" && newEx % 1 !== 0) notes.push("税抜に1円未満の端数があります");
      var it = {
        i: i, code: code, name: name, cat: cat, rate: rate, rule: rule.text, from: from,
        oldEx: oldEx, oldIn: oldIn, newEx: newEx, newIn: newIn,
        diff: fix(newIn - oldIn), diffEx: fix(newEx - oldEx),
        pct: b ? Math.round((nv / b - 1) * 1000) / 10 : 0, notes: notes
      };
      it.changed = it.newIn !== it.oldIn || it.newEx !== it.oldEx;
      c.total++;
      if (it.changed) { c.changed++; if (nv > b) c.up++; else if (nv < b) c.down++; } else c.same++;
      if (notes.length) c.memo++;
      items.push(it);
    });
    return { items: items, errs: errs, count: c };
  }
  // 値札の差し替えリスト：変わる品だけ。分類があれば分類ごと（元の順を保つ）
  function tagList(items, byCat) {
    var ch = items.filter(function (x) { return x.changed; });
    if (!byCat) return [{ cat: "", items: ch }];
    var g = [], idx = {};
    ch.forEach(function (x) {
      var k = catKey(x.cat);
      if (idx[k] == null) { idx[k] = g.length; g.push({ cat: x.cat || "（分類なし）", items: [] }); }
      g[idx[k]].items.push(x);
    });
    return g;
  }
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  var K = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, clean: clean, fmt: fmt, yen: yen, taxRate: taxRate, parseRule: parseRule, parseCatRules: parseCatRules, catKey: catKey,
    roundPrice: roundPrice, inclOf: inclOf, exclOf: exclOf, guessColumns: guessColumns, guessSide: guessSide, run: run, tagList: tagList, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.KAITEI = K;
})(this);
