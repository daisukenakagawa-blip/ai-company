// 総当たりの対戦表づくり — 関数のテスト（node test.js）
var T = require("./taisen.js"), n = 0, bad = 0;
function eq(a, b, m) { n++; var A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; console.log("NG", m, "\n  got", A, "\n  exp", B); } }
function ok(c, m) { eq(!!c, true, m); }
function names(k) { var a = []; for (var i = 1; i <= k; i++) a.push("T" + i); return a; }

// 参加チームを読む
var p = T.parseTeams("チーム名\n青葉ＦＣ\n  みどり台  \n\n青葉FC\nさくら,B\nけやき\tA");
eq(p.teams.map(function (t) { return t.name; }), ["青葉ＦＣ", "みどり台", "さくら", "けやき"], "teams");
eq(p.dups.length, 1, "dup (全角半角の違いは同じ名前)"); eq(p.hasGroup, true, "group given");
eq(p.teams[2].group, "B", "group comma"); eq(p.teams[3].group, "A", "group tab");
eq(T.parseTeams("チーム,組\nA,1\nB,1").teams.length, 2, "header with group");

// 組分け
var tt = names(10).map(function (x) { return { name: x }; });
eq(T.makeGroups(tt, 3, "block").map(function (g) { return g.teams.length; }), [4, 3, 3], "block sizes");
eq(T.makeGroups(tt, 3, "snake").map(function (g) { return g.teams; }), [["T1", "T6", "T7"], ["T2", "T5", "T8"], ["T3", "T4", "T9", "T10"]], "snake");
eq(T.makeGroups(tt, 3, "turn")[0].teams, ["T1", "T4", "T7", "T10"], "turn");
eq(T.makeGroups([{ name: "a", group: "東" }, { name: "b", group: "西" }, { name: "c", group: "東" }], 1, "given").map(function (g) { return g.name + ":" + g.teams.join(""); }), ["東:ac", "西:b"], "given");

// 総当たりの回：全部の組み合わせが1回ずつ・1回に1試合まで・左右の回数の差は1以内
for (var k = 2; k <= 16; k++) {
  var rs = T.circle(k), seen = {}, cnt = 0, home = [], okRound = true;
  for (var i = 0; i < k; i++) home.push(0);
  rs.forEach(function (rd) {
    var u = {};
    rd.pairs.forEach(function (q) { if (u[q[0]] || u[q[1]]) okRound = false; u[q[0]] = u[q[1]] = 1; seen[Math.min(q[0], q[1]) + "-" + Math.max(q[0], q[1])] = 1; cnt++; home[q[0]]++; });
  });
  eq([cnt, Object.keys(seen).length, rs.length], [k * (k - 1) / 2, k * (k - 1) / 2, k % 2 ? k : k - 1], "circle " + k);
  ok(okRound, "one game per round " + k);
  ok(Math.max.apply(null, home) - Math.min.apply(null, home) <= 1, "home balance " + k + " " + home.join(","));
}

