/* JSON ⇔ CSV 変換（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

/* ---------- 文字コード ---------- */
function tryDecode(u8,e){try{return new TextDecoder(e,{fatal:true}).decode(u8);}catch(_){return null;}}
function readText(u8){
  if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return {text:new TextDecoder("utf-8").decode(u8.subarray(3)),enc:"utf-8",bom:true};
  const t=tryDecode(u8,"utf-8");
  if(t!==null) return {text:t,enc:"utf-8",bom:false};
  return {text:new TextDecoder("shift_jis").decode(u8),enc:"shift_jis",bom:false};
}
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
      if(s.length!==1||s==="\uFFFD") continue;
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

/* ---------- JSON の読み取り（数値は書かれたとおりの文字で保つ：桁の大きい ID が丸められない） ---------- */
function Num(raw){this.raw=raw;}
Num.prototype.toString=function(){return this.raw;};
function isObj(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)&&!(v instanceof Num);}

function JErr(msg,text,pos){
  let line=1,col=1;
  for(let i=0;i<pos&&i<text.length;i++){if(text[i]==="\n"){line++;col=1;}else col++;}
  const e=new Error(`${line}行目 ${col}文字目：${msg}`);e.line=line;e.col=col;e.pos=pos;return e;
}
function parseJSON(text,start){
  let i=start||0;const n=text.length;
  function ws(){while(i<n){const c=text.charCodeAt(i);if(c===32||c===9||c===10||c===13||c===0xFEFF)i++;else break;}}
  function val(){
    ws();if(i>=n) throw JErr("値がありません（途中で終わっています）",text,i);
    const c=text[i];
    if(c==="{"){i++;const o={};ws();if(text[i]==="}"){i++;return o;}
      for(;;){ws();if(text[i]!=='"') throw JErr(text[i]==="}"?"「}」の前に余分な「,」があります":"項目名は「\"」で囲む必要があります",text,i);
        const k=str();ws();if(text[i]!==":") throw JErr("項目名のあとに「:」がありません",text,i);i++;
        o[k]=val();ws();
        if(text[i]===","){i++;continue;}
        if(text[i]==="}"){i++;return o;}
        throw JErr(i>=n?"「}」で閉じられていません":"「,」か「}」が必要です",text,i);}
    }
    if(c==="["){i++;const a=[];ws();if(text[i]==="]"){i++;return a;}
      for(;;){ws();if(text[i]==="]") throw JErr("「]」の前に余分な「,」があります",text,i);
        a.push(val());ws();
        if(text[i]===","){i++;continue;}
        if(text[i]==="]"){i++;return a;}
        throw JErr(i>=n?"「]」で閉じられていません":"「,」か「]」が必要です",text,i);}
    }
    if(c==='"') return str();
    if(text.startsWith("true",i)){i+=4;return true;}
    if(text.startsWith("false",i)){i+=5;return false;}
    if(text.startsWith("null",i)){i+=4;return null;}
    const m=/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i,i+400));
    if(m&&m[0].length&&m[0]!=="-"){i+=m[0].length;return new Num(m[0]);}
    if(c==="'") throw JErr("文字列は「'」ではなく「\"」で囲む必要があります",text,i);
    throw JErr("読めない文字「"+c+"」があります",text,i);
  }
  function str(){
    i++;let s="";
    for(;;){
      if(i>=n) throw JErr("文字列が「\"」で閉じられていません",text,i);
      const c=text[i];
      if(c==='"'){i++;return s;}
      if(c==="\\"){
        const e=text[i+1];
        if(e==="u"){const h=text.slice(i+2,i+6);if(!/^[0-9a-fA-F]{4}$/.test(h)) throw JErr("「\\u」のあとは16進数4桁が必要です",text,i);s+=String.fromCharCode(parseInt(h,16));i+=6;continue;}
        const map={'"':'"',"\\":"\\","/":"/",b:"\b",f:"\f",n:"\n",r:"\r",t:"\t"};
        if(!(e in map)) throw JErr("使えない「\\」の書き方です",text,i);
        s+=map[e];i+=2;continue;
      }
      if(c==="\n") throw JErr("文字列の途中で改行しています（「\"」の閉じ忘れの可能性）",text,i);
      s+=c;i++;
    }
  }
  const v=val();ws();
  return {value:v,end:i};
}
/* JSON 1つ、または JSON Lines（1行に1つ） */
function readJSON(text){
  text=text.replace(/^\uFEFF/,"");
  if(!text.trim()) throw new Error("データが空です");
  try{
    const r=parseJSON(text,0);
    if(r.end>=text.length) return {value:r.value,lines:false};
    // 後ろに続きがある → JSON Lines として読んでみる
    const rest=text.slice(r.end).trim();
    if(!rest) return {value:r.value,lines:false};
  }catch(e){
    // 1行目だけで完結しているなら JSON Lines の可能性
    const first=text.split(/\r?\n/).find(l=>l.trim());
    let ok=false;try{const r=parseJSON(first,0);ok=r.end>=first.length;}catch(_){}
    if(!ok) throw e;
  }
  const out=[];const ls=text.split(/\r\n|\n|\r/);
  for(let k=0;k<ls.length;k++){
    const l=ls[k];if(!l.trim()) continue;
    try{const r=parseJSON(l,0);if(r.end<l.length) throw JErr("1行に2つ以上の値があります",l,r.end);out.push(r.value);}
    catch(e){const m=/^(\d+)行目 (\d+)文字目：(.*)$/.exec(e.message);throw new Error(`${k+1}行目 ${m?m[2]:"?"}文字目：${m?m[3]:e.message}（JSON Lines として読んでいます）`);}
  }
  return {value:out,lines:true};
}

