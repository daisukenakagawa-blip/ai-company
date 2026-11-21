/* 連絡先ファイル（.vcf）⇔ CSV 変換（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

/* ---------- 読み込み（UTF-8 / Shift_JIS を判定） ---------- */
function tryDecode(u8,e){try{return new TextDecoder(e,{fatal:true}).decode(u8);}catch(_){return null;}}
function readText(u8){
  if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF) return {text:new TextDecoder("utf-8").decode(u8.subarray(3)),enc:"utf-8"};
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
  const keep=[],line=[];rows.forEach((r,i)=>{if(r.some(v=>v!=="")){keep.push(r);line.push(i+1);}});
  return {rows:keep,line,delim:d};
}
function cell(v,d){v=v==null?"":String(v);return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(rows,d){d=d||",";return rows.map(r=>r.map(v=>cell(v,d)).join(d)+"\r\n").join("");}
function encodeUTF8(text,bom){
  const b=new TextEncoder().encode(text);
  if(!bom) return b;
  const o=new Uint8Array(b.length+3);o.set([0xEF,0xBB,0xBF]);o.set(b,3);return o;
}

/* ---------- vCard の読み取り ---------- */
/* Quoted-Printable を文字に戻す（CHARSET の指定があればそれで、なければ UTF-8 → Shift_JIS の順に試す） */
function qpDecode(s,charset){
  s=s.replace(/=\r?\n/g,"");
  const bytes=[];
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==="="&&/^[0-9A-Fa-f]{2}$/.test(s.substr(i+1,2))){bytes.push(parseInt(s.substr(i+1,2),16));i+=2;}
    else{const b=new TextEncoder().encode(c);for(const x of b) bytes.push(x);}
  }
  const u8=new Uint8Array(bytes);
  let cs=(charset||"").toLowerCase().replace(/^x-/,"");
  if(cs==="sjis"||cs==="shift-jis"||cs==="ms932"||cs==="windows-31j"||cs==="cp932") cs="shift_jis";
  if(cs){const t=tryDecode(u8,cs);if(t!==null) return t;}
  const u=tryDecode(u8,"utf-8");if(u!==null) return u;
  return new TextDecoder("shift_jis").decode(u8);
}
function b64Text(s,charset){
  try{
    const bin=atob(s.replace(/\s+/g,""));const u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    const t=tryDecode(u8,(charset||"utf-8").toLowerCase());
    return t!==null?t:new TextDecoder("shift_jis").decode(u8);
  }catch(_){return "";}
}
/* 1行（論理行）を「グループ・名前・パラメータ・値」に分ける */
function splitLine(line){
  let q=false,i=0;
  for(;i<line.length;i++){const c=line[i];if(c==='"') q=!q;else if(c===":"&&!q) break;}
  if(i>=line.length) return null;
  const head=line.slice(0,i),value=line.slice(i+1);
  const parts=[];let cur="";q=false;
  for(const c of head){if(c==='"'){q=!q;cur+=c;}else if(c===";"&&!q){parts.push(cur);cur="";}else cur+=c;}
  parts.push(cur);
  let name=parts.shift().trim(),group="";
  const dot=name.lastIndexOf(".");if(dot>=0){group=name.slice(0,dot).toLowerCase();name=name.slice(dot+1);}
  const params={type:[]};
  for(const p of parts){
    const eq=p.indexOf("=");
    if(eq<0){ const v=p.trim().toUpperCase();
      if(v==="QUOTED-PRINTABLE"||v==="BASE64"||v==="B") params.encoding=v;
      else if(v) params.type.push(v.toLowerCase());
      continue; }
    const k=p.slice(0,eq).trim().toUpperCase(),v=p.slice(eq+1).trim().replace(/^"|"$/g,"");
    if(k==="TYPE") v.split(",").forEach(x=>{x=x.trim().toLowerCase();if(x) params.type.push(x);});
    else if(k==="ENCODING") params.encoding=v.toUpperCase();
    else if(k==="CHARSET") params.charset=v;
    else if(k==="PREF") params.type.push("pref");
    else params[k.toLowerCase()]=v;
  }
  return {group,name:name.toUpperCase(),params,value};
}
/* 「\;」「\,」「\n」を戻しながら ; で区切る */
function splitStruct(v){
  const out=[];let cur="";
  for(let i=0;i<v.length;i++){
    const c=v[i];
    if(c==="\\"&&i+1<v.length){const n=v[i+1];cur+=(n==="n"||n==="N")?"\n":n;i++;continue;}
    if(c===";"){out.push(cur);cur="";continue;}
    cur+=c;
  }
  out.push(cur);return out;
}
function unescapeText(v){return v.replace(/\\([nN,;:\\])/g,(_,c)=>(c==="n"||c==="N")?"\n":c);}
const clean=s=>String(s||"").replace(/\r?\n/g," ").replace(/[ \t\u3000]+/g," ").trim();

