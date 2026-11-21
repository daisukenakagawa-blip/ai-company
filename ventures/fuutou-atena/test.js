// node test.js で関数を確認する
const F = require("./fuutou.js");
const assert = require("assert");
let n = 0;
function ok(name, f) { f(); n++; console.log("ok -", name); }
const H = ["氏名", "郵便番号", "住所", "建物名", "連名", "会社名", "部署"];
const map = F.guessColumns(H);
const recs = [
  ["見本 太郎", "100-0001", "東京都千代田区千代田1-1", "", "", "", ""],
  ["例田 さくら", "530-0001", "大阪府大阪市北区梅田3丁目2番10号", "サンプルビル12階", "", "株式会社サンプル商事", "経理部"],
  ["", "060-0001", "北海道札幌市中央区北一条西2-1", "見本ビル5F", "", "有限会社見本工房", ""],
  ["試田 健一", "9000015", "沖縄県那覇市久茂地1-2-3", "", "和子、一郎、二郎", "", ""],
  ["長名 左衛門之助", "1234567", "神奈川県足柄上郡中井町比奈窪字サンプル1234番地の56", "サンプルレジデンス見本ヶ丘弐番館1203号室", "", "", ""]
].map(r => F.buildRecord(r, map, {}));
function inside(L, it) { return it.x >= 0 && it.y >= 0 && it.x + it.w <= L.w + 0.01 && it.y + (it.h || 0) <= L.h + 0.01; }
function overlap(a, b) { return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01; }

ok("郵便番号枠：長形3号は上端12mm・右端8mm（枠線の内側から）", () => {
  const b = F.zipBoxes(F.ENV.naga3, "jis");
  assert.strictEqual(b.length, 7); assert.strictEqual(b[0].y, 12);
  assert.ok(Math.abs(120 - (b[6].x + b[6].w) - 8.3) < 0.01);
  assert.ok(Math.abs(b[6].x + b[6].w - b[0].x - 47.7) < 0.01);
});
ok("郵便番号枠：長形4号・上端18mm右端18mm・角形2号は文字", () => {
  const b4 = F.zipBoxes(F.ENV.naga4, "jis"); assert.ok(Math.abs(90 - (b4[6].x + b4[6].w) - 8.3) < 0.01);
  const r = F.zipBoxes(F.ENV.naga3, "r18"); assert.strictEqual(r[0].y, 18); assert.ok(Math.abs(120 - (r[6].x + r[6].w) - 18.3) < 0.01);
  assert.strictEqual(F.frameOf({ env: "kaku2", frame: "auto" }), "none");
  const L = F.layout(recs[0], { env: "kaku2" });
  assert.ok(L.items.some(i => i.t === "text" && i.s === "〒100-0001"));
});
["naga3", "naga4", "kaku2"].forEach(env => {
  ["", "請求書在中"].forEach(stamp => {
    ok(`配置（${env}${stamp ? "・在中あり" : ""}）：封筒からはみ出さず、氏名・住所・会社・在中が重ならない`, () => {
      recs.forEach((r, k) => {
        const L = F.layout(r, { env, stamp });
        L.items.forEach(it => assert.ok(inside(L, it), `${k} ${it.s} はみ出し`));
        const big = L.items.filter(i => i.t === "col" || i.t === "stamp");
        const names = big.filter(i => i.cls === "name"), others = big.filter(i => i.cls !== "name");
        names.forEach(a => others.forEach(b => assert.ok(!overlap(a, b), `${k} ${a.s} と ${b.s} が重なる`)));
        const zipB = Math.max(...L.items.filter(i => i.t === "zip" || i.cls === "zipt").map(i => i.y + i.h));
        big.forEach(i => assert.ok(i.y >= zipB, `${k} ${i.s} が郵便番号に重なる`));
      });
    });
  });
});
ok("会社名だけは御中、会社名と氏名は様", () => {
  assert.ok(F.layout(recs[2], {}).items.some(i => i.s === "御中"));
  const L = F.layout(recs[1], {});
  assert.ok(L.items.some(i => i.cls === "comp" && i.s === "株式会社サンプル商事"));
  assert.ok(L.items.some(i => i.s === "様"));
});
ok("裏面：差出人は中央より左・下半分、封筒の中", () => {
  const snd = { zip: "105-0023", addr1: "東京都港区芝浦1-2-3", addr2: "サンプルビル4階", company: "サンプル事務所", dept: "総務部", name: "山田 太郎" };
  ["naga3", "naga4", "kaku2"].forEach(env => {
    const L = F.layoutBack(snd, { env });
    assert.ok(L.items.length >= 6);
    L.items.forEach(it => { assert.ok(inside(L, it), env + " " + it.s); });
    L.items.filter(i => i.t === "col").forEach(it => { assert.ok(it.x + it.w <= L.w / 2); assert.ok(it.y >= L.h / 2 - 0.01); });
    assert.ok(L.items.some(i => i.s === "〒105-0023"));
  });
});
ok("ずれの補正", () => {
  const a = F.layout(recs[0], {}), b = F.layout(recs[0], { offsetX: 1.5, offsetY: -1 });
  assert.ok(Math.abs(b.items[0].x - a.items[0].x - 1.5) < 1e-9 && Math.abs(b.items[0].y - a.items[0].y + 1) < 1e-9);
});
console.log(n + " tests passed");
