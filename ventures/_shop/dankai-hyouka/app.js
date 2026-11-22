/* 段階評価のアンケート集計 — 画面・印刷・保存。データはブラウザの外へ送信しない */
(function () {
  "use strict";
  var M = window.DANKAI;
  var LIMIT = window.DANKAI_LIMIT || Infinity; // お試し版は先頭の行数を制限
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var S = { headers: [], rows: [], name: "", specs: [], conf: {}, hh: 1 };

  // 良い側（緑）→ 中間（灰）→ 悪い側（橙）
  function colorOf(score, min, max) {
    var t = max === min ? 0.5 : (max - score) / (max - min);
    var a = [15, 118, 110], m = [209, 213, 219], b = [194, 65, 12], c;
    if (t <= 0.5) { var u = t / 0.5; c = a.map(function (x, i) { return Math.round(x + (m[i] - x) * u); }); }
    else { var w = (t - 0.5) / 0.5; c = m.map(function (x, i) { return Math.round(x + (b[i] - x) * w); }); }
    return "rgb(" + c.join(",") + ")";
  }
  function colors(A) {
    var mn = Math.min.apply(null, A.scores), mx = Math.max.apply(null, A.scores);
    return A.scores.map(function (s) { return colorOf(s, mn, mx); });
  }
  function band(A, widthCss) {
    var cs = colors(A);
    if (!A.n) return '<span class="note">回答なし</span>';
    return '<span class="band" style="width:' + widthCss + '">' + A.counts.map(function (c, i) {
      if (!c) return "";
      var p = c / A.n * 100;
      return '<span style="width:' + p.toFixed(2) + "%;background:" + cs[i] + '" title="' + esc(A.labels[i] + " " + c + "人") + '">' + (p >= 9 ? Math.round(p) + "%" : "") + "</span>";
    }).join("") + "</span>";
  }

  // ---------- 読み込み ----------
  function naList() { return $("naList").value.split(/\r?\n/).map(M.clean).filter(Boolean); }
  function setData(rows, hasHead, name) {
    if (!rows.length) { $("loadMsg").textContent = "データが空です。"; return; }
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    rows = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(""); return r; });
    S.headers = hasHead ? rows[0].map(function (h, i) { return M.clean(h) || "列" + (i + 1); }) : rows[0].map(function (_, i) { return "列" + (i + 1); });
    S.rows = hasHead ? rows.slice(1) : rows;
    S.hh = hasHead ? 2 : 1;
    S.name = name || "";
    var total = S.rows.length;
    if (S.rows.length > LIMIT) S.rows = S.rows.slice(0, LIMIT);
    var guess = M.guessCols(S.headers, S.rows, naList());
    S.conf = {};
    S.headers.forEach(function (_, i) {
      var vals = S.rows.map(function (r) { return r[i]; }).filter(function (v) { return M.clean(v); });
      var sc = M.guessScale(vals, naList());
      var cnt = {};
      vals.forEach(function (v) { v = M.clean(v); cnt[v] = (cnt[v] || 0) + 1; });
      var freq = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 11);
      S.conf[i] = { on: false, guessed: !!sc, kind: sc ? sc.kind : "text", levels: (sc && sc.kind === "text" ? sc.levels : freq).join("\n"), min: sc && sc.kind === "num" ? sc.min : 1, max: sc && sc.kind === "num" ? sc.max : 5, numLabels: sc && sc.labels || {}, rev: false };
    });
    guess.forEach(function (g) { S.conf[g.col].on = true; });
    renderCols();
    $("group").innerHTML = '<option value="">（なし）</option>' + S.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + "</option>"; }).join("");
    $("loadMsg").innerHTML = esc((name ? name + "：" : "") + total + " 行を読み込みました。") +
      (guess.length ? "段階評価らしい列：" + esc(guess.map(function (g) { return S.headers[g.col]; }).join("、")) + "。" : '<span class="wtxt">段階評価らしい列が見つかりませんでした。下で列を選び、段階を書いてください。</span>') +
      (total > LIMIT ? '<span class="wtxt">お試し版のため、先頭 ' + LIMIT + " 行だけを集計します。</span>" : "");
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

  // ---------- 列の設定 ----------
  function renderCols() {
    $("cols").innerHTML = S.headers.map(function (h, i) {
      var c = S.conf[i];
      var ex = S.rows.map(function (r) { return r[i]; }).filter(function (v) { return String(v).trim(); }).slice(0, 3).map(function (v) { return String(v).replace(/\s+/g, " ").slice(0, 24); }).join("｜");
      return '<div class="colbox"><div class="row" style="margin:0"><label><input type="checkbox" data-c="' + i + '" class="cOn"' + (c.on ? " checked" : "") + "> <b>" + esc(h) + '</b></label><span class="note">' + esc(ex) + "</span></div>" +
        '<div' + (c.on ? "" : " hidden") + ' class="cDet"><div class="row" style="margin:4px 0">' +
        '<label>段階の種類 <select class="cKind" data-c="' + i + '"><option value="text"' + (c.kind === "text" ? " selected" : "") + '>言葉（とても満足〜とても不満 など）</option><option value="num"' + (c.kind === "num" ? " selected" : "") + ">数字（1〜5 など）</option></select></label>" +
        '<span class="cNum"' + (c.kind === "num" ? "" : " hidden") + '><label>いちばん低い <input type="number" class="cMin" data-c="' + i + '" value="' + c.min + '" min="0" max="10" style="width:4em"></label> <label>いちばん高い <input type="number" class="cMax" data-c="' + i + '" value="' + c.max + '" min="1" max="10" style="width:4em"></label></span>' +
        '<label><input type="checkbox" class="cRev" data-c="' + i + '"' + (c.rev ? " checked" : "") + "> 低い（下の）ほど良い設問（点数を逆にする）</label></div>" +
        '<div class="cText"' + (c.kind === "text" ? "" : " hidden") + '><label class="note">段階（<b>良い順</b>に1行に1つ。上から順に高い点：5段階なら 5・4・3・2・1 点）' + (c.guessed ? "：回答から推定しました。違っていれば書き直してください" : "：回答の多い順に並べています。良い順に並べ替えてください") + '</label><textarea class="cLv" data-c="' + i + '" rows="' + Math.min(8, c.levels.split("\n").length + 1) + '">' + esc(c.levels) + "</textarea></div>" +
        '<div class="note cNow" data-c="' + i + '"></div></div></div>';
    }).join("");
    function each(cls, fn) { Array.prototype.forEach.call(document.querySelectorAll(cls), function (el) { el.onchange = function () { fn(el, S.conf[el.dataset.c]); refresh(); }; }); }
    each(".cOn", function (el, c) { c.on = el.checked; el.closest(".colbox").querySelector(".cDet").hidden = !el.checked; });
    each(".cKind", function (el, c) { c.kind = el.value; var b = el.closest(".colbox"); b.querySelector(".cNum").hidden = c.kind !== "num"; b.querySelector(".cText").hidden = c.kind !== "text"; });
    each(".cMin", function (el, c) { c.min = Math.max(0, Math.min(9, +el.value || 0)); });
    each(".cMax", function (el, c) { c.max = Math.max(1, Math.min(10, +el.value || 5)); });
    each(".cRev", function (el, c) { c.rev = el.checked; });
    each(".cLv", function (el, c) { c.levels = el.value; });
  }

  // ---------- 集計 ----------
  function refresh() {
    var t0 = Date.now(), na = naList();
    S.specs = [];
    S.headers.forEach(function (h, i) {
      var c = S.conf[i];
      if (!c || !c.on) return;
      var sc = c.kind === "num" ? { kind: "num", min: Math.min(c.min, c.max - 1), max: c.max, labels: c.numLabels } : { kind: "text", levels: c.levels.split(/\r?\n/).map(M.clean).filter(Boolean) };
      var now = document.querySelector('.cNow[data-c="' + i + '"]');
      if (sc.kind === "text" && sc.levels.length < 2) { if (now) now.innerHTML = '<span class="wtxt">段階を2つ以上書いてください。</span>'; return; }
      var A = M.analyze(S.rows, i, sc, na, c.rev);
      S.specs.push({ col: i, A: A });
      if (now) now.innerHTML = esc(A.k + "段階（" + A.labels[0] + " ＝ " + A.scores[0] + "点 〜 " + A.labels[A.k - 1] + " ＝ " + A.scores[A.k - 1] + "点）") +
        (A.unknown.length ? '　<span class="wtxt">段階にない答え ' + A.unknown.length + " 件</span>" : "");
    });
    var g = $("group").value;
    S.group = g === "" ? null : +g;
    if (!S.specs.length) { $("sumMsg").textContent = "集計する列にチェックを入れてください。"; $("resView").innerHTML = ""; return; }
    $("sumMsg").innerHTML = esc(S.rows.length + " 行（回答者）、集計した設問 " + S.specs.length + " 個") + '<span class="note">（' + ((Date.now() - t0) / 1000).toFixed(2) + " 秒）</span>";
    $("resView").innerHTML = overviewHTML() + S.specs.map(resHTML).join("");
  }
  function topLabel(A) { return A.topK === 2 ? "上位2段階" : "上位1段階"; }
  function overviewHTML() {
    var h = '<h3>設問の一覧</h3><div class="scroll"><table class="lt"><thead><tr><th>設問</th><th class="n">回答</th><th class="n">平均</th><th class="n">良い側の割合</th><th class="n">悪い側の割合</th><th>段階ごとの割合（左が先頭の段階）</th></tr></thead><tbody>';
    S.specs.forEach(function (sp) {
      var A = sp.A;
      h += "<tr><td>" + esc(S.headers[sp.col]) + '</td><td class="n">' + A.n + '</td><td class="n">' + M.fix(A.mean, 2) + " / " + Math.max.apply(null, A.scores) + '</td><td class="n">' + M.pct(A.top, A.n) + '</td><td class="n">' + M.pct(A.bottom, A.n) + "</td><td>" + band(A, "260px") + "</td></tr>";
    });
    return h + '</tbody></table></div><p class="note">平均は、いちばん良い段階を最高点とした点数の平均です（わからない・無回答・空欄は除く）。良い側・悪い側の割合は、4段階以上は端から2段階、3段階は端の1段階を足した割合です。</p>';
  }
  function resHTML(sp) {
    var A = sp.A, cs = colors(A);
    var h = '<div class="res"><h3>' + esc(S.headers[sp.col]) + "</h3>" +
      '<p class="note">回答 ' + A.n + " 人（空欄 " + A.blank + " 人、集計から除いた答え " + A.na + " 人" + (A.unknown.length ? "、段階にない答え " + A.unknown.length + " 人" : "") + "）、平均 " + M.fix(A.mean, 2) + " 点、標準偏差 " + M.fix(A.sd, 2) + "、" + topLabel(A) + "の割合 " + M.pct(A.top, A.n) + (A.reverse ? "（点数を逆にしています）" : "") + "</p>";
    var X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
    h += '<div class="scroll"><table class="lt"><thead><tr><th>段階</th><th class="n">点数</th><th class="n">人数</th><th class="n">割合</th><th></th></tr></thead><tbody>';
    var max = A.counts.reduce(function (a, c) { return Math.max(a, c); }, 1);
    A.counts.forEach(function (c, i) {
      h += '<tr><td><span class="sw" style="background:' + cs[i] + '"></span>' + esc(A.labels[i]) + '</td><td class="n">' + A.scores[i] + '</td><td class="n">' + c + '</td><td class="n">' + M.pct(c, A.n) + '</td><td><span class="bar" style="width:' + Math.round(c / max * 160) + 'px;background:' + cs[i] + '"></span></td></tr>';
    });
    h += "</tbody></table></div>";
    if (X) {
      h += '<h3 style="font-size:13px">' + esc(S.headers[S.group]) + ' 別</h3><div class="scroll"><table class="lt"><thead><tr><th>' + esc(S.headers[S.group]) + '</th><th class="n">回答</th><th class="n">平均</th><th class="n">' + topLabel(A) + "</th>" + A.labels.map(function (l) { return '<th class="n">' + esc(l) + "</th>"; }).join("") + "<th></th></tr></thead><tbody>";
      X.groups.forEach(function (gname) {
        var s = X.stat[gname], B = { n: s.n, counts: s.counts, labels: A.labels, scores: A.scores };
        h += "<tr><td>" + esc(gname) + '</td><td class="n">' + s.n + '</td><td class="n">' + M.fix(s.mean, 2) + '</td><td class="n">' + M.pct(s.top, s.n) + "</td>" + s.counts.map(function (c) { return '<td class="n">' + c + "</td>"; }).join("") + "<td>" + band(B, "180px") + "</td></tr>";
      });
      h += "</tbody></table></div>";
      if (X.groups.some(function (gname) { return X.stat[gname].n > 0 && X.stat[gname].n < 5; })) h += '<p class="note wtxt">回答が5人未満のグループがあります。人数が少ないと、平均や割合は1人の答えで大きく変わります。</p>';
    }
    if (A.unknown.length) {
      h += '<p class="note wtxt">段階にない答え（集計に入れていません）：' + A.unknown.slice(0, 15).map(function (u) { return (u.row + S.hh) + "行目「" + esc(u.value) + "」"; }).join("、") + (A.unknown.length > 15 ? " ほか " + (A.unknown.length - 15) + " 件" : "") + "。段階の書き方の違いなら、上の段階の一覧か「集計から除く答え」に足してください。</p>";
    }
    return h + "</div>";
  }

  // ---------- 保存 ----------
  function ymd() { var d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function done(name, extra) { $("saveMsg").textContent = "保存しました（" + name + "）。" + (extra || "") + (LIMIT < Infinity ? "お試し版は先頭 " + LIMIT + " 行の結果です。" : ""); }
  function dlBlob(text, name) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // numCell(r, c) が true のセルは数値として書く
  function xlsx(rows, name, sheet, numCell) {
    if (!window.XLSX) { $("saveMsg").textContent = "Excel の部品を読み込めませんでした。CSV で保存してください。"; return false; }
    var ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v); }); }));
    Object.keys(ws).forEach(function (k) {
      if (k[0] === "!") return;
      var cell = ws[k], c = XLSX.utils.decode_cell(k);
      if (numCell && numCell(c.r, c.c) && /^-?\d+(\.\d+)?$/.test(cell.v)) { cell.t = "n"; cell.v = +cell.v; delete cell.z; }
      else { cell.t = "s"; cell.z = "@"; } // 電話番号などの先頭の0が消えないよう文字列のまま
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, name); return true;
  }
  function saveScore(kind) {
    if (!S.specs.length) return;
    var rows = M.scoreRows(S.headers, S.rows, S.specs), name = "回答_点数の列を足した表_" + ymd() + "." + kind;
    var num = {}; rows[0].forEach(function (h, i) { if (/（点数）$/.test(h)) num[i] = 1; });
    if (kind === "csv") dlBlob(M.toCSV(rows), name); else if (!xlsx(rows, name, "点数つき", function (r, c) { return r > 0 && num[c]; })) return;
    done(name, "足した列 " + S.specs.length + " 個。");
  }
  function sumRows() {
    var out = [["設問", "回答", "平均", "標準偏差", "良い側の割合", "悪い側の割合", "空欄", "集計から除いた答え", "段階にない答え", "段階の数"]];
    S.specs.forEach(function (sp) { var A = sp.A; out.push([S.headers[sp.col], A.n, M.fix(A.mean, 2), M.fix(A.sd, 2), M.pct(A.top, A.n), M.pct(A.bottom, A.n), A.blank, A.na, A.unknown.length, A.k]); });
    S.specs.forEach(function (sp) {
      var A = sp.A, X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
      out.push([]);
      out.push(["設問", S.headers[sp.col]]);
      out.push(["段階", "点数", "人数", "割合"]);
      A.counts.forEach(function (c, i) { out.push([A.labels[i], A.scores[i], c, M.pct(c, A.n)]); });
      out.push(["合計", "", A.n, A.n ? "100.0%" : "-"]);
      if (X) {
        out.push([]);
        out.push([S.headers[S.group], "回答", "平均", topLabel(A) + "の割合"].concat(A.labels));
        X.groups.forEach(function (g) { var s = X.stat[g]; out.push([g, s.n, M.fix(s.mean, 2), M.pct(s.top, s.n)].concat(s.counts)); });
      }
    });
    return out;
  }
  function saveSum(kind) {
    if (!S.specs.length) return;
    var rows = sumRows(), name = "回答_段階評価の集計表_" + ymd() + "." + kind;
    if (kind === "csv") dlBlob(M.toCSV(rows), name);
    else if (!xlsx(rows, name, "集計表", function (r, c) { return r > 0 && c > 0; })) return;
    done(name);
  }

  // ---------- 印刷 ----------
  function printSum() {
    if (!S.specs.length) return;
    var title = $("title").value.trim() || "アンケートの集計";
    var cond = S.rows.length + " 行" + (S.name ? "（" + S.name + "）" : "") + "　/　作成日 " + new Date().toLocaleDateString("ja-JP") + "　/　割合は各設問の回答（わからない・無回答・空欄を除く）に対する割合";
    var ov = '<table class="pt"><thead><tr><th>設問</th><th class="n">回答</th><th class="n">平均</th><th class="n">良い側</th><th style="width:46%">段階ごとの割合</th></tr></thead><tbody>' +
      S.specs.map(function (sp) { var A = sp.A; return "<tr><td>" + esc(S.headers[sp.col]) + '</td><td class="n">' + A.n + '</td><td class="n">' + M.fix(A.mean, 2) + '</td><td class="n">' + M.pct(A.top, A.n) + "</td><td>" + band(A, "100%") + "</td></tr>"; }).join("") + "</tbody></table>";
    var body = S.specs.map(function (sp) {
      var A = sp.A, cs = colors(A), X = S.group != null && S.group !== sp.col ? M.cross(S.rows, A, S.group) : null;
      var t = '<div class="sec"><h2>' + esc(S.headers[sp.col]) + '</h2><p class="per">回答 ' + A.n + " 人（空欄 " + A.blank + "、除いた答え " + (A.na + A.unknown.length) + "）　平均 " + M.fix(A.mean, 2) + " 点　標準偏差 " + M.fix(A.sd, 2) + "</p>" +
        '<table class="pt"><thead><tr><th>段階</th><th class="n">点数</th><th class="n">人数</th><th class="n">割合</th>' + (X ? X.groups.map(function (g) { return '<th class="n">' + esc(g) + "</th>"; }).join("") : "") + "</tr></thead><tbody>" +
        A.counts.map(function (c, i) {
          return '<tr><td><span class="sw" style="background:' + cs[i] + '"></span>' + esc(A.labels[i]) + '</td><td class="n">' + A.scores[i] + '</td><td class="n">' + c + '</td><td class="n">' + M.pct(c, A.n) + "</td>" + (X ? X.groups.map(function (g) { return '<td class="n">' + X.stat[g].counts[i] + "</td>"; }).join("") : "") + "</tr>";
        }).join("") +
        (X ? '<tr><td>平均</td><td></td><td class="n">' + A.n + '</td><td class="n">' + M.fix(A.mean, 2) + "</td>" + X.groups.map(function (g) { return '<td class="n">' + M.fix(X.stat[g].mean, 2) + "</td>"; }).join("") + "</tr>" : "") +
        "</tbody></table></div>";
      return t;
    }).join("");
    $("printArea").innerHTML = "<h1>" + esc(title) + "</h1>" + '<p class="per">' + esc(cond) + "</p>" + ov + body +
      ($("foot").value.trim() ? '<p class="ft">' + esc($("foot").value.trim()).replace(/\n/g, "<br>") + "</p>" : "");
    window.print();
  }

  // ---------- 見本（架空の研修のアンケート。氏名は説明用で、実在の人とは関係ありません） ----------
  var SAMPLE = "回答日時\t氏名\t部署\t研修全体の満足度\t講師の説明\t内容は仕事に役立つと思う\t会場の環境\t感想\n" +
    "2026/11/12 17:02\t見本 一郎\t総務\tとても満足\t5\tそう思う\t良い\t資料が見やすかった\n" +
    "2026/11/12 17:05\t見本 二郎\t営業\t満足\t4\tややそう思う\t普通\t\n" +
    "2026/11/12 17:06\t見本 花子\t総務\t満足\t4\tそう思う\t普通\t事例がもっとほしい\n" +
    "2026/11/12 17:08\t見本 三郎\t製造\tどちらともいえない\t3\tあまりそう思わない\t悪い\t長く感じた\n" +
    "2026/11/12 17:10\t見本 春子\t製造\t満足\t5\tややそう思う\t良い\t\n" +
    "2026/11/12 17:11\t見本 四郎\t営業\t不満\t2\tそう思わない\t普通\t\n" +
    "2026/11/12 17:15\t見本 夏子\t営業\tとても満足\t5\tそう思う\t良い\t次回も参加したい\n" +
    "2026/11/12 17:20\t見本 五郎\t総務\t満足\t4\tわからない\t良い\t\n" +
    "2026/11/12 17:24\t見本 秋子\t製造\t満足\t3\tややそう思う\t普通\t\n" +
    "2026/11/12 17:30\t見本 六郎\t営業\tとても満足\t4\tそう思う\t良い\t\n" +
    "2026/11/12 17:41\t見本 冬子\t総務\t\t4\tややそう思う\t普通\t\n";

  // ---------- 設定の保存（表の中身は保存しない） ----------
  function saveSettings() { try { localStorage.setItem("dankai-hyouka", JSON.stringify({ title: $("title").value })); } catch (e) {} }
  function loadSettings() { try { var o = JSON.parse(localStorage.getItem("dankai-hyouka") || "{}"); if (o.title != null) $("title").value = o.title; } catch (e) {} }

  window.addEventListener("DOMContentLoaded", function () {
    loadSettings();
    $("naList").value = M.NA_DEFAULT.join("\n");
    $("file").onchange = function () { if (this.files[0]) readFile(this.files[0]); };
    var dz = $("drop");
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = function () { dz.classList.remove("over"); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
    $("pasteGo").onclick = function () { var t = $("paste").value; if (t.trim()) setData(M.parseCSV(t), $("hasHead").checked, "貼り付けたデータ"); };
    $("sample").onclick = function () { $("paste").value = SAMPLE; $("hasHead").checked = true; setData(M.parseCSV(SAMPLE), true, "見本"); };
    $("group").onchange = refresh; $("naList").onchange = refresh;
    $("title").onchange = saveSettings;
    $("pSum").onclick = printSum;
    $("xSum").onclick = function () { saveSum("xlsx"); }; $("cSum").onclick = function () { saveSum("csv"); };
    $("xScore").onclick = function () { saveScore("xlsx"); }; $("cScore").onclick = function () { saveScore("csv"); };
  });
})();
