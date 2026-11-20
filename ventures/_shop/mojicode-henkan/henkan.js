/* 文字コード・改行コードの変換（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";
const enc8=new TextEncoder();

/* ---------- Shift_JIS（Windows で使われる CP932 の範囲）の変換表をブラウザの標準機能から作る ---------- */
let SJ=null; // {map: Map(cp -> [b1,b2] or [b]), env:Set(cp)}
function sjisTable(){
  if(SJ) return SJ;
  const dec=new TextDecoder("shift_jis");
  const map=new Map(),env=new Set();
  for(let lead=0x81;lead<=0xFC;lead++){
    if(lead>=0xA0&&lead<=0xDF) continue;
    if(lead>=0xF0&&lead<=0xF9) continue;            // 外字（ユーザー定義）領域は使わない
    if(lead===0xED||lead===0xEE) continue;           // NEC選定IBM拡張（同じ文字が 0xFA〜0xFC にある）
    for(let tr=0x40;tr<=0xFC;tr++){
      if(tr===0x7F) continue;
      const s=dec.decode(new Uint8Array([lead,tr]));
      if(s.length!==1||s==="�") continue;
      const cp=s.codePointAt(0);
      if(!map.has(cp)){
        map.set(cp,[lead,tr]);
        if(lead===0x87||lead>=0xFA) env.add(cp);    // NEC特殊文字（①・㈱ など）と IBM拡張漢字（髙・﨑 など）
      }
    }
  }
  SJ={map,env};
  return SJ;
}
function sjisBytes(cp){
  if(cp<0x80) return [cp];
  if(cp>=0xFF61&&cp<=0xFF9F) return [cp-0xFF61+0xA1];
  if(cp===0xA5) return [0x5C];
  if(cp===0x203E) return [0x7E];
  return sjisTable().map.get(cp)||null;
}

/* ---------- 文字コードの判定 ---------- */
function score(t){
  let jp=0,hw=0,bad=0,ctl=0;
  for(const ch of t){
    const c=ch.codePointAt(0);
    if((c>=0x3041&&c<=0x30FA)||(c>=0x4E00&&c<=0x9FFF)||(c>=0xFF01&&c<=0xFF5E)||(c>=0x3000&&c<=0x303F)) jp++;
    else if(c>=0xFF61&&c<=0xFF9F) hw++;
    else if(c===0xFFFD) bad++;
    else if(c<0x20&&c!==9&&c!==10&&c!==13) ctl++;
  }
  return jp-2*hw-10*bad-5*ctl;
}
function tryDecode(u8,e){try{return new TextDecoder(e,{fatal:true}).decode(u8);}catch(_){return null;}}
function detect(u8){
  if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return {enc:"utf-8",bom:true};
  if(u8.length>=2&&u8[0]===0xFF&&u8[1]===0xFE) return {enc:"utf-16le",bom:true};
  if(u8.length>=2&&u8[0]===0xFE&&u8[1]===0xFF) return {enc:"utf-16be",bom:true};
  let ascii=true;for(let i=0;i<u8.length;i++){if(u8[i]>=0x80){ascii=false;break;}}
  if(ascii) return {enc:"utf-8",bom:false,ascii:true};
  if(tryDecode(u8,"utf-8")!==null) return {enc:"utf-8",bom:false};
  const cands=["shift_jis","euc-jp"].map(e=>{
    const ok=tryDecode(u8,e);
    const t=ok!==null?ok:new TextDecoder(e).decode(u8);
    return {enc:e,s:score(t)+(ok!==null?1000:0)};
  });
  cands.sort((a,b)=>b.s-a.s);
  return {enc:cands[0].enc,bom:false,guess:true};
}
const ENC_NAME={"utf-8":"UTF-8","shift_jis":"Shift_JIS","euc-jp":"EUC-JP","utf-16le":"UTF-16（LE）","utf-16be":"UTF-16（BE）"};

/* 読み込み：enc を省略すると自動判定 */
function read(u8,enc){
  const d=detect(u8);
  const e=enc&&enc!=="auto"?enc:d.enc;
  let bom=false;
  if(e==="utf-8"&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) bom=true;
  if(e==="utf-16le"&&u8[0]===0xFF&&u8[1]===0xFE) bom=true;
  if(e==="utf-16be"&&u8[0]===0xFE&&u8[1]===0xFF) bom=true;
  const text=new TextDecoder(e).decode(u8);       // BOM は自動で取り除かれる
  let broken=0;for(let i=0;i<text.length;i++) if(text.charCodeAt(i)===0xFFFD) broken++;
  return {text,enc:e,detected:d.enc,guess:!!d.guess,ascii:!!d.ascii,bom,broken,eol:eolCount(text)};
}
function eolCount(t){
  let crlf=0,lf=0,cr=0;
  for(let i=0;i<t.length;i++){
    const c=t.charCodeAt(i);
    if(c===13){ if(t.charCodeAt(i+1)===10){crlf++;i++;} else cr++; }
    else if(c===10) lf++;
  }
  return {crlf,lf,cr};
}
function eolLabel(e){
  const a=[];if(e.crlf)a.push("CRLF");if(e.lf)a.push("LF");if(e.cr)a.push("CR");
  if(!a.length) return "改行なし";
  return a.length>1?"混在（"+a.join("・")+"）":a[0];
}