// 試合の順番：同じ時間に同じチームは出ない・全試合が入る・試合数がそろう
function check(k, courts, legs, avoid, label) {
  var g = [{ name: "", teams: names(k) }];
  var s = T.schedule(g, { courts: courts, legs: legs, avoid: avoid, start: 540, dur: 20, gap: 5, breaks: [], referee: "rest" });
  var total = k * (k - 1) / 2 * legs, dbl = false, pairs = {};
  s.slots.forEach(function (sl) { var u = {}; sl.matches.forEach(function (m) { if (u[m.a] || u[m.b] || m.ref === m.a || m.ref === m.b || (m.ref && u[m.ref])) dbl = true; u[m.a] = u[m.b] = 1; if (m.ref) u[m.ref] = 1; pairs[[m.a, m.b].sort() + "|" + m.leg] = (pairs[[m.a, m.b].sort() + "|" + m.leg] || 0) + 1; }); ok(sl.matches.length <= courts, "courts " + label); });
  eq(s.matches.length, total, "total " + label); ok(!dbl, "no double " + label);
  eq(Object.keys(pairs).length, total, "each pair once per leg " + label);
  var st = T.teamStats(g, s);
  ok(st.every(function (x) { return x.games === (k - 1) * legs; }), "games " + label);
  return { s: s, st: st };
}
var r = check(6, 1, 1, true, "6x1");
eq(r.st.reduce(function (a, x) { return a + x.back; }, 0), 0, "6 teams 1 court: no back-to-back");
eq(r.s.slots.length, 15, "6x1 slots");
eq([r.s.slots[0].start, r.s.slots[1].start, r.s.slots[14].end], [540, 565, 540 + 14 * 25 + 20], "times");
ok(r.st.every(function (x) { return x.refs >= 2 && x.refs <= 3; }), "refs balanced " + r.st.map(function (x) { return x.refs; }));
r = check(8, 2, 1, true, "8x2");
console.log("  8チーム2コート 連戦:", r.st.map(function (x) { return x.back; }).join(","), "枠", r.s.slots.length);
ok(r.st.reduce(function (a, x) { return a + x.back; }, 0) <= 8 && r.st.every(function (x) { return x.maxRun <= 2; }), "8x2 few back-to-back, no 3 in a row");
eq(r.s.slots.length, 14, "8x2 slots");
r = check(5, 2, 1, true, "5x2");
console.log("  5チーム2コート 連戦:", r.st.map(function (x) { return x.back; }).join(","), "枠", r.s.slots.length);
r = check(7, 3, 2, true, "7x3 two legs");
console.log("  7チーム3コート2回 連戦:", r.st.map(function (x) { return x.back; }).join(","), "枠", r.s.slots.length);
var homeAway = {}; r.s.matches.forEach(function (m) { var kk = [m.a, m.b].sort().join("|"); homeAway[kk] = (homeAway[kk] || "") + (m.a < m.b ? "L" : "R"); });
ok(Object.keys(homeAway).every(function (kk) { return homeAway[kk] === "LR" || homeAway[kk] === "RL"; }), "two legs swap sides");
check(4, 2, 1, false, "4x2"); check(3, 1, 1, true, "3x1"); check(2, 1, 1, true, "2x1"); check(16, 4, 1, true, "16x4"); check(9, 1, 2, true, "9x1x2");
var noAvoid = check(6, 1, 1, false, "6x1 no avoid");
console.log("  6チーム1コート（連戦を避けない）連戦:", noAvoid.st.reduce(function (a, x) { return a + x.back; }, 0));

// 組が複数：コートを分け合う・組をまたいだ試合はない・審判は同じ組から
var G = T.makeGroups(names(10).map(function (x) { return { name: x }; }), 2, "snake");
var s2 = T.schedule(G, { courts: 2, legs: 1, avoid: true, start: 540, dur: 15, gap: 5, breaks: [[720, 780]], referee: "rest" });
eq(s2.matches.length, 20, "two groups total");
ok(s2.matches.every(function (m) { return G[m.g].teams.indexOf(m.a) >= 0 && G[m.g].teams.indexOf(m.b) >= 0; }), "no cross-group");
ok(s2.matches.every(function (m, i) {
  if (G[m.g].teams.indexOf(m.ref) >= 0) return true;
  var sl = s2.slots[m.slot], busy = {}; sl.matches.forEach(function (x) { busy[x.a] = busy[x.b] = 1; if (x.ref && x.no < m.no) busy[x.ref] = 1; });
  return G[m.g].teams.every(function (t) { return busy[t]; });
}), "ref same group when possible");
ok(s2.slots.every(function (sl) { return !(sl.start < 780 && sl.end > 720); }), "lunch break skipped");
var afterLunch = s2.slots.filter(function (sl) { return sl.start >= 720; })[0];
eq(afterLunch && afterLunch.start, 780, "resume after break");
ok(s2.slots.every(function (sl) { return sl.matches.length === 2; }), "two groups fill both courts");
// コートの名前
var s3 = T.schedule([{ name: "", teams: names(4) }], { courts: 2, legs: 1, avoid: false, start: null, dur: 10, gap: 0, courtNames: ["A面", "B面"] });
eq(s3.slots[0].matches.map(function (m) { return m.court; }), ["A面", "B面"], "court names"); eq(s3.slots[0].start, undefined, "no time");

