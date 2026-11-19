"use strict";
// 住所を「都道府県／市区町村／町域・番地／建物名」に分ける（辞書を使わない規則ベース）
(function(root){
const PREFS=["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
// 政令指定都市 → 都道府県
const SEIREI={"札幌市":"北海道","仙台市":"宮城県","さいたま市":"埼玉県","千葉市":"千葉県","横浜市":"神奈川県","川崎市":"神奈川県","相模原市":"神奈川県","新潟市":"新潟県","静岡市":"静岡県","浜松市":"静岡県","名古屋市":"愛知県","京都市":"京都府","大阪市":"大阪府","堺市":"大阪府","神戸市":"兵庫県","岡山市":"岡山県","広島市":"広島県","北九州市":"福岡県","福岡市":"福岡県","熊本市":"熊本県"};
const KU23=["千代田区","中央区","港区","新宿区","文京区","台東区","墨田区","江東区","品川区","目黒区","大田区","世田谷区","渋谷区","中野区","杉並区","豊島区","北区","荒川区","板橋区","練馬区","足立区","葛飾区","江戸川区"];
// 名前の途中に「市・町・村・区・郡」を含む自治体（単純な規則では切り損ねるもの）
const EXCEPT=["四日市市","廿日市市","野々市市","十日町市","大町市","東村山市","武蔵村山市","羽村市","大村市","田村市","蒲郡市","小郡市","大和郡山市","郡山市","郡上市","余市町","上市町","下市町","大町町","玉村町","上郡町","市川三郷町","市貝町","八丈町","村山市","町田市","市川市","市原市","村上市","郡家"];
const EXCEPT_SORTED=EXCEPT.filter(n=>n!=="郡家").sort((a,b)=>b.length-a.length);
const GUN_EXCEPT=["余市郡","高市郡","北村山郡","西村山郡","東村山郡"];

function clean(s){
  return String(s).replace(/[　\t]/g," ").replace(/ {2,}/g," ").trim();
}
function startsWithAny(s,list){for(const n of list){if(s.startsWith(n))return n;}return "";}

function splitCity(s){
  // 戻り値 [市区町村, 残り]
  let city="",rest=s.replace(/^ +/,"");
  const ex=startsWithAny(rest,EXCEPT_SORTED);
  if(ex){city=ex;rest=rest.slice(ex.length);}
  else{
    // 郡 + 町村
    let gun=startsWithAny(rest,GUN_EXCEPT);
    if(!gun){const m=rest.match(/^([^\s市区町村郡0-9０-９]{1,4}郡)/);if(m)gun=m[1];}
    if(gun){
      const r2=rest.slice(gun.length).replace(/^ +/,"");
      const ex2=startsWithAny(r2,EXCEPT_SORTED);
      if(ex2){return [gun+ex2,r2.slice(ex2.length)];}
      const m2=r2.match(/^([^\s0-9０-９]{1,6}?[町村])/);
      if(m2) return [gun+m2[1],r2.slice(m2[1].length)];
      return [gun,r2];
    }
    const m=rest.match(/^([^\s0-9０-９]{1,7}?[市区町村])/);
    if(!m) return ["",rest];
    city=m[1];rest=rest.slice(city.length);
  }
  // 政令指定都市の区
  if(SEIREI[city]){
    const r2=rest.replace(/^ +/,"");
    const m=r2.match(/^([^\s0-9０-９市]{1,4}?区)/);
    if(m){city+=m[1];rest=r2.slice(m[1].length);}
  }
  return [city,rest];
}

const NUM="[0-9０-９]";
const KNUM="[一二三四五六七八九十〇]";
const SEP="(?:丁目|番地の?|番の?|号|の|条[東西南北]?|線|地割|[-‐‑‒–—―−ー－ｰ])";
const CHAIN=new RegExp("(?:"+NUM+"+|"+KNUM+"+(?=丁目|番地|番(?!町)|号|条|地割))(?:"+SEP+"(?:"+NUM+"+|"+KNUM+"+(?=丁目|番地|番(?!町)|号|条|地割))?)*");

function splitBanchi(s){
  // 戻り値 [町域・番地, 建物名]
  const t=s.replace(/^ +/,"");
  const m=CHAIN.exec(t);
  if(!m) return [t.trim(),""];
  let end=m.index+m[0].length;
  let head=t.slice(0,end).replace(/[-‐‑‒–—―−ー－ｰ]+$/,"");
  let tail=t.slice(end);
  // 「1-2-3-401」のように部屋番号まで数字が続く場合はそのまま（勝手に分けない）
  tail=tail.replace(/^[ ,、，]+/,"").trim();
  return [head.trim(),tail];
}

function splitAddress(raw,opt){
  opt=opt||{};
  const s=clean(raw);
  const out={pref:"",city:"",town:"",building:"",ok:false,guessed:false};
  if(!s) return out;
  let rest=s.replace(/^〒?\s*[0-9０-９]{3}[-‐−ー－]?[0-9０-９]{4}\s*/,"");
  const p=startsWithAny(rest,PREFS);
  if(p){out.pref=p;rest=rest.slice(p.length);}
  const [city,r2]=splitCity(rest);
  out.city=city;
  if(!out.pref&&city&&opt.fillPref){
    const base=Object.keys(SEIREI).find(k=>city.startsWith(k));
    if(base){out.pref=SEIREI[base];out.guessed=true;}
    else if(KU23.includes(city)){out.pref="東京都";out.guessed=true;}
  }
  const [town,bld]=splitBanchi(r2);
  out.town=town;out.building=opt.splitBuilding===false?"":bld;
  if(opt.splitBuilding===false&&bld) out.town=(town+" "+bld).trim();
  out.ok=!!city;
  return out;
}

root.JushoSplit={splitAddress,PREFS};
})(typeof window!=="undefined"?window:globalThis);
