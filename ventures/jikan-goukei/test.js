// node test.js
var J = require("./jikan.js");
var n = 0, bad = 0;
function eq(a, b, msg) { n++; var ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log("NG", msg, JSON.stringify(a), "≠", JSON.stringify(b)); } }

// 所要時間
[["1:30", 90], ["0:45", 45], ["25:10", 1510], ["1:30:30", 90.5], ["１：３０", 90], ["90分", 90], ["90 分", 90], ["1.5h", 90], ["1.5H", 90],
 ["1.5時間", 90], ["1時間半", 90], ["2時間", 120], ["1時間30分", 90], ["1時間30", 90], ["1h30m", 90], ["1h 30min", 90], ["30min", 30], ["45m", 45],
 [".5h", 30], ["0.25時間", 15], ["１時間４５分", 105], ["-0:30", -30]].forEach(function (c) { eq(J.parseDuration(c[0], "h").min, c[1], "dur " + c[0]); });
eq(J.parseDuration("1.5", "h").min, 90, "bare h"); eq(J.parseDuration("90", "m").min, 90, "bare m");
eq(J.parseDuration("1.5", "h").kind, "単位なし", "bare kind");
eq(!!J.parseDuration("", "h").blank, true, "blank"); eq(!!J.parseDuration("-", "h").blank, true, "dash blank");
eq(!!J.parseDuration("1:75", "h").err, true, "1:75 err"); eq(!!J.parseDuration("たくさん", "h").err, true, "text err");
eq(!!J.parseDuration("1時30分", "h").err, true, "1時30分 は時刻なので不可"); eq(!!J.parseDuration("30m1h", "h").err, true, "順番逆");

// 時刻
[["9:00", 540], ["18:30", 1110], ["9時", 540], ["9時30分", 570], ["9時半", 570], ["午後1時", 780], ["1:00 PM", 780], ["12:00 AM", 0],
 ["0930", 570], ["930", 570], ["2026/11/21 9:15", 555], ["25:00", 1500], ["９：００", 540]].forEach(function (c) { eq(J.parseClock(c[0]).min, c[1], "clock " + c[0]); });
eq(!!J.parseClock("午後13時").err, true, "午後13時");

// 日付
eq(J.parseDate("2026/11/21"), { y: 2026, m: 11, d: 21 }, "date slash");
eq(J.parseDate("2026-11-01 9:00"), { y: 2026, m: 11, d: 1 }, "date time");
eq(J.parseDate("令和8年11月21日"), { y: 2026, m: 11, d: 21 }, "reiwa");
eq(J.parseDate("R8.11.21"), { y: 2026, m: 11, d: 21 }, "R8");
eq(J.parseDate("11/21/26"), { y: 2026, m: 11, d: 21 }, "excel mdy");
eq(J.parseDate("11月21日"), { y: null, m: 11, d: 21 }, "no year");
eq(J.parseDate("20261121"), { y: 2026, m: 11, d: 21 }, "8 digits");
eq(J.parseDate("2026/2/30"), null, "bad date");
eq(J.dateKey(J.parseDate("2026/11/21"), "month"), "2026年11月", "month key");
eq(J.dateKey(J.parseDate("2026/11/21"), "weekday"), "土", "weekday");

// 丸め
eq(J.roundMin(52, 15, "down"), 45, "round down"); eq(J.roundMin(52, 15, "up"), 60, "round up"); eq(J.roundMin(52, 15, "near"), 45, "near");
eq(J.roundMin(52.5, 15, "near"), 60, "near half"); eq(J.roundMin(45, 15, "up"), 45, "exact up");

// 表示
eq(J.fmt(90, "hm"), "1:30", "fmt hm"); eq(J.fmt(1510, "hm"), "25:10", "fmt 25h"); eq(J.fmt(90, "h"), "1.50", "fmt h"); eq(J.fmt(20, "h"), "0.33", "fmt h 0.33");
eq(J.fmt(90.5, "m"), "90.5", "fmt m"); eq(J.fmt(-30, "hm"), "-0:30", "fmt neg");

