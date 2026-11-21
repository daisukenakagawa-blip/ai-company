/* はがきの宛名印刷（縦書き） — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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
    text = text.replace(/^﻿/, "");
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
  var FIELDS = [
    ["zip", /^(〒|郵便番号|郵便|zip|postal|ゆうびん)/i],
    ["pref", /^(都道府県|県)$/],
    ["city", /^(市区町村|市区郡|市町村)/],
    ["addr1", /^(住所1|住所１|住所|自宅住所|所在地|address1?|番地|町域)/i],
    ["addr2", /^(住所2|住所２|住所3|住所３|建物|建物名|方書|マンション|ビル|address2)/i],
    ["company", /^(会社|会社名|勤務先|法人名|団体名|社名|company)/i],
    ["dept", /^(部署|部署名|所属|部課|department)/i],
    ["position", /^(役職|肩書)/],
    ["sei", /^(姓|苗字|名字|氏|last ?name)$/i],
    ["mei", /^(名|下の名前|first ?name)$/i],
    ["name", /^(氏名|名前|宛名|お名前|フルネーム|name)$/i],
    ["keisho", /^(敬称)/],
    ["print", /^(印刷|送付|送る|出す|年賀|喪中)/]
  ];
  function normHead(h) { return String(h || "").replace(/[\s　]/g, "").replace(/[（(].*?[)）]/g, ""); }
  function guessColumns(headers) {
    var map = { renmei: [] }, used = {};
    headers.forEach(function (h, i) {
      var n = normHead(h);
      if (/^連名/.test(n)) { map.renmei.push(i); used[i] = 1; }
    });
    FIELDS.forEach(function (fd) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        if (fd[1].test(normHead(headers[i]))) { map[fd[0]] = i; used[i] = 1; return; }
      }
    });
    // 住所の2列目：「住所」の次の列が住所っぽい見出しなら
    if (map.addr1 != null && map.addr2 == null) {
      var nx = normHead(headers[map.addr1 + 1]);
      if (/^住所/.test(nx) && !used[map.addr1 + 1]) map.addr2 = map.addr1 + 1;
    }
    return map;
  }

  // ---------- 文字の整形 ----------
  function toHalf(s) {
    return String(s == null ? "" : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/　/g, " ");
  }
  function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/[ 　]+/g, " ").trim(); }
  function normalizeZip(s) {
    var d = toHalf(s).replace(/[^0-9]/g, "");
    return d.length === 7 ? d : "";
  }
  var KD = "〇一二三四五六七八九";
  var DASH = /[-‐－−‑–—―ーｰ]/;
  // 縦書き用：数字を漢数字（一桁ずつ）に、数字の間のハイフンを「ー」に、英字を全角に
  function verticalText(s, style) {
    s = clean(s);
    if (!s) return "";
    var h = toHalf(s), out = "";
    // 「20丁目」「12番」「3条」のような2桁までの数は「二十」「十二」と書く（部屋番号などは一桁ずつ）
    if (style === "kanji") h = h.replace(/(^|[^0-9])([0-9]{1,2})(?=(丁目|番町|番地|番|号(?!室)|条|線|地割))/g, function (m, pre, num) { return pre + juu(+num); });
    for (var i = 0; i < h.length; i++) {
      var c = h[i], p = h[i - 1], n = h[i + 1];
      if (/[0-9]/.test(c)) out += style === "kanji" ? KD[+c] : String.fromCharCode(c.charCodeAt(0) + 0xfee0);
      else if (DASH.test(c) && (/[0-9A-Za-z]/.test(p || "") || /[0-9]/.test(n || ""))) out += "ー";
      else if (c === " ") out += "　";
      else if (/[!-~]/.test(c)) out += String.fromCharCode(c.charCodeAt(0) + 0xfee0);
      else out += c;
    }
    return out.replace(/　+/g, "　");
  }
  function juu(n) {
    if (n < 10) return KD[n];
    var t = Math.floor(n / 10), o = n % 10;
    return (t > 1 ? KD[t] : "") + "十" + (o ? KD[o] : "");
  }
  // 1列の住所を「住所」と「建物名」に分ける（番地の後ろの空白で区切る）
  function splitBuilding(addr) {
    var s = clean(addr);
    var m = s.match(/^(.*?[0-9０-９〇一二三四五六七八九十][^ ]*?) (.+)$/);
    if (m && !/^[0-9０-９\-－ー‐]+$/.test(m[2])) return [m[1], m[2]];
    return [s, ""];
  }
  function splitName(full) {
    var s = clean(full).replace(/(様|殿|さま|御中|先生)$/, "").trim();
    var p = s.split(" ");
    if (p.length >= 2) return { sei: p[0], mei: p.slice(1).join("") };
    return { sei: "", mei: s, whole: true };
  }

  // ---------- 1件分の宛名 ----------
  function cell(row, i) { return i == null || i < 0 ? "" : clean(row[i]); }
  function buildRecord(row, map, opt) {
    opt = opt || {};
    var r = { zip: normalizeZip(cell(row, map.zip)), rawZip: cell(row, map.zip), warn: [] };
    var a1 = [cell(row, map.pref), cell(row, map.city), cell(row, map.addr1)].filter(Boolean).join("");
    var a2 = cell(row, map.addr2);
    if (!a2) { var sp = splitBuilding(a1); a1 = sp[0]; a2 = sp[1]; }
    r.addr1 = a1; r.addr2 = a2;
    r.company = cell(row, map.company);
    r.dept = [cell(row, map.dept), cell(row, map.position)].filter(Boolean).join(" ");
    var k = cell(row, map.keisho) || opt.keisho || "様";
    var main;
    if (map.sei != null || map.mei != null) main = { sei: cell(row, map.sei), mei: cell(row, map.mei) };
    else main = splitName(cell(row, map.name));
    r.names = [];
    if (main.sei || main.mei) r.names.push({ sei: main.sei, mei: main.mei, keisho: k });
    (map.renmei || []).forEach(function (ci) {
      var v = cell(row, ci);
      if (!v) return;
      v.split(/[、,，・\/]/).forEach(function (one) {
        one = clean(one); if (!one) return;
        var sn = splitName(one);
        r.names.push({ sei: sn.whole ? "" : sn.sei, mei: sn.mei, keisho: k });
      });
    });
    if (!r.names.length && r.company) r.companyOnly = true;
    if (map.print != null) {
      var pv = toHalf(cell(row, map.print));
      r.skip = /^(0|×|x|無|なし|不要|no|false|しない|出さない|喪中)$/i.test(pv);
    }
    if (!r.zip) r.warn.push(r.rawZip ? "郵便番号が7桁ではありません" : "郵便番号がありません");
    if (!r.addr1) r.warn.push("住所がありません");
    if (!r.names.length && !r.company) r.warn.push("宛名（氏名・会社名）がありません");
    return r;
  }

  // ---------- はがきの配置（単位 mm） ----------
  var CARD = { w: 100, h: 148 };
  // 郵便番号枠：上端から12mm、右端から8mm（日本郵便「郵便番号・バーコードマニュアル」）。枠 5.7×8.0mm、全幅47.7mm
  var ZIP_X = [44.0, 51.0, 58.0, 65.6, 72.4, 79.2, 86.0], ZIP_Y = 12.0, ZIP_W = 5.7, ZIP_H = 8.0;

  // 長い住所を2列に分ける位置（市区町村の後ろを優先）
  function breakAddress(s, maxChars) {
    if (s.length <= maxChars) return [s];
    var best = -1;
    for (var i = Math.min(s.length - 1, maxChars); i > 3; i--) {
      if (/[都道府県市区町村郡]/.test(s[i - 1]) && i >= s.length * 0.3) { best = i; break; }
    }
    if (best < 0) best = Math.min(maxChars, Math.ceil(s.length / 2));
    return [s.slice(0, best), s.slice(best)];
  }
  function fit(len, room, base, min) { return Math.max(min, Math.min(base, room / Math.max(len, 1))); }

  // 宛名面の部品（縦書きの列）を計算する
  function layout(rec, opt) {
    opt = opt || {};
    var st = opt.numStyle === "zen" ? "zen" : "kanji";
    var items = [], warn = [];
    var ox = +opt.offsetX || 0, oy = +opt.offsetY || 0;
    // 郵便番号
    if (rec.zip) for (var i = 0; i < 7; i++)
      items.push({ t: "zip", x: ZIP_X[i] + ox, y: ZIP_Y + oy, w: ZIP_W, h: ZIP_H, s: rec.zip[i] });

    // 住所（右端の列から）
    var top = 26 + oy, bottom = 128 + oy, room = bottom - top;
    var a1 = verticalText(rec.addr1, st), a2 = verticalText(rec.addr2, st);
    var cols = [];
    var fs1 = fit(a1.length, room, 6.0, 4.0);
    if (a1.length * 4.0 > room) { breakAddress(a1, Math.floor(room / 4.6)).forEach(function (p, k) { cols.push({ s: p, indent: k ? 3 : 0 }); }); }
    else cols.push({ s: a1, indent: 0 });
    if (a2) cols.push({ s: a2, indent: 10, bottomAlign: true });
    var fsA = 6.0;
    cols.forEach(function (c) { fsA = Math.min(fsA, fit(c.s.length, room - c.indent, 6.0, 3.2)); });
    if (fsA < 3.6) warn.push("住所が長いため、文字を小さくしています");
    var x = 92 + ox; // 右端の列の右端
    cols.forEach(function (c) {
      var w = fsA * 1.25, h = c.s.length * fsA;
      var y = c.bottomAlign ? Math.max(top + c.indent, bottom - h) : top + c.indent;
      items.push({ t: "col", x: x - w, y: y, w: w, h: h, fs: fsA, s: c.s, cls: "addr" });
      x -= w;
    });
    x -= 1.5;

    // 会社名・部署（住所の左）
    var nameRight = x;
    if (!rec.companyOnly && (rec.company || rec.dept)) {
      [rec.company, rec.dept].filter(Boolean).forEach(function (s) {
        var v = verticalText(s, st), f = fit(v.length, room - 8, 5.0, 3.2), w = f * 1.3;
        items.push({ t: "col", x: x - w, y: top + 8, w: w, h: v.length * f, fs: f, s: v, cls: "comp" });
        x -= w;
      });
      nameRight = x - 1;
    }

    // 氏名（中央。連名は左へ並べ、名の頭と敬称をそろえる）
    var names = rec.names.slice();
    var ntop = 30 + oy, nbottom = 136 + oy, nroom = nbottom - ntop;
    if (rec.companyOnly) {
      var cv = verticalText(rec.company, st), kv = "御中";
      var fsC = fit(cv.length + 1 + kv.length, nroom, 9.0, 4.0);
      var wc = fsC * 1.3, cxC = Math.min(50 + ox, nameRight - wc / 2);
      items.push({ t: "col", x: cxC - wc / 2, y: ntop, w: wc, h: cv.length * fsC, fs: fsC, s: cv, cls: "name" });
      items.push({ t: "col", x: cxC - wc / 2, y: ntop + (cv.length + 1) * fsC, w: wc, h: kv.length * fsC, fs: fsC, s: kv, cls: "name" });
    } else if (names.length) {
      var V = names.map(function (n) { return { sei: verticalText(n.sei, st), mei: verticalText(n.mei, st), k: n.keisho }; });
      var maxSei = Math.max.apply(null, V.map(function (n) { return n.sei.length; }));
      var maxMei = Math.max.apply(null, V.map(function (n) { return n.mei.length; }));
      var maxK = Math.max.apply(null, V.map(function (n) { return n.k.length; }));
      var units = maxSei + (maxSei ? 1 : 0) + maxMei + 1 + maxK;
      var fsN = fit(units, nroom, 10.0, 4.0);
      var colW = fsN * 1.3, n = V.length;
      // 列の幅が足りなければ文字を小さく
      var leftLimit = (opt.sender && (opt.sender.addr1 || opt.sender.name) ? 40 : 10) + ox;
      var avail = nameRight - leftLimit;
      if (n * colW > avail) { fsN = Math.max(3.5, avail / n / 1.3); colW = fsN * 1.3; }
      if (n > 1 && fsN < 5) warn.push("連名が多いため、文字を小さくしています");
      if (n * colW > avail + 0.01) warn.push("連名が多すぎて、差出人と重なります");
      var cx = 52 + ox + (n - 1) * colW / 2;
      cx = Math.min(cx, nameRight - colW / 2);
      cx = Math.max(cx, leftLimit + (n - 0.5) * colW);
      V.forEach(function (nm, j) {
        var left = cx - colW / 2 - j * colW, y = ntop;
        var meiY = ntop + (maxSei ? (maxSei + 1) * fsN : 0);
        var kY = meiY + (maxMei + 1) * fsN;
        if (nm.sei) items.push({ t: "col", x: left, y: y, w: colW, h: maxSei * fsN, fs: fsN, s: nm.sei, cls: "name", spread: maxSei });
        if (nm.mei) items.push({ t: "col", x: left, y: meiY, w: colW, h: maxMei * fsN, fs: fsN, s: nm.mei, cls: "name", spread: maxMei });
        items.push({ t: "col", x: left, y: kY, w: colW, h: nm.k.length * fsN, fs: fsN, s: nm.k, cls: "name" });
      });
    }

    // 差出人（左下）
    var snd = opt.sender;
    if (snd && (snd.addr1 || snd.name)) {
      var sTop = 74 + oy, sBottom = 132 + oy, sRoom = sBottom - sTop;
      var sx = 38 + ox;
      var s1 = verticalText(snd.addr1, st), s2 = verticalText(snd.addr2, st);
      var fsS = Math.min(fit(s1.length, sRoom, 4.2, 2.6), s2 ? fit(s2.length, sRoom - 4, 4.2, 2.6) : 9);
      [[s1, 0], [s2, 4]].forEach(function (p) {
        if (!p[0]) return;
        var w = fsS * 1.3;
        items.push({ t: "col", x: sx - w, y: sTop + p[1], w: w, h: p[0].length * fsS, fs: fsS, s: p[0], cls: "snd" });
        sx -= w;
      });
      sx -= 1;
      var sn = [snd.name].concat(snd.renmei || []).filter(Boolean).map(function (v) { return verticalText(v, st); });
      var fsSN = fit(Math.max.apply(null, sn.map(function (v) { return v.length; }).concat([1])), sRoom - 14, 5.2, 3.0);
      sn.forEach(function (v, j) {
        var w = fsSN * 1.3;
        // 連名（名だけ）は、主の名の位置にそろえる
        var y = sTop + 14;
        if (j > 0 && sn[0].indexOf("　") > 0 && v.indexOf("　") < 0) y += (sn[0].indexOf("　") + 1) * fsSN;
        items.push({ t: "col", x: sx - w, y: y, w: w, h: v.length * fsSN, fs: fsSN, s: v, cls: "snd" });
        sx -= w;
      });
      var sz = normalizeZip(snd.zip);
      if (sz) items.push({ t: "text", x: 6 + ox, y: 137 + oy, w: 32, h: 5, fs: 3.6, s: "〒" + sz.slice(0, 3) + "-" + sz.slice(3), cls: "sndzip" });
    }
    return { items: items, warn: warn };
  }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, guessColumns: guessColumns, normalizeZip: normalizeZip,
    verticalText: verticalText, splitBuilding: splitBuilding, splitName: splitName, buildRecord: buildRecord,
    layout: layout, breakAddress: breakAddress, CARD: CARD, ZIP_X: ZIP_X, ZIP_Y: ZIP_Y, ZIP_W: ZIP_W, ZIP_H: ZIP_H };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Atena = api;
})(this);
