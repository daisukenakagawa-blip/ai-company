/* 時間帯ごとの人数と不足チェック — 画面・印刷・CSV。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var N = window.NINZU;
  var LIMIT = window.NINZU_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", last: null };

  // ---------- 読み込み ----------
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return N.norm(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    buildSelects(N.guessColumns(S.headers, S.rows));
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを数えます。</span>" : "");
    ["step2", "step3", "out"].forEach(function (id) { $(id).hidden = false; });
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
        var d = N.decodeBytes(buf);
        setData(N.parseCSV(d.text), $("hasHead").checked, file.name + "（" + d.enc + "）");
      }
    };
    r.readAsArrayBuffer(file);
  }

  // ---------- 列の選択 ----------
  function opts(sel, withNone) {
    return (withNone ? '<option value="">（使わない）</option>' : '<option value="">（選んでください）</option>') +
      S.headers.map(function (h, i) { return '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  }
  function buildSelects(m) {
    $("cDate").innerHTML = opts(m.date, true);
    $("cStart").innerHTML = opts(m.start, false);
    $("cEnd").innerHTML = opts(m.end, false);
    $("cRange").innerHTML = opts(m.range, false);
    $("cPerson").innerHTML = opts(m.person, true);
    $("cGroup").innerHTML = opts(m.group, true);
    $("cBrange").innerHTML = opts(m.brange, false);
    $("cBstart").innerHTML = opts(m.bstart, false);
    $("cBend").innerHTML = opts(m.bend, false);
    $("cCount").innerHTML = opts(m.count, true);
    var mode = m.range != null && (m.start == null || m.end == null) ? "one" : "two";
    document.querySelector('input[name=mode][value="' + mode + '"]').checked = true;
    $("bMode").value = m.brange != null ? "one" : (m.bstart != null && m.bend != null ? "two" : "none");
    modeView();
  }
  function modeView() {
    var one = document.querySelector("input[name=mode]:checked").value === "one";
    $("twoBox").hidden = one; $("oneBox").hidden = !one;
    $("bOne").hidden = $("bMode").value !== "one"; $("bTwo").hidden = $("bMode").value !== "two";
  }
  function num(id) { var v = $(id).value; return v === "" ? null : +v; }
  function clockOf(id, def) { var c = N.parseClock($(id).value); return c.min != null ? c.min : def; }
  function options() {
    var bm = $("bMode").value;
    var o = {
      mode: document.querySelector("input[name=mode]:checked").value,
      map: { date: num("cDate"), start: num("cStart"), end: num("cEnd"), range: num("cRange"), person: num("cPerson"), group: num("cGroup"), count: num("cCount"),
        brange: bm === "one" ? num("cBrange") : null, bstart: bm === "two" ? num("cBstart") : null, bend: bm === "two" ? num("cBend") : null },
      year: +$("year").value || new Date().getFullYear(), overnight: $("overnight").checked,
      step: +$("step").value || 30, from: clockOf("from", 480), to: clockOf("to", 1320), how: $("how").value, group: $("grp").value
    };
    if (o.to <= o.from) o.to += 1440;
    return o;
  }
  function rowNo(i) { return i + ($("hasHead").checked ? 2 : 1); }
  function nameOf(r) { return r.person || "行" + rowNo(r.i); }
  function slotLabel(c) { return N.hm(c.from) + "〜" + N.hm(c.to); }

  // ---------- 数えて表示 ----------
  function refresh() {
    if (!S.rows.length) return;
    var o = options();
    var need = o.mode === "one" ? (o.map.range == null ? "時間帯の列" : "") : (o.map.start == null || o.map.end == null ? "開始と終了の列" : "");
    if (need) {
      $("sumMsg").innerHTML = '<span class="wtxt">' + need + "を選んでください。</span>";
      ["shortView", "errView", "hmView", "dayView"].forEach(function (id) { $(id).innerHTML = ""; }); S.last = null; return;
    }
    var b = N.buildRecords(S.rows, o);
    // 職種の選択肢
    var gs = N.groupsOf(b.recs), curG = $("grp").value;
    $("grpRow").hidden = !gs.length;
    $("grp").innerHTML = '<option value="">全員</option>' + gs.map(function (g) { return '<option' + (g === curG ? " selected" : "") + ">" + esc(g) + "</option>"; }).join("");
    o.group = gs.indexOf(curG) >= 0 ? curG : "";
    var R = N.parseRules($("rules").value, o.year);
    $("ruleMsg").innerHTML = R.errors.length ? '<span class="wtxt">読めない行：' + R.errors.map(function (e) { return e.line + "行目「" + esc(e.text) + "」（" + esc(e.note) + "）"; }).join("、") + "</span>" :
      (R.rules.length ? R.rules.length + " 行の決まりで、足りない所を探しています。" : "");
    var c = N.countSlots(b.recs, R.rules.length ? R.rules : null, o), sh = N.shortages(c);
    S.last = { o: o, b: b, R: R, c: c, sh: sh };

    var shortMin = sh.reduce(function (a, x) { return a + x.to - x.from; }, 0), shortDays = {};
    sh.forEach(function (x) { shortDays[x.day] = 1; });
    $("sumMsg").innerHTML = (o.group ? "「" + esc(o.group) + "」の " : "") + "勤務・予約 <b>" + b.recs.filter(function (r) { return !o.group || r.group === o.group; }).length + "</b> 件、" + c.days.length + " 日分を数えました。" +
      (R.rules.length ? (sh.length ? '　<span class="bad">足りない時間帯 ' + sh.length + " か所（" + Object.keys(shortDays).length + " 日、合わせて " + N.dur(shortMin) + "）</span>" : "　<b>足りない時間帯はありません。</b>") : '　<span class="note">必要な人数を書くと、足りない時間帯を探します。</span>') +
      (b.offs ? "　休みの行 " + b.offs + " 件" : "") + (b.blanks ? "　空欄の行 " + b.blanks + " 件" : "") +
      (b.errors.length ? '　<span class="wtxt">読めない行 ' + b.errors.length + " 件（下に一覧）</span>" : "") +
      (b.recs.some(function (r) { return r.note; }) ? '<br><span class="note">メモのある行があります（翌日までとみなした・休憩を引いていないなど）。明細の CSV で確かめられます。</span>' : "");

    $("shortView").innerHTML = sh.length ? '<div class="scroll"><table class="lt"><thead><tr><th>日付</th><th>時間帯</th><th class="n">いる人数</th><th class="n">必要</th><th class="n">足りない</th><th>いる人</th></tr></thead><tbody>' +
      sh.slice(0, 500).map(function (x) {
        return "<tr><td>" + esc(N.dayLabel(x.day)) + "</td><td>" + esc(slotLabel(x)) + '</td><td class="n">' + x.n + '</td><td class="n">' + x.need + '</td><td class="n bad">' + x.short + "</td><td>" + esc(x.who.map(nameOf).join("、") || "なし") + "</td></tr>";
      }).join("") + "</tbody></table></div>" + (sh.length > 500 ? '<p class="note">画面には500か所まで表示しています。全部は CSV で保存できます。</p>' : "") : "";

    $("errView").innerHTML = b.errors.length ? "<h3>読めない行（数えていません）</h3>" + '<div class="scroll"><table class="lt"><tr><th>行</th><th>内容</th><th>理由</th></tr>' +
      b.errors.slice(0, 200).map(function (r) {
        return "<tr><td>" + rowNo(r.i) + "</td><td>" + esc(r.row.filter(function (v) { return String(v).trim(); }).join(" / ")) + "</td><td class='wtxt'>" + esc(r.note) + "</td></tr>";
      }).join("") + "</table></div>" + (b.errors.length > 200 ? '<p class="note">ほか ' + (b.errors.length - 200) + " 件は明細の CSV で確かめられます。</p>" : "") : "";

    $("hmView").innerHTML = c.days.length ? '<div class="scroll">' + hmHTML(true) + "</div>" +
      '<p class="note">数字はその枠にいる人数（' + ($("how").value === "full" ? "枠の間ずっといる人" : "少しでもいる人") + "）。色が濃いほど多く、赤い枠が必要な人数に足りない所です。数字にマウスを重ねると、いる人の名前が出ます。灰色の「-」は必要な人数を決めていない時間です。</p>" : "";

    $("dayView").innerHTML = c.days.length ? '<div class="scroll"><table class="lt"><thead><tr><th>日付</th><th class="n">人数（実人数）</th><th class="n">いちばん多い</th><th>その時間</th>' +
      (R.rules.length ? '<th class="n">必要な時間の中でいちばん少ない</th><th>その時間</th><th class="n">足りない枠</th>' : "") + '<th class="n">勤務の合計（見る時間の中）</th></tr></thead><tbody>' +
      c.days.map(function (d) {
        return "<tr><td>" + esc(N.dayLabel(d.day)) + '</td><td class="n">' + d.people + '</td><td class="n">' + d.max + "</td><td>" + esc(d.maxAt && d.max ? slotLabel(d.maxAt) : "") + "</td>" +
          (R.rules.length ? '<td class="n">' + (d.minNeedN == null ? "" : d.minNeedN) + "</td><td>" + esc(d.minAt ? slotLabel(d.minAt) : "") + '</td><td class="n' + (d.shortSlots ? " bad" : "") + '">' + d.shortSlots + "</td>" : "") +
          '<td class="n">' + esc(N.dur(d.workMin)) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : "";
  }

  function shade(n, mx) {
    if (!n || !mx) return "";
    var a = 0.12 + 0.6 * (n / mx);
    return "background:rgba(15,118,110," + a.toFixed(2) + ");" + (a > 0.5 ? "color:#fff;" : "");
  }
  function hmHTML(tip) {
    var L = S.last, c = L.c, mx = c.days.reduce(function (a, d) { return Math.max(a, d.max); }, 0), hasR = L.R.rules.length > 0;
    var step = L.o.step, head = c.slots.map(function (s) {
      var lab = s[0] % 60 === 0 ? N.hm(s[0]).replace(":00", "") : (step === 15 ? "" : ":" + ("0" + (s[0] % 60)).slice(-2));
      return "<th title=\"" + esc(N.hm(s[0]) + "〜" + N.hm(s[1])) + "\">" + esc(lab) + "</th>";
    }).join("");
    return '<table class="hm"><thead><tr><th class="d">日付＼時</th>' + head + "</tr></thead><tbody>" +
      c.days.map(function (d) {
        return '<tr><td class="d">' + esc(N.dayLabel(d.day)) + "</td>" + d.cells.map(function (x) {
          var cls = x.short ? "s" : (hasR && x.need == null && !x.n ? "k" : "");
          var t = tip ? ' title="' + esc(N.dayLabel(d.day) + " " + slotLabel(x) + "：" + x.n + "人" + (x.need != null ? "（必要 " + x.need + "）" : "") + (x.who.length ? " " + x.who.map(nameOf).join("、") : "")) + '"' : "";
          return '<td class="' + cls + '" style="' + (x.short ? "" : shade(x.n, mx)) + '"' + t + ">" + (cls === "k" ? "-" : x.n) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function download(name, rows) {
    var blob = new Blob([N.toCSV(rows)], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $("saveMsg").textContent = "保存しました（" + name + "）。" + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : "");
  }
  function saveHm() {
    if (!S.last) return;
    var c = S.last.c, out = [["日付"].concat(c.slots.map(function (s) { return N.hm(s[0]) + "〜" + N.hm(s[1]); }))];
    c.days.forEach(function (d) { out.push([N.dayLabel(d.day)].concat(d.cells.map(function (x) { return x.n; }))); });
    if (S.last.R.rules.length) {
      out.push([]); out.push(["必要な人数"].concat(c.slots.map(function () { return ""; })));
      c.days.forEach(function (d) { out.push([N.dayLabel(d.day)].concat(d.cells.map(function (x) { return x.need == null ? "" : x.need; }))); });
    }
    download("時間帯ごとの人数_" + ymd() + ".csv", out);
  }
  function saveShort() {
    if (!S.last) return;
    var out = [["日付", "開始", "終了", "いる人数", "必要な人数", "足りない人数", "いる人"]];
    S.last.sh.forEach(function (x) { out.push([N.dayLabel(x.day), N.hm(x.from), N.hm(x.to), x.n, x.need, x.short, x.who.map(nameOf).join("、")]); });
    download("足りない時間帯_" + ymd() + ".csv", out);
  }
  function saveDay() {
    if (!S.last) return;
    var hasR = S.last.R.rules.length;
    var out = [["日付", "実人数", "いちばん多い人数", "その時間"].concat(hasR ? ["必要な時間の中でいちばん少ない人数", "その時間", "足りない枠の数"] : []).concat(["勤務の合計（分）"])];
    S.last.c.days.forEach(function (d) {
      out.push([N.dayLabel(d.day), d.people, d.max, d.maxAt && d.max ? slotLabel(d.maxAt) : ""].concat(hasR ? [d.minNeedN == null ? "" : d.minNeedN, d.minAt ? slotLabel(d.minAt) : "", d.shortSlots] : []).concat([d.workMin]));
    });
    download("日ごとのまとめ_" + ymd() + ".csv", out);
  }
  function saveDetail() {
    if (!S.last) return;
    var L = S.last, by = {}, err = {};
    L.b.recs.forEach(function (r) { by[r.i] = r; });
    L.b.errors.forEach(function (r) { err[r.i] = r.note; });
    var out = [S.headers.concat(["読み取った開始", "読み取った終了", "引いた休憩", "数える時間（分）", "読み取りメモ"])];
    S.rows.forEach(function (row, i) {
      var r = by[i];
      out.push(row.concat(r ? [N.stamp(r.s), N.stamp(r.e), r.breaks.map(function (b) { var d = Math.floor(b[0] / 1440) * 1440; return N.hm(b[0] - d) + "〜" + N.hm(b[1] - d); }).join("、"),
        r.parts.reduce(function (a, p) { return a + p[1] - p[0]; }, 0), r.note] : ["", "", "", "", err[i] || "空欄・休み"]));
    });
    download("人数_明細_" + ymd() + ".csv", out);
  }

  // ---------- 印刷 ----------
  function printPart(kind) {
    if (!S.last) return;
    var L = S.last, o = L.o, title = $("title").value.trim() || "時間帯ごとの人数", body = "";
    var cond = (o.group ? "職種・持ち場「" + o.group + "」、" : "") + N.hm(o.from) + "〜" + N.hm(o.to) + "・" + o.step + "分ごと（" + (o.how === "full" ? "枠の間ずっといる人" : "少しでもいる人") + "）" +
      (L.b.errors.length ? "、読めない行 " + L.b.errors.length + " 件は含まない" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP");
    if (kind === "hm") {
      body = hmHTML(false) + (L.R.rules.length ? '<p class="note">赤い枠：必要な人数に足りない時間帯。必要な人数：' + esc(L.R.rules.map(function (r) { return r.text; }).join("／")) + "</p>" : "");
    } else {
      body = "<h2>足りない時間帯（" + L.sh.length + " か所）</h2>" + (L.R.rules.length ? "" : "<p>必要な人数を書いていません。</p>") +
        (L.sh.length ? '<table class="pt"><thead><tr><th>日付</th><th>時間帯</th><th class="n">いる</th><th class="n">必要</th><th class="n">足りない</th><th>いる人</th></tr></thead><tbody>' +
          L.sh.map(function (x) { return "<tr><td>" + esc(N.dayLabel(x.day)) + "</td><td>" + esc(slotLabel(x)) + '</td><td class="n">' + x.n + '</td><td class="n">' + x.need + '</td><td class="n">' + x.short + "</td><td>" + esc(x.who.map(nameOf).join("、")) + "</td></tr>"; }).join("") + "</tbody></table>" :
          (L.R.rules.length ? "<p>足りない時間帯はありません。</p>" : "")) +
        (L.R.rules.length ? '<p class="note">必要な人数：' + esc(L.R.rules.map(function (r) { return r.text; }).join("／")) + "</p>" : "");
    }
    $("pageStyle").textContent = "@page{size:A4 " + (kind === "hm" ? "landscape" : "portrait") + ";margin:10mm}";
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の小さな店の1週間のシフト） ----------
  var SAMPLE = (function () {
    var t = "日付\t氏名\t職種\t出勤\t退勤\t休憩\n";
    var plan = [
      ["11/30", [["青木", "ホール", "9:00", "17:00", "12:00-13:00"], ["石井", "キッチン", "10:00", "15:00", ""], ["上田", "ホール", "16:00", "22:00", ""], ["江藤", "キッチン", "15:00", "22:00", "18:00-18:30"]]],
      ["12/01", [["青木", "ホール", "9:00", "17:00", "12:00-13:00"], ["小川", "ホール", "11:00", "14:00", ""], ["石井", "キッチン", "10:00", "17:00", "14:00-14:45"], ["上田", "ホール", "17:00", "22:00", ""], ["江藤", "キッチン", "休", "", ""]]],
      ["12/02", [["加藤", "ホール", "9:00", "13:00", ""], ["小川", "ホール", "13:00", "18:00", ""], ["石井", "キッチン", "10:00", "17:00", "14:00-14:45"], ["上田", "ホール", "18:00", "22:00", ""], ["江藤", "キッチン", "16:00", "22:00", ""]]],
      ["12/03", [["青木", "ホール", "9:00", "17:00", "12:00-13:00"], ["加藤", "ホール", "11:00", "15:00", ""], ["石井", "キッチン", "10:00", "17:00", "14:00-14:45"], ["上田", "ホール", "17:00", "22:00", ""], ["江藤", "キッチン", "17:00", "22:00", ""]]],
      ["12/04", [["青木", "ホール", "9:00", "17:00", "12:00-13:00"], ["小川", "ホール", "11:00", "14:00", ""], ["江藤", "キッチン", "10:00", "16:00", "13:30-14:00"], ["上田", "ホール", "17:00", "22:00", ""], ["石井", "キッチン", "公休", "", ""]]],
      ["12/05", [["青木", "ホール", "9:00", "18:00", "13:00-14:00"], ["小川", "ホール", "10:00", "15:00", ""], ["加藤", "ホール", "15:00", "22:00", "18:30-19:00"], ["石井", "キッチン", "9:30", "17:30", "14:00-15:00"], ["江藤", "キッチン", "13:00", "22:00", "17:00-17:30"], ["上田", "ホール", "17:00", "22:00", ""]]],
      ["12/06", [["青木", "ホール", "9:00", "17:00", "13:00-14:00"], ["加藤", "ホール", "10:00", "16:00", ""], ["石井", "キッチン", "9:30", "17:30", "14:00-15:00"], ["江藤", "キッチン", "14:00", "22:00", ""], ["上田", "ホール", "16:00", "22:00", ""], ["小川", "ホール", "17:00", "21:00", ""]]]
    ];
    plan.forEach(function (d) { d[1].forEach(function (p) { t += "2026/" + d[0] + "\t" + p.join("\t") + "\n"; }); });
    return t;
  })();
  var SAMPLE_RULES = "9:00-22:00 2\n平日 11:30-13:30 3\n土日 11:00-14:00 4\n土日 17:00-20:00 4";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  var KEYS = ["step", "from", "to", "how", "rules", "title"];
  function saveSettings() {
    try { var o = {}; KEYS.forEach(function (k) { o[k] = $(k).value; }); o.overnight = $("overnight").checked; localStorage.setItem("jikantai-ninzu", JSON.stringify(o)); } catch (e) {}
  }
  function loadSettings() {
    try { var o = JSON.parse(localStorage.getItem("jikantai-ninzu") || "{}"); KEYS.forEach(function (k) { if (o[k] != null) $(k).value = o[k]; }); if (o.overnight != null) $("overnight").checked = o.overnight; } catch (e) {}
  }

  window.addEventListener("DOMContentLoaded", function () {
    $("year").value = new Date().getFullYear();
    loadSettings();
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(N.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () {
      $("paste").value = SAMPLE; $("hasHead").checked = true; $("year").value = 2026;
      if (!$("rules").value.trim()) $("rules").value = SAMPLE_RULES;
      $("from").value = "9:00"; $("to").value = "22:00";
      setData(N.parseCSV(SAMPLE), true, "見本");
    };
    [].forEach.call(document.querySelectorAll("input[name=mode]"), function (r) { r.onchange = function () { modeView(); refresh(); }; });
    $("bMode").onchange = function () { modeView(); refresh(); };
    ["cDate", "cStart", "cEnd", "cRange", "cPerson", "cGroup", "cBrange", "cBstart", "cBend", "cCount", "year", "overnight", "step", "from", "to", "how", "grp"].forEach(function (id) {
      $(id).onchange = function () { saveSettings(); refresh(); };
    });
    var tm = null;
    $("rules").oninput = function () { clearTimeout(tm); tm = setTimeout(function () { saveSettings(); refresh(); }, 300); };
    $("title").onchange = saveSettings;
    $("pHm").onclick = function () { printPart("hm"); }; $("pShort").onclick = function () { printPart("short"); };
    $("cHm").onclick = saveHm; $("cShort").onclick = saveShort; $("cDay").onclick = saveDay; $("cDetail").onclick = saveDetail;
  });
})();
