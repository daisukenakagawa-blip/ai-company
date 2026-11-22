/* 部品表の必要数と作れる数 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.BUHIN;
  var LIMIT = window.BUHIN_LIMIT || Infinity; // お試し版は部品表・在庫の先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHOW = 500;
  var T = { A: { headers: [], rows: [], cols: {}, name: "" }, B: { headers: [], rows: [], cols: {}, name: "" } };
  var COLS = {
    A: [["parent", "親（製品・セット）"], ["child", "子（部品・材料・中身）"], ["qty", "数（親1個あたり）"], ["childName", "子の名前（任意）"], ["parentName", "親の名前（任意）"], ["unit", "単位（任意）"]],
    B: [["code", "品番・部品コード"], ["qty", "在庫数"], ["name", "名前（任意）"]]
  };
  var S = { g: null, stock: null, plan: {}, last: null, mk: null, extraPlan: {} };

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
    t.cols = k === "A" ? K.guessBom(hasHead ? t.headers : []) : K.guessStock(hasHead ? t.headers : []);
    if (!hasHead) { if (k === "A") { t.cols = { parent: 0, child: 1, qty: 2 }; } else { t.cols = { code: 0, qty: w - 1 }; } }
    $("loadMsg" + k).innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを使います。</span>" : "");
    drawCols(k);
    rebuild();
  }
  function drawCols(k) {
    var t = T[k], el = $("cols" + k);
    el.hidden = false;
    el.innerHTML = COLS[k].map(function (c) {
      return "<label>" + c[1] + '</label><select data-k="' + c[0] + '"><option value="">（なし）</option>' +
        t.headers.map(function (h, i) { return '<option value="' + i + '"' + (t.cols[c[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete t.cols[sel.dataset.k]; else t.cols[sel.dataset.k] = +sel.value; rebuild(); };
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

  // ---------- 部品表と在庫を組み立てる ----------
  function opt() { return { hyphen: $("hyphen").checked }; }
  function rowNo(k, i) { return i + (T[k].hasHead ? 2 : 1); }
  function rebuild() {
    S.g = null; S.stock = null;
    var a = T.A;
    if (a.rows.length) {
      var miss = [["parent", "親（製品）"], ["child", "子（部品）"], ["qty", "数"]].filter(function (c) { return a.cols[c[0]] == null; });
      if (miss.length) { $("colMsgA").innerHTML = '<span class="bad">' + miss.map(function (c) { return "「" + c[1] + "」"; }).join("・") + " の列を選んでください。</span>"; }
      else { $("colMsgA").textContent = ""; S.g = K.buildBom(a.rows, a.cols, opt()); }
    }
    var b = T.B;
    if (b.rows.length) {
      if (b.cols.qty == null || (b.cols.code == null && b.cols.name == null)) $("colMsgB").innerHTML = '<span class="bad">「品番」と「在庫数」の列を選んでください。</span>';
      else { $("colMsgB").textContent = ""; S.stock = K.buildStock(b.rows, b.cols, opt()); }
    }
    $("planBox").hidden = !S.g; $("optBox").hidden = !S.g;
    drawPlan();
    refresh();
  }
  function label(k) { return S.g ? K.label(S.g, k) : k; }
  function nameOf(k) { var it = S.g && S.g.items[k]; return (it && it.name) || (S.stock && S.stock.names[k]) || ""; }
  function codeOf(k) { var it = S.g && S.g.items[k]; return (it && it.code) || (S.extraPlan[k] || k); }

  // ---------- 作る数 ----------
  function planTargets() {
    if (!S.g) return [];
    var g = S.g, mids = $("planMid").checked;
    var list = g.tops.slice();
    if (mids) g.order.forEach(function (k) { var it = g.items[k]; if (it.children.length && Object.keys(it.parents).length) list.push(k); });
    Object.keys(S.extraPlan).forEach(function (k) { if (list.indexOf(k) < 0) list.push(k); });
    return list;
  }
  function drawPlan() {
    if (!S.g) { $("planList").innerHTML = ""; return; }
    var list = planTargets();
    if (!list.length) { $("planList").innerHTML = '<p class="bad">いちばん上の製品が見つかりません（全部の品が、ほかの品の部品になっています）。下の「注意」を見てください。</p>'; return; }
    var h = '<div class="scroll short"><table class="lt"><thead><tr><th>製品・セット</th><th>名前</th><th class="n">作る数</th></tr></thead><tbody>';
    list.forEach(function (k) {
      var it = S.g.items[k], mid = it && Object.keys(it.parents).length, ext = !it;
      h += "<tr><td>" + esc(codeOf(k)) + (mid ? ' <span class="note">（途中の部品）</span>' : "") + (ext ? ' <span class="wtxt">（部品表にない）</span>' : "") + "</td><td>" + esc(nameOf(k)) + '</td><td class="n"><input type="number" min="0" step="any" class="pq" data-key="' + esc(k) + '" value="' + (S.plan[k] > 0 ? S.plan[k] : "") + '" placeholder="0"></td></tr>';
    });
    h += "</tbody></table></div>";
    $("planList").innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll(".pq"), function (inp) {
      inp.oninput = function () { var v = K.num(inp.value); if (v == null || isNaN(v) || v <= 0) delete S.plan[inp.dataset.key]; else S.plan[inp.dataset.key] = v; refresh(); };
    });
  }
  function pastePlan() {
    if (!S.g) return;
    var rows = K.parseCSV($("planPaste").value), set = 0, bad = [], unknown = [];
    rows.forEach(function (r, i) {
      var code = String(r[0] || "").trim(), v = K.num(r[r.length - 1]);
      if (!code) return;
      if (r.length < 2 || v == null || isNaN(v)) { if (i > 0) bad.push(code); return; } // 1行目が見出しなら黙って飛ばす
      var key = K.codeKey(code, opt());
      if (!S.g.items[key]) { unknown.push(code); S.extraPlan[key] = code; }
      if (v > 0) S.plan[key] = v; else delete S.plan[key];
      set++;
    });
    $("planMsg").innerHTML = esc(set + " 件の作る数を入れました。") + (unknown.length ? '<span class="wtxt">部品表にない品：' + esc(unknown.join("・")) + "（その品そのものを数えます）</span>" : "") + (bad.length ? '<span class="bad">数が読めない行：' + esc(bad.join("・")) + "</span>" : "");
    drawPlan(); refresh();
  }

  // ---------- 計算と表示 ----------
  function stockMap() { return S.stock ? S.stock.map : null; }
  function refresh() {
    var planned = Object.keys(S.plan).filter(function (k) { return S.plan[k] > 0; });
    var cyc = S.g && S.g.cycles.length;
    $("out").hidden = !S.g;
    if (!S.g) { S.last = S.mk = null; return; }
    noteView();
    if (cyc) { S.last = S.mk = null; $("sumMsg").innerHTML = '<span class="bad">部品表に輪になっている所があるため、計算できません。下の「注意」の行を直してください。</span>'; $("listView").innerHTML = ""; $("mkView").innerHTML = ""; return; }
    var o = { net: $("net").checked, names: S.stock ? S.stock.names : {} }, t0 = Date.now();
    var plan = {}; planned.forEach(function (k) { plan[k] = S.plan[k]; });
    S.last = planned.length ? K.run(S.g, plan, stockMap(), o) : null;
    S.mk = S.stock ? K.makeable(S.g, S.stock.map, o, S.g.tops) : null;
    var sec = ((Date.now() - t0) / 1000).toFixed(2);
    var parts = ["部品表：製品 " + S.g.tops.length + "・品 " + S.g.order.length + "（" + T.A.rows.length + " 行）"];
    if (S.last) {
      var c = S.last.count;
      parts.push("必要な部品 " + c.leaf + " 品" + (c.mid ? "（ほかに途中の部品 " + c.mid + "）" : ""));
      if (S.stock) parts.push(c.short ? '<span class="bad">足りない ' + c.short + " 品</span>" : '<span class="okc">足りない部品はありません</span>');
      if (c.nostock) parts.push('<span class="wtxt">在庫の表にない ' + c.nostock + " 品</span>");
    } else parts.push('<span class="wtxt">「2. 作る数」に数を入れると、部品の必要数を出します。</span>');
    $("sumMsg").innerHTML = parts.join("　/　") + '<span class="note">（' + sec + " 秒）</span>";
    listView(); mkView();
  }
  var LBL = { need: "", ok: "足りる", short: "不足", mid: "途中の部品" };
  var CLS = { need: "", ok: "okc", short: "bad", mid: "note" };
  function shown() {
    if (!S.last) return [];
    var onlyShort = $("onlyShort").checked && S.stock, mid = $("showMid").checked;
    return S.last.res.filter(function (x) { return (mid || x.leaf) && (!onlyShort || x.status === "short"); });
  }
  function listView() {
    if (!S.last) { $("listView").innerHTML = ""; return; }
    var list = shown(), st = !!S.stock;
    $("stockOpts").hidden = !st;
    if (!list.length) { $("listView").innerHTML = "<p>" + (st && $("onlyShort").checked ? "在庫で足りない部品はありません。" : "必要な部品はありません。") + "</p>"; return; }
    var h = '<div class="scroll"><table class="lt"><thead><tr>' + (st ? "<th>判定</th>" : "") + '<th>部品</th><th>名前</th><th class="n">必要数</th><th>単位</th>' + (st ? '<th class="n">在庫</th><th class="n">不足</th><th class="n">在庫の残り</th>' : "") + "<th>メモ</th></tr></thead><tbody>";
    list.slice(0, SHOW).forEach(function (x) {
      h += "<tr>" + (st ? '<td class="' + CLS[x.status] + '">' + LBL[x.status] + "</td>" : "") + "<td>" + esc(x.code) + "</td><td>" + esc(x.name || nameOf(x.key)) + '</td><td class="n">' + K.fmt(x.need) + "</td><td>" + esc(x.unit) + "</td>" +
        (st ? '<td class="n">' + (x.leaf ? (x.stock == null ? '<span class="wtxt">なし</span>' : K.fmt(x.stock)) : K.fmt(x.stock)) + '</td><td class="n ' + (x.short ? "bad" : "") + '">' + (x.leaf && x.short ? K.fmt(x.short) : "") + '</td><td class="n">' + (x.rest != null && x.rest >= 0 ? K.fmt(x.rest) : "") + "</td>" : "") +
        '<td class="wrap">' + esc(x.notes.join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    if (list.length > SHOW) h += '<p class="note">画面には先頭 ' + SHOW + " 品を出しています（全 " + list.length + " 品は保存すると入ります）。</p>";
    $("listView").innerHTML = h;
  }
  function mkView() {
    var el = $("mkView");
    if (!S.mk) { el.innerHTML = S.g ? '<p class="note">在庫の表を入れると、製品ごとに「いまの在庫であと何個作れるか」と、先に足りなくなる部品を出します。</p>' : ""; return; }
    var h = '<div class="scroll short"><table class="lt"><thead><tr><th>製品・セット</th><th>名前</th><th class="n">作れる数</th><th>先に足りなくなる部品</th><th>メモ</th></tr></thead><tbody>';
    S.mk.slice(0, SHOW).forEach(function (m) {
      var notes = [];
      if (m.missing.length) notes.push("在庫の表にない部品：" + m.missing.map(function (k) { return codeOf(k); }).join("・"));
      h += "<tr><td>" + esc(m.code) + "</td><td>" + esc(m.name || nameOf(m.key)) + '</td><td class="n ' + (m.n === 0 ? "bad" : "") + '">' + (m.n == null ? "―" : K.fmt(m.n)) + '</td><td class="wrap">' + esc(m.limit.map(label).join("・")) + '</td><td class="wrap">' + esc(notes.join("　")) + "</td></tr>";
    });
    h += "</tbody></table></div><p class=\"note\">作れる数は、<b>製品ごとに、その製品だけを作るとしたとき</b>の数です（いくつもの製品で同じ部品を使うときは、合わせて作れる数はこれより少なくなります。組み合わせは「2. 作る数」に入れて「不足」で確かめてください）。</p>";
    el.innerHTML = h;
  }
  function noteView() {
    var g = S.g, items = [];
    g.cycles.forEach(function (c) { items.push('<li class="bad">輪になっている：' + esc(c.map(function (k) { return g.items[k].code; }).join(" → ")) + "（ある品が、自分自身の部品になっています）</li>"); });
    g.errs.slice(0, 100).forEach(function (e) { items.push('<li>部品表の ' + rowNo("A", e.i) + " 行目（" + esc([e.parent, e.child].filter(Boolean).join(" → ")) + '）：<span class="bad">' + esc(e.err) + "</span>。計算に入れていません</li>"); });
    if (g.errs.length > 100) items.push("<li>ほかに読めない行が " + (g.errs.length - 100) + " 行あります</li>");
    g.dups.slice(0, 50).forEach(function (d) { items.push("<li>同じ組み合わせ（" + esc(g.items[d.parent].code + " → " + g.items[d.child].code) + "）が " + d.rows.map(function (i) { return rowNo("A", i); }).join("・") + ' 行目にあります。<span class="wtxt">数を足して計算しました</span>（二重に入れていないか確かめてください）</li>'); });
    if (S.stock) {
      S.stock.errs.slice(0, 50).forEach(function (e) { items.push("<li>在庫の " + rowNo("B", e.i) + " 行目（" + esc(e.code) + '）：<span class="bad">' + esc(e.err) + "</span>。在庫に入れていません</li>"); });
      Object.keys(S.stock.dups).slice(0, 50).forEach(function (k) { items.push("<li>在庫の表に「" + esc(k) + "」が " + S.stock.dups[k] + ' 行あります。<span class="wtxt">足して計算しました</span>（置き場所ごとの行なら、そのままで構いません）</li>'); });
      var known = 0; Object.keys(S.stock.map).forEach(function (k) { if (g.items[k]) known++; });
      if (!known && Object.keys(S.stock.map).length) items.push('<li class="bad">在庫の表の品番が、部品表の品番と1つも一致しません。品番の列の選び方を確かめてください。</li>');
    }
    $("noteView").innerHTML = items.length ? "<h3>注意</h3><ul class=\"nl\">" + items.join("") + "</ul>" : "";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function needRows(shortOnly) {
    var st = !!S.stock;
    var out = [shortOnly ? ["部品", "名前", "不足", "単位", "必要数", "在庫"] : ["区分", "部品", "名前", "必要数", "単位", "段"].concat(st ? ["在庫", "不足", "在庫の残り", "判定"] : []).concat(["メモ"])];
    (S.last ? S.last.res : []).forEach(function (x) {
      if (shortOnly) { if (x.status === "short") out.push([x.code, x.name || nameOf(x.key), K.fmt(x.short), x.unit, K.fmt(x.need), x.stock == null ? "" : K.fmt(x.stock)]); return; }
      out.push([x.leaf ? "部品" : "途中の部品", x.code, x.name || nameOf(x.key), K.fmt(x.need), x.unit, String(x.level)].concat(st ? [x.stock == null ? "" : K.fmt(x.stock), x.leaf ? K.fmt(x.short) : "", x.rest == null || x.rest < 0 ? "" : K.fmt(x.rest), LBL[x.status]] : []).concat([x.notes.join("　")]));
    });
    return out;
  }
  function planRows() {
    var out = [["製品・セット", "名前", "作る数"]];
    Object.keys(S.plan).forEach(function (k) { if (S.plan[k] > 0) out.push([codeOf(k), nameOf(k), K.fmt(S.plan[k])]); });
    return out;
  }
  function mkRows() {
    var out = [["製品・セット", "名前", "作れる数", "先に足りなくなる部品", "在庫の表にない部品"]];
    (S.mk || []).forEach(function (m) { out.push([m.code, m.name || nameOf(m.key), m.n == null ? "" : K.fmt(m.n), m.limit.map(label).join("・"), m.missing.map(codeOf).join("・")]); });
    return out;
  }
  function msg(t) { $("saveMsg").textContent = t + (LIMIT < Infinity ? "（お試し版は部品表・在庫の先頭 " + LIMIT + " 行の結果です）" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sheet(rows, numCols, widths) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r, ri) {
      return r.map(function (v, ci) {
        if (ri > 0 && numCols.indexOf(ci) >= 0 && v !== "") { var n = K.num(v); if (n != null && !isNaN(n)) return n; }
        return String(v == null ? "" : v);
      });
    }));
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; }); // 品番は文字のまま（先頭の0を消さない）
    ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    return ws;
  }
  function saveXlsx() {
    if (!S.g || (!S.last && !S.mk)) { msg("作る数か在庫を入れてから保存してください。"); return; }
    if (!window.XLSX) { msg("Excel の部品を読み込めませんでした。CSV で保存してください。"); return; }
    var wb = XLSX.utils.book_new(), st = !!S.stock;
    if (S.last) {
      XLSX.utils.book_append_sheet(wb, sheet(needRows(false), st ? [3, 5, 6, 7, 8] : [3, 5], [10, 14, 26, 10, 6, 4, 10, 10, 10, 8, 50]), "必要数");
      XLSX.utils.book_append_sheet(wb, sheet(planRows(), [2], [14, 26, 10]), "作る数");
    }
    if (S.mk) XLSX.utils.book_append_sheet(wb, sheet(mkRows(), [2], [14, 26, 10, 30, 30]), "作れる数");
    var name = "部品の必要数_" + ymd() + ".xlsx";
    XLSX.writeFile(wb, name); msg("保存しました（" + name + "）。");
  }
  function saveCsv(kind) {
    var rows, name;
    if (kind === "mk") { if (!S.mk) { msg("在庫の表を入れてください。"); return; } rows = mkRows(); name = "作れる数_" + ymd() + ".csv"; }
    else { if (!S.last) { msg("作る数を入れてください。"); return; } if (kind === "short" && !S.stock) { msg("在庫の表を入れてください。"); return; } rows = needRows(kind === "short"); name = (kind === "short" ? "足りない部品_" : "部品の必要数_") + ymd() + ".csv"; }
    dlBlob(K.toCSV(rows), name); msg("保存しました（" + name + "、" + (rows.length - 1) + " 行）。");
  }

  // ---------- 印刷 ----------
  function printIt() {
    var kind = $("pKind").value, title = $("title").value.trim(), memo = $("memo").value.trim();
    var head = "", body = "";
    if (kind === "mk") {
      if (!S.mk) { msg("在庫の表を入れてください。"); return; }
      title = title || "在庫で作れる数";
      body = '<table class="pt"><thead><tr><th>製品・セット</th><th>名前</th><th class="n">作れる数</th><th>先に足りなくなる部品</th></tr></thead><tbody>' +
        S.mk.map(function (m) { return '<tr><td class="nw">' + esc(m.code) + '</td><td class="nm">' + esc(m.name || nameOf(m.key)) + '</td><td class="n">' + (m.n == null ? "―" : K.fmt(m.n)) + "</td><td>" + esc(m.limit.map(label).join("・")) + "</td></tr>"; }).join("") + "</tbody></table>" +
        '<p class="per">作れる数は、製品ごとに、その製品だけを作るとしたときの数です。</p>';
    } else {
      if (!S.last) { msg("作る数を入れてください。"); return; }
      title = title || "部品の準備表";
      var list = S.last.res.filter(function (x) { return x.leaf || $("showMid").checked; }), st = !!S.stock;
      if (kind === "short") list = list.filter(function (x) { return x.status === "short"; });
      head = '<p class="per">作る数：' + esc(planRows().slice(1).map(function (r) { return r[0] + (r[1] ? "（" + r[1] + "）" : "") + " " + r[2]; }).join("、")) + "</p>";
      body = list.length ? '<table class="pt"><thead><tr><th>部品</th><th>名前</th><th class="n">必要数</th><th>単位</th>' + (st ? '<th class="n">在庫</th><th class="n">不足</th>' : "") + "<th>メモ</th><th>準備</th></tr></thead><tbody>" +
        list.map(function (x) {
          return '<tr><td class="nw">' + esc(x.code) + '</td><td class="nm">' + esc(x.name || nameOf(x.key)) + '</td><td class="n">' + K.fmt(x.need) + '</td><td class="nw">' + esc(x.unit) + "</td>" +
            (st ? '<td class="n">' + (x.stock == null ? "なし" : K.fmt(x.stock)) + '</td><td class="n">' + (x.leaf && x.short ? K.fmt(x.short) : "") + "</td>" : "") + '<td class="mm">' + esc(x.notes.join("　")) + '</td><td class="ck"></td></tr>';
        }).join("") + "</tbody></table>" : "<p>足りない部品はありません。</p>";
    }
    var cond = [memo, "部品表 " + T.A.rows.length + " 行" + (T.A.name ? "（" + T.A.name + "）" : ""), S.stock ? "在庫 " + T.B.rows.length + " 行" : "", "作成日 " + new Date().toLocaleDateString("ja-JP")].filter(Boolean).join("　/　");
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" + head + body + '<p class="sign">確認日 <span></span>確認者 <span></span></p>';
    window.print();
  }

  // ---------- 見本（架空の品と数。実在の商品・会社とは関係ありません） ----------
  var SAMPLE_A = "製品コード\t製品名\t部品コード\t部品名\t員数\t単位\n" +
    "G-A\t見本のギフトセットA\tBOX-S\t箱（小）\t1\t個\nG-A\t見本のギフトセットA\tBAG-C\tクッキーの小袋\t2\t袋\nG-A\t見本のギフトセットA\tRIB-R\tリボン（赤）\t0.6\tm\nG-A\t見本のギフトセットA\tCARD\tメッセージカード\t1\t枚\n" +
    "G-B\t見本のギフトセットB\tBOX-L\t箱（大）\t1\t個\nG-B\t見本のギフトセットB\tBAG-C\tクッキーの小袋\t3\t袋\nG-B\t見本のギフトセットB\tJAM-1\tジャムの小瓶\t1\t個\nG-B\t見本のギフトセットB\tRIB-R\tリボン（赤）\t0.8\tm\nG-B\t見本のギフトセットB\tCARD\tメッセージカード\t1\t枚\n" +
    "BAG-C\tクッキーの小袋\tCK-1\tクッキー\t6\t枚\nBAG-C\tクッキーの小袋\tPK-1\t透明の袋\t1\t枚\nBAG-C\tクッキーの小袋\tSEAL\t封のシール\t1\t枚\n";
  var SAMPLE_B = "部品コード\t部品名\t在庫数\n" +
    "BOX-S\t箱（小）\t40\nBOX-L\t箱（大）\t10\nBAG-C\tクッキーの小袋\t15\nRIB-R\tリボン（赤）\t25\nCARD\tメッセージカード\t50\n" +
    "CK-1\tクッキー\t300\nPK-1\t透明の袋\t60\nSEAL\t封のシール\t40\nJAM-1\tジャムの小瓶\t15\n";
  var SAMPLE_PLAN = { "G-A": 30, "G-B": 12 };

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["hyphen", "net", "onlyShort", "showMid", "planMid"];
  function saveSettings() { try { var o = { title: $("title").value, pKind: $("pKind").value }; KEYS.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("buhin-keisan", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("buhin-keisan") || "{}"); if (o.title != null) $("title").value = o.title; if (o.pKind) $("pKind").value = o.pKind; KEYS.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

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
      S.plan = {}; S.extraPlan = {};
      Object.keys(SAMPLE_PLAN).forEach(function (c) { S.plan[K.codeKey(c, opt())] = SAMPLE_PLAN[c]; });
      setData("A", K.parseCSV(SAMPLE_A), true, "見本の部品表"); setData("B", K.parseCSV(SAMPLE_B), true, "見本の在庫");
    };
    $("hyphen").onchange = function () { // 品番の鍵が変わるので、作る数を品番で引き継ぐ
      saveSettings(); var old = S.plan, ex = S.extraPlan; S.plan = {}; S.extraPlan = {};
      Object.keys(old).forEach(function (k) { var nk = K.codeKey(ex[k] || codeOf(k), opt()); S.plan[nk] = old[k]; });
      Object.keys(ex).forEach(function (k) { S.extraPlan[K.codeKey(ex[k], opt())] = ex[k]; });
      rebuild();
    };
    $("net").onchange = function () { saveSettings(); refresh(); };
    $("planMid").onchange = function () { saveSettings(); drawPlan(); };
    $("onlyShort").onchange = $("showMid").onchange = function () { saveSettings(); listView(); };
    $("pKind").onchange = saveSettings; $("title").onchange = saveSettings;
    $("planClear").onclick = function () { S.plan = {}; drawPlan(); refresh(); };
    $("planAll").onclick = function () { var v = K.num($("planAllN").value); if (v == null || isNaN(v) || v < 0) return; planTargets().forEach(function (k) { if (v > 0) S.plan[k] = v; else delete S.plan[k]; }); drawPlan(); refresh(); };
    $("planPasteGo").onclick = pastePlan;
    $("pGo").onclick = printIt;
    $("xAll").onclick = saveXlsx; $("cNeed").onclick = function () { saveCsv("need"); }; $("cShort").onclick = function () { saveCsv("short"); }; $("cMk").onclick = function () { saveCsv("mk"); };
  });
})();
