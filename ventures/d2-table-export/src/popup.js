// ポップアップ：今のタブの表を一覧し、選んだ表を CSV で保存・TSV でコピーする（ページの内容は外部に送らない）
async function inTab(fn, args) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/core.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args: args || [] });
  return { result: res && res.result, tab };
}
function listTables() {
  return Array.from(document.querySelectorAll('table')).map((t, i) => self.TableExportCore.describe(t, i)).filter((d) => d.rows >= 2 && d.cols >= 2);
}
function grab(index, fill) {
  const t = document.querySelectorAll('table')[index];
  return t ? self.TableExportCore.tableToMatrix(t, fill) : null;
}
function fileName(title, i) {
  const base = (title || 'table').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60).trim() || 'table';
  return `${base}_表${i + 1}.csv`;
}
async function main() {
  const msg = document.getElementById('msg'); const list = document.getElementById('list');
  let tables, tab;
  try { ({ result: tables, tab } = await inTab(listTables)); } catch (e) { msg.textContent = 'このページでは使えません（Chrome の設定画面やストアのページなど）。'; return; }
  if (!tables || !tables.length) { msg.textContent = 'このページに表（2行・2列以上）は見つかりませんでした。'; return; }
  msg.textContent = `${tables.length} 個の表`;
  for (const d of tables) {
    const div = document.createElement('div'); div.className = 't';
    div.innerHTML = `<div class="l"></div><div class="m"></div>`;
    div.querySelector('.l').textContent = `表${d.index + 1}：${d.label}`;
    div.querySelector('.m').textContent = `${d.rows}行 × ${d.cols}列${d.merged ? '・結合セルあり' : ''}`;
    const fill = () => (document.getElementById('repeat').checked ? 'repeat' : 'first');
    const b1 = document.createElement('button'); b1.className = 'p'; b1.textContent = 'Excel 用 CSV を保存';
    b1.onclick = async () => {
      const { result: m } = await inTab(grab, [d.index, fill()]);
      const blob = new Blob([TableExportCore.toCSV(m)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName(tab.title, d.index); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const b2 = document.createElement('button'); b2.textContent = 'コピー（貼り付け用）';
    b2.onclick = async () => {
      const { result: m } = await inTab(grab, [d.index, fill()]);
      await navigator.clipboard.writeText(TableExportCore.toTSV(m)); b2.textContent = 'コピーしました';
    };
    div.append(b1, b2); list.append(div);
  }
}
main();
