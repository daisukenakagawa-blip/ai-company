/* node test.js */
const K = require("./kibou.js");
let ok = 0, ng = 0;
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) ok++; else { ng++; console.log("NG", msg, "\n  got ", A, "\n  want", B); } }
const days = K.period({ y: 2026, m: 12 }, 1);
const lab = (r) => r.items.map(i => K.md(i.day) + (i.half ? i.half : "") + (i.paid ? "有" : "") + (i.pri === "must" ? "◎" : i.pri === "soft" ? "△" : "") + (i.out ? "外" : ""));

eq(days.length, 31, "12月は31日");
eq(K.period({ y: 2026, m: 12 }, 16).map(K.md).slice(0, 1).concat(K.period({ y: 2026, m: 12 }, 16).map(K.md).slice(-1)), ["12/16", "1/15"], "16日始まり");
eq(lab(K.parseDates("3, 10, 24日", days)), ["12/3", "12/10", "12/24"], "日だけ");
eq(lab(K.parseDates("12/5(土)午前・12/6", days)), ["12/5午前", "12/6"], "午前");
eq(K.parseDates("12/5(土)", days).items[0].wdBad, false, "曜日あう");
eq(K.parseDates("12/5(金)", days).items[0].wdBad, true, "曜日ちがう");
eq(lab(K.parseDates("12/24〜26 ◎", days)), ["12/24◎", "12/25◎", "12/26◎"], "範囲と◎");
eq(lab(K.parseDates("12月3日(木)、12月10日(木)", days)), ["12/3", "12/10"], "フォームの回答");
eq(lab(K.parseDates("2026-12-31", days)), ["12/31"], "ISO");
eq(lab(K.parseDates("12月 3日と10日", days)), ["12/3", "12/10"], "12月 3日と10日");
eq(lab(K.parseDates("12月は 5日 12日", days)), ["12/5", "12/12"], "月の前置き");
eq(lab(K.parseDates("有休 12/3 12/4", days)), ["12/3有", "12/4有"], "前の言葉はすべてに");
eq(lab(K.parseDates("1/5", days)), ["1/5外"], "期間の外");
eq(lab(K.parseDates("3日から5日", days)), ["12/3", "12/4", "12/5"], "から");
eq(lab(K.parseDates("8日 できれば", days)), ["12/8△"], "できれば");
eq(K.parseDates("10時から", days).items.length, 0, "時刻は日付でない");
eq(K.parseDates("なし", days).none, true, "なし");
eq(K.parseDates("12/32", days).bad, ["12/32"], "読めない日");
const p16 = K.period({ y: 2026, m: 11 }, 16);
eq(lab(K.parseDates("3, 20", p16)), ["12/3", "11/20"], "締め日の期間で日だけ");

// 行の名前
const st = K.parseStaff("青木 一郎\t早番\n石井 花,遅番\n上田 健\n上田 健\n");
eq(st.list.map(s => s.name + "/" + s.group), ["青木 一郎/早番", "石井 花/遅番", "上田 健/"], "名簿");
eq(st.dup.length, 1, "名簿の重なり");
eq(K.splitLine("青木 一郎 3,10,24", []), { name: "青木 一郎", rest: "3,10,24" }, "名前と日");
eq(K.splitLine("石井さん：12/5 午前", []), { name: "石井", rest: "12/5 午前" }, "コロンとさん");
eq(K.splitLine("上田 有休 12/3", []), { name: "上田", rest: "有休 12/3" }, "名前の後の有休");
eq(K.splitLine("青木一郎12/3", st.list).name, "青木 一郎", "名簿の名前で切る");
eq(K.splitLine("10:15\t青木\t12/3と12/4", []), { name: "青木", rest: "12/3と12/4" }, "LINE の履歴");

// 文 → 集計
const text = "12月の希望休\n青木：3, 10, 24日\n石井さん 12/24(木) ◎, 12/25\n上田 12/24 午前\n江口 12/24、12/31\n青木 12/31\n小野 なし\n";
const D = K.detect({ text });
eq(D.mode, "text", "文と判定");
eq(K.guessMonth(D, K.dayOf(2026, 11, 24)), { y: 2026, m: 12, sure: true }, "月の推定");
const staff = K.parseStaff("青木 一郎\t早番\n石井 花\t遅番\n上田 健\t早番\n江口 舞\t遅番\n小野 学\t早番\n加藤 恵\t遅番").list;
const C = K.collect(D, days, { staff });
const R = K.run(C, { days, staff, capW: 2, capH: 2, capG: 1, capP: 3, capPH: 0 });
eq(R.people.map(p => p.name + p.n), ["青木 一郎4", "石井 花2", "上田 健1", "江口 舞2", "小野 学0", "加藤 恵0"], "1人ごとの日数");
const d24 = R.days.find(r => K.md(r.day) === "12/24");
eq([d24.off.length, d24.over, d24.off.map(o => o.p.name)], [4, true, ["石井 花", "青木 一郎", "上田 健", "江口 舞"]], "12/24 上限超え・◎が先");
eq(d24.work, 3, "出勤できる人数（半日は出勤に数える）");
eq(R.flags.filter(f => f.type === "group").length, 2, "職種の上限（12/24 早番・遅番）");
eq(R.flags.filter(f => f.type === "person").map(f => f.name), ["青木 一郎"], "1人の上限");
eq(R.flags.filter(f => f.type === "nosub").map(f => f.name), ["加藤 恵"], "希望が出ていない（なしは出した扱い）");
eq(R.flags.filter(f => f.type === "name").map(f => f.text.split("：")[0]), ["名簿の名前として読みました（5 人）"], "名字だけ → 名簿の名前");
eq(R.flags.filter(f => f.type === "dupl").map(f => f.name), ["青木 一郎"], "2か所の書き込み");
const d31 = R.days.find(r => K.md(r.day) === "12/31");
eq(d31.off.length, 2, "12/31");
eq(R.days.find(r => K.md(r.day) === "12/3").we, false, "12/3 平日");

