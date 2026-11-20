/* 複数 CSV の結合（ブラウザ内で完結。外部通信なし） */
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
function toCSV(rows){return rows.map(r=>r.map(v=>{v=v==null?"":String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(",")).join("\r\n")+"\r\n";}

// 見出しの比較用キー（前後の空白、全角半角、空白の数の違いは同じとみなす）
function hkey(h){return String(h==null?"":h).normalize("NFKC").replace(/\s+/g," ").trim();}

/*
 files: [{name, rows:[[...]]}]  rows[0] は見出し（header=true のとき）
 o: {header:true, mode:"union"|"common", srcCol:"first"|"last"|"none", srcName:"元のファイル", dedupe:false, skipSameHead:true}
 返り値: {head, rows:[[...]], info:[{name,rows,cols,missing:[],extra:[]}], warns:[], dupRemoved, headRowsRemoved}
*/
function merge(files,o){
  o=Object.assign({header:true,mode:"union",srcCol:"first",srcName:"元のファイル",dedupe:false,skipSameHead:true},o||{});
  const warns=[],info=[];
  let cols=[],allCols=[];    // {key,name}
  let head,data=[];
  if(o.header){
    // 列の一覧（初めて出てきた順）
    const seen=new Map();
    files.forEach(f=>{
      const h=f.rows[0]||[];
      const inFile=new Set();
      h.forEach((name,i)=>{
        let k=hkey(name);
        if(k==="") k="（見出しなし"+(i+1)+"列目）";
        if(inFile.has(k)){warns.push(`${f.name}：見出し「${k}」が2回あります。2つ目以降は「${k}(2)」のように別の列として扱います`);let n=2;while(inFile.has(k+"("+n+")"))n++;k=k+"("+n+")";}
        inFile.add(k);
        if(!seen.has(k)){seen.set(k,{key:k,name:String(name).trim()||k,count:0});}
        seen.get(k).count++;
      });
    });
    allCols=[...seen.values()];cols=allCols.slice();
    if(o.mode==="common") cols=cols.filter(c=>c.count===files.length);
    const colKeys=cols.map(c=>c.key);
    files.forEach(f=>{
      const h=f.rows[0]||[];
      const idx=new Map();const inFile=new Set();
      h.forEach((name,i)=>{let k=hkey(name);if(k==="")k="（見出しなし"+(i+1)+"列目）";if(inFile.has(k)){let n=2;while(inFile.has(k+"("+n+")"))n++;k=k+"("+n+")";}inFile.add(k);idx.set(k,i);});
      const missing=colKeys.filter(k=>!idx.has(k));
      const extra=[...idx.keys()].filter(k=>!colKeys.includes(k));
      let n=0,headRep=0,longRows=0;
      const hk=h.map(hkey).join("\u0001");
      for(let r=1;r<f.rows.length;r++){
        const row=f.rows[r];
        if(o.skipSameHead&&row.map(hkey).join("\u0001")===hk){headRep++;continue;}
        if(row.length>h.length&&row.slice(h.length).some(v=>v!=="")) longRows++;
        const out=colKeys.map(k=>idx.has(k)?(row[idx.get(k)]==null?"":row[idx.get(k)]):"");
        data.push({src:f.name,line:r+1,v:out});n++;
      }
      if(headRep) warns.push(`${f.name}：途中に見出しと同じ行が${headRep}行あったため、外しました`);
      if(longRows) warns.push(`${f.name}：見出しより列の多い行が${longRows}行あります。はみ出した値は結合に入っていません`);
      info.push({name:f.name,rows:n,cols:h.length,missing:missing.map(k=>cols.find(c=>c.key===k).name),extra:extra});
    });
    head=cols.map(c=>c.name);
  }else{
    const w=Math.max(0,...files.map(f=>Math.max(0,...f.rows.map(r=>r.length))));
    head=Array.from({length:w},(_,i)=>"列"+(i+1));
    files.forEach(f=>{
      const widths=new Set(f.rows.map(r=>r.length));
      f.rows.forEach((row,r)=>{const out=head.map((_,i)=>row[i]==null?"":row[i]);data.push({src:f.name,line:r+1,v:out});});
      info.push({name:f.name,rows:f.rows.length,cols:Math.max(0,...f.rows.map(r=>r.length)),missing:[],extra:[]});
      if(widths.size>1) warns.push(`${f.name}：行によって列の数が違います（${[...widths].sort((a,b)=>a-b).join("・")}列）。見出しなしの結合は列の位置でそろえるため、ずれていないか確認してください`);
    });
    const ws=new Set(info.map(x=>x.cols));
    if(ws.size>1) warns.push(`ファイルによって列の数が違います（${info.map(x=>x.name+"："+x.cols+"列").join("、")}）。列の順番が同じか確認してください`);
  }
  // 重複行
  let dupRemoved=0;
  if(o.dedupe){
    const s=new Set();const keep=[];
    data.forEach(d=>{const k=d.v.map(hkey).join("\u0001");if(s.has(k)){dupRemoved++;return;}s.add(k);keep.push(d);});
    data=keep;
  }
  // 元のファイル名の列
  let H=head.slice(),rows=data.map(d=>d.v);
  if(o.srcCol!=="none"){
    let nm=o.srcName||"元のファイル";
    if(H.map(hkey).includes(hkey(nm))) nm=nm+"_結合";
    if(o.srcCol==="first"){H=[nm].concat(H);rows=data.map(d=>[d.src].concat(d.v));}
    else{H=H.concat([nm]);rows=data.map(d=>d.v.concat([d.src]));}
  }
  return {head:H,rows,info,warns,dupRemoved,colsOnlySome:o.header?allCols.filter(c=>c.count<files.length).map(c=>c.name):[]};
}

const api={parseCSV,toCSV,merge,hkey};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Ketsugo=api;
})(this);
