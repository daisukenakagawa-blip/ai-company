const S=require("./soroe.js");const assert=require("assert");
const sj=S.encodeSJIS('受注番号,氏名（姓）,氏名（名）,郵便番号,住所,金額,空き\r\n"A-001",髙橋,一郎,0100001,"東京都千代田区1-1, ビル2F",1200,\r\n,,,,,,\r\nA-002,佐藤,花子,5300001,"大阪府大阪市\n北区",800,x\r\n').bytes;
const t=S.readTable(sj);assert.strictEqual(t.enc,"shift_jis");assert.strictEqual(t.rows.length,3);
let cfg=S.defaultConfig(t.header);
cfg.columns=[{name:"注文ID",type:"col",src:"受注番号"},{name:"お名前",type:"tpl",tpl:"{氏名（姓）} {氏名（名）}様"},{name:"〒",type:"col",src:" 郵便番号 "},
 {name:"住所",type:"col",src:"住所"},{name:"メモ",type:"empty"},{name:"区分",type:"tpl",tpl:"通販{{固定}}"},{name:"金額",type:"col",src:"ｷﾝｶﾞｸ"}];
const miss=S.checkConfig(cfg,t.header);console.log(miss);assert.deepStrictEqual(miss.map(m=>m.name),["ｷﾝｶﾞｸ"]);
cfg.columns[6].src="金額";cfg.output.enc="sjis";
const txt=S.configText(cfg);const cfg2=S.validateConfig(JSON.parse(txt));
const r=S.apply(cfg2,t.header,t.rows);console.log(r);
assert.strictEqual(r.rows.length,2);assert.strictEqual(r.skipped,1);
assert.deepStrictEqual(r.rows[0],["A-001","髙橋 一郎様","0100001","東京都千代田区1-1, ビル2F","","通販{固定}","1200"]);
const out=S.toCSV(r.header,r.rows,cfg2.output);console.log(out);
const enc=S.encodeOut(out,"sjis");console.log("bad",enc.bad);assert.strictEqual(enc.bad,0);
const back=S.readTable(enc.bytes);assert.deepStrictEqual(back.rows,r.rows);
// quoteAll, lf, no header, tab
const o2=S.toCSV(r.header,r.rows,{delim:"\t",eol:"lf",quoteAll:true});assert(o2.startsWith('"注文ID"\t'));assert(!o2.includes("\r\n"));
const o3=S.toCSV(null,r.rows,{});assert(o3.startsWith("A-001,"));
// noHeader
const nh=S.readTable(new TextEncoder().encode("a,b\nc,d\n"),{noHeader:true});assert.deepStrictEqual(nh.header,["列1","列2"]);assert.strictEqual(nh.rows.length,2);
// trim, duplicate names
const r2=S.apply({columns:[{name:"x",type:"col",src:"a"},{name:"X",type:"col",src:"b"}],output:Object.assign(S.defaultOutput(),{trim:true})},["a","b"],[["  1　","2"]]);
assert.strictEqual(r2.rows[0][0],"1");assert(r2.warn.some(w=>w.includes("同じ名前")));
// invalid configs
for(const bad of [null,[],{tool:"x",columns:[]},{tool:S.TOOL_ID}]){try{S.validateConfig(bad);assert.fail();}catch(e){if(e.code==="ERR_ASSERTION")throw e;console.log("NG:",e.message);}}
console.log("ALL OK");
