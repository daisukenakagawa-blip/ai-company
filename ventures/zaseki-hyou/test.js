// node test.js
var Z = require("./zaseki.js"), n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("NG:", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " → " + JSON.stringify(a) + " / 期待 " + JSON.stringify(b)); }

// 読み込み
eq(Z.parseCSV('a,b\n"x,1","y""z"\n'), [["a", "b"], ["x,1", 'y"z']], "CSV の引用符");
eq(Z.parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]], "タブ区切り");
var sj = new Uint8Array([0x8e, 0x81, 0x96, 0xbc]); // 「氏名」Shift_JIS
eq(Z.decodeBytes(sj).enc, "Shift_JIS", "Shift_JIS 判定");

// 席の並び（スクール形式）
var L = Z.buildSeats({ type: "school", rows: 2, cols: 3, aisle: 0, order: "row" });
eq(L.seats.map(function (s) { return s.no + ":" + s.r + s.c; }), ["1:00", "2:01", "3:02", "4:10", "5:11", "6:12"], "前の行から横へ");
L = Z.buildSeats({ type: "school", rows: 2, cols: 3, aisle: 0, order: "col" });
eq(L.seats.map(function (s) { return s.no + ":" + s.r + s.c; }), ["1:00", "2:10", "3:01", "4:11", "5:02", "6:12"], "左の列から縦へ");
L = Z.buildSeats({ type: "school", rows: 1, cols: 6, aisle: 2, order: "row" });
eq(L.seats.map(function (s) { return s.gc; }), [0, 1, 3, 4, 6, 7], "2列ごとの通路");
eq(L.gridCols, 8, "通路を含む幅");
eq(Z.neighbors(L, false), [[0, 1], [2, 3], [4, 5]], "通路をはさむ席は隣でない");
var L2 = Z.buildSeats({ type: "school", rows: 2, cols: 2, aisle: 0, order: "row" });
eq(Z.neighbors(L2, true).length, 4, "前後も隣（2×2 で4組）");
// 島型
var LI = Z.buildSeats({ type: "island", irows: 2, icols: 2, srows: 2, scols: 3 });
eq(LI.seats.length, 24, "島 2×2、1島 2×3 で24席");
eq([LI.gridRows, LI.gridCols], [5, 7], "島の間のすき間");
eq(LI.seats[6].island + "-" + LI.seats[6].inIsland, "2-1", "7番は2つ目の島の1席目");
eq(Z.neighbors(LI).length, 4 * 15, "同じ島の席どうしが隣（6席で15組×4島）");

// 番号の読み取り
eq(Object.keys(Z.parseNums("3, 7、10-12 ５〜６", 20).set).map(Number), [3, 5, 6, 7, 10, 11, 12], "使わない席の番号");
eq(Z.parseNums("3, x, 30", 20).bad, ["x", "30"], "読めない・範囲外の番号");
eq([Z.parseSeatNo("12", 30), Z.parseSeatNo("１２番", 30), Z.parseSeatNo("No.5", 30), Z.parseSeatNo("", 30), Z.parseSeatNo("前", 30), Z.parseSeatNo("31", 30)], [12, 12, 5, null, -1, -1], "決めてある席の読み取り");
eq(["○", "1", "はい", "", "×", "0", "なし"].map(Z.truthy), [true, true, true, false, false, false, false], "前の方にする列");
eq(["10", "9", "2", "", "あ"].sort(Z.cmpVal), ["2", "9", "10", "あ", ""], "並べ替え（数として、空欄は最後）");

