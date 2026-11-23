// 振替レッスンの残り回数 — 関数のテスト（node test.js）
var F = require("./furikae.js");
var ok = 0, ng = 0;
function eq(a, b, msg) { var A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) ok++; else { ng++; console.log("NG:", msg, "\n  得た:", A, "\n  期待:", B); } }
var D = function (s) { return F.parseDate(s); };
var L = F.dayLabel;

// 日付
eq(L(D("2026/5/16")), "2026/5/16", "西暦/");
eq(L(D("2026-05-16")), "2026/5/16", "ISO");
eq(L(D("令和8年5月16日")), "2026/5/16", "令和");
eq(L(D("R8.5.16")), "2026/5/16", "R8");
eq(L(D("46158")), "2026/5/16", "Excel のシリアル");
eq(L(F.parseDate("1/10", { year: 2026, fiscal: true })), "2027/1/10", "年度の1月");
eq(L(F.parseDate("5/16(土)", { year: 2026 })), "2026/5/16", "曜日つき");
eq(D("2026/2/30"), null, "ない日");
// 月の足し算
eq(L(F.addMonths(D("2026/1/31"), 1)), "2026/2/28", "月末に寄せる");
eq(L(F.addMonths(D("2026/11/15"), 2)), "2027/1/15", "年をまたぐ");
// 期限
eq(L(F.expiryOf(D("2026/5/16"), { type: "months", n: 2 })), "2026/7/16", "2か月");
eq(L(F.expiryOf(D("2026/5/16"), { type: "days", n: 30 })), "2026/6/15", "30日");
eq(L(F.expiryOf(D("2026/5/16"), { type: "monthEnd", n: 1 })), "2026/6/30", "翌月末");
eq(L(F.expiryOf(D("2026/12/16"), { type: "monthEnd", n: 1 })), "2027/1/31", "翌月末（年またぎ）");
eq(L(F.expiryOf(D("2026/5/16"), { type: "monthEnd", n: 0 })), "2026/5/31", "その月末");
eq(L(F.expiryOf(D("2026/5/16"), { type: "fiscal" })), "2027/3/31", "年度末");
eq(L(F.expiryOf(D("2027/2/1"), { type: "fiscal" })), "2027/3/31", "年度末（1〜3月）");
eq(F.expiryOf(D("2026/5/16"), { type: "none" }), null, "期限なし");
// 種類
var g = ["欠席", "休み", "×", "振替", "振替受講", "振", "補講", "無断欠席", "当日欠席", "振替なし", "出席", "○", "休会", "休講", "付与", "失効", ""].map(F.guessKind);
eq(g, ["abs", "abs", "abs", "use", "use", "use", "use", "absNo", "absNo", "absNo", "skip", "skip", "skip", "skip", "add", "sub", "skip"], "種類の推定");
// 列
eq(F.guessCols(["日付", "生徒名", "種類", "クラス", "備考"]), { date: 0, name: 1, kind: 2, group: 3, memo: 4 }, "列の推定（1行1件）");
eq(F.guessCols(["欠席日", "氏名", "振替日", "コース"]), { makeup: 2, date: 0, name: 1, group: 3 }, "列の推定（欠席日・振替日）");
eq(F.guessShape(["欠席日", "氏名", "振替日"], []), "pair", "形：欠席日・振替日");
eq(F.guessShape(["氏名", "4/6", "4/13", "4/20"], [], { year: 2026 }), "wide", "形：名前×日付");
eq(F.guessShape(["日付", "氏名", "区分"], []), "long", "形：1行1件");

function mk(rows, opt, cfg) {
  var h = rows[0], r = rows.slice(1);
  cfg = cfg || {}; cfg.shape = cfg.shape || "long"; cfg.cols = cfg.cols || F.guessCols(h);
  var t = F.toEntries(h, r, cfg);
  var R = F.run(t.entries, opt);
  R.bad = t.bad; return R;
}
// 基本：期限内に振替、期限切れ、残り
var R = mk([["日付", "氏名", "種類"],
  ["2026/5/16", "青木", "欠席"],
  ["2026/6/1", "青木", "振替"],
  ["2026/6/6", "青木", "欠席"],
  ["2026/7/4", "青木", "欠席"],
  ["2026/9/12", "青木", "欠席"]], { rule: { type: "months", n: 2 }, asof: D("2026/9/1") });
