// 関数のテスト：node test.js
var K = require("./shift.js"), n = 0, bad = 0;
function eq(a, b, msg) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + msg + "\n  got " + A + "\n  exp " + B); } }
var today = K.dayOf(2026, 11, 24);

// 時刻・範囲・長さ
eq(K.parseRange("9:00-17:00").s, 540, "範囲 開始");
eq(K.parseRange("22時〜翌6時").e, 1800, "日またぎ（翌）");
eq(K.parseRange("22:00-7:00").e, 1860, "日またぎ（終わりが小さい）");
eq(K.parseRange("9-17").e, 1020, "数字だけ");
eq(K.parseRange("9.5-18").s, 570, "9.5時");
eq(K.parseRange("早番"), null, "範囲でない");
eq([K.parseLen("60"), K.parseLen("1時間"), K.parseLen("1:30"), K.parseLen("45分"), K.parseLen("1.5h")], [60, 60, 90, 45, 90], "休憩の長さ");

// 記号の表
var C = K.parseCodes(K.DEFAULT_CODES);
eq(C.bad.length, 0, "初めの記号の表に読めない行なし");
eq([C.codes["早"].s, C.codes["早"].e, C.codes["早"].brk], [420, 960, 60], "早番");
eq([C.codes["夜"].e, C.codes["夜"].brk], [1860, 120], "夜勤");
eq(C.codes["休"].kind, "off", "休み");
eq(C.codes["有"].kind, "paid", "有休");
var C2 = K.parseCodes("A: 9:00〜18:00 1:00\nB=13時-22時 休憩45分\n有 有休 8時間\nC 9:00-\nD 9:00-10:00 休憩90");
eq([C2.codes["a"].s, C2.codes["a"].brk, C2.codes["b"].s, C2.codes["b"].brk, C2.codes["有"].paid], [540, 60, 780, 45, 480], "記号の書き方いろいろ");
eq(C2.bad.map(function (b) { return b.line; }), [4, 5], "読めない記号の行");

// マス
eq(K.parseCell("早", C, {}).kind, "work", "マス 記号");
eq(K.parseCell("早(研修)", C, {}).memo, "(研修)", "マス 括弧のメモ");
var d = K.parseCell("10:00-20:00", C, { directBreak: "law" });
eq([d.s, d.e, d.brk], [600, 1200, 60], "時刻を直接・休憩は8時間超で60分");
eq(K.parseCell("10-16", C, { directBreak: "law" }).brk, 0, "6時間ちょうどは休憩なし");
eq(K.parseCell("10-16:30", C, { directBreak: "law" }).brk, 45, "6時間超は45分");
eq(K.parseCell("公休", C, {}).kind, "off", "公休（表にない休みの言葉）");
eq(K.parseCell("有給", C, {}).kind, "paid", "有給（表にない）");
eq(K.parseCell("早遅", C, {}).kind, "bad", "読めない記号");
eq(K.parseCell("", C, {}).kind, "empty", "空欄");

// 見出し
eq(K.dayHead("1(火)"), { y: null, m: null, d: 1, wd: 2 }, "見出し 1(火)");
eq(K.dayHead("12/1（火）").m, 12, "見出し 12/1（火）");
eq(K.dayHead("2026/12/01").y, 2026, "見出し 年月日");
eq(K.dayHead("1日").d, 1, "見出し 1日");
eq(K.dayHead("氏名"), null, "見出し 名前");
eq(K.dayHead("32"), null, "見出し 32");

// 表の推定と月の推定
var rows = [
  ["2026年12月 シフト表"],
  ["No.", "氏名", "職種", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "合計"],
  ["", "", "", "火", "水", "木", "金", "土", "日", "月", "火", "水", "木", ""],
  ["1", "青木 一郎", "ホール", "早", "早", "遅", "休", "早", "早", "早", "早", "遅", "有", ""],
  ["2", "石井 花", "キッチン", "遅", "夜", "早", "", "休", "遅", "遅", "休", "早", "早", ""],
  ["3", "上田 健", "ホール", "10:00-20:00", "休", "早遅", "中", "中", "休", "中", "中(研修)", "中", "中", ""],
  ["", "早の人数", "", "1", "2", "1", "0", "1", "1", "1", "1", "1", "1", ""]
];
var L = K.findLayout(rows);
eq([L.headRow, L.wdRow, L.dataFrom, L.nameCol, L.groupCol, L.dcols.length], [1, 2, 3, 1, 2, 10], "表の推定");
var ym = K.guessMonth(L.heads, L.dcols.map(function (c) { return rows[2][c]; }), today);
eq([ym.y, ym.m], [2026, 12], "曜日の行から月を推定（1日が火曜＝2026年12月）");

