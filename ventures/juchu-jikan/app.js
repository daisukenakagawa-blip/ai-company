/* 受注の曜日・時間帯の集計 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.JUCHU;
  var LIMIT = window.JUCHU_LIMIT || Infinity; // お試し版は表の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { headers: [], rows: [], cols: {}, hasHead: true };
  var S = { last: null };
  var COLS = [["dt", "注文日時（日付と時刻が1つの列）"], ["date", "注文日（日付だけの列）"], ["time", "時刻（別の列のとき）"], ["no", "注文番号（任意）"], ["qty", "点数・数量（任意）"], ["amt", "金額（任意）"]];
  var MEAS = { cnt: "件数", avg: "1日あたりの件数", qty: "点数", amt: "金額", pct: "件数の割合（%）" };
  var WD = K.WD;

  // ---------- 読み込み ----------
  function prep(rows, hasHead) {
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    return {
      headers: hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); }),
      rows: hasHead ? rows.slice(1) : rows
    };
  }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var p = prep(rows, hasHead);
    T.headers = p.headers; T.rows = p.rows; T.hasHead = hasHead;
    var total = T.rows.length;
    if (T.rows.length > LIMIT) T.rows = T.rows.slice(0, LIMIT);
    T.cols = K.guessByValues(T.rows, hasHead ? K.guessColumns(T.headers) : {});
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを使います。</span>" : "");
    drawCols();
    refresh();
  }
  function drawCols() {
    var el = $("cols");
    el.hidden = false;
    el.innerHTML = COLS.map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        T.headers.map(function (h, i) { return '<option value="' + i + '"' + (T.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () {
        var k = sel.dataset.k;
        if (sel.value === "") delete T.cols[k]; else T.cols[k] = +sel.value;
        if (k === "dt" && sel.value !== "") { delete T.cols.date; delete T.cols.time; drawCols(); }
        if ((k === "date" || k === "time") && sel.value !== "") { delete T.cols.dt; drawCols(); }
        refresh();
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd hh:mm:ss" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(K.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function rowNo(i) { return i + (T.hasHead ? 2 : 1); }
  function opts() {
    return { bandMode: $("band").value, bandCustom: $("bandCustom").value, from: $("from").value, to: $("to").value, weekStart: +$("ws").value, tz: $("tz").value, amtMode: $("amtMode").value, hasHead: T.hasHead };
  }
  function clearOut(msg) { S.last = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    $("bandCustom").hidden = $("band").value !== "custom";
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) { S.last = null; return; }
    if (T.cols.dt == null && T.cols.date == null) return clearOut('<span class="bad">「注文日時」か「注文日」の列を選んでください。</span>');
    var t0 = Date.now(), o = opts();
    var R = K.run(T.rows, T.cols, o);
    if (R.err) return clearOut('<span class="bad">' + esc(R.err) + "</span>");
    S.last = R; S.o = o;
    $("bandNote").textContent = R.bands.length + " の時間帯";
    var c = R.count, parts = [];
    parts.push("<b>" + c.rows + " 行</b>");
    parts.push("<b>注文 " + c.orders + " 件</b>" + (T.cols.no != null ? "（注文番号でまとめた件数）" : "（1行を1件として数えています）"));
    if (R.range) parts.push("期間 " + R.range.from + "〜" + R.range.to + "（" + R.span + " 日）");
    if (c.noTime) parts.push('<span class="wtxt">時刻のない注文 ' + c.noTime + "（日ごと・月ごとにだけ入ります）</span>");
    if (c.outside) parts.push("期間外 " + c.outside + " 行");
    if (c.tz) parts.push('<span class="wtxt">日本時間に直した日時 ' + c.tz + "</span>");
    if (c.err) parts.push('<span class="bad">日時が読めない行 ' + c.err + "</span>");
    var top = R.top.slice(0, 3).map(function (x) { return WD[x.wd] + "曜 " + R.bands[x.band].label + "（" + x.cnt + " 件" + (x.avg != null ? "・1日あたり " + K.fmt(x.avg) : "") + "）"; });
    $("sumMsg").innerHTML = parts.join("　/　") + (top.length ? "<br>件数の多い所：" + esc(top.join("、")) : "") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    $("measL").hidden = !($("view").value === "mx");
    listView(); errView();
  }
  function condText() {
    var o = S.o, R = S.last;
    return "時間帯：" + ($("band").options[$("band").selectedIndex].text) + (o.bandMode === "custom" ? "（" + R.bands.map(function (b) { return b.from; }).join("・") + "時で区切る）" : "") + "　週の始まり：" + WD[o.weekStart] + "曜" + (T.cols.amt != null ? "　金額：" + (o.amtMode === "first" ? "注文の最初の行" : "行を全部足す") : "");
  }
  function f(x) { return x == null ? "" : K.fmt(x); }
  // 曜日×時間帯の表のデータ（数える物ごと）
  function matrix(meas) {
    var R = S.last, nb = R.bands.length, key = meas === "avg" || meas === "pct" ? "cnt" : meas;
    var A = R.M[key], NT = R.noTime[key], hasNT = R.count.noTime > 0, totDays = R.occ.reduce(function (a, b) { return a + b; }, 0);
    function v(x, days) { if (meas === "avg") return days ? x / days : null; if (meas === "pct") return R.tot.cnt ? x / R.tot.cnt * 100 : null; return x; }
    var rows = R.order.map(function (w) {
      var cells = A[w].map(function (x) { return v(x, R.occ[w]); });
      var sum = A[w].reduce(function (a, b) { return a + b; }, 0);
      return { wd: w, occ: R.occ[w], cells: cells, nt: hasNT ? v(NT[w], R.occ[w]) : null, tot: v(sum + NT[w], R.occ[w]) };
    });
    var colSum = [], all = 0, ntAll = 0;
    for (var k = 0; k < nb; k++) { var s = 0; for (var w = 0; w < 7; w++) s += A[w][k]; colSum.push(v(s, totDays)); all += s; }
    for (var w2 = 0; w2 < 7; w2++) ntAll += NT[w2];
    var max = 0;
    rows.forEach(function (r) { r.cells.forEach(function (x) { if (x != null && x > max) max = x; }); });
    return { rows: rows, colSum: colSum, nt: hasNT ? v(ntAll, totDays) : null, hasNT: hasNT, all: v(all + ntAll, totDays), max: max, totDays: totDays };
  }
  function shade(x, max, print) {
    if (!x || !max || x <= 0) return "";
    var a = Math.min(1, x / max);
    if (print) return ' style="background:rgba(0,0,0,' + (a * 0.42).toFixed(3) + ")" + (a > 0.75 ? ";color:#fff" : "") + '"';
    return ' style="background:rgba(15,118,110,' + (0.08 + a * 0.72).toFixed(3) + ")" + (a > 0.5 ? ";color:#fff" : "") + '"';
  }
  function mv(x, meas) { if (x == null) return ""; if (meas === "avg") return K.fmt(Math.round(x * 10) / 10); if (meas === "pct") return K.fmt(Math.round(x * 10) / 10); return K.fmt(x); }
  function mxHTML(meas, print) {
    var R = S.last, X = matrix(meas), cls = print ? "pm" : "mx";
    var h = '<table class="' + cls + '"><thead><tr><th class="l">曜日</th>' + R.bands.map(function (b) { return "<th>" + esc(print ? b.label.replace("時台", "時") : b.label) + "</th>"; }).join("") + (X.hasNT ? "<th>時刻なし</th>" : "") + '<th class="tot">' + (meas === "avg" ? "1日あたり" : "合計") + "</th></tr></thead><tbody>";
    X.rows.forEach(function (r) {
      h += '<tr><th class="l">' + WD[r.wd] + '<span style="font-weight:400;font-size:85%">（' + r.occ + "日）</span></th>" + r.cells.map(function (x) { return "<td" + shade(x, X.max, print) + ">" + (x ? mv(x, meas) : (print ? "" : '<span style="color:#d1d5db">0</span>')) + "</td>"; }).join("") +
        (X.hasNT ? "<td>" + mv(r.nt, meas) + "</td>" : "") + '<td class="tot">' + mv(r.tot, meas) + "</td></tr>";
    });
    h += '<tr><th class="l tot">' + (meas === "avg" ? "全体" : "合計") + "</th>" + X.colSum.map(function (x) { return '<td class="tot">' + mv(x, meas) + "</td>"; }).join("") + (X.hasNT ? '<td class="tot">' + mv(X.nt, meas) + "</td>" : "") + '<td class="tot">' + mv(X.all, meas) + "</td></tr>";
    h += "</tbody></table>";
    return h;
  }
  function listView() {
    var R = S.last, view = $("view").value, h = "";
    $("measL").hidden = view !== "mx";
    if (view === "mx") {
      var meas = $("meas").value;
      if ((meas === "qty" && T.cols.qty == null) || (meas === "amt" && T.cols.amt == null)) h = '<p class="wtxt">' + (meas === "qty" ? "点数" : "金額") + "の列を選ぶと表示できます。</p>";
      else {
        h = '<div class="scroll">' + mxHTML(meas, false) + "</div>";
        h += '<p class="note">数える物：' + esc(MEAS[meas]) + "。曜日の横の（ ）は期間中のその曜日の日数です。" + (meas === "avg" ? "1日あたりの件数＝件数÷その曜日の日数（月曜が5回ある月と4回の月を比べやすくします）。" : "") + "色が濃いほど多い時間帯です。" + (!R.fill ? '<span class="wtxt">期間が長すぎる（10年を超える）ため、日数・1日あたりは出していません。</span>' : "") + "</p>";
      }
    } else if (view === "days") {
      if (!R.fill) h = '<p class="wtxt">期間が長すぎる（10年を超える）ため、日ごとの表は出していません。期間を指定してください。</p>';
      else {
        h = '<div class="scroll"><table class="lt"><thead><tr><th>日付</th><th>曜日</th><th class="n">件数</th>' + (T.cols.qty != null ? '<th class="n">点数</th>' : "") + (T.cols.amt != null ? '<th class="n">金額</th>' : "") + "</tr></thead><tbody>";
        R.days.slice(0, 1000).forEach(function (d) {
          var w = d.wd === 0 || d.wd === 6;
          h += "<tr><td" + (w ? ' class="wk"' : "") + ">" + d.date + "</td><td" + (w ? ' class="wk"' : "") + ">" + WD[d.wd] + '</td><td class="n"><b>' + d.cnt + "</b></td>" + (T.cols.qty != null ? '<td class="n">' + f(d.qty) + "</td>" : "") + (T.cols.amt != null ? '<td class="n">' + f(d.amt) + "</td>" : "") + "</tr>";
        });
        h += "</tbody></table></div>" + (R.days.length > 1000 ? '<p class="note">画面には先頭 1,000 日を出しています（全部は保存に入ります）。</p>' : "") + '<p class="note">注文のない日も 0 件として並べています。</p>';
      }
    } else if (view === "months") {
      h = '<div class="scroll"><table class="lt"><thead><tr><th>月</th><th class="n">期間内の日数</th><th class="n">件数</th><th class="n">1日あたり</th>' + (T.cols.qty != null ? '<th class="n">点数</th>' : "") + (T.cols.amt != null ? '<th class="n">金額</th>' : "") + "</tr></thead><tbody>";
      R.months.forEach(function (m) {
        h += "<tr><td>" + m.key.replace("-", "年") + "月</td><td class=\"n\">" + m.days + '</td><td class="n"><b>' + m.cnt + '</b></td><td class="n">' + K.fmt(Math.round(m.cnt / m.days * 10) / 10) + "</td>" + (T.cols.qty != null ? '<td class="n">' + f(m.qty) + "</td>" : "") + (T.cols.amt != null ? '<td class="n">' + f(m.amt) + "</td>" : "") + "</tr>";
      });
      h += "</tbody></table></div><p class=\"note\">期間の最初と最後の月は、期間内の日数だけで数えています。</p>";
    } else {
      h = '<div class="scroll"><table class="lt"><thead><tr><th class="n">行</th>' + (T.cols.no != null ? "<th>注文番号</th>" : "") + "<th>日付</th><th>曜日</th><th>時刻</th><th>時間帯</th>" + (T.cols.no != null ? '<th class="n">行数</th>' : "") + (T.cols.qty != null ? '<th class="n">点数</th>' : "") + (T.cols.amt != null ? '<th class="n">金額</th>' : "") + "</tr></thead><tbody>";
      R.orders.slice(0, SHOW).forEach(function (x) {
        h += '<tr><td class="n">' + rowNo(x.i) + "</td>" + (T.cols.no != null ? "<td>" + esc(x.no) + "</td>" : "") + "<td>" + K.ymdStr(x) + "</td><td>" + WD[x.wd] + "</td><td>" + (x.hasTime ? x.h + ":" + (x.mi < 10 ? "0" : "") + x.mi : "") + "</td><td>" + (x.hasTime ? esc(R.bands[x.band].label) : '<span class="wtxt">時刻なし</span>') + "</td>" + (T.cols.no != null ? '<td class="n">' + x.lines + "</td>" : "") + (T.cols.qty != null ? '<td class="n">' + f(x.qty) + "</td>" : "") + (T.cols.amt != null ? '<td class="n">' + f(x.amt) + "</td>" : "") + "</tr>";
      });
      h += "</tbody></table></div>" + (R.orders.length > SHOW ? '<p class="note">画面には先頭 ' + SHOW + " 件を出しています（全部は保存に入ります）。</p>" : "");
    }
    $("listView").innerHTML = h;
  }
  function errView() {
    var R = S.last, h = "";
    if (R.errs.length) h += '<h3>日時が読めなかった行（集計に入れていません）</h3><div class="scroll" style="max-height:240px"><table class="lt"><thead><tr><th class="n">行</th><th>注文番号</th><th>日時</th><th>理由</th></tr></thead><tbody>' +
      R.errs.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.no) + "</td><td>" + esc(x.raw) + '</td><td class="bad">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="note">「11/23/2026」のような月/日/年の順は読みません。年を先頭にした形（2026/11/23）に直すか、Excel の日付の列のまま読み込んでください。</p>';
    var w = [];
    R.qtyBad.forEach(function (x) { w.push(rowNo(x.i) + "行目：点数「" + x.raw + "」が数ではないため 0 として数えました"); });
    R.amtBad.forEach(function (x) { w.push(rowNo(x.i) + "行目：金額「" + x.raw + "」が数ではないため 0 として数えました"); });
    R.warns.forEach(function (x) { w.push(rowNo(x.i) + "行目（" + x.no + "）：" + x.err); });
    if (w.length) h += '<h3>メモ</h3><p class="note wtxt">' + esc(w.slice(0, 30).join("　")) + (w.length > 30 ? "　ほか " + (w.length - 30) + " 件" : "") + "</p>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function head(kind) {
    var R = S.last, title = ($("title").value.trim() || "受注の集計") + "　" + kind;
    var cond = [R.range ? "期間 " + R.range.from + "〜" + R.range.to + "（" + R.span + " 日）" : "", "注文 " + R.count.orders + " 件", "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    return "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + '</p><p class="per">' + esc(condText()) + (R.count.err ? "　日時が読めず集計に入れていない行 " + R.count.err : "") + "</p>";
  }
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function printMx() {
    if (!S.last) return;
    var ms = ["cnt", "avg"].concat(T.cols.qty != null ? ["qty"] : []).concat(T.cols.amt != null ? ["amt"] : []);
    setPage("landscape");
    // 件数と1日あたりは1枚に、点数と金額は次の1枚に
    var pages = [];
    for (var i = 0; i < ms.length; i += 2) pages.push(ms.slice(i, i + 2));
    $("printArea").innerHTML = pages.map(function (pg, pi) {
      return '<div class="pg">' + (pi === 0 ? head("曜日×時間帯") : "") + pg.map(function (m) { return "<h2>" + esc(MEAS[m]) + "</h2>" + mxHTML(m, true) + (m === "avg" ? '<p class="per">1日あたりの件数＝件数÷期間中のその曜日の日数（曜日の横の数）。色が濃いほど多い時間帯です。</p>' : ""); }).join("") + "</div>";
    }).join("");
    window.print();
  }
  function printDays() {
    if (!S.last) return;
    var R = S.last, q = T.cols.qty != null, a = T.cols.amt != null;
    setPage("portrait");
    var h = head("日ごと・月ごと") + "<h2>月ごと</h2>" + '<table class="pt"><thead><tr><th class="l">月</th><th>日数</th><th>件数</th><th>1日あたり</th>' + (q ? "<th>点数</th>" : "") + (a ? "<th>金額</th>" : "") + "</tr></thead><tbody>" +
      R.months.map(function (m) { return '<tr><td class="l">' + m.key.replace("-", "年") + "月</td><td>" + m.days + "</td><td><b>" + m.cnt + "</b></td><td>" + K.fmt(Math.round(m.cnt / m.days * 10) / 10) + "</td>" + (q ? "<td>" + f(m.qty) + "</td>" : "") + (a ? "<td>" + f(m.amt) + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table>";
    h += "<h2>日ごと</h2>";
    if (R.days.length > 800) h += '<p class="per">日数が多いため、日ごとの表は印刷していません（Excel・CSV で保存してください）。</p>';
    else h += '<div class="cols2"><table class="pt"><thead><tr><th class="l">日付</th><th class="l">曜</th><th>件数</th>' + (q ? "<th>点数</th>" : "") + (a ? "<th>金額</th>" : "") + "</tr></thead><tbody>" +
      R.days.map(function (d) { return "<tr" + (d.wd === 0 || d.wd === 6 ? ' class="wk"' : "") + '><td class="l">' + d.date + '</td><td class="l">' + WD[d.wd] + "</td><td><b>" + d.cnt + "</b></td>" + (q ? "<td>" + f(d.qty) + "</td>" : "") + (a ? "<td>" + f(d.amt) + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table></div>";
    $("printArea").innerHTML = h;
    window.print();
  }
  window.addEventListener("afterprint", function () { setPage("landscape"); });

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function r1(x) { return x == null ? "" : Math.round(x * 100) / 100; }
  function rowsMx(meas) {
    var R = S.last, X = matrix(meas);
    var out = [["曜日", "日数"].concat(R.bands.map(function (b) { return b.label; })).concat(X.hasNT ? ["時刻なし"] : []).concat([meas === "avg" ? "1日あたり" : "合計"])];
    X.rows.forEach(function (r) { out.push([WD[r.wd], r.occ].concat(r.cells.map(r1)).concat(X.hasNT ? [r1(r.nt)] : []).concat([r1(r.tot)])); });
    out.push([meas === "avg" ? "全体" : "合計", X.totDays].concat(X.colSum.map(r1)).concat(X.hasNT ? [r1(X.nt)] : []).concat([r1(X.all)]));
    return out;
  }
  function rowsDays() {
    var R = S.last, q = T.cols.qty != null, a = T.cols.amt != null;
    var out = [["日付", "曜日", "件数"].concat(q ? ["点数"] : []).concat(a ? ["金額"] : [])];
    R.days.forEach(function (d) { out.push([d.date, WD[d.wd], d.cnt].concat(q ? [d.qty] : []).concat(a ? [d.amt] : [])); });
    return out;
  }
  function rowsMonths() {
    var R = S.last, q = T.cols.qty != null, a = T.cols.amt != null;
    var out = [["月", "期間内の日数", "件数", "1日あたり"].concat(q ? ["点数"] : []).concat(a ? ["金額"] : [])];
    R.months.forEach(function (m) { out.push([m.key, m.days, m.cnt, Math.round(m.cnt / m.days * 100) / 100].concat(q ? [m.qty] : []).concat(a ? [m.amt] : [])); });
    return out;
  }
  function rowsOrders() {
    var R = S.last, no = T.cols.no != null, q = T.cols.qty != null, a = T.cols.amt != null;
    var out = [["元の行"].concat(no ? ["注文番号"] : []).concat(["日付", "曜日", "時", "分", "時間帯"]).concat(no ? ["行数"] : []).concat(q ? ["点数"] : []).concat(a ? ["金額"] : [])];
    R.orders.forEach(function (x) { out.push([rowNo(x.i)].concat(no ? [x.no] : []).concat([K.ymdStr(x), WD[x.wd], x.hasTime ? x.h : "", x.hasTime ? x.mi : "", x.hasTime ? R.bands[x.band].label : "時刻なし"]).concat(no ? [x.lines] : []).concat(q ? [x.qty] : []).concat(a ? [x.amt] : [])); });
    return out;
  }
  function rowsErr() {
    var R = S.last, out = [["元の行", "注文番号", "日時", "理由"]];
    R.errs.forEach(function (x) { out.push([rowNo(x.i), x.no, x.raw, x.err]); });
    return out;
  }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (LIMIT < Infinity ? "お試し版は表の先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, widths, textCols) {
    textCols = textCols || [];
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) { if (ri > 0 && typeof v === "number" && textCols.indexOf(ci) < 0) return v; return String(v == null ? "" : v); });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; });
    ws["!cols"] = widths;
    return ws;
  }
  function wcols(rows, first) { return rows[0].map(function (_, i) { return { wch: i === 0 ? first : 10 }; }); }
  function saveX() {
    if (!S.last) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new();
    var ms = ["cnt", "avg"].concat(T.cols.qty != null ? ["qty"] : []).concat(T.cols.amt != null ? ["amt"] : []);
    ms.forEach(function (m) { var r = rowsMx(m); XLSX.utils.book_append_sheet(wb, sheet(r, wcols(r, 6)), "曜日×時間帯（" + { cnt: "件数", avg: "1日あたり", qty: "点数", amt: "金額" }[m] + "）"); });
    var d = rowsDays(), mo = rowsMonths(), od = rowsOrders(), er = rowsErr();
    XLSX.utils.book_append_sheet(wb, sheet(d, wcols(d, 12)), "日ごと");
    XLSX.utils.book_append_sheet(wb, sheet(mo, wcols(mo, 10)), "月ごと");
    XLSX.utils.book_append_sheet(wb, sheet(od, wcols(od, 8), T.cols.no != null ? [1] : []), "注文ごと");
    if (er.length > 1) XLSX.utils.book_append_sheet(wb, sheet(er, [{ wch: 8 }, { wch: 12 }, { wch: 24 }, { wch: 30 }]), "読めなかった行");
    var name = "受注の曜日時間帯_" + ymd() + ".xlsx";
    XLSX.writeFile(wb, name); done(name, od.length - 1);
  }
  function saveC(kind) {
    if (!S.last) return;
    var meas = $("meas").value;
    if (kind === "mx" && ((meas === "qty" && T.cols.qty == null) || (meas === "amt" && T.cols.amt == null))) meas = "cnt";
    var rows = kind === "mx" ? rowsMx(meas) : rowsDays();
    var name = (kind === "mx" ? "曜日×時間帯_" + { cnt: "件数", avg: "1日あたり", qty: "点数", amt: "金額", pct: "割合" }[meas] + "_" : "日ごとの受注_") + ymd() + ".csv";
    dlBlob(K.toCSV(rows), name); done(name, rows.length - 1);
  }

  // ---------- 見本（架空の注文。実在の店・数字とは関係ありません） ----------
  function makeSample() {
    var seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    var wHour = [1, 1, 0, 0, 0, 0, 1, 2, 3, 3, 2, 2, 5, 4, 2, 2, 2, 3, 3, 4, 6, 7, 6, 3]; // 時刻の重み（見本用）
    var wDay = [8, 7, 4, 4, 4, 5, 7]; // 日〜土の重み（見本用）
    var hs = wHour.reduce(function (a, b) { return a + b; }, 0);
    var lines = ["注文番号\t注文日時\t商品名\t数量\t小計"], no = 1001;
    for (var d = 1; d <= 31; d++) {
      var wd = new Date(Date.UTC(2026, 9, d)).getUTCDay(), n = wDay[wd] + Math.floor(rnd() * 3);
      for (var k = 0; k < n; k++) {
        var r = rnd() * hs, h = 0; while (r >= wHour[h]) { r -= wHour[h]; h++; }
        var mi = Math.floor(rnd() * 60), items = 1 + (rnd() < 0.3 ? 1 : 0);
        for (var it = 0; it < items; it++) {
          var q = 1 + Math.floor(rnd() * 2), price = [980, 1480, 2200][Math.floor(rnd() * 3)];
          lines.push(no + "\t2026/10/" + d + " " + h + ":" + (mi < 10 ? "0" : "") + mi + "\t見本の品" + "ABC"[Math.floor(rnd() * 3)] + "\t" + q + "\t" + q * price);
        }
        no++;
      }
    }
    return lines.join("\n") + "\n";
  }

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var VALS = ["band", "bandCustom", "ws", "tz", "amtMode", "title", "view", "meas"];
  function saveSettings() { try { var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); localStorage.setItem("juchu-jikan", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("juchu-jikan") || "{}"); VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(K.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      var s = makeSample();
      $("paste").value = s; $("hasHead").checked = true;
      $("band").value = "1"; $("from").value = "2026-10-01"; $("to").value = "2026-10-31"; $("amtMode").value = "sum"; $("view").value = "mx"; $("meas").value = "cnt";
      $("title").value = "見本 10月の受注";
      setData(K.parseCSV(s), true, "見本の受注一覧（架空）");
    };
    ["band", "ws", "tz", "amtMode", "from", "to"].forEach(function (id) { $(id).onchange = function () { saveSettings(); refresh(); }; });
    $("bandCustom").oninput = function () { saveSettings(); refresh(); };
    ["view", "meas"].forEach(function (id) { $(id).onchange = function () { saveSettings(); if (S.last) listView(); }; });
    $("title").onchange = saveSettings;
    $("pMx").onclick = printMx; $("pDays").onclick = printDays;
    $("xAll").onclick = saveX; $("cMx").onclick = function () { saveC("mx"); }; $("cDays").onclick = function () { saveC("days"); };
    refresh();
  });
})();
