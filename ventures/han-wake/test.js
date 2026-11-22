// node test.js
var H = require("./hanwake.js");
var ok = 0, ng = 0;
function t(name, cond) { if (cond) ok++; else { ng++; console.log("NG:", name); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// 読み込み
t("CSV", eq(H.parseCSV('氏名,性別\n"見本, 太郎",男\n'), [["氏名", "性別"], ["見本, 太郎", "男"]]));
t("TSV", eq(H.parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]));
t("key", H.key("見本　太郎") === H.key("見本 太郎") && H.key("ＡＢ") === "ab");
t("numOf", H.numOf("７８点") === 78 && H.numOf("1,200") === 1200 && H.numOf("abc") === null);

// 班の大きさ
t("sizes count", eq(H.sizesFor(22, "count", 4), [6, 6, 5, 5]));
t("sizes size", eq(H.sizesFor(22, "size", 4), [4, 4, 4, 4, 3, 3]));
t("sizes size exact", eq(H.sizesFor(20, "size", 5), [5, 5, 5, 5]));
t("sizes more groups than people", eq(H.sizesFor(3, "count", 5), [1, 1, 1]));

// 班の名前と指定の読み取り
t("label", H.label("num", 0) === "1班" && H.label("abc", 1) === "B班" && H.label("group", 2) === "グループ3" && H.label("abc", 26) === "AA班");
t("parseFixed", H.parseFixed("2", "num", 4) === 1 && H.parseFixed("２班", "num", 4) === 1 && H.parseFixed("B", "abc", 4) === 1 && H.parseFixed("b班", "num", 4) === 1);
t("parseFixed group", H.parseFixed("グループ3", "group", 4) === 2 && H.parseFixed("", "num", 4) === null && H.parseFixed("9", "num", 4) === -1 && H.parseFixed("リーダー", "num", 4) === -1);

// 条件の読み取り
var names = ["見本 一郎", "見本 二郎", "見本 花子", "見本 一郎"];
var pp = H.parsePairs("見本一郎、見本 二郎\n見本 花子\n見本 二郎, 見本 次郎\n\n見本 二郎・見本 花子", names);
t("pairs sets", eq(pp.sets.map(function (s) { return s.ids; }), [[0, 1], [1, 2]]));
t("pairs problems", pp.problems.length === 3 && /2行目/.test(pp.problems[1]) && /次郎/.test(pp.problems[2]) && /複数/.test(pp.problems[0]));

// 班分け：性別と部署のつり合い
function people(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
var P = people(24, function (i) { return { cat: [i % 3 === 0 ? "女" : "男", ["総務", "営業", "製造", "開発"][i % 4]], num: null, fixed: null, prev: "" }; });
var r = H.solve(P, { sizes: H.sizesFor(24, "count", 4), seed: 7 });
var rep = H.report(P, r.g, 4, {});
t("sizes kept", eq(rep.groups.map(function (G) { return G.n; }), [6, 6, 6, 6]));
t("gender balanced", rep.spread[0].every(function (s) { return s.max - s.min <= 1; }));
t("dept balanced", rep.spread[1].every(function (s) { return s.max - s.min <= 1; }));
var r2 = H.solve(P, { sizes: H.sizesFor(24, "count", 4), seed: 7 });
t("same seed same result", eq(r.g, r2.g));
var r3 = H.solve(P, { sizes: H.sizesFor(24, "count", 4), seed: 8 });
t("other seed differs", !eq(r.g, r3.g));

// 同じ班にしない・する、決めてある人
var sep = [[0, 3], [1, 2, 5]], tog = [[6, 7, 8]];
var P2 = P.map(function (p, i) { return { cat: p.cat, num: null, fixed: i === 10 ? 2 : i === 11 ? 2 : null, prev: "" }; });
var r4 = H.solve(P2, { sizes: H.sizesFor(24, "count", 4), seed: 3, sep: sep, tog: tog });
var rep4 = H.report(P2, r4.g, 4, { sep: sep, tog: tog });
t("sep ok", rep4.sepBad.length === 0 && r4.g[0] !== r4.g[3] && r4.g[1] !== r4.g[2] && r4.g[2] !== r4.g[5]);
t("tog ok", rep4.togBad.length === 0 && r4.g[6] === r4.g[7] && r4.g[7] === r4.g[8]);
t("fixed ok", r4.g[10] === 2 && r4.g[11] === 2);
t("sizes kept 2", eq(rep4.groups.map(function (G) { return G.n; }), [6, 6, 6, 6]));

// 前回の班：前回同じ班だった人をなるべく分ける
var P3 = people(20, function (i) { return { cat: [], num: null, fixed: null, prev: String(Math.floor(i / 5) + 1) + "班" }; });
var r5 = H.solve(P3, { sizes: H.sizesFor(20, "count", 4), seed: 1 });
var rep5 = H.report(P3, r5.g, 4, {});
t("prev pairs minimum (5人を4つの前回の班から → 各班1組は必ず重なる)", rep5.prevTotal === 4);
// 前回と同じ班分けのままなら 4班×C(5,2)=40 組
var same = P3.map(function (_, i) { return Math.floor(i / 5); });
t("prev count", H.report(P3, same, 4, {}).prevTotal === 40);

// 数の平均をそろえる
var P4 = people(20, function (i) { return { cat: [], num: i * 5, fixed: null, prev: "" }; });
var r6 = H.solve(P4, { sizes: H.sizesFor(20, "count", 4), seed: 2 });
var rep6 = H.report(P4, r6.g, 4, {});
var means = rep6.groups.map(function (G) { return G.numMean; });
t("num means close", Math.max.apply(null, means) - Math.min.apply(null, means) <= 2.5);
t("num mean overall", Math.abs(means.reduce(function (a, b) { return a + b; }, 0) / 4 - 47.5) < 1e-9);

// 割り切れない属性：女7人を3班 → 3,2,2
var P5 = people(15, function (i) { return { cat: [i < 7 ? "女" : "男"], num: null, fixed: null, prev: "" }; });
var rep7 = H.report(P5, H.solve(P5, { sizes: H.sizesFor(15, "count", 3), seed: 5 }).g, 3, {});
t("uneven", rep7.groups.map(function (G) { return G.cats[0]["女"]; }).sort().join() === "2,2,3");

// 大きな名簿
var P6 = people(600, function (i) { return { cat: [["1年", "2年", "3年"][i % 3], i % 2 ? "男" : "女"], num: null, fixed: null, prev: String(i % 25) }; });
var t0 = Date.now(), r8 = H.solve(P6, { sizes: H.sizesFor(600, "size", 6), seed: 9 }), ms = Date.now() - t0;
var rep8 = H.report(P6, r8.g, 100, {});
t("big sizes", rep8.groups.every(function (G) { return G.n === 6; }));
t("big balance", rep8.spread[0].every(function (s) { return s.max - s.min <= 1; }) && rep8.spread[1].every(function (s) { return s.max - s.min <= 1; }));
console.log("600人・100班：" + ms + "ms、前回同じ班の組 " + rep8.prevTotal);

// 列の推定
var hd = ["番号", "氏名", "性別", "学年", "前回の班", "メモ"];
var rows = people(10, function (i) { return [String(i), "見本" + i, i % 2 ? "男" : "女", (i % 3 + 1) + "年", "1班", "x" + i]; });
t("guessName", H.guessName(hd) === 1);
t("guessBalance", eq(H.guessBalance(hd, rows), [2, 3]));
t("guessPrev", H.guessPrev(hd) === 4 && H.guessFixed(hd) === -1);
t("csv", H.toCSV([["a", "b,c"]]) === "﻿a,\"b,c\"\r\n");

console.log(ok + " OK / " + ng + " NG");
process.exit(ng ? 1 : 0);
