// node test.js — 関数のテスト
var K = require("./kigen.js");
var n = 0, bad = 0;
function eq(name, got, want) { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("NG", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); } }
function D(s) { var p = K.parseDate(s); return p && p.n != null ? K.iso(p.n) : (p ? p.err : null); }
eq("スラッシュ", D("2026/12/1"), "2026-12-01");
eq("ハイフン", D("2026-12-01"), "2026-12-01");
eq("年月日", D("2026年12月1日"), "2026-12-01");
eq("全角", D("２０２６／１２／０１"), "2026-12-01");
eq("曜日つき", D("2026/12/1(火)"), "2026-12-01");
eq("時刻つき", D("2026/12/01 0:00:00"), "2026-12-01");
eq("8桁", D("20261201"), "2026-12-01");
eq("令和", D("令和8年12月1日"), "2026-12-01");
eq("R", D("R8.12.1"), "2026-12-01");
eq("令和元年", D("令和元年5月1日"), "2019-05-01");
eq("平成", D("H31.4.30"), "2019-04-30");
eq("昭和", D("昭和64年1月7日"), "1989-01-07");
eq("月だけ", D("2027年2月"), "2027-02-28");
eq("月だけ12月", D("2026/12"), "2026-12-31");
eq("閏年の月末", D("2028-02"), "2028-02-29");
eq("Excel番号", D("46357"), "2026-12-01");
eq("ない日付", D("2026/2/30"), "ない日付（2026/2/30）");
eq("読めない", D("来月"), "日付として読めない（来月）");
eq("空欄", D(""), null);
eq("まで", D("2026/12/1まで"), "2026-12-01");
eq("2桁年は読まない", D("26/12/1"), "日付として読めない（26/12/1）");
eq("曜日", K.jp(K.dayNum(2026, 11, 22)), "2026/11/22（日）");
eq("日数", [K.parseDays("30"), K.parseDays("60日前"), K.parseDays("2か月"), K.parseDays("1週間"), K.parseDays(""), isNaN(K.parseDays("早め"))], [30, 60, 60, 7, null, true]);
eq("済み", ["済", "完了", "2026/11/1", "", "未", "×", "いいえ"].map(K.isDone), [true, true, true, false, false, false, false]);
// 列の推定
var hd = ["項目", "区分", "担当", "有効期限", "何日前から", "更新済み", "備考"];
eq("列", K.guessColumns(hd, []), { dates: [3], done: 5, lead: 4, who: 2, cat: 1, memo: 6, name: 0 });
eq("列・複数の期限", K.guessColumns(["車両", "車検満了日", "自賠責の期限", "任意保険の満了日"], []).dates, [1, 2, 3]);
eq("列・中身から", K.guessColumns(["名前", "日"], [["A", "2026/12/1"], ["B", "2027/1/5"]]), { dates: [1], name: 0 });
// 一覧
var base = K.dayNum(2026, 11, 22);
var rows = [
  ["防火管理者講習", "資格", "佐藤", "2026/11/20", "", "", ""],
  ["事務所の賃貸契約", "契約", "", "2026/12/22", "", "", "更新は2か月前に連絡"],
  ["社用車 車検", "車", "鈴木", "2027/1/31", "60", "", ""],
  ["複合機リース", "契約", "", "2027/2/15", "", "", ""],
  ["ドメイン", "契約", "", "2028/1/1", "", "", ""],
  ["損害保険", "保険", "", "2026/12/1", "", "済", ""],
  ["消火器", "設備", "", "そのうち", "", "", ""],
  ["名刺", "", "", "", "", "", ""],
  ["今日", "", "", "2026-11-22", "", "", ""]
];
var C = K.guessColumns(hd, rows);
var R = K.build(rows, hd, C, { base: base, soon: 30, next: 90 });
eq("区分", R.items.map(function (x) { return [x.name, x.b, x.days]; }), [["防火管理者講習", "over", -2], ["今日", "soon", 0], ["損害保険", "done", 9], ["事務所の賃貸契約", "soon", 30], ["社用車 車検", "next", 70], ["複合機リース", "next", 85], ["ドメイン", "later", 405]]);
eq("数", R.count, { over: 1, soon: 2, next: 2, later: 1, done: 1, err: 1, blank: 1, total: 7 });
eq("読めない行", R.errs.map(function (x) { return [x.i, x.err]; }), [[6, "日付として読めない（そのうち）"]]);
eq("期限のない行", R.blank.map(function (x) { return x.i; }), [7]);
eq("残り", R.items.map(K.daysText).slice(0, 2), ["2 日過ぎ", "今日"]);
eq("知らせ始める日", K.iso(R.items[4].notice), "2026-12-02");
// 複数の期限の列
var h2 = ["車両", "車検満了日", "自賠責の期限"];
var R2 = K.build([["品川 1", "2027/3/1", "2027/3/1"], ["品川 2", "", "2026/12/10"]], h2, K.guessColumns(h2, []), { base: base, soon: 30, next: 90 });
eq("複数", R2.items.map(function (x) { return x.name + "/" + x.kind; }), ["品川 2/自賠責の期限", "品川 1/車検満了日", "品川 1/自賠責の期限"]);
eq("複数・空欄は飛ばす", R2.blank.length, 0);
// ics
var ics = K.toICS(R.items.filter(function (x) { return x.b !== "done" && x.days >= 0; }), { alarm: 7, notice: true, base: base, stamp: "20261122T000000Z" });
eq("ics 改行", /\r\n/.test(ics) && !/[^\r]\n/.test(ics), true);
eq("ics 予定の数", (ics.match(/BEGIN:VEVENT/g) || []).length, 5 + 4);
eq("ics 終日", /DTSTART;VALUE=DATE:20261222\r\nDTEND;VALUE=DATE:20261223/.test(ics), true);
eq("ics 行の長さ", ics.split("\r\n").every(function (l) { return Buffer.byteLength(l, "utf8") <= 75; }), true);
eq("ics エスケープ", /更新は2か月前に連絡/.test(ics.replace(/\r\n /g, "")), true);
var f = K.fold("SUMMARY:" + "あ".repeat(40));
eq("折り返して戻る", f.replace(/\r\n /g, ""), "SUMMARY:" + "あ".repeat(40));
// 速さ
var big = []; for (var i = 0; i < 20000; i++) big.push(["項目" + i, "", "", "2027/" + (i % 12 + 1) + "/" + (i % 28 + 1), "", "", ""]);
var t = Date.now(); K.build(big, hd, C, { base: base, soon: 30, next: 90 }); var ms = Date.now() - t;
eq("2万行 1秒未満", ms < 1000, true); console.log("2万行", ms, "ms");
console.log(n - bad + "/" + n + " OK");
