/* 月謝の請求額の一覧 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";

  // ---------- 読み込み ----------
  function decodeBytes(buf) {
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) u = u.subarray(3);
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(u), enc: "UTF-8" }; }
    catch (e) { return { text: new TextDecoder("shift_jis").decode(u), enc: "Shift_JIS" }; }
  }
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var first = text.split(/\r?\n/)[0] || "";
    var delim = (first.split("\t").length > first.split(",").length) ? "\t" : ",";
    var rows = [], row = [], f = "", q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"' && f === "") q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
  }
  function norm(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    return s.replace(/\s+/g, " ").trim();
  }
  // コース名・家族の突き合わせ用（空白・記号のゆれをそろえる）
  function key(s) { return norm(s).toLowerCase().replace(/[\s・･\-ー－_／\/()（）「」【】]/g, ""); }

  // ---------- 金額・回数・日付 ----------
  function parseAmount(v) {
    var s = norm(v).replace(/[¥￥,，、\s]/g, "").replace(/円$/, "").replace(/^\\/, "");
    var mm;
    if (s === "") return null;
    if (/^[-−]?\d+(\.\d+)?$/.test(s)) return parseFloat(s.replace("−", "-"));
    if ((mm = s.match(/^(\d+(?:\.\d+)?)千$/))) return Math.round(parseFloat(mm[1]) * 1000);
    if ((mm = s.match(/^(\d+(?:\.\d+)?)万(?:(\d+)千)?$/))) return Math.round(parseFloat(mm[1]) * 10000 + (mm[2] ? +mm[2] * 1000 : 0));
    return NaN;
  }
  var REST = /^(休|休会|休み|お休み|なし|無|－|-|―|ー|×|欠)$/;
  // 戻り値：{n} 数 / {rest:true} 休会 / null 空欄 / {bad:true}
  function parseCount(v) {
    var s = norm(v);
    if (s === "") return null;
    if (REST.test(s)) return { n: 0, rest: true };
    var mm = s.match(/^(\d+)\s*(回|コマ|レッスン)?$/);
    if (mm) return { n: +mm[1] };
    return { bad: true };
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.y + "-" + pad(d.m) + "-" + pad(d.d); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  // 日付を {y,m,d} で。年のない「12/5」は year を使う
  function parseDate(v, year) {
    var s = norm(v), mm, y, m, d;
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var x = parseFloat(s);
      if (x > 20000 && x < 120000) { var t = new Date((Math.floor(x) - 25569) * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
      return { bad: true };
    }
    s = s.replace(/[（(][^）)]*[）)]/g, "").replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?$/, "").replace(/(から|より|入会|退会)$/, "").trim();
    if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(?:令和|R)\s*(元|\d{1,2})\s*[年.\/-]\s*(\d{1,2})\s*[月.\/-]\s*(\d{1,2})\s*日?$/i))) { y = 2018 + (mm[1] === "元" ? 1 : +mm[1]); m = +mm[2]; d = +mm[3]; }
    else if ((mm = s.match(/^(\d{1,2})\s*[\/.月-]\s*(\d{1,2})\s*日?$/))) { y = year; m = +mm[1]; d = +mm[2]; }
    else if ((mm = s.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*月?$/))) { y = +mm[1]; m = +mm[2]; d = 1; }
    else return { bad: true };
    if (!y || m < 1 || m > 12 || d < 1 || d > dim(y, m)) return { bad: true };
    return { y: y, m: m, d: d };
  }
  function ymk(d) { return d.y * 12 + d.m - 1; }

  // ---------- 料金表 ----------
  // 1行に1つ：「コース, 月額」「コース, 4回, 8000」「コース, 1回あたり, 2500」
  function parseFees(text) {
    var C = {}, order = [], errs = [];
    String(text || "").split(/\r?\n/).forEach(function (line, i) {
      var raw = line;
      line = norm(line);
      if (!line || /^#/.test(line)) return;
      var f = raw.indexOf("\t") >= 0 ? raw.split("\t") : line.indexOf(",") >= 0 ? line.split(",") : null;
      if (f && raw.indexOf("\t") < 0) { // 「8,000」のカンマを戻す
        for (var j = f.length - 1; j > 0; j--) if (/^\s*\d{3}\s*円?\s*$/.test(f[j]) && /[¥￥]?\d{1,3}\s*$/.test(f[j - 1]) && j === f.length - 1 && f.length > 2) { f[j - 1] = f[j - 1] + f[j]; f.splice(j, 1); }
      }
      if (!f) {
        var mm = line.match(/^(.+?)\s+((?:\d+\s*回(?:あたり)?|1回につき|回あたり|単価)\s+)?([¥￥]?[\d,]+(?:円)?)$/);
        if (!mm) { if (/\d/.test(line)) errs.push({ line: i + 1, text: raw, why: "コース名と金額を「,」で区切ってください" }); return; }
        f = [mm[1], (mm[2] || "").trim(), mm[3]].filter(function (x, j) { return j !== 1 || x; });
      }
      f = f.map(norm).filter(function (x, j, a) { return x !== "" || j === 0; });
      if (f.length < 2) { errs.push({ line: i + 1, text: raw, why: "金額がありません" }); return; }
      var name = f[0], amt = parseAmount(f[f.length - 1]);
      if (amt == null || isNaN(amt)) {
        if (i === 0 || !/\d/.test(f.slice(1).join(""))) return; // 見出しの行
        errs.push({ line: i + 1, text: raw, why: "金額「" + f[f.length - 1] + "」を読めません" }); return;
      }
      var k = key(name);
      if (!k) { errs.push({ line: i + 1, text: raw, why: "コース名がありません" }); return; }
      var e = C[k] || { name: name, monthly: null, per: null, byCount: {} };
      function add() { if (!C[k]) { C[k] = e; order.push(k); } }
      if (f.length === 2) { if (e.monthly != null) errs.push({ line: i + 1, text: raw, why: "「" + name + "」の月額が2回書かれています（後の行を使います）" }); e.monthly = amt; add(); return; }
      var mid = f[1].replace(/\s/g, "");
      if (/^(1?回あたり|1回につき|単価|@|1コマ|1レッスン)$/.test(mid)) { e.per = amt; add(); return; }
      var cm = mid.match(/^(\d+)(回|コマ|レッスン)?$/);
      if (cm) { e.byCount[+cm[1]] = amt; add(); return; }
      if (/^(月額|月謝|毎月)$/.test(mid)) { e.monthly = amt; add(); return; }
      errs.push({ line: i + 1, text: raw, why: "「" + f[1] + "」は回数として読めません（4回・1回あたり・月額 のどれかにしてください）" });
    });
    return { C: C, order: order, errs: errs };
  }

  // ---------- 列の推定 ----------
  var PAT = {
    name: /^(氏名|名前|生徒|生徒名|児童|会員|会員名|お名前|受講者|受講生|子ども|子供)(の?名前|名|氏名)?$/,
    course: /(コース|クラス|講座|科目|種目|プラン|レッスン|教科|楽器)/,
    count: /(回数|受講回数|レッスン回数|今月の回数|コマ数|回)$/,
    family: /(家族|世帯|兄弟|きょうだい|姉妹|保護者|家庭|親|ファミリー)/,
    join: /(入会|入塾|入校|開始日|受講開始)/,
    leave: /(退会|退塾|退校|終了日|受講終了)/,
    group: /^(組|班|学年|曜日|教室|校舎|担当|講師|クラス分け|時間帯)$/,
    amount: /^(月謝|月額|金額|料金|受講料)$/,
    discount: /(割引|値引|減額)/,
    extra: /(教材|設備|施設|維持|管理費|発表会|行事|検定|諸費|その他|費$|代$)/
  };
  function guessCols(headers, rows) {
    var g = { extras: [] }, used = {};
    function pick(k, test) {
      for (var i = 0; i < headers.length; i++) { if (used[i]) continue; if (test(norm(headers[i]), i)) { g[k] = i; used[i] = 1; return; } }
    }
    pick("name", function (h) { return PAT.name.test(h); });
    pick("family", function (h) { return PAT.family.test(h); });
    pick("join", function (h) { return PAT.join.test(h); });
    pick("leave", function (h) { return PAT.leave.test(h); });
    pick("discount", function (h) { return PAT.discount.test(h); });
    pick("count", function (h) { return PAT.count.test(h); });
    pick("amount", function (h) { return PAT.amount.test(h); });
    pick("course", function (h) { return PAT.course.test(h); });
    pick("group", function (h) { return PAT.group.test(h); });
    if (g.name == null) pick("name", function (h) { return /名/.test(h) && !/コース|クラス/.test(h); });
    if (g.name == null) pick("name", function () { return true; });
    headers.forEach(function (h, i) {
      if (used[i] || !PAT.extra.test(norm(h))) return;
      var nums = rows.filter(function (r) { var a = parseAmount(r[i]); return a != null && !isNaN(a); }).length;
      var filled = rows.filter(function (r) { return norm(r[i]) !== ""; }).length;
      if (filled && nums >= filled * 0.8) { g.extras.push(i); used[i] = 1; }
    });
    return g;
  }

  // ---------- 計算 ----------
  function roundBy(x, unit, mode) {
    unit = unit || 1;
    var f = mode === "ceil" ? Math.ceil : mode === "round" ? Math.round : Math.floor;
    return f(Math.round(x * 1000) / 1000 / unit) * unit;
  }
  // o = { cols, bill:{y,m}, fees:parseFees(), sib:{mode,amount,from,target}, join:{mode,halfDay,nextDay,fee}, round:{unit,mode}, rowBase, limit, splitCourse }
  function run(headers, rows, o) {
    var c = o.cols, F = o.fees || { C: {} }, bill = o.bill, bmk = bill.y * 12 + bill.m - 1, nDays = dim(bill.y, bill.m);
    var rnd = o.round || { unit: 1, mode: "floor" }, J = o.join || { mode: "full" }, SB = o.sib || { mode: "none" };
    var per = [], byName = {}, checks = [], excluded = [], lines = [], cut = 0, limit = o.limit || Infinity;
    function chk(row, name, why, lv) { checks.push({ row: row, name: name, why: why, lv: lv || "w" }); }
    rows.forEach(function (r, ri) {
      var rowNo = ri + (o.rowBase || 2);
      var name = norm(r[c.name]);
      if (!name) return;
      if (/^(合計|小計|計|総計)$/.test(name)) return;
      var nk = key(name), P = byName[nk];
      if (!P) {
        if (per.length >= limit) { cut++; byName[nk] = { cut: true }; return; }
        P = byName[nk] = { name: name, row: rowNo, group: c.group != null ? norm(r[c.group]) : "", family: "", lines: [], extras: [], extraSum: 0, disc: 0, tuition: 0, base: 0, prorate: 0, sib: 0, enroll: 0, total: 0, notes: [], status: "", join: null, leave: null };
        per.push(P);
      }
      if (P.cut) return;
      if (c.family != null) { var fv = norm(r[c.family]); if (fv) { if (P.family && key(P.family) !== key(fv)) chk(rowNo, name, "家族の欄が行によって違います（「" + P.family + "」を使います）"); else P.family = fv; } }
      if (c.group != null && !P.group) P.group = norm(r[c.group]);
      // 入会・退会
      [["join", "入会日"], ["leave", "退会日"]].forEach(function (jk) {
        if (c[jk[0]] == null) return;
        var v = norm(r[c[jk[0]]]); if (!v) return;
        var d = parseDate(v, bill.y);
        if (d && d.bad) { chk(rowNo, name, jk[1] + "「" + v + "」を日付として読めません（使っていません）"); return; }
        if (!P[jk[0]]) P[jk[0]] = d;
      });
      // コースと月謝
      var courses = [];
      var cv = c.course != null ? norm(r[c.course]) : "";
      if (cv && o.splitCourse) courses = cv.split(/\s*[、，,＋+&＆]\s*/).filter(Boolean); else courses = [cv];
      var cnt = c.count != null ? parseCount(r[c.count]) : null;
      if (cnt && cnt.bad) { chk(rowNo, name, "回数「" + norm(r[c.count]) + "」を読めません"); cnt = null; }
      var amtV = c.amount != null ? norm(r[c.amount]) : "", amtOver = amtV === "" ? null : parseAmount(amtV);
      if (amtOver != null && isNaN(amtOver)) { chk(rowNo, name, "月謝の列「" + amtV + "」を金額として読めません"); amtOver = null; }
      courses.forEach(function (cn, ci) {
        var L = { name: name, row: rowNo, course: cn, count: cnt && !cnt.rest ? cnt.n : (cnt && cnt.rest ? 0 : null), rest: !!(cnt && cnt.rest), fee: 0, how: "", bad: false };
        if (L.rest) { L.how = "休み"; }
        else if (amtOver != null && ci === 0) { L.fee = amtOver; L.how = "表の金額"; }
        else if (amtOver != null) { L.fee = 0; L.how = "表の金額（1つ目のコースに含む）"; }
        else {
          var E = F.C[key(cn)];
          if (!cn) { L.bad = true; L.how = "コースが空欄"; chk(rowNo, name, "コースが空欄で、月謝の金額の列もありません", "e"); }
          else if (!E) { L.bad = true; L.how = "料金表にない"; chk(rowNo, name, "コース「" + cn + "」が料金表にありません（0円にしています）", "e"); }
          else if (L.count != null) {
            var bc = Object.keys(E.byCount);
            if (L.count === 0) { L.fee = 0; L.how = "0回"; }
            else if (E.byCount[L.count] != null) { L.fee = E.byCount[L.count]; L.how = L.count + "回の料金"; }
            else if (E.per != null) { L.fee = E.per * L.count; L.how = L.count + "回×" + E.per; }
            else if (bc.length === 1 && bc[0] === "1") { L.fee = E.byCount[1] * L.count; L.how = L.count + "回×" + E.byCount[1]; }
            else if (E.monthly != null && !bc.length) { L.fee = E.monthly; L.how = "月額"; }
            else if (E.monthly != null) { L.fee = E.monthly; L.how = "月額（" + L.count + "回の料金がないため）"; chk(rowNo, name, "「" + cn + "」の " + L.count + " 回の料金が料金表にないため、月額を使いました"); }
            else { L.bad = true; L.how = L.count + "回の料金がない"; chk(rowNo, name, "「" + cn + "」の " + L.count + " 回の料金が料金表にありません（0円にしています）", "e"); }
          } else {
            if (E.monthly != null) { L.fee = E.monthly; L.how = "月額"; }
            else { L.bad = true; L.how = "回数がない"; chk(rowNo, name, "「" + cn + "」は回数ごとの料金ですが、回数が空欄です（0円にしています）", "e"); }
          }
        }
        P.lines.push(L);
      });
      // 追加の費用・割引
      (c.extras || []).forEach(function (ei) {
        var v = norm(r[ei]); if (!v) return;
        var a = parseAmount(v);
        if (a == null || isNaN(a)) { chk(rowNo, name, "「" + headers[ei] + "」の「" + v + "」を金額として読めません（足していません）"); return; }
        if (a) { P.extras.push({ label: norm(headers[ei]), amount: a }); P.extraSum += a; }
      });
      if (c.discount != null) {
        var dv = norm(r[c.discount]);
        if (dv) {
          var da = parseAmount(dv);
          if (da == null || isNaN(da)) chk(rowNo, name, "割引「" + dv + "」を金額として読めません（引いていません）");
          else P.disc += Math.abs(da);
        }
      }
    });
    // 同じ人・同じコース
    per.forEach(function (P) {
      var seen = {};
      P.lines.forEach(function (L) { var k = key(L.course); if (k && seen[k]) chk(L.row, P.name, "同じ人・同じコース「" + L.course + "」の行が2つあります（両方を足しています）"); seen[k] = 1; });
    });
    // 在籍・日割り
    var act = [];
    per.forEach(function (P) {
      P.base = P.lines.reduce(function (a, L) { return a + L.fee; }, 0);
      if (P.join && ymk(P.join) > bmk) { P.status = "入会前"; excluded.push(P); return; }
      if (P.leave && ymk(P.leave) < bmk) { P.status = "退会"; excluded.push(P); return; }
      if (P.leave && P.join && ymk(P.leave) === bmk && ymk(P.join) === bmk && P.leave.d < P.join.d) chk(P.row, P.name, "退会日が入会日より前です");
      if (P.leave && ymk(P.leave) === bmk) P.notes.push("今月" + P.leave.d + "日退会");
      var newJoin = P.join && ymk(P.join) === bmk;
      P.tuition = P.base;
      if (newJoin) {
        P.notes.push("今月" + P.join.d + "日入会");
        var d = P.join.d, ratio = 1, lab = "";
        if (J.mode === "days") { ratio = (nDays - d + 1) / nDays; lab = "日割り " + (nDays - d + 1) + "/" + nDays + "日"; }
        else if (J.mode === "half") { if (d >= (J.halfDay || 16)) { ratio = 0.5; lab = (J.halfDay || 16) + "日以降の入会で半額"; } }
        else if (J.mode === "next") { if (d >= (J.nextDay || 21)) { ratio = 0; lab = (J.nextDay || 21) + "日以降の入会で翌月から"; } }
        if (ratio !== 1 && P.base) {
          var nt = roundBy(P.base * ratio, rnd.unit, rnd.mode);
          P.prorate = nt - P.base; P.tuition = nt; P.notes.push(lab);
        }
        if (J.fee) { P.enroll = J.fee; }
      }
      if (P.lines.every(function (L) { return L.rest; })) P.status = "休み";
      act.push(P);
    });
    // 家族の割引
    var fam = {}, famList = [];
    act.forEach(function (P) {
      var fk = P.family ? key(P.family) : "";
      if (!fk) return;
      if (!fam[fk]) { fam[fk] = { name: P.family, members: [] }; famList.push(fam[fk]); }
      fam[fk].members.push(P);
    });
    if (SB.mode === "yen" || SB.mode === "pct") {
      famList.forEach(function (G) {
        var ms = G.members.filter(function (P) { return P.tuition > 0; });
        if (SB.target === "cheaper") ms = ms.slice().sort(function (a, b) { return b.tuition - a.tuition || a.row - b.row; });
        ms.forEach(function (P, i) {
          if (i + 1 < (SB.from || 2)) return;
          var a = SB.mode === "yen" ? Math.min(SB.amount || 0, P.tuition) : roundBy(P.tuition * (SB.amount || 0) / 100, rnd.unit, rnd.mode);
          if (a > 0) { P.sib = -a; P.notes.push("家族の" + (i + 1) + "人目の割引"); }
        });
      });
    }
    var total = { people: act.length, base: 0, prorate: 0, sib: 0, extra: 0, disc: 0, enroll: 0, total: 0 };
    act.forEach(function (P) {
      P.total = P.tuition + P.sib + P.extraSum - P.disc + P.enroll;
      if (P.total < 0) chk(P.row, P.name, "請求額がマイナス（" + P.total + "円）です。割引を確かめてください", "e");
      total.base += P.base; total.prorate += P.prorate; total.sib += P.sib; total.extra += P.extraSum; total.disc -= P.disc; total.enroll += P.enroll; total.total += P.total;
      P.lines.forEach(function (L) { lines.push(L); });
    });
    // コースごと
    var byCourse = {}, courseList = [];
    act.forEach(function (P) {
      P.lines.forEach(function (L) {
        var k = key(L.course) || "（空欄）";
        if (!byCourse[k]) { byCourse[k] = { name: L.course || "（空欄）", n: 0, rest: 0, count: 0, fee: 0 }; courseList.push(byCourse[k]); }
        var B = byCourse[k];
        if (L.rest) B.rest++; else { B.n++; B.count += L.count || 0; B.fee += L.fee; }
      });
    });
    // 組ごと
    var groups = [], gm = {};
    act.forEach(function (P) {
      var g = P.group || "";
      if (!gm[g]) { gm[g] = { name: g, n: 0, total: 0 }; groups.push(gm[g]); }
      gm[g].n++; gm[g].total += P.total;
    });
    // 家族ごとの合計（2人以上）
    var families = famList.map(function (G) { return { name: G.name, members: G.members, total: G.members.reduce(function (a, P) { return a + P.total; }, 0) }; });
    return { per: act, all: per, excluded: excluded, lines: lines, checks: checks, total: total, byCourse: courseList, groups: groups, families: families, cut: cut, bill: bill };
  }

  function yen(n) { n = Math.round(n || 0); return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "円"; }
  function toCSV(rows) {
    return "﻿" + rows.map(function (r) {
      return r.map(function (v) { v = String(v == null ? "" : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    }).join("\r\n") + "\r\n";
  }
  var G = { decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, key: key, parseAmount: parseAmount, parseCount: parseCount, parseDate: parseDate, iso: iso, dim: dim,
    parseFees: parseFees, guessCols: guessCols, roundBy: roundBy, run: run, yen: yen, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = G; else root.GESSHA = G;
})(this);
