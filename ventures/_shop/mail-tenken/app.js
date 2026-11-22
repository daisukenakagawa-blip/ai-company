/* メールアドレス一覧の点検 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var M = window.MAILT;
  var LIMIT = window.MAILT_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", last: null };
  var SHOW = 500;
  var BAD = { bad: 1, multi: 1, typo: 1 };
  var LAB = { bad: "形の誤り", multi: "2件以上入っている", typo: "打ち間違いの疑い" };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return M.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    var col = M.guessColumn(S.headers, S.rows);
    $("col").innerHTML = '<option value="">（選んでください）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (col === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを調べます。</span>" : "");
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

  // ---------- 調べる ----------
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  function refresh() {
    var col = $("col").value;
    if (col === "") { $("sumMsg").textContent = "メールアドレスの列を選んでください。"; $("listView").innerHTML = ""; $("dupView").innerHTML = ""; S.last = null; return; }
    var t0 = Date.now();
    var R = M.run(S.rows, +col);
    S.last = R; S.col = +col;
    var c = R.count, badN = 0;
    Object.keys(BAD).forEach(function (k) { badN += c[k] || 0; });
    var parts = ["正しい形 " + ((c.ok || 0) + (c.fixed || 0)) + " 件" + (c.fixed ? "（うち書き方を整えた " + c.fixed + " 件）" : ""),
      (badN ? '<span class="bad">問題あり ' + badN + " 件</span>（" + ["bad", "typo", "multi"].filter(function (k) { return c[k]; }).map(function (k) { return LAB[k] + " " + c[k]; }).join("・") + "）" : "問題あり 0 件")];
    if (c.warn) parts.push('<span class="wtxt">注意 ' + c.warn + " 件</span>");
    if (R.dups.length) parts.push('<span class="wtxt">同じアドレスが2回以上 ' + R.dups.length + " 組</span>");
    if (c.blank) parts.push("空欄 " + c.blank + " 行");
    $("sumMsg").innerHTML = parts.join("　/　") + '<span class="note">（' + S.rows.length + " 行、" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); dupView();
  }
  function dupText(x) { return x.dup ? "同じアドレス：" + x.dup.filter(function (y) { return y !== x; }).map(function (y) { return "行" + rowNo(y.i); }).join("・") : ""; }
  function memoOf(x) { return [x.msg, x.parts ? "→ " + x.parts.join(" ／ ") : ""].filter(Boolean).join("　"); }
  function listView() {
    var only = $("onlyBad").checked;
    var list = S.last.res.filter(function (x) { return only ? (x.status !== "ok" && x.status !== "blank") || x.dup : x.status !== "blank"; });
    if (!list.length) { $("listView").innerHTML = "<p>" + (only ? "問題のあるアドレス・重複はありません。" : "アドレスがありません。") + "</p>"; return; }
    var h = '<div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>元の値</th><th>判定</th><th>整えたアドレス・直した案</th><th>メモ</th></tr></thead><tbody>';
    list.slice(0, SHOW).forEach(function (x) {
      var cls = BAD[x.status] ? "bad" : x.status === "fixed" || x.status === "warn" ? "wtxt" : "";
      var shown = x.guess ? x.guess + "（案）" : (x.status === "ok" || x.status === "fixed" || x.status === "warn") ? x.fixed : "";
      h += '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.raw) + '</td><td class="' + cls + '">' + esc(x.label) + "</td><td>" + esc(shown) + '</td><td class="wrap">' + esc([memoOf(x), dupText(x)].filter(Boolean).join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (list.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 行を出しています（全 " + list.length + " 行は保存すると入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function dupView() {
    var d = S.last.dups;
    if (!d.length) { $("dupView").innerHTML = '<p class="note">同じアドレスが2回以上出てくる行はありません。</p>'; return; }
    $("dupView").innerHTML = '<h3>同じアドレスが2回以上（' + d.length + ' 組）</h3><div class="scroll"><table class="lt"><thead><tr><th>アドレス</th><th class="n">回数</th><th>行</th></tr></thead><tbody>' +
      d.slice(0, SHOW).map(function (g) { return "<tr><td>" + esc(g.key) + '</td><td class="n">' + g.list.length + '</td><td class="wrap">' + g.list.map(function (x) { return rowNo(x.i) + (x.raw.trim() !== g.list[0].raw.trim() ? "（" + esc(x.raw) + "）" : ""); }).join("・") + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="note">大文字・小文字の違い、全角・半角、前後の空白の違いは同じアドレスとして数えます。打ち間違いの疑いは、直した案のアドレスで数えます。</p>';
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function detailRows(onlyBad) {
    var out = [S.headers.concat(["整えたアドレス", "判定", "直した案", "同じアドレスの行", "メモ"])];
    S.last.res.forEach(function (x, i) {
      if (onlyBad && !(BAD[x.status] || x.status === "warn" || x.dup)) return;
      var dup = x.dup ? x.dup.filter(function (y) { return y !== x; }).map(function (y) { return rowNo(y.i); }).join("・") : "";
      var good = x.status === "ok" || x.status === "fixed" || x.status === "warn";
      out.push(S.rows[i].concat([good ? x.fixed : "", x.label, x.guess || "", dup, memoOf(x)]));
    });
    return out;
  }
  function fixedRows() {
    var useGuess = $("useGuess").checked, dropDup = $("dropDup").checked, out = [S.headers.slice()], n = { rep: 0, drop: 0 };
    S.last.res.forEach(function (x, i) {
      if (dropDup && x.dup && !x.dupFirst) { n.drop++; return; }
      var r = S.rows[i].slice(), v = r[S.col];
      if (x.status === "fixed" || x.status === "ok" || x.status === "warn") v = x.fixed;
      else if (x.status === "typo" && useGuess && x.guess) v = x.guess;
      if (v !== r[S.col]) n.rep++;
      r[S.col] = v; out.push(r);
    });
    S.fixInfo = n;
    return out;
  }
  function done(name, extra) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (extra || "") + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(rows, name, sheet) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!") { ws[k].t = "s"; ws[k].z = "@"; } }); // 電話番号などの先頭の0が消えないよう文字列のまま
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, name); return true;
  }
  function fixMsg() { var n = S.fixInfo; return "置き換え " + n.rep + " 行" + (n.drop ? "、除いた重複 " + n.drop + " 行" : "") + "。"; }
  function saveFix(kind) {
    if (!S.last) return;
    var rows = fixedRows(), name = "メールアドレス_整えた表_" + ymd() + "." + kind;
    if (kind === "csv") dlBlob(M.toCSV(rows), name); else if (!xlsx(rows, name, "整えた表")) return;
    done(name, fixMsg());
  }
  function saveDetail(kind, onlyBad) {
    if (!S.last) return;
    var rows = detailRows(onlyBad), name = "メールアドレス_点検_" + (onlyBad ? "問題の行" : "明細") + "_" + ymd() + "." + kind;
    if (kind === "csv") dlBlob(M.toCSV(rows), name); else if (!xlsx(rows, name, "点検結果")) return;
    done(name);
  }

  // ---------- 印刷 ----------
  function printList() {
    if (!S.last) return;
    var list = S.last.res.filter(function (x) { return BAD[x.status] || x.status === "warn" || x.dup; });
    var title = $("title").value.trim() || "メールアドレスの点検結果";
    var c = S.last.count;
    var cond = "列「" + S.headers[S.col] + "」" + S.rows.length + " 行" + (S.name ? "（" + S.name + "）" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP");
    var body = list.length ? '<table class="pt"><thead><tr><th class="n">行</th><th>元の値</th><th>判定</th><th>直した案</th><th>メモ</th></tr></thead><tbody>' +
      list.map(function (x) {
        return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.raw) + "</td><td>" + esc(BAD[x.status] || x.status === "warn" ? x.label : "同じアドレス") + "</td><td>" + esc(x.guess || "") + "</td><td>" + esc([memoOf(x), dupText(x)].filter(Boolean).join("　")) + "</td></tr>";
      }).join("") + "</tbody></table>" : "<p>問題のあるアドレス・同じアドレスはありません。</p>";
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" +
      '<p class="per">正しい形 ' + ((c.ok || 0) + (c.fixed || 0)) + " 件、問題あり " + ((c.bad || 0) + (c.typo || 0) + (c.multi || 0)) + " 件、注意 " + (c.warn || 0) + " 件、同じアドレス " + S.last.dups.length + " 組</p>" + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の名簿。アドレスは説明用で、実在の人・会社とは関係ありません） ----------
  var SAMPLE = "氏名\tメールアドレス\t区分\n" +
    "見本 一郎\tichiro@mihon-kai.jp\t会員\n見本 二郎\tｊｉｒｏ＠ｍｉｈｏｎ－ｋａｉ．ｊｐ\t会員\n見本 三郎\t saburo@mihon-kai.jp \t会員\n" +
    "見本 花子\thanako@gmial.com\t会員\n見本 春子\tharuko@mihon-shoji.co.jo\t一般\n見本 夏子\t見本 夏子 <natsuko@mihon-kai.jp>\t一般\n" +
    "見本 秋子\takiko(at)mihon-kai.jp\t一般\n見本 冬子\tfuyuko@mihon-kai\t一般\n見本 四郎\tshiro@mihon-kai.jp, shiro2@mihon-kai.jp\t会員\n" +
    "見本 五郎\tIchiro@Mihon-Kai.JP\t会員\n見本 六郎\troku..ro.@docomo.ne.jp\t一般\n見本 七子\tnanako@docomo.co.jp\t会員\n見本 八郎\thachiro@example.com\t一般\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["onlyBad", "useGuess", "dropDup"];
  function saveSettings() { try { var o = { title: $("title").value }; KEYS.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("mail-tenken", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("mail-tenken") || "{}"); if (o.title != null) $("title").value = o.title; KEYS.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(M.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(M.parseCSV(SAMPLE), true, "見本"); };
    $("col").onchange = refresh;
    $("onlyBad").onchange = function () { saveSettings(); if (S.last) listView(); };
    $("useGuess").onchange = saveSettings; $("dropDup").onchange = saveSettings; $("title").onchange = saveSettings;
    $("pList").onclick = printList;
    $("xFix").onclick = function () { saveFix("xlsx"); }; $("cFix").onclick = function () { saveFix("csv"); };
    $("xAll").onclick = function () { saveDetail("xlsx", false); }; $("cAll").onclick = function () { saveDetail("csv", false); }; $("cBad").onclick = function () { saveDetail("csv", true); };
  });
})();
