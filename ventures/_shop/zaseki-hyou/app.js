/* 座席表の作成 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var Z = window.ZASEKI;
  var LIMIT = window.ZASEKI_LIMIT || Infinity; // お試し版は先頭の人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], total: 0, L: null, P: null, res: null, unused: {}, names: [], nameCol: 0, avoidCol: -1, frontBack: false, problems: [], pick: -1 };

  // ---------- 読み込み ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="-1">（使わない）</option>' : "") + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r.map(function (v) { return String(v == null ? "" : v); }); });
    S.headers = hasHead ? rows[0].map(function (h, i) { return Z.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    S.res = null;
    var nc = Z.guessName(S.headers), av = Z.guessAvoid(S.headers, S.rows);
    $("nameCol").innerHTML = opts(nc, false);
    $("sortCol").innerHTML = opts(0, false);
    $("fixCol").innerHTML = opts(Z.guessFixed(S.headers), true);
    $("frontCol").innerHTML = opts(Z.guessFront(S.headers), true);
    $("avoidCol").innerHTML = opts(-1, true);
    $("subCol").innerHTML = opts(av, true);
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + S.total + " 人分を読み込みました。名前の列：" + S.headers[nc] + "。") +
      (S.total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを座席表に入れます。</span>" : "");
    // 人数に合う並びの目安（スクール形式・通路2席ごと・横6席）
    if (!$("rows").dataset.touched) $("rows").value = Math.max(1, Math.ceil(S.rows.length / (+$("cols").value || 6)));
    $("step2").hidden = false; $("out").hidden = true;
    seatMsg();
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
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = Z.decodeBytes(buf);
        setData(Z.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 机の並び ----------
  function ltype() { return document.querySelector("input[name=ltype]:checked").value; }
  function num(id, lo, hi) { var v = parseInt($(id).value, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function layout() {
    if (ltype() === "island") return Z.buildSeats({ type: "island", irows: num("irows", 1, 20), icols: num("icols", 1, 20), srows: num("srows", 1, 10), scols: num("scols", 1, 10) });
    return Z.buildSeats({ type: "school", rows: num("rows", 1, 60), cols: num("cols", 1, 40), aisle: +$("aisle").value, order: $("order").value });
  }
  function seatMsg() {
    var L = layout(), u = Z.parseNums($("unused").value, L.seats.length), nu = Object.keys(u.set).length, use = L.seats.length - nu;
    var t = "席 " + L.seats.length + "（使う席 " + use + "）／名簿 " + S.rows.length + " 人。";
    if (S.rows.length > use) t += '<span class="wtxt">席が ' + (S.rows.length - use) + " 席足りません。</span>";
    else if (S.rows.length) t += "空く席 " + (use - S.rows.length) + "。";
    if (u.bad.length) t += '<span class="wtxt">使わない席の番号で読めない・席の数を超えるもの：' + esc(u.bad.join("、")) + "</span>";
    $("seatMsg").innerHTML = t;
  }

  // ---------- 作る ----------
  function run() {
    if (!S.rows.length) return;
    var L = layout(), max = L.seats.length;
    var nc = +$("nameCol").value, fixCol = +$("fixCol").value, frontCol = +$("frontCol").value, avoidCol = +$("avoidCol").value, sortCol = +$("sortCol").value;
    var how = document.querySelector("input[name=how]:checked").value;
    var u = Z.parseNums($("unused").value, max), problems = [], fixBad = [];
    var P = S.rows.map(function (r, i) {
      var fx = null;
      if (fixCol >= 0) { fx = Z.parseSeatNo(r[fixCol], max); if (fx === -1) { fixBad.push((i + 2) + "行目「" + Z.clean(r[fixCol]) + "」"); fx = null; } }
      return { fixed: fx, front: frontCol >= 0 && Z.truthy(r[frontCol]), cat: avoidCol >= 0 ? Z.clean(r[avoidCol]).normalize("NFKC") : "", key: r[sortCol] };
    });
    if (fixBad.length) problems.push("席を決めてある列で、席番号として読めない・席の数（" + max + "）を超える値は空欄として扱いました：" + fixBad.slice(0, 8).join("、") + (fixBad.length > 8 ? " ほか" + (fixBad.length - 8) + "件" : ""));
    if (u.bad.length) problems.push("使わない席の番号で読めないもの：" + u.bad.join("、"));
    var seed = Math.max(1, parseInt($("seed").value, 10) || 1);
    var res = Z.assign(L, P, { order: how, seed: seed, desc: $("desc").checked, avoid: avoidCol >= 0, frontBack: $("frontBack").checked, unused: u.set });
    var names = S.rows.map(function (r) { return Z.clean(r[nc]); });
    res.problems.forEach(function (p) {
      if (p.t === "dupFixed") problems.push((p.i + 2) + "行目の「" + names[p.i] + "」は、席 " + p.no + " を " + names[p.other] + " さんと重ねて決めてあるため、席に入れていません。");
      if (p.t === "unusedFixed") problems.push((p.i + 2) + "行目の「" + names[p.i] + "」の席 " + p.no + " は「使わない席」に入っているため、席に入れていません。");
    });
    if (res.overflow.length) problems.push("席が足りず、" + res.overflow.length + " 人が席に入っていません：" + res.overflow.slice(0, 10).map(function (i) { return names[i]; }).join("、") + (res.overflow.length > 10 ? " ほか" : "") + "（下の一覧では席番号が空欄です）");
    var frontN = P.filter(function (p) { return p.front; }).length;
    S.L = L; S.P = P; S.res = res; S.unused = u.set; S.names = names; S.nameCol = nc; S.avoidCol = avoidCol; S.frontBack = $("frontBack").checked; S.problems = problems; S.frontN = frontN; S.pick = -1; S.how = how;
    $("out").hidden = false;
    render();
  }

  // ---------- 表示 ----------
  function seatLabel(s) { return S.L.type === "island" ? "島" + s.island + "-" + s.inIsland : (s.r + 1) + "行目・左から" + (s.c + 1); }
  function sameSet() { var m = {}; Z.samePairs(S.L, S.P, S.res.personAt, S.frontBack).forEach(function (q) { m[q[0]] = 1; m[q[1]] = 1; }); return m; }
  function render() {
    var L = S.L, res = S.res, li = [];
    var seated = res.seatOf.filter(function (x) { return x >= 0; }).length, use = L.seats.filter(function (s) { return !S.unused[s.no]; }).length;
    var head = "<b>" + seated + " 人を席に入れました（使う席 " + use + "、空いている席 " + (use - seated) + "）。</b>" + (S.total > LIMIT ? '<span class="wtxt">（お試し版：先頭 ' + LIMIT + " 人）</span>" : "");
    if (S.avoidCol >= 0) {
      var sp = Z.samePairs(L, S.P, res.personAt, S.frontBack);
      li.push(sp.length ? '<span class="wtxt">「' + esc(S.headers[S.avoidCol]) + "」が同じ人の隣り合わせが " + sp.length + " 組残っています（色の付いた席）。</span>人数の多い値があると、0 にできないことがあります。"
        : '<span class="ok">「' + esc(S.headers[S.avoidCol]) + "」が同じ人どうしは、どこも隣り合っていません" + (L.type === "island" ? "（同じ島にいません）" : "") + "。</span>");
    }
    if (S.frontN) {
      var rowsUsed = {}; S.P.forEach(function (p, i) { if (p.front && res.seatOf[i] >= 0) rowsUsed[L.seats[res.seatOf[i]].r + 1] = 1; });
      li.push("前の方の席にする人 " + S.frontN + " 人は、前から " + Object.keys(rowsUsed).map(Number).sort(function (a, b) { return a - b; }).join("・") + " 行目に入れました" + (L.type === "island" ? "（島型では、島の中の前の列）" : "") + "。");
    }
    var fxN = S.P.filter(function (p, i) { return p.fixed != null && res.seatOf[i] >= 0 && L.seats[res.seatOf[i]].no === p.fixed; }).length;
    if (fxN) li.push("席を決めてある人 " + fxN + " 人は、その席に入れました（青い席）。");
    if (S.avoidCol >= 0 && S.how !== "random") li.push("隣どうしで同じ値にしないため席を入れ替えたので、名簿の順・並べ替えの順どおりにはなっていません。");
    S.problems.forEach(function (p) { li.push('<span class="wtxt">' + esc(p) + "</span>"); });
    $("msg").innerHTML = head + (li.length ? "<ul>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "");
    drawMap();
    drawList();
  }
  function tracks(L, front) {
    // 席のある行・列は 1fr、すき間（通路・島の間）は細く
    var rowHas = [], colHas = [];
    L.seats.forEach(function (s) { var v = Z.viewPos(L, s, front); rowHas[v.gr] = 1; colHas[v.gc] = 1; });
    var c = [], r = [];
    for (var j = 0; j < L.gridCols; j++) c.push(colHas[j] ? 1 : 0.35);
    for (var i = 0; i < L.gridRows; i++) r.push(rowHas[i] ? 1 : 0.35);
    return { c: c, r: r };
  }
  function drawMap() {
    var L = S.L, res = S.res, front = $("view").value, sub = +$("subCol").value, ss = S.avoidCol >= 0 ? sameSet() : {};
    var T = tracks(L, front), cw = Math.max(64, Math.min(120, Math.floor(1000 / L.gridCols)));
    var g = '<div class="grid" style="grid-template-columns:' + T.c.map(function (x) { return x === 1 ? cw + "px" : Math.round(cw * 0.3) + "px"; }).join(" ") + '">';
    L.seats.forEach(function (s, si) {
      var v = Z.viewPos(L, s, front), p = res.personAt[si], off = !!S.unused[s.no];
      var cls = "seat" + (off ? " off" : p < 0 ? " empty" : "") + (ss[si] ? " same" : "") + (si === S.pick ? " pick" : "") + (p >= 0 && S.P[p].fixed === s.no ? " fx" : "");
      g += '<div class="' + cls + '" data-si="' + si + '" style="grid-row:' + (v.gr + 1) + ";grid-column:" + (v.gc + 1) + '" title="席 ' + s.no + "（" + esc(seatLabel(s)) + "）" + '"><span class="no">' + s.no + "</span>" +
        (off ? '<span class="sb">使わない</span>' : p >= 0 ? '<span class="nm">' + esc(S.names[p] || "（名前なし）") + "</span>" + (sub >= 0 && S.rows[p][sub] ? '<span class="sb">' + esc(S.rows[p][sub]) + "</span>" : "") : '<span class="sb">空き</span>') + "</div>";
    });
    g += "</div>";
    var fb = '<div class="front" style="width:' + Math.min(60, 100) + '%">' + esc($("frontText").value || "前") + "</div>";
    $("map").innerHTML = front === "bottom" ? g + fb : fb + g;
    Array.prototype.forEach.call(document.querySelectorAll("#map .seat"), function (el) {
      el.onclick = function () {
        var si = +el.getAttribute("data-si");
        if (S.unused[S.L.seats[si].no]) return;
        if (S.pick < 0) { S.pick = si; drawMap(); return; }
        if (S.pick === si) { S.pick = -1; drawMap(); return; }
        var a = S.pick, b = si, pa = S.res.personAt[a], pb = S.res.personAt[b];
        S.res.personAt[a] = pb; S.res.personAt[b] = pa;
        if (pa >= 0) S.res.seatOf[pa] = b; if (pb >= 0) S.res.seatOf[pb] = a;
        S.pick = -1; render();
      };
    });
  }
  function listRows(order) {
    var idx = S.rows.map(function (_, i) { return i; });
    if (order === "seat") idx.sort(function (a, b) { var x = S.res.seatOf[a], y = S.res.seatOf[b]; if (x < 0 && y < 0) return a - b; if (x < 0) return 1; if (y < 0) return -1; return S.L.seats[x].no - S.L.seats[y].no; });
    else if (order === "name") idx.sort(function (a, b) { return Z.cmpVal(S.names[a], S.names[b]) || a - b; });
    return idx;
  }
  function noHead() { return S.headers.indexOf("席番号") >= 0 ? "割り当てた席番号" : "席番号"; }
  function posCols() { return S.L.type === "island" ? ["島", "島の中の番号"] : ["前から何行目", "左から何席目"]; }
  function posVals(si) { if (si < 0) return ["", ""]; var s = S.L.seats[si]; return S.L.type === "island" ? [s.island, s.inIsland] : [s.r + 1, s.c + 1]; }
  function drawList() {
    var idx = listRows("seat");
    var h = '<table class="lt"><thead><tr><th>' + noHead() + "</th><th>" + posCols().join("</th><th>") + "</th>" + S.headers.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
    idx.forEach(function (i) { var si = S.res.seatOf[i]; h += "<tr><td>" + (si >= 0 ? S.L.seats[si].no : "") + "</td><td>" + posVals(si).join("</td><td>") + "</td>" + S.rows[i].map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") + "</tr>"; });
    $("list").innerHTML = h + "</tbody></table>";
  }

  // ---------- 印刷 ----------
  function setPage(o) { $("pageStyle").textContent = "@page{size:A4 " + o + ";margin:12mm}"; }
  function fitPt(text, wmm, maxPt) { var n = 0; for (var i = 0; i < text.length; i++) n += text.charCodeAt(i) < 0x2000 ? 0.55 : 1; return Math.max(5, Math.min(maxPt, (wmm - 1.6) / (Math.max(1, n) * 0.353))); }
  function head() {
    var title = $("title").value.trim() || "座席表";
    return "<h1>" + esc(title) + "</h1>" + '<p class="per">' + S.res.seatOf.filter(function (x) { return x >= 0; }).length + " 人　/　作成日 " + new Date().toLocaleDateString("ja-JP") + "</p>";
  }
  function printMap() {
    if (!S.res) return;
    var L = S.L, res = S.res, o = $("paper").value, front = $("view").value, sub = +$("subCol").value, showNo = $("showNo").checked;
    setPage(o);
    var W = o === "landscape" ? 273 : 186, Hh = o === "landscape" ? 150 : 235; // 表題・前の表示・一言を除いたおよその高さ
    if ($("foot").value.trim()) Hh -= 12;
    var T = tracks(L, front), gap = 1.5;
    var cs = T.c.reduce(function (a, b) { return a + b; }, 0), rs = T.r.reduce(function (a, b) { return a + b; }, 0);
    var unitW = (W - gap * (T.c.length - 1)) / cs, unitH = Math.min(26, (Hh - gap * (T.r.length - 1)) / rs);
    var g = '<div class="pgrid" style="grid-template-columns:' + T.c.map(function (x) { return (x * unitW).toFixed(2) + "mm"; }).join(" ") + ";grid-template-rows:" + T.r.map(function (x) { return (x * unitH).toFixed(2) + "mm"; }).join(" ") + '">';
    var maxPt = Math.min(16, unitH / 0.353 * 0.45);
    L.seats.forEach(function (s, si) {
      var v = Z.viewPos(L, s, front), p = res.personAt[si], off = !!S.unused[s.no], nm = p >= 0 ? (S.names[p] || "") : "";
      var sb = p >= 0 && sub >= 0 ? Z.clean(S.rows[p][sub]) : "";
      g += '<div class="pseat' + (off ? " off" : p < 0 ? " empty" : "") + '" style="grid-row:' + (v.gr + 1) + ";grid-column:" + (v.gc + 1) + '">' + (showNo ? '<span class="no">' + s.no + "</span>" : "") +
        (nm ? '<span class="nm" style="font-size:' + fitPt(nm, unitW, maxPt).toFixed(1) + 'pt">' + esc(nm) + "</span>" : "") +
        (sb ? '<span class="sb" style="font-size:' + Math.min(7.5, fitPt(sb, unitW, 7.5)).toFixed(1) + 'pt">' + esc(sb) + "</span>" : "") + "</div>";
    });
    g += "</div>";
    var fb = '<div class="pfront">' + esc($("frontText").value || "前") + "</div>";
    var foot = $("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "";
    $("printArea").innerHTML = head() + (front === "bottom" ? g + fb : fb + g) + foot;
    window.print();
  }
  function printList() {
    if (!S.res) return;
    setPage("portrait");
    var idx = listRows($("listOrder").value), sub = +$("subCol").value;
    var h = head() + '<table class="pl"><thead><tr><th>席番号</th><th>' + esc(S.headers[S.nameCol]) + "</th>" + (sub >= 0 ? "<th>" + esc(S.headers[sub]) + "</th>" : "") + "<th>" + posCols().join("</th><th>") + "</th></tr></thead><tbody>";
    idx.forEach(function (i) { var si = S.res.seatOf[i]; h += "<tr><td>" + (si >= 0 ? S.L.seats[si].no : "（席なし）") + "</td><td>" + esc(S.names[i]) + "</td>" + (sub >= 0 ? "<td>" + esc(S.rows[i][sub]) + "</td>" : "") + "<td>" + posVals(si).join("</td><td>") + "</td></tr>"; });
    $("printArea").innerHTML = h + "</tbody></table>";
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function done(name) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (S.total > LIMIT ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function tableRows() {
    var out = [[noHead()].concat(posCols(), S.headers)];
    listRows("seat").forEach(function (i) { var si = S.res.seatOf[i]; out.push([si >= 0 ? S.L.seats[si].no : ""].concat(posVals(si), S.rows[i])); });
    return out;
  }
  function mapRows() {
    var L = S.L, front = $("view").value, grid = [], i, j;
    for (i = 0; i < L.gridRows; i++) { grid.push([]); for (j = 0; j < L.gridCols; j++) grid[i].push(""); }
    L.seats.forEach(function (s, si) { var v = Z.viewPos(L, s, front), p = S.res.personAt[si]; grid[v.gr][v.gc] = S.unused[s.no] ? "（使わない）" : p >= 0 ? s.no + " " + (S.names[p] || "") : s.no + "（空き）"; });
    var fr = [$("frontText").value || "前"];
    var top = [[$("title").value.trim() || "座席表"], []];
    return front === "bottom" ? top.concat(grid, [[], fr]) : top.concat([fr, []], grid);
  }
  function sheet(rows, numCell) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) {
      if (k[0] === "!") return;
      var cell = ws[k], c = XLSX.utils.decode_cell(k);
      if (numCell && numCell(c.r, c.c) && /^-?\d+$/.test(cell.v)) { cell.t = "n"; cell.v = +cell.v; delete cell.z; }
      else { cell.t = "s"; cell.z = "@"; } // 電話番号などの先頭の0が消えないよう文字列のまま
    });
    return ws;
  }
  function saveX() {
    if (!S.res) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), m = sheet(mapRows());
    m["!cols"] = []; for (var j = 0; j < S.L.gridCols; j++) m["!cols"].push({ wch: 14 });
    XLSX.utils.book_append_sheet(wb, m, "座席表");
    XLSX.utils.book_append_sheet(wb, sheet(tableRows(), function (r, c) { return r > 0 && c <= 2; }), "席の一覧");
    var name = "座席表_" + ymd() + ".xlsx"; XLSX.writeFile(wb, name); done(name);
  }
  function saveC() {
    if (!S.res) return;
    var name = "座席表_席の一覧_" + ymd() + ".csv", blob = new Blob([Z.toCSV(tableRows())], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); done(name);
  }

  // ---------- 見本（架空の研修の参加者。氏名は説明用で、実在の人とは関係ありません） ----------
  var SAMPLE = (function () {
    var nm = ["見本 一郎", "見本 花子", "見本 二郎", "見本 春子", "見本 三郎", "見本 夏子", "見本 四郎", "見本 秋子", "見本 五郎", "見本 冬子", "見本 六郎", "見本 桜", "見本 七郎", "見本 楓", "見本 八郎", "見本 葵", "見本 九郎", "見本 菫", "見本 十郎", "見本 椿", "見本 健", "見本 翼", "見本 光", "見本 蓮"];
    var dep = ["総務", "総務", "総務", "総務", "営業", "営業", "営業", "営業", "営業", "営業", "製造", "製造", "製造", "製造", "製造", "製造", "製造", "開発", "開発", "開発", "開発", "開発", "人事", "人事"];
    var fr = ["", "", "", "", "", "", "○", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "○", "", ""];
    var fx = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "1"];
    var s = "受付番号\t氏名\t部署\t前の席の希望\t席番号\n";
    nm.forEach(function (n, i) { s += (i + 1) + "\t" + n + "\t" + dep[i] + "\t" + fr[i] + "\t" + fx[i] + "\n"; });
    return s;
  })();

  // ---------- 設定の保存（名簿の中身は保存しない） ----------
  var KEEP = ["title", "frontText", "paper", "aisle", "order", "cols"];
  function saveSettings() { try { var o = {}; KEEP.forEach(function (k) { o[k] = $(k).value; }); localStorage.setItem("zaseki-hyou", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("zaseki-hyou") || "{}"); KEEP.forEach(function (k) { if (o[k] != null && o[k] !== "") $(k).value = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(Z.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      $("paste").value = SAMPLE; $("hasHead").checked = true;
      document.querySelector("input[name=ltype][value=school]").checked = true; $("fsSchool").hidden = false; $("fsIsland").hidden = true;
      $("rows").value = 4; $("cols").value = 6; $("aisle").value = "2"; $("order").value = "row"; $("unused").value = ""; $("rows").dataset.touched = "1";
      setData(Z.parseCSV(SAMPLE), true, "見本");
      $("avoidCol").value = "2"; $("subCol").value = "2"; $("frontCol").value = "3"; $("fixCol").value = "4";
      document.querySelector("input[name=how][value=list]").checked = true;
    };
    Array.prototype.forEach.call(document.querySelectorAll("input[name=ltype]"), function (x) { x.onchange = function () { var isl = ltype() === "island"; $("fsSchool").hidden = isl; $("fsIsland").hidden = !isl; seatMsg(); }; });
    ["rows", "cols", "aisle", "order", "irows", "icols", "srows", "scols", "unused"].forEach(function (id) { $(id).addEventListener("input", seatMsg); $(id).addEventListener("change", seatMsg); });
    $("rows").addEventListener("input", function () { $("rows").dataset.touched = "1"; });
    $("go").onclick = run;
    $("again").onclick = function () { $("seed").value = (parseInt($("seed").value, 10) || 1) + 1; if (document.querySelector("input[name=how]:checked").value === "list" && +$("avoidCol").value < 0) document.querySelector("input[name=how][value=random]").checked = true; run(); };
    ["view", "subCol"].forEach(function (id) { $(id).onchange = function () { if (S.res) drawMap(); }; });
    $("frontText").oninput = function () { if (S.res) drawMap(); };
    KEEP.forEach(function (id) { $(id).addEventListener("change", saveSettings); });
    $("pMap").onclick = printMap; $("pList").onclick = printList;
    $("xSave").onclick = saveX; $("cSave").onclick = saveC;
  });
})();
