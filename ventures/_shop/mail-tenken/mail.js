/* メールアドレス一覧の点検 — 計算部分。ブラウザ内だけで動き、外部へ送信しない（存在の確認の通信もしない） */
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

  // ---------- よく使われるドメイン（打ち間違いの候補を出すためだけに使う） ----------
  var KNOWN = [
    "gmail.com", "googlemail.com", "yahoo.co.jp", "ymail.ne.jp", "yahoo.com", "icloud.com", "me.com", "mac.com",
    "outlook.com", "outlook.jp", "hotmail.com", "hotmail.co.jp", "live.jp", "live.com", "msn.com", "aol.com",
    "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "disney.ne.jp", "ybb.ne.jp",
    "nifty.com", "biglobe.ne.jp", "so-net.ne.jp", "ocn.ne.jp", "excite.co.jp", "plala.or.jp", "zoho.com",
    "proton.me", "protonmail.com", "rakuten.jp", "jcom.zaq.ne.jp", "dion.ne.jp", "infoseek.jp"
  ];
  var KNOWN_SET = {}; KNOWN.forEach(function (d) { KNOWN_SET[d] = 1; });
  // そのまま正しい形だが、届かないもの・注意が要るもの
  var EXAMPLE = /(^|\.)(example\.(com|net|org|jp|co\.jp|ne\.jp)|example|invalid|localhost|test)$/;

  function dl(a, b, max) { // Damerau-Levenshtein（隣り合う入れ替えも1回）。max を超えたら打ち切り
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  // ドメインの打ち間違いの案（なければ ""）
  function suggestDomain(dom) {
    if (KNOWN_SET[dom]) return "";
    var m, d2 = "";
    if ((m = dom.match(/^(.*)\.(co|ne|or|ac|go|ed)\.(jo|pj|op|kp|j|p|jpp|jj)$/))) d2 = m[1] + "." + m[2] + ".jp";
    else if ((m = dom.match(/^(.*)\.(con|cmo|ocm|comm|coom|cpm|xom|vom)$/))) d2 = m[1] + ".com";
    else if ((m = dom.match(/^(.*)\.(jo|pj|jpp)$/))) d2 = m[1] + ".jp";
    else if (/^(gmail|googlemail)\.(co\.jp|jp|ne\.jp|co|cm|om)$/.test(dom)) return "gmail.com";
    else if (/^(icloud|outlook|hotmail)\.(co|cm|om)$/.test(dom)) return dom.split(".")[0] + ".com";
    else if (/^yahoo\.(jp|ne\.jp|com\.jp)$/.test(dom)) return "yahoo.co.jp";
    else if (/^(docomo|ezweb|softbank)\.(co\.jp|jp|or\.jp)$/.test(dom)) return dom.split(".")[0] + ".ne.jp";
    if (d2) return KNOWN_SET[d2] ? d2 : (near(d2) || d2);
    return near(dom);
  }
  // よく使われるドメインに近いもの（1文字違い・抜け・余分・入れ替え。12文字以上のドメインは2文字まで）。
  // 短いドメイン（8文字以下）は実在の別の会社のドメインと紛らわしいので、近さでは推測しない
  function near(dom) {
    var best = "", bestD = 99;
    if (dom.length < 7) return "";
    KNOWN.forEach(function (k) {
      if (k.length < 9) return;
      var max = k.length >= 12 ? 2 : 1;
      var x = dl(dom, k, max);
      if (x <= max && x < bestD) { bestD = x; best = k; }
    });
    return best;
  }

  var LOCAL_OK = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~.\-]+$/;
  var LABEL_OK = /^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/;

  // 1件を調べる
  // status: ok（正しい形）/ fixed（書き方を整えたら正しい形）/ typo（打ち間違いの疑い）/ warn（形は通るが注意）/
  //         bad（形が違う）/ multi（1つの欄に2件以上）/ blank
  function inspect(v) {
    var raw = String(v == null ? "" : v);
    var s = norm(raw);
    if (!s) return { status: "blank", label: "空欄", msg: "" };
    var fixes = [];
    if (/[＠．Ａ-Ｚａ-ｚ０-９　]/.test(raw)) fixes.push("全角を半角に");
    if (raw !== raw.trim()) fixes.push("前後の空白を取った");
    // 「名前 <addr>」「mailto:」「"…"」、前後の句読点
    var m = s.match(/^(.*)<\s*([^<>]+?)\s*>\s*$/);
    if (m && m[2].indexOf("@") >= 0) { s = m[2]; fixes.push("名前と < > を外した"); }
    if (/^mailto:/i.test(s)) { s = s.replace(/^mailto:/i, "").replace(/\?.*$/, ""); fixes.push("mailto: を外した"); }
    var t = s.replace(/^["'「『(（\[]+|["'」』)）\]。、,;:．.]+$/g, "");
    if (t !== s) { s = t; fixes.push("前後の記号を外した"); }
    // 2件以上が1つの欄に
    var atCount = (s.match(/@/g) || []).length;
    if (atCount >= 2) {
      var parts = s.split(/[\s,;、，／\/]+/).filter(Boolean);
      if (parts.length >= 2 && parts.every(function (p) { return (p.match(/@/g) || []).length === 1; }))
        return { status: "multi", label: "2件以上入っている", msg: parts.length + " 件のアドレスが1つの欄に入っています。1件ずつに分けてください", parts: parts };
    }
    // 空白
    if (/\s/.test(s)) { s = s.replace(/\s+/g, ""); fixes.push("空白を取った"); }
    if (atCount === 0) {
      var g = s.replace(/\(at\)|\[at\]|<at>|\{at\}|（at）|\(あっと\)|あっと|アットマーク|アット/i, "@");
      if (g !== s && (g.match(/@/g) || []).length === 1) {
        var r0 = inspect(g);
        return { status: "bad", label: "@ がない", msg: "(at) などを @ に直すと" + (r0.status === "ok" || r0.status === "fixed" ? "、正しい形になります" : "して調べた結果：" + r0.label + (r0.msg ? "（" + r0.msg + "）" : "")), guess: r0.fixed || r0.guess || g, fixes: fixes };
      }
      return { status: "bad", label: "@ がない", msg: "", fixes: fixes };
    }
    if (atCount >= 2) return { status: "bad", label: "@ が2つ以上", msg: "", fixes: fixes };
    var at = s.indexOf("@"), local = s.slice(0, at), dom = s.slice(at + 1);
    var domLow = dom.toLowerCase().replace(/\.+$/, "");
    if (domLow !== dom) { if (dom.replace(/\.+$/, "") !== dom) fixes.push("末尾の . を取った"); if (dom.toLowerCase() !== dom) fixes.push("@ の後ろを小文字に"); }
    dom = domLow;
    var fixedAddr = local + "@" + dom;
    var base = { fixed: fixedAddr, local: local, domain: dom, fixes: fixes, key: (local + "@" + dom).toLowerCase() };
    function out(status, label, msg, extra) { var o = Object.assign({}, base, { status: status, label: label, msg: msg || "" }, extra || {}); return o; }
    if (!local) return out("bad", "@ の前がない", "", { key: "" });
    if (!dom) return out("bad", "@ の後ろがない", "", { key: "" });
    if (/[^\x21-\x7e]/.test(local) || /[^\x21-\x7e]/.test(dom)) return out("bad", "使えない文字", "日本語・全角の記号などが入っています", { key: "" });
    if (!LOCAL_OK.test(local)) return out("bad", "@ の前に使えない記号", "使えない記号：" + uniq(local.replace(/[A-Za-z0-9!#$%&'*+\/=?^_`{|}~.\-]/g, "")).join(" "), { key: "" });
    // ドメインの形
    var sug = suggestDomain(dom);
    if (dom.indexOf(".") < 0) {
      return out(sug ? "typo" : "bad", "@ の後ろに . がない", sug ? "「" + sug + "」の打ち間違いではありませんか" : "", sug ? { guess: local + "@" + sug } : { key: "" });
    }
    var labels = dom.split(".");
    if (dom.indexOf("..") >= 0 || labels.some(function (l) { return !LABEL_OK.test(l); }))
      return out(sug ? "typo" : "bad", "@ の後ろの形が違う", (sug ? "「" + sug + "」の打ち間違いではありませんか。" : "") + "使えるのは英数字・ハイフン・ドットです（ドットの連続・ハイフンで始まる/終わるのは不可）", sug ? { guess: local + "@" + sug } : { key: "" });
    var tld = labels[labels.length - 1];
    if (!/^[a-z]{2,}$/.test(tld) && !/^xn--[a-z0-9\-]+$/.test(tld))
      return out(sug ? "typo" : "bad", "末尾（.com・.jp など）の形が違う", sug ? "「" + sug + "」の打ち間違いではありませんか" : "", sug ? { guess: local + "@" + sug } : { key: "" });
    if (s.length > 254 || local.length > 64) return out("bad", "長すぎる", "全体は254文字、@ の前は64文字まで", { key: "" });
    if (sug) return out("typo", "打ち間違いの疑い", "「" + sug + "」ではありませんか", { guess: local + "@" + sug });
    // 形は通るが注意
    var notes = [];
    if (EXAMPLE.test(dom)) notes.push("説明用・テスト用のドメインです（実際には届きません）");
    if (/^\.|\.$|\.\./.test(local)) notes.push("@ の前でドットが続く・ドットで始まる/終わる形です。古い携帯電話のアドレスにある形で、受け付けないサービスや送信ソフトがあります");
    if (notes.length) return out("warn", "注意", notes.join("。"));
    return out(fixes.length ? "fixed" : "ok", fixes.length ? "正しい（書き方を整えた）" : "正しい", fixes.join("・"));
  }
  function uniq(s) { var o = {}, a = []; String(s).split("").forEach(function (c) { if (!o[c]) { o[c] = 1; a.push(c); } }); return a; }

  // 表全体を調べる。rows：二次元配列（見出しを除く）、col：列番号
  function run(rows, col) {
    var res = rows.map(function (r, i) { var x = inspect(r[col]); x.i = i; x.raw = r[col] == null ? "" : String(r[col]); return x; });
    var groups = {}, dups = [];
    res.forEach(function (x) {
      var k = x.status === "typo" && x.guess ? x.guess.toLowerCase() : x.key; // 直した案どうしも同じアドレスとして数える
      if (k) (groups[k] = groups[k] || []).push(x);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length > 1) { dups.push({ key: k, list: g }); g.forEach(function (x, j) { x.dup = g; x.dupFirst = j === 0; }); }
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
      if (/mail|メール|ﾒｰﾙ|アドレス|e-mail/.test(n)) score = 2;
      var ok = 0, all = 0;
      rows.slice(0, 50).forEach(function (r) { var v = norm(r[i]); if (!v) return; all++; if (/@|\(at\)|\[at\]/i.test(v)) ok++; });
      if (all) score += 3 * ok / all;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore >= 1 ? best : null;
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, inspect: inspect, run: run, suggestDomain: suggestDomain, guessColumn: guessColumn, toCSV: toCSV, KNOWN: KNOWN, dl: dl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MAILT = api;
})(this);
