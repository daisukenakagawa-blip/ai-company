// Web の表を2次元の配列にする。結合セル（rowspan / colspan）を展開し、Excel で文字化けしない CSV を作る。
// ブラウザ（拡張機能のページ内）でも Node の試験でも使えるよう、DOM の型に依存しない書き方にする。
(function (root) {
  function cellText(cell) {
    // 画面に見える文字（改行は残し、連続する空白は1つに）。非表示の要素は innerText が除く
    const t = (cell.innerText != null ? cell.innerText : cell.textContent) || '';
    return t.replace(/ /g, ' ').split('\n').map((s) => s.replace(/[ \t]+/g, ' ').trim()).filter((s, i, a) => s || (i > 0 && i < a.length - 1)).join('\n').trim();
  }

  // fill: 'repeat' = 結合されたすべてのマスに同じ値を入れる（集計・並べ替えに向く）／'first' = 左上だけに値、他は空
  function tableToMatrix(table, fill) {
    fill = fill || 'repeat';
    const grid = [];
    const rows = Array.from(table.rows || []);
    rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      Array.from(tr.cells).forEach((cell) => {
        while (grid[r][c] !== undefined) c++;
        const rs = Math.max(1, Math.min(parseInt(cell.getAttribute('rowspan') || '1', 10) || 1, 1000));
        const csRaw = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
        const cs = Math.max(1, Math.min(csRaw, 1000));
        const v = cellText(cell);
        for (let i = 0; i < rs && r + i < rows.length; i++) {
          grid[r + i] = grid[r + i] || [];
          for (let j = 0; j < cs; j++) {
            grid[r + i][c + j] = fill === 'repeat' || (i === 0 && j === 0) ? v : '';
          }
        }
        c += cs;
      });
    });
    const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
    return grid.map((row) => Array.from({ length: width }, (_, i) => (row[i] === undefined ? '' : row[i])));
  }

  function toCSV(matrix, opts) {
    opts = opts || {};
    const sep = opts.sep || ',';
    const esc = (v) => {
      let s = String(v);
      // 先頭が = + - @ の値は Excel が式として実行しうる（CSV インジェクション）→ 先頭に ' を付ける
      if (opts.safeFormulas !== false && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const body = matrix.map((row) => row.map(esc).join(sep)).join('\r\n') + '\r\n';
    return (opts.bom === false ? '' : '﻿') + body; // BOM 付き UTF-8：Excel でダブルクリックしても文字化けしない
  }

  function toTSV(matrix) {
    // 貼り付け用：タブ区切り。セル内の改行やタブは空白に
    return matrix.map((row) => row.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  }

  function describe(table, index) {
    const m = tableToMatrix(table, 'first');
    const cap = table.caption ? cellText(table.caption) : '';
    const head = (m[0] || []).filter(Boolean).slice(0, 4).join(' / ');
    return { index, rows: m.length, cols: m[0] ? m[0].length : 0, label: (cap || head || '（見出しなし）').slice(0, 60),
             merged: !!table.querySelector('[rowspan]:not([rowspan="1"]),[colspan]:not([colspan="1"])') };
  }

  const api = { cellText, tableToMatrix, toCSV, toTSV, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TableExportCore = api;
})(typeof self !== 'undefined' ? self : this);
