/* 列そろえ：取込形式テンプレート（ブラウザ内で完結。外部通信なし） */
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


/* ---------- CSV ---------- */
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
function cellQ(v,d,all){v=v==null?"":String(v);return (all||v.includes(d)||/["\r\n]/.test(v)||/^\s|\s$/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(header,rows,o){
  o=o||{};const d=o.delim||",",eol=o.eol==="lf"?"\n":"\r\n",all=!!o.quoteAll;
  const lines=(header?[header]:[]).concat(rows);
  return lines.map(r=>r.map(v=>cellQ(v,d,all)).join(d)+eol).join("");
}

/* ---------- 列名の照合（前後の空白・全角半角・大文字小文字・空白の数の違いは同じとみなす） ---------- */
function normKey(s){return String(s==null?"":s).normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();}
function headerIndex(header){
  const m=new Map();
  header.forEach((h,i)=>{const k=normKey(h);if(!m.has(k))m.set(k,i);});
  return m;
}
function findCol(header,name,idx){
  idx=idx||headerIndex(header);
  const k=normKey(name);
  return idx.has(k)?idx.get(k):-1;
}

/* ---------- 「文字や列をつなげる」の書き方：{列名} を値に置き換える。{{ と }} は波かっこそのもの ---------- */
function parseTpl(tpl){
  const parts=[];let i=0,lit="";tpl=String(tpl==null?"":tpl);
  while(i<tpl.length){
    const c=tpl[i];
    if(c==="{"&&tpl[i+1]==="{"){lit+="{";i+=2;continue;}
    if(c==="}"&&tpl[i+1]==="}"){lit+="}";i+=2;continue;}
    if(c==="{"){
      const j=tpl.indexOf("}",i+1);
      if(j<0){lit+=tpl.slice(i);break;}
      if(lit){parts.push({t:"s",v:lit});lit="";}
      parts.push({t:"c",name:tpl.slice(i+1,j)});i=j+1;continue;
    }
    lit+=c;i++;
  }
  if(lit) parts.push({t:"s",v:lit});
  return parts;
}

/* ---------- 設定 ---------- */
const TOOL_ID="genhayl-retsu-soroe";
function defaultOutput(){return {enc:"bom",delim:",",header:true,eol:"crlf",quoteAll:false,trim:false,skipEmpty:true};}
function defaultConfig(header){
  return {tool:TOOL_ID,version:1,name:"",columns:header.map(h=>({name:h,type:"col",src:h})),output:defaultOutput()};
}
function validateConfig(obj){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)) throw new Error("設定ファイルの形が正しくありません");
  if(obj.tool!==TOOL_ID) throw new Error("このツールで保存した設定ファイルではありません");
  if(!Array.isArray(obj.columns)) throw new Error("設定ファイルに列の一覧がありません");
  const cols=obj.columns.map((c,i)=>{
    if(!c||typeof c!=="object") throw new Error(`${i+1}番目の列の設定が正しくありません`);
    const type=["col","tpl","empty"].includes(c.type)?c.type:"col";
    const o={name:String(c.name==null?"":c.name),type};
    if(type==="col") o.src=String(c.src==null?"":c.src);
    if(type==="tpl") o.tpl=String(c.tpl==null?"":c.tpl);
    return o;
  });
  const out=Object.assign(defaultOutput(),obj.output&&typeof obj.output==="object"?obj.output:{});
  if(!["bom","utf8","sjis"].includes(out.enc)) out.enc="bom";
  if(![",","\t",";","|"].includes(out.delim)) out.delim=",";
  if(!["crlf","lf"].includes(out.eol)) out.eol="crlf";
  out.header=out.header!==false;out.quoteAll=!!out.quoteAll;out.trim=!!out.trim;out.skipEmpty=out.skipEmpty!==false;
  return {tool:TOOL_ID,version:1,name:String(obj.name||""),columns:cols,output:out};
}
function configText(cfg){return JSON.stringify(validateConfig(cfg),null,2)+"\n";}

/* 設定と入力の見出しを照らし合わせる。見つからない列名を返す */
function checkConfig(cfg,header){
  const idx=headerIndex(header);const missing=[];
  cfg.columns.forEach((c,i)=>{
    if(c.type==="col"){if(findCol(header,c.src,idx)<0) missing.push({out:i,name:c.src});}
    else if(c.type==="tpl"){for(const p of parseTpl(c.tpl)) if(p.t==="c"&&findCol(header,p.name,idx)<0) missing.push({out:i,name:p.name});}
  });
  return missing;
}

/* ---------- 変換 ---------- */
function apply(cfg,header,rows){
  const idx=headerIndex(header);const o=cfg.output||defaultOutput();const warn=[];
  const getters=cfg.columns.map(c=>{
    if(c.type==="empty") return ()=>"";
    if(c.type==="tpl"){
      const parts=parseTpl(c.tpl).map(p=>p.t==="s"?p:{t:"c",i:findCol(header,p.name,idx)});
      return r=>parts.map(p=>p.t==="s"?p.v:(p.i<0?"":(r[p.i]==null?"":r[p.i]))).join("");
    }
    const i=findCol(header,c.src,idx);
    return r=>i<0?"":(r[i]==null?"":r[i]);
  });
  const missing=checkConfig(cfg,header);
  if(missing.length) warn.push("入力にない列があり、空欄にしました："+[...new Set(missing.map(m=>m.name))].map(n=>"「"+n+"」").join("、"));
  let skipped=0;const out=[];
  for(const r of rows){
    if(o.skipEmpty&&r.every(v=>v==null||String(v).trim()==="")){skipped++;continue;}
    out.push(getters.map(g=>{let v=g(r);if(o.trim)v=String(v).replace(/^[\s　]+|[\s　]+$/g,"");return v;}));
  }
  if(skipped) warn.push(`中身がすべて空欄の行が ${skipped} 行あり、書き出していません`);
  const outHeader=cfg.columns.map(c=>c.name);
  const names=new Map();outHeader.forEach(n=>{const k=normKey(n);names.set(k,(names.get(k)||0)+1);});
  const dup=[...names].filter(([k,n])=>n>1&&k!=="");
  if(dup.length) warn.push("同じ名前の列が2つ以上あります："+dup.map(([k])=>"「"+k+"」").join("、"));
  if(outHeader.some(n=>String(n).trim()==="")&&o.header) warn.push("名前が空欄の列があります（見出しは空欄のまま書き出します）");
  return {header:outHeader,rows:out,warn,skipped};
}

/* 入力（バイト列）→ 見出しと行 */
function readTable(u8,o){
  o=o||{};const r=readText(u8);const d=o.delim&&o.delim!=="auto"?o.delim:detectDelim(r.text);
  const all=parseCSV(r.text,d);
  let header,rows;
  if(o.noHeader){const n=Math.max(0,...all.map(x=>x.length));header=Array.from({length:n},(_,i)=>"列"+(i+1));rows=all;}
  else{header=(all[0]||[]).map((h,i)=>h===""?"列"+(i+1):h);rows=all.slice(1);}
  return {header,rows,enc:r.enc,bom:r.bom,delim:d};
}

function encodeOut(text,enc){
  if(enc==="sjis") return encodeSJIS(text);
  return {bytes:encodeUTF8(text,enc==="bom"),bad:0};
}

const api={readText,encodeSJIS,encodeUTF8,encodeOut,detectDelim,parseCSV,toCSV,normKey,findCol,parseTpl,
  defaultConfig,defaultOutput,validateConfig,configText,checkConfig,apply,readTable,TOOL_ID};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Soroe=api;
})(this);
