/* 名札・席札の一括印刷 — 画面。外部へ送信しない */
(function () {
  "use strict";
  var N = window.Nafuda, $ = function (id) { return document.getElementById(id); };
  var LIMIT_PAGES = window.NAFUDA_LIMIT_PAGES || Infinity; // お試し版：印刷できるページ数
  var S = { headers: [], rows: [], map: {}, recs: [], start: 0, pv: 0, pages: 0 };
  var FONTS = {
    gothic: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic","Noto Sans CJK JP","Noto Sans JP","Meiryo",sans-serif',
    mincho: '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif CJK JP","Noto Serif JP","MS PMincho",serif'
  };
  var COLORS = { navy: "#1e3a8a", green: "#166534", red: "#9f1239", gray: "#4b5563", black: "#111111" };
  var CAT_COLORS = ["#1e3a8a", "#9f1239", "#166534", "#92400e", "#5b21b6", "#0e7490", "#4b5563"];
  var FIELD_LABEL = [["name", "氏名（1列）"], ["sei", "姓"], ["mei", "名"], ["kana", "ふりがな（1列）"], ["kanaSei", "せい"], ["kanaMei", "めい"], ["org", "会社・団体・学校"], ["dept", "部署・学年"], ["title", "役職・肩書"], ["cat", "区分（来賓・スタッフなど）"], ["table", "卓・テーブル"]];
  var OPT_IDS = ["preset", "w", "h", "cols", "rows", "left", "top", "gx", "gy", "offX", "offY", "keisho", "showKana", "showOrg", "showDept", "showTitle", "band", "event", "showTable", "font", "fit", "color", "catColors", "both", "cutLine", "foldLine", "blank", "sort"];

  // 実際の書体で文字の幅を測る（1em あたり）
  var cv = document.createElement("canvas").getContext("2d");
  N.setMeasure(function (s, font) {
    if (!s) return 0;
    cv.font = "700 100px " + (FONTS[font] || FONTS.gothic);
    return cv.measureText(s).width / 100 * 1.02;
  });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(id) { var v = parseFloat(String($(id).value).replace(/[０-９．－]/g, function (c) { return c === "．" ? "." : c === "－" ? "-" : String.fromCharCode(c.charCodeAt(0) - 0xfee0); })); return isFinite(v) ? v : 0; }

  // ---------- 見本 ----------
  function sample() {
    return [["氏名", "ふりがな", "会社名", "部署", "役職", "区分", "卓"],
      ["山田　太郎", "やまだ　たろう", "見本商事株式会社", "営業部", "部長", "来賓", "1"],
      ["佐藤　花子", "さとう　はなこ", "見本商事株式会社", "総務部", "", "来賓", "1"],
      ["鈴木　一郎", "すずき　いちろう", "サンプル工業", "製造課", "課長", "参加者", "2"],
      ["高橋　美咲", "たかはし　みさき", "サンプル工業", "", "", "参加者", "2"],
      ["田中　健", "たなか　けん", "架空デザイン事務所", "", "代表", "参加者", "3"],
      ["伊藤　由美子", "いとう　ゆみこ", "", "", "", "参加者", "3"],
      ["渡辺　翔太", "わたなべ　しょうた", "例示大学", "経済学部", "3年", "参加者", "4"],
      ["勅使河原　左右衛門之丞", "てしがわら　さえもんのじょう", "長い名前の見本株式会社 東日本営業本部", "第一営業部 法人営業課", "課長代理", "参加者", "4"],
      ["中村　さくら", "なかむら　さくら", "見本商事株式会社", "", "", "スタッフ", "受付"],
      ["小林　大輔", "こばやし　だいすけ", "見本商事株式会社", "", "", "スタッフ", "受付"],
      ["Emily Clark", "エミリー　クラーク", "Example Ltd.", "", "Manager", "参加者", "5"]];
  }

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが見つかりませんでした。"; return; }
    var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return N.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.map = hasHead ? N.guessColumns(S.headers) : { name: 0, org: w > 1 ? 1 : undefined };
    if (S.map.name == null && S.map.sei == null && S.map.mei == null) S.map.name = 0;
    $("band").value = S.map.cat != null ? "cat" : ($("event").value ? "event" : "none");
    $("showTable").checked = S.map.table != null && kind() === "tent";
    renderMap(); refresh();
    $("loadMsg").textContent = (name ? name + "：" : "") + S.recs.length + " 人分を読み込みました。";
    ["step2", "step3", "step4"].forEach(function (id) { $(id).hidden = false; });
  }
  function readFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg").textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name);
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = N.decodeBytes(buf);
        setData(N.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }
  function renderMap() {
    var h = "";
    FIELD_LABEL.forEach(function (f) {
      h += '<label class="mf"><span>' + f[1] + '</span><select data-f="' + f[0] + '"><option value="">（使わない）</option>';
      S.headers.forEach(function (x, i) { h += '<option value="' + i + '"' + (S.map[f[0]] === i ? " selected" : "") + ">" + esc(x) + "</option>"; });
      h += "</select></label>";
    });
    $("mapGrid").innerHTML = h;
    Array.prototype.forEach.call($("mapGrid").querySelectorAll("select"), function (s) {
      s.onchange = function () { S.map[s.dataset.f] = s.value === "" ? undefined : +s.value; refresh(); };
    });
  }

  // ---------- 設定 ----------
  function sheet() {
    var p = N.PRESETS[$("preset").value];
    var s = { kind: p ? p.kind : $("customKind").value, w: num("w"), h: num("h"), cols: Math.round(num("cols")), rows: Math.round(num("rows")), left: num("left"), top: num("top"), gx: num("gx"), gy: num("gy") };
    return s;
  }
  function kind() { var p = N.PRESETS[$("preset").value]; return p ? p.kind : $("customKind").value; }
  function applyPreset(fromUser) {
    var p = N.PRESETS[$("preset").value];
    $("custom").hidden = !!p && !$("editSize").checked;
    $("customKindRow").hidden = !!p;
    if (p) ["w", "h", "cols", "rows", "left", "top", "gx", "gy"].forEach(function (k) { $(k).value = p[k]; });
    var tent = kind() === "tent";
    $("tentOpts").hidden = !tent;
    if (fromUser) { $("keisho").value = tent ? "様" : ""; $("cutLine").checked = $("preset").value !== "meishi10"; }
    S.start = 0;
  }
  function opt() {
    return {
      keisho: $("keisho").value, showKana: $("showKana").checked, showOrg: $("showOrg").checked, showDept: $("showDept").checked, showTitle: $("showTitle").checked,
      band: $("band").value, event: N.clean($("event").value), showTable: $("showTable").checked && kind() === "tent",
      font: $("font").value, fit: $("fit").value, offsetX: num("offX"), offsetY: num("offY")
    };
  }
  function save() { try { var o = {}; OPT_IDS.forEach(function (k) { var e = $(k); o[k] = e.type === "checkbox" ? e.checked : e.value; }); localStorage.setItem("nafuda-opt", JSON.stringify(o)); } catch (e) { } }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem("nafuda-opt") || "null"); if (!o) return;
      OPT_IDS.forEach(function (k) { var e = $(k); if (!e || !(k in o)) return; if (e.type === "checkbox") e.checked = !!o[k]; else e.value = o[k]; });
    } catch (e) { }
  }

  // ---------- 札の HTML ----------
  function catColor(cat) {
    if (!$("catColors").checked) return COLORS[$("color").value] || COLORS.navy;
    var cats = []; S.recs.forEach(function (r) { if (r.cat && cats.indexOf(r.cat) < 0) cats.push(r.cat); });
    var i = cats.indexOf(cat); return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length];
  }
  function faceHTML(rec, s, o) {
    var items = N.layoutFace(rec, s.w, s.h, o), font = FONTS[o.font] || FONTS.gothic, col = catColor(rec.cat), h = "";
    items.forEach(function (it) {
      if (it.k === "line") { h += '<div class="ln" style="left:' + it.x + "mm;top:" + it.y + "mm;width:" + it.w + 'mm"></div>'; return; }
      var st = "left:" + it.x + "mm;top:" + it.y + "mm;width:" + it.w + "mm;height:" + it.h + "mm;font-size:" + it.fs.toFixed(2) + "mm";
      if (it.k === "band") st += ";background:" + col + ";line-height:" + it.h + "mm";
      var txt = esc(it.s);
      if (it.k === "name" || it.k === "kana") txt = txt.replace(/　/g, '<span class="sp"></span>'); // 姓と名の間は少し狭く
      var inner = txt + (it.keisho ? '<span class="ks">' + esc(it.keisho) + "</span>" : "");
      h += '<div class="it k-' + it.k + '" style="' + st + '"><span class="tx"' + (it.sx && it.sx < 0.999 ? ' style="transform:scaleX(' + it.sx.toFixed(3) + ')"' : "") + ">" + inner + "</span></div>";
    });
    return { html: h, small: N.tooSmall(items), font: font };
  }
  function slotHTML(rec, s, o, pos, frame) {
    var tent = s.kind === "tent", H = N.slotH(s), cut = frame || $("cutLine").checked;
    var h = '<div class="slot' + (cut ? " cut" : "") + '" style="left:' + pos.x + "mm;top:" + pos.y + "mm;width:" + s.w + "mm;height:" + H + "mm" + '">';
    if (frame) {
      h += '<div class="frame-no">' + (pos.row + 1) + "段" + (pos.col + 1) + "列" + (tent ? "（真ん中で折る）" : "") + "</div>";
      if (tent) h += '<div class="fold" style="top:' + s.h + 'mm"></div>';
      return { html: h + "</div>", small: false };
    }
    var f = faceHTML(rec, s, o);
    var face = '<div class="face" style="width:' + s.w + "mm;height:" + s.h + "mm;font-family:" + esc(f.font) + (tent ? ";top:" + s.h + "mm" : ";top:0") + '">' + f.html + "</div>";
    if (tent) {
      if ($("both").checked) face += '<div class="face back" style="width:' + s.w + "mm;height:" + s.h + "mm;font-family:" + esc(f.font) + ';top:0">' + f.html + "</div>";
      if ($("foldLine").checked) face += '<div class="fold" style="top:' + s.h + 'mm"></div>';
    }
    return { html: h + face + "</div>", small: f.small };
  }
  function allRecs() {
    var recs = N.sortRecs(N.records(S.rows, S.map), $("sort").value), n = Math.max(0, Math.min(500, parseInt($("blank").value, 10) || 0));
    for (var i = 0; i < n; i++) recs.push({ name: "", kana: "", org: "", dept: "", title: "", cat: "", table: "", src: 1e9 + i });
    return recs;
  }
  function pagesHTML(recs, s, o, frame, onlyPage, maxPages) {
    var P = N.positions(recs.length, s, S.start, o), pages = [], smalls = [];
    recs.forEach(function (r, i) {
      var p = P[i].page; if (onlyPage != null && p !== onlyPage) return; if (p >= maxPages) return;
      var x = slotHTML(r, s, o, P[i], frame);
      (pages[p] = pages[p] || []).push(x.html);
      if (x.small) smalls.push(r.name);
    });
    var html = "";
    pages.forEach(function (arr) { if (arr) html += '<div class="page">' + arr.join("") + "</div>"; });
    return { html: html, smalls: smalls };
  }

  // ---------- 画面の更新 ----------
  function refresh() {
    save();
    if (!S.rows.length) return;
    S.recs = N.records(S.rows, S.map);
    var s = sheet(), errs = N.checkSheet(s), o = opt(), recs = allRecs();
    $("warn").textContent = errs.join("。");
    drawStart(s);
    if (errs.length) { $("pv").innerHTML = ""; $("count").textContent = ""; return; }
    S.pages = N.pageCount(recs.length, s, S.start);
    if (S.pv >= S.pages) S.pv = Math.max(0, S.pages - 1);
    var r = pagesHTML(recs, s, o, false, S.pv, Infinity);
    $("pv").innerHTML = r.html;
    var all = pagesHTML(recs, s, o, false, null, Infinity);
    $("count").textContent = recs.length + " 枚 → A4 " + S.pages + " ページ" + (LIMIT_PAGES < Infinity ? "（お試し版で印刷できるのは先頭 " + LIMIT_PAGES + " ページ）" : "");
    $("pvNo").textContent = (S.pv + 1) + " / " + S.pages;
    $("small").textContent = all.smalls.length ? "名前が長く、文字がかなり小さくなる札があります：" + all.smalls.slice(0, 5).join("、") + (all.smalls.length > 5 ? " ほか" : "") + "。札を大きくするか、所属などの行を減らしてください。" : "";
    var miss = S.recs.filter(function (x) { return !x.name; }).length;
    $("missMsg").textContent = miss ? "氏名が空欄の行が " + miss + " 件あります（所属だけの札になります）。" : "";
    scalePreview();
  }
  function scalePreview() {
    var box = $("pvw"), pg = box.querySelector(".page"); if (!pg) return;
    var k = box.clientWidth / pg.offsetWidth;
    pg.style.transform = "scale(" + k + ")"; box.style.height = pg.offsetHeight * k + "px";
  }
  function drawStart(s) {
    var per = s.cols * s.rows;
    if (S.start >= per) S.start = 0;
    if (!(per > 0 && per <= 60)) { $("startGrid").innerHTML = ""; return; }
    var h = "";
    for (var k = 0; k < per; k++) h += '<button type="button" data-k="' + k + '" class="' + (k < S.start ? "used" : k === S.start ? "first" : "") + '">' + (k + 1) + "</button>";
    $("startGrid").style.gridTemplateColumns = "repeat(" + s.cols + ",1fr)";
    $("startGrid").innerHTML = h;
    $("startNote").textContent = S.start ? "1枚目は " + (S.start + 1) + " 面目から印刷します（" + S.start + " 面は使用済みとして飛ばします）。" : "1枚目の1面目から印刷します。";
    Array.prototype.forEach.call($("startGrid").querySelectorAll("button"), function (b) { b.onclick = function () { S.start = +b.dataset.k; refresh(); }; });
  }
  function doPrint(frame) {
    var s = sheet(); if (N.checkSheet(s).length) return;
    var recs = allRecs();
    if (frame) recs = recs.slice(0, Math.max(1, s.cols * s.rows - S.start));
    var r = pagesHTML(recs, s, opt(), frame, null, frame ? 1 : LIMIT_PAGES);
    $("printArea").innerHTML = r.html;
    if (!frame && LIMIT_PAGES < S.pages) $("printMsg").textContent = "お試し版のため、先頭 " + LIMIT_PAGES + " ページだけ印刷します。";
    setTimeout(function () { window.print(); }, 50);
  }

  // ---------- イベント ----------
  load(); applyPreset(false);
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("sampleBtn").onclick = function () { setData(sample(), true, "見本のデータ"); };
  $("pasteBtn").onclick = function () { setData(N.parseCSV($("paste").value), $("hasHead").checked, "貼り付け"); };
  $("preset").onchange = function () { applyPreset(true); if (S.rows.length) { $("showTable").checked = S.map.table != null && kind() === "tent"; } refresh(); };
  $("customKind").onchange = function () { $("tentOpts").hidden = kind() !== "tent"; refresh(); };
  $("editSize").onchange = function () { $("custom").hidden = !this.checked && !!N.PRESETS[$("preset").value]; };
  OPT_IDS.forEach(function (k) { if (k === "preset") return; var e = $(k); e.addEventListener(e.tagName === "SELECT" || e.type === "checkbox" ? "change" : "input", refresh); });
  $("prevBtn").onclick = function () { if (S.pv > 0) { S.pv--; refresh(); } };
  $("nextBtn").onclick = function () { if (S.pv < S.pages - 1) { S.pv++; refresh(); } };
  $("printBtn").onclick = function () { doPrint(false); };
  $("frameBtn").onclick = function () { doPrint(true); };
  window.addEventListener("resize", scalePreview);
  window.NafudaApp = { state: S, refresh: refresh };
})();
