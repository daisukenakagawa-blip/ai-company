/* 壊れた CSV の点検と修復（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

/* ---------- 読み込み（UTF-8 / Shift_JIS を判定） ---------- */
function tryDecode(u8,e){try{return new TextDecoder(e,{fatal:true}).decode(u8);}catch(_){return null;}}
function readText(u8){
  if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return {text:new TextDecoder("utf-8").decode(u8.subarray(3)),enc:"utf-8",bom:true};
  const t=tryDecode(u8,"utf-8");
  if(t!==null) return {text:t,enc:"utf-8",bom:false};
  return {text:new TextDecoder("shift_jis").decode(u8),enc:"shift_jis",bom:false};
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



/* ---------- 書き出し ---------- */
function cell(v,d){v=v==null?"":String(v);return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(rows,d){return rows.map(r=>r.map(v=>cell(v,d)).join(d)+"\r\n").join("");}

/* ---------- 物理行・改行コード・制御文字 ---------- */
function splitLines(text){return text.split(/\r\n|\n|\r/);}
function scan(text){
  const eol={crlf:0,lf:0,cr:0};
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);
    if(c===13){if(text.charCodeAt(i+1)===10){eol.crlf++;i++;}else eol.cr++;}
    else if(c===10) eol.lf++;
  }
  const nul=(text.match(/\u0000/g)||[]).length;
  const ctrl=(text.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g)||[]).length;
  const repl=(text.match(/�/g)||[]).length;
  return {eol,nul,ctrl,repl};
}

/* ---------- 区切り文字の推定（行ごとの個数がそろうもの） ---------- */
const DELIMS=[",","\t",";","|"];
function countOutsideQuotes(line,d){let n=0,q=false;for(const c of line){if(c==='"')q=!q;else if(c===d&&!q)n++;}return n;}
function detectDelim(text){
  const lines=splitLines(text).filter(l=>l!=="").slice(0,100);
  let best=",",bestScore=-1;
  for(const d of DELIMS){
    const freq=new Map();
    for(const l of lines){const n=countOutsideQuotes(l,d);if(n>0)freq.set(n,(freq.get(n)||0)+1);}
    let top=0;for(const v of freq.values())top=Math.max(top,v);
    if(top>bestScore){bestScore=top;best=d;}
  }
  return best;
}

/* ---------- 読み取り（行番号と崩れの印を残す） ---------- */
function parseRecords(text,d){
  const recs=[];let row=[],f="",inQ=false,afterClose=false,line=1,start=1,flags=new Set(),blank=0,quoteLine=0;
  const end=()=>{
    row.push(f);
    if(row.length===1&&row[0]===""&&!flags.size&&!afterClose) blank++;
    else recs.push({fields:row,start,end:line,flags,quoteLine});
    row=[];f="";afterClose=false;flags=new Set();
  };
  let i=0;
  while(i<text.length){
    const c=text[i];
    if(inQ){
      if(c==='"'){if(text[i+1]==='"'){f+='"';i+=2;continue;}inQ=false;afterClose=true;i++;continue;}
      if(c==="\r"||c==="\n"){f+="\n";flags.add("multiline");i+=(c==="\r"&&text[i+1]==="\n")?2:1;line++;continue;}
      f+=c;i++;continue;
    }
    if(c==='"'){
      if(f===""&&!afterClose){inQ=true;quoteLine=line;i++;continue;}
      flags.add("stray");f+=c;i++;continue;
    }
    if(c===d){row.push(f);f="";afterClose=false;i++;continue;}
    if(c==="\r"||c==="\n"){end();i+=(c==="\r"&&text[i+1]==="\n")?2:1;line++;start=line;continue;}
    if(afterClose) flags.add("after");
    f+=c;i++;
  }
  if(inQ) flags.add("unclosed");
  if(f!==""||row.length||flags.size) end();
  return {recs,blank};
}
/* 1行だけを、閉じていない「"」は文字として読む */
function reparseLine(line,d){
  const r=parseRecords(line,d).recs[0];
  if(!r) return {fields:[""],flags:new Set()};
  if(!r.flags.has("unclosed")&&!r.flags.has("multiline")) return {fields:r.fields,flags:r.flags};
  return {flags:new Set(),fields:line.split(d).map(v=>{
    if(v.length>=2&&v[0]==='"'&&v[v.length-1]==='"') return v.slice(1,-1).replace(/""/g,'"');
    if(v[0]==='"'&&v.indexOf('"',1)<0) return v.slice(1);
    return v;
  })};
}

