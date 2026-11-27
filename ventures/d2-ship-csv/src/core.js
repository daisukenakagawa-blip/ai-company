// Shopify の注文 CSV → 送り状ソフトの取り込み CSV（ヤマト B2クラウド・日本郵便クリックポスト）
// すべてブラウザの中で処理する（注文データを外部に送らない）。Node の試験でも同じコードを使う。
// 仕様の出典：B2クラウド「送り状発行データレイアウト 入出力用」（bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf、C-09）、
//            クリックポスト「まとめ申込 詳細フロー」（clickpost.jp）、Shopify ヘルプ「注文をエクスポートする」。2026-11-27 確認
(function (root) {
  'use strict';

  // ---- CSV の読み書き（RFC 4180） ----
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) return [];
    const h = rows[0].map((s) => s.trim());
    return rows.slice(1).map((r) => { const o = {}; h.forEach((k, i) => { if (!(k in o)) o[k] = r[i] ?? ''; }); return o; });
  }
  function toCsv(rows, header) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = (header ? [header] : []).concat(rows).map((r) => r.map(esc).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  // ---- Shift_JIS（CP932）への変換：ブラウザ・Node 標準の TextDecoder から逆引き表を作る（外部ライブラリを使わない） ----
  let SJIS = null;
  function sjisTable() {
    if (SJIS) return SJIS;
    const d = new TextDecoder('shift_jis'); const m = new Map();
    for (let a = 0x81; a <= 0xfc; a++) {
      if (a > 0x9f && a < 0xe0) continue;
      for (let b = 0x40; b <= 0xfc; b++) {
        if (b === 0x7f) continue;
        const s = d.decode(new Uint8Array([a, b]));
        if (s.length === 1 && s !== '�' && !m.has(s)) m.set(s, [a, b]);
      }
    }
    for (let b = 0xa1; b <= 0xdf; b++) m.set(String.fromCharCode(0xff61 + b - 0xa1), [b]); // 半角カナ
    SJIS = m; return m;
  }
  // 変換できない文字は '?' にせず一覧で返す（呼び出し側で警告する）
  function encodeSjis(str) {
    const m = sjisTable(); const out = []; const bad = new Set();
    for (const ch of str) {
      const c = ch.codePointAt(0);
      if (c < 0x80) { out.push(c); continue; }
      const v = m.get(ch);
      if (v) out.push(...v); else { bad.add(ch); out.push(0x3f); }
    }
    return { bytes: new Uint8Array(out), bad: [...bad] };
  }
  function unsupportedChars(str) { const m = sjisTable(); return [...new Set([...str].filter((ch) => ch.codePointAt(0) >= 0x80 && !m.has(ch)))]; }

  // ---- 文字数（全角=2・半角=1）と切り詰め ----
  const isHalf = (ch) => { const c = ch.codePointAt(0); return c < 0x80 || (c >= 0xff61 && c <= 0xff9f); };
  const width = (s) => [...(s || '')].reduce((n, ch) => n + (isHalf(ch) ? 1 : 2), 0);
  function cut(s, maxWidth) { let w = 0, out = ''; for (const ch of s || '') { const cw = isHalf(ch) ? 1 : 2; if (w + cw > maxWidth) break; out += ch; w += cw; } return out; }
  // 長い文字列を maxWidth ごとに分ける（住所の行分け）
  function split(s, maxWidth, parts) {
    const res = []; let rest = s || '';
    for (let i = 0; i < parts; i++) { const p = cut(rest, maxWidth); res.push(p); rest = rest.slice(p.length); }
    return { parts: res, overflow: rest };
  }

  // ---- 正規化 ----
  const PREF = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  const PREF_EN = ['Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima', 'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo', 'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi', 'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki', 'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa'];
  function prefecture(code, name) {
    const n = (name || '').trim();
    if (PREF.includes(n)) return n;
    const m = /^JP-(\d{2})$/.exec((code || '').trim());
    if (m && +m[1] >= 1 && +m[1] <= 47) return PREF[+m[1] - 1];
    const i = PREF_EN.findIndex((e) => e.toLowerCase() === n.toLowerCase() || e.toLowerCase() === (code || '').trim().toLowerCase());
    return i >= 0 ? PREF[i] : n;
  }
  const z2h = (s) => (s || '').replace(/[０-９＋－ー―‐]/g, (c) => ({ '＋': '+', '－': '-', 'ー': '-', '―': '-', '‐': '-' }[c] || String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  function phone(s) {
    let p = z2h(s).replace(/[\s()（）]/g, '');
    if (/^\+81/.test(p)) p = '0' + p.slice(3).replace(/^-/, '');
    if (/^81\d{9,10}$/.test(p)) p = '0' + p.slice(2);
    return p.replace(/[^\d-]/g, '');
  }
  function zip(s) { const d = z2h(s).replace(/\D/g, ''); return d.length === 7 ? d.slice(0, 3) + '-' + d.slice(3) : d; }

  // ---- 注文ごとにまとめる（Shopify は商品ごとに1行。2行目以降は注文の項目が空） ----
  function groupOrders(rows) {
    const map = new Map();
    for (const r of rows) {
      const key = r['Name'] || r['Id']; if (!key) continue;
      let o = map.get(key);
      if (!o) { o = { name: key, first: r, items: [] }; map.set(key, o); }
      if (r['Lineitem name']) {
        const needs = String(r['Lineitem requires shipping'] || 'true').toLowerCase() !== 'false';
        if (needs) o.items.push({ name: r['Lineitem name'], qty: Number(r['Lineitem quantity'] || 1), sku: r['Lineitem SKU'] || '' });
      }
    }
    return [...map.values()].map((o) => {
      const f = o.first;
      const pref = prefecture(f['Shipping Province'], f['Shipping Province Name']);
      const city = (f['Shipping City'] || '').trim();
      let a1 = (f['Shipping Address1'] || f['Shipping Street'] || '').trim();
      const a2 = (f['Shipping Address2'] || '').trim();
      // 住所1に都道府県・市区町村が既に入っている店もあるので、重ねて付けない
      let addr = a1;
      if (city && !addr.includes(city)) addr = city + addr;
      if (pref && !addr.startsWith(pref)) addr = pref + addr;
      return { order: o.name, name: (f['Shipping Name'] || f['Billing Name'] || '').trim(), company: (f['Shipping Company'] || '').trim(),
               zip: zip(f['Shipping Zip']), phone: phone(f['Shipping Phone'] || f['Phone'] || f['Billing Phone']), address: addr, building: a2,
               country: (f['Shipping Country'] || '').trim(), items: o.items, cancelled: !!(f['Cancelled at'] || f['Canceled at']),
               fulfilled: (f['Fulfillment Status'] || '').toLowerCase() === 'fulfilled' };
    });
  }

  function itemLabel(items) {
    if (!items.length) return '';
    const n = items.reduce((s, it) => s + it.qty, 0);
    const head = items[0].name + (items[0].qty > 1 ? ` ×${items[0].qty}` : '');
    return items.length === 1 ? head : `${head} 他${n - items[0].qty}点`;
  }

  // ---- ヤマト B2クラウド（外部データ取り込み、基本レイアウト97列のうち必要な列） ----
  const B2_HEADER = ['お客様管理番号', '送り状種類', 'クール区分', '伝票番号', '出荷予定日', 'お届け予定（指定）日', '配達時間帯', 'お届け先コード', 'お届け先電話番号', 'お届け先電話番号枝番', 'お届け先郵便番号', 'お届け先住所', 'お届け先アパートマンション名', 'お届け先会社・部門名１', 'お届け先会社・部門名２', 'お届け先名', 'お届け先名略称カナ', '敬称', 'ご依頼主コード', 'ご依頼主電話番号', 'ご依頼主電話番号枝番', 'ご依頼主郵便番号', 'ご依頼主住所', 'ご依頼主アパートマンション名', 'ご依頼主名', 'ご依頼主略称カナ', '品名コード１', '品名１', '品名コード２', '品名２', '荷扱い１', '荷扱い２', '記事', 'コレクト代金引換額（税込)', '内消費税額等', '止置き', '営業所コード', '発行枚数', '個数口表示フラグ', '請求先顧客コード', '請求先分類コード', '運賃管理番号'];
  // 43〜97列目（webコレクト・e メール通知・収納代行・検索キーなど）は空欄で出す。列の数は仕様の97列にそろえる
  const B2_COLS = 97;
  for (let i = B2_HEADER.length + 1; i <= B2_COLS; i++) B2_HEADER.push(`項目${i}`);
  const B2_TYPES = { '0': '発払い', '8': '宅急便コンパクト', 'A': 'ネコポス', '7': 'クロネコゆうパケット', '3': 'クロネコゆうメール' };
  const B2_TIMES = ['', '0812', '1416', '1618', '1820', '1921'];

  function toB2(orders, s) {
    const errors = [], warnings = [], rows = [];
    const need = (v, label) => { if (!v) errors.push(`設定：${label}が空です`); };
    need(s.senderName, 'ご依頼主名'); need(s.senderPhone, 'ご依頼主電話番号'); need(s.senderZip, 'ご依頼主郵便番号'); need(s.senderAddress, 'ご依頼主住所');
    if (!/^\d{10,12}$/.test(s.billingCode || '')) errors.push('設定：請求先顧客コードは10〜12桁の数字（ヤマトとの契約の番号）');
    if (!/^\d{2}$/.test(s.freightNo || '')) errors.push('設定：運賃管理番号は2桁の数字（通常は01）');
    if (!B2_TYPES[s.type]) errors.push('設定：送り状種類が不正');
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(s.shipDate || '')) errors.push('設定：出荷予定日は YYYY/MM/DD');
    if (s.time && !B2_TIMES.includes(s.time)) errors.push('設定：配達時間帯が不正');
    if (errors.length) return { rows, errors, warnings };
    for (const o of orders) {
      const tag = `注文 ${o.order}`;
      if (o.cancelled) { warnings.push(`${tag}：キャンセル済みのため除外`); continue; }
      if (s.skipFulfilled && o.fulfilled) { warnings.push(`${tag}：発送済みのため除外`); continue; }
      if (o.country && !/^(JP|Japan|日本)$/i.test(o.country)) { warnings.push(`${tag}：海外の住所（${o.country}）のため除外`); continue; }
      if (!o.items.length) { warnings.push(`${tag}：配送が必要な商品が無いため除外`); continue; }
      const probs = [];
      if (!o.phone) probs.push('電話番号が無い（B2 では必須）');
      if (!/^\d{3}-\d{4}$/.test(o.zip)) probs.push(`郵便番号が7桁でない（${o.zip || '空'}）`);
      if (!o.name) probs.push('お届け先名が無い');
      if (width(o.phone) > 15) probs.push('電話番号が15桁を超える');
      let addr = o.address, bld = o.building;
      if (width(addr) > 64) { // 住所が全角32字を超える：あふれた分を建物名の欄へ
        const sp = split(addr, 64, 1); addr = sp.parts[0]; bld = (sp.overflow + (bld ? ' ' + bld : '')).trim();
        warnings.push(`${tag}：住所が長いため、後ろを建物名の欄に移しました`);
      }
      if (width(bld) > 32) probs.push(`建物名が全角16字を超える（${bld}）`);
      if (width(o.name) > 32) warnings.push(`${tag}：お届け先名を全角16字に切りました`);
      const label = itemLabel(o.items);
      if (width(label) > 50) warnings.push(`${tag}：品名を全角25字に切りました（${label}）`);
      const bad = unsupportedChars([o.name, addr, bld, o.company, label].join(''));
      if (bad.length) probs.push(`Shift_JIS にない文字：${bad.join(' ')}（送り状ソフトで文字化けするため直してください）`);
      if (probs.length) { warnings.push(`${tag}：${probs.join('／')} → この注文は出力しません`); continue; }
      const r = new Array(B2_COLS).fill('');
      r[0] = cut(o.order.replace(/^#/, ''), 50); r[1] = s.type; r[2] = s.cool || '0'; r[4] = s.shipDate; r[6] = s.time || '';
      r[8] = o.phone; r[10] = o.zip; r[11] = addr; r[12] = bld; r[13] = cut(o.company, 50); r[15] = cut(o.name, 32); r[17] = o.company && !o.name ? '御中' : '様';
      r[19] = phone(s.senderPhone); r[21] = zip(s.senderZip); r[22] = cut(s.senderAddress, 64); r[23] = cut(s.senderBuilding || '', 32); r[24] = cut(s.senderName, 32);
      r[27] = cut(label, 50); r[39] = s.billingCode; r[41] = s.freightNo;
      if (s.type === '3' || s.type === '5') { r[39] = ''; r[41] = ''; } // ゆうメール・着払では入力しない（仕様）
      rows.push(r);
    }
    return { rows, errors, warnings, header: B2_HEADER };
  }

  // ---- 日本郵便 クリックポスト（まとめ申込、40件ごと、Shift_JIS、1行目は見出し） ----
  const CP_HEADER = ['お届け先郵便番号', 'お届け先氏名', 'お届け先敬称', 'お届け先住所1行目', 'お届け先住所2行目', 'お届け先住所3行目', 'お届け先住所4行目', '内容品'];
  function toClickPost(orders, s) {
    const warnings = [], rows = [];
    for (const o of orders) {
      const tag = `注文 ${o.order}`;
      if (o.cancelled || (s.skipFulfilled && o.fulfilled) || !o.items.length) { warnings.push(`${tag}：除外（キャンセル・発送済み・配送不要）`); continue; }
      if (o.country && !/^(JP|Japan|日本)$/i.test(o.country)) { warnings.push(`${tag}：海外の住所のため除外`); continue; }
      const probs = [];
      if (!/^\d{3}-\d{4}$/.test(o.zip)) probs.push('郵便番号が7桁でない');
      if (!o.name) probs.push('氏名が無い');
      const full = [o.address, o.building, o.company].filter(Boolean).join(' ');
      const sp = split(full, 40, 4);
      if (sp.overflow) probs.push('住所が全角80字を超える');
      const bad = unsupportedChars(o.name + full);
      if (bad.length) probs.push(`Shift_JIS にない文字：${bad.join(' ')}`);
      if (probs.length) { warnings.push(`${tag}：${probs.join('／')} → 出力しません`); continue; }
      if (width(o.name) > 40) warnings.push(`${tag}：氏名を全角20字に切りました`);
      rows.push([o.zip, cut(o.name, 40), '様', ...sp.parts, cut(s.contents || itemLabel(o.items), 30)]);
    }
    const files = []; for (let i = 0; i < rows.length; i += 40) files.push(rows.slice(i, i + 40)); // 1回40件まで（仕様）
    return { files, warnings, header: CP_HEADER };
  }

  const api = { parseCsv, toCsv, encodeSjis, unsupportedChars, width, cut, split, prefecture, phone, zip, groupOrders, itemLabel, toB2, toClickPost, B2_HEADER, B2_TYPES, CP_HEADER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ShipCsv = api;
})(typeof self !== 'undefined' ? self : this);
