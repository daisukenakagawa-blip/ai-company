// node test.js — 関数のテスト
var C = require("./code.js");
var n = 0, bad = 0;
function eq(name, got, want) {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
}
// 公開されている例の番号
eq("ISBN-10 例", C.isbn10Check("030640615"), "2");
eq("ISBN-13 例", C.gs1Check("978030640615"), "7");
eq("ISBN 10→13", C.isbn10to13("0306406152"), "9780306406157");
eq("EAN-8 例", C.gs1Check("9638507"), "4");
eq("UPC-A 例", C.gs1Check("03600029145"), "2");
eq("GTIN-14 例", C.gs1Check("1001234567890"), "2");
eq("ISBN-10 X", C.isbn10Check("080442957"), "X");
// inspect
function st(v, mode) { var r = C.inspect(v, { mode: mode }); return [r.status, r.kind || null, r.fixed || r.guess || null]; }
eq("JAN 正", st("4901234567894"), ["ok", "jan13", "4901234567894"]);
eq("JAN 違い", st("4901234567890"), ["check", "jan13", "4901234567894"]);
eq("全角", st("４９０１２３４５６７８９４"), ["fixed", "jan13", "4901234567894"]);
eq("ハイフン", st("49-01234-56789-4"), ["fixed", "jan13", "4901234567894"]);
eq(".0", st("4901234567894.0"), ["fixed", "jan13", "4901234567894"]);
eq("指数 戻せる", st("4.901234567894E+12"), ["fixed", "jan13", "4901234567894"]);
eq("指数 戻せない", st("4.90123E+12"), ["exp", null, null]);
eq("ISBN ハイフン", st("ISBN978-0-306-40615-7"), ["fixed", "isbn13", "9780306406157"]);
eq("ISBN-10", st("0-306-40615-2"), ["fixed", "isbn10", "0306406152"]);
eq("ISBN-10 X", st("080442957X"), ["ok", "isbn10", "080442957X"]);
eq("ISBN-10 違い", st("0306406153"), ["check", "isbn10", "0306406152"]);
eq("EAN-8", st("96385074"), ["ok", "jan8", "96385074"]);
eq("UPC", st("036000291452"), ["ok", "upc", "036000291452"]);
eq("GTIN14", st("10012345678902"), ["ok", "gtin14", "10012345678902"]);
eq("桁数違い", st("490123456789"), ["check", "upc", "490123456789".slice(0, 11) + C.gs1Check("49012345678")]);
eq("11桁", st("49012345678"), ["len", null, null]);
eq("文字", st("49012A4567894"), ["notnum", null, null]);
eq("空欄", st(""), ["blank", null, null]);
eq("固定13 で12桁 0補い", st("036000291452", "jan13"), ["zero", "jan13", "0036000291452"]);
eq("固定13 で12桁 違う", st("490123456789", "jan13"), ["len", null, null]);
eq("固定ISBN で JAN", st("4901234567894", "isbn"), ["len", null, null]);
eq("固定14 で13桁", st("4901234567894", "gtin14"), ["zero", "gtin14", "04901234567894"]);
eq("インストア", C.inspect("2012345678903").note || C.inspect("2012345678903").status, C.gs1Check("201234567890") === "3" ? "20〜29 で始まる店内用の番号（インストアコード）" : "check");
// addCheck
function g(v, mode) { var r = C.addCheck(v, { mode: mode }); return [r.status, r.fixed || null]; }
eq("付ける12", g("490123456789"), ["ok", "4901234567894"]);
eq("付ける7", g("9638507"), ["ok", "96385074"]);
eq("付ける9 ISBN", g("080442957"), ["ok", "080442957X"]);
eq("付ける ISBN 12", g("978-0-306-40615", "isbn"), ["ok", "9780306406157"]);
eq("付ける ISBN 違う", g("490123456789", "isbn"), ["len", null]);
eq("付ける 桁違い", g("4901234567", "jan13"), ["len", null]);
// run：重複（13桁と14桁、ISBN-10と13 は同じ番号として扱う）
var rows = [["4901234567894"], ["04901234567894"], ["0306406152"], ["9780306406157"], ["96385074"], ["4901234567890"]];
var R = C.run(rows, 0, { mode: "auto" });
eq("重複 組数", R.dups.length, 2);
eq("重複1", R.dups[0].list.map(function (x) { return x.i; }), [0, 1]);
eq("重複2", R.dups[1].list.map(function (x) { return x.i; }), [2, 3]);
eq("集計", R.count, { ok: 5, check: 1 });
// 列の推定
eq("列推定", C.guessColumn(["品名", "JANコード", "価格"], [["りんご", "4901234567894", "100"]]), 1);
eq("列推定 中身", C.guessColumn(["品名", "番号", "価格"], [["a", "4901234567894", "100"], ["b", "96385074", "200"]]), 1);
eq("ISBN 列", C.guessMode(["書名", "ISBN"], 1), "isbn");
eq("JAN 列", C.guessMode(["品名", "JANコード"], 1), "jan");
eq("ITF 列", C.guessMode(["品名", "JAN/ITF"], 1), "auto");
eq("jan で12桁", C.inspect("490000000008", { mode: "jan" }).status, "len");
// CSV
eq("CSV", C.parseCSV('a,"b,c"\r\n1,2\r\n'), [["a", "b,c"], ["1", "2"]]);
eq("toCSV", C.toCSV([["a", "x,y"]]), "﻿a,\"x,y\"\r\n");
console.log(n - bad + "/" + n + " OK");
process.exit(bad ? 1 : 0);
