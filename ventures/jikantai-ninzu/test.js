// 時間帯ごとの人数と不足チェック — 関数のテスト（node test.js）
var N = require("./ninzu.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG", m, "\n  got", A, "\n  exp", B); } }
function rows(t) { return N.parseCSV(t); }

// 列の推定
var H = ["氏名", "勤務日", "出勤", "退勤", "休憩開始", "休憩終了", "職種"];
var m = N.guessColumns(H, [["青木", "2026/11/24", "9:00", "17:00", "12:00", "13:00", "ホール"]]);
eq([m.person, m.date, m.start, m.end, m.bstart, m.bend, m.group], [0, 1, 2, 3, 4, 5, 6], "guess two");
m = N.guessColumns(["日付", "スタッフ", "シフト", "休憩"], [["11/24", "青木", "9:00-17:00", "12:00-13:00"]]);
eq([m.date, m.person, m.range, m.brange, m.start], [0, 1, 2, 3, undefined], "guess one");
m = N.guessColumns(["予約日", "お客様", "開始", "終了", "人数"], [["11/24", "A", "18:00", "20:00", "4"]]);
eq([m.date, m.person, m.start, m.end, m.count], [0, 1, 2, 3, 4], "guess reservation");

// 記録を読む
var D = N.parseDate("2026/11/24").day, B = D * 1440;
var b = N.buildRecords(rows("2026/11/24,青木,9:00,17:00,12:00,13:00\n2026/11/24,石井,休,,,\n2026/11/24,上田,22:00,6:00,,\n2026/11/24,江藤,,,,\n2026/11/24,小川,あとで,17:00,,\n2026/11/24,加藤,10:00,15:00,9:00,9:30"),
  { map: { date: 0, person: 1, start: 2, end: 3, bstart: 4, bend: 5 }, mode: "two", year: 2026, overnight: true });
eq(b.recs.length, 3, "recs"); eq(b.offs, 1, "off"); eq(b.blanks, 1, "blank"); eq(b.errors.length, 1, "error");
eq(b.recs[0].parts, [[B + 540, B + 720], [B + 780, B + 1020]], "break removed");
eq([b.recs[1].s, b.recs[1].e], [B + 1320, B + 1440 + 360], "overnight");
eq(b.recs[2].parts, [[B + 600, B + 900]], "break outside not removed"); eq(/休憩が勤務の時間の外/.test(b.recs[2].note), true, "break outside note");

b = N.buildRecords(rows("11/24,青木,9:00〜17:00,12:00-12:45、15:00-15:15\n11/24,石井,10時-14時,60分\n11/24,上田,公休,\n11/25,江藤,2026/11/25 9:00-12:00,"),
  { map: { date: 0, person: 1, range: 2, brange: 3 }, mode: "one", year: 2026, overnight: true });
eq(b.recs.length, 3, "one recs"); eq(b.offs, 1, "one off");
eq(b.recs[0].parts, [[B + 540, B + 720], [B + 765, B + 900], [B + 915, B + 1020]], "two breaks");
eq(/長さだけ/.test(b.recs[1].note), true, "break minutes note");

// 予約の人数の列
b = N.buildRecords(rows("11/24,18:00,20:00,4名\n11/24,19:00,21:00,\n11/24,19:00,21:00,多い"), { map: { date: 0, start: 1, end: 2, count: 3 }, mode: "two", year: 2026 });
eq(b.recs.map(function (r) { return r.cnt; }), [4, 1], "count col"); eq(b.errors.length, 1, "count err");

