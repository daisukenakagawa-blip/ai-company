/* 予約の重なりチェック — 画面・印刷・CSV。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var Y = window.YOYAKU;
  var LIMIT = window.YOYAKU_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", last: null };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return Y.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    buildSelects(Y.guessColumns(S.headers, S.rows));
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを調べます。</span>" : "");
    ["step2", "step3", "out"].forEach(function (id) { $(id).hidden = false; });
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = Y.decodeBytes(buf);
        setData(Y.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の選択 ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="">（使わない）</option>' : '<option value="">（選んでください）</option>') +
      S.headers.map(function (h, i) { return '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function buildSelects(m) {
    $("cRes").innerHTML = opts(m.res, true);
    $("cDate").innerHTML = opts(m.date, true);
    $("cStart").innerHTML = opts(m.start, false);
    $("cEnd").innerHTML = opts(m.end, false);
    $("cRange").innerHTML = opts(m.range, false);
    $("cPerson").innerHTML = opts(m.person, true);
    $("cPurpose").innerHTML = opts(m.purpose, true);
    var mode = m.range != null && (m.start == null || m.end == null) ? "one" : "two";
    document.querySelector('input[name=mode][value="' + mode + '"]').checked = true;
    modeView();
  }
  function modeView() {
    var one = document.querySelector("input[name=mode]:checked").value === "one";
    $("twoBox").hidden = one; $("oneBox").hidden = !one;
  }
  function num(id) { var v = $(id).value; return v === "" ? null : +v; }
  function clockOf(id, def) { var c = Y.parseClock($(id).value); return c.min != null ? c.min : def; }
  function options() {
    return {
      mode: document.querySelector("input[name=mode]:checked").value,
      map: { res: num("cRes"), date: num("cDate"), start: num("cStart"), end: num("cEnd"), range: num("cRange"), person: num("cPerson"), purpose: num("cPurpose") },
      year: +$("year").value || new Date().getFullYear(), overnight: $("overnight").checked,
      gap: +$("gap").value || 0, open: clockOf("open", 540), close: clockOf("close", 1080), minFree: +$("minFree").value || 1
    };
  }
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  function who(r) { return "行" + rowNo(r.i) + (r.person ? " " + r.person : "") + (r.purpose ? "（" + r.purpose + "）" : ""); }
  function span(r) {
    var d0 = Math.floor(r.s / 1440), d1 = Math.floor((r.e - 1) / 1440);
    return Y.hm(r.s - d0 * 1440) + "〜" + (d1 === d0 ? Y.hm(r.e - d0 * 1440) : (r.e - d0 * 1440 <= 2880 ? Y.hm(r.e - d0 * 1440) : Y.stamp(r.e)));
  }

  // ---------- 調べて表示 ----------
  function refresh() {
    if (!S.rows.length) return;
    var o = options();
    var need = o.mode === "one" ? (o.map.range == null ? "時間帯の列" : "") : (o.map.start == null || o.map.end == null ? "開始と終了の列" : "");
    if (need) {
      $("sumMsg").innerHTML = '<span class="wtxt">' + need + "を選んでください。</span>";
      ["ovView", "errView", "dayView", "freeView"].forEach(function (id) { $(id).innerHTML = ""; }); S.last = null; return;
    }
    if (o.close <= o.open) o.close = o.open + 60;
    var b = Y.buildRecords(S.rows, o), ov = Y.findOverlaps(b.recs, o.gap), fr = Y.freeSlots(b.recs, o.open, o.close, o.minFree);
    var resN = {}; b.recs.forEach(function (r) { resN[r.res] = 1; });
    S.last = { o: o, b: b, ov: ov, fr: fr };
    var nOv = ov.list.filter(function (x) { return x.kind !== "間隔不足"; }).length, nGap = ov.list.length - nOv;
    $("sumMsg").innerHTML = "予約 <b>" + b.recs.length + "</b> 件（" + Object.keys(resN).length + " 種類の物）を調べました。" +
      (ov.list.length ? '　<span class="bad">重なり ' + nOv + " 組" + (nGap ? "、間隔が足りない " + nGap + " 組" : "") + "</span>" : "　<b>重なりはありません。</b>") +
      (b.blanks ? "　空欄の行 " + b.blanks + " 件" : "") +
      (b.errors.length ? '　<span class="wtxt">読めない行 ' + b.errors.length + " 件（下に一覧）</span>" : "") +
      (o.gap ? '<br><span class="note">前の予約の終わりから ' + o.gap + " 分あいていない予約も「間隔不足」として出しています。</span>" : "");

    $("ovView").innerHTML = ov.list.length ? '<div class="scroll"><table class="lt"><thead><tr><th>物</th><th>日付</th><th>重なる時間</th><th>予約A</th><th>予約B</th><th>種類</th></tr></thead><tbody>' +
      ov.list.slice(0, 500).map(function (x) {
        var d = Math.floor(x.from / 1440);
        var t = x.kind === "間隔不足" ? "あと " + x.shortBy + " 分足りない" : Y.hm(x.from - d * 1440) + "〜" + Y.hm(x.to - d * 1440) + "（" + Y.dur(x.min) + "）";
        return "<tr><td>" + esc(x.res) + "</td><td>" + esc(Y.dayLabel(d)) + "</td><td>" + esc(t) + "</td><td>" + esc(span(x.a) + " " + who(x.a)) +
          "</td><td>" + esc(span(x.b) + " " + who(x.b)) + '</td><td class="' + (x.kind === "間隔不足" ? "wtxt" : "bad") + '">' + esc(x.kind) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + (ov.list.length > 500 ? '<p class="note">画面には500組まで表示しています。全部は「重なりの一覧を CSV で保存」で確かめられます。</p>' : "") : "";

    $("errView").innerHTML = b.errors.length ? "<h3>読めない行（調べていません）</h3>" + '<div class="scroll"><table class="lt"><tr><th>行</th><th>内容</th><th>理由</th></tr>' +
      b.errors.slice(0, 200).map(function (r) {
        return "<tr><td>" + rowNo(r.i) + "</td><td>" + esc(r.row.filter(function (v) { return String(v).trim(); }).join(" / ")) + "</td><td class='wtxt'>" + esc(r.note) + "</td></tr>";
      }).join("") + "</table></div>" + (b.errors.length > 200 ? '<p class="note">ほか ' + (b.errors.length - 200) + " 件は明細の CSV で確かめられます。</p>" : "") : "";

    // 1日の表の日付
    var days = {}; b.recs.forEach(function (r) { days[Math.floor(r.s / 1440)] = 1; });
    var dl = Object.keys(days).map(Number).sort(function (a, c) { return a - c; }), cur = +$("day").value;
    if (dl.indexOf(cur) < 0) {
      var firstOv = ov.list.length ? Math.floor(ov.list[0].from / 1440) : null;
      cur = firstOv != null && dl.indexOf(firstOv) >= 0 ? firstOv : dl[0];
    }
    $("day").innerHTML = dl.map(function (d) {
      var n = ov.list.filter(function (x) { return Math.floor(x.from / 1440) === d; }).length;
      return '<option value="' + d + '"' + (d === cur ? " selected" : "") + ">" + esc(Y.dayLabel(d)) + (n ? "　重なり " + n : "") + "</option>";
    }).join("");
    $("dayView").innerHTML = dl.length ? dayHTML(cur) : "";

    $("freeView").innerHTML = fr.length ? '<div class="scroll"><table class="lt"><thead><tr><th>日付</th><th>物</th><th class="n">予約</th><th class="n">使用</th><th>空いている時間（' + esc(Y.hm(o.open) + "〜" + Y.hm(o.close)) + "）</th></tr></thead><tbody>" +
      fr.slice(0, 500).map(function (f) {
        return "<tr><td>" + esc(Y.dayLabel(f.day)) + "</td><td>" + esc(f.res) + '</td><td class="n">' + f.count + '</td><td class="n">' + esc(Y.dur(f.used)) + "</td><td>" + esc(Y.freeText(f.free)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" + (fr.length > 500 ? '<p class="note">画面には500行まで表示しています。全部は CSV で保存できます。</p>' : "") : "";
  }

  // 1日の表（物ごとの横棒）
  function dayHTML(day) {
    var L = S.last, o = L.o, t0 = day * 1440, recs = L.b.recs.filter(function (r) { return r.s < t0 + 1440 && r.e > t0; });
    var lo = Math.min(o.open, Math.min.apply(null, recs.map(function (r) { return Math.max(r.s - t0, 0); }))),
      hi = Math.max(o.close, Math.max.apply(null, recs.map(function (r) { return Math.min(r.e - t0, 1440); })));
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60; var W = hi - lo;
    var res = {}; recs.forEach(function (r) { (res[r.res] = res[r.res] || []).push(r); });
    var ticks = ""; for (var h = lo; h <= hi; h += 60) ticks += '<span class="tk" style="left:' + ((h - lo) / W * 100) + '%">' + (h / 60) + "</span>";
    var rows = Object.keys(res).sort().map(function (k) {
      var ln = Y.lanes(res[k]), n = ln.reduce(function (a, x) { return Math.max(a, x.lane + 1); }, 1);
      var bars = ln.map(function (x) {
        var r = x.r, a = Math.max(r.s - t0, lo), z = Math.min(r.e - t0, hi), hit = L.ov.hit[r.i];
        return '<div class="bar' + (hit ? " hit" : "") + '" style="left:' + ((a - lo) / W * 100) + "%;width:" + ((z - a) / W * 100) + "%;top:" + (x.lane * 26 + 2) + 'px" title="' + esc(span(r) + " " + who(r)) + '">' +
          esc(span(r) + " " + (r.person || r.purpose || "行" + rowNo(r.i))) + "</div>";
      }).join("");
      var off = '<div class="off" style="left:0;width:' + Math.max(0, (o.open - lo) / W * 100) + '%"></div><div class="off" style="left:' + ((o.close - lo) / W * 100) + "%;width:" + Math.max(0, (hi - o.close) / W * 100) + '%"></div>';
      return '<div class="tl"><div class="tn">' + esc(k) + '</div><div class="tb" style="height:' + (n * 26 + 4) + 'px">' + off + bars + "</div></div>";
    }).join("");
    return '<div class="tlw"><div class="tl"><div class="tn"></div><div class="tb ax">' + ticks + "</div></div>" + rows + "</div>" +
      '<p class="note">赤い棒が、ほかの予約と重なっている（または間隔が足りない）予約です。灰色は空き時間の対象外の時間帯です。</p>';
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function download(name, rows) {
    var blob = new Blob([Y.toCSV(rows)], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : "");
  }
  function ovRows() {
    var out = [["物", "日付", "重なりの開始", "重なりの終了", "重なる分", "種類", "足りない分", "予約A 行", "予約A 時間", "予約A 予約者", "予約A 用途", "予約B 行", "予約B 時間", "予約B 予約者", "予約B 用途"]];
    S.last.ov.list.forEach(function (x) {
      var d = Math.floor(x.from / 1440), g = x.kind === "間隔不足";
      out.push([x.res, Y.dayLabel(d), g ? "" : Y.hm(x.from - d * 1440), g ? "" : Y.hm(x.to - d * 1440), g ? "" : x.min, x.kind, g ? x.shortBy : "",
        rowNo(x.a.i), span(x.a), x.a.person, x.a.purpose, rowNo(x.b.i), span(x.b), x.b.person, x.b.purpose]);
    });
    return out;
  }
  function saveOv() { if (S.last) download("予約_重なり_" + ymd() + ".csv", ovRows()); }
  function saveFree() {
    if (!S.last) return;
    var o = S.last.o, out = [["日付", "物", "予約の数", "使用（分）", "空き（分）", "空いている時間（" + Y.hm(o.open) + "〜" + Y.hm(o.close) + "）"]];
    S.last.fr.forEach(function (f) { out.push([Y.dayLabel(f.day), f.res, f.count, f.used, f.freeMin, Y.freeText(f.free)]); });
    download("予約_空き時間_" + ymd() + ".csv", out);
  }
  function saveDetail() {
    if (!S.last) return;
    var L = S.last, by = {};
    L.b.recs.forEach(function (r) { by[r.i] = r; });
    var err = {}; L.b.errors.forEach(function (r) { err[r.i] = r.note; });
    var pair = {};
    L.ov.list.forEach(function (x) { (pair[x.a.i] = pair[x.a.i] || []).push(x.kind + "：行" + rowNo(x.b.i)); (pair[x.b.i] = pair[x.b.i] || []).push(x.kind + "：行" + rowNo(x.a.i)); });
    var out = [S.headers.concat(["読み取った開始", "読み取った終了", "重なり", "相手", "読み取りメモ"])];
    S.rows.forEach(function (row, i) {
      var r = by[i];
      out.push(row.concat(r ? [Y.stamp(r.s), Y.stamp(r.e), pair[i] ? "あり" : "", (pair[i] || []).join(" / "), r.note] : ["", "", "", "", err[i] || "空欄"]));
    });
    download("予約_明細_" + ymd() + ".csv", out);
  }

  // ---------- 印刷 ----------
  function printPart(kind) {
    if (!S.last) return;
    var L = S.last, o = L.o, title = $("title").value.trim() || "予約の重なりチェック", body = "";
    var cond = "予約 " + L.b.recs.length + " 件" + (o.gap ? "、前後の間隔 " + o.gap + " 分" : "") + (L.b.errors.length ? "、読めない行 " + L.b.errors.length + " 件は含まない" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP");
    var land = kind === "day";
    if (kind === "ov") {
      var tr = ovRows();
      body = "<h2>重なりの一覧（" + L.ov.list.length + " 組）</h2>" + (L.ov.list.length ? '<table class="pt"><thead><tr><th>物</th><th>日付</th><th>重なる時間</th><th>予約A</th><th>予約B</th><th>種類</th></tr></thead><tbody>' +
        tr.slice(1).map(function (r) {
          var t = r[5] === "間隔不足" ? "あと " + r[6] + " 分" : r[2] + "〜" + r[3] + "（" + Y.dur(r[4]) + "）";
          return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td><td>" + esc(t) + "</td><td>" + esc(r[8] + " 行" + r[7] + " " + r[9] + (r[10] ? "（" + r[10] + "）" : "")) + "</td><td>" +
            esc(r[12] + " 行" + r[11] + " " + r[13] + (r[14] ? "（" + r[14] + "）" : "")) + "</td><td>" + esc(r[5]) + "</td></tr>";
        }).join("") + "</tbody></table>" : "<p>重なっている予約はありません。</p>");
    } else if (kind === "free") {
      body = "<h2>空いている時間（" + esc(Y.hm(o.open) + "〜" + Y.hm(o.close)) + "）</h2>" + '<table class="pt"><thead><tr><th>日付</th><th>物</th><th class="n">予約</th><th class="n">使用</th><th>空いている時間</th></tr></thead><tbody>' +
        L.fr.map(function (f) { return "<tr><td>" + esc(Y.dayLabel(f.day)) + "</td><td>" + esc(f.res) + '</td><td class="n">' + f.count + '</td><td class="n">' + esc(Y.dur(f.used)) + "</td><td>" + esc(Y.freeText(f.free)) + "</td></tr>"; }).join("") + "</tbody></table>";
    } else {
      body = "<h2>" + esc(Y.dayLabel(+$("day").value)) + " の予約</h2>" + dayHTML(+$("day").value);
    }
    $("pageStyle").textContent = "@page{size:A4 " + (land ? "landscape" : "portrait") + ";margin:12mm}";
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の会議室・社用車の予約） ----------
  var SAMPLE = "物\t利用日\t開始\t終了\t予約者\t用途\n" +
    "会議室A\t2026/11/24\t9:00\t10:00\t青木\t朝会\n会議室A\t2026/11/24\t9:30\t11:00\t石井\t来客\n会議室A\t2026/11/24\t13:00\t14:00\t上田\t面談\n" +
    "会議室A\t2026/11/24\t14:00\t15:30\t青木\t打合せ\n会議室B\t2026/11/24\t10:00\t12:00\t江藤\t研修\n会議室B\t2026/11/24\t15:00\t16:00\t石井\t打合せ\n" +
    "会議室B\t2026/11/24\t15:00\t16:00\t石井\t打合せ\n社用車1\t2026/11/24\t8:30\t12:00\t上田\t配達\n社用車1\t2026/11/24\t11:30\t13:00\t江藤\t銀行\n" +
    "社用車1\t2026/11/25\t9:00\t17:00\t青木\t出張\n会議室A\t2026/11/25\t10:00\t11:00\t石井\t定例\n会議室A\t2026/11/25\t11:00\t12:00\t上田\t面談\n" +
    "会議室B\t2026/11/25\t午後1時\t午後3時\t江藤\t研修\n会議室B\t2026/11/25\t14時半\t16時\t青木\t来客\n社用車1\t2026/11/26\t9:00\t\t石井\t納品\n";

  // ---------- 設定の保存（予約の中身は保存しない） ----------
  var KEYS = ["gap", "open", "close", "minFree", "title"];
  function saveSettings() {
    try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.overnight = $("overnight").checked; localStorage.setItem("yoyaku-kasanari", JSON.stringify(o)); } catch (e) {}
  }
  function loadSettings() {
    try { var o = JSON.parse(localStorage.getItem("yoyaku-kasanari") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); if (o.overnight != null) $("overnight").checked = o.overnight; } catch (e) {}
  }

  window.addEventListener("DOMContentLoaded", function () {
    $("year").value = new Date().getFullYear();
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(Y.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(Y.parseCSV(SAMPLE), true, "見本"); };
    [].forEach.call(document.querySelectorAll("input[name=mode]"), function (r) { r.onchange = function () { modeView(); refresh(); }; });
    ["cRes", "cDate", "cStart", "cEnd", "cRange", "cPerson", "cPurpose", "year", "overnight", "gap", "open", "close", "minFree"].forEach(function (id) {
      $(id).onchange = function () { saveSettings(); refresh(); };
    });
    $("day").onchange = function () { if (S.last) $("dayView").innerHTML = dayHTML(+$("day").value); };
    $("title").onchange = saveSettings;
    $("pOv").onclick = function () { printPart("ov"); }; $("pDay").onclick = function () { printPart("day"); }; $("pFree").onclick = function () { printPart("free"); };
    $("cOv").onclick = saveOv; $("cFree").onclick = saveFree; $("cDetail").onclick = saveDetail;
  });
})();
