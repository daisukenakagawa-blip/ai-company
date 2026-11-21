// 関数のテスト（node test-node.js）
var A = require("./atena.js"), L = require("./label.js"), ok = 0, ng = 0;
function t(name, cond) { if (cond) ok++; else { ng++; console.log("NG:", name); } }
// 用紙の例がすべて A4 に収まる
Object.keys(L.PRESETS).forEach(function (k) {
  var p = L.PRESETS[k];
  t("preset " + k + " fits", L.checkSheet(p).length === 0);
  var right = p.left + p.cols * p.w, bottom = p.top + p.rows * p.h;
  t("preset " + k + " 余白が左右・上下で対称に近い", Math.abs((210 - right) - p.left) < 0.6 && Math.abs((297 - bottom) - p.top) < 0.6);
});
t("はみ出し検出", L.checkSheet({ cols: 3, rows: 8, w: 75, h: 33.9, top: 12.9, left: 0, gx: 0, gy: 0 }).length === 1);
// 位置
var s = L.PRESETS["12"];
var P = L.positions(13, s, 0, {});
t("13件は2枚", P.pages === 2 && P.items[12].page === 1);
t("2件目は右の列", P.items[1].col === 1 && P.items[1].row === 0 && Math.abs(P.items[1].x - (18.6 + 86.4)) < 1e-6);
var P2 = L.positions(3, s, 11, {});
t("12面目から始めると2件目は2枚目の1面目", P2.items[0].page === 0 && P2.items[0].row === 5 && P2.items[1].page === 1 && P2.items[1].col === 0 && P2.items[1].row === 0);
var P3 = L.positions(3, s, 0, { order: "down" });
t("縦へ並べる", P3.items[1].col === 0 && P3.items[1].row === 1);
var P4 = L.positions(1, s, 0, { offsetX: 1, offsetY: -0.5 });
t("ずれ補正", Math.abs(P4.items[0].x - 19.6) < 1e-6 && Math.abs(P4.items[0].y - 21.1) < 1e-6);
// 中身
var rows = A.parseCSV("氏名,郵便番号,住所,建物名,連名,会社名,部署\n見本 太郎,1000001,東京都千代田区千代田1-1,,花子,,\n,060-0001,北海道札幌市中央区北一条西2-1,見本ビル5F,,株式会社サンプル,総務部\n");
var map = A.guessColumns(rows[0]);
var r1 = A.buildRecord(rows[1], map, {}), l1 = L.labelLines(r1, {});
t("郵便番号の書き方", l1[0].s === "〒100-0001");
t("連名は名の位置をそろえる", l1[l1.length - 1].ghost === "見本" && l1[l1.length - 1].s === "花子");
var r2 = A.buildRecord(rows[2], map, {}), l2 = L.labelLines(r2, {});
t("会社だけは御中", l2.some(function (x) { return x.s === "株式会社サンプル　御中"; }) && l2.some(function (x) { return x.s === "総務部"; }));
t("数字を半角に", L.numText("千代田１－１", "half") === "千代田1-1");
t("数字を全角に", L.numText("千代田1-1", "full") === "千代田１－１");
// 文字の大きさ：はみ出さない
[["12", 4], ["24", 3], ["44", 2]].forEach(function (c) {
  var p = L.PRESETS[c[0]], pad = c[1];
  var rec = A.buildRecord(["長い名前の 見本太郎左衛門", "1000001", "東京都千代田区千代田一丁目一番一号サンプル長い名前の町名", "サンプルタワーマンションイースト棟3201号室", "花子、一郎", "", ""], map, {});
  var F = L.fitLines(L.labelLines(rec, {}), p.w - pad * 2, p.h - pad * 2, 3.6);
  t(c[0] + "面：高さに収まる", F.height <= p.h - pad * 2 + 0.01);
  t(c[0] + "面：幅に収まる", F.lines.every(function (x) { var ln = x.ln; return x.fs * (L.textEm(ln.ghost ? ln.ghost + "　" : "") + L.textEm(ln.s) + (ln.keisho ? 1 + L.textEm(ln.keisho) : 0) + (ln.indent || 0)) <= p.w - pad * 2 + 0.01; }));
});
console.log("OK", ok, "NG", ng); process.exit(ng ? 1 : 0);