// 割り当て
function people(N, f) { var a = []; for (var i = 0; i < N; i++) a.push(f ? f(i) : { fixed: null, front: false, cat: "", key: "" }); return a; }
L = Z.buildSeats({ type: "school", rows: 3, cols: 4, aisle: 0, order: "row" });
var r = Z.assign(L, people(10), { order: "list" });
eq(r.seatOf, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "名簿の順に席番号の順");
r = Z.assign(L, people(10), { order: "list", unused: { 2: 1, 5: 1 } });
eq(r.seatOf.map(function (si) { return L.seats[si].no; }), [1, 3, 4, 6, 7, 8, 9, 10, 11, 12], "使わない席をとばす");
var P = people(5, function (i) { return { fixed: i === 3 ? 1 : null, front: false, cat: "", key: "" }; });
r = Z.assign(L, P, { order: "list" });
eq(r.seatOf.map(function (si) { return L.seats[si].no; }), [2, 3, 4, 1, 5], "決めてある席");
P = people(3, function (i) { return { fixed: 2, front: false, cat: "", key: "" }; });
r = Z.assign(L, P, { order: "list" });
eq(r.problems.filter(function (p) { return p.t === "dupFixed"; }).length, 2, "同じ席を決めてある人を知らせる");
r = Z.assign(L, people(14), { order: "list" });
eq(r.overflow, [12, 13], "席が足りない人");
// 並べ替え
P = ["c", "a", "b"].map(function (k) { return { fixed: null, front: false, cat: "", key: k }; });
eq(Z.assign(L, P, { order: "sort" }).seatOf, [2, 0, 1], "列で並べ替え");
eq(Z.assign(L, P, { order: "sort", desc: true }).seatOf, [0, 2, 1], "逆順");
// 乱数
var A = Z.assign(L, people(12), { order: "random", seed: 3 }).seatOf, B = Z.assign(L, people(12), { order: "random", seed: 3 }).seatOf, C = Z.assign(L, people(12), { order: "random", seed: 4 }).seatOf;
ok(JSON.stringify(A) === JSON.stringify(B), "同じ番号で同じ結果");
ok(JSON.stringify(A) !== JSON.stringify(C), "別の番号で別の結果");
eq(A.slice().sort(function (a, b) { return a - b; }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "乱数でも全員が別の席");
// 前の方にする（左の列から縦へ番号でも、前の行に入る）
var Lc = Z.buildSeats({ type: "school", rows: 3, cols: 4, aisle: 0, order: "col" });
P = people(12, function (i) { return { fixed: null, front: i >= 9, cat: "", key: "" }; });
r = Z.assign(Lc, P, { order: "list" });
eq([9, 10, 11].map(function (i) { return Lc.seats[r.seatOf[i]].r; }), [0, 0, 0], "前の方にする人は最前列");
// 隣どうしで同じ値にしない
L = Z.buildSeats({ type: "school", rows: 4, cols: 6, aisle: 2, order: "row" });
P = people(24, function (i) { return { fixed: null, front: false, cat: ["A", "B", "C"][Math.floor(i / 8)], key: "" }; });
var base = Z.assign(L, P, { order: "list" });
var before = Z.samePairs(L, P, base.personAt).length;
r = Z.assign(L, P, { order: "list", avoid: true, seed: 1 });
var after = Z.samePairs(L, P, r.personAt).length;
ok(before > 0 && after === 0, "隣の同じ値 " + before + " 組 → " + after + " 組");
eq(r.seatOf.slice().sort(function (a, b) { return a - b; }).join(","), base.seatOf.slice().sort(function (a, b) { return a - b; }).join(","), "入れ替えても同じ席の集まり");
// 前後も含める
r = Z.assign(L, P, { order: "list", avoid: true, frontBack: true, seed: 2 });
eq(Z.samePairs(L, P, r.personAt, true).length, 0, "前後も含めて同じ値なし");
// 決めてある人は動かない
P[0].fixed = 24;
r = Z.assign(L, P, { order: "list", avoid: true, seed: 5 });
eq(L.seats[r.seatOf[0]].no, 24, "入れ替えても決めてある席のまま");
// 島型：同じ島に同じ値が集まらない（4島×6席、値6種×4人 → 0 組にできる）
P = people(24, function (i) { return { fixed: null, front: false, cat: "v" + Math.floor(i / 4), key: "" }; });
r = Z.assign(LI, P, { order: "list", avoid: true, seed: 1 });
eq(Z.samePairs(LI, P, r.personAt).length, 0, "島型で同じ島に同じ値なし");
// 大きめ：300人（15行×20列）
var Lb = Z.buildSeats({ type: "school", rows: 15, cols: 20, aisle: 4, order: "row" });
P = people(300, function (i) { return { fixed: null, front: false, cat: "s" + (i % 10), key: "" }; });
var t0 = Date.now(); r = Z.assign(Lb, P, { order: "random", avoid: true, seed: 1 }); var ms = Date.now() - t0;
ok(Z.samePairs(Lb, P, r.personAt).length === 0, "300人で隣の同じ値なし（" + Z.samePairs(Lb, P, r.personAt).length + "）");
console.log("300人の割り当て：" + ms + "ms");
// 向き
L = Z.buildSeats({ type: "school", rows: 2, cols: 3, aisle: 0, order: "row" });
eq(Z.viewPos(L, L.seats[0], "bottom"), { gr: 1, gc: 2 }, "前を下にすると左上の席は右下");
eq(Z.toCSV([["a", "b,c"]]), "﻿a,\"b,c\"\r\n", "CSV 書き出し");

console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
