/* 2つの CSV の差分比較（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";

// 比較用に値を正規化する（表示・出力は元の値のまま）
function norm(v,o){
  let s=v==null?"":String(v);
  if(o.width) s=s.normalize("NFKC");
  if(o.space) s=s.replace(/[\s　]+/g," ").trim();
  if(o.caseI) s=s.toLowerCase();
  if(o.num&&!/^[-+]?0\d/.test(s)&&/^[-+]?[\d,]*\.?\d+$/.test(s.replace(/[,\s]/g,""))&&/\d/.test(s)){
    const n=Number(s.replace(/[,\s]/g,""));
    if(isFinite(n)) s=String(n);
  }
  return s;
}

// 見出しの対応（同じ名前の列どうし。前後の空白と全角半角の違いは同一とみなす）
function matchColumns(hA,hB){
  const key=h=>String(h||"").normalize("NFKC").trim();
  const mapB=new Map();
  hB.forEach((h,i)=>{const k=key(h);if(k!==""&&!mapB.has(k))mapB.set(k,i);});
  const pairs=[],onlyA=[],used=new Set();
  hA.forEach((h,i)=>{
    const k=key(h);
    if(k!==""&&mapB.has(k)&&!used.has(mapB.get(k))){pairs.push({name:hB[mapB.get(k)]||h,a:i,b:mapB.get(k)});used.add(mapB.get(k));}
    else onlyA.push({name:h,a:i});
  });
  const onlyB=hB.map((h,i)=>({name:h,b:i})).filter(x=>!used.has(x.b));
  return {pairs,onlyA,onlyB};
}

// キー列の推定：両方にあり、値がほぼ重複しない列。見出しの名前も手がかりにする
function guessKey(hA,rowsA,hB,rowsB){
  const {pairs}=matchColumns(hA,hB);
  let best=-1,score=-1;
  pairs.forEach((p,idx)=>{
    const va=rowsA.map(r=>(r[p.a]||"").trim()),vb=rowsB.map(r=>(r[p.b]||"").trim());
    const filled=va.filter(Boolean).length/Math.max(va.length,1);
    const uniq=new Set(va.filter(Boolean)).size/Math.max(va.filter(Boolean).length,1);
    const uniqB=new Set(vb.filter(Boolean)).size/Math.max(vb.filter(Boolean).length,1);
    let s=filled*uniq*uniqB*10;
    if(/id|ＩＤ|番号|コード|code|no\.?$|№|ナンバー|key|キー|sku|jan/i.test(String(p.name))) s+=5;
    if(/電話|tel|日付|日時|date|金額|価格|数量|住所/i.test(String(p.name))) s-=4;
    if(idx===0) s+=0.5;
    if(s>score){score=s;best=idx;}
  });
  return best<0?[]:[best];
}

// 差分を計算する
// A=比較の元（古い方）、B=比較先（新しい方）。keys = pairs の添字の配列（空なら行の順番で比較）
function diff(hA,rowsA,hB,rowsB,keys,o){
  o=o||{};
  const cols=matchColumns(hA,hB);
  const P=cols.pairs;
  const keyOf=(r,side)=>keys.map(k=>norm(r[P[k][side]]||"",o)).join("\u0001");
  const out=[],dupA=[],dupB=[],emptyKey={a:0,b:0};
  let nAdd=0,nDel=0,nChg=0,nSame=0;
  const cmpRow=(ra,rb)=>{
    const changed=[];
    P.forEach((p,i)=>{
      if(keys.includes(i)) return;
      const x=ra[p.a]==null?"":ra[p.a], y=rb[p.b]==null?"":rb[p.b];
      if(norm(x,o)!==norm(y,o)) changed.push({col:i,from:x,to:y});
    });
    return changed;
  };
  if(!keys.length){
    const n=Math.max(rowsA.length,rowsB.length);
    for(let i=0;i<n;i++){
      const ra=rowsA[i],rb=rowsB[i];
      if(ra&&!rb){out.push({kind:"del",a:ra,lineA:i+1});nDel++;}
      else if(!ra&&rb){out.push({kind:"add",b:rb,lineB:i+1});nAdd++;}
      else{const c=cmpRow(ra,rb);if(c.length){out.push({kind:"chg",a:ra,b:rb,changed:c,lineA:i+1,lineB:i+1});nChg++;}else{out.push({kind:"same",a:ra,b:rb,lineA:i+1,lineB:i+1});nSame++;}}
    }
  }else{
    const mapA=new Map(),mapB=new Map();
    rowsA.forEach((r,i)=>{const k=keyOf(r,"a");if(k.replace(/\u0001/g,"")===""){emptyKey.a++;}if(mapA.has(k)){dupA.push({key:k,line:i+1});return;}mapA.set(k,i);});
    rowsB.forEach((r,i)=>{const k=keyOf(r,"b");if(k.replace(/\u0001/g,"")===""){emptyKey.b++;}if(mapB.has(k)){dupB.push({key:k,line:i+1});return;}mapB.set(k,i);});
    // B の順番で並べ、削除行はA側の元の位置付近に入れる
    rowsB.forEach((rb,j)=>{
      const k=keyOf(rb,"b");
      if(mapB.get(k)!==j) return; // 重複（2件目以降）は別に報告
      if(!mapA.has(k)){out.push({kind:"add",b:rb,lineB:j+1,key:k});nAdd++;return;}
      const i=mapA.get(k),ra=rowsA[i];
      const c=cmpRow(ra,rb);
      if(c.length){out.push({kind:"chg",a:ra,b:rb,changed:c,lineA:i+1,lineB:j+1,key:k});nChg++;}
      else{out.push({kind:"same",a:ra,b:rb,lineA:i+1,lineB:j+1,key:k});nSame++;}
    });
    rowsA.forEach((ra,i)=>{
      const k=keyOf(ra,"a");
      if(mapA.get(k)!==i) return;
      if(!mapB.has(k)){out.push({kind:"del",a:ra,lineA:i+1,key:k});nDel++;}
    });
  }
  return {rows:out,cols,keys,nAdd,nDel,nChg,nSame,dupA,dupB,emptyKey};
}

// 結果を CSV 用の2次元配列にする
function toTable(res,kinds){
  const P=res.cols.pairs;
  const label={add:"追加",del:"削除",chg:"変更",same:"変更なし"};
  const head=["区分","変更した列","変更の内容"].concat(P.map(p=>p.name));
  const rows=[head];
  res.rows.forEach(r=>{
    if(!kinds.includes(r.kind)) return;
    const src=r.kind==="del"?r.a:r.b, side=r.kind==="del"?"a":"b";
    const ch=r.changed||[];
    rows.push([label[r.kind],ch.map(c=>P[c.col].name).join("・"),ch.map(c=>`${P[c.col].name}：${c.from} → ${c.to}`).join(" ／ ")]
      .concat(P.map(p=>src[p[side]]==null?"":src[p[side]])));
  });
  return rows;
}

const api={norm,matchColumns,guessKey,diff,toTable};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Sabun=api;
})(this);
