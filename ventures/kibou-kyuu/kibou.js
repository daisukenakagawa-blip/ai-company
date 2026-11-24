/* 希望休の集計とシフト表の枠 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var E = root.Eigyo || (typeof require !== "undefined" ? require("./eigyo.js") : null);

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
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var WDC = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
  function wdOf(day) { return ((day % 7) + 11) % 7; } // 1970/1/1 は木曜
  function dayOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function ymd(day) { var t = new Date(day * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function md(day) { var o = ymd(day); return o.m + "/" + o.d; }
  function dayLabel(day) { var o = ymd(day); return o.m + "/" + o.d + "（" + WD[wdOf(day)] + "）"; }
  function holName(day) { try { return E ? E.holidayName(day) : null; } catch (e) { return null; } }

  // ---------- 名前 ----------
  function nameKey(s) { return norm(s).replace(/\s/g, "").replace(/(さん|様|さま|君|くん|ちゃん|氏)$/, "").toLowerCase(); }
  function cleanName(s) { return norm(s).replace(/\s*(さん|様|さま|君|くん|ちゃん)$/, ""); }

  // 名簿：1行に「名前」または「名前,職種」「名前<TAB>職種」
  function parseStaff(text) {
    var out = [], seen = {}, dup = [];
    String(text || "").split(/\r?\n/).forEach(function (ln, i) {
      var t = String(ln).replace(/^﻿/, "").trim();
      if (!t || /^#/.test(t)) return;
      var p = t.split(/\t|,|，/), name = cleanName(p[0]), group = norm(p.slice(1).join(" "));
      if (!name || /^(氏名|名前|お名前|スタッフ|従業員|name)$/i.test(name)) return;
      var k = nameKey(name);
      if (seen[k]) { dup.push({ line: i + 1, name: name }); return; }
      seen[k] = 1; out.push({ name: name, key: k, group: group });
    });
    return { list: out, dup: dup };
  }

  // ---------- 期間 ----------
  // ym: {y,m}、start: 始まりの日（1 なら月初〜月末、16 なら 16日〜翌月15日）
  function period(ym, start) {
    start = Math.min(28, Math.max(1, start | 0 || 1));
    var a = dayOf(ym.y, ym.m, start), b = dayOf(ym.y, ym.m + 1, start) - 1, days = [];
    for (var d = a; d <= b; d++) days.push(d);
    return days;
  }

  // ---------- 種類（午前・有休・必ず など） ----------
  function classify(t) {
    t = norm(t);
    var o = { half: "", paid: false, pri: "" };
    if (/午前|ＡＭ|\bam\b|朝/i.test(t)) o.half = "午前";
    else if (/午後|ＰＭ|\bpm\b|夕方/i.test(t)) o.half = "午後";
    else if (/半休|半日/.test(t)) o.half = "半日";
    if (/有休|有給|年休|^有$|有\b/.test(t) && !/有無/.test(t)) o.paid = true;
    if (/◎|必ず|絶対|必須|確定/.test(t)) o.pri = "must";
    else if (/△|できれば|出来れば|なるべく|可能なら|第2|第二|もし/.test(t)) o.pri = "soft";
    return o;
  }

  // ---------- 日付の文字 ----------
  var DRE = /^(?:(\d{4})[\/.年])?(?:(\d{1,2})[\/月])?(\d{1,2})日?(?:\(([日月火水木金土])(?:曜日?)?\)|([日月火水木金土])曜日?)?(.*)$/;
  // 「12/3」「12月3日(水)」「2026/12/3」「3日」「3」→ {y,m,d,wd,rest}
  function dateTok(t) {
    var m = t.match(DRE);
    if (!m) return null;
    var rest = m[6] || "";
    if (/^(時|:|分|人|回|か月|ヶ月|ヵ月|週|年|月|名|番|号|件|%|円|才|歳|頃)/.test(rest)) return null;
    var d = +m[3], mo = m[2] != null ? +m[2] : null;
    if (d < 1 || d > 31 || (mo != null && (mo < 1 || mo > 12))) return null;
    var w = m[4] || m[5];
    return { y: m[1] ? +m[1] : null, m: mo, d: d, wd: w != null ? WDC[w] : null, rest: rest.trim() };
  }
  // 期間の中から日を決める。期間の外なら一番近い年で日を返し out:true
  function resolve(tk, days) {
    var a = days[0], b = days[days.length - 1], i, o;
    if (tk.y != null) { var x = dayOf(tk.y, tk.m || ymd(a).m, tk.d); return { day: x, out: x < a || x > b, bad: ymd(x).d !== tk.d }; }
    if (tk.m != null) {
      for (i = 0; i < days.length; i++) { o = ymd(days[i]); if (o.m === tk.m && o.d === tk.d) return { day: days[i], out: false }; }
      var ya = ymd(a).y, best = null;
      [ya - 1, ya, ya + 1].forEach(function (yy) { var z = dayOf(yy, tk.m, tk.d); var dist = z < a ? a - z : z - b; if (ymd(z).d === tk.d && (!best || dist < best.dist)) best = { day: z, dist: dist }; });
      return best ? { day: best.day, out: true } : { day: null, bad: true };
    }
    for (i = 0; i < days.length; i++) if (ymd(days[i]).d === tk.d) return { day: days[i], out: false };
    return { day: null, out: true };
  }

  // 1人分の文（「3, 10, 24日」「12/5(土)午前・12/6」「12/24〜26 ◎」）→ 日の一覧
  var NONE = /^(なし|無し|ない|ありません|特になし|特に無し|希望なし|なしです|0日?|-|ー)$/;
  function withCtx(tk, m, y) { if (tk && tk.m == null && m != null) { tk.m = m; if (y != null) tk.y = y; } return tk; }
  function parseDates(text, days) {
    var t = norm(text), out = [], bad = [], pend = "", any = false;
    if (!t) return { items: out, bad: bad, none: false };
    if (NONE.test(t.replace(/[。.!！]/g, ""))) return { items: out, bad: bad, none: true };
    t = t.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, "$1/$2/$3").replace(/(\d{1,2})月\s+(?=\d)/g, "$1月");
    var ctxM = null, ctxY = null;
    var toks = t.split(/[,、，・;；\s]+|と(?=\d)|及び|および/).filter(function (x) { return x !== ""; });
    var last = [];
    toks.forEach(function (tok) {
      var cm = tok.match(/^(?:(\d{4})年)?(\d{1,2})月(?!\d)(.*)$/);
      if (cm && !/\d/.test(cm[3]) && +cm[2] >= 1 && +cm[2] <= 12) { ctxM = +cm[2]; if (cm[1]) ctxY = +cm[1]; return; }
      var rg = tok.match(/^(.+?)(?:~|〜|〰|から|-)(.+)$/), a, b;
      if (rg && /^\d/.test(rg[1]) && /^\d/.test(rg[2]) && (a = withCtx(dateTok(rg[1]), ctxM, ctxY)) && (b = dateTok(rg[2].replace(/まで/, "")))) {
        if (b.m == null && a.m != null) b.m = a.m;
        if (b.y == null && a.y != null) b.y = a.y;
        var ra = resolve(a, days), rb = resolve(b, days);
        if (ra.day == null || rb.day == null || rb.day < ra.day || rb.day - ra.day > 62) { bad.push(tok); last = []; return; }
        last = [];
        for (var x = ra.day; x <= rb.day; x++) { var it = { day: x, out: x < days[0] || x > days[days.length - 1], note: b.rest || "", wdBad: false }; out.push(it); last.push(it); }
        any = true;
        return;
      }
      var tk = /^\d/.test(tok) ? withCtx(dateTok(tok), ctxM, ctxY) : null;
      if (tk) {
        var r = resolve(tk, days);
        if (r.day == null || r.bad) { bad.push(tok); last = []; return; }
        var it2 = { day: r.day, out: !!r.out, note: tk.rest, wdBad: tk.wd != null && tk.wd !== wdOf(r.day) };
        out.push(it2); last = [it2]; any = true;
        return;
      }
      // 日付ではない言葉：直前の日に付ける。まだ日がなければ、あとの日すべてに付ける
      if (last.length) last.forEach(function (it) { it.note = (it.note ? it.note + " " : "") + tok; });
      else pend = (pend ? pend + " " : "") + tok;
    });
    out.forEach(function (it) {
      it.note = norm(((it.note || "") + (pend ? " " + pend : "")).replace(/^[(（]|[)）]$/g, function () { return ""; }));
      var c = classify(it.note); it.half = c.half; it.paid = c.paid; it.pri = c.pri;
    });
    if (!any && pend) bad.push(pend);
    return { items: out, bad: bad, none: false };
  }

  // ---------- 表の形（名前×日付の表） ----------
  function dayHead(v) {
    var t = norm(v), m, wd = null;
    if (!t) return null;
    var w = t.match(/[(（]?\s*([日月火水木金土])(?:曜日?)?\s*[)）]?$/);
    if (w && t.length > w[0].length) { wd = WDC[w[1]]; t = t.slice(0, t.length - w[0].length).trim(); }
    t = t.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, "");
    if ((m = t.match(/^(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?$/))) return ok(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{1,2})[\/月](\d{1,2})日?$/))) return ok(null, +m[1], +m[2]);
    if ((m = t.match(/^(\d{1,2})日?$/))) return ok(null, null, +m[1]);
    return null;
    function ok(y, mo, d) { if (d < 1 || d > 31 || (mo != null && (mo < 1 || mo > 12))) return null; return { y: y, m: mo, d: d, wd: wd }; }
  }
  function isWdCell(v) { var t = norm(v).replace(/[()（）]|曜日?$/g, ""); return /^[日月火水木金土]$/.test(t) ? WDC[t] : null; }
  var NAMEH = /^(氏名|名前|お名前|スタッフ|スタッフ名|従業員|従業員名|社員|職員|メンバー|名|name|staff|お名前をご記入ください)$/i;
  var GROUPH = /^(職種|部署|売場|持ち場|ポジション|役割|部門|チーム|グループ|区分|雇用形態|所属|担当|position|role|team|group)$/i;
  var SKIPNAME = /^(合計|計|小計|総計|人数|.*の人数|.*人数計?|備考|メモ)$/;

  function findMatrix(rows) {
    var best = null;
    rows.slice(0, 20).forEach(function (r, ri) {
      var hits = [];
      r.forEach(function (v, ci) { var h = dayHead(v); if (h) hits.push({ ci: ci, h: h }); });
      if (hits.length >= 5 && (!best || hits.length > best.hits.length)) best = { ri: ri, hits: hits };
    });
    if (!best) return null;
    var hs = best.hits, runs = [], cur = [hs[0]];
    for (var i = 1; i < hs.length; i++) { if (hs[i].ci - hs[i - 1].ci <= 2) cur.push(hs[i]); else { runs.push(cur); cur = [hs[i]]; } }
    runs.push(cur);
    runs.sort(function (a, b) { return b.length - a.length; });
    var dc = runs[0];
    if (dc.length < 5) return null;
    var head = rows[best.ri], first = dc[0].ci, wdRow = -1, nx = rows[best.ri + 1];
    if (nx) { var c = 0; dc.forEach(function (d) { if (isWdCell(nx[d.ci]) != null) c++; }); if (c >= dc.length / 2) wdRow = best.ri + 1; }
    var dataFrom = (wdRow >= 0 ? wdRow : best.ri) + 1, nameCol = null, groupCol = null, cand = [];
    for (var ci = 0; ci < first; ci++) {
      var h = norm(head[ci]);
      if (NAMEH.test(h) && nameCol == null) nameCol = ci;
      else if (GROUPH.test(h) && groupCol == null) groupCol = ci;
      var txt = 0;
      rows.slice(dataFrom, dataFrom + 40).forEach(function (r) { var v = norm(r[ci]); if (v && !/^[\d.\-\/:]+$/.test(v)) txt++; });
      cand.push({ ci: ci, txt: txt });
    }
    if (nameCol == null) { var c2 = cand.filter(function (x) { return x.ci !== groupCol; }).sort(function (a, b) { return b.txt - a.txt || a.ci - b.ci; })[0]; nameCol = c2 && c2.txt ? c2.ci : null; }
    if (nameCol == null) return null;
    return { kind: "matrix", headRow: best.ri, wdRow: wdRow, dataFrom: dataFrom, dcols: dc.map(function (d) { return d.ci; }), heads: dc.map(function (d) { return d.h; }), nameCol: nameCol, groupCol: groupCol };
  }
  function headDays(heads, ym, wdCells) {
    var out = [], y = ym.y, m = ym.m, prevD = null, mism = 0, bad = [];
    heads.forEach(function (h, i) {
      var day;
      if (h.y != null) { day = dayOf(h.y, h.m, h.d); y = h.y; m = h.m; }
      else if (h.m != null) { if (out.length && h.m < m) y++; m = h.m; day = dayOf(y, m, h.d); }
      else { if (prevD != null && h.d <= prevD) { m++; if (m > 12) { m = 1; y++; } } day = dayOf(y, m, h.d); }
      if (ymd(day).d !== h.d) bad.push(i);
      var w = h.wd != null ? h.wd : (wdCells ? isWdCell(wdCells[i]) : null);
      if (w != null && w !== wdOf(day)) mism++;
      out.push(day); prevD = h.d;
    });
    return { days: out, mism: mism, bad: bad };
  }
  function addM(y, m, k) { m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return { y: y, m: m }; }
  // 名前×日付の表の月を、見出しの曜日から探す
  function guessMatrixMonth(L, rows, today) {
    var full = L.heads.filter(function (h) { return h.y != null; })[0];
    if (full) return { y: full.y, m: full.m, sure: true };
    var wdCells = L.wdRow >= 0 ? L.dcols.map(function (c) { return rows[L.wdRow][c]; }) : null;
    var hasWd = L.heads.some(function (h, i) { return h.wd != null || (wdCells && isWdCell(wdCells[i]) != null); });
    var t = ymd(today), first = L.heads[0], cands = [];
    if (first.m != null) [0, 1, -1].forEach(function (dy) { cands.push({ y: t.y + dy, m: first.m }); });
    else [1, 0, 2, -1, 3, 4, 5, 6, -2, 7, 8, 9, 10, 11].forEach(function (k) { cands.push(addM(t.y, t.m, k)); });
    if (!hasWd) { if (first.m != null) { var g = addM(t.y, t.m, 0); return { y: first.m < t.m - 2 ? t.y + 1 : t.y, m: first.m, sure: false }; } return null; }
    for (var i = 0; i < cands.length; i++) { var r = headDays(L.heads, cands[i], wdCells); if (!r.mism && !r.bad.length) return { y: cands[i].y, m: cands[i].m, sure: true }; }
    return null;
  }

  // 1行1件・フォームの回答：名前の列と日付の列
  var DATEH = /^(日付|希望日|希望休|休み希望|休み希望日|休みの希望|休みたい日|お休み希望日|希望休日|日にち|月日|日|date|休みの日|お休みの日)/i;
  var KINDH = /^(種類|区分|内容|午前午後|時間帯|優先|優先度|休みの種類)/;
  var MEMOH = /^(メモ|備考|理由|コメント|連絡事項)/;
  function findList(rows) {
    for (var ri = 0; ri < Math.min(5, rows.length); ri++) {
      var r = rows[ri], nc = -1, dc = [], kc = -1, mc = -1, gc = -1;
      r.forEach(function (v, ci) {
        var h = norm(v).replace(/[?？:：。]$/, "");
        if (nc < 0 && (NAMEH.test(h) || /^(氏名|名前|お名前)/.test(h))) nc = ci;
        else if (DATEH.test(h) || /休み.*日|希望.*日|休みたい/.test(h)) dc.push(ci);
        else if (kc < 0 && KINDH.test(h)) kc = ci;
        else if (mc < 0 && MEMOH.test(h)) mc = ci;
        else if (gc < 0 && GROUPH.test(h)) gc = ci;
      });
      if (nc >= 0 && dc.length) return { kind: "list", headRow: ri, nameCol: nc, dateCols: dc, kindCol: kc, memoCol: mc, groupCol: gc };
    }
    return null;
  }

  // 文から月を推定（「12/3」「12月」の多い月）
  function guessTextMonth(texts, today) {
    var cnt = {}, t = ymd(today), years = {};
    texts.forEach(function (s) {
      var x = norm(s).replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, "$1/$2/$3"), re = /(?:(\d{4})[\/.年])?(\d{1,2})[\/月](\d{1,2})/g, m;
      while ((m = re.exec(x))) { var mo = +m[2]; if (mo >= 1 && mo <= 12 && +m[3] >= 1 && +m[3] <= 31) { cnt[mo] = (cnt[mo] || 0) + 1; if (m[1]) years[mo] = +m[1]; } }
    });
    var best = null;
    Object.keys(cnt).forEach(function (k) { if (!best || cnt[k] > cnt[best]) best = k; });
    if (!best) return null;
    var mo2 = +best, y = years[mo2] || (mo2 < t.m - 2 ? t.y + 1 : t.y);
    return { y: y, m: mo2, sure: true };
  }

  // ---------- 読み取り ----------
  // src: {rows:[[...]]} または {text:"..."}。戻り：{mode, entries:[{name, group, src, items|cells}], ...}
  function detect(src) {
    var rows = src.rows || parseCSV(src.text || "");
    var mx = findMatrix(rows);
    if (mx) return { mode: "matrix", rows: rows, L: mx };
    var ls = findList(rows);
    if (ls) return { mode: "list", rows: rows, L: ls };
    // 文：1行に1人（Excel なら左の列が名前）
    var lines = [];
    if (src.rows) rows.forEach(function (r, i) { var cells = r.map(norm).filter(function (v) { return v !== ""; }); if (cells.length) lines.push({ line: i + 1, text: cells.length > 1 ? cells[0] + "：" + cells.slice(1).join(" ") : cells[0] }); });
    else String(src.text || "").split(/\r?\n/).forEach(function (ln, i) { if (ln.trim()) lines.push({ line: i + 1, text: ln }); });
    return { mode: "text", lines: lines };
  }
  function sampleTexts(D) {
    if (D.mode === "text") return D.lines.map(function (l) { return l.text; });
    if (D.mode === "list") return D.rows.slice(D.L.headRow + 1).map(function (r) { return D.L.dateCols.map(function (c) { return r[c] || ""; }).join(" "); });
    return [];
  }
  function guessMonth(D, today) {
    if (D.mode === "matrix") return guessMatrixMonth(D.L, D.rows, today);
    return guessTextMonth(sampleTexts(D), today);
  }
  // 文の1行 → 名前と残り
  var KINDWORD = /(有休|有給|年休|午前休?|午後休?|半休|希望休|希望|休み|お休み|◎|○|〇|△)$/;
  function splitLine(text, staff) {
    var raw = String(text).replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+/, "");
    if (/\t/.test(raw)) { var tp = raw.split("\t").map(norm).filter(Boolean); if (tp.length > 1 && !/^\d/.test(tp[0])) return { name: cleanName(tp[0]), rest: tp.slice(1).join(" ") }; }
    var t = norm(raw).replace(/^[・\-*●■◆>]+\s*/, "");
    var m = t.match(/^([^:：\t=＝]+?)\s*[:：\t=＝]\s*(.*)$/);
    if (m && !/^\d/.test(m[1])) return { name: cleanName(m[1]), rest: m[2] };
    // 名簿の名前で始まっていれば、それを名前にする（長い名前を先に）
    if (staff && staff.length) {
      var key = t.replace(/\s/g, "");
      var hit = staff.slice().sort(function (a, b) { return b.key.length - a.key.length; }).filter(function (s) { return key.toLowerCase().indexOf(s.key) === 0; })[0];
      if (hit) {
        var n = 0, i = 0; // 空白を除いた文字数ぶん、元の文を進める
        while (i < t.length && n < hit.key.length) { if (!/\s/.test(t[i])) n++; i++; }
        return { name: hit.name, rest: t.slice(i).replace(/^(さん|様|さま|君|くん|ちゃん)/, "") };
      }
    }
    var d = t.search(/\d/);
    if (d <= 0) {
      var parts = t.split(" ");
      return { name: cleanName(parts[0]), rest: parts.slice(1).join(" ") };
    }
    var name = t.slice(0, d).trim(), pre = "";
    while (KINDWORD.test(name)) { var k = name.match(KINDWORD)[0]; pre = k + (pre ? " " + pre : ""); name = name.slice(0, -k.length).trim(); }
    return { name: cleanName(name), rest: (pre ? pre + " " : "") + t.slice(d) };
  }

  // 名前×日付の表のマス → 希望休かどうか
  function skipSet(text) { var s = {}; String(text || "").split(/[\s,、]+/).forEach(function (x) { x = norm(x); if (x) s[x] = 1; }); return s; }

  function collect(D, days, opt) {
    var ents = [], bad = [], notes = [], staff = opt.staff || [];
    if (D.mode === "matrix") {
      var L = D.L, ym = ymd(days[0]);
      var wdCells = L.wdRow >= 0 ? L.dcols.map(function (c) { return D.rows[L.wdRow][c]; }) : null;
      var hd = headDays(L.heads, opt.matrixYm || { y: ym.y, m: ym.m }, wdCells);
      if (hd.mism) notes.push("見出しの曜日が " + hd.mism + " 列で選んだ月と合いません。対象の月を確かめてください");
      var sk = skipSet(opt.skipMarks);
      D.rows.slice(L.dataFrom).forEach(function (r, i) {
        var nm = norm(r[L.nameCol]);
        if (!nm || SKIPNAME.test(nm)) return;
        var items = [];
        L.dcols.forEach(function (c, j) {
          var v = norm(r[c]);
          if (!v || sk[v] || hd.bad.indexOf(j) >= 0) return;
          var cl = classify(v), day = hd.days[j];
          items.push({ day: day, out: day < days[0] || day > days[days.length - 1], note: /^(○|〇|◯|休|希|希望|希休|希望休|×|x|✕|●|レ|✓|1)$/i.test(v) ? "" : v, half: cl.half, paid: cl.paid, pri: cl.pri, wdBad: false });
        });
        ents.push({ name: cleanName(nm), group: L.groupCol != null ? norm(r[L.groupCol]) : "", line: L.dataFrom + i + 1, items: items, none: false, src: "" });
      });
    } else if (D.mode === "list") {
      var Ls = D.L;
      D.rows.slice(Ls.headRow + 1).forEach(function (r, i) {
        var nm = cleanName(r[Ls.nameCol]), line = Ls.headRow + i + 2;
        var txt = Ls.dateCols.map(function (c) { return norm(r[c]); }).filter(Boolean).join(", ");
        var kd = Ls.kindCol >= 0 ? norm(r[Ls.kindCol]) : "", memo = Ls.memoCol >= 0 ? norm(r[Ls.memoCol]) : "";
        if (!nm && !txt) return;
        if (!nm) { bad.push({ line: line, text: txt, why: "名前が空です" }); return; }
        // Excel の日付（シリアル値）
        txt = txt.replace(/^(\d{5})$/, function (s) { var o = ymd(+s - 25569); return o.y + "/" + o.m + "/" + o.d; });
        var p = parseDates(txt + (kd ? " " + kd : ""), days);
        if (memo) p.items.forEach(function (it) { it.memo = memo; });
        p.bad.forEach(function (b) { bad.push({ line: line, text: nm + "：" + b, why: "日付として読めません" }); });
        ents.push({ name: nm, group: Ls.groupCol >= 0 ? norm(r[Ls.groupCol]) : "", line: line, items: p.items, none: p.none, src: txt });
      });
    } else {
      D.lines.forEach(function (l) {
        var s = splitLine(l.text, staff);
        if (!s.name) { bad.push({ line: l.line, text: l.text, why: "名前が読めません" }); return; }
        if (!s.rest.trim()) {
          // 名前だけの行（見出し「12月の希望休」など）は数えない
          if (/\d/.test(s.name) || /希望|休み|シフト|月/.test(s.name)) return;
          ents.push({ name: s.name, group: "", line: l.line, items: [], none: false, empty: true, src: "" });
          return;
        }
        var p = parseDates(s.rest, days);
        if (!p.items.length && !p.none) { bad.push({ line: l.line, text: l.text, why: "日付が見つかりません" }); return; }
        p.bad.forEach(function (b) { bad.push({ line: l.line, text: s.name + "：" + b, why: "日付として読めません" }); });
        ents.push({ name: s.name, group: "", line: l.line, items: p.items, none: p.none, src: s.rest });
      });
    }
    return { mode: D.mode, entries: ents, bad: bad, notes: notes };
  }

  // ---------- 集計 ----------
  // opt: {days, staff:[{name,key,group}], capW, capH, capG, capP, capPH, limit, mark:"希"|"休"|"raw"}
  function run(C, opt) {
    var days = opt.days, staff = opt.staff || [], P = [], byKey = {}, flags = [], aliases = [], seq = 0, notes = C.notes.slice();
    var first = days[0], lastD = days[days.length - 1];
    staff.forEach(function (s) { var p = { name: s.name, key: s.key, group: s.group, inList: true, items: [], sub: false, none: false, lines: [] }; P.push(p); byKey[s.key] = p; });
    function find(name) {
      var k = nameKey(name);
      if (byKey[k]) return byKey[k];
      if (staff.length && k.length >= 1) {
        var c = staff.filter(function (s) { return s.key.indexOf(k) === 0; });
        if (c.length === 1) { var p = byKey[c[0].key]; aliases.push("「" + cleanName(name) + "」→「" + p.name + "」"); byKey[k] = p; return p; }
      }
      var np = { name: cleanName(name), key: k, group: "", inList: !staff.length, items: [], sub: false, none: false, lines: [] };
      if (staff.length) flags.push({ type: "name", name: np.name, text: "名簿にない名前です（表の下に足しました）" });
      P.push(np); byKey[k] = np; return np;
    }
    C.entries.forEach(function (e) {
      var p = find(e.name);
      if (e.group && !p.group) p.group = e.group;
      p.sub = p.sub || !e.empty; p.none = p.none || e.none; p.lines.push(e.line);
      e.items.forEach(function (it) {
        if (it.out) { flags.push({ type: "out", name: p.name, day: it.day, text: dayLabel(it.day) + " は期間（" + md(first) + "〜" + md(lastD) + "）の外のため数えません" }); return; }
        var dup = p.items.filter(function (x) { return x.day === it.day; })[0];
        if (dup) { if (!dup.note && it.note) { dup.note = it.note; dup.half = it.half; dup.paid = it.paid; dup.pri = it.pri; } return; }
        if (it.wdBad) flags.push({ type: "wd", name: p.name, day: it.day, text: "書いてある曜日が " + dayLabel(it.day) + " と合いません（日付で数えました）" });
        p.items.push({ day: it.day, note: it.note || "", half: it.half, paid: it.paid, pri: it.pri, memo: it.memo || "", seq: seq++ });
      });
    });
    if (aliases.length) flags.push({ type: "name", text: "名簿の名前として読みました（" + aliases.length + " 人）：" + aliases.join("、") });
    var lim = opt.limit || Infinity, cut = 0;
    P.forEach(function (p, i) { p.order = i; p.calc = i < lim; if (!p.calc && p.items.length) cut++; p.items.sort(function (a, b) { return a.day - b.day; }); });
    var Q = P.filter(function (p) { return p.calc; });
    var staffN = staff.length ? Q.filter(function (p) { return p.inList; }).length : 0;
    // 日ごと
    var D = days.map(function (d) {
      var w = wdOf(d), h = holName(d), we = w === 0 || w === 6 || !!h;
      var off = [];
      Q.forEach(function (p) { p.items.forEach(function (it) { if (it.day === d) off.push({ p: p, it: it }); }); });
      off.sort(function (a, b) { var r = { must: 0, "": 1, soft: 2 }; return r[a.it.pri] - r[b.it.pri] || a.it.seq - b.it.seq; });
      var full = off.filter(function (o) { return !o.it.half; }).length, half = off.length - full;
      var cap = we ? opt.capH : opt.capW, over = cap > 0 && off.length > cap;
      var row = { day: d, wd: w, hol: h || "", we: we, off: off, full: full, half: half, cap: cap || 0, over: over, work: staffN ? staffN - full : null, groups: {} };
      off.forEach(function (o) { var g = o.p.group || ""; row.groups[g] = (row.groups[g] || 0) + 1; });
      if (over) flags.push({ type: "day", day: d, text: dayLabel(d) + (h ? "・" + h : "") + "：希望 " + off.length + " 人（上限 " + cap + " 人）　" + off.map(function (o, i) { return (i + 1) + "." + o.p.name + (o.it.pri === "must" ? "◎" : o.it.pri === "soft" ? "△" : "") + (o.it.half ? "（" + o.it.half + "）" : ""); }).join(" ") });
      if (opt.capG > 0) Object.keys(row.groups).forEach(function (g) { if (g && row.groups[g] > opt.capG) flags.push({ type: "group", day: d, text: dayLabel(d) + "：" + g + " の希望 " + row.groups[g] + " 人（上限 " + opt.capG + " 人）　" + off.filter(function (o) { return o.p.group === g; }).map(function (o) { return o.p.name; }).join("・") }); });
      return row;
    });
    // 1人ごと
    Q.forEach(function (p) {
      p.n = p.items.length; p.nFull = p.items.filter(function (i) { return !i.half; }).length;
      p.nWe = p.items.filter(function (i) { var w = wdOf(i.day); return w === 0 || w === 6 || !!holName(i.day); }).length;
      p.nPaid = p.items.filter(function (i) { return i.paid; }).length;
      p.nMust = p.items.filter(function (i) { return i.pri === "must"; }).length;
      p.flag = [];
      if (opt.capP > 0 && p.n > opt.capP) { p.flag.push("日数が上限（" + opt.capP + "日）を超え"); flags.push({ type: "person", name: p.name, text: p.name + "：希望 " + p.n + " 日（上限 " + opt.capP + " 日）" }); }
      if (opt.capPH > 0 && p.nWe > opt.capPH) { p.flag.push("土日祝が上限（" + opt.capPH + "日）を超え"); flags.push({ type: "person", name: p.name, text: p.name + "：土日祝の希望 " + p.nWe + " 日（上限 " + opt.capPH + " 日）" }); }
      if (p.lines.length > 1 && C.mode !== "matrix") flags.push({ type: "dupl", name: p.name, text: p.name + "：" + p.lines.length + " か所（" + p.lines.join("・") + " 行目）に書かれていたため、まとめました" });
    });
    var noSub = staff.length ? Q.filter(function (p) { return p.inList && !p.sub && !p.none; }) : [];
    noSub.forEach(function (p) { flags.push({ type: "nosub", name: p.name, text: p.name + "：希望が出ていません" }); });
    var order = { day: 0, group: 1, person: 2, nosub: 3, name: 4, dupl: 5, out: 6, wd: 7 };
    flags.sort(function (a, b) { return order[a.type] - order[b.type] || (a.day || 0) - (b.day || 0); });
    return { days: D, people: Q, all: P, flags: flags, bad: C.bad, notes: notes, cut: cut, staffN: staffN, total: Q.reduce(function (s, p) { return s + p.n; }, 0),
      overDays: D.filter(function (r) { return r.over; }).length, noSub: noSub.length };
  }

  // ---------- シフト表の枠 ----------
  function cellMark(it, mark) {
    if (mark === "raw") return it.note || "希";
    var base = it.paid ? "有" : (mark || "希");
    return base + (it.half ? "(" + it.half.charAt(it.half === "半日" ? 0 : 1) + ")" : ""); // 午前→(前) 午後→(後) 半日→(半)
  }
  // 戻り：2次元配列（見出し2行＋人＋休みの人数の行）。opt.extraRows：下に足す空の行の名前
  function frameRows(R, days, opt) {
    var hasG = R.people.some(function (p) { return p.group; });
    var h1 = ["氏名"].concat(hasG ? ["職種"] : []), h2 = [""].concat(hasG ? [""] : []);
    days.forEach(function (d) { var o = ymd(d); h1.push(o.m + "/" + o.d + "(" + WD[wdOf(d)] + ")"); h2.push(holName(d) ? "祝" : ""); });
    h1.push("休み希望の日数");
    var out = [h1];
    if (days.some(function (d) { return holName(d); })) { h2.push(""); out.push(h2); }
    R.people.forEach(function (p) {
      var r = [p.name].concat(hasG ? [p.group] : []);
      days.forEach(function (d) { var it = p.items.filter(function (x) { return x.day === d; })[0]; r.push(it ? cellMark(it, opt.mark) : ""); });
      r.push(p.n); out.push(r);
    });
    var cnt = ["休み希望の人数"].concat(hasG ? [""] : []);
    R.days.forEach(function (row) { cnt.push(row.off.length); });
    cnt.push(R.total); out.push(cnt);
    (opt.extraRows || []).forEach(function (n) { var r = [n].concat(hasG ? [""] : []); days.forEach(function () { r.push(""); }); r.push(""); out.push(r); });
    return { rows: out, hasG: hasG, headN: out[1] === h2 ? 2 : 1 };
  }

  function csvCell(v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var API = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, WD: WD, wdOf: wdOf, dayOf: dayOf, ymd: ymd, md: md, dayLabel: dayLabel, holName: holName,
    nameKey: nameKey, parseStaff: parseStaff, period: period, classify: classify, dateTok: dateTok, parseDates: parseDates, findMatrix: findMatrix, findList: findList,
    detect: detect, guessMonth: guessMonth, splitLine: splitLine, collect: collect, run: run, cellMark: cellMark, frameRows: frameRows, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.KIBOU = API;
})(typeof window !== "undefined" ? window : globalThis);
