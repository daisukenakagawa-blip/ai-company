/* 商品コードの検査（JAN・ISBN・ITF・UPC） — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // ---------- チェックデジット ----------
  // GS1（JAN/EAN-13・EAN-8・UPC-A・ITF-14/GTIN-14）：右端（チェックデジットの左）から 3,1,3,1… の重み
  function gs1Check(body) {
    var sum = 0;
    for (var i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += (+body[i]) * w;
    return String((10 - sum % 10) % 10);
  }
  // ISBN-10：先頭から 10,9,…,2 の重み、11 で割った余り。10 は X
  function isbn10Check(body) {
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += (+body[i]) * (10 - i);
    var c = (11 - sum % 11) % 11;
    return c === 10 ? "X" : String(c);
  }
  function isbn10to13(code) { var b = "978" + code.slice(0, 9); return b + gs1Check(b); }

  var KINDS = {
    jan13: { label: "JAN（13桁）", len: 13 },
    jan8: { label: "JAN 短縮（8桁）", len: 8 },
    upc: { label: "UPC-A（12桁）", len: 12 },
    gtin14: { label: "ITF-14・GTIN-14（14桁）", len: 14 },
    isbn13: { label: "ISBN（13桁）", len: 13 },
    isbn10: { label: "ISBN（10桁）", len: 10 }
  };
  var MODES = { // 調べる種類 → 認める桁数
    auto: [8, 12, 13, 14, 10], jan13: [13], jan8: [8], upc: [12], gtin14: [14], isbn: [13, 10], jan: [13, 8]
  };

  function kindOf(code, mode) {
    var n = code.length;
    if (n === 10) return "isbn10";
    if (n === 13) return (mode === "isbn" || /^97[89]/.test(code)) && mode !== "jan13" && mode !== "jan" ? "isbn13" : "jan13";
    return { 8: "jan8", 12: "upc", 14: "gtin14" }[n] || null;
  }
  function checkOf(kind, code) { return kind === "isbn10" ? isbn10Check(code) : gs1Check(code.slice(0, -1)); }
  // 重複を見るときの共通の形（GTIN-14 にそろえる。ISBN-10 は 978 の13桁にしてから）
  function key14(kind, code) {
    if (kind === "isbn10") code = isbn10to13(code);
    while (code.length < 14) code = "0" + code;
    return code;
  }
  function memo(kind, code) {
    if (kind === "jan13" || kind === "isbn13") {
      if (/^97[89]/.test(code)) return kind === "jan13" ? "978・979 で始まる（ISBN の番号）" : "";
      if (/^2/.test(code)) return "20〜29 で始まる店内用の番号（インストアコード）";
      if (/^192/.test(code)) return "書籍の2段目のバーコード（分類・価格）";
      if (/^4[59]/.test(code)) return "";
    }
    if (kind === "jan8" && /^2/.test(code)) return "2 で始まる店内用の番号（インストアコード）";
    return "";
  }

  // 1つの値を調べる。opt.mode：auto / jan13 / jan8 / upc / gtin14 / isbn / jan
  function inspect(raw, opt) {
    opt = opt || {};
    var mode = opt.mode || "auto";
    var src = String(raw == null ? "" : raw), s = norm(src), fixes = [];
    if (s === "" || /^(-|ー|―|なし|無し)$/.test(s)) return { status: "blank", label: "空欄", msg: "" };
    var m = /^(\d)(?:\.(\d+))?E\+?(\d+)$/i.exec(s);
    if (m) {
      var frac = m[2] || "", ex = +m[3];
      if (frac.length === ex) { s = m[1] + frac; fixes.push("指数表記を元の数字に戻した"); }
      else return { status: "exp", label: "指数表記", msg: "「" + s + "」のように桁が省かれていて、元の番号に戻せません。元のデータ（Excel で開く前の CSV や、商品の現物）で確かめてください" };
    }
    if (/^'/.test(s)) { s = s.slice(1); fixes.push("先頭の ' を外した"); }
    if (/^isbn[:：]?\s*/i.test(s)) { s = s.replace(/^isbn[:：]?\s*/i, ""); fixes.push("「ISBN」を外した"); }
    if (/^\d+\.0+$/.test(s)) { s = s.replace(/\.0+$/, ""); fixes.push("末尾の .0 を外した"); }
    if (/[ \-‐−–—ー―]/.test(s) && /^[\d Xx\-‐−–—ー―]+$/.test(s)) { s = s.replace(/[ \-‐−–—ー―]/g, ""); fixes.push("ハイフン・空白を外した"); }
    if (src !== s && src.normalize && src.normalize("NFKC") !== src && /[０-９]/.test(src)) fixes.unshift("全角の数字を半角にした");
    var code = s.toUpperCase();
    var allowX = (mode === "auto" || mode === "isbn") && /^\d{9}X$/.test(code);
    if (!/^\d+$/.test(code) && !allowX) return { status: "notnum", label: "数字以外がある", msg: "「" + s + "」に数字以外の文字があります", fixes: fixes };

    var lens = MODES[mode] || MODES.auto;
    if (lens.indexOf(code.length) < 0) {
      // 先頭の 0 が消えた可能性（決まった種類のときだけ）
      if (mode !== "auto" && lens.length && code.length < lens[0]) {
        var z = code; while (z.length < lens[0]) z = "0" + z;
        var kz = kindOf(z, mode);
        if (kz && checkOf(kz, z) === z.slice(-1)) {
          return { status: "zero", label: "先頭の0が消えた", msg: lens[0] + "桁のはずが " + code.length + "桁。先頭に0を補うと正しい番号になります", code: code, fixed: z, kind: kz, key: key14(kz, z), fixes: fixes };
        }
      }
      return { status: "len", label: "桁数違い", msg: code.length + "桁（" + lens.slice().sort(function (a, b) { return a - b; }).join("・") + "桁のはず）", code: code, fixes: fixes };
    }
    var kind = kindOf(code, mode);
    if (kind === "isbn13" && !/^97[89]/.test(code)) return { status: "len", label: "ISBN ではない", msg: "13桁の ISBN は 978 か 979 で始まります", code: code, fixes: fixes };
    var want = checkOf(kind, code), got = code.slice(-1);
    var r = { code: code, kind: kind, kindLabel: KINDS[kind].label, fixes: fixes, key: key14(kind, code), note: memo(kind, code) };
    if (kind === "isbn10") r.isbn13 = isbn10to13(code);
    if (want === got) { r.status = fixes.length ? "fixed" : "ok"; r.label = fixes.length ? "正しい（書き方を整えた）" : "正しい"; r.msg = fixes.join("、"); r.fixed = code; return r; }
    r.status = "check"; r.label = "チェックデジット違い"; r.want = want;
    r.msg = "末尾は「" + want + "」のはず（今は「" + got + "」）。ほかの桁の打ち間違いのこともあります";
    r.guess = code.slice(0, -1) + want;
    return r;
  }

  // 末尾の数字（チェックデジット）を付ける。opt.mode が auto なら桁数で種類を決める
  var GEN = { auto: [7, 11, 12, 13, 9], jan13: [12], jan8: [7], upc: [11], gtin14: [13], isbn: [12, 9], jan: [12, 7] };
  function addCheck(raw, opt) {
    opt = opt || {};
    var mode = opt.mode || "auto", s = norm(raw);
    if (s === "") return { status: "blank", label: "空欄", msg: "" };
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
    s = s.replace(/^'/, "").replace(/[ \-‐−–—ー―]/g, "");
    if (!/^\d+$/.test(s)) return { status: "notnum", label: "数字以外がある", msg: "「" + s + "」に数字以外の文字があります" };
    var lens = GEN[mode] || GEN.auto;
    if (lens.indexOf(s.length) < 0) return { status: "len", label: "桁数違い", msg: s.length + "桁（末尾を付ける前は " + lens.slice().sort(function (a, b) { return a - b; }).join("・") + "桁）", code: s };
    var full, kind;
    if (s.length === 9) { kind = "isbn10"; full = s + isbn10Check(s); }
    else { full = s + gs1Check(s); kind = kindOf(full, mode); }
    if (kind === "isbn13" && !/^97[89]/.test(full)) return { status: "len", label: "ISBN ではない", msg: "13桁の ISBN は 978 か 979 で始まります", code: s };
    return { status: "ok", label: "付けた", msg: "", code: s, fixed: full, kind: kind, kindLabel: KINDS[kind].label, key: key14(kind, full), note: memo(kind, full) };
  }

  // 表全体を調べる。rows：二次元配列（見出しを除く）、col：列番号
  function run(rows, col, opt) {
    var f = opt && opt.gen ? addCheck : inspect;
    var res = rows.map(function (r, i) { var x = f(r[col], opt); x.i = i; x.raw = r[col] == null ? "" : String(r[col]); return x; });
    var groups = {}, dups = [];
    res.forEach(function (x) { if (x.key) (groups[x.key] = groups[x.key] || []).push(x); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length > 1) { dups.push({ key: k, list: g }); g.forEach(function (x) { x.dup = g; }); }
    });
    dups.sort(function (a, b) { return a.list[0].i - b.list[0].i; });
    var count = {};
    res.forEach(function (x) { count[x.status] = (count[x.status] || 0) + 1; });
    return { res: res, dups: dups, count: count };
  }

  function guessColumn(headers, rows) {
    var best = null, bestScore = 0;
    headers.forEach(function (h, i) {
      var n = norm(h).toLowerCase(), score = 0;
      if (/jan|ean|isbn|gtin|itf|upc|バーコード|ﾊﾞｰｺｰﾄﾞ/.test(n)) score = 3;
      else if (/商品コード|品番|コード|code/.test(n)) score = 1;
      var ok = 0, all = 0;
      rows.slice(0, 50).forEach(function (r) {
        var v = norm(r[i]).replace(/[\s\-]/g, ""); if (!v) return; all++;
        if (/^\d{8}$|^\d{12,14}$|^\d{9}[\dX]$|^\d\.\d+E\+\d+$/i.test(v)) ok++;
      });
      if (all) score += 2 * ok / all;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore >= 1 ? best : null;
  }
  function guessMode(headers, col) {
    var h = col == null ? "" : norm(headers[col]).toLowerCase();
    return /isbn/.test(h) ? "isbn" : /jan/.test(h) && !/itf|gtin|ean|upc/.test(h) ? "jan" : "auto";
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, gs1Check: gs1Check, isbn10Check: isbn10Check, isbn10to13: isbn10to13,
    inspect: inspect, addCheck: addCheck, run: run, guessColumn: guessColumn, guessMode: guessMode, toCSV: toCSV, KINDS: KINDS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CODEK = api;
})(this);