var R = K.run(rows, { today: today, streak: 6, gap: 11, week: 40, directBreak: "law", weekStart: 1, need: "早 2\n土日 早 1\n計 3" });
eq(R.people.length, 3, "人数（人数の行は外す）");
var A = R.people[0], B = R.people[1], U = R.people[2];
eq([A.nWork, A.nRest, A.nPaid, A.work], [8, 1, 1, 8 * 480], "青木：出勤8・休1・有休1・64時間");
eq(A.maxStreak, 5, "青木：最長の連続勤務 5日（12/5〜12/9）");
eq(A.flags.length, 0, "青木：知らせなし（週40時間ちょうど）");
eq(R.bad.map(function (b) { return b.v; }), ["早遅"], "読めないマス");
eq(B.nNight, 1, "石井：夜勤1");
// 石井：12/1 遅(〜22:00) → 12/2 夜(22:00〜) は間24h。12/2 夜(〜翌7:00) → 12/3 早(7:00〜) は間0 → 間隔の知らせ
eq(B.flags.filter(function (f) { return f.kind === "勤務の間隔"; }).length, 1, "石井：勤務の間隔（12/2 夜 翌7:00まで → 12/3 早 7:00 から＝間0時間）");
eq(B.nEmpty, 1, "石井：空欄1");
eq(U.shifts[0].work, 540, "上田：10-20 の直接の時刻は休憩60分を引いて9時間");
eq(U.shifts.filter(function (x) { return x.memo; }).length, 1, "上田：括弧のメモ");
// 日ごとの人数：12/1 早1（必要2）→ 不足。12/5(土) 早1（土日は1）→ 不足なし
var d1 = R.daily[0], d5 = R.daily[4];
eq(d1.short.map(function (s) { return s.code; }), ["早"], "12/1 早が不足（計3人は足りている）");
eq(d5.short.map(function (s) { return s.code; }), ["計"], "12/5（土）の早は土日の決まり（1人）で足りる。計は2人で不足");
eq(R.daily[3].short.map(function (s) { return s.code + s.have; }), ["早0", "計1"], "12/4 早0・計1");
eq(R.wdMismatch, 0, "曜日の食い違いなし");

// 連続勤務：7日続く人
var rows2 = [["名前", "1", "2", "3", "4", "5", "6", "7", "8", "9"], ["田中", "早", "早", "早", "早", "早", "早", "早", "休", "早"]];
var R2 = K.run(rows2, { ym: { y: 2026, m: 12 }, streak: 6, gap: 11, week: 40, weekStart: 1, today: today });
eq(R2.people[0].maxStreak, 7, "連続7日");
eq(R2.people[0].flags.filter(function (f) { return f.kind === "連続勤務"; }).length, 1, "連続勤務の知らせ");
eq(R2.people[0].flags.filter(function (f) { return f.kind === "週の時間"; }).length, 1, "12/1〜12/6 の週 48時間を知らせる");
eq(R2.people[0].weeks.map(function (w) { return w.min / 60; }), [48, 16], "週ごと（月曜始まり：11/30〜12/6 は 6日で48時間、12/7〜 は 16時間）");

// 16日締め（16〜15日）
var h3 = ["名前"]; for (var i = 16; i <= 31; i++) h3.push(String(i)); for (i = 1; i <= 15; i++) h3.push(String(i));
var r3 = ["佐藤"]; for (i = 0; i < 31; i++) r3.push(i % 2 ? "休" : "早");
var R3 = K.run([h3, r3], { ym: { y: 2026, m: 11 }, today: today });
eq(K.dayLabel(R3.days[16]), "2026/12/1（火）", "16日締め：16〜31 のあと 1 は翌月");
eq(R3.badDays, [15], "11/31 は存在しない日として知らせる");
eq(R3.people[0].nWork + R3.people[0].nRest, 30, "存在しない日の列は数えない");

// 年をまたぐ（12/30, 12/31, 1/1）
var R4 = K.run([["名前", "12/29", "12/30", "12/31", "1/1", "1/2"], ["A", "早", "早", "休", "休", "早"]], { ym: { y: 2026, m: 12 }, today: today });
eq(K.dayLabel(R4.days[3]), "2027/1/1（金）", "年またぎ");

// 必要な人数
var N = K.parseNeed("早 2\n平日 遅 1\n12/31 計 1\nあ い\n");
eq([N.rules.length, N.bad.length], [3, 1], "必要な人数の行");
eq(K.needFor(N.rules, K.dayOf(2026, 12, 31), "*"), 1, "日付の決まり");

// お試しの制限
var R5 = K.run(rows, { today: today, limit: 2 });
eq([R5.people.length, R5.cut], [2, 1], "お試し 先頭2人");

// 速さ：200人×31日
var big = [["名前"]]; for (i = 1; i <= 31; i++) big[0].push(String(i));
for (var p = 0; p < 200; p++) { var rr = ["人" + p]; for (i = 0; i < 31; i++) rr.push(["早", "遅", "休", "夜", "中"][(p + i) % 5]); big.push(rr); }
var t0 = Date.now(), R6 = K.run(big, { ym: { y: 2026, m: 12 }, streak: 6, gap: 11, week: 40, need: "計 100", today: today });
console.log("200人×31日: " + (Date.now() - t0) + "ms, 知らせ " + R6.flags.length);
eq(R6.people.length, 200, "200人");

console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
