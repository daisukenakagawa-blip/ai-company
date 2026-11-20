const E=require('./eigyo.js');const assert=require('assert');
const exp={
2019:"1/1,1/14,2/11,3/21,4/29,4/30,5/1,5/2,5/3,5/4,5/5,5/6,7/15,8/11,8/12,9/16,9/23,10/14,10/22,11/3,11/4,11/23",
2020:"1/1,1/13,2/11,2/23,2/24,3/20,4/29,5/3,5/4,5/5,5/6,7/23,7/24,8/10,9/21,9/22,11/3,11/23",
2021:"1/1,1/11,2/11,2/23,3/20,4/29,5/3,5/4,5/5,7/22,7/23,8/8,8/9,9/20,9/23,11/3,11/23",
2024:"1/1,1/8,2/11,2/12,2/23,3/20,4/29,5/3,5/4,5/5,5/6,7/15,8/11,8/12,9/16,9/22,9/23,10/14,11/3,11/4,11/23",
2025:"1/1,1/13,2/11,2/23,2/24,3/20,4/29,5/3,5/4,5/5,5/6,7/21,8/11,9/15,9/23,10/13,11/3,11/23,11/24",
2026:"1/1,1/12,2/11,2/23,3/20,4/29,5/3,5/4,5/5,5/6,7/20,8/11,9/21,9/22,9/23,10/12,11/3,11/23",
2027:"1/1,1/11,2/11,2/23,3/21,3/22,4/29,5/3,5/4,5/5,7/19,8/11,9/20,9/23,10/11,11/3,11/23"};
for(const y in exp){const got=E.holidayList(+y).map(h=>{const t=E.ymd(h.n);return t.m+"/"+t.d}).join(",");assert.strictEqual(got,exp[y],y+"\n"+got);}
console.log("holidays OK");
console.log(E.holidayList(2026).map(h=>h.date+h.w+h.name).join(" "));
const P=s=>{const r=E.parseDate(s);return r.n!=null?E.fmt(r.n):JSON.stringify(r)};
["2026/11/20","2026-1-5","20261120","2026年11月20日","令和8年11月20日","R8.11.20","令和元年5月1日","平成31年5月1日","26/11/20","2026/2/30","46346","2026/11/20 10:30","2026-11-20T10:30:00+09:00","2026/11/20(金)","abc",""].forEach(s=>console.log(s,"→",P(s)));
const cal=E.makeCal({weekly:[0,6],holidays:true});
const d=s=>E.parseDate(s).n;
assert.strictEqual(E.fmt(E.addBiz(d("2026/11/20"),5,cal)),"2026/11/30"); // 11/23 休
assert.strictEqual(E.fmt(E.addBiz(d("2026/11/20"),1,cal)),"2026/11/24");
assert.strictEqual(E.fmt(E.addBiz(d("2026/11/24"),-1,cal)),"2026/11/20");
assert.strictEqual(E.fmt(E.addBiz(d("2026/9/18"),1,cal)),"2026/09/24"); // シルバーウィーク
assert.strictEqual(E.fmt(E.shift(d("2026/5/3"),1,cal)),"2026/05/07");
assert.strictEqual(E.fmt(E.shift(d("2026/5/3"),-1,cal)),"2026/05/01");
assert.strictEqual(E.fmt(E.shift(d("2026/5/1"),-1,cal)),"2026/05/01");
assert.strictEqual(E.countBiz(d("2026/11/1"),d("2026/11/30"),cal,false),19); // 11月 平日20 - 11/3,11/23(月) ... 
assert.strictEqual(E.countBiz(d("2026/11/2"),d("2026/11/30"),cal,true),19);
assert.strictEqual(E.countBiz(d("2026/11/30"),d("2026/11/1"),cal,false),-19);
const nen=E.makeCal({weekly:[0,6],holidays:true,nenmatsu:"12/29-1/3"});
assert.strictEqual(E.fmt(E.addBiz(d("2026/12/28"),1,nen)),"2027/01/04");
const l=E.parseDayList("2026/12/25\n2026/8/12〜2026/8/14\nあいう");
assert.strictEqual(l.set.size,4);assert.deepStrictEqual(l.bad,["あいう"]);
const on=E.makeCal({weekly:[0,6],holidays:true,extraOn:E.parseDayList("2026/11/23").set});
assert.strictEqual(E.fmt(E.addBiz(d("2026/11/20"),1,on)),"2026/11/23");
assert.ok(E.makeCal({weekly:[0,1,2,3,4,5,6]}).none);
console.log("calc OK");
