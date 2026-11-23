/* 記録の自己ベストと伸び — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var K = window.KIROKU;
  var LIMIT = window.KIROKU_LIMIT || Infinity; // お試し版は人数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var RAW = null, NAME = "";
  var T = { headers: [], rows: [], cols: {}, eventCols: [] };
  var S = { R: null, dirs: {}, events: [] };
  var DIRNAME = { low: "タイム（小さいほど良い）", high: "距離・高さ・回数（大きいほど良い）" };

  // ---------- 読み込み ----------
  function prep() {
    var rows = RAW.slice();
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    var hh = $("hasHead").checked;
    T.headers = hh ? rows[0].map(function (h, i) { return K.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    T.rows = hh ? rows.slice(1) : rows;
  }
  function setData(rows, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    RAW = rows; NAME = name || "";
    analyze();
  }
  function analyze() {
    prep();
    T.cols = K.guessCols(T.headers);
    $("shape").value = K.guessShape(T.headers, T.rows);
    T.eventCols = K.guessEventCols(T.headers, T.rows, T.cols);
    S.dirs = {};
    $("shapeBox").hidden = false;
    $("loadMsg").textContent = "読み込みました：" + NAME + "（" + T.rows.length + " 行・" + T.headers.length + " 列）";
    drawCols(); refresh();
  }
  var DEFS = {
    long: [["date", "日付"], ["name", "名前"], ["event", "種目"], ["rec", "記録"], ["wind", "風（任意）"], ["group", "組・学年（任意）"], ["meet", "大会・記録会の名前（任意）"]],
    wide: [["date", "日付"], ["name", "名前"], ["group", "組・学年（任意）"], ["meet", "大会・記録会の名前（任意）"]]
  };
  function drawCols() {
    var shape = $("shape").value, el = $("cols");
    el.innerHTML = DEFS[shape].map(function (d) {
      return "<label>" + d[1] + '</label><select data-k="' + d[0] + '"><option value="">（なし）</option>' + T.headers.map(function (h, i) {
        return '<option value="' + i + '"' + (T.cols[d[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("select"), function (s) {
      s.onchange = function () { if (s.value === "") delete T.cols[s.dataset.k]; else T.cols[s.dataset.k] = +s.value; if (shape === "wide") drawEvCols(); refresh(); };
    });
    $("evColBox").hidden = shape !== "wide";
    $("fixedBox").hidden = !(shape === "long" && T.cols.event == null);
    if (shape === "wide") drawEvCols();
  }
  function drawEvCols() {
    var skip = {}; ["date", "name", "group", "meet"].forEach(function (k) { if (T.cols[k] != null) skip[T.cols[k]] = 1; });
    $("evcl").innerHTML = T.headers.map(function (h, i) {
      if (skip[i]) return "";
      return '<label><input type="checkbox" data-i="' + i + '"' + (T.eventCols.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(h) + "</label>";
    }).join("");
    Array.prototype.forEach.call($("evcl").querySelectorAll("input"), function (c) {
      c.onchange = function () {
        var i = +c.dataset.i, a = T.eventCols.filter(function (x) { return x !== i; });
        if (c.checked) a.push(i);
        T.eventCols = a.sort(function (p, q) { return p - q; }); refresh();
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
          var wb = XLSX.read(buf, { type: "array", cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd" })
            .map(function (rr) { return rr.map(function (v) { return String(v == null ? "" : v); }); })
            .filter(function (rr) { return rr.some(function (v) { return v.trim() !== ""; }); });
          setData(rows, file.name + "（" + wb.SheetNames[0] + "）");
        } catch (e) { $("loadMsg").textContent = "Excel ファイルを読み込めませんでした（" + e.message + "）。"; }
      } else {
        var d = K.decodeBytes(buf);
        setData(K.parseCSV(d.text), file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 種目の向き ----------
  function drawEvents() {
    $("evs").innerHTML = S.events.length ? S.events.map(function (ev, i) {
      var d = S.dirs[ev.key] || ev.guess;
      return "<label>" + esc(ev.name) + ' <span class="note">' + ev.n + '件</span></label><select data-i="' + i + '">' +
        ["low", "high"].map(function (k) { return '<option value="' + k + '"' + (d === k ? " selected" : "") + ">" + DIRNAME[k] + "</option>"; }).join("") + "</select>";
    }).join("") : '<span class="note">種目がありません。</span>';
    Array.prototype.forEach.call($("evs").querySelectorAll("select"), function (s) {
      s.onchange = function () { S.dirs[S.events[+s.dataset.i].key] = s.value; compute(); };
    });
  }

  // ---------- 集計 ----------
  var entries = [];
  function refresh() {
    if (!RAW) return;
    var shape = $("shape").value;
    $("fixedBox").hidden = !(shape === "long" && T.cols.event == null);
    if (T.cols.name == null) { clearOut("「名前」の列を選んでください。"); return; }
    if (shape === "long" && T.cols.rec == null) { clearOut("「記録」の列を選んでください。"); return; }
    if (shape === "wide" && !T.eventCols.length) { clearOut("種目の列を1つ以上選んでください。"); return; }
    entries = K.toEntries(T.headers, T.rows, { shape: shape, cols: T.cols, eventCols: T.eventCols, year: +$("year").value || null, fiscal: $("fiscal").checked, fixedEvent: $("fixedEvent").value });
    S.events = K.eventsOf(entries);
    drawEvents();
    compute();
  }
  function compute() {
    var dirs = {}; S.events.forEach(function (ev) { dirs[ev.key] = S.dirs[ev.key] || ev.guess; });
    var wl = $("windOn").checked ? parseFloat($("windLim").value) : null;
    S.R = K.run(entries, { dirs: dirs, windLimit: isNaN(wl) ? null : wl, limit: LIMIT });
    var R = S.R;
    $("out").hidden = false;
    var h = "<b>" + R.people.length + " 人</b>・<b>" + R.events.length + " 種目</b>・記録 " + R.okN + " 件（記録なし " + R.noneN + " 件）から、自己ベストを更新した記録は <b>" + R.pbTotal + " 件</b>でした。";
    if (R.cut) h += '<br><span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 人（全 " + R.peopleAll + " 人）だけを数えています。</span>";
    if (R.bad.length) h += '<br><span class="wtxt">読めない記録が ' + R.bad.length + " 件あります（下に一覧）。種目の向き（タイム／距離）が合っているかも確かめてください。</span>";
    if (R.badDates.length) h += '<br><span class="wtxt">読めない日付が ' + R.badDates.length + " 件あります（その記録は日付のない記録として最後に並べます）。</span>";
    if (R.noDate) h += '<br><span class="note">日付のない記録は、元の表の順に、日付のある記録のあとに並べています。</span>';
    $("sumMsg").innerHTML = h;
    drawFilters(); listView();
  }
  function clearOut(msg) { S.R = null; $("out").hidden = false; $("sumMsg").innerHTML = msg; $("listView").innerHTML = ""; $("errView").innerHTML = ""; }
  function drawFilters() {
    var R = S.R, ev = $("fEv").value, gr = $("fGr").value, dy = $("fDay").value;
    $("fEv").innerHTML = '<option value="">すべての種目</option>' + R.events.map(function (e) { return '<option value="' + esc(e.key) + '"' + (e.key === ev ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("");
    var groups = []; R.people.forEach(function (p) { if (p.group && groups.indexOf(p.group) < 0) groups.push(p.group); });
    $("fGrL").hidden = !groups.length;
    $("fGr").innerHTML = '<option value="">すべての組</option>' + groups.map(function (g) { return '<option' + (g === gr ? " selected" : "") + ">" + esc(g) + "</option>"; }).join("");
    $("fDay").innerHTML = R.days.map(function (D, i) { return '<option value="' + i + '"' + (String(i) === dy ? " selected" : "") + ">" + esc(dayName(D)) + "（更新 " + D.pb.length + "）</option>"; }).join("");
    if (dy === "" || +dy >= R.days.length) $("fDay").value = String(Math.max(0, R.days.length - 1));
  }
  function dayName(D) { return D.label + (D.meet ? " " + D.meet : ""); }
  function fEv() { return $("fEv").value; }
  function fGr() { return $("fGr").value; }
  function pairsF() { var e = fEv(), g = fGr(); return S.R.pairs.filter(function (P) { return (!e || P.ev.key === e) && (!g || P.person.group === g); }); }
  function recsF() {
    var e = fEv(), g = fGr(), only = $("onlyPB").checked;
    var a = [];
    pairsF().forEach(function (P) { P.recs.forEach(function (rc) { if (!only || rc.mark === "自己ベスト") a.push(rc); }); });
    return a;
  }
  function hasGroup() { return S.R.people.some(function (p) { return p.group; }); }
  function hasMeet() { return S.R.recs.some(function (rc) { return rc.e.meet; }); }
  function hasWind() { return S.R.recs.some(function (rc) { return rc.wind != null; }); }
  function V(v, ev) { return K.fmtVal(v, ev); }
  function G(g, ev) { return K.fmtGain(g, ev); }
  function markCls(m) { return m === "自己ベスト" ? "pb" : m === "初記録" ? "fst" : m === "タイ" ? "tie" : m === "追い風参考" ? "aid" : m ? "nr" : ""; }
  function windTxt(w) { return w == null ? "" : (w > 0 ? "+" : "") + w.toFixed(1); }
  function recDate(rc) { return rc.e.day != null ? K.dayLabel(rc.e.day) : rc.e.dayLabel; }

  function listView() {
    var R = S.R, v = $("view").value, g = hasGroup(), h = "";
    $("fDayL").hidden = v !== "day"; $("onlyPBL").hidden = v !== "recs";
    if (v === "per") {
      var list = pairsF();
      h = '<table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + '<th>種目</th><th class="n">回数</th><th class="n">自己ベスト</th><th>出した日</th><th class="n">初めの記録</th><th class="n">初めから</th><th class="n">最新の記録</th><th class="n">更新</th></tr>' +
        list.map(function (P) {
          var ev = P.ev;
          return "<tr" + (P.lastIsPB ? ' class="hl"' : "") + "><td>" + esc(P.person.name) + "</td>" + (g ? "<td>" + esc(P.person.group) + "</td>" : "") + "<td>" + esc(ev.name) + '</td><td class="n">' + P.n + (P.nAll > P.n ? '<span class="note">/' + P.nAll + "</span>" : "") +
            '</td><td class="n"><b>' + (P.best ? V(P.best.v, ev) : "—") + "</b></td><td>" + (P.best ? esc(recDate(P.best)) : "") + '</td><td class="n">' + (P.first ? V(P.first.v, ev) : "") +
            '</td><td class="n">' + (P.pbN ? esc(G(P.gainTotal, ev)) : "") + '</td><td class="n">' + (P.last ? V(P.last.v, ev) : "") + '</td><td class="n">' + (P.pbN ? P.pbN + "回" : "") + "</td></tr>";
        }).join("") + "</table>";
      h = '<p class="note">色の付いた行は、最新の記録が自己ベストの人です。「初めから」は初めの記録から自己ベストまでの伸び、「更新」は初記録のあとに自己ベストを更新した回数です。</p>' + scroll(h);
    } else if (v === "recs") {
      var rs = recsF(), w = hasWind(), m = hasMeet();
      h = '<table class="lt"><tr><th>日付</th>' + (m ? "<th>大会</th>" : "") + "<th>名前</th>" + (g ? "<th>組</th>" : "") + '<th>種目</th><th class="n">記録</th>' + (w ? '<th class="n">風</th>' : "") + '<th>印</th><th class="n">前回との差</th><th class="n">それまでのベスト</th></tr>' +
        rs.map(function (rc) {
          var ev = rc.ev;
          return "<tr><td>" + esc(recDate(rc)) + "</td>" + (m ? "<td>" + esc(rc.e.meet) + "</td>" : "") + "<td>" + esc(rc.e.name) + "</td>" + (g ? "<td>" + esc(rc.e.group) + "</td>" : "") + "<td>" + esc(ev.name) +
            '</td><td class="n">' + (rc.st === "ok" ? V(rc.v, ev) : esc(rc.e.raw)) + "</td>" + (w ? '<td class="n">' + windTxt(rc.wind) + "</td>" : "") + '<td class="' + markCls(rc.mark) + '">' + esc(rc.mark) +
            '</td><td class="n">' + esc(rc.diffPrev != null ? G(rc.diffPrev, ev) : "") + '</td><td class="n">' + (rc.prevBest != null ? V(rc.prevBest, ev) : "") + "</td></tr>";
        }).join("") + "</table>";
      h = '<p class="note">人・種目ごとに日付の順です。「前回との差」は、その前に記録のあった回との差（タイムは短縮／遅い、距離・回数は＋／−）です。</p>' + scroll(h);
    } else if (v === "days") {
      h = scroll('<table class="lt"><tr><th>日付</th>' + (hasMeet() ? "<th>大会</th>" : "") + '<th class="n">人数</th><th class="n">記録の数</th><th class="n">初記録</th><th class="n">自己ベスト更新</th><th class="n">記録なし・読めない</th></tr>' +
        R.days.map(function (D) { return "<tr><td>" + esc(D.label) + "</td>" + (hasMeet() ? "<td>" + esc(D.meet) + "</td>" : "") + '<td class="n">' + D.peopleN + '</td><td class="n">' + D.n + '</td><td class="n">' + D.first + '</td><td class="n"><b>' + D.pb.length + '</b></td><td class="n">' + D.none + "</td></tr>"; }).join("") + "</table>");
    } else if (v === "day") {
      var D = R.days[+$("fDay").value];
      var pbs = D ? D.pb.filter(function (rc) { return (!fEv() || rc.ev.key === fEv()) && (!fGr() || rc.e.group === fGr()); }) : [];
      h = D ? "<p><b>" + esc(dayName(D)) + "</b> に自己ベストを更新した記録：" + pbs.length + " 件</p>" + scroll('<table class="lt"><tr><th>名前</th>' + (g ? "<th>組</th>" : "") + '<th>種目</th><th class="n">記録</th><th class="n">それまでのベスト</th><th class="n">伸び</th></tr>' +
        pbs.map(function (rc) { return "<tr><td>" + esc(rc.e.name) + "</td>" + (g ? "<td>" + esc(rc.e.group) + "</td>" : "") + "<td>" + esc(rc.ev.name) + '</td><td class="n"><b>' + V(rc.v, rc.ev) + '</b></td><td class="n">' + V(rc.prevBest, rc.ev) + '</td><td class="n">' + esc(G(rc.diffBest, rc.ev)) + "</td></tr>"; }).join("") + "</table>") : "";
    } else if (v === "rank") {
      h = rankLists().map(function (x) {
        return "<h3>" + esc(x.ev.name) + ' <span class="note">' + DIRNAME[x.ev.dir] + "</span></h3>" + scroll('<table class="lt"><tr><th class="n">順位</th><th>名前</th>' + (g ? "<th>組</th>" : "") + '<th class="n">自己ベスト</th><th>出した日</th></tr>' +
          x.list.map(function (P) { return '<tr><td class="n">' + P.rank + "</td><td>" + esc(P.person.name) + "</td>" + (g ? "<td>" + esc(P.person.group) + "</td>" : "") + '<td class="n">' + V(P.best.v, x.ev) + "</td><td>" + esc(recDate(P.best)) + "</td></tr>"; }).join("") + "</table>");
      }).join("");
      h = '<p class="note">それぞれの人の自己ベストの良い順です。同じ記録は同じ順位にします。組を選ぶと、その組の中の順位になります。</p>' + h;
    }
    $("listView").innerHTML = h;
    $("errView").innerHTML = R.bad.length ? "<h3>読めない記録（" + R.bad.length + " 件）</h3>" + scroll('<table class="lt"><tr><th>行</th><th>名前</th><th>種目</th><th>日付</th><th>書かれていた内容</th></tr>' +
      R.bad.map(function (b) { return "<tr><td>" + rowRef(b.row) + "</td><td>" + esc(b.name) + "</td><td>" + esc(b.event) + "</td><td>" + esc(b.day) + "</td><td>" + esc(b.value) + "</td></tr>"; }).join("") + "</table>", 200) : "";
  }
  function rankLists() {
    var g = fGr();
    return S.R.ranks.filter(function (x) { return !fEv() || x.ev.key === fEv(); }).map(function (x) {
      var list = x.list.filter(function (P) { return !g || P.person.group === g; });
      if (g) { var rk = 0, pv = null; list = list.map(function (P, i) { if (P.best.v !== pv) { rk = i + 1; pv = P.best.v; } return Object.assign({}, P, { rank: rk }); }); }
      return { ev: x.ev, list: list };
    });
  }
  function scroll(h, mh) { return '<div class="scroll"' + (mh ? ' style="max-height:' + mh + 'px"' : "") + ">" + h + "</div>"; }
  function rowRef(ri) { return ($("hasHead").checked ? ri + 2 : ri + 1) + " 行目"; }

  // ---------- 印刷 ----------
  function title() { return $("title").value.trim() || "記録の一覧"; }
  function condText() {
    var a = [S.R.people.length + "人", S.R.events.length + "種目"];
    if (fEv()) a.push("種目：" + $("fEv").selectedOptions[0].textContent);
    if (fGr()) a.push("組：" + fGr());
    if ($("windOn").checked) a.push("追い風 " + $("windLim").value + "m/s 超は参考");
    if (S.R.cut) a.push("お試し版（先頭 " + LIMIT + " 人）");
    return a.join("　");
  }
  function doPrint(html, land) {
    $("pageSize").textContent = "@page{size:A4 " + (land ? "landscape" : "portrait") + ";margin:10mm}";
    $("printArea").innerHTML = html;
    window.print();
  }
  function printCards() {
    var by = {}, order = [];
    pairsF().forEach(function (P) { if (!by[P.person.key]) { by[P.person.key] = []; order.push(P.person); } by[P.person.key].push(P); });
    var t = title(), g = hasGroup();
    var h = order.map(function (p) {
      return '<div class="card"><div class="ct">' + esc(t) + '</div><div class="nm">' + esc(p.name) + (g && p.group ? '<span class="gr">' + esc(p.group) + "</span>" : "") + "</div>" +
        by[p.key].map(function (P) {
          var ev = P.ev;
          var hist = P.recs.map(function (rc) {
            var d = rc.e.day != null ? K.dayLabel(rc.e.day).replace(/^\d+\//, "") : rc.e.dayLabel;
            return '<span class="h' + (rc.mark === "自己ベスト" || rc.mark === "初記録" ? " b" : "") + '">' + esc(d) + " " + (rc.st === "ok" ? V(rc.v, ev) : esc(rc.e.raw)) + (rc.mark === "自己ベスト" ? "★" : rc.mark === "追い風参考" ? "(参考)" : "") + "</span>";
          }).join(" ");
          return '<table class="ce"><tr><td class="en">' + esc(ev.name) + '</td><td class="bs">自己ベスト <b>' + (P.best ? V(P.best.v, ev) : "—") + "</b>" + (P.best ? '<span class="d">（' + esc(recDate(P.best)) + "）</span>" : "") +
            '</td><td class="gn">' + (P.pbN ? "初めから " + esc(G(P.gainTotal, ev)) : "") + '</td></tr><tr><td colspan="3" class="hs">' + hist + "</td></tr></table>";
        }).join("") + "</div>";
    }).join("");
    doPrint('<p class="per">' + esc(condText()) + "　★＝自己ベスト更新</p>" + '<div class="cards">' + h + "</div>", false);
  }
  function printPer() {
    var g = hasGroup(), list = pairsF();
    var h = "<h1>" + esc(title()) + "　1人ごとの自己ベスト</h1><p class='per'>" + esc(condText()) + "</p><table class='pt'><tr><th class='l'>名前</th>" + (g ? "<th class='l'>組</th>" : "") + "<th class='l'>種目</th><th>回数</th><th>自己ベスト</th><th class='l'>出した日</th><th>初めの記録</th><th>初めから</th><th>最新の記録</th><th>更新</th></tr>" +
      list.map(function (P) { var ev = P.ev; return "<tr" + (P.lastIsPB ? " class='fl'" : "") + "><td class='l'>" + esc(P.person.name) + "</td>" + (g ? "<td class='l'>" + esc(P.person.group) + "</td>" : "") + "<td class='l'>" + esc(ev.name) + "</td><td>" + P.n + "</td><td><b>" + (P.best ? V(P.best.v, ev) : "—") + "</b></td><td class='l'>" + (P.best ? esc(recDate(P.best)) : "") + "</td><td>" + (P.first ? V(P.first.v, ev) : "") + "</td><td>" + (P.pbN ? esc(G(P.gainTotal, ev)) : "") + "</td><td>" + (P.last ? V(P.last.v, ev) : "") + "</td><td>" + (P.pbN ? P.pbN + "回" : "") + "</td></tr>"; }).join("") + "</table>";
    doPrint(h, true);
  }
  function printDay() {
    var D = S.R.days[+$("fDay").value]; if (!D) return;
    var g = hasGroup(), pbs = D.pb.filter(function (rc) { return (!fEv() || rc.ev.key === fEv()) && (!fGr() || rc.e.group === fGr()); });
    var h = "<h1>" + esc(title()) + "　" + esc(dayName(D)) + "　自己ベスト更新</h1><p class='per'>" + esc(condText()) + "　" + pbs.length + " 件</p><table class='pt'><tr><th class='l'>名前</th>" + (g ? "<th class='l'>組</th>" : "") + "<th class='l'>種目</th><th>記録</th><th>それまでのベスト</th><th>伸び</th></tr>" +
      pbs.map(function (rc) { return "<tr><td class='l'>" + esc(rc.e.name) + "</td>" + (g ? "<td class='l'>" + esc(rc.e.group) + "</td>" : "") + "<td class='l'>" + esc(rc.ev.name) + "</td><td><b>" + V(rc.v, rc.ev) + "</b></td><td>" + V(rc.prevBest, rc.ev) + "</td><td>" + esc(G(rc.diffBest, rc.ev)) + "</td></tr>"; }).join("") + "</table>";
    doPrint(h, false);
  }
  function printRank() {
    var g = hasGroup();
    var h = rankLists().map(function (x) {
      return "<div class='blk'><h2>" + esc(x.ev.name) + "</h2><table class='pt'><tr><th>順位</th><th class='l'>名前</th>" + (g ? "<th class='l'>組</th>" : "") + "<th>自己ベスト</th><th class='l'>出した日</th></tr>" +
        x.list.map(function (P) { return "<tr><td>" + P.rank + "</td><td class='l'>" + esc(P.person.name) + "</td>" + (g ? "<td class='l'>" + esc(P.person.group) + "</td>" : "") + "<td>" + V(P.best.v, x.ev) + "</td><td class='l'>" + esc(recDate(P.best)) + "</td></tr>"; }).join("") + "</table></div>";
    }).join("");
    doPrint("<h1>" + esc(title()) + "　種目ごとの自己ベスト順</h1><p class='per'>" + esc(condText()) + "</p>" + h, false);
  }

  // ---------- 保存 ----------
  function rowsPer() {
    var g = hasGroup();
    return [["名前"].concat(g ? ["組"] : [], ["種目", "向き", "記録の回数", "自己ベスト", "自己ベスト(数値)", "出した日", "初めの記録", "初めからの伸び", "最新の記録", "更新の回数"])].concat(pairsF().map(function (P) {
      var ev = P.ev;
      return [P.person.name].concat(g ? [P.person.group] : [], [ev.name, ev.dir === "low" ? "タイム" : "距離・回数", P.n, P.best ? V(P.best.v, ev) : "", P.best ? K.numOut(P.best.v, ev) : "", P.best ? recDate(P.best) : "", P.first ? V(P.first.v, ev) : "", P.pbN ? G(P.gainTotal, ev) : "", P.last ? V(P.last.v, ev) : "", P.pbN]);
    }));
  }
  function rowsRecs() {
    var g = hasGroup(), m = hasMeet(), w = hasWind();
    return [["日付"].concat(m ? ["大会"] : [], ["名前"], g ? ["組"] : [], ["種目", "記録", "記録(数値)"], w ? ["風"] : [], ["印", "前回との差", "それまでのベスト"])].concat(recsF().map(function (rc) {
      var ev = rc.ev;
      return [recDate(rc)].concat(m ? [rc.e.meet] : [], [rc.e.name], g ? [rc.e.group] : [], [ev.name, rc.st === "ok" ? V(rc.v, ev) : rc.e.raw, rc.st === "ok" ? K.numOut(rc.v, ev) : ""], w ? [windTxt(rc.wind)] : [], [rc.mark, rc.diffPrev != null ? G(rc.diffPrev, ev) : "", rc.prevBest != null ? V(rc.prevBest, ev) : ""]);
    }));
  }
  function rowsDays() { var m = hasMeet(); return [["日付"].concat(m ? ["大会"] : [], ["人数", "記録の数", "初記録", "自己ベスト更新", "記録なし・読めない"])].concat(S.R.days.map(function (D) { return [D.label].concat(m ? [D.meet] : [], [D.peopleN, D.n, D.first, D.pb.length, D.none]); })); }
  function rowsRank() {
    var g = hasGroup(), out = [["種目", "順位", "名前"].concat(g ? ["組"] : [], ["自己ベスト", "出した日"])];
    rankLists().forEach(function (x) { x.list.forEach(function (P) { out.push([x.ev.name, P.rank, P.person.name].concat(g ? [P.person.group] : [], [V(P.best.v, x.ev), recDate(P.best)])); }); });
    return out;
  }
  function rowsBad() { return [["行", "名前", "種目", "日付", "書かれていた内容"]].concat(S.R.bad.map(function (b) { return [rowRef(b.row), b.name, b.event, b.day, b.value]; })); }
  function fname(ext, sub) { var t = title().replace(/[\\\/:*?"<>|]/g, "_"); return t + (sub ? "_" + sub : "") + "." + ext; }
  function dl(name, text) { var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function done(name, n) { $("saveMsg").textContent = "保存しました（" + name + "、" + n + " 行）。" + (S.R.cut ? "お試し版は先頭 " + LIMIT + " 人の結果です。" : ""); }
  function sheet(rows) { var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h, i) { return { wch: Math.max(8, String(h).length * 2) }; }); return ws; }
  function saveXlsx() {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return; }
    var wb = XLSX.utils.book_new(), p = rowsPer();
    XLSX.utils.book_append_sheet(wb, sheet(p), "1人ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsRecs()), "記録の一覧");
    XLSX.utils.book_append_sheet(wb, sheet(rowsDays()), "日ごと");
    XLSX.utils.book_append_sheet(wb, sheet(rowsRank()), "種目ごとの順");
    if (S.R.bad.length) XLSX.utils.book_append_sheet(wb, sheet(rowsBad()), "読めない記録");
    var name = fname("xlsx"); XLSX.writeFile(wb, name); done(name, p.length - 1);
  }

  // ---------- 設定の保存（名前・記録は保存しない） ----------
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function saveSettings() { saveJSON("kiroku-best", { view: $("view").value, windOn: $("windOn").checked, windLim: $("windLim").value }); }
  function loadSettings() { var o = loadJSON("kiroku-best") || {}; if (o.view) $("view").value = o.view; if (o.windOn != null) $("windOn").checked = o.windOn; if (o.windLim) $("windLim").value = o.windLim; }

  // ---------- 見本（架空の名前・記録） ----------
  function sample() {
    var kids = [["青木 一郎", "5年"], ["石井 花子", "5年"], ["上田 健", "5年"], ["江藤 さくら", "5年"], ["大野 翔", "6年"], ["加藤 美咲", "6年"], ["木村 陸", "6年"], ["工藤 葵", "6年"], ["小林 蓮", "6年"], ["佐々木 結衣", "6年"], ["清水 大和", "6年"], ["高橋 心", "5年"]];
    var days = [["2026/5/16", "春の記録会", "+0.8"], ["2026/6/20", "6月練習会", "+1.2"], ["2026/7/18", "夏の記録会", "+2.6"], ["2026/9/26", "秋の記録会", "-0.4"], ["2026/11/14", "11月練習会", "+1.0"]];
    var r50 = [[9.4, 9.2, 9.0, 9.1, 8.9], [9.8, 9.8, 9.5, 9.6, 9.4], [8.9, 8.8, 8.6, 8.7, 8.7], [10.1, "DNS", 9.9, 9.7, 9.8], [8.5, 8.4, 8.2, 8.4, 8.3], [9.2, 9.0, 8.9, 9.0, 8.8], [8.8, 8.9, 8.6, 8.7, 8.5], [9.6, 9.4, 9.3, 9.1, 9.2], [8.3, 8.2, 8.1, 8.2, 8.0], [9.0, 9.0, 8.8, 8.9, 8.9], [8.7, 8.6, 8.4, 8.5, 8.6], [10.3, 10.0, 9.9, "9,8", 9.6]];
    var jmp = [["3m05", "3m12", "3m20", "3m18", "3m30"], ["2m80", "2m95", "3m00", "2m92", "3m02"], ["3m40", "3m38", "3m55", "3m60", "3m58"], ["2m60", "", "2m72", "2m80", "2m85"], ["3m80", "3m92", "3m95", "4m05", "4m02"], ["3m10", "3m15", "3m08", "3m22", "3m25"], ["3m50", "3m48", "3m62", "3m70", "3m75"], ["2m90", "3m00", "2m98", "3m05", "3m10"], ["4m00", "4m10", "4m08", "4m15", "4m20"], ["3m20", "3m25", "3m30", "3m28", "3m35"], ["3m60", "3m70", "3m65", "3m80", "3m78"], ["2m50", "2m58", "2m70", "2m68", "2m75"]];
    var rows = [["日付", "記録会", "氏名", "学年", "種目", "記録", "風"]];
    days.forEach(function (d, j) {
      kids.forEach(function (k, i) { var v = r50[i][j]; rows.push([d[0], d[1], k[0], k[1], "50m", typeof v === "number" ? v.toFixed(1) : v, d[2]]); });
      kids.forEach(function (k, i) { var v = jmp[i][j]; if (v) rows.push([d[0], d[1], k[0], k[1], "走り幅跳び", v, ""]); });
    });
    $("hasHead").checked = true; $("year").value = 2026; $("fiscal").checked = true;
    $("windOn").checked = true; $("windLim").value = "2.0";
    $("title").value = "2026年度 陸上クラブ（見本）";
    setData(rows, "見本（架空の12人・5回の記録会・50m と走り幅跳び）");
  }

  // ---------- 画面 ----------
  loadSettings();
  $("year").value = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
  var drop = $("drop");
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("pasteGo").onclick = function () { var t = $("paste").value; if (!t.trim()) return; setData(K.parseCSV(t), "貼り付け"); };
  $("hasHead").onchange = function () { if (RAW) analyze(); };
  $("shape").onchange = function () { if (!RAW) return; if ($("shape").value === "wide" && !T.eventCols.length) T.eventCols = K.guessEventCols(T.headers, T.rows, T.cols); drawCols(); refresh(); };
  ["year", "fiscal", "fixedEvent"].forEach(function (k) { $(k).onchange = refresh; });
  ["windOn", "windLim"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) compute(); }; });
  ["view", "fEv", "fGr", "fDay", "onlyPB"].forEach(function (k) { $(k).onchange = function () { saveSettings(); if (S.R) listView(); }; });
  $("sample").onclick = sample;
  $("pCard").onclick = function () { if (S.R) printCards(); };
  $("pPer").onclick = function () { if (S.R) printPer(); };
  $("pDay").onclick = function () { if (S.R) printDay(); };
  $("pRank").onclick = function () { if (S.R) printRank(); };
  $("xAll").onclick = function () { if (S.R) saveXlsx(); };
  $("cPer").onclick = function () { if (!S.R) return; var r = rowsPer(), n = fname("csv", "1人ごと"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  $("cRecs").onclick = function () { if (!S.R) return; var r = rowsRecs(), n = fname("csv", "記録の一覧"); dl(n, K.toCSV(r)); done(n, r.length - 1); };
  window.addEventListener("afterprint", function () { $("printArea").innerHTML = ""; });
})();
