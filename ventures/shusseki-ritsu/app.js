/* 出欠表の出席率の集計 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.SHUSSEKI;
  var LIMIT = window.SHUSSEKI_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";                 // 読み込んだ表（見出し行を含む）
  var T = { headers: [], rows: [], wide: {}, long: {}, hasHead: true };
  var S = { R: null };
  var CATL = [["P", "出席"], ["L", "遅刻"], ["E", "早退"], ["A", "欠席"], ["X", "数えない"]];
  var SHOWMK = { P: "○", L: "遅", E: "早", A: "×", X: "公", B: "", U: "?" };

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    if ($("trans").checked) rows = K.transpose(rows);
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    var hasHead = $("hasHead").checked;
    T.hasHead = hasHead;
    T.headers = hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = hasHead ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    analyze(true);
  }
  function analyze(reguess) {
    prep();
    var map = curMap();
    if (reguess) {
      $("shape").value = K.guessShape(T.headers, T.rows, map);
      T.wide = K.guessWide(T.headers, T.rows, map);
      T.long = K.guessLong(T.headers, T.rows);
    }
    $("loadMsg").innerHTML = esc((NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。");
    $("shapeBox").hidden = false;
    drawCols();
    refresh();
  }
  function opt(i, sel) { return '<option value="' + i + '"' + (sel ? " selected" : "") + ">" + esc(T.headers[i]) + "</option>"; }
  function drawCols() {
    var wide = $("shape").value === "wide", el = $("cols");
    var defs = wide ? [["name", "名前の列"], ["group", "組・学年・クラス（任意）"]] : [["date", "日付・回の列"], ["name", "名前の列"], ["status", "出欠の列（なければ来た人だけの記録）"], ["group", "組・学年・クラス（任意）"]];
    var C = wide ? T.wide : T.long;
    el.innerHTML = defs.map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (_, i) { return opt(i, C[d[0]] === i); }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete C[s.dataset.k]; else C[s.dataset.k] = +s.value; if (wide) drawSes(); refresh(); };
    });
    $("sesBox").hidden = !wide; $("rosterBox").hidden = wide;
    if (wide) drawSes();
  }
  function drawSes() {
    var ss = T.wide.sessions || [];
    $("sesl").innerHTML = T.headers.map(function (h, i) {
      if (i === T.wide.name || i === T.wide.group) return "";
      return '<label><input type="checkbox" data-i="' + i + '"' + (ss.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("");
    $("sesN").textContent = "（" + ss.length + " 回を選択中）";
    Array.prototype.forEach.call($("sesl").querySelectorAll("input"), function (c) {
      c.onchange = function () {
        var i = +c.dataset.i, a = T.wide.sessions;
        if (c.checked && a.indexOf(i) < 0) a.push(i); if (!c.checked && a.indexOf(i) >= 0) a.splice(a.indexOf(i), 1);
        a.sort(function (p, q) { return p - q; });
        $("sesN").textContent = "（" + a.length + " 回を選択中）"; refresh();
      };
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

  // ---------- 記号 ----------
  function drawMaps() {
    var saved = loadJSON("shusseki-ritsu-map");
    $("maps").innerHTML = CATL.map(function (c) {
      return '<label for="m' + c[0] + '">' + c[1] + '</label><input type="text" id="m' + c[0] + '" value="' + esc(saved && saved[c[0]] != null ? saved[c[0]] : K.DEFAULT_MAP[c[0]]) + '">';
    }).join("") + '<span></span><div><button class="sub" id="mReset">記号を初めの設定に戻す</button></div>';
    CATL.forEach(function (c) { $("m" + c[0]).onchange = function () { saveJSON("shusseki-ritsu-map", mapSpec()); refresh(); }; });
    $("mReset").onclick = function () { CATL.forEach(function (c) { $("m" + c[0]).value = K.DEFAULT_MAP[c[0]]; }); saveJSON("shusseki-ritsu-map", null); refresh(); };
  }
  function mapSpec() { var o = {}; CATL.forEach(function (c) { o[c[0]] = $("m" + c[0]).value; }); return o; }
  function curMap() { return K.makeMap(mapSpec()); }

  // ---------- 計算 ----------
  function dnOf(id) { var v = $(id).value; if (!v) return null; var p = v.split("-"); return K.dayNo(+p[0], +p[1], +p[2]); }
  function clearOut(msg) { S.R = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    var wide = $("shape").value === "wide", M, t0 = Date.now();
    var yr = +$("year").value || null, base = T.hasHead ? 2 : 1;
    if (wide) {
      if (T.wide.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
      if (!T.wide.sessions || !T.wide.sessions.length) return clearOut('<span class="bad">出欠の列（回）を選んでください。</span>');
      M = K.buildWide(T.headers, T.rows, T.wide, { year: yr, rowBase: base });
    } else {
      if (T.long.date == null || T.long.name == null) return clearOut('<span class="bad">日付・回の列と、名前の列を選んでください。</span>');
      M = K.buildLong(T.headers, T.rows, T.long, { year: yr, rowBase: base, roster: $("roster").value });
    }
    var o = { map: curMap(), blank: $("blank").value, lateOk: $("lateOk").value === "1", from: dnOf("from"), to: dnOf("to"), threshold: +$("th").value || 0, streak: +$("st").value || 0, limit: LIMIT };
    var R = K.run(M, o);
    S.R = R; S.M = M; S.o = o;
    if (!R.sessions.length) return clearOut('<span class="bad">数える回がありません（期間・出欠の列を確かめてください）。</span>');
    var parts = ["<b>" + R.per.length + " 人</b>", "<b>" + R.sessions.length + " 回</b>" + (R.hasDates ? "（" + K.ymdStr(firstDn(R)) + "〜" + K.ymdStr(lastDn(R)) + "）" : "")];
    parts.push("全体の出席率 <b>" + K.pct(R.total.rate) + "</b>（" + R.total.att + "／" + R.total.target + "）");
    if (R.flagged.length) parts.push('<span class="bad">気になる人 ' + R.flagged.length + " 人</span>");
    if (R.empty.length) parts.push('<span class="note">全員が空欄の回 ' + R.empty.length + "（数えていません：" + esc(R.empty.slice(0, 5).join("・")) + (R.empty.length > 5 ? " ほか" : "") + "）</span>");
    if (R.outside) parts.push("期間外の回 " + R.outside);
    if (R.unknown.length) parts.push('<span class="wtxt">読めない記号 ' + R.unknown.length + " マス（数えていません）</span>");
    if (M.dup.length) parts.push('<span class="wtxt">同じ名前の行 ' + M.dup.length + (wide ? "（最初の行だけ使います）" : "（同じ日に2件）") + "</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを数えています（ほか " + R.cut + " 人）</span>");
    if (M.missingIsAbsent) parts.push('<span class="note">出欠の列がないため、記録のない人をその日の欠席として数えています</span>');
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function firstDn(R) { var a = R.sessions.filter(function (s) { return s.dn != null; }); return Math.min.apply(null, a.map(function (s) { return s.dn; })); }
  function lastDn(R) { var a = R.sessions.filter(function (s) { return s.dn != null; }); return Math.max.apply(null, a.map(function (s) { return s.dn; })); }
  function condText() {
    var o = S.o;
    return "空欄：" + (o.blank === "absent" ? "欠席" : "数えない") + "　遅刻・早退：" + (o.lateOk ? "出席に数える" : "出席に数えない") +
      "　気になる人：" + (o.threshold ? o.threshold + "% 未満" : "") + (o.threshold && o.streak ? "・" : "") + (o.streak ? "直近 " + o.streak + " 回以上続けて欠席" : "") + (!o.threshold && !o.streak ? "使わない" : "");
  }
  function sorted() {
    var a = S.R.per.map(function (r, i) { r._i = i; return r; }).slice(), m = $("sort").value;
    var rv = function (r) { return r.rate == null ? 2 : r.rate; };
    if (m === "low") a.sort(function (p, q) { return rv(p) - rv(q) || p._i - q._i; });
    else if (m === "high") a.sort(function (p, q) { return rv(q) - rv(p) || p._i - q._i; });
    else if (m === "group") { var go = {}; S.R.groups.forEach(function (g, i) { go[g.name] = i; }); a.sort(function (p, q) { return go[p.group || ""] - go[q.group || ""] || p._i - q._i; }); }
    else if (m === "kana") a.sort(function (p, q) { return p.name.localeCompare(q.name, "ja") || p._i - q._i; });
    return a;
  }
  function hasGroup() { return S.R.per.some(function (r) { return r.group; }); }
  function bar(r) { return r == null ? "" : '<span class="bar" style="width:' + Math.round(r * 60) + 'px"></span>'; }
  function lastLabel(r) { return r.lastAtt ? r.lastAtt.label : "—"; }

  // ---------- 表示 ----------
  function listView() {
    var R = S.R, v = $("view").value, g = hasGroup(), h = "";
    $("sortL").hidden = !(v === "per" || v === "grid" || v === "month");
    if (v === "per" || v === "flag") {
      var list = v === "flag" ? R.flagged : sorted();
      if (v === "flag" && !list.length) { $("listView").innerHTML = '<p class="note">気になる人はいません（' + esc(condText().split("気になる人：")[1]) + "）。</p>"; return; }
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + '<th class="n">出席</th><th class="n">対象の回</th><th>出席率</th><th class="n">遅刻</th><th class="n">早退</th><th class="n">欠席</th><th class="n">数えない</th><th class="n">最長の連続欠席</th><th class="n">直近の連続欠席</th><th>最後の出席</th>' + (v === "flag" ? "<th>理由</th>" : "") + "</tr>";
      h += list.map(function (r) {
        return "<tr" + (r.flag ? ' class="fl"' : "") + "><td>" + esc(r.name) + "</td>" + (g ? "<td>" + esc(r.group) + "</td>" : "") + '<td class="n">' + r.att + '</td><td class="n">' + r.target + '</td><td class="n">' + K.pct(r.rate) + bar(r.rate) + '</td><td class="n">' + r.c.L + '</td><td class="n">' + r.c.E + '</td><td class="n">' + r.c.A + '</td><td class="n">' + r.c.X + '</td><td class="n">' + r.maxRun + '</td><td class="n">' + r.recentRun + "</td><td>" + esc(lastLabel(r)) + "</td>" + (v === "flag" ? "<td>" + esc(r.flag.join("、")) + "</td>" : "") + "</tr>";
      }).join("") + "</table></div>";
    } else if (v === "ses") {
      h = '<div class="scroll"><table class="lt"><tr><th>回</th><th class="n">出席</th><th class="n">対象の人数</th><th>出席率</th><th class="n">遅刻</th><th class="n">早退</th><th class="n">欠席</th><th class="n">数えない</th><th class="n">空欄</th></tr>';
      h += R.bySes.map(function (s) { return "<tr><td>" + esc(sesLabel(s)) + '</td><td class="n">' + s.att + '</td><td class="n">' + s.target + '</td><td class="n">' + K.pct(s.rate) + bar(s.rate) + '</td><td class="n">' + s.c.L + '</td><td class="n">' + s.c.E + '</td><td class="n">' + s.c.A + '</td><td class="n">' + s.c.X + '</td><td class="n">' + s.c.B + "</td></tr>"; }).join("") + "</table></div>";
    } else if (v === "grid") {
      var list2 = sorted();
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + R.sessions.map(function (s) { return '<th class="n">' + esc(shortLabel(s)) + "</th>"; }).join("") + '<th class="n">出席率</th></tr>';
      h += list2.map(function (r) { return "<tr" + (r.flag ? ' class="fl"' : "") + "><td>" + esc(r.name) + "</td>" + r.marks.map(function (m) { return '<td class="mk ' + m + '">' + SHOWMK[m] + "</td>"; }).join("") + '<td class="n">' + K.pct(r.rate) + "</td></tr>"; }).join("");
      h += '<tr><td><b>出席人数</b></td>' + R.bySes.map(function (s) { return '<td class="mk"><b>' + s.att + "</b></td>"; }).join("") + '<td class="n">' + K.pct(R.total.rate) + "</td></tr></table></div>";
      h += '<p class="note">○出席　遅＝遅刻　早＝早退　×欠席　公＝数えない（公欠・忌引など）　空欄＝記録なし　?＝読めない記号</p>';
    } else if (v === "month") {
      if (!R.months.length) { $("listView").innerHTML = '<p class="note">日付の分かる回がないため、月ごとには分けられません（見出しが「第3回」などの表）。</p>'; return; }
      var list3 = sorted();
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + R.months.map(function (m) { return '<th class="n">' + esc(m.label) + "</th>"; }).join("") + '<th class="n">期間全体</th></tr>';
      h += list3.map(function (r) { return "<tr><td>" + esc(r.name) + "</td>" + R.byMonth[r._i].map(function (x) { return '<td class="n">' + (x.target ? x.att + "/" + x.target + "（" + K.pct(x.rate) + "）" : "—") + "</td>"; }).join("") + '<td class="n">' + r.att + "/" + r.target + "（" + K.pct(r.rate) + "）</td></tr>"; }).join("");
      h += "<tr><td><b>全員</b></td>" + R.months.map(function (m, k) { var t = 0, a = 0; R.byMonth.forEach(function (row) { t += row[k].target; a += row[k].att; }); return '<td class="n"><b>' + a + "/" + t + "（" + K.pct(t ? a / t : null) + "）</b></td>"; }).join("") + '<td class="n"><b>' + K.pct(R.total.rate) + "</b></td></tr></table></div>";
      if (R.undated) h += '<p class="note">日付の分からない回 ' + R.undated + " 回は、月ごとの表に入れず、期間全体にだけ入れています。</p>";
    } else if (v === "group") {
      h = '<div class="scroll"><table class="lt"><tr><th>組</th><th class="n">人数</th><th class="n">出席の合計</th><th class="n">対象の合計</th><th>出席率</th><th class="n">気になる人</th></tr>';
      h += R.groups.map(function (G) { return "<tr><td>" + esc(G.name || "（組なし）") + '</td><td class="n">' + G.n + '</td><td class="n">' + G.att + '</td><td class="n">' + G.target + '</td><td class="n">' + K.pct(G.rate) + bar(G.rate) + '</td><td class="n">' + G.flagged + "</td></tr>"; }).join("") + "</table></div>";
      if (!g) h += '<p class="note">組・学年・クラスの列を選ぶと、組ごとに分けて出します。</p>';
    }
    $("listView").innerHTML = h;
  }
  function sesLabel(s) { return s.dn != null && !/[日月火水木金土]/.test(s.label) ? K.mdStr(s.dn) + (/^\d/.test(s.label) ? "" : "　" + s.label) : s.label; }
  function shortLabel(s) { return s.dn != null ? K.fromDayNo(s.dn).m + "/" + K.fromDayNo(s.dn).d : s.label; }
  function colLetter(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function rowRef(n) { if (n == null || n === "") return ""; return $("trans").checked ? colLetter(n - 1) + " 列" : n + " 行"; }
  function errView() {
    var R = S.R, M = S.M, h = "";
    if (R.unknown.length) {
      h += "<h3>読めない記号（" + R.unknown.length + " マス）</h3><p class=\"note\">記号の欄に書き足すと数えられます。</p><div class=\"scroll\" style=\"max-height:220px\"><table class=\"lt\"><tr><th>場所</th><th>名前</th><th>回</th><th>書かれていた内容</th></tr>" +
        R.unknown.slice(0, 300).map(function (u) { return "<tr><td>" + rowRef(u.row) + "</td><td>" + esc(u.name) + "</td><td>" + esc(u.session) + "</td><td>" + esc(u.value) + "</td></tr>"; }).join("") + "</table></div>";
    }
    var other = M.skipped.concat(M.dup.map(function (d) { return { row: d.row, why: "「" + d.name + "」は" + (d.first ? rowRef(d.first) + "目と同じ名前（最初の行を使います）" : (d.label || "") + " に2件（後の記録を使います）") }; }));
    if (other.length) h += "<h3>使わなかった行・注意（" + other.length + "）</h3><div class=\"scroll\" style=\"max-height:180px\"><table class=\"lt\"><tr><th>場所</th><th>内容</th></tr>" + other.slice(0, 300).map(function (x) { return "<tr><td>" + rowRef(x.row) + "</td><td>" + esc(x.why) + "</td></tr>"; }).join("") + "</table></div>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function head(sub) {
    var t = $("title").value.trim() || "出欠の集計", R = S.R;
    return "<h1>" + esc(t) + "　" + esc(sub) + "</h1><p class=\"per\">" + R.per.length + " 人・" + R.sessions.length + " 回" + (R.hasDates ? "（" + K.ymdStr(firstDn(R)) + "〜" + K.ymdStr(lastDn(R)) + "）" : "") + "　全体の出席率 " + K.pct(R.total.rate) + "　" + esc(condText()) + "</p>";
  }
  function perRows(list, g, reason) {
    return '<table class="pt"><tr><th class="l">名前</th>' + (g ? '<th class="l">組</th>' : "") + "<th>出席</th><th>対象</th><th>出席率</th><th>遅刻</th><th>早退</th><th>欠席</th><th>数えない</th><th>最長連続欠席</th><th>直近連続欠席</th><th class=\"l\">最後の出席</th>" + (reason ? '<th class="l">理由</th>' : "") + "</tr>" +
      list.map(function (r) { return "<tr" + (r.flag && !reason ? ' class="fl"' : "") + '><td class="l">' + esc(r.name) + "</td>" + (g ? '<td class="l">' + esc(r.group) + "</td>" : "") + "<td>" + r.att + "</td><td>" + r.target + "</td><td>" + K.pct(r.rate) + "</td><td>" + r.c.L + "</td><td>" + r.c.E + "</td><td>" + r.c.A + "</td><td>" + r.c.X + "</td><td>" + r.maxRun + "</td><td>" + r.recentRun + '</td><td class="l">' + esc(lastLabel(r)) + "</td>" + (reason ? '<td class="l">' + esc(r.flag.join("、")) + "</td>" : "") + "</tr>"; }).join("") + "</table>";
  }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function printPer() {
    var R = S.R, g = hasGroup(), h = head("1人ごとの出席");
    if (R.flagged.length) h += "<h2>気になる人（" + R.flagged.length + " 人）</h2>" + perRows(R.flagged, g, true);
    h += "<h2>全員</h2>" + perRows(sorted(), g, false);
    if (g) h += "<h2>組ごと</h2><table class=\"pt\"><tr><th class=\"l\">組</th><th>人数</th><th>出席の合計</th><th>対象の合計</th><th>出席率</th><th>気になる人</th></tr>" + R.groups.map(function (G) { return '<tr><td class="l">' + esc(G.name || "（組なし）") + "</td><td>" + G.n + "</td><td>" + G.att + "</td><td>" + G.target + "</td><td>" + K.pct(G.rate) + "</td><td>" + G.flagged + "</td></tr>"; }).join("") + "</table>";
    doPrint(h, "portrait");
  }
  function printSes() {
    var R = S.R;
    doPrint(head("回ごとの出席") + '<table class="pt"><tr><th class="l">回</th><th>出席</th><th>対象の人数</th><th>出席率</th><th>遅刻</th><th>早退</th><th>欠席</th><th>数えない</th><th>空欄</th></tr>' +
      R.bySes.map(function (s) { return '<tr><td class="l">' + esc(sesLabel(s)) + "</td><td>" + s.att + "</td><td>" + s.target + "</td><td>" + K.pct(s.rate) + "</td><td>" + s.c.L + "</td><td>" + s.c.E + "</td><td>" + s.c.A + "</td><td>" + s.c.X + "</td><td>" + s.c.B + "</td></tr>"; }).join("") + "</table>", "portrait");
  }
  function printGrid() {
    var R = S.R, list = sorted(), per = 24, h = "";
    for (var k = 0; k < R.sessions.length; k += per) {
      var ks = []; for (var j = k; j < Math.min(k + per, R.sessions.length); j++) ks.push(j);
      h += '<div class="pg">' + head("出欠表" + (R.sessions.length > per ? "（" + (k + 1) + "〜" + (k + ks.length) + " 回目）" : "")) +
        '<table class="pt small"><tr><th class="l">名前</th>' + ks.map(function (j) { return "<th>" + esc(shortLabel(R.sessions[j])) + "</th>"; }).join("") + "<th>出席率</th></tr>" +
        list.map(function (r) { return "<tr" + (r.flag ? ' class="fl"' : "") + '><td class="l">' + esc(r.name) + "</td>" + ks.map(function (j) { return '<td class="mk">' + SHOWMK[r.marks[j]] + "</td>"; }).join("") + "<td>" + K.pct(r.rate) + "</td></tr>"; }).join("") +
        '<tr><td class="l"><b>出席人数</b></td>' + ks.map(function (j) { return '<td class="mk"><b>' + R.bySes[j].att + "</b></td>"; }).join("") + "<td>" + K.pct(R.total.rate) + "</td></tr></table>" +
        '<p class="per">○出席　遅＝遅刻　早＝早退　×欠席　公＝数えない　空欄＝記録なし　?＝読めない記号</p></div>';
    }
    doPrint(h, "landscape");
  }
  function printMonth() {
    var R = S.R;
    if (!R.months.length) { alert("日付の分かる回がないため、月ごとには分けられません。"); return; }
    var list = sorted();
    doPrint(head("月ごとの出席率") + '<table class="pt"><tr><th class="l">名前</th>' + R.months.map(function (m) { return "<th>" + esc(m.label) + "</th>"; }).join("") + "<th>期間全体</th></tr>" +
      list.map(function (r) { return '<tr><td class="l">' + esc(r.name) + "</td>" + R.byMonth[r._i].map(function (x) { return "<td>" + (x.target ? x.att + "/" + x.target + "（" + K.pct(x.rate) + "）" : "—") + "</td>"; }).join("") + "<td>" + r.att + "/" + r.target + "（" + K.pct(r.rate) + "）</td></tr>"; }).join("") + "</table>", "landscape");
  }

  // ---------- 保存 ----------
  function rowsPer() {
    var g = hasGroup();
    return [["名前"].concat(g ? ["組"] : [], ["出席", "対象の回", "出席率(%)", "遅刻", "早退", "欠席", "数えない", "空欄", "読めない", "最長の連続欠席", "直近の連続欠席", "最後の出席", "気になる理由"])].concat(sorted().map(function (r) {
      return [r.name].concat(g ? [r.group] : [], [r.att, r.target, K.rate100(r.rate), r.c.L, r.c.E, r.c.A, r.c.X, r.c.B, r.c.U, r.maxRun, r.recentRun, r.lastAtt ? (r.lastAtt.dn != null ? K.ymdStr(r.lastAtt.dn) : r.lastAtt.label) : "", r.flag ? r.flag.join("、") : ""]);
    }));
  }
  function rowsSes() {
    return [["回", "日付", "出席", "対象の人数", "出席率(%)", "遅刻", "早退", "欠席", "数えない", "空欄", "読めない"]].concat(S.R.bySes.map(function (s) {
      return [s.label, s.dn != null ? K.ymdStr(s.dn) : "", s.att, s.target, K.rate100(s.rate), s.c.L, s.c.E, s.c.A, s.c.X, s.c.B, s.c.U];
    }));
  }
  function rowsMonth() {
    var R = S.R, out = [["名前"].concat(R.months.reduce(function (a, m) { return a.concat([m.label + " 出席", m.label + " 対象", m.label + " 出席率(%)"]); }, []))];
    sorted().forEach(function (r) { out.push([r.name].concat(R.byMonth[r._i].reduce(function (a, x) { return a.concat([x.att, x.target, K.rate100(x.rate)]); }, []))); });
    return out;
  }
  function rowsGrid() {
    var R = S.R, NM = { P: "出席", L: "遅刻", E: "早退", A: "欠席", X: "数えない", B: "", U: "読めない" };
    return [["名前"].concat(R.sessions.map(function (s) { return s.dn != null ? K.ymdStr(s.dn) : s.label; }), ["出席率(%)"])].concat(sorted().map(function (r) { return [r.name].concat(r.marks.map(function (m) { return NM[m]; }), [K.rate100(r.rate)]); }));
  }
  function rowsGroup() { return [["組", "人数", "出席の合計", "対象の合計", "出席率(%)", "気になる人"]].concat(S.R.groups.map(function (G) { return [G.name || "（組なし）", G.n, G.att, G.target, K.rate100(G.rate), G.flagged]; })); }
  function rowsUnknown() { return [["場所", "名前", "回", "書かれていた内容"]].concat(S.R.unknown.map(function (u) { return [rowRef(u.row), u.name, u.session, u.value]; })); }
  function fname(ext, sub) { var t = ($("title").value.trim() || "出欠の集計").replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: i === 0 ? 16 : Math.max(6, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsPer();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsSes()), "回ごと");
    if (S.R.months.length) XLSX.utils.book_append_sheet(wb, sheet(rowsMonth()), "月ごと");
    if (hasGroup()) XLSX.utils.book_append_sheet(wb, sheet(rowsGroup()), "組ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsGrid()), "出欠表（そろえた記号）");
    if (S.R.unknown.length) XLSX.utils.book_append_sheet(wb, sheet(rowsUnknown()), "読めない記号");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var VALS = ["blank", "lateOk", "th", "st", "sort", "view"];
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function saveSettings() { var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); saveJSON("shusseki-ritsu", o); }
  function loadSettings() { var o = loadJSON("shusseki-ritsu") || {}; VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); }

  // ---------- 見本（架空の名前） ----------
  function sample() {
    var names = [["青木 一郎", "6年"], ["石井 花子", "6年"], ["上田 健", "6年"], ["江藤 さくら", "6年"], ["大野 翔", "5年"], ["加藤 美咲", "5年"], ["木村 陸", "5年"], ["工藤 葵", "5年"], ["小林 蓮", "4年"], ["佐々木 結衣", "4年"], ["清水 大和", "4年"], ["高橋 心", "4年"]];
    var days = [], d0 = K.dayNo(2026, 4, 4);
    for (var w = 0; w < 13; w++) days.push(d0 + w * 7);
    var head = ["番号", "氏名", "学年"].concat(days.map(function (dn) { var f = K.fromDayNo(dn); return f.m + "/" + f.d + "(" + K.WD[f.wd] + ")"; }), ["合計"]);
    var pat = [
      "○○○○○○遅○○ ○○○", "○○×○○○○○○ ○○○", "○×○××○○×× ××× ", "○○○○公○○○○ ○○○",
      "○○○遅○○○○遅 ○○○", "○○○○○×○○○ ○○×", "×○×○○○×○○ ○×○", "○○○○○○○○○ ○○○",
      "○○○○○○○○早 ○○○", "○遅○○○○○○○ ○○○", "○○○○××××× ×××", "○○○○○○○○○ ○公○"];
    var rows = [head];
    names.forEach(function (n, i) {
      var p = pat[i].split("");
      var cells = days.map(function (_, j) { return j === 9 ? "" : (p[j] || "").trim(); });
      rows.push([String(i + 1), n[0], n[1]].concat(cells, [String(cells.filter(function (c) { return c === "○"; }).length)]));
    });
    $("trans").checked = false; $("hasHead").checked = true;
    $("year").value = 2026;
    $("title").value = "少年団 練習の出欠（見本）";
    setData(rows, "見本（架空の名前・4月〜6月の土曜日）");
  }

  // ---------- 画面 ----------
  drawMaps(); loadSettings();
  $("year").value = new Date().getFullYear();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) analyze(true); };
  $("trans").onchange = function () { if (RAW) analyze(true); };
  $("shape").onchange = function () { drawCols(); refresh(); };
  $("year").onchange = refresh;
  $("roster").onchange = refresh;
  $("sesAll").onclick = function () { T.wide.sessions = T.headers.map(function (_, i) { return i; }).filter(function (i) { return i !== T.wide.name && i !== T.wide.group; }); drawSes(); refresh(); };
  $("sesNone").onclick = function () { T.wide.sessions = []; drawSes(); refresh(); };
  ["blank", "lateOk", "from", "to", "th", "st"].forEach(function (k) { $(k).onchange = refresh; });
  $("sort").onchange = function () { saveSettings(); if (S.R) listView(); };
  $("view").onchange = function () { saveSettings(); if (S.R) listView(); };
  $("sample").onclick = sample;
  $("pPer").onclick = function () { if (S.R) printPer(); };
  $("pSes").onclick = function () { if (S.R) printSes(); };
  $("pGrid").onclick = function () { if (S.R) printGrid(); };
  $("pMonth").onclick = function () { if (S.R) printMonth(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  $("cSes").onclick = function () { if (!S.R) return; var r = rowsSes(), n = fname("csv", "回ごと"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
})();