function mode(arr){const m=new Map();let best=0,bv=0;for(const v of arr){const n=(m.get(v)||0)+1;m.set(v,n);if(n>best||(n===best&&v>bv)){best=n;bv=v;}}return bv;}

const TYPE={
  unclosed:"引用符「\"」の閉じ忘れ",
  long:"列が多い",
  short:"列が足りない",
  trailing:"行末の余分な区切り",
  multiline:"セルの中の改行",
  quote:"引用符「\"」の位置がおかしい",
  ctrl:"見えない制御文字",
  head:"見出しの問題",
};
const SEVERE=new Set(["unclosed","long","short"]);

/* ---------- 点検と修復 ----------
 opts: {header, delim("auto"|","…), split, trim, pad, long:"review"|"join"|"keep", newline:"keep"|"space", ctrl} */
function check(text,opts){
  opts=Object.assign({header:true,delim:"auto",split:true,trim:true,pad:true,long:"review",newline:"keep",ctrl:true},opts||{});
  const d=opts.delim==="auto"?detectDelim(text):opts.delim;
  const sc=scan(text);
  const lines=splitLines(text);
  const {recs,blank}=parseRecords(text,d);
  const issues=[];
  const add=(type,start,end,detail,action)=>issues.push({type,start,end,detail,action,severe:SEVERE.has(type)});
  const hist=new Map();recs.forEach(r=>hist.set(r.fields.length,(hist.get(r.fields.length)||0)+1));
  if(!recs.length) return {delim:d,scan:sc,blank,expected:0,hist,issues,out:[],review:[],stats:{in:0,out:0,review:0},firstBroken:null};
  const expected=opts.header?recs[0].fields.length:mode(recs.map(r=>r.fields.length));
  const out=[],review=[];
  const preview=v=>{v=v.join(d).replace(/\n/g,"⏎");return v.length>60?v.slice(0,60)+"…":v;};
  const CTRL=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function fixRow(fields,start,end,flags){
    fields=fields.slice();
    if(opts.ctrl){let n=0;fields=fields.map(v=>v.replace(CTRL,()=>{n++;return "";}));if(n)add("ctrl",start,end,`${n}文字`,"取り除いた");}
    if(fields.some(v=>v.includes("\n"))){
      if(opts.newline==="space"){fields=fields.map(v=>v.replace(/\n+/g," "));add("multiline",start,end,preview(fields),"空白に置き換えた");}
      else add("multiline",start,end,preview(fields),"そのまま（正しい書き方。Excel では1つのセルに入ります）");
    }
    if(flags&&(flags.has("stray")||flags.has("after"))) add("quote",start,end,preview(fields),"そのまま（文字として残した）");
    if(fields.length>expected){
      const extra=fields.slice(expected);
      if(opts.trim&&extra.every(v=>v==="")){add("trailing",start,end,`${fields.length}列 → ${expected}列`,"空の列を削除した");fields=fields.slice(0,expected);}
      else if(opts.long==="join"){add("long",start,end,`${fields.length}列（${expected}列のはず）：${preview(fields)}`,"はみ出した分を最後の列につなげた");fields=fields.slice(0,expected-1).concat([fields.slice(expected-1).join(d)]);}
      else if(opts.long==="keep"){add("long",start,end,`${fields.length}列（${expected}列のはず）：${preview(fields)}`,"そのまま残した");}
      else{add("long",start,end,`${fields.length}列（${expected}列のはず）：${preview(fields)}`,"要確認ファイルに分けた");review.push([lineLabel(start,end)].concat(fields));return;}
    }else if(fields.length<expected){
      if(opts.pad){add("short",start,end,`${fields.length}列（${expected}列のはず）：${preview(fields)}`,"空欄で補った");while(fields.length<expected)fields.push("");}
      else{add("short",start,end,`${fields.length}列（${expected}列のはず）：${preview(fields)}`,"要確認ファイルに分けた");review.push([lineLabel(start,end)].concat(fields));return;}
    }
    out.push(fields);
  }
  const lineLabel=(s,e)=>s===e?String(s):`${s}-${e}`;

  // 見出し
  let from=0;
  if(opts.header){
    let h=recs[0].fields.slice();
    if(opts.ctrl) h=h.map(v=>v.replace(CTRL,""));
    const seen=new Map();const empty=[],dup=[];
    h.forEach((v,i)=>{const k=v.trim();if(k==="")empty.push(i+1);else if(seen.has(k))dup.push(k);else seen.set(k,i);});
    if(empty.length) add("head",recs[0].start,recs[0].end,`見出しが空欄の列：${empty.map(n=>n+"列目").join("、")}`,"そのまま");
    if(dup.length) add("head",recs[0].start,recs[0].end,`同じ名前の見出し：${[...new Set(dup)].join("、")}`,"そのまま");
    if(recs[0].flags.has("unclosed")) add("unclosed",recs[0].start,recs[0].end,"見出しの行で「\"」が閉じていません","要確認（見出しを直してから読み込み直してください）");
    out.push(h);from=1;
  }
  for(let k=from;k<recs.length;k++){
    const r=recs[k];
    const broken=r.flags.has("unclosed")||(r.flags.has("multiline")&&r.fields.length!==expected);
    if(broken&&opts.split&&r.end>r.start){
      const subs=lines.slice(r.start-1,r.end).map((l,j)=>Object.assign(reparseLine(l,d),{line:r.start+j})).filter(s=>!(s.fields.length===1&&s.fields[0]===""));
      const okN=subs.filter(s=>s.fields.length===expected).length;
      if(r.flags.has("unclosed")||okN*2>=subs.length){
        const last=subs.length?subs[subs.length-1].line:r.end;
        add("unclosed",r.quoteLine||r.start,last,`${r.quoteLine||r.start}行目で始まった「"」が閉じず、${last-r.start+1}行が1行につながっていました`,`1行ずつ読み直した（${subs.length}行）`);
        subs.forEach(s=>fixRow(s.fields,s.line,s.line,s.flags));
        continue;
      }
    }
    if(r.flags.has("unclosed")){
      add("unclosed",r.quoteLine||r.start,r.end,`${r.quoteLine||r.start}行目の「"」が閉じていません：${preview(r.fields)}`,"要確認ファイルに分けた");
      review.push([lineLabel(r.start,r.end)].concat(r.fields));continue;
    }
    fixRow(r.fields,r.start,r.end,r.flags);
  }
  if(opts.long==="keep"){
    const w=out.reduce((m,r)=>Math.max(m,r.length),0);
    if(opts.header) for(let i=out[0].length;i<w;i++) out[0].push("列"+(i+1));
  }
  if(review.length){
    const w=review.reduce((m,r)=>Math.max(m,r.length),0);
    const head=["元の行番号"];for(let i=1;i<w;i++)head.push(opts.header&&recs[0].fields[i-1]!=null?recs[0].fields[i-1]:"列"+i);
    review.unshift(head);
  }
  issues.sort((a,b)=>a.start-b.start);
  const sev=issues.filter(x=>x.severe);
  const counts={};issues.forEach(x=>counts[x.type]=(counts[x.type]||0)+1);
  return {delim:d,scan:sc,blank,expected,hist,issues,counts,out,review,
    firstBroken:sev.length?sev[0].start:null,
    stats:{out:out.length-(opts.header?1:0),review:review.length?review.length-1:0,lines:lines.length}};
}
function issuesCSV(issues){
  return [["行番号","種類","内容","対応"]].concat(issues.map(x=>[x.start===x.end?String(x.start):`${x.start}-${x.end}`,TYPE[x.type],x.detail,x.action]));
}

const api={readText,toCSV,encodeSJIS,encodeUTF8,detectDelim,parseRecords,reparseLine,check,issuesCSV,TYPE,scan};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Tenken=api;
})(this);
