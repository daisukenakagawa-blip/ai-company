// 予約の重なりチェック — 関数のテスト（node test.js）
var Y = require("./yoyaku.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG", m, "\n  got", A, "\n  exp", B); } }

// 時刻
[["9:00", 540], ["09:30", 570], ["9時", 540], ["9時半", 570], ["9時15分", 555], ["午後1時", 780], ["午前12時", 0], ["1:00 PM", 780], ["0930", 570],
 ["2026/11/24 13:00", 780], ["2026-11-24T13:05:00", 785], ["11/24/26 9:00", 540], ["11/24(月) 14時", 840], ["24:00", 1440], ["１０：００", 600], ["18時まで", 1080]]
  .forEach(function (c) { eq(Y.parseClock(c[0]).min, c[1], "clock " + c[0]); });
["9:75", "午後13時", "あとで", "2026/11/24"].forEach(function (s) { eq(!!Y.parseClock(s).err, true, "clock err " + s); });
eq(!!Y.parseClock("").blank, true, "clock blank");

// 日付
function ds(s, y) { var d = Y.parseDate(s, y); return d ? [d.y, d.m, d.d] : null; }
eq(ds("2026/11/24"), [2026, 11, 24], "date slash"); eq(ds("2026-11-24 9:00"), [2026, 11, 24], "date with time");
eq(ds("令和8年11月24日"), [2026, 11, 24], "wareki"); eq(ds("R8.11.24"), [2026, 11, 24], "wareki R");
eq(ds("11/24/26"), [2026, 11, 24], "excel us"); eq(ds("11/24", 2026), [2026, 11, 24], "no year");
eq(ds("11月24日(火)", 2026), [2026, 11, 24], "weekday paren"); eq(ds("20261124"), [2026, 11, 24], "8 digits");
eq(ds("2026/2/30"), null, "bad day"); eq(ds("11/24"), null, "no year no default"); eq(ds("9:00"), null, "time is not date");
eq(Y.dayLabel(Y.parseDate("2026/11/24").day), "2026/11/24（火）", "day label");

// 時間帯
eq(Y.splitRange("9:00〜10:30"), { prefix: "", start: "9:00", end: "10:30" }, "range 1");
eq(Y.splitRange("10時-12時"), { prefix: "", start: "10時", end: "12時" }, "range 2");
eq(Y.splitRange("2026-11-24 13:00-15:00"), { prefix: "2026-11-24", start: "13:00", end: "15:00" }, "range date");
eq(Y.splitRange("11/24 9:00 ～ 12:00"), { prefix: "11/24", start: "9:00", end: "12:00" }, "range fullwidth tilde");
eq(Y.splitRange("13:00から15:30まで"), { prefix: "", start: "13:00", end: "15:30" }, "range kara made");
eq(Y.splitRange("9:00"), null, "not range");

// 列の推定
var H = ["会議室", "利用日", "開始", "終了", "予約者", "用途"];
eq(Y.guessColumns(H, [["A", "2026/11/24", "9:00", "10:00", "青木", "朝会"]]), { res: 0, date: 1, start: 2, end: 3, person: 4, purpose: 5 }, "guess");
eq(Y.guessColumns(["社用車", "日付", "時間帯", "申込者"], [["1号車", "11/24", "9:00〜12:00", "上田"]]), { res: 0, date: 1, range: 2, person: 3 }, "guess range");
eq(Y.guessColumns(["品名", "時間", "返却予定", "氏名"], [["プロジェクター", "2026/11/24 9:00", "2026/11/24 12:00", "江藤"]]), { res: 0, end: 2, person: 3, start: 1 }, "guess time as start");