// お試し版の制限
const R5 = K.run(C, { days, staff, limit: 2 });
eq(R5.people.length, 2, "お試し：先頭2人");

// 表（名前×日付）
const rows = [["氏名", "職種", "1", "2", "3", "4", "5", "6", "7"], ["", "", "火", "水", "木", "金", "土", "日", "月"], ["青木", "早", "○", "", "", "有", "", "", "午前"], ["石井", "遅", "", "", "休", "", "", "◎", "出"], ["人数", "", "1", "", "1", "1", "", "1", ""]];
const DM = K.detect({ rows });
eq(DM.mode, "matrix", "表と判定");
eq(K.guessMonth(DM, K.dayOf(2026, 11, 24)), { y: 2026, m: 12, sure: true }, "表の曜日から12月");
const CM = K.collect(DM, days, { skipMarks: "出" });
const RM = K.run(CM, { days, staff: [] });
eq(RM.people.map(p => p.name + ":" + lab(p).join(" ")), ["青木:12/1 12/4有 12/7午前", "石井:12/3 12/6◎"], "表のマス");

// 1行1件・フォーム
const frows = [["タイムスタンプ", "お名前", "休み希望日（複数可）", "備考"], ["2026/11/20 10:00", "青木", "12月3日(木), 12月10日(木)", ""], ["2026/11/21 9:00", "石井", "12/24", "法事"], ["2026/11/21 9:30", "上田", "46378", ""]];
const DL = K.detect({ rows: frows });
eq(DL.mode, "list", "フォームと判定");
const RL = K.run(K.collect(DL, days, {}), { days, staff: [] });
eq(RL.people.map(p => p.name + ":" + lab(p).join(" ")), ["青木:12/3 12/10", "石井:12/24", "上田:12/22"], "フォームの回答（シリアル値も）");
eq(RL.people[1].items[0].memo, "法事", "備考");

// 祝日・枠
const jan = K.period({ y: 2027, m: 1 }, 1);
const RJ = K.run(K.collect(K.detect({ text: "青木 1/11\n石井 1/12" }), jan, {}), { days: jan, staff: [], capW: 1, capH: 0, capPH: 0 });
eq(RJ.days.find(r => K.md(r.day) === "1/11").hol, "成人の日", "祝日");
const F = K.frameRows(R, days, { mark: "希", extraRows: ["早番の人数"] });
eq(F.rows[0].slice(0, 4), ["氏名", "職種", "12/1(火)", "12/2(水)"], "枠の見出し");
eq(F.rows.length, 1 + 6 + 2, "枠の行数（祝日なし）");
eq(F.rows[1][2 + 23], "希", "青木 12/24");
eq(F.rows[2][2 + 23], "希", "石井 12/24 ◎ は希");
eq(F.rows[3][2 + 23], "希(前)", "上田 12/24 午前");
eq(F.rows[7].slice(0, 1).concat([F.rows[7][2 + 23]]), ["休み希望の人数", 4], "人数の行");
eq(K.frameRows(RJ, jan, { mark: "休" }).rows[1][1 + 10], "祝", "祝日の行");
eq(K.cellMark({ paid: true, half: "" }, "希"), "有", "有休は有");
eq(K.cellMark({ note: "旅行" }, "raw"), "旅行", "書いたまま");

// 大きなデータ
const big = []; for (let i = 0; i < 300; i++) big.push("社員" + i + "：" + [1 + i % 28, 2 + i % 27, 15].join(","));
let t0 = Date.now(); const RB = K.run(K.collect(K.detect({ text: big.join("\n") }), days, {}), { days, staff: [], capW: 5, capH: 5 }); const ms = Date.now() - t0;
eq(RB.people.length, 300, "300人");
console.log("300人の計算", ms, "ms");
console.log(ok + " OK, " + ng + " NG");
process.exit(ng ? 1 : 0);
