/* 営業日の計算（ブラウザ内で完結。外部通信なし） */
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

/* ---------- 日付（内部では UTC の通し日数で扱う） ---------- */
const DAY=86400000;
function dn(y,m,d){return Math.floor(Date.UTC(y,m-1,d)/DAY);}
function ymd(n){const t=new Date(n*DAY);return {y:t.getUTCFullYear(),m:t.getUTCMonth()+1,d:t.getUTCDate(),w:t.getUTCDay()};}
function valid(y,m,d){if(m<1||m>12||d<1) return false;const t=ymd(dn(y,m,d));return t.y===y&&t.m===m&&t.d===d;}
const WD="日月火水木金土";
function pad2(n){return n<10?"0"+n:String(n);}
function fmt(n,f){
  const t=ymd(n);
  if(f==="iso") return `${t.y}-${pad2(t.m)}-${pad2(t.d)}`;
  if(f==="num") return `${t.y}${pad2(t.m)}${pad2(t.d)}`;
  if(f==="jp") return `${t.y}年${t.m}月${t.d}日`;
  if(f==="short") return `${t.y}/${t.m}/${t.d}`;
  return `${t.y}/${pad2(t.m)}/${pad2(t.d)}`;
}

/* ---------- 日本の祝日（国民の祝日に関する法律の規則から計算） ---------- */
/* 対象：2010〜2099年。春分・秋分の日は計算式による（正式には前年2月の官報で決まる） */
const MIN_Y=2010,MAX_Y=2099;
function nthMon(y,m,k){const w=ymd(dn(y,m,1)).w;return 1+((8-w)%7)+(k-1)*7;}
function shunbun(y){return Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));}
function shubun(y){return Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));}
const hcache={};
function holidaysOf(y){
  if(hcache[y]) return hcache[y];
  const h=new Map();
  const add=(m,d,name)=>h.set(dn(y,m,d),name);
  add(1,1,"元日");
  add(1,nthMon(y,1,2),"成人の日");
  add(2,11,"建国記念の日");
  if(y>=2020) add(2,23,"天皇誕生日");
  add(3,shunbun(y),"春分の日");
  add(4,29,"昭和の日");
  add(5,3,"憲法記念日");add(5,4,"みどりの日");add(5,5,"こどもの日");
  if(y===2020) add(7,23,"海の日"); else if(y===2021) add(7,22,"海の日"); else add(7,nthMon(y,7,3),"海の日");
  if(y===2020) add(8,10,"山の日"); else if(y===2021) add(8,8,"山の日"); else if(y>=2016) add(8,11,"山の日");
  add(9,nthMon(y,9,3),"敬老の日");
  add(9,shubun(y),"秋分の日");
  const sp=y>=2020?"スポーツの日":"体育の日";
  if(y===2020) add(7,24,sp); else if(y===2021) add(7,23,sp); else add(10,nthMon(y,10,2),sp);
  add(11,3,"文化の日");
  add(11,23,"勤労感謝の日");
  if(y<=2018) add(12,23,"天皇誕生日");
  if(y===2019){add(4,30,"国民の休日");add(5,1,"天皇の即位の日");add(5,2,"国民の休日");add(10,22,"即位礼正殿の儀の行われる日");}
  /* 国民の休日：前後が祝日にはさまれた平日 */
  const keys=[...h.keys()].sort((a,b)=>a-b);
  for(let i=0;i+1<keys.length;i++){
    if(keys[i+1]-keys[i]===2){const mid=keys[i]+1;if(!h.has(mid)&&ymd(mid).w!==0) h.set(mid,"国民の休日");}
  }
  /* 振替休日：祝日が日曜なら、その後の最初の祝日でない日 */
  [...h.keys()].sort((a,b)=>a-b).forEach(k=>{
    if(ymd(k).w===0){let n=k+1;while(h.has(n)) n++;h.set(n,"振替休日");}
  });
  hcache[y]=h;return h;
}
function holidayName(n){const y=ymd(n).y;if(y<MIN_Y||y>MAX_Y) return null;return holidaysOf(y).get(n)||null;}
function holidayList(y){return [...holidaysOf(y).entries()].sort((a,b)=>a[0]-b[0]).map(([n,name])=>({n,date:fmt(n),w:WD[ymd(n).w],name}));}