// 列の推定
var heads = ["日付", "担当者", "案件", "作業時間", "メモ"];
eq(J.guessColumns(heads, []), { date: 0, person: 1, project: 2, dur: 3 }, "guess dur");
eq(J.guessColumns(["日付", "氏名", "開始時刻", "終了時刻", "休憩"], []), { date: 0, person: 1, start: 2, end: 3, brk: 4 }, "guess range");
eq(J.guessColumns(["a", "b", "c"], [["山田", "1:30", "x"], ["佐藤", "90分", "y"]]).dur, 1, "guess by content");

// 集計（所要時間）
var rows = [
  ["2026/11/02", "山田", "A社", "1:30"], ["2026/11/02", "佐藤", "A社", "90分"], ["2026/11/03", "山田", "B社", "1.5h"],
  ["2026/12/01", "山田", "A社", "1時間半"], ["2026/12/01", "佐藤", "B社", "0.5"], ["2026/12/02", "佐藤", "B社", ""], ["2026/12/02", "佐藤", "B社", "すこし"]
];
var b = J.buildRecords(rows, { mode: "dur", map: { date: 0, person: 1, project: 2, dur: 3 }, bareUnit: "h" });
eq(b.errors.length, 1, "1 error"); eq(b.blanks, 1, "1 blank"); eq(b.bare, 1, "1 bare");
var ag = J.aggregate(b.recs, { col: 1 }, null);
eq(ag.rowKeys, ["山田", "佐藤"], "row keys"); eq(ag.rowTot["山田"], 270, "山田 270"); eq(ag.rowTot["佐藤"], 120, "佐藤 120"); eq(ag.total, 390, "total"); eq(ag.count, 5, "count");
var ag2 = J.aggregate(b.recs, { col: 0, date: "month" }, { col: 2 });
eq(ag2.rowKeys, ["2026年11月", "2026年12月"], "month keys"); eq(ag2.get("2026年11月", "A社"), 180, "11月 A社"); eq(ag2.get("2026年12月", "B社"), 30, "12月 B社"); eq(ag2.get("2026年11月", "B社"), 90, "11月 B社");
var tr = J.tableRows(ag2, "hm", { row: "月" });
eq(tr[0], ["月", "A社", "B社", "合計", "件数"], "table head"); eq(tr[3], ["合計", "4:30", "2:00", "6:30", 5], "table total");
eq(J.tableRows(J.aggregate(b.recs, null, null), "h", {}), [["", "合計", "件数"], ["全体", "6.50", 5]], "table no group");

// 集計（開始・終了・休憩）
var r2 = [["9:00", "12:00", ""], ["13:00", "18:30", "0:15"], ["22:00", "1:00", "30"], ["10:00", "9:00", ""], ["9:00", "10:00", "2:00"]];
var b2 = J.buildRecords(r2, { mode: "range", map: { start: 0, end: 1, brk: 2 }, overnight: true, brkUnit: "m" });
eq(b2.recs.map(function (r) { return r.min; }), [180, 315, 150, 1380, null], "range mins");
eq(b2.errors.length, 1, "brk too long");
var b3 = J.buildRecords(r2.slice(3, 4), { mode: "range", map: { start: 0, end: 1 }, overnight: false });
eq(b3.errors.length, 1, "no overnight → err");
var b4 = J.buildRecords([["9:07", "10:00"]], { mode: "range", map: { start: 0, end: 1 }, roundUnit: 15, roundHow: "down" });
eq(b4.recs[0].min, 45, "round per row"); eq(b4.recs[0].raw, 53, "raw kept");

// CSV
eq(J.toCSV([["a", "b,c"], ["1", 'x"y']]), '﻿a,"b,c"\r\n1,"x""y"\r\n', "csv");
eq(J.parseCSV("日付,時間\r\n11/1,\"1:30\"\r\n\r\n11/2,90分\r\n"), [["日付", "時間"], ["11/1", "1:30"], ["11/2", "90分"]], "parse csv");
eq(J.parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]], "tsv");

console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