/* iPhone の「item1.X-ABLabel」の決まった名前 */
const ABLABEL={"_$!<mobile>!$_":"cell","_$!<home>!$_":"home","_$!<work>!$_":"work","_$!<homefax>!$_":"fax","_$!<workfax>!$_":"fax","_$!<main>!$_":"work","_$!<other>!$_":"other","_$!<pager>!$_":"other"};

function parseVCF(text){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const raw=text.split(/\r\n|\r|\n/);
  /* 折り返しを戻す：先頭が空白の行は前の行の続き。QP の行末「=」も次の行に続く */
  const lines=[];
  for(let i=0;i<raw.length;i++){
    let l=raw[i];
    if(/^[ \t]/.test(l)&&lines.length){lines[lines.length-1]+=l.slice(1);continue;}
    while(/ENCODING=QUOTED-PRINTABLE|;QUOTED-PRINTABLE/i.test(l.split(":")[0])&&/=$/.test(l)&&i+1<raw.length){
      l=l.slice(0,-1)+raw[++i].replace(/^ (?==)/,"");
    }
    lines.push(l);
  }
  const cards=[];let cur=null,depth=0,skipped={};
  for(const l of lines){
    if(!l.trim()) continue;
    const p=splitLine(l);if(!p) continue;
    if(p.name==="BEGIN"&&/^vcard$/i.test(p.value.trim())){depth++;if(depth===1) cur={props:[],labels:{},version:""};continue;}
    if(p.name==="END"&&/^vcard$/i.test(p.value.trim())){depth--;if(depth===0&&cur){cards.push(cur);cur=null;}continue;}
    if(!cur||depth!==1) continue;
    let v=p.value;
    const enc=(p.params.encoding||"").toUpperCase();
    if(enc==="QUOTED-PRINTABLE") v=qpDecode(v,p.params.charset);
    else if((enc==="BASE64"||enc==="B")&&p.name!=="PHOTO"&&p.name!=="LOGO"&&p.name!=="KEY"&&p.name!=="SOUND") v=b64Text(v,p.params.charset);
    if(p.name==="VERSION"){cur.version=v.trim();continue;}
    if(p.name==="X-ABLABEL"){cur.labels[p.group]=v.trim();continue;}
    p.value=v;cur.props.push(p);
  }
  return cards.map(toContact);
}

function telKind(types,label){
  const t=types.concat(label?[label]:[]);
  if(t.includes("fax")) return "fax";
  if(t.some(x=>x==="cell"||x==="iphone"||x==="mobile"||x==="cellular")) return "cell";
  if(t.includes("home")) return "home";
  if(t.includes("work")) return "work";
  return "other";
}
function adrKind(types,label){
  const t=types.concat(label?[label]:[]);
  if(t.includes("home")) return "自宅";if(t.includes("work")) return "勤務先";
  return label&&!/^_\$!</.test(label)?label:"";
}
function labelOf(card,p){
  const raw=p.group&&card.labels[p.group];if(!raw) return "";
  const k=raw.toLowerCase();return ABLABEL[k]||raw;
}

