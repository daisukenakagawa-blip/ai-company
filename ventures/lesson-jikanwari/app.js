/* レッスンの時間割表と空き枠 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.JIKANWARI, WD = K.WD, ORDER = K.ORDER;
  var LIMIT = window.JIKANWARI_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: null, hasHead: true };
  var S = { R: null };
  var COLS = [["name", "名前の列"], ["wd", "曜日の列（「月16:00」のように時刻つきでも可）"], ["time", "時刻の列"], ["end", "終わりの時刻（任意）"], ["len", "長さ（分）の列（任意）"], ["teacher", "講師（任意）"], ["room", "部屋（任意）"], ["course", "コース（任意）"], ["grade", "学年・組（任意）"]];

  // ---------- 読み込み ----------
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
    T.cols = K.guessCols(T.headers, T.rows);
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。";
    $("colBox").hidden = false;
    autoUnit(); drawCols(); refresh();
  }
  function autoUnit() { var C = T.cols; if (C.teacher == null && $("unit").value === "teacher") $("unit").value = C.room != null ? "room" : "all"; }
  function drawCols() {
    var C = T.cols;
    $("cols").innerHTML = '<div class="colgrid">' + COLS.map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) { return '<option value="' + i + '"' + (C[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("") + "</div>";
    Array.prototype.forEach.call($("cols").querySelectorAll("select[data-k]"), function (s) {
      s.onchange = function () { C[s.dataset.k] = s.value === "" ? null : +s.value; refresh(); };
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "h:mm" })
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
  function opts() { var lenDef = +$("lenDef").value; return { cols: T.cols, hours: $("hours").value, unit: $("unit").value, cap: +$("cap").value, lenDefault: lenDef, minFree: +$("minFree").value || lenDef, limit: LIMIT, rowBase: T.hasHead ? 2 : 1 }; }
  function clearOut(msg) { S.R = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    var H = K.parseHours($("hours").value);
    $("hoursMsg").innerHTML = H.bad.length ? '<span class="wtxt">読めない行 ' + H.bad.length + " 件（" + H.bad.map(function (b) { return b.line + " 行目：" + esc(b.why); }).join("、") + "）</span>" : "";
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    var C = T.cols;
    if (C.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
    if (C.wd == null) return clearOut('<span class="bad">曜日の列を選んでください。</span>');
    var t0 = Date.now(), R = K.run(T.headers, T.rows, opts());
    S.R = R;
    if ($("unit").value !== R.unit) $("unit").value = R.unit;
    var over = R.groups.reduce(function (a, g) { return a + g.over.length; }, 0), out = R.groups.reduce(function (a, g) { return a + g.outside.length; }, 0);
    var unitName = R.unit === "teacher" ? "講師" : R.unit === "room" ? "部屋" : "";
    var parts = ["生徒 <b>" + R.students.length + " 人</b>", "週 <b>" + R.lessons.length + " コマ</b>"];
    if (unitName) parts.push(unitName + " " + R.groups.length);
    if (over) parts.push('<span class="bad">同じ時間に ' + R.cap + " 人を超える所 " + over + " 件</span>");
    if (R.stuClash.length) parts.push('<span class="bad">同じ生徒の重なり ' + R.stuClash.length + " 件</span>");
    if (!over && !R.stuClash.length) parts.push("重なりはありません");
    if (out) parts.push('<span class="wtxt">教室の時間の外 ' + out + " 件</span>");
    if (R.rooms.length) parts.push('<span class="wtxt">同じ部屋・同じ時間に別の講師 ' + R.rooms.length + " 件</span>");
    if (R.hoursAny) parts.push("空き枠 " + R.groups.reduce(function (a, g) { return a + g.free.length; }, 0) + " 件"); else parts.push('<span class="note">2. に教室の時間を書くと空き枠を出します</span>');
    if (R.checks.length) parts.push('<span class="wtxt">確かめたい所 ' + R.checks.length + " 件</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを計算しています（ほか " + R.cut + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    var gs = $("gsel"), cur = gs.value;
    gs.innerHTML = (R.groups.length > 1 ? '<option value="*">すべて</option>' : "") + R.groups.map(function (g, i) { return '<option value="' + i + '">' + esc(g.name) + "</option>"; }).join("");
    if (cur && Array.prototype.some.call(gs.options, function (o) { return o.value === cur; })) gs.value = cur;
    listView(); errView();
  }
  function selGroups() { var v = $("gsel").value; return v === "*" || v === "" ? S.R.groups : [S.R.groups[+v]].filter(Boolean); }
  function days() {
    var R = S.R;
    return ORDER.filter(function (w) {
      if (R.wdCount[w]) return true;
      if ($("hideSun").checked) return false;
      return R.groups.some(function (g) { return g.hours[w] && g.hours[w].length; }) || (!R.hoursAny && w !== 0);
    });
  }
  function step() { return +$("step").value; }
  // 時間割表（曜日×時刻）
  function grid(g, cls, rowH) {
    var R = S.R, st = step(), t0 = Math.floor(R.minS / st) * st, t1 = Math.ceil(R.maxE / st) * st, ds = days(), showC = $("showCourse").checked;
    var nRow = Math.max(1, (t1 - t0) / st), col = {};
    ds.forEach(function (w) {
      var map = {}, bl = K.blocks(g.lessons.filter(function (L) { return L.w === w; }), st, t0);
      bl.forEach(function (b) { var i0 = (b.s - t0) / st, n = (b.e - b.s) / st; map[i0] = { b: b, n: n }; for (var k = 1; k < n; k++) map[i0 + k] = "x"; });
      col[w] = map;
    });
    function open(w, t) { var hs = g.hours[w]; if (hs == null) return true; return hs.some(function (r) { return t >= r.s && t < r.e; }); }
    var h = '<table class="tt ' + (cls || "") + '"><tr><th class="hh"></th>' + ds.map(function (w) { return "<th>" + WD[w] + "<span class=\"note\">（" + (g.byW[w] || 0) + "）</span></th>"; }).join("") + "</tr>";
    for (var i = 0; i < nRow; i++) {
      var t = t0 + i * st;
      h += "<tr" + (t % 60 === 0 ? ' class="h0"' : "") + (rowH ? ' style="height:' + rowH + '"' : "") + '><td class="hh">' + (t % 60 === 0 || st >= 60 || i === 0 ? K.hm(t) : "") + "</td>";
      ds.forEach(function (w) {
        var c = col[w][i];
        if (c === "x") return;
        if (c) {
          var ov = c.b.items.some(function (L) { return L.over || L.clash; });
          h += '<td class="bk' + (ov ? " ov" : "") + '" rowspan="' + c.n + '">' + c.b.items.map(function (L) {
            var extra = showC ? [L.course, R.unit !== "room" ? L.room : (L.teacher || "")].filter(Boolean).join("・") : "";
            return '<span class="it' + (L.over ? " ov" : "") + (L.clash ? " cl" : "") + (L.outside ? " out" : "") + '" title="' + esc(K.span(L) + " " + L.name + (extra ? " " + extra : "")) + '">' + K.hm(L.s) + " " + esc(L.name) + (extra ? " <small>" + esc(extra) + "</small>" : "") + "</span>";
          }).join("") + "</td>";
        } else h += "<td" + (open(w, t) ? "" : ' class="off"') + "></td>";
      });
      h += "</tr>";
    }
    return h + "</table>";
  }
  function gTitle(g) {
    var R = S.R;
    return (R.unit === "all" ? "" : esc(g.name)) + ' <span class="note">生徒 ' + g.nStudents + " 人・週 " + g.lessons.length + " コマ（" + Math.floor(g.minutes / 60) + " 時間" + (g.minutes % 60 ? g.minutes % 60 + " 分" : "") + "）" + (g.hasHours ? "・空き枠 " + g.free.length + " 件" : "") + (g.over.length ? '・<span class="bad">入りすぎ ' + g.over.length + "</span>" : "") + "</span>";
  }
  function freeText(f) { return K.span(f) + "（" + (S.R.cap > 1 ? "あと " + f.room + " 人" : f.fit + " コマ") + "）"; }
  function freeTable(gs, cls) {
    var R = S.R, ds = days();
    return '<table class="' + cls + '"><tr><th style="width:11%">' + (R.unit === "all" ? "" : R.unit === "room" ? "部屋" : "講師") + "</th>" + ds.map(function (w) { return "<th>" + WD[w] + "</th>"; }).join("") + "</tr>" + gs.map(function (g) {
      return "<tr><td><b>" + esc(R.unit === "all" ? "教室" : g.name) + "</b></td>" + ds.map(function (w) {
        var f = g.free.filter(function (x) { return x.w === w; });
        if (g.hours[w] != null && !g.hours[w].length) return '<td class="w note">休み</td>';
        return '<td class="w">' + (f.length ? f.map(function (x) { return "<div>" + esc(freeText(x)) + "</div>"; }).join("") : '<span class="note">空きなし</span>') + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</table>";
  }
  function stuRows() {
    var R = S.R;
    return R.students.map(function (st) {
      return { st: st, txt: st.lessons.map(function (L) { return WD[L.w] + " " + K.span(L) + (R.unit !== "all" && L.group && !/^（/.test(L.group) ? " " + L.group : "") + (L.course ? " " + L.course : ""); }).join(" ／ ") };
    });
  }
  function listView() {
    var R = S.R, v = $("view").value, h = "";
    $("gselL").hidden = v !== "tt" || R.groups.length < 2;
    if (v === "tt") {
      if (!R.groups.length) h = '<p class="note">時刻の読めたレッスンがありません。</p>';
      selGroups().forEach(function (g) { h += '<div class="gname">' + gTitle(g) + '</div><div class="scroll">' + grid(g) + "</div>"; });
      h += '<p class="note">緑のマスがレッスン、灰色は教室の時間の外（休み）、白は空いている時間です。赤い字は、同じ時間に ' + R.cap + " 人を超えている所か、同じ生徒の重なりです。（ ）の数は曜日ごとのコマ数です。</p>";
    } else if (v === "free") {
      h = R.hoursAny ? '<div class="scroll">' + freeTable(R.groups, "lt") + '</div><p class="note">教室の時間のうち、レッスンが ' + R.cap + " 人に満たない時間のうち、" + R.minFree + " 分以上続く所です。（ ）は " + (R.cap > 1 ? "その時間にあと何人入れるか（いちばん少ない所）" : R.lenDef + " 分のレッスンが何コマ入るか") + "です。</p>" : '<p class="note">2. に教室の時間（「月〜金 15:00〜21:00」など）を書くと、空き枠を出します。</p>';
    } else if (v === "st") {
      h = '<div class="scroll"><table class="lt"><tr><th>行</th><th>名前</th>' + (T.cols.grade != null ? "<th>学年・組</th>" : "") + '<th class="n">週の回数</th><th class="n">分</th><th>曜日・時刻</th></tr>' + stuRows().map(function (x) {
        var st = x.st, bad = st.lessons.some(function (L) { return L.clash || L.over; });
        return "<tr" + (bad ? ' class="fl"' : "") + "><td>" + st.rows.join(",") + "</td><td>" + esc(st.name) + "</td>" + (T.cols.grade != null ? "<td>" + esc(st.grade) + "</td>" : "") + '<td class="n">' + st.lessons.length + '</td><td class="n">' + st.minutes + '</td><td class="w">' + esc(x.txt) + "</td></tr>";
      }).join("") + "</table></div>";
    } else if (v === "sum") {
      var ds = days();
      h = '<div class="scroll"><table class="lt"><tr><th>' + (R.unit === "room" ? "部屋" : R.unit === "teacher" ? "講師" : "") + '</th><th class="n">生徒</th><th class="n">週のコマ</th><th class="n">週の時間</th>' + ds.map(function (w) { return '<th class="n">' + WD[w] + "</th>"; }).join("") + '<th class="n">空き枠（分）</th></tr>' + R.groups.map(function (g) {
        return "<tr><td>" + esc(g.name) + '</td><td class="n">' + g.nStudents + '</td><td class="n">' + g.lessons.length + '</td><td class="n">' + (g.minutes / 60).toFixed(1) + " 時間</td>" + ds.map(function (w) { return '<td class="n">' + (g.byW[w] || "") + "</td>"; }).join("") + '<td class="n">' + (g.hasHours ? g.freeMin : "") + "</td></tr>";
      }).join("") + '<tr class="tot"><td>合計</td><td class="n">' + R.students.length + '</td><td class="n">' + R.lessons.length + '</td><td class="n">' + (R.groups.reduce(function (a, g) { return a + g.minutes; }, 0) / 60).toFixed(1) + " 時間</td>" + ds.map(function (w) { return '<td class="n">' + (R.wdCount[w] || "") + "</td>"; }).join("") + "<td></td></tr></table></div>";
    }
    $("listView").innerHTML = h;
  }
  function errView() {
    var R = S.R, h = "", over = [];
    R.groups.forEach(function (g) { g.over.forEach(function (o) { over.push({ g: g, o: o }); }); });
    if (over.length) h += "<h3>同じ時間に " + R.cap + " 人を超える所（" + over.length + '）</h3><div class="scroll" style="max-height:240px"><table class="lt"><tr><th>' + (R.unit === "room" ? "部屋" : "講師") + "</th><th>曜日</th><th>時刻</th><th>人数</th><th>レッスン</th></tr>" + over.map(function (x) {
      return '<tr class="fl"><td>' + esc(x.g.name) + "</td><td>" + WD[x.o.w] + "</td><td>" + K.span(x.o) + "</td><td>" + x.o.n + ' 人</td><td class="w">' + esc(x.o.on.map(function (L) { return L.name + " " + K.span(L) + "（" + L.row + " 行目）"; }).join("、")) + "</td></tr>";
    }).join("") + "</table></div>";
    if (R.stuClash.length) h += "<h3>同じ生徒の重なり（" + R.stuClash.length + '）</h3><table class="lt"><tr><th>名前</th><th>曜日</th><th>レッスン</th><th>内容</th></tr>' + R.stuClash.map(function (c) {
      return '<tr class="fl"><td>' + esc(c.name) + "</td><td>" + WD[c.a.w] + '</td><td class="w">' + esc(K.span(c.a) + " " + (c.a.group || "") + "（" + c.a.row + " 行目） と " + K.span(c.b) + " " + (c.b.group || "") + "（" + c.b.row + " 行目）") + '</td><td class="w">' + (c.same ? "同じレッスンが2回書かれているようです" : "時間が重なっています") + "</td></tr>";
    }).join("") + "</table>";
    var outs = []; R.groups.forEach(function (g) { g.outside.forEach(function (L) { outs.push(L); }); });
    if (outs.length) h += "<h3>教室の時間の外のレッスン（" + outs.length + '）</h3><table class="lt"><tr><th>行</th><th>名前</th><th>レッスン</th><th>その日の時間</th></tr>' + outs.map(function (L) {
      var g = R.groups.filter(function (x) { return x.key === L.gk; })[0], hs = g.hours[L.w];
      return "<tr><td>" + L.row + "</td><td>" + esc(L.name) + "</td><td>" + WD[L.w] + " " + K.span(L) + " " + esc(R.unit === "all" ? "" : L.group) + "</td><td>" + (hs && hs.length ? hs.map(K.span).join("・") : "休み") + "</td></tr>";
    }).join("") + "</table>";
    if (R.rooms.length) h += "<h3>同じ部屋・同じ時間に別の講師（" + R.rooms.length + '）</h3><table class="lt">' + R.rooms.map(function (r) { return "<tr><td>" + esc(r.room) + "</td><td>" + WD[r.a.w] + '</td><td class="w">' + esc(r.a.name + " " + K.span(r.a) + "（" + r.a.group + "） と " + r.b.name + " " + K.span(r.b) + "（" + r.b.group + "）") + "</td></tr>"; }).join("") + "</table>";
    if (R.hoursWarn.length) h += "<h3>教室の時間の行で、使っていない名前（" + R.hoursWarn.length + '）</h3><table class="lt">' + R.hoursWarn.map(function (x) { return "<tr><td>" + esc(x.name) + '</td><td class="w">' + esc(x.why) + "</td></tr>"; }).join("") + "</table>";
    if (R.checks.length) h += "<h3>確かめたい所（" + R.checks.length + '）</h3><div class="scroll" style="max-height:220px"><table class="lt"><tr><th>行</th><th>名前</th><th>内容</th></tr>' + R.checks.slice(0, 500).map(function (c) { return "<tr" + (c.lv === "e" ? ' class="fl"' : "") + "><td>" + c.row + "</td><td>" + esc(c.name) + '</td><td class="w">' + esc(c.why) + "</td></tr>"; }).join("") + "</table></div>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:8mm}"; }
  function title() { return $("title").value.trim() || "レッスンの時間割"; }
  function by() { var b = $("by").value.trim(); return b ? "　" + esc(b) : ""; }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function printTT() {
    var R = S.R, st = step(), rows = (Math.ceil(R.maxE / st) * st - Math.floor(R.minS / st) * st) / st;
    var h = R.groups.map(function (g) {
      return '<div class="pg"><h1>' + esc(title()) + (R.unit === "all" ? "" : "　" + esc(g.name)) + '</h1><p class="per">生徒 ' + g.nStudents + " 人・週 " + g.lessons.length + " コマ" + by() + "</p>" + grid(g, rows > 40 ? "dense" : "", Math.max(3, Math.min(9, 165 / rows)).toFixed(1) + "mm") + "</div>";
    }).join("");
    doPrint(h, "landscape");
  }
  function printFree() {
    var R = S.R;
    if (!R.hoursAny) { $("saveMsg").textContent = "空き枠を出すには、2. に教室の時間を書いてください。"; return; }
    doPrint("<h1>" + esc(title()) + "　空いている時間</h1><p class=\"per\">" + R.minFree + " 分以上続く空き。（ ）は" + (R.cap > 1 ? "あと何人入れるか" : R.lenDef + " 分のレッスンが何コマ入るか") + by() + "</p>" + freeTable(R.groups, "pt"), days().length > 5 ? "landscape" : "portrait");
  }
  function printSt() {
    var R = S.R, g = T.cols.grade != null;
    doPrint("<h1>" + esc(title()) + "　生徒ごと</h1><p class=\"per\">生徒 " + R.students.length + " 人・週 " + R.lessons.length + " コマ" + by() + '</p><table class="pt"><tr><th>No.</th><th>名前</th>' + (g ? "<th>学年・組</th>" : "") + '<th class="n">回数</th><th>曜日・時刻</th><th>メモ</th></tr>' +
      stuRows().map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(x.st.name) + "</td>" + (g ? "<td>" + esc(x.st.grade) + "</td>" : "") + '<td class="n">' + x.st.lessons.length + "</td><td>" + esc(x.txt) + '</td><td class="memo"></td></tr>'; }).join("") + "</table>", "portrait");
  }

  // ---------- 保存 ----------
  function rowsList() {
    var R = S.R, out = [["名前", "学年・組", "曜日", "開始", "終了", "分", "講師", "部屋", "コース", "表", "確かめたい所", "元の行"]];
    ORDER.forEach(function (w) {
      R.lessons.filter(function (L) { return L.w === w; }).sort(function (a, b) { return a.s - b.s || a.group.localeCompare(b.group, "ja"); }).forEach(function (L) {
        out.push([L.name, L.grade, WD[L.w], K.hm(L.s), K.hm(L.e), L.e - L.s, L.teacher, L.room, L.course, L.group, [L.over ? "人数を超える" : "", L.clash ? "同じ生徒の重なり" : "", L.outside ? "教室の時間の外" : ""].concat(L.flags).filter(Boolean).join("・"), L.row]);
      });
    });
    return out;
  }
  function rowsFree() {
    var R = S.R, out = [["表", "曜日", "開始", "終了", "分", R.cap > 1 ? "あと何人" : R.lenDef + "分のコマ数"]];
    R.groups.forEach(function (g) { g.free.forEach(function (f) { out.push([g.name, WD[f.w], K.hm(f.s), K.hm(f.e), f.len, R.cap > 1 ? f.room : f.fit]); }); });
    return out;
  }
  function rowsGrid(g) {
    // 曜日×時刻の表（Excel 用。マスに「16:00 名前」を並べる）
    var R = S.R, st = step(), t0 = Math.floor(R.minS / st) * st, t1 = Math.ceil(R.maxE / st) * st, ds = days();
    var out = [["時刻"].concat(ds.map(function (w) { return WD[w]; }))];
    for (var t = t0; t < t1; t += st) out.push([K.hm(t)].concat(ds.map(function (w) {
      return g.lessons.filter(function (L) { return L.w === w && L.s >= t && L.s < t + st; }).map(function (L) { return K.span(L) + " " + L.name + (L.course ? "（" + L.course + "）" : ""); }).join("\n");
    })));
    return out;
  }
  function rowsSt() { return [["名前", "学年・組", "週の回数", "分", "曜日・時刻"]].concat(stuRows().map(function (x) { return [x.st.name, x.st.grade, x.st.lessons.length, x.st.minutes, x.txt]; })); }
  function rowsChk() {
    var R = S.R, out = [["種類", "行", "名前", "内容"]];
    R.groups.forEach(function (g) { g.over.forEach(function (o) { out.push(["人数を超える", o.on.map(function (L) { return L.row; }).join(","), g.name, WD[o.w] + " " + K.span(o) + " " + o.n + " 人：" + o.on.map(function (L) { return L.name; }).join("、")]); }); });
    R.stuClash.forEach(function (c) { out.push(["同じ生徒の重なり", c.a.row + "," + c.b.row, c.name, WD[c.a.w] + " " + K.span(c.a) + " と " + K.span(c.b)]); });
    R.groups.forEach(function (g) { g.outside.forEach(function (L) { out.push(["教室の時間の外", L.row, L.name, WD[L.w] + " " + K.span(L) + " " + g.name]); }); });
    R.rooms.forEach(function (r) { out.push(["同じ部屋・同じ時間", r.a.row + "," + r.b.row, r.room, WD[r.a.w] + " " + r.a.name + "（" + r.a.group + "） と " + r.b.name + "（" + r.b.group + "）"]); });
    R.checks.forEach(function (c) { out.push(["確かめたい所", c.row, c.name, c.why]); });
    R.hoursBad.forEach(function (b) { out.push(["教室の時間の読めない行", b.line, b.text, b.why]); });
    return out;
  }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows, wide) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: wide && i > 0 ? 26 : /曜日・時刻|内容|名前/.test(h) ? (h === "名前" ? 16 : 40) : 10 }; }); return ws; }
  function sheetName(s, used) { var n = String(s).replace(/[\\\/?*\[\]:]/g, "_").slice(0, 25) || "表", b = n, k = 2; while (used[n]) n = b + "_" + k++; used[n] = 1; return n; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var R = S.R, wb = XLSX.utils.book_new(), used = {}, L = rowsList();
    R.groups.forEach(function (g) { XLSX.utils.book_append_sheet(wb, sheet(rowsGrid(g), true), sheetName("時間割_" + (R.unit === "all" ? "全体" : g.name), used)); });
    XLSX.utils.book_append_sheet(wb, sheet(L), sheetName("レッスンの一覧", used));
    if (R.hoursAny) XLSX.utils.book_append_sheet(wb, sheet(rowsFree()), sheetName("空き枠", used));
    XLSX.utils.book_append_sheet(wb, sheet(rowsSt()), sheetName("生徒ごと", used));
    XLSX.utils.book_append_sheet(wb, sheet(rowsChk()), sheetName("確かめたい所", used));
    var n = fname("xlsx"); XLSX.writeFile(wb, n); done(n, L.length - 1);
  }

  // ---------- 設定の保存（教室の時間・表題など。生徒の名前は保存しない） ----------
  var KEYS = ["hours", "title", "by", "unit", "cap", "lenDef", "minFree", "step"];
  function saveSettings() { try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.showCourse = $("showCourse").checked; o.hideSun = $("hideSun").checked; localStorage.setItem("lesson-jikanwari", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("lesson-jikanwari") || "null"); if (!o) return; KEYS.forEach(function (k) { if (o[k] != null && o[k] !== "") $(k).value = o[k]; }); if (o.showCourse != null) $("showCourse").checked = o.showCourse; if (o.hideSun != null) $("hideSun").checked = o.hideSun; } catch (e) {} }

  // ---------- 見本（架空） ----------
  var SAMPLE_HOURS = "月〜金 15:00〜20:00\n土 9:30〜12:00 13:00〜17:00\n日 休み\n森 火・木 15:00〜20:00\n森 土 9:30〜12:00";
  var SAMPLE = [["名前", "学年", "曜日", "時刻", "長さ", "講師", "コース"],
    ["青木 一郎", "小3", "月", "15:30", "30", "田中", "ピアノ"], ["石井 蓮", "小5", "月・木", "16:00", "45", "田中", "ピアノ"], ["上田 美咲", "中1", "月", "16:45", "45", "田中", "ピアノ"],
    ["江藤 大翔", "小2", "月", "17:15", "30", "田中", "ピアノ"], ["大野 結衣", "小4", "火", "16:00", "30", "森", "バイオリン"], ["加藤 陽菜", "小6", "火", "16:30", "45", "森", "バイオリン"],
    ["木村 颯太", "小1", "水", "15:30", "30", "田中", "ピアノ"], ["工藤 さくら", "中2", "水", "18:00", "60", "田中", "ピアノ"], ["小林 湊", "年長", "木", "15:30", "30", "森", "バイオリン"],
    ["佐藤 葵", "小3", "木", "16:30", "30", "田中", "ピアノ"], ["清水 悠真", "小4", "金", "16:00", "30", "田中", "ピアノ"], ["鈴木 芽依", "大人", "金", "19:00", "60", "田中", "ピアノ"],
    ["高橋 健", "小5", "土", "10:00", "45", "森", "バイオリン"], ["中村 心春", "小2", "土", "10:00", "30", "田中", "ピアノ"], ["西田 陸", "中1", "土", "13:30", "45", "田中", "ピアノ"],
    ["野口 柚希", "小6", "月", "17:30", "30", "田中", "ピアノ"], ["林 奏太", "大人", "日", "10:00", "60", "森", "バイオリン"], ["藤井 杏", "小3", "水", "16:00", "30", "田中", "ソルフェージュ"]];

  // ---------- つなぐ ----------
  function init() {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dr = $("drop");
    dr.ondragover = function (e) { e.preventDefault(); dr.classList.add("over"); };
    dr.ondragleave = function () { dr.classList.remove("over"); };
    dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
    $("hasHead").onchange = function () { if (RAW) { prep(); T.cols = K.guessCols(T.headers, T.rows); drawCols(); refresh(); } };
    var tm = null;
    $("hours").oninput = function () { clearTimeout(tm); tm = setTimeout(refresh, 300); };
    ["unit", "cap", "lenDef", "minFree"].forEach(function (id) { $(id).onchange = refresh; });
    ["view", "gsel", "step", "showCourse", "hideSun"].forEach(function (id) { $(id).onchange = function () { saveSettings(); if (S.R) listView(); }; });
    ["title", "by"].forEach(function (id) { $(id).onchange = saveSettings; });
    $("sample").onclick = function () { $("hours").value = SAMPLE_HOURS; $("title").value = "レッスン時間割"; $("by").value = "〇〇音楽教室"; $("unit").value = "teacher"; $("cap").value = "1"; setData(SAMPLE.map(function (r) { return r.slice(); }), "見本（架空の名前）"); };
    function need(f) { return function () { if (!S.R) { $("saveMsg").textContent = "先に生徒の一覧を読み込んでください。"; return; } f(); }; }
    $("pTT").onclick = need(printTT); $("pFree").onclick = need(printFree); $("pSt").onclick = need(printSt);
    $("xAll").onclick = need(saveXlsx);
    $("cList").onclick = need(function () { var r = rowsList(), n = fname("csv", "レッスンの一覧"); dl(n, K.toCSV(r)); done(n, r.length - 1); });
    $("cFree").onclick = need(function () { if (!S.R.hoursAny) { $("saveMsg").textContent = "空き枠を出すには、2. に教室の時間を書いてください。"; return; } var r = rowsFree(), n = fname("csv", "空き枠"); dl(n, K.toCSV(r)); done(n, r.length - 1); });
    refresh();
  }
  init();
})();
