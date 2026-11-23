/* ケース・バラの数の換算 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.IRISU;
  var LIMIT = window.IRISU_LIMIT || Infinity; // お試し版は換算する表の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { headers: [], rows: [], cols: {}, hasHead: true };   // 換算する表
  var M = { headers: [], rows: [], cols: {}, hasHead: true };   // 入数の表
  var S = { last: null };
  var COLS = [["code", "品番・コード"], ["name", "品名"], ["qty", "数量（必須）"], ["unit", "単位（任意）"], ["cs", "ケース入数（任意）"], ["bl", "ボール入数（任意）"]];
  var COLS2 = [["code", "品番・コード"], ["name", "品名"], ["cs", "ケース入数"], ["bl", "ボール入数"]];
  var LV = { pc: "バラ", cs: "ケース", bl: "ボール" };

  // ---------- 読み込み ----------
  function prep(rows, hasHead) {
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    return {
      headers: hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); }),
      rows: hasHead ? rows.slice(1) : rows
    };
  }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var p = prep(rows, hasHead);
    T.headers = p.headers; T.rows = p.rows; T.hasHead = hasHead;
    var total = T.rows.length;
    if (T.rows.length > LIMIT) T.rows = T.rows.slice(0, LIMIT);
    T.cols = K.guessColumns(T.headers);
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを使います。</span>" : "");
    drawCols("cols", COLS, T);
    refresh();
  }
  function setMaster(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg2").textContent = "データが空です。"; return; }
    var p = prep(rows, hasHead);
    M.headers = p.headers; M.rows = p.rows; M.hasHead = hasHead;
    M.cols = K.guessColumns(M.headers, ["code", "name", "cs", "bl"]);
    M.name = name;
    drawCols("cols2", COLS2, M);
    refresh();
  }
  function drawCols(id, list, D) {
    var el = $(id);
    el.hidden = false;
    el.innerHTML = list.map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        D.headers.map(function (h, i) { return '<option value="' + i + '"' + (D.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete D.cols[sel.dataset.k]; else D.cols[sel.dataset.k] = +sel.value; refresh(); };
    });
  }
  function readFile(file, cb, msgId, headId) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $(msgId).textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          cb(rows, $(headId).checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $(msgId).textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        cb(K.parseCSV(d.text), $(headId).checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }
  function dropZone(id, fileId, cb, msgId, headId) {
    $(fileId).onchange = function () { if (this.files[0]) readFile(this.files[0], cb, msgId, headId); };
    var dz = $(id);
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0], cb, msgId, headId); };
  }

  // ---------- 計算 ----------
  function rowNo(i) { return i + (T.hasHead ? 2 : 1); }
  function mRowNo(i) { return i + (M.hasHead ? 2 : 1); }
  function units() { return K.parseUnits({ cs: $("uCs").value, bl: $("uBl").value, pc: $("uPc").value }); }
  function refresh() {
    var U = units();
    $("uMsg").innerHTML = U.dup.length ? '<span class="bad">' + esc("2つの段に入っている呼び方：" + U.dup.join("・") + "（先の段を使います）") + "</span>" : "";
    var master = null;
    if (M.rows.length) {
      if (M.cols.cs == null && M.cols.bl == null) $("loadMsg2").innerHTML = esc(M.name + "：") + '<span class="bad">「ケース入数」か「ボール入数」の列を選んでください。</span>';
      else if (M.cols.code == null && M.cols.name == null) $("loadMsg2").innerHTML = esc(M.name + "：") + '<span class="bad">「品番」か「品名」の列を選んでください。</span>';
      else {
        master = K.buildMaster(M.rows, M.cols);
        var w = master.errs.concat(master.warns);
        $("loadMsg2").innerHTML = esc(M.name + "：" + master.n + " 品の入数を読み込みました。") +
          (w.length ? '<br><span class="wtxt">' + esc(w.slice(0, 8).map(function (e) { return mRowNo(e.i) + "行目" + (e.code || e.name ? "（" + (e.code || e.name) + "）" : "") + "：" + e.err + (e.oldI != null ? "（" + mRowNo(e.oldI) + "行目）" : ""); }).join("　")) + (w.length > 8 ? "　ほか " + (w.length - 8) + " 件" : "") + "</span>" : "");
      }
    }
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) { S.last = null; return; }
    if (T.cols.qty == null) { S.last = null; $("sumMsg").innerHTML = '<span class="bad">「数量」の列を選んでください。</span>'; $("listView").innerHTML = ""; $("errView").innerHTML = ""; return; }
    if (T.cols.code == null && T.cols.name == null) { S.last = null; $("sumMsg").innerHTML = '<span class="bad">「品番」か「品名」の列を選んでください。</span>'; $("listView").innerHTML = ""; $("errView").innerHTML = ""; return; }
    var t0 = Date.now();
    S.U = U;
    S.round = $("round").value;
    S.last = K.run(T.rows, T.cols, { units: U, defLv: $("defLv").value, master: master, round: S.round });
    var c = S.last.count, parts = [];
    parts.push("<b>" + c.total + " 行</b>");
    parts.push("<b>換算できた行 " + c.conv + "</b>（" + S.last.sums.length + " 品）");
    if (c.memo) parts.push('<span class="wtxt">メモのある行 ' + c.memo + "</span>");
    if (c.err) parts.push('<span class="bad">換算できない行 ' + c.err + "</span>");
    if (c.missing) parts.push('<span class="bad">入数の表にない品 ' + c.missing + "</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function condText() {
    var U = S.U;
    return "単位の書いていない数：" + LV[$("defLv").value] + "　表示の単位：" + U.disp.cs + "・" + U.disp.bl + "・" + U.disp.pc + "　合計の切り上げ：" + { none: "しない", cs: U.disp.cs + "単位", bl: U.disp.bl + "単位" }[S.round] + "　入数：" + (M.rows.length ? "入数の表" + (T.cols.cs != null || T.cols.bl != null ? "＋表の中の入数の列" : "") : "表の中の入数の列");
  }
  function f(x) { return x == null ? "" : K.fmt(x); }
  function ruCols(r) { return S.round === "none" ? "" : '<td class="n">' + (r && !r.err ? f(r.units) : "") + '</td><td class="n"><b>' + (r && !r.err ? f(r.v) : "") + '</b></td><td class="n">' + (r && !r.err && r.add ? "+" + f(r.add) : "") + "</td>"; }
  function ruHead() { var U = S.U; return S.round === "none" ? "" : '<th class="n">発注 ' + (S.round === "cs" ? U.disp.cs : U.disp.bl) + '数</th><th class="n">発注のバラ数</th><th class="n">増える数</th>'; }
  function listView() {
    var U = S.U, h, sums = $("view").value === "sums", memo = $("filter").value === "memo";
    if (sums) {
      var it = S.last.sums.filter(function (x) { return !memo || x.notes.length; });
      h = '<div class="scroll"><table class="lt"><thead><tr><th>品番</th><th>品名</th><th class="n">行数</th><th class="n">ケース入数</th><th class="n">ボール入数</th><th class="n">バラの合計</th><th class="n">' + esc(U.disp.cs) + '</th><th class="n">' + esc(U.disp.bl) + '</th><th class="n">' + esc(U.disp.pc) + "</th><th>表記</th>" + ruHead() + "<th>メモ</th></tr></thead><tbody>";
      it.slice(0, SHOW).forEach(function (x) {
        h += "<tr><td>" + esc(x.code) + "</td><td>" + esc(x.name) + '</td><td class="n">' + x.rows + '</td><td class="n">' + f(x.cs) + '</td><td class="n">' + f(x.bl) + '</td><td class="n"><b>' + f(x.total) + '</b></td><td class="n">' + (x.cs ? f(x.sp.c) : "") + '</td><td class="n">' + (x.bl ? f(x.sp.b) : "") + '</td><td class="n">' + f(x.sp.p) + "</td><td>" + esc(x.text) + "</td>" + ruCols(x.ru) + '<td class="wrap wtxt">' + esc(x.notes.join("　")) + "</td></tr>";
      });
    } else {
      var it2 = S.last.items.filter(function (x) { return !memo || x.notes.length; });
      it = it2;
      h = '<div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>品番</th><th>品名</th><th>元の数量</th><th class="n">ケース入数</th><th class="n">ボール入数</th><th class="n">バラの数</th><th>ケース・ボール・バラ</th><th>メモ</th></tr></thead><tbody>';
      it.slice(0, SHOW).forEach(function (x) {
        h += '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.raw) + '</td><td class="n">' + f(x.cs) + '</td><td class="n">' + f(x.bl) + '</td><td class="n"><b>' + f(x.total) + "</b></td><td>" + esc(x.text) + '</td><td class="wrap wtxt">' + esc(x.notes.join("　")) + "</td></tr>";
      });
    }
    h += "</tbody></table></div>";
    if (!it.length) h = "<p>該当するものはありません。</p>";
    if (it.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 件を出しています（全部は印刷・保存に入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function errView() {
    var e = S.last.errs, miss = S.last.missing, h = "";
    if (miss.length) h += '<h3>入数の表にない品（入数の表に足すと換算できます）</h3><p class="note">' + esc(miss.slice(0, 50).map(function (x) { return (x.code ? x.code + " " : "") + x.name + "（" + x.n + " 行）"; }).join("　")) + (miss.length > 50 ? "　ほか " + (miss.length - 50) + " 品" : "") + "</p>";
    if (e.length) h += '<h3>換算できなかった行（合計に入れていません）</h3><div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>品番</th><th>品名</th><th>数量</th><th>理由</th></tr></thead><tbody>' +
      e.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.raw) + '</td><td class="bad">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function head(kind, extra) {
    var title = ($("title").value.trim() || "数の換算") + "　" + kind;
    var cond = [extra, "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    return "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + '</p><p class="per">' + esc(condText()) + "</p>";
  }
  function errNote() {
    var e = S.last.errs;
    return e.length ? '<p class="per"><b>換算できなかった行 ' + e.length + "（合計に入っていません）</b>：" + esc(e.slice(0, 30).map(function (x) { return rowNo(x.i) + "行目 " + (x.code || x.name) + " " + x.raw + "（" + x.err.replace(/（.*$/, "") + "）"; }).join("　")) + (e.length > 30 ? "　ほか " + (e.length - 30) + " 行" : "") + "</p>" : "";
  }
  function printSums() {
    if (!S.last) return;
    var U = S.U, ru = S.round !== "none";
    $("printArea").innerHTML = head("品ごとの合計", S.last.sums.length + " 品") + '<table class="pt"><thead><tr><th>済</th><th>品番</th><th>品名</th><th class="n">入数</th><th class="n">バラの合計</th><th>' + esc(U.disp.cs) + "・" + esc(U.disp.bl) + "・" + esc(U.disp.pc) + "</th>" + (ru ? '<th class="n">発注 ' + esc(S.round === "cs" ? U.disp.cs : U.disp.bl) + '</th><th class="n">発注のバラ数</th>' : "") + "<th>メモ</th></tr></thead><tbody>" +
      S.last.sums.map(function (x) {
        var r = x.ru && !x.ru.err ? x.ru : null;
        return '<tr><td class="ck"></td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="n sm">' + esc([x.cs ? U.disp.cs + " " + x.cs : "", x.bl ? U.disp.bl + " " + x.bl : ""].filter(Boolean).join(" / ")) + '</td><td class="n big">' + f(x.total) + '</td><td class="nw">' + esc(x.text) + "</td>" + (ru ? '<td class="n big">' + (r ? f(r.units) : "") + '</td><td class="n">' + (r ? f(r.v) : "") + "</td>" : "") + '<td class="sm">' + esc(x.notes.join("　")) + "</td></tr>";
      }).join("") + "</tbody></table>" + errNote() + '<p class="sign">作成 <span></span>確認 <span></span></p>';
    window.print();
  }
  function printRows() {
    if (!S.last) return;
    $("printArea").innerHTML = head("行ごとの換算", S.last.items.length + " 行") + '<table class="pt"><thead><tr><th class="n">行</th><th>品番</th><th>品名</th><th>元の数量</th><th class="n">入数</th><th class="n">バラの数</th><th>ケース・ボール・バラ</th><th>メモ</th></tr></thead><tbody>' +
      S.last.items.map(function (x) {
        return '<tr><td class="n">' + rowNo(x.i) + '</td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="nw">' + esc(x.raw) + '</td><td class="n sm">' + esc([x.cs || "", x.bl || ""].filter(Boolean).join(" / ")) + '</td><td class="n big">' + f(x.total) + '</td><td class="nw">' + esc(x.text) + '</td><td class="sm">' + esc(x.notes.join("　")) + "</td></tr>";
      }).join("") + "</tbody></table>" + errNote();
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function rowsSums() {
    var U = S.U, ru = S.round !== "none";
    var out = [["品番", "品名", "行数", "ケース入数", "ボール入数", "バラの合計", U.disp.cs, U.disp.bl, U.disp.pc, "表記"].concat(ru ? ["発注" + (S.round === "cs" ? U.disp.cs : U.disp.bl) + "数", "発注のバラ数", "増える数"] : []).concat(["メモ"])];
    S.last.sums.forEach(function (x) {
      var r = x.ru && !x.ru.err ? x.ru : null;
      out.push([x.code, x.name, x.rows, x.cs == null ? "" : x.cs, x.bl == null ? "" : x.bl, x.total, x.cs ? x.sp.c : "", x.bl ? x.sp.b : "", x.sp.p, x.text].concat(ru ? (r ? [r.units, r.v, r.add] : ["", "", ""]) : []).concat([x.notes.join("　")]));
    });
    return out;
  }
  function rowsItems() {
    var U = S.U;
    var out = [["元の行", "品番", "品名", "元の数量", "ケース入数", "ボール入数", "バラの数", U.disp.cs, U.disp.bl, U.disp.pc, "表記", "メモ"]];
    S.last.items.forEach(function (x) { out.push([rowNo(x.i), x.code, x.name, x.raw, x.cs == null ? "" : x.cs, x.bl == null ? "" : x.bl, x.total, x.cs ? x.sp.c : "", x.bl ? x.sp.b : "", x.sp.p, x.text, x.notes.join("　")]); });
    return out;
  }
  // 元の表のすべての列の後ろに、バラの数などを足す
  function rowsOrig() {
    var U = S.U, by = {}, er = {};
    S.last.items.forEach(function (x) { by[x.i] = x; });
    S.last.errs.forEach(function (x) { er[x.i] = x; });
    var out = [T.headers.concat(["バラの数", U.disp.cs, U.disp.bl, U.disp.pc, "表記", "メモ"])];
    T.rows.forEach(function (r, i) {
      var x = by[i];
      if (x) out.push(r.concat([x.total, x.cs ? x.sp.c : "", x.bl ? x.sp.b : "", x.sp.p, x.text, x.notes.join("　")]));
      else out.push(r.concat(["", "", "", "", "", er[i] ? "換算していません：" + er[i].err : ""]));
    });
    return out;
  }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (LIMIT < Infinity ? "お試し版は表の先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, numCols, widths) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) { if (ri > 0 && numCols.indexOf(ci) >= 0 && typeof v === "number") return v; return String(v == null ? "" : v); });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; }); // 品番などは文字のまま（先頭の0を消さない）
    ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  function saveX() {
    if (!S.last) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), a = rowsSums(), b = rowsItems(), c = rowsOrig(), w = T.headers.length;
    XLSX.utils.book_append_sheet(wb, sheet(a, [2, 3, 4, 5, 6, 7, 8, 10, 11, 12], [14, 28, 6, 9, 9, 10, 7, 7, 7, 20, 9, 10, 8, 30]), "品ごとの合計");
    XLSX.utils.book_append_sheet(wb, sheet(b, [0, 4, 5, 6, 7, 8, 9], [6, 14, 28, 14, 9, 9, 9, 7, 7, 7, 20, 30]), "行ごとの換算");
    XLSX.utils.book_append_sheet(wb, sheet(c, [w, w + 1, w + 2, w + 3], T.headers.map(function () { return 12; }).concat([9, 7, 7, 7, 20, 30])), "元の表とバラの数");
    var name = "数の換算_" + ymd() + ".xlsx";
    XLSX.writeFile(wb, name); done(name, b.length - 1);
  }
  function saveC(kind) {
    if (!S.last) return;
    var rows = kind === "sum" ? rowsSums() : rowsOrig();
    var name = (kind === "sum" ? "品ごとの合計_" : "バラの数つき_") + ymd() + ".csv";
    dlBlob(K.toCSV(rows), name); done(name, rows.length - 1);
  }

  // ---------- 見本（架空の品。実在の商品とは関係ありません） ----------
  var SAMPLE = "伝票番号\t商品コード\t商品名\t受注数\n" +
    "1001\tW-01\t見本の天然水 500ml\t2ケース\n1001\tT-02\t見本の緑茶 2L\t1ケース3本\n1002\tW-01\t見本の天然水 500ml\t1ケース5本\n" +
    "1002\tS-10\t見本のせんべい\t3ボール\n1003\tS-10\t見本のせんべい\t1C2B4\n1003\tT-02\t見本の緑茶 2L\t4\n" +
    "1004\tW-01\t見本の天然水 500ml\t▲3本\n1004\tN-77\t見本の新商品\t1ケース\n1005\tS-10\t見本のせんべい\t2袋\n";
  var SAMPLE_M = "商品コード\t商品名\tケース入数\tボール入数\nW-01\t見本の天然水 500ml\t24\t\nT-02\t見本の緑茶 2L\t6\t\nS-10\t見本のせんべい\t40\t10\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var VALS = ["defLv", "round", "uCs", "uBl", "uPc", "title", "view", "filter"];
  function saveSettings() { try { var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); localStorage.setItem("irisu-kansan", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("irisu-kansan") || "{}"); VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); } catch (e) {} }
  function resetUnits() { $("uCs").value = K.DEF_UNITS.cs; $("uBl").value = K.DEF_UNITS.bl; $("uPc").value = K.DEF_UNITS.pc; }

  window.addEventListener("DOMContentLoaded", function () {
    resetUnits();
    loadSettings();
    dropZone("drop", "file", setData, "loadMsg", "hasHead");
    dropZone("drop2", "file2", setMaster, "loadMsg2", "hasHead2");
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(K.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("pasteGo2").onclick = function () { var t = $("paste2").value; if (t.trim()) setMaster(K.parseCSV(t), $("hasHead2").checked, "貼り付けた入数の表"); };
    $("sample").onclick = function () {
      $("paste").value = SAMPLE; $("paste2").value = SAMPLE_M; $("hasHead").checked = true; $("hasHead2").checked = true;
      $("defLv").value = "pc"; $("round").value = "cs"; $("view").value = "sums";
      if ($("uPc").value.indexOf("袋") < 0) resetUnits();
      setMaster(K.parseCSV(SAMPLE_M), true, "見本の入数の表");
      setData(K.parseCSV(SAMPLE), true, "見本の受注明細");
    };
    $("uReset").onclick = function () { resetUnits(); saveSettings(); refresh(); };
    ["defLv", "round"].forEach(function (id) { $(id).onchange = function () { saveSettings(); refresh(); }; });
    ["view", "filter"].forEach(function (id) { $(id).onchange = function () { saveSettings(); if (S.last) listView(); }; });
    ["uCs", "uBl", "uPc"].forEach(function (id) { $(id).oninput = function () { saveSettings(); refresh(); }; });
    $("title").onchange = saveSettings;
    $("pSum").onclick = printSums; $("pRows").onclick = printRows;
    $("xAll").onclick = saveX; $("cSum").onclick = function () { saveC("sum"); }; $("cOrig").onclick = function () { saveC("orig"); };
    refresh();
  });
})();
