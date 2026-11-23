// node test.js — 計算部分のテスト
var K = require("./kiroku.js");
var n = 0, ng = 0;
function eq(a, b, msg) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { ng++; console.log("NG " + msg + "\n  got " + A + "\n  exp " + B); } }

// タイムの読み方
[["12.34", 12340, 2], ["12秒34", 12340, 2], ["1:05.20", 65200, 2], ["1分05秒20", 65200, 2], ["1分5秒", 65000, 0], ["1.05.20", 65200, 2],
 ["65.2", 65200, 1], ["1'05\"20", 65200, 2], ["2:10:30", 7830000, 0], ["1時間2分3秒", 3723000, 0], ["１２．３４", 12340, 2], ["8.9秒", 8900, 1], ["4:32.1", 272100, 1]]
  .forEach(function (t) { var r = K.readRecord(t[0], "low"); eq(r && [r.st, r.v, r.dec], ["ok", t[1], t[2]], "time " + t[0]); });
eq(K.readRecord("1:75.0", "low").st, "bad", "time 75秒");
eq(K.readRecord("DNS", "low").st, "none", "DNS");
eq(K.readRecord("棄権", "low").st, "none", "棄権");
eq(K.readRecord("", "low"), null, "空欄");
eq(K.readRecord("12.34(+2.5)", "low").wind, 2.5, "風の読み取り");
eq(K.readRecord("12.34（-0.3）", "low").v, 12340, "風つきの記録");
// 距離・回数
[["5m20", 5200, "m"], ["5.20m", 5200, "m"], ["520cm", 5200, "m"], ["5m5", 5050, "m"], ["45.3", 45300, ""], ["120回", 120000, "回"], ["1,200", 1200000, ""]]
  .forEach(function (t) { var r = K.readRecord(t[0], "high"); eq(r && [r.st, r.v, r.unit], ["ok", t[1], t[2]], "big " + t[0]); });
eq(K.readRecord("1:05", "high").st, "bad", "距離の欄にタイム");
// 方向の推定
eq(K.guessDir("走り幅跳び", ["4.20"]), "high", "幅跳び");
eq(K.guessDir("ソフトボール投げ", ["25"]), "high", "投げ");
eq(K.guessDir("50m自由形", ["35.2"]), "low", "自由形");
eq(K.guessDir("100m", ["14.2"]), "low", "100m");
eq(K.guessDir("なわとび", ["120"]), "high", "なわとび");
eq(K.guessDir("1500m", ["5:12.3"]), "low", "1500m");
// 表示
eq(K.fmtTime(65200, 2), "1:05.20", "fmt 1:05.20");
eq(K.fmtTime(12340, 2), "12.34", "fmt 12.34");
eq(K.fmtTime(7830000, 0), "2:10:30", "fmt 2:10:30");
eq(K.fmtTime(59990, 2), "59.99", "fmt 59.99");
eq(K.fmtTime(60000, 2), "1:00.00", "fmt 1:00.00");
// 日付
eq(K.parseDate("2026/5/10").label, "2026/5/10", "date /");
eq(K.parseDate("2026-05-10").label, "2026/5/10", "date -");
eq(K.parseDate("令和8年5月10日").label, "2026/5/10", "date 令和");
eq(K.parseDate("R8.5.10").label, "2026/5/10", "date R");
eq(K.parseDate("46152").label, "2026/5/10", "date serial");
eq(K.parseDate("2/3", { year: 2026, fiscal: true }).label, "2027/2/3", "date 年度");
eq(K.parseDate("5/10", { year: 2026 }).label, "2026/5/10", "date 年なし");
eq(K.parseDate("2026/2/30"), null, "date 不正");
// 列の推定
var H = ["日付", "氏名", "学年", "種目", "記録", "風"];
eq(K.guessCols(H), { rec: 4, date: 0, name: 1, event: 3, wind: 5, group: 2 }, "列の推定");
eq(K.guessShape(H, []), "long", "形 long");
eq(K.guessCols(["日付", "記録会", "氏名", "種目", "記録"]), { rec: 4, date: 0, name: 2, event: 3, meet: 1 }, "記録会の列を記録と取り違えない");
var HW = ["番号", "名前", "クラス", "50m走", "立ち幅跳び", "ソフトボール投げ", "備考"];
var RW = [["1", "青木", "5-1", "8.9", "165", "25", ""], ["2", "石井", "5-1", "9.4", "150", "18", "見学"]];
eq(K.guessShape(HW, RW), "wide", "形 wide");
eq(K.guessEventCols(HW, RW, K.guessCols(HW)), [3, 4, 5], "種目の列");

