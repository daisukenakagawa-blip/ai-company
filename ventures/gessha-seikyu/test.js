// node test.js
var G = require("./gessha.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG " + m + "\n  got " + A + "\n  exp " + B); } }

// 金額・回数・日付
eq(G.parseAmount("8,000円"), 8000, "金額 カンマ円"); eq(G.parseAmount("¥8000"), 8000, "金額 ¥"); eq(G.parseAmount("8千円"), 8000, "金額 千");
eq(G.parseAmount("1万2千"), 12000, "金額 万千"); eq(G.parseAmount(""), null, "金額 空"); eq(isNaN(G.parseAmount("あ")), true, "金額 読めない"); eq(G.parseAmount("-500"), -500, "金額 負");
eq(G.parseCount("4"), { n: 4 }, "回数"); eq(G.parseCount("4回"), { n: 4 }, "回数 回"); eq(G.parseCount("休会"), { n: 0, rest: true }, "回数 休会"); eq(G.parseCount("x?"), { bad: true }, "回数 bad"); eq(G.parseCount(""), null, "回数 空");
eq(G.parseDate("2026/12/5"), { y: 2026, m: 12, d: 5 }, "日付 /"); eq(G.parseDate("2026-12-05"), { y: 2026, m: 12, d: 5 }, "日付 -");
eq(G.parseDate("12/5", 2026), { y: 2026, m: 12, d: 5 }, "日付 年なし"); eq(G.parseDate("R8.12.5"), { y: 2026, m: 12, d: 5 }, "日付 R");
eq(G.parseDate("令和8年12月5日"), { y: 2026, m: 12, d: 5 }, "日付 令和"); eq(G.parseDate("46361"), { y: 2026, m: 12, d: 5 }, "日付 Excel");
eq(G.parseDate("2026/2/30"), { bad: true }, "日付 ない日"); eq(G.parseDate("2026年12月"), { y: 2026, m: 12, d: 1 }, "日付 年月");

// 料金表
var F = G.parseFees("コース,回数,金額\nピアノ30分, 4回, 8000\nピアノ30分, 3回, 6300\nピアノ 30分,2,4400\nソルフェージュ, 3000\n個人, 1回あたり, 2500\nバレエ, 4回, 9,000円\n英会話 キッズ\t5,500円\n体験 1回 1000\nだめ, X回, 100");
eq(F.C[G.key("ピアノ30分")].byCount, { 2: 4400, 3: 6300, 4: 8000 }, "料金表 回数ごと（空白のゆれも同じコース）"); eq(F.C[G.key("バレエ")].byCount, { 4: 9000 }, "料金表 8,000 のカンマ");
eq(F.C[G.key("ソルフェージュ")].monthly, 3000, "料金表 月額"); eq(F.C[G.key("個人")].per, 2500, "料金表 1回あたり");
eq(F.C[G.key("英会話キッズ")].monthly, 5500, "料金表 タブ・円"); eq(F.C[G.key("体験")].byCount, { 1: 1000 }, "料金表 空白区切り");
eq(F.errs.length, 1, "料金表 読めない行は1件"); eq(F.order.length, 6, "料金表 コース数");

// 列の推定
var H = ["No", "生徒名", "コース", "回数", "家族", "入会日", "退会日", "曜日", "教材費", "割引", "備考"];
var rows0 = [["1", "a", "ピアノ", "4", "", "", "", "月", "500", "", ""]];
var g = G.guessCols(H, rows0);
eq([g.name, g.course, g.count, g.family, g.join, g.leave, g.group, g.extras, g.discount], [1, 2, 3, 4, 5, 6, 7, [8], 9], "列の推定");

