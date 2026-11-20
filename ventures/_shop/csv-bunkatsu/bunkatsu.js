/* 大きな CSV の分割（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

function parseCSV(text){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const line=text.split("\n",1)[0];
  const d=line.split("\t").length>line.split(",").length?"\t":",";
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
function line(r,d){d=d||",";return r.map(v=>{v=v==null?"":String(v);return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}).join(d)+"\r\n";}
function toCSV(rows,d){return rows.map(r=>line(r,d)).join("");}
const enc=typeof TextEncoder!=="undefined"?new TextEncoder():null;
function bytes(s){return enc.encode(s).length;}

// ファイル名に使えない文字を置き換える
function safeName(s){
  s=String(s==null?"":s).normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").replace(/\s+/g," ").trim();
  if(s==="") s="（空欄）";
  if(s.length>60) s=s.slice(0,60);
  return s;
}
function pad(n,w){n=String(n);while(n.length<w)n="0"+n;return n;}

/*
 rows: 見出しを含む全行（header=true のとき rows[0] が見出し）
 o: {header:true, mode:"rows"|"size"|"col", n:10000, mb:2, col:0, base:"data", ascii:false, bom:true, delim:","}
 返り値: {parts:[{name, label, head, rows:[[...]] }], warns:[]}
*/
function split(rows,o){
  o=Object.assign({header:true,mode:"rows",n:10000,mb:2,col:0,base:"data",ascii:false,bom:true,delim:","},o||{});
  const warns=[];
  const head=o.header?(rows[0]||[]):null;
  const data=o.header?rows.slice(1):rows.slice();
  const base=safeName(o.base||"data");
  const groups=[];
  if(o.mode==="rows"){
    const n=Math.max(1,Math.floor(+o.n||0));
    for(let i=0;i<data.length;i+=n) groups.push({label:`${i+1}〜${Math.min(i+n,data.length)}行目`,rows:data.slice(i,i+n)});
  }else if(o.mode==="size"){
    const limit=Math.max(1,Math.floor((+o.mb||0)*1024*1024));
    const fixed=(o.bom?3:0)+(head?bytes(line(head,o.delim)):0);
    if(fixed>=limit) warns.push("見出しの行だけで上限の大きさを超えています。上限を大きくしてください");
    let cur=[],size=fixed,start=1,big=0;
    data.forEach((r,i)=>{
      const b=bytes(line(r,o.delim));
      if(cur.length&&size+b>limit){groups.push({label:`${start}〜${start+cur.length-1}行目`,rows:cur});start+=cur.length;cur=[];size=fixed;}
      if(fixed+b>limit) big++;
      cur.push(r);size+=b;
    });
    if(cur.length) groups.push({label:`${start}〜${start+cur.length-1}行目`,rows:cur});
    if(big) warns.push(`1行だけで上限を超える行が${big}行あります。その行は1行だけのファイルになり、上限を超えています`);
  }else{
    const ci=+o.col;
    const m=new Map();let short=0;
    data.forEach(r=>{
      if(r.length<=ci) short++;
      const v=r[ci]==null?"":String(r[ci]);
      const k=v.normalize("NFKC").trim();
      if(!m.has(k)) m.set(k,{label:v.trim()===""?"（空欄）":v.trim(),rows:[]});
      m.get(k).rows.push(r);
    });
    m.forEach(g=>groups.push(g));
    if(short) warns.push(`指定した列がない行が${short}行あります。「（空欄）」のファイルに入れました`);
    if(groups.length>300) warns.push(`ファイルが${groups.length}個になります。列の選び方を確認してください`);
  }
  const w=Math.max(3,String(groups.length).length);
  const used=new Set();
  const parts=groups.map((g,i)=>{
    let nm;
    if(o.mode==="col"&&!o.ascii) nm=`${base}_${safeName(g.label)}`;
    else nm=`${o.ascii?"part":base}_${pad(i+1,w)}`;
    let k=nm,c=2;while(used.has(k.toLowerCase())){k=nm+"("+c+")";c++;}
    used.add(k.toLowerCase());
    return {name:k+(o.delim==="\t"?".tsv":".csv"),label:g.label,head,rows:g.rows};
  });
  if(!data.length) warns.push("データの行がありません");
  return {parts,warns};
}
function partText(p,o){return (o&&o.bom===false?"":"﻿")+toCSV(p.head?[p.head].concat(p.rows):p.rows,(o&&o.delim)||",");}

/* ZIP（無圧縮・UTF-8 ファイル名） */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zip(files,date){
  date=date||new Date();
  const dt=((date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1))&0xFFFF;
  const dd=(((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate())&0xFFFF;
  const chunks=[],central=[];let off=0;
  files.forEach(f=>{
    const nm=enc.encode(f.name),data=typeof f.data==="string"?enc.encode(f.data):f.data;
    const crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
    h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);
    h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
    chunks.push(new Uint8Array(h.buffer),nm,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
    c.setUint16(12,dt,true);c.setUint16(14,dd,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
    c.setUint16(28,nm.length,true);c.setUint16(30,0,true);c.setUint16(32,0,true);c.setUint16(34,0,true);c.setUint16(36,0,true);c.setUint32(38,0,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),nm);
    off+=30+nm.length+data.length;
  });
  const cs=central.reduce((a,b)=>a+b.length,0);
  const e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
  const all=chunks.concat(central,[new Uint8Array(e.buffer)]);
  const out=new Uint8Array(all.reduce((a,b)=>a+b.length,0));let p=0;all.forEach(b=>{out.set(b,p);p+=b.length;});
  return out;
}

const api={parseCSV,toCSV,split,partText,zip,crc32,safeName};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Bunkatsu=api;
})(this);
