/* 複数選択の回答の分割と集計 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  // 比べるときの形（全角・半角、空白の違いを無視）
  function key(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    return s.replace(/\s+/g, " ").trim().toLowerCase();
  }
  function clean(s) { return String(s == null ? "" : s).replace(/[\s　]+/g, " ").trim(); }

  // ---------- 区切り ----------
  // auto のときは列の中身から選ぶ。", "（カンマと空白）、";"、"、"、"，"、改行、"/"
  var SEPS = {
    comma: { label: "カンマ（, ）", re: /\s*,\s*/ },
    semi: { label: "セミコロン（;）", re: /\s*[;；]\s*/ },
    touten: { label: "読点（、）", re: /\s*[、，]\s*/ },
    nl: { label: "改行", re: /\s*[\r\n]+\s*/ },
    slash: { label: "スラッシュ（/）", re: /\s*[\/／]\s*/ },
    nakaguro: { label: "中黒（・）", re: /\s*・\s*/ }
  };
  var SEP_TEST = { comma: /,/, semi: /[;；]/, touten: /[、，]/, nl: /[\r\n]/, slash: /[\/／]/, nakaguro: /・/ };

  function guessSep(values) {
    var best = "comma", bestN = 0;
    ["nl", "semi", "comma", "touten", "slash", "nakaguro"].forEach(function (k) {
      var n = 0;
      values.forEach(function (v) { if (SEP_TEST[k].test(String(v).trim())) n++; });
      if (n > bestN) { bestN = n; best = k; }
    });
    return best;
  }

  // known: 選択肢の一覧（中に区切りの文字を含む選択肢を正しく切るため）。長いものから先に探す
  function splitCell(v, sep, known) {
    var s = clean(v).replace(/\r\n?/g, "\n");
    if (!String(v).trim()) return [];
    var found = [];
    if (known && known.length) {
      var ks = known.slice().sort(function (a, b) { return b.length - a.length; });
      var kv = String(v).normalize ? String(v).normalize("NFKC") : String(v);
      ks.forEach(function (o) {
        var ko = o.normalize ? o.normalize("NFKC") : o;
        var at = kv.indexOf(ko);
        while (at >= 0) {
          var before = at === 0 ? "" : kv[at - 1], after = kv[at + ko.length] || "";
          var okB = at === 0 || SEPS[sep].re.test(before) || /\s/.test(before);
          var okA = after === "" || SEPS[sep].re.test(after) || /\s/.test(after);
          if (okB && okA) { found.push({ at: at, o: o }); kv = kv.slice(0, at) + new Array(ko.length + 1).join("\u0000") + kv.slice(at + ko.length); }
          at = kv.indexOf(ko, at + 1);
        }
      });
      s = kv.replace(/\u0000+/g, "\u0000");
      found.sort(function (a, b) { return a.at - b.at; });
      var rest = s.split("\u0000").join(sepChar(sep)).split(SEPS[sep].re).map(clean).filter(Boolean);
      return found.map(function (f) { return f.o; }).concat(rest);
    }
    return String(v).replace(/\r\n?/g, "\n").split(SEPS[sep].re).map(clean).filter(Boolean);
  }
  function sepChar(sep) { return { comma: ",", semi: ";", touten: "、", nl: "\n", slash: "/", nakaguro: "・" }[sep]; }

  // ---------- 列の推定：複数選択らしい列 ----------
  function guessMulti(headers, rows) {
    var out = [];
    headers.forEach(function (h, i) {
      var vals = rows.map(function (r) { return r[i]; }).filter(function (v) { return String(v || "").trim() !== ""; });
      if (vals.length < 2) return;
      var sep = guessSep(vals);
      var numy = vals.filter(function (v) { return /^[\d\s:.\-\/年月日時分秒午前後amp]+$/i.test(String(v).trim()); }).length;
      if (numy / vals.length > 0.5) return; // 日付・時刻・数字の列は除く
      var multi = 0, pieces = 0, uniq = {}, len = 0;
      vals.forEach(function (v) {
        var p = splitCell(v, sep);
        if (p.length > 1) multi++;
        p.forEach(function (x) { pieces++; uniq[key(x)] = 1; len += x.length; });
      });
      var nu = Object.keys(uniq).length;
      if (multi / vals.length >= 0.1 && nu <= Math.max(3, pieces * 0.5) && len / pieces <= 40) out.push({ col: i, sep: sep });
    });
    return out;
  }

  // ---------- 集計 ----------
  // opt: { sep, known:[...], minCount: n（n 人以下の選択肢は「その他」へ。0 なら まとめない）, otherLabel }
  function analyze(rows, col, opt) {
    opt = opt || {};
    var sep = opt.sep || guessSep(rows.map(function (r) { return r[col]; }));
    var known = (opt.known || []).map(clean).filter(Boolean);
    var per = [], cnt = {}, disp = {}, order = [], answered = 0, totalPicks = 0;
    known.forEach(function (o) { var k = key(o); if (!(k in cnt)) { cnt[k] = 0; disp[k] = o; order.push(k); } });
    rows.forEach(function (r) {
      var p = splitCell(r[col], sep, known), seen = {}, list = [];
      p.forEach(function (x) {
        var k = key(x);
        if (!k || seen[k]) return; seen[k] = 1;
        if (!(k in cnt)) { cnt[k] = 0; disp[k] = x; order.push(k); }
        cnt[k]++; list.push(k);
      });
      if (list.length) answered++;
      totalPicks += list.length;
      per.push(list);
    });
    var other = opt.otherLabel || "その他";
    var otherKey = key(other);
    var minC = opt.minCount || 0;
    var knownSet = {}; known.forEach(function (o) { knownSet[key(o)] = 1; });
    var toOther = {};
    if (minC > 0) order.forEach(function (k) { if (!knownSet[k] && k !== otherKey && cnt[k] <= minC) toOther[k] = 1; });
    var nOther = Object.keys(toOther).length;
    if (nOther) {
      if (!(otherKey in cnt)) { cnt[otherKey] = 0; disp[otherKey] = other; order.push(otherKey); }
      per = per.map(function (list) {
        var hit = false, out = [];
        list.forEach(function (k) { if (toOther[k]) hit = true; else out.push(k); });
        if (hit && out.indexOf(otherKey) < 0) { out.push(otherKey); }
        return out;
      });
      order = order.filter(function (k) { return !toOther[k]; });
      order.forEach(function (k) { cnt[k] = 0; });
      per.forEach(function (list) { list.forEach(function (k) { cnt[k]++; }); });
    }
    // 元の文字（その他にまとめた分）
    var otherText = per.map(function (_, i) {
      if (!nOther) return "";
      return splitCell(rows[i][col], sep, known).filter(function (x) { return toOther[key(x)]; }).join(" / ");
    });
    var options = order.map(function (k) { return { key: k, label: disp[k], count: cnt[k], known: !!knownSet[k] }; });
    // 並び：known があればその順＋それ以外は多い順。なければ多い順（同数は最初に出た順）
    var idx = {}; order.forEach(function (k, i) { idx[k] = i; });
    options.sort(function (a, b) {
      if (a.known !== b.known) return a.known ? -1 : 1;
      if (a.known && b.known) return idx[a.key] - idx[b.key];
      if (a.key === otherKey) return 1; if (b.key === otherKey) return -1;
      if (opt.order === "first") return idx[a.key] - idx[b.key];
      if (opt.order === "name") return a.label.localeCompare(b.label, "ja", { numeric: true });
      return b.count - a.count || idx[a.key] - idx[b.key];
    });
    return { sep: sep, per: per, options: options, answered: answered, total: rows.length, totalPicks: totalPicks, otherText: otherText, merged: nOther };
  }

  // グループ別（例：部署・学年ごと）の人数
  function cross(rows, A, groupCol) {
    var gs = [], gi = {}, tbl = {}, n = {};
    rows.forEach(function (r, i) {
      var g = clean(r[groupCol]) || "（空欄）";
      if (!(g in gi)) { gi[g] = gs.length; gs.push(g); n[g] = 0; }
      if (A.per[i].length) n[g]++;
      A.per[i].forEach(function (k) { tbl[k] = tbl[k] || {}; tbl[k][g] = (tbl[k][g] || 0) + 1; });
    });
    return { groups: gs, answered: n, get: function (k, g) { return (tbl[k] && tbl[k][g]) || 0; } };
  }

  // 元の列の右に、選択肢ごとの列を入れた表
  function wideRows(headers, rows, specs, mark, dropOrig) {
    mark = mark == null ? "○" : mark;
    var bycol = {}; specs.forEach(function (s) { bycol[s.col] = s; });
    var head = [];
    headers.forEach(function (h, c) {
      var s = bycol[c];
      if (!s || !dropOrig) head.push(h);
      if (s) { s.A.options.forEach(function (o) { head.push(h + "：" + o.label); }); if (s.A.merged) head.push(h + "：その他の内容"); }
    });
    var out = [head];
    rows.forEach(function (r, i) {
      var row = [];
      r.forEach(function (v, c) {
        var s = bycol[c];
        if (!s || !dropOrig) row.push(v);
        if (s) {
          var have = {}; s.A.per[i].forEach(function (k) { have[k] = 1; });
          s.A.options.forEach(function (o) { row.push(have[o.key] ? mark : (mark === "1" ? "0" : "")); });
          if (s.A.merged) row.push(s.A.otherText[i]);
        }
      });
      out.push(row);
    });
    return out;
  }

  // 1行1選択の縦長の表（ピボットテーブル用）
  function longRows(headers, rows, spec, keepCols) {
    var out = [keepCols.map(function (c) { return headers[c]; }).concat(["元の行", headers[spec.col] + "（選択肢）"])];
    var lab = {}; spec.A.options.forEach(function (o) { lab[o.key] = o.label; });
    rows.forEach(function (r, i) {
      spec.A.per[i].forEach(function (k) { out.push(keepCols.map(function (c) { return r[c]; }).concat([String(i), lab[k]])); });
    });
    return out;
  }

  function pct(a, b) { return b ? (Math.round(a / b * 1000) / 10).toFixed(1) + "%" : "-"; }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, key: key, clean: clean, SEPS: SEPS, guessSep: guessSep, splitCell: splitCell, guessMulti: guessMulti, analyze: analyze, cross: cross, wideRows: wideRows, longRows: longRows, pct: pct, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SENTAKU = api;
})(this);