var P = R.people[0];
eq([P.absN, P.earned, P.used, P.expired, P.remain], [4, 4, 1, 1, 2], "基本の数");
eq(P.remainList.map(function (c) { return L(c.exp); }), ["2026/9/4", "2026/11/12"], "残りの期限");
eq(R.recs.map(function (e) { return e.mark; }), ["振替済み（2026/6/1・期限 2026/7/16）", "2026/5/16 の欠席分", "期限切れ（2026/8/6）", "残り（期限 2026/9/4・あと3日）", "残り（期限 2026/11/12・あと72日）"], "記録の印");
// 基準日を変えると期限切れが残りになる
R = mk([["日付", "氏名", "種類"], ["2026/7/4", "青木", "欠席"]], { rule: { type: "months", n: 2 }, asof: D("2026/9/4") });
eq([R.people[0].remain, R.people[0].remainList[0].left, R.people[0].soonN], [1, 0, 1], "期限当日は残り（今日まで）");
// 期限の近いものから使う
R = mk([["日付", "氏名", "種類"],
  ["2026/5/1", "A", "付与"],
  ["2026/5/16", "A", "欠席"],
  ["2026/6/1", "A", "振替"]], { rule: { type: "months", n: 2 }, asof: D("2026/6/2") });
eq(R.recs[2].mark, "2026/5/1 に足した分", "期限の近い方から");
// 期限を過ぎた分は使えない → 残りなし
R = mk([["日付", "氏名", "種類"], ["2026/5/16", "A", "欠席"], ["2026/8/1", "A", "振替"]], { rule: { type: "months", n: 2 }, asof: D("2026/8/2") });
eq([R.people[0].noCredit, R.people[0].expired, R.recs[1].cls], [1, 1, "warn"], "期限後の振替は残りなし");
// 振替元の欠席日を指定すると、期限後でも充てて印
R = mk([["日付", "氏名", "種類", "振替元"], ["2026/5/16", "A", "欠席", ""], ["2026/8/1", "A", "振替", "5/16"]], { rule: { type: "months", n: 2 }, asof: D("2026/8/2") }, { ctx: { year: 2026 } });
eq([R.people[0].noCredit, R.people[0].lateN, R.recs[1].mark], [0, 1, "2026/5/16 の欠席分（期限 2026/7/16 を過ぎて使用）"], "振替元の指定");
// 1か月の上限
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "A", "欠席"], ["2026/5/9", "A", "欠席"], ["2026/5/16", "A", "欠席"], ["2026/6/6", "A", "欠席"]], { rule: { type: "none" }, cap: 2, asof: D("2026/6/30") });
eq([R.people[0].absN, R.people[0].capped, R.people[0].remain, R.recs[2].cls], [4, 1, 3, "cap"], "1か月の上限");
// 振替なしの欠席・数えない
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "A", "無断欠席"], ["2026/5/9", "A", "出席"], ["2026/5/16", "A", "休み"]], { rule: { type: "none" }, asof: D("2026/6/30") });
eq([R.people[0].absN, R.people[0].absNoN, R.people[0].remain, R.recs.length], [1, 1, 1, 2], "振替なし・出席");
// 先取り（あとの欠席で充当）
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "A", "振替"], ["2026/5/16", "A", "欠席"], ["2026/5/23", "A", "振替"]], { rule: { type: "none" }, advance: true, asof: D("2026/6/30") });
eq([R.people[0].used, R.people[0].remain, R.people[0].noCredit, R.recs[0].mark, R.recs[2].cls], [1, 0, 1, "先に振替 → 2026/5/16 の欠席で充当", "warn"], "先取り");
// 回数の列
R = mk([["日付", "氏名", "種類", "回数"], ["2026/5/2", "A", "欠席", "2"], ["2026/5/9", "A", "振替", "1回"], ["2026/5/9", "A", "取消", "1"]], { rule: { type: "none" }, asof: D("2026/6/30") });
eq([R.people[0].earned, R.people[0].used, R.people[0].cancel, R.people[0].remain], [2, 1, 1, 0], "回数・取消");
// 名前のそろえ方・読めない行
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "青木 一郎", "欠席"], ["2026/5/9", "青木一郎", "振替"], ["5月ごろ", "上田", "欠席"], ["2026/5/9", "", "欠席"]], { rule: { type: "none" }, asof: D("2026/6/30") });
eq([R.people.length, R.people[0].used, R.bad.map(function (b) { return b.row + b.why; })], [1, 1, ["4日付が読めない", "5名前がない"]], "名前のそろえ・読めない");
// 欠席日・振替日の表（先に振替も）
R = mk([["欠席日", "氏名", "振替日"], ["2026/5/16", "A", "2026/5/30"], ["2026/6/13", "A", "2026/6/6"], ["2026/6/20", "A", ""], ["2026/6/27", "A", "振替なし"]], { rule: { type: "months", n: 1 }, asof: D("2026/7/1") }, { shape: "pair" });
eq([R.people[0].absN, R.people[0].absNoN, R.people[0].used, R.people[0].remain, R.people[0].noCredit], [3, 1, 2, 1, 0], "欠席日・振替日の数");
eq(R.recs.filter(function (e) { return e.kind === "use"; }).map(function (e) { return e.mark; }), ["2026/5/16 の欠席分", "先に振替（2026/6/13 の欠席分）"], "欠席日・振替日の印");
// 名前×日付の出欠表
var h = ["氏名", "クラス", "5/2", "5/9", "5/16", "5/23"];
var cfg = { shape: "wide", cols: { name: 0, group: 1 }, ctx: { year: 2026 } };
cfg.dateCols = F.guessDateCols(h, cfg.ctx, { 0: 1, 1: 1 });
var t = F.toEntries(h, [["A", "火", "○", "欠", "振", "○"], ["B", "火", "休", "", "無断", "振"]], cfg);
R = F.run(t.entries, { rule: { type: "none" }, asof: D("2026/6/30") });
eq(R.people.map(function (p) { return [p.name, p.group, p.absN, p.absNoN, p.used, p.remain, p.noCredit]; }), [["A", "火", 1, 0, 1, 0, 0], ["B", "火", 1, 1, 1, 0, 0]], "名前×日付");
eq(F.kindValues(h, [["A", "火", "○", "欠", "振", "○"]], cfg).map(function (k) { return k.v + k.n + k.guess; }), ["○2skip", "欠1abs", "振1use"], "種類の一覧");
// 割り当ての変更（休講も振替できる）
t = F.toEntries(["日付", "氏名", "種類"], [["2026/5/2", "A", "休講"]], { shape: "long", cols: { date: 0, name: 1, kind: 2 }, kindMap: { "休講": "abs" } });
eq(t.entries.length && t.entries[0].kind, "abs", "種類の割り当て");
// 人数の制限（お試し版）
R = mk([["日付", "氏名", "種類"]].concat(Array.from({ length: 15 }, function (_, i) { return ["2026/5/2", "人" + i, "欠席"]; })), { rule: { type: "none" }, limit: 10, asof: D("2026/6/30") });
eq([R.people.length, R.cut], [10, 5], "人数の制限");
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "A", "欠席"], ["2026/5/2", "B", "欠席"], ["2026/5/9", "B", "欠席"], ["2026/5/9", "C", "欠席"], ["2026/5/16", "C", "振替"]], { rule: { type: "none" }, limit: 1, asof: D("2026/6/30") });
eq([R.people.length, R.cut, R.recs.length], [1, 2, 1], "人数の制限（同じ人の2件目以降）");
// 期限が近い一覧
R = mk([["日付", "氏名", "種類"], ["2026/5/2", "A", "欠席"], ["2026/5/20", "B", "欠席"], ["2026/6/20", "C", "欠席"]], { rule: { type: "months", n: 1 }, soon: 14, asof: D("2026/6/10") });
eq(R.soonList.map(function (c) { return c.person.name + L(c.exp); }), ["B2026/6/20"], "期限が近い");
eq(R.expList.map(function (c) { return c.person.name; }), ["A"], "期限切れ");
// 速さ
var big = [["日付", "氏名", "種類"]];
for (var i = 0; i < 1000; i++) for (var w = 0; w < 40; w++) big.push([L(D("2026/4/1") + w * 7), "生徒" + i, (i + w) % 5 === 0 ? "欠席" : (i + w) % 5 === 2 ? "振替" : "出席"]);
var t0 = Date.now(); R = mk(big, { rule: { type: "months", n: 2 }, asof: D("2027/1/1") }); var ms = Date.now() - t0;
eq(R.people.length, 1000, "1000人×40回");
console.log("1000人×40回（" + (big.length - 1) + "行）の集計：" + ms + "ms");
console.log("OK " + ok + " / NG " + ng);
if (ng) process.exit(1);
