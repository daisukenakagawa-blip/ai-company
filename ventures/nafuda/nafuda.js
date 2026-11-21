/* 名札・席札の一括印刷 — 計算部分（単位 mm）。ブラウザ内だけで動き、外部へ送信しない */
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

  // ---------- 列の推定（順番に意味がある：ふりがな → 姓・名 → 氏名 …） ----------
  var FIELDS = [
    ["kana", /^(ふりがな|フリガナ|よみがな|ヨミガナ|よみ|ヨミ|読み|読み仮名|カナ|かな|氏名カナ|氏名かな|カナ氏名|kana|furigana)$/i],
    ["kanaSei", /^(せい|セイ|姓カナ|姓かな|姓ふりがな|姓フリガナ|カナ姓)$/],
    ["kanaMei", /^(めい|メイ|名カナ|名かな|名ふりがな|名フリガナ|カナ名)$/],
    ["sei", /^(姓|苗字|名字|氏|姓漢字|last ?name|family ?name)$/i],
    ["mei", /^(名|下の名前|名漢字|first ?name|given ?name)$/i],
    ["name", /^(氏名|名前|お名前|参加者|参加者名|出席者|出席者名|フルネーム|氏名漢字|受講者|受講者名|ゲスト|来賓|name|full ?name)$/i],
    ["org", /^(所属|所属先|会社|会社名|勤務先|団体|団体名|学校|学校名|組織|組織名|事業所|法人名|店舗|店名|company|organization)$/i],
    ["dept", /^(部署|部署名|部門|部課|所属部署|学部|学年|クラス|チーム|department|dept)$/i],
    ["title", /^(役職|役職名|肩書|肩書き|職位|職名|役割|title|position)$/i],
    ["cat", /^(区分|種別|属性|参加区分|立場|参加者区分|種類|category|type)$/i],
    ["table", /^(卓|卓番|卓番号|卓名|テーブル|テーブル番号|席|席番|席番号|座席|座席番号|グループ|班|table|seat)$/i]
  ];
  function normHead(h) { return String(h == null ? "" : h).replace(/[\s　]/g, "").replace(/[（(].*?[)）]/g, ""); }
  function guessColumns(headers) {
    var map = {}, used = {};
    FIELDS.forEach(function (fd) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (fd[1].test(normHead(headers[i]))) { map[fd[0]] = i; used[i] = 1; return; }
      }
    });
    return map;
  }

  // ---------- 1人分のデータ ----------
  function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/[ 　]+/g, " ").trim(); }
  function cell(row, i) { return i == null || i < 0 ? "" : clean(row[i]); }
  // 姓と名の間は全角スペースにそろえる
  function joinName(a, b) { a = clean(a); b = clean(b); return a && b ? a + "　" + b : a || b; }
  function fullName(s) { return clean(s).replace(/ /g, "　"); }
  function record(row, map) {
    var name = map.name != null ? fullName(cell(row, map.name)) : joinName(cell(row, map.sei), cell(row, map.mei));
    if (map.name != null && !name && (map.sei != null || map.mei != null)) name = joinName(cell(row, map.sei), cell(row, map.mei));
    var kana = map.kana != null ? fullName(cell(row, map.kana)) : joinName(cell(row, map.kanaSei), cell(row, map.kanaMei));
    return {
      name: name, kana: kana, org: cell(row, map.org), dept: cell(row, map.dept), title: cell(row, map.title),
      cat: cell(row, map.cat), table: cell(row, map.table)
    };
  }
  function records(rows, map) {
    return rows.map(function (r, i) { var x = record(r, map); x.src = i; return x; })
      .filter(function (x) { return x.name || x.org || x.kana; });
  }

  // ---------- 並べ替え ----------
  function kataToHira(s) { return String(s || "").replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function natCmp(a, b) {
    var re = /(\d+)|(\D+)/g, x = String(a).match(re) || [], y = String(b).match(re) || [];
    for (var i = 0; i < Math.min(x.length, y.length); i++) {
      var p = x[i], q = y[i];
      if (/^\d/.test(p) && /^\d/.test(q)) { if (+p !== +q) return +p - +q; }
      else if (p !== q) return p < q ? -1 : 1;
    }
    return x.length - y.length;
  }
  function sortRecs(recs, by) {
    var r = recs.slice();
    var key = {
      kana: function (x) { return kataToHira(x.kana || x.name).replace(/[\s　]/g, ""); },
      org: function (x) { return x.org + "\u0000" + x.dept; },
      table: function (x) { return x.table; },
      cat: function (x) { return x.cat; }
    }[by];
    if (!key) return r;
    r.sort(function (a, b) {
      var ka = key(a), kb = key(b);
      if (!ka !== !kb) return ka ? -1 : 1; // 空欄は最後
      var c = by === "table" ? natCmp(ka, kb) : (ka < kb ? -1 : ka > kb ? 1 : 0);
      if (!c && by !== "kana") { var k2 = kataToHira(a.kana || a.name), k3 = kataToHira(b.kana || b.name); c = k2 < k3 ? -1 : k2 > k3 ? 1 : 0; }
      return c || a.src - b.src;
    });
    return r;
  }

  // ---------- 用紙 ----------
  // kind: "tag"（名札：1面＝札1枚）／"tent"（席札：1面＝表と裏の2倍の高さ、真ん中で折る）
  // 寸法は一般的な例（特定の商品の品番ではない）。用紙の箱の寸法に合わせて直せる
  var PRESETS = {
    meishi10: { kind: "tag", name: "名札：名刺サイズ 91×55mm（A4 に 10 枚・2列×5段）", w: 91, h: 55, cols: 2, rows: 5, left: 14, top: 11, gx: 0, gy: 0 },
    card8: { kind: "tag", name: "名札：大きめ 95×65mm（A4 に 8 枚・2列×4段、普通紙に印刷して切る）", w: 95, h: 65, cols: 2, rows: 4, left: 10, top: 18.5, gx: 0, gy: 0 },
    tent91: { kind: "tent", name: "席札：二つ折り 91×55mm（A4 に 4 枚・広げると 91×110mm）", w: 91, h: 55, cols: 2, rows: 2, left: 14, top: 38.5, gx: 0, gy: 0 },
    tent100: { kind: "tent", name: "席札：二つ折り 100×60mm（A4 に 4 枚・広げると 100×120mm）", w: 100, h: 60, cols: 2, rows: 2, left: 5, top: 28.5, gx: 0, gy: 0 },
    tentA4: { kind: "tent", name: "大きな名前札：A4 を半分に折る 210×148mm（会議・登壇用、A4 に 1 枚）", w: 210, h: 148.5, cols: 1, rows: 1, left: 0, top: 0, gx: 0, gy: 0 }
  };
  var PAGE = { w: 210, h: 297 };
  function slotH(s) { return s.kind === "tent" ? s.h * 2 : s.h; }
  function checkSheet(s) {
    var e = [];
    if (!(s.cols >= 1 && s.rows >= 1)) e.push("列と段は1以上にしてください");
    if (!(s.w >= 30 && s.h >= 20)) e.push("札の大きさは幅30mm・高さ20mm以上にしてください");
    var right = s.left + s.cols * s.w + (s.cols - 1) * s.gx, bottom = s.top + s.rows * slotH(s) + (s.rows - 1) * s.gy;
    if (right > PAGE.w + 0.5) e.push("横の合計（左余白＋幅×列＋すき間）が " + right.toFixed(1) + "mm で、A4 の幅 210mm を超えています");
    if (bottom > PAGE.h + 0.5) e.push("縦の合計（上余白＋高さ" + (s.kind === "tent" ? "×2（折る分）" : "") + "×段＋すき間）が " + bottom.toFixed(1) + "mm で、A4 の高さ 297mm を超えています");
    return e;
  }
  // 面の位置。start は1枚目で飛ばす面の数
  function positions(count, s, start, o) {
    o = o || {};
    var per = s.cols * s.rows, res = [], ox = o.offsetX || 0, oy = o.offsetY || 0;
    start = Math.max(0, Math.min(per - 1, start | 0));
    for (var i = 0; i < count; i++) {
      var k = i + start, page = Math.floor(k / per), j = k % per, c = j % s.cols, r = Math.floor(j / s.cols);
      res.push({ page: page, col: c, row: r, x: s.left + c * (s.w + s.gx) + ox, y: s.top + r * (slotH(s) + s.gy) + oy });
    }
    return res;
  }
  function pageCount(count, s, start) {
    if (!count) return 0;
    var per = s.cols * s.rows;
    return Math.ceil((count + Math.max(0, Math.min(per - 1, start | 0))) / per);
  }

  // ---------- 文字の幅 ----------
  // 既定は「全角=1em、半角=0.55em」の目安。ブラウザでは画面の書体で実際に測る関数に差し替える
  function textEm(s) {
    var n = 0;
    Array.from(String(s || "")).forEach(function (c) { n += /[ -~｡-ﾟ]/.test(c) ? 0.55 : 1; });
    return n;
  }
  var measure = function (s /*, font */) { return textEm(s); };
  function setMeasure(fn) { measure = fn || function (s) { return textEm(s); }; }

  // 幅 avail に収める。mode="shrink"：文字を小さく／"condense"：横に詰め（最小 0.6 倍）、足りない分は小さく
  function fit(text, fs, avail, font, mode) {
    var em = measure(text, font);
    if (!em) return { fs: fs, sx: 1 };
    var need = em * fs;
    if (need <= avail) return { fs: fs, sx: 1 };
    var r = avail / need;
    if (mode === "condense") {
      if (r >= 0.6) return { fs: fs, sx: r };
      return { fs: fs * r / 0.6, sx: 0.6 };
    }
    return { fs: fs * r, sx: 1 };
  }

  // ---------- 1枚の札の中身（札の左上を 0,0 とする mm） ----------
  // o: font, fit, keisho, showKana, showOrg, showDept, showTitle, band（"cat"|"event"|"none"）, event, showTable, blankLabel
  function layoutFace(rec, w, h, o) {
    o = o || {};
    var pad = Math.max(3, Math.min(w, h) * 0.07), inner = w - pad * 2, items = [], font = o.font || "gothic";
    var bandText = o.band === "cat" ? rec.cat : o.band === "event" ? o.event : "";
    var bandH = bandText ? h * 0.15 : 0, y0 = bandH, bottomText = "";
    if (bandText) {
      var bf = fit(bandText, bandH * 0.62, inner, font, "condense");
      items.push({ k: "band", x: 0, y: 0, w: w, h: bandH, fs: bf.fs, sx: bf.sx, s: bandText });
    }
    var parts = [];
    if (o.band !== "event" && o.event) bottomText = o.event;
    if (o.showTable && rec.table) bottomText = (bottomText ? bottomText + "　" : "") + (/^[0-9０-９A-Za-zＡ-Ｚａ-ｚ]+$/.test(rec.table) ? rec.table + " 卓" : rec.table);
    var foot = bottomText ? h * 0.09 : 0;
    if (o.showOrg !== false && rec.org) parts.push({ k: "org", s: rec.org, fs: h * 0.085, gap: 0 });
    var sub = [o.showDept !== false ? rec.dept : "", o.showTitle !== false ? rec.title : ""].filter(Boolean).join("　");
    if (sub) parts.push({ k: "sub", s: sub, fs: h * 0.075, gap: 0 });
    var isBlank = !rec.name && !rec.org && !rec.kana;
    if (o.showKana !== false && rec.kana) parts.push({ k: "kana", s: rec.kana, fs: h * 0.07, gap: parts.length ? h * 0.04 : 0 });
    if (rec.name) parts.push({ k: "name", s: rec.name, keisho: o.keisho || "", fs: h * 0.26, gap: parts.length && parts[parts.length - 1].k !== "kana" ? h * 0.04 : h * 0.01 });
    if (isBlank) parts.push({ k: "blank", s: o.blankLabel || "お名前", fs: h * 0.07, gap: 0 });
    var LH = 1.25;
    // 横に収める
    parts.forEach(function (p) {
      var txt = p.s + (p.keisho ? "　" : ""), ks = p.keisho ? measure(p.keisho, font) * 0.7 : 0;
      var em = measure(txt, font) + ks;
      var f = fit("", p.fs, inner, font, o.fit);
      if (em * p.fs > inner) {
        var r = inner / (em * p.fs);
        f = o.fit === "condense" && p.k === "name" ? (r >= 0.6 ? { fs: p.fs, sx: r } : { fs: p.fs * r / 0.6, sx: 0.6 }) : { fs: p.fs * r, sx: 1 };
      }
      p.fs = f.fs; p.sx = f.sx;
    });
    // 縦に収める（はみ出すときは全体を小さく）
    var availH = h - bandH - foot - pad * (bandText ? 1 : 2) - (foot ? pad * 0.3 : 0);
    var total = function () { return parts.reduce(function (a, p) { return a + p.fs * LH + p.gap; }, 0) + (isBlank ? h * 0.3 : 0); };
    var t = total();
    if (t > availH && t > 0) { var sc = availH / t; parts.forEach(function (p) { p.fs *= sc; p.gap *= sc; }); t = total(); }
    var y = y0 + (bandText ? pad * 0.5 : pad) + Math.max(0, (availH - t) / 2);
    parts.forEach(function (p) {
      y += p.gap;
      items.push({ k: p.k, x: pad, y: y, w: inner, h: p.fs * LH, fs: p.fs, sx: p.sx, s: p.s, keisho: p.keisho });
      y += p.fs * LH;
    });
    if (isBlank) items.push({ k: "line", x: pad + inner * 0.1, y: y + h * 0.22, w: inner * 0.8, h: 0 });
    if (foot) {
      var ff = fit(bottomText, foot * 0.75, inner, font, "shrink");
      items.push({ k: "foot", x: pad, y: h - foot - pad * 0.3, w: inner, h: foot, fs: ff.fs, sx: 1, s: bottomText });
    }
    return items;
  }
  // 名前・所属が札に収まらず、読めないほど小さくなったもの（文字の高さ 2.5mm 未満の名前）
  function tooSmall(items) { return items.some(function (it) { return it.k === "name" && it.fs * (it.sx || 1) < 2.5; }); }

  var api = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, guessColumns: guessColumns, clean: clean, record: record, records: records,
    sortRecs: sortRecs, kataToHira: kataToHira, PRESETS: PRESETS, PAGE: PAGE, slotH: slotH, checkSheet: checkSheet,
    positions: positions, pageCount: pageCount, textEm: textEm, setMeasure: setMeasure, fit: fit, layoutFace: layoutFace, tooSmall: tooSmall
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Nafuda = api;
})(this);