/* ---------- 表にする部分を探す ---------- */
function typeName(v){if(v===null)return "null";if(Array.isArray(v))return "array";if(v instanceof Num)return "number";return typeof v;}
function findTables(root){
  const found=[];
  (function walk(v,path,depth){
    if(depth>12) return;
    if(Array.isArray(v)){
      const objs=v.filter(isObj).length;
      found.push({path:path.slice(),count:v.length,objs});
      return;
    }
    if(isObj(v)) for(const k of Object.keys(v)) walk(v[k],path.concat(k),depth+1);
  })(root,[],0);
  // ルートがオブジェクト1つ：それ自体も1行の表として選べる
  if(isObj(root)) found.push({path:[],count:1,objs:1,single:true});
  found.sort((a,b)=>(b.objs-a.objs)||(b.count-a.count));
  return found;
}
function getPath(root,path){let v=root;for(const k of path){if(v==null)return undefined;v=v[k];}return v;}
function pathLabel(p,single){return single?"（全体を1行に）":(p.length?p.join(" › "):"（いちばん外側の配列）");}

/* ---------- JSON → 表 ---------- */
function scalarText(v,o){
  if(v===null||v===undefined) return o.nullText;
  if(v===true) return o.boolUpper?"TRUE":"true";
  if(v===false) return o.boolUpper?"FALSE":"false";
  if(v instanceof Num) return v.raw;
  return String(v);
}
function stringify(v,indent,level){
  level=level||0;
  if(v===null) return "null";
  if(v===true||v===false) return String(v);
  if(v instanceof Num) return v.raw;
  if(typeof v==="number") return isFinite(v)?String(v):"null";
  if(typeof v==="string") return JSON.stringify(v);
  const pad=indent?"\n"+" ".repeat(indent*(level+1)):"";const end=indent?"\n"+" ".repeat(indent*level):"";
  const sep=indent?",":",";const colon=indent?": ":":";
  if(Array.isArray(v)){if(!v.length)return "[]";return "["+v.map(x=>pad+stringify(x,indent,level+1)).join(sep)+end+"]";}
  const ks=Object.keys(v);if(!ks.length) return "{}";
  return "{"+ks.map(k=>pad+JSON.stringify(k)+colon+stringify(v[k],indent,level+1)).join(sep)+end+"}";
}
/* 1件のオブジェクトを「列名→値」に平らにする */
function flattenOne(v,prefix,o,out,depth){
  const ks=o.keySep;
  if(Array.isArray(v)){
    if(!v.length){if(prefix) out.set(prefix,"");return;}
    const allScalar=v.every(x=>!(isObj(x)||Array.isArray(x)));
    if(o.arrayMode==="json"||(o.arrayMode==="join"&&!allScalar)){out.set(prefix,stringify(v,0));return;}
    if(o.arrayMode==="index"){
      v.forEach((x,k)=>flattenOne(x,prefix?prefix+ks+(k+1):String(k+1),o,out,depth+1));return;
    }
    out.set(prefix,v.map(x=>scalarText(x,o)).join(o.joinSep));return;
  }
  if(isObj(v)){
    const keys=Object.keys(v);
    if(!keys.length){if(prefix) out.set(prefix,"");return;}
    if(depth>=o.maxDepth&&prefix){out.set(prefix,stringify(v,0));return;}
    for(const k of keys) flattenOne(v[k],prefix?prefix+ks+k:k,o,out,depth+1);
    return;
  }
  out.set(prefix||o.valueName,scalarText(v,o));
}
/* 行に展開する配列の候補（各件の中にある配列） */
function arrayFields(items){
  const m=new Map();
  for(const it of items.slice(0,2000)){
    if(!isObj(it)) continue;
    (function walk(v,path,d){
      if(d>6) return;
      for(const k of Object.keys(v)){
        const x=v[k];const p=path.concat(k);
        if(Array.isArray(x)){const key=p.join("\u0001");const e=m.get(key)||{path:p,n:0,objs:0};e.n++;if(x.some(isObj))e.objs++;m.set(key,e);}
        else if(isObj(x)) walk(x,p,d+1);
      }
    })(it,[],0);
  }
  return [...m.values()].sort((a,b)=>b.n-a.n);
}
function deleteAt(obj,path){
  // path の配列を取り除いたコピー（他の値はそのまま共有）
  if(path.length===1){const c={};for(const k of Object.keys(obj)) if(k!==path[0]) c[k]=obj[k];return c;}
  const c={};for(const k of Object.keys(obj)) c[k]=(k===path[0]&&isObj(obj[k]))?deleteAt(obj[k],path.slice(1)):obj[k];return c;
}
function jsonToTable(items,opts){
  const o=Object.assign({keySep:".",arrayMode:"join",joinSep:"、",nullText:"",boolUpper:false,maxDepth:20,explode:null,valueName:"値",newline:"keep"},opts||{});
  const cols=[];const seen=new Set();const rows=[];const warn=[];
  let nonObj=0,exploded=0,emptyExplode=0;
  const add=(map)=>{for(const k of map.keys()) if(!seen.has(k)){seen.add(k);cols.push(k);} rows.push(map);};
  for(const it of items){
    if(!isObj(it)){nonObj++;const m=new Map();flattenOne(it,"",o,m,0);add(m);continue;}
    if(o.explode&&o.explode.length){
      const arr=getPath(it,o.explode);
      if(Array.isArray(arr)&&arr.length){
        const base=deleteAt(it,o.explode);const bm=new Map();flattenOne(base,"",o,bm,0);
        const pre=o.explode.join(o.keySep);
        for(const el of arr){const m=new Map(bm);flattenOne(el,pre,o,m,o.explode.length);add(m);exploded++;}
        continue;
      }
      emptyExplode++;
    }
    const m=new Map();flattenOne(it,"",o,m,0);add(m);
  }
  const fix=s=>o.newline==="space"?s.replace(/\r\n|\r|\n/g," "):s;
  const out=rows.map(m=>cols.map(c=>m.has(c)?fix(m.get(c)):""));
  if(nonObj) warn.push(`オブジェクトでない要素が ${nonObj} 件あり、「${o.valueName}」列に入れました`);
  if(o.explode&&emptyExplode) warn.push(`行に展開する配列がない（または空の）件が ${emptyExplode} 件あり、1行のまま残しました`);
  return {header:cols,rows:out,warn,exploded};
}

