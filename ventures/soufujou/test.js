// 送付状の一括作成 — 関数のテスト（node test.js）
var S = require("./soufu.js"), assert = require("assert"), n = 0;
function t(name, f) { f(); n++; console.log("OK", name); }
var H = ["会社名", "部署", "役職", "担当者", "同封書類", "備考", "送付方法"];
var map = S.guessColumns(H);
t("列の推定", function () { assert.deepStrictEqual([map.company, map.dept, map.position, map.name, map.docs, map.note], [0, 1, 2, 3, 4, 5]); });
function rec(row, o) { return S.buildRecord(row, map, H, o || {}); }
t("氏名あり → 様、会社は御中なし", function () {
  var r = rec(["株式会社みどり商事", "経理部", "", "山田 太郎様", "", "", ""]);
  assert.deepStrictEqual(S.addresseeLines(r), ["株式会社みどり商事", "経理部", "山田 太郎 様"]);
});
t("役職つき", function () { assert.deepStrictEqual(S.addresseeLines(rec(["A社", "", "代表取締役", "佐藤 花子", "", "", ""])), ["A社", "代表取締役 佐藤 花子 様"]); });
t("氏名なし → 御中（部署があれば部署に）", function () {
  assert.deepStrictEqual(S.addresseeLines(rec(["あおば建設株式会社", "総務課", "", "", "", "", ""])), ["あおば建設株式会社", "総務課 御中"]);
  assert.deepStrictEqual(S.addresseeLines(rec(["あおば建設株式会社", "", "", "", "", "", ""])), ["あおば建設株式会社 御中"]);
});
t("敬称の列「御中」でも氏名があれば様", function () {
  var H2 = ["会社名", "氏名", "敬称"], m2 = S.guessColumns(H2);
  assert.deepStrictEqual(S.addresseeLines(S.buildRecord(["X社", "鈴木", "御中"], m2, H2)), ["X社", "鈴木 様"]);
  assert.deepStrictEqual(S.addresseeLines(S.buildRecord(["X社", "鈴木", "先生"], m2, H2)), ["X社", "鈴木 先生"]);
});
t("宛先がない行は警告", function () { assert.ok(rec(["", "", "", "", "請求書", "", ""]).warn.length === 1); });
t("同封書類の分解", function () {
  assert.deepStrictEqual(S.parseDocs("請求書 1部、納品書　2部/見積書"), [{ name: "請求書", qty: "1部" }, { name: "納品書", qty: "2部" }, { name: "見積書", qty: "" }]);
  assert.deepStrictEqual(S.parseDocs("請求書×2\n返信用封筒 1通"), [{ name: "請求書", qty: "2部" }, { name: "返信用封筒", qty: "1通" }]);
  assert.deepStrictEqual(S.parseDocs("2026年度契約書"), [{ name: "2026年度契約書", qty: "" }]);
});
t("日付（西暦・和暦）", function () {
  assert.strictEqual(S.formatDate("2026-11-21", "ymd"), "2026年11月21日");
  assert.strictEqual(S.formatDate("2026-11-21", "wareki"), "令和8年11月21日");
  assert.strictEqual(S.formatDate("2019-05-01", "wareki"), "令和元年5月1日");
  assert.strictEqual(S.formatDate("2019-04-30", "wareki"), "平成31年4月30日");
  assert.strictEqual(S.formatDate("2027-01-05", "slash"), "2027/01/05");
});
t("前文：会社あて・個人あて・頭語なし", function () {
  var c = rec(["A社", "", "", "", "", "", ""]), p = S.buildRecord(["", "", "", "田中", "", "", ""], map, H);
  assert.strictEqual(S.opening(c, { style: "formal", season: "晩秋" }), "拝啓　晩秋の候、貴社ますますご清栄のこととお慶び申し上げます。平素は格別のお引き立てを賜り、厚く御礼申し上げます。");
  assert.ok(/^拝啓　時下ますますご清祥/.test(S.opening(p, { style: "formal", season: "jika" })));
  assert.strictEqual(S.opening(c, { style: "simple" }), "");
});
t("差し込み（任意の列も）と空欄の警告", function () {
  var r = rec(["A社", "", "", "山田", "", "", "郵送"]);
  var f = S.fill("{会社名}の{氏名}様へ、{送付方法}で。{部署}", r);
  assert.strictEqual(f.text, "A社の山田様へ、郵送で。");
  assert.deepStrictEqual(f.missing, ["部署"]);
  assert.deepStrictEqual(S.fill("{ない列}", r).missing, ["ない列"]);
});
t("同封書類：共通・列・足す", function () {
  var r = rec(["A社", "", "", "", "見積書 2部", "", ""]), r0 = rec(["B社", "", "", "", "", "", ""]);
  var o = { docs: "請求書 1部", body: "" };
  assert.deepStrictEqual(S.letter(r, Object.assign({ docsMode: "row" }, o)).docs.map(function (d) { return d.name; }), ["見積書"]);
  assert.deepStrictEqual(S.letter(r0, Object.assign({ docsMode: "row" }, o)).docs.map(function (d) { return d.name; }), ["請求書"]);
  assert.deepStrictEqual(S.letter(r, Object.assign({ docsMode: "append" }, o)).docs.map(function (d) { return d.name; }), ["請求書", "見積書"]);
  assert.deepStrictEqual(S.letter(r, Object.assign({ docsMode: "common" }, o)).docs.map(function (d) { return d.name; }), ["請求書"]);
  assert.ok(S.letter(r0, { docsMode: "row", docs: "", body: "" }).warn.indexOf("同封書類がありません") >= 0);
});
t("送らない行・備考・文書番号", function () {
  var H3 = ["会社名", "送る", "備考"], m3 = S.guessColumns(H3);
  assert.ok(S.buildRecord(["A社", "×", ""], m3, H3).skip);
  assert.ok(!S.buildRecord(["A社", "○", ""], m3, H3).skip);
  var L = S.letter(S.buildRecord(["A社", "", "至急"], m3, H3), { note: "共通", docs: "請求書", numbered: true, noPrefix: "2026-", index: 4, body: "" });
  assert.strictEqual(L.note, "共通\n至急"); assert.strictEqual(L.no, "2026-5");
});
console.log(n + " 件 OK");