/* ---------- 日付の読み取り ---------- */
const ERA={"令和":2018,"R":2018,"平成":1988,"H":1988};
function parseDate(v){
  let s=String(v==null?"":v).normalize("NFKC").replace(/[​-‍﻿]/g,"").trim();
  if(!s) return {empty:true};
  s=s.replace(/\s*[\(（][日月火水木金土][\)）]\s*/,"").replace(/[\sT]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/,"").trim();
  let m,y,mo,d,how="";
  if((m=s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/))){y=+m[1];mo=+m[2];d=+m[3];}
  else if((m=s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/))){y=+m[1];mo=+m[2];d=+m[3];}
  else if((m=s.match(/^(令和|平成|R|H)\s*(\d{1,2}|元)\s*[年\.\/\-]\s*(\d{1,2})\s*[月\.\/\-]\s*(\d{1,2})日?$/i))){
    const e=m[1].toUpperCase()==="R"?"R":m[1].toUpperCase()==="H"?"H":m[1];
    y=ERA[e]+(m[2]==="元"?1:+m[2]);mo=+m[3];d=+m[4];how="和暦";
    if(e==="令和"||e==="R"){if(dn(y,mo,d)<dn(2019,5,1)) return {bad:true,why:"令和は2019年5月1日から"};}
    else if(dn(y,mo,d)>=dn(2019,5,1)) return {bad:true,why:"平成は2019年4月30日まで"};
  }
  else if((m=s.match(/^(\d{4})(\d{2})(\d{2})$/))){y=+m[1];mo=+m[2];d=+m[3];}
  else if((m=s.match(/^(\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/))){y=2000+ +m[1];mo=+m[2];d=+m[3];how="年2桁";}
  else if((m=s.match(/^(\d{5})(\.0+)?$/))&&+m[1]>=40179&&+m[1]<=73050){
    const n=dn(1899,12,30)+ +m[1];return {n,how:"Excelの日付の番号"};
  }
  else return {bad:true,why:"日付として読めない"};
  if(!valid(y,mo,d)) return {bad:true,why:"存在しない日付"};
  return {n:dn(y,mo,d),how};
}

/* ---------- 休みの判定 ---------- */
/* opt: {weekly:[0,6] 休む曜日, holidays:true 祝日を休む, nenmatsu:"none"|"12/29-1/3"|"12/31-1/3", extraOff:Set, extraOn:Set} */
function makeCal(opt){
  const weekly=new Set(opt.weekly||[]),extraOff=opt.extraOff||new Set(),extraOn=opt.extraOn||new Set();
  function reason(n){
    if(extraOn.has(n)) return null;
    if(extraOff.has(n)) return "休業日（指定）";
    const t=ymd(n);
    if(opt.nenmatsu&&opt.nenmatsu!=="none"){
      const from=opt.nenmatsu==="12/29-1/3"?29:31;
      if((t.m===12&&t.d>=from)||(t.m===1&&t.d<=3)) return "年末年始";
    }
    if(opt.holidays){const h=holidayName(n);if(h) return h;}
    if(weekly.has(t.w)) return WD[t.w]+"曜日";
    return null;
  }
  if(weekly.size>=7&&!extraOn.size) return {reason,none:true};
  return {reason,none:false};
}
function inRange(n){const y=ymd(n).y;return y>=MIN_Y&&y<=MAX_Y;}
/* N営業日後（N<0 なら前）。基準日そのものは数えない */
function addBiz(n,k,cal){
  const step=k<0?-1:1;let left=Math.abs(k),guard=0;
  while(left>0){n+=step;if(!inRange(n)) return null;if(!cal.reason(n)) left--;if(++guard>40000) return null;}
  return n;
}
/* 休みなら翌営業日（dir=1）／前営業日（dir=-1）へ寄せる */
function shift(n,dir,cal){
  let guard=0;
  while(cal.reason(n)){n+=dir;if(!inRange(n)||++guard>40000) return null;}
  return n;
}
/* 2つの日付の間の営業日数。開始日の翌日〜終了日（includeStart なら開始日も数える）。終了日が前なら負の数 */
function countBiz(a,b,cal,includeStart){
  if(a===b) return includeStart&&!cal.reason(a)?1:0;
  const sign=b>a?1:-1;const lo=Math.min(a,b),hi=Math.max(a,b);
  if(hi-lo>40000) return null;
  let c=0;
  for(let n=lo+1;n<=hi;n++) if(!cal.reason(n)) c++;
  if(includeStart){const s=sign>0?lo:hi;if(!cal.reason(s)) c++;}
  return sign*c;
}
/* 「2026/12/29-2027/1/4」や1行1日の休業日リストを読む */
function parseDayList(text){
  const set=new Set(),bad=[];
  String(text||"").split(/[\r\n,、]+/).map(s=>s.trim()).filter(Boolean).forEach(line=>{
    const p=line.normalize("NFKC").split(/\s*[~〜～]\s*|\s+-\s+|\s*-\s*(?=\d{4}[\/年])|\s*から\s*/);
    if(p.length===2){
      const a=parseDate(p[0]),b=parseDate(p[1]);
      if(a.n==null||b.n==null||b.n<a.n||b.n-a.n>366){bad.push(line);return;}
      for(let n=a.n;n<=b.n;n++) set.add(n);
    } else {const a=parseDate(line);if(a.n==null) bad.push(line); else set.add(a.n);}
  });
  return {set,bad};
}

