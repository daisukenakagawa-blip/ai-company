# 案3「AI が保守する LTS フォーク」：空白3件の確認と、既存の同型事業の発見（2026-11-25）

出典：npm 公式レジストリ（registry.npmjs.org の検索 API・パッケージ情報）、api.npmjs.org のダウンロード数、OSV（api.osv.dev）。取得日 2026-11-25。

## 空白の可能性3件の確認
| パッケージ | 週の DL | 最新版の脆弱性（OSV） | 修正版の受け皿 | 判定 |
|---|---|---|---|---|
| extract-zip | 27,413,068 | GHSA-7pqw-9j4j-h8q3・GHSA-jmr9-qjv8-65gv（シンボリックリンク経由の任意書き込み、High） | 【事実】`@keep-lts/extract-zip`（2026-11-07 公開、週753）。`@electron-internal/extract-zip`（Electron 内部用、外部利用は非対応と README に明記） | 空白ではない |
| showdown | 1,857,368 | GHSA-22g5・GHSA-cr32（XSS）ほか | 【事実】本家のリポジトリに修正コミット（e5cab1e）があるが npm の最新は 2.1.0（2022-04）のまま。受け皿の fork は検索で見つからず | 空白の可能性（本家が出せば消える） |
| parseuri | 2,168,771 | GHSA-6fx8-h7jm-663j | 【推測】この記録の本体は別パッケージ「parse-uri」（Kikobeats）の ReDoS。parseuri 3.x は別作者の書き直しで、誤った対応付けの可能性 | 誤検知の可能性が高い（未確定） |

## 最も重要な発見：同じ事業が既に無料で行われている
- 【事実】npm の `@keep-lts` スコープが「Security-maintained drop-in fork」を少なくとも12件公開（xlsx・extract-zip・ip・html-minifier・expr-eval ほか、2026-06 から）。導入は `overrides` 1行という、当社が考えた形とほぼ同じ
- 【事実】週の DL：@keep-lts/xlsx 17,890（本家 xlsx 15,083,734 の約0.12%）、@keep-lts/extract-zip 753（本家の約0.003%）、その他は 5〜447
- 【事実】同型の個人 fork が他にも：exceljs-hardened（週108,241）、vue-template-compiler-patched（週11,726）、@lastboy/vue2（週1,658）
- 【事実】例外的に大きいもの：uri-js-replace（週17,204,738）。【推測】有名パッケージが依存先として採用したためで、個人の発見ではない（依存元は未確認）

## 結論
- 【推測】「AI で修正 fork を作って公開する」部分は、すでに無料で誰かがやっており、価値の源泉ではない。公開しても使われる割合は本家の0.1%前後かそれ以下
- 支払いが起きているのは HeroDevs 型の「保証・契約・信用」の部分で、無名の会社が0円で作れる資産ではない
- 当初の承認が必要な実験（空白の1件を npm に公開して依存数を測る）は、keep-lts の実績で結果がほぼ分かる（依存は極小）。**この実験は承認依頼にしない**
- 分類：B → C（需要は HeroDevs で確認済みだが、当社が払ってもらえる部分＝信用が無い）。研究を止め、資源を案1・案2 に回す
- 改善案（記録のみ）：fork そのものではなく「依存の木のどこに未修正があるかを、overrides の1行つきで毎日知らせる」監視は、既存のスキャナー（Dependabot・Snyk の無料枠）で代替される。採らない
