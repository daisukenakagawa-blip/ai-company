/* 複数選択の回答の分割と集計 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var M = window.SENTAKU;
  var LIMIT = window.SENTAKU_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", specs: [], conf: {} };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return M.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    var guess = M.guessMulti(S.headers, S.rows);
    S.conf = {};
    S.headers.forEach(function (_, i) { S.conf[i] = { on: false, sep: "auto", known: "" }; });
    guess.forEach(function (g) { S.conf[g.col].on = true; });
    renderCols();
    $("group").innerHTML = '<option value="">（なし）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + "</option>"; }).join("");
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (guess.length ? "複数選択らしい列：" + esc(guess.map(function (g) { return S.headers[g.col]; }).join("、")) + "。" : '<span class="wtxt">複数選択らしい列が見つかりませんでした。下で列を選んでください。</span>') +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを集計します。</span>" : "");
    ["step2", "out"].forEach(function (id) { $(id).hidden = false; });
    refresh();
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
        var d = M.decodeBytes(buf);
        setData(M.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の設定 ----------
  function sepOptions(v) {
    return '<option value="auto"' + (v === "auto" ? " selected" : "") + ">自動</option>" + Object.keys(M.SEPS).map(function (k) { return '<option value="' + k + '"' + (v === k ? " selected" : "") + ">" + M.SEPS[k].label + "</option>"; }).join("");
  }
  function renderCols() {
    $("cols").innerHTML = S.headers.map(function (h, i) {
      var c = S.conf[i];
      var ex = S.rows.map(function (r) { return r[i]; }).filter(function (v) { return String(v).trim(); }).slice(0, 2).map(function (v) { return String(v).replace(/\s+/g, " ").slice(0, 40); }).join("｜");
      return '<div class="colbox"><div class="row" style="margin:0"><label><input type="checkbox" data-c="' + i + '" class="cOn"' + (c.on ? " checked" : "") + "> <b>" + esc(h) + '</b></label><span class="note">' + esc(ex) + "</span></div>" +
        '<div' + (c.on ? "" : " hidden") + ' class="cDet"><div class="row" style="margin:4px 0"><label>区切り <select class="cSep" data-c="' + i + '">' + sepOptions(c.sep) + '</select></label><span class="note cSepNow" data-c="' + i + '"></span></div>' +
        '<details><summary>選択肢の一覧を書く（任意：選択肢の中に「,」などがあるとき・回答0人の選択肢も出したいとき）</summary><textarea class="cKnown" data-c="' + i + '" rows="4" placeholder="1行に1つ（フォームの選択肢をそのまま）">' + esc(c.known) + "</textarea></details></div></div>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".cOn"), function (el) { el.onchange = function () { S.conf[el.dataset.c].on = el.checked; el.closest(".colbox").querySelector(".cDet").hidden = !el.checked; refresh(); }; });
    Array.prototype.forEach.call(document.querySelectorAll(".cSep"), function (el) { el.onchange = function () { S.conf[el.dataset.c].sep = el.value; refresh(); }; });
    Array.prototype.forEach.call(document.querySelectorAll(".cKnown"), function (el) { el.onchange = function () { S.conf[el.dataset.c].known = el.value; refresh(); }; });
  }

  // ---------- 集計 ----------
  function refresh() {
    var t0 = Date.now();
    var minC = $("useOther").checked ? Math.max(1, +$("otherN").value || 1) : 0;
    S.specs = [];
    S.headers.forEach(function (h, i) {
      var c = S.conf[i];
      if (!c || !c.on) return;
      var known = c.known.split(/\r?\n/).map(M.clean).filter(Boolean);
      var A = M.analyze(S.rows, i, { sep: c.sep === "auto" ? null : c.sep, known: known, minCount: minC, order: $("order").value });
      S.specs.push({ col: i, A: A });
      var now = document.querySelector('.cSepNow[data-c="' + i + '"]');
      if (now) now.textContent = c.sep === "auto" ? "（" + M.SEPS[A.sep].label + " で分けています）" : "";
    });
    var g = $("group").value;
    S.group = g === "" ? null : +g;
    if (!S.specs.length) { $("sumMsg").textContent = "集計する列にチェックを入れてください。"; $("resView").innerHTML = ""; return; }
    $("sumMsg").innerHTML = esc(S.rows.length + " 行（回答者）、集計した列 " + S.specs.length + " 個") + '<span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    $("resView").innerHTML = S.specs.map(resHTML).join("");
  }
  function resHTML(sp) {
    var A = sp.A, h = '<div class="res"><h3>' + esc(S.headers[sp.col]) + "</h3>" +
      '<p class="note">答えた人 ' + A.answered + " 人（空欄 " + (A.total - A.answered) + " 人）、選ばれた答え 延べ " + A.totalPicks + " 件、1人あたり平均 " + (A.answered ? (A.totalPicks / A.answered).toFixed(1) : "0") + " 個" + (A.merged ? "、「その他」にまとめた答え " + A.merged + " 種類" : "") + "。割合は答えた人に対する割合です（複数選べるため、合計は100%を超えます）。</p>";
    var max = A.options.reduce(function (a, o) { return Math.max(a, o.count); }, 1);
    var X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
    h += '<div class="scroll"><table class="lt"><thead><tr><th>選択肢</th><th class="n">人数</th><th class="n">割合</th><th></th>' +
      (X ? X.groups.map(function (gname) { return '<th class="n">' + esc(gname) + "</th>"; }).join("") : "") + "</tr></thead><tbody>";
    A.options.forEach(function (o) {
      h += "<tr><td>" + esc(o.label) + '</td><td class="n">' + o.count + '</td><td class="n">' + M.pct(o.count, A.answered) + '</td><td><span class="bar" style="width:' + Math.round(o.count / max * 160) + 'px"></span></td>' +
        (X ? X.groups.map(function (gname) { var v = X.get(o.key, gname); return '<td class="n">' + v + ' <span class="note">' + M.pct(v, X.answered[gname]) + "</span></td>"; }).join("") : "") + "</tr>";
    });
    if (X) h += '<tr><td class="note">答えた人</td><td class="n">' + A.answered + "</td><td></td><td></td>" + X.groups.map(function (gname) { return '<td class="n">' + X.answered[gname] + "</td>"; }).join("") + "</tr>";
    h += "</tbody></table></div>";
    var shown = A.options.filter(function (o) { return !o.known && o.count === 1; }).length;
    if (shown >= 3 && !A.merged) h += '<p class="note wtxt">1人だけの答えが ' + shown + " 種類あります。自由記入の答えなら「その他」にまとめると見やすくなります。書き方の違う同じ答えなら、選択肢の一覧を書いてください。</p>";
    return h + "</div>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function done(name, extra) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (extra || "") + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(rows, name, sheet, numCols) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) {
      if (k[0] === "!") return;
      var cell = ws[k], c = XLSX.utils.decode_cell(k);
      if (c.r > 0 && numCols && numCols[c.c] && /^-?\d+(\.\d+)?$/.test(cell.v)) { cell.t = "n"; cell.v = +cell.v; delete cell.z; }
      else { cell.t = "s"; cell.z = "@"; } // 電話番号などの先頭の0が消えないよう文字列のまま
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, name); return true;
  }
  function wide() { return M.wideRows(S.headers, S.rows, S.specs, $("mark").value, $("dropOrig").checked); }
  function saveWide(kind) {
    if (!S.specs.length) return;
    var rows = wide(), name = "回答_選択肢ごとに分けた表_" + ymd() + "." + kind, num = null;
    if ($("mark").value === "1") { num = {}; rows[0].forEach(function (h, i) { if (S.specs.some(function (sp) { return h.indexOf(S.headers[sp.col] + "：") === 0 && !/：その他の内容$/.test(h); })) num[i] = 1; }); }
    if (kind === "csv") dlBlob(M.toCSV(rows), name); else if (!xlsx(rows, name, "分けた表", num)) return;
    done(name, "足した列 " + (rows[0].length - S.headers.length + ($("dropOrig").checked ? S.specs.length : 0)) + " 個。");
  }
  function sumRows() {
    var out = [];
    S.specs.forEach(function (sp, n) {
      var A = sp.A, X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
      if (n) out.push([]);
      out.push(["設問", S.headers[sp.col], "答えた人", A.answered, "空欄", A.total - A.answered]);
      out.push(["選択肢", "人数", "割合"].concat(X ? X.groups.reduce(function (a, g) { return a.concat([g + "（人数）", g + "（割合）"]); }, []) : []));
      A.options.forEach(function (o) {
        out.push([o.label, o.count, M.pct(o.count, A.answered)].concat(X ? X.groups.reduce(function (a, g) { var v = X.get(o.key, g); return a.concat([v, M.pct(v, X.answered[g])]); }, []) : []));
      });
      if (X) out.push(["答えた人", A.answered, ""].concat(X.groups.reduce(function (a, g) { return a.concat([X.answered[g], ""]); }, [])));
    });
    return out;
  }
  function saveSum(kind) {
    if (!S.specs.length) return;
    var rows = sumRows(), name = "回答_集計表_" + ymd() + "." + kind;
    if (kind === "csv") dlBlob(M.toCSV(rows), name);
    else { var num = {}; for (var i = 1; i < 40; i++) num[i] = 1; if (!xlsx(rows, name, "集計表", num)) return; }
    done(name);
  }
  function saveLong() {
    if (!S.specs.length) return;
    var keep = S.headers.map(function (_, i) { return i; }).filter(function (i) { return !S.specs.some(function (sp) { return sp.col === i; }); });
    var out = [keep.map(function (c) { return S.headers[c]; }).concat(["元の行", "設問", "答え"])];
    var hh = $("hasHead").checked ? 2 : 1;
    S.specs.forEach(function (sp) {
      var L = M.longRows(S.headers, S.rows, sp, keep);
      L.slice(1).forEach(function (r) { var k = r.length; out.push(r.slice(0, k - 2).concat([String(+r[k - 2] + hh), S.headers[sp.col], r[k - 1]])); });
    });
    var name = "回答_1行1つの答え_" + ymd() + ".csv";
    dlBlob(M.toCSV(out), name); done(name, (out.length - 1) + " 行。");
  }

  // ---------- 印刷 ----------
  function printSum() {
    if (!S.specs.length) return;
    var title = $("title").value.trim() || "回答の集計";
    var cond = S.rows.length + " 行" + (S.name ? "（" + S.name + "）" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP") + "　/　割合は各設問に答えた人に対する割合";
    var body = S.specs.map(function (sp) {
      var A = sp.A, X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
      var max = A.options.reduce(function (a, o) { return Math.max(a, o.count); }, 1);
      return '<div class="sec"><h2>' + esc(S.headers[sp.col]) + '</h2><p class="per">答えた人 ' + A.answered + " 人、空欄 " + (A.total - A.answered) + " 人</p>" +
        '<table class="pt"><thead><tr><th>選択肢</th><th class="n">人数</th><th class="n">割合</th>' + (X ? X.groups.map(function (g) { return '<th class="n">' + esc(g) + "</th>"; }).join("") : '<th style="width:35%"></th>') + "</tr></thead><tbody>" +
        A.options.map(function (o) {
          return "<tr><td>" + esc(o.label) + '</td><td class="n">' + o.count + '</td><td class="n">' + M.pct(o.count, A.answered) + "</td>" +
            (X ? X.groups.map(function (g) { return '<td class="n">' + X.get(o.key, g) + "</td>"; }).join("") : '<td><span class="pbar" style="width:' + Math.round(o.count / max * 55) + 'mm"></span></td>') + "</tr>";
        }).join("") + (X ? '<tr><td>答えた人</td><td class="n">' + A.answered + "</td><td></td>" + X.groups.map(function (g) { return '<td class="n">' + X.answered[g] + "</td>"; }).join("") + "</tr>" : "") + "</tbody></table></div>";
    }).join("");
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の研修の申込。氏名は説明用で、実在の人とは関係ありません） ----------
  var SAMPLE = "タイムスタンプ\t氏名\t部署\t参加する日\t希望すること\t感想・質問\n" +
    "2026/11/02 9:12\t見本 一郎\t総務\t1日目, 2日目\t駐車場, 昼食\t資料を事前にほしい\n" +
    "2026/11/02 9:40\t見本 二郎\t営業\t2日目\t昼食\t\n" +
    "2026/11/02 10:05\t見本 花子\t総務\t1日目\t託児, 駐車場, 昼食\t子ども連れで参加します\n" +
    "2026/11/03 8:51\t見本 三郎\t営業\t1日目, 2日目\t\t\n" +
    "2026/11/03 12:20\t見本 春子\t製造\t1日目, 2日目\t昼食, 手話通訳\t\n" +
    "2026/11/03 17:02\t見本 四郎\t製造\t2日目\t駐車場\t2日目は午後から参加します\n" +
    "2026/11/04 9:30\t見本 夏子\t営業\t1日目\t昼食, 駐車場\t\n" +
    "2026/11/04 13:45\t見本 五郎\t総務\t1日目, 2日目\t昼食\t\n" +
    "2026/11/05 10:10\t見本 秋子\t製造\t2日目\t昼食, 車いすで入れる席\t\n" +
    "2026/11/05 16:30\t見本 六郎\t営業\t1日目, 2日目\t駐車場, 昼食\t\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  function saveSettings() { try { localStorage.setItem("fukusu-sentaku", JSON.stringify({ title: $("title").value, mark: $("mark").value, dropOrig: $("dropOrig").checked })); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("fukusu-sentaku") || "{}"); if (o.title != null) $("title").value = o.title; if (o.mark) $("mark").value = o.mark; if (o.dropOrig != null) $("dropOrig").checked = o.dropOrig; } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(M.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(M.parseCSV(SAMPLE), true, "見本"); };
    $("group").onchange = refresh; $("order").onchange = refresh; $("useOther").onchange = refresh; $("otherN").onchange = refresh;
    $("mark").onchange = saveSettings; $("dropOrig").onchange = saveSettings; $("title").onchange = saveSettings;
    $("pSum").onclick = printSum;
    $("xWide").onclick = function () { saveWide("xlsx"); }; $("cWide").onclick = function () { saveWide("csv"); };
    $("xSum").onclick = function () { saveSum("xlsx"); }; $("cSum").onclick = function () { saveSum("csv"); }; $("cLong").onclick = saveLong;
  });
})();
