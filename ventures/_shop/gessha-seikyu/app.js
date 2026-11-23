/* 月謝の請求額の一覧 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var G = window.GESSHA;
  var LIMIT = window.GESSHA_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var yen = G.yen;
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: { extras: [] }, hasHead: true };
  var S = { R: null };
  var COLDEF = [["name", "名前の列"], ["course", "コースの列"], ["count", "今月の回数（任意）"], ["amount", "月謝の金額の列（任意。料金表より先に使う）"], ["family", "家族・世帯（任意。兄弟の割引に使う）"], ["join", "入会日（任意）"], ["leave", "退会日（任意）"], ["group", "組・曜日・講師（任意）"], ["discount", "割引の金額の列（任意。引く）"]];

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    T.hasHead = $("hasHead").checked;
    T.headers = T.hasHead ? rows[0].map(function (h, i) { return G.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = T.hasHead ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    prep();
    T.cols = G.guessCols(T.headers, T.rows);
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。";
    $("colBox").hidden = false;
    $("splitCourse").checked = T.cols.course != null && T.rows.some(function (r) { return /[、，＋+]/.test(G.norm(r[T.cols.course])); });
    drawCols(); refresh();
  }
  function drawCols() {
    var C = T.cols;
    $("cols").innerHTML = COLDEF.map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) { return '<option value="' + i + '"' + (C[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call($("cols").querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete C[s.dataset.k]; else C[s.dataset.k] = +s.value; drawExt(); refresh(); };
    });
    drawExt();
  }
  function usedCol(i) { return COLDEF.some(function (d) { return T.cols[d[0]] === i; }); }
  function drawExt() {
    var ex = T.cols.extras = (T.cols.extras || []).filter(function (i) { return !usedCol(i); });
    $("extl").innerHTML = T.headers.map(function (h, i) {
      if (usedCol(i)) return "";
      return '<label><input type="checkbox" data-i="' + i + '"' + (ex.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("") || '<span class="note">ほかの列はありません。</span>';
    Array.prototype.forEach.call($("extl").querySelectorAll("input"), function (c) {
      c.onchange = function () {
        var i = +c.dataset.i, a = T.cols.extras;
        if (c.checked && a.indexOf(i) < 0) a.push(i); if (!c.checked && a.indexOf(i) >= 0) a.splice(a.indexOf(i), 1);
        a.sort(function (p, q) { return p - q; }); refresh();
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
        var d = G.decodeBytes(buf);
        setData(G.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function billYM() { var v = $("bill").value, m = v.match(/^(\d{4})-(\d{2})$/); if (m) return { y: +m[1], m: +m[2] }; var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function bLabel() { var b = billYM(); return b.y + "年" + b.m + "月"; }
  function opts() {
    var jm = $("joinMode").value, jd = +$("joinDay").value || 16;
    return { cols: T.cols, bill: billYM(), fees: G.parseFees($("fees").value), splitCourse: $("splitCourse").checked, rowBase: T.hasHead ? 2 : 1, limit: LIMIT,
      sib: { mode: $("sibMode").value, amount: +$("sibAmt").value || 0, from: +$("sibFrom").value, target: $("sibTarget").value },
      join: { mode: jm, halfDay: jd, nextDay: jd, fee: +$("enroll").value || 0 }, round: { unit: +$("rUnit").value, mode: $("rMode").value } };
  }
  function condText() {
    var o = S.o, p = [bLabel() + "分"];
    if (o.sib.mode === "yen") p.push("家族の" + o.sib.from + "人目から" + yen(o.sib.amount) + "引き");
    if (o.sib.mode === "pct") p.push("家族の" + o.sib.from + "人目から" + o.sib.amount + "％引き");
    if (o.join.mode === "days") p.push("途中の入会は日割り");
    if (o.join.mode === "half") p.push(o.join.halfDay + "日以降の入会は半額");
    if (o.join.mode === "next") p.push(o.join.nextDay + "日以降の入会は翌月から");
    if (o.join.fee) p.push("入会金 " + yen(o.join.fee));
    return p.join("・");
  }
  function clearOut(msg) { S.R = null; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    $("sibUnit").textContent = $("sibMode").value === "pct" ? "％" : "円";
    $("dayL").hidden = !/half|next/.test($("joinMode").value);
    var F = G.parseFees($("fees").value);
    $("feeMsg").textContent = $("fees").value.trim() ? F.order.length + " コースを読みました" + (F.errs.length ? "（読めない行 " + F.errs.length + "）" : "") : "";
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    if (T.cols.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
    if (T.cols.course == null && T.cols.amount == null) return clearOut('<span class="bad">コースの列か、月謝の金額の列を選んでください。</span>');
    var t0 = Date.now(), o = opts(), R = G.run(T.headers, T.rows, o);
    S.R = R; S.o = o; S.F = o.fees;
    var tt = R.total, errs = R.checks.filter(function (c) { return c.lv === "e"; }).length;
    var parts = ["<b>" + esc(bLabel()) + "分</b>", "請求する人 <b>" + R.per.length + " 人</b>", "請求額の合計 <b>" + yen(tt.total) + "</b>"];
    if (tt.sib) parts.push("家族の割引 " + yen(tt.sib));
    if (tt.prorate) parts.push("途中の入会 " + yen(tt.prorate));
    if (tt.extra) parts.push("足した費用 " + yen(tt.extra));
    if (tt.disc) parts.push("割引の列 " + yen(tt.disc));
    if (tt.enroll) parts.push("入会金 " + yen(tt.enroll));
    if (R.excluded.length) parts.push("外した人 " + R.excluded.length + " 人（入会前・退会）");
    if (errs) parts.push('<span class="bad">金額を出せない所 ' + errs + " 件（0円にしています。下の一覧を確かめてください）</span>");
    else if (R.checks.length) parts.push('<span class="wtxt">確かめたい所 ' + R.checks.length + " 件</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを計算しています（ほか " + R.cut + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function sorted() {
    var a = S.R.per.slice(), s = $("sort").value;
    if (s === "group") a.sort(function (p, q) { return (p.group || "￿").localeCompare(q.group || "￿", "ja") || p.row - q.row; });
    if (s === "family") { var first = {}; a.forEach(function (p) { var k = G.key(p.family) || "#" + p.row; if (first[k] == null) first[k] = p.row; }); a.sort(function (p, q) { return first[G.key(p.family) || "#" + p.row] - first[G.key(q.family) || "#" + q.row] || p.row - q.row; }); }
    if (s === "high") a.sort(function (p, q) { return q.total - p.total || p.row - q.row; });
    return a;
  }
  function hasG() { return T.cols.group != null; }
  function hasF() { return T.cols.family != null; }
  function courseText(P) { return P.lines.map(function (L) { return (L.course || "（コースなし）") + (L.rest ? " 休み" : (L.count != null ? " " + L.count + "回" : "") + " " + yen(L.fee)) + (L.bad ? "（" + L.how + "）" : ""); }).join("、"); }
  function extText(P) { return P.extras.map(function (e) { return e.label + " " + yen(e.amount); }).join("、"); }
  function listView() {
    var R = S.R, v = $("view").value, h = "", g = hasG(), f = hasF();
    if (v === "per") {
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + (f ? "<th>家族</th>" : "") + '<th>コース</th><th class="n">月謝</th><th class="n">途中の入会</th><th class="n">家族の割引</th><th class="n">足した費用</th><th class="n">割引</th><th class="n">入会金</th><th class="n">請求額</th><th>メモ</th></tr>' +
        sorted().map(function (P) {
          var bad = P.lines.some(function (L) { return L.bad; }) || P.total < 0;
          return "<tr" + (bad ? ' class="fl"' : "") + "><td>" + esc(P.name) + "</td>" + (g ? "<td>" + esc(P.group) + "</td>" : "") + (f ? "<td>" + esc(P.family) + "</td>" : "") + '<td class="w">' + esc(courseText(P)) + '</td><td class="n">' + yen(P.base) + '</td><td class="n">' + (P.prorate ? yen(P.prorate) : "") + '</td><td class="n">' + (P.sib ? yen(P.sib) : "") + '</td><td class="n">' + (P.extraSum ? yen(P.extraSum) : "") + '</td><td class="n">' + (P.disc ? yen(-P.disc) : "") + '</td><td class="n">' + (P.enroll ? yen(P.enroll) : "") + '</td><td class="n"><b>' + yen(P.total) + '</b></td><td class="w">' + esc([P.status].concat(P.notes, P.extras.length ? [extText(P)] : []).filter(Boolean).join("・")) + "</td></tr>";
        }).join("") + '<tr><td colspan="' + (2 + (g ? 1 : 0) + (f ? 1 : 0)) + '"><b>合計 ' + R.per.length + ' 人</b></td><td class="n">' + yen(R.total.base) + '</td><td class="n">' + yen(R.total.prorate) + '</td><td class="n">' + yen(R.total.sib) + '</td><td class="n">' + yen(R.total.extra) + '</td><td class="n">' + yen(R.total.disc) + '</td><td class="n">' + yen(R.total.enroll) + '</td><td class="n"><b>' + yen(R.total.total) + "</b></td><td></td></tr></table></div>";
    } else if (v === "lines") {
      h = '<div class="scroll"><table class="lt"><tr><th>行</th><th>名前</th><th>コース</th><th class="n">回数</th><th class="n">料金</th><th>料金の決め方</th></tr>' + R.lines.map(function (L) {
        return "<tr" + (L.bad ? ' class="fl"' : "") + "><td>" + L.row + "</td><td>" + esc(L.name) + "</td><td>" + esc(L.course) + '</td><td class="n">' + (L.rest ? "休み" : L.count != null ? L.count : "") + '</td><td class="n">' + yen(L.fee) + "</td><td>" + esc(L.how) + "</td></tr>";
      }).join("") + "</table></div>";
    } else if (v === "family") {
      if (!f) h = '<p class="note">「家族・世帯」の列を選ぶと、家族ごとの合計を出します。</p>';
      else h = '<div class="scroll"><table class="lt"><tr><th>家族</th><th class="n">人数</th><th>名前（請求額）</th><th class="n">家族の割引</th><th class="n">合計</th></tr>' + R.families.map(function (F) {
        return "<tr><td>" + esc(F.name) + '</td><td class="n">' + F.members.length + '</td><td class="w">' + esc(F.members.map(function (P) { return P.name + " " + yen(P.total); }).join("、")) + '</td><td class="n">' + yen(F.members.reduce(function (a, P) { return a + P.sib; }, 0)) + '</td><td class="n"><b>' + yen(F.total) + "</b></td></tr>";
      }).join("") + "</table></div>";
    } else if (v === "course") h = courseTable("lt");
    else if (v === "group") {
      h = !g ? '<p class="note">「組・曜日・講師」の列を選ぶと、組ごとの合計を出します。</p>' : '<table class="lt"><tr><th>組</th><th class="n">人数</th><th class="n">請求額の合計</th></tr>' + R.groups.map(function (x) { return "<tr><td>" + esc(x.name || "（空欄）") + '</td><td class="n">' + x.n + '</td><td class="n">' + yen(x.total) + "</td></tr>"; }).join("") + "</table>";
    } else if (v === "ex") {
      h = !R.excluded.length ? '<p class="note">請求から外した人はいません。</p>' : '<table class="lt"><tr><th>行</th><th>名前</th><th>理由</th><th>入会日</th><th>退会日</th></tr>' + R.excluded.map(function (P) { return '<tr class="ex"><td>' + P.row + "</td><td>" + esc(P.name) + "</td><td>" + esc(P.status) + "</td><td>" + (P.join ? G.iso(P.join) : "") + "</td><td>" + (P.leave ? G.iso(P.leave) : "") + "</td></tr>"; }).join("") + "</table>";
    }
    $("listView").innerHTML = h;
  }
  function courseTable(cls) {
    var R = S.R;
    return '<table class="' + cls + '"><tr><th class="l">コース</th><th class="n">人数</th><th class="n">休み</th><th class="n">回数の合計</th><th class="n">料金の合計</th></tr>' + R.byCourse.map(function (b) {
      return '<tr><td class="l">' + esc(b.name) + '</td><td class="n">' + b.n + '</td><td class="n">' + (b.rest || "") + '</td><td class="n">' + (b.count || "") + '</td><td class="n">' + yen(b.fee) + "</td></tr>";
    }).join("") + '<tr class="fl"><td class="l">合計</td><td class="n">' + R.byCourse.reduce(function (a, b) { return a + b.n; }, 0) + '</td><td></td><td></td><td class="n">' + yen(R.total.base) + "</td></tr></table>";
  }
  function errView() {
    var R = S.R, F = S.F, h = "";
    if (R.checks.length) h += '<h3>確かめたい所（' + R.checks.length + '）</h3><div class="scroll" style="max-height:220px"><table class="lt"><tr><th>行</th><th>名前</th><th>内容</th></tr>' + R.checks.slice(0, 500).map(function (c) { return "<tr" + (c.lv === "e" ? ' class="fl"' : "") + "><td>" + c.row + "</td><td>" + esc(c.name) + '</td><td class="w">' + esc(c.why) + "</td></tr>"; }).join("") + "</table></div>";
    if (F.errs.length) h += '<h3>料金表の読めない行（' + F.errs.length + '）</h3><table class="lt">' + F.errs.map(function (e) { return "<tr><td>" + e.line + " 行目</td><td>" + esc(e.text) + '</td><td class="w">' + esc(e.why) + "</td></tr>"; }).join("") + "</table>";
    $("errView").innerHTML = h;
  }
  function feeFill() {
    if (T.cols.course == null) { $("feeMsg").textContent = "コースの列を選んでください。"; return; }
    var F = G.parseFees($("fees").value), seen = {}, add = [];
    T.rows.forEach(function (r) {
      var v = G.norm(r[T.cols.course]); if (!v) return;
      ($("splitCourse").checked ? v.split(/\s*[、，,＋+&＆]\s*/) : [v]).forEach(function (cn) { var k = G.key(cn); if (k && !F.C[k] && !seen[k]) { seen[k] = 1; add.push(cn + ", "); } });
    });
    if (!add.length) { $("feeMsg").textContent = "料金表にないコースはありません。"; return; }
    var t = $("fees").value.replace(/\s+$/, "");
    $("fees").value = (t ? t + "\n" : "") + add.join("\n");
    $("feeMsg").textContent = add.length + " コースを書き出しました。金額を書き足してください。";
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function title() { return $("title").value.trim() || bLabel() + "分 月謝"; }
  function head(sub) { return "<h1>" + esc(title()) + "　" + esc(sub) + "</h1><p class=\"per\">請求する人 " + S.R.per.length + " 人　請求額の合計 " + yen(S.R.total.total) + "　" + esc(condText()) + ($("by").value.trim() ? "　" + esc($("by").value.trim()) : "") + "</p>"; }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function printList() {
    var R = S.R, g = hasG(), f = hasF();
    var h = head("請求の一覧") + '<table class="pt"><tr><th class="l">名前</th>' + (g ? '<th class="l">組</th>' : "") + (f ? '<th class="l">家族</th>' : "") + '<th class="l">コース</th><th>月謝</th><th>割引など</th><th>足した費用</th><th>請求額</th><th class="l">受領・メモ</th></tr>' +
      sorted().map(function (P) {
        var adj = P.prorate + P.sib - P.disc;
        return '<tr><td class="l">' + esc(P.name) + "</td>" + (g ? '<td class="l">' + esc(P.group) + "</td>" : "") + (f ? '<td class="l">' + esc(P.family) + "</td>" : "") + '<td class="l w">' + esc(courseText(P)) + "</td><td>" + yen(P.base) + "</td><td>" + (adj ? yen(adj) : "") + "</td><td>" + (P.extraSum + P.enroll ? yen(P.extraSum + P.enroll) : "") + "</td><td><b>" + yen(P.total) + '</b></td><td class="l" style="width:26mm"></td></tr>';
      }).join("") + '<tr class="fl"><td class="l" colspan="' + (2 + (g ? 1 : 0) + (f ? 1 : 0)) + '">合計 ' + R.per.length + " 人</td><td>" + yen(R.total.base) + "</td><td>" + yen(R.total.prorate + R.total.sib + R.total.disc) + "</td><td>" + yen(R.total.extra + R.total.enroll) + "</td><td>" + yen(R.total.total) + "</td><td></td></tr></table>" +
      '<p class="per">割引など＝途中の入会の日割り・家族の割引・割引の列の合計。足した費用＝教材費などの列と入会金。</p>';
    if (R.excluded.length) h += "<h2>請求から外した人</h2><p class=\"per\">" + esc(R.excluded.map(function (P) { return P.name + "（" + P.status + "）"; }).join("、")) + "</p>";
    doPrint(h, "portrait");
  }
  function printCourse() { doPrint(head("コースごとの集計") + courseTable("pt"), "portrait"); }
  function slipRows(P, withName) {
    var r = P.lines.map(function (L) { return "<tr><td>" + (withName ? esc(P.name) + "　" : "") + esc(L.course || "月謝") + (L.rest ? "（お休み）" : L.count != null ? "（" + L.count + "回）" : "") + '</td><td class="r">' + yen(L.fee) + "</td></tr>"; });
    if (P.prorate) r.push("<tr><td>" + (withName ? esc(P.name) + "　" : "") + "途中のご入会（" + esc(P.notes.filter(function (n) { return /日割り|半額|翌月/.test(n); }).join("") || "調整") + '）</td><td class="r">' + yen(P.prorate) + "</td></tr>");
    if (P.sib) r.push("<tr><td>" + (withName ? esc(P.name) + "　" : "") + 'ご家族の割引</td><td class="r">' + yen(P.sib) + "</td></tr>");
    P.extras.forEach(function (e) { r.push("<tr><td>" + (withName ? esc(P.name) + "　" : "") + esc(e.label) + '</td><td class="r">' + yen(e.amount) + "</td></tr>"); });
    if (P.disc) r.push("<tr><td>" + (withName ? esc(P.name) + "　" : "") + '割引</td><td class="r">' + yen(-P.disc) + "</td></tr>");
    if (P.enroll) r.push("<tr><td>" + (withName ? esc(P.name) + "　" : "") + '入会金</td><td class="r">' + yen(P.enroll) + "</td></tr>");
    return r;
  }
  function printSlips() {
    var list = sorted(), units = [];
    if ($("slipUnit").value === "family" && hasF()) {
      var fm = {};
      list.forEach(function (P) {
        var k = G.key(P.family);
        if (!k) { units.push({ label: P.name + " 様", ps: [P] }); return; }
        if (!fm[k]) { fm[k] = { label: P.family + " 様", ps: [] }; units.push(fm[k]); }
        fm[k].ps.push(P);
      });
      units.forEach(function (u) { if (u.ps.length === 1) u.label = u.ps[0].name + " 様"; else u.label = u.ps.map(function (P) { return P.name; }).join("・") + " 様"; });
    } else units = list.map(function (P) { return { label: P.name + " 様", ps: [P] }; });
    var msg = $("msg").value.trim(), by = $("by").value.trim(), h = "";
    for (var k = 0; k < units.length; k += 8) {
      h += '<div class="pg"><div class="slips">' + units.slice(k, k + 8).map(function (u) {
        var multi = u.ps.length > 1, rows = [];
        u.ps.forEach(function (P) { rows = rows.concat(slipRows(P, multi)); });
        var more = rows.length > 10 ? rows.length - 9 : 0;
        if (more) rows = rows.slice(0, 9).concat(['<tr><td colspan="2">ほか ' + more + " 件（請求の一覧をご覧ください）</td></tr>"]);
        var sum = u.ps.reduce(function (a, P) { return a + P.total; }, 0);
        return '<div class="slip' + (rows.length > 4 ? " many" : "") + '"><div class="t">' + esc(title()) + "　ご請求のお知らせ</div>" + '<div class="nm">' + esc(u.label) + "</div><table>" + rows.join("") + "</table>" +
          '<div class="sum">合計 ' + yen(sum) + "</div>" + (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + (by ? '<div class="by">' + esc(by) + "</div>" : "") + "</div>";
      }).join("") + "</div></div>";
    }
    doPrint(h, "portrait");
  }

  // ---------- 保存 ----------
  function rowsPer() {
    var g = hasG(), f = hasF();
    return [["名前"].concat(g ? ["組"] : [], f ? ["家族"] : [], ["コース", "月謝", "途中の入会", "家族の割引", "足した費用", "割引", "入会金", "請求額", "メモ"])].concat(sorted().map(function (P) {
      return [P.name].concat(g ? [P.group] : [], f ? [P.family] : [], [courseText(P), P.base, P.prorate, P.sib, P.extraSum, -P.disc, P.enroll, P.total, [P.status].concat(P.notes, P.extras.length ? [extText(P)] : []).filter(Boolean).join("・")]);
    }));
  }
  function rowsLines() { return [["行", "名前", "コース", "回数", "料金", "料金の決め方"]].concat(S.R.lines.map(function (L) { return [L.row, L.name, L.course, L.rest ? "休み" : L.count != null ? L.count : "", L.fee, L.how]; })); }
  function rowsFam() { return [["家族", "人数", "名前", "家族の割引", "合計"]].concat(S.R.families.map(function (F) { return [F.name, F.members.length, F.members.map(function (P) { return P.name; }).join("・"), F.members.reduce(function (a, P) { return a + P.sib; }, 0), F.total]; })); }
  function rowsCourse() { return [["コース", "人数", "休み", "回数の合計", "料金の合計"]].concat(S.R.byCourse.map(function (b) { return [b.name, b.n, b.rest, b.count, b.fee]; })); }
  function rowsGroup() { return [["組", "人数", "請求額の合計"]].concat(S.R.groups.map(function (x) { return [x.name || "（空欄）", x.n, x.total]; })); }
  function rowsEx() { return [["行", "名前", "理由", "入会日", "退会日"]].concat(S.R.excluded.map(function (P) { return [P.row, P.name, P.status, P.join ? G.iso(P.join) : "", P.leave ? G.iso(P.leave) : ""]; })); }
  function rowsChk() { return [["行", "名前", "内容"]].concat(S.R.checks.map(function (c) { return [c.row, c.name, c.why]; })); }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: i === 0 ? 16 : h === "コース" || h === "メモ" ? 36 : Math.max(8, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsPer();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsLines()), "明細");
    if (hasF()) XLSX.utils.book_append_sheet(wb, sheet(rowsFam()), "家族ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsCourse()), "コースごと");
    if (hasG()) XLSX.utils.book_append_sheet(wb, sheet(rowsGroup()), "組ごと");
    if (S.R.excluded.length) XLSX.utils.book_append_sheet(wb, sheet(rowsEx()), "外した人");
    if (S.R.checks.length) XLSX.utils.book_append_sheet(wb, sheet(rowsChk()), "確かめたい所");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（料金表と決まりだけ。名前は保存しない） ----------
  var VALS = ["fees", "sibMode", "sibAmt", "sibFrom", "sibTarget", "joinMode", "joinDay", "enroll", "rUnit", "rMode", "by", "msg", "slipUnit", "sort", "view"];
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var SAMPLE = false;
  function saveSettings() { if (SAMPLE) return; var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); saveJSON("gessha-seikyu", o); }
  function loadSettings() { var o = loadJSON("gessha-seikyu") || {}; VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); }

  // ---------- 見本（架空の名前・料金） ----------
  function sample() {
    SAMPLE = true;
    var rows = [["番号", "生徒名", "コース", "回数", "家族", "曜日", "入会日", "退会日", "教材費"],
      ["1", "青木 一郎", "ピアノ30分", "4", "青木", "月", "", "", ""],
      ["1", "青木 一郎", "ソルフェージュ", "", "青木", "月", "", "", ""],
      ["2", "青木 花", "リトミック", "", "青木", "月", "", "", "550"],
      ["3", "石井 蓮", "ピアノ30分", "3", "", "火", "", "", ""],
      ["4", "上田 葵", "ピアノ45分", "4", "上田", "火", "", "", "1,200"],
      ["5", "上田 翔", "ピアノ30分", "4", "上田", "火", "", "", ""],
      ["6", "江藤 さくら", "ピアノ30分", "休会", "", "水", "", "", ""],
      ["7", "大野 結衣", "個人レッスン", "2", "", "水", "", "", ""],
      ["8", "加藤 美咲", "ピアノ30分", "4", "", "木", "2026/12/14", "", ""],
      ["9", "木村 陸", "リトミック", "", "", "木", "2027/1/9", "", ""],
      ["10", "工藤 葵", "ピアノ45分", "4", "", "金", "", "2026/11/30", ""],
      ["11", "小林 蓮", "ピアノ30分", "5", "", "金", "", "", ""],
      ["12", "佐々木 心", "ピアノ45分", "3", "", "土", "", "2026/12/19", ""],
      ["", "合計", "", "", "", "", "", "", ""]];
    $("hasHead").checked = true; $("bill").value = "2026-12";
    $("fees").value = "ピアノ30分, 4回, 8000\nピアノ30分, 3回, 6300\nピアノ45分, 4回, 11000\nピアノ45分, 3回, 8600\nソルフェージュ, 3000\nリトミック, 6000\n個人レッスン, 1回あたり, 3500";
    $("sibMode").value = "yen"; $("sibAmt").value = 1000; $("sibFrom").value = "2"; $("sibTarget").value = "cheaper";
    $("joinMode").value = "days"; $("enroll").value = 5000; $("rUnit").value = "10"; $("rMode").value = "floor";
    $("title").value = "12月分 月謝（見本）"; $("by").value = "〇〇音楽教室"; $("msg").value = "12月10日までに、月謝袋に入れてお持ちください。";
    setData(rows, "見本（架空の名前・料金）");
  }

  // ---------- 画面 ----------
  loadSettings();
  (function () { var d = new Date(); $("bill").value = d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1); })();
  $("file").onchange = function () { SAMPLE = false; if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); SAMPLE = false; if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; SAMPLE = false; setData(G.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) setData(RAW, NAME); };
  ["bill", "sibMode", "sibAmt", "sibFrom", "sibTarget", "joinMode", "joinDay", "enroll", "rUnit", "rMode", "splitCourse"].forEach(function (k) { $(k).onchange = refresh; });
  $("fees").oninput = (function () { var t; return function () { clearTimeout(t); t = setTimeout(refresh, 300); }; })();
  ["sort", "view"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  ["by", "msg", "slipUnit"].forEach(function (k) { $(k).onchange = saveSettings; });
  $("feeFill").onclick = function () { feeFill(); refresh(); };
  $("sample").onclick = sample;
  $("pList").onclick = function () { if (S.R) printList(); };
  $("pSlip").onclick = function () { if (S.R) printSlips(); };
  $("pCourse").onclick = function () { if (S.R) printCourse(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, G.toCSV(r)); done(n, r.length - 1); };
  $("cLines").onclick = function () { if (!S.R) return; var r = rowsLines(), n = fname("csv", "明細"); dl(n, G.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
  refresh();
})();
