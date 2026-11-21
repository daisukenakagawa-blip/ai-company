/* 送付状の一括作成 — 画面の動き。宛先の一覧はこのブラウザの外へ送信しない */
(function () {
  "use strict";
  var S = window.Soufu;
  var LIMIT = window.SOUFU_LIMIT || Infinity; // お試し版は印刷できる通数を制限
  var $ = function (id) { return document.getElementById(id); };
  var KEYS = ["title", "style", "season", "dateStyle", "body", "docs", "docsMode", "note", "sender", "font", "size", "showAddr", "numbered", "noPrefix", "stamp"];
  var state = { headers: [], rows: [], map: null, recs: [], cur: 0 };
  var FIELDS = [
    ["company", "会社名・取引先名"], ["dept", "部署"], ["position", "役職"], ["name", "氏名・担当者（1列）"], ["sei", "姓"], ["mei", "名"],
    ["keisho", "敬称"], ["docs", "同封書類（宛先ごと）"], ["note", "備考（宛先ごと）"],
    ["zip", "郵便番号"], ["pref", "都道府県"], ["city", "市区町村"], ["addr1", "住所"], ["addr2", "建物名"], ["print", "送る／送らない"]
  ];
  var DEFAULT_BODY = "さて、下記の書類をお送りいたします。\nご査収のほど、よろしくお願い申し上げます。\nご不明な点がございましたら、お気軽にお問い合わせください。";

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("soufu-" + k)); localStorage.setItem("soufu-" + k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- 読み込み ----------
  function loadRows(rows, note) {
    state.raw = rows; state.note = note;
    if (!rows.length) { $("loadMsg").textContent = "データが見つかりませんでした。"; return; }
    var hasHead = $("hasHead").checked;
    state.headers = hasHead ? rows[0].map(String) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    state.rows = hasHead ? rows.slice(1) : rows;
    state.map = S.guessColumns(state.headers);
    state.cur = 0;
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
      var d = S.decodeBytes(buf);
      loadRows(S.parseCSV(d.text), "文字コード " + d.enc + "。");
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
    $("mapGrid").innerHTML = FIELDS.map(function (f) {
      return '<label class="mf"><span>' + f[1] + '</span><select data-k="' + f[0] + '">' + opts(state.map[f[0]]) + "</select></label>";
    }).join("");
    Array.prototype.forEach.call($("mapGrid").querySelectorAll("select"), function (s) {
      s.onchange = function () { state.map[s.dataset.k] = s.value === "" ? null : +s.value; rebuild(); };
    });
    $("phList").textContent = "使える差し込み：{会社名} {部署} {役職} {氏名} " + state.headers.map(function (h) { return "{" + S.normHead(h) + "}"; }).join(" ");
  }

  // ---------- 設定 ----------
  function opt(i) {
    return {
      title: $("title").value === "free" ? ($("titleFree").value || "送付状") : $("title").value,
      style: $("style").value, season: $("season").value, date: $("date").value, dateStyle: $("dateStyle").value,
      body: $("body").value, docs: $("docs").value, docsMode: $("docsMode").value, note: $("note").value,
      sender: $("sender").value.split(/\r?\n/), showAddr: $("showAddr").checked,
      numbered: $("numbered").checked, noPrefix: $("noPrefix").value, keisho: $("keisho").value, index: i || 0
    };
  }
  function fillSeason() {
    var m = S.monthOf($("date").value), cur = $("season").value;
    var h = '<option value="jika">時下（季節を問わない）</option>';
    (S.JIKOU[m] || []).forEach(function (w) { h += '<option value="' + w + '">' + w + "の候（" + m + "月）</option>"; });
    $("season").innerHTML = h;
    if (Array.prototype.some.call($("season").options, function (o) { return o.value === cur; })) $("season").value = cur;
  }

  function rebuild() {
    if (!state.map) return;
    state.recs = state.rows.map(function (row) { return S.buildRecord(row, state.map, state.headers, { keisho: $("keisho").value }); })
      .filter(function (r) { return !r.skip; });
    if (state.cur >= state.recs.length) state.cur = 0;
    var skipped = state.rows.length - state.recs.length;
    var bad = 0;
    var list = state.recs.map(function (r, i) {
      var L = S.letter(r, opt(i));
      if (L.warn.length) bad++;
      return "<tr" + (i === state.cur ? ' class="on"' : "") + ' data-i="' + i + '"><td>' + (i + 1) + "</td><td>" + esc(L.to.join(" ")) + "</td><td>" + esc(L.docs.map(function (d) { return d.name; }).join("・")) + '</td><td class="wtxt">' + esc(L.warn.join("／")) + "</td></tr>";
    }).join("");
    $("list").innerHTML = "<tr><th>#</th><th>宛先</th><th>同封書類</th><th>確認</th></tr>" + list;
    Array.prototype.forEach.call($("list").querySelectorAll("tr[data-i]"), function (tr) { tr.onclick = function () { state.cur = +tr.dataset.i; rebuild(); }; });
    $("count").textContent = state.recs.length + " 通" + (skipped ? "（「送らない」の " + skipped + " 件を除く）" : "") + (bad ? "　確認が必要：" + bad + " 通" : "");
    preview();
    KEYS.forEach(function (k) { var e = $(k); if (e) store(k, e.type === "checkbox" ? e.checked : e.value); });
    store("titleFree", $("titleFree").value);
  }

  // ---------- 1通分の HTML ----------
  function pageHTML(r, i) {
    var L = S.letter(r, opt(i));
    var h = '<div class="page f-' + $("font").value + ' s-' + $("size").value + '"><div class="in">';
    h += '<div class="date">' + (L.no ? '<div>No. ' + esc(L.no) + "</div>" : "") + "<div>" + esc(L.date) + "</div></div>";
    h += '<div class="to">' + L.addr.map(function (a) { return '<div class="ad">' + esc(a) + "</div>"; }).join("") +
      L.to.map(function (t, k) { return '<div class="' + (k === L.to.length - 1 ? "nm" : "og") + '">' + esc(t) + "</div>"; }).join("") + "</div>";
    h += '<div class="from">' + L.sender.map(function (s) { return "<div>" + esc(s) + "</div>"; }).join("") + ($("stamp").checked ? '<span class="stampbox">印</span>' : "") + "</div>";
    h += '<h1 class="ttl">' + esc(L.title) + "</h1>";
    if (L.opening) h += '<p class="op">' + esc(L.opening) + "</p>";
    L.body.split(/\r?\n/).forEach(function (line) { if (line.trim()) h += '<p class="bd">' + esc(line.replace(/^[ 　]+/, "")) + "</p>"; });
    if (L.closing) h += '<p class="cl">' + L.closing + "</p>";
    h += '<p class="ki">記</p><table class="docs">' + L.docs.map(function (d, k) {
      return "<tr><td class='n'>" + (k + 1) + ".</td><td>" + esc(d.name) + "</td><td class='q'>" + esc(d.qty) + "</td></tr>";
    }).join("") + "</table>";
    if (L.note) h += '<div class="nt"><b>備考</b><br>' + esc(L.note).replace(/\n/g, "<br>") + "</div>";
    h += '<p class="ij">以上</p></div></div>';
    return h;
  }
  // 1枚に収まらないときは、文字を少しずつ小さくする（85% まで）
  function fitPage(pg) {
    var inn = pg.querySelector(".in"), sc = 1;
    while (inn.scrollHeight > inn.clientHeight + 1 && sc > 0.86) { sc -= 0.03; inn.style.fontSize = (sc * 100).toFixed(0) + "%"; }
    var over = inn.scrollHeight > inn.clientHeight + 1;
    pg.dataset.over = over ? "1" : "";
    return { scale: sc, over: over };
  }

  function preview() {
    if (!state.recs.length) { $("pv").innerHTML = ""; $("pvNo").textContent = ""; return; }
    $("pv").innerHTML = pageHTML(state.recs[state.cur], state.cur);
    var pg = $("pv").firstChild;
    var w = $("pvw").clientWidth || 400;
    var k = w / (210 * 96 / 25.4);
    pg.style.transform = "scale(" + k + ")";
    $("pvw").style.height = (297 * 96 / 25.4 * k) + "px";
    var f = fitPage(pg);
    $("pvNo").textContent = (state.cur + 1) + " / " + state.recs.length;
    $("fitMsg").textContent = f.over ? "この送付状は1枚に収まりません。本文・同封書類・備考を短くするか、文字の大きさを「小」にしてください。" : (f.scale < 1 ? "1枚に収めるため、この送付状は文字を少し小さくしています。" : "");
  }

  function print() {
    var n = Math.min(state.recs.length, LIMIT);
    if (!n) return;
    var html = "";
    for (var i = 0; i < n; i++) html += pageHTML(state.recs[i], i);
    $("printArea").innerHTML = html;
    var over = [];
    Array.prototype.forEach.call($("printArea").querySelectorAll(".page"), function (pg, i) { if (fitPage(pg).over) over.push(i + 1); });
    $("printMsg").textContent = (state.recs.length > n ? "お試し版のため、先頭 " + n + " 通だけ印刷します。" : n + " 通を印刷します。") + (over.length ? "　1枚に収まらない送付状：" + over.join("・") + " 通目" : "");
    setTimeout(function () { window.print(); }, 50);
  }

  // ---------- 見本 ----------
  var SAMPLE = "会社名,部署,役職,担当者,同封書類,備考\n" +
    "株式会社みどり商事,経理部,,山田 太郎,請求書 1部、納品書 1部,\n" +
    "有限会社さくら工房,,代表取締役,佐藤 花子,請求書 1部,11月分のお振込みは月末までにお願いいたします。\n" +
    "あおば建設株式会社,総務課,,,見積書 2部、工程表 1部,\n" +
    "ひかり税理士事務所,,,鈴木 一郎,請求書 1部、領収書 1部、返信用封筒 1通,\n" +
    "株式会社つばさ物流,営業部 第二営業課,課長,田中 健一,契約書 2部、返信用封筒 1通,2部とも記名押印のうえ、1部をご返送ください。\n";
  var SAMPLE_SENDER = "〒100-0000\n東京都千代田区見本町1-2-3 見本ビル5階\n見本株式会社\n経理部　担当：中村\nTEL 03-0000-0000";

  function init() {
    KEYS.forEach(function (k) { var v = store(k), e = $(k); if (v == null || !e) return; if (e.type === "checkbox") e.checked = v; else e.value = v; });
    var tf = store("titleFree"); if (tf) $("titleFree").value = tf;
    if (!$("body").value) $("body").value = DEFAULT_BODY;
    var d = new Date(); $("date").value = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var sv = store("season"); fillSeason(); if (sv) { $("season").value = sv; if (!$("season").value) $("season").value = "jika"; }
    $("titleFree").hidden = $("title").value !== "free";
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var drop = $("drop");
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = function () { drop.classList.remove("over"); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteBtn").onclick = function () { loadRows(S.parseCSV($("paste").value), "貼り付け。"); };
    $("hasHead").onchange = function () { if (state.raw) loadRows(state.raw, state.note); };
    $("sampleBtn").onclick = function () {
      if (!$("sender").value.trim()) $("sender").value = SAMPLE_SENDER;
      if (!$("docs").value.trim()) $("docsMode").value = "row";
      loadRows(S.parseCSV(SAMPLE), "見本のデータ（会社名・氏名・住所はすべて架空です）。");
    };
    $("keisho").onchange = rebuild;
    $("bodyReset").onclick = function () { $("body").value = DEFAULT_BODY; rebuild(); };
    $("date").onchange = function () { fillSeason(); rebuild(); };
    $("title").onchange = function () { $("titleFree").hidden = $("title").value !== "free"; rebuild(); };
    Array.prototype.forEach.call(document.querySelectorAll("#step3 input,#step3 select,#step3 textarea,#step4 input,#step4 select"), function (e) {
      if (e.id === "date" || e.id === "title") return;
      e.addEventListener(e.tagName === "SELECT" || e.type === "checkbox" ? "change" : "input", rebuild);
    });
    $("prevBtn").onclick = function () { if (state.cur > 0) { state.cur--; rebuild(); } };
    $("nextBtn").onclick = function () { if (state.cur < state.recs.length - 1) { state.cur++; rebuild(); } };
    $("printBtn").onclick = print;
    window.addEventListener("resize", preview);
  }
  init();
})();
