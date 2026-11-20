/* 氏名の姓名分割とふりがな統一（ブラウザ内で完結。外部通信なし） */
(function(root){
"use strict";
// よくある姓（空白のない氏名を分けるときの手がかり。長いものから順に照合する）
const SURNAMES=("佐藤 鈴木 高橋 田中 伊藤 渡辺 渡邊 渡邉 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 斎藤 斉藤 齋藤 齊藤 清水 山崎 山﨑 森 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 松田 竹内 中川 小野 田村 中山 和田 石田 森田 上田 原 柴田 酒井 工藤 横山 宮崎 宮本 内田 高木 安藤 島田 谷口 大野 高田 丸山 今井 河野 藤本 村田 武田 上野 杉山 増田 小山 大塚 平野 菅原 久保 松井 千葉 岩崎 桜井 櫻井 木下 野口 松尾 菊地 菊池 野村 新井 渡部 佐野 杉本 古川 大西 浜田 濱田 市川 小松 水野 西田 吉川 中西 北村 五十嵐 福島 菅野 栗原 田辺 田邊 川口 秋山 永井 中田 本田 小池 須藤 宮田 山内 吉村 荒木 大橋 高野 安田 小島 飯田 岩田 桑原 西川 川村 辻 松下 内藤 尾崎 星野 関 堀 大久保 石原 片山 平田 服部 吉岡 熊谷 黒田 川崎 永田 足立 小田 大川 樋口 河合 浅野 早川 松岡 岩本 北川 宮下 中尾 岡崎 土屋 堤 青山 小西 上原 根本 中井 望月 野田 小澤 小沢 牧野 大谷 吉野 西山 松浦 今村 堀内 川上 荒井 宮内 細川 坂口 中谷 植田 植松 森本 大石 平井 鈴村 富田 伊東 堀江 浅井 西尾 大島 中本 落合 本間 武藤 小原 宇野 稲葉 二宮 白石 松村 坂田 原口 大森 飯塚 小森 小倉 竹田 竹下 米田 島崎 川原 長田 長尾 長島 長沢 長澤 佐久間 北野 久保田 奥村 奥田 森下 森山 宮川 宮原 横田 村井 岡 江口 江藤 東海林 関口 関根 篠原 篠田 榎本 栗田 有田 三宅 三上 三好 三木 水谷 溝口 矢野 八木 安井 山中 山根 山川 山岸 石橋 石黒 石塚 大山 大川原 小笠原 神田 野崎 野中 福井 福本 福原 藤川 藤野 藤沢 藤澤 古田 本多 前川 増井 松山 松永 丸田 宮城 武井 村山 茂木 森川 森岡 守屋 矢島 柳田 吉本 若林 和久井 金城 比嘉 大城 宮里 新垣 島袋 玉城 上地 知念 仲宗根 東江 喜屋武 勅使河原 小野寺 小野田 長谷部 五味 一ノ瀬 一之瀬 二階堂 武者小路").split(" ");
const SN=Array.from(new Set(SURNAMES)).sort((a,b)=>b.length-a.length);

function toFullKana(s){
  // 半角カナ→全角（濁点も結合）。英数字・記号は変えない
  return s.replace(/[｡-ﾟ]+/g,m=>m.normalize("NFKC"));
}
function kata2hira(s){return s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));}
function hira2kata(s){return s.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));}
function cleanSpaces(s){return s.replace(/[\s　]+/g," ").trim();}

/* 氏名を姓・名に分ける。戻り値 {sei, mei, status: "ok"|"guess"|"ng"|"empty", note} */
function splitName(v,opt){
  opt=opt||{};
  let s=String(v==null?"":v);
  if(opt.fullKana!==false) s=toFullKana(s);
  s=cleanSpaces(s);
  if(!s) return {sei:"",mei:"",status:"empty",note:""};
  const parts=s.split(" ");
  if(parts.length===2) return {sei:parts[0],mei:parts[1],status:"ok",note:""};
  if(parts.length>2) return {sei:parts[0],mei:parts.slice(1).join(" "),status:"ng",note:"空白が2か所以上あります"};
  // 空白なし
  if(/[A-Za-zＡ-Ｚａ-ｚ・･]/.test(s)) return {sei:s,mei:"",status:"ng",note:"区切りが分かりません"};
  if(opt.useDict!==false){
    for(const n of SN){
      if(s.startsWith(n) && s.length-n.length>=1) return {sei:n,mei:s.slice(n.length),status:"guess",note:"よくある姓から推定"};
    }
  }
  return {sei:s,mei:"",status:"ng",note:"区切りが分かりません"};
}

/* ふりがなを統一する。kind: "kata"|"hira"。戻り値 {text, sei, mei, split:boolean, bad:boolean} */
function normalizeKana(v,kind){
  let s=cleanSpaces(toFullKana(String(v==null?"":v)));
  s=kind==="hira"?kata2hira(s):hira2kata(s);
  if(kind==="hira") s=s.replace(/ヴ/g,"ゔ");
  const bad=s!=="" && !/^[ぁ-ゖァ-ヺー・ ゔヴ]+$/.test(s);
  const p=s.split(" ");
  return {text:s, sei:p[0]||"", mei:p.slice(1).join(" "), split:p.length===2, bad};
}

const api={splitName,normalizeKana,toFullKana,kata2hira,hira2kata,SURNAMES:SN};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Shimei=api;
})(this);
