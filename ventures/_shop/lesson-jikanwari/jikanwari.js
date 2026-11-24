/* レッスンの時間割表と空き枠 — 計算部分。ブラウザ内だけで動き、外部へ送信しない */
(function (root) {
  "use strict";
  var WD = "日月火水木金土";
  var ORDER = [1, 2, 3, 4, 5, 6, 0]; // 表の曜日の並び（月〜日）

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
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === "") q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
  }
  function norm(s) { s = String(s == null ? "" : s); if (s.normalize) s = s.normalize("NFKC"); return s.replace(/\s+/g, " ").trim(); }
  function key(s) { return norm(s).toLowerCase().replace(/[\s・･\-ー－_／\/()（）「」【】]/g, ""); }
  function hm(x) { if (x == null) return ""; return Math.floor(x / 60) + ":" + (x % 60 < 10 ? "0" : "") + (x % 60); }
  function span(a) { return hm(a.s) + "〜" + hm(a.e); }

  // ---------- 時刻 ----------
  // 「16:00」「16時」「16時半」「16時30分」「1600」は読まない（あいまいなため）
  var TIME = "(\\d{1,2})\\s*(?:[:：]\\s*(\\d{2})|時\\s*(?:(\\d{1,2})\\s*分|(半))?)";
  var SEP = "\\s*(?:[~〜～\\-－–]|から)\\s*";
  function tv(m, o) { var h = +m[o], mi = m[o + 1] != null ? +m[o + 1] : m[o + 2] != null ? +m[o + 2] : m[o + 3] ? 30 : 0; return h > 24 || mi > 59 || h * 60 + mi > 1440 ? NaN : h * 60 + mi; }
  // 長さ：「45」「45分」「1時間」「1時間30分」「1.5時間」「1:00」
  function parseLen(v) {
    var s = norm(v).replace(/\s/g, "");
    if (!s) return null;
    var m;
    if ((m = s.match(/^(\d+)$/))) return +m[1] > 0 && +m[1] <= 600 ? +m[1] : NaN;
    if ((m = s.match(/^(\d+)分$/))) return +m[1] > 0 && +m[1] <= 600 ? +m[1] : NaN;
    if ((m = s.match(/^(\d+(?:\.\d+)?)時間(?:(\d+)分|半)?$/))) return Math.round(+m[1] * 60) + (m[2] ? +m[2] : /半$/.test(s) ? 30 : 0);
    if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) return +m[1] * 60 + +m[2];
    return NaN;
  }
  // 時刻の欄：「16:00」「16:00〜16:45」「16時半から17時」「16:00 45分」
  function parseTimeCell(v) {
    var s = norm(v);
    if (!s) return null;
    var m = s.match(new RegExp("^" + TIME + "(?:" + SEP + TIME + ")?(?:\\s*[(（]?\\s*(\\d+)\\s*分\\s*[)）]?)?$"));
    if (!m) return { bad: true };
    var a = tv(m, 1), b = m[5] != null ? tv(m, 5) : null;
    if (isNaN(a) || (b != null && isNaN(b))) return { bad: true };
    if (b != null && b <= a) return { bad: true, why: "終わりの時刻が始まりより前です" };
    return { s: a, e: b, len: m[9] != null ? +m[9] : null };
  }

  // ---------- 曜日 ----------
  // 「月」「月曜」「月曜日」「(月)」「月・木」「月木」「月〜金」「平日」「毎日」
  function wdList(t) {
    var s = norm(t).replace(/曜日|曜/g, "").replace(/[()（）]/g, "");
    var out = [];
    function add(w) { if (out.indexOf(w) < 0) out.push(w); }
    s = s.replace(/平日/g, function () { [1, 2, 3, 4, 5].forEach(add); return " "; }).replace(/毎日/g, function () { [1, 2, 3, 4, 5, 6, 0].forEach(add); return " "; });
    s = s.replace(/([日月火水木金土])\s*[~〜～\-－]\s*([日月火水木金土])/g, function (_, a, b) {
      var i = ORDER.indexOf(WD.indexOf(a)), j = ORDER.indexOf(WD.indexOf(b));
      if (j < i) j += 7;
      for (var k = i; k <= j; k++) add(ORDER[k % 7]);
      return " ";
    });
    s.replace(/[日月火水木金土]/g, function (w) { add(WD.indexOf(w)); return ""; });
    var left = s.replace(/[日月火水木金土・,、\/\s&＆]/g, "");
    return { days: out, left: left };
  }
  // 曜日と時刻が1つのマスにあるとき：「月16:00」「月・木 16:00〜16:45」「月16:00、木17:30」
  function parseSlotCell(v) {
    var s = norm(v);
    if (!s) return { items: [], empty: true };
    var re = new RegExp("((?:[日月火水木金土平毎][日曜]*\\s*[・,、\\/〜~～\\-－&＆]?\\s*)+)\\s*[(（]?\\s*(?:(" + TIME + "(?:" + SEP + TIME + ")?)\\s*(?:[(（]?\\s*(\\d+)\\s*分\\s*[)）]?)?)?\\s*[)）]?", "g");
    var items = [], m, pend = [], found = false;
    s = s.replace(/曜日|曜/g, "");
    while ((m = re.exec(s))) {
      var W = wdList(m[1]);
      if (!W.days.length) continue;
      found = true;
      if (m[2]) {
        var t = parseTimeCell(m[2] + (m[11] ? " " + m[11] + "分" : ""));
        if (!t || t.bad) return { items: [], bad: true, why: (t && t.why) || "時刻が読めません" };
        pend.concat(W.days).forEach(function (w) { items.push({ w: w, s: t.s, e: t.e, len: t.len }); });
        pend = [];
      } else pend = pend.concat(W.days);
    }
    pend.forEach(function (w) { items.push({ w: w, s: null, e: null, len: null }); });
    if (!found) return { items: [], bad: true, why: "曜日が読めません" };
    return { items: items };
  }

  // ---------- 教室の時間 ----------
  // 1行に「曜日 時刻〜時刻 [時刻〜時刻]」または「講師名 曜日 時刻〜時刻」。「休み」でその曜日を閉じる
  function parseHours(text) {
    var base = {}, who = {}, whoName = {}, bad = [], any = false;
    String(text || "").split(/\r?\n/).forEach(function (raw, li) {
      var s = norm(raw.replace(/\t/g, " ")).replace(/^[・\-*]\s*/, "");
      if (!s || /^#/.test(s)) return;
      var mT = s.match(new RegExp(TIME)), mClose = s.match(/休み|休講|定休|なし|閉/);
      var cut = Math.min(mT ? mT.index : s.length, mClose ? mClose.index : s.length);
      var head = s.slice(0, cut).trim().replace(/[:：,、]\s*$/, ""), tail = s.slice(cut);
      // 先頭が曜日でなければ、講師（または部屋）の名前
      var nm = "", mW = head.match(/(?:^|\s)((?:平日|毎日|[日月火水木金土])(?:曜日?|[日月火水木金土・,、\/〜~～\-－\s]|平日|毎日)*)$/);
      if (!mW) { bad.push({ line: li + 1, text: raw, why: "曜日が読めません（「月〜金 15:00〜21:00」のように書いてください）" }); return; }
      nm = head.slice(0, mW.index).trim().replace(/[:：]$/, "");
      var W = wdList(mW[1]);
      if (!W.days.length) { bad.push({ line: li + 1, text: raw, why: "曜日が読めません" }); return; }
      var ranges = [];
      if (!mClose || (mT && mT.index < mClose.index)) {
        var reR = new RegExp(TIME + SEP + TIME, "g"), r;
        while ((r = reR.exec(tail))) {
          var a = tv(r, 1), b = tv(r, 5);
          if (isNaN(a) || isNaN(b) || b <= a) { bad.push({ line: li + 1, text: raw, why: "時刻が読めません（「15:00〜21:00」のように始まりと終わりを書いてください）" }); return; }
          ranges.push({ s: a, e: b });
        }
        if (!ranges.length) { bad.push({ line: li + 1, text: raw, why: "時刻が読めません（「15:00〜21:00」のように始まりと終わりを書いてください）" }); return; }
      }
      ranges = merge(ranges);
      var dst = base;
      if (nm) { var k = key(nm); dst = who[k] || (who[k] = {}); whoName[k] = nm; }
      W.days.forEach(function (w) { dst[w] = ranges; });
      any = true;
    });
    return { base: base, who: who, whoName: whoName, bad: bad, any: any };
  }
  function merge(list) {
    var a = list.slice().sort(function (x, y) { return x.s - y.s; }), out = [];
    a.forEach(function (r) { var l = out[out.length - 1]; if (l && r.s <= l.e) l.e = Math.max(l.e, r.e); else out.push({ s: r.s, e: r.e }); });
    return out;
  }

  // ---------- 列の推定 ----------
  var PAT = {
    name: /^(名前|氏名|生徒名?|生徒氏名|会員名?|お名前|受講者名?|児童名?|名)$/,
    grade: /(学年|年齢|組|クラス名)/,
    wd: /(曜日|曜|レッスン日|受講日|通う日|日時|枠)/,
    time: /(時刻|開始|時間帯|始まり|開始時刻)$/,
    end: /(終了|終わり|終了時刻)/,
    len: /(長さ|分数|レッスン時間|所要|(^|[^時])分$)/,
    teacher: /(講師|先生|担当|指導者|コーチ|トレーナー)/,
    room: /(部屋|教室|場所|レッスン室|ブース|コート|レーン)/,
    course: /(コース|科目|クラス|教科|種目|楽器|レベル)/
  };
  function guessCols(headers, rows) {
    var g = { name: null, grade: null, wd: null, time: null, end: null, len: null, teacher: null, room: null, course: null }, used = {};
    function pick(k, test) { for (var i = 0; i < headers.length; i++) { if (used[i]) continue; if (test(norm(headers[i]), i)) { g[k] = i; used[i] = 1; return; } } }
    pick("name", function (h) { return PAT.name.test(h); });
    pick("end", function (h) { return PAT.end.test(h); });
    pick("len", function (h) { return PAT.len.test(h) && !/時刻|開始/.test(h); });
    pick("wd", function (h) { return PAT.wd.test(h); });
    pick("time", function (h) { return PAT.time.test(h); });
    pick("teacher", function (h) { return PAT.teacher.test(h); });
    pick("room", function (h) { return PAT.room.test(h); });
    pick("course", function (h) { return PAT.course.test(h); });
    pick("grade", function (h) { return PAT.grade.test(h); });
    // 見出しが「時間」だけの列は、中身で時刻か長さかを決める
    pick("time", function (h, i) { if (h !== "時間" || g.time != null) return false; var f = rows.filter(function (r) { return norm(r[i]) !== ""; }); return f.length && f.filter(function (r) { var t = parseTimeCell(r[i]); return t && !t.bad; }).length >= f.length * 0.8; });
    if (g.len == null) pick("len", function (h) { return h === "時間"; });
    if (g.name == null) pick("name", function (h) { return /名/.test(h) && !/コース|クラス|講師|先生/.test(h); });
    if (g.wd == null) pick("wd", function (h, i) {
      var f = rows.filter(function (r) { return norm(r[i]) !== ""; });
      return f.length && f.filter(function (r) { return !parseSlotCell(r[i]).bad; }).length >= f.length * 0.8 && f.every(function (r) { return norm(r[i]).length <= 30; });
    });
    if (g.time == null) pick("time", function (h, i) {
      var f = rows.filter(function (r) { return norm(r[i]) !== ""; });
      return f.length && f.filter(function (r) { var t = parseTimeCell(r[i]); return t && !t.bad; }).length >= f.length * 0.8;
    });
    if (g.name == null) pick("name", function () { return true; });
    return g;
  }

  // ---------- 計算 ----------
  // o: { cols, hours (text), unit: "teacher"|"room"|"all", cap, step, lenDefault, minFree, limit, rowBase }
  function run(headers, rows, o) {
    var C = o.cols, cap = Math.max(1, +o.cap || 1), lenDef = +o.lenDefault || 30, minFree = +o.minFree || lenDef;
    var unit = o.unit || "teacher";
    if (unit === "teacher" && C.teacher == null) unit = C.room != null ? "room" : "all";
    if (unit === "room" && C.room == null) unit = C.teacher != null ? "teacher" : "all";
    var H = parseHours(o.hours), rowBase = o.rowBase || 2;
    var lessons = [], checks = [], students = [], byStu = {}, cut = 0;
    function cell(r, i) { return i == null ? "" : norm(r[i]); }
    rows.forEach(function (r, ri) {
      var row = ri + rowBase, name = cell(r, C.name);
      if (!name) { if (r.some(function (v) { return norm(v) !== ""; })) checks.push({ row: row, name: "", lv: "w", why: "名前が空欄の行を飛ばしました" }); return; }
      if (/^(合計|計|小計|total)$/i.test(name)) return;
      var grade = cell(r, C.grade), sk = key(name) + "|" + key(grade);
      var st = byStu[sk];
      if (!st) {
        if (students.length >= (o.limit || Infinity)) { cut++; byStu[sk] = { skip: true }; return; }
        st = byStu[sk] = { name: name, grade: grade, rows: [], lessons: [] };
        students.push(st);
      }
      if (st.skip) return;
      st.rows.push(row);
      var P = parseSlotCell(cell(r, C.wd));
      if (P.empty) { checks.push({ row: row, name: name, lv: "e", why: "曜日が空欄です" }); return; }
      if (P.bad) { checks.push({ row: row, name: name, lv: "e", why: P.why + "（「" + cell(r, C.wd) + "」）" }); return; }
      var T = C.time != null && C.time !== C.wd ? parseTimeCell(cell(r, C.time)) : null;
      if (T && T.bad) { checks.push({ row: row, name: name, lv: "e", why: (T.why || "時刻が読めません") + "（「" + cell(r, C.time) + "」）" }); return; }
      var E = C.end != null ? parseTimeCell(cell(r, C.end)) : null;
      if (E && E.bad) { checks.push({ row: row, name: name, lv: "e", why: "終わりの時刻が読めません（「" + cell(r, C.end) + "」）" }); return; }
      var Ln = C.len != null ? parseLen(cell(r, C.len)) : null;
      if (Ln !== null && isNaN(Ln)) { checks.push({ row: row, name: name, lv: "w", why: "長さが読めません（「" + cell(r, C.len) + "」）。" + lenDef + " 分にしました" }); Ln = null; }
      var teacher = cell(r, C.teacher), room = cell(r, C.room), course = cell(r, C.course);
      P.items.forEach(function (it) {
        var s = it.s, e = it.e, len = it.len;
        if (s == null && T) { s = T.s; e = T.e; len = T.len; }
        if (s == null) { checks.push({ row: row, name: name, lv: "e", why: WD[it.w] + "曜の時刻がありません" }); return; }
        if (e == null && E) e = E.s;
        var how = "";
        if (e == null) { var l = len || Ln; if (l) e = s + l; else { e = s + lenDef; how = "長さがないため " + lenDef + " 分にしました"; } }
        if (e <= s) { checks.push({ row: row, name: name, lv: "e", why: "終わりの時刻が始まりより前です" }); return; }
        if (e > 1440) { checks.push({ row: row, name: name, lv: "e", why: "終わりが 24:00 を過ぎます" }); return; }
        var L = { name: name, grade: grade, course: course, teacher: teacher, room: room, w: it.w, s: s, e: e, row: row, st: st, flags: [] };
        L.group = unit === "teacher" ? (teacher || "（講師なし）") : unit === "room" ? (room || "（部屋なし）") : "全体";
        if (how) L.flags.push(how);
        lessons.push(L); st.lessons.push(L);
      });
    });
    function ov(a, b) { return a.w === b.w && a.s < b.e && b.s < a.e; }
    // 同じ生徒の重なり
    var stuClash = [];
    students.forEach(function (st) {
      var a = st.lessons;
      for (var i = 0; i < a.length; i++) for (var j = i + 1; j < a.length; j++) if (ov(a[i], a[j])) {
        var same = a[i].s === a[j].s && a[i].e === a[j].e && a[i].group === a[j].group && a[i].course === a[j].course;
        stuClash.push({ name: st.name, grade: st.grade, a: a[i], b: a[j], same: same });
        a[i].clash = a[j].clash = true;
      }
    });
    // グループ（講師・部屋・全体）ごと
    var groups = [], gmap = {};
    lessons.forEach(function (L) {
      var k = key(L.group), g = gmap[k];
      if (!g) { g = gmap[k] = { name: L.group, key: k, lessons: [], over: [], free: [], outside: [] }; groups.push(g); }
      L.gk = k;
      g.lessons.push(L);
    });
    groups.sort(function (a, b) { return /^（/.test(a.name) - /^（/.test(b.name); });
    function hoursFor(g, w) {
      var hw = H.who[g.key];
      if (hw) return hw[w] !== undefined ? hw[w] : []; // 講師・部屋の行がある曜日だけ（ほかの曜日は休み）
      if (H.base[w] !== undefined) return H.base[w];
      return Object.keys(H.base).length ? [] : null; // 何も書いていなければ null（空き枠を出さない）
    }
    var minS = Infinity, maxE = -Infinity;
    function bump(s, e) { if (s < minS) minS = s; if (e > maxE) maxE = e; }
    groups.forEach(function (g) {
      g.lessons.sort(function (a, b) { return ORDER.indexOf(a.w) - ORDER.indexOf(b.w) || a.s - b.s || a.e - b.e; });
      g.minutes = 0; g.byW = {};
      g.students = {};
      g.lessons.forEach(function (L) { g.minutes += L.e - L.s; g.byW[L.w] = (g.byW[L.w] || 0) + 1; g.students[key(L.name) + "|" + key(L.grade)] = 1; bump(L.s, L.e); });
      g.nStudents = Object.keys(g.students).length;
      g.hours = {};
      ORDER.forEach(function (w) {
        var hs = hoursFor(g, w);
        g.hours[w] = hs;
        if (hs) hs.forEach(function (r) { bump(r.s, r.e); });
        var day = g.lessons.filter(function (L) { return L.w === w; });
        // 時間外
        if (hs) day.forEach(function (L) {
          if (!hs.some(function (r) { return L.s >= r.s && L.e <= r.e; })) { L.outside = true; g.outside.push(L); }
        });
        // 同時の人数（区切りの時刻ごと）
        var pts = [];
        day.forEach(function (L) { pts.push(L.s, L.e); });
        if (hs) hs.forEach(function (r) { pts.push(r.s, r.e); });
        pts = pts.filter(function (x, i) { return pts.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
        var segs = [];
        for (var i = 0; i + 1 < pts.length; i++) {
          var a = pts[i], b = pts[i + 1];
          var on = day.filter(function (L) { return L.s < b && a < L.e; });
          segs.push({ s: a, e: b, n: on.length, on: on });
        }
        // 人数オーバー
        var cur = null;
        segs.forEach(function (sg) {
          if (sg.n > cap) {
            if (cur && cur.e === sg.s) { cur.e = sg.e; cur.n = Math.max(cur.n, sg.n); sg.on.forEach(function (L) { if (cur.on.indexOf(L) < 0) cur.on.push(L); }); }
            else { cur = { w: w, s: sg.s, e: sg.e, n: sg.n, on: sg.on.slice() }; g.over.push(cur); }
            sg.on.forEach(function (L) { L.over = true; });
          } else cur = null;
        });
        // 空き枠：教室の時間のうち、同時の人数が上限に達していない時間
        if (hs) {
          var free = [];
          hs.forEach(function (r) {
            var t = r.s;
            while (t < r.e) {
              var sg = null;
              for (var k = 0; k < segs.length; k++) if (segs[k].s <= t && t < segs[k].e) { sg = segs[k]; break; }
              var end = sg ? Math.min(sg.e, r.e) : r.e, n = sg ? sg.n : 0;
              var room = cap - n;
              if (room > 0) {
                var l = free[free.length - 1];
                if (l && l.e === t && l.room === room) l.e = end; else free.push({ w: w, s: t, e: end, room: room });
              }
              t = end;
            }
          });
          // 同じ空き人数でなくても続いている空きはまとめて長さを測る（人数は少ない方）
          var joined = [];
          free.forEach(function (f) { var l = joined[joined.length - 1]; if (l && l.e === f.s) { l.e = f.e; l.room = Math.min(l.room, f.room); } else joined.push({ w: f.w, s: f.s, e: f.e, room: f.room }); });
          joined.forEach(function (f) { f.len = f.e - f.s; f.fit = Math.floor(f.len / lenDef); if (f.len >= minFree) g.free.push(f); });
        }
      });
      g.freeMin = g.free.reduce(function (a, f) { return a + f.len; }, 0);
      g.hasHours = ORDER.some(function (w) { return g.hours[w] != null; });
    });
    // 同じ部屋・同じ時間に別の講師（講師ごとの表のとき）
    var rooms = [];
    if (unit === "teacher" && C.room != null) {
      for (var i = 0; i < lessons.length; i++) for (var j = i + 1; j < lessons.length; j++) {
        var a = lessons[i], b = lessons[j];
        if (a.room && key(a.room) === key(b.room) && a.gk !== b.gk && ov(a, b)) rooms.push({ room: a.room, a: a, b: b });
      }
    }
    // 名前の書き方の違い（同じ名前で学年が違う、空白の違い）
    var nameKeys = {};
    students.forEach(function (st) { var k = key(st.name); (nameKeys[k] = nameKeys[k] || []).push(st); });
    Object.keys(nameKeys).forEach(function (k) { var a = nameKeys[k]; if (a.length > 1) checks.push({ row: a.map(function (s) { return s.rows[0]; }).join(","), name: a[0].name, lv: "w", why: "同じ名前で学年・組が違う行があります（別の人として数えています）" }); });
    // 書いた講師の時間で、表にいない講師
    var hoursWarn = [];
    Object.keys(H.who).forEach(function (k) { if (!gmap[k]) hoursWarn.push({ name: H.whoName[k], why: unit === "all" ? "表を分けていないため、講師・部屋ごとの時間は使っていません" : "この名前の" + (unit === "room" ? "部屋" : "講師") + "のレッスンがありません（書き方を表と合わせてください）" }); });
    if (!lessons.length) { minS = 9 * 60; maxE = 18 * 60; }
    students.forEach(function (st) { st.lessons.sort(function (a, b) { return ORDER.indexOf(a.w) - ORDER.indexOf(b.w) || a.s - b.s; }); st.minutes = st.lessons.reduce(function (s, L) { return s + L.e - L.s; }, 0); });
    var wdCount = {}; ORDER.forEach(function (w) { wdCount[w] = lessons.filter(function (L) { return L.w === w; }).length; });
    return { lessons: lessons, students: students, groups: groups, unit: unit, cap: cap, lenDef: lenDef, minFree: minFree, stuClash: stuClash, rooms: rooms, checks: checks, hoursBad: H.bad, hoursWarn: hoursWarn, hoursAny: H.any,
      minS: minS === Infinity ? 540 : minS, maxE: maxE === -Infinity ? 1080 : maxE, wdCount: wdCount, cut: cut };
  }

  // 時間割表の1列（曜日）を、重なるレッスンのかたまりに分ける（区切りの刻みに丸める）
  function blocks(list, step, t0) {
    var a = list.slice().sort(function (x, y) { return x.s - y.s || x.e - y.e; }), out = [];
    a.forEach(function (L) {
      var s = t0 + Math.floor((L.s - t0) / step) * step, e = t0 + Math.ceil((L.e - t0) / step) * step;
      if (e <= s) e = s + step;
      var l = out[out.length - 1];
      if (l && s < l.e) { l.e = Math.max(l.e, e); l.items.push(L); } else out.push({ s: s, e: e, items: [L] });
    });
    return out;
  }

  function toCSV(rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n") + "\r\n";
  }

  var K = { WD: WD, ORDER: ORDER, decodeBytes: decodeBytes, parseCSV: parseCSV, norm: norm, key: key, hm: hm, span: span, parseLen: parseLen, parseTimeCell: parseTimeCell,
    wdList: wdList, parseSlotCell: parseSlotCell, parseHours: parseHours, guessCols: guessCols, run: run, blocks: blocks, toCSV: toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = K; else root.JIKANWARI = K;
})(typeof window !== "undefined" ? window : globalThis);
