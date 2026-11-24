// 住所録の郵便番号・住所チェック：画面（製品版。お試し版は build.py が LIMIT を書き換えて作る）
(function () {
  "use strict";
  const LIMIT = 0; // 0 = 制限なし（製品版）。お試し版では点検する行数の上限
  const DATA_URL = window.JC_DATA_URL || "../data/zipdata.txt";
  const J = window.JushoCheck;
  const $ = function (s) { return document.querySelector(s); };
  let D = null, table = null, results = null, filter = "all";

  const LEVEL_LABEL = { ng: "直したほうがよい", warn: "確認が必要", fill: "補完できた", ok: "問題なし", empty: "空欄" };

  // ---------- データの読み込み ----------
  function loadData() {
    $("#dataState").textContent = "郵便番号データを読み込んでいます…";
    return fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      D = J.load(t);
      $("#dataState").textContent = "郵便番号データ：" + D.version + "（" + D.byZip.size.toLocaleString() + " 件の郵便番号）";
      updateButtons();
    }).catch(function (e) {
      $("#dataState").textContent = "郵便番号データを読み込めませんでした（" + e.message + "）。ページを再読み込みしてください";
    });
  }

  // ---------- 表の読み込み ----------
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    const sep = (text.split("\n")[0].split("\t").length > text.split("\n")[0].split(",").length) ? "\t" : ",";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }
  function decode(buf) {
    const u8 = new Uint8Array(buf);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
    catch (e) { return new TextDecoder("shift_jis").decode(u8); }
  }
  function readFile(file) {
    const name = file.name.toLowerCase();
    file.arrayBuffer().then(function (buf) {
      if (/\.(xlsx|xls)$/.test(name)) {
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        setTable(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).map(function (r) { return r.map(function (x) { return x == null ? "" : String(x); }); })
          .filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); }), file.name);
      } else setTable(parseCSV(decode(buf)), file.name);
    });
  }
  function setTable(rows, label) {
    if (!rows.length) { alert("表が空です"); return; }
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    rows = rows.map(function (r) { while (r.length < w) r.push(""); return r; });
    table = { rows: rows, label: label };
    guessColumns();
    $("#step2").hidden = false;
    $("#tableInfo").textContent = (label ? label + "：" : "") + (rows.length - ($("#hasHeader").checked ? 1 : 0)) + " 行 × " + w + " 列";
    results = null; $("#step3").hidden = true;
    updateButtons();
  }

  // ---------- 列の推定と選択 ----------
  function headers() {
    const h = $("#hasHeader").checked ? table.rows[0] : table.rows[0].map(function (_, i) { return "列" + (i + 1); });
    return h.map(function (x, i) { return (x || "").trim() || "列" + (i + 1); });
  }
  function guessColumns() {
    const rows = table.rows;
    const first = rows[0].join(" ");
    $("#hasHeader").checked = /郵便|〒|住所|氏名|名前|都道府県|市区町村|番地|zip|address/i.test(first) && !/^\d{3}-?\d{4}$/.test((rows[0][0] || "").trim());
    const h = headers();
    let zipCol = h.findIndex(function (x) { return /郵便|〒|zip|postal/i.test(x); });
    if (zipCol < 0) {                       // 中身から探す
      let best = -1, bestN = 0;
      for (let c = 0; c < h.length; c++) {
        let n = 0; rows.slice(1, 50).forEach(function (r) { if (/^〒?\s*\d{3}[-ー−]?\d{4}$/.test((r[c] || "").normalize("NFKC").trim())) n++; });
        if (n > bestN) { bestN = n; best = c; }
      }
      zipCol = best;
    }
    const addr = [];
    h.forEach(function (x, i) {
      if (i === zipCol) return;
      if (/都道府県|市区町村|住所|番地|町域|丁目|建物|ビル|マンション|address/i.test(x) && !/メール|mail|カナ|ｶﾅ|フリガナ|ふりがな/i.test(x)) addr.push(i);
    });
    if (!addr.length) {
      for (let c = 0; c < h.length; c++) {
        if (c === zipCol) continue;
        let n = 0; rows.slice(1, 50).forEach(function (r) { if (/^(北海道|東京都|大阪府|京都府|.{2,3}県)/.test((r[c] || "").trim())) n++; });
        if (n >= 2) { addr.push(c); break; }
      }
    }
    renderColumnPickers(zipCol, addr);
  }
  function renderColumnPickers(zipCol, addr) {
    const h = headers();
    const sel = $("#zipCol"); sel.innerHTML = "";
    const none = document.createElement("option"); none.value = "-1"; none.textContent = "（郵便番号の列はない）"; sel.appendChild(none);
    h.forEach(function (x, i) { const o = document.createElement("option"); o.value = i; o.textContent = x; sel.appendChild(o); });
    sel.value = String(zipCol);
    const box = $("#addrCols"); box.innerHTML = "";
    h.forEach(function (x, i) {
      const l = document.createElement("label"); l.className = "chk";
      const c = document.createElement("input"); c.type = "checkbox"; c.value = i; c.checked = addr.indexOf(i) >= 0;
      l.appendChild(c); l.appendChild(document.createTextNode(" " + x)); box.appendChild(l);
    });
  }
  function chosen() {
    return {
      zip: +$("#zipCol").value,
      addr: Array.from(document.querySelectorAll("#addrCols input:checked")).map(function (c) { return +c.value; })
    };
  }

  // ---------- 点検 ----------
  function run() {
    if (!D || !table) return;
    const cs = chosen();
    if (cs.zip < 0 && !cs.addr.length) { alert("郵便番号の列か住所の列を選んでください"); return; }
    const body = table.rows.slice($("#hasHeader").checked ? 1 : 0);
    const t0 = performance.now();
    results = body.map(function (r, i) {
      if (LIMIT && i >= LIMIT) return null;
      const z = cs.zip >= 0 ? r[cs.zip] : "";
      const a = cs.addr.map(function (c) { return r[c] || ""; }).join("");
      return J.checkRow(D, z, a);
    });
    const ms = Math.round(performance.now() - t0);
    renderResults(body, cs, ms);
  }
  function renderResults(body, cs, ms) {
    const counts = { ng: 0, warn: 0, fill: 0, ok: 0, empty: 0 }, done = results.filter(Boolean).length;
    results.forEach(function (r) { if (r) counts[r.level]++; });
    $("#step3").hidden = false;
    $("#summary").innerHTML =
      '<button data-f="all" class="sum">すべて <b>' + done + "</b></button>" +
      ["ng", "warn", "fill", "ok", "empty"].map(function (k) {
        return '<button data-f="' + k + '" class="sum lv-' + k + '">' + LEVEL_LABEL[k] + " <b>" + counts[k] + "</b></button>";
      }).join("");
    let note = done + " 行を点検しました（" + (ms / 1000).toFixed(2) + " 秒）。";
    if (LIMIT && body.length > LIMIT) note += "お試し版のため、先頭 " + LIMIT + " 行だけを点検しています（残り " + (body.length - LIMIT) + " 行）。";
    $("#runNote").textContent = note;
    document.querySelectorAll("#summary .sum").forEach(function (b) {
      b.onclick = function () { filter = b.dataset.f; drawTable(body, cs); };
    });
    filter = counts.ng + counts.warn ? "problem" : "all";
    drawTable(body, cs);
    $("#step3").scrollIntoView({ behavior: "smooth" });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function drawTable(body, cs) {
    const h = headers();
    let html = "<table><thead><tr><th>行</th><th>判定</th><th>郵便番号</th><th>住所</th><th>説明</th><th>補完・候補</th><th>郵便番号から見た住所</th></tr></thead><tbody>";
    let shown = 0;
    const off = $("#hasHeader").checked ? 2 : 1;
    results.forEach(function (r, i) {
      if (!r) return;
      if (filter === "problem" && !(r.level === "ng" || r.level === "warn")) return;
      if (filter !== "all" && filter !== "problem" && r.level !== filter) return;
      if (shown >= 2000) return;
      shown++;
      const row = body[i];
      html += '<tr class="lv-' + r.level + '"><td>' + (i + off) + "</td><td><b>" + esc(r.status) + "</b></td><td>" + esc(cs.zip >= 0 ? row[cs.zip] : "") + "</td><td>" +
        esc(cs.addr.map(function (c) { return row[c]; }).join(" ")) + "</td><td>" + esc(r.msg) + "</td><td>" + esc(r.fillZip || r.fillAddr || r.candZips) + "</td><td>" + esc(r.zipAddr) + "</td></tr>";
    });
    html += "</tbody></table>";
    if (shown >= 2000) html += '<p class="note">画面には2,000行まで表示しています。すべての行は保存したファイルで確かめてください。</p>';
    if (!shown) html = '<p class="note">' + (filter === "problem" ? "直したほうがよい行・確認が必要な行はありませんでした。" : "この区分の行はありません。") + "</p>";
    $("#resultTable").innerHTML = html;
    document.querySelectorAll("#summary .sum").forEach(function (b) { b.classList.toggle("on", b.dataset.f === filter || (filter === "problem" && false)); });
    $("#filterNote").textContent = filter === "problem" ? "「直したほうがよい」「確認が必要」の行だけを表示しています。ほかの区分は上のボタンで切り替えられます。" : "";
  }

  // ---------- 保存 ----------
  const ADD = ["判定", "説明", "整えた郵便番号", "補完した郵便番号", "補完した住所（町域まで）", "住所から見た郵便番号の候補", "郵便番号から見た住所"];
  function outputRows() {
    const hasH = $("#hasHeader").checked;
    const head = headers().concat(ADD);
    const body = table.rows.slice(hasH ? 1 : 0);
    const out = [head];
    body.forEach(function (r, i) {
      const x = results[i];
      if (!x) { if (!LIMIT) out.push(r.concat(["", "", "", "", "", "", ""])); return; }
      out.push(r.concat([x.status, x.msg, x.zip, x.fillZip, x.fillAddr, x.candZips, x.zipAddr]));
    });
    return out;
  }
  function stamp() { const d = new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function saveXLSX() {
    const rows = outputRows();
    const ws = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (v) { return v == null ? "" : String(v); }); }));
    ws["!cols"] = rows[0].map(function (_, i) { return { wch: i >= rows[0].length - ADD.length ? 22 : 14 }; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "点検結果");
    XLSX.writeFile(wb, "住所録の点検結果_" + stamp() + ".xlsx");
  }
  function saveCSV() {
    const rows = outputRows();
    const csv = "﻿" + rows.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "住所録の点検結果_" + stamp() + ".csv"; a.click();
  }

  // ---------- 見本 ----------
  const SAMPLE = "氏名,郵便番号,住所,建物名\n" +
    "見本 一郎,100-0013,東京都千代田区霞が関1-2-1,\n" +
    "見本 二郎,600001,北海道札幌市中央区北1条西2丁目,〇〇ビル3階\n" +
    "見本 三子,105-0023,東京都港区芝浦3-1-1,\n" +
    "見本 四郎,,大阪府大阪市北区梅田1-1-3,\n" +
    "見本 五子,530-0001,東京都港区芝浦1-1,\n" +
    "見本 六郎,999-9999,愛知県名古屋市中区栄3-1-1,\n" +
    "見本 七子,812-0011,,\n" +
    "見本 八郎,,京都市中京区河原町通三条上る恵比須町,\n" +
    "見本 九子,,府中市宮町1-1,\n" +
    "見本 十郎,,北海道余市町黒川町1,\n";

  function updateButtons() { $("#run").disabled = !(D && table); }

  window.addEventListener("DOMContentLoaded", function () {
    loadData();
    $("#file").addEventListener("change", function (e) { if (e.target.files[0]) readFile(e.target.files[0]); });
    $("#pasteGo").addEventListener("click", function () { const t = $("#paste").value; if (t.trim()) setTable(parseCSV(t), "貼り付けた表"); });
    $("#sample").addEventListener("click", function () { $("#paste").value = SAMPLE; setTable(parseCSV(SAMPLE), "見本（架空の名前）"); });
    $("#hasHeader").addEventListener("change", function () { if (table) { guessColumnsKeep(); } });
    $("#run").addEventListener("click", run);
    $("#saveX").addEventListener("click", saveXLSX);
    $("#saveC").addEventListener("click", saveCSV);
    const drop = $("#drop");
    ["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
  });
  function guessColumnsKeep() { const c = chosen(); renderColumnPickers(c.zip, c.addr); }
})();
