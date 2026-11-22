/* 入荷の検品の照合 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KENPIN;
  var LIMIT = window.KENPIN_LIMIT || Infinity; // お試し版は各表の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { A: { headers: [], rows: [], cols: {}, name: "" }, B: { headers: [], rows: [], cols: {}, name: "" } };
  var S = { last: null };
  var COLS = [["code", "品番・コード"], ["name", "品名"], ["qty", "数量（必須）"], ["price", "単価（任意）"], ["unit", "単位（任意）"]];
  var ORDER = { short: 0, missing: 1, extra: 2, over: 3, ok: 4 };
  var CLS = { short: "bad", missing: "bad", extra: "wtxt", over: "wtxt", ok: "okc" };

  // ---------- 読み込み ----------
  function setData(k, rows, hasHead, name) {
    var t = T[k];
    if (!rows.length) { $("loadMsg" + k).textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    t.headers = hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    t.rows = hasHead ? rows.slice(1) : rows;
    t.hasHead = hasHead; t.name = name || "";
    var total = t.rows.length;
    if (t.rows.length > LIMIT) t.rows = t.rows.slice(0, LIMIT);
    t.cols = K.guessColumns(t.headers);
    if (t.cols.qty == null && t.headers.length >= 2 && !hasHead) t.cols.qty = t.headers.length - 1;
    $("loadMsg" + k).innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを照合します。</span>" : "");
    drawCols(k);
    refresh();
  }
  function drawCols(k) {
    var t = T[k], el = $("cols" + k);
    el.hidden = false;
    el.innerHTML = COLS.map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        t.headers.map(function (h, i) { return '<option value="' + i + '"' + (t.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete t.cols[sel.dataset.k]; else t.cols[sel.dataset.k] = +sel.value; refresh(); };
    });
  }
  function readFile(k, file) {
    var r = new FileReader();
    r.onload = function () {
      var buf = new Uint8Array(r.result);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (!window.XLSX) { $("loadMsg" + k).textContent = "Excel の読み込み部品を読み込めませんでした。CSV で保存してお試しください。"; return; }
        try {
          var wb = XLSX.read(buf, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
            .map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
          setData(k, rows, $("hasHead" + k).checked, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg" + k).textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(k, K.parseCSV(d.text), $("hasHead" + k).checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 照合 ----------
  function rowNo(k, i) { return i + (T[k].hasHead ? 2 : 1); }
  function opt() { return { by: $("by").value, hyphen: $("hyphen").checked, zero: $("zero").checked }; }
  function refresh() {
    var ready = T.A.rows.length && T.B.rows.length;
    $("optBox").hidden = !ready; $("out").hidden = !ready;
    if (!ready) { S.last = null; return; }
    var o = opt(), miss = [];
    ["A", "B"].forEach(function (k) {
      var c = T[k].cols, nm = k === "A" ? "注文" : "届いた明細";
      if (c.qty == null) miss.push(nm + "の「数量」");
      if (o.by === "code" && c.code == null) miss.push(nm + "の「品番」");
      if (o.by === "name" && c.name == null) miss.push(nm + "の「品名」");
      if (o.by === "auto" && c.code == null && c.name == null) miss.push(nm + "の「品番」か「品名」");
    });
    if (miss.length) { S.last = null; $("sumMsg").innerHTML = '<span class="bad">' + esc(miss.join("、")) + " の列を選んでください。</span>"; $("listView").innerHTML = ""; $("errView").innerHTML = ""; return; }
    var t0 = Date.now();
    S.last = K.run(T.A.rows, T.A.cols, T.B.rows, T.B.cols, o);
    var c = S.last.count, ng = c.short + c.over + c.missing + c.extra;
    var parts = ['<span class="okc">一致 ' + c.ok + " 品</span>",
      ng ? '<span class="bad">合わない ' + ng + " 品</span>（" + [["short", "不足"], ["missing", "届いていない"], ["extra", "注文にない"], ["over", "多い"]].filter(function (p) { return c[p[0]]; }).map(function (p) { return p[1] + " " + c[p[0]]; }).join("・") + "）" : "合わない品 0"];
    if (c.price) parts.push('<span class="wtxt">単価が違う ' + c.price + " 品</span>");
    var ne = S.last.errA.length + S.last.errB.length;
    if (ne) parts.push('<span class="bad">読めない行 ' + ne + "</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<span class="note">（注文 ' + T.A.rows.length + " 行・届いた明細 " + T.B.rows.length + " 行、" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }
  function sorted(only) {
    return S.last.res.map(function (x, n) { return [x, n]; })
      .filter(function (p) { return !only || p[0].status !== "ok" || p[0].warn; })
      .sort(function (p, q) { return (ORDER[p[0].status] - ORDER[q[0].status]) || (p[1] - q[1]); })
      .map(function (p) { return p[0]; });
  }
  function rowsText(x) {
    var a = x.a ? x.a.rows.map(function (i) { return rowNo("A", i); }).join("・") : "", b = x.b ? x.b.rows.map(function (i) { return rowNo("B", i); }).join("・") : "";
    return [a ? "注文 " + a : "", b ? "届 " + b : ""].filter(Boolean).join("／");
  }
  function diffText(x) { return x.diff > 0 ? "+" + K.fmt(x.diff) : K.fmt(x.diff); }
  function listView() {
    var list = sorted($("onlyBad").checked);
    if (!list.length) { $("listView").innerHTML = "<p>注文と届いた明細は、すべての品で数が合っています。</p>"; return; }
    var h = '<div class="scroll"><table class="lt"><thead><tr><th>判定</th><th>品番</th><th>品名</th><th class="n">注文</th><th class="n">届いた</th><th class="n">差</th><th>行</th><th>メモ</th></tr></thead><tbody>';
    list.slice(0, SHOW).forEach(function (x) {
      h += '<tr><td class="' + CLS[x.status] + '">' + K.LABEL[x.status] + "</td><td>" + esc(x.code) + "</td><td>" + esc(x.name) + '</td><td class="n">' + K.fmt(x.qa) + '</td><td class="n">' + K.fmt(x.qb) + '</td><td class="n">' + (x.diff ? diffText(x) : "") + "</td><td>" + esc(rowsText(x)) + '</td><td class="wrap">' + esc(x.notes.join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (list.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 品を出しています（全 " + list.length + " 品は保存すると入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function errView() {
    var e = S.last.errA.map(function (x) { return ["注文", rowNo("A", x.i), x]; }).concat(S.last.errB.map(function (x) { return ["届いた明細", rowNo("B", x.i), x]; }));
    $("errView").innerHTML = e.length ? '<h3>読めなかった行（照合に入れていません）</h3><div class="scroll"><table class="lt"><thead><tr><th>表</th><th class="n">行</th><th>品番</th><th>品名</th><th>理由</th></tr></thead><tbody>' +
      e.slice(0, SHOW).map(function (p) { return "<tr><td>" + p[0] + '</td><td class="n">' + p[1] + "</td><td>" + esc(p[2].code) + "</td><td>" + esc(p[2].name) + '</td><td class="bad">' + esc(p[2].err) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function priceOf(g) { return g && g.prices.length ? g.prices.map(K.fmt).join("・") : ""; }
  function outRows(filter) {
    var out = [["判定", "品番", "品名", "注文の数", "届いた数", "差（届いた−注文）", "注文の単価", "届いた単価", "注文の行", "届いた明細の行", "メモ"]];
    sorted(false).forEach(function (x) {
      if (filter && !filter(x)) return;
      out.push([K.LABEL[x.status], x.code, x.name, K.fmt(x.qa), K.fmt(x.qb), x.diff ? diffText(x) : "0", priceOf(x.a), priceOf(x.b),
        x.a ? x.a.rows.map(function (i) { return rowNo("A", i); }).join("・") : "", x.b ? x.b.rows.map(function (i) { return rowNo("B", i); }).join("・") : "", x.notes.join("　")]);
    });
    S.last.errA.forEach(function (e) { if (!filter) out.push(["読めない行", e.code, e.name, "", "", "", "", "", rowNo("A", e.i), "", e.err]); });
    S.last.errB.forEach(function (e) { if (!filter) out.push(["読めない行", e.code, e.name, "", "", "", "", "", "", rowNo("B", e.i), e.err]); });
    return out;
  }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 品）。" + (LIMIT < Infinity ? "お試し版は各表の先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(rows, name) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) { // 数の列は数として、品番は文字のまま（先頭の0を消さない）
        if (ri > 0 && ci >= 3 && ci <= 7 && v !== "") { var n = K.num(String(v).replace(/^\+/, "")); if (n != null && !isNaN(n)) return n; }
        return String(v == null ? "" : v);
      });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; });
    ws["!cols"] = [8, 14, 28, 8, 8, 10, 10, 10, 10, 10, 50].map(function (w) { return { wch: w }; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "検品の照合");
    XLSX.writeFile(wb, name); return true;
  }
  function save(kind, shortOnly) {
    if (!S.last) return;
    var rows = outRows(shortOnly ? function (x) { return x.status === "short" || x.status === "missing"; } : null);
    var name = "検品の照合_" + (shortOnly ? "不足と届いていない品" : "結果") + "_" + ymd() + "." + kind;
    if (kind === "csv") dlBlob(K.toCSV(rows), name); else if (!xlsx(rows, name)) return;
    done(name, rows.length - 1);
  }

  // ---------- 印刷 ----------
  function printList() {
    if (!S.last) return;
    var list = sorted(!$("pAll").checked);
    var c = S.last.count;
    var title = $("title").value.trim() || "入荷の検品";
    var cond = [$("memo").value.trim(), "注文 " + T.A.rows.length + " 行" + (T.A.name ? "（" + T.A.name + "）" : ""), "届いた明細 " + T.B.rows.length + " 行" + (T.B.name ? "（" + T.B.name + "）" : ""), "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    var body = list.length ? '<table class="pt"><thead><tr><th>判定</th><th>品番</th><th>品名</th><th class="n">注文</th><th class="n">届いた</th><th class="n">差</th><th>メモ</th><th>確認</th></tr></thead><tbody>' +
      list.map(function (x) {
        return '<tr><td class="nw">' + K.LABEL[x.status] + '</td><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name) + '</td><td class="n">' + K.fmt(x.qa) + '</td><td class="n">' + K.fmt(x.qb) + '</td><td class="n">' + (x.diff ? diffText(x) : "") + "</td><td>" + esc(x.notes.join("　")) + '</td><td class="ck"></td></tr>';
      }).join("") + "</tbody></table>" : "<p>すべての品で数が合っています。</p>";
    var ne = S.last.errA.length + S.last.errB.length;
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" +
      '<p class="per">一致 ' + c.ok + " 品、不足 " + c.short + " 品、届いていない " + c.missing + " 品、注文にない " + c.extra + " 品、多い " + c.over + " 品" + (c.price ? "、単価が違う " + c.price + " 品" : "") + (ne ? "、読めない行 " + ne : "") + "</p>" + body +
      '<p class="sign">検品日 <span></span>検品者 <span></span>確認 <span></span></p>';
    window.print();
  }

  // ---------- 見本（架空の品と数。実在の商品・会社とは関係ありません） ----------
  var SAMPLE_A = "品番\t品名\t発注数\t単位\t単価\n" +
    "MH-101\t見本のボールペン 黒\t50\t本\t80\nMH-102\t見本のボールペン 赤\t30\t本\t80\nMH-201\t見本のノート A5\t20\t冊\t150\n" +
    "MH-202\t見本のノート B5\t20\t冊\t160\nMH-301\t見本の付箋 75mm\t10\t個\t220\nMH-302\t見本の付箋 50mm\t10\t個\t180\n" +
    "MH-401\t見本のクリップ 大\t5\t箱\t300\nMH-501\t見本の封筒 長形3号\t3\t箱\t650\nMH-101\t見本のボールペン 黒\t10\t本\t80\n";
  var SAMPLE_B = "品番\t品名\t数量\t単位\t単価\n" +
    "MH101\t見本のボールペン 黒\t60\t本\t80\nMH-102\t見本のボールペン 赤\t24\t本\t80\nMH-201\t見本のノート A5\t20\t冊\t150\n" +
    "MH-202\t見本のノート B5\t25\t冊\t160\nMH-301\t見本の付箋 75mm\t10\t個\t240\nMH-310\t見本の付箋 50mm\t10\t個\t180\n" +
    "MH-601\t見本の電卓\t1\t台\t1200\nMH-501\t見本の封筒 長形3号\tなし\t箱\t650\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["onlyBad", "hyphen", "zero", "pAll"];
  function saveSettings() { try { var o = { title: $("title").value, by: $("by").value }; KEYS.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("nyuka-kenpin", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("nyuka-kenpin") || "{}"); if (o.title != null) $("title").value = o.title; if (o.by) $("by").value = o.by; KEYS.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    ["A", "B"].forEach(function (k) {
      $("file" + k).onchange = function () { if (this.files[0]) readFile(k, this.files[0]); };
      var dz = $("drop" + k);
      dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
      dz.ondragleave = function () { dz.classList.remove("over"); };
      dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(k, e.dataTransfer.files[0]); };
      $("pasteGo" + k).onclick = function () { var t = $("paste" + k).value; if (t.trim()) setData(k, K.parseCSV(t), $("hasHead" + k).checked, "貼り付けたデータ"); };
    });
    $("sample").onclick = function () {
      $("pasteA").value = SAMPLE_A; $("pasteB").value = SAMPLE_B; $("hasHeadA").checked = $("hasHeadB").checked = true;
      setData("A", K.parseCSV(SAMPLE_A), true, "見本の注文"); setData("B", K.parseCSV(SAMPLE_B), true, "見本の納品書");
    };
    ["by", "hyphen", "zero"].forEach(function (id) { $(id).onchange = function () { saveSettings(); refresh(); }; });
    $("onlyBad").onchange = function () { saveSettings(); if (S.last) listView(); };
    $("pAll").onchange = saveSettings; $("title").onchange = saveSettings;
    $("pList").onclick = printList;
    $("xAll").onclick = function () { save("xlsx", false); }; $("cAll").onclick = function () { save("csv", false); }; $("cShort").onclick = function () { save("csv", true); };
  });
})();
