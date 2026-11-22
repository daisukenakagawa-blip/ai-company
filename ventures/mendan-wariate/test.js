// node test.js
var M = require("./mendan.js");
var ok = 0, ng = 0;
function t(name, cond) { if (cond) ok++; else { ng++; console.log("NG:", name); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var TODAY = new Date(2026, 10, 22);
function P(s) { var r = M.parseItem(s); return r && [r.m, r.d, r.dom, r.wd, r.from, r.to, r.at]; }

// 読み込み
t("CSV", eq(M.parseCSV('氏名,第1希望\n"見本, 太郎","11/25, 11/26"\n'), [["氏名", "第1希望"], ["見本, 太郎", "11/25, 11/26"]]));
t("TSV", eq(M.parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]));

// 希望の書き方
t("日付と以降", eq(P("11/25 15時以降"), [11, 25, null, null, 900, 1440, null]));
t("月日と午後", eq(P("11月26日午後"), [11, 26, null, null, 720, 1440, null]));
t("全角", eq(P("１１／２６　１５：００〜１６：００"), [11, 26, null, null, 900, 960, null]));
t("曜日", eq(P("木曜"), [null, null, null, 4, 0, 1440, null]));
t("曜日と午後", eq(P("水曜日の午後"), [null, null, null, 3, 720, 1440, null]));
t("括弧の曜日は飾り", eq(P("11/27(金) 14:00〜15:00"), [11, 27, null, null, 840, 900, null]));
t("まで", eq(P("16時まで"), [null, null, null, null, 0, 960, null]));
t("午後3時半から", eq(P("午後3時半から"), [null, null, null, null, 930, 1440, null]));
t("日だけ＋夕方", eq(P("25日の夕方"), [null, null, 25, null, 960, 1440, null]));
t("時刻1つ", eq(P("2026/11/25 15:00"), [11, 25, null, null, 0, 1440, 900]));
t("時台", eq(P("11/25 14時台"), [11, 25, null, null, 840, 900, null]));
t("いつでも", eq(P("いつでも"), [null, null, null, null, 0, 1440, null]));
t("なし・読めない", M.parseItem("なし") === null && M.parseItem("あいうえ") === null && M.parseItem("13/40") === null);
t("逆の範囲は読めない", M.parseItem("16:00-15:00") === null);
t("セルの区切り", M.parseCell("11/25か11/26の午後、木曜").items.length === 3);
t("読めない部分", eq(M.parseCell("11/25、そのほか").bad, ["そのほか"]));

// 枠
var r = M.makeSlots("2026/11/25(水) 14:00-16:30\n11/26 14:00-15:00、15:30-16:30", 15, 5, [""], TODAY);
t("枠の数", r.slots.length === 13 && !r.problems.length);
t("枠の時刻", M.hm(r.slots[6].start) === "16:00" && M.hm(r.slots[6].end) === "16:15" && M.hm(r.slots[10].start) === "15:30");
t("曜日", r.slots[0].wd === 3 && r.slots[7].wd === 4);
var r2 = M.makeSlots("11/25 14:00-15:00\n11/25 9:00\nあいう", 20, 0, ["1組", "2組"], TODAY);
t("部屋ごと", r2.slots.length === 6 && r2.slots[0].roomName === "1組" && r2.slots[1].roomName === "2組" && r2.slots[0].start === r2.slots[1].start);
t("枠の誤り", r2.problems.length === 3);
t("年なしは近い年", M.resolveYear(11, 25, TODAY) === 2026 && M.resolveYear(4, 10, TODAY) === 2027 && M.resolveYear(10, 30, TODAY) === 2026);

// 希望の表 → 割り当て
var slots = M.makeSlots("11/25 14:00-15:00\n11/26 14:00-15:00", 20, 0, [""], TODAY).slots; // 6枠
var rows = [["A", "11/25", ""], ["B", "11/25", ""], ["C", "11/25", ""], ["D", "11/25", "11/26"], ["E", "", ""], ["F", "11/26 14:00-14:20", ""]];
var Pw = M.buildPrefs(rows, { mode: "wish", cols: [1, 2], slots: slots, headers: ["氏名", "第1希望", "第2希望"] });
t("希望の順位", Pw.rank[3][0] === 0 && Pw.rank[3][3] === 1 && Pw.rank[0][3] === -1 && Pw.rank[5][3] === 0 && Pw.rank[5][4] === -1);
t("回答なし", Pw.noAns[4] && !Pw.noAns[0]);
var A = M.assign(Pw, { slots: slots, allowOutside: false, fillNoAnswer: false });
var rep = M.report(Pw, slots, A.a, []);
// 11/25 の3枠に A,B,C,D の4人 → D が第2希望（11/26）へ、F は 11/26 14:00
t("割り当て：Dは第2希望へ", [A.a[0], A.a[1], A.a[2]].sort().join() === "0,1,2" && A.a[3] >= 3 && A.a[5] === 3 && A.a[3] !== 3);
t("回答なしは未定", A.a[4] === -1 && rep.unassigned.length === 1 && /回答/.test(rep.unassigned[0].why));
t("集計", rep.counts["第1希望"] === 4 && rep.counts["第2希望"] === 1);
var A2 = M.assign(Pw, { slots: slots, allowOutside: false, fillNoAnswer: true });
t("回答なしも空きへ", A2.a[4] >= 0 && M.kindOf(Pw, 4, A2.a[4]) === "noans");
t("前から詰める（空きは後ろに残る）", [A2.a[3], A2.a[4]].sort().join() === "4,5" && M.kindOf(Pw, 3, A2.a[3]) === 1);
// 希望が足りない → 未定、希望外を許すと入る
var rows3 = [["A", "11/25 14:00-14:20"], ["B", "11/25 14:00-14:20"]];
var P3 = M.buildPrefs(rows3, { mode: "wish", cols: [1], slots: slots, headers: ["氏名", "第1希望"] });
var A3 = M.assign(P3, { slots: slots });
t("埋まった理由", M.report(P3, slots, A3.a, []).unassigned.length === 1 && /埋まりました/.test(M.report(P3, slots, A3.a, []).unassigned[0].why));
var A4 = M.assign(P3, { slots: slots, allowOutside: true });
t("希望外", A4.a.indexOf(-1) < 0 && (M.kindOf(P3, 0, A4.a[0]) === "out" || M.kindOf(P3, 1, A4.a[1]) === "out"));

// ○△× の表
var hd = ["氏名", "11/25(水) 14:00-14:20", "11/25(水) 14:20-14:40", "11/26 午後"];
var Pm = M.buildPrefs([["A", "○", "△", "×"], ["B", "△", "", "○"], ["C", "◯", "ok", "?"]], { mode: "mark", cols: [1, 2, 3], slots: slots, headers: hd });
t("○△×", Pm.rank[0][0] === 0 && Pm.rank[0][1] === 1 && Pm.rank[0][3] === -1 && Pm.rank[1][1] === -1 && Pm.rank[1][4] === 0 && Pm.rank[2][1] === 0);
t("読めない記号", Pm.problems.some(function (p) { return /読めない記入が 1/.test(p); }));
t("○△×の見出しの推定", eq(M.guessMode(hd, []).cols, [1, 2, 3]) && M.guessMode(hd, []).mode === "mark");
var Am = M.assign(Pm, { slots: slots });
t("○△×の割り当て：△を避ける", Am.a[0] === 0 && Am.a[1] >= 3 && Am.a[2] === 1);

// 都合の悪い日時
var Pn = M.buildPrefs([["A", "11/25"], ["B", ""]], { mode: "ng", cols: [1], slots: slots, headers: ["氏名", "都合の悪い日"] });
t("都合の悪い日", Pn.rank[0].slice(0, 3).every(function (x) { return x === -1; }) && Pn.rank[0][3] === 0 && Pn.rank[1].every(function (x) { return x === 0; }));
t("推定：都合の悪い", M.guessMode(["氏名", "都合の悪い日時"], []).mode === "ng" && M.guessMode(["氏名", "第1希望", "第2希望"], []).mode === "wish");

// きょうだい（続けての枠）
var sl6 = M.makeSlots("11/25 14:00-15:20\n11/26 14:00-15:00", 20, 0, [""], TODAY).slots; // 11/25 は4枠
var rowsS = [["兄", "11/25", "山田"], ["妹", "11/25", "山田"], ["X", "11/25 14:20-14:40", ""], ["Y", "11/25 14:00-14:20", ""]];
var PS = M.buildPrefs(rowsS, { mode: "wish", cols: [1], slots: sl6, headers: ["氏名", "第1希望", "きょうだい"] });
var G = M.groupsBy(rowsS, 2);
t("組", eq(G, [[0, 1]]));
var AS = M.assign(PS, { slots: sl6, groups: G });
var repS = M.report(PS, sl6, AS.a, G);
t("きょうだいは続けて・ほかの人も希望どおり", eq(AS.a, [2, 3, 1, 0]) && !repS.groupBad[0] && !repS.unassigned.length);
t("続けてでない組の検出", M.report(PS, sl6, [0, 2, 1, -1], G).groupBad[0] === true && M.report(PS, sl6, [1, 2, 0, -1], G).groupBad[0] === false);
t("推定：きょうだい", M.guessSib(["氏名", "きょうだい"]) === 1 && M.guessName(["番号", "生徒氏名", "保護者名"]) === 1);

// 大きめ：200人・3日×2部屋（約200枠）
var big = M.makeSlots("11/24 13:00-18:00\n11/25 13:00-18:00\n11/26 13:00-18:00\n11/27 13:00-18:00\n11/28 13:00-18:00", 15, 5, ["1組", "2組", "3組"], TODAY).slots;
var rowsB = [], wishes = ["11/25", "11/26", "11/27", "11/25 15時以降", "11/24 午後", "木曜", "11/28 16時まで", "いつでも"];
for (var i = 0; i < 200; i++) rowsB.push(["人" + i, wishes[(i * 7) % 8], wishes[(i * 3 + 1) % 8], i % 25 === 0 && i < 190 ? "組" + i : (i % 25 === 1 ? "組" + (i - 1) : "")]);
var PB = M.buildPrefs(rowsB, { mode: "wish", cols: [1, 2], slots: big, headers: ["氏名", "第1希望", "第2希望", "兄弟"] });
var GB = M.groupsBy(rowsB, 3), t0 = Date.now();
var AB = M.assign(PB, { slots: big, groups: GB, allowOutside: true });
var ms = Date.now() - t0, repB = M.report(PB, big, AB.a, GB);
console.log("200人", big.length, "枠", ms, "ms", JSON.stringify(repB.counts), "組", GB.length, "続けてでない", repB.groupBad.filter(Boolean).length);
t("200人：重なりなし", repB.dup.length === 0 && repB.unassigned.length === 0 && repB.groupBad.every(function (b) { return !b; }));

console.log(ok + " OK, " + ng + " NG");
process.exit(ng ? 1 : 0);