/* ---------- CSV の読み取り ---------- */
function countOutsideQuotes(line,d){let n=0,q=false;for(const c of line){if(c==='"')q=!q;else if(c===d&&!q)n++;}return n;}
function detectDelim(text){
  const lines=text.split(/\r\n|\n|\r/).filter(l=>l.length).slice(0,50);
  let best=",",bs=-1;
  for(const d of [",","\t",";","|"]){
    const c=lines.map(l=>countOutsideQuotes(l,d));
    if(!c.length||!c[0]) continue;
    const same=c.filter(x=>x===c[0]).length;
    const s=same*10+c[0];
    if(s>bs){bs=s;best=d;}
  }
  return best;
}
function parseCSV(text,d){
  const rows=[];let row=[],f="",q=false,i=0;
  while(i<text.length){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i+=2;continue;}q=false;i++;continue;}f+=c;i++;continue;}
    if(c==='"'&&f===""){q=true;i++;continue;}
    if(c===d){row.push(f);f="";i++;continue;}
    if(c==="\r"||c==="\n"){row.push(f);rows.push(row);row=[];f="";i+=(c==="\r"&&text[i+1]==="\n")?2:1;continue;}
    f+=c;i++;
  }
  if(f!==""||row.length){row.push(f);rows.push(row);}
  return rows.filter(r=>!(r.length===1&&r[0]===""));
}
function cell(v,d){v=v==null?"":String(v);return (v.includes(d)||/["\r\n]/.test(v)||/^\s|\s$/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(header,rows,d){return [header].concat(rows).map(r=>r.map(v=>cell(v,d)).join(d)+"\r\n").join("");}

/* ---------- 表 → JSON ---------- */
const NUM_RE=/^-?(0|[1-9]\d*)(\.\d+)?$/;
function numOK(t){
  if(!NUM_RE.test(t)) return false;
  return t.replace(/^-/,"").replace(".","").replace(/^0+/,"").length<=15;
}
/* 列ごとに、数値にしてよいかを決める（1つでも「0123」のような値があれば、その列は文字のまま） */
function numericColumns(rows,n){
  const ok=new Array(n).fill(true),any=new Array(n).fill(false);
  for(const r of rows) for(let c=0;c<n;c++){
    const t=(r[c]===undefined?"":r[c]).trim();if(!t) continue;
    if(/^-?0\d+(\.\d+)?$/.test(t)){ok[c]=false;continue;} // 先頭が0の番号
    if(!NUM_RE.test(t)) continue; // 数字でない値は列の判定に使わない（その値だけ文字）
    any[c]=true;
    if(!numOK(t)) ok[c]=false;
  }
  return ok.map((v,c)=>v&&any[c]);
}
function convertValue(s,o,numCol){
  if(s===""){if(o.empty==="null")return null;if(o.empty==="omit")return undefined;return "";}
  if(o.types==="string") return s;
  const t=s.trim();
  if(numCol===false&&NUM_RE.test(t)) return s;
  if(NUM_RE.test(t)){
    const digits=t.replace(/^-/,"").replace(".","").replace(/^0+/,"");
    if(digits.length<=15) return new Num(t);
    return s; // 15桁を超える数字（ID など）は文字列のまま
  }
  if(t==="true"||t==="TRUE") return true;
  if(t==="false"||t==="FALSE") return false;
  if(o.nullWord&&(t==="null"||t==="NULL")) return null;
  return s;
}
function splitKey(k,sep){return sep?k.split(sep):[k];}
function tableToJSON(header,rows,opts){
  const o=Object.assign({nest:true,keySep:".",types:"auto",empty:"empty",nullWord:false,arraysFromNumbers:true,splitArr:""},opts||{});
  const warn=[];
  // 見出しの空欄・重複
  const names=header.map((h,k)=>{const t=h.trim();return t||`列${k+1}`;});
  const cnt=new Map();names.forEach(n=>cnt.set(n,(cnt.get(n)||0)+1));
  const dup=[...cnt].filter(([,n])=>n>1).map(([k])=>k);
  if(dup.length) warn.push(`同じ見出しが複数あります：${dup.join("、")}（2つ目以降は「名前(2)」にしました）`);
  if(header.some(h=>!h.trim())) warn.push("空欄の見出しは「列1」のような名前にしました");
  const used=new Map();
  const keys=names.map(n=>{const c=(used.get(n)||0)+1;used.set(n,c);return c>1?`${n}(${c})`:n;});
  const paths=keys.map(k=>o.nest?splitKey(k,o.keySep).map(s=>s.trim()):[k]);
  // 入れ子の衝突（「a」と「a.b」が両方ある）
  if(o.nest){
    const set=new Set(paths.map(p=>p.join("\u0001")));
    const clash=paths.filter(p=>{for(let k=1;k<p.length;k++) if(set.has(p.slice(0,k).join("\u0001"))) return true;return false;});
    if(clash.length) warn.push(`「${clash[0].slice(0,-1).join(o.keySep)}」が値の列と入れ子の列の両方にあります。値の列のほうを「${clash[0].slice(0,-1).join(o.keySep)}${o.keySep}値」に入れました`);
  }
  let wide=0,short=0;
  const numCols=numericColumns(rows,keys.length);
  const out=rows.map(r=>{
    if(r.length>keys.length) wide++;
    if(r.length<keys.length) short++;
    const obj={};
    keys.forEach((k,c)=>{
      const raw=r[c]===undefined?"":r[c];
      let v;
      if(o.splitArr&&raw!==""&&raw.includes(o.splitArr)) v=raw.split(o.splitArr).map(x=>convertValue(x.trim(),Object.assign({},o,{empty:"empty"}))).filter(x=>x!=="");
      else v=convertValue(raw,o,numCols[c]);
      if(v===undefined) return;
      setPath(obj,paths[c],v);
    });
    if(o.arraysFromNumbers) for(const k of Object.keys(obj)) obj[k]=toArrays(obj[k]);
    return obj;
  });
  if(wide) warn.push(`見出しより列の多い行が ${wide} 行あります（はみ出した値は入れていません）`);
  if(short) warn.push(`見出しより列の少ない行が ${short} 行あります（足りない列は空欄として扱いました）`);
  return {items:out,warn,keys};
}
function setPath(obj,path,v){
  let cur=obj;
  for(let k=0;k<path.length-1;k++){
    const p=path[k];
    if(!isObj(cur[p])){
      if(p in cur){const old=cur[p];cur[p]={};cur[p]["値"]=old;}
      else cur[p]={};
    }
    cur=cur[p];
  }
  const last=path[path.length-1];
  if(isObj(cur[last])) cur[last]["値"]=v; else cur[last]=v;
}
/* キーが 1,2,3… だけのオブジェクトは配列にする（JSON → CSV の「番号で列に」の逆） */
function toArrays(v){
  if(Array.isArray(v)) return v.map(toArrays);
  if(!isObj(v)) return v;
  const ks=Object.keys(v);
  for(const k of ks) v[k]=toArrays(v[k]);
  if(ks.length&&(ks.every((k,i)=>k===String(i+1))||ks.every((k,i)=>k===String(i)))){
    const a=ks.map(k=>v[k]);
    while(a.length&&(a[a.length-1]===""||a[a.length-1]===null)) a.pop(); // 後ろの空欄は要素にしない
    return a;
  }
  return v;
}
function itemsToText(items,o){
  o=o||{};
  if(o.format==="lines") return items.map(x=>stringify(x,0)).join("\n")+"\n";
  return stringify(items,o.indent===undefined?2:o.indent)+"\n";
}

const api={readText,encodeSJIS,encodeUTF8,Num,isObj,parseJSON,readJSON,findTables,getPath,pathLabel,typeName,
  jsonToTable,arrayFields,stringify,detectDelim,parseCSV,toCSV,tableToJSON,itemsToText,convertValue};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.JsonCsv=api;
})(this);
