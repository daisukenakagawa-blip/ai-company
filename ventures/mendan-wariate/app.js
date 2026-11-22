/* 面談の日程の割り当て — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var M = window.MENDAN;
  var LIMIT = window.MENDAN_LIMIT || Infinity; // お試し版は先頭の人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], total: 0, slots: [], P: null, a: null, groups: [], nameCol: 0, guess: null };

  // ---------- 面談の枠 ----------
  function roomList() { return $("rooms").value.split(/[、,，]/).map(function (x) { return M.clean(x); }).filter(Boolean); }
  function slotSum(slots) {
    var by = {}, order = [];
    slots.forEach(function (s) { var k = M.shortDate(s); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(s); });
    return order.map(function (k) { var a = by[k]; return k + " " + M.hm(a[0].start) + "〜" + M.hm(Math.max.apply(null, a.map(function (s) { return s.end; }))) + "：" + a.length + "枠"; }).join("、");
  }
  function updateSlots() {
    var r = M.makeSlots($("days").value, +$("len").value, +$("gap").value, roomList(), new Date());
    S.slots = r.slots;
    var h = r.slots.length ? "<b>" + r.slots.length + " 枠</b>（" + esc(slotSum(r.slots)) + "）" + (roomList().length > 1 ? "。部屋ごとに同じ時刻の枠があります。" : "") : "面談の日と時間帯を入れてください。";
    if (r.problems.length) h += '<br><span class="wtxt">' + r.problems.map(esc).join("<br>") + "</span>";
    if (S.rows.length && r.slots.length && r.slots.length < S.rows.length) h += '<br><span class="wtxt">枠の数（' + r.slots.length + "）が人数（" + S.rows.length + "）より少ないため、全員は入りません。</span>";
    $("slotMsg").innerHTML = h;
    saveSettings();
  }

  // ---------- 読み込み ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="-1">（使わない）</option>' : "") + S.headers.map(function (h, i) { return '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r.map(function (v) { return String(v == null ? "" : v); }); });
    S.headers = hasHead ? rows[0].map(function (h, i) { return M.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    S.a = null;
    var nc = M.guessName(S.headers); S.guess = M.guessMode(S.headers, S.rows);
    $("nameCol").innerHTML = opts(nc, false);
    $("sibCol").innerHTML = opts(M.guessSib(S.headers), true);
    document.querySelector('input[name=mode][value=' + S.guess.mode + ']').checked = true;
    colPick();
    $("showCols").innerHTML = S.headers.map(function (h, i) { return '<label><input type="checkbox" value="' + i + '"' + (i === nc ? " checked" : "") + "> " + esc(h) + "</label>"; }).join("");
    var mname = { wish: "希望の日時を書いた列", mark: "○△× の表", ng: "都合の悪い日時の列" }[S.guess.mode];
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + S.total + " 人分を読み込みました。名前の列：" + S.headers[nc] + "。回答の形：" + mname + "（変えられます）。") +
      (S.total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人だけを割り当てます。</span>" : "");
    $("step3").hidden = false; $("out").hidden = true;
    updateSlots();
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
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "m/d h:mm" })
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

  // ---------- 回答の形 ----------
  function mode() { return document.querySelector("input[name=mode]:checked").value; }
  function colPick() {
    var md = mode(), g = S.guess && S.guess.mode === md ? S.guess.cols : (md === "mark" ? S.headers.map(function (h, i) { return M.isTimeHeader(h) ? i : -1; }).filter(function (i) { return i >= 0; }) : []);
    var note = {
      wish: "希望の列を選びます（左の列から 第1希望・第2希望…）。1つのセルに「11/25 15時以降、11/26 午後」のように いくつか書いてあっても読みます。読める書き方：11/25・11月25日・25日・木曜／14:00-15:00・15時以降・16時まで・午前・午後（12時から）・夕方（16時から）・いつでも。",
      mark: "日時の列を選びます。見出しが「11/25(水)」「11/25 14:00-15:00」「11/25 午後」などの列で、○（◯・可）は都合がよい、△ はできれば避けたい、×・空欄は都合が悪い、として読みます。",
      ng: "都合の悪い日時を書いた列を選びます。書いてある日時に当たる枠には入れず、それ以外の枠はどれでもよいものとして扱います。"
    }[md];
    var h;
    if (md === "ng") h = '<div class="row"><label>都合の悪い日時の列 <select id="ngCol">' + opts(g.length ? g[0] : -1, false) + "</select></label></div>";
    else h = '<div class="chk" id="cols">' + S.headers.map(function (x, i) { return '<label><input type="checkbox" value="' + i + '"' + (g.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(x) + "</label>"; }).join("") + "</div>";
    $("colPick").innerHTML = h; $("modeNote").textContent = note;
  }
  function pickedCols() {
    if (mode() === "ng") return [+$("ngCol").value];
    return Array.prototype.map.call(document.querySelectorAll("#cols input:checked"), function (x) { return +x.value; });
  }

  // ---------- 割り当て ----------
  function run() {
    updateSlots();
    if (!S.rows.length) return;
    if (!S.slots.length) { $("slotMsg").innerHTML = '<span class="wtxt">先に「1. 面談の枠を決める」で、面談をする日と時間帯を入れてください。</span>'; $("step1").scrollIntoView(); return; }
    var cols = pickedCols();
    if (!cols.length) { alert("希望の列を選んでください。"); return; }
    S.nameCol = +$("nameCol").value;
    S.P = M.buildPrefs(S.rows, { mode: mode(), cols: cols, slots: S.slots, headers: S.headers });
    S.groups = M.groupsBy(S.rows, +$("sibCol").value);
    var t0 = Date.now();
    var r = M.assign(S.P, { slots: S.slots, allowOutside: $("allowOut").checked, fillNoAnswer: $("fillNo").checked, groups: S.groups });
    S.ms = Date.now() - t0;
    S.a = r.a; S.groupOk = r.groupOk;
    $("out").hidden = false;
    render();
  }
  function name(i) { return M.clean(S.rows[i][S.nameCol]) || "（名前なし）"; }
  function slotText(s) { var sl = S.slots[s]; return M.shortDate(sl) + " " + M.hm(sl.start) + "〜" + M.hm(sl.end) + (sl.roomName ? " " + sl.roomName : ""); }
  function kindHtml(i) {
    var k = M.kindOf(S.P, i, S.a[i]);
    var cls = k === 0 ? "k0" : k === 1 ? "k1" : typeof k === "number" ? "k2" : "kx";
    if (k !== null && typeof k === "number" && S.P.noAns[i] === false && S.P.rank[i][S.a[i]] < 0) cls = "kx";
    return '<span class="' + cls + '">' + esc(M.kindLabel(S.P, k)) + "</span>";
  }
  function occ() { var o = {}; S.a.forEach(function (s, i) { if (s >= 0) (o[s] = o[s] || []).push(i); }); return o; }
  function selHtml(i) { return '<select data-i="' + i + '" title="枠を変える"><option>' + (S.a[i] >= 0 ? "変える…" : "枠を選ぶ…") + "</option></select>"; }
  function fillSel(sel) {
    if (sel.getAttribute("data-full")) return;
    var i = +sel.getAttribute("data-i"), o = occ(), h = '<option value="">' + (S.a[i] >= 0 ? "変える…" : "枠を選ぶ…") + "</option>";
    S.slots.forEach(function (sl, s) {
      if (s === S.a[i]) return;
      var who = o[s] ? "（" + o[s].map(name).join("・") + "と入れ替え）" : "（空き）";
      var r = S.P.noAns[i] ? "" : S.P.rank[i][s] >= 0 ? "・" + S.P.labels[S.P.rank[i][s]] : "・希望外";
      h += '<option value="' + s + '">' + esc(slotText(s) + r + " " + who) + "</option>";
    });
    if (S.a[i] >= 0) h += '<option value="-1">（未定にする）</option>';
    sel.innerHTML = h; sel.setAttribute("data-full", "1");
  }
  function moveTo(i, s) {
    var o = occ();
    if (s >= 0 && o[s]) o[s].forEach(function (j) { S.a[j] = S.a[i]; });
    S.a[i] = s; render();
  }
  function render() {
    var rep = M.report(S.P, S.slots, S.a, S.groups), n = S.rows.length;
    var placed = n - rep.unassigned.length;
    var li = [];
    var parts = S.P.labels.concat(["希望外", "回答なし"]).filter(function (l) { return rep.counts[l]; }).map(function (l) { return l + " " + rep.counts[l] + "人"; });
    li.push("内訳：" + esc(parts.join("、") || "なし") + (rep.unassigned.length ? '、<span class="wtxt">未定 ' + rep.unassigned.length + "人</span>" : ""));
    if (S.groups.length) {
      var bad = S.groups.filter(function (g, gi) { return rep.groupBad[gi]; });
      li.push(bad.length ? '<span class="wtxt">きょうだいのうち ' + bad.length + " 組は、続けての枠になっていません：" + bad.map(function (g) { return esc(g.map(name).join("・")); }).join("、") + "</span>" : '<span class="ok">きょうだい ' + S.groups.length + " 組は、すべて同じ日の続けての枠です。</span>");
    }
    if (rep.dup.length) li.push('<span class="wtxt">同じ枠に2人以上入っています。</span>');
    S.P.problems.forEach(function (p) { li.push('<span class="wtxt">' + esc(p) + "</span>"); });
    $("msg").innerHTML = "<b>" + n + " 人のうち " + placed + " 人を、" + S.slots.length + " 枠に割り当てました（空き " + rep.free + " 枠）。</b>" +
      (S.total > LIMIT ? '<span class="wtxt">（お試し版：先頭 ' + LIMIT + " 人）</span>" : "") + "<ul>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    var o = occ(), multiRoom = S.slots.some(function (s) { return s.roomName; }), empty = $("showEmpty").checked, lastDay = null;
    var h = '<table class="lt"><thead><tr><th>時間</th>' + (multiRoom ? "<th>部屋</th>" : "") + "<th>名前</th><th>希望の度合い</th><th>変える</th></tr></thead><tbody>";
    var cs = multiRoom ? 5 : 4;
    S.slots.forEach(function (sl, s) {
      if (sl.day !== lastDay) { lastDay = sl.day; h += '<tr class="day"><td colspan="' + cs + '">' + esc(M.dateLabel(sl)) + "</td></tr>"; }
      var who = o[s] || [];
      if (!who.length) { if (empty) h += '<tr class="empty"><td>' + M.hm(sl.start) + "〜" + M.hm(sl.end) + "</td>" + (multiRoom ? "<td>" + esc(sl.roomName) + "</td>" : "") + "<td>（空き）</td><td></td><td></td></tr>"; return; }
      who.forEach(function (i) {
        h += "<tr><td>" + M.hm(sl.start) + "〜" + M.hm(sl.end) + "</td>" + (multiRoom ? "<td>" + esc(sl.roomName) + "</td>" : "") + "<td>" + esc(name(i)) + "</td><td>" + kindHtml(i) + "</td><td>" + selHtml(i) + "</td></tr>";
      });
    });
    $("table").innerHTML = h + "</tbody></table>";
    $("unView").innerHTML = rep.unassigned.length ? '<h3 class="wtxt">枠に入らなかった人（' + rep.unassigned.length + " 人）</h3><table class=\"lt\"><tbody>" +
      rep.unassigned.map(function (u) { return "<tr><td>" + esc(name(u.i)) + "</td><td>" + esc(u.why) + "</td><td>" + selHtml(u.i) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<p class="note">空いている枠に手で入れるか、「希望外でも空いている枠に入れる」にチェックして作り直してください。</p>' : "";
    Array.prototype.forEach.call(document.querySelectorAll("#table select, #unView select"), function (sel) {
      sel.addEventListener("focus", function () { fillSel(sel); });
      sel.addEventListener("mousedown", function () { fillSel(sel); });
      sel.onchange = function () { if (sel.value === "") return; moveTo(+sel.getAttribute("data-i"), +sel.value); };
    });
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function done(nm) { $("saveMsg").textContent = "保存しました（" + nm + "）。" + (S.total > LIMIT ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function dlBlob(text, nm) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nm;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function showCols() { var c = Array.prototype.map.call(document.querySelectorAll("#showCols input:checked"), function (x) { return +x.value; }); return c.length ? c : [S.nameCol]; }
  function multiRoom() { return S.slots.some(function (s) { return s.roomName; }); }
  function tableRows() {
    var o = occ(), mr = multiRoom(), cols = S.headers.map(function (_, i) { return i; });
    var out = [["日付", "曜日", "開始", "終了"].concat(mr ? ["部屋"] : []).concat(cols.map(function (c) { return S.headers[c]; })).concat(["希望の度合い"])];
    S.slots.forEach(function (sl, s) {
      var base = [sl.y + "/" + sl.m + "/" + sl.d, M.WD[sl.wd], M.hm(sl.start), M.hm(sl.end)].concat(mr ? [sl.roomName] : []);
      var who = o[s] || [];
      if (!who.length) out.push(base.concat(cols.map(function () { return ""; })).concat(["（空き）"]));
      who.forEach(function (i) { out.push(base.concat(cols.map(function (c) { return S.rows[i][c]; })).concat([M.kindLabel(S.P, M.kindOf(S.P, i, S.a[i]))])); });
    });
    return out;
  }
  function addRows() {
    var mr = multiRoom();
    return [["面談の日付", "開始", "終了"].concat(mr ? ["部屋"] : []).concat(["希望の度合い"]).concat(S.headers)].concat(S.rows.map(function (r, i) {
      var s = S.a[i], sl = S.slots[s];
      var head = s >= 0 ? [sl.y + "/" + sl.m + "/" + sl.d + "（" + M.WD[sl.wd] + "）", M.hm(sl.start), M.hm(sl.end)].concat(mr ? [sl.roomName] : []) : ["未定", "", ""].concat(mr ? [""] : []);
      return head.concat([M.kindLabel(S.P, M.kindOf(S.P, i, s))]).concat(r);
    }));
  }
  function sheet(rows) {
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) { if (k[0] === "!") return; ws[k].t = "s"; ws[k].z = "@"; }); // 先頭の0・時刻が崩れないよう文字列のまま
    return ws;
  }
  function save(which, kind) {
    if (!S.a) return;
    var rows = which === "table" ? tableRows() : addRows();
    var nm = "面談_" + (which === "table" ? "時間割" : "日時の列つき") + "_" + ymd() + "." + kind;
    if (kind === "csv") { dlBlob(M.toCSV(rows), nm); done(nm); return; }
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(rows), which === "table" ? "時間割" : "日時の列つき");
    XLSX.writeFile(wb, nm); done(nm);
  }

  // ---------- 印刷 ----------
  function printTable() {
    if (!S.a) return;
    var title = $("title").value.trim() || "面談の日程", cols = showCols(), o = occ(), mr = multiRoom(), empty = $("pEmpty").checked, kind = $("pKind").checked, newDay = $("pNewDay").checked;
    var h = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + S.rows.length + " 人・" + S.slots.length + " 枠　/　作成日 " + new Date().toLocaleDateString("ja-JP") + "</p>";
    var byDay = [], cur = null;
    S.slots.forEach(function (sl, s) { if (!cur || cur.day !== sl.day) { cur = { day: sl.day, sl: sl, list: [] }; byDay.push(cur); } cur.list.push(s); });
    byDay.forEach(function (D, di) {
      var body = "";
      D.list.forEach(function (s) {
        var sl = S.slots[s], who = o[s] || [];
        var t = '<td class="t">' + M.hm(sl.start) + "〜" + M.hm(sl.end) + "</td>" + (mr ? "<td>" + esc(sl.roomName) + "</td>" : "");
        if (!who.length) { if (empty) body += "<tr>" + t + cols.map(function () { return "<td></td>"; }).join("") + (kind ? "<td></td>" : "") + "</tr>"; return; }
        who.forEach(function (i) { body += "<tr>" + t + cols.map(function (c) { return "<td>" + esc(S.rows[i][c]) + "</td>"; }).join("") + (kind ? "<td>" + esc(M.kindLabel(S.P, M.kindOf(S.P, i, s))) + "</td>" : "") + "</tr>"; });
      });
      h += '<div class="pd' + (newDay && di ? " newp" : "") + '">' + (newDay && di ? "<h1>" + esc(title) + "</h1>" : "") + "<h2>" + esc(M.dateLabel(D.sl)) + "</h2>" +
        '<table class="pt"><thead><tr><th>時間</th>' + (mr ? "<th>部屋</th>" : "") + cols.map(function (c) { return "<th>" + esc(S.headers[c]) + "</th>"; }).join("") + (kind ? "<th>希望</th>" : "") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
    });
    var rep = M.report(S.P, S.slots, S.a, S.groups);
    if (rep.unassigned.length) h += '<div class="pd"><h2>未定（' + rep.unassigned.length + " 人）</h2><p class=\"ft\">" + rep.unassigned.map(function (u) { return esc(name(u.i)); }).join("、") + "</p></div>";
    $("printArea").innerHTML = h;
    window.print();
  }
  function printSlips() {
    if (!S.a) return;
    var per = +$("perPage").value, st = $("slipTitle").value.trim() || "面談の日時のお知らせ", hon = $("honor").value.trim(), foot = $("foot").value.trim();
    var list = []; S.a.forEach(function (s, i) { if (s >= 0) list.push(i); });
    if ($("slipOrder").value === "time") list.sort(function (x, y) { return S.a[x] - S.a[y]; });
    if (!list.length) { alert("枠に入っている人がいません。"); return; }
    var h = "";
    for (var p = 0; p < list.length; p += per) {
      h += '<div class="slips n' + per + '"' + (p ? ' style="break-before:page"' : "") + ">" + list.slice(p, p + per).map(function (i) {
        var sl = S.slots[S.a[i]];
        return '<div class="slip"><p class="st">' + esc(st) + '</p><p class="nm">' + esc(name(i)) + (hon ? " " + esc(hon) : "") + '</p><p class="dt">' + esc(M.dateLabel(sl)) + "<br>" + M.hm(sl.start) + "〜" + M.hm(sl.end) + "</p>" +
          (sl.roomName ? '<p class="rm">場所：' + esc(sl.roomName) + "</p>" : "") + (foot ? '<p class="msg">' + esc(foot).replace(/\n/g, "<br>") + "</p>" : "") + "</div>";
      }).join("") + "</div>";
    }
    $("printArea").innerHTML = h;
    window.print();
  }

  // ---------- 見本（架空の学級。氏名は説明用で、実在の人とは関係ありません） ----------
  var SAMPLE_DAYS = "11/25(水) 14:00-16:30\n11/26(木) 14:00-16:30\n11/27(金) 14:00-16:30";
  var SAMPLE = (function () {
    var d = [
      ["見本 一郎", "11/25 15時以降", "11/26 15時以降", "", ""], ["見本 花子", "11/25", "11/26", "11/27", "見本"], ["見本 二郎", "11/25 15時以降", "11/27", "", ""],
      ["見本 春子", "木曜の午後", "", "", ""], ["見本 三郎", "11/25 14:00-15:00", "11/26 14:00-15:00", "", "見本"], ["見本 夏子", "11/27 16時まで", "11/26", "", ""],
      ["見本 四郎", "11/25 15時以降", "", "", ""], ["見本 秋子", "いつでも", "", "", ""], ["見本 五郎", "11/26 15:30以降", "11/27 15:30以降", "", ""],
      ["見本 冬子", "11/25 15時以降", "11/27 15時以降", "", ""], ["見本 六郎", "11/27", "", "", ""], ["見本 桜", "11/25 14時台", "11/26 14:00-15:00", "11/27 14:00-15:00", ""],
      ["見本 七郎", "11/26 15時以降、11/27 15時以降", "", "", ""], ["見本 楓", "", "", "", ""], ["見本 八郎", "11/25 15時以降", "11/26 16時以降", "", ""], ["見本 葵", "金曜", "水曜", "", ""]
    ];
    var s = "番号\t氏名\t第1希望\t第2希望\t第3希望\tきょうだい\n";
    d.forEach(function (r, i) { s += (i + 1) + "\t" + r.join("\t") + "\n"; });
    return s;
  })();

  // ---------- 設定の保存（回答の中身は保存しない） ----------
  var KEYS = ["days", "len", "gap", "rooms", "title", "slipTitle", "honor", "perPage", "foot"];
  function saveSettings() { try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); localStorage.setItem("mendan-wariate", JSON.stringify(o)); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("mendan-wariate") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings(); updateSlots();
    ["days", "len", "gap", "rooms"].forEach(function (id) { $(id).addEventListener("input", updateSlots); });
    ["title", "slipTitle", "honor", "perPage", "foot"].forEach(function (id) { $(id).addEventListener("change", saveSettings); });
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(M.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      $("days").value = SAMPLE_DAYS; $("len").value = 15; $("gap").value = 5; $("rooms").value = "";
      $("paste").value = SAMPLE; $("hasHead").checked = true; setData(M.parseCSV(SAMPLE), true, "見本");
      $("allowOut").checked = false; $("fillNo").checked = true;
    };
    Array.prototype.forEach.call(document.querySelectorAll("input[name=mode]"), function (x) { x.onchange = colPick; });
    $("go").onclick = run;
    $("showEmpty").onchange = function () { if (S.a) render(); };
    $("pTable").onclick = printTable; $("pSlip").onclick = printSlips;
    $("xTable").onclick = function () { save("table", "xlsx"); }; $("cTable").onclick = function () { save("table", "csv"); };
    $("xAdd").onclick = function () { save("add", "xlsx"); }; $("cAdd").onclick = function () { save("add", "csv"); };
  });
})();
