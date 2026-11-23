// 関数のテスト：node test.js
var K = require("./shusseki.js");
var n = 0, bad = 0;
function eq(a, b, msg) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + msg + "\n  got " + A + "\n  exp " + B); } }

// 日付
var ctx = { year: 2026 };
eq(K.ymdStr(K.parseDate("4/5(土)", ctx).dn), "2026-04-05", "m/d 曜日つき");
eq(K.ymdStr(K.parseDate("12月20日", ctx).dn), "2026-12-20", "m月d日");
eq(K.ymdStr(K.parseDate("1/10", ctx).dn), "2027-01-10", "年をまたぐ");
eq(K.ymdStr(K.parseDate("2026/11/23", {}).dn), "2026-11-23", "y/m/d");
eq(K.ymdStr(K.parseDate("2026-11-23 00:00:00", {}).dn), "2026-11-23", "Excel の日付（時刻つき）");
eq(K.ymdStr(K.parseDate("46349", {}).dn), "2026-11-23", "シリアル値");
eq(K.ymdStr(K.parseDate("令和8年4月1日", {}).dn), "2026-04-01", "令和");
eq(K.parseDate("第3回", {}), null, "日付でない見出し");
eq(K.parseDate("2/30", { year: 2026 }), null, "ない日付");

// 記号
var map = K.makeMap();
eq(["○", "〇", "◯", "1", "出", "×", "x", "X", "欠", "0", "遅", "△", "早", "公", "-", "", "？", "○(遅)", "出席（早退）"].map(function (v) { return K.classify(v, map); }),
  ["P", "P", "P", "P", "P", "A", "A", "A", "A", "A", "L", "L", "E", "X", "X", "B", "U", "L", "E"], "記号の区分");
var map2 = K.makeMap({ P: "○", L: "", E: "", A: "×,△", X: "" });
eq(K.classify("△", map2), "A", "記号の変更");

// 名前×日付の表
var csv = [
  "番号,氏名,学年,4/5,4/12,4/19,4/26,5/3,5/10,合計",
  "1,青木 一郎,3年,○,○,×,○,,○,4",
  "2,石井 花子,3年,○,遅,○,○,,×,4",
  "3,上田 健,2年,×,○,×,×,,×,1",
  "4,江藤 さくら,2年,○,公,○,○,,○,4",
  "合計,,,3,3,2,3,,2,"
].join("\n");
var rows = K.parseCSV(csv), headers = rows[0], body = rows.slice(1);
eq(K.guessShape(headers, body, map), "wide", "形の推定");
var g = K.guessWide(headers, body, map);
eq(g, { name: 1, group: 2, sessions: [3, 4, 5, 6, 7, 8] }, "列の推定（番号・合計は外す）");
var M = K.buildWide(headers, body, g, { year: 2026 });
eq(M.people.length, 4, "合計の行を飛ばす");
eq(M.skipped.length, 1, "飛ばした行");
var R = K.run(M, { map: map });
eq(R.sessions.length, 5, "全員空欄の 5/3 を外す");
eq(R.empty, ["5/3"], "外した回");
eq(R.per.map(function (r) { return [r.att, r.target, K.pct(r.rate)]; }), [[4, 5, "80.0%"], [4, 5, "80.0%"], [1, 5, "20.0%"], [4, 4, "100.0%"]], "1人ごと");
eq(R.per[2].maxRun, 3, "最大の連続欠席");
eq(R.per[2].recentRun, 3, "直近の連続欠席");
eq(R.per[0].recentRun, 0, "直近の連続欠席なし");
eq(R.per[1].c, { P: 3, L: 1, E: 0, A: 1, X: 0, B: 0, U: 0 }, "区分の数");
eq(R.bySes.map(function (s) { return [s.att, s.target]; }), [[3, 4], [3, 3], [2, 4], [3, 4], [2, 4]], "回ごと");
eq(R.flagged.map(function (r) { return r.name; }), ["上田 健"], "気になる人（70%）");
var R2 = K.run(M, { map: map, lateOk: false, threshold: 85, streak: 1 });
eq(R2.per.map(function (r) { return r.att; }), [4, 3, 1, 4], "遅刻を出席にしない");
eq(R2.flagged.map(function (r) { return r.name; }), ["青木 一郎", "石井 花子", "上田 健"], "気になる人（85%・1回）");
var R3 = K.run(M, { map: map, blank: "absent" });
eq(R3.sessions.length, 5, "空欄＝欠席でも全員空欄の回は外す");
eq(R3.per[1].target, 5, "空欄＝欠席");
eq(R.groups.map(function (G) { return [G.name, G.n, G.att, G.target]; }), [["3年", 2, 8, 10], ["2年", 2, 5, 9]], "組ごと");
eq(R.months.map(function (m) { return m.label; }), ["2026年4月", "2026年5月"], "月");
eq(R.byMonth[0].map(function (x) { return [x.att, x.target]; }), [[3, 4], [1, 1]], "月ごと");
var R4 = K.run(M, { map: map, from: K.dayNo(2026, 4, 12), to: K.dayNo(2026, 4, 30) });
eq([R4.sessions.length, R4.outside], [3, 3], "期間");
eq(K.run(M, { map: map, limit: 2 }).per.length, 2, "人数の制限");
eq(R.total.att + "/" + R.total.target, "13/19", "全体");

