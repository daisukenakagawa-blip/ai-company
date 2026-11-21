/* 封筒の宛名印刷 — 画面の動き。住所録はこのブラウザの外へ送信しない */
(function () {
  "use strict";
  var A = window.Fuutou;
  var LIMIT = window.FUUTOU_LIMIT || Infinity; // お試し版は印刷できる枚数を制限
  var $ = function (id) { return document.getElementById(id); };
  var KEYS = ["sZip", "sAddr1", "sAddr2", "sName", "sCompany", "sDept", "env", "frame", "stamp", "stampText", "numStyle", "font", "offX", "offY", "keisho"];
  var state = { headers: [], rows: [], map: null, recs: [], cur: 0 };
  var FIELDS = [
    ["zip", "郵便番号"], ["pref", "都道府県（あれば）"], ["city", "市区町村（あれば）"], ["addr1", "住所"], ["addr2", "建物名・住所2"],
    ["sei", "姓"], ["mei", "名"], ["name", "氏名（1列）"], ["company", "会社名"], ["dept", "部署"], ["position", "役職"],
    ["keisho", "敬称"], ["print", "印刷する／しない"]
  ];

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("fuutou-" + k)); localStorage.setItem("fuutou-" + k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- 読み込み ----------
  function loadRows(rows, note) {
    state.raw = rows; state.note = note;
    if (!rows.length) { $("loadMsg").textContent = "データが見つかりませんでした。"; return; }
    var hasHead = $("hasHead").checked;
    state.headers = hasHead ? rows[0].map(String) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    state.rows = hasHead ? rows.slice(1) : rows;
    state.map = A.guessColumns(state.headers);
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
    for (var k = 0; k < 4; k++) {
      h += '<label class="mf"><span>連名' + (k + 1) + '</span><select data-r="' + k + '">' + opts(state.map.renmei[k]) + "</select></label>";
    }
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

  // ---------- 設定 ----------
  function sender() {
    if (!$("useSender").checked) return null;
    return { zip: $("sZip").value, addr1: $("sAddr1").value, addr2: $("sAddr2").value, name: $("sName").value,
      company: $("sCompany").value, dept: $("sDept").value };
  }
  function opt() {
    var stamp = $("stamp").value === "other" ? $("stampText").value : $("stamp").value;
    return { env: $("env").value, frame: $("frame").value, stamp: stamp, numStyle: $("numStyle").value, offsetX: +$("offX").value || 0, offsetY: +$("offY").value || 0, keisho: $("keisho").value };
  }
  function saveSettings() {
    var s = {}; KEYS.forEach(function (k) { s[k] = $(k).value; }); s.useSender = $("useSender").checked; store("settings", s);
  }
  function loadSettings() {
    var s = store("settings"); if (!s) return;
    KEYS.forEach(function (k) { if (s[k] != null) $(k).value = s[k]; });
    if (s.useSender != null) $("useSender").checked = s.useSender;
  }

  // ---------- 一覧 ----------
  function rebuild() {
    var o = opt();
    state.recs = state.rows.map(function (row, i) {
      var r = A.buildRecord(row, state.map, o);
      var prev = state.recs[i];
      r.on = prev && prev._k === row.join("\u0001") ? prev.on : !r.skip;
      r._k = row.join("\u0001");
      return r;
    });
    drawList(); preview();
  }
  function drawList() {
    var o = opt(), on = 0, warn = 0, h = "";
    state.recs.forEach(function (r, i) {
      var L = A.layout(r, o), w = r.warn.concat(L.warn);
      if (r.on) on++; if (w.length && r.on) warn++;
      var nm = r.companyOnly ? r.company + " 御中" : r.names.map(function (n) { return (n.sei ? n.sei + " " : "") + n.mei; }).join("・");
      h += '<tr class="' + (i === state.cur ? "cur " : "") + (r.on ? "" : "off") + '" data-i="' + i + '"><td><input type="checkbox" data-c="' + i + '"' + (r.on ? " checked" : "") + "></td><td>" + (i + 1) +
        "</td><td>" + esc(nm) + "</td><td>" + esc(r.zip ? r.zip.slice(0, 3) + "-" + r.zip.slice(3) : r.rawZip) + "</td><td>" + esc(r.addr1) + (r.addr2 ? " " + esc(r.addr2) : "") +
        '</td><td class="w">' + esc(w.join("／")) + "</td></tr>";
    });
    $("list").innerHTML = h;
    $("count").innerHTML = "印刷する：<b>" + on + "</b> 通" + (warn ? "　<span class='wtxt'>要確認：" + warn + " 件</span>" : "") +
      (LIMIT < Infinity ? "　<span class='wtxt'>お試し版は先頭 " + LIMIT + " 通まで印刷できます</span>" : "");
    Array.prototype.forEach.call($("list").querySelectorAll("tr"), function (tr) {
      tr.onclick = function (e) {
        var i = +tr.dataset.i;
        if (e.target.dataset.c != null) { state.recs[i].on = e.target.checked; drawList(); return; }
        state.cur = i; drawList(); preview();
      };
    });
  }

  // ---------- 封筒の描画（単位 mm） ----------
  function itemsHTML(L, test) {
    var h = '<div class="env ' + ($("font").value === "gothic" ? "gothic" : "mincho") + (test ? " test" : "") + '" style="width:' + L.w + "mm;height:" + L.h + 'mm">';
    if (test) (L.boxes || []).forEach(function (b) { h += '<div class="zbox" style="left:' + b.x + "mm;top:" + b.y + "mm;width:" + b.w + "mm;height:" + b.h + 'mm"></div>'; });
    L.items.forEach(function (it) {
      if (it.t === "zip") {
        h += '<div class="zd" style="left:' + it.x + "mm;top:" + it.y + "mm;width:" + it.w + "mm;height:" + it.h + "mm;line-height:" + it.h + 'mm">' + esc(it.s) + "</div>";
      } else if (it.t === "text") {
        h += '<div class="tx ' + (it.cls || "") + '" style="left:' + it.x.toFixed(2) + "mm;top:" + it.y.toFixed(2) + "mm;font-size:" + it.fs.toFixed(2) + 'mm">' + esc(it.s) + "</div>";
      } else if (it.t === "stamp") {
        h += '<div class="stamp" style="left:' + it.x.toFixed(2) + "mm;top:" + it.y.toFixed(2) + "mm;width:" + it.w.toFixed(2) + "mm;height:" + it.h.toFixed(2) + "mm;font-size:" + it.fs.toFixed(2) + 'mm">' + esc(it.s) + "</div>";
      } else {
        var chars = Array.from(it.s), n = chars.length, slots = Math.max(n, it.spread || 0), step = (slots * it.fs) / n;
        chars.forEach(function (c, k) {
          var y = it.y + (k + 0.5) * step - it.fs / 2;
          h += '<div class="ch ' + it.cls + '" style="left:' + it.x.toFixed(2) + "mm;top:" + y.toFixed(2) + "mm;width:" + it.w.toFixed(2) + "mm;height:" + it.fs.toFixed(2) + "mm;font-size:" + it.fs.toFixed(2) + 'mm">' + esc(c) + "</div>";
        });
      }
    });
    return h + "</div>";
  }
  function cardHTML(rec, o, test) { return itemsHTML(A.layout(rec, o), test); }
  function backHTML(o, test) { return itemsHTML(A.layoutBack(sender(), o), test); }
  function setPage(o) {
    var E = A.envOf(o), el = $("pageSize");
    if (!el) { el = document.createElement("style"); el.id = "pageSize"; document.head.appendChild(el); }
    el.textContent = "@media print{@page{size:" + E.w + "mm " + E.h + "mm;margin:0}}";
  }
  function preview() {
    var r = state.recs[state.cur];
    if (!r) { $("pv").innerHTML = ""; $("pvb").innerHTML = ""; return; }
    $("pv").innerHTML = cardHTML(r, opt(), true);
    $("pvb").innerHTML = sender() ? backHTML(opt(), true) : "";
    var L = A.layout(r, opt()), w = r.warn.concat(L.warn);
    $("pvNote").textContent = (state.cur + 1) + " 件目" + (w.length ? "：" + w.join("／") : "");
  }

  // ---------- 印刷 ----------
  function doPrint(testOnly, back) {
    var o = opt(), h = "", cnt = 0;
    setPage(o);
    if (back) {
      var s = sender();
      if (!s || !(s.name || s.addr1 || s.company)) { alert("差出人を入れてください。"); return; }
      var on = state.recs.filter(function (r) { return r.on; }).length || 1;
      cnt = testOnly ? 1 : Math.min(on, LIMIT);
      for (var i = 0; i < cnt; i++) h += backHTML(o, testOnly);
      $("printArea").innerHTML = h; saveSettings();
      setTimeout(function () { window.print(); }, 50);
      return;
    }
    if (testOnly) {
      var r = state.recs[state.cur];
      if (!r) return;
      h = cardHTML(r, o, true); cnt = 1;
    } else {
      state.recs.forEach(function (r) { if (r.on && cnt < LIMIT) { h += cardHTML(r, o, $("printBoxes").checked); cnt++; } });
    }
    if (!cnt) { alert("印刷する宛名がありません。"); return; }
    $("printArea").innerHTML = h;
    saveSettings();
    setTimeout(function () { window.print(); }, 50);
  }

  // ---------- 見本のデータ（架空） ----------
  var SAMPLE = "氏名,郵便番号,住所,建物名,連名,会社名,部署\n" +
    "見本 太郎,100-0001,東京都千代田区千代田1-1,,,,\n" +
    "例田 さくら,530-0001,大阪府大阪市北区梅田3丁目2番10号,サンプルビル12階,,株式会社サンプル商事,経理部\n" +
    ",060-0001,北海道札幌市中央区北一条西2-1,見本ビル5F,,有限会社見本工房,\n" +
    "試田 健一,9000015,沖縄県那覇市久茂地1-2-3,,和子,,\n";

  function init() {
    loadSettings();
    $("stampText").hidden = $("stamp").value !== "other";
    $("hasHead").onchange = function () { if (state.raw) loadRows(state.raw, state.note); };
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteBtn").onclick = function () { var t = $("paste").value; if (t.trim()) loadRows(A.parseCSV(t), "貼り付け。"); };
    $("sampleBtn").onclick = function () { $("hasHead").checked = true; loadRows(A.parseCSV(SAMPLE), "見本のデータ（架空）。"); };
    KEYS.concat(["useSender"]).forEach(function (k) {
      $(k).addEventListener("input", function () { saveSettings(); if (state.rows.length) rebuild(); });
      $(k).addEventListener("change", function () { saveSettings(); if (state.rows.length) rebuild(); });
    });
    $("prev").onclick = function () { if (state.cur > 0) { state.cur--; drawList(); preview(); } };
    $("next").onclick = function () { if (state.cur < state.recs.length - 1) { state.cur++; drawList(); preview(); } };
    $("printBtn").onclick = function () { doPrint(false); };
    $("testBtn").onclick = function () { doPrint(true); };
    $("backBtn").onclick = function () { doPrint(false, true); };
    $("backTestBtn").onclick = function () { doPrint(true, true); };
    $("stamp").addEventListener("change", function () { $("stampText").hidden = $("stamp").value !== "other"; });
    $("allOn").onclick = function () { state.recs.forEach(function (r) { r.on = true; }); drawList(); };
    $("allOff").onclick = function () { state.recs.forEach(function (r) { r.on = false; }); drawList(); };
  }
  document.addEventListener("DOMContentLoaded", init);
  window.FuutouApp = { state: state, rebuild: rebuild };
})();
