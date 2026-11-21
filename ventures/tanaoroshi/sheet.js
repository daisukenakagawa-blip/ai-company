/* 棚卸の記入用シート印刷 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // ---------- 列の推定 ----------
  // 順番に意味がある（「実数」「実在庫」を「在庫」より先に、「商品コード」を「商品名」より先に見る）
  var FIELDS = [
    ["count", /^(実数|実棚|実在庫|実地|カウント|数えた数|棚卸数|棚卸数量)/],
    ["loc", /^(棚|棚番|棚番号|ロケーション|ロケ|置き場|置場|保管場所|保管棚|倉庫|場所|エリア|売場|売り場|location)/i],
    ["cat", /^(分類|カテゴリ|カテゴリー|部門|区分|種類|種別|グループ|category)/i],
    ["code", /^(品番|商品コード|品目コード|商品番号|コード|JAN|JANコード|SKU|型番|品目番号|code|item ?code)/i],
    ["name", /^(商品名|品名|品目名|品目|名称|商品|アイテム|名前|item|name|product)/i],
    ["spec", /^(規格|仕様|サイズ|色|カラー|容量|入数|spec)/i],
    ["unit", /^(単位|unit)/i],
    ["book", /^(帳簿|帳簿数|帳簿在庫|理論在庫|理論数|システム在庫|在庫数|在庫|現在庫|数量|stock|qty|quantity)/i]
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

  // ---------- 文字 ----------
  function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/[ 　]+/g, " ").trim(); }
  function cell(row, i) { return i == null || i < 0 ? "" : clean(row[i]); }
  function toHalfNum(s) {
    return String(s == null ? "" : s).replace(/[０-９．，－ー−]/g, function (c) {
      if (c === "ー" || c === "−" || c === "－") return "-";
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    });
  }
  // 数として読めれば数、読めなければ null（「1,200」「１２」「-3」「12個」は読む）
  function num(s) {
    var t = toHalfNum(clean(s)).replace(/,/g, "").replace(/[^\d.\-]+$/, "");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }
  // 表示上の幅（全角=1、半角=0.55）
  function textWidth(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) < 0x2e80 || (s.charCodeAt(i) >= 0xff61 && s.charCodeAt(i) <= 0xff9f) ? 0.55 : 1;
    return w;
  }
  var PT = 0.3528; // 1pt = 0.3528mm
  // 幅 widthMm・高さ rowMm のセルに収まる文字の大きさ（pt）と行数。最小 minPt を下回るなら cut=true
  function fitText(s, widthMm, rowMm, basePt, minPt) {
    var w = textWidth(s);
    if (!w) return { pt: basePt, lines: 1, cut: false };
    var one = Math.min(basePt, widthMm / (w * PT));
    if (one >= basePt * 0.8 || one >= minPt * 1.4) return { pt: Math.max(one, minPt), lines: 1, cut: one < minPt };
    // 2行に折り返す
    var hMax = rowMm / (2 * 1.15 * PT);
    var two = Math.min(basePt, hMax, (widthMm * 2 * 0.92) / (w * PT));
    if (two >= minPt) return { pt: two, lines: 2, cut: false };
    return { pt: minPt, lines: 2, cut: true };
  }

  // ---------- 用紙と列 ----------
  var PAPER = { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } };
  var MARGIN = 10, HEAD_MM = 25, FOOT_MM = 8, THEAD_MM = 7;
  function rowsPerPage(orient, rowMm) {
    var p = PAPER[orient] || PAPER.portrait;
    var avail = p.h - MARGIN * 2 - HEAD_MM - FOOT_MM - THEAD_MM;
    return Math.max(1, Math.floor(avail / rowMm + 1e-9));
  }
  // 印刷する列と幅（mm）。name が残りの幅を取る
  function columns(map, opt, orient) {
    var p = PAPER[orient] || PAPER.portrait, inner = p.w - MARGIN * 2;
    var cols = [{ k: "no", t: "No.", w: 10 }];
    if (map.loc != null && opt.groupBy !== "loc") cols.push({ k: "loc", t: "棚・場所", w: 18 });
    if (map.cat != null && opt.groupBy !== "cat" && opt.showCat) cols.push({ k: "cat", t: "分類", w: 18 });
    if (map.code != null) cols.push({ k: "code", t: "品番・コード", w: orient === "landscape" ? 34 : 28 });
    cols.push({ k: "name", t: "品名" + (map.spec != null ? "・規格" : ""), w: 0 });
    if (map.unit != null) cols.push({ k: "unit", t: "単位", w: 11 });
    if (map.book != null && opt.showBook) cols.push({ k: "book", t: "帳簿数", w: 16 });
    cols.push({ k: "count", t: "実数", w: opt.countMm || 22 });
    if (opt.showDiff && map.book != null && opt.showBook) cols.push({ k: "diff", t: "差異", w: 14 });
    cols.push({ k: "memo", t: "備考", w: orient === "landscape" ? 40 : 24 });
    var used = cols.reduce(function (a, c) { return a + c.w; }, 0);
    // 品名の幅が 40mm 未満になるときは、備考・棚・分類・品番の欄を細くする
    var need = 40 - (inner - used);
    [["memo", 12], ["loc", 14], ["cat", 14], ["code", 22]].forEach(function (s) {
      cols.forEach(function (c) { if (need > 0 && c.k === s[0] && c.w > s[1]) { var d = Math.min(need, c.w - s[1]); c.w -= d; need -= d; used -= d; } });
    });
    cols.forEach(function (c) { if (c.k === "name") c.w = inner - used; });
    return cols;
  }

  // ---------- 行の組み立て ----------
  function buildItems(rows, map) {
    return rows.map(function (r, i) {
      return {
        src: i,
        loc: cell(r, map.loc), cat: cell(r, map.cat), code: cell(r, map.code),
        name: cell(r, map.name), spec: cell(r, map.spec), unit: cell(r, map.unit),
        book: cell(r, map.book), count: cell(r, map.count)
      };
    }).filter(function (it) { return it.code || it.name; });
  }
  // 自然順（「A-2」<「A-10」）
  function natCmp(a, b) {
    var ax = String(a).match(/(\d+|\D+)/g) || [], bx = String(b).match(/(\d+|\D+)/g) || [];
    for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
      var x = ax[i], y = bx[i];
      if (x === y) continue;
      if (/^\d/.test(x) && /^\d/.test(y)) return (+x) - (+y) || x.length - y.length;
      return x < y ? -1 : 1;
    }
    return ax.length - bx.length;
  }
  // 並べ替え：group の値 → 元の順（sort=code なら品番順）
  function orderItems(items, opt) {
    var g = opt.groupBy, firstSeen = {};
    items.forEach(function (it, i) { var k = g && g !== "none" ? it[g] : ""; if (!(k in firstSeen)) firstSeen[k] = i; });
    return items.slice().sort(function (a, b) {
      if (g && g !== "none" && a[g] !== b[g]) {
        if (opt.groupSort === "name") return natCmp(a[g] || "￿", b[g] || "￿");
        return firstSeen[a[g]] - firstSeen[b[g]];
      }
      if (opt.sort === "code") return natCmp(a.code, b.code) || a.src - b.src;
      if (opt.sort === "name") return natCmp(a.name, b.name) || a.src - b.src;
      return a.src - b.src;
    });
  }
  // ページに分ける。グループが変わるところで改ページ（opt.breakOnGroup）。各グループの最後に空欄行（opt.blank）
  function paginate(items, opt) {
    var per = rowsPerPage(opt.orient, opt.rowMm), g = opt.groupBy && opt.groupBy !== "none" ? opt.groupBy : null;
    var ordered = orderItems(items, opt), groups = [], cur = null;
    ordered.forEach(function (it) {
      var k = g ? it[g] : "";
      if (!cur || cur.key !== k) { cur = { key: k, items: [] }; groups.push(cur); }
      cur.items.push(it);
    });
    var pages = [], no = 0, page = null;
    function newPage(key) { page = { group: key, rows: [] }; pages.push(page); }
    groups.forEach(function (gr) {
      var list = gr.items.map(function (it) { no++; return { item: it, no: no }; });
      for (var b = 0; b < (opt.blank || 0); b++) list.push({ blank: true });
      if (!page || (g && opt.breakOnGroup)) newPage(gr.key);
      if (g && !opt.breakOnGroup) {
        if (page.rows.length >= per - 1) newPage(gr.key);
        page.rows.push({ head: gr.key });
      }
      list.forEach(function (r) {
        if (page.rows.length >= per) newPage(gr.key);
        page.rows.push(r);
      });
    });
    // グループ内のページ番号
    var byGroup = {};
    pages.forEach(function (p) { (byGroup[p.group] = byGroup[p.group] || []).push(p); });
    pages.forEach(function (p, i) {
      p.no = i + 1; p.total = pages.length;
      var arr = byGroup[p.group]; p.gNo = arr.indexOf(p) + 1; p.gTotal = arr.length;
      p.itemCount = p.rows.filter(function (r) { return r.item; }).length;
    });
    return pages;
  }

  // ---------- 実数の保存 ----------
  function csvCell(v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  // 元の表に「実数」「差異」列を足した CSV（Excel で開ける UTF-8 BOM 付き）。counts は src 行番号 → 入力値
  function resultCSV(headers, rows, map, counts, limit) {
    var hasCount = map.count != null;
    var head = headers.slice();
    if (!hasCount) head.push("実数");
    if (map.book != null) head.push("差異（実数−帳簿）");
    var out = [head];
    var n = 0;
    rows.forEach(function (r, i) {
      if (limit != null && n >= limit) return;
      n++;
      var line = headers.map(function (_, j) { return r[j] == null ? "" : r[j]; });
      var c = counts && counts[i] != null ? String(counts[i]).trim() : (hasCount ? cell(r, map.count) : "");
      if (hasCount) line[map.count] = c; else line.push(c);
      if (map.book != null) {
        var a = num(c), b = num(r[map.book]);
        line.push(a != null && b != null ? String(Math.round((a - b) * 1000) / 1000) : "");
      }
      out.push(line);
    });
    return "﻿" + out.map(function (l) { return l.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }
  // 入力の集計：入力済み・差異あり
  function summary(items, counts) {
    var done = 0, diff = 0, bad = 0;
    items.forEach(function (it) {
      var c = counts[it.src] != null ? counts[it.src] : it.count;
      if (c == null || String(c).trim() === "") return;
      done++;
      var a = num(c), b = num(it.book);
      if (a == null) { bad++; return; }
      if (b != null && a !== b) diff++;
    });
    return { done: done, diff: diff, bad: bad, all: items.length };
  }

  root.Tana = {
    decodeBytes: decodeBytes, parseCSV: parseCSV, guessColumns: guessColumns, normHead: normHead,
    clean: clean, num: num, textWidth: textWidth, fitText: fitText,
    PAPER: PAPER, MARGIN: MARGIN, HEAD_MM: HEAD_MM, FOOT_MM: FOOT_MM, THEAD_MM: THEAD_MM,
    rowsPerPage: rowsPerPage, columns: columns, buildItems: buildItems, natCmp: natCmp,
    orderItems: orderItems, paginate: paginate, resultCSV: resultCSV, summary: summary
  };
})(typeof window !== "undefined" ? window : globalThis);
