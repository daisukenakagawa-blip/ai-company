/* 縦持ち⇔横持ち変換（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

/* ---------- 読み込み（UTF-8 / Shift_JIS を判定） ---------- */
function tryDecode(u8,e){try{return new TextDecoder(e,{fatal:true}).decode(u8);}catch(_){return null;}}
function readText(u8){
  if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return {text:new TextDecoder("utf-8").decode(u8),enc:"utf-8"};
  const t=tryDecode(u8,"utf-8");
  if(t!==null) return {text:t,enc:"utf-8"};
  return {text:new TextDecoder("shift_jis").decode(u8),enc:"shift_jis"};
}

/* ---------- CSV ---------- */
function parseCSV(text){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const first=text.split("\n",1)[0];
  const d=first.split("\t").length>first.split(",").length?"\t":",";
  const rows=[];let row=[],f="",q=false,i=0;
  while(i<text.length){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i+=2;continue;} q=false;i++;continue;} f+=c;i++;continue; }
    if(c==='"'&&f===""){q=true;i++;continue;}
    if(c===d){row.push(f);f="";i++;continue;}
    if(c==="\r"){i++;continue;}
    if(c==="\n"){row.push(f);rows.push(row);row=[];f="";i++;continue;}
    f+=c;i++;
  }
  if(f!==""||row.length){row.push(f);rows.push(row);}
  return {rows:rows.filter(r=>r.some(v=>v!=="")),delim:d};
}
function cell(v,d,excel,code){
  v=v==null?"":String(v);
  if(excel&&code&&/^\d+$/.test(v)) v='="'+v+'"';
  return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;
}
/* codeCols: Set(列番号) … excel=true のとき、その列の数字だけの値を ="0123" の形にする */
function toCSV(rows,d,excel,codeCols,header){
  return rows.map((r,ri)=>r.map((v,ci)=>cell(v,d,excel&&!(header&&ri===0),codeCols&&codeCols.has(ci))).join(d)+"\r\n").join("");
}

/* ---------- Shift_JIS（Windows の範囲）で書き出す ---------- */
let SJ=null;
function sjisTable(){
  if(SJ) return SJ;
  const dec=new TextDecoder("shift_jis");const map=new Map();
  for(let lead=0x81;lead<=0xFC;lead++){
    if(lead>=0xA0&&lead<=0xDF) continue;
    if(lead>=0xF0&&lead<=0xF9) continue;
    if(lead===0xED||lead===0xEE) continue;
    for(let tr=0x40;tr<=0xFC;tr++){
      if(tr===0x7F) continue;
      const s=dec.decode(new Uint8Array([lead,tr]));
      if(s.length!==1||s==="�") continue;
      const cp=s.codePointAt(0);
      if(!map.has(cp)) map.set(cp,[lead,tr]);
    }
  }
  SJ=map;return SJ;
}
function encodeSJIS(text){
  const m=sjisTable();const out=[];let bad=0;
  for(const ch of text){
    const c=ch.codePointAt(0);
    if(c<0x80) out.push(c);
    else if(c>=0xFF61&&c<=0xFF9F) out.push(c-0xFF61+0xA1);
    else if(c===0xA5) out.push(0x5C);
    else if(c===0x203E) out.push(0x7E);
    else{const b=m.get(c);if(b) out.push(...b);else{out.push(0x3F);bad++;}}
  }
  return {bytes:new Uint8Array(out),bad};
}
function encodeUTF8(text,bom){
  const b=new TextEncoder().encode(text);
  if(!bom) return b;
  const o=new Uint8Array(b.length+3);o.set([0xEF,0xBB,0xBF]);o.set(b,3);return o;
}


