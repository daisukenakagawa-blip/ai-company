/* 在籍人数の月ごとの推移 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var Z = window.ZAISEKI;
  var LIMIT = window.ZAISEKI_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: {}, hasHead: true };
  var S = { R: null };
  var COLDEF = [["name", "名前の列"], ["join", "入会日の列"], ["leave", "退会日（任意）"], ["group", "コース・クラス（任意）"], ["kt", "休会の期間（任意）"], ["ks", "休会の始まり（任意）"], ["ke", "休会の終わり（任意）"]];

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    T.hasHead = $("hasHead").checked;
    T.headers = T.hasHead ? rows[0].map(function (h, i) { return Z.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = T.hasHead ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    prep();
    T.cols = Z.guessCols(T.headers);
    $("loadMsg").textContent = (NAME ? NAME + "：" : "") + T.rows.length + " 行 × " + T.headers.length + " 列を読み込みました。";
    $("colBox").hidden = false;
    drawCols(); refresh();
  }
  function drawCols() {
    var C = T.cols;
    $("cols").innerHTML = COLDEF.map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) { return '<option value="' + i + '"' + (C[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call($("cols").querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete C[s.dataset.k]; else C[s.dataset.k] = +s.value; refresh(); };
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
        var d = Z.decodeBytes(buf);
        setData(Z.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 計算 ----------
  function startYM() { var m = $("start").value.match(/^(\d{4})-(\d{2})$/); if (m) return { y: +m[1], m: +m[2] }; var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function multiYear() { return S.R.months.some(function (x) { return x.y !== S.R.months[0].y; }); }
  function mLabel(M) { return (multiYear() ? M.y + "年" : "") + M.m + "月"; }
  function periodText() { var MS = S.R.months, a = MS[0], b = MS[MS.length - 1]; return a.y + "年" + a.m + "月〜" + b.y + "年" + b.m + "月"; }
  function hasG() { return T.cols.group != null; }
  function hasK() { return T.cols.kt != null || T.cols.ks != null; }
  function clearOut(msg) { S.R = null; $("cards").innerHTML = ""; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function refresh() {
    saveSettings();
    var ready = T.rows.length > 0;
    $("out").hidden = !ready;
    if (!ready) return;
    if (T.cols.name == null) return clearOut('<span class="bad">名前の列を選んでください。</span>');
    if (T.cols.join == null) return clearOut('<span class="bad">入会日の列を選んでください。</span>');
    var s = startYM(), t0 = Date.now();
    var o = { cols: T.cols, y: s.y, m: s.m, k: +$("mcount").value, kyuIn: $("kyuIn").checked, rowBase: T.hasHead ? 2 : 1, limit: LIMIT };
    var R = Z.run(T.headers, T.rows, o);
    S.R = R; S.o = o;
    var t = R.tot, first = R.months[0], last = R.months[R.months.length - 1];
    $("cards").innerHTML = [
      ["期間の初め（" + mLabel(first) + "初）", t.start + " 人"], ["期間の終わり（" + mLabel(last) + "末）", t.end + " 人"],
      ["増えた・減った", (t.end - t.start >= 0 ? "+" : "") + (t.end - t.start) + " 人"], ["入会", t.joins + " 人"], ["退会", t.leaves + " 人"],
      ["月末の平均", t.avg + " 人"], ["月末の最多・最少", t.max + "・" + t.min + " 人"]
    ].map(function (c) { return '<div class="card"><span>' + esc(c[0]) + "</span><b>" + esc(c[1]) + "</b></div>"; }).join("");
    var errs = R.checks.filter(function (c) { return c.lv === "e"; }).length, warns = R.checks.length - errs;
    var parts = ["<b>" + esc(periodText()) + "</b>", "数えた人 " + R.counted + " 人"];
    if (errs) parts.push('<span class="bad">数えていない行 ' + errs + " 件（入会日が空欄・読めないなど。下の一覧を確かめてください）</span>");
    if (warns) parts.push('<span class="wtxt">確かめたい所 ' + warns + " 件</span>");
    if (R.cut) parts.push('<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを数えています（ほか " + R.cut + " 人）</span>");
    $("sumMsg").innerHTML = parts.join("　/　") + '<br><span class="note">' + ($("kyuIn").checked ? "休会中の人も在籍に数えています" : "休会中の人は在籍に数えていません") + "（" + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    listView(); errView();
  }

  // ---------- 表 ----------
  function monthRows() {
    var R = S.R, k = hasK(), kyuIn = S.o.kyuIn;
    var head = ["月", "月初の在籍", "入会", "退会", "月末の在籍"];
    if (k) { head.push(kyuIn ? "うち休会中" : "休会中（数えていない）"); if (kyuIn) head.push("通っている人"); head.push("休会に入った人"); }
    head.push("月の中で1日でも在籍");
    var body = R.months.map(function (x) {
      var r = [mLabel(x), x.begin, x.joins, x.leaves, x.end];
      if (k) { r.push(x.kyu); if (kyuIn) r.push(x.active); r.push(x.kyuStart); }
      r.push(x.during); return r;
    });
    var tot = ["期間（初め・計・終わり）", R.tot.start, R.tot.joins, R.tot.leaves, R.tot.end];
    if (k) { tot.push(""); if (kyuIn) tot.push(""); tot.push(R.months.reduce(function (a, x) { return a + x.kyuStart; }, 0)); }
    tot.push("");
    return { head: head, body: body, tot: tot };
  }
  function groupRows() {
    var R = S.R, head = ["コース"].concat(R.months.map(mLabel)).concat(["期間の入会", "期間の退会"]);
    var body = R.groups.map(function (g, i) { var s = R.gSum[i]; return [g].concat(R.months.map(function (x) { return x.byG[g] || 0; })).concat([s.joins, s.leaves]); });
    var tot = ["合計"].concat(R.months.map(function (x) { return x.end; })).concat([R.tot.joins, R.tot.leaves]);
    return { head: head, body: body, tot: tot };
  }
  function sortedPeople() {
    var a = S.R.people.slice(), s = $("sort").value;
    if (s === "join") a.sort(function (p, q) { return (p.join == null) - (q.join == null) || (p.join || 0) - (q.join || 0) || p.row - q.row; });
    if (s === "months") a.sort(function (p, q) { return (q.months == null ? -1 : q.months) - (p.months == null ? -1 : p.months) || p.row - q.row; });
    if (s === "group") a.sort(function (p, q) { return (p.group || "￿").localeCompare(q.group || "￿", "ja") || p.row - q.row; });
    return a;
  }
  function peopleRows() {
    var g = hasG(), k = hasK(), head = ["行", "名前"];
    if (g) head.push("コース");
    head = head.concat(["入会日", "退会日"]); if (k) head.push("休会");
    head = head.concat(["通算の在籍月数", "在籍の長さ", "期間の中の在籍月数", "期間の終わりの状態", "メモ"]);
    var body = sortedPeople().map(function (P) {
      var r = [P.row, P.name]; if (g) r.push(P.group);
      r.push(P.join != null ? Z.fmt(P.join) : P.joinText, P.leave != null ? Z.fmt(P.leave) : P.leaveText); if (k) r.push(P.kyuText);
      return r.concat([P.months == null ? "" : P.months, Z.tenure(P.months), P.inRange == null ? "" : P.inRange, P.status, P.notes.join("・")]);
    });
    return { head: head, body: body };
  }
  function nameRows() {
    return [["月", "入会した人", "退会した人"]].concat(S.R.months.map(function (x) { return [mLabel(x), x.joinNames.join("、"), x.leaveNames.join("、")]; }));
  }
  function chkRows() { return [["行", "名前", "内容"]].concat(S.R.checks.map(function (c) { return [c.row, c.name, c.why]; })); }

  function tableHTML(t, opt) {
    opt = opt || {};
    var max = 0; if (opt.bar != null) t.body.forEach(function (r) { max = Math.max(max, +r[opt.bar] || 0); });
    return '<table class="' + (opt.cls || "lt") + '"><tr>' + t.head.map(function (h, i) { return "<th" + (i >= (opt.left || 1) ? ' class="n"' : ' class="l"') + ">" + esc(h) + "</th>"; }).join("") + (opt.bar != null ? '<th class="l">' + esc(opt.barLabel || "") + "</th>" : "") + "</tr>" +
      t.body.map(function (r) {
        return "<tr" + (opt.fl && opt.fl(r) ? ' class="fl"' : "") + ">" + r.map(function (v, i) { return "<td" + (i >= (opt.left || 1) ? ' class="n"' : ' class="l' + (opt.wrap && opt.wrap(i) ? " w" : "") + '"') + ">" + esc(v) + "</td>"; }).join("") +
          (opt.bar != null ? '<td class="l"><span class="bar" style="width:' + (max ? Math.round((+r[opt.bar] || 0) / max * (opt.barW || 160)) : 0) + 'px"></span></td>' : "") + "</tr>";
      }).join("") +
      (t.tot ? '<tr class="tot">' + t.tot.map(function (v, i) { return "<td" + (i >= (opt.left || 1) ? ' class="n"' : ' class="l"') + ">" + esc(v) + "</td>"; }).join("") + (opt.bar != null ? "<td></td>" : "") + "</tr>" : "") + "</table>";
  }
  function listView() {
    var v = $("view").value, h = "";
    $("sortL").hidden = v !== "people";
    if (v === "month") {
      var t = monthRows();
      h = '<div class="scroll">' + tableHTML(t, { bar: 4, barLabel: "グラフ（月末の在籍）" }) + "</div>" + '<p class="note">「月の中で1日でも在籍」は、その月に入会・退会した人も含めた人数です（会場や助成の申請で「その月に在籍した人」を聞かれるときに）。月ごとの入会・退会した人の名前は Excel ファイルのシートに入ります。</p>';
    } else if (v === "group") {
      if (!hasG()) h = '<p class="note">コース・クラスの列を選ぶと、コースごとの月末の人数を出します。</p>';
      else h = '<div class="scroll">' + tableHTML(groupRows()) + "</div>";
    } else {
      var p = peopleRows(), gi = hasG() ? 1 : 0, k = hasK() ? 1 : 0;
      h = '<div class="scroll">' + tableHTML(p, { left: 99, fl: function (r) { return r[r.length - 2] === "数えていない"; }, wrap: function (i) { return i === p.head.length - 1; } }) + "</div>" +
        '<p class="note">通算の在籍月数は、入会した月から退会した月（在籍中の人は期間の終わりの月）までを、どちらの月も1か月として数えます。休会の月も含みます。</p>';
      void gi; void k;
    }
    $("listView").innerHTML = h;
  }
  function errView() {
    var c = S.R.checks;
    $("errView").innerHTML = !c.length ? "" : '<h3 style="font-size:14px;margin:14px 0 6px">確かめたい所（' + c.length + " 件）</h3>" + '<div class="scroll" style="max-height:260px"><table class="lt"><tr><th>行</th><th>名前</th><th>内容</th></tr>' +
      c.map(function (x) { return "<tr" + (x.lv === "e" ? ' class="fl"' : "") + "><td>" + x.row + "</td><td>" + esc(x.name) + '</td><td class="w">' + esc(x.why) + "</td></tr>"; }).join("") + "</table></div>";
  }

  // ---------- 印刷 ----------
  function title() { return $("title").value.trim() || "在籍人数の推移（" + periodText() + "）"; }
  function head() { var by = $("by").value.trim(); return "<h1>" + esc(title()) + '</h1><p class="per">' + esc(periodText()) + (by ? "　" + esc(by) : "") + "　数えた人 " + S.R.counted + " 人" + (S.R.cut ? "（お試し版：先頭 " + LIMIT + " 人）" : "") + "</p>"; }
  function doPrint(html, land) { $("pageSize").textContent = "@page{size:A4 " + (land ? "landscape" : "portrait") + ";margin:10mm}"; $("printArea").innerHTML = html; setTimeout(function () { window.print(); }, 50); }
  function printMonth() {
    var t = monthRows(), R = S.R;
    var note = "退会日はその日まで在籍。月末の在籍には、その月に退会した人を入れていません。" + (hasK() ? (S.o.kyuIn ? "休会中の人も在籍に数えています。" : "休会中の人は在籍に数えていません。") : "");
    doPrint(head() + "<h2>月ごとの推移</h2>" + tableHTML(t, { cls: "pt", bar: 4, barW: 120, barLabel: "月末の在籍" }) + '<p class="per">' + esc(note) + "</p>" +
      (R.groups.length && R.groups.length <= 12 && R.months.length <= 12 ? "<h2>コースごとの月末の人数</h2>" + tableHTML(groupRows(), { cls: "pt small" }) : ""), false);
  }
  function printGroup() { if (!hasG()) { $("saveMsg").textContent = "コース・クラスの列を選んでください。"; return; } doPrint(head() + "<h2>コースごとの月末の人数</h2>" + tableHTML(groupRows(), { cls: "pt" + (S.R.months.length > 12 ? " small" : "") }), S.R.months.length > 6); }
  function printPeople() { var p = peopleRows(); doPrint(head() + "<h2>1人ごとの在籍月数</h2>" + tableHTML(p, { cls: "pt small", left: 99, wrap: function (i) { return i === p.head.length - 1; } }), true); }

  // ---------- 保存 ----------
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function flat(t) { return [t.head].concat(t.body).concat(t.tot ? [t.tot] : []); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h) { return { wch: /人$|メモ|内容/.test(h) ? 40 : Math.max(9, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), m = flat(monthRows());
    XLSX.utils.book_append_sheet(wb, sheet(m), "月ごとの推移");
    if (hasG()) XLSX.utils.book_append_sheet(wb, sheet(flat(groupRows())), "コースごと");
    XLSX.utils.book_append_sheet(wb, sheet(flat(peopleRows())), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(nameRows()), "入会と退会の名前");
    if (S.R.checks.length) XLSX.utils.book_append_sheet(wb, sheet(chkRows()), "確かめたい所");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, m.length - 1);
  }

  // ---------- 設定の保存（数え方と団体名だけ。名前は保存しない） ----------
  var VALS = ["mcount", "by", "view", "sort"], CHK = ["kyuIn"];
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var SAMPLE = false;
  function saveSettings() { if (SAMPLE) return; var o = {}; VALS.forEach(function (k) { o[k] = $(k).value; }); CHK.forEach(function (k) { o[k] = $(k).checked; }); saveJSON("zaiseki-suii", o); }
  function loadSettings() { var o = loadJSON("zaiseki-suii") || {}; VALS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); CHK.forEach(function (k) { if (o[k] != null) $(k).checked = o[k]; }); }

  // ---------- 見本（架空の名前） ----------
  function sample() {
    SAMPLE = true;
    var rows = [["番号", "生徒名", "コース", "入会日", "退会日", "休会"],
      ["1", "青木 一郎", "ピアノ", "2021/4/10", "", ""],
      ["2", "石井 蓮", "英語", "2022/9/1", "2025/7/31", ""],
      ["3", "上田 葵", "ピアノ", "2023/4/8", "", "2025/6〜2025/8"],
      ["4", "江藤 さくら", "書道", "2024/1/13", "2026/3/31", ""],
      ["5", "大野 結衣", "英語", "2024/4/6", "", ""],
      ["6", "加藤 美咲", "ピアノ", "2024/6/1", "2025/9/30", ""],
      ["7", "木村 陸", "書道", "2024/10/5", "", "2025/12/1〜2026/1/31"],
      ["8", "工藤 葵", "英語", "2025/4/5", "", ""],
      ["9", "小林 蓮", "ピアノ", "2025/4/12", "", ""],
      ["10", "佐々木 心", "書道", "2025年5月", "", ""],
      ["11", "清水 大翔", "英語", "2025/5/17", "2025/5/31", ""],
      ["12", "鈴木 陽菜", "ピアノ", "2025/7/1", "", ""],
      ["13", "田中 湊", "英語", "2025/9/6", "", ""],
      ["14", "千葉 凛", "ピアノ", "2025/10/4", "", ""],
      ["15", "土屋 悠真", "書道", "2025/11/8", "2026/2/28", ""],
      ["16", "中村 結菜", "英語", "2026/1/10", "", ""],
      ["17", "西田 蒼", "ピアノ", "2026/2/7", "", ""],
      ["18", "野口 芽依", "英語", "2026/3/14", "", ""],
      ["19", "橋本 樹", "ピアノ", "2022/4/9", "2025/3/31", ""],
      ["20", "林 杏", "書道", "2023/9/2", "", "2025/4〜2025/9"],
      ["21", "藤田 蓮", "英語", "2025/8/30", "2025/12/31", ""],
      ["22", "松本 陽太", "ピアノ", "", "", ""],
      ["", "合計", "", "", "", ""]];
    $("hasHead").checked = true; $("start").value = "2025-04"; $("mcount").value = "12"; $("kyuIn").checked = true;
    $("title").value = "2025年度 在籍人数の推移（見本）"; $("by").value = "〇〇教室";
    setData(rows, "見本（架空の名前）");
  }

  // ---------- 画面 ----------
  function setFY(y) { $("start").value = y + "-04"; $("mcount").value = "12"; refresh(); }
  loadSettings();
  (function () { var d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1; var fy = m >= 4 ? y : y - 1; $("start").value = fy + "-04"; })();
  $("fy").onclick = function () { var d = new Date(); setFY(d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1); };
  $("lfy").onclick = function () { var d = new Date(); setFY((d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1) - 1); };
  $("cy").onclick = function () { $("start").value = new Date().getFullYear() + "-01"; $("mcount").value = "12"; refresh(); };
  $("file").onchange = function () { SAMPLE = false; if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); SAMPLE = false; if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; SAMPLE = false; setData(Z.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) setData(RAW, NAME); };
  ["start", "mcount", "kyuIn"].forEach(function (k) { $(k).onchange = refresh; });
  ["view", "sort"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  $("by").onchange = saveSettings;
  $("sample").onclick = sample;
  $("pMonth").onclick = function () { if (S.R) printMonth(); };
  $("pGroup").onclick = function () { if (S.R) printGroup(); };
  $("pPeople").onclick = function () { if (S.R) printPeople(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cMonth").onclick = function () { if (!S.R) return; var r = flat(monthRows()), n = fname("csv", "月ごと"); dl(n, Z.toCSV(r)); done(n, r.length - 1); };
  $("cPeople").onclick = function () { if (!S.R) return; var r = flat(peopleRows()), n = fname("csv", "1人ごと"); dl(n, Z.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
})();
