/* 年間営業カレンダー（ブラウザ内で完結。外部通信なし）。祝日の計算は eigyo.js（Eigyo）を使う */
(function(root){
"use strict";
const E=(typeof module!=="undefined"&&module.exports)?require("./eigyo.js"):root.Eigyo;
const {dn,ymd,WD,holidayName}=E;

/* 12か月の並び（開始月から12か月） */
function monthsOf(year,start){
  const out=[];
  for(let i=0;i<12;i++){const m0=start-1+i;out.push({y:year+Math.floor(m0/12),m:(m0%12)+1});}
  return out;
}
/* 「8/13〜8/16」「2027/8/13」「12月30日」のような日付の一覧を読む。年のない日付は、カレンダーの期間に入る年を補う */
function expandDays(text,year,start){
  const set=new Set(),bad=[];
  const ms=monthsOf(year,start),yOf={};ms.forEach(x=>{yOf[x.m]=x.y;});
  const first=dn(ms[0].y,ms[0].m,1);
  const lastN=(ms[11].m===12?dn(ms[11].y+1,1,1):dn(ms[11].y,ms[11].m+1,1))-1;
  function one(s){
    s=s.normalize("NFKC").replace(/\s*[\(（][日月火水木金土][\)）]\s*/g,"").trim();
    let m;
    if((m=s.match(/^(\d{1,2})\s*[\/\-\.月]\s*(\d{1,2})日?$/))){
      const mo=+m[1],d=+m[2];if(!yOf[mo]) return null;
      const p=E.parseDate(`${yOf[mo]}/${mo}/${d}`);return p.n==null?null:p.n;
    }
    if((m=s.match(/^(\d{1,2})日?$/))) return "D"+m[1];
    const p=E.parseDate(s);return p.n==null?null:p.n;
  }
  String(text||"").split(/[\r\n,、]+/).map(s=>s.trim()).filter(Boolean).forEach(line=>{
    const L=line.normalize("NFKC");
    let parts=L.split(/\s*[~〜～]\s*|\s*から\s*/);
    if(parts.length===1&&/[\/月]/.test(L)) parts=L.split(/\s*-\s*/);
    let a,b;
    if(parts.length===2){
      a=one(parts[0]);b=one(parts[1]);
      /* 「8/13〜16」のように、後ろが日だけ */
      if(typeof a==="number"&&typeof b==="string"){const t=ymd(a);const q=E.parseDate(`${t.y}/${t.m}/${b.slice(1)}`);b=q.n==null?null:q.n;}
      if(typeof a!=="number"||typeof b!=="number") {bad.push(line);return;}
      if(b<a){const t=ymd(b);const q=E.parseDate(`${t.y+1}/${t.m}/${t.d}`);if(q.n!=null&&q.n>=a&&q.n-a<=62) b=q.n;}
      if(b<a||b-a>366){bad.push(line);return;}
    } else if(parts.length===1){a=one(parts[0]);b=a;if(typeof a!=="number"){bad.push(line);return;}}
    else {bad.push(line);return;}
    let outside=false;
    for(let n=a;n<=b;n++){if(n<first||n>lastN) outside=true;set.add(n);}
    if(outside) bad.push(line+"（カレンダーの期間外を含む）");
  });
  return {set,bad};
}

/* opt: {year,start,weekly:[0,6],holidays:true,nenmatsu:"none"|"12/29-1/3"|"12/30-1/3"|"12/31-1/3",off,on,half,weekStart:0|1} */
function build(opt){
  const year=+opt.year,start=+opt.start||1,weekly=new Set(opt.weekly||[]);
  if(!(year>=E.MIN_Y&&year<=E.MAX_Y-1)) throw new Error(`年は ${E.MIN_Y}〜${E.MAX_Y-1} の間で指定してください`);
  const off=expandDays(opt.off,year,start),on=expandDays(opt.on,year,start),half=expandDays(opt.half,year,start);
  const nm=opt.nenmatsu||"none",nmFrom={"12/29-1/3":29,"12/30-1/3":30,"12/31-1/3":31}[nm];
  function info(n){
    const t=ymd(n),hol=holidayName(n);
    let why=null;
    if(off.set.has(n)) why="休業日（指定）";
    else if(nmFrom&&((t.m===12&&t.d>=nmFrom)||(t.m===1&&t.d<=3))) why="年末年始";
    else if(opt.holidays&&hol) why="祝日";
    else if(weekly.has(t.w)) why=WD[t.w]+"曜日";
    if(on.set.has(n)) why=null;
    const closed=!!why,isHalf=!closed&&half.set.has(n);
    return {n,y:t.y,m:t.m,d:t.d,w:t.w,hol,closed,why,half:isHalf};
  }
  const ws=opt.weekStart===1?1:0,cnt={open:0,closed:0,half:0},months=[];
  monthsOf(year,start).forEach(({y,m})=>{
    const f=dn(y,m,1),l=(m===12?dn(y+1,1,1):dn(y,m+1,1))-1;
    const cells=[];const lead=(ymd(f).w-ws+7)%7;
    for(let i=0;i<lead;i++) cells.push(null);
    for(let n=f;n<=l;n++){const c=info(n);cells.push(c);if(c.closed) cnt.closed++; else {cnt.open++;if(c.half) cnt.half++;}}
    while(cells.length%7) cells.push(null);
    const weeks=[];for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
    months.push({y,m,weeks,open:cells.filter(c=>c&&!c.closed).length});
  });
  const heads=[];for(let i=0;i<7;i++) heads.push((ws+i)%7);
  return {year,start,months,heads,cnt,bad:{off:off.bad,on:on.bad,half:half.bad}};
}

function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
/* 印刷用の HTML（.cal-sheet の中身）。view: {title,shop,note,showHol,showCount,closedLabel,halfLabel,orient} */
function render(model,view){
  const v=view||{},same=model.months[0].y===model.months[11].y;
  let h=`<div class="cal-head"><div class="cal-title">${esc(v.title)}</div>${v.shop?`<div class="cal-shop">${esc(v.shop)}</div>`:""}</div><div class="cal-grid">`;
  model.months.forEach(mo=>{
    h+=`<div class="cal-month"><div class="cal-mh"><span class="cal-mn">${mo.m}<small>月</small></span>${same?"":`<span class="cal-my">${mo.y}</span>`}${v.showCount?`<span class="cal-cnt">営業 ${mo.open}日</span>`:""}</div><table><thead><tr>`;
    model.heads.forEach(w=>{h+=`<th class="w${w}">${WD[w]}</th>`;});
    h+=`</tr></thead><tbody>`;
    mo.weeks.forEach(wk=>{
      h+="<tr>";
      wk.forEach(c=>{
        if(!c){h+="<td></td>";return;}
        const cls=["w"+c.w];if(c.hol) cls.push("hol");if(c.closed) cls.push("off");if(c.half) cls.push("half");
        const t=c.hol?` title="${esc(c.hol)}"`:"";
        h+=`<td class="${cls.join(" ")}"${t}><span class="dn">${c.d}</span>${c.half?'<span class="hm">▲</span>':""}${v.showHol&&c.hol?`<span class="hn">${esc(c.hol.replace("の日","").replace("記念",""))}</span>`:""}</td>`;
      });
      h+="</tr>";
    });
    for(let i=mo.weeks.length;i<6;i++) h+=`<tr>${"<td></td>".repeat(7)}</tr>`;
    h+="</tbody></table></div>";
  });
  h+=`</div><div class="cal-foot"><div class="cal-legend"><span><i class="lg-off"></i>${esc(v.closedLabel||"休業日")}</span>${model.cnt.half?`<span><i class="lg-half">▲</i>${esc(v.halfLabel||"短縮営業")}</span>`:""}</div>`;
  if(v.note) h+=`<div class="cal-note">${esc(v.note).replace(/\n/g,"<br>")}</div>`;
  h+="</div>";
  return h;
}

/* 1年分の CSV（日付・曜日・祝日名・営業/休業/短縮・休みの理由） */
function toRows(model,halfLabel){
  const rows=[["日付","曜日","祝日","区分","休みの理由"]];
  model.months.forEach(mo=>mo.weeks.forEach(wk=>wk.forEach(c=>{
    if(!c) return;
    rows.push([`${c.y}/${String(c.m).padStart(2,"0")}/${String(c.d).padStart(2,"0")}`,WD[c.w],c.hol||"",c.closed?"休業":c.half?(halfLabel||"短縮営業"):"営業",c.why||""]);
  })));
  return rows;
}

const api={monthsOf,expandDays,build,render,toRows,esc};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.EigyoCal=api;
})(typeof window!=="undefined"?window:globalThis);
