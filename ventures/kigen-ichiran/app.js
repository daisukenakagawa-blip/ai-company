/* 期限の一覧 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KIGEN;
  var LIMIT = window.KIGEN_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", cols: { dates: [] }, last: null };
  var SHOW = 1000;
  var COLS = [["name", "項目（何の期限か）", 1], ["cat", "区分（契約・資格・車など）"], ["who", "担当者"], ["memo", "備考"], ["lead", "何日前から知らせるか（行ごと）"], ["done", "済み（更新・手続きが終わった印）"]];
  var BL = { over: "期限切れ", soon: "もうすぐ", next: "近いうち", later: "先の予定", done: "済み" };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    S.cols = K.guessColumns(hasHead ? S.headers : S.headers.map(function () { return ""; }), S.rows);
    var opts = function (k) {
      return '<option value="">（なし）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (S.cols[k] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
    };
    $("dateCols").innerHTML = S.headers.map(function (h, i) {
      return '<label><input type="checkbox" value="' + i + '"' + (S.cols.dates.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("");
    $("colGrid").innerHTML = COLS.map(function (c) {
      return '<label><span>' + esc(c[1]) + (c[2] ? "（必須）" : "") + '</span><select data-k="' + c[0] + '">' + opts(c[0]) + "</select></label>";
    }).join("");
    Array.prototype.forEach.call($("colGrid").querySelectorAll("select"), function (sel) {
      sel.onchange = function () { if (sel.value === "") delete S.cols[sel.dataset.k]; else S.cols[sel.dataset.k] = +sel.value; refresh(); };
    });
    Array.prototype.forEach.call($("dateCols").querySelectorAll("input"), function (cb) {
      cb.onchange = function () {
        S.cols.dates = Array.prototype.filter.call($("dateCols").querySelectorAll("input"), function (c) { return c.checked; }).map(function (c) { return +c.value; });
        refresh();
      };
    });
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけで一覧を作ります。</span>" : "");
    ["step2", "out"].forEach(function (id) { $(id).hidden = false; });
    refresh();
  }
  function cellText(v) {
    if (v instanceof Date) { var d = new Date(v.getTime() + 12 * 3600e3); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
    return String(v == null ? "" : v);
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" })
            .map(function (r) { return r.map(cellText); })
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

  // ---------- 一覧 ----------
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  function baseDay() {
    var v = $("base").value.split("-");
    return v.length === 3 ? K.dayNum(+v[0], +v[1], +v[2]) : null;
  }
  function opt() {
    var soon = parseInt($("soon").value, 10), next = parseInt($("next").value, 10);
    if (!(soon >= 0)) soon = 30; if (!(next >= 0)) next = 90; if (next < soon) next = soon;
    return { base: baseDay(), soon: soon, next: next };
  }
  function refresh() {
    var miss = [];
    if (S.cols.name == null) miss.push("項目");
    if (!S.cols.dates.length) miss.push("期限の列（1つ以上）");
    if (baseDay() == null) miss.push("基準日");
    if (miss.length) { $("sumMsg").innerHTML = '<span class="wtxt">「' + miss.join("」「") + "」を選んでください。</span>"; $("listView").innerHTML = ""; $("errView").innerHTML = ""; S.last = null; return; }
    var o = opt();
    $("lblSoon").textContent = o.soon; $("lblNext").textContent = o.next;
    S.last = K.build(S.rows, S.headers, S.cols, o);
    draw();
  }
  function shownBuckets() { return ["over", "soon", "next", "later", "done"].filter(function (b) { return $("f_" + b).checked; }); }
  function visible() { var sb = shownBuckets(); return S.last.items.filter(function (x) { return sb.indexOf(x.b) >= 0; }); }
  function groupKey() { var g = $("group").value; return g === "cat" || g === "who" ? g : ""; }
  function groupOf(list) {
    var k = groupKey();
    if (!k) return [{ g: "", items: list }];
    var m = {}, order = [];
    list.forEach(function (x) { var v = x[k] || "（" + (k === "cat" ? "区分" : "担当") + "なし）"; if (!m[v]) { m[v] = []; order.push(v); } m[v].push(x); });
    return order.map(function (v) { return { g: v, items: m[v] }; });
  }
  function stateCell(x) {
    var t = BL[x.b] + (x.b === "soon" && x.lead != null ? "（" + x.lead + "日前から）" : "");
    return '<span class="tag t-' + x.b + '">' + esc(t) + "</span>";
  }
  function draw() {
    var c = S.last.count, o = opt();
    $("sumMsg").innerHTML = '基準日 ' + esc(K.jp(o.base)) + "　/　期限 " + c.total + " 件<br>" +
      '<span class="tag t-over">期限切れ ' + c.over + '</span> <span class="tag t-soon">もうすぐ（' + o.soon + "日以内） " + c.soon + '</span> <span class="tag t-next">近いうち（' + o.next + "日以内） " + c.next + '</span> <span class="tag t-later">先の予定 ' + c.later + "</span>" +
      (S.cols.done != null ? ' <span class="tag t-done">済み ' + c.done + "</span>" : "") +
      (c.err ? '　<span class="bad">日付が読めない ' + c.err + " 件</span>" : "") + (c.blank ? '　<span class="note">期限が空欄の行 ' + c.blank + "</span>" : "");
    var list = visible(), multi = S.cols.dates.length > 1, G = groupOf(list);
    if (!list.length) $("listView").innerHTML = "<p>表示する期限はありません（上のチェックで表示する区分を選べます）。</p>";
    else {
      var hc = S.cols.cat != null, hw = S.cols.who != null, hm = S.cols.memo != null, gk = groupKey();
      var ncol = 5 + multi + (hc && gk !== "cat") + (hw && gk !== "who") + hm + 1;
      var h = '<div class="scroll"><table class="lt"><thead><tr><th>期限</th><th class="n">残り</th><th>状態</th><th>項目</th>' + (multi ? "<th>何の期限</th>" : "") +
        (hc && gk !== "cat" ? "<th>区分</th>" : "") + (hw && gk !== "who" ? "<th>担当</th>" : "") + (hm ? "<th>備考</th>" : "") + '<th class="n">行</th><th>注意</th></tr></thead><tbody>';
      var shown = 0;
      G.some(function (g) {
        if (g.g) h += '<tr class="grp"><td colspan="' + ncol + '">' + esc(g.g) + "（" + g.items.length + " 件）</td></tr>";
        return g.items.some(function (x) {
          if (++shown > SHOW) return true;
          h += '<tr class="r-' + x.b + '"><td>' + esc(K.jp(x.date)) + '</td><td class="n">' + esc(K.daysText(x)) + "</td><td>" + stateCell(x) + "</td><td>" + esc(x.name) + "</td>" + (multi ? "<td>" + esc(x.kind) + "</td>" : "") +
            (hc && gk !== "cat" ? "<td>" + esc(x.cat) + "</td>" : "") + (hw && gk !== "who" ? "<td>" + esc(x.who) + "</td>" : "") + (hm ? '<td class="wrap">' + esc(x.memo) + "</td>" : "") +
            '<td class="n">' + rowNo(x.i) + '</td><td class="wrap wtxt">' + esc(x.notes.join("。")) + (x.b === "done" && x.doneText ? '<span class="note">済み：' + esc(x.doneText) + "</span>" : "") + "</td></tr>";
          return false;
        });
      });
      h += "</tbody></table></div>";
      if (shown > SHOW) h += '<p class="note">画面には ' + SHOW + " 件まで出しています（全部は保存・印刷に入ります）。</p>";
      $("listView").innerHTML = h;
    }
    var errs = S.last.errs, blank = S.last.blank, eh = "";
    if (errs.length) eh += '<h3 class="bad">日付が読めない期限（' + errs.length + "）</h3>" + '<div class="scroll" style="max-height:220px"><table class="lt"><thead><tr><th class="n">行</th><th>項目</th>' + (multi ? "<th>何の期限</th>" : "") + "<th>理由</th></tr></thead><tbody>" +
      errs.slice(0, SHOW).map(function (x) { return '<tr><td class="n">' + rowNo(x.i) + "</td><td>" + esc(x.name) + "</td>" + (multi ? "<td>" + esc(x.kind) + "</td>" : "") + '<td class="wrap">' + esc(x.err) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (blank.length) eh += '<p class="note">期限の欄が空欄の行（' + blank.length + "）：" + blank.slice(0, 50).map(function (x) { return rowNo(x.i) + "行目" + (x.name ? "（" + esc(x.name) + "）" : ""); }).join("、") + (blank.length > 50 ? " ほか" : "") + "</p>";
    $("errView").innerHTML = eh;
  }

  // ---------- 印刷 ----------
  function printList() {
    if (!S.last) return;
    var list = visible(), o = opt(), multi = S.cols.dates.length > 1, hc = S.cols.cat != null, hw = S.cols.who != null, hm = S.cols.memo != null;
    if (!list.length) { $("saveMsg").textContent = "印刷する期限がありません。"; return; }
    var title = $("ptitle").value.trim() || "期限の一覧", per = $("perGroup").checked && groupKey();
    var G = per ? groupOf(list) : [{ g: "", items: list }];
    var html = G.map(function (g) {
      var rows = "", cur = "";
      var order = ["over", "soon", "next", "later", "done"];
      var items = g.items.slice().sort(function (a, b) { return order.indexOf(a.b) - order.indexOf(b.b) || a.date - b.date; });
      var ncol = 5 + multi + hc + hw + hm;
      items.forEach(function (x) {
        if (x.b !== cur) { cur = x.b; rows += '<tr class="sec"><td colspan="' + ncol + '">' + esc(BL[x.b] + (x.b === "soon" ? "（" + o.soon + "日以内）" : x.b === "next" ? "（" + o.next + "日以内）" : "")) + "　" + items.filter(function (y) { return y.b === x.b; }).length + " 件</td></tr>"; }
        rows += "<tr><td>" + esc(K.jp(x.date)) + '</td><td class="n">' + esc(K.daysText(x)) + "</td><td>" + esc(x.name) + "</td>" + (multi ? "<td>" + esc(x.kind) + "</td>" : "") +
          (hc ? "<td>" + esc(x.cat) + "</td>" : "") + (hw ? "<td>" + esc(x.who) + "</td>" : "") + (hm ? "<td>" + esc(x.memo) + "</td>" : "") + "<td>&nbsp;</td><td>&nbsp;</td></tr>";
      });
      return '<div class="sheet"><h1>' + esc(title) + (g.g ? "　" + esc(g.g) : "") + "</h1>" +
        '<p class="per">基準日 ' + esc(K.jp(o.base)) + "　/　" + items.length + " 件　/　印刷日 " + esc(K.jp(K.dayNum(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()))) + "</p>" +
        '<table class="pt"><thead><tr><th style="width:30mm">期限</th><th class="n" style="width:20mm">残り</th><th>項目</th>' + (multi ? "<th>何の期限</th>" : "") + (hc ? "<th>区分</th>" : "") + (hw ? "<th>担当</th>" : "") + (hm ? "<th>備考</th>" : "") +
        '<th style="width:22mm">対応日</th><th style="width:12mm">確認</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    }).join("");
    $("printArea").innerHTML = html;
    $("saveMsg").textContent = G.length + " 枚分を印刷します。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : "");
    window.print();
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function listRows() {
    var out = [["期限", "曜日", "残り日数", "状態", "項目", "何の期限", "区分", "担当", "備考", "知らせ始める日", "元の行", "注意"]];
    visible().forEach(function (x) {
      out.push([K.iso(x.date), K.wday(x.date), x.days, BL[x.b], x.name, x.kind, x.cat, x.who, x.memo, x.b === "done" ? "" : K.iso(x.notice), rowNo(x.i), x.notes.join("。")]);
    });
    return out;
  }
  function detailRows() {
    var o = opt(), add = [];
    S.cols.dates.forEach(function (ci) { var h = S.headers[ci]; add.push(h + "（読み取った日付）", h + "（残り日数）", h + "（状態）"); });
    var out = [S.headers.concat(add)], map = {};
    S.last.items.concat(S.last.errs).forEach(function (x) { map[x.i + "|" + (x.kind || "")] = x; });
    var multi = S.cols.dates.length > 1;
    S.rows.forEach(function (r, i) {
      var extra = [];
      S.cols.dates.forEach(function (ci) {
        var x = map[i + "|" + (multi ? K.norm(S.headers[ci]).replace(/[\s　]+/g, " ") : "")];
        if (!x) extra.push("", "", ""); else if (x.err) extra.push("", "", x.err); else extra.push(K.iso(x.date), x.days, BL[x.b]);
      });
      out.push(r.concat(extra));
    });
    return out;
  }
  function done(name) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dl(text, name, type) {
    var blob = new Blob([text], { type: type || "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function xlsx(rows, name, sheet, numCols) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    var aoa = rows.map(function (r, ri) { return r.map(function (v, ci) { if (v == null) return ""; if (ri > 0 && numCols && numCols(ci) && typeof v === "number") return v; return String(v); }); });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    Object.keys(ws).forEach(function (k) { if (k[0] !== "!" && ws[k].t === "s") ws[k].z = "@"; });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, name); return true;
  }
  function saveList(kind) {
    if (!S.last) return;
    var rows = listRows(), name = "期限の一覧_" + ymd() + "." + kind;
    if (rows.length < 2) { $("saveMsg").textContent = "保存する期限がありません。"; return; }
    if (kind === "csv") dl(K.toCSV(rows), name); else if (!xlsx(rows, name, "期限の一覧", function (ci) { return ci === 2 || ci === 10; })) return;
    done(name);
  }
  function saveDetail(kind) {
    if (!S.last) return;
    var rows = detailRows(), w = S.headers.length, name = "期限の一覧_明細_" + ymd() + "." + kind;
    if (kind === "csv") dl(K.toCSV(rows), name); else if (!xlsx(rows, name, "明細", function (ci) { return ci >= w && (ci - w) % 3 === 1; })) return;
    done(name);
  }
  function saveICS() {
    if (!S.last) return;
    var o = opt(), items = S.last.items.filter(function (x) { return x.b !== "done" && x.days >= 0 && shownBuckets().indexOf(x.b) >= 0; });
    if (!items.length) { $("saveMsg").textContent = "カレンダーに入れる期限がありません（期限切れと済みは入れません）。"; return; }
    var al = $("alarm").value;
    var text = K.toICS(items, { alarm: al === "" ? null : +al, notice: $("notice").checked, base: o.base });
    var name = "期限の一覧_" + ymd() + ".ics";
    dl(text, name, "text/calendar");
    $("saveMsg").textContent = "カレンダーのファイルを保存しました（" + name + "、期限 " + items.length + " 件）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : "");
  }

  // ---------- 見本（架空の事務所の期限。名前は架空） ----------
  function sample() {
    var b = baseDay() == null ? K.dayNum(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()) : baseDay();
    function d(k) { var a = K.iso(b + k).split("-"); return a[0] + "/" + (+a[1]) + "/" + (+a[2]); }
    return "項目\t区分\t担当\t期限\t何日前から\t済み\t備考\n" +
      "防火管理者 再講習\t資格\t佐藤\t" + d(-3) + "\t\t\t\n" +
      "損害保険（事務所）\t保険\t田中\t" + d(9) + "\t\t更新済\t\n" +
      "複合機の保守契約\t契約\t田中\t" + d(12) + "\t\t\t自動更新。解約するなら1か月前まで\n" +
      "社用車 1号 車検\t車\t鈴木\t" + d(26) + "\t45\t\t\n" +
      "事務所の賃貸契約\t契約\t田中\t" + d(55) + "\t90\t\t更新の連絡は2か月前\n" +
      "消火器の点検\t設備\t鈴木\t" + d(40) + "\t\t\t\n" +
      "ドメインの更新\t契約\t佐藤\t" + d(75) + "\t\t\t\n" +
      "フォークリフト 特定自主検査\t設備\t鈴木\t" + d(150) + "\t60\t\t\n" +
      "社用車 2号 自賠責保険\t車\t鈴木\t" + d(210) + "\t\t\t\n" +
      "救急箱の薬\t設備\t佐藤\t" + (K.iso(b + 120).slice(0, 7).replace("-", "年").replace(/年0?/, "年") + "月") + "\t\t\t使用期限は月までの表示\n" +
      "健康診断の予約\t\t田中\tまだ決めていない\t\t\t\n";
  }

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["soon", "next", "group", "alarm", "ptitle"];
  var CHK = ["f_over", "f_soon", "f_next", "f_later", "f_done", "perGroup", "notice"];
  function saveSettings() { try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); CHK.forEach(function (k) { o[k] = $(k).checked; }); localStorage.setItem("kigen-ichiran", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("kigen-ichiran") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); CHK.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    var d = new Date();
    $("base").value = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(K.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { var s = sample(); $("paste").value = s; $("hasHead").checked = true; setData(K.parseCSV(s), true, "見本"); };
    ["base", "soon", "next"].forEach(function (k) { $(k).addEventListener("change", function () { saveSettings(); if (S.rows.length) refresh(); }); });
    ["f_over", "f_soon", "f_next", "f_later", "f_done", "group"].forEach(function (k) { $(k).addEventListener("change", function () { saveSettings(); if (S.last) draw(); }); });
    ["alarm", "ptitle", "perGroup", "notice"].forEach(function (k) { $(k).addEventListener("change", saveSettings); });
    $("pList").onclick = printList;
    $("xList").onclick = function () { saveList("xlsx"); }; $("cList").onclick = function () { saveList("csv"); };
    $("xAll").onclick = function () { saveDetail("xlsx"); }; $("cAll").onclick = function () { saveDetail("csv"); };
    $("ics").onclick = saveICS;
  });
})();