/* ---------- 列の見出しから、日付の列らしいものを選ぶ ---------- */
function guessCol(header){
  let best=-1,score=0;
  (header||[]).forEach((h,i)=>{
    const n=String(h||"").normalize("NFKC").toLowerCase();
    let s=0;
    if(/日付|年月日|date/.test(n)) s+=3;
    if(/受注|注文|発注|納品|請求|締|開始|入金|申込|発送|出荷/.test(n)) s+=1;
    if(/日$|日時$/.test(n)) s+=1;
    if(/曜日/.test(n)) s-=5;
    if(s>score){score=s;best=i;}
  });
  return best;
}

/* ---------- まとめて計算 ---------- */
/* opt: {mode:"add"|"shift"|"count", col, col2, days, daysCol, dir(-1/1), fmt, includeStart, cal, name, weekday} */
function run(rows,header,opt){
  const cal=makeCal(opt.cal);
  if(cal.none) return {error:"すべての曜日が休みになっています。営業する曜日を1つ以上残してください。"};
  const start=header?1:0,out=[],issues=[];
  let ok=0,empty=0,shifted=0;const hows={};
  for(let r=start;r<rows.length;r++){
    const row=rows[r],line=r+1;
    const a=parseDate(row[opt.col]);
    let res="",note="";
    if(a.empty){empty++;out.push({res:"",wd:""});continue;}
    if(a.bad){issues.push({row:line,value:row[opt.col]||"",why:a.why});out.push({res:"",wd:""});continue;}
    if(a.how) hows[a.how]=(hows[a.how]||0)+1;
    if(!inRange(a.n)){issues.push({row:line,value:row[opt.col],why:`${MIN_Y}〜${MAX_Y}年の日付だけ計算できます`});out.push({res:"",wd:""});continue;}
    let n=null;
    if(opt.mode==="add"){
      let k=opt.days;
      if(opt.daysCol!=null&&opt.daysCol>=0){
        const t=String(row[opt.daysCol]==null?"":row[opt.daysCol]).normalize("NFKC").trim();
        if(!/^-?\d{1,4}$/.test(t)){issues.push({row:line,value:t,why:"日数が整数で入っていない"});out.push({res:"",wd:""});continue;}
        k=+t;
      }
      k=k*opt.dir;
      n=k===0?a.n:addBiz(a.n,k,cal);
    } else if(opt.mode==="shift"){
      n=shift(a.n,opt.dir,cal);
      if(n!=null&&n!==a.n) shifted++;
    } else {
      const b=parseDate(row[opt.col2]);
      if(b.empty){empty++;out.push({res:"",wd:""});continue;}
      if(b.bad){issues.push({row:line,value:row[opt.col2]||"",why:"2つ目の列："+b.why});out.push({res:"",wd:""});continue;}
      if(!inRange(b.n)){issues.push({row:line,value:row[opt.col2],why:`2つ目の列：${MIN_Y}〜${MAX_Y}年の日付だけ計算できます`});out.push({res:"",wd:""});continue;}
      const c=countBiz(a.n,b.n,cal,opt.includeStart);
      if(c==null){issues.push({row:line,value:row[opt.col2],why:"2つの日付が離れすぎている"});out.push({res:"",wd:""});continue;}
      ok++;out.push({res:String(c),wd:"",from:a.n,to:b.n});continue;
    }
    if(n==null){issues.push({row:line,value:row[opt.col],why:`計算結果が${MIN_Y}〜${MAX_Y}年の外になる`});out.push({res:"",wd:""});continue;}
    ok++;out.push({res:fmt(n,opt.fmt),wd:WD[ymd(n).w],from:a.n,to:n,off:cal.reason(a.n)});
  }
  return {out,issues,ok,empty,shifted,hows,start};
}
/* 元の行の右端（または指定した列の右）に結果の列を足す */
function annotate(rows,header,res,names,weekday){
  const nc=rows.reduce((a,r)=>Math.max(a,r.length),0);
  return rows.map((r0,i)=>{
    const r=r0.slice();while(r.length<nc) r.push("");
    const add=[];
    if(header&&i===0){add.push(names[0]);if(weekday) add.push(names[1]);}
    else if(i>=res.start){const o=res.out[i-res.start];add.push(o.res);if(weekday) add.push(o.wd);}
    return r.concat(add);
  });
}

const api={readText,parseCSV,toCSV,encodeUTF8,dn,ymd,fmt,WD,MIN_Y,MAX_Y,holidaysOf,holidayName,holidayList,parseDate,makeCal,addBiz,shift,countBiz,parseDayList,guessCol,run,annotate};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Eigyo=api;
})(typeof window!=="undefined"?window:globalThis);
