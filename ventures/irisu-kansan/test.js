// node test.js — 関数のテスト
var K = require("./irisu.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
var U = K.parseUnits();
eq("表示名", U.disp, { cs: "ケース", bl: "ボール", pc: "個" });
eq("重複なし", U.dup, []);
eq("入数", [K.intOf("24"), K.intOf("２４入"), K.intOf("24個入り"), K.intOf("1,200"), K.intOf(""), isNaN(K.intOf("約24"))], [24, 24, 24, 1200, null, true]);
function Q(s, d) { var q = K.parseQty(s, U, d || "pc"); return q ? (q.err ? "ERR" : (q.neg ? "-" : "") + q.parts.map(function (p) { return p.n + p.lv; }).join("+")) : null; }
eq("数量の書き方", ["2ケース", "1ケース5個", "1C3B4", "2cs+5", "3", "▲2ケース", "1.5ケース", "２ｹｰｽ", "1C/S", "3ボール", "1ケース・2ボール", "1ケースと3本", "10本", "2箱", "", "ケース", "-5", "1 ケース 5 個"].map(function (s) { return Q(s); }),
  ["2cs", "1cs+5pc", "1cs+3bl+4pc", "2cs+5pc", "3pc", "-2cs", "1.5cs", "2cs", "1cs", "3bl", "1cs+2bl", "1cs+3pc", "10pc", "ERR", null, "ERR", "-5pc", "1cs+5pc"]);
eq("単位のない数の既定", Q("3", "cs"), "3cs");
var U2 = K.parseUnits({ cs: "箱,ケース", bl: "", pc: "個" });
eq("呼び方の変更", [K.parseQty("2箱", U2, "pc").parts[0].lv, U2.disp.cs], ["cs", "箱"]);
eq("分ける", [K.split(29, 24, 6), K.split(53, 24, 6), K.split(5, 24, 6), K.split(30, 24, null), K.split(13, null, 6), K.split(-29, 24, 6), K.split(48, 24, 6)],
  [{ c: 1, b: 0, p: 5 }, { c: 2, b: 0, p: 5 }, { c: 0, b: 0, p: 5 }, { c: 1, b: 0, p: 6 }, { c: 0, b: 2, p: 1 }, { c: -1, b: 0, p: -5 }, { c: 2, b: 0, p: 0 }]);
eq("分ける2", K.split(41, 24, 6), { c: 1, b: 2, p: 5 });
eq("表記", [K.label({ c: 1, b: 2, p: 5 }, U, true, true), K.label({ c: 2, b: 0, p: 0 }, U, true, true), K.label({ c: 0, b: 0, p: 0 }, U, true, true), K.label({ c: -1, b: 0, p: -5 }, U, true, true)], ["1ケース 2ボール 5個", "2ケース", "0個", "-1ケース 5個"]);
eq("切り上げ", [K.roundUp(29, 24, 6, "cs"), K.roundUp(29, 24, 6, "bl"), K.roundUp(48, 24, 6, "cs"), K.roundUp(29, null, null, "cs").err != null, K.roundUp(29, 24, 6, "none")],
  [{ v: 48, units: 2, add: 19 }, { v: 30, units: 5, add: 1 }, { v: 48, units: 2, add: 0 }, true, null]);
// 入数の表
var M = K.buildMaster([["A1", "見本の水", "24", "6"], ["A2", "見本の茶", "12入", ""], ["A3", "見本の菓子", "", ""], ["A1", "見本の水", "12", "6"], ["A4", "見本の飴", "x", "1"]], { code: 0, name: 1, cs: 2, bl: 3 });
eq("入数の表", [M.n, M.errs.length, M.warns.length, M.byCode.A1.cs, K.lookup(M, "", "見本の茶").cs, K.lookup(M, "a1", "").cs, K.lookup(M, "ZZ", "") === null], [3, 2, 1, 24, 12, 24, true]);
// 換算
var rows = [
  ["A1", "見本の水", "2ケース", ""],
  ["A1", "見本の水", "1ケース5個", ""],
  ["A2", "見本の茶", "3", "ケース"],
  ["A2", "見本の茶", "7", ""],
  ["A1", "見本の水", "3ボール", ""],
  ["B9", "見本の新商品", "1ケース", ""],
  ["B9", "見本の新商品", "4", ""],
  ["A2", "見本の茶", "1ボール", ""],
  ["A1", "見本の水", "2袋入", ""],
  ["A1", "見本の水", "1", "ダース"],
  ["A1", "見本の水", "▲1ケース", ""]
];
var R = K.run(rows, { code: 0, name: 1, qty: 2, unit: 3 }, { units: U, defLv: "pc", master: M, round: "cs" });
eq("件数", R.count, { total: 11, conv: 7, err: 4, missing: 1, memo: 1 });
eq("バラ数", R.items.map(function (x) { return x.total; }), [48, 29, 36, 7, 18, 4, -24]);
eq("表記", R.items.map(function (x) { return x.text; }), ["2ケース", "1ケース 5個", "3ケース", "7個", "3ボール", "4個", "-1ケース"]);
eq("エラー", R.errs.map(function (x) { return x.err.slice(0, 8); }), ["入数の表にない品", "ボール入数があり", "単位「袋入」が分", "単位「ダース」が"]);
eq("入数の表にない品", R.missing, [{ code: "B9", name: "見本の新商品", n: 1 }]);
eq("バラは入数の表になくても", R.items[5].ru.err != null, true);
eq("品ごとの合計", R.sums.map(function (s) { return [s.code, s.total, s.text, s.ru && s.ru.v]; }), [["A1", 71, "2ケース 3ボール 5個", 72], ["A2", 43, "3ケース 7個", 48], ["B9", 4, "4個", undefined]]);
// 行の入数の列
var R2 = K.run([["X", "2ケース", "10", ""], ["Y", "1ケース3", "", ""], ["A1", "1ケース", "20", ""]], { name: 0, qty: 1, cs: 2, bl: 3 }, { units: U, defLv: "pc", master: K.buildMaster([["見本の水", "24"]], { name: 0, cs: 1 }), round: "none" });
eq("行の入数", [R2.items.length, R2.items[0].total, R2.errs.length], [2, 20, 1]);
var R3 = K.run([["見本の水", "1ケース", "20"]], { name: 0, qty: 1, cs: 2 }, { units: U, defLv: "pc", master: K.buildMaster([["見本の水", "24"]], { name: 0, cs: 1 }), round: "none" });
eq("行の入数が優先・メモ", [R3.items[0].total, R3.items[0].notes.length], [20, 1]);
var R4 = K.run([["W", "1.5ケース"], ["W", "0.3ケース"], ["W", "1ケース30個"]], { name: 0, qty: 1 }, { units: U, defLv: "pc", master: K.buildMaster([["W", "24", "6"]], { name: 0, cs: 1, bl: 2 }), round: "none" });
eq("小数・多すぎるバラ", [R4.items.map(function (x) { return x.total; }), R4.errs.length, R4.items[1].notes[0]], [[36, 54], 1, "バラの数が1ボール分以上です"]);
eq("割り切れない入数", K.run([["V", "1"]], { name: 0, qty: 1 }, { units: U, defLv: "pc", master: K.buildMaster([["V", "20", "6"]], { name: 0, cs: 1, bl: 2 }) }).items[0].notes, ["ケース入数 20 がボール入数 6 で割り切れません"]);
eq("列1", K.guessColumns(["商品コード", "商品名", "受注数", "単位", "ケース入数", "ボール入数"]), { cs: 4, bl: 5, unit: 3, qty: 2, code: 0, name: 1 });
eq("列2", K.guessColumns(["JAN", "品名", "入数"], ["code", "name", "cs", "bl"]), { cs: 2, code: 0, name: 1 });
// 速さ
var big = [], mr = []; for (var i = 0; i < 50000; i++) { big.push(["P" + (i % 2000), "", (i % 3) + "ケース" + (i % 7)]); }
for (var j = 0; j < 2000; j++) mr.push(["P" + j, String(6 + j % 30), "3"]);
var t = Date.now(); var RB = K.run(big, { code: 0, name: 1, qty: 2 }, { units: U, defLv: "pc", master: K.buildMaster(mr, { code: 0, cs: 1, bl: 2 }), round: "cs" }); var sec = (Date.now() - t) / 1000;
eq("5万行", [RB.count.conv, RB.sums.length, sec < 1], [50000, 2000, true]);
console.log("5万行", sec, "秒");
console.log(n - bad + "/" + n + " OK");
