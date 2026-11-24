/* 希望休の集計とシフト表の枠 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KIBOU, WD = K.WD;
  var LIMIT = window.KIBOU_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var D = null, NAME = "", R = null, DAYS = null, ST = null;
  var KEY = "kibou-kyuu-settings";
  // 名簿は名前を含むため保存しない。保存するのは数字と表題だけ
  var SET_IDS = ["capW", "capH", "capG", "capP", "capPH", "mark", "extra", "title", "by"];
  var MODE = { text: "文（1行に1人）", list: "フォームの回答・1行1件の表", matrix: "名前×日付の表" };

  function saveSettings() { try { var o = {}; SET_IDS.forEach(function (id) { o[id] = $(id).value; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
  function loadSettings() { var o = null; try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { } if (o) SET_IDS.forEach(function (id) { if (o[id] != null) $(id).value = o[id]; }); }
  function today() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); }
  function setYm(y, m) { $("ym").value = y + "-" + (m < 10 ? "0" : "") + m; }

  // ---------- 読み込み ----------
  function setSource(src, name) {
    D = K.detect(src); NAME = name || "";
    var g = K.guessMonth(D, today());
    if (g) setYm(g.y, g.m);
    else if (!$("ym").value) { var t = K.ymd(today()); setYm(t.m === 12 ? t.y + 1 : t.y, t.m === 12 ? 1 : t.m + 1); }
    if (D.mode === "matrix") { var h0 = D.L.heads[0]; $("start").value = h0.d <= 28 ? h0.d : 1; }
    $("ymNote").textContent = g ? (g.sure ? "（書かれた日付から選びました）" : "") : "（日付に月が書かれていないため、月を選んでください）";
    $("skipRow").hidden = D.mode !== "matrix";
    var n = D.mode === "text" ? D.lines.length + " 行" : (D.rows.length + " 行");
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + n + "を「" + MODE[D.mode] + "」として読みました。";
    refresh();
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
            .map(function (rr) { return rr.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (rr) { return rr.some(function (v) { return v.trim() !== ""; }); });
          setSource({ rows: rows }, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setSource({ text: d.text }, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function num(id) { var v = parseInt($(id).value, 10); return v > 0 ? v : 0; }
  function refresh() {
    saveSettings();
    ST = K.parseStaff($("staff").value);
    $("staffMsg").innerHTML = ST.list.length ? ST.list.length + " 人" + (ST.dup.length ? '　<span class="wtxt">同じ名前が2回あります：' + ST.dup.map(function (d) { return esc(d.name) + "（" + d.line + " 行目）"; }).join("、") + "</span>" : "") : "";
    var ym = $("ym").value.split("-");
    if (ym.length !== 2) { $("out").hidden = true; return; }
    DAYS = K.period({ y: +ym[0], m: +ym[1] }, +$("start").value || 1);
    $("perNote").textContent = "期間：" + K.dayLabel(DAYS[0]) + " 〜 " + K.dayLabel(DAYS[DAYS.length - 1]) + "（" + DAYS.length + " 日）";
    if (!D && !ST.list.length) { $("out").hidden = true; return; }
    var t0 = Date.now();
    var C = D ? K.collect(D, DAYS, { staff: ST.list, skipMarks: $("skipMarks").value }) : { mode: "text", entries: [], bad: [], notes: [] };
    R = K.run(C, { days: DAYS, staff: ST.list, capW: num("capW"), capH: num("capH"), capG: num("capG"), capP: num("capP"), capPH: num("capPH"), limit: LIMIT });
    $("out").hidden = false;
    var parts = [K.dayLabel(DAYS[0]) + " 〜 " + K.dayLabel(DAYS[DAYS.length - 1]), "<b>" + R.people.length + " 人</b>", "休みの希望 <b>" + R.total + "</b> 日分"];
    if (R.overDays) parts.push('<span class="bad">上限を超えた日 ' + R.overDays + " 日</span>");
    if (R.noSub) parts.push('<span class="wtxt">希望が出ていない人 ' + R.noSub + " 人</span>");
    var others = R.flags.filter(function (f) { return f.type !== "day" && f.type !== "nosub"; }).length;
    if (others) parts.push("確かめたい所 " + others + " 件");
    if (R.bad.length) parts.push('<span class="wtxt">読めなかった所 ' + R.bad.length + " 件</span>");
    R.notes.forEach(function (n) { parts.push('<span class="bad">' + esc(n) + "</span>"); });
    if (R.cut || (LIMIT < Infinity && R.all.length > LIMIT)) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを計算しています（ほか " + (R.all.length - R.people.length) + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + ' <span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    view();
  }
  function wcls(d) { var w = K.wdOf(d); return K.holName(d) || w === 0 ? "sun" : w === 6 ? "sat" : ""; }
  function offTxt(o, withNote) { return o.p.name + (o.it.pri === "must" ? "◎" : o.it.pri === "soft" ? "△" : "") + (o.it.half ? "（" + o.it.half + "）" : "") + (o.it.paid ? "（有休）" : "") + (withNote && restNote(o.it.note) && !o.it.half && !o.it.paid ? "（" + restNote(o.it.note) + "）" : "") + (withNote && o.it.memo ? "［" + o.it.memo + "］" : ""); }
  function restNote(s) { return String(s || "").replace(/◎|△|○|〇|必ず|絶対|必須|確定|できれば|出来れば|なるべく|可能なら|希望休|希望|休み|お休み|[()（）]/g, "").trim(); }
  function extraRows() { return $("extra").value.split(/[,、，]/).map(function (s) { return s.trim(); }).filter(Boolean); }

  // シフト表の枠（画面・印刷）
  function frameTable(forPrint) {
    var F = K.frameRows(R, DAYS, { mark: $("mark").value, extraRows: extraRows() }), g = F.hasG ? 1 : 0, nP = R.people.length;
    var h = '<table class="' + (forPrint ? "pf" : "fr") + '"><thead><tr><th class="nmc">氏名</th>' + (g ? '<th class="gc">職種</th>' : "");
    DAYS.forEach(function (d) { var o = K.ymd(d), hn = K.holName(d); h += '<th class="' + (R.days[DAYS.indexOf(d)].we ? "we " : "") + wcls(d) + '"' + (hn ? ' title="' + esc(hn) + '"' : "") + ">" + (o.d === 1 || d === DAYS[0] ? o.m + "/" : "") + o.d + "<br>" + WD[K.wdOf(d)] + (hn ? "<br>祝" : "") + "</th>"; });
    h += '<th class="sm">休み</th></tr></thead><tbody>';
    var body = F.rows.slice(F.headN);
    body.forEach(function (r, i) {
      var isCnt = i === nP, isExtra = i > nP;
      h += "<tr" + (isCnt ? ' class="cnt"' : "") + '><td class="nmc">' + esc(r[0]) + "</td>" + (g ? '<td class="gc">' + esc(r[1]) + "</td>" : "");
      DAYS.forEach(function (d, j) {
        var v = r[1 + g + j], row = R.days[j], cls = row.we ? "we" : "";
        if (isCnt) { if (row.over) cls += " ov"; v = v || ""; }
        else if (!isExtra && v !== "") cls += " mk";
        h += '<td class="' + cls + '">' + esc(v) + "</td>";
      });
      h += '<td class="sm">' + (isExtra ? "" : esc(r[r.length - 1])) + "</td></tr>";
    });
    return h + "</tbody></table>";
  }
  function calTable() {
    var first = DAYS[0], last = DAYS[DAYS.length - 1], s = first - K.wdOf(first), e = last + (6 - K.wdOf(last));
    var h = '<table class="cal"><thead><tr>' + WD.map(function (w, i) { return '<th class="' + (i === 0 ? "sun" : i === 6 ? "sat" : "") + '">' + w + "</th>"; }).join("") + "</tr></thead><tbody>";
    for (var d = s; d <= e; d++) {
      if (K.wdOf(d) === 0) h += "<tr>";
      if (d < first || d > last) h += '<td class="ot"></td>';
      else {
        var row = R.days[d - first], o = K.ymd(d);
        h += '<td class="' + (row.over ? "ov" : "") + '"><span class="dn ' + wcls(d) + '">' + (o.d === 1 || d === first ? o.m + "/" : "") + o.d + "</span>" + (row.hol ? ' <span class="hn">' + esc(row.hol) + "</span>" : "") +
          (row.off.length ? '<span class="ct">' + row.off.length + "人" + (row.over ? "（上限" + row.cap + "）" : "") + "</span>" : "") + '<div class="nm">' + row.off.map(function (x) { return esc(offTxt(x)); }).join("<br>") + "</div></td>";
      }
      if (K.wdOf(d) === 6) h += "</tr>";
    }
    return h + "</tbody></table>";
  }
  function dailyTable(forPrint) {
    var hasW = R.staffN > 0, hasCap = R.days.some(function (r) { return r.cap; });
    var h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>日付</th><th>祝日</th><th class="n">休みの希望</th><th class="n">うち半日</th>' + (hasW ? '<th class="n">出勤できる人</th>' : "") + (hasCap ? '<th class="n">上限</th>' : "") + "<th>名前（◎必ず・△できれば。同じ印は先に書かれた順）</th></tr></thead><tbody>";
    R.days.forEach(function (r) {
      h += "<tr" + (r.over ? ' class="fl"' : "") + '><td class="' + wcls(r.day) + '">' + K.dayLabel(r.day) + "</td><td>" + esc(r.hol) + '</td><td class="n"><b>' + (r.off.length || "") + '</b></td><td class="n">' + (r.half || "") + "</td>" +
        (hasW ? '<td class="n">' + r.work + "</td>" : "") + (hasCap ? '<td class="n">' + (r.cap || "") + "</td>" : "") + '<td class="w">' + r.off.map(function (x) { return esc(offTxt(x, true)); }).join("、") + "</td></tr>";
    });
    return h + "</tbody></table>";
  }
  function personTable(forPrint) {
    var hasG = R.people.some(function (p) { return p.group; });
    var h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>名前</th>' + (hasG ? "<th>職種</th>" : "") + '<th class="n">希望の日数</th><th class="n">うち土日祝</th><th class="n">うち半日</th><th class="n">有休</th><th class="n">◎</th><th>日付</th><th>確かめたい所</th></tr></thead><tbody>';
    R.people.forEach(function (p) {
      var st = !p.sub && !p.none && R.staffN ? "希望が出ていない" : (p.none && !p.n ? "「なし」と回答" : "");
      h += "<tr" + (p.flag.length ? ' class="fl"' : "") + "><td>" + esc(p.name) + "</td>" + (hasG ? "<td>" + esc(p.group) + "</td>" : "") + '<td class="n"><b>' + p.n + '</b></td><td class="n">' + (p.nWe || "") + '</td><td class="n">' + ((p.n - p.nFull) || "") + '</td><td class="n">' + (p.nPaid || "") + '</td><td class="n">' + (p.nMust || "") + "</td>" +
        '<td class="w">' + p.items.map(function (it) { return esc(K.md(it.day) + "(" + WD[K.wdOf(it.day)] + ")" + (it.pri === "must" ? "◎" : it.pri === "soft" ? "△" : "") + (it.half ? it.half : "") + (it.paid ? "有休" : "")); }).join(" ") + '</td><td class="w">' + esc(p.flag.concat(st ? [st] : []).join("、")) + (p.inList ? "" : (R.staffN ? "名簿にない名前" : "")) + "</td></tr>";
    });
    return h + "</tbody></table>";
  }
  var TL = { day: "上限を超えた日", group: "同じ職種が重なる日", person: "1人の上限", nosub: "希望が出ていない", name: "名前の読み方", dupl: "同じ人の書き込み", out: "期間の外", wd: "曜日の違い" };
  function flagTable(forPrint) {
    if (!R.flags.length && !R.bad.length) return '<p class="note">決めた上限に当たる所や、読めなかった所はありません。</p>';
    var h = '<table class="' + (forPrint ? "pt" : "lt") + '"><thead><tr><th>内容</th><th>説明</th></tr></thead><tbody>';
    R.flags.forEach(function (f) { h += "<tr" + (f.type === "day" || f.type === "group" ? ' class="fl"' : "") + "><td>" + esc(TL[f.type]) + '</td><td class="w">' + esc(f.text) + "</td></tr>"; });
    R.bad.forEach(function (b) { h += '<tr><td>読めなかった所</td><td class="w">' + b.line + " 行目「" + esc(b.text) + "」：" + esc(b.why) + "</td></tr>"; });
    return h + "</tbody></table>";
  }
  function view() {
    var v = $("vsel").value, h;
    if (v === "frame") h = frameTable();
    else if (v === "cal") h = calTable();
    else if (v === "daily") h = dailyTable();
    else if (v === "person") h = personTable();
    else h = flagTable();
    $("view").innerHTML = v === "cal" ? h : '<div class="scroll">' + h + "</div>";
  }

  // ---------- 印刷 ----------
  function head(sub, legend) {
    var t = $("title").value || (K.ymd(DAYS[0]).m + "月 シフト表"), by = $("by").value, caps = [];
    if (num("capW") || num("capH")) caps.push("1日に休める人数 平日" + (num("capW") || "－") + "人・土日祝" + (num("capH") || "－") + "人");
    if (num("capG")) caps.push("同じ職種 " + num("capG") + "人");
    if (num("capP")) caps.push("1人 " + num("capP") + "日まで");
    return "<h1>" + esc(t) + "　<small>" + esc(sub) + "</small></h1><p class=\"per\">" + K.dayLabel(DAYS[0]) + " 〜 " + K.dayLabel(DAYS[DAYS.length - 1]) + (by ? "　" + esc(by) : "") + (caps.length ? "　上限：" + esc(caps.join("、")) : "") + (legend ? "　" + legend : "") + "</p>";
  }
  function doPrint(html, landscape) {
    $("pageSize").textContent = "@page{size:A4 " + (landscape ? "landscape" : "portrait") + ";margin:" + (landscape ? "8mm" : "10mm") + "}";
    $("printArea").innerHTML = html;
    window.print();
  }

  // ---------- 保存 ----------
  function dl(name, blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function fd(d) { var o = K.ymd(d); return o.y + "/" + o.m + "/" + o.d; }
  function dailyRows() { var out = [["日付", "曜日", "祝日", "休みの希望（人）", "うち半日", "出勤できる人", "上限", "上限を超えた", "名前"]]; R.days.forEach(function (r) { out.push([fd(r.day), WD[r.wd], r.hol, r.off.length, r.half, r.work == null ? "" : r.work, r.cap || "", r.over ? "超えた" : "", r.off.map(function (x) { return offTxt(x, true); }).join("、")]); }); return out; }
  function personRows() { var out = [["名前", "職種", "希望の日数", "うち土日祝", "うち半日", "有休", "◎（必ず）", "日付", "確かめたい所"]]; R.people.forEach(function (p) { out.push([p.name, p.group, p.n, p.nWe, p.n - p.nFull, p.nPaid, p.nMust, p.items.map(function (it) { return K.md(it.day) + (it.pri === "must" ? "◎" : it.pri === "soft" ? "△" : "") + (it.half || "") + (it.paid ? "有休" : ""); }).join(" "), p.flag.concat(!p.sub && !p.none && R.staffN ? ["希望が出ていない"] : []).join("、")]); }); return out; }
  function flagRows() { var out = [["内容", "説明"]]; R.flags.forEach(function (f) { out.push([TL[f.type], f.text]); }); R.bad.forEach(function (b) { out.push(["読めなかった所", b.line + "行目「" + b.text + "」：" + b.why]); }); return out; }
  function recRows() {
    var out = [["日付", "曜日", "氏名", "職種", "種類", "半日", "有休", "優先", "書かれた言葉", "備考", "書かれた順"]], list = [];
    R.people.forEach(function (p) { p.items.forEach(function (it) { list.push({ p: p, it: it }); }); });
    list.sort(function (a, b) { return a.it.day - b.it.day || a.it.seq - b.it.seq; }).forEach(function (x) { out.push([fd(x.it.day), WD[K.wdOf(x.it.day)], x.p.name, x.p.group, "休み希望", x.it.half, x.it.paid ? "有休" : "", x.it.pri === "must" ? "必ず" : x.it.pri === "soft" ? "できれば" : "", x.it.note, x.it.memo || "", x.it.seq + 1]); });
    return out;
  }
  function frameSheet() {
    var F = K.frameRows(R, DAYS, { mark: $("mark").value, extraRows: extraRows() }), rows = F.rows.map(function (r) { return r.slice(); }), g = F.hasG ? 1 : 0, c0 = 1 + g, nD = DAYS.length, nP = R.people.length;
    rows[0][c0 + nD] = "休みの日数";
    var ws = XLSX.utils.aoa_to_sheet(rows), col = function (c) { return XLSX.utils.encode_col(c); }, raw = $("mark").value === "raw";
    var r1 = F.headN + 1, r2 = F.headN + nP; // Excel の行番号（1から）
    function cnt(rng) { return raw ? "COUNTA(" + rng + ")" : 'COUNTIF(' + rng + ',"希*")+COUNTIF(' + rng + ',"有*")+COUNTIF(' + rng + ',"休*")'; }
    if (nP) {
      for (var i = 0; i < nP; i++) { var rr = F.headN + i + 1; ws[col(c0 + nD) + rr] = { t: "n", v: R.people[i].n, f: cnt(col(c0) + rr + ":" + col(c0 + nD - 1) + rr) }; }
      var cr = F.headN + nP + 1;
      ws[col(0) + cr] = { t: "s", v: "休みの人数" };
      for (var j = 0; j < nD; j++) ws[col(c0 + j) + cr] = { t: "n", v: R.days[j].off.length, f: cnt(col(c0 + j) + r1 + ":" + col(c0 + j) + r2) };
      ws[col(c0 + nD) + cr] = { t: "n", v: R.total, f: "SUM(" + col(c0 + nD) + r1 + ":" + col(c0 + nD) + r2 + ")" };
    }
    ws["!cols"] = [{ wch: 14 }].concat(g ? [{ wch: 9 }] : [], DAYS.map(function () { return { wch: 7 }; }), [{ wch: 9 }]);
    ws["!freeze"] = { xSplit: c0, ySplit: F.headN };
    return ws;
  }
  function frameCSV() { var F = K.frameRows(R, DAYS, { mark: $("mark").value, extraRows: [] }); return F.rows; }
  function base() { return ($("title").value || (K.ymd(DAYS[0]).m + "月 シフト表")).replace(/[\\\/:*?"<>|]/g, "_"); }

  // ---------- 見本（架空の名前） ----------
  function sample() {
    $("staff").value = "青木 一郎,ホール\n石井 花,ホール\n上田 健,キッチン\n江藤 さくら,キッチン\n小野 大輔,ホール\n加藤 美咲,キッチン\n木村 翔,ホール\n工藤 葵,ホール";
    $("capW").value = 2; $("capH").value = 2; $("capG").value = 2; $("capP").value = 5; $("capPH").value = "";
    $("extra").value = "早番の人数, 遅番の人数";
    $("paste").value = "12月の希望休（見本・架空の名前）\n青木：3, 10, 24日\n石井さん 12/24(木) ◎、12/25\n上田 12/5 午前・12/12 午後・12/24\n江藤 12/28〜30\n小野 有休 12/18\n加藤 12/24 できれば、12/31\n青木 12/31\n木村 12/6, 12/13, 12/20, 12/27\n工藤 なし";
    $("title").value = "12月 シフト表"; $("by").value = "";
    setSource({ text: $("paste").value }, "見本");
  }

  // ---------- つなぐ ----------
  loadSettings();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var dr = $("drop");
  dr.ondragover = function (e) { e.preventDefault(); dr.classList.add("over"); };
  dr.ondragleave = function () { dr.classList.remove("over"); };
  dr.ondrop = function (e) { e.preventDefault(); dr.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setSource({ text: t }, "貼り付け"); };
  $("clearIn").onclick = function () { $("paste").value = ""; D = null; $("loadMsg").textContent = ""; refresh(); };
  $("sample").onclick = sample;
  var tm; $("staff").oninput = function () { clearTimeout(tm); tm = setTimeout(refresh, 300); };
  ["ym", "start", "capW", "capH", "capG", "capP", "capPH", "mark", "extra", "skipMarks"].forEach(function (id) { $(id).onchange = refresh; });
  ["title", "by"].forEach(function (id) { $(id).oninput = saveSettings; });
  $("vsel").onchange = view;
  $("pFrame").onclick = function () { if (R) doPrint(head("希望休入り", $("mark").value === "raw" ? "" : "印：" + ($("mark").value) + "＝休みの希望、有＝有休の希望、(前)(後)＝午前・午後") + frameTable(true), true); };
  $("pCal").onclick = function () { if (R) doPrint(head("休みの希望（カレンダー）") + calTable(), true); };
  $("pDaily").onclick = function () { if (R) doPrint(head("休みの希望　日ごと") + dailyTable(true), false); };
  $("pPerson").onclick = function () { if (R) doPrint(head("休みの希望　1人ごと") + personTable(true), false); };
  $("pFlag").onclick = function () { if (R) doPrint(head("確かめたい所") + flagTable(true), false); };
  $("xAll").onclick = function () {
    if (!R) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, frameSheet(), "シフト表");
    [["日ごと", dailyRows()], ["1人ごと", personRows()], ["確かめたい所", flagRows()], ["1行1件", recRows()]].forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s[1]), s[0]); });
    XLSX.writeFile(wb, base() + ".xlsx");
    $("saveMsg").textContent = "Excel ファイルを保存しました（シフト表・日ごと・1人ごと・確かめたい所・1行1件の5シート）。";
  };
  $("cFrame").onclick = function () { if (R) { dl(base() + "_枠.csv", new Blob([K.toCSV(frameCSV())], { type: "text/csv" })); $("saveMsg").textContent = "シフト表の枠の CSV（UTF-8・BOM 付き）を保存しました。"; } };
  $("cRec").onclick = function () { if (R) { dl(base() + "_希望休.csv", new Blob([K.toCSV(recRows())], { type: "text/csv" })); $("saveMsg").textContent = "1行1件の CSV を保存しました。"; } };
  (function () { var t = K.ymd(today()); setYm(t.m === 12 ? t.y + 1 : t.y, t.m === 12 ? 1 : t.m + 1); })();
  refresh();
})();