function toContact(card){
  const c={sei:"",mei:"",seiKana:"",meiKana:"",kana:"",fn:"",nick:"",org:"",dept:"",title:"",
    tel:{cell:[],home:[],work:[],fax:[],other:[]},email:[],adr:[],bday:"",url:[],note:"",photo:false,other:[]};
  for(const p of card.props){
    const v=p.value;
    switch(p.name){
      case "N":{const a=splitStruct(v).map(clean);c.sei=a[0]||"";c.mei=a[1]||"";if(a[2]) c.mei=(c.mei+" "+a[2]).trim();break;}
      case "FN": c.fn=clean(unescapeText(v));break;
      case "X-PHONETIC-LAST-NAME": c.seiKana=clean(unescapeText(v));break;
      case "X-PHONETIC-FIRST-NAME": c.meiKana=clean(unescapeText(v));break;
      case "SOUND":{
        if(p.params.type.some(x=>/x-irmc-n/i.test(x))||p.params["x-irmc-n"]!==undefined||!p.params.encoding){
          const a=splitStruct(v).map(clean);
          if(a.length>1){if(!c.seiKana) c.seiKana=a[0];if(!c.meiKana) c.meiKana=a[1];}
          else if(a[0]&&!c.kana) c.kana=a[0];
        }
        break;}
      case "NICKNAME": c.nick=clean(unescapeText(v));break;
      case "ORG":{const a=splitStruct(v).map(clean);c.org=a[0]||"";c.dept=a.slice(1).filter(Boolean).join(" ");break;}
      case "TITLE": c.title=clean(unescapeText(v));break;
      case "TEL":{const n=clean(v.replace(/^tel:/i,""));if(n) c.tel[telKind(p.params.type,labelOf(card,p))].push(n);break;}
      case "EMAIL":{const e=clean(v.replace(/^mailto:/i,""));if(e) c.email.push(e);break;}
      case "ADR":{
        const a=splitStruct(v).map(clean);
        /* 私書箱;拡張住所（建物など）;番地;市区町村;都道府県;郵便番号;国 */
        const o={kind:adrKind(p.params.type,labelOf(card,p)),zip:a[5]||"",pref:a[4]||"",city:a[3]||"",street:[a[0],a[2]].filter(Boolean).join(" "),bldg:a[1]||"",country:a[6]||""};
        if(o.zip||o.pref||o.city||o.street||o.bldg) c.adr.push(o);
        break;}
      case "BDAY": c.bday=clean(v);break;
      case "URL": if(clean(v)) c.url.push(clean(unescapeText(v)));break;
      case "NOTE": c.note=(c.note?c.note+" ":"")+clean(unescapeText(v));break;
      case "PHOTO": c.photo=true;break;
      case "PRODID":case "REV":case "UID":case "CATEGORIES":case "X-ABUID":case "X-ABADR":case "LABEL":case "X-ABSHOWAS":case "KIND":break;
      default: c.other.push(p.name);
    }
  }
  if(!c.sei&&!c.mei&&c.fn&&!c.org) c.sei=c.fn;
  return c;
}

