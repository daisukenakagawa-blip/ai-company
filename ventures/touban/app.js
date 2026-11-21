/* 当番表の自動作成 — 画面の動き。名前・出られない日はこのブラウザの外へ送信しない */
(function () {
  "use strict";
  var E = window.Eigyo, T = window.Touban;
  var LIMIT = window.TOUBAN_LIMIT || Infinity; // お試し版は印刷・保存できる日数を制限
  var $ = function (id) { return document.getElementById(id); };
  var WD = "日月火水木金土";
  var state = { res: null, roles: [], days: [], range: null };
  var SAMPLE = "山田 花子\t火\n佐藤 一郎\t12/24〜12/26\n鈴木 美咲\n高橋 健\t月・金\n田中 ゆい\n伊藤 大輔\t12/10";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("touban-" + k)); localStorage.setItem("touban-" + k, JSON.stringify(v)); } catch (e) { return null; } }
  function iso(n) { return T.fmtDay(n, "iso"); }
  function fromIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? E.dn(+m[1], +m[2], +m[3]) : null; }

  // ---------- 初期値：来月の1か月 ----------
  (function init() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 2;
    if (m > 12) { m = 1; y++; }
    var s = E.dn(y, m, 1), e = E.dn(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
    $("start").value = iso(s); $("end").value = iso(e);
    $("title").value = m + "月の当番表";
    var keep = store("settings");
    if (keep) {
      ["roles", "title", "foot"].forEach(function (k) { if (keep[k] != null) $(k).value = keep[k]; });
      ["noConsec", "skipHol", "printCounts"].forEach(function (k) { if (keep[k] != null) $(k).checked = keep[k]; });
      if (keep.wd) for (var i = 0; i < 7; i++) $("w" + i).checked = !!keep.wd[i];
    }
  })();
  function saveSettings() {
    var wd = []; for (var i = 0; i < 7; i++) wd.push($("w" + i).checked);
    store("settings", { roles: $("roles").value, title: $("title").value, foot: $("foot").value, noConsec: $("noConsec").checked, skipHol: $("skipHol").checked, printCounts: $("printCounts").checked, wd: wd });
  }

  // ---------- 作る ----------
  function build() {
    var s = fromIso($("start").value), e = fromIso($("end").value), msg = [];
    if (s == null || e == null) { $("msg").innerHTML = '<span class="wtxt">期間の始めと終わりを入れてください。</span>'; return; }
    if (e < s) { $("msg").innerHTML = '<span class="wtxt">終わりの日が始めの日より前です。</span>'; return; }
    if (e - s > 366) { $("msg").innerHTML = '<span class="wtxt">期間は1年（366日）までにしてください。</span>'; return; }
    var range = { start: s, end: e };
    var wd = {}; for (var i = 0; i < 7; i++) if ($("w" + i).checked) wd[i] = true;
    var off = T.parseNG($("offDays").value, range);
    off.bad.forEach(function (b) { msg.push("休みの日の「" + b + "」は日付として読めませんでした"); });
    var days = T.scheduleDays({ start: s, end: e, weekdays: wd, skipHolidays: $("skipHol").checked, skipDates: off.dates });
    var pm = T.parseMembers($("members").value, range);
    msg = msg.concat(pm.warn);
    var roles = T.parseRoles($("roles").value);
    var prior = T.parsePrior($("prior").value);
    saveSettings();
    if (!pm.members.length) { $("msg").innerHTML = '<span class="wtxt">メンバーを1行に1人ずつ入れてください。</span>'; $("out").hidden = true; return; }
    if (!days.length) { $("msg").innerHTML = '<span class="wtxt">当番の日が1日もありません。曜日のチェックと休みの日を確かめてください。</span>'; $("out").hidden = true; return; }
    var res = T.assign(pm.members, roles, days, { noConsecutive: $("noConsec").checked, prior: prior });
    state = { res: res, roles: roles, days: days, range: range, members: pm.members, opt: { noConsecutive: $("noConsec").checked, prior: prior } };
    var per = roles.reduce(function (a, r) { return a + r.count; }, 0);
    var info = "当番の日 " + days.length + " 日 × " + per + " 人、メンバー " + pm.members.length + " 人。";
    var tot = res.counts.map(function (c) { return c.total; });
    info += "1人あたり " + Math.min.apply(null, tot) + "〜" + Math.max.apply(null, tot) + " 回。";
    if (Math.max.apply(null, tot) - Math.min.apply(null, tot) > 1) info += "（出られない日が多い人や、続けて入らない設定のため、回数に差が出ています。差を小さくしたいときは「続けて2日入らない」を外してください）";
    if (res.shortage) msg.unshift("出られる人が足りず、" + res.shortage + " 人分が空いています（表の「備考」に印）");
    $("msg").innerHTML = esc(info) + (msg.length ? '<ul class="wtxt">' + msg.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>" : "");
    if (LIMIT < days.length) $("msg").innerHTML += '<p class="wtxt">お試し版のため、印刷と CSV の保存は最初の ' + LIMIT + ' 日分だけです。</p>';
    draw();
    $("out").hidden = false;
  }

  function cellNames(g) { return g.length ? g.map(esc).join("・") : '<span class="empty">—</span>'; }
  function draw() {
    var res = state.res, roles = state.roles;
    var h = "<table class='lt'><thead><tr><th>日付</th><th>曜</th>" + roles.map(function (r) { return "<th>" + esc(r.name) + "</th>"; }).join("") + "<th>備考</th></tr></thead><tbody>";
    res.rows.forEach(function (row, i) {
      var t = E.ymd(row.n);
      h += "<tr" + (i >= LIMIT ? " class='over'" : "") + "><td>" + t.m + "/" + t.d + "</td><td class='w" + t.w + "'>" + WD[t.w] + "</td>" + row.roles.map(function (g) { return "<td>" + cellNames(g) + "</td>"; }).join("") + "<td class='wtxt'>" + esc(row.short.join(" ")) + "</td></tr>";
    });
    $("listView").innerHTML = h + "</tbody></table>";
    var ct = T.countTable(res, roles);
    $("countView").innerHTML = "<table class='lt'><thead><tr>" + ct[0].map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ct.slice(1).map(function (r) { return "<tr>" + r.map(function (c, j) { return "<td" + (j === r.length - 1 ? " class='dl'" : "") + ">" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }

  // お試し版では最初の LIMIT 日分だけで作り直す
  function outRes() {
    if (state.days.length <= LIMIT) return state.res;
    return T.assign(state.members, state.roles, state.days.slice(0, LIMIT), state.opt);
  }

  // ---------- 印刷 ----------
  function printList() {
    var res = outRes(), roles = state.roles, rows = res.rows;
    var h = '<div class="pl"><h1>' + esc($("title").value) + '</h1><p class="per">' + esc(T.fmtDay(rows[0].n) + " 〜 " + T.fmtDay(rows[rows.length - 1].n)) + '</p>';
    h += "<table class='pt'><thead><tr><th class='d'>日付</th><th class='w'>曜日</th>" + roles.map(function (r) { return "<th>" + esc(r.name) + "</th>"; }).join("") + "<th class='bk'>備考</th></tr></thead><tbody>";
    rows.forEach(function (row) {
      var t = E.ymd(row.n);
      h += "<tr><td>" + t.m + "月" + t.d + "日</td><td>" + WD[t.w] + "</td>" + row.roles.map(function (g) { return "<td>" + g.map(esc).join("・") + "</td>"; }).join("") + "<td>" + esc(row.short.join(" ")) + "</td></tr>";
    });
    h += "</tbody></table>";
    if ($("printCounts").checked) {
      var ct = T.countTable(res, roles);
      h += "<div class='cntw'><h2>回数</h2><table class='pt cnt'><thead><tr>" + ct[0].map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        ct.slice(1).map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    }
    if ($("foot").value.trim()) h += '<p class="ft">' + esc($("foot").value).replace(/\n/g, "<br>") + "</p>";
    doPrint(h + "</div>", "A4 portrait");
  }

  function printCal() {
    var res = outRes(), roles = state.roles, map = {};
    res.rows.forEach(function (r) { map[r.n] = r; });
    var first = res.rows[0].n, last = res.rows[res.rows.length - 1].n;
    var monStart = $("monStart").checked, h = "";
    var a = E.ymd(first), b = E.ymd(last), y = a.y, m = a.m;
    while (y < b.y || (y === b.y && m <= b.m)) {
      var d1 = E.dn(y, m, 1), dEnd = E.dn(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1;
      var off = (E.ymd(d1).w - (monStart ? 1 : 0) + 7) % 7;
      var order = monStart ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      h += '<div class="pc"><h1>' + esc($("title").value) + '<span>' + y + "年" + m + "月</span></h1><table class='ct'><thead><tr>" + order.map(function (w) { return "<th class='w" + w + "'>" + WD[w] + "</th>"; }).join("") + "</tr></thead><tbody><tr>";
      for (var k = 0; k < off; k++) h += "<td class='x'></td>";
      var col = off;
      for (var n = d1; n <= dEnd; n++) {
        var t = E.ymd(n), hol = E.holidayName(n), row = map[n];
        var inner = "<div class='dn w" + t.w + (hol ? " hol" : "") + "'>" + t.d + (hol ? "<small>" + esc(hol) + "</small>" : "") + "</div>";
        if (row) inner += row.roles.map(function (g, i) { return "<div class='nm'>" + (roles.length > 1 ? "<b>" + esc(roles[i].name) + "</b> " : "") + g.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("・") + "</div>"; }).join("");
        h += "<td" + (row ? "" : " class='nd'") + ">" + inner + "</td>";
        col++;
        if (col === 7 && n < dEnd) { h += "</tr><tr>"; col = 0; }
      }
      while (col > 0 && col < 7) { h += "<td class='x'></td>"; col++; }
      h += "</tr></tbody></table>";
      if ($("foot").value.trim()) h += '<p class="ft">' + esc($("foot").value).replace(/\n/g, "<br>") + "</p>";
      h += "</div>";
      if (++m > 12) { m = 1; y++; }
    }
    doPrint(h, "A4 landscape");
  }

  function doPrint(html, size) {
    $("printArea").innerHTML = html;
    $("pageStyle").textContent = "@media print{@page{size:" + size + ";margin:12mm}#printArea{width:" + (/landscape/.test(size) ? 272 : 185) + "mm}}";
    window.print();
  }

  // ---------- CSV ----------
  function download(rows, name) {
    var bytes = E.encodeUTF8(E.toCSV(rows, ","), true);
    var url = URL.createObjectURL(new Blob([bytes], { type: "text/csv" }));
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function csvName(k) { return ($("title").value.trim() || "当番表").replace(/[\\\/:*?"<>|]/g, "_") + k + ".csv"; }

  // ---------- 操作 ----------
  $("sample").onclick = function () { $("members").value = SAMPLE; $("roles").value = "掃除 2\n戸締まり 1"; $("offDays").value = "12/29〜12/31"; var s = fromIso($("start").value); var y = E.ymd(s).y; $("start").value = y + "-12-01"; $("end").value = y + "-12-31"; $("title").value = "12月の当番表"; build(); };
  $("shuffle").onclick = function () {
    var ls = $("members").value.split(/\r?\n/).filter(function (l) { return l.trim(); });
    for (var i = ls.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = ls[i]; ls[i] = ls[j]; ls[j] = t; }
    $("members").value = ls.join("\n"); build();
  };
  $("make").onclick = build;
  $("pList").onclick = printList;
  $("pCal").onclick = printCal;
  $("cList").onclick = function () { download(T.toTable(outRes(), state.roles), csvName("")); };
  $("cCount").onclick = function () { download(T.countTable(outRes(), state.roles), csvName("_回数")); };
  $("useCounts").onclick = function () {
    // 今回の回数（前回分を含む）を「前回までの回数」に入れて、次の期間を続きから作る
    if (!state.res) return;
    $("prior").value = state.res.counts.map(function (c) { return c.name + "," + c.withPrior; }).join("\n");
    var e = state.range.end + 1, t = E.ymd(e), last = E.dn(t.m === 12 ? t.y + 1 : t.y, t.m === 12 ? 1 : t.m + 1, 1) - 1;
    $("start").value = iso(e); $("end").value = iso(last); $("title").value = t.m + "月の当番表";
    $("priorBox").open = true; build();
    $("msg").scrollIntoView({ behavior: "smooth" });
  };
  window.TOUBAN_BUILD = build;
})();
