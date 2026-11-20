const J=require("./jsoncsv.js");const assert=require("assert");
let r=J.readJSON('{"data":{"users":[{"id":12345678901234567890,"name":"山田","tags":["a","b"],"addr":{"pref":"東京都","zip":"0100001"},"x":null,"ok":true},{"id":2,"name":"佐藤\\n花子","addr":{"pref":"大阪府"},"orders":[{"no":1,"amt":1200},{"no":2,"amt":800}]}]},"meta":{"count":2}}');
let t=J.findTables(r.value);assert.deepStrictEqual(t[0].path,["data","users"]);
let items=J.getPath(r.value,t[0].path);
let tb=J.jsonToTable(items,{});
console.log(tb.header);console.log(tb.rows);
assert.strictEqual(tb.rows[0][0],"12345678901234567890");
assert.strictEqual(tb.rows[0][tb.header.indexOf("tags")],"a、b");
assert.strictEqual(tb.rows[1][tb.header.indexOf("orders")],'[{"no":1,"amt":1200},{"no":2,"amt":800}]');
let ti=J.jsonToTable(items,{arrayMode:"index"});console.log(ti.header);
assert(ti.header.includes("orders.2.amt")&&ti.header.includes("tags.1"));
let af=J.arrayFields(items);console.log(af.map(a=>a.path.join(".")));
let te=J.jsonToTable(items,{explode:["orders"]});console.log(te.header,te.rows);
assert.strictEqual(te.rows.length,3);assert.strictEqual(te.rows[2][te.header.indexOf("orders.amt")],"800");
// JSON Lines
r=J.readJSON('{"a":1}\n{"a":2,"b":{"c":"x"}}\n');assert(r.lines&&r.value.length===2);
// errors
for(const bad of ['[{"a":1,}]','{"a":1','{a:1}',"[{'a':1}]",'[1 2]']){try{J.readJSON(bad);assert.fail("no err "+bad);}catch(e){console.log(bad,"→",e.message);}}
// CSV -> JSON round trip
const csv=J.toCSV(ti.header,ti.rows,",");
const rows=J.parseCSV(csv,J.detectDelim(csv));
const back=J.tableToJSON(rows[0],rows.slice(1),{empty:"omit"});
console.log(J.itemsToText(back.items,{indent:2}));
assert.strictEqual(back.items[0].id,"12345678901234567890");
assert.deepStrictEqual(back.items[0].tags,["a","b"]);
assert.strictEqual(back.items[0].addr.zip,"0100001");
assert.strictEqual(back.items[1].orders[1].amt.raw,"800");
assert.strictEqual(back.items[1].name,"佐藤\n花子");
// types
const b2=J.tableToJSON(["コード","金額","有効","メモ","a","a.b"],[["007","1,200","TRUE","","1","2"]],{empty:"null"});
console.log(J.itemsToText(b2.items,{indent:0}),b2.warn);
const b3=J.tableToJSON(["タグ"],[["赤/青"]],{splitArr:"/"});assert.deepStrictEqual(b3.items[0]["タグ"],["赤","青"]);
// big
const big=[];for(let k=0;k<100000;k++)big.push({id:k,name:"名前"+k,a:{b:k%3,c:[1,2]}});
let s=Date.now();const bt=J.jsonToTable(J.readJSON(JSON.stringify(big)).value,{});console.log("100k rows",Date.now()-s,"ms",bt.header);
console.log("OK");
const z=J.tableToJSON(["zip","n","tags.1","tags.2"],[["0100001","1","a",""],["5300001","2.5","",""]],{});
console.log(J.stringify(z.items,0));
assert.strictEqual(z.items[1].zip,"5300001");assert.strictEqual(z.items[1].n.raw,"2.5");assert.deepStrictEqual(z.items[0].tags,["a"]);assert.deepStrictEqual(z.items[1].tags,[]);
console.log("OK2");
