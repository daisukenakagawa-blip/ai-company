/* 総当たりの対戦表づくり — 画面・印刷・CSV。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var T = window.TAISEN;
  var LIMIT = window.TAISEN_LIMIT || Infinity; // お試し版はチームの数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { results: {}, last: null };

  function intOf(id, def, lo, hi) { var v = parseInt($(id).value, 10); if (isNaN(v)) v = def; return Math.max(lo, Math.min(hi, v)); }
  function options() {
    var st = $("start").value.trim(), start = st ? T.parseClock(st) : null, br = T.parseBreaks($("breaks").value);
    return {
      legs: +$("legs").value, k: intOf("ngroups", 1, 1, 26), how: $("how").value, courts: intOf("courts", 1, 1, 50),
      courtNames: $("courtNames").value.split(/[,，、\s]+/).map(function (x) { return x.trim(); }).filter(Boolean),
      start: start, startErr: st && start == null, dur: intOf("dur", 20, 1, 600), gap: intOf("gap", 0, 0, 120), breaks: br.list, breakErrs: br.errs,
      avoid: $("avoid").checked, referee: $("referee").value,
      pts: { win: +$("pWin").value || 0, draw: +$("pDraw").value || 0, loss: +$("pLoss").value || 0 }
    };
  }
  function time(sl) { return sl && sl.start != null ? T.hm(sl.start) + "〜" + T.hm(sl.end) : ""; }

  // ---------- 作る ----------
  function refresh() {
    var p = T.parseTeams($("teams").value), o = options(), msg = [], teams = p.teams;
    if (teams.length > LIMIT) { msg.push('<span class="wtxt">お試し版のため、上から ' + LIMIT + " チームだけで作ります（" + teams.length + " チーム入力）。</span>"); teams = teams.slice(0, LIMIT); }
    if (p.dups.length) msg.push('<span class="wtxt">同じ名前を1つにまとめました：' + esc(p.dups.map(function (d) { return d.line + "行目「" + d.name + "」"; }).join("、")) + "</span>");
    if (o.how === "given" && !p.hasGroup) msg.push('<span class="wtxt">組が書かれていないため、全員を1つの組にしています。</span>');
    var groups = T.makeGroups(teams, o.k, o.how);
    var small = groups.filter(function (g) { return g.teams.length < 2; });
    if (small.length) msg.push('<span class="wtxt">1チームだけの組があります（' + esc(small.map(function (g) { return g.name || "組"; }).join("、")) + "）。組の数を減らしてください。</span>");
    msg.unshift(teams.length + " チーム" + (groups.length > 1 ? "・" + groups.length + " 組（" + groups.map(function (g) { return esc(g.name) + " " + g.teams.length; }).join("、") + "）" : ""));
    $("teamMsg").innerHTML = msg.join("<br>");
    var om = [];
    if (o.startErr) om.push('<span class="bad">開始の時刻が読めません（「9:00」のように書いてください）。時刻なしで作ります。</span>');
    if (o.breakErrs.length) om.push('<span class="bad">休み時間が読めません：' + esc(o.breakErrs.join("、")) + "（「12:00-13:00」のように書いてください）</span>");
    $("optMsg").innerHTML = om.join("<br>");
    if (teams.length < 2) { $("out").hidden = true; S.last = null; return; }
    var sch = T.schedule(groups, o), stats = T.teamStats(groups, sch);
    S.last = { o: o, groups: groups, sch: sch, stats: stats };
    $("out").hidden = false;
    renderSummary(); renderOrder(); renderResults();
  }

  function renderSummary() {
    var L = S.last, o = L.o, sch = L.sch, back = L.stats.reduce(function (a, x) { return a + x.back; }, 0);
    var maxRun = L.stats.reduce(function (a, x) { return Math.max(a, x.maxRun); }, 0);
    var lastSl = sch.slots[sch.slots.length - 1];
    var t = "<b>" + sch.matches.length + " 試合</b>・コート " + sch.courts + " 面で <b>" + sch.slots.length + " 回</b>に分けて行います。" +
      (lastSl.start != null ? "開始 " + T.hm(sch.slots[0].start) + "、終了予定 <b>" + T.hm(lastSl.end) + "</b>。" : "");
    t += "<br>連戦（続けて2試合）：" + (back ? "<b>" + back + " 回</b>" + (maxRun >= 3 ? '<span class="wtxt">（3試合以上続くチームがあります）</span>' : "") : "なし");
    var busy = sch.courts * 2 / L.stats.length;
    if (back && busy > 0.5) t += '<br><span class="note">同じ時間に試合をするチームが全体の半分を超えるため、連戦を全部なくすことはできません。コートの数を減らすと連戦は減り、時間は長くなります。</span>';
    if (sch.slots.some(function (s) { return s.matches.length < sch.courts; }) && sch.slots.length > 1) t += '<br><span class="note">空くコートがある回は、同じチームが同時に2試合しないための空きです。</span>';
    $("sumMsg").innerHTML = t;
  }

  function renderOrder() {
    var L = S.last, multi = L.groups.length > 1, ref = L.o.referee === "rest";
    var h = '<table class="lt"><thead><tr><th class="n">試合</th><th>時刻</th><th>コート</th>' + (multi ? "<th>組</th>" : "") + '<th class="ta">左</th><th class="vs">得点</th><th>右</th>' + (ref ? "<th>審判</th>" : "") + "</tr></thead><tbody>";
    L.sch.slots.forEach(function (sl, k) {
      sl.matches.forEach(function (m, i) {
        var v = S.results[m.key] || "", sc = T.parseScore(v);
        h += "<tr" + (i === 0 && k ? ' class="sep"' : "") + '><td class="n">' + m.no + "</td><td>" + (i === 0 ? esc(time(sl)) : "") + "</td><td>" + esc(m.court) + "</td>" + (multi ? "<td>" + esc(m.group) + "</td>" : "") +
          '<td class="ta">' + esc(m.a) + '</td><td class="vs"><input class="sc' + (sc && sc.err ? " err" : "") + '" data-key="' + esc(m.key) + '" value="' + esc(v) + '" placeholder="－" aria-label="第' + m.no + '試合の得点"></td><td>' + esc(m.b) + "</td>" + (ref ? "<td>" + esc(m.ref || "—") + "</td>" : "") + "</tr>";
      });
    });
    $("orderView").innerHTML = h + "</tbody></table>";
  }

  // 星取表のマス（行のチームから見た結果）
  function cell(L, gi, x, y, blank) {
    var ms = L.sch.matches.filter(function (m) { return m.g === gi && ((m.a === x && m.b === y) || (m.a === y && m.b === x)); });
    return ms.map(function (m) {
      var sc = blank ? null : T.parseScore(S.results[m.key]);
      if (!sc || sc.err) return '<span class="no">第' + m.no + "試合</span>";
      var me = m.a === x ? sc.a : sc.b, op = m.a === x ? sc.b : sc.a;
      return '<span class="w">' + (me > op ? "○" : me < op ? "●" : "△") + "</span> " + me + "-" + op;
    }).join("<br>");
  }
  function starHTML(gi, blank) {
    var L = S.last, g = L.groups[gi], tb = T.standings(g, gi, L.sch, blank ? {} : S.results, L.o.pts), by = {};
    tb.forEach(function (r) { by[r.name] = r; });
    var any = !blank && tb.some(function (r) { return r.played; });
    var h = '<table class="st"><thead><tr><th class="t">' + esc(g.name || "") + "</th>" + g.teams.map(function (t) { return "<th>" + esc(t) + "</th>"; }).join("") +
      "<th>勝</th><th>分</th><th>負</th><th>得点</th><th>失点</th><th>差</th><th>勝点</th><th>順位</th></tr></thead><tbody>";
    g.teams.forEach(function (x) {
      var r = by[x];
      h += '<tr><th class="t">' + esc(x) + "</th>" + g.teams.map(function (y) { return x === y ? '<td class="x"></td>' : "<td>" + cell(L, gi, x, y, blank) + "</td>"; }).join("") +
        (any ? "<td>" + r.win + "</td><td>" + r.draw + "</td><td>" + r.loss + "</td><td>" + r.gf + "</td><td>" + r.ga + "</td><td>" + (r.diff > 0 ? "+" : "") + r.diff + "</td><td><b>" + r.pts + "</b></td><td><b>" + r.rank + (r.tie ? "=" : "") + "</b></td>"
          : "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>") + "</tr>";
    });
    return h + "</tbody></table>";
  }
  function renderResults() {
    var L = S.last;
    $("starView").innerHTML = L.groups.map(function (g, gi) { return '<div style="overflow:auto">' + (L.groups.length > 1 ? "<h3>" + esc(g.name) + "</h3>" : "") + starHTML(gi, false) + "</div>"; }).join("");
    var ref = L.o.referee === "rest";
    $("teamView").innerHTML = '<table class="lt"><thead><tr><th>チーム</th>' + (L.groups.length > 1 ? "<th>組</th>" : "") + '<th class="n">試合</th><th class="n">左側</th><th class="n">連戦</th><th class="n">続けて最大</th>' + (ref ? '<th class="n">審判</th>' : "") + "<th>最初の試合</th><th>最後の試合</th></tr></thead><tbody>" +
      L.stats.map(function (x) {
        return "<tr><td>" + esc(x.name) + "</td>" + (L.groups.length > 1 ? "<td>" + esc(x.group) + "</td>" : "") + '<td class="n">' + x.games + '</td><td class="n">' + x.home + '</td><td class="n">' + (x.back ? '<span class="wtxt">' + x.back + "</span>" : 0) + '</td><td class="n">' + x.maxRun + "</td>" + (ref ? '<td class="n">' + x.refs + "</td>" : "") +
          "<td>" + esc(x.first ? (x.first.start != null ? T.hm(x.first.start) : "第" + x.first.matches[0].no + "試合の回") : "") + "</td><td>" + esc(x.lastSlot ? (x.lastSlot.end != null ? T.hm(x.lastSlot.end) + " まで" : "") : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function download(name, rows) {
    var blob = new Blob([T.toCSV(rows)], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $("saveMsg").textContent = "保存しました（" + name + "）。";
  }
  function score(m) { var sc = T.parseScore(S.results[m.key]); return sc && !sc.err ? sc : null; }
  function saveOrder() {
    var L = S.last; if (!L) return;
    var out = [["試合", "開始", "終了", "コート", "組", "左", "左の得点", "右の得点", "右", "審判", "回"]];
    L.sch.matches.forEach(function (m) { var sc = score(m); out.push([m.no, T.hm(m.start), T.hm(m.end), m.court, m.group, m.a, sc ? sc.a : "", sc ? sc.b : "", m.b, m.ref || "", m.leg + 1]); });
    download("試合順_" + ymd() + ".csv", out);
  }
  function saveRank() {
    var L = S.last; if (!L) return;
    var out = [["組", "順位", "チーム", "試合", "勝", "分", "負", "得点", "失点", "得失点差", "勝点"]];
    L.groups.forEach(function (g, gi) { T.standings(g, gi, L.sch, S.results, L.o.pts).forEach(function (r) { out.push([g.name, r.rank + (r.tie ? "=" : ""), r.name, r.played, r.win, r.draw, r.loss, r.gf, r.ga, r.diff, r.pts]); }); });
    download("順位表_" + ymd() + ".csv", out);
  }
  function teamRows(t) {
    var L = S.last, rows = [];
    L.sch.matches.forEach(function (m) {
      if (m.a === t || m.b === t) rows.push({ m: m, kind: "試合", op: m.a === t ? m.b : m.a, side: m.a === t ? "左" : "右" });
      else if (m.ref === t) rows.push({ m: m, kind: "審判", op: m.a + " 対 " + m.b, side: "" });
    });
    return rows;
  }
  function saveTeam() {
    var L = S.last; if (!L) return;
    var out = [["チーム", "組", "試合", "開始", "終了", "コート", "内容", "相手（審判のときは対戦）", "左右"]];
    L.stats.forEach(function (x) { teamRows(x.name).forEach(function (r) { out.push([x.name, x.group, r.m.no, T.hm(r.m.start), T.hm(r.m.end), r.m.court, r.kind, r.op, r.side]); }); });
    download("チームごとの予定_" + ymd() + ".csv", out);
  }

  // ---------- 印刷 ----------
  function printPart(kind) {
    var L = S.last; if (!L) return;
    var blank = $("blankPrint").checked, title = $("title").value.trim() || "対戦表", sub = $("sub").value.trim(), multi = L.groups.length > 1, ref = L.o.referee === "rest";
    var head = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc((sub ? sub + "　/　" : "") + (L.sch.legs === 2 ? "2回総当たり" : "総当たり") + "・" + L.sch.matches.length + "試合・コート" + L.sch.courts + "面" + (L.sch.slots[0].start != null ? "・" + T.hm(L.sch.slots[0].start) + "〜" + T.hm(L.sch.slots[L.sch.slots.length - 1].end) : "")) + "</p>";
    var foot = $("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "", body = "";
    if (kind === "order") {
      body = head + '<table class="pt"><thead><tr><th class="n">試合</th><th>時刻</th><th>コート</th>' + (multi ? "<th>組</th>" : "") + '<th class="ta">左</th><th class="vs">得点</th><th>右</th>' + (ref ? "<th>審判</th>" : "") + "</tr></thead><tbody>" +
        L.sch.matches.map(function (m) {
          var sc = blank ? null : score(m);
          return '<tr><td class="n">' + m.no + "</td><td>" + esc(time(m)) + "</td><td>" + esc(m.court) + "</td>" + (multi ? "<td>" + esc(m.group) + "</td>" : "") + '<td class="ta">' + esc(m.a) + '</td><td class="vs">' + (sc ? sc.a + " － " + sc.b : "　　－　　") + "</td><td>" + esc(m.b) + "</td>" + (ref ? "<td>" + esc(m.ref || "") + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table>" + foot;
    } else if (kind === "star") {
      body = L.groups.map(function (g, gi) { return '<div class="pg">' + head + (multi ? "<h2>" + esc(g.name) + "</h2>" : "") + starHTML(gi, blank) + '<p class="note">○勝ち ●負け △引き分け（行のチームから見た結果・得点）。勝点：勝ち ' + L.o.pts.win + "・引き分け " + L.o.pts.draw + "・負け " + L.o.pts.loss + "。</p>" + foot + "</div>"; }).join("");
    } else {
      body = head + L.stats.map(function (x) {
        return '<div class="tb"><h2>' + esc(x.name) + (multi ? "（" + esc(x.group) + "）" : "") + '</h2><table class="pt"><thead><tr><th class="n">試合</th><th>時刻</th><th>コート</th><th>内容</th><th>相手</th></tr></thead><tbody>' +
          teamRows(x.name).map(function (r) { return '<tr><td class="n">' + r.m.no + "</td><td>" + esc(time(r.m)) + "</td><td>" + esc(r.m.court) + "</td><td>" + (r.kind === "審判" ? "審判" : "試合（" + r.side + "）") + "</td><td>" + esc(r.op) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      }).join("") + foot;
    }
    $("pageStyle").textContent = "@page{size:A4 " + (kind === "star" ? "landscape" : "portrait") + ";margin:10mm}";
    $("printArea").innerHTML = body;
    window.print();
  }

  // ---------- 見本（架空のチーム名） ----------
  var SAMPLE = "青葉クラブ\nみどり台\nさくら\nけやき\nひばり\nかもめ\nつばめ\nすずらん";

  // ---------- 入力の保存（このブラウザの中だけ） ----------
  var KEYS = ["teams", "legs", "ngroups", "how", "courts", "courtNames", "start", "dur", "gap", "breaks", "referee", "pWin", "pDraw", "pLoss", "title", "sub", "foot"];
  function save() {
    try { var o = { results: S.results }; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.avoid = $("avoid").checked; localStorage.setItem("taisen-hyou", JSON.stringify(o)); } catch (e) {}
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem("taisen-hyou") || "{}");
      KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; });
      if (o.avoid != null) $("avoid").checked = o.avoid;
      if (o.results && typeof o.results === "object") S.results = o.results;
    } catch (e) {}
  }

  window.addEventListener("DOMContentLoaded", function () {
    load();
    var tm = null;
    function later() { clearTimeout(tm); tm = setTimeout(function () { save(); refresh(); }, 300); }
    ["teams", "courtNames", "start", "breaks", "dur", "gap", "ngroups", "courts", "pWin", "pDraw", "pLoss"].forEach(function (id) { $(id).oninput = later; });
    ["legs", "how", "avoid", "referee"].forEach(function (id) { $(id).onchange = function () { save(); refresh(); }; });
    ["title", "sub", "foot"].forEach(function (id) { $(id).onchange = save; });
    $("orderView").addEventListener("input", function (e) {
      var el = e.target; if (!el.dataset || !el.dataset.key) return;
      var v = el.value.trim(), sc = T.parseScore(v);
      if (v) S.results[el.dataset.key] = v; else delete S.results[el.dataset.key];
      el.classList.toggle("err", !!(sc && sc.err));
      save(); if (S.last) renderResults();
    });
    $("sample").onclick = function () { $("teams").value = SAMPLE; if (!$("title").value) $("title").value = "町内ソフトバレー大会（見本）"; save(); refresh(); };
    $("clearAll").onclick = function () { if (!confirm("チームの一覧と入れた結果を全部消します。よろしいですか？")) return; $("teams").value = ""; S.results = {}; save(); refresh(); };
    $("clearRes").onclick = function () { if (!confirm("入れた結果を全部消します。よろしいですか？")) return; S.results = {}; save(); refresh(); };
    $("pOrder").onclick = function () { printPart("order"); }; $("pStar").onclick = function () { printPart("star"); }; $("pTeam").onclick = function () { printPart("team"); };
    $("cOrder").onclick = saveOrder; $("cRank").onclick = saveRank; $("cTeam").onclick = saveTeam;
    refresh();
  });
})();