/* ---------- 数値として読む（「1,200」「１２００」「¥1,200」「▲300」「1200円」） ---------- */
function toNum(s){
  if(s==null) return NaN;
  let t=String(s).replace(/[０-９．－，＋]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[\s　]/g,"");
  if(t==="") return NaN;
  let neg=false;
  if(/^[▲△]/.test(t)){neg=true;t=t.slice(1);}
  t=t.replace(/^[¥￥\\]/,"").replace(/円$/,"");
  if(/^\(.*\)$/.test(t)){neg=true;t=t.slice(1,-1);}
  if(!/^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) return NaN;
  const n=Number(t.replace(/,/g,""));
  return neg?-n:n;
}
function fmt(n,dec){
  if(!isFinite(n)) return "";
  if(dec!=null&&dec>=0){const p=Math.pow(10,dec);n=Math.round(n*p)/p;}
  else n=Number(n.toPrecision(15));
  if(Object.is(n,-0)) n=0;
  return String(n);
}
const collator=(typeof Intl!=="undefined")?new Intl.Collator("ja",{numeric:true,sensitivity:"base"}):null;
function cmp(a,b){
  const x=toNum(a),y=toNum(b);
  if(!isNaN(x)&&!isNaN(y)) return x-y;
  if(a===""&&b!=="") return 1; if(b===""&&a!=="") return -1;
  return collator?collator.compare(a,b):(a<b?-1:a>b?1:0);
}

/* ---------- 縦 → 横（クロス表） ----------
 o = {header:bool, rowKeys:[列番号...], colKey:列番号, val:列番号(-1=なし), agg:"sum|count|avg|max|min|first|join",
      fill:"", totals:bool, colOrder:"appear|asc", rowOrder:"appear|asc", dec:null|数, sep:"、", blankName:"（空欄）"} */
const AGG_NAME={sum:"合計",count:"件数",avg:"平均",max:"最大",min:"最小",first:"最初の値",join:"値をつなぐ"};
const NUMERIC={sum:1,avg:1,max:1,min:1};
function newAcc(){return {n:0,sum:0,min:Infinity,max:-Infinity,first:null,vals:[],cnt:0};}
function addAcc(a,v,num){
  a.cnt++;
  if(a.first===null) a.first=v;
  a.vals.push(v);
  if(!isNaN(num)){a.n++;a.sum+=num;if(num<a.min)a.min=num;if(num>a.max)a.max=num;}
}
function finAcc(a,agg,o){
  if(!a||a.cnt===0) return null;
  switch(agg){
    case "count": return String(a.cnt);
    case "sum": return a.n?fmt(a.sum,o.dec):null;
    case "avg": return a.n?fmt(a.sum/a.n,o.dec):null;
    case "max": return a.n?fmt(a.max,o.dec):null;
    case "min": return a.n?fmt(a.min,o.dec):null;
    case "first": return a.first;
    case "join": return a.vals.filter(v=>v!=="").join(o.sep==null?"、":o.sep);
  }
  return null;
}
function pivot(rows,o){
  const blank=o.blankName==null?"（空欄）":o.blankName;
  const head=o.header?rows[0]:null;
  const data=o.header?rows.slice(1):rows;
  const name=i=>head&&head[i]!=null&&head[i]!==""?head[i]:"列"+(i+1);
  const agg=o.agg, useVal=agg!=="count";
  const rowMap=new Map(), colMap=new Map();
  const colTot=new Map(), grand=newAcc();
  const bad=[]; let multi=0, used=0, skipped=0;
  data.forEach((r,ri)=>{
    const rk=o.rowKeys.map(i=>r[i]==null?"":r[i]);
    const ck=(r[o.colKey]==null||r[o.colKey]==="")?blank:r[o.colKey];
    let v="",num=NaN;
    if(useVal){
      v=r[o.val]==null?"":r[o.val];
      if(v===""){skipped++;return;}
      num=toNum(v);
      if(NUMERIC[agg]&&isNaN(num)){bad.push({row:ri+1+(o.header?1:0),value:v});return;}
    }
    used++;
    const key=JSON.stringify(rk);
    let R=rowMap.get(key);
    if(!R){R={keys:rk,cells:new Map(),tot:newAcc(),order:rowMap.size};rowMap.set(key,R);}
    if(!colMap.has(ck)){colMap.set(ck,colMap.size);colTot.set(ck,newAcc());}
    let a=R.cells.get(ck);
    if(!a){a=newAcc();R.cells.set(ck,a);}
    else if(agg==="first") multi++;
    addAcc(a,v,num);addAcc(R.tot,v,num);addAcc(colTot.get(ck),v,num);addAcc(grand,v,num);
  });
  let colsK=[...colMap.keys()];
  if(o.colOrder==="asc") colsK.sort((a,b)=>a===blank?1:b===blank?-1:cmp(a,b));
  let rowsR=[...rowMap.values()];
  if(o.rowOrder==="asc") rowsR.sort((A,B)=>{for(let i=0;i<A.keys.length;i++){const c=cmp(A.keys[i],B.keys[i]);if(c)return c;}return 0;});
  const totals=o.totals&&(agg!=="first"&&agg!=="join");
  const totName=AGG_NAME[agg]==="合計"||agg==="count"?"合計":"全体の"+AGG_NAME[agg];
  const out=[];
  const hdr=o.rowKeys.map(name).concat(colsK);
  if(totals) hdr.push(totName);
  out.push(hdr);
  const fill=o.fill==null?"":o.fill;
  rowsR.forEach(R=>{
    const line=R.keys.slice();
    colsK.forEach(c=>{const v=finAcc(R.cells.get(c),agg,o);line.push(v==null?fill:v);});
    if(totals){const v=finAcc(R.tot,agg,o);line.push(v==null?"":v);}
    out.push(line);
  });
  if(totals){
    const line=[totName];for(let i=1;i<o.rowKeys.length;i++) line.push("");
    colsK.forEach(c=>{const v=finAcc(colTot.get(c),agg,o);line.push(v==null?"":v);});
    const g=finAcc(grand,agg,o);line.push(g==null?"":g);
    out.push(line);
  }
  return {rows:out,info:{inRows:data.length,used,skipped,bad,multi,outRows:rowsR.length,outCols:colsK.length}};
}

