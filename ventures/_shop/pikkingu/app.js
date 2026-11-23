/* ピッキングリストと仕分け表 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.PIKKING;
  var LIMIT = window.PIKKING_LIMIT || Infinity; // お試し版は各表の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { A: { headers: [], rows: [], cols: {}, name: "" }, B: { headers: [], rows: [], cols: {}, name: "" } };
  var S = { last: null, mst: null, L: null };
  var COLS = {
    A: [["order", "注文番号"], ["code", "品番・コード"], ["name", "品名"], ["qty", "数量（必須）"], ["shelf", "棚番（任意）"], ["dest", "お届け先（任意）"]],
    B: [["code", "品番（必須）"], ["name", "品名（任意）"], ["shelf", "棚番（必須）"]]
  };

  // ---------- 読み込み ----------
  function setData(k, rows, hasHead, name) {
    var t = T[k];
    if (!rows.length) { $("loadMsg" + k).textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    t.headers = hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    t.rows = hasHead ? rows.slice(1) : rows;
    t.hasHead = hasHead; t.name = name || "";
    var total = t.rows.length;
    if (t.rows.length > LIMIT) t.rows = t.rows.slice(0, LIMIT);
    t.cols = K.guessColumns(t.headers);
    if (k === "B") { var c = t.cols; t.cols = {}; ["code", "name", "shelf"].forEach(function (r) { if (c[r] != null) t.cols[r] = c[r]; }); }
    $("loadMsg" + k).innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを使います。</span>" : "");
    drawCols(k);
    refresh();
  }
  function drawCols(k) {
    var t = T[k], el = $("cols" + k);
    el.hidden = false;
    el.innerHTML = COLS[k].map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        t.headers.map(function (h, i) { return '<option value="' + i + '"' + (t.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete t.cols[sel.dataset.k]; else t.cols[sel.dataset.k] = +sel.value; refresh(); };
    });
  }
  function readFile(k, file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg" + k).textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(k, rows, $("hasHead" + k).checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg" + k).textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(k, K.parseCSV(d.text), $("hasHead" + k).checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function rowNo(k, i) { return i + (T[k].hasHead ? 2 : 1); }
  function opt() { return { hyphen: $("hyphen").checked, inherit: $("inherit").checked, batch: Math.max(0, parseInt($("batch").value, 10) || 0) }; }
  function refresh() {
    var ready = T.A.rows.length > 0;
    $("optBox").hidden = !ready; $("out").hidden = !ready;
    if (!ready) { S.last = null; return; }
    var c = T.A.cols, miss = [];
    if (c.qty == null) miss.push("受注明細の「数量」");
    if (c.code == null && c.name == null) miss.push("受注明細の「品番」か「品名」");
    if (T.B.rows.length && (T.B.cols.code == null || T.B.cols.shelf == null)) miss.push("商品マスタの「品番」と「棚番」");
    if (miss.length) { S.last = null; $("sumMsg").innerHTML = '<span class="bad">' + esc(miss.join("、")) + " の列を選んでください。</span>"; $("listView").innerHTML = ""; $("errView").innerHTML = ""; $("bsel").hidden = true; return; }
    var o = opt(), t0 = Date.now();
    S.mst = T.B.rows.length ? K.master(T.B.rows, T.B.cols, o) : null;
    S.L = K.collect(T.A.rows, T.A.cols, o, S.mst);
    S.last = K.run(S.L.lines, o);
    var n = S.last.count, parts = [];
    parts.push("<b>注文 " + n.orders + " 件</b>" + (c.order == null ? "（注文番号の列なし：全部で1件として扱います）" : ""));
    parts.push("<b>品 " + n.items + " 種類・合計 " + K.fmt(n.qty) + " 点</b>（明細 " + n.lines + " 行）");
    if (S.last.batches.length > 1) parts.push("まとまり " + S.last.batches.length + " 個");
    if (n.noShelf) parts.push('<span class="wtxt">棚番なし ' + n.noShelf + " 種類</span>");
    if (n.multiShelf) parts.push('<span class="wtxt">棚番が2か所以上 ' + n.multiShelf + " 種類</span>");
    if (S.mst) parts.push("商品マスタ " + S.mst.n + " 品" + (S.mst.dup.length ? '（<span class="wtxt">同じ品番で棚番が違う行 ' + S.mst.dup.length + "、先の行を使用</span>）" : ""));
    if (S.L.errs.length) parts.push('<span class="bad">読めない行 ' + S.L.errs.length + "</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    var bs = S.last.batches;
    $("bsel").hidden = bs.length < 2;
    var cur = +$("bno").value || 1;
    $("bno").innerHTML = bs.map(function (b) { return '<option value="' + b.no + '"' + (b.no === cur ? " selected" : "") + ">" + esc(bLabel(b)) + "</option>"; }).join("");
    listView(); errView();
  }
  function ordName(o) { return o.order || "（注文番号なし）"; }
  function bLabel(b) {
    var a = b.orders[0], z = b.orders[b.orders.length - 1];
    return b.no + "（注文 " + a.no + "〜" + z.no + " 件目：" + ordName(a) + (a === z ? "" : " 〜 " + ordName(z)) + "）";
  }
  function listView() {
    var b = S.last.batches[(+$("bno").value || 1) - 1] || S.last.batches[0];
    if (!b) { $("listView").innerHTML = "<p>使える明細の行がありません。</p>"; return; }
    var h = "<h3>ピッキングリスト（棚番の順）" + (S.last.batches.length > 1 ? "：まとまり " + esc(bLabel(b)) : "") + "</h3>";
    h += '<div class="scroll"><table class="lt"><thead><tr><th>棚番</th><th>品番</th><th>品名</th><th class="n">数</th><th class="n">注文</th><th>配分（注文番号×数）</th><th>メモ</th></tr></thead><tbody>';
    b.items.slice(0, SHOW).forEach(function (x) {
      h += "<tr><td>" + esc(x.shelf) + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + '</td><td class="n"><b>' + K.fmt(x.qty) + '</b></td><td class="n">' + x.orders.length + '</td><td class="wrap">' + esc(distText(x)) + '</td><td class="wrap wtxt">' + esc(x.notes.join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (b.items.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 品を出しています（全部は印刷・保存に入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function distText(x) { return x.orders.map(function (o) { return ordName(o) + "×" + K.fmt(o.qty); }).join("、"); }
  function errView() {
    var e = S.L.errs;
    $("errView").innerHTML = e.length ? '<h3>読めなかった行（リストに入れていません）</h3><div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>注文番号</th><th>品番</th><th>品名</th><th>理由</th></tr></thead><tbody>' +
      e.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo("A", x.i) + "</td><td>" + esc(x.order) + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + '</td><td class="bad">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
  }

  // ---------- 印刷 ----------
  function head(kind, b) {
    var title = ($("title").value.trim() || "出荷") + "　" + kind;
    var nb = S.last.batches.length;
    var cond = [$("memo").value.trim(), nb > 1 ? "まとまり " + bLabel(b) : "", "注文 " + b.orders.length + " 件・品 " + b.items.length + " 種類・合計 " + K.fmt(b.qty) + " 点", "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    return "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>";
  }
  function printList() {
    if (!S.last) return;
    $("printArea").innerHTML = S.last.batches.map(function (b) {
      return '<div class="pg">' + head("ピッキングリスト", b) + '<table class="pt"><thead><tr><th>確認</th><th>棚番</th><th>品番</th><th>品名</th><th class="n">数</th><th class="n">注文</th><th>メモ</th></tr></thead><tbody>' +
        b.items.map(function (x) { return '<tr><td class="ck"></td><td class="nw big">' + esc(x.shelf) + '</td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="n big">' + K.fmt(x.qty) + '</td><td class="n">' + x.orders.length + "</td><td>" + esc(x.notes.join("　")) + "</td></tr>"; }).join("") +
        '</tbody></table><p class="sign">集品者 <span></span>日時 <span></span>確認 <span></span></p></div>';
    }).join("");
    window.print();
  }
  function orderBlock(o) {
    return '<div class="ob"><h2>' + esc(ordName(o)) + (o.dest ? "　" + esc(o.dest) : "") + '　<span style="font-weight:400;font-size:9pt">（' + o.kinds + " 種類・" + K.fmt(o.qty) + " 点）</span></h2>" +
      '<table class="pt"><thead><tr><th>確認</th><th>棚番</th><th>品番</th><th>品名</th><th class="n">数</th></tr></thead><tbody>' +
      o.lines.map(function (l) { return '<tr><td class="ck"></td><td class="nw">' + esc(l.shelf) + '</td><td class="nw">' + esc(l.code) + '</td><td class="nm">' + esc(l.name) + '</td><td class="n big">' + K.fmt(l.qty) + "</td></tr>"; }).join("") +
      '</tbody></table><p class="sign">梱包者 <span></span>確認 <span></span></p></div>';
  }
  function printSort() {
    if (!S.last) return;
    var one = $("onePage").checked;
    $("printArea").innerHTML = S.last.batches.map(function (b) {
      if (one) return b.orders.map(function (o, j) { return '<div class="pg">' + (j === 0 ? head("仕分け表", b) : '<p class="per">' + esc(($("title").value.trim() || "出荷") + "　仕分け表") + "</p>") + orderBlock(o) + "</div>"; }).join("");
      return '<div class="pg">' + head("仕分け表", b) + b.orders.map(orderBlock).join("") + "</div>";
    }).join("");
    window.print();
  }
  function printDist() {
    if (!S.last) return;
    $("printArea").innerHTML = S.last.batches.map(function (b) {
      return '<div class="pg">' + head("配分表", b) + '<table class="pt"><thead><tr><th>棚番</th><th>品番</th><th>品名</th><th class="n">合計</th><th>注文番号 × 数（確認）</th></tr></thead><tbody>' +
        b.items.map(function (x) { return '<tr><td class="nw">' + esc(x.shelf) + '</td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="n big">' + K.fmt(x.qty) + "</td><td>" + x.orders.map(function (o) { return "□ " + esc(ordName(o)) + " × <b>" + K.fmt(o.qty) + "</b>"; }).join("　") + "</td></tr>"; }).join("") +
        "</tbody></table></div>";
    }).join("");
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function rowsList() {
    var out = [["まとまり", "棚番", "品番", "品名", "数", "注文の件数", "配分（注文番号×数）", "元の行", "メモ"]];
    S.last.batches.forEach(function (b) { b.items.forEach(function (x) { out.push([b.no, x.shelf, x.code, x.name, x.qty, x.orders.length, distText(x), x.rows.map(function (i) { return rowNo("A", i); }).join("・"), x.notes.join("　")]); }); });
    return out;
  }
  function rowsSort() {
    var out = [["まとまり", "注文の順", "注文番号", "お届け先", "棚番", "品番", "品名", "数", "元の行"]];
    S.last.batches.forEach(function (b) { b.orders.forEach(function (o) { o.lines.forEach(function (l) { out.push([b.no, o.no, o.order, o.dest, l.shelf, l.code, l.name, l.qty, rowNo("A", l.i)]); }); }); });
    return out;
  }
  function rowsDist() {
    var out = [["まとまり", "棚番", "品番", "品名", "注文番号", "数"]];
    S.last.batches.forEach(function (b) { b.items.forEach(function (x) { x.orders.forEach(function (o) { out.push([b.no, x.shelf, x.code, x.name, o.order, o.qty]); }); }); });
    return out;
  }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (LIMIT < Infinity ? "お試し版は各表の先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, numCols, widths) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) { if (ri > 0 && numCols.indexOf(ci) >= 0 && typeof v === "number") return v; return String(v == null ? "" : v); });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; }); // 品番・注文番号は文字のまま（先頭の0を消さない）
    ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  function saveX() {
    if (!S.last) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), a = rowsList(), b = rowsSort(), c = rowsDist();
    XLSX.utils.book_append_sheet(wb, sheet(a, [0, 4, 5], [8, 10, 14, 28, 8, 8, 40, 12, 30]), "ピッキングリスト");
    XLSX.utils.book_append_sheet(wb, sheet(b, [0, 1, 7], [8, 8, 14, 18, 10, 14, 28, 8, 8]), "仕分け");
    XLSX.utils.book_append_sheet(wb, sheet(c, [0, 5], [8, 10, 14, 28, 14, 8]), "配分");
    var name = "ピッキング_" + ymd() + ".xlsx";
    XLSX.writeFile(wb, name); done(name, a.length - 1);
  }
  function saveC(kind) {
    if (!S.last) return;
    var rows = kind === "list" ? rowsList() : rowsSort();
    var name = (kind === "list" ? "ピッキングリスト_" : "仕分け表_") + ymd() + ".csv";
    dlBlob(K.toCSV(rows), name); done(name, rows.length - 1);
  }

  // ---------- 見本（架空の注文・品。実在の店・商品・人とは関係ありません） ----------
  var SAMPLE_A = "注文番号\tお届け先\t商品コード\t商品名\t数量\n" +
    "1001\t見本 一郎\tMS-101\t見本のマグカップ 白\t2\n\t\tMS-205\t見本のコースター\t4\n" +
    "1002\t見本 花子\tMS-101\t見本のマグカップ 白\t1\n1002\t見本 花子\tMS-310\t見本の手ぬぐい 藍\t1\n" +
    "1003\t見本 次郎\tMS-102\t見本のマグカップ 黒\t1\n1003\t見本 次郎\tMS205\t見本のコースター\t2\n1003\t見本 次郎\tMS-410\t見本のギフト箱\t1\n" +
    "1004\t見本 商店\tMS-310\t見本の手ぬぐい 藍\t5\n1004\t見本 商店\tMS-999\t見本の限定品\t1\n" +
    "1005\t見本 三郎\tMS-102\t見本のマグカップ 黒\t未定\n";
  var SAMPLE_B = "商品コード\t商品名\t棚番\n" +
    "MS-101\t見本のマグカップ 白\tA-2\nMS-102\t見本のマグカップ 黒\tA-10\nMS-205\t見本のコースター\tA-1\n" +
    "MS-310\t見本の手ぬぐい 藍\tB-3\nMS-410\t見本のギフト箱\tC-12\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["inherit", "hyphen", "onePage"];
  function saveSettings() { try { var o = { title: $("title").value, batch: $("batch").value }; KEYS.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("pikkingu", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("pikkingu") || "{}"); if (o.title != null) $("title").value = o.title; if (o.batch != null) $("batch").value = o.batch; KEYS.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    ["A", "B"].forEach(function (k) {
      $("file" + k).onchange = function () { if (this.files[0]) readFile(k, this.files[0]); };
      var dz = $("drop" + k);
      dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
      dz.ondragleave = function () { dz.classList.remove("over"); };
      dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(k, e.dataTransfer.files[0]); };
      $("pasteGo" + k).onclick = function () { var t = $("paste" + k).value; if (t.trim()) setData(k, K.parseCSV(t), $("hasHead" + k).checked, "貼り付けたデータ"); };
    });
    $("clearB").onclick = function () { T.B = { headers: [], rows: [], cols: {}, name: "" }; $("colsB").hidden = true; $("loadMsgB").textContent = "商品マスタを外しました。"; $("pasteB").value = ""; $("fileB").value = ""; refresh(); };
    $("sample").onclick = function () {
      $("pasteA").value = SAMPLE_A; $("pasteB").value = SAMPLE_B; $("hasHeadA").checked = $("hasHeadB").checked = true;
      setData("B", K.parseCSV(SAMPLE_B), true, "見本の商品マスタ"); setData("A", K.parseCSV(SAMPLE_A), true, "見本の受注明細");
    };
    ["inherit", "hyphen"].forEach(function (id) { $(id).onchange = function () { saveSettings(); refresh(); }; });
    $("batch").oninput = function () { saveSettings(); refresh(); };
    $("bno").onchange = function () { if (S.last) listView(); };
    $("onePage").onchange = saveSettings; $("title").onchange = saveSettings;
    $("pList").onclick = printList; $("pSort").onclick = printSort; $("pDist").onclick = printDist;
    $("xAll").onclick = saveX; $("cList").onclick = function () { saveC("list"); }; $("cSort").onclick = function () { saveC("sort"); };
  });
})();
