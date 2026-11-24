// node test.js
var K = require("./kaisu.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + m + "\n  got " + A + "\n  exp " + B); } }
function wd(s) { var r = K.parseWeekdays(s); return r.bad ? "bad" : r.days.map(function (d) { return K.WD[d.w] + (d.nth ? d.nth.join("") : ""); }).join(","); }

// 曜日
eq(wd("火"), "火", "曜日 1文字"); eq(wd("火曜日"), "火", "曜日 曜日"); eq(wd("月曜"), "月", "曜日 月曜"); eq(wd("火・金"), "火,金", "曜日 ・");
eq(wd("毎週 水曜 17:00〜17:30"), "水", "曜日 時刻つき"); eq(wd("土日"), "土,日", "曜日 土日"); eq(wd("日曜日"), "日", "曜日 日曜日");
eq(wd("第1・3土"), "土13", "曜日 第1・3"); eq(wd("第2・第4水曜"), "水24", "曜日 第2・第4"); eq(wd("Tue, Fri"), "火,金", "曜日 英語");
eq(wd("木 16時半"), "木", "曜日 16時半"); eq(wd("月4回 金曜"), "金", "曜日 月4回"); eq(wd("隔週土"), "bad", "曜日 隔週"); eq(wd("あいう"), "bad", "曜日 読めない");
eq(K.parseWeekdays("").empty, true, "曜日 空");

// 日付の一覧
var P = { a: K.dn(2026, 12, 1), b: K.dn(2026, 12, 31) };
var D = K.parseDayLines("12/29〜1/3 年末年始\n12/24 リトミック\n2026/12/9（水）\n12月16日 (発表会の準備)\n1/5\nあ\n2/30\n12/1-12/3 火", P, false);
eq(D.items.filter(function (x) { return x.line === 1; }).length, 6, "休講 範囲 12/29〜1/3 は6日");
eq(K.iso(D.items[5].n), "2027-01-03", "休講 年をまたぐ"); eq(D.items[0].note, "", "休講 年末年始は対象");
eq(D.items[6].target, "リトミック", "休講 対象"); eq(K.iso(D.items[7].n), "2026-12-09", "休講 年と曜日つき");
eq([K.iso(D.items[8].n), D.items[8].note, D.items[8].target], ["2026-12-16", "発表会の準備", ""], "休講 （）はメモ");
eq(K.iso(D.items[9].n), "2027-01-05", "休講 年なし 1/5 は期間に近い年"); eq(D.bad.map(function (b) { return b.line; }), [6, 7], "休講 読めない行");
eq(D.items.filter(function (x) { return x.line === 8; }).map(function (x) { return K.iso(x.n) + x.target; }), ["2026-12-01火", "2026-12-02火", "2026-12-03火"], "休講 12/1-12/3 対象つき");
var A = K.parseDayLines("12/26 火\n12/27", P, true);
eq([A.items.length, A.items[0].wd, A.bad.length], [1, 2, 1], "追加の日 対象が必要");

// 計算
var H = ["名前", "コース", "曜日", "入会日", "退会日"];
var rows = [
  ["青木", "ピアノ", "火", "", ""],
  ["石井", "ピアノ", "火・金", "", ""],
  ["上田", "リトミック", "木", "", ""],
  ["江藤", "ピアノ", "水", "2026/12/14", ""],
  ["大野", "ピアノ", "土", "", "2026/12/12"],
  ["加藤", "英語", "第1・3土", "", ""],
  ["木村", "ピアノ", "", "", ""],
  ["合計", "", "", "", ""],
  ["工藤", "ピアノ", "月", "2027/1/9", ""]
];
var g = K.guessCols(H, rows);
eq([g.name, g.course, g.wd, g.join, g.leave], [0, 1, 2, 3, 4], "列の推定");
var o = { cols: g, y: 2026, m: 12, k: 1, off: "12/29〜1/3\n12/24 リトミック", add: "12/26 火 (振替)", holidays: true, nenmatsu: false, fifth: false, cap: 0, useJoin: true, rowBase: 2 };
var R = K.run(H, rows, o);
function c(nm) { return R.lines.filter(function (L) { return L.name === nm; })[0].months[0]; }
// 2026年12月：火 1,8,15,22,29 / 金 4,11,18,25 / 木 3,10,17,24,31 / 水 2,9,16,23,30 / 土 5,12,19,26
eq([c("青木").count, c("青木").lessons.map(function (x) { return x.n; }).map(K.md)], [5, ["12/1(火)", "12/8(火)", "12/15(火)", "12/22(火)", "12/26(土)"]], "火曜 12/29休み・12/26の追加");
eq(c("石井").count, 9, "火・金 5+4"); eq([c("上田").count, c("上田").offs.map(function (x) { return x.why; })], [3, ["休講日（リトミック）", "休講日"]], "木 12/24 リトミック休み・12/31");
eq([c("江藤").count, c("江藤").status], [2, "途中から（入会 12/14(月)）"], "水 12/14入会 → 16,23（12/30は休講）");
eq([c("大野").count, c("大野").status], [2, "途中まで（退会 12/12(土)）"], "土 12/12退会 → 5,12");
eq(c("加藤").count, 2, "第1・3土 → 5,19（12/26は第4週）"); eq(c("木村").count, 0, "曜日空欄は0回");
eq([c("工藤").count, c("工藤").status], [0, "入会前"], "入会前");
eq(R.lines.length, 8, "合計の行を外す"); eq(R.checks.filter(function (x) { return x.lv === "e"; }).length, 1, "誤り1件（曜日空欄）");
eq(R.checks.some(function (x) { return x.name === "工藤"; }), false, "入会前は0回の警告なし");
eq(R.days.filter(function (d) { return K.md(d.n) === "12/26(土)"; })[0].people, 2, "12/26 は青木・石井の追加だけ（大野は退会後、加藤は第4週）");
// 祝日
var R2 = K.run(H, [["a", "x", "月"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2027, m: 1, k: 1, holidays: true, nenmatsu: true, rowBase: 2 });
eq(R2.lines[0].months[0].offs.map(function (x) { return K.md(x.n) + x.why; }), ["1/11(月)成人の日"], "1月の月曜 成人の日（1/4 は年末年始でない）");
var R3 = K.run(H, [["a", "x", "金"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2027, m: 1, k: 1, holidays: true, nenmatsu: true, rowBase: 2 });
eq(R3.lines[0].months[0].offs.map(function (x) { return K.md(x.n) + x.why; }), ["1/1(金)年末年始"], "1/1 は年末年始");
// 第5週・上限
var R4 = K.run(H, [["a", "x", "火"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 12, k: 1, fifth: true, rowBase: 2 });
eq(R4.lines[0].months[0].count, 4, "第5週は休み");
var R5 = K.run(H, [["a", "x", "火・金"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 12, k: 1, cap: 4, rowBase: 2 });
eq([R5.lines[0].months[0].count, R5.lines[0].months[0].offs.length], [4, 5], "月4回まで");
// 複数の月
var R6 = K.run(H, [["a", "x", "火"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 11, k: 3, holidays: true, rowBase: 2 });
eq(R6.lines[0].months.map(function (x) { return x.count; }), [3, 5, 4], "11〜1月の火曜（11/3 文化の日）");
eq(R6.byWd.filter(function (b) { return b.w === 2; }).map(function (b) { return b.lessons.length; }), [3, 5, 4], "曜日ごとの暦");
// お試しの制限
var R7 = K.run(H, rows, Object.assign({}, o, { limit: 3 }));
eq([R7.lines.length, R7.cut], [3, 5], "お試し 3人まで");
// 1人ごと
var R8 = K.run(H, [["a", "ピアノ", "火"], ["a", "ソルフェ", "金"], ["b", "x", "月"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 12, k: 1, rowBase: 2 });
eq(R8.per.map(function (p) { return p.name + p.total; }), ["a9", "b4"], "1人ごとにまとめる");
// 当たらない対象
var R9 = K.run(H, [["a", "ピアノ", "火"]], { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 12, k: 1, off: "12/8 バレエ", add: "12/26 そろばん", rowBase: 2 });
eq(R9.warnLines.length, 2, "当たる人がいない行");
// 速さ
var big = []; for (var i = 0; i < 3000; i++) big.push(["p" + i, "c" + (i % 5), K.WD[i % 7] + (i % 3 ? "" : "・" + K.WD[(i + 3) % 7])]);
var t0 = Date.now(), RB = K.run(H, big, { cols: { name: 0, course: 1, wd: 2 }, y: 2026, m: 4, k: 12, holidays: true, off: "8/10〜8/16\n12/29〜1/3", rowBase: 2 }); var ms = Date.now() - t0;
eq(RB.lines.length, 3000, "3000人×12か月"); console.log("3000人×12か月: " + ms + " ms");
console.log((n - bad) + "/" + n + " OK");
