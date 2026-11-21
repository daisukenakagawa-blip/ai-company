// 関数テスト（node test-node.js）
require("./sheet.js"); const T = globalThis.Tana; let ng = 0;
const t = (n, c) => { if (!c) { ng++; console.log("NG:", n); } else console.log("OK:", n); };
const m = T.guessColumns(["棚番", "分類", "商品コード", "商品名", "規格", "単位", "在庫数", "実数"]);
t("列の推定", m.loc === 0 && m.cat === 1 && m.code === 2 && m.name === 3 && m.spec === 4 && m.unit === 5 && m.book === 6 && m.count === 7);
t("「実在庫」は実数、「在庫」は帳簿", (x => x.count === 0 && x.book === 1)(T.guessColumns(["実在庫", "在庫"])));
t("数の読み取り", T.num("1,200") === 1200 && T.num("１２") === 12 && T.num("-3") === -3 && T.num("12個") === 12 && T.num("あ") === null && T.num("") === null);
t("自然順 A-2 < A-10", ["A-10", "A-2", "B-1"].sort(T.natCmp).join() === "A-2,A-10,B-1");
for (const o of ["portrait", "landscape"]) for (const r of [7, 8, 10, 12]) {
  const per = T.rowsPerPage(o, r), P = T.PAPER[o];
  t(o + " " + r + "mm：" + per + "行が用紙に収まる", T.MARGIN + T.HEAD_MM + T.THEAD_MM + per * r <= P.h - T.MARGIN - T.FOOT_MM + 1e-9);
  const cols = T.columns({ loc: 0, cat: 1, code: 2, name: 3, unit: 5, book: 6 }, { groupBy: "none", showBook: true, showDiff: true, showCat: true }, o);
  t(o + "：列の幅の合計 = 用紙の幅−余白", Math.abs(cols.reduce((a, c) => a + c.w, 0) - (P.w - 20)) < 1e-9 && cols.find(c => c.k === "name").w >= 40);
}
const rows = []; for (let i = 0; i < 70; i++) rows.push([i < 40 ? "A" : "B", "", "C" + i, "品" + i, "", "", "5"]);
const items = T.buildItems(rows, m);
let pages = T.paginate(items, { orient: "portrait", rowMm: 8, groupBy: "loc", breakOnGroup: true, blank: 3 });
t("棚A 40+3行 → 2ページ、棚B 30+3 → 2ページ", pages.length === 4 && pages[0].group === "A" && pages[1].gNo === 2 && pages[1].gTotal === 2 && pages[2].group === "B");
t("通し番号は続く", pages[2].rows[0].no === 41 && pages.every(p => p.rows.length <= 29));
pages = T.paginate(items, { orient: "portrait", rowMm: 8, groupBy: "loc", breakOnGroup: false, blank: 0 });
t("改ページなし：見出し行つきで 72行 → 3ページ", pages.length === 3 && pages[0].rows[0].head === "A" && pages.some(p => p.rows.some(r => r.head === "B")));
pages = T.paginate(T.buildItems([["Z", "", "B-10", "x"], ["Z", "", "B-2", "y"]], m), { orient: "portrait", rowMm: 8, groupBy: "none", sort: "code" });
t("品番の順", pages[0].rows[0].item.code === "B-2");
const csv = T.resultCSV(["棚番", "分類", "商品コード", "商品名", "規格", "単位", "在庫数"], [["A", "", "C1", "品,1", "", "", "10"], ["A", "", "C2", "品2", "", "", "4"]], T.guessColumns(["棚番", "分類", "商品コード", "商品名", "規格", "単位", "在庫数"]), { 0: "8", 1: "4.5" });
t("結果 CSV（引用符・差異・小数）", csv.includes('"品,1"') && csv.split("\r\n")[1].endsWith(",10,8,-2") && csv.split("\r\n")[2].endsWith(",4,4.5,0.5"));
t("お試しの行数制限", T.resultCSV(["a"], [["1"], ["2"], ["3"]], { name: 0 }, {}, 2).trim().split("\r\n").length === 3);
const f = T.fitText("あ".repeat(60), 80, 8, 9.5, 5.5);
t("長い品名は2行・小さく", f.lines === 2 && f.pt < 9.5 && f.pt >= 5.5);
console.log(ng ? "NG " + ng : "ALL OK"); process.exit(ng ? 1 : 0);
