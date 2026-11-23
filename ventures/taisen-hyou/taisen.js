/* 総当たりの対戦表づくり — 計算の部分（ブラウザと Node の両方で動く）。データは外へ送信しない */
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/　/g, " ").replace(/\s+/g, " ").trim();
  }
  // チーム名は全角・半角をそのまま残す（表示用）。比べるときだけ norm を使う
  function clean(s) { return String(s == null ? "" : s).replace(/[　\s]+/g, " ").trim(); }

  // ---------- 参加チームを読む ----------
  // 1行に1チーム。「チーム名<TAB>組」「チーム名,組」で組を指定できる
  var HEAD = /^(チーム名?|チーム・個人|氏名|名前|参加者|選手名?|団体名?|team)$/i;
  var HEAD_G = /^(組|グループ|リーグ|ブロック|部|group)$/i;
  function parseTeams(text) {
    var lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n"), teams = [], dups = [], seen = {}, hasGroup = false;
    lines.forEach(function (line, li) {
      if (!line.trim()) return;
      var parts = line.indexOf("\t") >= 0 ? line.split("\t") : line.split(/[,，、]/);
      var name = clean(parts[0]), group = clean(parts.slice(1).filter(function (p) { return clean(p) !== ""; })[0] || "");
      if (!name) return;
      if (!teams.length && !dups.length && HEAD.test(norm(name)) && (!group || HEAD_G.test(norm(group)))) return; // 見出しの行
      var key = norm(name).toLowerCase();
      if (seen[key]) { dups.push({ line: li + 1, name: name }); return; }
      seen[key] = true;
      if (group) hasGroup = true;
      teams.push({ name: name, group: group, line: li + 1 });
    });
    return { teams: teams, dups: dups, hasGroup: hasGroup };
  }

  var GN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  // 組に分ける。how: "given"（書いた組のとおり）、"snake"（1,2,3,3,2,1…）、"turn"（1,2,3,1,2,3…）、"block"（上から順にまとめて）
  function makeGroups(teams, k, how) {
    var groups = [], map = {};
    if (how === "given") {
      teams.forEach(function (t) {
        var g = t.group || "（組なし）";
        if (!map[g]) { map[g] = { name: g, teams: [] }; groups.push(map[g]); }
        map[g].teams.push(t.name);
      });
      return groups;
    }
    k = Math.max(1, Math.min(k | 0 || 1, teams.length || 1));
    for (var i = 0; i < k; i++) groups.push({ name: k === 1 ? "" : GN[i % 26] + (i >= 26 ? Math.floor(i / 26) + 1 : "") + "組", teams: [] });
    var n = teams.length, size = Math.ceil(n / k);
    teams.forEach(function (t, i) {
      var g;
      if (how === "block") {
        // 人数ができるだけそろうように前から分ける（10チーム・3組 → 4,3,3）
        var base = Math.floor(n / k), extra = n % k, acc = 0;
        for (g = 0; g < k; g++) { acc += base + (g < extra ? 1 : 0); if (i < acc) break; }
      } else if (how === "turn") g = i % k;
      else { var r = Math.floor(i / k), p = i % k; g = r % 2 === 0 ? p : k - 1 - p; }
      groups[g].teams.push(t.name);
    });
    void size;
    return groups.filter(function (g) { return g.teams.length; });
  }

  // ---------- 総当たりの回（サークル方式） ----------
  // n チームの1回総当たり。戻り値：回ごとの [a, b]（チームの番号）の配列と、休みのチーム
  function circle(n) {
    var arr = [], i, rounds = [];
    for (i = 0; i < n; i++) arr.push(i);
    if (n % 2) arr.push(-1);
    var m = arr.length;
    for (var r = 0; r < m - 1; r++) {
      var pairs = [], bye = [];
      for (i = 0; i < m / 2; i++) {
        var a = arr[i], b = arr[m - 1 - i];
        if (a < 0 || b < 0) { bye.push(a < 0 ? b : a); continue; }
        pairs.push(i === 0 && r % 2 ? [b, a] : [a, b]);
      }
      rounds.push({ pairs: pairs, bye: bye });
      arr = [arr[0], arr[m - 1]].concat(arr.slice(1, m - 1));
    }
    // 左（先に書く側・ホーム・先攻）の回数ができるだけそろうように向きを決める（差は1以内）
    var mo = n % 2 ? n : n + 1, half = (mo - 1) / 2;
    rounds.forEach(function (rd) {
      rd.pairs = rd.pairs.map(function (p) {
        var d = ((p[1] - p[0]) % mo + mo) % mo;
        return d >= 1 && d <= half ? [p[0], p[1]] : [p[1], p[0]];
      });
    });
    return rounds;
  }

  // 全部の試合（組・回・何回目の総当たり）を作る
  function makeMatches(groups, legs) {
    var all = [];
    groups.forEach(function (g, gi) {
      var rs = circle(g.teams.length), R = rs.length;
      for (var leg = 0; leg < legs; leg++) {
        rs.forEach(function (rd, ri) {
          rd.pairs.forEach(function (p) {
            var a = g.teams[p[leg % 2 ? 1 : 0]], b = g.teams[p[leg % 2 ? 0 : 1]];
            all.push({ g: gi, group: g.name, a: a, b: b, round: leg * R + ri, leg: leg, key: keyOf(g.name, a, b, leg) });
          });
        });
      }
    });
    return all;
  }
  function keyOf(g, a, b, leg) { return [g, a, b, leg].map(function (x) { return norm(x).toLowerCase(); }).join("\u0001"); }

  // ---------- 時刻 ----------
  function parseClock(s) {
    var t = norm(s).replace(/時半$/, ":30").replace(/時(\d{1,2})分?$/, ":$1").replace(/時$/, ":00"), m;
    if ((m = t.match(/^(\d{1,2})[:：](\d{2})$/))) { if (+m[2] >= 60 || +m[1] > 30) return null; return +m[1] * 60 + +m[2]; }
    if ((m = t.match(/^(\d{3,4})$/))) { var x = m[1].length === 3 ? "0" + m[1] : m[1]; if (+x.slice(2) >= 60) return null; return +x.slice(0, 2) * 60 + +x.slice(2); }
    if ((m = t.match(/^(\d{1,2})$/))) return +m[1] * 60;
    return null;
  }
  function parseBreaks(text) {
    var out = [], errs = [];
    String(text == null ? "" : text).split(/[\n,，、]/).forEach(function (part) {
      var p = norm(part); if (!p) return;
      var m = p.split(/\s*[-〜~～−ー－]\s*/);
      var s = m.length === 2 ? parseClock(m[0]) : null, e = m.length === 2 ? parseClock(m[1]) : null;
      if (s == null || e == null || e <= s) errs.push(p); else out.push([s, e]);
    });
    out.sort(function (x, y) { return x[0] - y[0]; });
    return { list: out, errs: errs };
  }
  function hm(min) { if (min == null) return ""; min = Math.round(min); return Math.floor(min / 60) + ":" + ("0" + (min % 60)).slice(-2); }

  // ---------- 試合の順番とコート ----------
  // o: { courts, avoid（連戦を避ける）, start, dur, gap, breaks, referee（"none"|"rest"）, courtNames[] }
  // 試合を時間の枠に並べる（1回分）。rnd は同点のときの選び方を変えるための乱数
  function order(pool, courts, avoid, lagMax, rnd) {
    pool = pool.slice();
    var slots = [], last = {}, prevTeams = {};
    while (pool.length) {
      var used = {}, pick = [], si = slots.length, minRound = {};
      pool.forEach(function (m) { if (minRound[m.g] == null || m.round < minRound[m.g]) minRound[m.g] = m.round; });
      while (pick.length < courts) {
        var best = -1, bs = Infinity;
        for (var i = 0; i < pool.length; i++) {
          var m = pool[i];
          if (used[m.a] || used[m.b]) continue;
          var lag = m.round - minRound[m.g];
          if (lag > lagMax) continue; // 回を飛ばしすぎない（チームごとの試合数の進みをそろえる）
          var s = lag * 100;
          if (avoid) s += ((prevTeams[m.a] ? 1 : 0) + (prevTeams[m.b] ? 1 : 0)) * 1000;
          var wa = last[m.a] == null ? 99 : si - last[m.a], wb = last[m.b] == null ? 99 : si - last[m.b];
          s -= Math.min(wa, wb, 99) * 2 + Math.min(wa + wb, 198) * 0.01;
          s += rnd ? rnd() * 1.5 : i * 0.0001;
          if (s < bs) { bs = s; best = i; }
        }
        if (best < 0) break;
        var mm = pool.splice(best, 1)[0];
        used[mm.a] = used[mm.b] = true;
        pick.push(mm);
      }
      prevTeams = {};
      pick.forEach(function (m) { last[m.a] = last[m.b] = si; prevTeams[m.a] = prevTeams[m.b] = true; });
      slots.push({ matches: pick });
    }
    return slots;
  }
  // 並べ方のよさ：枠の数（短いほどよい）→ 連戦の合計 → 3連戦以上 → 連戦のいちばん多いチーム
  function cost(slots) {
    var lastS = {}, back = {}, run = {}, total = 0, worst = 0, maxRun = 0;
    slots.forEach(function (sl, k) {
      sl.matches.forEach(function (m) {
        [m.a, m.b].forEach(function (t) {
          if (lastS[t] === k - 1) { back[t] = (back[t] || 0) + 1; total++; run[t] = (run[t] || 1) + 1; } else run[t] = 1;
          lastS[t] = k; if (back[t] > worst) worst = back[t]; if (run[t] > maxRun) maxRun = run[t];
        });
      });
    });
    return slots.length * 1e6 + total * 1000 + (maxRun > 2 ? (maxRun - 2) * 300 : 0) + worst * 10;
  }
  function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; }; }

  // o: { courts, legs, avoid（連戦を避ける）, start, dur, gap, breaks, referee（"none"|"rest"）, courtNames[] }
  function schedule(groups, o) {
    var legs = o.legs === 2 ? 2 : 1, courts = Math.max(1, o.courts | 0 || 1);
    var pool = makeMatches(groups, legs);
    var slots = order(pool, courts, o.avoid, 1, null), bc = cost(slots);
    if (o.avoid && pool.length > 1) {
      // 乱数の種を変えて何通りか並べ、連戦のいちばん少ないものを使う（同じ入力なら毎回同じ結果）
      var tries = Math.max(4, Math.min(150, Math.floor(60000 / (pool.length * Math.max(pool.length / courts, 1) + 1)))), r = rng(20261123);
      for (var t = 0; t < tries; t++) {
        var cand = order(pool, courts, true, t % 3 === 2 ? 2 : 1, r), c = cost(cand);
        if (c < bc) { bc = c; slots = cand; }
      }
    }
    // 時刻
    var t = o.start, br = (o.breaks || []).slice();
    var names = o.courtNames && o.courtNames.length ? o.courtNames : null, no = 0;
    slots.forEach(function (sl, k) {
      if (t != null) {
        var moved = true;
        while (moved) { moved = false; br.forEach(function (b) { if (t < b[1] && t + o.dur > b[0]) { t = b[1]; moved = true; } }); }
        sl.start = t; sl.end = t + o.dur; t = t + o.dur + (o.gap || 0);
      }
      sl.no = k + 1;
      sl.matches.forEach(function (m, c) { m.no = ++no; m.slot = k; m.court = names && names[c] ? names[c] : (c + 1) + ""; m.start = sl.start; m.end = sl.end; });
    });
    // 審判（その時間に試合のないチームから、同じ組を優先し、回数がそろうように）
    if (o.referee === "rest") assignReferees(groups, slots);
    return { slots: slots, matches: slots.reduce(function (a, s) { return a.concat(s.matches); }, []), courts: courts, legs: legs };
  }

  function assignReferees(groups, slots) {
    var count = {}, gOf = {}, playing = slots.map(function (s) { var p = {}; s.matches.forEach(function (m) { p[m.a] = p[m.b] = true; }); return p; });
    groups.forEach(function (g, gi) { g.teams.forEach(function (t) { count[t] = 0; gOf[t] = gi; }); });
    var all = Object.keys(count);
    slots.forEach(function (s, k) {
      var busy = {}; for (var t in playing[k]) busy[t] = true;
      s.matches.forEach(function (m) {
        var best = null, bs = Infinity;
        all.forEach(function (t) {
          if (busy[t]) return;
          var sc = count[t] * 100 + (gOf[t] === m.g ? 0 : 1000) + ((playing[k - 1] && playing[k - 1][t]) || (playing[k + 1] && playing[k + 1][t]) ? 0 : 3);
          if (sc < bs) { bs = sc; best = t; }
        });
        m.ref = best || "";
        if (best) { busy[best] = true; count[best]++; }
      });
    });
  }

  // ---------- チームごとのまとめ ----------
  function teamStats(groups, sch) {
    var st = {}, order = [];
    groups.forEach(function (g) { g.teams.forEach(function (t) { st[t] = { name: t, group: g.name, games: 0, home: 0, slots: [], refs: 0, back: 0, maxRun: 0 }; order.push(t); }); });
    sch.matches.forEach(function (m) {
      [m.a, m.b].forEach(function (t, i) { var x = st[t]; x.games++; if (i === 0) x.home++; x.slots.push(m.slot); });
      if (m.ref && st[m.ref]) st[m.ref].refs++;
    });
    order.forEach(function (t) {
      var x = st[t], run = 0;
      x.slots.sort(function (a, b) { return a - b; });
      x.slots.forEach(function (s, i) {
        if (i && s === x.slots[i - 1] + 1) { x.back++; run++; } else run = 1;
        if (run > x.maxRun) x.maxRun = run;
      });
      x.first = x.slots.length ? sch.slots[x.slots[0]] : null;
      x.lastSlot = x.slots.length ? sch.slots[x.slots[x.slots.length - 1]] : null;
    });
    return order.map(function (t) { return st[t]; });
  }

  // ---------- 結果と順位 ----------
  function parseScore(s) {
    var t = norm(s).replace(/\s+/g, "");
    if (!t) return null;
    var m = t.match(/^(\d{1,3})[-－ー−‐対:：xX×](\d{1,3})$/);
    if (!m) return { err: true };
    return { a: +m[1], b: +m[2] };
  }
  // results: { key: "3-1" }。pts: { win, draw, loss }
  function standings(group, gi, sch, results, pts) {
    var rows = {};
    group.teams.forEach(function (t) { rows[t] = { name: t, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, pts: 0 }; });
    sch.matches.forEach(function (m) {
      if (m.g !== gi) return;
      var sc = parseScore(results[m.key]);
      if (!sc || sc.err) return;
      var A = rows[m.a], B = rows[m.b];
      A.played++; B.played++; A.gf += sc.a; A.ga += sc.b; B.gf += sc.b; B.ga += sc.a;
      if (sc.a > sc.b) { A.win++; B.loss++; } else if (sc.a < sc.b) { B.win++; A.loss++; } else { A.draw++; B.draw++; }
    });
    var list = group.teams.map(function (t) {
      var r = rows[t]; r.pts = r.win * pts.win + r.draw * pts.draw + r.loss * pts.loss; r.diff = r.gf - r.ga; return r;
    });
    list.sort(function (x, y) { return y.pts - x.pts || y.diff - x.diff || y.gf - x.gf; });
    list.forEach(function (r, i) {
      var p = list[i - 1];
      r.rank = p && p.pts === r.pts && p.diff === r.diff && p.gf === r.gf ? p.rank : i + 1;
    });
    list.forEach(function (r) { r.tie = list.filter(function (x) { return x.rank === r.rank; }).length > 1; });
    return list;
  }

  function csvCell(v) { v = v == null ? "" : String(v); return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }

  var api = {
    norm: norm, parseTeams: parseTeams, makeGroups: makeGroups, circle: circle, makeMatches: makeMatches, keyOf: keyOf,
    parseClock: parseClock, parseBreaks: parseBreaks, hm: hm, schedule: schedule, teamStats: teamStats,
    parseScore: parseScore, standings: standings, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TAISEN = api;
})(this);
