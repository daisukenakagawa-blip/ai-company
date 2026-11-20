const {chromium}=require('playwright');
const D='file:///home/claude/ai-company/ventures/eigyoubi/';
(async()=>{
const b=await chromium.launch();const errs=[];
const p=await b.newPage({viewport:{width:1100,height:900},acceptDownloads:true});
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(D+'tool.html');
await p.setInputFiles('#file','/tmp/claude-0/eg/orders.csv');
await p.waitForFunction(()=>!document.getElementById('go').disabled);
console.log(await p.textContent('#finfo'));console.log('COL',await p.$eval('#o_col',s=>s.selectedOptions[0].text),await p.textContent('#colEx'));
const dl=async()=>{const [d]=await Promise.all([p.waitForEvent('download'),p.click('#saveBtn')]);return require('fs').readFileSync(await d.path()).toString('utf8');};
// 1) 3営業日後 + 曜日 + 年末年始
await p.selectOption('#o_nen','12/29-1/3');await p.check('#o_wd');await p.click('#go');
console.log(await p.innerText('#sum'));console.log(await p.innerText('#warns'));
console.log(await p.innerText('#list'));console.log(await p.innerText('#iss'));
let c=await dl();console.log('BOM',c.charCodeAt(0)===0xFEFF);console.log(c.slice(1,500));
await p.screenshot({path:'/home/claude/ai-company/ventures/eigyoubi/screenshot-tool.png',fullPage:true});
// 2) 行ごとの日数
await p.selectOption('#o_dcol','2');await p.click('#go');console.log('DCOL',(await p.innerText('#list')).split('\n').slice(0,6).join(' | '),await p.innerText('#iss'));
// 3) 支払期日を前営業日に
await p.selectOption('#o_mode','shift');await p.selectOption('#o_col','3');await p.click('#go');
console.log('SHIFT',await p.innerText('#sum'));console.log((await p.innerText('#list')).split('\n').slice(0,9).join(' | '));
// 4) 営業日数 受注日→完了日
await p.selectOption('#o_mode','count');await p.selectOption('#o_col','1');await p.selectOption('#o_col2','4');await p.click('#go');
console.log('COUNT',(await p.innerText('#list')).split('\n').slice(0,5).join(' | '));
c=await dl();console.log(c.split('\r\n').slice(0,3));
// 5) 独自休業日 + 営業日
await p.selectOption('#o_mode','add');await p.selectOption('#o_dcol','-1');await p.fill('#o_days','1');
await p.fill('#o_off','2026/11/24〜2026/11/25');await p.fill('#o_on','2026/11/23');await p.click('#go');
console.log('CUSTOM',(await p.innerText('#list')).split('\n').slice(0,3).join(' | '));
// paste
await p.click('summary >> nth=0');await p.fill('#paste','2026/9/18\n2026/12/25');await p.fill('#o_off','');await p.fill('#o_on','');await p.click('#pasteBtn');await p.click('#go');
console.log('PASTE',await p.innerText('#list'));
// 祝日一覧
await p.click('text=祝日の一覧を見る');await p.fill('#o_hy','2027');console.log('HOL2027',(await p.innerText('#hlist')).split('\n').length-1);
// product page free trial
const q=await b.newPage({viewport:{width:1000,height:900}});q.on('pageerror',e=>errs.push(e.message));
await q.goto(D+'index.html');await q.fill('#t_date','2026-09-18');await q.fill('#t_days','1');await q.dispatchEvent('#t_days','input');
console.log('TRY',await q.textContent('#t_ans'),await q.textContent('#t_note'));
await q.fill('#t_date','2026-12-28');await q.check('#t_nen');console.log('TRY2',await q.textContent('#t_ans'));
for(const u of ['tool.html','index.html']){
 const m=await b.newPage({viewport:{width:390,height:800}});m.on('pageerror',e=>errs.push(e.message));
 await m.goto(D+u);console.log(u,'scrollW',await m.evaluate(()=>document.documentElement.scrollWidth));
 if(u==='index.html') await m.screenshot({path:'/home/claude/ai-company/ventures/eigyoubi/screenshot-page.png',fullPage:true});
}
console.log('ERRORS',errs);await b.close();})();
