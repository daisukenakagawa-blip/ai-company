/* 商品コードの検査 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var C = window.CODEK;
  var LIMIT = window.CODEK_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", last: null };
  var SHOW = 500;

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return C.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    var col = C.guessColumn(S.headers, S.rows);
    $("col").innerHTML = '<option value="">（選んでください）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (col === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
    $("kind").value = C.guessMode(S.headers, col);
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを調べます。</span>" : "");
    ["step2", "out"].forEach(function (id) { $(id).hidden = false; });
    refresh();
  }
  function readFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg").textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          // 数値のセルは表示の形（4.90E+12 など）ではなく、中の数をそのまま使う
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" })
            .map(function (r) { return r.map(function (v) { return typeof v === "number" ? (Number.isInteger(v) && Math.abs(v) < 1e21 ? BigIntStr(v) : String(v)) : String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = C.decodeBytes(buf);
        setData(C.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }
  function BigIntStr(v) { return v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }); }

  // ---------- 調べる ----------
  function gen() { return document.querySelector("input[name=job]:checked").value === "gen"; }
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  var BAD = { check: 1, len: 1, notnum: 1, exp: 1, zero: 1 };
  function refresh() {
    var col = $("col").value;
    if (col === "") { $("sumMsg").textContent = "番号の列を選んでください。"; $("listView").innerHTML = ""; $("dupView").innerHTML = ""; S.last = null; return; }
    var t0 = Date.now();
    var R = C.run(S.rows, +col, { mode: $("kind").value, gen: gen() });
    S.last = R; S.col = +col;
    var c = R.count, okN = (c.ok || 0) + (c.fixed || 0), badN = 0;
    Object.keys(BAD).forEach(function (k) { badN += c[k] || 0; });
    var parts = gen()
      ? ["末尾を付けた " + (c.ok || 0) + " 件", (badN ? '<span class="bad">付けられない ' + badN + " 件</span>" : "付けられない 0 件")]
      : ["正しい " + okN + " 件" + (c.fixed ? "（うち書き方を整えた " + c.fixed + " 件）" : ""),
        (badN ? '<span class="bad">問題あり ' + badN + " 件</span>" : "問題あり 0 件") +
        (badN ? "（" + ["check", "len", "zero", "notnum", "exp"].filter(function (k) { return c[k]; }).map(function (k) { return LAB[k] + " " + c[k]; }).join("・") + "）" : "")];
    if (R.dups.length) parts.push('<span class="wtxt">同じ番号が2回以上 ' + R.dups.length + " 組</span>");
    if (c.blank) parts.push("空欄 " + c.blank + " 行");
    $("sumMsg").innerHTML = parts.join("　/　") + '<span class="note">（' + S.rows.length + " 行、" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); dupView();
  }
  var LAB = { check: "チェックデジット違い", len: "桁数違い", zero: "先頭の0が消えた", notnum: "数字以外", exp: "指数表記" };

  function problemRows() {
    var only = $("onlyBad").checked;
    return S.last.res.filter(function (x) { return only ? (BAD[x.status] || x.status === "fixed" || x.dup || (x.note && !gen())) : x.status !== "blank"; });
  }
  function listView() {
    var list = problemRows(), g = gen();
    if (!list.length) { $("listView").innerHTML = "<p>" + ($("onlyBad").checked ? (g ? "すべての行に末尾の数字を付けられました。" : "問題のある番号はありません。") : "番号がありません。") + "</p>"; return; }
    var h = '<div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>元の値</th><th>判定</th><th>種類</th><th>' + (g ? "末尾を付けた番号" : "整えた番号・直した案") + "</th><th>メモ</th></tr></thead><tbody>";
    list.slice(0, SHOW).forEach(function (x) {
      var cls = BAD[x.status] ? "bad" : x.status === "fixed" ? "wtxt" : "";
      var memo = [x.msg, x.note, x.dup ? "同じ番号：" + x.dup.filter(function (y) { return y !== x; }).map(function (y) { return "行" + rowNo(y.i); }).join("・") : "", x.isbn13 ? "13桁なら " + x.isbn13 : ""].filter(Boolean).join("　");
      h += '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.raw) + '</td><td class="' + cls + '">' + esc(x.label) + "</td><td>" + esc(x.kindLabel || "") +
        "</td><td>" + esc(x.guess ? x.guess + "（案）" : x.fixed || "") + "</td><td class=\"wrap\">" + esc(memo) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (list.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 行を出しています（全 " + list.length + " 行は保存すると入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function dupView() {
    var d = S.last.dups;
    if (!d.length) { $("dupView").innerHTML = '<p class="note">同じ番号が2回以上出てくる行はありません。</p>'; return; }
    $("dupView").innerHTML = '<h3>同じ番号が2回以上（' + d.length + ' 組）</h3><div class="scroll"><table class="lt"><thead><tr><th>番号</th><th class="n">回数</th><th>行</th></tr></thead><tbody>' +
      d.slice(0, SHOW).map(function (g) { return "<tr><td>" + esc(g.list[0].fixed || g.key) + '</td><td class="n">' + g.list.length + '</td><td class="wrap">' + g.list.map(function (x) { return rowNo(x.i) + (x.raw !== g.list[0].raw ? "（" + esc(x.raw) + "）" : ""); }).join("・") + "</td></tr>"; }).join("") +
      "</tbody></table></div><p class=\"note\">13桁と、先頭に0を付けた14桁、ISBN の10桁と13桁は、同じ番号として数えます。</p>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function detailRows(onlyBad) {
    var g = gen(), out = [S.headers.concat(g ? ["末尾を付けた番号", "種類", "判定", "メモ"] : ["整えた番号", "種類", "判定", "直した案（末尾だけ）", "ISBN-13", "同じ番号の行", "メモ"])];
    S.last.res.forEach(function (x, i) {
      if (onlyBad && !(BAD[x.status] || x.dup)) return;
      var dup = x.dup ? x.dup.filter(function (y) { return y !== x; }).map(function (y) { return rowNo(y.i); }).join("・") : "";
      var memo = [x.msg, x.note].filter(Boolean).join("　");
      out.push(S.rows[i].concat(g ? [x.fixed || "", x.kindLabel || "", x.label, memo] : [x.fixed || "", x.kindLabel || "", x.label, x.guess || "", x.isbn13 || "", dup, memo]));
    });
    return out;
  }
  function saveName(kind, ext) { return (gen() ? "番号_末尾付け_" : "番号_検査_") + kind + "_" + ymd() + "." + ext; }
  function done(name) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function saveCSV(onlyBad) {
    if (!S.last) return;
    var name = saveName(onlyBad ? "問題の行" : "明細", "csv");
    var blob = new Blob([C.toCSV(detailRows(onlyBad))], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    done(name);
  }
  function saveXLSX() {
    if (!S.last) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var rows = detailRows(false);
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    // すべて文字列のセルにする（Excel で開いても 4.90E+12 や先頭の0の消えが起きない）
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!") { ws[k].t = "s"; ws[k].z = "@"; } });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "検査結果");
    var name = saveName("明細", "xlsx");
    XLSX.writeFile(wb, name);
    done(name);
  }

  // ---------- 印刷 ----------
  function printList() {
    if (!S.last) return;
    var list = S.last.res.filter(function (x) { return BAD[x.status] || x.dup; }), g = gen();
    var title = $("title").value.trim() || (g ? "末尾の数字を付けられなかった番号" : "商品コードの検査結果");
    var c = S.last.count;
    var cond = "列「" + S.headers[S.col] + "」" + S.rows.length + " 行" + (S.name ? "（" + S.name + "）" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP");
    var body = list.length ? '<table class="pt"><thead><tr><th class="n">行</th><th>元の値</th><th>判定</th><th>' + (g ? "" : "直した案") + "</th><th>メモ</th></tr></thead><tbody>" +
      list.map(function (x) {
        var memo = [x.msg, x.dup ? "同じ番号：" + x.dup.filter(function (y) { return y !== x; }).map(function (y) { return "行" + rowNo(y.i); }).join("・") : ""].filter(Boolean).join("　");
        return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.raw) + "</td><td>" + esc(BAD[x.status] ? x.label : "同じ番号") + "</td><td>" + esc(x.guess || (x.status === "zero" ? x.fixed : "")) + "</td><td>" + esc(memo) + '</td></tr>';
      }).join("") + "</tbody></table>" : "<p>問題のある番号・同じ番号はありません。</p>";
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" +
      '<p class="per">正しい ' + ((c.ok || 0) + (c.fixed || 0)) + " 件、問題あり " + list.filter(function (x) { return BAD[x.status]; }).length + " 件、同じ番号 " + S.last.dups.length + " 組</p>" + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の商品。番号は説明用で、実在の商品とは関係ありません） ----------
  var SAMPLE = "品名\tJANコード\t単価\n" +
    "見本のノート A5\t4900000000016\t180\n見本のノート B5\t4900000000023\t200\n見本のボールペン 黒\t4900000000030\t120\n" +
    "見本のボールペン 赤\t4900000000037\t120\n見本の付せん\t４９０００００００００５４\t150\n見本のクリップ\t49-00000-00006-1\t90\n" +
    "見本の消しゴム\t4.90E+12\t80\n見本の定規 15cm\t490000000008\t110\n見本のはさみ\t4900000000016\t380\n" +
    "見本ののり\t4900000000092.0\t130\n見本の封筒（店内）\t2000000000107\t50\n見本の手帳\t49000OOOOO115\t900\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  function saveSettings() { try { localStorage.setItem("code-kensa", JSON.stringify({ title: $("title").value, onlyBad: $("onlyBad").checked })); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("code-kensa") || "{}"); if (o.title != null) $("title").value = o.title; if (o.onlyBad != null) $("onlyBad").checked = o.onlyBad; } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(C.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(C.parseCSV(SAMPLE), true, "見本"); };
    ["col", "kind"].forEach(function (id) { $(id).onchange = refresh; });
    $("onlyBad").onchange = function () { saveSettings(); if (S.last) listView(); };
    [].forEach.call(document.querySelectorAll("input[name=job]"), function (r) { r.onchange = function () { $("genNote").hidden = !gen(); if (S.rows.length) refresh(); }; });
    $("title").onchange = saveSettings;
    $("pList").onclick = printList;
    $("cAll").onclick = function () { saveCSV(false); }; $("cBad").onclick = function () { saveCSV(true); }; $("xAll").onclick = saveXLSX;
  });
})();
