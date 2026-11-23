// node test.js — 関数のテスト
var K = require("./kaitei.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
eq("価格", [K.yen("1,980"), K.yen("¥1,980"), K.yen("１９８０円"), K.yen("1980-"), K.yen(""), isNaN(K.yen("時価"))], [1980, 1980, 1980, 1980, null, true]);
eq("税率", [K.taxRate("", 10), K.taxRate("8%", 10), K.taxRate("軽減", 10), K.taxRate("※", 10), K.taxRate("10%(標準)", 8), K.taxRate("0.08", 10), K.taxRate("8%(軽減)", 10), isNaN(K.taxRate("5%", 10))], [10, 8, 8, 8, 10, 8, 8, true]);
function R(s) { var r = K.parseRule(s); return r ? (r.err ? "ERR" : r.kind + ":" + (r.v == null ? "" : r.v)) : null; }
eq("改定の書き方", ["5%", "+5%", "５％", "-3%", "3%引き", "5%値上げ", "+30円", "-50", "＋３０", "=1980", "→1,980円", "1980円に", "据え置き", "0%", "", "30", "100%引き"].map(R),
  ["pct:5", "pct:5", "pct:5", "pct:-3", "pct:-3", "pct:5", "add:30", "add:-50", "add:30", "set:1980", "set:1980", "set:1980", "none:", "none:", null, "ERR", "ERR"]);
// 端数
eq("端数1", [K.roundPrice(1050.0000000000002, { unit: 1, dir: "up" }), K.roundPrice(1051, { unit: 10, dir: "up" }), K.roundPrice(1055, { unit: 10, dir: "near" }), K.roundPrice(1059, { unit: 10, dir: "down" }), K.roundPrice(1234, { unit: 100, dir: "up" })], [1050, 1060, 1060, 1050, 1300]);
eq("末尾", [K.roundPrice(1052, { suffix: "8", dir: "up" }), K.roundPrice(1058, { suffix: "8", dir: "up" }), K.roundPrice(1059, { suffix: "8", dir: "up" }), K.roundPrice(1052, { suffix: "8", dir: "down" }), K.roundPrice(1052, { suffix: "80", dir: "up" }), K.roundPrice(1052, { suffix: "80", dir: "near" }), K.roundPrice(1040, { suffix: "98", dir: "near" }), K.roundPrice(1100, { suffix: "980", dir: "up" }), K.roundPrice(5, { suffix: "8", dir: "down" })],
  [1058, 1058, 1068, 1048, 1080, 1080, 998, 1980, 8]);
// 税
eq("税込", [K.inclOf(1000, 10, "down"), K.inclOf(1818, 10, "down"), K.inclOf(1818, 10, "near"), K.inclOf(999, 8, "down"), K.inclOf(30, 10, "up")], [1100, 1999, 2000, 1078, 33]);
eq("税抜", [K.exclOf(1100, 10, "down"), K.exclOf(1080, 10, "down"), K.exclOf(1099, 10, "down"), K.exclOf(1078, 8, "down")], [{ v: 1000, ok: true }, { v: 982, ok: true }, { v: 999, ok: false }, { v: 999, ok: true }]);
// 全部の税抜 0〜20000 で、税込から戻すと元に戻る
var okAll = true; for (var x = 0; x <= 20000; x++) { [10, 8].forEach(function (r) { ["down", "near", "up"].forEach(function (d) { var e = K.exclOf(K.inclOf(x, r, d), r, d); if (!e.ok || e.v !== x) okAll = false; }); }); }
eq("税抜の往復 2万件×6", okAll, true);
// 列
eq("列1", K.guessColumns(["商品コード", "商品名", "部門", "税区分", "売価(税込)", "改定"]), { rule: 5, tax: 3, cat: 2, code: 0, price: 4, name: 1 });
eq("列2", K.guessColumns(["JAN", "品名", "本体価格", "消費税額"]), { code: 0, price: 2, name: 1 });
eq("税込か", [K.guessSide("売価(税込)"), K.guessSide("本体価格"), K.guessSide("価格")], ["in", "ex", null]);
// 計算：税抜で改定・10円単位切り上げ
var cols = { code: 0, name: 1, cat: 2, tax: 3, price: 4, rule: 5 };
var rows = [
  ["A1", "りんご", "食品", "軽減", "300", ""],
  ["A2", "皿", "雑貨", "", "1,000", ""],
  ["A3", "箸", "雑貨", "", "500", "据え置き"],
  ["A4", "布巾", "雑貨", "", "480", "+20円"],
  ["A5", "鍋", "雑貨", "", "2980", "=3280"],
  ["A6", "", "", "", "", ""],
  ["A7", "謎", "雑貨", "", "時価", ""],
  ["A8", "変", "雑貨", "5%", "100", ""],
  ["A9", "誤", "雑貨", "", "100", "たくさん"]
];
var cats = K.parseCatRules("食品 +3%\n雑貨：5%\nおかしな行");
eq("分類の改定", [cats.n, cats.errs.length, cats.map["食品"].v], [2, 1, 3]);
var o = { input: "ex", side: "ex", def: 10, rule: K.parseRule("2%"), cats: cats.map, round: { unit: 10, dir: "up" }, taxDir: "down", keep: true };
var res = K.run(rows, cols, o);
eq("件数", [res.items.length, res.errs.length, res.count.changed, res.count.same], [5, 4, 4, 1]);
eq("読めない行", res.errs.map(function (e) { return e.code + ":" + e.err.slice(0, 4); }), ["A6:価格が空", "A7:価格が数", "A8:税率が読", "A9:改定の書"]);
eq("りんご 食品+3% 軽減", (function (x) { return [x.oldEx, x.oldIn, x.newEx, x.newIn, x.from]; })(res.items[0]), [300, 324, 310, 334, "分類"]);
eq("皿 雑貨+5%", (function (x) { return [x.newEx, x.newIn, x.diff, x.pct]; })(res.items[1]), [1050, 1155, 55, 5]);
eq("箸 行で据え置き", [res.items[2].changed, res.items[2].from], [false, "行"]);
eq("布巾 +20円", [res.items[3].newEx, res.items[3].newIn], [500, 550]);
eq("鍋 =3280（端数処理しない）", [res.items[4].newEx, res.items[4].newIn], [3280, 3608]);
// 税込で改定・末尾8に切り上げ
var o2 = { input: "in", side: "in", def: 10, rule: K.parseRule("5%"), cats: {}, round: { suffix: "8", dir: "up" }, taxDir: "down", keep: true };
var r2 = K.run([["X", "見本", "", "", "1,100", ""], ["Y", "見本2", "", "", "1,099", ""]], { code: 0, name: 1, price: 4 }, o2);
eq("税込で改定", [r2.items[0].oldEx, r2.items[0].newIn, r2.items[0].newEx, r2.items[1].newIn, r2.items[1].notes.length > 0], [1000, 1158, 1053, 1158, true]);
// 値上げなのに切り捨てで下がる → 元のまま
var r3 = K.run([["Z", "見本", "", "", "1,050", ""]], { code: 0, name: 1, price: 4 }, { input: "ex", side: "ex", def: 10, rule: K.parseRule("1%"), cats: {}, round: { unit: 100, dir: "down" }, taxDir: "down", keep: true });
eq("下がらない", [r3.items[0].newEx, r3.items[0].changed, r3.items[0].notes.length], [1050, false, 1]);
var r4 = K.run([["Z", "見本", "", "", "1,050", ""]], { code: 0, name: 1, price: 4 }, { input: "ex", side: "ex", def: 10, rule: K.parseRule("1%"), cats: {}, round: { unit: 100, dir: "down" }, taxDir: "down", keep: false });
eq("下がる（オフ）", r4.items[0].newEx, 1000);
var r5 = K.run([["Z", "袋", "", "", "5", ""]], { code: 0, name: 1, price: 4 }, { input: "in", side: "in", def: 10, rule: K.parseRule("5%"), cats: {}, round: { suffix: "80", dir: "up" }, taxDir: "down", keep: true });
eq("改定率が大きく変わる品のメモ", [r5.items[0].newIn, /\+1,500%/.test(r5.items[0].notes.join(""))], [80, true]);
// 値札リスト
var g = K.tagList(res.items, true);
eq("値札リスト", g.map(function (x) { return x.cat + x.items.length; }), ["食品1", "雑貨3"]);
eq("CSV", K.toCSV([["a", "b,c"], [1, 'x"y']]), '﻿a,"b,c"\r\n1,"x""y"\r\n');
// 速さ
var big = []; for (var j = 0; j < 50000; j++) big.push(["C" + j, "品" + j, "分類" + (j % 20), j % 3 ? "" : "8", String(100 + j % 5000), ""]);
var t0 = Date.now(); var rb = K.run(big, cols, o); var ms = Date.now() - t0;
eq("5万行", [rb.items.length, ms < 2000], [50000, true]);
console.log(n + " 件中 " + (n - bad) + " 件 OK（5万行 " + ms + "ms）");
process.exit(bad ? 1 : 0);
