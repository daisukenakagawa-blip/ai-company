/* 発表会のプログラムと時刻表 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var H = window.HAPPYO;
  var LIMIT = window.HAPPYO_LIMIT || Infinity; // お試し版は組数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: {} };
  var S = { items: [], order: null, bad: [], R: null };
  function C(t) { return H.clock(t, $("sec").checked); }

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    var hh = $("hasHead").checked;
    T.headers = hh ? rows[0].map(function (h, i) { return H.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = hh ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    analyze();
  }
  function analyze() {
    prep();
    T.cols = H.guessCols(T.headers);
    if (T.cols.name == null && T.cols.title == null && T.headers.length) T.cols.name = 0;
    $("colBox").hidden = false;
    $("loadMsg").textContent = "読み込みました：" + NAME + "（" + T.rows.length + " 行・" + T.headers.length + " 列）";
    drawCols(); rebuild();
  }
  var DEFS = [["order", "順番（任意。あれば番号の順に並べます）"], ["name", "名前（出演者）"], ["title", "曲名・演目"], ["composer", "作曲者（任意）"], ["dur", "時間（演奏の長さ）"], ["fixed", "開始時刻（任意）"], ["part", "部・クラス（任意）"], ["memo", "備考（任意）"]];
  function drawCols() {
    var el = $("cols");
    el.innerHTML = DEFS.map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) {
        return '<option value="' + i + '"' + (T.cols[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete T.cols[s.dataset.k]; else T.cols[s.dataset.k] = +s.value; rebuild(); };
    });
  }
  function readFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg").textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (rr) { return rr.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (rr) { return rr.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = H.decodeBytes(buf);
        setData(H.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function rebuild() {
    if (!RAW) return;
    var t = H.toItems(T.rows, { cols: T.cols, headRows: $("hasHead").checked ? 1 : 0, defDur: Math.round(Math.max(0, parseFloat($("defDur").value) || 0) * 60), split: $("split").checked });
    S.items = t.items; S.bad = t.bad; S.order = null;
    compute();
  }
  function tval(id) { var v = $(id).value; if (!v) return null; var x = H.parseClock(v); return isNaN(x) ? null : x; }
  function ordered() { return S.order ? S.order.map(function (i) { return S.items[i]; }) : S.items; }
  function compute() {
    if (!RAW) return;
    S.R = H.run(ordered(), { start: tval("start") || 0, change: Math.max(0, +$("change").value || 0), callMode: $("callMode").value, callN: Math.max(0, +$("callN").value || 0),
      gather: Math.max(0, +$("gather").value || 0), endAt: tval("endAt"), gapMin: Math.max(0, +$("gapMin").value || 0), limit: LIMIT });
    $("resetOrder").hidden = !S.order;
    $("out").hidden = false;
    summary(); listView();
  }
  function warnCount() {
    var R = S.R, n = R.close.length + S.bad.length;
    R.list.forEach(function (x) { if (x.late) n++; });
    return n;
  }
  function summary() {
    var R = S.R, t = R.total;
    var h = "<b>" + t.acts + "</b> 組・出演者 <b>" + t.people + "</b> 人　開演 <b class=\"tm\">" + C(R.start) + "</b> → 終わり <b class=\"tm\">" + C(R.end) + "</b>（" + H.durLabel(t.span) + "）<br>" +
      "内訳：出演 " + H.durLabel(t.actT) + "・入れ替え " + H.durLabel(t.changeT) + (t.itemT ? "・あいさつなど " + H.durLabel(t.itemT) : "") + "・休憩 " + H.durLabel(t.breakT) + (t.waitT ? "・開始時刻までの待ち " + H.durLabel(t.waitT) : "");
    if (R.endAt != null) h += "<br>終わらせたい時刻 " + C(R.endAt) + " まで " + (R.over > 0 ? '<b class="bad">' + H.durLabel(R.over) + " 足りません</b>" : '<b class="ok">あと ' + H.durLabel(-R.over) + " の余裕</b>");
    var w = warnCount();
    if (w) h += '<br><span class="warn">確かめたい所が ' + w + " 件あります（表示で「確かめたい所」を選んでください）。</span>";
    if (R.cut) h += '<br><span class="warn">お試し版のため、先頭 ' + LIMIT + " 組だけを計算しています（ほか " + R.cut + " 組）。</span>";
    $("sumMsg").innerHTML = h;
    $("errView").innerHTML = "";
  }
  function tbl(head, rows, nIdx) {
    nIdx = nIdx || {};
    return '<div class="scroll"><table class="lt"><tr>' + head.map(function (h, i) { return "<th" + (nIdx[i] ? ' class="n"' : "") + ">" + h + "</th>"; }).join("") + "</tr>" +
      (rows.length ? rows.join("") : '<tr><td colspan="' + head.length + '" class="nr">該当なし</td></tr>') + "</table></div>";
  }
  function label(x) { return x.kind === "act" ? x.name : (x.title || x.name); }
  function listView() {
    var v = $("view").value, R = S.R, html = "";
    $("mvNote").hidden = v !== "prog";
    if (v === "prog") {
      html = tbl(["", "番", "開始", "終わり", "袖へ", "集合", "名前", "曲名・演目", "時間", "部", "備考・注意"], R.list.map(function (x, li) {
        var mv = '<button class="mv" data-mv="-1" data-i="' + li + '" title="上へ">▲</button><button class="mv" data-mv="1" data-i="' + li + '" title="下へ">▼</button>';
        var cls = x.kind === "break" ? "brk" : x.kind === "head" ? "hd" : x.kind === "item" ? "itm" : "";
        var note = [x.memo].concat(x.flags).filter(Boolean).join("／");
        if (x.wait) note = (note ? note + "／" : "") + "開始まで " + H.durLabel(x.wait) + " 待つ";
        return '<tr class="' + cls + '"><td>' + mv + '</td><td class="n">' + (x.num || "") + '</td><td class="tm">' + C(x.start) + "</td><td>" + (x.kind === "head" ? "" : C(x.end)) +
          '</td><td class="call">' + (x.kind === "act" ? C(x.call) + (x.callPre ? "（開演前）" : x.callBreak ? "（休憩中）" : "") : "") + "</td><td>" + (x.gather != null ? C(x.gather) : "") + "</td><td>" + esc(x.kind === "act" ? x.name : "") +
          "</td><td>" + esc(x.kind === "act" ? x.title + (x.composer ? "（" + x.composer + "）" : "") : label(x)) + '</td><td class="n">' + (x.kind === "head" ? "" : H.durMS(x.dur)) + "</td><td>" + esc(x.part) +
          '</td><td class="' + (x.flags.length ? "warn" : "") + '">' + esc(note) + "</td></tr>";
      }), { 1: 1, 8: 1 });
    } else if (v === "calls") {
      html = '<p class="note">係が時刻を見ながら呼び出すための一覧です。「袖へ」は舞台袖へ入る時刻、「集合」は控室に集まる時刻です。</p>' +
        tbl(["時刻", "呼び出し", "番", "名前", "曲名・演目", "その組の開始"], R.calls.map(function (c) {
          return '<tr><td class="tm">' + C(c.t) + "</td><td" + (c.type === "袖へ" ? ' class="call"' : "") + ">" + c.type + '</td><td class="n">' + c.act.num + "</td><td>" + esc(c.act.name) + "</td><td>" + esc(c.act.title) + "</td><td>" + C(c.act.start) + "</td></tr>";
        }), { 2: 1 });
    } else if (v === "per") {
      html = tbl(["名前", "出番", "番", "集合", "袖へ", "開始", "曲名・演目"], R.people.map(function (p) {
        return "<tr><td>" + esc(p.name) + '</td><td class="n">' + p.apps.length + "</td><td>" + p.apps.map(function (a) { return a.num; }).join("・") + "</td><td>" + (p.first.gather != null ? C(p.first.gather) : "") +
          '</td><td class="call">' + p.apps.map(function (a) { return C(a.call); }).join("・") + '</td><td class="tm">' + p.apps.map(function (a) { return C(a.start); }).join("・") + "</td><td>" + esc(p.apps.map(function (a) { return a.title; }).join("／")) + "</td></tr>";
      }), { 1: 1 });
    } else {
      var rows = [];
      R.close.forEach(function (c) {
        rows.push('<tr><td class="warn">出番のあいだが短い</td><td>' + esc(c.person.name) + "</td><td>" + c.a.num + "番（" + C(c.a.start) + "）→ " + c.b.num + "番（" + C(c.b.start) + "）</td><td>あいだ " + c.between + " 組・" + H.durLabel(Math.max(0, c.rest)) + "</td></tr>");
      });
      R.list.forEach(function (x) { if (x.late) rows.push('<tr><td class="warn">開始時刻に間に合わない</td><td>' + esc(label(x)) + "</td><td>予定 " + H.clock(x.fixed, true) + "</td><td>計算では " + H.clock(x.start, true) + "（" + H.durLabel(x.late) + " 遅れ）</td></tr>"); });
      S.bad.forEach(function (b) { rows.push('<tr><td class="warn">' + esc(b.why) + "</td><td>" + esc(b.name) + "</td><td>" + b.row + " 行目</td><td>" + esc(b.raw || "（空欄）") + "</td></tr>"); });
      if (R.endAt != null && R.over > 0) rows.unshift('<tr><td class="bad">終わらせたい時刻を過ぎる</td><td></td><td>終わり ' + C(R.end) + "</td><td>" + H.durLabel(R.over) + " 超過</td></tr>");
      html = tbl(["内容", "名前・項目", "どこ", "くわしく"], rows);
    }
    $("listView").innerHTML = html;
    Array.prototype.forEach.call($("listView").querySelectorAll("button.mv"), function (b) { b.onclick = function () { move(+b.dataset.i, +b.dataset.mv); }; });
  }
  function move(li, d) {
    if (!S.order) S.order = S.items.map(function (_, i) { return i; });
    // 表示している行（お試し版で切った行を除く）の位置 → S.order の位置
    var j = li + d;
    if (j < 0 || j >= S.R.list.length) return;
    var tmp = S.order[li]; S.order[li] = S.order[j]; S.order[j] = tmp;
    compute();
  }

  // ---------- 印刷 ----------
  function title() { return H.norm($("title").value) || "発表会"; }
  function subt() { return H.norm($("sub").value); }
  function doPrint(html) { $("printArea").innerHTML = html; window.print(); }
  function printProg() {
    var R = S.R, withT = $("progTime").checked, withC = $("progComp").checked;
    var rows = R.list.map(function (x) {
      if (x.kind === "break") return '<tr class="brk"><td colspan="' + (withT ? 4 : 3) + '">' + esc(x.title || x.name) + "（" + H.durLabel(x.dur) + "）" + (withT ? "　" + C(x.start) + "〜" : "") + "</td></tr>";
      if (x.kind === "head") return '<tr class="hd"><td colspan="' + (withT ? 4 : 3) + '">' + esc(x.title) + (withT ? "　" + C(x.start) + "〜" : "") + "</td></tr>";
      if (x.kind === "item") return "<tr>" + (withT ? '<td class="tt">' + C(x.start) + "</td>" : "") + '<td class="no"></td><td colspan="2">' + esc(x.title) + "</td></tr>";
      var cp = withC ? [x.composer, x.memo].filter(Boolean).join("　") : "";
      return "<tr>" + (withT ? '<td class="tt">' + C(x.start) + "</td>" : "") + '<td class="no">' + x.num + "</td><td>" + esc(x.title) + (cp ? '<div class="cp">' + esc(cp) + "</div>" : "") + "</td><td>" + esc(x.name) + "</td></tr>";
    }).join("");
    doPrint('<div class="prog"><h1>' + esc(title()) + "</h1>" + '<div class="per">' + esc(subt()) + (withT ? "　開演 " + C(R.start) : "") + '</div><table>' + rows + "</table></div>");
  }
  function head(s) { return "<h1>" + esc(title()) + "　" + s + '</h1><div class="per">' + esc(subt()) + "　開演 " + C(S.R.start) + "　終わり " + C(S.R.end) + "　" + S.R.total.acts + " 組</div>"; }
  function printRun() {
    var rows = S.R.list.map(function (x) {
      var cls = x.kind === "break" ? "brk" : x.kind === "head" ? "hd" : "";
      var note = [x.memo].concat(x.flags).filter(Boolean).join("／");
      return '<tr class="' + cls + '"><td>' + C(x.start) + "</td><td>" + (x.kind === "act" ? C(x.call) : "") + "</td><td>" + (x.gather != null ? C(x.gather) : "") + '</td><td class="n">' + (x.num || "") + "</td><td>" + esc(x.kind === "act" ? x.name : "") +
        '</td><td class="w">' + esc(x.kind === "act" ? x.title : label(x)) + '</td><td class="n">' + (x.kind === "head" ? "" : H.durMS(x.dur)) + '</td><td class="w">' + esc(note) + "</td></tr>";
    }).join("");
    doPrint(head("進行表") + '<table class="pt"><tr><th>開始</th><th>袖へ</th><th>集合</th><th>番</th><th>名前</th><th>曲名・演目</th><th>時間</th><th>備考</th></tr>' + rows + "</table>");
  }
  function printCall() {
    var rows = S.R.calls.map(function (c) { return "<tr><td><b>" + C(c.t) + "</b></td><td>" + c.type + '</td><td class="n">' + c.act.num + "</td><td>" + esc(c.act.name) + '</td><td class="w">' + esc(c.act.title) + "</td><td>" + C(c.act.start) + "</td><td style=\"width:12mm\"></td></tr>"; }).join("");
    doPrint(head("呼び出し表") + '<table class="pt"><tr><th>時刻</th><th>呼び出し</th><th>番</th><th>名前</th><th>曲名・演目</th><th>開始</th><th>済</th></tr>' + rows + "</table>");
  }
  function printCards() {
    var R = S.R, msg = $("msg").value.trim(), pages = [];
    var cards = R.people.map(function (p) {
      var rows = p.apps.slice(0, 4).map(function (a) {
        return "<tr><td>" + a.num + "番</td><td>" + esc(a.title) + "</td><td>袖へ " + C(a.call) + '</td><td class="big">' + C(a.start) + "</td></tr>";
      }).join("");
      return '<div class="card"><div class="ct">' + esc(title()) + "　出番のお知らせ" + (subt() ? "　" + esc(subt()) : "") + "</div>" +
        '<div class="nm">' + esc(p.name) + " さん</div>" +
        (p.first.gather != null ? '<div>控室に集合 <span class="big">' + C(p.first.gather) + "</span></div>" : "") +
        "<table><tr><th>番</th><th>曲名・演目</th><th>舞台袖へ</th><th>開始の予定</th></tr>" + rows + "</table>" +
        (p.apps.length > 4 ? "<div>ほか " + (p.apps.length - 4) + " 回</div>" : "") +
        '<div class="ct" style="margin-top:1mm">開演 ' + C(R.start) + "　終わりの予定 " + C(R.end) + "</div>" +
        (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + "</div>";
    });
    for (var i = 0; i < cards.length; i += 8) pages.push('<div class="pg"><div class="cards">' + cards.slice(i, i + 8).join("") + "</div></div>");
    doPrint(pages.join("") || "<p>出演者がいません。</p>");
  }

  // ---------- 保存 ----------
  function rowsRun() {
    return [["番", "開始", "終わり", "袖へ", "集合", "名前", "曲名・演目", "作曲者", "時間（分:秒）", "部", "備考", "注意", "元の行"]].concat(S.R.list.map(function (x) {
      return [x.num || "", C(x.start), x.kind === "head" ? "" : C(x.end), x.kind === "act" ? C(x.call) : "", x.gather != null ? C(x.gather) : "", x.kind === "act" ? x.name : "",
        x.kind === "act" ? x.title : label(x), x.composer, x.kind === "head" ? "" : H.durMS(x.dur), x.part, x.memo, x.flags.join("／"), x.row];
    }));
  }
  function rowsCalls() { return [["時刻", "呼び出し", "番", "名前", "曲名・演目", "その組の開始"]].concat(S.R.calls.map(function (c) { return [C(c.t), c.type, c.act.num, c.act.name, c.act.title, C(c.act.start)]; })); }
  function rowsPer() {
    return [["名前", "出番の数", "番", "集合", "袖へ", "開始", "曲名・演目"]].concat(S.R.people.map(function (p) {
      return [p.name, p.apps.length, p.apps.map(function (a) { return a.num; }).join("・"), p.first.gather != null ? C(p.first.gather) : "", p.apps.map(function (a) { return C(a.call); }).join("・"),
        p.apps.map(function (a) { return C(a.start); }).join("・"), p.apps.map(function (a) { return a.title; }).join("／")];
    }));
  }
  function rowsWarn() {
    var R = S.R, out = [["内容", "名前・項目", "どこ", "くわしく"]];
    R.close.forEach(function (c) { out.push(["出番のあいだが短い", c.person.name, c.a.num + "番→" + c.b.num + "番", "あいだ " + c.between + " 組"]); });
    R.list.forEach(function (x) { if (x.late) out.push(["開始時刻に間に合わない", label(x), "予定 " + C(x.fixed), H.durLabel(x.late) + " 遅れ"]); });
    S.bad.forEach(function (b) { out.push([b.why, b.name, b.row + " 行目", b.raw]); });
    return out;
  }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 組の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h) { return { wch: Math.max(8, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), r = rowsRun();
    XLSX.utils.book_append_sheet(wb, sheet(r), "進行表");
    XLSX.utils.book_append_sheet(wb, sheet(rowsCalls()), "呼び出し表");
    XLSX.utils.book_append_sheet(wb, sheet(rowsPer()), "1人ごと");
    var w = rowsWarn(); if (w.length > 1) XLSX.utils.book_append_sheet(wb, sheet(w), "確かめたい所");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, r.length - 1);
  }

  // ---------- 設定の保存（名前・曲名は保存しない） ----------
  var KEY = "happyokai-program";
  var SET = ["start", "change", "defDur", "callN", "callMode", "gather", "endAt", "gapMin", "view"];
  function saveSettings() {
    var o = {}; SET.forEach(function (k) { o[k] = $(k).value; });
    ["sec", "split", "progTime", "progComp"].forEach(function (k) { o[k] = $(k).checked; });
    o.title = $("title").value; o.sub = $("sub").value; o.msg = $("msg").value;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }
  function loadSettings() {
    var o = null; try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    o = o || {};
    SET.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; });
    ["sec", "split", "progTime", "progComp"].forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; });
    ["title", "sub", "msg"].forEach(function (k) { if (o[k]) $(k).value = o[k]; });
  }

  // ---------- 見本（架空の名前。曲名は作曲者の没後70年以上たった曲と練習曲の題名） ----------
  function sample() {
    var rows = [["順", "氏名", "曲名", "作曲者", "演奏時間", "開始時刻", "備考"],
      ["", "", "開会のことば", "", "2分", "", "司会"],
      ["1", "青木 ひなた", "メヌエット ト長調", "ペツォールト", "1:30", "", ""],
      ["2", "石井 そら", "ちょうちょう", "ドイツ民謡", "1分", "", ""],
      ["3", "上田 みお", "アラベスク", "ブルクミュラー", "1:40", "", ""],
      ["4", "江藤 はると", "トルコ行進曲", "モーツァルト", "3:30", "", ""],
      ["5", "大野 りん", "エリーゼのために", "ベートーヴェン", "3分", "", ""],
      ["6", "青木 ひなた・青木 ゆうと", "連弾 かえるの合唱", "ドイツ民謡", "1:30", "", "兄弟の連弾"],
      ["7", "加藤 あおい", "子犬のワルツ", "ショパン", "", "", ""],
      ["", "休憩", "", "", "10", "", "ロビーで花束の受け渡し"],
      ["", "", "第2部", "", "", "14:05", ""],
      ["8", "木村 さな", "楽しき農夫", "シューマン", "1:20", "", ""],
      ["9", "工藤 れん", "人形の夢と目覚め", "エステン", "4:00", "", ""],
      ["10", "小林 ゆい", "幻想即興曲", "ショパン", "5:10", "", ""],
      ["11", "佐々木 こはる", "乙女の祈り", "バダジェフスカ", "4分", "", ""],
      ["12", "大野 りん・小林 ゆい", "連弾 ハンガリー舞曲 第5番", "ブラームス", "2:40", "", ""],
      ["13", "清水 あさひ", "月の光", "ドビュッシー", "4:50", "", ""],
      ["", "", "講評・記念撮影", "", "15分", "", "先生"]];
    $("hasHead").checked = true;
    $("start").value = "13:30"; $("change").value = 30; $("defDur").value = 3; $("callN").value = 2; $("callMode").value = "acts"; $("gather").value = 30; $("endAt").value = "15:00"; $("gapMin").value = 2;
    $("title").value = "ひまわり音楽教室 ピアノ発表会（見本）"; $("sub").value = "12月13日（日）　市民ホール 小ホール";
    setData(rows, "見本（架空の13組の発表会）");
  }

  // ---------- 画面 ----------
  loadSettings();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(H.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) analyze(); };
  ["split", "defDur"].forEach(function (k) { $(k).onchange = function () { saveSettings(); rebuild(); }; });
  ["start", "change", "callN", "callMode", "gather", "endAt", "gapMin"].forEach(function (k) { $(k).onchange = function () { saveSettings(); compute(); }; });
  ["view", "sec"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) { summary(); listView(); } }; });
  ["title", "sub", "msg", "progTime", "progComp"].forEach(function (k) { $(k).onchange = saveSettings; });
  $("resetOrder").onclick = function () { S.order = null; compute(); };
  $("sample").onclick = sample;
  $("pProg").onclick = function () { if (S.R) printProg(); };
  $("pRun").onclick = function () { if (S.R) printRun(); };
  $("pCall").onclick = function () { if (S.R) printCall(); };
  $("pCard").onclick = function () { if (S.R) printCards(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cRun").onclick = function () { if (!S.R) return; var r = rowsRun(), n = fname("csv", "進行表"); dl(n, H.toCSV(r)); done(n, r.length - 1); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, H.toCSV(r)); done(n, r.length - 1); };
})();
