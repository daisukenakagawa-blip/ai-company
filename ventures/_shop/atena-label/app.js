/* 宛名ラベルの面付け印刷 — 画面の動き。住所録はこのブラウザの外へ送信しない */
(function () {
  "use strict";
  var A = window.Atena, Lb = window.Label;
  var LIMIT = window.LABEL_LIMIT || Infinity; // お試し版は印刷できる枚数を制限
  var $ = function (id) { return document.getElementById(id); };
  var state = { headers: [], rows: [], map: null, recs: [], start: 0 };
  var FIELDS = [
    ["zip", "郵便番号"], ["pref", "都道府県（あれば）"], ["city", "市区町村（あれば）"], ["addr1", "住所"], ["addr2", "建物名・住所2"],
    ["sei", "姓"], ["mei", "名"], ["name", "氏名（1列）"], ["company", "会社名"], ["dept", "部署"], ["position", "役職"],
    ["keisho", "敬称"], ["print", "印刷する／しない"]
  ];
  var SHEET_KEYS = ["cols", "rows", "w", "h", "top", "left", "gx", "gy"];
  var SET_KEYS = ["preset", "cols", "rows", "w", "h", "top", "left", "gx", "gy", "pad", "fs", "font", "numStyle", "keisho", "order", "offX", "offY", "align"];

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("label-" + k)); localStorage.setItem("label-" + k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : 0; }

  // ---------- 読み込み ----------
  function loadRows(rows, note) {
    state.raw = rows; state.note = note;
    if (!rows.length) { $("loadMsg").textContent = "データが見つかりませんでした。"; return; }
    var hasHead = $("hasHead").checked;
    state.headers = hasHead ? rows[0].map(String) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    state.rows = hasHead ? rows.slice(1) : rows;
    state.map = A.guessColumns(state.headers);
    state.recs = [];
    $("loadMsg").textContent = (note ? note + "　" : "") + state.rows.length + " 件を読み込みました。";
    drawMap(); rebuild();
    $("step2").hidden = false; $("step3").hidden = false; $("step4").hidden = false;
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
            .filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
          loadRows(rows, "Excel（1枚目のシート「" + wb.SheetNames[0] + "」）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（パスワード付きのファイルは読めません）。"; }
        return;
      }
      var d = A.decodeBytes(buf);
      loadRows(A.parseCSV(d.text), "文字コード " + d.enc + "。");
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の割り当て ----------
  function opts(sel) {
    var h = '<option value="">（使わない）</option>';
    state.headers.forEach(function (name, i) {
      var ex = state.rows[0] ? String(state.rows[0][i] || "").slice(0, 14) : "";
      h += '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(name) + (ex ? "（例：" + esc(ex) + "）" : "") + "</option>";
    });
    return h;
  }
  function drawMap() {
    var h = "";
    FIELDS.forEach(function (f) {
      h += '<label class="mf"><span>' + f[1] + '</span><select data-f="' + f[0] + '">' + opts(state.map[f[0]]) + "</select></label>";
    });
    for (var k = 0; k < 4; k++) h += '<label class="mf"><span>連名' + (k + 1) + '</span><select data-r="' + k + '">' + opts(state.map.renmei[k]) + "</select></label>";
    $("mapBox").innerHTML = h;
    Array.prototype.forEach.call($("mapBox").querySelectorAll("select"), function (s) {
      s.onchange = function () {
        var v = s.value === "" ? null : +s.value;
        if (s.dataset.f) state.map[s.dataset.f] = v;
        else { var r = []; Array.prototype.forEach.call($("mapBox").querySelectorAll("select[data-r]"), function (x) { if (x.value !== "") r.push(+x.value); }); state.map.renmei = r; }
        rebuild();
      };
    });
  }

  // ---------- 用紙と設定 ----------
  function sheet() { var s = {}; SHEET_KEYS.forEach(function (k) { s[k] = num(k); }); s.cols = Math.round(s.cols); s.rows = Math.round(s.rows); return s; }
  function opt() { return { numStyle: $("numStyle").value, keisho: $("keisho").value, offsetX: num("offX"), offsetY: num("offY"), order: $("order").value }; }
  function applyPreset(key) {
    var p = Lb.PRESETS[key]; if (!p) return;
    SHEET_KEYS.forEach(function (k) { $(k).value = p[k]; });
  }
  function saveSettings() { var s = {}; SET_KEYS.forEach(function (k) { s[k] = $(k).value; }); s.border = $("border").checked; store("settings", s); }
  function loadSettings() {
    var s = store("settings");
    if (!s) { applyPreset($("preset").value); return; }
    SET_KEYS.forEach(function (k) { if (s[k] != null) $(k).value = s[k]; });
    if (s.border != null) $("border").checked = s.border;
  }
  function onSheetChange() {
    var e = Lb.checkSheet(sheet());
    $("sheetMsg").textContent = e.join("／");
    var per = Math.max(1, sheet().cols * sheet().rows);
    if (state.start >= per) state.start = 0;
    drawStart(); saveSettings(); if (state.rows.length) rebuild();
  }
  // 1枚目の何面目から貼るか（使いかけの用紙）
  function drawStart() {
    var s = sheet(), h = "", per = s.cols * s.rows;
    if (!(per > 0 && per <= 200)) { $("startGrid").innerHTML = ""; return; }
    for (var r = 0; r < s.rows; r++) {
      for (var c = 0; c < s.cols; c++) {
        var k = $("order").value === "down" ? c * s.rows + r : r * s.cols + c;
        h += '<button type="button" data-k="' + k + '" class="' + (k < state.start ? "used" : k === state.start ? "first" : "") + '">' + (k + 1) + "</button>";
      }
    }
    $("startGrid").style.gridTemplateColumns = "repeat(" + s.cols + ",1fr)";
    $("startGrid").innerHTML = h;
    $("startNote").textContent = state.start ? "1枚目は " + (state.start + 1) + " 面目から貼ります（" + state.start + " 面は使用済みとして飛ばします）。" : "1枚目の1面目から貼ります。";
    Array.prototype.forEach.call($("startGrid").querySelectorAll("button"), function (b) {
      b.onclick = function () { state.start = +b.dataset.k; drawStart(); if (state.rows.length) rebuild(); };
    });
  }

  // ---------- 一覧 ----------
  function rebuild() {
    var o = opt();
    state.recs = state.rows.map(function (row, i) {
      var r = A.buildRecord(row, state.map, o), prev = state.recs[i], key = row.join("\u0001");
      r.on = prev && prev._k === key ? prev.on : !r.skip;
      r._k = key;
      return r;
    });
    drawList(); preview();
  }
  function selected() { return state.recs.filter(function (r) { return r.on; }); }
  function labelWarn(r) {
    var s = sheet(), pad = num("pad"), F = Lb.fitLines(Lb.labelLines(r, opt()), s.w - pad * 2, s.h - pad * 2, num("fs"));
    var w = r.warn.slice();
    if (F.minFs < 2.0) w.push("文字が小さくなります（" + F.minFs.toFixed(1) + "mm）");
    return w;
  }
  function drawList() {
    var on = 0, warn = 0, h = "";
    state.recs.forEach(function (r, i) {
      var w = labelWarn(r);
      if (r.on) on++; if (w.length && r.on) warn++;
      var nm = r.companyOnly ? r.company + " 御中" : r.names.map(function (n) { return (n.sei ? n.sei + " " : "") + n.mei; }).join("・");
      h += '<tr class="' + (r.on ? "" : "off") + '"><td><input type="checkbox" data-c="' + i + '"' + (r.on ? " checked" : "") + "></td><td>" + (i + 1) +
        "</td><td>" + esc(nm) + "</td><td>" + esc(r.zip ? r.zip.slice(0, 3) + "-" + r.zip.slice(3) : r.rawZip) + "</td><td>" + esc(r.addr1) + (r.addr2 ? " " + esc(r.addr2) : "") +
        '</td><td class="w">' + esc(w.join("／")) + "</td></tr>";
    });
    $("list").innerHTML = h;
    var P = Lb.positions(on, sheet(), state.start, opt());
    $("count").innerHTML = "印刷する：<b>" + on + "</b> 件（A4 <b>" + P.pages + "</b> 枚）" + (warn ? "　<span class='wtxt'>要確認：" + warn + " 件</span>" : "") +
      (LIMIT < Infinity ? "　<span class='wtxt'>お試し版は先頭 " + LIMIT + " 件まで印刷できます</span>" : "");
    Array.prototype.forEach.call($("list").querySelectorAll("input[data-c]"), function (cb) {
      cb.onchange = function () { state.recs[+cb.dataset.c].on = cb.checked; drawList(); preview(); };
    });
  }

  // ---------- ラベルの描画（単位 mm） ----------
  function labelHTML(rec, p, s, border) {
    var pad = num("pad"), F = Lb.fitLines(Lb.labelLines(rec, opt()), s.w - pad * 2, s.h - pad * 2, num("fs"));
    var h = '<div class="lbl' + (border ? " bd" : "") + '" style="left:' + p.x.toFixed(2) + "mm;top:" + p.y.toFixed(2) + "mm;width:" + s.w + "mm;height:" + s.h + "mm;padding:" + pad + 'mm"><div class="in ' + $("align").value + '">';
    F.lines.forEach(function (x) {
      var ln = x.ln, gap = (ln.gapBefore || 0) * num("fs") * F.scale;
      h += '<div class="ln ' + ln.k + '" style="font-size:' + x.fs.toFixed(2) + "mm;line-height:" + F.lineHeight + ";margin-top:" + gap.toFixed(2) + "mm;padding-left:" + (ln.indent || 0) + 'em">' +
        (ln.ghost ? '<span class="ghost">' + esc(ln.ghost) + "　</span>" : "") + esc(ln.s) + (ln.keisho ? "　" + esc(ln.keisho) : "") + "</div>";
    });
    return h + "</div></div>";
  }
  function pagesHTML(recs, border, emptyFrames) {
    var s = sheet(), P = Lb.positions(recs.length, s, state.start, opt()), pages = [];
    for (var i = 0; i < Math.max(P.pages, emptyFrames ? 1 : 0); i++) pages.push("");
    if (emptyFrames) {
      var all = Lb.positions(P.per, s, 0, opt());
      all.items.forEach(function (p) { pages[0] += '<div class="lbl bd fr" style="left:' + p.x.toFixed(2) + "mm;top:" + p.y.toFixed(2) + "mm;width:" + s.w + "mm;height:" + s.h + 'mm"></div>'; });
    }
    P.items.forEach(function (p, i) { pages[p.page] += labelHTML(recs[i], p, s, border); });
    var fc = $("font").value === "gothic" ? "gothic" : "mincho";
    return pages.map(function (x) { return '<div class="sheet ' + fc + '">' + x + "</div>"; }).join("");
  }
  function preview() {
    var recs = selected();
    if (!recs.length) { $("pv").innerHTML = ""; $("pvNote").textContent = "印刷する宛名がありません。"; return; }
    var per = sheet().cols * sheet().rows;
    $("pv").innerHTML = pagesHTML(recs.slice(0, Math.max(0, per - state.start)), true, true);
    var first = $("pv").firstChild, sc = $("pvw").clientWidth / (210 * 96 / 25.4);
    if (first) first.style.transform = "scale(" + sc + ")";
    $("pvNote").textContent = "1枚目の見本（灰色の枠は位置の目安。本番では「枠を印刷する」を選んだときだけ印刷）";
  }

  // ---------- 印刷 ----------
  function doPrint(test) {
    var recs = selected();
    if (!recs.length) { alert("印刷する宛名がありません。"); return; }
    if (LIMIT < Infinity) recs = recs.slice(0, LIMIT);
    if (test) recs = recs.slice(0, Math.max(0, sheet().cols * sheet().rows - state.start));
    var e = Lb.checkSheet(sheet());
    if (e.length && !confirm("用紙の寸法を確かめてください：" + e.join("／") + "\nこのまま印刷しますか？")) return;
    $("printArea").innerHTML = pagesHTML(recs, test || $("border").checked, test);
    saveSettings();
    setTimeout(function () { window.print(); }, 50);
  }

  // ---------- 見本のデータ（架空） ----------
  var SAMPLE = "氏名,郵便番号,住所,建物名,連名,会社名,部署\n" +
    "見本 太郎,100-0001,東京都千代田区千代田1-1,,花子,,\n" +
    "例田 さくら,530-0001,大阪府大阪市北区梅田3丁目2番10号,サンプルマンション1203号室,,,\n" +
    ",060-0001,北海道札幌市中央区北一条西2-1,見本ビル5F,,株式会社サンプル,総務部\n" +
    "試田 健一,9000015,沖縄県那覇市久茂地1-2-3,,,見本商事株式会社,営業部\n" +
    "架空 美咲,980-0011,宮城県仙台市青葉区上杉1丁目2-3,,,,\n" +
    "例山 次郎,460-0008,愛知県名古屋市中区栄4-5-6,サンプルハイツ202,,,\n";

  function init() {
    var h = "";
    Object.keys(Lb.PRESETS).forEach(function (k) { h += '<option value="' + k + '">' + Lb.PRESETS[k].name + "</option>"; });
    $("preset").innerHTML = h + '<option value="custom">自分で入力</option>';
    $("preset").value = "12";
    loadSettings();
    $("hasHead").onchange = function () { if (state.raw) loadRows(state.raw, state.note); };
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteBtn").onclick = function () { var t = $("paste").value; if (t.trim()) loadRows(A.parseCSV(t), "貼り付け。"); };
    $("sampleBtn").onclick = function () { $("hasHead").checked = true; loadRows(A.parseCSV(SAMPLE), "見本のデータ（架空）。"); };
    $("preset").onchange = function () { if ($("preset").value !== "custom") applyPreset($("preset").value); onSheetChange(); };
    SHEET_KEYS.forEach(function (k) { $(k).addEventListener("input", function () { $("preset").value = "custom"; onSheetChange(); }); });
    ["pad", "fs", "font", "numStyle", "keisho", "order", "offX", "offY", "align", "border"].forEach(function (k) {
      $(k).addEventListener("change", onSheetChange); $(k).addEventListener("input", onSheetChange);
    });
    $("allOn").onclick = function () { state.recs.forEach(function (r) { r.on = true; }); drawList(); preview(); };
    $("allOff").onclick = function () { state.recs.forEach(function (r) { r.on = false; }); drawList(); preview(); };
    $("printBtn").onclick = function () { doPrint(false); };
    $("testBtn").onclick = function () { doPrint(true); };
    window.addEventListener("resize", preview);
    onSheetChange();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
