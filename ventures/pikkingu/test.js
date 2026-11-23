// node test.js — 関数のテスト
var K = require("./pikking.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
eq("数", [K.num("1,200"), K.num("12個"), K.num("３"), K.num(""), isNaN(K.num("少し"))], [1200, 12, 3, null, true]);
eq("列1", K.guessColumns(["注文番号", "お届け先", "商品コード", "商品名", "数量", "棚番"]), { shelf: 5, order: 0, code: 2, qty: 4, dest: 1, name: 3 });
eq("列2", K.guessColumns(["受注No", "購入者", "SKU", "品名", "個数", "ロケーション"]), { shelf: 5, order: 0, code: 2, qty: 4, dest: 1, name: 3 });
eq("列3", K.guessColumns(["伝票番号", "得意先コード", "得意先名", "品番", "品名", "出荷数"]), { order: 0, code: 3, qty: 5, dest: 2, name: 4 });
eq("列4", K.guessColumns(["商品名", "数"]), { qty: 1, name: 0 });
// 棚番の順
var sh = ["A-10", "A-2", "", "B-1", "A-1-10", "A-1-2", "Ａ－３", "10", "2"];
eq("棚番の順", sh.slice().sort(K.shelfCmp), ["2", "10", "A-1-2", "A-1-10", "A-2", "Ａ－３", "A-10", "B-1", ""]);
// マスタ
var M = K.master([["P1", "りんご", "B-2"], ["P-2", "みかん", "A-10"], ["P1", "りんご", "C-1"], ["P3", "", ""]], { code: 0, name: 1, shelf: 2 }, {});
eq("マスタ", [M.n, M.map.P1.shelf, M.map.P2.shelf, M.dup.length], [2, "B-2", "A-10", 1]);
// 明細
var C = { order: 0, dest: 1, code: 2, name: 3, qty: 4, shelf: 5 };
var R = [
  ["#1001", "山田", "P1", "りんご", "2", ""],
  ["", "", "P2", "みかん", "1", ""],
  ["#1002", "佐藤", "P-1", "りんご", "3", ""],
  ["#1002", "", "P4", "ぶどう", "1", "A-2"],
  ["#1003", "", "P2", "みかん", "2", "A-10"],
  ["#1003", "", "P9", "", "1", ""],
  ["#1004", "鈴木", "P1", "りんご", "なし", ""],
  ["", "", "", "", "", ""],
  ["#1004", "", "", "", "3", ""],
  ["#1005", "", "P4", "ぶどう", "0", ""]
];
var L = K.collect(R, C, {}, M);
eq("行", [L.lines.length, L.skip, L.errs.map(function (e) { return e.err; })], [6, 1, ["数量が数字でない（なし）", "品番・品名が空欄", "数量が0"]]);
eq("上の行の注文番号", [L.lines[1].order, L.lines[1].dest], ["#1001", "山田"]);
eq("届け先は注文ごと", L.lines[4].dest, "");
eq("マスタの棚番", [L.lines[0].shelf, L.lines[0].from, L.lines[3].from], ["B-2", "マスタ", "明細"]);
var X = K.run(L.lines, {});
eq("集品", X.items.map(function (x) { return [x.shelf, x.code, x.qty, x.orders.length]; }), [["A-2", "P4", 1, 1], ["A-10", "P2", 3, 2], ["B-2", "P1", 5, 2], ["", "P9", 1, 1]]);
eq("件数", X.count, { orders: 3, items: 4, lines: 6, qty: 10, noShelf: 1, multiShelf: 0 });
eq("注文ごと（棚の順）", X.orders.map(function (o) { return [o.order, o.dest, o.lines.map(function (l) { return l.code; }), o.qty, o.kinds]; }), [["#1001", "山田", ["P2", "P1"], 3, 2], ["#1002", "佐藤", ["P4", "P-1"], 4, 2], ["#1003", "", ["P2", "P9"], 3, 2]]);
eq("棚番なしのメモ", X.items[3].notes, ["棚番なし"]);
eq("配分", X.items[2].orders, [{ order: "#1001", qty: 2 }, { order: "#1002", qty: 3 }]);
var Y = K.run(L.lines, { batch: 2 });
eq("まとまり", Y.batches.map(function (b) { return [b.orders.map(function (o) { return o.order; }), b.items.length, b.qty]; }), [[["#1001", "#1002"], 3, 7], [["#1003"], 2, 3]]);
// ハイフンを区別
var L2 = K.collect(R, C, { hyphen: false }, K.master([["P1", "", "B-2"]], { code: 0, shelf: 2 }, { hyphen: false }));
eq("ハイフンを区別", K.run(L2.lines, {}).items.length, 5);
// 引き継がない
var L3 = K.collect(R, C, { inherit: false }, M);
eq("引き継がない", K.run(L3.lines, {}).orders.length, 4);
// 棚番が2か所・品名違い
var L4 = K.collect([["1", "", "Z", "ねじ", "1", "C-1"], ["2", "", "Z", "ネジ M3", "2", "C-5"]], C, {}, null);
eq("2か所", K.run(L4.lines, {}).items[0].notes, ["棚番が 2 か所（C-1・C-5）", "品名が違う行あり（ねじ／ネジ M3）"]);
// 注文番号の列なし・品名だけ
var L5 = K.collect([["りんご", "2"], ["ﾘﾝｺﾞ", "1"], ["リンゴ", "1"]], { name: 0, qty: 1 }, {}, null);
var X5 = K.run(L5.lines, {});
eq("品名だけ（ひらがなとカタカナは別の品）", [X5.items.map(function (x) { return [x.name, x.qty]; }), X5.orders.length], [[["りんご", 2], ["ﾘﾝｺﾞ", 2]], 1]);
eq("小数", K.run(K.collect([["1", "", "A", "", "0.5", ""], ["2", "", "A", "", "1.25", ""]], C, {}, null).lines, {}).items[0].qty, 1.75);
eq("CSV", K.toCSV([["a", "b,c"], ['"x"', ""]]), "﻿a,\"b,c\"\r\n\"\"\"x\"\"\",\r\n");
// 速さ
var big = []; for (var i = 0; i < 30000; i++) big.push(["#" + Math.floor(i / 3), "", "P" + (i % 2000), "品" + (i % 2000), String(i % 4 + 1), String.fromCharCode(65 + i % 5) + "-" + (i % 37)]);
var t = Date.now(); var XB = K.run(K.collect(big, C, {}, null).lines, { batch: 50 }); var ms = Date.now() - t;
eq("3万行", [XB.count.orders, XB.batches.length, XB.count.items], [10000, 200, 2000]);
console.log((n - bad) + "/" + n + " OK", "3万行 " + ms + "ms");
