/* 会費・月謝の納入状況の一覧 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KAIHI;
  var LIMIT = window.KAIHI_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], wide: {}, long: {}, hasHead: true };
  var S = { R: null, M: null, pmf: {} };
  var CATL = [["P", "納入済み"], ["A", "未納"], ["X", "対象外（免除・休会など）"]];
  var SHOWMK = { F: "○", H: "一部", A: "×", X: "－", N: "", U: "?" };
  var MKNAME = { F: "納入済み", H: "一部", A: "未納", X: "対象外", N: "数えない", U: "読めない" };
  var yen = K.yen;

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    if ($("trans").checked) rows = K.transpose(rows);
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    T.hasHead = $("hasHead").checked;
    T.headers = T.hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = T.hasHead ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    analyze(true);
  }
  function analyze(reguess) {
    prep();
    if (reguess) {
      $("shape").value = K.guessShape(T.headers, T.rows);
      T.wide = K.guessWide(T.headers, T.rows);
      T.long = K.guessLong(T.headers, T.rows);
      S.range = null;
    }
    $("loadMsg").innerHTML = esc((NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。");
    $("shapeBox").hidden = false;
    drawCols();
    refresh();
  }
  function opt(i, sel) { return '<option value="' + i + '"' + (sel ? " selected" : "") + ">" + esc(T.headers[i]) + "</option>"; }
  function drawCols() {
    var wide = $("shape").value === "wide", el = $("cols");
    var defs = wide ? [["name", "名前の列"], ["group", "組・学年・地区（任意）"], ["due", "月額の列（人によって会費が違うとき）"]]
      : [["month", "何月分の列"], ["name", "名前の列"], ["pay", "金額・済の列（なければ記録＝納入済み）"], ["group", "組・学年・地区（任意）"]];
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
    var ss = T.wide.months || [];
    $("sesl").innerHTML = T.headers.map(function (h, i) {
      if (i === T.wide.name || i === T.wide.group || i === T.wide.due) return "";
      return '<label><input type="checkbox" data-i="' + i + '"' + (ss.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("");
    $("sesN").textContent = "（" + ss.length + " か月を選択中）";
    Array.prototype.forEach.call($("sesl").querySelectorAll("input"), function (c) {
      c.onchange = function () {
        var i = +c.dataset.i, a = T.wide.months;
        if (c.checked && a.indexOf(i) < 0) a.push(i); if (!c.checked && a.indexOf(i) >= 0) a.splice(a.indexOf(i), 1);
        a.sort(function (p, q) { return p - q; });
        $("sesN").textContent = "（" + a.length + " か月を選択中）"; refresh();
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
    var saved = loadJSON("kaihi-nounyu-map");
    $("maps").innerHTML = CATL.map(function (c) {
      return '<label for="m' + c[0] + '">' + c[1] + '</label><input type="text" id="m' + c[0] + '" value="' + esc(saved && saved[c[0]] != null ? saved[c[0]] : K.DEFAULT_MAP[c[0]]) + '">';
    }).join("") + '<span></span><div><button class="sub" id="mReset">記号を初めの設定に戻す</button></div>';
    CATL.forEach(function (c) { $("m" + c[0]).onchange = function () { saveJSON("kaihi-nounyu-map", mapSpec()); refresh(); }; });
    $("mReset").onclick = function () { CATL.forEach(function (c) { $("m" + c[0]).value = K.DEFAULT_MAP[c[0]]; }); saveJSON("kaihi-nounyu-map", null); refresh(); };
  }
  function mapSpec() { var o = {}; CATL.forEach(function (c) { o[c[0]] = $("m" + c[0]).value; }); return o; }
  function curMap() { return K.makeMap(mapSpec()); }

  // ---------- 月の範囲・月ごとの会費 ----------
  function drawRange(M) {
    var mks = M.months.filter(function (m) { return m.mk != null; }).map(function (m) { return m.mk; });
    var key = mks.join(",");
    if (S.rangeKey === key) return;
    S.rangeKey = key;
    var o = mks.map(function (mk) { return '<option value="' + mk + '">' + esc(K.mLabel(mk)) + "分</option>"; }).join("");
    $("fromM").innerHTML = o; $("toM").innerHTML = o;
    if (mks.length) { $("fromM").value = mks[0]; $("toM").value = mks[mks.length - 1]; }
    $("fromM").disabled = $("toM").disabled = !mks.length;
    $("pmf").innerHTML = mks.map(function (mk) { return '<label for="pf' + mk + '">' + esc(K.mLabel(mk)) + '</label><div><input type="number" id="pf' + mk + '" data-mk="' + mk + '" min="0" step="100" style="width:110px" value="' + (S.pmf[mk] != null ? S.pmf[mk] : "") + '"> 円</div>'; }).join("") || '<span class="note">月の分かる列がありません。</span>';
    Array.prototype.forEach.call($("pmf").querySelectorAll("input"), function (inp) {
      inp.onchange = function () { var v = inp.value.trim(); if (v === "") delete S.pmf[inp.dataset.mk]; else S.pmf[inp.dataset.mk] = +v; refresh(); };
    });
  }

  // ---------- 計算 ----------
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
      if (!T.wide.months || !T.wide.months.length) return clearOut('<span class="bad">月の列を選んでください。</span>');
      M = K.buildWide(T.headers, T.rows, T.wide, { year: yr, rowBase: base });
    } else {
      if (T.long.month == null || T.long.name == null) return clearOut('<span class="bad">何月分の列と、名前の列を選んでください。</span>');
      M = K.buildLong(T.headers, T.rows, T.long, { year: yr, rowBase: base, roster: $("roster").value });
    }
    drawRange(M);
    var o = { map: curMap(), fee: +$("fee").value || 0, blank: $("blank").value, limit: LIMIT, perMonthFee: S.pmf,
      fromMk: $("fromM").value === "" ? null : +$("fromM").value, toMk: $("toM").value === "" ? null : +$("toM").value };
    if (o.fromMk != null && o.toMk != null && o.fromMk > o.toMk) { var t = o.fromMk; o.fromMk = o.toMk; o.toMk = t; }
    var R = K.run(M, o);
    S.R = R; S.M = M; S.o = o;
    if (!R.months.length) return clearOut('<span class="bad">数える月がありません（数える月・月の列を確かめてください）。</span>');
    var T2 = R.total, money = o.fee > 0 || R.per.some(function (r) { return r.due != null; });
    S.money = money;
    var parts = ["<b>" + R.per.length + " 人</b>", "<b>" + R.months.length + " か月</b>（" + esc(R.months[0].label) + "〜" + esc(R.months[R.months.length - 1].label) + "）"];
    parts.push("納入済み <b>" + T2.F + "／" + T2.target + "</b>（" + K.pct(T2.rate) + "）");
    if (money) parts.push("集まった額 <b>" + yen(T2.paid) + "</b>");
    parts.push(T2.unpaidPeople ? '<span class="bad">未納のある人 ' + T2.unpaidPeople + " 人・" + R.lines.length + " 件" + (money ? "・未納額 " + yen(T2.short) : "") + "</span>" : "<b>未納はありません</b>");
    if (T2.over > 0) parts.push('<span class="wtxt">会費より多い額 ' + yen(T2.over) + "</span>");
    if (R.outside) parts.push("範囲外の月 " + R.outside);
    if (R.unknown.length) parts.push('<span class="wtxt">読めないマス ' + R.unknown.length + "（数えていません）</span>");
    if (M.dup.length) parts.push('<span class="wtxt">同じ名前の行 ' + M.dup.length + "（最初の行だけ使います）</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを数えています（ほか " + R.cut + " 人）</span>");
    if (M.missingIsBlank) parts.push('<span class="note">記録のない月は空欄として扱っています</span>');
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function condText() {
    var o = S.o, pm = Object.keys(o.perMonthFee || {}).length;
    return "会費：" + (o.fee > 0 ? yen(o.fee) + "／月" : "金額なし（月の数だけ）") + (T.wide.due != null && $("shape").value === "wide" ? "（月額の列がある人はその額）" : "") + (pm ? "・月ごとの額 " + pm + " か月" : "") +
      "　空欄：" + (o.blank === "skip" ? "数えない" : "未納");
  }
  function sorted() {
    var a = S.R.per.map(function (r, i) { r._i = i; return r; }).slice(), m = $("sort").value;
    if ($("onlyUnpaid").checked) a = a.filter(function (r) { return r.unpaid.length; });
    if (m === "short") a.sort(function (p, q) { return q.short - p.short || q.unpaid.length - p.unpaid.length || p._i - q._i; });
    else if (m === "group") { var go = {}; S.R.groups.forEach(function (g, i) { go[g.name] = i; }); a.sort(function (p, q) { return go[p.group || ""] - go[q.group || ""] || p._i - q._i; }); }
    else if (m === "kana") a.sort(function (p, q) { return p.name.localeCompare(q.name, "ja") || p._i - q._i; });
    return a;
  }
  function hasGroup() { return S.R.per.some(function (r) { return r.group; }); }
  function hasDue() { return S.R.per.some(function (r) { return r.due != null; }); }
  function bar(r) { return r == null ? "" : '<span class="bar" style="width:' + Math.round(r * 60) + 'px"></span>'; }
  function unpaidText(r) {
    return r.unpaid.map(function (u) { return (u.mk != null ? mName(u.mk) : u.label) + (u.s === "H" && S.money ? "（不足 " + yen(u.short) + "）" : ""); }).join("、");
  }
  function cellMk(e) { return e.s === "F" && e.over > 0 ? "○+" : SHOWMK[e.s]; }
  function cellTitle(e) { return MKNAME[e.s] + (S.money && (e.s === "F" || e.s === "H") ? " " + yen(e.paid) : "") + (e.s === "H" && S.money ? "（不足 " + yen(e.short) + "）" : "") + (e.over > 0 ? "（会費より " + yen(e.over) + " 多い）" : ""); }
  function spanYear() { var a = S.R.months.filter(function (m) { return m.mk != null; }); return a.length && a[a.length - 1].mk - a[0].mk >= 12; }
  function mName(mk) { return spanYear() ? K.mLabel(mk) : K.mShort(mk); }
  function shortM(m) { return m.mk != null ? (spanYear() ? String(K.ymOf(m.mk).y).slice(2) + "/" + K.ymOf(m.mk).m : K.mShort(m.mk)) : m.label; }

  // ---------- 表示 ----------
  function listView() {
    var R = S.R, v = $("view").value, g = hasGroup(), d = hasDue(), mo = S.money, h = "";
    $("sortL").hidden = !(v === "per" || v === "grid");
    if (v === "per") {
      var list = sorted();
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + (d ? '<th class="n">月額</th>' : "") + '<th class="n">納入済み</th><th class="n">一部</th><th class="n">未納</th><th class="n">対象外</th>' + (mo ? '<th class="n">納めた額</th><th class="n">未納額</th>' : "") + "<th>未納の月</th></tr>";
      h += list.map(function (r) {
        return "<tr" + (r.unpaid.length ? ' class="fl"' : "") + "><td>" + esc(r.name) + "</td>" + (g ? "<td>" + esc(r.group) + "</td>" : "") + (d ? '<td class="n">' + (r.due != null ? yen(r.due) : "") + "</td>" : "") + '<td class="n">' + r.c.F + '</td><td class="n">' + r.c.H + '</td><td class="n">' + r.c.A + '</td><td class="n">' + r.c.X + "</td>" + (mo ? '<td class="n">' + yen(r.paid) + '</td><td class="n">' + (r.short ? "<b>" + yen(r.short) + "</b>" : "0円") + "</td>" : "") + "<td>" + esc(unpaidText(r)) + "</td></tr>";
      }).join("") + "</table></div>";
    } else if (v === "lines") {
      if (!R.lines.length) { $("listView").innerHTML = '<p class="note">未納はありません。</p>'; return; }
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + "<th>月</th><th>状態</th>" + (mo ? '<th class="n">納めた額</th><th class="n">未納額</th>' : "") + "</tr>";
      h += R.lines.map(function (l) { return "<tr><td>" + esc(l.name) + "</td>" + (g ? "<td>" + esc(l.group) + "</td>" : "") + "<td>" + esc(l.label) + "</td><td>" + MKNAME[l.s] + "</td>" + (mo ? '<td class="n">' + yen(l.paid) + '</td><td class="n">' + yen(l.short) + "</td>" : "") + "</tr>"; }).join("") + "</table></div>";
    } else if (v === "grid") {
      var list2 = sorted();
      h = '<div class="scroll"><table class="lt"><tr><th>名前</th>' + R.months.map(function (m) { return '<th class="n">' + esc(shortM(m)) + "</th>"; }).join("") + (mo ? '<th class="n">未納額</th>' : '<th class="n">未納</th>') + "</tr>";
      h += list2.map(function (r) { return "<tr" + (r.unpaid.length ? ' class="fl"' : "") + "><td>" + esc(r.name) + "</td>" + r.cells.map(function (e) { return '<td class="mk ' + e.s + '" title="' + esc(cellTitle(e)) + '">' + cellMk(e) + "</td>"; }).join("") + '<td class="n">' + (mo ? yen(r.short) : r.unpaid.length) + "</td></tr>"; }).join("");
      h += "<tr><td><b>納入済み</b></td>" + R.byMonth.map(function (x) { return '<td class="mk"><b>' + x.F + "</b></td>"; }).join("") + '<td class="n"><b>' + (mo ? yen(R.total.short) : R.lines.length) + "</b></td></tr></table></div>";
      h += '<p class="note">○納入済み　○+＝会費より多い　一部＝会費に足りない　×未納　－対象外（免除・休会など）　空欄＝数えない　?＝読めないマス。マスにマウスを置くと金額を表示します。</p>';
    } else if (v === "month") {
      h = '<div class="scroll"><table class="lt"><tr><th>月</th><th class="n">対象の人数</th><th class="n">納入済み</th><th class="n">一部</th><th class="n">未納</th><th class="n">対象外</th><th>納入率</th>' + (mo ? '<th class="n">集まった額</th><th class="n">未納額</th>' : "") + "</tr>";
      h += R.byMonth.map(function (x) { return "<tr><td>" + esc(x.label) + '</td><td class="n">' + x.target + '</td><td class="n">' + x.F + '</td><td class="n">' + x.H + '</td><td class="n">' + x.A + '</td><td class="n">' + x.X + '</td><td class="n">' + K.pct(x.rate) + bar(x.rate) + "</td>" + (mo ? '<td class="n">' + yen(x.paid) + '</td><td class="n">' + yen(x.short) + "</td>" : "") + "</tr>"; }).join("");
      h += '<tr><td><b>合計</b></td><td class="n"><b>' + R.total.target + '</b></td><td class="n"><b>' + R.total.F + '</b></td><td></td><td></td><td></td><td class="n"><b>' + K.pct(R.total.rate) + "</b></td>" + (mo ? '<td class="n"><b>' + yen(R.total.paid) + '</b></td><td class="n"><b>' + yen(R.total.short) + "</b></td>" : "") + "</tr></table></div>";
      h += '<p class="note">納入率＝納入済み ÷（納入済み＋一部＋未納）。対象外と数えない月は入れません。</p>';
    } else if (v === "group") {
      h = '<div class="scroll"><table class="lt"><tr><th>組</th><th class="n">人数</th><th class="n">未納のある人</th><th>納入率</th>' + (mo ? '<th class="n">集まった額</th><th class="n">未納額</th>' : "") + "</tr>";
      h += R.groups.map(function (G) { return "<tr><td>" + esc(G.name || "（組なし）") + '</td><td class="n">' + G.n + '</td><td class="n">' + G.unpaidPeople + '</td><td class="n">' + K.pct(G.rate) + bar(G.rate) + "</td>" + (mo ? '<td class="n">' + yen(G.paid) + '</td><td class="n">' + yen(G.short) + "</td>" : "") + "</tr>"; }).join("") + "</table></div>";
      if (!g) h += '<p class="note">組・学年・地区の列を選ぶと、組ごとに分けて出します。</p>';
    }
    $("listView").innerHTML = h;
  }
  function colLetter(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function rowRef(n) { if (n == null || n === "") return ""; return $("trans").checked ? colLetter(n - 1) + " 列" : n + " 行"; }
  function errView() {
    var R = S.R, M = S.M, h = "";
    if (R.unknown.length) {
      h += "<h3>読めないマス（" + R.unknown.length + "）</h3><p class=\"note\">記号の欄に書き足すと数えられます。</p><div class=\"scroll\" style=\"max-height:220px\"><table class=\"lt\"><tr><th>場所</th><th>名前</th><th>月</th><th>書かれていた内容</th></tr>" +
        R.unknown.slice(0, 300).map(function (u) { return "<tr><td>" + rowRef(u.row) + "</td><td>" + esc(u.name) + "</td><td>" + esc(u.month) + "</td><td>" + esc(u.value) + "</td></tr>"; }).join("") + "</table></div>";
    }
    var other = M.skipped.concat(M.dup.map(function (d) { return { row: d.row, why: "「" + d.name + "」は " + rowRef(d.first) + "目と同じ名前（最初の行を使います）" }; }));
    var dm = M.months.filter(function (m) { return m.dupOf != null; });
    dm.forEach(function (m) { other.push({ row: "", why: "「" + T.headers[m.col] + "」の列は " + m.label + " がほかの列と重なっています（両方を数えます。どちらかの列を外してください）" }); });
    if (other.length) h += "<h3>使わなかった行・注意（" + other.length + "）</h3><div class=\"scroll\" style=\"max-height:180px\"><table class=\"lt\"><tr><th>場所</th><th>内容</th></tr>" + other.slice(0, 300).map(function (x) { return "<tr><td>" + rowRef(x.row) + "</td><td>" + esc(x.why) + "</td></tr>"; }).join("") + "</table></div>";
    $("errView").innerHTML = h;
  }

  // ---------- 印刷 ----------
  function setPage(s) { $("pageSize").textContent = "@page{size:A4 " + s + ";margin:10mm}"; }
  function title() { return $("title").value.trim() || "会費の納入状況"; }
  function head(sub) {
    var R = S.R;
    return "<h1>" + esc(title()) + "　" + esc(sub) + "</h1><p class=\"per\">" + R.per.length + " 人・" + esc(R.months[0].label) + "〜" + esc(R.months[R.months.length - 1].label) + "（" + R.months.length + " か月）　納入済み " + R.total.F + "／" + R.total.target + "（" + K.pct(R.total.rate) + "）" +
      (S.money ? "　集まった額 " + yen(R.total.paid) + "　未納額 " + yen(R.total.short) : "") + "　" + esc(condText()) + "</p>";
  }
  function doPrint(html, orient) { setPage(orient); $("printArea").innerHTML = html; window.print(); }
  function printPer() {
    var R = S.R, g = hasGroup(), mo = S.money;
    var list = sorted().filter(function (r) { return r.unpaid.length; });
    var h = head("未納の一覧");
    if (!list.length) h += "<p>未納はありません。</p>";
    else {
      h += "<h2>未納のある人（" + list.length + " 人・" + list.reduce(function (a, r) { return a + r.unpaid.length; }, 0) + " 件）</h2><table class=\"pt\"><tr><th class=\"l\">名前</th>" + (g ? '<th class="l">組</th>' : "") + "<th>未納</th><th>一部</th>" + (mo ? "<th>未納額</th>" : "") + '<th class="l">未納の月</th><th class="l">確認・メモ</th></tr>' +
        list.map(function (r) { return '<tr><td class="l">' + esc(r.name) + "</td>" + (g ? '<td class="l">' + esc(r.group) + "</td>" : "") + "<td>" + r.c.A + "</td><td>" + r.c.H + "</td>" + (mo ? "<td>" + yen(r.short) + "</td>" : "") + '<td class="l w">' + esc(unpaidText(r)) + '</td><td class="l" style="width:28mm"></td></tr>'; }).join("") + "</table>";
    }
    h += "<h2>月ごと</h2>" + monthTable();
    if (g) h += "<h2>組ごと</h2><table class=\"pt\"><tr><th class=\"l\">組</th><th>人数</th><th>未納のある人</th><th>納入率</th>" + (mo ? "<th>集まった額</th><th>未納額</th>" : "") + "</tr>" + R.groups.map(function (G) { return '<tr><td class="l">' + esc(G.name || "（組なし）") + "</td><td>" + G.n + "</td><td>" + G.unpaidPeople + "</td><td>" + K.pct(G.rate) + "</td>" + (mo ? "<td>" + yen(G.paid) + "</td><td>" + yen(G.short) + "</td>" : "") + "</tr>"; }).join("") + "</table>";
    doPrint(h, "portrait");
  }
  function monthTable() {
    var R = S.R, mo = S.money;
    return '<table class="pt"><tr><th class="l">月</th><th>対象の人数</th><th>納入済み</th><th>一部</th><th>未納</th><th>対象外</th><th>納入率</th>' + (mo ? "<th>集まった額</th><th>未納額</th>" : "") + "</tr>" +
      R.byMonth.map(function (x) { return '<tr><td class="l">' + esc(x.label) + "</td><td>" + x.target + "</td><td>" + x.F + "</td><td>" + x.H + "</td><td>" + x.A + "</td><td>" + x.X + "</td><td>" + K.pct(x.rate) + "</td>" + (mo ? "<td>" + yen(x.paid) + "</td><td>" + yen(x.short) + "</td>" : "") + "</tr>"; }).join("") +
      '<tr class="fl"><td class="l">合計</td><td>' + R.total.target + "</td><td>" + R.total.F + "</td><td></td><td></td><td></td><td>" + K.pct(R.total.rate) + "</td>" + (mo ? "<td>" + yen(R.total.paid) + "</td><td>" + yen(R.total.short) + "</td>" : "") + "</tr></table>";
  }
  function printMonth() { doPrint(head("月ごとの集金額") + monthTable(), "portrait"); }
  function printGrid() {
    var R = S.R, list = sorted(), per = 18, h = "", mo = S.money;
    for (var k = 0; k < R.months.length; k += per) {
      var ks = []; for (var j = k; j < Math.min(k + per, R.months.length); j++) ks.push(j);
      h += '<div class="pg">' + head("納入状況の表" + (R.months.length > per ? "（" + (k + 1) + "〜" + (k + ks.length) + " か月目）" : "")) +
        '<table class="pt small"><tr><th class="l">名前</th>' + ks.map(function (j) { return "<th>" + esc(shortM(R.months[j])) + "</th>"; }).join("") + "<th>" + (mo ? "未納額" : "未納") + "</th></tr>" +
        list.map(function (r) { return "<tr" + (r.unpaid.length ? ' class="fl"' : "") + '><td class="l">' + esc(r.name) + "</td>" + ks.map(function (j) { var e = r.cells[j]; return '<td class="mk">' + (mo && e.s === "H" ? "一部" + yen(e.paid).replace("円", "") : cellMk(e)) + "</td>"; }).join("") + "<td>" + (mo ? yen(r.short) : r.unpaid.length) + "</td></tr>"; }).join("") +
        '<tr><td class="l"><b>納入済み</b></td>' + ks.map(function (j) { return '<td class="mk"><b>' + R.byMonth[j].F + "</b></td>"; }).join("") + "<td>" + (mo ? yen(R.total.short) : R.lines.length) + "</td></tr></table>" +
        '<p class="per">○納入済み　○+＝会費より多い　一部＝会費に足りない（数字は納めた額）　×未納　－対象外　空欄＝数えない　?＝読めないマス</p></div>';
    }
    doPrint(h, "landscape");
  }
  function printSlips() {
    var R = S.R, mo = S.money, list = sorted().filter(function (r) { return r.unpaid.length; });
    if (!list.length) { alert("未納のある人はいません。"); return; }
    var msg = $("msg").value.trim(), by = $("by").value.trim(), h = "";
    for (var k = 0; k < list.length; k += 8) {
      h += '<div class="pg"><div class="slips">' + list.slice(k, k + 8).map(function (r) {
        var rows = r.unpaid.slice(0, 12).map(function (u) { return "<tr><td>" + esc(u.label) + "分</td><td>" + (u.s === "H" ? "一部" : "未納") + '</td><td class="r">' + (mo ? yen(u.short) : "") + "</td></tr>"; }).join("");
        if (r.unpaid.length > 12) rows += '<tr><td colspan="3">ほか ' + (r.unpaid.length - 12) + " か月</td></tr>";
        return '<div class="slip"><div class="t">' + esc(title()) + "　納入状況のお知らせ</div>" +
          '<div class="nm">' + esc(r.name) + " 様" + (r.group ? '<span style="font-size:9pt;font-weight:400">（' + esc(r.group) + "）</span>" : "") + "</div>" +
          "<table>" + rows + "</table>" + (mo ? '<div class="sum">合計 ' + yen(r.short) + "</div>" : "") +
          (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + (by ? '<div class="by">' + esc(by) + "</div>" : "") + "</div>";
      }).join("") + "</div></div>";
    }
    doPrint(h, "portrait");
  }

  // ---------- 保存 ----------
  function rowsPer() {
    var g = hasGroup(), d = hasDue(), mo = S.money;
    return [["名前"].concat(g ? ["組"] : [], d ? ["月額"] : [], ["納入済み", "一部", "未納", "対象外", "数えない", "読めない"], mo ? ["納めるべき額", "納めた額", "未納額", "多い額"] : [], ["未納の月"])].concat(sorted().map(function (r) {
      return [r.name].concat(g ? [r.group] : [], d ? [r.due != null ? r.due : ""] : [], [r.c.F, r.c.H, r.c.A, r.c.X, r.c.N, r.c.U], mo ? [r.dueSum, r.paid, r.short, r.over] : [], [unpaidText(r)]);
    }));
  }
  function rowsLines() {
    var g = hasGroup(), mo = S.money;
    return [["名前"].concat(g ? ["組"] : [], ["月", "状態"], mo ? ["納めた額", "未納額"] : [])].concat(S.R.lines.map(function (l) {
      return [l.name].concat(g ? [l.group] : [], [l.mk != null ? K.mIso(l.mk) : l.label, MKNAME[l.s]], mo ? [l.paid, l.short] : []);
    }));
  }
  function rowsMonth() {
    var mo = S.money;
    return [["月", "対象の人数", "納入済み", "一部", "未納", "対象外", "数えない", "納入率(%)"].concat(mo ? ["集まった額", "未納額"] : [])].concat(S.R.byMonth.map(function (x) {
      return [x.mk != null ? K.mIso(x.mk) : x.label, x.target, x.F, x.H, x.A, x.X, x.N, K.rate100(x.rate)].concat(mo ? [x.paid, x.short] : []);
    }));
  }
  function rowsGroup() { var mo = S.money; return [["組", "人数", "未納のある人", "納入率(%)"].concat(mo ? ["集まった額", "未納額"] : [])].concat(S.R.groups.map(function (G) { return [G.name || "（組なし）", G.n, G.unpaidPeople, K.rate100(G.rate)].concat(mo ? [G.paid, G.short] : []); })); }
  function rowsGrid() {
    var R = S.R, mo = S.money;
    return [["名前"].concat(R.months.map(function (m) { return m.mk != null ? K.mIso(m.mk) : m.label; }), [mo ? "未納額" : "未納"])].concat(sorted().map(function (r) {
      return [r.name].concat(r.cells.map(function (e) { return e.s === "F" || e.s === "H" ? (mo ? e.paid : MKNAME[e.s]) : MKNAME[e.s]; }), [mo ? r.short : r.unpaid.length]);
    }));
  }
  function rowsUnknown() { return [["場所", "名前", "月", "書かれていた内容"]].concat(S.R.unknown.map(function (u) { return [rowRef(u.row), u.name, u.month, u.value]; })); }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: i === 0 ? 16 : Math.max(7, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsPer();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsLines()), "未納の一覧");
    XLSX.utils.book_append_sheet(wb, sheet(rowsMonth()), "月ごと");
    if (hasGroup()) XLSX.utils.book_append_sheet(wb, sheet(rowsGroup()), "組ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsGrid()), "納入状況の表");
    if (S.R.unknown.length) XLSX.utils.book_append_sheet(wb, sheet(rowsUnknown()), "読めないマス");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（名前・金額は保存しない） ----------
  var VALS = ["fee", "blank", "sort", "view"];
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function saveSettings() { var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); saveJSON("kaihi-nounyu", o); }
  function loadSettings() { var o = loadJSON("kaihi-nounyu") || {}; VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); }

  // ---------- 見本（架空の名前・金額） ----------
  function sample() {
    var names = [["青木 一郎", "1班"], ["石井 花子", "1班"], ["上田 健", "1班"], ["江藤 さくら", "1班"], ["大野 翔", "2班"], ["加藤 美咲", "2班"], ["木村 陸", "2班"], ["工藤 葵", "2班"], ["小林 蓮", "3班"], ["佐々木 結衣", "3班"], ["清水 大和", "3班"], ["高橋 心", "3班"]];
    var mons = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月"];
    var pat = [
      ["済", "済", "済", "済", "済", "済", "済", ""],
      ["○", "○", "○", "○", "○", "○", "", ""],
      ["済", "", "", "1500", "済", "", "", ""],
      ["3000", "3,000", "3000", "3000", "3000", "3000", "3000", "3000"],
      ["済", "済", "免除", "免除", "済", "済", "済", "済"],
      ["4/12", "5/10", "6/14", "7/12", "8/9", "9/13", "10/11", ""],
      ["済", "済", "済", "済", "済", "済", "済", "済"],
      ["入会前", "入会前", "済", "済", "済", "済", "未", "未"],
      ["済", "済", "済", "済", "6000", "", "済", ""],
      ["済", "済", "済", "済", "済", "済", "済", "済"],
      ["済", "済", "済", "休会", "休会", "休会", "済", "済"],
      ["済", "済", "済", "済", "済", "済", "済", "済？"]];
    var rows = [["番号", "氏名", "班"].concat(mons, ["備考"])];
    names.forEach(function (n, i) { rows.push([String(i + 1), n[0], n[1]].concat(pat[i], [""])); });
    rows.push(["", "合計", ""].concat(mons.map(function () { return ""; }), [""]));
    $("trans").checked = false; $("hasHead").checked = true;
    $("year").value = 2026; $("fee").value = 3000; $("blank").value = "unpaid";
    $("title").value = "2026年度 少年団の会費（見本）"; $("by").value = "会計係"; S.pmf = {};
    setData(rows, "見本（架空の名前・4月〜11月分・月3,000円）");
  }

  // ---------- 画面 ----------
  drawMaps(); loadSettings();
  $("year").value = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) analyze(true); };
  $("trans").onchange = function () { if (RAW) analyze(true); };
  $("shape").onchange = function () { drawCols(); refresh(); };
  $("year").onchange = function () { S.rangeKey = null; refresh(); };
  $("roster").onchange = refresh;
  $("sesAll").onclick = function () { T.wide.months = T.headers.map(function (_, i) { return i; }).filter(function (i) { return i !== T.wide.name && i !== T.wide.group && i !== T.wide.due; }); drawSes(); refresh(); };
  $("sesNone").onclick = function () { T.wide.months = []; drawSes(); refresh(); };
  ["fee", "blank", "fromM", "toM"].forEach(function (k) { $(k).onchange = refresh; });
  ["sort", "view", "onlyUnpaid"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  $("sample").onclick = sample;
  $("pPer").onclick = function () { if (S.R) printPer(); };
  $("pSlip").onclick = function () { if (S.R) printSlips(); };
  $("pGrid").onclick = function () { if (S.R) printGrid(); };
  $("pMonth").onclick = function () { if (S.R) printMonth(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  $("cLines").onclick = function () { if (!S.R) return; var r = rowsLines(), n = fname("csv", "未納の一覧"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
})();
