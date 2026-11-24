/* 講習会の受講日程表 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KOUSHU, WD = K.WD;
  var LIMIT = window.KOUSHU_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: null, hasHead: true };
  var S = { R: null };

  // ---------- 読み込み ----------
  function base() { var v = $("start").value, m = v.match(/^(\d{4})-(\d{2})$/); if (m) return { y: +m[1], m: +m[2] }; var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function sched() { return K.parseSchedule($("sch").value, base()); }
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    T.hasHead = $("hasHead").checked;
    T.headers = T.hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = T.hasHead ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    prep();
    T.cols = K.guessCols(T.headers, T.rows, sched());
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。";
    $("colBox").hidden = false;
    drawCols(); refresh();
  }
  function opt(sel, k, label) {
    return "<label>" + label + '</label><select data-k="' + k + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) { return '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
  }
  function drawCols() {
    var C = T.cols, h = '<div class="colgrid">' + opt(C.name, "name", "名前の列") + opt(C.grade, "grade", "学年・組（任意）") +
      '<label>申込の表の形</label><select id="mode"><option value="matrix"' + (C.mode === "matrix" ? " selected" : "") + '>生徒×講座（講座ごとの列に ○）</option><option value="long"' + (C.mode === "long" ? " selected" : "") + ">講座の列に講座名（1行1件、または「数学、英語」）</option></select>";
    if (C.mode === "long") h += opt(C.course, "course", "講座の列");
    h += "</div>";
    if (C.mode === "matrix") {
      var sch = sched();
      h += '<p class="note" style="margin:8px 0 4px">講座の列（○・✓・1 などが書いてあれば申込。空欄・×・0・なし は申込なし）</p><div class="sesl">' + T.headers.map(function (hd, i) {
        if (i === C.name || i === C.grade) return "";
        var c = K.findCourse(sch, hd);
        return '<label><input type="checkbox" data-ci="' + i + '"' + (C.courses.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(hd) + (c ? (K.key(c.name) !== K.key(hd) ? ' <span class="note">→ ' + esc(c.name) + "</span>" : "") : ' <span class="wtxt">（日程にない）</span>') + "</label>";
      }).join("") + "</div>";
    }
    $("cols").innerHTML = h;
    Array.prototype.forEach.call($("cols").querySelectorAll("select[data-k]"), function (s) {
      s.onchange = function () { C[s.dataset.k] = s.value === "" ? null : +s.value; if (s.dataset.k !== "course") { C.courses = C.courses.filter(function (i) { return i !== C.name && i !== C.grade; }); drawCols(); } refresh(); };
    });
    $("mode").onchange = function () { C.mode = this.value; if (C.mode === "long" && C.course == null) { var g = K.guessCols(T.headers, T.rows, { courses: [], byKey: {} }); C.course = g.course; } drawCols(); refresh(); };
    Array.prototype.forEach.call($("cols").querySelectorAll("input[data-ci]"), function (b) {
      b.onchange = function () { var i = +b.dataset.ci; C.courses = C.courses.filter(function (x) { return x !== i; }); if (b.checked) C.courses.push(i); C.courses.sort(function (a, b) { return a - b; }); refresh(); };
    });
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd" })
            .map(function (rr) { return rr.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (rr) { return rr.some(function (v) { return v.trim() !== ""; }); });
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
  function clearOut(msg) { S.R = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    var sc = sched();
    $("schMsg").innerHTML = $("sch").value.trim() ? "講座 " + sc.courses.length + " 件・のべ " + sc.courses.reduce(function (a, c) { return a + c.sessions.length; }, 0) + " コマを読みました" + (sc.bad.length ? '　<span class="wtxt">読めない行 ' + sc.bad.length + " 件（" + sc.bad.map(function (b) { return b.line + " 行目：" + esc(b.why); }).join("、") + "）</span>" : "") : "";
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    var C = T.cols;
    if (C.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
    if (!sc.courses.length) return clearOut('<span class="bad">2. に講座の日程を書いてください。</span>');
    if (C.mode === "matrix" && !C.courses.length) return clearOut('<span class="bad">講座の列にチェックを入れてください。</span>');
    if (C.mode === "long" && C.course == null) return clearOut('<span class="bad">講座の列を選んでください。</span>');
    var t0 = Date.now(), R = K.run(T.headers, T.rows, { cols: C, schedule: $("sch").value, base: base(), rowBase: T.hasHead ? 2 : 1, limit: LIMIT });
    S.R = R;
    var hard = R.conflicts.filter(function (c) { return c.hard; }).length, soft = R.conflicts.length - hard;
    var parts = ["生徒 <b>" + R.students.length + " 人</b>", "講座 " + R.courses.length + " 件", "受講ののべ <b>" + R.slots + " コマ</b>"];
    if (R.days.length) parts.push(K.md(R.days[0].n) + "〜" + K.md(R.days[R.days.length - 1].n) + "（" + R.days.length + " 日）");
    if (hard) parts.push('<span class="bad">時間が重なる申込 ' + hard + " 件</span>"); else parts.push("時間が重なる申込はありません");
    if (soft) parts.push('<span class="wtxt">同じ日で時刻のない講座 ' + soft + " 件</span>");
    if (R.unknown.length) parts.push('<span class="bad">日程にない講座名 ' + R.unknown.length + " 件</span>");
    if (R.places.length) parts.push('<span class="wtxt">同じ場所・同じ時間の講座 ' + R.places.length + " 件</span>");
    if (R.checks.length) parts.push('<span class="wtxt">確かめたい所 ' + R.checks.length + " 件</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを計算しています（ほか " + R.cut + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function sortedStudents() {
    var a = S.R.students.slice(), s = $("sort").value;
    if (s === "grade") a.sort(function (p, q) { return (p.grade || "￿").localeCompare(q.grade || "￿", "ja", { numeric: true }) || p.row - q.row; });
    if (s === "name") a.sort(function (p, q) { return p.name.localeCompare(q.name, "ja") || p.row - q.row; });
    return a;
  }
  function hasG() { return T.cols.grade != null; }
  function sessText(c) {
    // 同じ時刻の続く日はまとめる：12/25(金)〜12/28(月) 13:00〜14:30
    var out = [], g = [];
    c.sessions.forEach(function (s) {
      var k = K.tspan(s) + "|" + s.place, last = g[g.length - 1];
      if (last && last.k === k) last.ns.push(s.n); else g.push({ k: k, ns: [s.n], s: s });
    });
    g.forEach(function (x) {
      var runs = [], st = x.ns[0], pv = x.ns[0];
      for (var i = 1; i <= x.ns.length; i++) { var n = x.ns[i]; if (n === pv + 1) { pv = n; continue; } runs.push(st === pv ? K.md(st) : K.md(st) + "〜" + K.md(pv)); st = pv = n; }
      out.push(runs.join("・") + " " + (x.s.s == null ? "" : K.tspan(x.s)) + (x.s.place ? " " + x.s.place : ""));
    });
    return out.join(" ／ ");
  }
  function listView() {
    var R = S.R, v = $("view").value, h = "", g = hasG();
    if (v === "st") {
      h = '<div class="scroll"><table class="lt"><tr><th>行</th><th>名前</th>' + (g ? "<th>学年・組</th>" : "") + '<th>申込の講座</th><th class="n">コマ</th><th class="n">日数</th><th>重なり</th></tr>' +
        sortedStudents().map(function (st) {
          var cf = R.conflicts.filter(function (c) { return c.name === st.name && c.grade === st.grade; });
          return "<tr" + (cf.some(function (c) { return c.hard; }) ? ' class="fl"' : "") + "><td>" + st.rows.join(",") + "</td><td>" + esc(st.name) + "</td>" + (g ? "<td>" + esc(st.grade) + "</td>" : "") + '<td class="w">' + esc(st.courses.map(function (c) { return c.name; }).join("、")) + '</td><td class="n">' + st.sessions.length + '</td><td class="n">' + st.dayN + '</td><td class="w">' +
            esc(cf.map(function (c) { return K.md(c.n) + " " + c.a.course + "×" + c.b.course; }).join("、")) + "</td></tr>";
        }).join("") + "</table></div>";
    } else if (v === "mx") h = '<div class="scroll">' + matrix("lt") + "</div>";
    else if (v === "co") {
      h = '<div class="scroll"><table class="lt"><tr><th>講座</th><th>日程</th><th class="n">コマ</th><th class="n">人数</th><th class="n">定員</th><th>受講する人</th></tr>' + R.courses.map(function (c) {
        var over = c.cap && c.students.length > c.cap;
        return "<tr" + (over ? ' class="fl"' : "") + "><td>" + esc(c.name) + '</td><td class="w">' + esc(sessText(c)) + '</td><td class="n">' + c.sessions.length + '</td><td class="n"><b>' + c.students.length + '</b></td><td class="n">' + (c.cap || "") + '</td><td class="w">' + esc(c.students.map(function (st) { return st.name; }).join("、")) + "</td></tr>";
      }).join("") + "</table></div>";
    } else if (v === "dy") h = '<div class="scroll">' + dayTable("lt") + "</div>";
    $("listView").innerHTML = h;
  }
  function matrix(cls) {
    var R = S.R, g = hasG();
    if (!R.days.length) return "";
    return '<table class="' + cls + ' mx"><tr><th class="l">名前</th>' + (g ? '<th class="l">学年</th>' : "") + R.days.map(function (d) { var t = K.ymd(d.n); return '<th class="c">' + t.m + "/" + t.d + "<br>" + WD[t.w] + "</th>"; }).join("") + '<th class="n">コマ</th></tr>' +
      sortedStudents().map(function (st) {
        return '<tr><td class="l">' + esc(st.name) + "</td>" + (g ? '<td class="l">' + esc(st.grade) + "</td>" : "") + R.days.map(function (d) {
          var ss = st.sessions.filter(function (s) { return s.n === d.n; });
          return '<td class="c' + (ss.some(function (s) { return s.clash; }) ? " cl" : "") + '">' + ss.map(function (s) { return "<div>" + esc(s.course) + (s.s != null ? '<span class="tm">' + K.hm(s.s) + "</span>" : "") + "</div>"; }).join("") + "</td>";
        }).join("") + '<td class="n">' + st.sessions.length + "</td></tr>";
      }).join("") + '<tr class="tot"><td class="l"' + (g ? ' colspan="2"' : "") + '>その日に来る人数</td>' + R.days.map(function (d) { return '<td class="c">' + d.people + "</td>"; }).join("") + '<td class="n">' + R.slots + "</td></tr></table>";
  }
  function dayTable(cls) {
    return '<table class="' + cls + '"><tr><th class="l">日付</th><th class="l">時刻</th><th class="l">講座</th><th class="l">場所・講師</th><th class="n">人数</th></tr>' + S.R.days.map(function (d) {
      return d.list.map(function (x, i) {
        return "<tr>" + (i === 0 ? '<td class="l" rowspan="' + d.list.length + '"><b>' + K.md(d.n) + '</b><br><span class="note">来る人 ' + d.people + " 人</span></td>" : "") + '<td class="l">' + esc(K.tspan(x)) + '</td><td class="l">' + esc(x.course) + '</td><td class="l">' + esc(x.place) + '</td><td class="n">' + x.people + "</td></tr>";
      }).join("");
    }).join("") + "</table>";
  }
  function errView() {
    var R = S.R, h = "";
    if (R.conflicts.length) h += "<h3>時間が重なる申込（" + R.conflicts.length + '）</h3><div class="scroll" style="max-height:240px"><table class="lt"><tr><th>行</th><th>名前</th><th>日付</th><th>講座と時刻</th><th>内容</th></tr>' + R.conflicts.map(function (c) {
      return "<tr" + (c.hard ? ' class="fl"' : "") + "><td>" + c.row + "</td><td>" + esc(c.name) + (c.grade ? "（" + esc(c.grade) + "）" : "") + "</td><td>" + K.md(c.n) + '</td><td class="w">' + esc(c.a.course + " " + K.tspan(c.a) + " と " + c.b.course + " " + K.tspan(c.b)) + '</td><td class="w">' + esc(c.why) + "</td></tr>";
    }).join("") + "</table></div>";
    if (R.unknown.length) h += "<h3>日程にない講座名（" + R.unknown.length + '）</h3><table class="lt"><tr><th>申込の表の講座名</th><th>行</th><th>直し方</th></tr>' + R.unknown.map(function (u) { return "<tr><td>" + esc(u.text) + '</td><td class="w">' + esc(u.rows.slice(0, 20).join(",") + (u.rows.length > 20 ? " ほか" : "")) + '</td><td class="w">2. の日程に同じ講座名の行を足すか、申込の表の書き方を日程に合わせてください</td></tr>'; }).join("") + "</table>";
    if (R.places.length) h += "<h3>同じ場所・同じ時間の講座（" + R.places.length + '）</h3><table class="lt">' + R.places.map(function (p) { return "<tr><td>" + K.md(p.n) + "</td><td>" + esc(p.place) + '</td><td class="w">' + esc(p.a + " と " + p.b) + "</td></tr>"; }).join("") + "</table>";
    if (R.checks.length) h += "<h3>確かめたい所（" + R.checks.length + '）</h3><div class="scroll" style="max-height:220px"><table class="lt"><tr><th>行</th><th>名前・講座</th><th>内容</th></tr>' + R.checks.slice(0, 500).map(function (c) { return "<tr" + (c.lv === "e" ? ' class="fl"' : "") + "><td>" + c.row + "</td><td>" + esc(c.name) + '</td><td class="w">' + esc(c.why) + "</td></tr>"; }).join("") + "</table></div>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function title() { return $("title").value.trim() || "講習会の受講日程"; }
  function head(sub) { return "<h1>" + esc(title()) + "　" + esc(sub) + '</h1><p class="per">' + (S.R.days.length ? K.md(S.R.days[0].n) + "〜" + K.md(S.R.days[S.R.days.length - 1].n) + "　" : "") + "生徒 " + S.R.students.length + " 人・講座 " + S.R.courses.length + " 件" + ($("by").value.trim() ? "　" + esc($("by").value.trim()) : "") + "</p>"; }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function slipHTML(st) {
    var by = $("by").value.trim(), msg = $("msg").value.trim(), g = hasG(), rows = "", prev = null;
    st.sessions.forEach(function (s) {
      rows += "<tr" + (s.clash ? ' class="cl"' : "") + "><td>" + (prev === s.n ? "" : K.md(s.n)) + "</td><td>" + esc(s.s == null ? "" : K.tspan(s)) + "</td><td>" + esc(s.course) + "</td><td>" + esc(s.place) + "</td><td class=\"ck\"></td></tr>";
      prev = s.n;
    });
    var many = st.sessions.length > 22 ? " many" : "";
    return '<div class="slip' + many + '"><div class="t">' + esc(title()) + '</div><div class="nm">' + esc(st.name) + (g && st.grade ? '<span class="gr">' + esc(st.grade) + "</span>" : "") + " さん</div>" +
      '<div class="cs">' + esc(st.courses.map(function (c) { return c.name; }).join("・")) + "</div>" +
      (st.sessions.length ? '<table><tr><th>日付</th><th>時刻</th><th>講座</th><th>場所</th><th>✓</th></tr>' + rows + "</table>" : "<p>申込のある講座はありません。</p>") +
      '<div class="sum">全 ' + st.sessions.length + " コマ・" + st.dayN + " 日</div>" + (st.sessions.some(function (s) { return s.clash; }) ? '<div class="clmsg">※ 網かけの行は時間が重なっています。</div>' : "") +
      (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + (by ? '<div class="by">' + esc(by) + "</div>" : "") + "</div>";
  }
  function printSlips() {
    var list = sortedStudents(), per = +$("perPage").value, h = "";
    for (var k = 0; k < list.length; k += per) h += '<div class="pg slips p' + per + '">' + list.slice(k, k + per).map(slipHTML).join("") + "</div>";
    doPrint(h, "portrait");
  }
  function printRoster() {
    var R = S.R, g = hasG(), h = "";
    R.courses.forEach(function (c) {
      var ds = c.sessions;
      h += '<div class="pg"><h1>' + esc(title()) + "　" + esc(c.name) + '</h1><p class="per">' + esc(sessText(c)) + "　受講 " + c.students.length + " 人" + (c.cap ? "（定員 " + c.cap + "）" : "") + ($("by").value.trim() ? "　" + esc($("by").value.trim()) : "") + "</p>" +
        '<table class="pt roster"><tr><th>No.</th><th class="l">名前</th>' + (g ? '<th class="l">学年・組</th>' : "") + ds.map(function (s) { var t = K.ymd(s.n); return '<th class="c">' + t.m + "/" + t.d + "<br>" + WD[t.w] + "</th>"; }).join("") + '<th class="l">メモ</th></tr>' +
        c.students.map(function (st, i) { return "<tr><td>" + (i + 1) + '</td><td class="l">' + esc(st.name) + "</td>" + (g ? '<td class="l">' + esc(st.grade) + "</td>" : "") + ds.map(function () { return '<td class="c"></td>'; }).join("") + '<td class="l memo"></td></tr>'; }).join("") +
        "</table></div>";
    });
    doPrint(h, R.courses.some(function (c) { return c.sessions.length > 10; }) ? "landscape" : "portrait");
  }
  function printMatrix() { doPrint(head("生徒×日付の一覧") + matrix("pt small"), "landscape"); }
  function printDays() { doPrint(head("日ごとの時間割") + dayTable("pt"), "portrait"); }

  // ---------- 保存 ----------
  function rowsDetail() {
    var out = [["名前", "学年・組", "日付", "曜日", "開始", "終了", "講座", "場所・講師", "時間の重なり"]];
    sortedStudents().forEach(function (st) { st.sessions.forEach(function (s) { out.push([st.name, st.grade, K.iso(s.n), WD[K.ymd(s.n).w], K.hm(s.s), K.hm(s.e), s.course, s.place, s.clash ? "あり" : ""]); }); });
    return out;
  }
  function rowsSt() {
    var R = S.R; return [["名前", "学年・組", "申込の講座", "コマ数", "日数"].concat(R.days.map(function (d) { return K.iso(d.n); }))].concat(sortedStudents().map(function (st) {
      return [st.name, st.grade, st.courses.map(function (c) { return c.name; }).join("、"), st.sessions.length, st.dayN].concat(R.days.map(function (d) { return st.sessions.filter(function (s) { return s.n === d.n; }).map(function (s) { return s.course + (s.s != null ? " " + K.hm(s.s) : ""); }).join("、"); }));
    }));
  }
  function rowsCo() { return [["講座", "日程", "コマ数", "人数", "定員", "受講する人"]].concat(S.R.courses.map(function (c) { return [c.name, sessText(c), c.sessions.length, c.students.length, c.cap || "", c.students.map(function (st) { return st.name + (st.grade ? "（" + st.grade + "）" : ""); }).join("、")]; })); }
  function rowsDy() { var out = [["日付", "曜日", "開始", "終了", "講座", "場所・講師", "人数", "その日に来る人数"]]; S.R.days.forEach(function (d) { d.list.forEach(function (x) { out.push([K.iso(d.n), WD[K.ymd(d.n).w], K.hm(x.s), K.hm(x.e), x.course, x.place, x.people, d.people]); }); }); return out; }
  function rowsChk() {
    var R = S.R, out = [["種類", "行", "名前・講座", "内容"]];
    R.conflicts.forEach(function (c) { out.push(["時間の重なり", c.row, c.name, K.iso(c.n) + " " + c.a.course + " " + K.tspan(c.a) + " と " + c.b.course + " " + K.tspan(c.b) + "（" + c.why + "）"]); });
    R.unknown.forEach(function (u) { out.push(["日程にない講座名", u.rows.join(","), u.text, "日程に同じ講座名の行がありません"]); });
    R.places.forEach(function (p) { out.push(["同じ場所・同じ時間", "", p.place, K.iso(p.n) + " " + p.a + " と " + p.b]); });
    R.checks.forEach(function (c) { out.push(["確かめたい所", c.row, c.name, c.why]); });
    R.schBad.forEach(function (b) { out.push(["日程の読めない行", b.line, b.text, b.why]); });
    return out;
  }
  function rowsByCourse() {
    // 講座ごとの名簿（1行1人）
    var out = [["講座", "No.", "名前", "学年・組"]];
    S.R.courses.forEach(function (c) { c.students.forEach(function (st, i) { out.push([c.name, i + 1, st.name, st.grade]); }); });
    return out;
  }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h) { return { wch: /講座|日程|受講する人|内容|場所/.test(h) ? 30 : /名前/.test(h) ? 16 : 12 }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), d = rowsDetail();
    XLSX.utils.book_append_sheet(wb, sheet(rowsSt()), "生徒ごと");
    XLSX.utils.book_append_sheet(wb, sheet(d), "受講の明細");
    XLSX.utils.book_append_sheet(wb, sheet(rowsCo()), "講座ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsByCourse()), "講座ごとの名簿");
    XLSX.utils.book_append_sheet(wb, sheet(rowsDy()), "日ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsChk()), "確かめたい所");
    var n = fname("xlsx"); XLSX.writeFile(wb, n); done(n, d.length - 1);
  }

  // ---------- 設定の保存（日程・表題など。生徒の名前は保存しない） ----------
  var KEYS = ["sch", "title", "by", "msg", "start"];
  function saveSettings() { try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.perPage = $("perPage").value; localStorage.setItem("koushu-nittei", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("koushu-nittei") || "null"); if (!o) return; KEYS.forEach(function (k) { if (o[k] != null && o[k] !== "") $(k).value = o[k]; }); if (o.perPage) $("perPage").value = o.perPage; } catch (e) {} }

  // ---------- 見本（架空） ----------
  var SAMPLE_SCH = "中3数学 12/25〜12/28 13:00〜14:30 A教室\n中3英語 12/25〜12/28 15:00〜16:30 A教室\n中3理科 1/4・1/5 13:00〜14:30 B教室\n中2数学 12/25〜12/28 10:00〜11:30 B教室 定員8\n中2英語 12/26・27 14:00〜15:30 B教室\n小6算数 12/26・1/4 10:00〜11:30 C教室\n入試直前演習 1/6 9:00〜12:00 A教室";
  var SAMPLE = [["名前", "学年", "中3数学", "中3英語", "中3理科", "中2数学", "中2英語", "小6算数", "入試直前演習"],
    ["青木 一郎", "中3", "○", "○", "○", "", "", "", "○"], ["石井 蓮", "中3", "○", "", "○", "", "", "", ""], ["上田 美咲", "中3", "", "○", "", "", "", "", "○"],
    ["江藤 大翔", "中3", "○", "○", "", "", "", "", ""], ["大野 結衣", "中2", "", "", "", "○", "○", "", ""], ["加藤 陽菜", "中2", "", "", "", "○", "", "", ""],
    ["木村 颯太", "中2", "", "", "", "○", "○", "", ""], ["工藤 さくら", "中2", "", "○", "", "", "○", "", ""], ["小林 湊", "小6", "", "", "", "", "", "○", ""],
    ["佐藤 葵", "小6", "", "", "", "", "", "○", ""], ["清水 悠真", "中3", "○", "○", "○", "", "", "", "○"], ["鈴木 芽依", "中2", "", "", "", "○", "", "", ""]];

  // ---------- つなぐ ----------
  function init() {
    if (!$("start").value) { var d = new Date(); $("start").value = d.getFullYear() + "-" + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1); }
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dr = $("drop");
    dr.ondragover = function (e) { e.preventDefault(); dr.classList.add("over"); };
    dr.ondragleave = function () { dr.classList.remove("over"); };
    dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
    $("hasHead").onchange = function () { if (RAW) { prep(); T.cols = K.guessCols(T.headers, T.rows, sched()); drawCols(); refresh(); } };
    var tm = null;
    $("sch").oninput = function () { clearTimeout(tm); tm = setTimeout(function () { if (T.cols && T.cols.mode === "matrix") { var g = K.guessCols(T.headers, T.rows, sched()); if (g.courses.length > T.cols.courses.length) T.cols.courses = g.courses; drawCols(); } refresh(); }, 300); };
    $("start").onchange = refresh;
    ["view", "sort"].forEach(function (id) { $(id).onchange = listView; });
    ["title", "by", "msg", "perPage"].forEach(function (id) { $(id).onchange = saveSettings; });
    $("sample").onclick = function () { $("start").value = "2026-12"; $("sch").value = SAMPLE_SCH; $("title").value = "冬期講習 受講日程表"; $("by").value = "〇〇学習教室"; setData(SAMPLE.map(function (r) { return r.slice(); }), "見本（架空の名前）"); };
    function need(f) { return function () { if (!S.R) { $("saveMsg").textContent = "先に申込の表と日程を入れてください。"; return; } f(); }; }
    $("pSlip").onclick = need(printSlips); $("pRoster").onclick = need(printRoster); $("pMx").onclick = need(printMatrix); $("pDay").onclick = need(printDays);
    $("xAll").onclick = need(saveXlsx);
    $("cDetail").onclick = need(function () { var r = rowsDetail(), n = fname("csv", "受講の明細"); dl(n, K.toCSV(r)); done(n, r.length - 1); });
    $("cCo").onclick = need(function () { var r = rowsCo(), n = fname("csv", "講座ごと"); dl(n, K.toCSV(r)); done(n, r.length - 1); });
    refresh();
  }
  init();
})();
