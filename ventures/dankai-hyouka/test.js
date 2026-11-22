// node test.js — 関数のテスト
var D = require("./dankai.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
function col(vals) { return vals.map(function (v) { return [v]; }); }

// 書き方のゆれ
eq("大変＝とても", D.norm("大変満足"), D.norm("とても満足"));
eq("非常に＝とても", D.norm("非常に満足"), D.norm("とても満足"));
eq("まあ＝やや", D.norm("まあ満足"), D.norm("やや満足"));
eq("どちらかといえば＝やや", D.norm("どちらかといえばそう思わない"), D.norm("あまりそう思わない"));
eq("全く＝まったく", D.norm("全くそう思わない"), D.norm("まったくそう思わない"));
eq("普通＝どちらともいえない", D.norm("普通"), D.norm("どちらとも言えない"));
eq("分かり＝わかり", D.norm("わかりやすかった"), D.norm("分かりやすかった"));
eq("全角・空白・句点", D.norm(" とても　満足。"), D.norm("とても満足"));
eq("満足している", D.norm("満足している"), D.norm("満足"));
eq("とても満足≠満足", D.norm("とても満足") === D.norm("満足"), false);
eq("そう思う≠そう思わない", D.norm("そう思う") === D.norm("そう思わない"), false);

// 数字
eq("数字", D.numOf("4"), { n: 4, label: "" });
eq("全角数字・点", D.numOf("５点"), { n: 5, label: "" });
eq("数字（言葉）", D.numOf("5（とても満足）"), { n: 5, label: "とても満足" });
eq("数字：言葉", D.numOf("5: とても満足"), { n: 5, label: "とても満足" });
eq("言葉（数字）", D.numOf("とても満足(5)"), { n: 5, label: "とても満足" });
eq("小数は数字にしない", D.numOf("3.5"), null);
eq("言葉だけ", D.numOf("満足"), null);

// 段階の推定
var g1 = D.guessScale(["とても満足", "満足", "どちらともいえない", "不満", "満足", "とても不満"]);
eq("5段階（とても満足〜とても不満）", g1.levels, ["とても満足", "満足", "どちらともいえない", "不満", "とても不満"]);
var g2 = D.guessScale(["満足", "やや満足", "普通", "やや不満", "満足"]);
eq("5段階（満足〜不満、やや）", g2.levels, ["満足", "やや満足", "普通", "やや不満", "不満"]);
var g3 = D.guessScale(["そう思う", "ややそう思う", "あまりそう思わない", "そう思わない"]);
eq("4段階（そう思う）", g3.levels, ["そう思う", "ややそう思う", "あまりそう思わない", "そう思わない"]);
var g4 = D.guessScale(["大変満足", "満足", "普通", "不満", "大変満足", "わからない", ""]);
eq("大変満足・普通。わからないは除く", g4.levels, ["大変満足", "満足", "普通", "不満", "とても不満"]);
var g5 = D.guessScale(["1", "3", "5", "4", "4", "2"]);
eq("数字 1〜5", [g5.kind, g5.min, g5.max], ["num", 1, 5]);
var g6 = D.guessScale(["0", "7", "10", "9"]);
eq("数字 0〜10", [g6.kind, g6.min, g6.max], ["num", 0, 10]);
eq("年齢のような数字は段階にしない", D.guessScale(["25", "34", "41"]), null);
eq("自由記述は段階にしない", D.guessScale(["資料がほしい", "長かった", "満足"]), null);
var g7 = D.guessScale(["とても分かりやすかった", "わかりやすかった", "分かりにくかった"]);
eq("分かりやすかった", g7 && g7.levels.length, 5);

// 集計
var rows = col(["とても満足", "満足", "満足", "どちらともいえない", "不満", "", "わからない", "満足です", "最高", "大変満足"]);
var A = D.analyze(rows, 0, { kind: "text", levels: ["とても満足", "満足", "どちらともいえない", "不満", "とても不満"] });
eq("人数", A.counts, [2, 3, 1, 1, 0]);
eq("回答・空欄・除く・段階にない", [A.n, A.blank, A.na, A.unknown.length, A.total], [7, 1, 1, 1, 10]);
eq("段階にない答えの行", A.unknown, [{ row: 8, value: "最高" }]);
// 平均＝(5*2+4*3+3+2)/7 = 27/7
eq("平均", D.fix(A.mean, 2), "3.86");
// 標本標準偏差（STDEV.S）：値 5,5,4,4,4,3,2
eq("標準偏差", D.fix(A.sd, 2), "1.07");
eq("上位2段階・下位2段階", [A.top, A.bottom, A.topK], [5, 1, 2]);
var R = D.analyze(col(["1", "2", "2", "5"]), 0, { kind: "num", min: 1, max: 5, labels: {} });
eq("数字の並びは高い順", R.labels, ["5", "4", "3", "2", "1"]);
eq("数字の人数", R.counts, [1, 0, 0, 2, 1]);
eq("数字の平均", D.fix(R.mean, 2), "2.50");
var Rv = D.analyze(col(["長い", "ちょうどよい", "長い", "短い"]), 0, { kind: "text", levels: ["短い", "ちょうどよい", "長い"] }, null, true);
eq("逆にする：点数", Rv.scores, [1, 2, 3]);
var R3 = D.analyze(col(["良い", "普通", "悪い", "良い"]), 0, { kind: "text", levels: ["良い", "普通", "悪い"] });
eq("3段階は上位1段階", [R3.topK, R3.top, R3.bottom], [1, 2, 1]);
var Rr = D.analyze(col(["1", "1", "2", "5"]), 0, { kind: "num", min: 1, max: 5, labels: {} }, null, true);
eq("逆にする：上位は小さい数字側", [Rr.top, Rr.bottom], [3, 1]);
var Ro = D.analyze(col(["6", "0", "3"]), 0, { kind: "num", min: 1, max: 5, labels: {} });
eq("範囲外の数字は段階にない答え", Ro.unknown.length, 2);

// グループ別
var gr = [["とても満足", "A"], ["不満", "B"], ["満足", "A"], ["", "B"], ["満足", "B"]];
var GA = D.analyze(gr, 0, { kind: "text", levels: ["とても満足", "満足", "どちらともいえない", "不満", "とても不満"] });
var X = D.cross(gr, GA, 1);
eq("グループ", X.groups, ["A", "B"]);
eq("グループ A", [X.stat.A.n, X.stat.A.counts, D.fix(X.stat.A.mean, 2), X.stat.A.top], [2, [1, 1, 0, 0, 0], "4.50", 2]);
eq("グループ B", [X.stat.B.n, D.fix(X.stat.B.mean, 2), X.stat.B.top, X.stat.B.bottom], [2, "3.00", 1, 1]);

// 列の推定
var H = ["No", "氏名", "年齢", "満足度", "講師の説明", "感想"];
var T = [["1", "見本 一郎", "34", "満足", "4", "よかった"], ["2", "見本 二郎", "41", "とても満足", "5", ""], ["3", "見本 花子", "29", "不満", "2", "長い"], ["4", "見本 三郎", "52", "満足", "4", "資料がほしい"]];
eq("列の推定", D.guessCols(H, T).map(function (g) { return H[g.col]; }), ["満足度", "講師の説明"]);

// 点数の列
var S = D.scoreRows(["氏名", "満足度"], [["a", "満足"], ["b", "わからない"]], [{ col: 1, A: D.analyze([["a", "満足"], ["b", "わからない"]], 1, { kind: "text", levels: ["とても満足", "満足", "どちらともいえない", "不満", "とても不満"] }) }]);
eq("点数の列", S, [["氏名", "満足度", "満足度（点数）"], ["a", "満足", "4"], ["b", "わからない", ""]]);
eq("CSV", D.toCSV([["a,b", "c"]]), "﻿\"a,b\",c\r\n");
eq("割合", D.pct(1, 3), "33.3%");

console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
