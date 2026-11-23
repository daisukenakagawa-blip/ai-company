// node test.js
var H = require("./happyo.js");
var n = 0, ng = 0;
function eq(a, b, msg) { n++; var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { ng++; console.log("NG", msg, x, "≠", y); } }

// 長さ
eq(H.parseDur("3"), 180, "3");
eq(H.parseDur("3分"), 180, "3分");
eq(H.parseDur("3.5"), 210, "3.5");
eq(H.parseDur("3:30"), 210, "3:30");
eq(H.parseDur("３分３０秒"), 210, "全角");
eq(H.parseDur("210秒"), 210, "秒");
eq(H.parseDur("3'30\""), 210, "3'30\"");
eq(H.parseDur("0:03:30"), 210, "0:03:30");
eq(H.parseDur("約4分"), 240, "約4分");
eq(H.parseDur("4分間"), 240, "分間");
eq(H.parseDur("1時間"), 3600, "1時間");
eq(H.parseDur(""), null, "空");
eq(isNaN(H.parseDur("長め")), true, "読めない");
// 時刻
eq(H.parseClock("13:00"), 46800, "13:00");
eq(H.parseClock("13:00:30"), 46830, "秒つき");
eq(H.parseClock("13時30分"), 48600, "13時30分");
eq(H.parseClock("13時半"), 48600, "半");
eq(H.parseClock("午後1時"), 46800, "午後");
eq(H.parseClock("1:30PM"), 48600, "PM");
eq(H.parseClock("15:00〜"), 54000, "〜");
eq(isNaN(H.parseClock("昼すぎ")), true, "読めない時刻");
eq(H.clock(46800 + 330), "13:05", "表示 切り捨て");
eq(H.clock(46800 + 330, true), "13:05:30", "表示 秒");
eq(H.durLabel(210), "3分30秒", "長さ表示");
eq(H.durLabel(240), "4分", "長さ表示2");
eq(H.durLabel(30), "30秒", "長さ表示3");
// 名前
eq(H.splitNames("青木 さくら・田中 ゆい（連弾）", true), ["青木 さくら", "田中 ゆい"], "連弾");
eq(H.splitNames("ジョン・スミス", false), ["ジョン・スミス"], "分けない");
eq(H.splitNames("A & B", true), ["A", "B"], "&");
// 列
var cols = H.guessCols(["出演順", "氏名", "曲名", "作曲者", "演奏時間", "開始時刻", "部", "備考"]);
eq(cols, { fixed: 5, dur: 4, order: 0, composer: 3, name: 1, title: 2, part: 6, memo: 7 }, "列の推定");

// 計算
var head = ["順", "名前", "曲名", "時間", "開始時刻"];
var rows = [
  ["", "", "開会のことば", "2", ""],
  ["1", "青木", "曲A", "3:00", ""],
  ["2", "石井", "曲B", "2分30秒", ""],
  ["", "休憩", "", "10", ""],
  ["", "", "第2部", "", "13:40"],
  ["3", "上田", "曲C", "4", ""],
  ["4", "青木・上田", "連弾", "3", ""],
  ["5", "江藤", "曲D", "", ""],
  ["6", "大野", "曲E", "ながい", ""]
];
var c = H.guessCols(head);
var t = H.toItems(rows, { cols: c, headRows: 1, defDur: 180 });
eq(t.items.map(function (x) { return x.kind; }), ["item", "act", "act", "break", "head", "act", "act", "act", "act"], "種類");
eq(t.bad.length, 2, "空欄・読めない時間");
var R = H.run(t.items, { start: 13 * 3600, change: 60, callMode: "min", callN: 10, gather: 20, gapMin: 1, endAt: 14 * 3600 });
var L = R.list;
eq(L.map(function (x) { return H.clock(x.start, true); }), ["13:00:00", "13:03:00", "13:07:00", "13:09:30", "13:40:00", "13:40:00", "13:45:00", "13:49:00", "13:53:00"], "開始時刻");
eq(H.clock(R.end, true), "13:56:00", "終了");
eq(L[4].wait, 1230, "第2部の待ち");
eq(R.acts.map(function (a) { return a.num; }), [1, 2, 3, 4, 5, 6], "番号");
eq(H.clock(R.acts[0].call), "12:53", "袖入り 10分前");
eq(R.acts[0].callPre, true, "開演前の呼び出し");
eq(H.clock(R.acts[0].gather), "12:43", "集合 20分前");
eq(R.people.length, 5, "人数（連弾の2人は1人ずつ）");
var ao = R.people.filter(function (p) { return p.name === "青木"; })[0];
eq(ao.apps.length, 2, "青木 2回");
var ue = R.people.filter(function (p) { return p.name === "上田"; })[0];
eq(R.close.length, 1, "続けて出る人");
eq(R.close[0].person.name, "上田", "上田が続けて出る");
eq(R.close[0].between, 0, "あいだ0組");
eq(R.over, -4 * 60, "終了予定より4分早い");
eq(R.calls.length, 12, "呼び出し表の件数");
eq(R.calls[0].type, "集合", "最初は集合");
// 組前
var R2 = H.run(t.items, { start: 13 * 3600, change: 60, callMode: "acts", callN: 2 });
eq(H.clock(R2.acts[4].call, true), H.clock(R2.acts[2].start, true), "2組前");
eq(H.clock(R2.acts[2].call, true), "13:14:30", "休憩をはさむ組は休憩の終わる5分前");
eq(R2.acts[2].callBreak, true, "休憩中の呼び出しの印");
eq(R2.acts[1].callPre, true, "2組前がない人は開演時");
// 開始時刻の遅れ
var t3 = H.toItems([["a", "1", "10", ""], ["b", "2", "10", "13:05"]], { cols: { name: 0, order: 1, dur: 2, fixed: 3 } });
var R3 = H.run(t3.items, { start: 13 * 3600, change: 0 });
eq(R3.list[1].late, 300, "予定より遅れ");
// 順番の並べ替え
var t4 = H.toItems([["b", "2", "1"], ["a", "1", "1"], ["c", "", "1"]], { cols: { name: 0, order: 1, dur: 2 } });
eq(t4.items.map(function (x) { return x.name; }), ["a", "b", "c"], "順の並べ替え");
// お試し版の制限
var big = [];
for (var i = 0; i < 15; i++) big.push(["人" + i, "3"]);
big.splice(5, 0, ["休憩", "10"]);
var R5 = H.run(H.toItems(big, { cols: { name: 0, dur: 1 } }).items, { start: 0, limit: 10 });
eq([R5.acts.length, R5.cut], [10, 5], "制限");
eq(R5.list.length, 11, "制限内の休憩は含む");
// 合計
eq(R.total.actT, 180 + 150 + 240 + 180 + 180 + 180, "出演の合計");
eq(R.total.breakT, 600, "休憩の合計");
eq([R.total.itemT, R.total.waitT, R.total.changeT], [120, 1230, 5 * 60], "あいさつ・待ち・入れ替えの合計");
// 大きな表の速さ
var many = [];
for (i = 0; i < 2000; i++) many.push(["出演者" + (i % 700), "曲", String(2 + i % 5)]);
var t0 = Date.now();
var R6 = H.run(H.toItems(many, { cols: { name: 0, title: 1, dur: 2 } }).items, { start: 36000, change: 30, gather: 30, callN: 10, gapMin: 3 });
var ms = Date.now() - t0;
eq(R6.acts.length, 2000, "2000組");
console.log("2000組の計算 " + ms + " ms");
console.log(n + " 件中 " + (n - ng) + " 件 OK");
process.exit(ng ? 1 : 0);
