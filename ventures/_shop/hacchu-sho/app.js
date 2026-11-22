/* 発注点チェックと発注書 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var H = window.HACCHU;
  var LIMIT = window.HACCHU_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var F = H.fmt;
  var S = { headers: [], rows: [], name: "", cols: {}, last: null, over: {} };
  var SHOW = 1000;
  var COLS = [
    ["name", "品名", 1], ["stock", "今の在庫数", 1], ["point", "発注点", 1], ["target", "目標在庫（ここまで補充）"], ["lot", "発注単位（ケース入数など）"],
    ["moq", "最小発注数"], ["inc", "入荷予定（発注済みで未着）"], ["sup", "仕入先"], ["price", "単価"], ["code", "品番・コード"], ["unit", "単位（個・箱など）"], ["daily", "1日の使用数（あと何日か）"]
  ];

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return H.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || ""; S.over = {};
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    S.cols = hasHead ? H.guessColumns(S.headers) : {};
    var opts = function (k) {
      return '<option value="">（なし）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (S.cols[k] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
    };
    $("colGrid").innerHTML = COLS.map(function (c) {
      return '<label><span>' + esc(c[1]) + (c[2] ? '（必須）' : "") + '</span><select data-k="' + c[0] + '">' + opts(c[0]) + "</select></label>";
    }).join("");
    Array.prototype.forEach.call($("colGrid").querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete S.cols[sel.dataset.k]; else S.cols[sel.dataset.k] = +sel.value; S.over = {}; refresh(); };
    });
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを計算します。</span>" : "");
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
        var d = H.decodeBytes(buf);
        setData(H.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  function qtyOf(x) { return S.over.hasOwnProperty(x.i) ? S.over[x.i] : x.qty; }
  function label(x) { return x.name || x.code || "行" + rowNo(x.i); }
  function refresh() {
    var miss = COLS.filter(function (c) { return c[2] && S.cols[c[0]] == null; }).map(function (c) { return c[1]; });
    if (miss.length) { $("sumMsg").innerHTML = '<span class="wtxt">「' + miss.join("」「") + "」の列を選んでください。</span>"; $("listView").innerHTML = ""; $("errView").innerHTML = ""; S.last = null; return; }
    S.last = H.run(S.rows, S.cols, { rule: $("rule").value });
    draw();
  }
  function groups() { return H.groupBySupplier(S.last.res, qtyOf); }
  function draw() {
    var c = S.last.count, G = groups(), items = 0, money = 0, priced = true;
    G.forEach(function (g) { items += g.items.length; money = H.round(money + g.total); if (!g.hasPrice) priced = false; });
    var edited = Object.keys(S.over).length;
    $("sumMsg").innerHTML = '<b>発注が必要 ' + c.need + " 品</b>　/　足りている " + c.ok + " 品" + (c.err ? '　/　<span class="bad">計算できない ' + c.err + " 行</span>" : "") +
      "<br>発注書に入る品 " + items + " 品（仕入先 " + G.length + " 件）" + (S.cols.price != null ? "　/　金額の合計 " + F(money) + " 円" + (priced ? "" : '<span class="note">（単価のない品を除く）</span>') : "") +
      (edited ? '　<span class="wtxt">手で直した数 ' + edited + " 品</span>" : "");
    var all = $("showAll").checked, bySup = $("bySup").checked;
    var list = S.last.res.filter(function (x) { return !x.err && (all || x.need || qtyOf(x) > 0); });
    if (bySup) {
      var order = [], m = {};
      list.forEach(function (x) { var s = x.sup || H.NOSUP; if (!m[s]) { m[s] = []; order.push(s); } m[s].push(x); });
      list = []; S.supOrder = order;
      order.forEach(function (s) { list.push({ head: s, n: m[s].length }); list = list.concat(m[s]); });
    }
    var hasP = S.cols.price != null, hasD = S.cols.daily != null;
    if (!list.length) { $("listView").innerHTML = "<p>発注が必要な品はありません。</p>"; }
    else {
      var h = '<div class="scroll"><table class="lt"><thead><tr><th class="n">行</th><th>品名</th>' + (S.cols.code != null ? "<th>品番</th>" : "") + (bySup ? "" : "<th>仕入先</th>") +
        '<th class="n">在庫</th><th class="n">発注点</th>' + (S.cols.target != null ? '<th class="n">目標</th>' : "") + (hasD ? '<th class="n">あと何日</th>' : "") +
        '<th class="n">発注する数</th>' + (hasP ? '<th class="n">単価</th><th class="n">金額</th>' : "") + "<th>計算</th></tr></thead><tbody>";
      var cols = 7 + (S.cols.code != null) + (!bySup) + (S.cols.target != null) + hasD + (hasP ? 2 : 0);
      var shown = 0;
      list.some(function (x) {
        if (x.head) { h += '<tr class="sup"><td colspan="' + cols + '">' + esc(x.head) + "（" + x.n + " 品）</td></tr>"; return false; }
        if (++shown > SHOW) return true;
        var q = qtyOf(x), ed = S.over.hasOwnProperty(x.i);
        h += "<tr" + (ed ? ' class="edited"' : "") + '><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.name) + "</td>" + (S.cols.code != null ? "<td>" + esc(x.code) + "</td>" : "") + (bySup ? "" : "<td>" + esc(x.sup) + "</td>") +
          '<td class="n">' + F(x.stock) + (x.inc ? '<span class="note">＋' + F(x.inc) + "</span>" : "") + '</td><td class="n">' + F(x.point) + "</td>" + (S.cols.target != null ? '<td class="n">' + F(x.target) + "</td>" : "") +
          (hasD ? '<td class="n' + (x.days != null && x.days < 7 ? " wtxt" : "") + '">' + (x.days != null ? F(x.days) + " 日" : "") + "</td>" : "") +
          '<td class="n"><input class="q" data-i="' + x.i + '" value="' + (q ? F(q).replace(/,/g, "") : "0") + '" inputmode="decimal">' + (x.unit ? " " + esc(x.unit) : "") + "</td>" +
          (hasP ? '<td class="n">' + F(x.price) + '</td><td class="n">' + (x.price != null && q ? F(q * x.price) : "") + "</td>" : "") +
          '<td class="wrap"><span class="' + (x.need ? "" : "ok") + '">' + esc(x.check) + "</span>" + (x.how ? "<br>" + esc(x.how) : "") + (x.notes.length ? '<br><span class="wtxt">' + esc(x.notes.join("。")) + "</span>" : "") + (ed ? '<br><span class="wtxt">手で直しました（計算は ' + F(x.qty) + "）</span>" : "") + "</td></tr>";
        return false;
      });
      h += "</tbody></table></div>";
      if (shown > SHOW) h += '<p class="note">画面には ' + SHOW + " 品まで出しています（全部は保存・印刷に入ります）。</p>";
      $("listView").innerHTML = h;
      Array.prototype.forEach.call($("listView").querySelectorAll("input.q"), function (inp) {
        inp.onchange = function () {
          var i = +inp.dataset.i, v = H.num(inp.value), x = S.last.res.filter(function (y) { return y.i === i; })[0];
          if (v == null) v = 0;
          if (isNaN(v) || v < 0) { inp.value = F(qtyOf(x)).replace(/,/g, ""); return; }
          if (v === qtyOf(x)) return;
          if (v === x.qty) delete S.over[i]; else S.over[i] = v;
          setTimeout(draw, 0);
        };
      });
    }
    var errs = S.last.res.filter(function (x) { return x.err; });
    $("errView").innerHTML = errs.length ? '<h3 class="bad">計算できない行（' + errs.length + "）</h3>" + '<div class="scroll" style="max-height:220px"><table class="lt"><thead><tr><th class="n">行</th><th>品名</th><th>理由</th></tr></thead><tbody>' +
      errs.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(label(x)) + '</td><td class="wrap">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "";
  }

  // ---------- 印刷 ----------
  function jdate(v) { if (!v) return ""; var p = v.split("-"); return p.length === 3 ? p[0] + "年" + (+p[1]) + "月" + (+p[2]) + "日" : v; }
  function setting() {
    return { me: $("me").value.trim(), addr: $("addr").value.trim(), tel: $("tel").value.trim(), person: $("person").value.trim(), odate: jdate($("odate").value),
      prefix: $("prefix").value.trim(), ddate: $("ddate").value.trim(), dplace: $("dplace").value.trim(), hon: $("hon").value, money: $("money").value,
      showCode: $("showCode").value === "1" && S.cols.code != null, minRows: +$("minRows").value, remark: $("remark").value.trim() };
  }
  function orderNo(o, k) { return o.prefix ? o.prefix + "-" + ("0" + (k + 1)).slice(-2) : ""; }
  function moneyLabel(o) { return o.money === "ex" ? "（税抜）" : o.money === "in" ? "（税込）" : ""; }
  function printOrders() {
    if (!S.last) return;
    var G = groups(), o = setting();
    if (!G.length) { $("saveMsg").textContent = "発注書に入る品がありません。"; return; }
    var showM = o.money !== "none";
    var html = G.map(function (g, k) {
      var no = orderNo(o, k);
      var th = '<tr><th class="n" style="width:8mm">No.</th>' + (o.showCode ? "<th>品番</th>" : "") + '<th>品名</th><th class="n">数量</th><th>単位</th>' + (showM ? '<th class="n">単価' + moneyLabel(o) + '</th><th class="n">金額' + moneyLabel(o) + "</th>" : "") + "</tr>";
      var body = g.items.map(function (it, j) {
        var x = it.x;
        return '<tr><td class="n">' + (j + 1) + "</td>" + (o.showCode ? "<td>" + esc(x.code) + "</td>" : "") + "<td>" + esc(x.name || x.code) + '</td><td class="n">' + F(it.qty) + "</td><td>" + esc(x.unit) + "</td>" +
          (showM ? '<td class="n">' + F(x.price) + '</td><td class="n">' + (it.amount != null ? F(it.amount) : "") + "</td>" : "") + "</tr>";
      }).join("");
      var ncol = 4 + (o.showCode ? 1 : 0) + (showM ? 2 : 0);
      for (var e = g.items.length; e < o.minRows; e++) body += "<tr>" + new Array(ncol + 1).join("<td>&nbsp;</td>") + "</tr>";
      var foot = showM ? '<tfoot><tr><td colspan="' + (ncol - 1) + '" class="n">合計' + moneyLabel(o) + (g.hasPrice ? "" : "（単価のない品を除く）") + '</td><td class="n">' + F(g.total) + " 円</td></tr></tfoot>" : "";
      var cond = [o.ddate ? "<tr><th>納品希望日</th><td>" + esc(o.ddate) + "</td></tr>" : "", o.dplace ? "<tr><th>納品場所</th><td>" + esc(o.dplace) + "</td></tr>" : ""].join("");
      var meLines = [o.me ? "<b>" + esc(o.me) + "</b>" : "", esc(o.addr), esc(o.tel), o.person ? "担当：" + esc(o.person) : ""].filter(Boolean).join("<br>");
      return '<div class="sheet"><h1>発注書</h1><div class="meta">' + (no ? "発注番号 " + esc(no) + "<br>" : "") + (o.odate ? "発注日 " + esc(o.odate) : "発注日　　　年　　月　　日") + "</div>" +
        '<div class="hd"><div><div class="to">' + esc(g.sup === H.NOSUP ? "" : g.sup) + "　" + esc(o.hon) + '</div><p class="msg">下記のとおり発注いたします。</p>' + (cond ? '<table class="cond">' + cond + "</table>" : "") + "</div>" +
        '<div class="me">' + meLines + "</div></div>" +
        '<table class="pt"><thead>' + th + "</thead><tbody>" + body + "</tbody>" + foot + "</table>" +
        (o.remark ? '<div class="rem">備考：' + esc(o.remark) + "</div>" : "") +
        '<p class="small">' + g.items.length + " 品</p></div>";
    }).join("");
    $("printArea").innerHTML = html;
    $("saveMsg").textContent = "発注書 " + G.length + " 枚（仕入先ごと）を印刷します。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : "");
    window.print();
  }
  function printList() {
    if (!S.last) return;
    var G = groups(), o = setting(), hasP = S.cols.price != null;
    var rows = "";
    G.forEach(function (g, k) {
      rows += '<tr class="sup"><td colspan="' + (hasP ? 7 : 5) + '">' + esc(g.sup) + (orderNo(o, k) ? "（発注番号 " + esc(orderNo(o, k)) + "）" : "") + "　" + g.items.length + " 品" + (hasP ? "　" + F(g.total) + " 円" : "") + "</td></tr>";
      g.items.forEach(function (it) {
        var x = it.x;
        rows += "<tr><td>" + esc(x.name || x.code) + '</td><td class="n">' + F(x.stock) + (x.inc ? "＋" + F(x.inc) : "") + '</td><td class="n">' + F(x.point) + '</td><td class="n">' + F(it.qty) + " " + esc(x.unit) + "</td>" +
          (hasP ? '<td class="n">' + F(x.price) + '</td><td class="n">' + (it.amount != null ? F(it.amount) : "") + "</td>" : "") + "<td>&nbsp;</td></tr>";
      });
    });
    $("printArea").innerHTML = '<div class="sheet list"><h1>発注リスト' + (o.odate ? "（" + esc(o.odate) + "）" : "") + "</h1>" +
      '<p class="per">' + esc((S.name ? S.name + "　" : "") + "発注 " + G.reduce(function (a, g) { return a + g.items.length; }, 0) + " 品・仕入先 " + G.length + " 件　/　印刷日 " + new Date().toLocaleDateString("ja-JP")) + "</p>" +
      '<table class="pt"><thead><tr><th>品名</th><th class="n">在庫</th><th class="n">発注点</th><th class="n">発注する数</th>' + (hasP ? '<th class="n">単価</th><th class="n">金額</th>' : "") + '<th style="width:18mm">済</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function orderRows() {
    var o = setting(), out = [["発注番号", "仕入先", "品番", "品名", "発注する数", "単位", "単価", "金額", "在庫", "入荷予定", "発注点", "目標在庫", "元の行"]];
    groups().forEach(function (g, k) {
      g.items.forEach(function (it) {
        var x = it.x;
        out.push([orderNo(o, k), g.sup === H.NOSUP ? "" : g.sup, x.code, x.name, H.round(it.qty), x.unit, x.price, it.amount, x.stock, x.inc, x.point, x.target, rowNo(x.i)]);
      });
    });
    return out;
  }
  function detailRows() {
    var out = [S.headers.concat(["判定", "発注する数", "金額", "計算", "メモ"])], map = {};
    S.last.res.forEach(function (x) { map[x.i] = x; });
    S.rows.forEach(function (r, i) {
      var x = map[i];
      if (!x) { out.push(r.concat(["", "", "", "", ""])); return; }
      var q = x.err ? "" : qtyOf(x);
      out.push(r.concat([x.err ? "計算できない" : q > 0 ? "発注" : "足りている", q === "" ? "" : H.round(q), x.price != null && q ? H.round(q * x.price) : "", x.err ? x.err : [x.check, x.how].filter(Boolean).join("　"),
        x.notes.concat(S.over.hasOwnProperty(i) ? ["手で直した（計算は " + x.qty + "）"] : []).join("。")]));
    });
    return out;
  }
  function done(name) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(rows, name, sheet, numCols) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    // 数の列（numCols）だけ数として入れ、品番などは先頭の0が消えないよう文字列のまま
    var aoa = rows.map(function (r, ri) { return r.map(function (v, ci) { if (v == null) return ""; if (ri > 0 && numCols && numCols[ci] && typeof v === "number") return v; return String(v); }); });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, name); return true;
  }
  function saveOrders(kind) {
    if (!S.last) return;
    var rows = orderRows(), name = "発注一覧_" + ymd() + "." + kind;
    if (rows.length < 2) { $("saveMsg").textContent = "発注する品がありません。"; return; }
    if (kind === "csv") dlBlob(H.toCSV(rows), name); else if (!xlsx(rows, name, "発注一覧", { 4: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 })) return;
    done(name);
  }
  function saveDetail(kind) {
    if (!S.last) return;
    var rows = detailRows(), w = S.headers.length, name = "発注点チェック_明細_" + ymd() + "." + kind, nc = {}; nc[w + 1] = 1; nc[w + 2] = 1;
    if (kind === "csv") dlBlob(H.toCSV(rows), name); else if (!xlsx(rows, name, "明細", nc)) return;
    done(name);
  }

  // ---------- 見本（架空の店の備品・商品。仕入先の名前は架空） ----------
  var SAMPLE = "品番\t品名\t仕入先\t在庫\t入荷予定\t発注点\t目標在庫\t発注単位\t単位\t単価\n" +
    "P-001\tコピー用紙 A4（500枚）\t見本紙業\t3\t\t5\t20\t5\t冊\t480\n" +
    "P-002\tコピー用紙 A3（500枚）\t見本紙業\t4\t\t2\t6\t1\t冊\t960\n" +
    "P-010\t封筒 長3 白（100枚）\t見本紙業\t1\t2\t3\t8\t1\t箱\t650\n" +
    "T-101\tトナー 黒\t見本事務機\t1\t\t1\t3\t1\t本\t8200\n" +
    "T-102\tトナー カラー\t見本事務機\t2\t\t1\t3\t1\t本\t9800\n" +
    "C-201\tハンドソープ 詰め替え\t見本日用品\t2\t\t4\t\t6\t個\t320\n" +
    "C-202\tペーパータオル（200枚×5）\t見本日用品\t0\t\t3\t12\t5\tパック\t540\n" +
    "C-203\tごみ袋 45L（50枚）\t見本日用品\t6\t\t5\t10\t1\t袋\t380\n" +
    "C-204\t除菌シート\t見本日用品\t5\t\t5\t10\t3\t個\t260\n" +
    "D-301\tボールペン 黒（10本）\t\t1\t\t2\t5\t1\t箱\t900\n" +
    "D-302\t付せん 75mm\t\tなし\t\t3\t10\t1\t冊\t180\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["me", "addr", "tel", "person", "ddate", "dplace", "hon", "money", "showCode", "minRows", "remark", "rule"];
  function saveSettings() { try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.bySup = $("bySup").checked; localStorage.setItem("hacchu-sho", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("hacchu-sho") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); if (o.bySup != null) $("bySup").checked = o.bySup; } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    var d = new Date(), iso = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    $("odate").value = iso; $("prefix").value = ymd();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(H.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(H.parseCSV(SAMPLE), true, "見本"); };
    $("rule").onchange = function () { saveSettings(); S.over = {}; if (S.rows.length) refresh(); };
    $("showAll").onchange = function () { if (S.last) draw(); };
    $("bySup").onchange = function () { saveSettings(); if (S.last) draw(); };
    $("resetQty").onclick = function () { S.over = {}; if (S.last) draw(); };
    KEYS.forEach(function (k) { if (k !== "rule") $(k).addEventListener("change", saveSettings); });
    $("pOrder").onclick = printOrders; $("pList").onclick = printList;
    $("xOrd").onclick = function () { saveOrders("xlsx"); }; $("cOrd").onclick = function () { saveOrders("csv"); };
    $("xAll").onclick = function () { saveDetail("xlsx"); }; $("cAll").onclick = function () { saveDetail("csv"); };
  });
})();
