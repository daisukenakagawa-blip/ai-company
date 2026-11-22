// node test.js — 関数のテスト
var K = require("./buhin.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
eq("数", [K.num("1,200"), K.num("0.25m"), K.num("３個"), K.num(""), isNaN(K.num("少し")), K.num(".5")], [1200, 0.25, 3, null, true, 0.5]);
eq("列1", K.guessBom(["製品コード", "製品名", "部品コード", "部品名", "員数", "単位"]), { parent: 0, child: 2, qty: 4, childName: 3, parentName: 1, unit: 5 });
eq("列2", K.guessBom(["親品番", "子品番", "数量"]), { parent: 0, child: 1, qty: 2 });
eq("列3", K.guessBom(["セット", "中身", "中身の名前", "1個あたりの数"]), { parent: 0, child: 1, qty: 3, childName: 2 });
eq("列4", K.guessBom(["A", "B", "C"]), { parent: 0, child: 1, qty: 2 });
eq("列5", K.guessBom(["作る物", "材料", "材料名", "使用数", "単位"]), { parent: 0, child: 1, qty: 3, childName: 2, unit: 4 });
eq("在庫列", [K.guessStock(["品番", "品名", "在庫数"]), K.guessStock(["部品コード", "現在庫"]), K.guessStock(["材料", "数量"])], [{ qty: 2, code: 0, name: 1 }, { qty: 1, code: 0 }, { qty: 1, code: 0 }]);
// 2段の部品表：セットA = 箱1・袋2・リボン1、袋 = クッキー6・袋材1、セットB = 箱1・袋1・ジャム1
var BOM = [["SA", "BOX", "1"], ["SA", "BAG", "2"], ["SA", "RIB", "1"], ["BAG", "CK", "6"], ["BAG", "PK", "1"], ["SB", "BOX", "1"], ["SB", "BAG", "1"], ["SB", "JAM", "1"]];
var C = { parent: 0, child: 1, qty: 2 };
var g = K.buildBom(BOM, C, {});
eq("段", g.level, { SA: 0, BOX: 1, BAG: 1, CK: 2, PK: 2, RIB: 1, SB: 0, JAM: 1 });
eq("一番上", g.tops, ["SA", "SB"]);
var r = K.run(g, { SA: 10, SB: 5 }, null, {});
eq("必要数", r.res.map(function (x) { return [x.key, x.need]; }), [["BOX", 15], ["RIB", 10], ["CK", 150], ["PK", 25], ["JAM", 5], ["BAG", 25]]);
var st = { BOX: 20, RIB: 8, CK: 100, PK: 30, BAG: 5 };
var r2 = K.run(g, { SA: 10, SB: 5 }, st, { net: true });
eq("不足（途中の在庫を使う）", r2.res.map(function (x) { return [x.key, x.need, x.short, x.status]; }), [["BOX", 15, 0, "ok"], ["RIB", 10, 2, "short"], ["CK", 120, 20, "short"], ["PK", 20, 0, "ok"], ["JAM", 5, 5, "short"], ["BAG", 25, 0, "mid"]]);
eq("件数", r2.count, { leaf: 5, short: 3, ok: 2, mid: 1, nostock: 1 });
var r3 = K.run(g, { SA: 10, SB: 5 }, st, { net: false });
eq("途中の在庫を使わない", r3.res.filter(function (x) { return x.key === "CK"; })[0].short, 50);
eq("内訳", r.res[0].notes, ["内訳：SA 10・SB 5"]);
// 作れる数
var st2 = { BOX: 20, RIB: 8, CK: 100, PK: 30, BAG: 5, JAM: 3 };
var m = K.makeable(g, st2, { net: true });
eq("作れる数", m.map(function (x) { return [x.key, x.n, x.limit]; }), [["SA", 8, ["RIB"]], ["SB", 3, ["JAM"]]]);
// SA だけ：リボン 8 でも、クッキー：袋は在庫5＋作る (100/6=16) → 21袋 → 10セット分。リボンで 8
var st3 = { BOX: 20, RIB: 50, CK: 100, PK: 30, BAG: 5, JAM: 3 };
eq("作れる数（途中の在庫）", K.canMake(g, "SA", st3, { net: true }).n, 10);
eq("作れる数（途中の在庫を使わない）", K.canMake(g, "SA", st3, { net: false }).n, 8);
eq("在庫にない部品", K.canMake(g, "SB", { BOX: 9, CK: 99, PK: 9 }, { net: true }), { n: 0, limit: ["JAM"], missing: ["JAM"] });
// 品番のハイフン、重複行、読めない行、循環
var g2 = K.buildBom([["P-1", "A-1", "2"], ["P1", "A1", "1"], ["P-1", "", "1"], ["P-1", "B", "なし"], ["", "", ""], ["P-1", "C", "-1"]], C, {});
eq("ハイフン・重複", [g2.items["P1"].children, g2.dups.length], [[{ key: "A1", qty: 3, rows: [0, 1] }], 1]);
eq("読めない行", g2.errs.map(function (e) { return [e.i, e.err]; }), [[2, "子（部品）が空欄"], [3, "数が数字でない（なし）"], [5, "数がマイナス（-1）"]]);
eq("ハイフン区別", Object.keys(K.buildBom([["P-1", "A-1", "2"], ["P1", "A1", "1"]], C, { hyphen: false }).items).length, 4);
var g3 = K.buildBom([["X", "Y", "1"], ["Y", "Z", "1"], ["Z", "Y", "1"]], C, {});
eq("循環", g3.cycles.length, 1);
// 3段・小数
var g4 = K.buildBom([["T", "U", "2"], ["U", "V", "3"], ["V", "W", "0.5"], ["T", "W", "1"]], C, {});
eq("3段", K.run(g4, { T: 4 }, null, {}).res.map(function (x) { return [x.key, x.need]; }), [["W", 16], ["U", 8], ["V", 24]]);
eq("段（深い方）", g4.level.W, 3);
// 途中の部品を直接作る数に入れる
eq("途中を直接", K.run(g, { BAG: 3 }, null, {}).res.map(function (x) { return [x.key, x.need]; }), [["CK", 18], ["PK", 3], ["BAG", 3]]);
// 在庫の表
var s = K.buildStock([["A-1", "見本", "10"], ["A1", "", "5"], ["B", "", "なし"], ["C", "", "-2"]], { code: 0, name: 1, qty: 2 }, {});
eq("在庫", [s.map, s.errs.length, s.dups], [{ A1: 15, C: -2 }, 1, { A1: 2 }]);
// 部品表にない製品
eq("部品表にない製品", K.run(g, { ZZ: 3 }, { ZZ: 1 }, {}).res.map(function (x) { return [x.key, x.need, x.short]; }), [["ZZ", 3, 2]]);
// 速さ：製品200 × 部品50（2段）
var big = [];
for (var p = 0; p < 200; p++) for (var c = 0; c < 50; c++) big.push(["P" + p, (c < 10 ? "M" : "L") + ((p * 7 + c) % 400), String(1 + c % 3)]);
for (var mm = 0; mm < 400; mm++) big.push(["M" + mm, "L" + (mm % 300), "2"]);
var t0 = Date.now(), gb = K.buildBom(big, C, {}), plan = {}, stk = {};
gb.tops.forEach(function (k) { plan[k] = 5; });
Object.keys(gb.items).forEach(function (k) { stk[k] = 500; });
K.run(gb, plan, stk, { net: true }); K.makeable(gb, stk, { net: true });
var ms = Date.now() - t0; console.log("big", big.length, "rows", gb.tops.length, "products", ms, "ms");
eq("速さ", ms < 5000, true);
console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
