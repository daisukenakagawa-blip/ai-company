/* 送付状の一括作成 — 計算部分。ブラウザ内だけで動き、外部へ送信しない（読み込みは atena-hagaki・fuutou-atena と共通） */
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
    ["zip", /^(〒|郵便番号|郵便|zip|postal)/i],
    ["pref", /^(都道府県|県)$/],
    ["city", /^(市区町村|市区郡|市町村)/],
    ["addr1", /^(住所1|住所１|住所|所在地|address1?|番地)/i],
    ["addr2", /^(住所2|住所２|建物|建物名|ビル|address2)/i],
    ["company", /^(会社|会社名|取引先|取引先名|得意先|顧客名|勤務先|法人名|団体名|社名|宛先|company)/i],
    ["dept", /^(部署|部署名|所属|部課|department)/i],
    ["position", /^(役職|肩書)/],
    ["sei", /^(姓|苗字|名字|last ?name)$/i],
    ["mei", /^(名|first ?name)$/i],
    ["name", /^(氏名|担当者|担当者名|ご担当者|名前|お名前|宛名|name)$/i],
    ["keisho", /^(敬称)/],
    ["docs", /^(同封書類|同封物|送付書類|書類|内容|同封)/],
    ["note", /^(備考|メモ|追記|連絡事項|通信欄)/],
    ["print", /^(印刷|送付する|送る|対象|郵送)/]
  ];
  function normHead(h) { return String(h || "").replace(/[\s　]/g, "").replace(/[（(].*?[)）]/g, ""); }
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

  // ---------- 文字の整形 ----------
  function toHalf(s) {
    return String(s == null ? "" : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }).replace(/　/g, " ");
  }
  function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/[ 　]+/g, " ").trim(); }
  function zip7(s) { var d = toHalf(s).replace(/[^0-9]/g, ""); return d.length === 7 ? d.slice(0, 3) + "-" + d.slice(3) : clean(s); }
  function cell(row, i) { return i == null || i < 0 || i === "" ? "" : clean(row[i]); }
  function stripKeisho(s) { return clean(s).replace(/[ ]?(様|殿|さま|御中|先生|各位)$/, "").trim(); }

  // 同封書類：「請求書 1部、納品書 2部」「請求書/納品書」などを1件ずつに分ける
  function parseDocs(s) {
    return String(s == null ? "" : s).split(/[\r\n、，,／\/・;；]+/).map(function (x) { return clean(x); }).filter(Boolean).map(function (x) {
      var m = toHalf(x).match(/^(.*?)[ ]*(?:[x×*＊]?[ ]*([0-9]+)[ ]*(部|枚|通|冊|点|式|部ずつ)?)$/);
      if (m && m[1] && m[2] && m[3]) return { name: clean(x.slice(0, m[1].length)) || m[1], qty: m[2] + m[3] };
      if (m && m[1] && m[2] && /[x×*＊]/.test(toHalf(x))) return { name: m[1].replace(/[ x×*＊]+$/, ""), qty: m[2] + "部" };
      return { name: x, qty: "" };
    });
  }

  // ---------- 1件分の宛先 ----------
  function buildRecord(row, map, headers, opt) {
    opt = opt || {};
    var r = { warn: [], cols: {} };
    (headers || []).forEach(function (h, i) { r.cols[normHead(h)] = cell(row, i); });
    r.company = cell(row, map.company);
    r.dept = cell(row, map.dept);
    r.position = cell(row, map.position);
    var nm = (map.sei != null && map.sei !== "") || (map.mei != null && map.mei !== "")
      ? [stripKeisho(cell(row, map.sei)), stripKeisho(cell(row, map.mei))].filter(Boolean).join(" ")
      : stripKeisho(cell(row, map.name));
    r.name = nm;
    var k = cell(row, map.keisho) || opt.keisho || "様";
    if (r.name) { r.keisho = k === "御中" ? "様" : k; r.orgKeisho = ""; }
    else { r.keisho = ""; r.orgKeisho = (r.company || r.dept) ? (k === "各位" ? "各位" : "御中") : ""; }
    r.zip = cell(row, map.zip) ? zip7(cell(row, map.zip)) : "";
    r.addr1 = [cell(row, map.pref), cell(row, map.city), cell(row, map.addr1)].filter(Boolean).join("");
    r.addr2 = cell(row, map.addr2);
    r.docs = parseDocs(map.docs != null && map.docs !== "" ? row[map.docs] : "");
    r.note = cell(row, map.note);
    if (map.print != null && map.print !== "") {
      var pv = toHalf(cell(row, map.print));
      r.skip = /^(0|×|x|無|なし|不要|no|false|しない|送らない|メール)$/i.test(pv);
    }
    if (!r.name && !r.company && !r.dept) r.warn.push("宛先（会社名・氏名）がありません");
    return r;
  }

  // 宛先の行（会社名／部署／役職 氏名 様）
  function addresseeLines(r) {
    var L = [];
    if (r.name) {
      if (r.company) L.push(r.company);
      if (r.dept) L.push(r.dept);
      L.push((r.position ? r.position + " " : "") + r.name + " " + r.keisho);
    } else {
      if (r.company && r.dept) { L.push(r.company); L.push(r.dept + " " + r.orgKeisho); }
      else if (r.company || r.dept) L.push((r.company || r.dept) + " " + r.orgKeisho);
    }
    return L;
  }

  // ---------- 日付 ----------
  function formatDate(iso, style) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var y = +m[1], mo = +m[2], d = +m[3];
    if (style === "wareki") {
      // 令和は 2019年5月1日から
      var n = y * 10000 + mo * 100 + d;
      if (n >= 20190501) { var ry = y - 2018; return "令和" + (ry === 1 ? "元" : ry) + "年" + mo + "月" + d + "日"; }
      if (n >= 19890108) { var hy = y - 1988; return "平成" + (hy === 1 ? "元" : hy) + "年" + mo + "月" + d + "日"; }
      return y + "年" + mo + "月" + d + "日";
    }
    if (style === "slash") return y + "/" + (mo < 10 ? "0" : "") + mo + "/" + (d < 10 ? "0" : "") + d;
    return y + "年" + mo + "月" + d + "日";
  }

  // ---------- 時候の挨拶（ビジネス文書でよく使われる表現） ----------
  var JIKOU = {
    1: ["新春", "厳寒", "寒冷"], 2: ["立春", "余寒", "春寒"], 3: ["早春", "浅春", "春暖"], 4: ["陽春", "春暖", "桜花"],
    5: ["新緑", "薫風", "若葉"], 6: ["初夏", "入梅", "梅雨"], 7: ["盛夏", "猛暑", "炎暑"], 8: ["残暑", "晩夏", "立秋"],
    9: ["初秋", "新秋", "秋涼"], 10: ["秋冷", "錦秋", "仲秋"], 11: ["晩秋", "向寒", "霜秋"], 12: ["師走", "初冬", "歳末"]
  };
  function monthOf(iso) { var m = String(iso || "").match(/^\d{4}-(\d{2})/); return m ? +m[1] : 0; }

  // 本文の前文（頭語と挨拶）
  function opening(r, o) {
    var who = r.company ? "貴社" : "";
    var wish = r.company ? "ますますご清栄のこととお慶び申し上げます。" : (r.name ? "ますますご清祥のこととお慶び申し上げます。" : "ますますご清栄のこととお慶び申し上げます。");
    if (o.style === "simple") return "";
    var season;
    if (o.season === "jika" || !o.season) season = "時下" + who + wish;
    else season = o.season + "の候、" + who + wish;
    return "拝啓　" + season + "平素は格別のお引き立てを賜り、厚く御礼申し上げます。";
  }

  // {会社名}{氏名}{部署}{役職} と、任意の列の見出し {列名} を差し込む
  function fill(tpl, r) {
    var base = { "会社名": r.company, "部署": r.dept, "役職": r.position, "氏名": r.name, "敬称": r.keisho || r.orgKeisho, "宛名": addresseeLines(r).join(" ") };
    var missing = [];
    var out = String(tpl || "").replace(/[{｛]([^{}｛｝]{1,20})[}｝]/g, function (m0, key) {
      var k = normHead(key);
      var v = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : (Object.prototype.hasOwnProperty.call(r.cols, k) ? r.cols[k] : null);
      if (v == null) { missing.push(key); return m0; }
      if (v === "") missing.push(key);
      return v;
    });
    return { text: out, missing: missing };
  }

  // 1通分の中身（画面・印刷の両方で使う）
  function letter(r, o) {
    var docs = [];
    if (o.docsMode !== "row" || !r.docs.length) docs = parseDocs(o.docs);
    if (o.docsMode === "append" || o.docsMode === "row") docs = (o.docsMode === "row" && r.docs.length) ? r.docs : docs.concat(r.docs);
    var warn = r.warn.slice();
    var b = fill(o.body, r);
    if (b.missing.length) warn.push("本文の差し込み「" + b.missing.join("」「") + "」が空欄か、見つかりません");
    if (!docs.length) warn.push("同封書類がありません");
    var addr = [];
    if (o.showAddr && (r.zip || r.addr1)) { if (r.zip) addr.push("〒" + r.zip); if (r.addr1) addr.push(r.addr1); if (r.addr2) addr.push(r.addr2); }
    return {
      date: formatDate(o.date, o.dateStyle),
      no: o.numbered ? (o.noPrefix || "") + (o.index + 1) : "",
      addr: addr,
      to: addresseeLines(r),
      sender: (o.sender || []).filter(function (s) { return clean(s); }),
      title: o.title || "送付状",
      opening: opening(r, o),
      body: b.text,
      closing: o.style === "simple" ? "" : "敬具",
      docs: docs,
      note: [clean(o.note), r.note].filter(Boolean).join("\n"),
      warn: warn
    };
  }

  var API = { decodeBytes: decodeBytes, parseCSV: parseCSV, guessColumns: guessColumns, buildRecord: buildRecord, addresseeLines: addresseeLines,
    parseDocs: parseDocs, formatDate: formatDate, JIKOU: JIKOU, monthOf: monthOf, opening: opening, fill: fill, letter: letter, normHead: normHead, clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Soufu = API;
})(this);
