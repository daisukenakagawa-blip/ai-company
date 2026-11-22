// node test.js — 関数のテスト
var H = require("./hacchu.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
// 数の読み方
eq("カンマ", H.num("1,200"), 1200); eq("単位", H.num("12個"), 12); eq("円", H.num("¥300"), 300); eq("全角", H.num("３．５"), 3.5);
eq("三角", H.num("△3"), -3); eq("空欄", H.num(""), null); eq("文字", isNaN(H.num("たくさん")), true); eq("kg", H.num("2.5kg"), 2.5);
// 列の推定
var hd = ["品番", "品名", "仕入先", "現在庫", "発注点", "目標在庫", "発注単位", "単位", "単価", "入荷予定", "最小発注数", "1日の使用数"];
eq("列", H.guessColumns(hd), { moq: 10, lot: 6, point: 4, target: 5, inc: 9, daily: 11, sup: 2, price: 8, code: 0, name: 1, unit: 7, stock: 3 });
eq("列2", H.guessColumns(["商品名", "在庫数", "最低在庫", "入数"]), { lot: 3, point: 2, name: 0, stock: 1 });
eq("列3", H.guessColumns(["商品コード", "商品名", "数量", "発注点"]), { point: 3, code: 0, name: 1, stock: 2 });
var C = { name: 0, stock: 1, point: 2, target: 3, lot: 4, moq: 5, inc: 6, price: 7 };
function q(r, opt) { var x = H.calcRow(r, 0, C, opt); return [x.need, x.qty]; }
eq("発注点より多い", q(["A", "10", "5", "", "", "", "", ""]), [false, 0]);
eq("発注点ちょうど（以下）", q(["A", "5", "5", "", "", "", "", ""]), [true, 1]);
eq("発注点ちょうど（下回ったら）", q(["A", "5", "5", "", "", "", "", ""], { rule: "lt" }), [false, 0]);
eq("下回ったら：4<5→1", q(["A", "4", "5", "", "", "", "", ""], { rule: "lt" }), [true, 1]);
eq("目標まで", q(["A", "8", "10", "30", "", "", "", ""]), [true, 22]);
eq("目標まで・10ずつ", q(["A", "8", "10", "30", "10", "", "", ""]), [true, 30]);
eq("目標まで・12ずつ（22→24）", q(["A", "8", "10", "30", "12", "", "", ""]), [true, 24]);
eq("目標なし・6ずつ：在庫3 発注点10→12で13", q(["A", "3", "10", "", "6", "", "", ""]), [true, 12]);
eq("目標なし・ちょうど：在庫4 点10 6ずつ→6で10は以下のため12", q(["A", "4", "10", "", "6", "", "", ""]), [true, 12]);
eq("目標なし・下回ったら：在庫4 点10 6ずつ→6で10", q(["A", "4", "10", "", "6", "", "", ""], { rule: "lt" }), [true, 6]);
eq("入荷予定を含める", q(["A", "3", "10", "20", "", "", "5", ""]), [true, 12]);
eq("書式", [H.fmt(1234567.5), H.fmt(-1200), H.fmt(0.1 + 0.2)], ["1,234,567.5", "-1,200", "0.3"]);
eq("入荷予定で発注点超え", q(["A", "3", "10", "20", "", "", "10", ""]), [false, 0]);
eq("最小発注数", q(["A", "8", "10", "12", "1", "20", "", ""]), [true, 20]);
eq("最小発注数・ロット", q(["A", "8", "10", "12", "6", "20", "", ""]), [true, 24]);
eq("小数", q(["A", "1.5", "2", "5", "0.5", "", "", ""]), [true, 3.5]);
eq("在庫マイナス", q(["A", "-2", "0", "10", "", "", "", ""]), [true, 12]);
eq("目標が発注点以下", q(["A", "5", "10", "5", "", "", "", ""]), [true, 6]);
var e = H.calcRow(["A", "たくさん", "5"], 0, C, {});
eq("在庫が数字でない", [!!e.err, e.need], [true, false]);
var e2 = H.calcRow(["A", "3", "5", "", "", "", "", "時価"], 0, C, {});
eq("単価が数字でない→注意だけ", [e2.err, e2.need, e2.price, e2.notes.length], ["", true, null, 1]);
eq("空行", H.calcRow(["", "", ""], 0, C, {}).skip, true);
// 仕入先ごと
var rows = [["A", "1", "5", "10", "", "", "", "100", "甲商事"], ["B", "9", "5", "", "", "", "", "", "乙"], ["C", "0", "2", "4", "", "", "", "250", "甲商事"], ["D", "0", "1", "", "", "", "", "", ""]];
var C2 = Object.assign({ sup: 8 }, C);
var R = H.run(rows, C2, {});
eq("件数", R.count, { total: 4, need: 3, ok: 1, err: 0 });
var G = H.groupBySupplier(R.res);
eq("まとめ", G.map(function (g) { return [g.sup, g.items.length, g.total, g.hasPrice]; }), [["甲商事", 2, 1900, true], [H.NOSUP, 1, 0, false]]);
var G2 = H.groupBySupplier(R.res, function (x) { return x.name === "A" ? 0 : x.qty; });
eq("手で0にした品は除く", G2[0].items.length, 1);
// あと何日
var CD = { name: 0, stock: 1, point: 2, daily: 3 };
eq("あと何日", H.calcRow(["A", "25", "5", "4"], 0, CD, {}).days, 6.2);
// 多い行
var big = []; for (var i = 0; i < 20000; i++) big.push(["品" + i, String(i % 50), "20", "60", "6", "", "", "120", "仕入先" + (i % 30)]);
var t0 = Date.now(); var RB = H.run(big, C2, {}); var GB = H.groupBySupplier(RB.res);
eq("2万行", [RB.count.need, GB.length], [8400, 30]);
console.log("2万行", (Date.now() - t0) + "ms");
console.log(n + " 件中 NG " + bad);
