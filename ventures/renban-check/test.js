const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch();const errs=[];
const p=await b.newPage({viewport:{width:1100,height:900},acceptDownloads:true});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/claude/ai-company/ventures/renban-check/tool.html');
await p.setInputFiles('#file','/tmp/claude-0/rt/inv.csv');
await p.waitForFunction(()=>!document.getElementById('go').disabled);
console.log(await p.textContent('#finfo'));console.log(await p.textContent('#colEx'));
await p.fill('#o_start','1');await p.fill('#o_end','125');
await p.click('#go');
console.log(await p.innerText('#sum'));console.log(await p.innerText('#warns'));
console.log(await p.innerText('#groups'));console.log(await p.innerText('#miss'));
console.log((await p.innerText('#list')).slice(0,900));
const dl=async(sel)=>{const [d]=await Promise.all([p.waitForEvent('download'),p.click(sel)]);const path=await d.path();return require('fs').readFileSync(path);};
const a=await dl('#listBtn');console.log('LIST',a.slice(0,3),a.toString('utf8').slice(3,400));
const m=await dl('#missBtn');console.log('MISS',m.toString('utf8').split('\r\n').length);
const n=await dl('#annBtn');console.log('ANN',n.toString('utf8').split('\r\n').slice(28,33));
await p.screenshot({path:'/home/claude/ai-company/ventures/renban-check/screenshot-tool.png',fullPage:true});
// paste mode
await p.click('summary');await p.fill('#paste','5\n6\n8\n8\n10');await p.click('#pasteBtn');
await p.fill('#o_start','');await p.fill('#o_end','');await p.check('#o_order');await p.click('#go');
console.log('PASTE',await p.innerText('#miss'),await p.innerText('#list'));
for(const u of ['tool.html','index.html']){
 const q=await b.newPage({viewport:{width:390,height:800}});q.on('pageerror',e=>errs.push(e.message));
 await q.goto('file:///home/claude/ai-company/ventures/renban-check/'+u);
 console.log(u,'scrollW',await q.evaluate(()=>document.documentElement.scrollWidth));
 if(u==='index.html') await q.screenshot({path:'/home/claude/ai-company/ventures/renban-check/screenshot-page.png',fullPage:true});
}
console.log('ERRORS',errs);await b.close();})();
