const {chromium}=require("playwright");const path=require("path");
(async()=>{
  const b=await chromium.launch();const errs=[];
  const p=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});
  p.on("pageerror",e=>errs.push(e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
  const base="file://"+path.resolve(__dirname);
  await p.goto(base+"/tool.html");
  await p.selectOption("#year","2027");
  await p.check('#weekly input[value="3"]');
  await p.fill("#off","8/13〜8/16\n2/30\n10/1");
  await p.fill("#on","11/23");
  await p.fill("#half","12/28");
  await p.fill("#shop","サンプル商店");
  await p.fill("#note","営業時間 10:00〜18:00\n▲の日は 15:00 まで");
  await p.check("#showCount");
  await p.waitForTimeout(200);
  const st=await p.textContent("#stat"),bad=await p.textContent("#bad");
  console.log("stat:",st);console.log("bad:",bad);
  const offs=await p.$$eval("#sheet td.off",t=>t.length),half=await p.$$eval("#sheet td.half",t=>t.length);
  const nov23=await p.$$eval("#sheet .cal-month",ms=>{const td=[...ms[10].querySelectorAll("td")].find(t=>t.querySelector(".dn")&&t.querySelector(".dn").textContent==="23");return td.className;});
  console.log("off cells",offs,"half",half,"nov23",nov23);
  await p.screenshot({path:"screenshot-tool.png",fullPage:false});
  // 印刷：1ページに収まるか
  await p.emulateMedia({media:"print"});
  const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});
  const pages=(pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)||[]).length;
  console.log("pdf pages portrait",pages);
  
  await p.emulateMedia({media:"screen"});
  await p.selectOption("#orient","land");await p.selectOption("#theme","t-mono");
  await p.emulateMedia({media:"print"});
  const pdf2=await p.pdf({preferCSSPageSize:true,printBackground:true});
  console.log("pdf pages landscape",(pdf2.toString("latin1").match(/\/Type\s*\/Page[^s]/g)||[]).length);
  await p.emulateMedia({media:"screen"});
  // CSV
  const [dl]=await Promise.all([p.waitForEvent("download"),p.click("#csv")]);
  const csv=require("fs").readFileSync(await dl.path(),"utf8");console.log("csv",dl.suggestedFilename(),csv.split("\r\n").length-2,"rows;",csv.split("\r\n")[1]);
  // 設定の保存→再読込（localStorage）
  await p.reload();console.log("after reload shop:",await p.inputValue("#shop"),"orient:",await p.inputValue("#orient"));
  // 商品ページ
  const q=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
  q.on("pageerror",e=>errs.push(e.message));
  await q.goto(base+"/index.html");await q.waitForTimeout(200);
  console.log("trial:",await q.textContent("#t_stat"));
  await q.selectOption("#t_start","4");console.log("trial fiscal title:",await q.textContent("#t_sheet .cal-title"));
  await q.selectOption("#t_start","1");
  await q.screenshot({path:"screenshot-page.png",fullPage:true});
  // スマホ幅
  for(const u of ["/index.html","/tool.html"]){
    const m=await b.newPage({viewport:{width:390,height:844}});m.on("pageerror",e=>errs.push(e.message));
    await m.goto(base+u);await m.waitForTimeout(200);
    console.log("mobile",u,"scrollW",await m.evaluate(()=>document.documentElement.scrollWidth));
    if(u==="/tool.html") await m.screenshot({path:"screenshot-mobile.png",fullPage:false});
  }
  console.log("errors:",errs);
  await b.close();
})();
