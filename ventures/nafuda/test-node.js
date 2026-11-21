// 関数テスト（node test-node.js）
const N = require("./nafuda.js"); let ng = 0;
const t = (n, c) => { if (!c) { ng++; console.log("NG:", n); } else console.log("OK:", n); };
let m = N.guessColumns(["No", "氏名", "フリガナ", "会社名", "部署", "役職", "区分", "テーブル"]);
t("列の推定（氏名・フリガナ・会社名・部署・役職・区分・テーブル）", m.name === 1 && m.kana === 2 && m.org === 3 && m.dept === 4 && m.title === 5 && m.cat === 6 && m.table === 7);
m = N.guessColumns(["姓", "名", "セイ", "メイ", "所属（会社）"]);
t("姓・名・セイ・メイ・所属（括弧つき）", m.sei === 0 && m.mei === 1 && m.kanaSei === 2 && m.kanaMei === 3 && m.org === 4);
t("「会社名」を名と取り違えない", N.guessColumns(["会社名", "名"]).mei === 1);
let r = N.record(["山田", "太郎", "ヤマダ", "タロウ", "見本"], m);
t("姓＋名を全角スペースでつなぐ", r.name === "山田　太郎" && r.kana === "ヤマダ　タロウ" && r.org === "見本");
r = N.record(["山田 太郎"], { name: 0 });
t("氏名の半角スペースを全角に", r.name === "山田　太郎");
t("空行は除く", N.records([["", ""], ["a", ""]], { name: 0 }).length === 1);
const recs = [{ name: "B", kana: "わたなべ", table: "10", src: 0 }, { name: "A", kana: "アオキ", table: "2", src: 1 }, { name: "", org: "C", kana: "", table: "", src: 2 }];
t("ふりがな順（カタカナもひらがなとして）", N.sortRecs(recs, "kana").map(x => x.src).join() === "1,0,2");
t("卓は自然順（2 → 10）、空欄は最後", N.sortRecs(recs, "table").map(x => x.src).join() === "1,0,2");
for (const k in N.PRESETS) t("用紙 " + k + " は A4 に収まる", N.checkSheet(N.PRESETS[k]).length === 0);
t("はみ出す寸法はエラー", N.checkSheet({ kind: "tent", w: 100, h: 80, cols: 2, rows: 2, left: 5, top: 0, gx: 0, gy: 0 }).length === 1);
const P = N.positions(12, N.PRESETS.meishi10, 3);
t("途中から：1件目は4面目（2段目の右）", P[0].page === 0 && P[0].col === 1 && P[0].row === 1 && P[0].x === 105 && P[0].y === 66);
t("途中から：8件目で2ページ目", P[6].page === 0 && P[7].page === 1 && N.pageCount(12, N.PRESETS.meishi10, 3) === 2);
const T = N.positions(5, N.PRESETS.tent91, 0);
t("席札は高さ2倍で並ぶ", T[2].y === 38.5 + 110 && T[4].page === 1);
// 札の中身が札の中に収まる
const long = { name: "勅使河原　左右衛門之丞", kana: "てしがわら　さえもんのじょう", org: "長い名前の見本株式会社 東日本営業本部", dept: "第一営業部 法人営業課", title: "課長代理", cat: "参加者", table: "4" };
for (const k of ["meishi10", "tent91", "tentA4"]) for (const fit of ["condense", "shrink"]) {
  const s = N.PRESETS[k], it = N.layoutFace(long, s.w, s.h, { keisho: "様", band: "cat", event: "忘年会", showTable: true, fit });
  const inside = it.every(x => x.x >= 0 && x.y >= -0.01 && x.x + x.w <= s.w + 0.01 && x.y + x.h <= s.h + 0.01);
  const fitsW = it.filter(x => x.s).every(x => (N.textEm(x.s + (x.keisho ? "　" : "")) + (x.keisho ? N.textEm(x.keisho) * 0.7 : 0)) * x.fs * (x.sx || 1) <= x.w + 0.5);
  t(k + " " + fit + "：長い名前でも札の中に収まる", inside && fitsW);
}
let it = N.layoutFace({ name: "田中　健" }, 91, 55, { fit: "condense" });
t("短い名前は縮めない（約14mm）", Math.abs(it[0].fs - 55 * 0.26) < 0.01 && it[0].sx === 1);
it = N.layoutFace(long, 91, 55, { fit: "condense" });
t("横に詰める：名前は 0.6 倍まで横だけ縮む", it.find(x => x.k === "name").sx >= 0.6);
it = N.layoutFace({ name: "", org: "", kana: "" }, 91, 55, {});
t("空欄の札は「お名前」と線", it.some(x => x.k === "blank") && it.some(x => x.k === "line"));
t("小さすぎる判定", N.tooSmall([{ k: "name", fs: 2, sx: 1 }]) && !N.tooSmall(N.layoutFace(long, 91, 55, { fit: "condense" })));
console.log(ng ? ng + " 件 NG" : "すべて OK"); process.exit(ng ? 1 : 0);
