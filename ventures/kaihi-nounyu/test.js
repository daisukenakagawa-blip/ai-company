// 関数のテスト：node test.js
var K = require("./kaihi.js"), n = 0, bad = 0;
function eq(a, b, msg) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG", msg, "\n  got ", A, "\n  want", B); } }
var map = K.makeMap();

// 月の読み方
var ctx = { year: 2026 };
eq(["4月", "5月分", "12月", "1月", "3月会費"].map(function (h) { return K.mIso(K.parseMonth(h, ctx).mk); }), ["2026-04", "2026-05", "2026-12", "2027-01", "2027-03"], "年度の表で年が進む");
eq(["2026/4", "2026年4月", "R8.4", "令和8年5月", "202606", "46113", "2026-04-01", "4月分(前期)"].map(function (h) { var p = K.parseMonth(h, { year: 2000 }); return p && K.mIso(p.mk); }), ["2026-04", "2026-04", "2026-04", "2026-05", "2026-06", "2026-04", "2026-04", "2000-04"], "いろいろな月の書き方");
eq(["番号", "氏名", "合計", "13月", ""].map(function (h) { return K.parseMonth(h, {}); }), [null, null, null, null, null], "月でないもの");

// 金額・記号
eq(["3,000", "¥3000", "3000円", "3千円", "1.5万", "abc"].map(K.parseAmount), [3000, 3000, 3000, 3000, 15000, null], "金額");
function st(v, due, bu) { var e = K.evalCell(v, due == null ? 3000 : due, map, bu !== false); return e.s + (e.paid ? e.paid : "") + (e.short ? "-" + e.short : "") + (e.over ? "+" + e.over : ""); }
eq(["済", "○", "〇", "✓", "4/10", "2026/4/10", "済(4/10)", "入金済4/10", "3000", "3,000円", "済 3,000円"].map(function (v) { return st(v); }), Array(11).fill("F3000"), "納入済みの書き方");
eq(["1500", "一部 1000", "0", "×", "未", "未納", ""].map(function (v) { return st(v); }), ["H1500-1500", "H1000-2000", "A-3000", "A-3000", "A-3000", "A-3000", "A-3000"], "一部と未納");
eq(["免除", "休会", "-", "免除(兄弟)", "入会前"].map(function (v) { return st(v); }), ["X", "X", "X", "X", "X"], "対象外");
eq(st("6000"), "F6000+3000", "多い額");
eq(st("", 3000, false), "N", "空欄を数えない");
eq(st("済?"), "U", "読めない");
eq(st("済", 0), "F", "会費0なら金額なし");
eq(st(["1000", "2000"]), "F3000", "同じ月に2回の入金を足す");
eq(st(["1000", "済"]), "F3000", "金額と済が両方");
// 記号の書き換え
var m2 = K.makeMap({ P: "済,ok", A: "未", X: "免" });
eq([K.readCell("ok", m2).k, K.readCell("○", m2).k, K.readCell("ＯＫ", m2).k], ["P", "U", "P"], "記号の書き換え・全角");

// 名前×月の表
var H = ["番号", "氏名", "班", "月額", "4月", "5月", "6月", "合計", "備考"];
var rows = [
  ["1", "青木 一郎", "1班", "3000", "済", "済", "", "", ""],
  ["2", "石井 花子", "1班", "2000", "2000", "1000", "免除", "", ""],
  ["3", "上田 健", "2班", "", "済", "×", "済?", "", ""],
  ["4", "青木 一郎", "1班", "3000", "済", "済", "済", "", ""],
  ["", "合計", "", "", "", "", "", "", ""]];
