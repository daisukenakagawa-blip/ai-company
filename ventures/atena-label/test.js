// Playwright の画面・印刷テスト（node test.js）
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
(async () => {
  const b = await chromium.launch(); let ng = 0;
  const t = (n, c) => { if (!c) { ng++; console.log("NG:", n); } else console.log("OK:", n); };
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.resolve("tool.html"));
  await p.click("#sampleBtn");
  t("6件読込", (await p.textContent("#loadMsg")).includes("6 件"));
  t("A4 1枚", (await p.textContent("#count")).includes("A4 1 枚"));
  t("プレビューに6件", await p.locator("#pv .lbl:not(.fr)").count() === 6);
  // 文字がはみ出していない（全用紙）
  for (const k of ["10", "12", "18", "21", "24", "44"]) {
    await p.selectOption("#preset", k);
    const over = await p.$$eval("#pv .lbl:not(.fr)", ls => ls.filter(l => { const i = l.querySelector(".in"); return i.scrollHeight > i.clientHeight + 1 || [...l.querySelectorAll(".ln")].some(x => x.scrollWidth > x.clientWidth + 1); }).length);
    t(k + "面：はみ出しなし", over === 0);
  }
  await p.selectOption("#preset", "12");
  // 使いかけ：11面目から → 2枚
  await p.click('#startGrid button[data-k="10"]');
  t("11面目から始めると A4 2枚", (await p.textContent("#count")).includes("A4 2 枚"));
  await p.locator("#step4").scrollIntoViewIfNeeded();
  await p.screenshot({ path: "screenshot-tool.png", fullPage: false });
  await p.click('#startGrid button[data-k="0"]');
  // .xlsx の読込
  const XLSX = require("./vendor/xlsx.full.min.js");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["姓", "名", "郵便番号", "住所", "敬称"], ["見本", "一郎", "1500001", "東京都渋谷区神宮前1-2-3", "先生"], ["例田", "二郎", "8100001", "福岡県福岡市中央区天神1-1-1", ""]]), "住所録");
  const fx = path.join(require("os").tmpdir(), "label-test.xlsx"); fs.writeFileSync(fx, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await p.setInputFiles("#file", fx); await p.waitForTimeout(300); fs.unlinkSync(fx);
  t("xlsx 2件", (await p.textContent("#loadMsg")).includes("2 件"));
  t("敬称の列を使う", (await p.textContent("#pv")).includes("一郎　先生"));
  // 印刷（PDF）
  await p.click("#sampleBtn");
  await p.evaluate(() => { window.print = () => {}; });
  await p.click("#printBtn");
  await p.emulateMedia({ media: "print" });
  const pdf = await p.pdf({ preferCSSPageSize: true, path: "out.pdf" });
  const n = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  t("PDF 1ページ", n === 1);
  const mb = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
  t("A4 実寸（" + (mb && (mb[1] / 72 * 25.4).toFixed(1) + "×" + (mb[2] / 72 * 25.4).toFixed(1)) + "mm）", mb && Math.abs(mb[1] / 72 * 25.4 - 210) < 0.6 && Math.abs(mb[2] / 72 * 25.4 - 297) < 0.6);
  await p.emulateMedia({ media: "screen" });
  // お試し版：3件まで
  const d = await b.newPage({ viewport: { width: 1200, height: 900 } });
  d.on("pageerror", e => errs.push(e.message));
  await d.goto("file://" + path.resolve("demo.html"));
  await d.click("#sampleBtn"); await d.evaluate(() => { window.print = () => {}; });
  await d.click("#printBtn");
  t("お試し版は3件だけ印刷", await d.locator("#printArea .lbl").count() === 3);
  await d.click("#testBtn");
  t("お試し版の試し刷りは枠12面＋3件", await d.locator("#printArea .lbl.fr").count() === 12);
  // 商品ページ・スマホ幅
  const m = await b.newPage({ viewport: { width: 390, height: 800 } });
  for (const f of ["index.html", "demo.html"]) {
    await m.goto("file://" + path.resolve(f));
    t(f + " 横スクロールなし", await m.evaluate(() => document.documentElement.scrollWidth <= 390));
  }
  await m.goto("file://" + path.resolve("index.html"));
  await m.screenshot({ path: "screenshot-mobile.png" });
  const pg = await b.newPage({ viewport: { width: 1000, height: 900 } });
  await pg.goto("file://" + path.resolve("index.html"));
  await pg.screenshot({ path: "screenshot-page.png", fullPage: true });
  t("ページのエラーなし " + errs.join(","), errs.length === 0);
  await b.close(); console.log(ng ? "NG " + ng : "ALL OK"); process.exit(ng ? 1 : 0);
})();