// 集計
var rows = [
  ["2026/4/10", "青木 一郎", "5年", "50m", "8.9"],
  ["2026/5/10", "青木一郎", "5年", "50m", "8.7"],
  ["2026/6/10", "青木 一郎", "5年", "50m", "8.8"],
  ["2026/7/10", "青木 一郎", "5年", "50m", "8.7"],
  ["2026/8/10", "青木 一郎", "5年", "50m", "8.5(+2.4)"],
  ["2026/9/10", "青木 一郎", "5年", "50m", "8.6"],
  ["2026/4/10", "石井 花子", "5年", "50m", "9.1"],
  ["2026/5/10", "石井 花子", "5年", "50m", "欠場"],
  ["2026/6/10", "石井 花子", "5年", "50m", "8.6"],
  ["2026/4/10", "石井 花子", "5年", "走り幅跳び", "3m10"],
  ["2026/6/10", "石井 花子", "5年", "走り幅跳び", "3m25"],
  ["2026/6/10", "上田 健", "4年", "50m", "9.x"]
];
var heads = ["日付", "氏名", "学年", "種目", "記録"];
var en = K.toEntries(heads, rows, { shape: "long", cols: K.guessCols(heads), year: 2026 });
eq(en.length, 12, "entries");
var evl = K.eventsOf(en);
eq(evl.map(function (e) { return [e.name, e.guess]; }), [["50m", "low"], ["走り幅跳び", "high"]], "種目と方向");
var dirs = {}; evl.forEach(function (e) { dirs[e.key] = e.guess; });
var R = K.run(en, { dirs: dirs, windLimit: 2.0 });
var A = R.pairs[0];
eq([A.person.name, A.ev.name, A.n, K.fmtVal(A.best.v, A.ev), A.best.e.dayLabel], ["青木 一郎", "50m", 6, "8.6", "2026/9/10"], "青木 50m ベスト（追い風参考の 8.5 を除く）");
eq(A.recs.map(function (r) { return r.mark; }), ["初記録", "自己ベスト", "", "タイ", "追い風参考", "自己ベスト"], "青木の印");
eq(K.fmtVal(R.pairs[0].best.v, A.ev), "8.6", "最後に更新");
eq(K.fmtGain(A.gainTotal, A.ev), "0.3秒短縮", "伸び 初回→ベスト");
eq(A.recs[2].diffPrev, -100, "前回との差（遅くなった）");
var B = R.pairs[1];
eq([B.person.name, B.ev.name, B.n, B.nAll, K.fmtVal(B.best.v, B.ev)], ["石井 花子", "50m", 2, 3, "8.6"], "石井 50m（欠場は数えない）");
var C = R.pairs[2];
eq([C.ev.name, K.fmtVal(C.best.v, C.ev), K.fmtGain(C.gainTotal, C.ev)], ["走り幅跳び", "3.25m", "+0.15m"], "幅跳び");
eq(R.bad.length, 1, "読めない記録");
eq(R.pbTotal, 4, "自己ベスト更新の件数");
eq(R.days.map(function (d) { return [d.label, d.n, d.pb.length]; }), [["2026/4/10", 3, 0], ["2026/5/10", 2, 1], ["2026/6/10", 4, 2], ["2026/7/10", 1, 0], ["2026/8/10", 1, 0], ["2026/9/10", 1, 1]], "日ごと");
eq(R.ranks[0].list.map(function (P) { return [P.person.name, P.rank]; }), [["青木 一郎", 1], ["石井 花子", 1]], "同記録は同順位");
var R2 = K.run(en, { dirs: dirs, windLimit: null });
eq(K.fmtVal(R2.pairs[0].best.v, R2.pairs[0].ev), "8.5", "風を見ないとき");
var R3 = K.run(en, { dirs: dirs, windLimit: 2.0, limit: 1 });
eq([R3.people.length, R3.cut, R3.pairs.length], [1, true, 1], "人数の制限");
// 1行に1人の表
var enW = K.toEntries(HW, RW, { shape: "wide", cols: K.guessCols(HW), eventCols: [3, 4, 5] });
eq(enW.length, 6, "wide entries");
var dW = {}; K.eventsOf(enW).forEach(function (e) { dW[e.key] = e.guess; });
eq(dW, { "50m走": "low", "立ち幅跳び": "high", "ソフトボール投げ": "high" }, "wide の方向");
// 日付なし（行の順）
var enN = K.toEntries(["名前", "記録"], [["青木", "1:10.5"], ["青木", "1:08.9"], ["青木", "1:09.0"]], { shape: "long", cols: { name: 0, rec: 1 }, fixedEvent: "200m" });
var RN = K.run(enN, { dirs: { "200m": "low" } });
eq([K.fmtVal(RN.pairs[0].best.v, RN.pairs[0].ev), RN.noDate], ["1:08.9", true], "日付なし");
// 大量
var big = [], i, j;
for (i = 0; i < 2000; i++) for (j = 0; j < 20; j++) big.push(["2026/" + (1 + j % 12) + "/" + (1 + (j % 28)), "選手" + i, "", "100m", (13 + Math.random() * 2).toFixed(2)]);
var t0 = Date.now(), eb = K.toEntries(heads, big, { shape: "long", cols: K.guessCols(heads) }), RB = K.run(eb, { dirs: { "100m": "low" } });
console.log("2,000人×20回=40,000件: " + (Date.now() - t0) + "ms, pairs " + RB.pairs.length);
console.log(n + " tests, " + ng + " NG");
process.exit(ng ? 1 : 0);
