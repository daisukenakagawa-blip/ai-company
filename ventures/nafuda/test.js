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
  t("11人読込", (await p.textContent("#loadMsg")).includes("11 人分"));
  t("名刺サイズ：11枚 → 2ページ", (await p.textContent("#count")).includes("11 枚 → A4 2 ページ"));
  t("区分の列があるので帯は区分", await p.inputValue("#band") === "cat");
  // 文字が札の外にはみ出さない（見た目の幅で確かめる）
  const check = async () => p.$$eval("#pv .face, #pv .slot", els => {
    let bad = 0;
    document.querySelectorAll("#pv .face").forEach(f => {
      const fr = f.getBoundingClientRect();
      f.querySelectorAll(".it .tx").forEach(tx => { const r = tx.getBoundingClientRect(); if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < fr.top - 0.5 || r.bottom > fr.bottom + 0.5) bad++; });
    });
    return bad;
  });
  for (const pre of ["meishi10", "card8", "tent91", "tent100", "tentA4"]) for (const fit of ["condense", "shrink"]) for (const font of ["gothic", "mincho"]) {
    await p.selectOption("#preset", pre); await p.selectOption("#fit", fit); await p.selectOption("#font", font);
    let bad = 0; const pages = +(await p.textContent("#pvNo")).split("/")[1];
    for (let i = 0; i < pages; i++) { bad += await check(); if (i < pages - 1) await p.click("#nextBtn"); }
    while ((await p.textContent("#pvNo")).trim().split(" /")[0] !== "1") await p.click("#prevBtn");
    t(pre + " " + fit + " " + font + "：全ページで文字が札の中に収まる", bad === 0);
  }
  await p.selectOption("#font", "gothic"); await p.selectOption("#fit", "condense");
  await p.selectOption("#preset", "tent91");
  t("席札：敬称は様", await p.inputValue("#keisho") === "様");
  t("席札：11枚 → 3ページ", (await p.textContent("#count")).includes("11 枚 → A4 3 ページ"));
  t("席札：裏面（180度回転）あり", await p.locator("#pv .face.back").count() === 4);
  await p.check("#showTable");
  t("卓の名前", (await p.textContent("#pv")).includes("1 卓"));
  t("様が付く", (await p.locator("#pv .k-name .ks").first().textContent()).includes("様"));
  await p.locator("#step4").scrollIntoViewIfNeeded();
  await p.screenshot({ path: "screenshot-tool.png" });
  await p.selectOption("#preset", "meishi10");
  t("名札に戻すと敬称なし", await p.inputValue("#keisho") === "");
  // 並べ順・空欄・途中から
  await p.selectOption("#sort", "kana");
  t("ふりがな順の先頭は伊藤", (await p.locator("#pv .k-name").first().textContent()).includes("伊藤"));
  await p.selectOption("#blank", "4");
  t("空欄の札 4 枚 → 15 枚", (await p.textContent("#count")).includes("15 枚"));
  await p.click("#startGrid button[data-k='6']");
  t("7面目から → 15枚で 3 ページ", (await p.textContent("#count")).includes("A4 3 ページ"));
  t("1ページ目は 4 面だけ", await p.locator("#pv .slot").count() === 4);
  await p.click("#startGrid button[data-k='0']");
  await p.selectOption("#blank", "0"); await p.selectOption("#sort", "src");
  // 区分ごとの色
  await p.check("#catColors");
  const cols = await p.$$eval("#pv .k-band", e => [...new Set(e.map(x => x.style.background))]);
  t("区分ごとに帯の色が違う（" + cols.length + "色）", cols.length >= 2);
  await p.uncheck("#catColors");
  // 寸法のエラー
  await p.selectOption("#preset", "custom");
  await p.fill("#h", "80"); await p.fill("#rows", "4");
  t("はみ出す寸法でエラー表示", (await p.textContent("#warn")).includes("297mm"));
  await p.selectOption("#preset", "meishi10");
  t("戻すとエラーが消える", (await p.textContent("#warn")) === "");
  // 印刷（PDF）
  await p.evaluate(() => { window.print = () => {}; });
  await p.click("#printBtn");
  await p.emulateMedia({ media: "print" });
  const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync("print-test.pdf", pdf);
  const n = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  t("PDF：2ページ（" + n + "）", n === 2);
  const mb = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
  t("PDF：A4 の実寸", mb && Math.abs(+mb[1] - 595.3) < 2 && Math.abs(+mb[2] - 841.9) < 2);
  await p.emulateMedia({ media: "screen" });
  // 試し刷り
  await p.click("#frameBtn");
  t("枠だけ：10面", await p.locator("#printArea .slot").count() === 10 && await p.locator("#printArea .face").count() === 0);
  // .xlsx 読み込み（姓・名の2列）
  const xbuf = await p.evaluate(() => { const ws = XLSX.utils.aoa_to_sheet([["姓", "名", "セイ", "メイ", "所属"], ["青木", "誠", "アオキ", "マコト", "見本の会"]]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S"); return Array.from(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }))); });
  fs.writeFileSync("/tmp/nafuda-test.xlsx", Buffer.from(xbuf));
  await p.setInputFiles("#file", "/tmp/nafuda-test.xlsx");
  await p.waitForFunction(() => document.getElementById("loadMsg").textContent.includes("1 人分"));
  t(".xlsx：姓＋名をつないで表示", (await p.textContent("#pv .k-name")).includes("青木誠") && (await p.textContent("#pv .k-kana")).includes("アオキマコト"));
  t("エラーなし（" + errs.join(" / ") + "）", errs.length === 0);
  // お試し版
  const d = await b.newPage({ viewport: { width: 1200, height: 900 } });
  await d.goto("file://" + path.resolve("demo.html"));
  await d.click("#sampleBtn");
  await d.evaluate(() => { window.print = () => {}; });
  await d.click("#printBtn");
  t("お試し版：印刷は1ページ（10面）だけ", await d.locator("#printArea .page").count() === 1 && await d.locator("#printArea .slot").count() === 10);
  t("お試し版：その旨を表示", (await d.textContent("#printMsg")).includes("先頭 1 ページ"));
  // 商品ページ・スマホ幅
  for (const f of ["index.html", "demo.html"]) {
    const m = await b.newPage({ viewport: { width: 375, height: 800 } });
    await m.goto("file://" + path.resolve(f));
    if (f === "demo.html") await m.click("#sampleBtn");
    const sw = await m.evaluate(() => document.documentElement.scrollWidth);
    t(f + "：スマホ幅で横スクロールなし（" + sw + "）", sw <= 375);
    if (f === "index.html") { await m.screenshot({ path: "screenshot-mobile.png" }); const pg = await b.newPage({ viewport: { width: 1000, height: 900 } }); await pg.goto("file://" + path.resolve(f)); await pg.screenshot({ path: "screenshot-page.png", fullPage: true }); }
  }
  await b.close();
  console.log(ng ? ng + " 件 NG" : "すべて OK"); process.exit(ng ? 1 : 0);
})();
