/* シフト表の集計と点検 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.SHIFT, WD = K.WD;
  var LIMIT = window.SHIFT_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "", LAY = null, R = null, userYm = false;
  var KEY = "shift-tenken-settings";
  var SET_IDS = ["codes", "need", "directBreak", "emptyOff", "streak", "gap", "week", "weekStart", "day", "month", "minOff", "title", "by"];

  function saveSettings() { try { var o = {}; SET_IDS.forEach(function (id) { var e = $(id); o[id] = e.type === "checkbox" ? e.checked : e.value; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
  function loadSettings() {
    var o = null; try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { }
    if (!o) { $("codes").value = K.DEFAULT_CODES; return; }
    SET_IDS.forEach(function (id) { var e = $(id); if (o[id] == null) return; if (e.type === "checkbox") e.checked = !!o[id]; else e.value = o[id]; });
    if (!$("codes").value.trim()) $("codes").value = K.DEFAULT_CODES;
  }

  // ---------- 読み込み ----------
  function setData(rows, name) {
    rows = rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); });
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || ""; userYm = false;
    LAY = K.findLayout(RAW);
    if (LAY.err) { $("loadMsg").innerHTML = '<span class="bad">' + esc(LAY.err) + "</span>"; $("layBox").hidden = true; $("out").hidden = true; return; }
    var wdCells = LAY.wdRow >= 0 ? LAY.dcols.map(function (c) { return RAW[LAY.wdRow][c]; }) : null;
    var g = K.guessMonth(LAY.heads, wdCells, Math.floor(Date.now() / 86400000));
    if (g) { $("ym").value = g.y + "-" + (g.m < 10 ? "0" : "") + g.m; }
    else if (!$("ym").value) { var t = new Date(); t.setMonth(t.getMonth() + 1); $("ym").value = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2); }
    $("ymNote").textContent = g && g.sure ? "（見出しの曜日・日付から選びました）" : "（見出しに曜日がないため、最初の列の月を選んでください）";
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + RAW.length + " 行を読み込みました。";
    drawLayout(); refresh();
  }
  function colName(ci) { var h = K.norm(RAW[LAY.headRow][ci]); return String.fromCharCode(65 + (ci % 26)) + (ci >= 26 ? String(Math.floor(ci / 26)) : "") + "列" + (h ? "（" + h + "）" : ""); }
  function drawLayout() {
    $("layBox").hidden = false;
    var first = LAY.dcols[0], opts = function (sel) { var h = '<option value="">（なし）</option>'; for (var ci = 0; ci < first; ci++) h += '<option value="' + ci + '"' + (sel === ci ? " selected" : "") + ">" + esc(colName(ci)) + "</option>"; return h; };
    $("lay").innerHTML = "見出し：" + (LAY.headRow + 1) + " 行目" + (LAY.wdRow >= 0 ? "（曜日の行：" + (LAY.wdRow + 1) + " 行目）" : "") + "　日付の列：" + LAY.dcols.length + " 列（" + esc(K.norm(RAW[LAY.headRow][LAY.dcols[0]])) + " 〜 " + esc(K.norm(RAW[LAY.headRow][LAY.dcols[LAY.dcols.length - 1]])) + "）" +
      '<div class="row"><label>名前の列 <select id="nameCol">' + opts(LAY.nameCol) + '</select></label><label>職種・部署の列（任意） <select id="groupCol">' + opts(LAY.groupCol) + "</select></label></div>";
    $("nameCol").onchange = function () { LAY.nameCol = this.value === "" ? null : +this.value; refresh(); };
    $("groupCol").onchange = function () { LAY.groupCol = this.value === "" ? null : +this.value; refresh(); };
  }
  function readFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg").textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array", cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "yyyy/m/d" })
            .filter(function (rr) { return rr.some(function (v) { return String(v).trim() !== ""; }); });
          setData(rows, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(K.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function num(id) { var v = parseFloat($(id).value); return v > 0 ? v : 0; }
  function opts() {
    var ym = $("ym").value.split("-");
    return { layout: LAY, ym: ym.length === 2 ? { y: +ym[0], m: +ym[1] } : null, codes: $("codes").value, need: $("need").value, directBreak: $("directBreak").value,
      emptyIsWork: !$("emptyOff").checked, streak: num("streak"), gap: num("gap"), week: num("week"), weekStart: +$("weekStart").value, day: num("day"), month: num("month"), minOff: num("minOff"),
      group: $("gsel").value, limit: LIMIT };
  }
  function refresh() {
    saveSettings();
    var C = K.parseCodes($("codes").value);
    $("codesMsg").innerHTML = C.bad.length ? '<span class="wtxt">読めない行 ' + C.bad.length + " 件（" + C.bad.map(function (b) { return b.line + " 行目：" + esc(b.why); }).join("、") + "）</span>" : "記号 " + C.order.length + " 個";
    var N = K.parseNeed($("need").value);
    $("needMsg").innerHTML = N.bad.length ? '<span class="wtxt">読めない行 ' + N.bad.length + " 件（" + N.bad.map(function (b) { return b.line + " 行目：" + esc(b.why); }).join("、") + "）</span>" : "";
    if (!RAW || !LAY || LAY.err) { $("out").hidden = true; return; }
    $("out").hidden = false;
    if (LAY.nameCol == null) { $("sumMsg").innerHTML = '<span class="bad">名前の列を選んでください。</span>'; $("view").innerHTML = ""; return; }
    var t0 = Date.now();
    R = K.run(RAW, opts());
    if (R.err) { $("sumMsg").innerHTML = '<span class="bad">' + esc(R.err) + "</span>"; return; }
    var gs = $("gsel"), cur = gs.value;
    gs.innerHTML = '<option value="">全員</option>' + R.groups.map(function (g) { return "<option" + (g === cur ? " selected" : "") + ">" + esc(g) + "</option>"; }).join("");
    $("gselL").hidden = !R.groups.length;
    var d0 = R.days[0], d1 = R.days[R.days.length - 1], tw = R.people.reduce(function (a, p) { return a + p.work; }, 0);
    var kinds = {}; R.flags.forEach(function (f) { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
    var parts = [K.dayLabel(d0) + " 〜 " + K.dayLabel(d1, true) + "（" + R.days.length + " 日）", "<b>" + R.people.length + " 人</b>", "勤務 " + R.recs.filter(function (x) { return x.kind === "work"; }).length + " 回・合計 " + K.hours(tw)];
    parts.push(R.flags.length ? '<span class="bad">確かめたい所 ' + R.flags.length + " 件</span>（" + Object.keys(kinds).map(function (k) { return esc(k) + " " + kinds[k]; }).join("、") + "）" : "決めた条件に当たる所はありません");
    if (R.bad.length) parts.push('<span class="wtxt">読めないマス ' + R.bad.length + " 件</span>");
    if (R.wdMismatch) parts.push('<span class="bad">見出しの曜日と、選んだ月の曜日が ' + R.wdMismatch + " 列で合いません（対象の月を確かめてください）</span>");
    if (R.badDays.length) parts.push('<span class="wtxt">存在しない日付の列 ' + R.badDays.length + " 列（数えていません）</span>");
    if (R.dupes.length) parts.push('<span class="wtxt">同じ名前の行：' + R.dupes.map(esc).join("、") + "（別の人として数えています）</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを計算しています（ほか " + R.cut + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + ' <span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    view();
  }
  function th(a, cls) { return a.map(function (x) { return "<th" + (cls && cls[x] ? ' class="n"' : "") + ">" + esc(x) + "</th>"; }).join(""); }
  function personTable(forPrint) {
    var pc = R.personCodes, h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>名前</th>' + (R.groups.length ? "<th>職種</th>" : "") + '<th class="n">出勤</th><th class="n">休み</th><th class="n">有休</th><th class="n">勤務時間</th>' + pc.map(function (c) { return '<th class="n">' + esc(c) + "</th>"; }).join("") + '<th class="n">夜勤</th><th class="n">最長の連続</th><th class="n">最短の間隔</th><th class="n">週の最大</th><th>確かめたい所</th></tr></thead><tbody>';
    R.people.forEach(function (P) {
      h += "<tr" + (P.flags.length ? ' class="fl"' : "") + "><td>" + esc(P.label) + "</td>" + (R.groups.length ? "<td>" + esc(P.group) + "</td>" : "") +
        '<td class="n">' + P.nWork + '</td><td class="n">' + P.nRest + '</td><td class="n">' + (P.nPaid || "") + '</td><td class="n">' + K.hours(P.work) + "</td>" +
        pc.map(function (c) { return '<td class="n">' + (P.byCode[c] || "") + "</td>"; }).join("") +
        '<td class="n">' + (P.nNight || "") + '</td><td class="n">' + (P.maxStreak ? P.maxStreak + "日" : "") + '</td><td class="n">' + (P.minGap != null ? K.hours(P.minGap) : "") + '</td><td class="n">' + (P.maxWeek ? K.hours(P.maxWeek) : "") + "</td>" +
        '<td class="w">' + (P.flags.length ? P.flags.map(function (f) { return esc(f.kind); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join("・") + " " + P.flags.length + "件" : "") + "</td></tr>";
    });
    return h + "</tbody></table>";
  }
  function flagTable(forPrint) {
    if (!R.flags.length && !R.bad.length) return '<p class="note">決めた条件に当たる所はありません。</p>';
    var h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>日付</th><th>名前</th><th>内容</th><th>説明</th></tr></thead><tbody>';
    R.flags.forEach(function (f) { h += "<tr><td>" + K.dayLabel(f.day, true) + "</td><td>" + esc(f.name) + "</td><td>" + esc(f.kind) + '</td><td class="w">' + esc(f.text) + "</td></tr>"; });
    R.bad.forEach(function (b) { h += "<tr><td>" + K.dayLabel(b.day, true) + "</td><td>" + esc(b.name) + '</td><td>読めないマス</td><td class="w">「' + esc(b.v) + "」（" + b.row + " 行目）。記号の表に足すか、時刻（9:00-17:00）で書いてください</td></tr>"; });
    return h + "</tbody></table>";
  }
  function dailyTable(forPrint) {
    var co = R.codeOrder, hasNeed = R.need.rules.length;
    var h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>日付</th>' + co.map(function (c) { return '<th class="n">' + esc(c) + "</th>"; }).join("") + '<th class="n">計</th><th class="n">有休</th><th class="n">勤務時間</th>' + (hasNeed ? "<th>足りない</th>" : "") + "</tr></thead><tbody>";
    R.daily.forEach(function (d) {
      var w = K.wdOf(d.day);
      h += "<tr" + (d.short.length ? ' class="fl"' : "") + "><td" + (w === 0 ? ' class="sun"' : w === 6 ? ' class="sat"' : "") + ">" + K.dayLabel(d.day, true) + "</td>" + co.map(function (c) { return '<td class="n">' + (d.cnt[c] || "") + "</td>"; }).join("") +
        '<td class="n"><b>' + d.tot + '</b></td><td class="n">' + (d.paid || "") + '</td><td class="n">' + K.hours(d.workMin) + "</td>" + (hasNeed ? '<td class="w">' + d.short.map(function (s) { return esc(s.code) + " " + s.have + "/" + s.need; }).join("、") + "</td>" : "") + "</tr>";
    });
    return h + "</tbody></table>";
  }
  function recTable() {
    var list = R.recs.slice().sort(function (a, b) { return a.day - b.day || (a.s || 0) - (b.s || 0); });
    var h = '<table class="lt"><thead><tr><th>日付</th><th>名前</th>' + (R.groups.length ? "<th>職種</th>" : "") + '<th>記号</th><th>出勤</th><th>退勤</th><th class="n">休憩</th><th class="n">勤務時間</th><th>メモ</th></tr></thead><tbody>';
    list.slice(0, 3000).forEach(function (x) {
      h += "<tr><td>" + K.dayLabel(x.day, true) + "</td><td>" + esc(x.name) + "</td>" + (R.groups.length ? "<td>" + esc(x.group) + "</td>" : "") + "<td>" + esc(x.code) + "</td>" +
        (x.kind === "work" ? "<td>" + K.hm(x.s) + "</td><td>" + K.hm(x.e) + '</td><td class="n">' + x.brk + '分</td><td class="n">' + K.hours(x.work) + "</td>" : '<td colspan="3">有休</td><td class="n">' + (x.paid ? K.hours(x.paid) : "") + "</td>") + "<td>" + esc(x.memo || "") + "</td></tr>";
    });
    return h + "</tbody></table>" + (list.length > 3000 ? '<p class="note">画面には先頭 3,000 行を表示しています。保存するとすべて入ります。</p>' : "");
  }
  function view() {
    var v = $("vsel").value, h = "";
    if (v === "person") h = personTable();
    else if (v === "flag") h = flagTable();
    else if (v === "daily") h = dailyTable();
    else h = recTable();
    $("view").innerHTML = '<div class="scroll">' + h + "</div>";
  }

  // ---------- 印刷 ----------
  function head(sub) {
    var t = $("title").value || "シフト表の集計", by = $("by").value;
    return "<h1>" + esc(t) + "　<small>" + esc(sub) + "</small></h1><p class=\"per\">" + K.dayLabel(R.days[0]) + " 〜 " + K.dayLabel(R.days[R.days.length - 1], true) + (by ? "　" + esc(by) : "") + "　点検の決まり：" + rulesText() + "</p>";
  }
  function rulesText() {
    var a = [];
    if (num("streak")) a.push("連続勤務 " + num("streak") + "日まで");
    if (num("gap")) a.push("勤務の間隔 " + num("gap") + "時間以上");
    if (num("week")) a.push("週 " + num("week") + "時間まで（" + (+$("weekStart").value ? "月" : "日") + "曜始まり）");
    if (num("day")) a.push("1日 " + num("day") + "時間まで");
    if (num("month")) a.push("表の合計 " + num("month") + "時間まで");
    if (num("minOff")) a.push("休み " + num("minOff") + "日以上");
    return a.join("、") || "なし";
  }
  function doPrint(html, landscape) {
    $("pageSize").textContent = "@page{size:A4 " + (landscape ? "landscape" : "portrait") + ";margin:10mm}";
    $("printArea").innerHTML = html;
    window.print();
  }

  // ---------- 保存 ----------
  function dl(name, blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function personRows() {
    var pc = R.personCodes, out = [["名前"].concat(R.groups.length ? ["職種"] : [], ["出勤日数", "休み日数", "有休日数", "勤務時間", "勤務時間（時間）"], pc.map(function (c) { return c + "の回数"; }), ["夜勤の回数", "最長の連続勤務（日）", "最短の勤務の間隔", "週の最大の時間", "確かめたい所"])];
    R.people.forEach(function (P) {
      out.push([P.label].concat(R.groups.length ? [P.group] : [], [P.nWork, P.nRest, P.nPaid, K.hours(P.work), K.dec(P.work)], pc.map(function (c) { return P.byCode[c] || 0; }), [P.nNight, P.maxStreak, P.minGap != null ? K.hours(P.minGap) : "", K.hours(P.maxWeek), P.flags.map(function (f) { return f.kind + "：" + f.text; }).join(" / ")]));
    });
    return out;
  }
  function recRows() {
    var out = [["日付", "曜日", "氏名"].concat(R.groups.length ? ["職種"] : [], ["記号", "出勤", "退勤", "休憩（分）", "勤務時間", "勤務時間（時間）", "メモ"])];
    R.recs.slice().sort(function (a, b) { return a.day - b.day || (a.s || 0) - (b.s || 0); }).forEach(function (x) {
      var o = K.ymd(x.day), d = o.y + "/" + o.m + "/" + o.d;
      if (x.kind === "work") out.push([d, WD[K.wdOf(x.day)], x.name].concat(R.groups.length ? [x.group] : [], [x.code, K.hm(x.s).replace("翌", ""), K.hm(x.e).replace("翌", ""), x.brk, K.hours(x.work), K.dec(x.work), x.memo || ""]));
      else out.push([d, WD[K.wdOf(x.day)], x.name].concat(R.groups.length ? [x.group] : [], [x.code, "", "", "", x.paid ? K.hours(x.paid) : "", x.paid ? K.dec(x.paid) : "", "有休"]));
    });
    return out;
  }
  function flagRows() { var out = [["日付", "名前", "内容", "説明"]]; R.flags.forEach(function (f) { var o = K.ymd(f.day); out.push([o.y + "/" + o.m + "/" + o.d, f.name, f.kind, f.text]); }); R.bad.forEach(function (b) { var o = K.ymd(b.day); out.push([o.y + "/" + o.m + "/" + o.d, b.name, "読めないマス", b.v + "（" + b.row + "行目）"]); }); return out; }
  function dailyRows() {
    var co = R.codeOrder, out = [["日付", "曜日"].concat(co, ["計", "有休", "勤務時間", "足りない"])];
    R.daily.forEach(function (d) { var o = K.ymd(d.day); out.push([o.y + "/" + o.m + "/" + o.d, WD[K.wdOf(d.day)]].concat(co.map(function (c) { return d.cnt[c] || 0; }), [d.tot, d.paid, K.hours(d.workMin), d.short.map(function (s) { return s.code + " " + s.have + "/" + s.need; }).join("、")])); });
    return out;
  }
  function base() { return ($("title").value || "シフト表").replace(/[\\\/:*?"<>|]/g, "_"); }

  // ---------- 見本（架空の名前） ----------
  function sample() {
    var names = [["青木 一郎", "ホール"], ["石井 花", "ホール"], ["上田 健", "キッチン"], ["江藤 さくら", "キッチン"], ["小野 大輔", "ホール"], ["加藤 美咲", "キッチン"], ["木村 翔", "ホール"], ["工藤 葵", "ホール"]];
    var pat = [
      "早早遅休早早早早早休遅遅休早早有早遅休休早早遅遅休早早休遅遅休",
      "遅遅休早早休遅遅早休休遅遅早休早早遅休遅遅休早早休遅遅休早早遅",
      "早早早休休早早早早休休早早早早休休早早早早休休早早早早休休早早",
      "遅夜休休遅遅遅休遅遅夜早休遅遅休休遅遅遅休休遅遅遅休休遅遅休休",
      "休中中中中休休中中中中休休中中中中休休中中中中休休中中中中休休",
      "中中休休中中中中中休休中中中中中休休中中中中中休休中中中中中休",
      "休休遅遅休休休遅遅遅休休休遅遅休休休遅遅遅休休休遅遅休休休遅遅",
      "早休休早早休休早休休早早休休早休休早早休休早休休早早休休早休休早"
    ];
    var y = 2026, m = 12, n = 31, h = ["氏名", "職種"], w = ["", ""];
    for (var d = 1; d <= n; d++) { h.push(String(d)); w.push(WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]); }
    var rows = [["2026年12月 シフト表（見本・架空の名前）"], h, w];
    names.forEach(function (nm, i) { var r = [nm[0], nm[1]]; for (var d = 0; d < n; d++) r.push(pat[i][d] || ""); rows.push(r); });
    rows[6][2 + 11] = "10:00-20:00"; // 加藤 12/12 時刻を直接
    rows[8][2 + 20] = "早(研修)";
    rows[9][2 + 23] = "早遅";
    $("need").value = "早 1\n遅 1\n計 4\n土日 計 5";
    setData(rows, "見本");
  }

  // ---------- つなぐ ----------
  loadSettings();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var dr = $("drop");
  dr.ondragover = function (e) { e.preventDefault(); dr.classList.add("over"); };
  dr.ondragleave = function () { dr.classList.remove("over"); };
  dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
  $("sample").onclick = sample;
  $("resetCodes").onclick = function () { $("codes").value = K.DEFAULT_CODES; refresh(); };
  ["codes", "need"].forEach(function (id) { var tm; $(id).oninput = function () { clearTimeout(tm); tm = setTimeout(refresh, 300); }; });
  ["ym", "directBreak", "emptyOff", "streak", "gap", "week", "weekStart", "day", "month", "minOff", "gsel"].forEach(function (id) { $(id).onchange = refresh; });
  ["title", "by"].forEach(function (id) { $(id).oninput = saveSettings; });
  $("vsel").onchange = view;
  $("pPerson").onclick = function () { if (R) doPrint(head("1人ごとの集計") + personTable(true), true); };
  $("pFlag").onclick = function () { if (R) doPrint(head("確かめたい所") + flagTable(true), false); };
  $("pDaily").onclick = function () { if (R) doPrint(head("日ごとの人数" + ($("gsel").value ? "（" + $("gsel").value + "）" : "")) + dailyTable(true), false); };
  $("xAll").onclick = function () {
    if (!R) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new();
    [["1人ごと", personRows()], ["確かめたい所", flagRows()], ["日ごとの人数", dailyRows()], ["1行1件", recRows()]].forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s[1]), s[0]); });
    XLSX.writeFile(wb, base() + "_集計.xlsx");
    $("saveMsg").textContent = "Excel ファイルを保存しました（4シート）。";
  };
  $("cRec").onclick = function () { if (R) { dl(base() + "_1行1件.csv", new Blob([K.toCSV(recRows())], { type: "text/csv" })); $("saveMsg").textContent = "1行1件の CSV（UTF-8・BOM 付き）を保存しました。"; } };
  $("cPerson").onclick = function () { if (R) { dl(base() + "_1人ごと.csv", new Blob([K.toCSV(personRows())], { type: "text/csv" })); $("saveMsg").textContent = "1人ごとの集計の CSV を保存しました。"; } };
  refresh();
})();