var g = K.guessWide(H, rows);
eq([g.name, g.group, g.due, g.months], [1, 2, 3, [4, 5, 6]], "列の推定（番号・合計・備考を外す、月額の列）");
eq(K.guessShape(H, rows), "wide", "形の推定（名前×月）");
var M = K.buildWide(H, rows, g, { year: 2026 });
eq([M.people.length, M.dup.length, M.people[0].due, M.people[2].due], [3, 1, 3000, null], "同じ名前は最初の行、月額");
var R = K.run(M, { map: map, fee: 3000 });
eq(R.per.map(function (r) { return [r.c.F, r.c.H, r.c.A, r.c.X, r.c.U, r.paid, r.short]; }), [[2, 0, 1, 0, 0, 6000, 3000], [1, 1, 0, 1, 0, 3000, 1000], [1, 0, 1, 0, 1, 3000, 3000]], "1人ごと");
eq(R.lines.map(function (l) { return l.name + ":" + K.mIso(l.mk) + ":" + l.s + ":" + l.short; }), ["青木 一郎:2026-06:A:3000", "石井 花子:2026-05:H:1000", "上田 健:2026-05:A:3000"], "未納の一覧");
eq(R.byMonth.map(function (x) { return [x.target, x.F, x.paid, x.short]; }), [[3, 3, 8000, 0], [3, 1, 4000, 4000], [1, 0, 0, 3000]], "月ごと");
eq([R.total.unpaidPeople, R.total.paid, R.total.short, R.unknown.length], [3, 12000, 7000, 1], "合計");
eq(R.groups.map(function (G) { return [G.name, G.n, G.unpaidPeople, G.short]; }), [["1班", 2, 2, 4000], ["2班", 1, 1, 3000]], "組ごと");
// 数える月の範囲
var R2 = K.run(M, { map: map, fee: 3000, fromMk: K.mkOf(2026, 4), toMk: K.mkOf(2026, 5) });
eq([R2.months.length, R2.outside, R2.total.short], [2, 1, 4000], "数える月の範囲");
// 空欄を数えない
var R3 = K.run(M, { map: map, fee: 3000, blank: "skip" });
eq(R3.per[0].c.N, 1, "空欄を数えない");
// 月ごとの会費
var M4 = K.buildWide(H, rows, { name: 1, months: [4, 5, 6] }, { year: 2026 });
var R4 = K.run(M4, { map: map, fee: 3000, perMonthFee: (function () { var o = {}; o[K.mkOf(2026, 5)] = 1000; return o; })() });
eq([R4.per[1].cells[1].s, R4.per[1].short, R4.per[0].short], ["F", 1000, 3000], "月ごとの会費（5月は1000円）");
// 人数の制限
eq(K.run(M, { map: map, fee: 3000, limit: 2 }).cut, 1, "お試し版の人数の制限");
// 会費0（月の数だけ）
var R5 = K.run(M4, { map: map, fee: 0 });
eq([R5.per[1].c.F, R5.per[1].c.H, R5.total.short], [2, 0, 0], "会費0なら金額は見ない");

// 名前が横の表
var Tr = K.transpose([["氏名", "4月", "5月"], ["A", "済", ""], ["B", "", "済"]]);
var gT = K.guessWide(Tr[0], Tr.slice(1));
eq([Tr[0].length, gT.months.length], [3, 0], "名前が横の表は入れ替えて使う（入れ替え前は月の列なし）");

// 1行に1件
var LH = ["入金日", "氏名", "対象月", "金額"];
var LR = [["2026/4/10", "青木", "4月", "3000"], ["2026/5/12", "青木", "5月", "1000"], ["2026/5/20", "青木", "5月", "2000"], ["2026/4/11", "石井", "4月", "3000"], ["", "", "", ""]];
var gl = K.guessLong(LH, LR);
eq([gl.month, gl.name, gl.pay], [2, 1, 3], "1行1件の列の推定");
eq(K.guessShape(LH, LR), "long", "形の推定（1行1件）");
var ML = K.buildLong(LH, LR, gl, { year: 2026, roster: "青木\n石井\n上田,2班,2000" });
var RL = K.run(ML, { map: map, fee: 3000 });
eq(RL.per.map(function (r) { return r.name + ":" + r.c.F + ":" + r.short; }), ["青木:2:0", "石井:1:3000", "上田:0:4000"], "1行1件＋名簿（分けて入金・名簿の月額）");
var ML2 = K.buildLong(LH, LR, gl, { year: 2026, fromMk: K.mkOf(2026, 4), toMk: K.mkOf(2026, 6) });
eq(ML2.months.length, 3, "1行1件で記録のない月も範囲に入れる");

// 速さ
var big = [["氏名"].concat(Array.from({ length: 24 }, function (_, i) { return (2025 + Math.floor((i + 3) / 12)) + "/" + ((i + 3) % 12 + 1); }))];
for (var i = 0; i < 3000; i++) big.push(["人" + i].concat(Array.from({ length: 24 }, function (_, j) { return (i + j) % 7 ? "済" : ((i + j) % 3 ? "" : "1500"); })));
var t0 = Date.now(), gb = K.guessWide(big[0], big.slice(1)), Rb = K.run(K.buildWide(big[0], big.slice(1), gb, {}), { map: map, fee: 3000 });
var ms = Date.now() - t0;
eq([gb.months.length, Rb.per.length], [24, 3000], "3000人×24か月");
console.log("3000人×24か月：" + ms + " ms");

CSV: eq(K.parseCSV('a,"b,c"\r\n1,"2""3"\n'), [["a", "b,c"], ["1", '2"3']], "CSV");
console.log(n - bad + "/" + n + " OK");
process.exit(bad ? 1 : 0);