// 読めない記号
var M5 = K.buildWide(["氏名", "1回", "2回"], [["A", "○", "？"], ["B", "×", "○"]], { name: 0, sessions: [1, 2] });
var R5 = K.run(M5, { map: map });
eq(R5.unknown, [{ name: "A", row: 2, session: "2回", value: "?" }], "読めない記号の一覧");
eq(R5.per[0].target, 1, "読めない記号は数えない");

// 同じ名前
var M6 = K.buildWide(["氏名", "1回"], [["佐藤", "○"], ["佐 藤", "×"]], { name: 0, sessions: [1] });
eq([M6.people.length, M6.dup.length], [1, 1], "同じ名前は最初の行");

// 名前が横の表（入れ替え）
var tr = K.transpose([["日付", "青木", "石井"], ["4/5", "○", "×"], ["4/12", "○", "○"]]);
eq(tr, [["日付", "4/5", "4/12"], ["青木", "○", "○"], ["石井", "×", "○"]], "入れ替え");

// 1行1件の記録
var L = K.parseCSV("日付,氏名,出欠,クラス\n2026/4/5,青木,出席,A\n2026/4/5,石井,欠席,B\n2026/4/12,青木,欠席,A\n2026/4/12,石井,出席,B\n2026/4/19,青木,遅刻,A");
var lc = K.guessLong(L[0], L.slice(1));
eq(lc, { date: 0, name: 1, status: 2, group: 3 }, "1行1件の列");
eq(K.guessShape(L[0], L.slice(1), map), "long", "1行1件の形");
var LM = K.buildLong(L[0], L.slice(1), lc, {});
eq(LM.sessions.map(function (s) { return s.label; }), ["4/5(日)", "4/12(日)", "4/19(日)"], "回の並び");
var LR = K.run(LM, { map: map });
eq(LR.per.map(function (r) { return [r.name, r.att, r.target]; }), [["青木", 2, 3], ["石井", 1, 2]], "1行1件の集計（記録なしは数えない）");
// 来た人だけの記録＋名簿
var C = K.parseCSV("来た日,名前\n2026/4/5,青木\n2026/4/5,石井\n2026/4/12,青木\n2026/4/19,青木\n2026/4/19,青木");
var cc = K.guessLong(C[0], C.slice(1));
eq(cc, { name: 1, date: 0 }, "参加記録の列");
var CM = K.buildLong(C[0], C.slice(1), cc, { roster: "青木\n石井\n上田" });
var CR = K.run(CM, { map: map });
eq(CR.per.map(function (r) { return [r.name, r.att, r.target, r.recentRun]; }), [["青木", 3, 3, 0], ["石井", 1, 3, 2], ["上田", 0, 3, 3]], "参加記録：記録のない人は欠席");

// 速さ：300人×200回
var H = ["氏名"], big = [], sym = ["○", "×", "遅", "", "公"];
for (var j = 0; j < 200; j++) H.push("第" + (j + 1) + "回");
for (var i = 0; i < 300; i++) { var r = ["人" + i]; for (j = 0; j < 200; j++) r.push(sym[(i * 7 + j * 3) % 5]); big.push(r); }
var t0 = Date.now(), gw = K.guessWide(H, big, map), BM = K.buildWide(H, big, gw), BR = K.run(BM, { map: map });
var ms = Date.now() - t0;
eq([gw.sessions.length, BR.per.length], [200, 300], "大きな表");
console.log("300人×200回：" + ms + " ms");
console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
