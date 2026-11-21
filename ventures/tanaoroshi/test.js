// Playwright の画面・印刷テスト（node test.js）
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), os = require("os");
(async () => {
  const b = await chromium.launch(); let ng = 0;
  const t = (n, c) => { if (!c) { ng++; console.log("NG:", n); } else console.log("OK:", n); };
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve("tool.html"));
  await p.click("#sampleBtn");
  t("41件読込", (await p.textContent("#loadMsg")).includes("41 件"));
  t("棚ごとに5ページ", (await p.textContent("#count")).includes("A4 5 ページ"));
  t("1ページ目の見出しに棚 A-1", (await p.textContent("#pv")).includes("棚・場所：A-1"));
  // 表が用紙からはみ出していない（全設定）
  for (const o of ["portrait", "landscape"]) for (const r of ["7", "8", "10", "12"]) {
    await p.selectOption("#orient", o); await p.selectOption("#rowMm", r);
    const ok = await p.$$eval("#pv .page", ps => ps.every(pg => { const a = pg.getBoundingClientRect(), tb = pg.querySelector("table").getBoundingClientRect(), ft = pg.querySelector(".ft").getBoundingClientRect(); return tb.bottom <= ft.top + 0.5 && tb.right <= a.right + 0.5; }));
    const over = await p.$$eval("#pv td", ts => ts.filter(td => td.scrollHeight > td.clientHeight + 2).length);
    t(o + " " + r + "mm：表が用紙に収まり、セルの文字があふれない", ok && over === 0);
  }
  await p.selectOption("#orient", "portrait"); await p.selectOption("#rowMm", "8");
  await p.uncheck("#breakOnGroup");
  t("改ページなし → 3ページ（41品目＋空欄15＋見出し5＝61行÷29）", (await p.textContent("#count")).includes("A4 3 ページ"));
  t("まとまりの見出し行", await p.locator("#pv td.gh").count() >= 2);
  await p.check("#breakOnGroup");
  await p.check("#showBook");
  t("帳簿数の列", (await p.textContent("#pv thead")).includes("帳簿数"));
  await p.locator("#step3").scrollIntoViewIfNeeded();
  await p.screenshot({ path: "screenshot-tool.png" });
  // 入力
  const ins = p.locator("#inTbl input");
  t("入力欄41件", await ins.count() === 41);
  await ins.nth(0).fill("48"); await ins.nth(0).press("Enter");
  t("Enter で次の行", await p.evaluate(() => document.activeElement.dataset.src) === "1");
  await p.keyboard.type("27"); await p.keyboard.press("Enter");
  await p.keyboard.type("あ");
  const sum = await p.textContent("#sum");
  t("集計：入力3・差1・読めない1（" + sum + "）", sum.includes("入力済み 3 / 41") && sum.includes("差がある 1 件") && sum.includes("読めない 1 件"));
  t("差異 -3 を表示", (await p.locator("#inTbl tr.df").first().textContent()).includes("-3"));
  await p.selectOption("#filter", "diff");
  t("差があるものだけ → 1件", await p.locator("#inTbl input").count() === 1);
  await p.selectOption("#filter", "all");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#saveBtn")]);
  const fx = path.join(os.tmpdir(), "tana.csv"); await dl.saveAs(fx);
  const csv = fs.readFileSync(fx, "utf8");
  t("CSV：BOM・実数と差異の列", csv.charCodeAt(0) === 0xfeff && csv.split("\r\n")[0].endsWith("在庫数,実数,差異（実数−帳簿）") && csv.split("\r\n")[2].endsWith(",30,27,-3"));
  // 保存した CSV を読み直すと続きから
  await p.setInputFiles("#file", fx); await p.waitForTimeout(300);
  t("読み直し：実数の列を認識", (await p.textContent("#loadMsg")).includes("続きから"));
  t("読み直し：入力済み3件", (await p.textContent("#sum")).includes("入力済み 3 / 41"));
  fs.unlinkSync(fx);
  // .xlsx
  const XLSX = require("./vendor/xlsx.full.min.js");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["商品コード", "品名", "数量"], ["X-1", "見本の品", 3], ["X-2", "とても長い名前の見本の品物（説明のための架空の商品名です）大容量・業務用・詰め替え", 10]]), "s");
  const fx2 = path.join(os.tmpdir(), "tana.xlsx"); fs.writeFileSync(fx2, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await p.setInputFiles("#file", fx2); await p.waitForTimeout(300); fs.unlinkSync(fx2);
  t("xlsx 2件・まとめない", (await p.textContent("#loadMsg")).includes("2 件") && await p.inputValue("#groupBy") === "none");
  t("長い品名もセルに収まる", await p.$$eval("#pv td", ts => ts.filter(td => td.scrollHeight > td.clientHeight + 2).length) === 0);
  // 印刷（PDF）
  await p.click("#sampleBtn");
  await p.evaluate(() => { window.print = () => {}; });
  await p.click("#printBtn");
  await p.emulateMedia({ media: "print" });
  let pdf = await p.pdf({ preferCSSPageSize: true, path: "out.pdf" });
  let n = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  t("PDF 5ページ（" + n + "）", n === 5);
  let mb = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
  t("A4 縦 実寸", mb && Math.abs(mb[1] / 72 * 25.4 - 210) < 0.6 && Math.abs(mb[2] / 72 * 25.4 - 297) < 0.6);
  await p.emulateMedia({ media: "screen" });
  await p.selectOption("#orient", "landscape");
  await p.click("#printBtn");
  await p.emulateMedia({ media: "print" });
  pdf = await p.pdf({ preferCSSPageSize: true });
  mb = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
  t("A4 横 実寸", mb && Math.abs(mb[1] / 72 * 25.4 - 297) < 0.6 && Math.abs(mb[2] / 72 * 25.4 - 210) < 0.6);
  await p.emulateMedia({ media: "screen" });
  await p.selectOption("#orient", "portrait");
  // お試し版
  const d = await b.newPage({ viewport: { width: 1200, height: 900 } });
  d.on("pageerror", e => errs.push(e.message));
  d.on("dialog", x => x.accept());
  await d.goto("file://" + path.resolve("demo.html"));
  await d.click("#sampleBtn"); await d.evaluate(() => { window.print = () => {}; });
  await d.click("#printBtn");
  t("お試し版は1ページだけ印刷", await d.locator("#printArea .page").count() === 1);
  // スマホ幅
  const m = await b.newPage({ viewport: { width: 390, height: 800 } });
  for (const f of ["index.html", "demo.html"]) {
    await m.goto("file://" + path.resolve(f));
    t(f + " 横スクロールなし", await m.evaluate(() => document.documentElement.scrollWidth <= 390));
  }
  await m.goto("file://" + path.resolve("index.html")); await m.screenshot({ path: "screenshot-mobile.png" });
  const pg = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await pg.goto("file://" + path.resolve("index.html")); await pg.screenshot({ path: "screenshot-page.png", fullPage: true });
  t("ページのエラーなし " + errs.join(" / "), errs.length === 0);
  await b.close();
  console.log(ng ? "NG " + ng : "ALL OK"); process.exit(ng ? 1 : 0);
})();
