import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../src/core.js');
const orders = C.groupOrders(C.parseCsv(readFileSync(new URL('./sample-orders.csv', import.meta.url), 'utf8')));
const S = { senderName: 'テスト茶舗', senderPhone: '03-1111-2222', senderZip: '1000005', senderAddress: '東京都千代田区丸の内1-1', billingCode: '0123456789', freightNo: '01', type: '0', shipDate: '2026/11/28', time: '1416', skipFulfilled: true };

test('注文ごとにまとめ、配送不要の商品は除く', () => {
  const o = orders.find((x) => x.order === '#1001');
  assert.deepEqual(o.items.map((i) => i.name), ['オーガニック緑茶 100g', '湯のみ']);
  assert.equal(C.itemLabel(o.items), 'オーガニック緑茶 100g ×2 他1点');
});
test('都道府県コード・電話（+81）・郵便番号の正規化、住所の重複を付けない', () => {
  const o = orders.find((x) => x.order === '#1001');
  assert.equal(o.address, '東京都千代田区千代田1-1'); assert.equal(o.phone, '090-1234-5678'); assert.equal(o.zip, '100-0001');
  const o2 = orders.find((x) => x.order === '#1002');
  assert.equal(o2.address, '大阪府大阪市北区梅田3-1-1');
  assert.equal(C.prefecture('', 'Hokkaido'), '北海道'); assert.equal(C.prefecture('JP-47', ''), '沖縄県');
});
test('B2：97列、必須の列、除外と警告', () => {
  const r = C.toB2(orders, S);
  assert.deepEqual(r.errors, []);
  assert.ok(r.rows.every((x) => x.length === 97));
  const a = r.rows.find((x) => x[0] === '1001');
  assert.equal(a[1], '0'); assert.equal(a[4], '2026/11/28'); assert.equal(a[6], '1416'); assert.equal(a[8], '090-1234-5678'); assert.equal(a[10], '100-0001');
  assert.equal(a[11], '東京都千代田区千代田1-1'); assert.equal(a[12], 'グランドマンション101'); assert.equal(a[15], '山田 太郎'); assert.equal(a[17], '様');
  assert.equal(a[19], '03-1111-2222'); assert.equal(a[21], '100-0005'); assert.equal(a[24], 'テスト茶舗'); assert.equal(a[39], '0123456789'); assert.equal(a[41], '01');
  const ids = r.rows.map((x) => x[0]);
  assert.deepEqual(ids.sort(), ['1001', '1002']); // #1006 は住所が長すぎて収まらないため出さない
  const w = r.warnings.join('\n');
  assert.match(w, /#1003.*Shift_JIS にない文字：𠮷/); // 髙 は CP932 にあるので通る、𠮷 は無い
  assert.match(w, /#1004.*キャンセル/); assert.match(w, /#1005.*海外/); assert.match(w, /#1006.*建物名の欄/); assert.match(w, /#1007.*電話番号が無い/);
  assert.match(w, /#1006.*建物名が全角16字を超える/);
  const o = { ...orders.find((x) => x.order === '#1002'), order: '#2000', address: '大阪府大阪市北区梅田三丁目一番一号大阪ステーションシティノースゲートビルディング', building: '' };
  const r2 = C.toB2([o], S);
  assert.equal(r2.rows.length, 1); assert.ok(C.width(r2.rows[0][11]) <= 64 && r2.rows[0][12] === 'ートビルディング');
});
test('B2：設定の誤りは出力せずに知らせる', () => {
  const r = C.toB2(orders, { ...S, billingCode: '123', shipDate: '2026-11-28' });
  assert.equal(r.rows.length, 0); assert.equal(r.errors.length, 2);
});
test('クリックポスト：40件ごと・住所4行・内容品', () => {
  const many = Array.from({ length: 85 }, (_, i) => ({ order: '#' + i, name: '山田 太郎', zip: '100-0001', phone: '', address: '東京都千代田区千代田1-1', building: '', company: '', country: 'JP', items: [{ name: '本', qty: 1 }] }));
  const r = C.toClickPost(many, { contents: '書籍' });
  assert.deepEqual(r.files.map((f) => f.length), [40, 40, 5]);
  assert.deepEqual(r.files[0][0], ['100-0001', '山田 太郎', '様', '東京都千代田区千代田1-1', '', '', '', '書籍']);
});
test('Shift_JIS：髙・半角カナ・記号は変換でき、𠮷 は見つける', () => {
  const e = C.encodeSjis('髙ｱｲ①〒');
  assert.deepEqual(e.bad, []); assert.ok(e.bytes.length >= 7);
  assert.deepEqual(C.unsupportedChars('𠮷野家'), ['𠮷']);
  const round = new TextDecoder('shift_jis').decode(C.encodeSjis('東京都千代田区').bytes);
  assert.equal(round, '東京都千代田区');
});
test('CSV の書き出し：引用符・カンマ', () => {
  assert.equal(C.toCsv([['a,b', 'c"d']], ['x', 'y']), 'x,y\r\n"a,b","c""d"\r\n');
});
