/* 宛名ラベルの面付け印刷 — 計算部分（単位 mm）。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var A = (typeof module !== "undefined" && module.exports) ? require("./atena.js") : root.Atena;

  // 代表的な A4 ラベル用紙の寸法の例（特定の商品の品番ではない）。用紙の箱の寸法に合わせて直せる
  var PRESETS = {
    "10": { name: "10面（2列×5段）", cols: 2, rows: 5, w: 86.4, h: 50.8, top: 21.5, left: 18.6, gx: 0, gy: 0 },
    "12": { name: "12面（2列×6段）", cols: 2, rows: 6, w: 86.4, h: 42.3, top: 21.6, left: 18.6, gx: 0, gy: 0 },
    "18": { name: "18面（2列×9段）", cols: 2, rows: 9, w: 86.4, h: 31.0, top: 9.0, left: 18.6, gx: 0, gy: 0 },
    "21": { name: "21面（3列×7段）", cols: 3, rows: 7, w: 70.0, h: 42.3, top: 0.45, left: 0, gx: 0, gy: 0 },
    "24": { name: "24面（3列×8段）", cols: 3, rows: 8, w: 70.0, h: 33.9, top: 12.9, left: 0, gx: 0, gy: 0 },
    "44": { name: "44面（4列×11段）", cols: 4, rows: 11, w: 48.3, h: 25.4, top: 8.8, left: 8.4, gx: 0, gy: 0 }
  };
  var PAGE = { w: 210, h: 297 };

  // 用紙の寸法が A4 に収まるか
  function checkSheet(s) {
    var e = [];
    if (!(s.cols >= 1 && s.rows >= 1)) e.push("列と段は1以上にしてください");
    if (!(s.w > 5 && s.h > 5)) e.push("ラベルの幅・高さは5mmより大きくしてください");
    var right = s.left + s.cols * s.w + (s.cols - 1) * s.gx, bottom = s.top + s.rows * s.h + (s.rows - 1) * s.gy;
    if (right > PAGE.w + 0.5) e.push("横の合計（左余白＋ラベル幅×列＋すき間）が " + right.toFixed(1) + "mm で、A4 の幅 210mm を超えています");
    if (bottom > PAGE.h + 0.5) e.push("縦の合計（上余白＋ラベル高さ×段＋すき間）が " + bottom.toFixed(1) + "mm で、A4 の高さ 297mm を超えています");
    return e;
  }

  // 文字の幅（全角=1、半角=0.55 として em 単位）
  function textEm(s) {
    var n = 0;
    Array.from(String(s || "")).forEach(function (c) { n += /[ -~｡-ﾟ]/.test(c) ? 0.55 : 1; });
    return n;
  }
  function numText(s, style) {
    s = String(s || "");
    if (style === "half") return s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }).replace(/[－−‐]/g, "-");
    if (style === "full") return s.replace(/[0-9]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0xfee0); }).replace(/(?<=[０-９])-(?=[０-９])/g, "－");
    return s;
  }

  // 1枚のラベルの中身（行の並び）。rec は Atena.buildRecord の結果
  function labelLines(rec, o) {
    o = o || {};
    var st = o.numStyle || "keep", L = [];
    if (rec.zip) L.push({ k: "zip", s: "〒" + rec.zip.slice(0, 3) + "-" + rec.zip.slice(3), base: 1.0 });
    else if (rec.rawZip) L.push({ k: "zip", s: "〒" + rec.rawZip, base: 1.0 });
    if (rec.addr1) L.push({ k: "addr", s: numText(rec.addr1, st), base: 1.0 });
    if (rec.addr2) L.push({ k: "addr", s: numText(rec.addr2, st), base: 1.0, indent: 1 });
    if (rec.company) L.push({ k: "co", s: rec.company + (rec.companyOnly ? "　御中" : ""), base: rec.companyOnly ? 1.35 : 1.0, gapBefore: 0.4 });
    if (rec.dept) L.push({ k: "co", s: rec.dept, base: 1.0 });
    var first = true;
    (rec.names || []).forEach(function (n, j) {
      var sei = n.sei || "", ghost = "";
      if (j > 0 && !sei && rec.names[0].sei) ghost = rec.names[0].sei; // 名だけの連名は、名の位置をそろえる
      L.push({ k: "name", ghost: ghost, s: (sei ? sei + "　" : "") + n.mei, keisho: n.keisho, base: 1.35, gapBefore: first ? 0.4 : 0 });
      first = false;
    });
    return L;
  }

  // 行の文字の大きさを決める。w,h はラベル内の使える幅・高さ（mm）、fs は基準の文字の大きさ（mm）
  function fitLines(lines, w, h, fs) {
    var LH = 1.3, out = [];
    lines.forEach(function (ln) {
      var em = textEm(ln.ghost ? ln.ghost + "　" : "") + textEm(ln.s) + (ln.keisho ? 1 + textEm(ln.keisho) : 0) + (ln.indent || 0);
      var size = Math.min(fs * ln.base, w / Math.max(em, 1));
      out.push({ ln: ln, fs: size, shrunk: size < fs * ln.base - 0.01 });
    });
    var scale = 1;
    var total = function () { return out.reduce(function (a, x) { return a + x.fs * LH + (x.ln.gapBefore || 0) * fs * scale; }, 0); };
    var t = total();
    if (t > h) { scale = h / t; out.forEach(function (x) { x.fs *= scale; }); }
    return { lines: out, height: total(), scale: scale, lineHeight: LH, minFs: Math.min.apply(null, out.map(function (x) { return x.fs; }).concat([fs])) };
  }

  // ラベルの位置（ページ番号・列・段・左上 mm）。start は1枚目で飛ばす面の数
  function positions(count, sheet, start, o) {
    o = o || {};
    var per = sheet.cols * sheet.rows, res = [], ox = o.offsetX || 0, oy = o.offsetY || 0;
    start = Math.max(0, Math.min(per - 1, start | 0));
    for (var i = 0; i < count; i++) {
      var slot = i + start, page = Math.floor(slot / per), k = slot % per;
      var c = o.order === "down" ? Math.floor(k / sheet.rows) : k % sheet.cols;
      var r = o.order === "down" ? k % sheet.rows : Math.floor(k / sheet.cols);
      res.push({ page: page, col: c, row: r, x: sheet.left + c * (sheet.w + sheet.gx) + ox, y: sheet.top + r * (sheet.h + sheet.gy) + oy });
    }
    return { items: res, pages: count ? res[res.length - 1].page + 1 : 0, per: per };
  }

  var api = { PRESETS: PRESETS, PAGE: PAGE, checkSheet: checkSheet, textEm: textEm, numText: numText, labelLines: labelLines, fitLines: fitLines, positions: positions };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Label = api;
})(this);
