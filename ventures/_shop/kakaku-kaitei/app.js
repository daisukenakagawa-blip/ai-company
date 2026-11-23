/* 価格改定の一括計算 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KAITEI;
  var LIMIT = window.KAITEI_LIMIT || Infinity; // お試し版は表の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { headers: [], rows: [], cols: {}, name: "", hasHead: true };
  var S = { last: null, cats: null };
  var COLS = [["code", "品番・コード"], ["name", "品名"], ["price", "今の価格（必須）"], ["tax", "税率（任意）"], ["cat", "分類・売場（任意）"], ["rule", "行ごとの改定（任意）"]];

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    T.headers = hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = hasHead ? rows.slice(1) : rows;
    T.hasHead = hasHead; T.name = name || "";
    var total = T.rows.length;
    if (T.rows.length > LIMIT) T.rows = T.rows.slice(0, LIMIT);
    T.cols = K.guessColumns(T.headers);
    if (T.cols.price != null) { var sd = K.guessSide(T.headers[T.cols.price]); if (sd) $("input").value = sd; }
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを使います。</span>" : "");
    drawCols();
    refresh();
  }
  function drawCols() {
    var el = $("cols");
    el.hidden = false;
    el.innerHTML = COLS.map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        T.headers.map(function (h, i) { return '<option value="' + i + '"' + (T.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () {
        if (sel.value === "") delete T.cols[sel.dataset.k]; else T.cols[sel.dataset.k] = +sel.value;
        if (sel.dataset.k === "price" && sel.value !== "") { var sd = K.guessSide(T.headers[+sel.value]); if (sd) $("input").value = sd; }
        refresh();
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
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, $("hasHead").checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(K.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function rowNo(i) { return i + (T.hasHead ? 2 : 1); }
  function sideName(s) { return s === "in" ? "税込" : "税抜"; }
  function roundOpt() {
    var m = $("rmode").value, d = $("rdir").value;
    if (m === "suffix") { var s = K.norm($("suffix").value).replace(/\D/g, ""); return s ? { suffix: s, dir: d } : { unit: 1, dir: d }; }
    return { unit: +m, dir: d };
  }
  function roundText() {
    var r = roundOpt(), d = { up: "切り上げ", down: "切り捨て", near: "四捨五入" }[r.dir];
    if (r.suffix) return "末尾を「" + r.suffix + "」にそろえる（" + { up: "上の値", down: "下の値", near: "近い方" }[r.dir] + "）";
    return (r.unit === 1 ? "1円未満" : r.unit + "円未満") + "を" + d;
  }
  function opt() {
    var g = K.parseRule($("rule").value);
    return {
      input: $("input").value, side: $("side").value, def: +$("def").value,
      rule: g && !g.err ? g : null, ruleErr: g && g.err ? g.err : "",
      cats: S.cats ? S.cats.map : {}, round: roundOpt(), taxDir: $("taxDir").value, keep: $("keep").checked
    };
  }
  function refresh() {
    $("suffixBox").hidden = $("rmode").value !== "suffix";
    $("rdir").options[2].textContent = $("rmode").value === "suffix" ? "近い方" : "四捨五入";
    $("rdir").options[0].textContent = $("rmode").value === "suffix" ? "上の値（切り上げ）" : "切り上げ";
    $("rdir").options[1].textContent = $("rmode").value === "suffix" ? "下の値（切り捨て）" : "切り捨て";
    S.cats = K.parseCatRules($("cats").value);
    $("catMsg").innerHTML = S.cats.n || S.cats.errs.length ? esc("分類 " + S.cats.n + " 件") + (S.cats.errs.length ? '　<span class="bad">' + esc(S.cats.errs.map(function (e) { return e.line + "行目「" + K.clean(e.text) + "」：" + e.err; }).join("　")) + "</span>" : "") + (T.rows.length && T.cols.cat == null && S.cats.n ? '　<span class="wtxt">表の「分類・売場」の列を選ぶと使われます。</span>' : "") : "";
    var o = opt();
    $("ruleMsg").innerHTML = o.ruleErr ? '<span class="bad">' + esc(o.ruleErr) + "</span>" : o.rule ? esc("全体の改定：" + o.rule.text) : '<span class="note">空欄なら、行ごと・分類ごとの指定がない品は据え置きです。</span>';
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) { S.last = null; return; }
    if (T.cols.price == null) { S.last = null; $("sumMsg").innerHTML = '<span class="bad">「今の価格」の列を選んでください。</span>'; $("listView").innerHTML = ""; $("errView").innerHTML = ""; return; }
    var t0 = Date.now();
    S.last = K.run(T.rows, T.cols, o);
    S.opt = o;
    var c = S.last.count, parts = [];
    parts.push("<b>" + c.total + " 品</b>");
    parts.push("<b>価格が変わる品 " + c.changed + "</b>（上がる " + c.up + "・下がる " + c.down + "）");
    parts.push("変わらない品 " + c.same);
    if (c.memo) parts.push('<span class="wtxt">メモのある品 ' + c.memo + "</span>");
    if (S.last.errs.length) parts.push('<span class="bad">読めない行 ' + S.last.errs.length + "</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + esc(condText()) + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function condText() {
    var o = S.opt;
    return "読み込んだ価格：" + sideName(o.input) + "　改定と端数処理：" + sideName(o.side) + "価格で、" + roundText() + "　消費税の1円未満：" + { down: "切り捨て", near: "四捨五入", up: "切り上げ" }[o.taxDir] + "　税率の空欄：" + o.def + "%";
  }
  function pct(x) { return (x > 0 ? "+" : "") + K.fmt(x) + "%"; }
  function sgn(x) { return (x > 0 ? "+" : "") + K.fmt(x); }
  function shown() {
    var f = $("filter").value, it = S.last.items;
    if (f === "changed") return it.filter(function (x) { return x.changed; });
    if (f === "memo") return it.filter(function (x) { return x.notes.length; });
    return it;
  }
  function listView() {
    var it = shown(), hasCat = T.cols.cat != null;
    var h = '<div class="scroll"><table class="lt"><thead><tr><th>品番</th><th>品名</th>' + (hasCat ? "<th>分類</th>" : "") + '<th class="n">税率</th><th class="n">今の税抜</th><th class="n">今の税込</th><th>改定</th><th class="n">新しい税抜</th><th class="n">新しい税込</th><th class="n">差（税込）</th><th class="n">率</th><th>メモ</th></tr></thead><tbody>';
    it.slice(0, SHOW).forEach(function (x) {
      h += "<tr" + (x.changed ? "" : ' class="same"') + "><td>" + esc(x.code) + "</td><td>" + esc(x.name) + "</td>" + (hasCat ? "<td>" + esc(x.cat) + "</td>" : "") +
        '<td class="n">' + x.rate + '%</td><td class="n">' + K.fmt(x.oldEx) + '</td><td class="n">' + K.fmt(x.oldIn) + "</td><td>" + esc(x.rule) + (x.from && x.from !== "全体" ? '<span class="note">（' + x.from + "）</span>" : "") +
        '</td><td class="n"><b>' + K.fmt(x.newEx) + '</b></td><td class="n"><b>' + K.fmt(x.newIn) + '</b></td><td class="n">' + (x.diff ? sgn(x.diff) : "0") + '</td><td class="n">' + (x.changed ? pct(x.pct) : "") + '</td><td class="wrap wtxt">' + esc(x.notes.join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (!it.length) h = "<p>該当する品はありません。</p>";
    if (it.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 品を出しています（全部は印刷・保存に入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function errView() {
    var e = S.last.errs;
    $("errView").innerHTML = e.length ? '<h3>読めなかった行（計算に入れていません）</h3><div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>品番</th><th>品名</th><th>今の価格</th><th>理由</th></tr></thead><tbody>' +
      e.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + "</td><td>" + esc(x.raw) + '</td><td class="bad">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
  }

  // ---------- 印刷 ----------
  function head(kind, extra) {
    var title = ($("title").value.trim() || "価格改定") + "　" + kind;
    var cond = [$("when").value.trim() ? "改定日 " + $("when").value.trim() : "", extra, "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    return "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + '</p><p class="per">' + esc(condText()) + "</p>";
  }
  function printAll() {
    if (!S.last) return;
    var hasCat = T.cols.cat != null, c = S.last.count;
    $("printArea").innerHTML = head("改定一覧", c.total + " 品・変わる品 " + c.changed) + '<table class="pt"><thead><tr><th>品番</th><th>品名</th>' + (hasCat ? "<th>分類</th>" : "") + '<th class="n">税率</th><th class="n">今の税抜</th><th class="n">今の税込</th><th>改定</th><th class="n">新税抜</th><th class="n">新税込</th><th class="n">差</th><th>メモ</th></tr></thead><tbody>' +
      S.last.items.map(function (x) {
        return "<tr><td class=\"nw\">" + esc(x.code) + '</td><td class="nm">' + esc(x.name) + "</td>" + (hasCat ? '<td class="nw">' + esc(x.cat) + "</td>" : "") + '<td class="n">' + x.rate + '%</td><td class="n">' + K.fmt(x.oldEx) + '</td><td class="n">' + K.fmt(x.oldIn) + '</td><td class="nw">' + esc(x.rule) + '</td><td class="n">' + K.fmt(x.newEx) + '</td><td class="n big">' + K.fmt(x.newIn) + '</td><td class="n">' + (x.diff ? sgn(x.diff) : "") + '</td><td class="sm">' + esc(x.notes.join("　")) + "</td></tr>";
      }).join("") + "</tbody></table>";
    window.print();
  }
  function printTags() {
    if (!S.last) return;
    var byCat = $("byCat").checked && T.cols.cat != null;
    var g = K.tagList(S.last.items, byCat);
    var total = S.last.count.changed;
    if (!total) { $("saveMsg").textContent = "価格が変わる品がないため、差し替えリストはありません。"; return; }
    $("printArea").innerHTML = g.map(function (grp, gi) {
      return '<div class="pg">' + (gi === 0 ? head("値札の差し替えリスト", "差し替える値札 " + total + " 枚") : '<p class="per">' + esc(($("title").value.trim() || "価格改定") + "　値札の差し替えリスト") + "</p>") +
        (byCat ? "<h2>" + esc(grp.cat) + "（" + grp.items.length + " 品）</h2>" : "") +
        '<table class="pt"><thead><tr><th>済</th><th>品番</th><th>品名</th><th class="n">今の税込</th><th class="n">新しい税込</th><th class="n">（税抜）</th><th class="n">税率</th></tr></thead><tbody>' +
        grp.items.map(function (x) { return '<tr><td class="ck"></td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="n">' + K.fmt(x.oldIn) + '</td><td class="n big">' + K.fmt(x.newIn) + '円</td><td class="n">' + K.fmt(x.newEx) + '円</td><td class="n">' + x.rate + "%</td></tr>"; }).join("") +
        '</tbody></table><p class="sign">作業者 <span></span>日付 <span></span>確認 <span></span></p></div>';
    }).join("");
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  var HEAD_LIST = ["品番", "品名", "分類", "税率(%)", "今の税抜", "今の税込", "改定", "改定の指定", "新しい税抜", "新しい税込", "差(税込)", "差(税抜)", "改定率(%)", "元の行", "メモ"];
  function rowsList() {
    var out = [HEAD_LIST];
    S.last.items.forEach(function (x) { out.push([x.code, x.name, x.cat, x.rate, x.oldEx, x.oldIn, x.rule, x.from, x.newEx, x.newIn, x.diff, x.diffEx, x.changed ? x.pct : 0, rowNo(x.i), x.notes.join("　")]); });
    return out;
  }
  // 元の表のすべての列の後ろに、新しい価格の列を足す（取り込み直し用）
  function rowsOrig() {
    var by = {}, er = {};
    S.last.items.forEach(function (x) { by[x.i] = x; });
    S.last.errs.forEach(function (x) { er[x.i] = x; });
    var out = [T.headers.concat(["新しい税抜", "新しい税込", "差(税込)", "メモ"])];
    T.rows.forEach(function (r, i) {
      var x = by[i];
      if (x) out.push(r.concat([x.newEx, x.newIn, x.diff, x.notes.join("　")]));
      else out.push(r.concat(["", "", "", er[i] ? "計算していません：" + er[i].err : ""]));
    });
    return out;
  }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (LIMIT < Infinity ? "お試し版は表の先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, numCols, widths) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) { if (ri > 0 && numCols.indexOf(ci) >= 0 && typeof v === "number") return v; return String(v == null ? "" : v); });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; }); // 品番などは文字のまま（先頭の0を消さない）
    ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  function saveX() {
    if (!S.last) return;
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), a = rowsList(), b = rowsOrig(), w = T.headers.length;
    XLSX.utils.book_append_sheet(wb, sheet(a, [3, 4, 5, 8, 9, 10, 11, 12, 13], [14, 28, 10, 7, 9, 9, 10, 8, 10, 10, 8, 8, 9, 6, 30]), "改定一覧");
    XLSX.utils.book_append_sheet(wb, sheet(b, [w, w + 1, w + 2], T.headers.map(function () { return 12; }).concat([10, 10, 8, 30])), "元の表と新しい価格");
    var name = "価格改定_" + ymd() + ".xlsx";
    XLSX.writeFile(wb, name); done(name, a.length - 1);
  }
  function saveC(kind) {
    if (!S.last) return;
    var rows = kind === "list" ? rowsList() : rowsOrig();
    var name = (kind === "list" ? "改定一覧_" : "新しい価格つき_") + ymd() + ".csv";
    dlBlob(K.toCSV(rows), name); done(name, rows.length - 1);
  }

  // ---------- 見本（架空の店・品。実在の店・商品とは関係ありません） ----------
  var SAMPLE = "商品コード\t商品名\t売場\t税区分\t本体価格\t改定\n" +
    "S-001\t見本の食パン\t食品\t軽減\t280\t\nS-002\t見本のジャム\t食品\t軽減\t450\t\nS-003\t見本のコーヒー豆 200g\t食品\t軽減\t1,280\t\n" +
    "S-101\t見本のマグカップ\t雑貨\t\t1,200\t\nS-102\t見本の布巾 3枚組\t雑貨\t\t480\t+20円\nS-103\t見本の木の皿\t雑貨\t\t2,980\t=3,280\n" +
    "S-104\t見本の箸置き\t雑貨\t\t300\t据え置き\nS-201\t見本のレジ袋\tその他\t\t5\t\nS-202\t見本の贈答用の箱\tその他\t\t時価\t\n";
  var SAMPLE_CATS = "食品 +3%\n雑貨 +5%";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var VALS = ["input", "side", "def", "rule", "cats", "rmode", "suffix", "rdir", "taxDir", "title", "filter"], CHK = ["keep", "byCat"];
  function saveSettings() { try { var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); CHK.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("kakaku-kaitei", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("kakaku-kaitei") || "{}"); VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); CHK.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(K.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      $("paste").value = SAMPLE; $("hasHead").checked = true; $("cats").value = SAMPLE_CATS; $("rule").value = "";
      $("side").value = "in"; $("rmode").value = "10"; $("rdir").value = "up";
      setData(K.parseCSV(SAMPLE), true, "見本の商品の表");
    };
    ["input", "side", "def", "rmode", "rdir", "taxDir", "keep", "filter"].forEach(function (id) { $(id).onchange = function () { saveSettings(); if (id === "filter") { if (S.last) listView(); } else refresh(); }; });
    ["rule", "cats", "suffix"].forEach(function (id) { $(id).oninput = function () { saveSettings(); refresh(); }; });
    $("byCat").onchange = saveSettings; $("title").onchange = saveSettings;
    $("pAll").onclick = printAll; $("pTag").onclick = printTags;
    $("xAll").onclick = saveX; $("cList").onclick = function () { saveC("list"); }; $("cOrig").onclick = function () { saveC("orig"); };
    refresh();
  });
})();
