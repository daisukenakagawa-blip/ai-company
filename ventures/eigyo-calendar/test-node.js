const C=require("./calendar.js");const E=require("./eigyo.js");
let ok=0,ng=0;const eq=(a,b,m)=>{if(JSON.stringify(a)===JSON.stringify(b))ok++;else{ng++;console.log("NG",m,a,b);}};
const f=n=>E.fmt(n);
let r=C.expandDays("8/13〜8/16\n12月30日\n2027/5/6\n9/21-9/22\nあいうえ\n8/20〜23",2027,1);
eq([...r.set].map(f),["2027/08/13","2027/08/14","2027/08/15","2027/08/16","2027/12/30","2027/05/06","2027/09/21","2027/09/22","2027/08/20","2027/08/21","2027/08/22","2027/08/23"],"expand");
eq(r.bad,["あいうえ"],"bad");
// 年度（4月始まり）：1〜3月は翌年
r=C.expandDays("2/10\n12/29〜1/3",2027,4);
eq([...r.set].map(f),["2028/02/10","2027/12/29","2027/12/30","2027/12/31","2028/01/01","2028/01/02","2028/01/03"],"fiscal");
r=C.expandDays("2026/5/1",2027,1);eq(r.bad.length,1,"outside");
const m=C.build({year:2027,start:1,weekly:[0],holidays:true,nenmatsu:"12/30-1/3",off:"8/13-8/16",on:"2027/11/23",half:"12/28"});
const cell=(mo,d)=>m.months[mo-1].weeks.flat().find(c=>c&&c.d===d);
eq(cell(1,11).hol,"成人の日","seijin");eq(cell(1,11).closed,true,"seijin off");
eq(cell(11,23).closed,false,"on overrides");
eq(cell(12,28).half,true,"half");eq(cell(12,30).why,"年末年始","nenmatsu");
eq(cell(8,14).why,"休業日（指定）","off");
eq(cell(3,21).hol,"春分の日","shunbun 2027");eq(cell(3,22).hol,"振替休日","furikae 2027");
eq(cell(9,23).hol,"秋分の日","shubun 2027");
eq(m.cnt.open+m.cnt.closed,365,"365");
eq(m.months.every(x=>x.weeks.every(w=>w.length===7)),true,"7cols");
// 月曜始まり：2027/2/1 は月曜 → 先頭の空白0
const m2=C.build({year:2027,start:1,weekly:[],holidays:false,weekStart:1});
eq(m2.months[1].weeks[0][0].d,1,"monday start");eq(m2.heads,[1,2,3,4,5,6,0],"heads");
const html=C.render(m,{title:"<x>",shop:"店",showHol:true});
eq(html.includes("&lt;x&gt;"),true,"escape");
eq(C.toRows(m).length,366,"rows");
const m3=C.build({year:2027,start:4,weekly:[0,6],holidays:true});
eq([m3.months[0].y,m3.months[0].m,m3.months[11].y,m3.months[11].m],[2027,4,2028,3],"fiscal months");
console.log(ng?"FAIL":"ALL OK",ok,ng);
