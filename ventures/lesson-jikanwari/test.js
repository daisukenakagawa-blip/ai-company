// node test.js
var K = require("./jikanwari.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + m + "\n  got " + A + "\n  exp " + B); } }
function S(v) { var r = K.parseSlotCell(v); return r.bad ? "bad" : r.items.map(function (i) { return K.WD[i.w] + (i.s != null ? K.hm(i.s) : "") + (i.e != null ? "-" + K.hm(i.e) : "") + (i.len ? "/" + i.len : ""); }).join(" "); }
eq(S("月"), "月", "曜日だけ"); eq(S("月曜日"), "月", "月曜日"); eq(S("(火)"), "火", "かっこ");
eq(S("月・木"), "月 木", "月・木"); eq(S("月木"), "月 木", "月木"); eq(S("月〜水"), "月 火 水", "範囲"); eq(S("平日"), "月 火 水 木 金", "平日");
eq(S("月 16:00"), "月16:00", "曜日と時刻"); eq(S("月16:00〜16:45"), "月16:00-16:45", "曜日と時刻の範囲");
eq(S("月・木 16時半"), "月16:30 木16:30", "2曜日で同じ時刻"); eq(S("月16:00、木17:30"), "月16:00 木17:30", "曜日ごとに時刻");
eq(S("土 10:00 (45分)"), "土10:00/45", "分つき"); eq(S("あいう"), "bad", "読めない"); eq(K.parseSlotCell("").empty, true, "空欄");
function T(v) { var r = K.parseTimeCell(v); return r == null ? null : r.bad ? "bad" : K.hm(r.s) + "|" + K.hm(r.e) + "|" + (r.len || ""); }
eq(T("16:00"), "16:00||", "時刻"); eq(T("16時半"), "16:30||", "時半"); eq(T("16:00-16:45"), "16:00|16:45|", "範囲"); eq(T("16時から17時"), "16:00|17:00|", "から");
eq(T("9:00 90分"), "9:00||90", "長さつき"); eq(T("17:00〜16:00"), "bad", "逆"); eq(T("25:00"), "bad", "25時");
eq([K.parseLen("45"), K.parseLen("45分"), K.parseLen("1時間"), K.parseLen("1時間30分"), K.parseLen("1.5時間"), K.parseLen("1:00"), K.parseLen("1時間半")], [45, 45, 60, 90, 90, 60, 90], "長さ");
eq(isNaN(K.parseLen("たくさん")), true, "長さ読めない");
var Hs = K.parseHours("月〜金 15:00〜21:00\n土：9:00〜12:00 13:00〜17:00\n日 休み\n田中 月・水 16:00〜20:00\n金子 火 15:00-19:00\nあいう 9:00");
eq([Hs.base[1], Hs.base[6], Hs.base[0], Hs.who["田中"][1], Hs.who["田中"][3], Hs.whoName["金子"], Hs.bad.length, Hs.bad[0].line],
  [[{ s: 900, e: 1260 }], [{ s: 540, e: 720 }, { s: 780, e: 1020 }], [], [{ s: 960, e: 1200 }], [{ s: 960, e: 1200 }], "金子", 1, 6], "教室の時間");
// 列の推定
var Hd = ["生徒名", "学年", "曜日", "開始時刻", "時間", "講師", "部屋", "コース"];
var rows = [["青木 一郎", "小3", "月", "16:00", "30", "田中", "A", "ピアノ"], ["石井 蓮", "小5", "月・木", "16:30", "45分", "田中", "A", "ピアノ"]];
eq(K.guessCols(Hd, rows), { name: 0, grade: 1, wd: 2, time: 3, end: null, len: 4, teacher: 5, room: 6, course: 7 }, "列の推定");
eq(K.guessCols(["名前", "レッスン", "時間"], [["青木", "月", "16:00"]]), { name: 0, grade: null, wd: 1, time: 2, end: null, len: null, teacher: null, room: null, course: null }, "時間の列が時刻");
// 計算
var cols = K.guessCols(Hd, rows);
var data = [
  ["青木 一郎", "小3", "月", "16:00", "30", "田中", "A", "ピアノ"],
  ["石井 蓮", "小5", "月・木", "16:30", "45分", "田中", "A", "ピアノ"],
  ["上田 美咲", "中1", "月", "17:00", "30", "田中", "A", "ピアノ"],      // 石井 16:30-17:15 と重なる → 田中の人数オーバー
  ["江藤 大翔", "小2", "月", "17:00", "30", "金子", "A", "バイオリン"],  // 同じ部屋 A で上田と重なる
  ["青木 一郎", "小3", "月", "16:15", "30", "金子", "B", "ソルフェージュ"], // 青木の重なり（16:00-16:30 と 16:15-16:45）
  ["大野 結衣", "", "火", "20:45", "30", "金子", "B", ""],               // 金子の時間外（火 15:00-19:00）
  ["", "", "", "", "", "", "", ""],
  ["加藤 陽菜", "", "水", "", "", "田中", "", ""],                       // 時刻なし
  ["木村 颯太", "", "金", "18:00", "たくさん", "田中", "", ""],          // 長さ読めない → 30分
  ["合計", "", "", "", "", "", "", ""]
];
var R = K.run(Hd, data, { cols: cols, hours: "月〜金 15:00〜21:00\n土 9:00〜12:00\n金子 月・火 15:00〜19:00", unit: "teacher", cap: 1, lenDefault: 30, minFree: 30 });
var tn = R.groups.map(function (g) { return g.name + ":" + g.lessons.length; });
eq(tn, ["田中:5", "金子:3"], "講師ごと");
eq([R.students.length, R.lessons.length], [7, 8], "人数・コマ");
eq(R.stuClash.map(function (c) { return c.name + " " + K.span(c.a) + "/" + K.span(c.b); }), ["青木 一郎 16:00〜16:30/16:15〜16:45"], "同じ生徒の重なり");
var ta = R.groups[0];
eq(ta.over.map(function (o) { return K.WD[o.w] + K.span(o) + " " + o.n + "人"; }), ["月17:00〜17:15 2人"], "人数オーバー");
eq(R.rooms.map(function (r) { return r.room + " " + r.a.name + "/" + r.b.name; }), ["A 石井 蓮/江藤 大翔", "A 上田 美咲/江藤 大翔"], "同じ部屋");
var ka = R.groups[1];
eq(ka.outside.map(function (L) { return L.name; }), ["大野 結衣"], "時間外");
eq(ka.free.filter(function (f) { return f.w === 1; }).map(function (f) { return K.span(f) + "/" + f.fit; }), ["15:00〜16:15/2", "16:45〜17:00".length ? "16:45〜17:00/0" : "", "17:30〜19:00/3"].filter(function (x) { return x; }).filter(function (x) { return !/\/0$/.test(x); }), "空き枠（30分以上）");
eq(ka.free.some(function (f) { return f.w === 3; }), false, "金子の水は休み");
eq(ta.free.filter(function (f) { return f.w === 1; }).map(K.span), ["15:00〜16:00", "17:30〜21:00"], "田中の月の空き");
eq(ta.free.filter(function (f) { return f.w === 4; }).map(K.span), ["15:00〜16:30", "17:15〜21:00"], "田中の木の空き");
eq(ta.free.some(function (f) { return f.w === 6; }), true, "土も空き");
eq(R.checks.map(function (c) { return c.row + ":" + c.why.slice(0, 6); }), ["9:水曜の時刻が", "10:長さが読めま"], "確かめたい所");
// 2人まで同時
var R2 = K.run(Hd, data, { cols: cols, hours: "月 15:00〜18:00", unit: "teacher", cap: 2, lenDefault: 30 });
eq(R2.groups[0].over.length, 0, "2人までならオーバーなし");
eq(R2.groups[0].free.filter(function (f) { return f.w === 1; }).map(function (f) { return K.span(f) + "×" + f.room; }), ["15:00〜17:00×1", "17:15〜18:00×1"], "2人までの空き（17:00〜17:15 は2人で満員）");
// 表を分けない
var R3 = K.run(Hd, data, { cols: cols, hours: "", unit: "all", cap: 1 });
eq([R3.groups.length, R3.groups[0].hasHours, R3.groups[0].free.length], [1, false, 0], "全体・時間なし");
// お試し
var R4 = K.run(Hd, data, { cols: cols, hours: "", unit: "teacher", limit: 3 });
eq([R4.students.length, R4.cut], [3, 4], "お試しの制限");
// 曜日と時刻が同じ列
var R5 = K.run(["名前", "日時"], [["青木", "月16:00〜16:45、木17:00"], ["石井", "土 10時"]], { cols: K.guessCols(["名前", "日時"], [["青木", "月16:00"]]), hours: "", unit: "all", lenDefault: 40 });
eq(R5.lessons.map(function (L) { return L.name + K.WD[L.w] + K.span(L); }), ["青木月16:00〜16:45", "青木木17:00〜17:40", "石井土10:00〜10:40"], "日時の列");
// ブロック
eq(K.blocks([{ s: 960, e: 990 }, { s: 990, e: 1035 }, { s: 1035, e: 1065 }, { s: 1200, e: 1230 }], 30, 900).map(function (b) { return K.span(b) + "×" + b.items.length; }), ["16:00〜16:30×1", "16:30〜18:00×2", "20:00〜20:30×1"], "時間割のかたまり");
// 速さ
var big = []; for (var i = 0; i < 3000; i++) big.push(["生徒" + i, "", "月火水木金土"[i % 6], (15 + i % 6) + ":" + (i % 2 ? "30" : "00"), "30", "講師" + (i % 30), "", ""]);
var t0 = Date.now(); var RB = K.run(Hd, big, { cols: cols, hours: "月〜土 15:00〜21:00", unit: "teacher", cap: 1 }); var dt = Date.now() - t0;
eq([RB.students.length, RB.groups.length], [3000, 30], "3000人");
console.log("3000人×30講師: " + dt + "ms");
console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
