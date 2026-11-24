/* node test.js */
var Z = require("./zaiseki.js"), n = 0, bad = 0;
function eq(a, b, msg) { n++; var s1 = JSON.stringify(a), s2 = JSON.stringify(b); if (s1 !== s2) { bad++; console.log("NG", msg, s1, "!=", s2); } }
var D = Z.fmt;
// 日付
eq(D(Z.oneDate("2025/4/1").n), "2025/4/1", "日付");
eq(D(Z.oneDate("2025年4月").n), "2025/4/1", "月だけ（始まり）");
eq(D(Z.oneDate("2025/2", true).n), "2025/2/28", "月だけ（終わり）");
eq(D(Z.oneDate("令和7年4月", false).n), "2025/4/1", "和暦の月");
eq(D(Z.oneDate("R7.4.10").n), "2025/4/10", "和暦の日付");
eq(D(Z.oneDate("45748").n), "2025/4/1", "Excel の番号");
eq(Z.oneDate("あした").bad, true, "読めない");
// 休会
var s = Z.parseSpans("2026/5/1〜2026/7/31");
eq([D(s.spans[0].a), D(s.spans[0].b)], ["2026/5/1", "2026/7/31"], "休会 日付");
s = Z.parseSpans("2026/11〜2"); eq([D(s.spans[0].a), D(s.spans[0].b)], ["2026/11/1", "2027/2/28"], "休会 月〜月（年またぎ）");
s = Z.parseSpans("2026/5"); eq([D(s.spans[0].a), D(s.spans[0].b)], ["2026/5/1", "2026/5/31"], "休会 1か月");
s = Z.parseSpans("2026/5/10〜"); eq([D(s.spans[0].a), s.spans[0].b], ["2026/5/10", null], "休会 終わりなし");
s = Z.parseSpans("2025/6〜2025/7、2026/1/5〜1/31"); eq(s.spans.length, 2, "休会 2つ"); eq(D(s.spans[1].b), "2026/1/31", "休会 2つ目の終わり");
s = Z.parseSpans("2026/7/1〜2026/5/1"); eq(s.bad.length, 1, "休会 逆");
s = Z.parseSpans("2026/5/10"); eq(s.bad.length, 1, "休会 日付1つ");
// 列
eq(Z.guessCols(["No", "氏名", "コース", "入会日", "退会日", "休会開始", "休会終了"]), { join: 3, leave: 4, ks: 5, ke: 6, name: 1, group: 2 }, "列の推定");
eq(Z.guessCols(["お名前", "クラス", "入塾日", "退塾日", "休会"]), { join: 2, leave: 3, kt: 4, name: 0, group: 1 }, "列の推定2");
// 計算
var H = ["名前", "コース", "入会日", "退会日", "休会"];
var rows = [
  ["A", "ピアノ", "2025/1/10", "", ""],
  ["B", "ピアノ", "2026/4/1", "2026/6/30", ""],     // 4月入会・6月末退会
  ["C", "英語", "2026/5/15", "", "2026/7〜2026/8"],  // 7・8月休会
  ["D", "英語", "2026/4/20", "2026/4/25", ""],      // 同じ月に入会・退会
  ["E", "英語", "2026/9/1", "", ""],                 // 期間の後
  ["F", "", "", "", ""],                             // 入会日なし
  ["G", "書道", "2026/6/1", "2026/5/1", ""],         // 逆
  ["合計", "", "", "", ""]
];
var o = { cols: Z.guessCols(H), y: 2026, m: 4, k: 4, kyuIn: true, rowBase: 2 };
var R = Z.run(H, rows, o), M = R.months;
eq(M.map(function (x) { return x.begin; }), [1, 2, 3, 2], "月初");
eq(M.map(function (x) { return x.joins; }), [2, 1, 0, 0], "入会");
eq(M.map(function (x) { return x.leaves; }), [1, 0, 1, 0], "退会");
eq(M.map(function (x) { return x.end; }), [2, 3, 2, 2], "月末");
eq(M.map(function (x) { return x.kyu; }), [0, 0, 0, 1], "休会中");
eq(M.map(function (x) { return x.active; }), [2, 3, 2, 1], "通っている");
eq(M.map(function (x) { return x.during; }), [3, 3, 3, 2], "月の中で在籍");
eq(M.map(function (x) { return x.kyuStart; }), [0, 0, 0, 1], "休会に入った");
eq(M.every(function (x) { return x.end === x.begin + x.joins - x.leaves; }), true, "月末＝月初＋入会−退会");
eq(R.checks.map(function (c) { return c.row + c.lv; }), ["7e", "8e"], "確かめたい所");
eq(R.counted, 5, "数えた人数");
eq(M[3].byG, { "ピアノ": 1, "英語": 1 }, "コースごと");
var P = {}; R.people.forEach(function (p) { P[p.name] = p; });
eq([P.A.months, P.A.inRange, P.A.status], [19, 4, "在籍"], "A 在籍月数");
eq([P.B.months, P.B.status], [3, "退会（2026/6/30）"], "B");
eq([P.C.status], ["休会中"], "C");
eq([P.E.status, P.E.months], ["期間の後に入会", 0], "E");
eq(Z.tenure(19), "1年7か月", "年と月"); eq(Z.tenure(24), "2年", "2年"); eq(Z.tenure(0), "0か月", "0");
// 休会を在籍に数えない
o.kyuIn = false; R = Z.run(H, rows, o);
eq(R.months.map(function (x) { return x.end; }), [2, 3, 2, 1], "休会を除く 月末");
eq(R.months.map(function (x) { return x.begin; }), [1, 2, 3, 2], "休会を除く 月初");
// 同じ名前
R = Z.run(H, [["X", "", "2025/1/1", "2025/3/31", ""], ["X", "", "2025/10/1", "", ""], ["Y", "", "2025/1/1", "", ""], ["Y", "", "2025/6/1", "", ""]], { cols: Z.guessCols(H), y: 2025, m: 1, k: 12, kyuIn: true });
eq(R.checks.length, 1, "重なる同じ名前は1件"); eq(R.people[1].rejoin, true, "再入会");
// お試し
R = Z.run(H, rows, { cols: Z.guessCols(H), y: 2026, m: 4, k: 4, kyuIn: true, limit: 3 }); eq([R.counted, R.cut], [3, 4], "お試しの制限");
// 速さ
var big = []; for (var i = 0; i < 5000; i++) big.push(["人" + i, "c" + (i % 5), (2015 + i % 11) + "/" + (1 + i % 12) + "/" + (1 + i % 28), i % 3 ? "" : (2026 + i % 2) + "/" + (1 + i % 12) + "/15", i % 7 ? "" : "2026/3〜2026/5"]);
var t0 = Date.now(); R = Z.run(H, big, { cols: Z.guessCols(H), y: 2025, m: 4, k: 24, kyuIn: true }); var ms = Date.now() - t0;
eq(R.counted > 4000, true, "5000人"); console.log("5000人×24か月：" + ms + "ms");
console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
