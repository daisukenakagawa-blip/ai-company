/* 棚卸の記入用シート印刷 — 画面。外部へ送信しない */
(function () {
  "use strict";
  var T = window.Tana, $ = function (id) { return document.getElementById(id); };
  var LIMIT_PAGES = window.TANA_LIMIT_PAGES || Infinity; // お試し版：印刷できるページ数
  var LIMIT_ROWS = window.TANA_LIMIT_ROWS || Infinity;   // お試し版：CSV に保存できる行数
  var S = { headers: [], rows: [], map: {}, items: [], pages: [], counts: {}, pv: 0, dirty: false, fileName: "" };
  var FIELD_LABEL = [["loc", "棚・場所"], ["cat", "分類"], ["code", "品番・コード"], ["name", "品名"], ["spec", "規格・サイズ"], ["unit", "単位"], ["book", "帳簿の数"], ["count", "実数（前回の入力）"]];
  var OPT_IDS = ["title", "office", "groupBy", "groupSort", "sort", "orient", "rowMm", "blank", "breakOnGroup", "showBook", "showDiff", "showCat", "showSign"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- 見本 ----------
  function sample() {
    var h = ["棚番", "分類", "品番", "商品名", "規格", "単位", "在庫数"];
    var d = [
      ["A-1", "文具", "BP-001", "油性ボールペン 黒", "0.7mm", "本", 48], ["A-1", "文具", "BP-002", "油性ボールペン 赤", "0.7mm", "本", 30],
      ["A-1", "文具", "BP-010", "ゲルインクボールペン 黒", "0.5mm", "本", 24], ["A-1", "文具", "MK-001", "油性マーカー 黒", "太字・細字", "本", 20],
      ["A-1", "文具", "MK-005", "蛍光マーカー 黄", "", "本", 36], ["A-1", "文具", "PC-001", "シャープペンシル", "0.5mm", "本", 12],
      ["A-1", "文具", "PC-002", "シャープペンシルの替え芯", "0.5mm HB 40本入", "個", 25], ["A-1", "文具", "ER-001", "消しゴム", "小", "個", 40],
      ["A-1", "文具", "CR-001", "修正テープ", "5mm×6m", "個", 18], ["A-1", "文具", "GL-001", "スティックのり", "中", "本", 22],
      ["A-2", "紙製品", "NB-001", "ノート A罫", "B5・30枚", "冊", 60], ["A-2", "紙製品", "NB-002", "ノート B罫", "B5・30枚", "冊", 55],
      ["A-2", "紙製品", "NB-010", "方眼ノート", "A5・40枚", "冊", 20], ["A-2", "紙製品", "PP-001", "コピー用紙", "A4・500枚", "包", 15],
      ["A-2", "紙製品", "PP-002", "コピー用紙", "A3・500枚", "包", 4], ["A-2", "紙製品", "EN-001", "封筒 長形3号 白", "100枚入", "箱", 8],
      ["A-2", "紙製品", "EN-002", "封筒 角形2号 クラフト", "100枚入", "箱", 5], ["A-2", "紙製品", "LB-012", "ラベル用紙 A4 12面", "20枚入", "袋", 10],
      ["A-2", "紙製品", "FS-001", "付箋 75×75mm", "黄・100枚", "冊", 30], ["A-2", "紙製品", "FS-002", "付箋 見出し用 小", "4色", "個", 28],
      ["B-1", "事務用品", "FL-001", "クリアファイル A4", "10枚入", "袋", 26], ["B-1", "事務用品", "FL-005", "フラットファイル A4 縦", "青", "冊", 40],
      ["B-1", "事務用品", "FL-010", "パイプ式ファイル A4 縦 背幅50mm", "", "冊", 9], ["B-1", "事務用品", "CL-001", "ゼムクリップ", "大・100本入", "箱", 14],
      ["B-1", "事務用品", "ST-001", "ホチキスの針", "No.10・1000本", "箱", 33], ["B-1", "事務用品", "ST-010", "ホチキス", "No.10", "個", 7],
      ["B-1", "事務用品", "TP-001", "セロハンテープ", "18mm×35m", "巻", 21], ["B-1", "事務用品", "TP-005", "布粘着テープ", "50mm×25m", "巻", 12],
      ["B-1", "事務用品", "TP-010", "両面テープ", "15mm×20m", "巻", 10], ["B-1", "事務用品", "SC-001", "はさみ", "", "本", 6],
      ["B-2", "電池・小物", "DC-AA", "アルカリ乾電池 単3形", "4本入", "パック", 30], ["B-2", "電池・小物", "DC-AAA", "アルカリ乾電池 単4形", "4本入", "パック", 22],
      ["B-2", "電池・小物", "DC-9V", "アルカリ乾電池 9V形", "1本", "個", 5], ["B-2", "電池・小物", "RB-001", "輪ゴム", "100g", "袋", 9],
      ["B-2", "電池・小物", "CT-001", "カッターナイフ", "大", "本", 8], ["B-2", "電池・小物", "CT-002", "カッターの替刃", "大・10枚入", "個", 15],
      ["倉庫", "紙製品", "PP-001-C", "コピー用紙（箱）", "A4・2500枚", "箱", 12], ["倉庫", "事務用品", "BX-001", "段ボール箱 60サイズ", "10枚組", "束", 6],
      ["倉庫", "事務用品", "BX-002", "段ボール箱 100サイズ", "10枚組", "束", 3], ["倉庫", "事務用品", "WR-001", "緩衝材（気泡シート）", "幅600mm×42m", "巻", 2],
      ["倉庫", "電池・小物", "DC-AA-B", "アルカリ乾電池 単3形（まとめ買い用）", "40本入", "箱", 4]
    ];
    return [h].concat(d.map(function (r) { return r.map(String); }));
  }

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが見つかりませんでした。"; return; }
    var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    rows = rows.map(function (r) { while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return T.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.map = T.guessColumns(hasHead ? S.headers : []);
    if (!hasHead) { S.map = { code: 0, name: w > 1 ? 1 : undefined }; }
    S.counts = {}; S.dirty = false; S.fileName = name || "";
    $("showBook").checked = false;
    $("showCat").checked = false;
    $("groupBy").value = S.map.loc != null ? "loc" : (S.map.cat != null ? "cat" : "none");
    renderMap(); refresh();
    $("loadMsg").textContent = (name ? name + "：" : "") + S.items.length + " 件の品目を読み込みました。" +
      (S.map.count != null ? "「実数」の列があるので、入力の続きから始められます。" : "");
    ["step2", "step3", "step4"].forEach(function (id) { $(id).hidden = false; });
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name);
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = T.decodeBytes(buf);
        setData(T.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の選択 ----------
  function renderMap() {
    var opts = '<option value="">（使わない）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + "</option>"; }).join("");
    $("mapGrid").innerHTML = FIELD_LABEL.map(function (f) {
      return '<label class="mf"><span>' + f[1] + '</span><select data-f="' + f[0] + '">' + opts + "</select></label>";
    }).join("");
    [].forEach.call($("mapGrid").querySelectorAll("select"), function (s) {
      var v = S.map[s.dataset.f]; s.value = v == null ? "" : String(v);
      s.onchange = function () {
        S.map[s.dataset.f] = s.value === "" ? undefined : +s.value;
        if (s.dataset.f === "count") S.counts = {};
        refresh();
      };
    });
  }

  // ---------- 設定 ----------
  function opt() {
    var o = {};
    OPT_IDS.forEach(function (id) { var el = $(id); o[id] = el.type === "checkbox" ? el.checked : el.value; });
    o.rowMm = +o.rowMm; o.blank = +o.blank; o.date = $("date").value;
    if (o.groupBy === "loc" && S.map.loc == null) o.groupBy = "none";
    if (o.groupBy === "cat" && S.map.cat == null) o.groupBy = "none";
    return o;
  }
  function saveOpt() {
    try { var o = opt(); delete o.date; localStorage.setItem("tana-opt", JSON.stringify(o)); } catch (e) {}
  }
  function loadOpt() {
    try {
      var o = JSON.parse(localStorage.getItem("tana-opt") || "null"); if (!o) return;
      ["title", "office", "groupSort", "sort", "orient", "rowMm", "blank", "breakOnGroup", "showDiff", "showSign"].forEach(function (k) {
        var el = $(k); if (!el || o[k] == null) return;
        if (el.type === "checkbox") el.checked = !!o[k]; else el.value = String(o[k]);
      });
    } catch (e) {}
  }

  // ---------- 用紙の描画 ----------
  var GLABEL = { loc: "棚・場所", cat: "分類" };
  function dateText(v) {
    if (!v) return "　　　年　　月　　日";
    var p = v.split("-"); return p[0] + "年" + (+p[1]) + "月" + (+p[2]) + "日";
  }
  function pageHTML(pg, o) {
    var P = T.PAPER[o.orient], M = T.MARGIN, inner = P.w - M * 2;
    var cols = T.columns(S.map, o, o.orient);
    var h = '<div class="page" style="width:' + P.w + "mm;height:" + P.h + 'mm">';
    // 見出し
    h += '<div class="hd" style="left:' + M + "mm;top:" + M + "mm;width:" + inner + "mm;height:" + T.HEAD_MM + 'mm"><div>';
    h += '<div class="ttl">' + esc(o.title || "棚卸表") + "</div>";
    h += '<div class="sub2">' + (o.office ? esc(o.office) + "　" : "") + "実施日：" + dateText(o.date) + "</div>";
    if (o.groupBy !== "none" && o.breakOnGroup) h += '<div class="grp">' + GLABEL[o.groupBy] + "：" + esc(pg.group || "（空欄）") + (pg.gTotal > 1 ? "　（" + pg.gNo + " / " + pg.gTotal + "）" : "") + "</div>";
    h += "</div>";
    if (o.showSign) h += '<div class="sign"><div>担当者</div><div>確認者</div><div class="dt">数えた時刻<br>　：　〜　：</div></div>';
    h += "</div>";
    // 表
    var top = M + T.HEAD_MM;
    h += '<table style="left:' + M + "mm;top:" + top + "mm;width:" + inner + 'mm"><colgroup>' + cols.map(function (c) { return '<col style="width:' + c.w + 'mm">'; }).join("") + "</colgroup>";
    h += '<thead><tr style="height:' + T.THEAD_MM + 'mm">' + cols.map(function (c) { return "<th>" + c.t + "</th>"; }).join("") + "</tr></thead><tbody>";
    var rh = o.rowMm, base = rh >= 10 ? 10.5 : (rh >= 8 ? 9.5 : 8.5);
    pg.rows.forEach(function (r) {
      h += '<tr style="height:' + rh + 'mm">';
      if (r.head != null) { h += '<td class="gh" colspan="' + cols.length + '" style="font-size:' + base + 'pt">' + GLABEL[o.groupBy] + "：" + esc(r.head || "（空欄）") + "</td></tr>"; return; }
      cols.forEach(function (c) {
        var it = r.item, v = "", cls = "", style = "font-size:" + base + "pt";
        if (r.blank) { h += '<td class="' + (c.k === "count" ? "ct" : "") + '"></td>'; return; }
        if (c.k === "no") { v = String(r.no); cls = "n"; style = "font-size:" + (base - 1) + "pt"; }
        else if (c.k === "name") {
          var txt = it.name + (it.spec ? "　" + it.spec : "");
          var f = T.fitText(txt, c.w - 2.4, rh - 0.6, base, 5.5);
          style = "font-size:" + f.pt.toFixed(2) + "pt"; if (f.lines > 1) cls = "c2";
          v = esc(it.name) + (it.spec ? '<span class="sp">　' + esc(it.spec) + "</span>" : "");
          if (f.cut) S.cut.push(r.no);
          h += '<td class="' + cls + '" style="' + style + '">' + v + "</td>"; return;
        }
        else if (c.k === "code" || c.k === "loc" || c.k === "cat") {
          var s = it[c.k], fw = T.fitText(s, c.w - 2.4, rh, base, 5.5);
          style = "font-size:" + Math.min(base, fw.lines > 1 ? 5.5 : fw.pt).toFixed(2) + "pt"; v = esc(s);
          if (fw.lines > 1 && T.textWidth(s) * 5.5 * 0.3528 > c.w - 2.4) S.cut.push(r.no);
        }
        else if (c.k === "unit") v = esc(it.unit);
        else if (c.k === "book") { v = esc(it.book); cls = "n"; }
        else if (c.k === "count") cls = "ct";
        h += '<td class="' + cls + '" style="' + style + '">' + v + "</td>";
      });
      h += "</tr>";
    });
    h += "</tbody></table>";
    // 下の行
    h += '<div class="ft" style="left:' + M + "mm;top:" + (P.h - M - T.FOOT_MM) + "mm;width:" + inner + "mm;height:" + T.FOOT_MM + 'mm">';
    h += "<span>このページの品目 " + pg.itemCount + " 件" + (o.blank ? "（空欄の行には、一覧にない品を書き足してください）" : "") + "</span>";
    h += "<span>" + pg.no + " / " + pg.total + " ページ</span></div>";
    return h + "</div>";
  }

  function refresh() {
    var o = opt();
    S.items = T.buildItems(S.rows, S.map);
    S.pages = T.paginate(S.items, o);
    if (S.pv >= S.pages.length) S.pv = 0;
    var per = T.rowsPerPage(o.orient, o.rowMm);
    $("count").textContent = S.items.length + " 品目 → A4 " + S.pages.length + " ページ（1ページ " + per + " 行）";
    var w = [];
    if (S.map.code == null && S.map.name == null) w.push("「品番」か「品名」の列を選んでください。");
    var empty = S.rows.length - S.items.length; if (empty > 0) w.push("品番も品名も空の " + empty + " 行は省きました。");
    S.warnBase = w.join(" ");
    renderPreview(o);
    renderInput();
    saveOpt();
  }
  function renderPreview(o) {
    var pg = S.pages[S.pv];
    if (!pg) { $("pv").innerHTML = ""; $("pvNo").textContent = ""; $("warn").textContent = S.warnBase || ""; return; }
    S.cut = [];
    // 警告のため全ページを計算
    S.pages.forEach(function (p) { pageHTML(p, o); });
    var cut = S.cut.slice();
    $("pv").innerHTML = pageHTML(pg, o);
    var P = T.PAPER[o.orient], box = $("pvw"), wpx = box.clientWidth || 380;
    var mmpx = 96 / 25.4, sc = wpx / (P.w * mmpx);
    $("pv").firstChild.style.transform = "scale(" + sc + ")";
    box.style.height = (P.h * mmpx * sc) + "px";
    $("pvNo").textContent = (S.pv + 1) + " / " + S.pages.length + " ページ目";
    $("warn").textContent = (S.warnBase || "") + (!cut.length ? "" : " No." + cut.slice(0, 8).join("・") + (cut.length > 8 ? " ほか" : "") + " は文字が長く、欄に収まりきらない場合があります（用紙を横にするか、行を高くすると収まります）。");
  }

  function print() {
    var o = opt(), pages = S.pages;
    if (!pages.length) return;
    if (pages.length > LIMIT_PAGES) {
      pages = pages.slice(0, LIMIT_PAGES);
      alert("お試し版は先頭 " + LIMIT_PAGES + " ページだけ印刷します。全ページの印刷は製品版をご利用ください。");
    }
    $("pageSize").textContent = "@media print{@page{size:A4 " + o.orient + "}}";
    $("printArea").innerHTML = pages.map(function (p) { return pageHTML(p, o); }).join("");
    window.print();
  }

  // ---------- 実数の入力 ----------
  function countOf(it) { return S.counts[it.src] != null ? S.counts[it.src] : it.count; }
  function renderInput() {
    var o = opt(), f = $("filter").value, q = T.clean($("find").value);
    var order = []; S.pages.forEach(function (p) { p.rows.forEach(function (r) { if (r.item) order.push(r); }); });
    var hb = S.map.book != null;
    var h = "<thead><tr><th>No.</th>" + (S.map.loc != null ? "<th>棚・場所</th>" : "") + "<th>品番</th><th>品名</th>" + (hb ? "<th>帳簿</th>" : "") + "<th>実数</th>" + (hb ? "<th>差異</th>" : "") + "</tr></thead><tbody>";
    order.forEach(function (r) {
      var it = r.item, c = countOf(it), a = T.num(c), b = T.num(it.book);
      var hasC = c != null && String(c).trim() !== "";
      var d = a != null && b != null ? Math.round((a - b) * 1000) / 1000 : null;
      if (f === "todo" && hasC) return;
      if (f === "diff" && !(d != null && d !== 0)) return;
      if (q && (it.code + " " + it.name).indexOf(q) < 0) return;
      var cls = hasC && a == null ? "bad" : (d ? "df" : "");
      h += '<tr class="' + cls + '"><td>' + r.no + "</td>" + (S.map.loc != null ? "<td>" + esc(it.loc) + "</td>" : "") + "<td>" + esc(it.code) + "</td><td>" + esc(it.name) + (it.spec ? " <span class='note'>" + esc(it.spec) + "</span>" : "") + "</td>" +
        (hb ? "<td>" + esc(it.book) + "</td>" : "") + '<td><input inputmode="decimal" data-src="' + it.src + '" value="' + esc(hasC ? c : "") + '"></td>' +
        (hb ? "<td>" + (d == null ? "" : (d > 0 ? "+" : "") + d) + "</td>" : "") + "</tr>";
    });
    $("inTbl").innerHTML = h + "</tbody>";
    var inputs = [].slice.call($("inTbl").querySelectorAll("input"));
    inputs.forEach(function (el, i) {
      el.oninput = function () { S.counts[el.dataset.src] = el.value; S.dirty = true; updRow(el); updSum(); };
      el.onkeydown = function (e) {
        if (e.key === "Enter") { e.preventDefault(); var nx = inputs[i + 1]; if (nx) { nx.focus(); nx.select(); } else el.blur(); }
      };
    });
    updSum();
  }
  function updRow(el) {
    var tr = el.closest("tr"), it = S.items.filter(function (x) { return String(x.src) === el.dataset.src; })[0];
    if (!it) return;
    var c = el.value, a = T.num(c), b = T.num(it.book), d = a != null && b != null ? Math.round((a - b) * 1000) / 1000 : null;
    tr.className = String(c).trim() !== "" && a == null ? "bad" : (d ? "df" : "");
    if (S.map.book != null) tr.lastChild.textContent = d == null ? "" : (d > 0 ? "+" : "") + d;
  }
  function updSum() {
    var s = T.summary(S.items, S.counts);
    $("sum").textContent = "入力済み " + s.done + " / " + s.all + " 件" + (S.map.book != null ? "　帳簿と差がある " + s.diff + " 件" : "") + (s.bad ? "　数として読めない " + s.bad + " 件" : "");
  }
  function save() {
    var lim = LIMIT_ROWS < Infinity ? LIMIT_ROWS : null;
    var csv = T.resultCSV(S.headers, S.rows, S.map, S.counts, lim);
    var blob = new Blob([csv], { type: "text/csv" });
    var a = document.createElement("a"), d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = "棚卸_実数_" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    S.dirty = false;
    $("saveMsg").textContent = "保存しました（" + a.download + "）。" + (lim ? "お試し版は先頭 " + lim + " 行だけ保存します。" : "");
  }

  // ---------- つなぎ ----------
  function init() {
    loadOpt();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("sampleBtn").onclick = function () { $("hasHead").checked = true; setData(sample(), true, "見本"); };
    $("pasteBtn").onclick = function () { setData(T.parseCSV($("paste").value), $("hasHead").checked, "貼り付け"); };
    OPT_IDS.concat(["date"]).forEach(function (id) { $(id).addEventListener(id === "title" || id === "office" ? "input" : "change", refresh); });
    $("prevBtn").onclick = function () { if (S.pv > 0) { S.pv--; renderPreview(opt()); } };
    $("nextBtn").onclick = function () { if (S.pv < S.pages.length - 1) { S.pv++; renderPreview(opt()); } };
    $("printBtn").onclick = print;
    $("filter").onchange = renderInput;
    $("find").oninput = renderInput;
    $("saveBtn").onclick = save;
    window.addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
    window.addEventListener("resize", function () { if (S.pages.length) renderPreview(opt()); });
  }
  init();
})();
