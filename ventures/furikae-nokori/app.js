/* 振替レッスンの残り回数 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var F = window.FURIKAE;
  var LIMIT = window.FURIKAE_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: {}, dateCols: [] };
  var S = { R: null, bad: [], kindMap: {}, kinds: [] };
  var L = F.dayLabel;

  // ---------- 読み込み ----------
  function ctx() { return { year: +$("year").value || new Date().getFullYear(), fiscal: $("fiscal").checked }; }
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    var hh = $("hasHead").checked;
    T.headers = hh ? rows[0].map(function (h, i) { return F.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = hh ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    analyze();
  }
  function skipCols() { var s = {}; ["name", "group", "memo"].forEach(function (k) { if (T.cols[k] != null) s[T.cols[k]] = 1; }); return s; }
  function analyze() {
    prep();
    T.cols = F.guessCols(T.headers);
    $("shape").value = F.guessShape(T.headers, T.rows, ctx());
    if ($("shape").value === "wide") T.dateCols = F.guessDateCols(T.headers, ctx(), skipCols());
    S.kindMap = {};
    $("shapeBox").hidden = false;
    $("loadMsg").textContent = "読み込みました：" + NAME + "（" + T.rows.length + " 行・" + T.headers.length + " 列）";
    drawCols(); refresh();
  }
  var DEFS = {
    long: [["date", "日付"], ["name", "名前"], ["kind", "種類（欠席・振替など）"], ["count", "回数（任意）"], ["src", "振替元の欠席日（任意）"], ["group", "クラス・コース（任意）"], ["memo", "備考（任意）"]],
    pair: [["date", "欠席日"], ["name", "名前"], ["makeup", "振替日"], ["group", "クラス・コース（任意）"], ["memo", "備考（任意）"]],
    wide: [["name", "名前"], ["group", "クラス・コース（任意）"]]
  };
  function drawCols() {
    var shape = $("shape").value, el = $("cols");
    el.innerHTML = DEFS[shape].map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) {
        return '<option value="' + i + '"' + (T.cols[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete T.cols[s.dataset.k]; else T.cols[s.dataset.k] = +s.value; if (shape === "wide") drawDateCols(); refresh(); };
    });
    $("dcBox").hidden = shape !== "wide";
    if (shape === "wide") drawDateCols();
  }
  function drawDateCols() {
    var skip = skipCols();
    $("dcl").innerHTML = T.headers.map(function (h, i) {
      if (skip[i]) return "";
      return '<label><input type="checkbox" data-i="' + i + '"' + (T.dateCols.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("");
    Array.prototype.forEach.call($("dcl").querySelectorAll("input"), function (c) {
      c.onchange = function () {
        var i = +c.dataset.i, a = T.dateCols.filter(function (x) { return x !== i; });
        if (c.checked) a.push(i);
        T.dateCols = a.sort(function (p, q) { return p - q; }); refresh();
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
        var d = F.decodeBytes(buf);
        setData(F.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }
  function cfg() { return { shape: $("shape").value, cols: T.cols, dateCols: T.dateCols, ctx: ctx(), kindMap: S.kindMap, headRows: $("hasHead").checked ? 1 : 0 }; }

  // ---------- 種類の割り当て ----------
  function drawKinds() {
    var c = cfg(), show = (c.shape === "long" && T.cols.kind != null) || c.shape === "wide";
    $("kindBox").hidden = !show;
    $("ruleH").textContent = (show ? "3" : "2") + ". 振替の決まり";
    if (!show) return;
    S.kinds = F.kindValues(T.headers, T.rows, c);
    $("kinds").innerHTML = S.kinds.length ? S.kinds.map(function (k, i) {
      var cur = S.kindMap.hasOwnProperty(k.v) ? S.kindMap[k.v] : k.guess;
      return "<label>「" + esc(k.v) + "」（" + k.n + " 件）</label><select data-i=\"" + i + "\">" + F.KINDS.map(function (x) {
        return '<option value="' + x + '"' + (x === cur ? " selected" : "") + ">" + F.KIND_LABEL[x] + "</option>"; }).join("") + "</select>";
    }).join("") : '<span class="note">種類の欄に書かれた値がありません。</span>';
    Array.prototype.forEach.call($("kinds").querySelectorAll("select"), function (s) {
      s.onchange = function () { S.kindMap[S.kinds[+s.dataset.i].v] = s.value; compute(); };
    });
  }

  // ---------- 集計 ----------
  function refresh() { if (!RAW) return; drawKinds(); compute(); }
  function rule() { return { type: $("rType").value, n: +$("rN").value || 0 }; }
  function asof() { var v = $("asof").value; var d = v ? F.parseDate(v) : null; return d == null ? F.todayDay() : d; }
  function compute() {
    if (!RAW) return;
    $("rNL").hidden = /fiscal|none/.test($("rType").value);
    var t = F.toEntries(T.headers, T.rows, cfg());
    S.bad = t.bad;
    S.R = F.run(t.entries, { rule: rule(), cap: +$("cap").value || 0, advance: $("advance").checked, asof: asof(), soon: Math.max(0, +$("soon").value || 0), limit: LIMIT });
    var groups = {}; S.R.people.forEach(function (p) { if (p.group) groups[p.group] = 1; });
    var g = Object.keys(groups), cur = $("fGr").value;
    $("fGr").innerHTML = '<option value="">すべて</option>' + g.map(function (x) { return '<option' + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
    $("fGrL").hidden = !g.length;
    $("out").hidden = false;
    summary(); listView();
  }
  function people() {
    var g = $("fGr").value, only = $("onlyRem").checked;
    return S.R.people.filter(function (p) { return (!g || p.group === g) && (!only || p.remain > 0); })
      .map(function (p, i) { return [p, i]; })
      .sort(function (a, b) { return a[0].group.localeCompare(b[0].group, "ja") || a[1] - b[1]; }).map(function (x) { return x[0]; });
  }
  function inSel(p) { var g = $("fGr").value, only = $("onlyRem").checked; return (!g || p.group === g) && (!only || p.remain > 0); }
  function summary() {
    var R = S.R, t = R.total;
    var h = "基準日 <b>" + F.dayLabelW(R.asof) + "</b>（期限：" + esc(F.ruleLabel(R.rule)) + (R.cap ? "、1か月に " + R.cap + " 回まで" : "") + "）<br>" +
      R.people.length + " 人・振替のできる欠席 " + (t.absN - t.capped) + " 回" + (t.capped ? "（上限超え " + t.capped + " 回は除く）" : "") + "／振替済み <b class=\"used\">" + t.used + "</b>・" +
      "<b class=\"rem\">残り " + t.remain + "</b>（うち期限が近い <b class=\"soon\">" + t.soonN + "</b>）・期限切れ <b class=\"exp\">" + t.expired + "</b>";
    if (t.noCredit) h += "・<b class=\"warn\">残りがないのに受けた振替 " + t.noCredit + "</b>";
    if (t.lateN) h += "・期限後に使った分 " + t.lateN;
    if (R.cut) h += '<br><span class="warn">お試し版のため、先頭 ' + LIMIT + " 人だけを数えています（ほか " + R.cut + " 人）。</span>";
    $("sumMsg").innerHTML = h;
    $("errView").innerHTML = S.bad.length ? '<h3 class="warn">読めなかった行（' + S.bad.length + " 件・数えていません）</h3><div class=\"scroll\" style=\"max-height:200px\"><table class=\"lt\"><tr><th>行</th><th>名前</th><th>理由</th><th>書かれていた内容</th></tr>" +
      S.bad.map(function (b) { return "<tr><td>" + b.row + "</td><td>" + esc(b.name || "") + "</td><td>" + esc(b.why) + "</td><td>" + esc(b.raw) + "</td></tr>"; }).join("") + "</table></div>" : "";
  }
  function nextExpTxt(p) { return p.nextExp == null ? (p.remain ? "期限なし" : "") : L(p.nextExp) + (p.nextExpN > 1 ? "（" + p.nextExpN + "回分）" : ""); }
  function tbl(head, rows, nIdx) {
    nIdx = nIdx || {};
    return '<div class="scroll"><table class="lt"><tr>' + head.map(function (h, i) { return "<th" + (nIdx[i] ? ' class="n"' : "") + ">" + h + "</th>"; }).join("") + "</tr>" +
      (rows.length ? rows.join("") : '<tr><td colspan="' + head.length + '" class="nr">該当なし</td></tr>') + "</table></div>";
  }
  function listView() {
    var v = $("view").value, R = S.R, html = "";
    if (v === "per") {
      html = tbl(["名前", "クラス", "欠席", "振替済み", "残り", "次の期限", "期限が近い", "期限切れ", "残りなしの振替", "振替なしの欠席", "最後の記録"],
        people().map(function (p) {
          return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.group) + '</td><td class="n">' + p.absN + (p.capped ? '<span class="cap">（上限超え' + p.capped + "）</span>" : "") + '</td><td class="n used">' + p.used +
            '</td><td class="n rem">' + p.remain + "</td><td" + (p.soonN ? ' class="soon"' : "") + ">" + nextExpTxt(p) + '</td><td class="n soon">' + (p.soonN || "") + '</td><td class="n exp">' + (p.expired || "") +
            '</td><td class="n warn">' + (p.noCredit || "") + '</td><td class="n nr">' + (p.absNoN || "") + "</td><td>" + L(p.lastDay) + "</td></tr>";
        }), { 2: 1, 3: 1, 4: 1, 6: 1, 7: 1, 8: 1, 9: 1 });
    } else if (v === "recs") {
      html = tbl(["日付", "名前", "クラス", "書かれていた内容", "数え方", "結果", "元の行"],
        R.recs.filter(function (e) { return inSel(byKey(e.key)); }).map(function (e) {
          return "<tr><td>" + F.dayLabelW(e.day) + "</td><td>" + esc(e.name) + "</td><td>" + esc(e.group) + "</td><td>" + esc(e.raw) + (e.n > 1 ? "×" + e.n : "") + "</td><td>" + F.KIND_LABEL[e.kind] +
            '</td><td class="' + e.cls + '">' + esc(e.mark) + '</td><td class="n">' + e.row + (e.col ? "（" + esc(e.col) + "）" : "") + "</td></tr>";
        }), { 6: 1 });
    } else if (v === "soon" || v === "exp") {
      var list = (v === "soon" ? R.soonList : R.expList).filter(function (c) { return inSel(c.person); });
      html = '<p class="note">' + (v === "soon" ? "基準日から " + R.soon + " 日以内に期限が来る、まだ使っていない振替です（期限の近い順）。" : "基準日の時点で期限を過ぎた、使っていない振替です（期限の新しい順）。") + "</p>" +
        tbl(["名前", "クラス", "欠席日", "期限", v === "soon" ? "残りの日数" : "過ぎた日数", "その人の残り"], list.map(function (c) {
          return "<tr><td>" + esc(c.person.name) + "</td><td>" + esc(c.person.group) + "</td><td>" + F.dayLabelW(c.day) + "</td><td class=\"" + (v === "soon" ? "soon" : "exp") + "\">" + F.dayLabelW(c.exp) +
            '</td><td class="n">' + (v === "soon" ? F.leftLabel(c.left) : (R.asof - c.exp) + "日") + '</td><td class="n rem">' + c.person.remain + "</td></tr>";
        }), { 4: 1, 5: 1 });
    } else {
      html = '<p class="note">残りがないのに受けた振替、期限を過ぎて使った分、上限を超えた欠席、取り消す分がなかった調整の一覧です。</p>' +
        tbl(["日付", "名前", "クラス", "書かれていた内容", "結果", "元の行"], R.recs.filter(function (e) { return (e.cls === "warn" || e.cls === "cap") && inSel(byKey(e.key)); }).map(function (e) {
          return "<tr><td>" + F.dayLabelW(e.day) + "</td><td>" + esc(e.name) + "</td><td>" + esc(e.group) + "</td><td>" + esc(e.raw) + '</td><td class="' + e.cls + '">' + esc(e.mark) + '</td><td class="n">' + e.row + "</td></tr>";
        }), { 5: 1 });
    }
    $("listView").innerHTML = html;
  }
  function byKey(k) { if (!S.byKey || S.byKeyR !== S.R) { S.byKey = {}; S.byKeyR = S.R; S.R.people.forEach(function (p) { S.byKey[p.key] = p; }); } return S.byKey[k]; }

  // ---------- 印刷 ----------
  function title() { return F.norm($("title").value) || "振替の残り"; }
  function head(sub) {
    var R = S.R, g = $("fGr").value;
    return "<h1>" + esc(title()) + "　" + sub + "</h1><div class=\"per\">基準日 " + F.dayLabelW(R.asof) + "　期限：" + esc(F.ruleLabel(R.rule)) + (g ? "　クラス：" + esc(g) : "") + "</div>";
  }
  function doPrint(html, land) {
    $("pageSize").textContent = "@page{size:A4 " + (land ? "landscape" : "portrait") + ";margin:10mm}";
    $("printArea").innerHTML = html;
    window.print();
  }
  function printCards() {
    var R = S.R, ps = people(), msg = $("msg").value.trim(), pages = [];
    var cards = ps.map(function (p) {
      var rows = p.remainList.slice(0, 6).map(function (c) {
        return "<tr><td>" + F.dayLabelW(c.day) + (c.from.kind === "add" ? "（追加）" : "の欠席") + "</td><td>" + (c.exp == null ? "期限なし" : F.dayLabelW(c.exp) + "まで") + (c.soon ? " ★" : "") + "</td></tr>";
      }).join("");
      if (p.remainList.length > 6) rows += '<tr><td colspan="2">ほか ' + (p.remainList.length - 6) + " 回分</td></tr>";
      return '<div class="card"><div class="ct">' + esc(title()) + "　振替のお知らせ（" + L(R.asof) + " 現在）</div>" +
        '<div class="nm">' + esc(p.name) + " さん" + (p.group ? '<span class="gr">' + esc(p.group) + "</span>" : "") + "</div>" +
        '<div class="big">振替の残り <b>' + p.remain + "</b> 回" + (p.soonN ? "（★ 期限が近い " + p.soonN + " 回）" : "") + "</div>" +
        (rows ? "<table><tr><th>どの分</th><th>振替の期限</th></tr>" + rows + "</table>" : "<div>残っている振替はありません。</div>") +
        '<div class="ct" style="margin-top:1mm">これまで：欠席 ' + p.absN + " 回・振替済み " + p.used + " 回" + (p.expired ? "・期限切れ " + p.expired + " 回" : "") + "</div>" +
        (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") + "</div>";
    });
    for (var i = 0; i < cards.length; i += 8) pages.push('<div class="pg"><div class="cards">' + cards.slice(i, i + 8).join("") + "</div></div>");
    doPrint(pages.join("") || "<p>該当する人がいません。</p>", false);
  }
  function printPer() {
    var rows = people().map(function (p) {
      return '<tr><td class="l">' + esc(p.name) + '</td><td class="l">' + esc(p.group) + "</td><td>" + p.absN + "</td><td>" + p.used + "</td><td><b>" + p.remain + '</b></td><td class="l">' + nextExpTxt(p) + "</td><td>" + (p.soonN || "") + "</td><td>" + (p.expired || "") + "</td><td>" + (p.noCredit || "") + "</td></tr>";
    }).join("");
    doPrint(head("1人ごとの振替の残り") + '<table class="pt"><tr><th class="l">名前</th><th class="l">クラス</th><th>欠席</th><th>振替済み</th><th>残り</th><th class="l">次の期限</th><th>期限が近い</th><th>期限切れ</th><th>残りなしの振替</th></tr>' + rows + "</table>", true);
  }
  function printSoon() {
    var R = S.R, rows = R.soonList.filter(function (c) { return inSel(c.person); }).map(function (c) {
      return '<tr><td class="l">' + esc(c.person.name) + '</td><td class="l">' + esc(c.person.group) + '</td><td class="l">' + F.dayLabelW(c.day) + '</td><td class="l"><b>' + F.dayLabelW(c.exp) + "</b></td><td>" + F.leftLabel(c.left) + "</td><td>" + c.person.remain + "</td></tr>";
    }).join("");
    doPrint(head("期限が近い振替（" + R.soon + " 日以内）") + '<table class="pt"><tr><th class="l">名前</th><th class="l">クラス</th><th class="l">欠席日</th><th class="l">期限</th><th>残りの日数</th><th>その人の残り</th></tr>' + (rows || '<tr><td class="l" colspan="6">該当なし</td></tr>') + "</table>", false);
  }

  // ---------- 保存 ----------
  function rowsPer() {
    return [["名前", "クラス", "欠席", "うち上限超え", "振替なしの欠席", "振替済み", "残り", "次の期限", "期限が近い", "期限切れ", "残りなしの振替", "期限後に使った分", "最後の記録", "残りの内訳（欠席日→期限）"]].concat(people().map(function (p) {
      return [p.name, p.group, p.absN, p.capped, p.absNoN, p.used, p.remain, p.nextExp == null ? "" : F.dayIso(p.nextExp), p.soonN, p.expired, p.noCredit, p.lateN, F.dayIso(p.lastDay),
        p.remainList.map(function (c) { return L(c.day) + "→" + (c.exp == null ? "期限なし" : L(c.exp)); }).join("、")];
    }));
  }
  function rowsRecs() {
    return [["日付", "名前", "クラス", "書かれていた内容", "回数", "数え方", "結果", "元の行"]].concat(S.R.recs.filter(function (e) { return inSel(byKey(e.key)); }).map(function (e) {
      return [F.dayIso(e.day), e.name, e.group, e.raw, e.n, F.KIND_LABEL[e.kind], e.mark, e.row + (e.col ? "（" + e.col + "）" : "")];
    }));
  }
  function rowsCred(list, soon) {
    return [["名前", "クラス", "欠席日", "期限", soon ? "残りの日数" : "過ぎた日数", "その人の残り"]].concat(list.filter(function (c) { return inSel(c.person); }).map(function (c) {
      return [c.person.name, c.person.group, F.dayIso(c.day), F.dayIso(c.exp), soon ? c.left : S.R.asof - c.exp, c.person.remain];
    }));
  }
  function rowsBad() { return [["行", "名前", "理由", "書かれていた内容"]].concat(S.bad.map(function (b) { return [b.row, b.name || "", b.why, b.raw]; })); }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + "_" + F.dayIso(S.R.asof) + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h) { return { wch: Math.max(8, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsPer();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsRecs()), "記録の一覧");
    XLSX.utils.book_append_sheet(wb, sheet(rowsCred(S.R.soonList, true)), "期限が近い");
    XLSX.utils.book_append_sheet(wb, sheet(rowsCred(S.R.expList, false)), "期限切れ");
    if (S.bad.length) XLSX.utils.book_append_sheet(wb, sheet(rowsBad()), "読めなかった行");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（名前・記録は保存しない） ----------
  var KEY = "furikae-nokori";
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var SET = ["rType", "rN", "cap", "soon", "view"];
  function saveSettings() { var o = {}; SET.forEach(function (k) { o[k] = $(k).value; }); o.advance = $("advance").checked; o.title = $("title").value; o.msg = $("msg").value; saveJSON(KEY, o); }
  function loadSettings() { var o = loadJSON(KEY) || {}; SET.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); if (o.advance != null) $("advance").checked = o.advance; if (o.title) $("title").value = o.title; if (o.msg) $("msg").value = o.msg; }

  // ---------- 見本（架空の名前・記録。今日から数えた日付で作る） ----------
  function sample() {
    var today = F.todayDay(), wd = ((today % 7) + 11) % 7; // 0=日
    var sat = today - ((wd + 1) % 7); // 直近の土曜
    var kids = [["青木 さくら", "土10時"], ["石井 蓮", "土10時"], ["上田 葵", "土10時"], ["江藤 陽向", "土10時"], ["大野 結衣", "土11時"], ["加藤 湊", "土11時"], ["木村 凛", "土11時"], ["工藤 樹", "土11時"], ["小林 芽依", "火17時"], ["佐々木 悠真", "火17時"], ["清水 心春", "火17時"], ["高橋 朝陽", "火17時"]];
    // 週の番号（0＝16週前 … 15＝今週）ごとの記録。a＝欠席、u＝振替、n＝無断欠席
    var plan = [
      [[1, "a"], [3, "u"], [9, "a"], [14, "a"]],
      [[2, "a"], [5, "a"], [6, "u"], [12, "a"]],
      [[0, "a"], [13, "u"]],
      [[4, "a"], [7, "n"], [8, "a"], [10, "u"], [11, "a"], [12, "u"], [15, "u"]],
      [[6, "a"], [11, "a"], [13, "a"]],
      [[3, "a"], [4, "u"], [10, "a"]],
      [[7, "a"], [12, "a"]],
      [[1, "a"], [2, "a"], [3, "a"], [5, "u"], [6, "u"], [15, "a"]],
      [[6, "a"], [9, "u"], [14, "a"]],
      [[8, "n"], [12, "a"]],
      [[2, "a"], [4, "u"], [5, "u"], [13, "a"]],
      [[9, "a"], [14, "u"]]
    ];
    var rows = [["日付", "氏名", "クラス", "種類", "備考"]];
    var all = [];
    plan.forEach(function (pl, i) {
      var k = kids[i], tue = /火/.test(k[1]);
      pl.forEach(function (x) {
        var d = sat - (15 - x[0]) * 7 - (tue ? 4 : 0);
        if (x[1] === "u") d += tue ? 2 : -1; // 振替は別の曜日のクラスで受ける
        all.push([d, k[0], k[1], x[1] === "a" ? "欠席" : x[1] === "u" ? "振替" : "無断欠席", x[1] === "n" ? "連絡なし" : ""]);
      });
    });
    all.sort(function (a, b) { return a[0] - b[0]; });
    all.forEach(function (r) { rows.push([L(r[0]), r[1], r[2], r[3], r[4]]); });
    rows.splice(12, 0, ["10月ごろ", "上田 葵", "土10時", "欠席", "日付が不明"]);
    $("hasHead").checked = true;
    $("rType").value = "months"; $("rN").value = 2; $("cap").value = 0; $("advance").checked = false; $("soon").value = 14; $("asof").value = F.dayIso(today);
    $("title").value = "ひまわり音楽教室（見本）";
    setData(rows, "見本（架空の12人・16週分の欠席と振替）");
  }

  // ---------- 画面 ----------
  loadSettings();
  $("asof").value = F.dayIso(F.todayDay());
  $("year").value = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(F.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) analyze(); };
  $("shape").onchange = function () { if (!RAW) return; if ($("shape").value === "wide" && !T.dateCols.length) T.dateCols = F.guessDateCols(T.headers, ctx(), skipCols()); drawCols(); refresh(); };
  ["year", "fiscal"].forEach(function (k) { $(k).onchange = refresh; });
  ["rType", "rN", "cap", "advance", "asof", "soon"].forEach(function (k) { $(k).onchange = function () { saveSettings(); compute(); }; });
  ["view", "fGr", "onlyRem"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  ["title", "msg"].forEach(function (k) { $(k).onchange = saveSettings; });
  $("sample").onclick = sample;
  $("pCard").onclick = function () { if (S.R) printCards(); };
  $("pPer").onclick = function () { if (S.R) printPer(); };
  $("pSoon").onclick = function () { if (S.R) printSoon(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, F.toCSV(r)); done(n, r.length - 1); };
  $("cRecs").onclick = function () { if (!S.R) return; var r = rowsRecs(), n = fname("csv", "記録の一覧"); dl(n, F.toCSV(r)); done(n, r.length - 1); };
  $("rNL").hidden = /fiscal|none/.test($("rType").value);
})();