/* ---------- 整え方 ---------- */
function toKata(s){return s.normalize("NFKC").replace(/[\u3041-\u3096]/g,ch=>String.fromCharCode(ch.charCodeAt(0)+0x60));}
function toHira(s){return s.normalize("NFKC").replace(/[\u30A1-\u30F6]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));}
function kana(s,mode){if(!s) return s;return mode==="kata"?toKata(s):mode==="hira"?toHira(s):s;}
function fixTel(n,opt){
  let s=n;
  if(opt.jp0){ s=s.replace(/^\+\s*81[\s-]*\(?0?\)?[\s-]*/, "0"); }
  if(opt.telDigits) s=s.replace(/[^\d+#*]/g,"");
  return s;
}
function fixZip(z,opt){
  const d=z.normalize("NFKC").replace(/[〒\s]/g,"");
  if(opt.zipHyphen&&/^\d{7}$/.test(d)) return d.slice(0,3)+"-"+d.slice(3);
  if(opt.zipHyphen&&/^\d{3}-\d{4}$/.test(d)) return d;
  return z;
}
function fixBday(b){
  let m=b.match(/^(\d{4})-?(\d{2})-?(\d{2})/);if(m) return `${m[1]}/${m[2]}/${m[3]}`;
  m=b.match(/^--(\d{2})-?(\d{2})/);if(m) return `${m[1]}/${m[2]}`;
  return b;
}
function excelSafe(v){return v?'="'+v.replace(/"/g,'""')+'"':v;}

/* 連絡先の一覧 → 表（見出し＋行）。件数の多い種類だけ列を増やす */
function contactsToTable(list,opt){
  opt=Object.assign({kana:"keep",jp0:true,telDigits:false,zipHyphen:true,excel:false,dropEmpty:true,onlyAdr:false,preset:"all"},opt||{});
  if(opt.onlyAdr) list=list.filter(c=>c.adr.length);
  const max=(f)=>list.reduce((m,c)=>Math.max(m,f(c)),0);
  const TL={cell:"携帯",home:"電話（自宅）",work:"電話（勤務先）",fax:"FAX",other:"電話（その他）"};
  const cols=[];
  const add=(h,f,ex)=>cols.push({h,f,ex:!!ex});
  if(opt.preset==="atena"){
    /* はがきの宛名印刷などにそのまま入る形：1人1行、住所は1件目（自宅を優先） */
    const pick=c=>c.adr.find(a=>a.kind==="自宅")||c.adr[0]||{};
    add("姓",c=>c.sei);add("名",c=>c.mei);
    add("郵便番号",c=>fixZip(pick(c).zip||"",opt),true);
    add("住所",c=>{const a=pick(c);return [a.pref,a.city,a.street].filter(Boolean).join("");});
    add("建物名",c=>pick(c).bldg||"");
    add("会社名",c=>c.org);
  }else{
    add("姓",c=>c.sei);add("名",c=>c.mei);
    add("姓（ふりがな）",c=>kana(c.seiKana,opt.kana));add("名（ふりがな）",c=>kana(c.meiKana,opt.kana));
    add("ふりがな（1列）",c=>kana(c.kana,opt.kana));
    add("表示名",c=>c.fn);add("ニックネーム",c=>c.nick);
    add("会社名",c=>c.org);add("部署",c=>c.dept);add("役職",c=>c.title);
    for(const k of ["cell","home","work","fax","other"]){
      const n=max(c=>c.tel[k].length);
      for(let i=0;i<n;i++) add(TL[k]+(n>1?i+1:""),c=>fixTel(c.tel[k][i]||"",opt),true);
    }
    const ne=max(c=>c.email.length);
    for(let i=0;i<ne;i++) add("メール"+(ne>1?i+1:""),c=>c.email[i]||"");
    const na=max(c=>c.adr.length);
    for(let i=0;i<na;i++){
      const s=na>1?String(i+1):"";
      add("住所"+s+"の種類",c=>(c.adr[i]||{}).kind||"");
      add("郵便番号"+s,c=>fixZip((c.adr[i]||{}).zip||"",opt),true);
      add("都道府県"+s,c=>(c.adr[i]||{}).pref||"");
      add("市区町村"+s,c=>(c.adr[i]||{}).city||"");
      add("番地"+s,c=>(c.adr[i]||{}).street||"");
      add("建物名"+s,c=>(c.adr[i]||{}).bldg||"");
      add("国"+s,c=>(c.adr[i]||{}).country||"");
      add("住所"+s+"（つなげたもの）",c=>{const a=c.adr[i]||{};return [a.pref,a.city,a.street].filter(Boolean).join("")+(a.bldg?" "+a.bldg:"");});
    }
    add("誕生日",c=>fixBday(c.bday));
    const nu=max(c=>c.url.length);
    for(let i=0;i<nu;i++) add("URL"+(nu>1?i+1:""),c=>c.url[i]||"");
    add("メモ",c=>c.note);
  }
  let rows=list.map(c=>cols.map(col=>col.f(c)||""));
  let use=cols.map((_,j)=>!opt.dropEmpty||rows.some(r=>r[j]!==""));
  if(opt.preset==="atena") use=cols.map(()=>true);
  const head=cols.filter((_,j)=>use[j]).map(c=>c.h);
  rows=rows.map(r=>r.filter((_,j)=>use[j]).map((v,k)=>opt.excel&&cols.filter((_,j)=>use[j])[k].ex?excelSafe(v):v));
  return {head,rows};
}

/* ---------- CSV → vCard ---------- */
const FIELDS=[
  ["","使わない"],["sei","姓"],["mei","名"],["name","氏名（1列）"],["seiKana","姓（ふりがな）"],["meiKana","名（ふりがな）"],["kana","ふりがな（1列）"],
  ["org","会社名"],["dept","部署"],["title","役職"],
  ["cell","携帯電話"],["home","電話（自宅）"],["work","電話（勤務先）"],["fax","FAX"],["tel","電話（その他）"],["email","メール"],
  ["zip","郵便番号"],["pref","都道府県"],["city","市区町村"],["street","住所（番地など）"],["bldg","建物名"],
  ["bday","誕生日"],["url","URL"],["note","メモ"]
];
/* 見出しの名前から、どの項目かを推測する */
function guessField(h){
  const s=String(h).normalize("NFKC").replace(/\s/g,"").toLowerCase();
  const kanaWord=/(ふりがな|フリガナ|かな|カナ|よみ|ヨミ|読み|furigana|kana|phonetic)/i;
  if(kanaWord.test(s)){
    if(/(姓|せい|セイ|苗字|名字|last|family)/i.test(s)) return "seiKana";
    if(/(名$|^名|めい|メイ|first|given|下の名)/i.test(s)&&!/氏名|名前/.test(s)) return "meiKana";
    return "kana";
  }
  if(/^(姓|苗字|名字|lastname|familyname|last)$/.test(s)) return "sei";
  if(/^(名|firstname|givenname|first|下の名前)$/.test(s)) return "mei";
  if(/(氏名|名前|おなまえ|^name$|fullname|表示名|宛名)/.test(s)) return "name";
  if(/(会社|法人|勤務先名|company|organization|^org$|屋号)/.test(s)) return "org";
  if(/(部署|所属|department)/.test(s)) return "dept";
  if(/(役職|肩書|title)/.test(s)) return "title";
  if(/(fax|ファクス|ファックス)/.test(s)) return "fax";
  if(/(携帯|mobile|cell|スマホ)/.test(s)) return "cell";
  if(/(電話|tel|phone)/.test(s)){ if(/(自宅|home)/.test(s)) return "home"; if(/(勤務|会社|work|office)/.test(s)) return "work"; return "tel"; }
  if(/(メール|mail|e-mail)/.test(s)) return "email";
  if(/(郵便|〒|zip|postal|postcode)/.test(s)) return "zip";
  if(/(都道府県|prefecture|state)/.test(s)) return "pref";
  if(/(市区町村|city)/.test(s)) return "city";
  if(/(建物|マンション|ビル名|住所2|address2)/.test(s)) return "bldg";
  if(/(住所|番地|address|street)/.test(s)) return "street";
  if(/(誕生日|生年月日|birthday|bday)/.test(s)) return "bday";
  if(/(url|ホームページ|ウェブ|web|サイト)/.test(s)) return "url";
  if(/(メモ|備考|note|memo|コメント)/.test(s)) return "note";
  return "";
}
function esc(v){return String(v).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
/* 1行 75 バイトで折り返す（文字の途中では切らない） */
function fold(line){
  const enc=new TextEncoder();
  if(enc.encode(line).length<=75) return line;
  const out=[];let cur="",len=0,limit=75;
  for(const ch of line){
    const n=enc.encode(ch).length;
    if(len+n>limit){out.push(cur);cur="";len=0;limit=74;}
    cur+=ch;len+=n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function bdayOut(v){
  const s=String(v).normalize("NFKC").trim();
  let m=s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/);
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=s.match(/^(\d{4})(\d{2})(\d{2})$/);if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
/* 先頭の0が消えた電話番号らしいもの（Excel で開いて保存したときに起きる） */
function lostZero(n){const d=String(n).replace(/[^\d]/g,"");return d.length>=9&&d.length<=10&&!/^0/.test(d)&&!/^\+/.test(String(n).trim());}

function tableToVCF(head,rows,map,opt){
  opt=Object.assign({kana:"keep",splitName:true},opt||{});
  const out=[],skipped=[],warn=[];
  rows.forEach((r,ri)=>{
    const g={};
    map.forEach((f,j)=>{ if(!f) return; const v=String(r[j]==null?"":r[j]).trim(); if(!v) return; (g[f]=g[f]||[]).push(v); });
    const one=k=>(g[k]||[])[0]||"";
    let sei=one("sei"),mei=one("mei");
    if(!sei&&!mei&&one("name")){
      const nm=one("name").replace(/\u3000/g," ").trim();
      if(opt.splitName&&/ /.test(nm)){const i=nm.indexOf(" ");sei=nm.slice(0,i);mei=nm.slice(i+1).trim();}
      else sei=nm;
    }
    let seiK=kana(one("seiKana"),opt.kana),meiK=kana(one("meiKana"),opt.kana);
    if(!seiK&&!meiK&&one("kana")){
      const k=kana(one("kana").replace(/\u3000/g," ").trim(),opt.kana);
      if(/ /.test(k)){const i=k.indexOf(" ");seiK=k.slice(0,i);meiK=k.slice(i+1).trim();} else seiK=k;
    }
    const org=one("org");
    const tels=[];for(const [k,t] of [["cell","CELL"],["home","HOME,VOICE"],["work","WORK,VOICE"],["fax","FAX"],["tel","VOICE"]]) for(const v of g[k]||[]) tels.push([t,v]);
    const emails=g.email||[];
    if(!sei&&!mei&&!org&&!tels.length&&!emails.length){skipped.push(ri);return;}
    const fn=(sei&&mei?sei+" "+mei:sei||mei)||org;
    const L=["BEGIN:VCARD","VERSION:3.0"];
    L.push("N:"+[sei,mei,"","",""].map(esc).join(";"));
    L.push("FN:"+esc(fn));
    if(seiK) L.push("X-PHONETIC-LAST-NAME:"+esc(seiK));
    if(meiK) L.push("X-PHONETIC-FIRST-NAME:"+esc(meiK));
    if(org||one("dept")) L.push("ORG:"+[org,one("dept")].filter((x,i)=>i===0||x).map(esc).join(";"));
    if(one("title")) L.push("TITLE:"+esc(one("title")));
    for(const [t,v] of tels){ L.push("TEL;TYPE="+t+":"+esc(v)); if(lostZero(v)) warn.push({row:ri,msg:`電話番号「${v}」の先頭の0が消えているかもしれません`}); }
    for(const v of emails) L.push("EMAIL;TYPE=INTERNET:"+esc(v));
    if(g.zip||g.pref||g.city||g.street||g.bldg){
      const street=(g.street||[]).join(" ");
      L.push("ADR;TYPE=HOME:"+["",one("bldg"),street,one("city"),one("pref"),one("zip"),""].map(esc).join(";"));
      const z=one("zip").normalize("NFKC").replace(/[^\d]/g,"");
      if(one("zip")&&z.length!==7) warn.push({row:ri,msg:`郵便番号「${one("zip")}」が7桁ではありません`});
    }
    if(one("bday")){const b=bdayOut(one("bday"));if(b) L.push("BDAY:"+b);else warn.push({row:ri,msg:`誕生日「${one("bday")}」を読めなかったので入れていません`});}
    for(const v of g.url||[]) L.push("URL:"+esc(v));
    if(g.note) L.push("NOTE:"+esc(g.note.join("\n")));
    L.push("END:VCARD");
    out.push(L.map(fold).join("\r\n"));
  });
  return {text:out.length?out.join("\r\n")+"\r\n":"",count:out.length,skipped,warn};
}

const api={readText,parseCSV,toCSV,encodeUTF8,parseVCF,contactsToTable,FIELDS,guessField,tableToVCF,qpDecode,fold,kana};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.VCF=api;
})(this);