// 決まり
var R = N.parseRules("9:00-12:00 2\n平日 12:00〜14:00 3人\n土日 10:00-18:00 4\n月水金 17:00-19:00 2名以上\n11/29 9:00-17:00 6\nあいう\n火〜木 8時-9時 1", 2026);
eq(R.rules.length, 6, "rules n"); eq(R.errors.length, 1, "rules err");
eq(R.rules[3].days, [1, 3, 5], "mwf"); eq(R.rules[5].days, [2, 3, 4], "range days");
// 2026/11/24 は火曜、11/28 は土曜、11/29 は日曜
var tue = D, sat = N.parseDate("2026/11/28").day, sun = N.parseDate("2026/11/29").day, mon = N.parseDate("2026/11/23").day;
eq(N.needAt(R.rules, tue, 600), 2, "tue 10:00"); eq(N.needAt(R.rules, tue, 720), 3, "tue 12:00"); eq(N.needAt(R.rules, tue, 840), null, "tue 14:00");
eq(N.needAt(R.rules, sat, 600), 4, "sat later rule wins"); eq(N.needAt(R.rules, sat, 720), 4, "sat 12 not weekday");
eq(N.needAt(R.rules, mon, 1050), 2, "mon 17:30"); eq(N.needAt(R.rules, tue, 1050), null, "tue 17:30");
eq(N.needAt(R.rules, sun, 600), 6, "date beats weekday"); eq(N.needAt(R.rules, tue, 480), 1, "tue 8:00");
eq(N.parseRules("22:00-6:00 1").rules[0].to, 1440 + 360, "overnight rule");

// 数える
b = N.buildRecords(rows("11/24,A,9:00,17:00,12:00,13:00\n11/24,B,9:30,12:00,,\n11/24,C,12:00,18:00,,"), { map: { date: 0, person: 1, start: 2, end: 3, bstart: 4, bend: 5 }, mode: "two", year: 2026 });
R = N.parseRules("9:00-18:00 2");
var c = N.countSlots(b.recs, R.rules, { step: 30, from: 540, to: 1080, how: "full" });
eq(c.slots.length, 18, "slots");
eq(c.days[0].cells.map(function (x) { return x.n; }), [1, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1], "full counts");
var sh = N.shortages(c);
eq(sh.map(function (x) { return [N.hm(x.from), N.hm(x.to), x.n, x.short]; }), [["9:00", "9:30", 1, 1], ["12:00", "13:00", 1, 1], ["17:00", "18:00", 1, 1]], "shortages merged");
eq([c.days[0].max, N.hm(c.days[0].maxAt.from), c.days[0].people, c.days[0].workMin], [2, "9:30", 3, 420 + 150 + 360], "day summary");
var c2 = N.countSlots(b.recs, null, { step: 60, from: 540, to: 1080, how: "any" });
eq(c2.days[0].cells.map(function (x) { return x.n; }), [2, 2, 2, 1, 2, 2, 2, 2, 1], "any counts");
// 職種でしぼる
b = N.buildRecords(rows("11/24,A,9:00,12:00,ホール\n11/24,B,9:00,12:00,キッチン\n11/25,C,9:00,10:00,ホール"), { map: { date: 0, person: 1, start: 2, end: 3, group: 4 }, mode: "two", year: 2026 });
eq(N.groupsOf(b.recs), ["キッチン", "ホール"], "groups");
c = N.countSlots(b.recs, null, { step: 60, from: 540, to: 720, how: "full", group: "ホール" });
eq(c.days.map(function (d) { return d.cells.map(function (x) { return x.n; }); }), [[1, 1, 1], [1, 0, 0]], "group filter");
// 夜をまたぐ
b = N.buildRecords(rows("11/24,A,22:00,6:00\n11/25,B,0:00,8:00"), { map: { date: 0, person: 1, start: 2, end: 3 }, mode: "two", year: 2026, overnight: true });
c = N.countSlots(b.recs, null, { step: 120, from: 1320, to: 1440 + 480, how: "full", days: [D] });
eq(c.days[0].cells.map(function (x) { return x.n; }), [1, 2, 2, 2, 1], "overnight view (B on next day counted)");

// 速さ
var big = "日付,氏名,出勤,退勤\n"; for (var i = 0; i < 20000; i++) big += "2026/11/" + (1 + i % 30) + ",P" + i + "," + (7 + i % 6) + ":00," + (14 + i % 8) + ":30\n";
var t0 = Date.now(); b = N.buildRecords(rows(big).slice(1), { map: { date: 0, person: 1, start: 2, end: 3 }, mode: "two", year: 2026 });
c = N.countSlots(b.recs, N.parseRules("8:00-22:00 300").rules, { step: 30, from: 480, to: 1320, how: "full" });
var ms = Date.now() - t0; eq(b.recs.length, 20000, "big rows"); console.log("20000行・30日・30分刻み:", ms, "ms");
console.log(n - bad + "/" + n + " OK"); if (bad) process.exit(1);
