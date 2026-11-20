/* 番号の抜け・重複チェック（ブラウザ内で完結。外部通信なし） */
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
  /* 空行は外すが、行番号は元のファイルのまま数えたいので line を残す */
  return {rows:rows.filter(r=>r.some(v=>v!=="")),delim:d};
}
function cell(v,d){v=v==null?"":String(v);return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(rows,d){return rows.map(r=>r.map(v=>cell(v,d)).join(d)+"\r\n").join("");}
function encodeUTF8(text,bom){
  const b=new TextEncoder().encode(text);
  if(!bom) return b;
  const o=new Uint8Array(b.length+3);o.set([0xEF,0xBB,0xBF]);o.set(b,3);return o;
}

/* ---------- 番号を「頭の文字・数字・後ろの文字」に分ける ---------- */
/* 最後に出てくる数字の並びを連番の部分とみなす。例：INV-2026-0012 → 頭「INV-2026-」数字「0012」 */
function splitNo(v){
  const s=String(v==null?"":v).normalize("NFKC").replace(/[​-‍﻿]/g,"").trim();
  if(!s) return {empty:true};
  const m=s.match(/^(.*?)(\d+)(\D*)$/);
  if(!m) return {bad:true,text:s,why:"数字が含まれていない"};
  if(m[2].length>15) return {bad:true,text:s,why:"数字が16桁以上ある（このツールの対象外）"};
  return {text:s,prefix:m[1],digits:m[2],suffix:m[3],n:Number(m[2]),width:m[2].length};
}

/* 列の見出しから、番号の列らしいものを選ぶ */
function guessCol(header){
  let best=-1,score=0;
  (header||[]).forEach((h,i)=>{
    const n=String(h||"").normalize("NFKC").toLowerCase();
    let s=0;
    if(/請求|伝票|注文|受注|発注|領収|納品|見積|invoice|order/.test(n)) s+=2;
    if(/番号|no\.?$|^no|number|id$|コード|code/.test(n)) s+=2;
    if(/電話|郵便|tel|zip|jan/.test(n)) s-=5;
    if(s>score){score=s;best=i;}
  });
  return best;
}

/* 数字を幅 w の0埋めで書く */
function pad(n,w){const s=String(n);return s.length>=w?s:"0".repeat(w-s.length)+s;}

/* 範囲を「A〜B（N件）」の形にする */
function rangeText(g,a,b){
  const f=x=>g.prefix+pad(x,g.width)+g.suffix;
  return a===b?f(a):`${f(a)} 〜 ${f(b)}`;
}

/*
 * 調べる
 * rows: 2次元配列, header: 1行目が見出しか, col: 列番号
 * opt: {split:"prefix"|"none", start:number|null, end:number|null, order:bool, maxList:number}
 */
function check(rows,header,col,opt){
  opt=opt||{};
  const maxList=opt.maxList||100000;
  const startRow=header?1:0;
  const groups=new Map();   // key → {key,prefix,suffix,items:[{n,digits,row,text}]}
  const issues=[];          // {kind,group,value,row,note}
  let total=0,empty=0;
  for(let r=startRow;r<rows.length;r++){
    const raw=rows[r][col];
    const p=splitNo(raw);
    if(p.empty){empty++;continue;}
    total++;
    if(p.bad){issues.push({kind:"読めない",group:"",value:raw,row:r+1,note:p.why});continue;}
    let key,prefix,suffix;
    if(opt.split==="none"){key="";prefix="";suffix="";}
    else{prefix=p.prefix;suffix=p.suffix;key=(prefix.toUpperCase()+"\u0000"+suffix.toUpperCase());}
    if(!groups.has(key)) groups.set(key,{key,prefix,suffix,items:[]});
    groups.get(key).items.push({n:p.n,digits:p.digits,row:r+1,text:String(raw)});
  }
  const glist=[];const missing=[];let missingTotal=0,truncated=false;
  let dupTotal=0,widthTotal=0,orderTotal=0;
  const big=[...groups.values()].reduce((a,g)=>Math.max(a,g.items.length),0);
  const isFew=g=>groups.size>1&&g.items.length<=2&&big>=10;
  groups.forEach(g=>{
    /* 多数派の桁数 */
    const wc={};g.items.forEach(it=>{it.width=it.digits.length;wc[it.width]=(wc[it.width]||0)+1;});
    let width=0,best=-1;Object.entries(wc).forEach(([w,c])=>{w=+w;if(c>best||(c===best&&w>width)){best=c;width=w;}});
    g.width=width;
    const name=opt.split==="none"?"（すべて）":(!g.prefix&&!g.suffix?"数字だけ":g.prefix+"□".repeat(Math.min(width,8))+g.suffix);
    g.name=name;
    /* 桁数のずれ：先頭に0のある書き方で、多数派と桁数が違うもの（0なしの値は、番号が大きくなって桁が増えただけの場合があるので、幅より短いときだけ） */
    /* 0埋めの書き方をしている系列だけ調べる（0埋めしていない番号は、桁が増えるのが普通なので） */
    const padded=g.items.some(it=>it.digits.length>1&&it.digits[0]==="0");
    if(padded) g.items.forEach(it=>{
      if(it.width!==width){
        const shorter=it.width<width;
        const zeroLead=it.digits.length>1&&it.digits[0]==="0";
        if(shorter||zeroLead){
          widthTotal++;
          issues.push({kind:"桁数違い",group:name,value:it.text,row:it.row,note:`ほかの多くは数字${width}桁（この値は${it.width}桁）`});
        }
      }
    });
    /* 重複 */
    const byN=new Map();
    g.items.forEach(it=>{if(!byN.has(it.n)) byN.set(it.n,[]);byN.get(it.n).push(it);});
    let dupG=0;
    byN.forEach(list=>{
      if(list.length<2) return;
      dupG+=list.length-1;
      const rowsTxt=list.map(x=>x.row).join("・");
      const sameText=list.every(x=>x.text.normalize("NFKC").trim()===list[0].text.normalize("NFKC").trim());
      list.forEach(it=>issues.push({kind:"重複",group:name,value:it.text,row:it.row,note:`${list.length}回出てくる（${rowsTxt}行目）`+(sameText?"":"。書き方が違うが同じ番号")}));
    });
    dupTotal+=dupG;
    /* 並び順 */
    let orderG=0;
    if(opt.order){
      let mx=-Infinity,mxRow=0;
      g.items.forEach(it=>{
        if(it.n<mx){orderG++;issues.push({kind:"並び順",group:name,value:it.text,row:it.row,note:`前の行（${mxRow}行目）にもっと大きい番号がある`});}
        else if(it.n>mx){mx=it.n;mxRow=it.row;}
      });
    }
    orderTotal+=orderG;
    /* 抜け */
    const ns=[...byN.keys()].sort((a,b)=>a-b);
    /* 範囲の指定は、件数の少ない系列（打ち間違いの可能性）には使わない */
    const few=isFew(g);
    const lo=(!few&&opt.start!=null&&isFinite(opt.start))?Math.min(opt.start,ns[0]):ns[0];
    const hi=(!few&&opt.end!=null&&isFinite(opt.end))?Math.max(opt.end,ns[ns.length-1]):ns[ns.length-1];
    const gaps=[];let missG=0;
    let prev=lo-1;
    const pushGap=(a,b)=>{if(b<a) return;gaps.push([a,b]);missG+=b-a+1;};
    const firstRow=new Map();g.items.forEach(it=>{if(!firstRow.has(it.n)) firstRow.set(it.n,it);});
    ns.forEach(n=>{
      if(n>prev+1){
        pushGap(prev+1,n-1);
        /* 1,000件以上の飛びは、打ち間違いのことが多いので知らせる（範囲の指定で始まりを決めた場合の先頭は除く） */
        if(n-prev-1>=1000&&prev!==lo-1){const it=firstRow.get(n);issues.push({kind:"大きな飛び",group:name,value:it.text,row:it.row,note:`ひとつ前の番号から ${(n-prev-1).toLocaleString("ja-JP")} 件とんでいる。打ち間違いの可能性`});}
      }
      prev=Math.max(prev,n);
    });
    if(hi>prev) pushGap(prev+1,hi);
    gaps.forEach(([a,b])=>{
      missing.push({group:name,from:a,to:b,count:b-a+1,text:rangeText(g,a,b)});
    });
    missingTotal+=missG;
    glist.push({name,prefix:g.prefix,suffix:g.suffix,count:g.items.length,min:ns[0],max:ns[ns.length-1],minText:g.prefix+pad(ns[0],width)+g.suffix,maxText:g.prefix+pad(ns[ns.length-1],width)+g.suffix,width,widths:wc,missing:missG,gaps:gaps.length,dup:dupG,order:orderG,_g:g});
  });
  /* 件数の少ない系列（打ち間違いの可能性） */
  glist.forEach(g=>{
    g.few=isFew(g._g);
    if(g.few) g._g.items.forEach(it=>issues.push({kind:"少ない系列",group:g.name,value:it.text,row:it.row,note:`この書き出しの番号は${g.count}件だけ。打ち間違いの可能性`}));
  });
  /* 抜け番号を1件ずつ並べた一覧（多すぎるときは打ち切る） */
  const missingEach=[];
  for(const m of missing){
    const g=glist.find(x=>x.name===m.group)._g;
    for(let n=m.from;n<=m.to;n++){
      if(missingEach.length>=maxList){truncated=true;break;}
      missingEach.push({group:m.group,value:g.prefix+pad(n,g.width)+g.suffix});
    }
    if(truncated) break;
  }
  glist.sort((a,b)=>b.count-a.count);
  glist.forEach(g=>delete g._g);
  issues.sort((a,b)=>a.row-b.row||a.kind.localeCompare(b.kind));
  return {total,empty,groups:glist,missing,missingEach,missingTotal,truncated,issues,
    cnt:{dup:dupTotal,width:widthTotal,bad:issues.filter(x=>x.kind==="読めない").length,order:orderTotal,few:issues.filter(x=>x.kind==="少ない系列").length,jump:issues.filter(x=>x.kind==="大きな飛び").length}};
}

/* 元の CSV の右端に「チェック結果」の列を足す */
function annotate(rows,header,res,colName){
  const byRow=new Map();
  res.issues.forEach(x=>{if(!byRow.has(x.row)) byRow.set(x.row,new Set());byRow.get(x.row).add(x.kind);});
  const ncol=rows.reduce((a,r)=>Math.max(a,r.length),0);
  return rows.map((r,i)=>{
    const o=r.slice();while(o.length<ncol) o.push("");
    if(header&&i===0){o.push(colName||"番号チェック");return o;}
    const s=byRow.get(i+1);o.push(s?[...s].join("・"):"");return o;
  });
}

const api={readText,parseCSV,toCSV,encodeUTF8,splitNo,guessCol,check,annotate,pad};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Renban=api;
})(this);
