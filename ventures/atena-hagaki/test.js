// node test.js で関数を確認する
const A = require("./atena.js");
const assert = require("assert");
let n = 0;
function ok(name, f) { f(); n++; console.log("ok -", name); }

ok("CSV の読み込み（引用符・改行）", () => {
  const r = A.parseCSV('氏名,住所\n"山田 太郎","東京都港区1-2-3"\n\n');
  assert.deepStrictEqual(r, [["氏名", "住所"], ["山田 太郎", "東京都港区1-2-3"]]);
});
ok("タブ区切り（Excel から貼り付け）", () => {
  assert.deepStrictEqual(A.parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});
ok("Shift_JIS の判定", () => {
  const sj = new Uint8Array([0x8e, 0x52, 0x93, 0x63]); // 山田
  const d = A.decodeBytes(sj);
  assert.strictEqual(d.enc, "Shift_JIS"); assert.strictEqual(d.text, "山田");
});
ok("郵便番号の整形", () => {
  assert.strictEqual(A.normalizeZip("〒１０５－００２３"), "1050023");
  assert.strictEqual(A.normalizeZip("105-002"), "");
});
ok("漢数字（縦書き）", () => {
  assert.strictEqual(A.verticalText("芝浦1-2-3", "kanji"), "芝浦一ー二ー三");
  assert.strictEqual(A.verticalText("西新宿2丁目8番10号", "kanji"), "西新宿二丁目八番十号");
  assert.strictEqual(A.verticalText("北1条西20丁目1234番地の56 ビル1203号室", "kanji"), "北一条西二十丁目一二三四番地の五六　ビル一二〇三号室");
  assert.strictEqual(A.verticalText("梅田3丁目21番", "kanji"), "梅田三丁目二十一番");
  assert.strictEqual(A.verticalText("ABCビル 2F", "kanji"), "ＡＢＣビル　二Ｆ");
  assert.strictEqual(A.verticalText("1-2-3", "zen"), "１ー２ー３");
});
ok("建物名の分割", () => {
  assert.deepStrictEqual(A.splitBuilding("東京都港区芝浦1-2-3 サンプルマンション101"), ["東京都港区芝浦1-2-3", "サンプルマンション101"]);
  assert.deepStrictEqual(A.splitBuilding("東京都港区芝浦1-2-3"), ["東京都港区芝浦1-2-3", ""]);
});
ok("列の推定", () => {
  const m = A.guessColumns(["郵便番号", "住所1", "住所2", "姓", "名", "連名1", "連名2", "敬称", "会社名"]);
  assert.strictEqual(m.zip, 0); assert.strictEqual(m.addr1, 1); assert.strictEqual(m.addr2, 2);
  assert.strictEqual(m.sei, 3); assert.strictEqual(m.mei, 4); assert.deepStrictEqual(m.renmei, [5, 6]);
  assert.strictEqual(m.keisho, 7); assert.strictEqual(m.company, 8);
  const m2 = A.guessColumns(["氏名", "〒", "住所", "建物名"]);
  assert.strictEqual(m2.name, 0); assert.strictEqual(m2.zip, 1); assert.strictEqual(m2.addr1, 2); assert.strictEqual(m2.addr2, 3);
});
ok("1件分（連名・敬称）", () => {
  const m = A.guessColumns(["氏名", "郵便番号", "住所", "連名"]);
  const r = A.buildRecord(["山田 太郎", "105-0023", "東京都港区芝浦1-2-3 サンプル101", "花子、一郎"], m);
  assert.strictEqual(r.zip, "1050023"); assert.strictEqual(r.addr2, "サンプル101");
  assert.deepStrictEqual(r.names.map(x => x.sei + "/" + x.mei + x.keisho), ["山田/太郎様", "/花子様", "/一郎様"]);
  assert.deepStrictEqual(r.warn, []);
});
ok("会社だけの宛名は御中", () => {
  const m = A.guessColumns(["会社名", "郵便番号", "住所"]);
  const r = A.buildRecord(["株式会社サンプル", "1000001", "東京都千代田区千代田1-1"], m);
  assert.ok(r.companyOnly);
  const L = A.layout(r, {});
  assert.ok(L.items.some(i => i.s === "御中"));
});
ok("印刷しない行", () => {
  const m = A.guessColumns(["氏名", "住所", "印刷"]);
  assert.strictEqual(A.buildRecord(["a b", "x", "×"], m).skip, true);
  assert.strictEqual(A.buildRecord(["a b", "x", "○"], m).skip, false);
});
ok("配置：郵便番号枠の位置と、はがきからはみ出さない", () => {
  const m = A.guessColumns(["氏名", "郵便番号", "住所", "建物", "連名"]);
  const r = A.buildRecord(["長谷川 由紀子", "0600001", "北海道札幌市中央区北一条西二十丁目1234番地の56 大通り公園前グランドレジデンス", "第二サンプルビル1203号室", "健一郎、さくら、翔"], m);
  const L = A.layout(r, { sender: { zip: "1050023", addr1: "東京都港区芝浦1-2-3", addr2: "サンプル101", name: "山田 太郎", renmei: ["花子"] } });
  const z = L.items.filter(i => i.t === "zip");
  assert.strictEqual(z.length, 7); assert.strictEqual(z[0].x, 44); assert.strictEqual(z[0].y, 12);
  assert.ok(Math.abs(100 - (z[6].x + z[6].w) - 8.3) < 0.01);
  for (const i of L.items) {
    assert.ok(i.x >= 0 && i.x + i.w <= 100, "横 " + i.s + " " + i.x);
    assert.ok(i.y >= 0 && i.y + i.h <= 148, "縦 " + i.s + " " + (i.y + i.h));
  }
  // 宛名の列が差出人の列と重ならない
  const name = L.items.filter(i => i.cls === "name"), snd = L.items.filter(i => i.cls === "snd");
  for (const a of name) for (const b of snd) {
    const ov = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!ov, "重なり " + a.s + " / " + b.s);
  }
  // 住所の列と宛名の列も重ならない
  const addr = L.items.filter(i => i.cls === "addr");
  for (const a of name) for (const b of addr) assert.ok(a.x + a.w <= b.x + 0.01, "住所と重なり " + a.s);
});
console.log(n + " 件 ok");
