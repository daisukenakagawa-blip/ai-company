/* 段階評価のアンケート集計 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
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

  function clean(s) { return String(s == null ? "" : s).replace(/[\s　]+/g, " ").trim(); }

  // 比べるときの形。全角半角・空白・句点、漢字とかなの書き分け、程度の言葉（大変・非常に→とても、少し・まあ・あまり→やや）をそろえる
  function norm(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    s = s.toLowerCase().replace(/[\s]+/g, "").replace(/[。.!！?？]+$/, "");
    s = s.replace(/分か|解り|判り/g, function (m) { return m === "分か" ? "わか" : "わかり"; }).replace(/良/g, "よ").replace(/悪/g, "わる").replace(/思/g, "おも")
      .replace(/全く|全然|ぜんぜん/g, "まったく")
      .replace(/^(大変|たいへん|非常に|ひじょうに|とっても|すごく|かなり|とても)/, "とても")
      .replace(/^(どちらかといえば|どちらかと言えば|どちらかというと|どちらかと言うと|まあまあ|まあ|少し|すこし|やや|あまり)/, "やや")
      .replace(/^まったく/, "とても");
    if (/^(どちらともいえない|どちらとも言えない|どちらともいえず|どちらでもない|ふつう|普通|中立|どちらとも|どちらともいえません)$/.test(s)) s = "ふつう";
    s = s.replace(/(している|です|でした)$/, "");
    return s;
  }

  // ---------- 段階の型 ----------
  // 言葉の組（良い側 p・悪い側 n）と、程度の付け方の型（高い順）
  var FAMILIES = [
    { p: "満足", n: "不満", nw: "やや不満", ns: "とても不満" },
    { p: "そう思う", n: "そう思わない", nw: "あまりそう思わない", ns: "まったくそう思わない" },
    { p: "良い", n: "悪い", nw: "やや悪い", ns: "とても悪い" },
    { p: "良かった", n: "悪かった", nw: "やや悪かった", ns: "とても悪かった" },
    { p: "良かった", n: "良くなかった", nw: "あまり良くなかった", ns: "まったく良くなかった" },
    { p: "役に立った", n: "役に立たなかった", nw: "あまり役に立たなかった", ns: "まったく役に立たなかった" },
    { p: "参考になった", n: "参考にならなかった", nw: "あまり参考にならなかった", ns: "まったく参考にならなかった" },
    { p: "分かりやすかった", n: "分かりにくかった", nw: "やや分かりにくかった", ns: "とても分かりにくかった" },
    { p: "分かりやすい", n: "分かりにくい", nw: "やや分かりにくい", ns: "とても分かりにくい" },
    { p: "理解できた", n: "理解できなかった", nw: "あまり理解できなかった", ns: "まったく理解できなかった" },
    { p: "あてはまる", n: "あてはまらない", nw: "あまりあてはまらない", ns: "まったくあてはまらない" },
    { p: "当てはまる", n: "当てはまらない", nw: "あまり当てはまらない", ns: "まったく当てはまらない" },
    { p: "おすすめしたい", n: "おすすめしない", nw: "あまりおすすめしない", ns: "まったくおすすめしない" },
    { p: "参加したい", n: "参加したくない", nw: "あまり参加したくない", ns: "まったく参加したくない" }
  ];
  var MID = "どちらともいえない";
  function templates(f) {
    var sp = "とても" + f.p, wp = (f.p === "そう思う" ? "ややそう思う" : "やや" + f.p);
    return [
      [sp, f.p, MID, f.n, f.ns],
      [f.p, wp, MID, f.nw, f.n],
      [f.p, wp, f.nw, f.n],
      [sp, f.p, f.n, f.ns],
      [f.p, MID, f.n],
      [sp, f.p, wp, MID, f.nw, f.n, f.ns]
    ];
  }
  var SCALES = [];
  FAMILIES.forEach(function (f) { templates(f).forEach(function (t, i) { SCALES.push({ levels: t, pref: i }); }); });

  // 集計から除く答え（わからない・無回答など）
  var NA_DEFAULT = ["わからない", "分からない", "無回答", "未回答", "回答しない", "該当なし", "対象外", "不明", "利用していない", "参加していない", "-", "－", "ー", "―", "n/a", "na"];

  // 「5（とても満足）」「5: とても満足」「とても満足（5）」「5点」から数字を取り出す
  function numOf(v) {
    var s = String(v == null ? "" : v);
    if (s.normalize) s = s.normalize("NFKC");
    s = s.trim();
    var m = s.match(/^(-?\d+)\s*点?$/);
    if (m) return { n: +m[1], label: "" };
    m = s.match(/^(-?\d+)\s*点?\s*[（(【\[]\s*(.+?)\s*[)）】\]]$/);
    if (m && !/^\d/.test(m[2])) return { n: +m[1], label: clean(m[2]) };
    m = s.match(/^(-?\d+)\s*(?:点)?\s*[:：.．、,)）\]】\-－\s]\s*(.+)$/);
    if (m && !/^\d/.test(m[2])) return { n: +m[1], label: clean(m[2]) };
    m = s.match(/^(.+?)\s*[（(【\[]\s*(-?\d+)\s*点?\s*[)）】\]]$/);
    if (m) return { n: +m[2], label: clean(m[1]) };
    m = s.match(/^[（(【\[]\s*(-?\d+)\s*[)）】\]]\s*(.+)$/);
    if (m) return { n: +m[1], label: clean(m[2]) };
    return null;
  }

  function isNA(v, naSet) { return naSet[norm(v)] === 1; }
  function naSetOf(list) { var o = {}; (list || NA_DEFAULT).forEach(function (x) { var k = norm(x); if (k) o[k] = 1; }); return o; }

  // 列の中身から段階を推定する。戻り値：{ kind:"num", min, max, labels:{n:label} } か { kind:"text", levels:[表示名…高い順], src:"auto"|"none" }
  function guessScale(vals, naList) {
    var naSet = naSetOf(naList);
    var vs = vals.map(clean).filter(function (v) { return v !== "" && !isNA(v, naSet); });
    if (!vs.length) return null;
    // 数字
    var nums = vs.map(numOf);
    var okN = nums.filter(Boolean);
    if (okN.length === vs.length) {
      var lo = Infinity, hi = -Infinity, labels = {}, uniq = {};
      okN.forEach(function (o) { lo = Math.min(lo, o.n); hi = Math.max(hi, o.n); uniq[o.n] = 1; if (o.label && !labels[o.n]) labels[o.n] = o.label; });
      if (lo < 0 || hi > 10 || Object.keys(uniq).length > 11) return null;
      var min = lo === 0 ? 0 : 1, max = hi <= 5 ? 5 : hi <= 7 ? 7 : 10;
      if (hi <= 4 && Object.keys(labels).length && !labels[5]) max = Math.max(hi, 3); // 「4（そう思う）」のように数字に言葉が付いていれば、見えた最大を上限にする
      return { kind: "num", min: min, max: max, labels: labels, desc: true };
    }
    // 言葉
    var cnt = {}, disp = {};
    vs.forEach(function (v) { var k = norm(v); cnt[k] = (cnt[k] || 0) + 1; if (!disp[k]) disp[k] = v; });
    var keys = Object.keys(cnt);
    if (keys.length > 11) return null;
    var best = null;
    SCALES.forEach(function (sc) {
      var ks = sc.levels.map(norm), inS = 0, covered = 0;
      keys.forEach(function (k) { if (ks.indexOf(k) >= 0) { inS += cnt[k]; covered++; } });
      if (covered < 2) return;
      var share = inS / vs.length, ratio = covered / ks.length;
      var score = (share >= 0.999 ? 2 : share >= 0.9 ? 1 : 0) * 10 + ratio * 5 + (sc.pref <= 1 ? 0.8 : 0) - sc.pref * 0.01; // 5段階をやや優先（少ない回答では端の段階が出ないことが多い）
      if (share < 0.9) return;
      if (!best || score > best.score) best = { score: score, sc: sc, ks: ks };
    });
    if (!best) return null;
    // 表示名は、データで一番使われている書き方にする
    var levels = best.sc.levels.map(function (lab, i) { return disp[best.ks[i]] || lab; });
    return { kind: "text", levels: levels };
  }

  // 列を段階評価として読む。scale：guessScale の形（text の levels は利用者が書き直せる）
  // 戻り値：{ k, labels[高い順], scores[高い順], counts[], per:[行ごとの段階番号 or -1 空欄/-2 除く/-3 段階にない], na, blank, unknown:[{row,value}], n, mean, sd, top, bottom, topK }
  function analyze(rows, col, scale, naList, reverse) {
    var naSet = naSetOf(naList);
    var labels = [], scores = [], idx = {};
    if (scale.kind === "num") {
      for (var v = scale.max; v >= scale.min; v--) {
        labels.push(scale.labels && scale.labels[v] ? v + "（" + scale.labels[v] + "）" : String(v));
        scores.push(v);
      }
    } else {
      labels = scale.levels.map(clean).filter(Boolean);
      labels.forEach(function (l, i) { idx[norm(l)] = i; scores.push(labels.length - i); });
    }
    var k = labels.length;
    if (reverse) scores = scores.slice().reverse(); // 低いほど良い設問：点数を逆にする（並びはそのまま）
    var counts = labels.map(function () { return 0; }), per = [], unknown = [], na = 0, blank = 0, n = 0, sum = 0, sum2 = 0;
    rows.forEach(function (r, ri) {
      var raw = clean(r[col]), li = -1;
      if (raw === "") { blank++; per.push(-1); return; }
      if (isNA(raw, naSet)) { na++; per.push(-2); return; }
      if (scale.kind === "num") {
        var o = numOf(raw);
        if (o && o.n >= scale.min && o.n <= scale.max) li = scale.max - o.n;
      } else {
        var nk = norm(raw);
        if (nk in idx) li = idx[nk];
      }
      if (li < 0) { unknown.push({ row: ri, value: raw }); per.push(-3); return; }
      counts[li]++; n++; sum += scores[li]; sum2 += scores[li] * scores[li]; per.push(li);
    });
    var mean = n ? sum / n : null;
    var sd = n > 1 ? Math.sqrt(Math.max(0, (sum2 - n * mean * mean) / (n - 1))) : null;
    var topK = k >= 4 ? 2 : 1;
    // 「良い側」は点数の高い側。reverse のときは並びの下側が良い側になる
    var hiIdx = [], loIdx = [];
    for (var i = 0; i < topK; i++) { hiIdx.push(i); loIdx.push(k - 1 - i); }
    if (reverse) { var t = hiIdx; hiIdx = loIdx; loIdx = t; }
    var top = hiIdx.reduce(function (a, i) { return a + counts[i]; }, 0), bottom = loIdx.reduce(function (a, i) { return a + counts[i]; }, 0);
    return { k: k, labels: labels, scores: scores, counts: counts, per: per, na: na, blank: blank, unknown: unknown, n: n, total: rows.length, mean: mean, sd: sd, top: top, bottom: bottom, topK: topK, reverse: !!reverse };
  }

  // グループ別：{ groups:[名前], stat:{名前:{n, counts, mean, top, bottom}} }
  function cross(rows, A, gcol) {
    var groups = [], stat = {};
    rows.forEach(function (r, ri) {
      var g = clean(r[gcol]) || "（空欄）";
      if (!stat[g]) { stat[g] = { n: 0, counts: A.labels.map(function () { return 0; }), sum: 0 }; groups.push(g); }
      var li = A.per[ri];
      if (li >= 0) { var s = stat[g]; s.n++; s.counts[li]++; s.sum += A.scores[li]; }
    });
    groups.forEach(function (g) {
      var s = stat[g], hi = [], lo = [];
      for (var i = 0; i < A.topK; i++) { hi.push(i); lo.push(A.k - 1 - i); }
      if (A.reverse) { var t = hi; hi = lo; lo = t; }
      s.mean = s.n ? s.sum / s.n : null;
      s.top = hi.reduce(function (a, i) { return a + s.counts[i]; }, 0);
      s.bottom = lo.reduce(function (a, i) { return a + s.counts[i]; }, 0);
    });
    return { groups: groups, stat: stat };
  }

  // 段階評価らしい列を探す
  var SKIP_HEAD = /(番号|^no\.?$|^id$|ｉｄ|年齢|歳|人数|数量|個数|金額|価格|円|点数|得点|回数|コード|学年|年生|組|郵便|電話|日付|日時|時刻|タイムスタンプ)/i;
  function guessCols(headers, rows, naList) {
    var out = [];
    headers.forEach(function (h, i) {
      var vals = rows.map(function (r) { return r[i]; }).filter(function (v) { return clean(v) !== ""; });
      if (vals.length < 2) return;
      var sc = guessScale(vals, naList);
      if (!sc) return;
      if (sc.kind === "num" && SKIP_HEAD.test(clean(h))) return;
      out.push({ col: i, scale: sc });
    });
    return out;
  }

  // 元の表の各設問の右に「設問（点数）」の列を足す
  function scoreRows(headers, rows, specs) {
    var by = {};
    specs.forEach(function (sp) { by[sp.col] = sp; });
    var head = [];
    headers.forEach(function (h, i) { head.push(h); if (by[i]) head.push(h + "（点数）"); });
    var out = [head];
    rows.forEach(function (r, ri) {
      var o = [];
      headers.forEach(function (_, i) {
        o.push(r[i] == null ? "" : r[i]);
        if (by[i]) { var A = by[i].A, li = A.per[ri]; o.push(li >= 0 ? String(A.scores[li]) : ""); }
      });
      out.push(o);
    });
    return out;
  }

  function pct(a, b) { return b ? (Math.round(a / b * 1000) / 10).toFixed(1) + "%" : "-"; }
  function fix(x, d) { return x == null ? "-" : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = { decodeBytes: decodeBytes, parseCSV: parseCSV, clean: clean, norm: norm, numOf: numOf, FAMILIES: FAMILIES, SCALES: SCALES, NA_DEFAULT: NA_DEFAULT, guessScale: guessScale, guessCols: guessCols, analyze: analyze, cross: cross, scoreRows: scoreRows, pct: pct, fix: fix, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DANKAI = api;
})(this);
