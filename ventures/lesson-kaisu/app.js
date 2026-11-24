/* 月ごとのレッスン日と回数 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KAISU, WD = K.WD;
  var LIMIT = window.KAISU_LIMIT || Infinity; // お試し版は行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: {}, hasHead: true };
  var S = { R: null };
  var COLDEF = [["name", "名前の列"], ["wd", "曜日の列"], ["course", "コースの列（任意）"], ["group", "組・講師（任意）"], ["join", "入会日（任意）"], ["leave", "退会日（任意）"]];

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
    drawCols(); refresh();
  }
  function drawCols() {
    var C = T.cols;
    $("cols").innerHTML = COLDEF.map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) { return '<option value="' + i + '"' + (C[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call($("cols").querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete C[s.dataset.k]; else C[s.dataset.k] = +s.value; refresh(); };
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
  function startYM() { var v = $("start").value, m = v.match(/^(\d{4})-(\d{2})$/); if (m) return { y: +m[1], m: +m[2] }; var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function opts() {
    var s = startYM();
    return { cols: T.cols, y: s.y, m: s.m, k: +$("mcount").value, off: $("off").value, add: $("add").value, holidays: $("holidays").checked, nenmatsu: $("nenmatsu").checked,
      fifth: $("fifth").checked, cap: +$("cap").value, useJoin: $("useJoin").checked, rowBase: T.hasHead ? 2 : 1, limit: LIMIT };
  }
  function mLabel(M) { return (S.R.months.length > 1 && S.R.months.some(function (x) { return x.y !== M.y; }) ? M.y + "年" : "") + M.m + "月"; }
  function periodText() { var MS = S.R.months, a = MS[0], b = MS[MS.length - 1]; return a.y + "年" + a.m + "月" + (MS.length > 1 ? "〜" + b.y + "年" + b.m + "月" : ""); }
  function condText() {
    var o = S.o, p = [];
    if (o.holidays) p.push("祝日は休み"); if (o.nenmatsu) p.push("年末年始は休み"); if (o.fifth) p.push("第5週は休み"); if (o.cap) p.push("月" + o.cap + "回まで");
    if (S.R.offN) p.push("休講日 " + S.R.offN + " 日分"); if (S.R.addN) p.push("追加の日 " + S.R.addN + " 件");
    return p.join("・");
  }
  function clearOut(msg) { S.R = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    if (T.rows.length || true) {
      var s = startYM(), P0 = K.months(s.y, s.m, +$("mcount").value), P = { a: P0[0].a, b: P0[P0.length - 1].b };
      var a = K.parseDayLines($("off").value, P, false), b = K.parseDayLines($("add").value, P, true), t = [];
      if ($("off").value.trim()) t.push("休講日 " + a.items.length + " 日分を読みました" + (a.bad.length ? "（読めない行 " + a.bad.length + "）" : ""));
      if ($("add").value.trim()) t.push("追加の日 " + b.items.length + " 件を読みました" + (b.bad.length ? "（読めない行 " + b.bad.length + "）" : ""));
      $("dayMsg").textContent = t.join("　");
    }
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    if (T.cols.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
    if (T.cols.wd == null) return clearOut('<span class="bad">曜日の列を選んでください。</span>');
    var t0 = Date.now(), o = opts(), R = K.run(T.headers, T.rows, o);
    S.R = R; S.o = o;
    var cur = $("mon").value;
    $("mon").innerHTML = R.months.map(function (M, i) { return '<option value="' + i + '">' + esc(mLabel(M)) + "</option>"; }).join("");
    if (cur !== "" && +cur < R.months.length) $("mon").value = cur;
    var errs = R.checks.filter(function (c) { return c.lv === "e"; }).length, warns = R.checks.length - errs;
    var parts = ["<b>" + esc(periodText()) + "</b>", R.lines.length + " 行（" + R.per.length + " 人）"];
    parts.push("レッスンの合計 " + R.months.map(function (M, i) { return esc(mLabel(M)) + " <b>" + R.totals[i] + " 回</b>"; }).join("・"));
    if (errs) parts.push('<span class="bad">曜日が読めない行 ' + errs + " 件（0回にしています。下の一覧を確かめてください）</span>");
    if (warns) parts.push('<span class="wtxt">確かめたい所 ' + warns + " 件</span>");
    if (R.offBad.length + R.addBad.length + R.warnLines.length) parts.push('<span class="wtxt">休講日・追加の日の読めない行・当たる人がいない行 ' + (R.offBad.length + R.addBad.length + R.warnLines.length) + " 件</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを計算しています（ほか " + R.cut + " 行）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function wdOf(L) { return L.days.length ? Math.min.apply(null, L.days.map(function (d) { return (d.w + 6) % 7; })) : 9; }
  function sorted() {
    var a = S.R.lines.slice(), s = $("sort").value;
    if (s === "wd") a.sort(function (p, q) { return wdOf(p) - wdOf(q) || p.row - q.row; });
    if (s === "group") a.sort(function (p, q) { return (p.group || "￿").localeCompare(q.group || "￿", "ja") || p.row - q.row; });
    return a;
  }
  function hasG() { return T.cols.group != null; }
  function hasC() { return T.cols.course != null; }
  function dayHTML(x) {
    return x.lessons.map(function (s) { return s.add ? '<span class="addd" title="' + esc(s.note) + '">' + K.md(s.n) + "</span>" : K.md(s.n); }).join(" ") +
      (x.offs.length ? ' <span class="off" title="お休み">' + x.offs.map(function (f) { return K.md(f.n); }).join(" ") + "</span>" : "");
  }
  function offText(x) { return x.offs.map(function (f) { return K.md(f.n) + " " + f.why; }).join("、"); }
  function listView() {
    var R = S.R, v = $("view").value, mi = +$("mon").value || 0, h = "", g = hasG(), c = hasC(), multi = R.months.length > 1;
    $("monL").hidden = !(v === "lines" || v === "wd" || v === "days") || !multi;
    if (v === "lines") {
      h = '<div class="scroll"><table class="lt"><tr><th>行</th><th>名前</th>' + (c ? "<th>コース</th>" : "") + (g ? "<th>組</th>" : "") + "<th>曜日</th>" + (multi ? R.months.map(function (M) { return '<th class="n">' + esc(mLabel(M)) + "</th>"; }).join("") + '<th class="n">合計</th>' : '<th class="n">回数</th>') + "<th>" + esc(mLabel(R.months[mi])) + "のレッスン日（<span class=\"addd\">追加</span>・<span class=\"off\">お休み</span>）</th><th>お休みの理由・メモ</th></tr>" +
        sorted().map(function (L) {
          var x = L.months[mi];
          return "<tr" + (L.bad ? ' class="fl"' : "") + "><td>" + L.row + "</td><td>" + esc(L.name) + "</td>" + (c ? "<td>" + esc(L.course) + "</td>" : "") + (g ? "<td>" + esc(L.group) + "</td>" : "") + "<td>" + esc(L.wdText) + "</td>" +
            (multi ? L.months.map(function (y) { return '<td class="n">' + (y.status === "入会前" || y.status === "退会" ? '<span class="note">' + y.status + "</span>" : y.count) + "</td>"; }).join("") + '<td class="n"><b>' + L.total + "</b></td>" : '<td class="n"><b>' + x.count + "</b></td>") +
            '<td class="w">' + dayHTML(x) + '</td><td class="w">' + esc([x.status, offText(x)].concat(L.notes).filter(Boolean).join("・")) + "</td></tr>";
        }).join("") + "</table></div>";
    } else if (v === "per") {
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + "<th>コースと曜日</th>" + R.months.map(function (M) { return '<th class="n">' + esc(mLabel(M)) + "</th>"; }).join("") + (multi ? '<th class="n">合計</th>' : "") + "</tr>" +
        R.per.map(function (p) {
          return "<tr><td>" + esc(p.name) + "</td>" + (g ? "<td>" + esc(p.group) + "</td>" : "") + '<td class="w">' + esc(p.lines.map(function (L) { return (L.course ? L.course + " " : "") + L.wdText; }).join("、")) + "</td>" + p.months.map(function (n) { return '<td class="n">' + n + "</td>"; }).join("") + (multi ? '<td class="n"><b>' + p.total + "</b></td>" : "") + "</tr>";
        }).join("") + "</table></div>";
    } else if (v === "wd") h = wdTable("lt", mi);
    else if (v === "days") {
      var M = R.months[mi], ds = R.days.filter(function (d) { return d.n >= M.a && d.n <= M.b; });
      h = !ds.length ? '<p class="note">この月のレッスンはありません。</p>' : '<div class="scroll"><table class="lt"><tr><th>日付</th><th class="n">のべ人数</th><th class="n">うち追加</th><th>名前（コース）</th></tr>' + ds.map(function (d) {
        return "<tr><td>" + K.md(d.n) + '</td><td class="n">' + d.people + '</td><td class="n">' + (d.add || "") + '</td><td class="w">' + esc(d.names.join("、")) + "</td></tr>";
      }).join("") + "</table></div>";
    }
    $("listView").innerHTML = h;
  }
  function wdTable(cls, mi) {
    var R = S.R, rows = R.byWd.filter(function (b) { return b.mi === mi && b.people; }).sort(function (p, q) { return (p.w + 6) % 7 - (q.w + 6) % 7; });
    return '<p class="note">ふだんの週1回の人のレッスン日です（コース・組だけの休講、追加の日、「第1・3土」、入会日・退会日は1行ずつの表に入っています）。</p><table class="' + cls + '"><tr><th class="l">曜日</th><th class="n">人数</th><th class="l">レッスン日</th><th class="n">回数</th><th class="l">お休み</th></tr>' + rows.map(function (b) {
      return '<tr><td class="l">' + WD[b.w] + '曜日</td><td class="n">' + b.people + '</td><td class="l w">' + b.lessons.map(K.md).join(" ") + '</td><td class="n"><b>' + b.lessons.length + '</b></td><td class="l w">' + esc(b.offs.map(function (f) { return K.md(f.n) + " " + f.why; }).join("、")) + "</td></tr>";
    }).join("") + "</table>";
  }
  function errView() {
    var R = S.R, h = "";
    if (R.checks.length) h += '<h3>確かめたい所（' + R.checks.length + '）</h3><div class="scroll" style="max-height:220px"><table class="lt"><tr><th>行</th><th>名前</th><th>内容</th></tr>' + R.checks.slice(0, 500).map(function (c) { return "<tr" + (c.lv === "e" ? ' class="fl"' : "") + "><td>" + c.row + "</td><td>" + esc(c.name) + '</td><td class="w">' + esc(c.why) + "</td></tr>"; }).join("") + "</table></div>";
    var bl = R.offBad.map(function (e) { return ["休講日", e.line, e.text, e.why]; }).concat(R.addBad.map(function (e) { return ["追加の日", e.line, e.text, e.why]; }), R.warnLines.map(function (e) { return [e.kind, e.line, "", e.why]; }));
    if (bl.length) h += '<h3>休講日・追加の日で確かめたい行（' + bl.length + '）</h3><table class="lt">' + bl.map(function (e) { return "<tr><td>" + e[0] + "</td><td>" + e[1] + " 行目</td><td>" + esc(e[2]) + '</td><td class="w">' + esc(e[3]) + "</td></tr>"; }).join("") + "</table>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function title() { return $("title").value.trim() || (S.R.months.length > 1 ? periodText() + "のレッスン日" : S.R.months[0].m + "月のレッスン日"); }
  function head(sub) { return "<h1>" + esc(title()) + "　" + esc(sub) + "</h1><p class=\"per\">" + esc(periodText()) + "　" + S.R.lines.length + " 行（" + S.R.per.length + " 人）　" + esc(condText()) + ($("by").value.trim() ? "　" + esc($("by").value.trim()) : "") + "</p>"; }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function printList() {
    var R = S.R, g = hasG(), c = hasC(), multi = R.months.length > 1;
    var h = head("回数の一覧") + '<table class="pt"><tr><th class="l">名前</th>' + (c ? '<th class="l">コース</th>' : "") + (g ? '<th class="l">組</th>' : "") + '<th class="l">曜日</th>' + R.months.map(function (M) { return "<th>" + esc(mLabel(M)) + "</th>"; }).join("") + (multi ? "<th>合計</th>" : '<th class="l">レッスン日</th>') + "</tr>" +
      sorted().map(function (L) {
        return '<tr><td class="l">' + esc(L.name) + "</td>" + (c ? '<td class="l">' + esc(L.course) + "</td>" : "") + (g ? '<td class="l">' + esc(L.group) + "</td>" : "") + '<td class="l">' + esc(L.wdText) + "</td>" + L.months.map(function (x) { return "<td>" + x.count + "</td>"; }).join("") +
          (multi ? "<td><b>" + L.total + "</b></td>" : '<td class="l w">' + L.months[0].lessons.map(function (s) { return K.md(s.n).replace(/\(.\)/, ""); }).join(" ") + "</td>") + "</tr>";
      }).join("") + '<tr class="fl"><td class="l" colspan="' + (2 + (c ? 1 : 0) + (g ? 1 : 0)) + '">合計</td>' + R.totals.map(function (n) { return "<td>" + n + "</td>"; }).join("") + (multi ? "<td>" + R.totals.reduce(function (a, b) { return a + b; }, 0) + "</td>" : "<td></td>") + "</tr></table>";
    doPrint(h, multi && R.months.length > 6 ? "landscape" : "portrait");
  }
  function printWd() {
    var R = S.R, h = head("曜日ごとのレッスン日");
    R.months.forEach(function (M, i) { h += "<h2>" + esc(M.y + "年" + M.m + "月") + "</h2>" + wdTable("pt", i).replace(/<p class="note">.*?<\/p>/, ""); });
    h += '<p class="per">ふだんの週1回の人のレッスン日です。コース・組だけの休講、追加の日、「第1・3土」、入会日・退会日は、回数の一覧とお知らせに入っています。</p>';
    doPrint(h, "portrait");
  }
  function printSlips() {
    var list = sorted(), msg = $("msg").value.trim(), by = $("by").value.trim(), h = "", R = S.R;
    for (var k = 0; k < list.length; k += 8) {
      h += '<div class="pg"><div class="slips">' + list.slice(k, k + 8).map(function (L) {
        var body = L.months.filter(function (x) { return !(x.status === "入会前" || x.status === "退会"); }).map(function (x) {
          return '<div class="dates"><span class="mo">' + (R.months.length > 1 ? x.m + "月 " : "") + x.count + "回</span>：" + x.lessons.map(function (s) { return K.md(s.n) + (s.add ? "＊" : ""); }).join("　") + "</div>" +
            (x.offs.length ? '<div class="offl">お休み：' + esc(x.offs.map(function (f) { return K.md(f.n) + (/^(休講日|月\d+回まで|第5週)$/.test(f.why) ? "" : " " + f.why.replace(/^休講日（.*）$/, "休講")); }).join("、")) + "</div>" : "");
        }).join("");
        var hasAdd = L.months.some(function (x) { return x.lessons.some(function (s) { return s.add; }); });
        var many = R.months.length > 2;
        return '<div class="slip' + (many ? " many" : "") + '"><div class="t">' + esc(title()) + "</div>" + '<div class="nm">' + esc(L.name) + " 様</div>" +
          '<div class="per">' + esc([L.course, L.wdText].filter(Boolean).join("　")) + "</div>" + body + (hasAdd ? '<div class="offl">＊は振替などの追加の日です</div>' : "") +
          (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + (by ? '<div class="by">' + esc(by) + "</div>" : "") + "</div>";
      }).join("") + "</div></div>";
    }
    doPrint(h, "portrait");
  }

  // ---------- 保存 ----------
  function rowsLines() {
    var R = S.R, multi = R.months.length > 1;
    return [["行", "名前", "コース", "組", "曜日"].concat(R.months.map(function (M) { return mLabel(M) + "の回数"; }), multi ? ["合計"] : [], ["レッスン日（" + mLabel(R.months[0]) + "）", "お休み（" + mLabel(R.months[0]) + "）", "メモ"])].concat(sorted().map(function (L) {
      return [L.row, L.name, L.course, L.group, L.wdText].concat(L.months.map(function (x) { return x.count; }), multi ? [L.total] : [], [L.months[0].lessons.map(function (s) { return K.md(s.n); }).join(" "), offText(L.months[0]), L.months.map(function (x) { return x.status; }).concat(L.notes).filter(Boolean).join("・")]);
    }));
  }
  function rowsPer() { var R = S.R; return [["名前", "組", "コースと曜日"].concat(R.months.map(function (M) { return mLabel(M) + "の回数"; }), ["合計"])].concat(R.per.map(function (p) { return [p.name, p.group, p.lines.map(function (L) { return (L.course ? L.course + " " : "") + L.wdText; }).join("、")].concat(p.months, [p.total]); })); }
  function rowsDates() {
    var out = [["名前", "コース", "組", "日付", "曜日", "種類", "メモ"]];
    sorted().forEach(function (L) { L.months.forEach(function (x) {
      var all = x.lessons.map(function (s) { return [s.n, s.add ? "追加" : "レッスン", s.add ? s.note : ""]; }).concat(x.offs.map(function (f) { return [f.n, "お休み", f.why]; })).sort(function (a, b) { return a[0] - b[0]; });
      all.forEach(function (a) { out.push([L.name, L.course, L.group, K.iso(a[0]), WD[K.ymd(a[0]).w], a[1], a[2]]); });
    }); });
    return out;
  }
  function rowsWd() { var R = S.R, out = [["月", "曜日", "人数", "回数", "レッスン日", "お休み"]]; R.byWd.forEach(function (b) { if (!b.people) return; out.push([b.y + "年" + b.m + "月", WD[b.w], b.people, b.lessons.length, b.lessons.map(K.md).join(" "), b.offs.map(function (f) { return K.md(f.n) + " " + f.why; }).join("、")]); }); return out; }
  function rowsDays() { return [["日付", "曜日", "のべ人数", "うち追加", "名前（コース）"]].concat(S.R.days.map(function (d) { return [K.iso(d.n), WD[K.ymd(d.n).w], d.people, d.add, d.names.join("、")]; })); }
  function rowsChk() { return [["行", "名前", "内容"]].concat(S.R.checks.map(function (c) { return [c.row, c.name, c.why]; })); }
  function rowsAdd() {
    var R = S.R, byRow = {};
    R.lines.forEach(function (L) { byRow[L.row] = L; });
    var base = T.hasHead ? 2 : 1;
    var head = T.headers.concat(R.months.map(function (M) { return mLabel(M) + "の回数"; }));
    var out = [head];
    T.rows.forEach(function (r, i) {
      var L = byRow[i + base];
      if (!L && R.cut && i + base > R.lines[R.lines.length - 1].row) return; // お試し版は計算した行だけ
      out.push(r.slice(0, T.headers.length).concat(R.months.map(function (_, mi) { return L ? L.months[mi].count : ""; })));
    });
    return out;
  }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: i === 1 ? 16 : /レッスン日|お休み|名前|メモ/.test(h) ? 36 : Math.max(8, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsLines();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1行1コース");
    XLSX.utils.book_append_sheet(wb, sheet(rowsPer()), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsWd()), "曜日ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsDays()), "日ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsDates()), "レッスン日の明細");
    if (S.R.checks.length) XLSX.utils.book_append_sheet(wb, sheet(rowsChk()), "確かめたい所");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（休講日と決まりだけ。名前は保存しない） ----------
  var VALS = ["mcount", "cap", "off", "add", "by", "msg", "sort", "view"], CHK = ["holidays", "nenmatsu", "fifth", "useJoin"];
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var SAMPLE = false;
  function saveSettings() { if (SAMPLE) return; var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); CHK.forEach(function (k) { o[k] = $(k).checked; }); saveJSON("lesson-kaisu", o); }
  function loadSettings() { var o = loadJSON("lesson-kaisu") || {}; VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); CHK.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); }

  // ---------- 見本（架空の名前） ----------
  function sample() {
    SAMPLE = true;
    var rows = [["番号", "生徒名", "コース", "曜日", "講師", "入会日", "退会日"],
      ["1", "青木 一郎", "ピアノ30分", "火 16:00", "森", "", ""],
      ["1", "青木 一郎", "ソルフェージュ", "火 16:30", "森", "", ""],
      ["2", "青木 花", "リトミック", "木 15:30", "林", "", ""],
      ["3", "石井 蓮", "ピアノ30分", "火・金", "森", "", ""],
      ["4", "上田 葵", "ピアノ45分", "水曜日 17:00", "林", "", ""],
      ["5", "江藤 さくら", "ピアノ30分", "月", "森", "", ""],
      ["6", "大野 結衣", "英語", "第1・3土", "林", "", ""],
      ["7", "加藤 美咲", "ピアノ30分", "木", "森", "2026/12/14", ""],
      ["8", "木村 陸", "リトミック", "木", "林", "2027/1/9", ""],
      ["9", "工藤 葵", "ピアノ45分", "金", "森", "", "2026/11/30"],
      ["10", "小林 蓮", "ピアノ30分", "土", "林", "", "2026/12/19"],
      ["11", "佐々木 心", "ピアノ30分", "隔週土", "森", "", ""],
      ["", "合計", "", "", "", "", ""]];
    $("hasHead").checked = true; $("start").value = "2026-12"; $("mcount").value = "1";
    $("holidays").checked = true; $("nenmatsu").checked = true; $("fifth").checked = false; $("cap").value = "0"; $("useJoin").checked = true;
    $("off").value = "12/24 リトミック（会場の都合）\n12/19 林（研修）";
    $("add").value = "12/27 火（12/29の振替）";
    $("title").value = "12月のレッスン日（見本）"; $("by").value = "〇〇音楽教室"; $("msg").value = "お休みの日は、前日までにご連絡ください。";
    setData(rows, "見本（架空の名前）");
  }

  // ---------- 画面 ----------
  loadSettings();
  (function () { var d = new Date(), y = d.getFullYear(), m = d.getMonth() + 2; if (m > 12) { m = 1; y++; } $("start").value = y + "-" + (m < 10 ? "0" : "") + m; })();
  $("file").onchange = function () { SAMPLE = false; if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); SAMPLE = false; if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; SAMPLE = false; setData(K.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) setData(RAW, NAME); };
  ["start", "mcount", "cap"].concat(CHK).forEach(function (k) { $(k).onchange = refresh; });
  ["off", "add"].forEach(function (k) { $(k).oninput = (function () { var t; return function () { clearTimeout(t); t = setTimeout(refresh, 300); }; })(); });
  ["sort", "view", "mon"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  ["by", "msg"].forEach(function (k) { $(k).onchange = saveSettings; });
  $("sample").onclick = sample;
  $("pList").onclick = function () { if (S.R) printList(); };
  $("pSlip").onclick = function () { if (S.R) printSlips(); };
  $("pWd").onclick = function () { if (S.R) printWd(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cAdd").onclick = function () { if (!S.R) return; var r = rowsAdd(), n = fname("csv", "回数つき"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  $("cDates").onclick = function () { if (!S.R) return; var r = rowsDates(), n = fname("csv", "明細"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
  refresh();
})();
