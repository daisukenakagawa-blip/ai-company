# 12日目 Market Gap Engine（2026-11-25、直近14日の GitHub 公開 Issue 964件）

`signals-2026-11-25.md`。最大でもリポジトリ数2（Ingress・Last.fm・SQLite）。リポジトリ数は利用者数ではない。

## 本物の市場変化と判断したもの：Last.fm API の有料化（12/1）
- 【事実・公式投稿の転載で確認】Last.fm 公式サポートフォーラムの投稿（2026-11-18、https://support.last.fm/t/api-keys-will-require-pro-from-1st-december/121030 。実行環境から直接は読めず、転載 https://forum.devtalk.com/t/api-keys-will-require-pro-from-1st-december/251856 で本文を確認）：
  - "From the 1st December, holding a Last.fm API key will require a Last.fm Pro subscription."
  - "existing keys without it will stop working until you subscribe."
  - "This applies to whoever owns the key in the app or service." 利用者は不要、キーの持ち主（開発者）が払う
- 【事実】影響の記録：Home Assistant core の issue #194071（11/24）、public-apis #9351、multi-scrobbler #789 ほか、今回の検出で2件
- 【未確認】Pro の価格（転載記事 portalzine.de によれば月4.99ユーロ・年49.99ユーロ、公式で未確認）。影響を受けるアプリ・利用者数は未確認
- 代替：ListenBrainz（記録の送信は Last.fm 互換の受け口あり、読み出しは独自 API）、Libre.fm ほか

### 市場機会の評価
| 項目 | 評価 |
|---|---|
| 影響を受ける利用者の規模 | 未確認（Last.fm 連携の趣味のアプリ・自宅サーバー向けが中心と見られる＝推測） |
| 既存利用者が払っていた金額 | 0円（無料の API キー） |
| 移行期限 | 2026-12-01（6日後） |
| 既存の代替 | Last.fm Pro を払う（約月5ユーロ）／ListenBrainz（無料） |
| 代替の欠点 | ListenBrainz は読み出し API の形が違い、コードの書き換えが要る |
| 新サービスに移る理由 | 「Last.fm と同じ API の形で ListenBrainz のデータを返す受け皿」なら書き換え不要（Continuity Relay 型） |
| 合法的な到達方法 | 各アプリの issue を見た開発者が探す。頼まれていない書き込みは不可 |
| 自動集客 | 期限の直後に「Last.fm API alternative」で探す流れはある（推測） |
| 開発費用・運用費 | 0円で試作可。ただし読み出しの互換は範囲が広い |
| 継続課金 | **弱い**。比較対象が月約5ユーロの公式 Pro で、それより安くないと選ばれない |
| 模倣困難性 | 低い。ListenBrainz 自身が互換を広げれば消える |
| 機会が消える時期 | 12/1 前後の数週間 |
| 合格条件7項目 | ①需要の証拠：あり（issue 複数）②購入者：趣味の開発者中心で不明確 ③支払う理由：公式 Pro が安く弱い ④到達：issue 経由のみ ⑤自動納品：可 ⑥収益性：不可（月5ユーロ未満の単価）⑦優位性：なし → **不合格** |
- Ver.2.3 の Continuity Relay の条件「止まると利用者の売上が止まる API に限る」にも当たらない（主に趣味の用途）。**不採用（C）**。学び：「無料だった API の有料化」は、新しい価格が安いと受け皿の事業にならない

## その他の手がかり（記録のみ）
- Claude Haiku 4.5 の提供終了に備えたモデル移行（1件）：20案の6（移行コードの自動修正）の例。単独では弱い
- Cloud TPU API の廃止（vLLM、1件）、Bugsnag→Flare（1件）：いずれも規模が小さい
