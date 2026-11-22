// node test.js — 関数のテスト
var K = require("./kenpin.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
eq("数1", [K.num("1,200"), K.num("12個"), K.num("３"), K.num(""), isNaN(K.num("少し")), K.num("2cs")], [1200, 12, 3, null, true, 2]);
eq("列1", K.guessColumns(["品番", "品名", "発注数", "単位", "単価", "金額"]), { price: 4, amount: 5, code: 0, name: 1, qty: 2, unit: 3 });
eq("列2", K.guessColumns(["得意先コード", "商品コード", "商品名", "入数", "数量"]), { code: 1, lot: 3, name: 2, qty: 4 });
eq("列3", K.guessColumns(["伝票番号", "コード", "品名", "納品数"]), { code: 1, name: 2, qty: 3 });
eq("列4", K.guessColumns(["商品名", "数"]), { name: 0, qty: 1 });
eq("発注点チェックの保存形式", K.guessColumns(["発注番号","仕入先","品番","品名","発注する数","単位","単価","金額","在庫","入荷予定","発注点","目標在庫","元の行"]), { price: 6, amount: 7, code: 2, name: 3, qty: 4, unit: 5 });
eq("鍵", [K.codeKey("ab-12 3", {}), K.codeKey("AB123", {}), K.codeKey("ＡＢ－１２３", {}), K.codeKey("AB-123", { hyphen: false })], ["AB123", "AB123", "AB123", "AB-123"]);
eq("先頭0", [K.codeKey("0012", { zero: true }), K.codeKey("12", { zero: true }), K.codeKey("0012", {}), K.codeKey("0", { zero: true })], ["12", "12", "0012", "0"]);
eq("品名", K.nameKey("ボールペン（黒） ０．５ｍｍ") === K.nameKey("ﾎﾞｰﾙﾍﾟﾝ(黒)0.5mm"), true);
var CA = { code: 0, name: 1, qty: 2, price: 3 }, CB = { code: 0, name: 1, qty: 2, price: 3 };
var A = [["A-1", "りんご", "10", "100"], ["A-2", "みかん", "5", "80"], ["A-3", "ぶどう", "3", "300"], ["A-4", "もも", "2", "250"], ["A-5", "なし", "4", "120"], ["A-1", "りんご", "2", "100"]];
var B = [["A1", "りんご", "12", "100"], ["A-2", "みかん", "4", "80"], ["A-3", "ぶどう", "5", "320"], ["A-9", "なし", "4", "120"], ["B-1", "キウイ", "6", "90"], ["", "", ""]];
var R = K.run(A, CA, B, CB, { by: "auto" });
eq("件数", R.count, { ok: 1, short: 1, over: 1, missing: 2, extra: 2, price: 1 });
eq("状態", R.res.map(function (x) { return [x.code, x.status, x.diff]; }), [["A-1", "ok", 0], ["A-2", "short", -1], ["A-3", "over", 2], ["A-4", "missing", -2], ["A-5", "missing", -4], ["A-9", "extra", 4], ["B-1", "extra", 6]]);
eq("合計の注記", R.res[0].notes, ["注文に 2 行（合計して比べました）"]);
eq("単価", R.res[2].notes, ["単価が違う（注文 300／届いた 320）"]);
eq("組", [R.res[4].pair === R.res[5], /品名が同じ/.test(R.res[4].notes[0]), R.res[3].pair || null], [true, true, null]);
eq("空行は飛ばす", R.skipB, 1);
var R2 = K.run(A, CA, B, CB, { by: "auto", hyphen: false });
eq("ハイフンを区別", [R2.res[0].status, R2.count.extra], ["missing", 3]);
var R3 = K.run([["", "りんご", "3"], ["", "ﾐｶﾝ", "2"]], { code: 0, name: 1, qty: 2 }, [["X", "リンゴ", "3"], ["", "ミカン", "2"]], { code: 0, name: 1, qty: 2 }, { by: "name" });
eq("品名で", R3.res.map(function (x) { return x.status; }), ["missing", "ok", "extra"]);
var R4 = K.run([["A", "x", "abc"], ["", "", "3"], ["B", "y", ""]], { code: 0, name: 1, qty: 2 }, [], { code: 0, qty: 1 }, { by: "auto" });
eq("誤り", R4.errA.map(function (e) { return e.err; }), ["数量が数字でない（abc）", "品番・品名が空欄", "数量が空欄"]);
var R5 = K.run([["A", "ボールペン", "10"]], { code: 0, name: 1, qty: 2 }, [["A", "消しゴム", "10"]], { code: 0, name: 1, qty: 2 }, { by: "code" });
eq("品名違い", R5.res[0].notes, ["品名が違う（注文：ボールペン／届いた：消しゴム）"]);
var R6 = K.run([["A", "", "3"]], { code: 0, qty: 2 }, [["A", "", "なし"]], { code: 0, qty: 2 }, {});
eq("読めない行の注記", [R6.res[0].status, R6.res[0].warn, R6.res[0].errRowsB], ["missing", true, [0]]);
eq("一致の合計だけは warn なし", !!R.res[0].warn, false);
eq("小数", K.run([["A", "", "1.1"], ["A", "", "2.2"]], { code: 0, qty: 2 }, [["A", "", "3.3"]], { code: 0, qty: 2 }, {}).res[0].status, "ok");
eq("CSV", K.toCSV([["a", "b,c"], ['"x"', ""]]), "﻿a,\"b,c\"\r\n\"\"\"x\"\"\",\r\n");
// 速さ：2万行ずつ
var big = [], big2 = []; for (var i = 0; i < 20000; i++) { big.push(["P" + i, "品" + i, String(i % 7 + 1)]); big2.push(["P" + (i + 50), "品" + (i + 50), String(i % 7 + 1)]); }
var t = Date.now(), RB = K.run(big, { code: 0, name: 1, qty: 2 }, big2, { code: 0, name: 1, qty: 2 }, {}); var ms = Date.now() - t;
var big3 = big.map(function (r) { return ["Q" + r[0], r[1], r[2]]; }); var t2 = Date.now(); var RC = K.run(big, { code: 0, name: 1, qty: 2 }, big3, { code: 0, name: 1, qty: 2 }, {}); var ms2 = Date.now() - t2;
eq("全部品番違い・品名で組", [RC.count.missing, RC.res[0].pair === RC.res[20000]], [20000, true]);
eq("大量の件数", [RB.count.missing, RB.count.extra], [50, 50]);
console.log((bad ? "NG " + bad + "/" : "OK ") + n + " 件（2万行×2：" + ms + " ミリ秒、品番が全部違う2万行×2：" + ms2 + " ミリ秒）");
