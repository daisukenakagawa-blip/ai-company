// node test.js
const E = require("./eigyo.js");
globalThis.Eigyo = E;
const T = require("./touban.js");
let ok = 0, ng = 0;
function eq(a, b, msg) { const s = JSON.stringify(a) === JSON.stringify(b); if (s) ok++; else { ng++; console.log("NG:", msg, "\n  got ", JSON.stringify(a), "\n  want", JSON.stringify(b)); } }

const range = { start: E.dn(2026, 12, 1), end: E.dn(2027, 1, 31) };

// 1. 出られない日の読み取り
let p = T.parseNG("月・水曜, 12/24 1/5", range);
eq(Object.keys(p.w).map(Number), [1, 3], "曜日");
eq(Object.keys(p.dates).map(Number), [E.dn(2026, 12, 24), E.dn(2027, 1, 5)], "年なしの日付は期間の中の年");
p = T.parseNG("12/28〜1/4", range);
eq(Object.keys(p.dates).length, 8, "年をまたぐ範囲");
p = T.parseNG("12/24~26 土日", range);
eq([Object.keys(p.dates).length, Object.keys(p.w).map(Number)], [3, [0, 6]], "後ろが日だけの範囲と「土日」");
p = T.parseNG("2026/12/31 あさって", range);
eq([Object.keys(p.dates).length, p.bad], [1, ["あさって"]], "読めない語は bad");

// 2. 名簿
let mem = T.parseMembers("名前\t出られない日\n山田\t火\n佐藤\n鈴木, 12/2\n\n山田\n", range);
eq(mem.members.map(m => m.name), ["山田", "佐藤", "鈴木", "山田"], "見出し行と空行は飛ばす");
eq(mem.warn.length, 1, "同じ名前の警告");

// 3. 係
eq(T.parseRoles("掃除 2\n受付\nゴミ出し：1人"), [{ name: "掃除", count: 2 }, { name: "受付", count: 1 }, { name: "ゴミ出し", count: 1 }], "係と人数");
eq(T.parseRoles(""), [{ name: "当番", count: 1 }], "係なしは「当番」1人");

// 4. 当番の日（平日のみ・祝日を除く）
const wk = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
let days = T.scheduleDays({ start: E.dn(2026, 11, 1), end: E.dn(2026, 11, 30), weekdays: wk, skipHolidays: true });
// 2026年11月：平日21日、うち11/3（文化の日・火）と 11/23（勤労感謝の日・月）が祝日 → 19日
eq(days.length, 19, "2026年11月の平日（祝日を除く）");
days = T.scheduleDays({ start: E.dn(2026, 11, 1), end: E.dn(2026, 11, 30), weekdays: wk, skipHolidays: false, skipDates: { [E.dn(2026, 11, 30)]: 1 } });
eq(days.length, 20, "祝日を含め、休みの日を1日除く");

// 5. 偏らない割り当て（制約なし → 名簿の順に回る）
let m4 = T.parseMembers("A\nB\nC\nD", range).members;
let d8 = T.scheduleDays({ start: E.dn(2026, 12, 7), end: E.dn(2026, 12, 18), weekdays: wk, skipHolidays: true });
let r = T.assign(m4, [{ name: "当番", count: 1 }], d8, {});
eq(r.rows.map(x => x.roles[0][0]).join(""), "ABCDABCDAB", "順番に回る");
eq(r.counts.map(c => c.total), [3, 3, 2, 2], "回数の差は1まで");

// 6. 出られない曜日を守る
let mX = T.parseMembers("A,月\nB\nC", range).members;
r = T.assign(mX, [{ name: "当番", count: 1 }], d8, {});
eq(r.rows.filter(x => E.ymd(x.n).w === 1 && x.roles[0][0] === "A").length, 0, "A は月曜に入らない");
eq(Math.max(...r.counts.map(c => c.total)) - Math.min(...r.counts.map(c => c.total)) <= 1, true, "それでも差は1まで");

// 7. 1日2人・同じ日に同じ人は入らない
r = T.assign(m4, [{ name: "掃除", count: 2 }, { name: "受付", count: 1 }], d8, {});
eq(r.rows.every(x => new Set(x.roles.flat()).size === x.roles.flat().length), true, "同じ日に2回入らない");
eq(r.counts.map(c => c.total).reduce((a, b) => a + b), 30, "10日×3人");
eq(Math.max(...r.counts.map(c => c.total)) - Math.min(...r.counts.map(c => c.total)) <= 1, true, "3人の日でも差は1まで");

// 8. 人数不足
r = T.assign(T.parseMembers("A\nB", range).members, [{ name: "当番", count: 3 }], d8.slice(0, 2), {});
eq([r.shortage, r.rows[0].short], [2, ["当番 1人不足"]], "不足の表示");

// 9. 連続を避ける
let m3 = T.parseMembers("A\nB\nC", range).members;
r = T.assign(m3, [{ name: "当番", count: 2 }], d8, { noConsecutive: true });
let consec = 0;
for (let i = 1; i < r.rows.length; i++) r.rows[i].roles[0].forEach(n => { if (r.rows[i - 1].roles[0].includes(n)) consec++; });
// 3人で毎日2人なら連続は避けられない日がある。避けない場合より少ないこと
let r2 = T.assign(m3, [{ name: "当番", count: 2 }], d8, {});
let consec2 = 0;
for (let i = 1; i < r2.rows.length; i++) r2.rows[i].roles[0].forEach(n => { if (r2.rows[i - 1].roles[0].includes(n)) consec2++; });
eq(consec <= consec2, true, "連続を避ける設定で連続が増えない");
r = T.assign(m4, [{ name: "当番", count: 1 }], d8, { noConsecutive: true });
eq(r.rows.every((x, i) => i === 0 || x.roles[0][0] !== r.rows[i - 1].roles[0][0]), true, "4人1日1人なら連続なし");

// 10. 前回の続き
let prior = T.parsePrior("A,5\nB,5\nC,4\nD,4");
r = T.assign(m4, [{ name: "当番", count: 1 }], d8.slice(0, 2), { prior });
eq(r.rows.map(x => x.roles[0][0]), ["C", "D"], "前回の回数が少ない人から");

// 11. CSV の表
r = T.assign(m4, [{ name: "掃除", count: 2 }], d8.slice(0, 1), {});
eq(T.toTable(r, [{ name: "掃除", count: 2 }]), [["日付", "曜日", "掃除", "備考"], ["2026/12/7", "月", "A・B", ""]], "表");
eq(T.countTable(r, [{ name: "掃除", count: 2 }])[1], ["A", "1", "12/7"], "回数表");

console.log(ok + " OK, " + ng + " NG");
process.exit(ng ? 1 : 0);
