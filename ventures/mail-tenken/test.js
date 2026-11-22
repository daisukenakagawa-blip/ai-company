// node test.js — 関数のテスト
var M = require("./mail.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
function st(v) { var r = M.inspect(v); return [r.status, r.fixed || null, r.guess || null]; }
eq("正しい", st("taro.yamada@example-shop.co.jp"), ["ok", "taro.yamada@example-shop.co.jp", null]);
eq("プラス記号", st("a+news@sample.jp"), ["ok", "a+news@sample.jp", null]);
eq("全角", st("ｔａｒｏ＠ｓａｍｐｌｅ．ｊｐ"), ["fixed", "taro@sample.jp", null]);
eq("前後の空白・中の空白", st("  hanako @ sample.jp "), ["fixed", "hanako@sample.jp", null]);
eq("名前<>", st("山田 太郎 <taro@sample.jp>"), ["fixed", "taro@sample.jp", null]);
eq("mailto", st("mailto:taro@sample.jp"), ["fixed", "taro@sample.jp", null]);
eq("末尾の句点", st("taro@sample.jp。"), ["fixed", "taro@sample.jp", null]);
eq("大文字ドメイン", st("Taro@Sample.JP"), ["fixed", "Taro@sample.jp", null]);
eq("gmial", st("taro@gmial.com"), ["typo", "taro@gmial.com", "taro@gmail.com"]);
eq("gmail.con", st("taro@gmail.con"), ["typo", "taro@gmail.con", "taro@gmail.com"]);
eq("yahoo.co.jo", st("taro@yahoo.co.jo"), ["typo", "taro@yahoo.co.jo", "taro@yahoo.co.jp"]);
eq("会社.co.jo", st("taro@sample.co.jo"), ["typo", "taro@sample.co.jo", "taro@sample.co.jp"]);
eq("docomo.co.jp", st("x@docomo.co.jp"), ["typo", "x@docomo.co.jp", "x@docomo.ne.jp"]);
eq("ezwebne.jp", st("x@ezwebne.jp"), ["typo", "x@ezwebne.jp", "x@ezweb.ne.jp"]);
eq("gmailcom", st("x@gmailcom"), ["typo", "x@gmailcom", "x@gmail.com"]);
eq("softbnak", st("x@softbnak.ne.jp"), ["typo", "x@softbnak.ne.jp", "x@softbank.ne.jp"]);
eq("知らない会社はそのまま", st("x@mysample.co.jp"), ["ok", "x@mysample.co.jp", null]);
eq("短いドメインは推測しない", st("x@me.co"), ["ok", "x@me.co", null]);
eq("@なし", M.inspect("taro.sample.jp").label, "@ がない");
eq("(at)", st("taro(at)sample.jp"), ["bad", null, "taro@sample.jp"]);
eq("@2つ", M.inspect("taro@@sample.jp").label, "@ が2つ以上");
eq("2件", M.inspect("a@sample.jp, b@sample.jp").status, "multi");
eq("2件 読点", M.inspect("a@sample.jp、b@sample.jp").parts, ["a@sample.jp", "b@sample.jp"]);
eq("日本語", M.inspect("山田@sample.jp").label, "使えない文字");
eq("使えない記号", M.inspect("ta(ro@sample.jp").label, "@ の前に使えない記号");
eq("ドット連続ドメイン", M.inspect("a@sample..jp").status, "bad");
eq("ハイフン始まり", M.inspect("a@-sample.jp").status, "bad");
eq("数字の TLD", M.inspect("a@sample.123").label, "末尾（.com・.jp など）の形が違う");
eq("携帯の古い形", st("taro..hana.@docomo.ne.jp"), ["warn", "taro..hana.@docomo.ne.jp", null]);
eq("example", M.inspect("a@example.com").status, "warn");
eq("空欄", M.inspect("  ").status, "blank");
eq("長すぎ", M.inspect("a".repeat(65) + "@sample.jp").label, "長すぎる");
eq("実在しうる短いドメインは推測しない", st("x@zozo.com"), ["ok", "x@zozo.com", null]);
eq("max.com", st("x@max.com"), ["ok", "x@max.com", null]);
eq("TLD 直してから近いもの", M.suggestDomain("gmial.con"), "gmail.com");
eq("hotmail.co.jp はそのまま", st("x@hotmail.co.jp")[0], "ok");
eq("前後の空白だけ", st(" saburo@sample.jp "), ["fixed", "saburo@sample.jp", null]);
eq("DL 入れ替え", M.dl("gmial.com", "gmail.com", 2), 1);
// 重複
var R = M.run([["A@Sample.jp"], ["a@sample.jp"], ["b@gmial.com"], ["b@gmail.com"], ["c@sample.jp"]], 0);
eq("重複の組", R.dups.map(function (d) { return d.list.map(function (x) { return x.i; }); }), [[0, 1], [2, 3]]);
eq("件数", R.count, { fixed: 1, ok: 3, typo: 1 });
// 列の推定
eq("列推定", M.guessColumn(["氏名", "連絡先", "備考"], [["a", "x@sample.jp", ""], ["b", "y@sample.jp", "z"]]), 1);
eq("列推定 見出し", M.guessColumn(["氏名", "メールアドレス"], [["a", ""], ["b", "y(at)sample.jp"]]), 1);
eq("CSV", M.toCSV([["a", "b,c"]]), "﻿a,\"b,c\"\r\n");
console.log(n + " 件中 " + (n - bad) + " 件 OK");
process.exit(bad ? 1 : 0);
