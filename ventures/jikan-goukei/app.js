/* 作業時間の集計 — 画面・印刷・CSV。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var J = window.JIKAN;
  var LIMIT = window.JIKAN_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", specs: [], last: null };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return J.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    var map = J.guessColumns(S.headers, S.rows);
    buildSelects(map);
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを集計します。</span>" : "");
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
        var d = J.decodeBytes(buf);
        setData(J.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の選択 ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="">（使わない）</option>' : '<option value="">（選んでください）</option>') +
      S.headers.map(function (h, i) { return '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function looksDate(i) {
    var ok = 0, all = 0;
    S.rows.slice(0, 50).forEach(function (r) { var v = J.norm(r[i]); if (!v) return; all++; if (J.parseDate(v)) ok++; });
    return all > 0 && ok / all >= 0.6;
  }
  function buildSelects(map) {
    $("cDur").innerHTML = opts(map.dur, false);
    $("cStart").innerHTML = opts(map.start, false);
    $("cEnd").innerHTML = opts(map.end, false);
    $("cBrk").innerHTML = opts(map.brk, true);
    var mode = map.dur == null && map.start != null && map.end != null ? "range" : "dur";
    document.querySelector('input[name=mode][value="' + mode + '"]').checked = true;
    // 分け方の候補
    S.specs = [{ label: "（分けない）", spec: null }];
    S.headers.forEach(function (h, i) {
      if (i === map.dur || i === map.start || i === map.end || i === map.brk) return;
      if (looksDate(i)) {
        S.specs.push({ label: h + "（月ごと）", spec: { col: i, date: "month" } });
        S.specs.push({ label: h + "（日ごと）", spec: { col: i, date: "day" } });
        S.specs.push({ label: h + "（曜日ごと）", spec: { col: i, date: "weekday" } });
      } else S.specs.push({ label: h, spec: { col: i } });
    });
    var o = S.specs.map(function (s, k) { return '<option value="' + k + '">' + esc(s.label) + "</option>"; }).join("");
    $("gRow").innerHTML = o; $("gCol").innerHTML = o;
    var pick = function (fn) { for (var k = 1; k < S.specs.length; k++) if (fn(S.specs[k].spec)) return k; return 0; };
    var r = map.person != null ? pick(function (s) { return s.col === map.person; }) :
      map.project != null ? pick(function (s) { return s.col === map.project; }) :
      pick(function (s) { return s.date === "month"; });
    $("gRow").value = String(r); $("gCol").value = "0";
    modeView();
  }
  function modeView() {
    var range = document.querySelector("input[name=mode]:checked").value === "range";
    $("durBox").hidden = range; $("rangeBox").hidden = !range;
  }
  function num(id) { var v = $(id).value; return v === "" ? null : +v; }
  function options() {
    return {
      mode: document.querySelector("input[name=mode]:checked").value,
      map: { dur: num("cDur"), start: num("cStart"), end: num("cEnd"), brk: num("cBrk") },
      bareUnit: $("bare").value, brkUnit: $("brkBare").value, overnight: $("overnight").checked,
      roundUnit: +$("rUnit").value || 0, roundHow: $("rHow").value
    };
  }

  // ---------- 集計して表示 ----------
  function refresh() {
    if (!S.rows.length) return;
    var o = options();
    if ((o.mode === "dur" && o.map.dur == null) || (o.mode === "range" && (o.map.start == null || o.map.end == null))) {
      $("sumMsg").innerHTML = '<span class="wtxt">' + (o.mode === "dur" ? "時間の列" : "開始と終了の列") + "を選んでください。</span>";
      $("tableView").innerHTML = ""; $("errView").innerHTML = ""; $("detailView").innerHTML = ""; S.last = null; return;
    }
    var b = J.buildRecords(S.rows, o);
    var rs = S.specs[+$("gRow").value].spec, cs = S.specs[+$("gCol").value].spec;
    if (rs && cs && rs.col === cs.col && rs.date === cs.date) cs = null;
    var ag = J.aggregate(b.recs, rs, cs), how = $("fmt").value;
    var labels = { row: rs ? S.specs[+$("gRow").value].label : "" };
    S.last = { b: b, ag: ag, how: how, labels: labels, o: o, rowLabel: labels.row, colLabel: cs ? S.specs[+$("gCol").value].label : "" };

    var unit = { hm: "時間:分", h: "時間（小数）", m: "分" }[how];
    $("sumMsg").innerHTML = "集計した記録 <b>" + ag.count + "</b> 件、合計 <b>" + esc(J.fmt(ag.total, how)) + "</b>（" + unit + "）" +
      (b.blanks ? "　空欄 " + b.blanks + " 件（数えていません）" : "") +
      (b.errors.length ? '　<span class="wtxt">読めない ' + b.errors.length + " 件（下に一覧）</span>" : "") +
      (b.bare ? '<br><span class="note">単位のない数字 ' + b.bare + " 件を「" + (o.bareUnit === "m" ? "分" : "時間") + "」として数えました。違うときは上で切り替えてください。</span>" : "") +
      (o.roundUnit ? '<br><span class="note">1件ずつ ' + o.roundUnit + " 分単位で" + { down: "切り捨て", up: "切り上げ", near: "四捨五入" }[o.roundHow] + "してから合計しています。</span>" : "");

    var tr = J.tableRows(ag, how, labels);
    $("tableView").innerHTML = '<table class="lt"><thead><tr>' + tr[0].map(function (h, j) { return "<th" + (j ? ' class="n"' : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      tr.slice(1).map(function (r, k) {
        return "<tr" + (r[0] === "合計" && k === tr.length - 2 ? ' class="tot"' : "") + ">" + r.map(function (v, j) { return "<td" + (j ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";

    $("errView").innerHTML = b.errors.length ? "<h3>読めない記録（集計に入っていません）</h3>" + '<table class="lt"><tr><th>行</th><th>値</th><th>理由</th></tr>' +
      b.errors.slice(0, 200).map(function (r) {
        var val = o.mode === "range" ? [r.row[o.map.start], r.row[o.map.end]].concat(o.map.brk != null ? [r.row[o.map.brk]] : []).join(" / ") : r.row[o.map.dur];
        return "<tr><td>" + rowNo(r.i) + "</td><td>" + esc(val) + "</td><td class='wtxt'>" + esc(r.note) + "</td></tr>";
      }).join("") + "</table>" + (b.errors.length > 200 ? '<p class="note">ほか ' + (b.errors.length - 200) + " 件は明細の CSV で確かめられます。</p>" : "") : "";

    var shown = b.recs.slice(0, 100);
    $("detailView").innerHTML = '<table class="lt"><tr><th>行</th>' + S.headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "<th>時間（分）</th><th>メモ</th></tr>" +
      shown.map(function (r) {
        return "<tr" + (r.min == null && r.note !== "空欄" ? ' class="bad"' : "") + "><td>" + rowNo(r.i) + "</td>" + r.row.map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") +
          "<td class='n'>" + esc(r.min == null ? "" : J.fmt(r.min, "m")) + "</td><td class='note'>" + esc(r.note) + "</td></tr>";
      }).join("") + "</table>" + (b.recs.length > 100 ? '<p class="note">画面には先頭100行だけ表示しています。全部は「明細を CSV で保存」で確かめられます。</p>' : "");
  }
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }

  // ---------- 保存 ----------
  function stamp() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function download(name, rows) {
    var blob = new Blob([J.toCSV(rows)], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の集計です。" : "");
  }
  function saveTable() {
    if (!S.last) return;
    var tr = J.tableRows(S.last.ag, S.last.how, S.last.labels);
    download("作業時間_集計_" + stamp() + ".csv", tr);
  }
  function saveDetail() {
    if (!S.last) return;
    var rows = [S.headers.concat(["時間（分）", "時間（時:分）", "時間（時間）", "読み取りメモ"])];
    S.last.b.recs.forEach(function (r) {
      rows.push(r.row.concat(r.min == null ? ["", "", ""] : [J.fmt(r.min, "m"), J.fmt(r.min, "hm"), J.fmt(r.min, "h")], [r.note]));
    });
    download("作業時間_明細_" + stamp() + ".csv", rows);
  }

  // ---------- 印刷 ----------
  function printTable() {
    if (!S.last) return;
    var L = S.last, tr = J.tableRows(L.ag, L.how, L.labels);
    var land = tr[0].length > 7;
    $("pageStyle").textContent = "@page{size:A4 " + (land ? "landscape" : "portrait") + ";margin:12mm}";
    var cond = [];
    cond.push(L.o.mode === "range" ? "開始・終了の時刻から計算" + (L.o.map.brk != null ? "（休憩を引く）" : "") : "時間の列「" + S.headers[L.o.map.dur] + "」を合計");
    if (L.o.roundUnit) cond.push("1件ずつ " + L.o.roundUnit + " 分単位で" + { down: "切り捨て", up: "切り上げ", near: "四捨五入" }[L.o.roundHow]);
    cond.push("記録 " + L.ag.count + " 件");
    if (L.b.errors.length) cond.push("読めない記録 " + L.b.errors.length + " 件は含まない");
    cond.push({ hm: "表示は 時間:分", h: "表示は 時間（小数第2位まで）", m: "表示は 分" }[L.how]);
    var title = $("title").value.trim() || "作業時間の集計";
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" +
      '<p class="per">' + esc(cond.join("　/　")) + (L.colLabel ? "　/　行：" + esc(L.rowLabel) + "、列：" + esc(L.colLabel) : "") + "</p>" +
      '<table class="pt"><thead><tr>' + tr[0].map(function (h, j) { return "<th" + (j ? ' class="n"' : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      tr.slice(1).map(function (r, k) {
        return "<tr" + (r[0] === "合計" && k === tr.length - 2 ? ' class="tot"' : "") + ">" + r.map(function (v, j) { return "<td" + (j ? ' class="n"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>" +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "") +
      '<p class="ft small">作成日 ' + new Date().toLocaleDateString("ja-JP") + "</p>";
    window.print();
  }

  // ---------- 見本 ----------
  var SAMPLE = "日付\t担当者\t案件\t作業時間\tメモ\n" +
    "2026/11/02\t青木\tA社 ホームページ更新\t1:30\t\n2026/11/02\t石井\tB社 チラシ\t90分\t\n2026/11/04\t青木\tB社 チラシ\t1.5h\t\n" +
    "2026/11/05\t上田\tA社 ホームページ更新\t2時間半\t打合せ含む\n2026/11/06\t石井\tA社 ホームページ更新\t0:45\t\n2026/11/09\t青木\t社内\t30分\t\n" +
    "2026/11/10\t上田\tB社 チラシ\t1時間45分\t\n2026/11/12\t石井\tB社 チラシ\t2\t\n2026/11/13\t青木\tA社 ホームページ更新\t3:15\t\n" +
    "2026/11/16\t上田\t社内\t45min\t\n2026/11/18\t石井\tA社 ホームページ更新\t1時間\t\n2026/11/19\t青木\tB社 チラシ\t少し\t後で確認\n" +
    "2026/12/01\t上田\tA社 ホームページ更新\t1.25時間\t\n2026/12/02\t石井\t社内\t20分\t\n2026/12/03\t青木\tB社 チラシ\t2:10\t\n";

  // ---------- 設定の保存（列の内容は保存しない） ----------
  var KEYS = ["bare", "brkBare", "rUnit", "rHow", "fmt", "title"];
  function saveSettings() {
    try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.overnight = $("overnight").checked; localStorage.setItem("jikan-goukei", JSON.stringify(o)); } catch (e) {}
  }
  function loadSettings() {
    try { var o = JSON.parse(localStorage.getItem("jikan-goukei") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); if (o.overnight != null) $("overnight").checked = o.overnight; } catch (e) {}
  }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(J.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(J.parseCSV(SAMPLE), true, "見本"); };
    [].forEach.call(document.querySelectorAll("input[name=mode]"), function (r) { r.onchange = function () { modeView(); refresh(); }; });
    ["cDur", "cStart", "cEnd", "cBrk", "bare", "brkBare", "overnight", "rUnit", "rHow", "gRow", "gCol", "fmt"].forEach(function (id) {
      $(id).onchange = function () { saveSettings(); refresh(); };
    });
    $("title").onchange = saveSettings;
    $("pTable").onclick = printTable; $("cTable").onclick = saveTable; $("cDetail").onclick = saveDetail;
  });
})();