/* ---------- 書き出し前の置き換え ---------- */
// Mac・Linux・Web から来やすく、Windows の Shift_JIS にない記号 → 見た目の近い文字
const COMMON=[
  [0x301C,0xFF5E,"〜（波ダッシュ）→ ～"],
  [0x2016,0x2225,"‖ → ∥"],
  [0x2212,0xFF0D,"−（マイナス）→ －"],
  [0x00A2,0xFFE0,"¢ → ￠"],
  [0x00A3,0xFFE1,"£ → ￡"],
  [0x00AC,0xFFE2,"¬ → ￢"],
  [0x2014,0x2015,"—（ダッシュ）→ ―"],
  [0x00A0,0x0020,"改行しない空白 → 半角空白"]
];
const REMOVE=/[​‌‍⁠﻿︀-️]|\uDB40[\uDD00-\uDDEF]/g; // 幅のない文字・異体字セレクタ
const COMBINE=/[^゙゚̀-ͯ][゙゚̀-ͯ]+/g;

/*
 o: {out:"sjis"|"utf8", bom:true, eol:"keep"|"crlf"|"lf", nfc:true, common:true, repl:"?", maxList:100000}
 返り値: {bytes:Uint8Array, bad:[{line,pos,ch,cp,ctx}], badCount, env:[...], envCount, fixes:{label:count}, lines}
*/
function convert(text,o){
  o=Object.assign({out:"sjis",bom:true,eol:"keep",nfc:true,common:true,repl:"?",maxList:100000},o||{});
  const fixes={};
  const add=(k,n)=>{if(n) fixes[k]=(fixes[k]||0)+n;};
  if(o.nfc){
    let n=0;text=text.replace(COMBINE,m=>{const r=m.normalize("NFC");if(r!==m)n++;return r;});
    add("分かれた濁点・半濁点を1文字に",n);
  }
  if(o.eol==="crlf"){ const b=text; text=text.replace(/\r\n|\r|\n/g,"\r\n"); if(b!==text) add("改行を CRLF に",1); }
  else if(o.eol==="lf"){ const b=text; text=text.replace(/\r\n|\r/g,"\n"); if(b!==text) add("改行を LF に",1); }
  if(o.out!=="sjis"){
    const body=enc8.encode(text);
    if(!o.bom) return {bytes:body,bad:[],badCount:0,env:[],envCount:0,fixes,text};
    const u=new Uint8Array(body.length+3);u.set([0xEF,0xBB,0xBF]);u.set(body,3);
    return {bytes:u,bad:[],badCount:0,env:[],envCount:0,fixes,text};
  }
  if(o.common){
    for(const [from,to,label] of COMMON){
      const f=String.fromCharCode(from);let n=0,i=-1;
      while((i=text.indexOf(f,i+1))!==-1) n++;
      if(n){ text=text.split(f).join(String.fromCharCode(to)); add(label,n); }
    }
    let n=0;text=text.replace(REMOVE,()=>{n++;return "";});
    add("幅のない文字・異体字セレクタを削除",n);
  }
  let rb=[];
  if(o.repl){ for(const ch of o.repl){ const b=sjisBytes(ch.codePointAt(0)); if(b) rb=rb.concat(b); } }
  const {env:ENV}=sjisTable();
  const out=new Uint8Array(text.length*2+8);let p=0;
  const bad=[],env=[];let badCount=0,envCount=0,line=1,ls=0,col=0;
  const ctx=i=>{
    let e=text.indexOf("\n",i);if(e<0)e=text.length;
    const s=Math.max(ls,i-12),t=Math.min(e,i+13);
    return (s>ls?"…":"")+text.slice(s,t).replace(/[\r\n]/g,"")+(t<e?"…":"");
  };
  for(let i=0;i<text.length;){
    const cp=text.codePointAt(i),w=cp>0xFFFF?2:1;
    col++;
    const b=sjisBytes(cp);
    if(b===null){
      badCount++;
      if(bad.length<o.maxList) bad.push({line,pos:col,ch:String.fromCodePoint(cp),cp,ctx:ctx(i)});
      for(const x of rb) out[p++]=x;
    }else{
      if(ENV.has(cp)){envCount++;if(env.length<o.maxList) env.push({line,pos:col,ch:String.fromCodePoint(cp),cp,ctx:ctx(i)});}
      for(const x of b) out[p++]=x;
    }
    if(cp===10||(cp===13&&text.charCodeAt(i+1)!==10)){line++;ls=i+w;col=0;}
    i+=w;
  }
  return {bytes:out.slice(0,p),bad,badCount,env,envCount,fixes,text};
}
function hex(cp){let h=cp.toString(16).toUpperCase();while(h.length<4)h="0"+h;return "U+"+h;}

/* ファイル名：拡張子の前に印を付ける */
function outName(name,o){
  const m=/^(.*?)(\.[^.]*)?$/.exec(name||"file.csv");
  const base=m[1]||"file",ext=m[2]||".csv";
  if(!o||!o.suffix) return base+ext;
  return base+"_"+(o.out==="sjis"?"sjis":"utf8")+ext;
}

/* ZIP（無圧縮・UTF-8 ファイル名） */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zip(files,date){
  date=date||new Date();
  const dt=((date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1))&0xFFFF;
  const dd=(((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate())&0xFFFF;
  const chunks=[],central=[];let off=0;
  files.forEach(f=>{
    const nm=enc8.encode(f.name),data=typeof f.data==="string"?enc8.encode(f.data):f.data;
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

const api={detect,read,convert,sjisBytes,sjisTable,eolCount,eolLabel,outName,hex,zip,ENC_NAME};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Henkan=api;
})(this);