// 時刻・休み時間
eq([T.parseClock("9:00"), T.parseClock("９時半"), T.parseClock("1330"), T.parseClock("13"), T.parseClock("25:99"), T.parseClock("あ")], [540, 570, 810, 780, null, null], "clock");
var b = T.parseBreaks("12:00-13:00、15:00〜15:15\n16:00-15:00");
eq(b.list, [[720, 780], [900, 915]], "breaks"); eq(b.errs, ["16:00-15:00"], "break err");
eq(T.hm(545), "9:05", "hm");

// 結果と順位
eq([T.parseScore("3-1"), T.parseScore("２対２"), T.parseScore(""), T.parseScore("勝ち")], [{ a: 3, b: 1 }, { a: 2, b: 2 }, null, { err: true }], "score");
var g4 = [{ name: "", teams: ["A", "B", "C", "D"] }], s4 = T.schedule(g4, { courts: 2, legs: 1, avoid: false, start: 540, dur: 10, gap: 0 });
var res = {}, want = { "A|B": "2-0", "C|D": "1-1", "A|C": "0-1", "B|D": "3-0", "A|D": "1-0", "B|C": "2-2" };
s4.matches.forEach(function (m) {
  var sc = want[m.a + "|" + m.b], sw = want[m.b + "|" + m.a];
  res[m.key] = sc || sw.split("-").reverse().join("-");
});
var tb = T.standings(g4[0], 0, s4, res, { win: 3, draw: 1, loss: 0 });
eq(tb.map(function (r) { return [r.name, r.pts, r.diff, r.gf, r.rank]; }), [["A", 6, 2, 3, 1], ["C", 5, 1, 4, 2], ["B", 4, 1, 5, 3], ["D", 1, -4, 1, 4]], "standings");
eq(tb.map(function (r) { return r.win + "/" + r.draw + "/" + r.loss; }), ["2/0/1", "1/2/0", "1/1/1", "0/1/2"], "w/d/l");
// 勝点・得失点差が同じなら総得点、それも同じなら同順位
var res2 = {}; s4.matches.forEach(function (m) { res2[m.key] = "1-1"; });
eq(T.standings(g4[0], 0, s4, res2, { win: 3, draw: 1, loss: 0 }).map(function (r) { return r.rank + (r.tie ? "=" : ""); }), ["1=", "1=", "1=", "1="], "all draw tie");
res[s4.matches[0].key] = "";
eq(T.standings(g4[0], 0, s4, res, { win: 2, draw: 1, loss: 0 }).reduce(function (a, r) { return a + r.played; }, 0), 10, "blank result not counted");
var tie = T.standings({ teams: ["X", "Y"] }, 0, { matches: [] }, {}, { win: 3, draw: 1, loss: 0 });
eq(tie.map(function (r) { return r.rank + (r.tie ? "=" : ""); }), ["1=", "1="], "tie");

// 速さ：32チーム・2回総当たり・8コート
var t0 = Date.now(), big = T.schedule([{ name: "", teams: names(32) }], { courts: 8, legs: 2, avoid: true, start: 540, dur: 10, gap: 0, referee: "rest" });
var ms = Date.now() - t0; eq(big.matches.length, 992, "big total"); console.log("  32チーム2回総当たり 992試合:", ms, "ms");
ok(ms < 3000, "speed");

eq(T.toCSV([["a", "b,c"]]), "﻿a,\"b,c\"\r\n", "csv");
console.log(bad ? bad + " / " + n + " NG" : n + " 件 OK");
