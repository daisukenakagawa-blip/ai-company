// 住所録の郵便番号・住所チェック：判定のしくみ（ブラウザと Node の両方で動く）
(function (root) {
  "use strict";

  // ---------- 文字の正規化 ----------
  const KD = { "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  function kanjiToNum(s) {
    // 「十」「二十三」「百五」などを数字に。漢数字の並びだけを置き換える
    return s.replace(/[〇一二三四五六七八九十百]+/g, function (m) {
      if (!/[十百]/.test(m)) return m.split("").map(function (c) { return KD[c]; }).join("");
      let total = 0, cur = 0;
      for (const c of m) {
        if (c === "百") { total += (cur || 1) * 100; cur = 0; }
        else if (c === "十") { total += (cur || 1) * 10; cur = 0; }
        else cur = cur * 10 + KD[c];
      }
      return String(total + cur);
    });
  }
  function norm(s) {
    if (s == null) return "";
    s = String(s).normalize("NFKC");
    s = s.replace(/[\s　]+/g, "");
    s = s.replace(/^〒?\d{3}-?\d{4}/, "");               // 住所の先頭に郵便番号が付いている場合
    s = s.replace(/[‐‑‒–—―−ｰ－]/g, "-");
    s = s.replace(/(\d)ー/g, "$1-");
    s = s.replace(/ヶ|ヵ/g, function (c) { return c === "ヶ" ? "ケ" : "カ"; });
    s = s.replace(/([一-鿿])[がケ](?=[一-鿿])/g, "$1ケ");
    s = s.replace(/([一-鿿])[の之](?=[一-鿿])/g, "$1ノ");
    s = s.replace(/大字|字(?=[一-鿿])/g, function (m, off, str) { return m === "大字" ? "" : (off > 0 && /[町村市区]/.test(str[off - 1]) ? "" : m); });
    s = s.replace(/[舘]/g, "館").replace(/[塚]/g, "塚").replace(/[澤]/g, "沢").replace(/[邊邉]/g, "辺").replace(/[嶋]/g, "島");
    s = kanjiToNum(s);
    return s;
  }
  function normZip(z) {
    if (z == null) return { raw: "", zip: "", note: "" };
    const raw = String(z);
    let d = raw.normalize("NFKC").replace(/[〒\s　\-‐‑‒–—―−ー－]/g, "");
    if (d === "") return { raw: raw, zip: "", note: "" };
    if (/^\d{3}$/.test(d)) return { raw: raw, zip: "", bad: "3桁しかありません（旧郵便番号の可能性）" };
    if (/^\d{6}$/.test(d)) return { raw: raw, zip: "0" + d, note: "先頭の0を補いました" };
    if (!/^\d{7}$/.test(d)) return { raw: raw, zip: "", bad: "7桁の数字ではありません" };
    return { raw: raw, zip: d, note: "" };
  }
  function fmtZip(z) { return z ? z.slice(0, 3) + "-" + z.slice(3) : ""; }

  // ---------- 注記（丁目・番地の範囲） ----------
  function parseRange(note, unit) {
    // "2〜4丁目" "1、3丁目" "1丁目" → [[2,4]] など。unit は「丁目」か「番地」
    const re = new RegExp("^([0-9０-９〜、−-]+)" + unit + "$");
    const m = (note || "").normalize("NFKC").match(re);
    if (!m) return null;
    return m[1].split("、").map(function (p) {
      const r = p.split("〜").map(function (x) { return parseInt(x, 10); });
      return [r[0], r.length > 1 ? r[1] : r[0]];
    });
  }
  function inRange(rs, n) { return rs.some(function (r) { return n >= r[0] && n <= r[1]; }); }

  // ---------- データの読み込み ----------
  function load(text) {
    const lines = text.split("\n");
    const D = { version: "", prefs: [], cities: [], byZip: new Map(), byCity: new Map() };
    for (const line of lines) {
      if (!line) continue;
      const f = line.split("\t");
      if (f[0] === "V") { D.version = f[1] || ""; continue; }
      if (f[0] === "P") { D.prefs = f.slice(1); continue; }
      if (f[0] === "C") {
        D.cities = f.slice(1).map(function (k, i) {
          const p = k.indexOf(":"); const pi = +k.slice(0, p); const name = k.slice(p + 1);
          const alt = name.replace(/^.+?郡(?=.)/, "");
          return { i: i, pi: pi, pref: D.prefs[pi], name: name, n: norm(name), alt: alt !== name ? norm(alt) : "" };
        });
        continue;
      }
      const e = { zip: f[0], ci: +f[1], town: f[2] || "", note: f[3] || "", kind: f[4] || "" };
      e.tn = norm(e.town);
      e.chome = e.kind === "" ? parseRange(e.note, "丁目") : null;
      e.banchi = e.kind === "" && /番地|番$|地割/.test(e.note);
      e.generic = e.note === "以下に掲載がない場合";
      if (!D.byZip.has(e.zip)) D.byZip.set(e.zip, []);
      D.byZip.get(e.zip).push(e);
      if (e.kind === "") {
        if (!D.byCity.has(e.ci)) D.byCity.set(e.ci, []);
        D.byCity.get(e.ci).push(e);
      }
    }
    D.prefN = D.prefs.map(norm);
    return D;
  }
  function fullAddr(D, e) {
    const c = D.cities[e.ci];
    return c.pref + c.name + e.town;
  }

  // ---------- 住所の読み取り（都道府県・市区町村・町域） ----------
  function firstNum(rest) {
    const m = rest.match(/^(\d+)(丁目|-|番|$)/);
    return m ? { n: +m[1], unit: m[2] } : null;
  }
  function parseAddress(D, a) {
    const r = { pref: -1, cities: [], city: null, town: null, rest: a, entries: [], why: "" };
    if (!a) return r;
    let rest = a;
    for (let i = 0; i < D.prefN.length; i++) {
      if (rest.startsWith(D.prefN[i])) { r.pref = i; rest = rest.slice(D.prefN[i].length); break; }
    }
    // 市区町村：いちばん長く一致するもの（郡を省いた書き方も見る）
    let best = 0, cs = [];
    for (const c of D.cities) {
      if (r.pref >= 0 && c.pi !== r.pref) continue;
      for (const key of [c.n, c.alt]) {
        if (!key || !rest.startsWith(key)) continue;
        if (key.length > best) { best = key.length; cs = [{ c: c, len: key.length }]; }
        else if (key.length === best) cs.push({ c: c, len: key.length });
      }
    }
    r.cities = cs.map(function (x) { return x.c; });
    if (cs.length === 0) { r.why = r.pref >= 0 ? "市区町村が読み取れません" : "都道府県・市区町村が読み取れません"; return r; }
    if (cs.length > 1) { r.why = "同じ名前の市区町村が複数あります（都道府県を書くと決まります）"; return r; }
    r.city = cs[0].c; rest = rest.slice(cs[0].len); r.rest = rest;
    const list = D.byCity.get(r.city.i) || [];
    // 町域：先頭からいちばん長く一致するもの
    let tl = -1, towns = [];
    for (const e of list) {
      if (!e.tn) continue;
      if (rest.startsWith(e.tn)) {
        if (e.tn.length > tl) { tl = e.tn.length; towns = [e]; }
        else if (e.tn.length === tl) towns.push(e);
      }
    }
    // 京都市などの通り名（「河原町通三条上る恵比須町」）：途中に町域名がある場合
    if (!towns.length && /^京都市/.test(r.city.name)) {
      for (const e of list) {
        if (e.tn.length >= 2 && rest.indexOf(e.tn) >= 0) {
          if (e.tn.length > tl) { tl = e.tn.length; towns = [e]; }
          else if (e.tn.length === tl) towns.push(e);
        }
      }
      if (towns.length) { r.town = towns[0].town; r.rest = rest.slice(rest.indexOf(towns[0].tn) + tl); }
    } else if (towns.length) { r.town = towns[0].town; r.rest = rest.slice(tl); }
    if (!towns.length) {
      const g = list.filter(function (e) { return e.generic; });
      r.entries = g; r.why = "町域が郵便番号の一覧にありません";
      return r;
    }
    // 丁目で分かれている町域
    const num = firstNum(r.rest);
    const withChome = towns.filter(function (e) { return e.chome; });
    if (withChome.length) {
      if (num && (num.unit === "丁目" || num.unit === "-" || num.unit === "")) {
        const hit = withChome.filter(function (e) { return inRange(e.chome, num.n); });
        if (hit.length) { r.entries = hit; return r; }
      }
      r.entries = towns; r.why = "丁目によって郵便番号が分かれています";
      return r;
    }
    if (towns.some(function (e) { return e.banchi; })) {
      const bh = num ? towns.filter(function (e) {
        const rg = parseRange(e.note, "番地");
        return rg && inRange(rg, num.n);
      }) : [];
      const plain = towns.filter(function (e) { return !e.banchi; });
      if (bh.length === 1) { r.entries = bh; return r; }
      r.entries = towns; r.why = "番地によって郵便番号が分かれています"; r.plain = plain;
      return r;
    }
    r.entries = towns;
    return r;
  }
  function uniqZips(es) { return Array.from(new Set(es.map(function (e) { return e.zip; }))); }

  // ---------- 1行の判定 ----------
  // 返す値: { status, level(ok|fill|warn|ng|empty), msg, zip(整えた郵便番号), fillZip, fillAddr, candZips, zipAddr }
  function checkRow(D, zipRaw, addrRaw) {
    const z = normZip(zipRaw);
    const a = norm(addrRaw);
    const out = { status: "", level: "", msg: "", zip: z.zip ? fmtZip(z.zip) : "", fillZip: "", fillAddr: "", candZips: "", zipAddr: "" };
    const notes = [];
    if (z.note) notes.push(z.note);
    const P = parseAddress(D, a);
    const fromAddr = uniqZips(P.entries);
    const zipEntries = z.zip ? (D.byZip.get(z.zip) || []) : [];
    if (zipEntries.length) out.zipAddr = Array.from(new Set(zipEntries.map(function (e) {
      return fullAddr(D, e) + (e.kind === "O" ? "（" + e.note + "）" : e.note && !e.generic ? "（" + e.note + "）" : "");
    }))).slice(0, 3).join(" ／ ");

    if (!z.zip && !z.bad && !a) { out.status = "空欄"; out.level = "empty"; out.msg = "郵便番号も住所もありません"; return out; }

    if (z.bad) {
      out.status = "郵便番号の形が不正"; out.level = "ng"; notes.unshift(z.bad);
      if (fromAddr.length === 1) { out.candZips = fmtZip(fromAddr[0]); notes.push("住所から見ると " + out.candZips); }
      out.msg = notes.join("。"); return out;
    }

    if (!z.zip) {                       // 郵便番号が空欄 → 住所から補う
      if (fromAddr.length === 1 && !P.why) {
        out.status = "郵便番号を補完"; out.level = "fill"; out.fillZip = fmtZip(fromAddr[0]);
        out.msg = "住所から郵便番号を求めました";
      } else if (fromAddr.length >= 1) {
        out.status = "候補が複数"; out.level = "warn"; out.candZips = fromAddr.slice(0, 6).map(fmtZip).join("、");
        out.msg = (P.why || "郵便番号の候補が複数あります") + "。番地・建物名を見て選んでください";
      } else {
        out.status = "住所を読み取れない"; out.level = "warn"; out.msg = P.why || "住所を読み取れません";
      }
      return out;
    }

    if (!zipEntries.length) {
      out.status = "存在しない郵便番号"; out.level = "ng";
      notes.unshift("この郵便番号は日本郵便の一覧にありません");
      if (fromAddr.length === 1) { out.candZips = fmtZip(fromAddr[0]); notes.push("住所から見ると " + out.candZips); }
      else if (fromAddr.length > 1) { out.candZips = fromAddr.slice(0, 6).map(fmtZip).join("、"); notes.push("住所から見た候補あり"); }
      out.msg = notes.join("。"); return out;
    }

    if (!a) {                           // 住所が空欄 → 郵便番号から補う
      const towns = Array.from(new Set(zipEntries.map(function (e) { return fullAddr(D, e); })));
      if (towns.length === 1) {
        out.status = "住所を補完"; out.level = "fill"; out.fillAddr = towns[0];
        out.msg = "郵便番号から住所（町域まで）を求めました。番地・建物名は入りません";
      } else {
        out.status = "候補が複数"; out.level = "warn"; out.msg = "この郵便番号には町域が複数あります：" + towns.slice(0, 4).join("、");
      }
      if (notes.length) out.msg = notes.join("。") + "。" + out.msg;
      return out;
    }

    // 両方ある → 突き合わせ
    if (P.city && fromAddr.indexOf(z.zip) >= 0) {
      out.status = "OK"; out.level = "ok";
      if (P.why && fromAddr.length > 1) { out.status = "OK（要確認）"; out.level = "warn"; notes.push(P.why + "。番地を見て確かめてください"); }
      out.msg = notes.join("。"); return out;
    }
    // 事業所・ビルの個別番号：市区町村と町域が合えば OK
    const special = zipEntries.filter(function (e) { return e.kind === "O" || e.kind === "B"; });
    if (special.length && P.city) {
      const ok = special.some(function (e) {
        return e.ci === P.city.i && (!P.town || e.tn.startsWith(norm(P.town)) || norm(P.town).startsWith(e.tn.slice(0, 2)));
      });
      if (ok) {
        out.status = "OK"; out.level = "ok";
        notes.push(special[0].kind === "O" ? "事業所の個別番号です" : "ビルの個別番号です");
        out.msg = notes.join("。"); return out;
      }
    }
    // 「以下に掲載がない場合」の番号で、町域が一覧にない住所
    const generic = zipEntries.some(function (e) { return e.generic; });
    if (P.city && generic && zipEntries.some(function (e) { return e.ci === P.city.i; }) && !P.town) {
      out.status = "OK"; out.level = "ok"; out.msg = notes.join("。"); return out;
    }
    const sameCity = P.city && zipEntries.some(function (e) { return e.ci === P.city.i; });
    if (sameCity) {
      out.status = "町域が合わない"; out.level = "ng";
      notes.unshift("市区町村は合っていますが、町域（または丁目）が郵便番号と合いません");
    } else if (P.city) {
      out.status = "郵便番号と住所が合わない"; out.level = "ng";
      notes.unshift("郵便番号は別の市区町村のものです");
    } else {
      out.status = "住所を読み取れない"; out.level = "warn";
      notes.unshift((P.why || "住所を読み取れません") + "。郵便番号との照合ができません");
    }
    if (fromAddr.length === 1 && !P.why) { out.candZips = fmtZip(fromAddr[0]); notes.push("住所から見ると " + out.candZips); }
    else if (fromAddr.length > 1) { out.candZips = fromAddr.slice(0, 6).map(fmtZip).join("、"); notes.push("住所から見た候補：" + out.candZips); }
    out.msg = notes.join("。");
    return out;
  }

  const API = { norm: norm, normZip: normZip, fmtZip: fmtZip, kanjiToNum: kanjiToNum, load: load, parseAddress: parseAddress, checkRow: checkRow, fullAddr: fullAddr };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.JushoCheck = API;
})(this);