// 予約を読む・重なり
var map = { res: 0, date: 1, start: 2, end: 3, person: 4, purpose: 5 };
var rows = [
  ["A", "2026/11/24", "9:00", "10:00", "青木", ""],   // 0
  ["A", "2026/11/24", "9:30", "11:00", "石井", ""],   // 1 重なり 0 と 30分
  ["A", "2026/11/24", "11:00", "12:00", "上田", ""],  // 2 1 とぴったり（重なりなし）
  ["B", "2026/11/24", "9:30", "11:00", "江藤", ""],   // 3 物が違う
  ["B", "2026/11/24", "9:30", "11:00", "江藤", ""],   // 4 同じ予約が2回
  ["A", "2026/11/24", "8:00", "", "青木", ""],        // 5 終了が空欄
  ["C", "2026/11/24", "22:00", "7:00", "夜勤", ""],   // 6 翌日まで
  ["C", "2026/11/25", "6:30", "9:00", "朝", ""],      // 7 6 と 30分重なり
  ["", "", "", "", "", ""],                           // 8 空欄
  ["A", "2026/11/24", "10:00", "10:00", "x", ""],     // 9 開始=終了
  ["A", "あした", "10:00", "11:00", "x", ""]          // 10 日付が読めない
];
var b = Y.buildRecords(rows, { map: map, mode: "two", year: 2026, overnight: true });
eq(b.recs.length, 7, "recs"); eq(b.blanks, 1, "blanks"); eq(b.errors.map(function (e) { return e.i; }), [5, 9, 10], "error rows");
var ov = Y.findOverlaps(b.recs, 0);
eq(ov.list.map(function (x) { return [x.res, x.a.i, x.b.i, x.min, x.kind]; }), [["A", 0, 1, 30, "重なり"], ["B", 3, 4, 90, "同じ予約が2回"], ["C", 6, 7, 30, "重なり"]], "overlaps");
var ov15 = Y.findOverlaps(b.recs, 15);
eq(ov15.list.filter(function (x) { return x.kind === "間隔不足"; }).map(function (x) { return [x.a.i, x.b.i, x.shortBy]; }), [[1, 2, 15]], "gap 15");
eq(b.recs.filter(function (r) { return r.i === 6; })[0].note, "翌日までの予約とみなしました", "overnight note");
var b2 = Y.buildRecords([rows[6]], { map: map, mode: "two", year: 2026, overnight: false });
eq(b2.errors[0].note, "終了が開始より前です", "overnight off");
// 同じ時間に2件（別の人）
var ov2 = Y.findOverlaps(Y.buildRecords([["A", "2026/11/24", "9:00", "10:00", "甲", ""], ["A", "2026/11/24", "9:00", "10:00", "乙", ""]], { map: map, mode: "two", year: 2026 }).recs, 0);
eq(ov2.list[0].kind, "同じ時間に2件", "same time other person");
// 3件が重なると3組
var ov3 = Y.findOverlaps(Y.buildRecords([["A", "2026/11/24", "9:00", "12:00"], ["A", "2026/11/24", "10:00", "11:00"], ["A", "2026/11/24", "10:30", "11:30"]], { map: { res: 0, date: 1, start: 2, end: 3 }, mode: "two", year: 2026 }).recs, 0);
eq(ov3.list.length, 3, "three overlapping");

// 1つの列の時間帯・日付が開始に入っている
var b3 = Y.buildRecords([["車1", "11/24", "9:00〜12:00"], ["車1", "", "2026/11/24 11:30-13:00"], ["車1", "11/25", "9時"]], { map: { res: 0, date: 1, range: 2 }, mode: "one", year: 2026 });
eq(b3.recs.length, 2, "one-col recs"); eq(b3.errors.length, 1, "one-col err");
eq(Y.findOverlaps(b3.recs, 0).list[0].min, 30, "one-col overlap");
var b4 = Y.buildRecords([["P", "2026/11/24 9:00", "2026/11/26 17:00"], ["P", "2026/11/25 10:00", "2026/11/25 12:00"]], { map: { res: 0, start: 1, end: 2 }, mode: "two", year: 2026 });
eq(Y.findOverlaps(b4.recs, 0).list.length, 1, "multi-day lending overlap");

// 空き時間
var fr = Y.freeSlots(b.recs.filter(function (r) { return r.res === "A"; }), 540, 1080, 30);
eq(fr.length, 1, "free rows"); eq(Y.freeText(fr[0].free), "12:00〜18:00", "free A"); eq(fr[0].used, 180, "used A"); eq(fr[0].count, 3, "count A");
var frc = Y.freeSlots(b.recs.filter(function (r) { return r.res === "C"; }), 540, 1080, 30);
eq(frc.map(function (f) { return Y.freeText(f.free); }), ["9:00〜18:00", "9:00〜18:00"], "free C (night only)");
var fr4 = Y.freeSlots(b4.recs, 540, 1080, 30);
eq(fr4.map(function (f) { return Y.freeText(f.free); }), ["なし", "なし", "17:00〜18:00"], "multi-day busy");

// 段
var ln = Y.lanes(b.recs.filter(function (r) { return r.res === "A"; }));
eq(ln.map(function (x) { return x.lane; }), [0, 1, 0], "lanes");
// CSV
eq(Y.toCSV([["a,b", 'x"y']]), '﻿"a,b","x""y"\r\n', "csv");
eq(Y.dur(90), "1時間30分", "dur"); eq(Y.dur(30), "30分", "dur2"); eq(Y.hm(1500), "翌1:00", "hm next");

// 大きなデータ
var big = [], t = Date.now();
for (var i = 0; i < 30000; i++) { var h = 8 + (i % 10); big.push(["部屋" + (i % 50), "2026/11/" + (1 + (i % 28)), h + ":00", (h + 1) + ":30", "人" + i]); }
var bb = Y.buildRecords(big, { map: { res: 0, date: 1, start: 2, end: 3, person: 4 }, mode: "two", year: 2026 });
var bo = Y.findOverlaps(bb.recs, 0), bf = Y.freeSlots(bb.recs, 540, 1080, 30);
console.log("30000 rows:", bb.recs.length, "recs,", bo.list.length, "overlaps,", bf.length, "free rows,", (Date.now() - t) + "ms");

console.log(n - bad + "/" + n + " OK");
process.exit(bad ? 1 : 0);
