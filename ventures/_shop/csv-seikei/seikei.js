"use strict";
// CSV 表記ゆれ整形：変換の関数（tool.html と商品ページのお試しで共用）
// ---------- CSV ----------
function parseCSV(text){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const rows=[];let row=[],f="",q=false,i=0;
  const comma = guessDelim(text);
  while(i<text.length){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){f+='"';i+=2;continue;} q=false;i++;continue; }
      f+=c;i++;continue;
    }
    if(c==='"' && f===""){q=true;i++;continue;}
    if(c===comma){row.push(f);f="";i++;continue;}
    if(c==="\r"){i++;continue;}
    if(c==="\n"){row.push(f);rows.push(row);row=[];f="";i++;continue;}
    f+=c;i++;
  }
  if(f!==""||row.length){row.push(f);rows.push(row);}
  return {rows,delim:comma};
}
function guessDelim(t){
  const line=t.split("\n",1)[0];
  const n=(ch)=>line.split(ch).length;
  return n("\t")>n(",")?"\t":",";
}
function toCSV(rows){
  return rows.map(r=>r.map(v=>/[",\r\n]/.test(v)||/^\s|\s$/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join(",")).join("\r\n")+"\r\n";
}
function decode(buf){
  try{ return {text:new TextDecoder("utf-8",{fatal:true}).decode(buf),enc:"UTF-8"}; }
  catch(e){ return {text:new TextDecoder("shift_jis").decode(buf),enc:"Shift_JIS"}; }
}

// ---------- 変換 ----------
const HK="ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ｡｢｣､･";
const ZK="ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜。「」、・";
const DAKU={"カ":"ガ","キ":"ギ","ク":"グ","ケ":"ゲ","コ":"ゴ","サ":"ザ","シ":"ジ","ス":"ズ","セ":"ゼ","ソ":"ゾ","タ":"ダ","チ":"ヂ","ツ":"ヅ","テ":"デ","ト":"ド","ハ":"バ","ヒ":"ビ","フ":"ブ","ヘ":"ベ","ホ":"ボ","ウ":"ヴ"};
const HANDAKU={"ハ":"パ","ヒ":"ピ","フ":"プ","ヘ":"ペ","ホ":"ポ"};
function hanKana2Zen(s){
  let out="";
  for(let i=0;i<s.length;i++){
    const k=HK.indexOf(s[i]);
    if(k<0){out+=s[i];continue;}
    let z=ZK[k];const nx=s[i+1];
    if(nx==="ﾞ"&&DAKU[z]){z=DAKU[z];i++;}
    else if(nx==="ﾟ"&&HANDAKU[z]){z=HANDAKU[z];i++;}
    out+=z;
  }
  return out;
}
function zen2han(s){
  return s.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/　/g," ");
}
function toHalfDigits(s){return s.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));}
const DASHES=/[‐‑‒–—―−ｰー─━－﹣]/g;
function fixDash(s){
  // 数字(または英字)の間のダッシュ類は「-」、カタカナの後は長音「ー」
  return s.replace(/([0-9A-Za-z０-９])[‐‑‒–—―−ｰー─━－﹣]+(?=[0-9A-Za-z０-９])/g,"$1-")
          .replace(/([ァ-ヴ])[‐‑‒–—―−─━－]/g,"$1ー");
}
function normGlobal(v,o){
  let s=v;
  if(o.kana) s=hanKana2Zen(s);
  if(o.zen2han) s=zen2han(s);
  if(o.dash) s=fixDash(s);
  if(o.space) s=s.replace(/[ 　\t]{2,}/g,m=>m.includes("　")&&!o.zen2han?"　":" ");
  if(o.trim) s=s.replace(/^[\s　]+|[\s　]+$/g,"");
  return s;
}
function fmtTel(v,digitsOnly){
  let s=toHalfDigits(v).replace(DASHES,"-").replace(/[()（）]/g,"-").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  if(!/^\+?[0-9-]+$/.test(s)) return v;
  const d=s.replace(/-/g,"");
  if(digitsOnly) return d;
  if(/^(070|080|090|050)\d{8}$/.test(d)) return d.slice(0,3)+"-"+d.slice(3,7)+"-"+d.slice(7);
  if(/^0120\d{6}$/.test(d)) return d.slice(0,4)+"-"+d.slice(4,7)+"-"+d.slice(7);
  if(/^0[36]\d{8}$/.test(d)&&!s.includes("-")) return d.slice(0,2)+"-"+d.slice(2,6)+"-"+d.slice(6);
  return s;
}
function fmtZip(v){
  const s=toHalfDigits(v).replace(/〒|\s/g,"").replace(DASHES,"-");
  const d=s.replace(/-/g,"");
  if(/^\d{7}$/.test(d)) return d.slice(0,3)+"-"+d.slice(3);
  return v;
}
const ERA={"令和":2018,"R":2018,"平成":1988,"H":1988,"昭和":1925,"S":1925};
function fmtDate(v,fmt){
  let s=toHalfDigits(v).trim().replace(/元年/,"1年");
  let y,m,d,mm;
  if((mm=s.match(/^(令和|平成|昭和)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/))){y=ERA[mm[1]]+ +mm[2];m=+mm[3];d=+mm[4];}
  else if((mm=s.match(/^([RHSrhs])\s*(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/))){y=ERA[mm[1].toUpperCase()]+ +mm[2];m=+mm[3];d=+mm[4];}
  else if((mm=s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/))){y=+mm[1];m=+mm[2];d=+mm[3];}
  else if((mm=s.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})(?:[ T].*)?$/))){y=+mm[1];m=+mm[2];d=+mm[3];}
  else if((mm=s.match(/^(\d{4})(\d{2})(\d{2})$/))){y=+mm[1];m=+mm[2];d=+mm[3];}
  else return v;
  const dt=new Date(y,m-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d) return v;
  const p=n=>String(n).padStart(2,"0");
  if(fmt==="jp") return `${y}年${m}月${d}日`;
  return [y,p(m),p(d)].join(fmt);
}
function fmtCompany(v){
  return v.replace(/[（(]\s*株\s*[）)]|㈱/g,"株式会社").replace(/[（(]\s*有\s*[）)]|㈲/g,"有限会社").replace(/[（(]\s*同\s*[）)]/g,"合同会社");
}
const TYPES={none:"そのまま",tel:"電話番号",zip:"郵便番号",date:"日付",company:"会社名"};
function guessType(header,values){
  const h=header||"";
  if(/電話|TEL|tel|携帯|FAX|fax/.test(h)) return "tel";
  if(/郵便|〒|zip|ZIP|postal/i.test(h)) return "zip";
  if(/日付|年月日|日時|生年月日|date|Date|日$/.test(h)) return "date";
  if(/会社|法人|社名|企業|勤務先/.test(h)) return "company";
  const sample=values.filter(Boolean).slice(0,50);
  if(!sample.length) return "none";
  const ratio=fn=>sample.filter(fn).length/sample.length;
  if(ratio(x=>/^〒?\s*[0-9０-９]{3}[-ー－]?[0-9０-９]{4}$/.test(x.trim()))>.8) return "zip";
  if(ratio(x=>fmtDate(x,"-")!==x||/^\d{4}-\d{2}-\d{2}$/.test(x))>.8) return "date";
  if(ratio(x=>/^[0０][0-9０-９\-－ー()（）\s]{8,14}$/.test(x.trim()))>.8) return "tel";
  return "none";
}

