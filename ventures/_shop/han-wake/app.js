/* 班分け・グループ分け — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var H = window.HANWAKE;
  var LIMIT = window.HANWAKE_LIMIT || Infinity; // お試し版は先頭の人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", total: 0, g: null, k: 0, P: null, opt: null, bal: [], numCol: -1, prevCol: -1, fixCol: -1, nameCol: 0, style: "num", problems: [] };

  // ---------- 読み込み ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="-1">（使わない）</option>' : "") + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r.map(function (v) { return String(v == null ? "" : v); }); });
    S.headers = hasHead ? rows[0].map(function (h, i) { return H.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    S.total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    S.g = null;
    var nc = H.guessName(S.headers), bal = H.guessBalance(S.headers, S.rows).filter(function (i) { return i !== nc; });
    $("nameCol").innerHTML = opts(nc, false);
    $("balCols").innerHTML = S.headers.map(function (h, i) { return '<label><input type="checkbox" value="' + i + '"' + (bal.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>"; }).join("");
    $("numCol").innerHTML = opts(-1, true);
    $("prevCol").innerHTML = opts(H.guessPrev(S.headers), true);
    $("fixCol").innerHTML = opts(H.guessFixed(S.headers), true);
    $("showCols").innerHTML = S.headers.map(function (h, i) { return '<label><input type="checkbox" value="' + i + '"' + (i === nc || bal.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>"; }).join("");
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + S.total + " 人分を読み込みました。名前の列：" + S.headers[nc] + "。") +
      (bal.length ? "偏らないようにする列：" + esc(bal.map(function (i) { return S.headers[i]; }).join("、")) + "（変えられます）。" : "") +
      (S.total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを班分けします。</span>" : "");
    $("step2").hidden = false; $("out").hidden = true;
    sizeMsg();
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
        var d = H.decodeBytes(buf);
        setData(H.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 設定 ----------
  function mode() { return document.querySelector('input[name=mode]:checked').value; }
  function sizes() { return H.sizesFor(S.rows.length, mode(), Math.max(1, parseInt(mode() === "size" ? $("kSize").value : $("kCount").value, 10) || 1)); }
  function sizeText(sz) {
    var c = {}; sz.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
    return sz.length + " 班（" + Object.keys(c).sort(function (a, b) { return b - a; }).map(function (x) { return x + "人×" + c[x]; }).join("、") + "）";
  }
  function sizeMsg() { if (S.rows.length) $("sizeMsg").textContent = S.rows.length + " 人を " + sizeText(sizes()) + " に分けます。"; }
  function checked(id) { return Array.prototype.map.call(document.querySelectorAll("#" + id + " input:checked"), function (x) { return +x.value; }); }

  // ---------- 班分け ----------
  function run() {
    if (!S.rows.length) return;
    var sz = sizes(), k = sz.length, style = $("style").value;
    var nc = +$("nameCol").value, bal = checked("balCols").filter(function (i) { return i !== nc; });
    var numCol = +$("numCol").value, prevCol = +$("prevCol").value, fixCol = +$("fixCol").value;
    var names = S.rows.map(function (r) { return H.clean(r[nc]); });
    var problems = [], fixedBad = [], numBad = 0;
    var P = S.rows.map(function (r, i) {
      var fx = null;
      if (fixCol >= 0) { fx = H.parseFixed(r[fixCol], style, k); if (fx === -1) { fixedBad.push((i + 2) + "行目「" + H.clean(r[fixCol]) + "」"); fx = null; } }
      var num = null;
      if (numCol >= 0 && H.clean(r[numCol]) !== "") { num = H.numOf(r[numCol]); if (num == null) numBad++; }
      return { cat: bal.map(function (c) { return H.clean(r[c]); }), num: num, fixed: fx, prev: prevCol >= 0 ? H.clean(r[prevCol]) : "" };
    });
    if (fixedBad.length) problems.push("班を決めてある列で、班として読めない・班の数を超える値は空欄として扱いました：" + fixedBad.slice(0, 8).join("、") + (fixedBad.length > 8 ? " ほか" + (fixedBad.length - 8) + "件" : ""));
    if (numBad) problems.push("平均をそろえる列で、数として読めない値が " + numBad + " 件あり、その人は平均に入れていません。");
    var fixedCnt = sz.map(function () { return 0; }); P.forEach(function (p) { if (p.fixed != null) fixedCnt[p.fixed]++; });
    fixedCnt.forEach(function (c, j) { if (c > sz[j]) problems.push(H.label(style, j) + "に決めてある人が " + c + " 人いて、班の人数（" + sz[j] + " 人）を超えています。ほかの班の人数が少なくなります。"); });
    var sp = H.parsePairs($("sepText").value, names), tp = H.parsePairs($("togText").value, names);
    sp.problems.forEach(function (p) { problems.push("同じ班にしない人：" + p); });
    tp.problems.forEach(function (p) { problems.push("同じ班にする人：" + p); });
    // 一緒にする組が重なっていたらまとめる
    var tog = mergeSets(tp.sets.map(function (s) { return s.ids; }), P.length);
    var mx = Math.max.apply(null, sz);
    tog.forEach(function (s) { if (s.length > mx) problems.push("同じ班にする人の組（" + s.map(function (i) { return names[i]; }).join("、") + "）が班の人数より多く、全員を同じ班にはできません。"); });
    var sep = sp.sets.map(function (s) { return s.ids; });
    // 同じ班にしない・する の両方に入っている組
    tog.forEach(function (t) { sep.forEach(function (s) { var both = s.filter(function (i) { return t.indexOf(i) >= 0; }); if (both.length >= 2) problems.push("「" + both.map(function (i) { return names[i]; }).join("、") + "」は、同じ班にする・しないの両方に入っています。"); }); });
    var seed = Math.max(1, parseInt($("seed").value, 10) || 1);
    var t0 = Date.now();
    var r = H.solve(P, { sizes: sz, seed: seed, sep: sep, tog: tog });
    S.g = r.g; S.k = k; S.P = P; S.opt = { sep: sep, tog: tog }; S.bal = bal; S.numCol = numCol; S.prevCol = prevCol; S.fixCol = fixCol; S.nameCol = nc; S.style = style; S.problems = problems; S.ms = Date.now() - t0; S.seed = seed;
    S.names = names; S.sizes = sz;
    $("out").hidden = false;
    render();
  }
  function mergeSets(sets, n) {
    var par = []; for (var i = 0; i < n; i++) par.push(i);
    function f(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    sets.forEach(function (s) { s.forEach(function (x) { par[f(x)] = f(s[0]); }); });
    var m = {}; sets.forEach(function (s) { s.forEach(function (x) { var r = f(x); (m[r] = m[r] || []); if (m[r].indexOf(x) < 0) m[r].push(x); }); });
    return Object.keys(m).map(function (r) { return m[r]; });
  }

  // ---------- 表示 ----------
  function members(j) { var a = []; S.g.forEach(function (gj, i) { if (gj === j) a.push(i); }); return a; }
  function render() {
    var rep = H.report(S.P, S.g, S.k, S.opt), names = S.names;
    S.rep = rep;
    var m = [];
    var szNow = rep.groups.map(function (G) { return G.n; });
    m.push('<b>' + S.rows.length + " 人を " + sizeText(szNow) + " に分けました。</b>" + (S.total > LIMIT ? '<span class="wtxt">（お試し版：先頭 ' + LIMIT + " 人）</span>" : ""));
    var li = [];
    if (S.opt.sep.length) li.push(rep.sepBad.length ? '<span class="wtxt">同じ班にしない人のうち、' + rep.sepBad.length + " 組が同じ班です：" + rep.sepBad.map(function (p) { return esc(names[p[0]] + "と" + names[p[1]]) + "（" + esc(lab(S.g[p[0]])) + "）"; }).join("、") + "</span>" : '<span class="ok">同じ班にしない人は、すべて別の班です。</span>');
    if (S.opt.tog.length) li.push(rep.togBad.length ? '<span class="wtxt">同じ班にする人のうち、' + rep.togBad.length + " 組がそろっていません。</span>" : '<span class="ok">同じ班にする人は、すべて同じ班です。</span>');
    if (S.prevCol >= 0) li.push("前回も同じ班だった人の組：" + rep.prevTotal + " 組" + (rep.prevTotal ? "（人数や前回の班の分かれ方によって、0 にできないことがあります）" : ""));
    S.bal.forEach(function (c, ci) {
      var wide = rep.spread[ci].filter(function (s) { return s.max - s.min >= 2; });
      li.push("「" + esc(S.headers[c]) + "」の班ごとの人数の差：" + (wide.length ? '<span class="wtxt">' + wide.map(function (s) { return esc(s.value || "（空欄）") + " " + s.min + "〜" + s.max + "人"; }).join("、") + "</span>（ほかの条件と両立しないため）" : '<span class="ok">どの値も、班による差は1人以内です。</span>'));
    });
    if (S.numCol >= 0) {
      var ms = rep.groups.map(function (G) { return G.numMean; }).filter(function (x) { return x != null; });
      if (ms.length) li.push("「" + esc(S.headers[S.numCol]) + "」の班ごとの平均：" + H.fix(Math.min.apply(null, ms), 1) + "〜" + H.fix(Math.max.apply(null, ms), 1));
    }
    S.problems.forEach(function (p) { li.push('<span class="wtxt">' + esc(p) + "</span>"); });
    m.push("<ul>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>");
    $("msg").innerHTML = m.join("");
    $("sumView").innerHTML = sumTable(rep, "lt");
    var sel = function (i) { var s = '<select data-i="' + i + '" title="別の班へ移す">'; for (var j = 0; j < S.k; j++) s += '<option value="' + j + '"' + (j === S.g[i] ? " selected" : "") + ">" + esc(lab(j)) + "</option>"; return s + "</select>"; };
    var h = "";
    for (var j = 0; j < S.k; j++) {
      var mem = members(j), G = rep.groups[j];
      h += '<div class="card"><h3>' + esc(lab(j)) + "<span>" + mem.length + " 人" + (S.numCol >= 0 && G.numMean != null ? "・平均 " + H.fix(G.numMean, 1) : "") + "</span></h3><ol>" +
        mem.map(function (i) {
          var at = S.bal.map(function (c) { return H.clean(S.rows[i][c]); }).filter(Boolean).join("・");
          return "<li>" + esc(names[i] || "（名前なし）") + (at ? ' <span class="attr">' + esc(at) + "</span>" : "") + (S.P[i].fixed != null ? ' <span class="fx">決めてある班</span>' : "") + sel(i) + "</li>";
        }).join("") + "</ol>" + (G.prevPairs.length ? '<div class="note">前回も同じ班：' + G.prevPairs.map(function (p) { return esc(names[p[0]] + "・" + names[p[1]]); }).join("、") + "</div>" : "") + "</div>";
    }
    $("cards").innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll("#cards select"), function (s) {
      s.onchange = function () { S.g[+s.getAttribute("data-i")] = +s.value; render(); };
    });
  }
  function lab(j) { return H.label(S.style, j); }
  function sumHead(rep) {
    var h = ["班", "人数"];
    S.bal.forEach(function (c, ci) { rep.vals[ci].forEach(function (v) { h.push(S.headers[c] + "：" + (v || "（空欄）")); }); });
    if (S.numCol >= 0) h.push(S.headers[S.numCol] + "の平均");
    if (S.prevCol >= 0) h.push("前回も同じ班の組");
    return h;
  }
  function sumRow(rep, j) {
    var G = rep.groups[j], r = [lab(j), G.n];
    S.bal.forEach(function (c, ci) { rep.vals[ci].forEach(function (v) { r.push(G.cats[ci][v]); }); });
    if (S.numCol >= 0) r.push(H.fix(G.numMean, 1));
    if (S.prevCol >= 0) r.push(G.prevPairs.length);
    return r;
  }
  function sumTable(rep, cls) {
    var hd = sumHead(rep);
    var h = '<table class="' + cls + '"><thead><tr>' + hd.map(function (x, i) { return "<th" + (i ? ' class="n"' : "") + ">" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
    for (var j = 0; j < S.k; j++) h += "<tr>" + sumRow(rep, j).map(function (x, i) { return "<td" + (i ? ' class="n"' : "") + ">" + esc(x) + "</td>"; }).join("") + "</tr>";
    return h + "</tbody></table>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function done(name) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (S.total > LIMIT ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, numCell) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) {
      if (k[0] === "!") return;
      var cell = ws[k], c = XLSX.utils.decode_cell(k);
      if (numCell && numCell(c.r, c.c) && /^-?\d+(\.\d+)?$/.test(cell.v)) { cell.t = "n"; cell.v = +cell.v; delete cell.z; }
      else { cell.t = "s"; cell.z = "@"; } // 電話番号などの先頭の0が消えないよう文字列のまま
    });
    return ws;
  }
  function groupRows() {
    var out = [["班", "班の中の番号"].concat(S.headers)];
    for (var j = 0; j < S.k; j++) members(j).forEach(function (i, x) { out.push([lab(j), x + 1].concat(S.rows[i])); });
    return out;
  }
  function addRows() { return [["班"].concat(S.headers)].concat(S.rows.map(function (r, i) { return [lab(S.g[i])].concat(r); })); }
  function save(which, kind) {
    if (!S.g) return;
    var rows = which === "group" ? groupRows() : addRows();
    var name = "名簿_" + (which === "group" ? "班ごとの名簿" : "班の列つき") + "_" + ymd() + "." + kind;
    if (kind === "csv") { dlBlob(H.toCSV(rows), name); done(name); return; }
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(rows, which === "group" ? function (r, c) { return r > 0 && c === 1; } : null), which === "group" ? "班ごとの名簿" : "班の列つき");
    if (which === "group") {
      var sr = [sumHead(S.rep)]; for (var j = 0; j < S.k; j++) sr.push(sumRow(S.rep, j));
      XLSX.utils.book_append_sheet(wb, sheet(sr, function (r, c) { return r > 0 && c > 0; }), "内訳");
    }
    XLSX.writeFile(wb, name); done(name);
  }

  // ---------- 印刷 ----------
  function printGroups() {
    if (!S.g) return;
    var title = $("title").value.trim() || "班分け", one = $("layout").value === "one";
    var cols = checked("showCols"); if (!cols.length) cols = [S.nameCol];
    var foot = $("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "";
    var h = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + S.rows.length + " 人・" + S.k + " 班　/　作成日 " + new Date().toLocaleDateString("ja-JP") + "</p>";
    if ($("pSumOn").checked) h += sumTable(S.rep, "pt");
    if (!one) h += foot;
    var body = "";
    for (var j = 0; j < S.k; j++) {
      var mem = members(j);
      body += '<div class="pg' + (one ? " one" : "") + '">' + (one ? '<p class="per">' + esc(title) + "</p>" : "") + "<h2>" + esc(lab(j)) + "（" + mem.length + " 人）</h2>" +
        '<table class="pt"><thead><tr><th class="no">番号</th>' + cols.map(function (c) { return "<th>" + esc(S.headers[c]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        mem.map(function (i, x) { return '<tr><td class="no">' + (x + 1) + "</td>" + cols.map(function (c) { return "<td>" + esc(S.rows[i][c]) + "</td>"; }).join("") + "</tr>"; }).join("") +
        "</tbody></table>" + (one ? foot : "") + "</div>";
    }
    $("printArea").innerHTML = one ? '<div class="pg one">' + h + "</div>" + body : h + body;
    window.print();
  }

  // ---------- 見本（架空の研修の参加者。氏名は説明用で、実在の人とは関係ありません） ----------
  var SAMPLE = (function () {
    var nm = ["見本 一郎", "見本 花子", "見本 二郎", "見本 春子", "見本 三郎", "見本 夏子", "見本 四郎", "見本 秋子", "見本 五郎", "見本 冬子", "見本 六郎", "見本 桜", "見本 七郎", "見本 楓", "見本 八郎", "見本 葵", "見本 九郎", "見本 菫", "見本 十郎", "見本 椿", "見本 健", "見本 翼"];
    var sex = ["男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "女", "男", "男"];
    var dep = ["総務", "営業", "営業", "製造", "製造", "総務", "営業", "製造", "総務", "営業", "製造", "営業", "総務", "製造", "営業", "総務", "製造", "営業", "総務", "製造", "営業", "製造"];
    var yr = [1, 3, 8, 2, 12, 5, 1, 4, 6, 2, 10, 1, 3, 7, 2, 15, 1, 4, 9, 2, 5, 3];
    var prev = ["1班", "1班", "1班", "1班", "1班", "2班", "2班", "2班", "2班", "2班", "3班", "3班", "3班", "3班", "3班", "4班", "4班", "4班", "4班", "4班", "", ""];
    var s = "番号\t氏名\t性別\t部署\t経験年数\t前回の班\n";
    nm.forEach(function (n, i) { s += (i + 1) + "\t" + n + "\t" + sex[i] + "\t" + dep[i] + "\t" + yr[i] + "\t" + prev[i] + "\n"; });
    return s;
  })();

  // ---------- 設定の保存（名簿の中身は保存しない） ----------
  function saveSettings() { try { localStorage.setItem("han-wake", JSON.stringify({ title: $("title").value, style: $("style").value, layout: $("layout").value })); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("han-wake") || "{}"); if (o.title != null) $("title").value = o.title; if (o.style) $("style").value = o.style; if (o.layout) $("layout").value = o.layout; } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(H.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      $("paste").value = SAMPLE; $("hasHead").checked = true; setData(H.parseCSV(SAMPLE), true, "見本");
      $("kCount").value = 4; document.querySelector('input[name=mode][value=count]').checked = true;
      $("numCol").value = "4"; $("sepText").value = "見本 一郎、見本 二郎"; $("togText").value = ""; sizeMsg();
    };
    ["kCount", "kSize"].forEach(function (id) { $(id).oninput = sizeMsg; });
    Array.prototype.forEach.call(document.querySelectorAll("input[name=mode]"), function (x) { x.onchange = sizeMsg; });
    $("go").onclick = run;
    $("again").onclick = function () { $("seed").value = (parseInt($("seed").value, 10) || 1) + 1; run(); };
    ["title", "style", "layout"].forEach(function (id) { $(id).addEventListener("change", saveSettings); });
    $("style").addEventListener("change", function () { if (!S.g) return; if (S.fixCol >= 0) run(); else { S.style = $("style").value; render(); } });
    $("pPrint").onclick = printGroups;
    $("xGroup").onclick = function () { save("group", "xlsx"); }; $("cGroup").onclick = function () { save("group", "csv"); };
    $("xAdd").onclick = function () { save("add", "xlsx"); }; $("cAdd").onclick = function () { save("add", "csv"); };
  });
})();