/* ---------- 横 → 縦 ----------
 o = {header:bool, keep:[列番号...], melt:[列番号...], itemName:"項目", valueName:"値", skipEmpty:bool, order:"row|col"} */
function unpivot(rows,o){
  const head=o.header?rows[0]:null;
  const data=o.header?rows.slice(1):rows;
  const name=i=>head&&head[i]!=null&&head[i]!==""?head[i]:"列"+(i+1);
  const out=[o.keep.map(name).concat([o.itemName||"項目",o.valueName||"値"])];
  let skipped=0;
  const push=(r,m)=>{
    const v=r[m]==null?"":r[m];
    if(o.skipEmpty&&String(v).trim()===""){skipped++;return;}
    out.push(o.keep.map(i=>r[i]==null?"":r[i]).concat([name(m),v]));
  };
  if(o.order==="col") o.melt.forEach(m=>data.forEach(r=>push(r,m)));
  else data.forEach(r=>o.melt.forEach(m=>push(r,m)));
  return {rows:out,info:{inRows:data.length,outRows:out.length-1,skipped}};
}

/* 列の値の様子（設定の手助け） */
function profile(rows,header){
  const head=header?rows[0]:null;
  const data=header?rows.slice(1):rows;
  const n=rows.reduce((m,r)=>Math.max(m,r.length),0);
  const cols=[];
  for(let i=0;i<n;i++){
    const set=new Set();let num=0,filled=0;
    for(const r of data){const v=r[i]==null?"":r[i];if(v!==""){filled++;if(!isNaN(toNum(v)))num++;}if(set.size<=1000)set.add(v);}
    cols.push({name:head&&head[i]?head[i]:"列"+(i+1),distinct:set.size>1000?"1000超":set.size,numeric:filled>0&&num===filled,filled,examples:[...set].filter(v=>v!=="").slice(0,3)});
  }
  return cols;
}

const api={readText,parseCSV,toCSV,encodeSJIS,encodeUTF8,toNum,fmt,cmp,pivot,unpivot,profile,AGG_NAME};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.TateYoko=api;
})(this);
