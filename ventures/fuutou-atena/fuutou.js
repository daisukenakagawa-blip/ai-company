/* 封筒の宛名印刷 — 計算部分。ブラウザ内だけで動き、外部へ送信しない（読み込み・整形は atena-hagaki と共通） */
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
    if (style === "kanji") h = h.replace(/(^|[^0-9])([0-9]{1,2})(?=(丁目|番町|番地|番|号(?!室)|条|線|地割|階))/g, function (m, pre, num) { return pre + juu(+num); });
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


  // ---------- 封筒の大きさと郵便番号枠（単位 mm） ----------
  var ENV = {
    naga3: { w: 120, h: 235, name: "長形3号（120×235mm）", frame: "jis" },
    naga4: { w: 90, h: 205, name: "長形4号（90×205mm）", frame: "jis" },
    kaku2: { w: 240, h: 332, name: "角形2号（240×332mm）", frame: "none" }
  };
  // 郵便番号枠：定形郵便物は上端から12mm・右端から8mm（日本郵便「郵便番号・バーコードマニュアル」、JIS）。
  // 枠の大きさと間隔は、はがき（atena-hagaki）と同じ 5.7×8.0mm・全幅47.7mm。右端からの距離で持つ
  var ZIP_R = [56.0, 49.0, 42.0, 34.4, 27.6, 20.8, 14.0], ZIP_W = 5.7, ZIP_H = 8.0;
  // 「r18」は日本郵便の推薦様式（上端・右端から18mm）
  function zipBoxes(env, frame) {
    if (frame === "none") return [];
    var top = frame === "r18" ? 18 : 12, shift = frame === "r18" ? 10 : 0;
    return ZIP_R.map(function (r) { return { x: env.w - r - shift, y: top, w: ZIP_W, h: ZIP_H }; });
  }
  function envOf(o) { var e = ENV[o && o.env] || ENV.naga3; return e; }
  function frameOf(o) { var e = envOf(o); return o && o.frame && o.frame !== "auto" ? o.frame : e.frame; }

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

  // 表面（宛名）の部品
  function layout(rec, opt) {
    opt = opt || {};
    var E = envOf(opt), W = E.w, H = E.h, frame = frameOf(opt);
    var st = opt.numStyle === "zen" ? "zen" : "kanji";
    var items = [], warn = [];
    var ox = +opt.offsetX || 0, oy = +opt.offsetY || 0;
    // 郵便番号
    var zb = zipBoxes(E, frame), zipBottom;
    if (zb.length) {
      if (rec.zip) zb.forEach(function (b, i) { items.push({ t: "zip", x: b.x + ox, y: b.y + oy, w: b.w, h: b.h, s: rec.zip[i] }); });
      zipBottom = zb[0].y + ZIP_H;
    } else {
      var zf = Math.min(W * 0.05, 7);
      if (rec.zip) items.push({ t: "text", x: W - 12 - zf * 5.2 + ox, y: 14 + oy, w: zf * 5.2, h: zf * 1.2, fs: zf, s: "〒" + rec.zip.slice(0, 3) + "-" + rec.zip.slice(3), cls: "zipt" });
      zipBottom = 14 + zf * 1.2;
    }

    // 住所（右端の列から）
    var top = zipBottom + 10 + oy, bottom = H * 0.72 + oy, room = bottom - top;
    var baseA = Math.min(W * 0.065, 9), minA = Math.min(4, baseA);
    var a1 = verticalText(rec.addr1, st), a2 = verticalText(rec.addr2, st);
    var cols = [];
    if (a1.length * baseA * 0.8 > room) breakAddress(a1, Math.floor(room / (baseA * 0.75))).forEach(function (p, k) { cols.push({ s: p, indent: k ? baseA * 0.5 : 0 }); });
    else cols.push({ s: a1, indent: 0 });
    if (a2) cols.push({ s: a2, indent: baseA * 1.6, bottomAlign: true });
    var fsA = baseA;
    cols.forEach(function (c) { fsA = Math.min(fsA, fit(c.s.length, room - c.indent, baseA, minA * 0.8)); });
    if (fsA < baseA * 0.6) warn.push("住所が長いため、文字を小さくしています");
    var x = W - (W >= 200 ? 20 : 10) + ox;
    cols.forEach(function (c) {
      var w = fsA * 1.25, h = c.s.length * fsA;
      var y = c.bottomAlign ? Math.max(top + c.indent, bottom - h) : top + c.indent;
      items.push({ t: "col", x: x - w, y: y, w: w, h: h, fs: fsA, s: c.s, cls: "addr" });
      x -= w;
    });
    x -= fsA * 0.3;

    // 会社名・部署（住所の左）
    var nameRight = x;
    if (!rec.companyOnly && (rec.company || rec.dept)) {
      [rec.company, rec.dept].filter(Boolean).forEach(function (s) {
        var v = verticalText(s, st), f = fit(v.length, room - baseA, baseA * 0.9, minA * 0.8), w = f * 1.3;
        items.push({ t: "col", x: x - w, y: top + baseA * 1.4, w: w, h: v.length * f, fs: f, s: v, cls: "comp" });
        x -= w;
      });
      nameRight = x - 1;
    }

    // 「請求書在中」などの表示（左下、朱色の枠）
    var leftLimit = 10 + ox, stamp = clean(opt.stamp);
    if (stamp) {
      var sv = verticalText(stamp, "zen"), sf = Math.min(W * 0.055, 9), sw = sf * 1.5, sh = sv.length * sf + sf * 0.8;
      var sx = (W >= 200 ? 20 : 10) + ox, sy = H - 18 - sh + oy;
      items.push({ t: "stamp", x: sx, y: sy, w: sw, h: sh, fs: sf, s: sv });
      leftLimit = sx + sw + 3;
    }

    // 氏名（中央。連名は左へ並べ、名の頭と敬称をそろえる）
    var ntop = top + baseA * 1.4, nbottom = H - 22 + oy, nroom = nbottom - ntop;
    var baseN = Math.min(W * 0.14, 24), minN = Math.min(5, baseN * 0.5);
    if (rec.companyOnly) {
      var cv = verticalText(rec.company, st), kv = "御中";
      var fsC = fit(cv.length + 1 + kv.length, nroom, baseN, minN);
      var wc = fsC * 1.3, cxC = Math.min(W / 2 + ox, nameRight - wc / 2);
      items.push({ t: "col", x: cxC - wc / 2, y: ntop, w: wc, h: cv.length * fsC, fs: fsC, s: cv, cls: "name" });
      items.push({ t: "col", x: cxC - wc / 2, y: ntop + (cv.length + 1) * fsC, w: wc, h: kv.length * fsC, fs: fsC, s: kv, cls: "name" });
    } else if (rec.names.length) {
      var V = rec.names.map(function (n) { return { sei: verticalText(n.sei, st), mei: verticalText(n.mei, st), k: n.keisho }; });
      var maxSei = Math.max.apply(null, V.map(function (n) { return n.sei.length; }));
      var maxMei = Math.max.apply(null, V.map(function (n) { return n.mei.length; }));
      var maxK = Math.max.apply(null, V.map(function (n) { return n.k.length; }));
      var units = maxSei + (maxSei ? 1 : 0) + maxMei + 1 + maxK;
      var fsN = fit(units, nroom, baseN, minN), colW = fsN * 1.3, n = V.length;
      var avail = nameRight - leftLimit;
      if (n * colW > avail) { fsN = Math.max(3.5, avail / n / 1.3); colW = fsN * 1.3; }
      if (n > 1 && fsN < baseN * 0.5) warn.push("連名が多いため、文字を小さくしています");
      if (n * colW > avail + 0.01) warn.push("連名が多すぎて、在中の表示と重なります");
      var cx = W / 2 + ox + (n - 1) * colW / 2;
      cx = Math.min(cx, nameRight - colW / 2);
      cx = Math.max(cx, leftLimit + (n - 0.5) * colW);
      V.forEach(function (nm, j) {
        var left = cx - colW / 2 - j * colW;
        var meiY = ntop + (maxSei ? (maxSei + 1) * fsN : 0), kY = meiY + (maxMei + 1) * fsN;
        if (nm.sei) items.push({ t: "col", x: left, y: ntop, w: colW, h: maxSei * fsN, fs: fsN, s: nm.sei, cls: "name", spread: maxSei });
        if (nm.mei) items.push({ t: "col", x: left, y: meiY, w: colW, h: maxMei * fsN, fs: fsN, s: nm.mei, cls: "name", spread: maxMei });
        items.push({ t: "col", x: left, y: kY, w: colW, h: nm.k.length * fsN, fs: fsN, s: nm.k, cls: "name" });
      });
    }
    return { items: items, warn: warn, w: W, h: H, boxes: zb };
  }

  // 裏面（差出人）の部品：封筒の中央より左、下半分に縦書き。郵便番号は下に横書き
  function layoutBack(snd, opt) {
    opt = opt || {};
    var E = envOf(opt), W = E.w, H = E.h, st = opt.numStyle === "zen" ? "zen" : "kanji";
    var ox = +opt.offsetX || 0, oy = +opt.offsetY || 0, items = [], warn = [];
    if (!snd) return { items: items, warn: warn, w: W, h: H };
    var top = H * 0.5 + oy, zf = Math.min(W * 0.045, 6), bottom = H - 20 - zf * 1.6 + oy, room = bottom - top;
    var base = Math.min(W * 0.05, 7), x = W / 2 - 3 + ox;
    var lines = [[snd.addr1, 0, "snd"], [snd.addr2, base * 1.5, "snd"], [snd.company, base * 2, "snd"], [snd.dept, base * 2, "snd"]]
      .filter(function (l) { return clean(l[0]); }).map(function (l) { return [verticalText(l[0], st), l[1], l[2]]; });
    var f = base;
    lines.forEach(function (l) { f = Math.min(f, fit(l[0].length, room - l[1], base, base * 0.5)); });
    lines.forEach(function (l) {
      var w = f * 1.3;
      items.push({ t: "col", x: x - w, y: top + l[1], w: w, h: l[0].length * f, fs: f, s: l[0], cls: "snd" });
      x -= w;
    });
    x -= f * 0.4;
    var nv = verticalText(snd.name, st);
    if (nv) {
      var fn = fit(nv.length, room - base * 3, base * 1.35, base * 0.6), wn = fn * 1.3;
      items.push({ t: "col", x: x - wn, y: top + base * 3, w: wn, h: nv.length * fn, fs: fn, s: nv, cls: "sndname" });
      x -= wn;
    }
    if (x < 8) warn.push("差出人の文字が多いため、左端に近づいています");
    var sz = normalizeZip(snd.zip);
    if (sz) items.push({ t: "text", x: Math.max(8, x) + ox * 0, y: H - 20 - zf * 1.2 + oy, w: zf * 5.2, h: zf * 1.2, fs: zf, s: "〒" + sz.slice(0, 3) + "-" + sz.slice(3), cls: "sndzip" });
    return { items: items, warn: warn, w: W, h: H };
  }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, guessColumns: guessColumns, normalizeZip: normalizeZip,
    verticalText: verticalText, splitBuilding: splitBuilding, splitName: splitName, buildRecord: buildRecord,
    layout: layout, layoutBack: layoutBack, breakAddress: breakAddress, zipBoxes: zipBoxes, ENV: ENV, ZIP_W: ZIP_W, ZIP_H: ZIP_H, envOf: envOf, frameOf: frameOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Fuutou = api;
})(this);
