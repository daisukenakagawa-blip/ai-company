// PDF の表 → 行と列（文字情報のある PDF 用）。ブラウザと Node の両方で使う。
// 入力：pdf.js の getTextContent() の items（各ページ）、ページの幅
// 出力：{ rows: [[セル文字列...]], cols: 列の境界 }
(function (root) {
  "use strict";

  function itemsToCells(items) {
    // pdf.js の item: { str, transform:[a,b,c,d,e,f], width, height }
    const cells = [];
    for (const it of items) {
      // 康熙部首など見た目が同じ別の文字（⼀・⾦ など）を普通の漢字に直す
      const s = (it.str || "").replace(/[\u2E80-\u2FDF]/g, function (ch) { return ch.normalize("NFKC"); }).replace(/\s+/g, " ");
      if (!s.trim()) continue;
      const h = Math.abs(it.transform[3]) || Math.abs(it.height) || 10;
      cells.push({ s: s, x: it.transform[4], y: it.transform[5], w: it.width || s.length * h * 0.6, h: h });
    }
    return cells;
  }

  // 同じ高さ（y）のものを1行にまとめる
  // 罫線をまたいで1つになっている文字列（「87 35,786」など）を、空白の位置で分ける
  function splitAcrossRules(cells, ruleXs) {
    if (!ruleXs.length) return cells;
    const out = [];
    cells.forEach(function (c) {
      const crosses = ruleXs.some(function (x) { return x > c.x + 1 && x < c.x + c.w - 1; });
      if (!crosses || c.s.indexOf(" ") < 0) { out.push(c); return; }
      const per = c.w / c.s.length;
      let pos = 0;
      c.s.split(" ").forEach(function (tok) {
        if (tok) out.push({ s: tok, x: c.x + pos * per, y: c.y, w: tok.length * per, h: c.h });
        pos += tok.length + 1;
      });
    });
    return out;
  }

  function groupLines(cells, ruleXs) {
    ruleXs = ruleXs || [];
    cells = splitAcrossRules(cells, ruleXs);
    cells.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    const lines = [];
    for (const c of cells) {
      const L = lines.length ? lines[lines.length - 1] : null;
      if (L && Math.abs(L.y - c.y) <= Math.max(2, Math.min(L.h, c.h) * 0.45)) { L.items.push(c); L.h = Math.max(L.h, c.h); }
      else lines.push({ y: c.y, h: c.h, items: [c] });
    }
    for (const L of lines) {
      L.items.sort(function (a, b) { return a.x - b.x; });
      // 近いものは同じセルとしてつなぐ
      const merged = [];
      for (const c of L.items) {
        const p = merged[merged.length - 1];
        const gap = p ? c.x - (p.x + p.w) : Infinity;
        const crosses = p && ruleXs.some(function (x) { return x > p.x + p.w - 0.5 && x < c.x + 0.5; });
        if (p && !crosses && gap < Math.max(1.5, Math.min(p.h, c.h) * 0.35)) {
          p.s += (gap > p.h * 0.15 && /[A-Za-z0-9]$/.test(p.s) && /^[A-Za-z0-9]/.test(c.s) ? " " : "") + c.s;
          p.w = c.x + c.w - p.x;
        } else merged.push({ s: c.s, x: c.x, w: c.w, h: c.h });
      }
      L.cells = merged.map(function (c) { return { s: c.s.trim(), x0: c.x, x1: c.x + c.w, h: c.h }; });
    }
    return lines;
  }

  // 列の境界：どの行の文字にも覆われていない x の「すき間」を探す
  function findColumns(lines) {
    const counts = lines.map(function (L) { return L.cells.length; }).filter(function (n) { return n >= 2; }).sort(function (a, b) { return a - b; });
    if (!counts.length) return [];
    const med = counts[Math.floor(counts.length / 2)];
    const tl = lines.filter(function (L) { return L.cells.length >= Math.max(2, Math.ceil(med * 0.5)); });
    if (!tl.length) return [];
    let minX = Infinity, maxX = -Infinity;
    tl.forEach(function (L) { L.cells.forEach(function (c) { minX = Math.min(minX, c.x0); maxX = Math.max(maxX, c.x1); }); });
    const W = Math.ceil(maxX - minX) + 2;
    const cov = new Array(W).fill(0);
    tl.forEach(function (L) {
      L.cells.forEach(function (c) {
        for (let x = Math.floor(c.x0 - minX); x < Math.ceil(c.x1 - minX); x++) if (x >= 0 && x < W) cov[x]++;
      });
    });
    const limit = Math.floor(tl.length * 0.08); // 見出しなど少数の行だけが入る所もすき間とみなす
    const seps = [];
    let start = -1;
    for (let x = 0; x < W; x++) {
      const gap = cov[x] <= limit;
      if (gap && start < 0) start = x;
      if ((!gap || x === W - 1) && start >= 0) {
        const end = gap ? x : x - 1;
        if (start > 0 && end < W - 1 && end - start >= 2) seps.push({ g0: minX + start, g1: minX + end, x: minX + (start + end) / 2 });
        start = -1;
      }
    }
    return seps;
  }

  function linesToRows(lines, seps) {
    return lines.map(function (L) {
      const row = new Array(seps.length + 1).fill("");
      if (L.single) { row[0] = L.cells[0].s; return row; }
      L.cells.forEach(function (c) {
        const mid = (c.x0 + c.x1) / 2;
        let k = 0; while (k < seps.length && mid > seps[k].x) k++;
        // すき間の中にある文字（左寄せの見出しなど）は、すき間の右の列に入れる
        for (let g = 0; g < seps.length; g++) if (mid >= seps[g].g0 && mid <= seps[g].g1) { k = g + 1; break; }
        row[k] = row[k] ? row[k] + " " + c.s : c.s;
      });
      return row;
    });
  }

  // 見出しだけが入った細い列（見出しは左寄せ・数字は右寄せのときにできる）を、隣の列にまとめる
  function mergeSparse(rows) {
    let changed = true;
    while (changed) {
      changed = false;
      const n = rows[0] ? rows[0].length : 0;
      if (n < 2) break;
      const filled = [];
      for (let k = 0; k < n; k++) filled.push(rows.reduce(function (a, r) { return a + (r[k] ? 1 : 0); }, 0));
      const lim = Math.max(1, Math.floor(rows.length * 0.08));
      for (let k = 0; k < n; k++) {
        if (filled[k] === 0 || filled[k] > lim) continue;
        const clash = function (j) { return rows.some(function (r) { return r[k] && r[j]; }); };
        const cand = [k + 1, k - 1].filter(function (j) { return j >= 0 && j < n && filled[j] > lim && !clash(j); });
        if (!cand.length) continue;
        const j = cand[0];
        rows.forEach(function (r) { if (r[k]) r[j] = r[k]; r.splice(k, 1); });
        changed = true; break;
      }
      if (!changed) {
        const e = filled.indexOf(0);
        if (e >= 0) { rows.forEach(function (r) { r.splice(e, 1); }); changed = true; }
      }
    }
    return rows;
  }

  function pageToTable(items, opList, OPS) {
    const R = opList && OPS ? rulesToSeps(verticalRules(opList, OPS)) : null;
    const lines = groupLines(itemsToCells(items), R ? R.inner.map(function (g) { return g.x; }) : []);
    const seps = R ? R.inner : findColumns(lines);
    // 表の幅いっぱいに1つだけ文字がある行（表題・注記）は、先頭の列に置く
    lines.forEach(function (L) { if (L.cells.length === 1 && seps.length && (L.cells[0].x1 - L.cells[0].x0) > 120) L.single = true; });
    const rows = mergeSparse(linesToRows(lines, seps));
    return { rows: rows, ncol: rows[0] ? rows[0].length : 0 };
  }

  // ---------- 検算 ----------
  function toNum(s) {
    if (s == null) return null;
    let t = String(s).normalize("NFKC").replace(/[\s,円¥$]/g, "");
    let neg = false;
    if (/^[▲△-]/.test(t)) { neg = true; t = t.slice(1); }
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/%$/, "");
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const v = parseFloat(t);
    return neg ? -v : v;
  }
  // 「合計」「小計」「計」の行があれば、その上の数字の合計と突き合わせる
  function verify(rows) {
    const out = [];
    const ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    let blockStart = 0;
    rows.forEach(function (r, i) {
      const label = r.join(" ");
      if (/(^|\s)(総?合計|小計|計|総額|Total|TOTAL)(\s|$)/.test(label) || /^(総?合計|小計|計)$/.test((r[0] || "").replace(/\s/g, ""))) {
        for (let c = 0; c < ncol; c++) {
          const tv = toNum(r[c]);
          if (tv == null) continue;
          let sum = 0, n = 0;
          for (let j = blockStart; j < i; j++) {
            const v = toNum(rows[j][c]);
            if (v != null && !/(小計|合計)/.test(rows[j].join(""))) { sum += v; n++; }
          }
          if (n >= 2) out.push({ row: i, col: c, total: tv, sum: Math.round(sum * 100) / 100, ok: Math.abs(sum - tv) < 0.005 * Math.max(1, Math.abs(tv)) });
        }
        if (/小計/.test(label)) {} else blockStart = i + 1;
      }
    });
    return out;
  }

  // 罫線（縦線）の x 座標を集める。pdf.js の getOperatorList() の結果と OPS を渡す
  function verticalRules(opList, OPS) {
    const xs = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = function (m, n) { return [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]]; };
    const tp = function (x, y) { return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]; };
    const segs = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], a = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.constructPath) {
        const ops = a[0], co = a[1]; let j = 0, cur = null;
        for (const o of ops) {
          if (o === OPS.moveTo) { cur = tp(co[j], co[j + 1]); j += 2; }
          else if (o === OPS.lineTo) { const n = tp(co[j], co[j + 1]); j += 2; if (cur) segs.push([cur[0], cur[1], n[0], n[1]]); cur = n; }
          else if (o === OPS.rectangle) {
            const p0 = tp(co[j], co[j + 1]), p1 = tp(co[j] + co[j + 2], co[j + 1] + co[j + 3]); j += 4;
            const w = Math.abs(p1[0] - p0[0]), h = Math.abs(p1[1] - p0[1]);
            if (w < 3 && h > 5) segs.push([(p0[0] + p1[0]) / 2, p0[1], (p0[0] + p1[0]) / 2, p1[1]]);
            else if (h < 3 && w > 5) segs.push([p0[0], (p0[1] + p1[1]) / 2, p1[0], (p0[1] + p1[1]) / 2]);
          }
          else if (o === OPS.curveTo) j += 6; else if (o === OPS.curveTo2 || o === OPS.curveTo3) j += 4;
        }
      }
    }
    segs.forEach(function (g) { if (Math.abs(g[0] - g[2]) < 1 && Math.abs(g[1] - g[3]) > 5) xs.push({ x: g[0], y0: Math.min(g[1], g[3]), y1: Math.max(g[1], g[3]) }); });
    return xs;
  }
  // 縦線をまとめて、列の区切りにする（ある程度の長さ・本数があるものだけ）
  function rulesToSeps(rules) {
    if (rules.length < 3) return null;
    rules.sort(function (a, b) { return a.x - b.x; });
    const groups = [];
    rules.forEach(function (r) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g.x - r.x) < 2) { g.len += r.y1 - r.y0; g.y0 = Math.min(g.y0, r.y0); g.y1 = Math.max(g.y1, r.y1); }
      else groups.push({ x: r.x, len: r.y1 - r.y0, y0: r.y0, y1: r.y1 });
    });
    if (groups.length < 3) return null;
    const maxLen = Math.max.apply(null, groups.map(function (g) { return g.len; }));
    const keep = groups.filter(function (g) { return g.len >= maxLen * 0.3; });
    if (keep.length < 3) return null;
    return { inner: keep.slice(1, -1).map(function (g) { return { x: g.x, g0: g.x, g1: g.x }; }), left: keep[0].x, right: keep[keep.length - 1].x, y0: Math.min.apply(null, keep.map(function (g) { return g.y0; })), y1: Math.max.apply(null, keep.map(function (g) { return g.y1; })) };
  }

  const API = { itemsToCells: itemsToCells, groupLines: groupLines, findColumns: findColumns, verticalRules: verticalRules, rulesToSeps: rulesToSeps, pageToTable: pageToTable, toNum: toNum, verify: verify };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.P2X = API;
})(this);
