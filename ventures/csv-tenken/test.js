const T=require("./tenken.js");const assert=require("assert");
const s=`id,name,addr,memo\n1,田中,"東京都新宿区1-2",ok\n2,"佐藤,花子",大阪,\n3,鈴木,"名古屋\n中区",改行あり\n4,"山本,京都,x\n5,伊藤,福岡,y\n6,加藤,札幌,z,,\n7,吉田,仙台\n8,中村,広島,a,b\n9,小林,"那覇"ok,w\n`;
let r=T.check(s,{});
assert.equal(r.delim,",");assert.equal(r.expected,4);assert.equal(r.firstBroken,6);
assert.deepEqual(r.out[4],["4","山本","京都","x"]);
assert.deepEqual(r.out[3],["3","鈴木","名古屋\n中区","改行あり"]);
assert.equal(r.stats.out,8);assert.equal(r.stats.review,1);
assert.ok(r.issues.some(i=>i.type==="quote"&&i.start===11));
r=T.check(s,{long:"join"});assert.deepEqual(r.out.find(x=>x[0]==="8"),["8","中村","広島","a,b"]);
r=T.check(s,{long:"keep"});assert.equal(r.out[0][4],"列5");
r=T.check(s,{newline:"space"});assert.equal(r.out[3][2],"名古屋 中区");
r=T.check(s,{pad:false});assert.equal(r.stats.review,2);
// タブ区切り・CR のみ・制御文字
r=T.check("a\tb\tc\r1\t2\t3\r4\t5\u0000\t6\r",{});
assert.equal(r.delim,"\t");assert.deepEqual(r.out[2],["4","5","6"]);assert.equal(r.scan.eol.cr,3);assert.equal(r.counts.ctrl,1);
// 引用符で閉じた後に列数が合わないまま改行を飲み込むケース
r=T.check('a,b,c\n1,"x,2\n3,y",z\n4,5,6\n',{});
console.log(r.issues.map(i=>[i.start,i.type,i.action].join(" ")));console.log(JSON.stringify(r.out));
// 見出しの空欄・重複
r=T.check("a,,a\n1,2,3\n",{});assert.equal(r.counts.head,2);
// Shift_JIS 判定
const sj=T.encodeSJIS("名前,髙\n山田,1\n").bytes;const rt=T.readText(sj);assert.equal(rt.enc,"shift_jis");assert.ok(rt.text.startsWith("名前"));
// 大きなファイル
let big="id,v\n";for(let i=0;i<200000;i++)big+=i+",x"+(i%5000===0?",extra":"")+"\n";
let t=Date.now();r=T.check(big,{});console.log("200k rows",Date.now()-t,"ms",r.counts);
console.log("ALL OK");
