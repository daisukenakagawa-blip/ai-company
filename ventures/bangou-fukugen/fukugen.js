/* Excel で壊れた番号の検出と復元（ブラウザ内で完結。外部通信なし） */
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
  return {rows:rows.filter(r=>r.some(v=>v!=="")),delim:d};
}
function cell(v,d,excel,code){
  v=v==null?"":String(v);
  if(excel&&code&&/^\d+$/.test(v)) v='="'+v+'"';
  return (v.includes(d)||/["\r\n]/.test(v))?'"'+v.replace(/"/g,'""')+'"':v;
}
/* codeCols: Set(列番号) … excel=true のとき、その列の数字だけの値を ="0123" の形にする */
function toCSV(rows,d,excel,codeCols,header){
  return rows.map((r,ri)=>r.map((v,ci)=>cell(v,d,excel&&!(header&&ri===0),codeCols&&codeCols.has(ci))).join(d)+"\r\n").join("");
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

/* ---------- 値の判定 ---------- */
const z=(s,n)=>{s=String(s);while(s.length<n)s="0"+s;return s;};

/* 指数表記（4.90E+12 など）を調べる。exact:true なら桁がすべて残っている */
function parseExp(s){
  const m=/^([+-]?)(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s);
  if(!m||m[1]==="-") return null;
  const ip=m[2],fp=m[3]||"",e=+m[4];
  const len=ip.replace(/^0+/,"").length+e;        // 元の数の桁数
  if(fp.length<=e){
    const v=(ip+fp+"0".repeat(e-fp.length)).replace(/^0+/,"")||"0";
    return {len,value:v,exact:fp.length===e,fp:fp.length,e};
  }
  return {len,value:null,exact:false,decimal:true,fp:fp.length,e};
}

function janCheck(d){ // GTIN のチェックデジット（右から数える）
  let s=0;const n=d.length;
  for(let i=0;i<n-1;i++){const k=+d[n-2-i];s+=(i%2===0)?k*3:k;}
  return (10-s%10)%10===+d[n-1];
}

/* 1つの値を調べる。
   type: "zip"|"tel"|"jan"|"fixed"  o:{width, zipStyle:"hyphen"|"plain"}
   返り値: {status:"ok"|"empty"|"fixed"|"lost"|"check", value, note} */
function judge(raw,type,o){
  o=o||{};
  const orig=raw==null?"":String(raw);
  let s=orig.normalize("NFKC").replace(/^[\s'"]+|[\s"]+$/g,"");
  if(s==="") return {status:"empty",value:orig};
  if(type==="zip") s=s.replace(/^〒\s*/,"");
  const notes=[];

  // 指数表記
  const ex=parseExp(s);
  if(ex){
    if(ex.decimal) return {status:"check",value:orig,note:"指数表記の小数になっています"};
    if(!ex.exact){
      return {status:"lost",value:orig,note:`指数表記（${ex.len}桁の数）。上から${ex.fp+1}桁しか残っておらず、下の${ex.len-ex.fp-1}桁は元に戻せません`};
    }
    s=ex.value;notes.push("指数表記を数字に戻した");
  }
  // 1234.0 のような小数点
  const dm=/^(\d+)\.0+$/.exec(s);
  if(dm){s=dm[1];notes.push("末尾の「.0」を除いた");}
  // 日付に化けた値
  if(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(s)||/^\d{1,2}月\d{1,2}日$/.test(s)||/^[A-Za-z]{3}-\d{2}$/.test(s)||/^\d{1,2}-[A-Za-z]{3}$/.test(s))
    return {status:"check",value:orig,note:"日付に変わっている可能性があります（Excel が「1-2」などを日付と見なした）"};
  if(/^\d+\.\d+$/.test(s)) return {status:"check",value:orig,note:"小数になっています"};

  const finish=(v,extra)=>{
    if(extra) notes.push(extra);
    if(v===orig) return {status:"ok",value:orig};
    return {status:"fixed",value:v,note:notes.join("・")||"表記をそろえた（〒・全角数字など）"};
  };

  if(type==="zip"){
    if(/^\d{3}-\d{4}$/.test(s)) return s===orig?{status:"ok",value:orig}:finish(s);
    if(!/^\d+$/.test(s)) return {status:"check",value:orig,note:"郵便番号として読めません"};
    if(s.length>7) return {status:"check",value:orig,note:`${s.length}桁あります（郵便番号は7桁）`};
    let add="";
    if(s.length<7){add=`先頭の0を${7-s.length}個補った`;s=z(s,7);}
    if(o.zipStyle==="hyphen") s=s.slice(0,3)+"-"+s.slice(3);
    if(!add&&!notes.length) return {status:"ok",value:orig};
    return finish(s,add);
  }
  if(type==="tel"){
    if(/[^\d]/.test(s)){
      const d=s.replace(/[-()\s]/g,"");
      if(/^\+?\d+$/.test(d)) return {status:"ok",value:orig};
      return {status:"check",value:orig,note:"電話番号として読めません"};
    }
    let add="";
    if(s[0]!=="0"&&(s.length===9||s.length===10)){s="0"+s;add="先頭の0を補った";}
    if(s[0]!=="0") return {status:"check",value:orig,note:`0で始まらない${s.length}桁の数です`};
    if(s.length===11&&!/^0([5789]0|120|800)/.test(s)) return {status:"check",value:orig,note:(add?"先頭に0を補うと":"")+"11桁ですが、携帯・IP電話・0120/0800 の形ではありません"};
    if(s.length!==10&&s.length!==11) return {status:"check",value:orig,note:`${s.length}桁です（電話番号は10桁か11桁）`};
    if(!add&&!notes.length) return {status:"ok",value:orig};
    return finish(s,add);
  }
  if(type==="jan"){
    if(!/^\d+$/.test(s)) return {status:"check",value:orig,note:"数字以外が入っています"};
    if(s.length<8||s.length>14) return {status:"check",value:orig,note:`${s.length}桁です（8・13・14桁のいずれか）`};
    if(!janCheck(s)) return {status:"check",value:orig,note:"チェックデジット（最後の1桁）が合いません。打ち間違いか、桁が失われている可能性があります"};
    let add="";
    if(s.length>=9&&s.length<=12){add=`先頭の0を${13-s.length}個補った`+(s.length===12?"（元が12桁の UPC の可能性もあります）":"");s=z(s,13);}
    if(!add&&!notes.length) return {status:"ok",value:orig};
    return finish(s,add);
  }
  if(type==="fixed"){
    const w=Math.max(1,Math.min(30,+o.width||1));
    if(!/^\d+$/.test(s)) return {status:"check",value:orig,note:"数字以外が入っています"};
    if(s.length>w) return {status:"check",value:orig,note:`${s.length}桁あります（指定は${w}桁）`};
    let add="";
    if(s.length<w){add=`先頭の0を${w-s.length}個補った`;s=z(s,w);}
    if(!add&&!notes.length) return {status:"ok",value:orig};
    return finish(s,add);
  }
  return {status:"ok",value:orig};
}

/* 見出しから種類を推定 */
function guessType(name){
  const n=String(name||"").normalize("NFKC").toLowerCase();
  if(/郵便|〒|zip|postal|ゆうびん/.test(n)) return "zip";
  if(/電話|tel|携帯|fax|phone|連絡先/.test(n)) return "tel";
  if(/jan|gtin|ean|バーコード/.test(n)) return "jan";
  return "";
}

/* 列の様子：数字だけの値の桁数の分布、指数表記の数、例 */
function profile(rows,header){
  const ncol=rows.reduce((a,r)=>Math.max(a,r.length),0);
  const start=header?1:0;const cols=[];
  for(let c=0;c<ncol;c++){
    const lens={};let exp=0,dot0=0,filled=0,hy=0,plain7=0;const ex=[];
    for(let r=start;r<rows.length;r++){
      const v=(rows[r][c]||"").normalize("NFKC").trim();
      if(!v) continue;filled++;
      if(ex.length<3&&!ex.includes(v)) ex.push(v);
      if(parseExp(v)) exp++;
      else if(/^\d+\.0+$/.test(v)) dot0++;
      else if(/^\d+$/.test(v)){lens[v.length]=(lens[v.length]||0)+1;if(v.length===7)plain7++;}
      if(/^\d{3}-\d{4}$/.test(v.replace(/^〒\s*/,""))) hy++;
    }
    cols.push({index:c,name:header?(rows[0][c]||`列${c+1}`):`列${c+1}`,lens,exp,dot0,filled,examples:ex,zipHyphen:hy>plain7});
  }
  return cols;
}

/* 全体を処理する。settings: [{type,width}]（列ごと） */
function run(rows,header,settings,colsInfo){
  const out=rows.map(r=>r.slice());const list=[];
  const cnt={fixed:0,lost:0,check:0,ok:0};
  const start=header?1:0;
  settings.forEach((st,c)=>{
    if(!st||!st.type) return;
    const o={width:st.width,zipStyle:colsInfo&&colsInfo[c]&&colsInfo[c].zipHyphen?"hyphen":"plain"};
    for(let r=start;r<rows.length;r++){
      const j=judge(rows[r][c],st.type,o);
      if(j.status==="empty") continue;
      cnt[j.status]++;
      if(j.status==="fixed") out[r][c]=j.value;
      if(j.status!=="ok") list.push({row:r+1,col:c,colName:colsInfo?colsInfo[c].name:`列${c+1}`,before:rows[r][c],after:j.status==="fixed"?j.value:"",status:j.status,note:j.note||""});
    }
  });
  return {rows:out,list,cnt};
}

const STATUS_NAME={fixed:"直した",lost:"元に戻せない",check:"要確認"};

const api={readText,parseCSV,toCSV,encodeSJIS,encodeUTF8,parseExp,janCheck,judge,guessType,profile,run,STATUS_NAME};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Fukugen=api;
})(this);
