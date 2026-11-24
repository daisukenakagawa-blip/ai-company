// node test.js
var K = require("./koushu.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + m + "\n  got " + A + "\n  exp " + B); } }
var B = { y: 2026, m: 12 };
function L(s) { var r = K.parseScheduleLine(s, B); return r.bad ? "bad:" + r.bad : [r.course, r.dates.map(K.iso).join(","), K.hm(r.s), K.hm(r.e), r.cap, r.place].join("|"); }
// 日程の1行
eq(L("中3数学 12/25〜12/28 13:00〜14:30 A教室"), "中3数学|2026-12-25,2026-12-26,2026-12-27,2026-12-28|13:00|14:30|0|A教室", "範囲");
eq(L("中3英語 12/25・26・27 15:00-16:30 定員12 B教室 田中"), "中3英語|2026-12-25,2026-12-26,2026-12-27|15:00|16:30|12|B教室 田中", "・で日だけ・定員");
eq(L("小6算数 12/26, 1/5 10時〜11時半"), "小6算数|2026-12-26,2027-01-05|10:00|11:30|0|", "年をまたぐ・何時半");
eq(L("理科 12/27〜1/6 日曜除く 9:00 90分"), "理科|2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-04,2027-01-05,2027-01-06|9:00|10:30|0|", "日曜除く・90分");
eq(L("国語 2027/1/4"), "国語|2027-01-04|||0|", "年つき・時刻なし");
eq(L("英語 12月25日(金) 18時"), "英語|2026-12-25|18:00||0|", "月日・曜日つき・開始だけ");
eq(L("中1数学\t12/25\t13:00〜14:00\tA教室"), "中1数学|2026-12-25|13:00|14:00|0|A教室", "タブ区切り");
eq(L("演習 12/25〜28 9:00〜10:00"), "演習|2026-12-25,2026-12-26,2026-12-27,2026-12-28|9:00|10:00|0|", "〜28 日だけ");
eq(L("演習 12/26〜12/31 土日除く 9:00〜10:00"), "演習|2026-12-28,2026-12-29,2026-12-30,2026-12-31|9:00|10:00|0|", "土日除く");
eq(L("社会 12/32 9:00").slice(0, 4), "bad:", "存在しない日");
eq(L("あいう").slice(0, 4), "bad:", "日付なし");
eq(L("12/25 13:00").slice(0, 4), "bad:", "講座名なし");
eq(L("数学 12/25 18:00〜17:00").slice(0, 4), "bad:", "終わりが前");
eq(K.parseScheduleLine("春期 3/25・3/26 10:00", { y: 2027, m: 3 }).dates.map(K.iso), ["2027-03-25", "2027-03-26"], "春期");
var S = K.parseSchedule("講座\t日付\t時刻\n数学 12/25 13:00〜14:00\n数学 12/26 15:00〜16:00\nあ\n", B);
eq([S.courses.length, S.courses[0].sessions.length, S.bad.length, S.bad[0].line], [1, 2, 1, 4], "同じ講座の行はまとめる・見出しを飛ばす");

// 計算（生徒×講座）
var sch = "数学 12/25〜12/26 13:00〜14:30 A\n英語 12/25 14:00〜15:00 A\n理科 12/26 15:00〜16:00 B 定員1\n国語 12/27";
var H = ["名前", "学年", "数学", "英語（冬）", "理科", "社会"];
var rows = [["青木", "中3", "○", "○", "", ""], ["石井", "中3", "○", "", "✓", "×"], ["上田", "中2", "", "", "1", "○"], ["青木", "中3", "", "", "○", ""], ["", "", "", "", "", ""], ["合計", "", "2", "1", "2", ""]];
var g = K.guessCols(H, rows, K.parseSchedule(sch, B));
eq([g.mode, g.name, g.grade, g.courses], ["matrix", 0, 1, [2, 3, 4]], "列の推定（社会は日程にない）");
g.courses.push(5);
var R = K.run(H, rows, { cols: g, schedule: sch, base: B, rowBase: 2, limit: Infinity });
eq(R.students.map(function (s) { return s.name + ":" + s.courses.map(function (c) { return c.name; }).join("+") + ":" + s.sessions.length; }), ["青木:数学+英語+理科:4", "石井:数学+理科:3", "上田:理科:1"], "生徒ごと（同じ名前はまとめる・合計の行は外す）");
eq(R.conflicts.map(function (c) { return c.name + K.iso(c.n) + c.a.course + c.b.course + c.hard; }), ["青木2026-12-25数学英語true"], "時間の重なり（14:30 と 15:00 は重ならない）");
eq(R.unknown.map(function (u) { return u.text + u.rows; }), ["社会4"], "日程にない講座");
eq(R.courses.map(function (c) { return c.name + c.students.length; }), ["数学2", "英語1", "理科3", "国語0"], "講座ごとの人数（見出しに講座名を含む）");
eq(R.checks.filter(function (c) { return /定員/.test(c.why); }).length, 1, "定員を超える");
eq(R.checks.filter(function (c) { return /申込がありません/.test(c.why); }).map(function (c) { return c.name; }), ["国語"], "申込のない講座");
eq(R.days.map(function (d) { return K.iso(d.n) + ":" + d.people; }), ["2026-12-25:2", "2026-12-26:3", "2026-12-27:0"], "日ごとの人数");
eq(R.slots, 8, "のべコマ");
eq(R.students[1].dayN, 2, "日数");

// 1行1件
var H2 = ["生徒名", "講座"], rows2 = [["青木", "数学、英語"], ["石井", "数学・理科"], ["石井", "英語"], ["上田", "数学"], ["上田", "数学"]];
var g2 = K.guessCols(H2, rows2, K.parseSchedule(sch, B));
eq([g2.mode, g2.name, g2.course], ["long", 0, 1], "1行1件の推定");
var R2 = K.run(H2, rows2, { cols: g2, schedule: sch, base: B, rowBase: 2, limit: Infinity });
eq(R2.students.map(function (s) { return s.name + s.courses.length; }), ["青木2", "石井3", "上田1"], "1行1件（・で分ける・行をまとめる）");
eq(R2.checks.filter(function (c) { return /2回/.test(c.why); }).length, 1, "同じ講座の申込が2回");
eq(R2.conflicts.filter(function (c) { return c.hard; }).length, 2, "重なり（青木・石井の 12/25 数学×英語。理科 15:00 は数学 14:30 と重ならない）");

// 同じ場所・同じ時間
var R3 = K.run(H, rows, { cols: g, schedule: "数学 12/25 13:00〜14:30 A教室\n英語 12/25 14:00〜15:00 A教室", base: B, rowBase: 2, limit: Infinity });
eq(R3.places.length, 1, "同じ場所・同じ時間");
// 時刻なしの同じ日
var R4 = K.run(H, rows, { cols: g, schedule: "数学 12/25\n英語 12/25 14:00", base: B, rowBase: 2, limit: Infinity });
eq([R4.conflicts.length, R4.conflicts[0].hard], [1, false], "時刻なしは弱い知らせ");
// お試し
var R5 = K.run(H, rows, { cols: g, schedule: sch, base: B, rowBase: 2, limit: 2 });
eq([R5.students.length, R5.cut], [2, 1], "お試しの制限（同じ名前の行は数えない）");
// 大きな表
var big = [], H6 = ["名前", "学年"], s6 = [];
for (var c = 0; c < 30; c++) { H6.push("講座" + c); s6.push("講座" + c + " 12/" + (20 + c % 10) + "〜12/" + (21 + c % 10) + " " + (9 + c % 8) + ":00〜" + (10 + c % 8) + ":00 教室" + (c % 5)); }
for (var i = 0; i < 3000; i++) { var r = ["生徒" + i, "中" + (i % 3 + 1)]; for (var c2 = 0; c2 < 30; c2++) r.push((i + c2) % 7 === 0 ? "○" : ""); big.push(r); }
var t0 = Date.now(), g6 = K.guessCols(H6, big, K.parseSchedule(s6.join("\n"), B)), R6 = K.run(H6, big, { cols: g6, schedule: s6.join("\n"), base: B, rowBase: 2, limit: Infinity });
eq([g6.courses.length, R6.students.length], [30, 3000], "3,000人×30講座");
console.log("3,000人×30講座: " + (Date.now() - t0) + "ms");
console.log(n - bad + "/" + n + " OK");
if (bad) process.exit(1);