// 計算
var fees = G.parseFees("ピアノ30分,4回,8000\nピアノ30分,3回,6300\nソルフェージュ,3000\n個人,1回あたり,2500\nリトミック,6000");
var cols = { name: 0, course: 1, count: 2, family: 3, join: 4, leave: 5, extras: [6], discount: 7 };
var rows = [
  ["青木 一郎", "ピアノ30分", "4", "青木", "", "", "500", ""],
  ["青木 一郎", "ソルフェージュ", "", "青木", "", "", "", ""],
  ["青木 花", "リトミック", "", "青木", "", "", "", ""],
  ["石井 蓮", "ピアノ30分", "3", "", "2026/12/16", "", "", "300"],
  ["上田 葵", "個人", "3", "", "", "", "", ""],
  ["江藤 翔", "ピアノ30分", "休会", "", "", "", "", ""],
  ["大野 結", "ピアノ30分", "5", "", "", "", "", ""],
  ["加藤 心", "バイオリン", "", "", "", "", "", ""],
  ["木村 陸", "リトミック", "", "", "2027/1/8", "", "", ""],
  ["工藤 大", "リトミック", "", "", "", "2026/11/30", "", ""],
  ["小林 美", "リトミック", "", "", "", "2026/12/20", "", ""],
  ["合計", "", "", "", "", "", "", ""]
];
var base = { cols: cols, bill: { y: 2026, m: 12 }, fees: fees, sib: { mode: "yen", amount: 1000, from: 2, target: "cheaper" }, join: { mode: "full", fee: 0 }, round: { unit: 1, mode: "floor" } };
function P(R, nm) { return R.all.filter(function (p) { return p.name === nm; })[0]; }
var R = G.run(H, rows, base);
eq(P(R, "青木 一郎").base, 11000, "2コースの合計");
eq(P(R, "青木 一郎").sib, 0, "家族で高い方は割引なし");
eq(P(R, "青木 花").sib, -1000, "家族で安い方に1,000円引き");
eq(P(R, "青木 一郎").total, 11500, "追加の費用（教材費）を足す");
eq(P(R, "石井 蓮").total, 6300 - 300, "回数ごとの料金と割引の列");
eq(P(R, "上田 葵").total, 7500, "1回あたり×回数");
eq(P(R, "江藤 翔").total, 0, "休会は0円"); eq(P(R, "江藤 翔").status, "休み", "休会の印");
eq(P(R, "大野 結").total, 0, "回数の料金がない→0円");
eq(P(R, "加藤 心").lines[0].how, "料金表にない", "料金表にないコース");
eq(P(R, "木村 陸").status, "入会前", "入会前は外す"); eq(P(R, "工藤 大").status, "退会", "退会は外す");
eq(P(R, "小林 美").total, 6000, "今月退会は全額"); eq(P(R, "小林 美").notes, ["今月20日退会"], "今月退会のメモ");
eq(R.per.length, 8, "請求する人数"); eq(R.excluded.length, 2, "外した人数");
eq(R.checks.filter(function (c) { return c.lv === "e"; }).length, 2, "確かめたい所（エラー）2件");
eq(R.all.some(function (p) { return p.name === "合計"; }), false, "合計の行は外す");
eq(R.total.total, 11500 + 5000 + 6000 + 7500 + 0 + 0 + 0 + 6000, "合計額");
eq(R.byCourse.filter(function (b) { return b.name === "ピアノ30分"; })[0], { name: "ピアノ30分", n: 3, rest: 1, count: 12, fee: 14300 }, "コースごと");
eq(R.families.length, 1, "家族ごと"); eq(R.families[0].total, 16500, "家族の合計");

// 日割り
var o2 = JSON.parse(JSON.stringify(base)); o2.join = { mode: "days", fee: 5000 }; o2.round = { unit: 10, mode: "floor" };
R = G.run(H, rows, o2);
eq(P(R, "石井 蓮").tuition, 3250, "日割り 16日入会 16/31日 6300→3251→10円切り捨て");
eq(P(R, "石井 蓮").enroll, 5000, "入会金"); eq(P(R, "石井 蓮").total, 3250 + 5000 - 300, "日割り＋入会金−割引");
o2.join = { mode: "half", halfDay: 16 }; o2.round = { unit: 1, mode: "floor" }; R = G.run(H, rows, o2);
eq(P(R, "石井 蓮").tuition, 3150, "16日以降は半額");
o2.join = { mode: "half", halfDay: 17 }; R = G.run(H, rows, o2); eq(P(R, "石井 蓮").tuition, 6300, "17日からが半額なら16日は全額");
o2.join = { mode: "next", nextDay: 15 }; R = G.run(H, rows, o2); eq(P(R, "石井 蓮").tuition, 0, "15日以降の入会は翌月から");

// 割引の方式
var o3 = JSON.parse(JSON.stringify(base)); o3.sib = { mode: "pct", amount: 10, from: 2, target: "order" };
R = G.run(H, rows, o3); eq([P(R, "青木 一郎").sib, P(R, "青木 花").sib], [0, -600], "表の順で2人目に10%");
o3.sib = { mode: "pct", amount: 10, from: 2, target: "cheaper" };
var rows3 = rows.slice(); rows3[2] = ["青木 花", "リトミック", "", "青木", "", "", "", ""]; rows3.unshift(["青木 次郎", "リトミック", "", "あおき", "", "", "", ""]);
R = G.run(H, rows3, o3); eq(P(R, "青木 次郎").family, "あおき", "家族の名前");
o3.sib.from = 3; R = G.run(H, rows, o3); eq(P(R, "青木 花").sib, 0, "3人目からなら2人では割引なし");

// 月謝の列（料金表なし）
var R4 = G.run(["名前", "月謝"], [["a", "7,000"], ["b", "6千円"], ["c", "x"]], { cols: { name: 0, amount: 1, extras: [] }, bill: { y: 2026, m: 12 }, fees: G.parseFees("") });
eq(R4.per.map(function (p) { return p.total; }), [7000, 6000, 0], "月謝の列だけ"); eq(R4.checks.length >= 1, true, "読めない月謝");

// 1行に複数コース
var R5 = G.run(["名前", "コース"], [["a", "ピアノ30分、ソルフェージュ"]], { cols: { name: 0, course: 1, extras: [] }, bill: { y: 2026, m: 12 }, fees: G.parseFees("ピアノ30分,8000\nソルフェージュ,3000"), splitCourse: true });
eq(R5.per[0].total, 11000, "1つのマスに2コース");

// お試しの制限
var R6 = G.run(H, rows, Object.assign({}, base, { limit: 3 }));
eq([R6.all.length, R6.cut], [3, 7], "お試しは先頭3人（同じ人の2行目は数える）");

eq(G.roundBy(3251.6, 10, "floor"), 3250, "端数 10円切り捨て"); eq(G.roundBy(3255, 10, "round"), 3260, "端数 四捨五入"); eq(G.roundBy(3201, 100, "ceil"), 3300, "端数 100円切り上げ");

console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
