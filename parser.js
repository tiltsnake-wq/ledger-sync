// Парсер CSV-выписок — те же правила, что в lib/services/import_service.dart
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1251').decode(buf); }
}
function parseCsv(text) {
  const first = text.split('\n')[0];
  const delim = (first.split(';').length >= first.split(',').length) ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); cell = ''; rows.push(row); row = []; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c));
}
function parseDate(s) {
  let m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function parseAmount(s) {
  let t = s.replace(/[\s\u00A0\u202F₽]|RUB|руб\.?/g, '').replace('−', '-');
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  const v = parseFloat(t.replace(',', '.'));
  return isNaN(v) ? null : v;
}
const col = (h, keys) => { for (const k of keys) { const i = h.findIndex(x => x.toLowerCase().includes(k)); if (i >= 0) return i; } return -1; };
function guessCategory(desc, amount, bankCat = '') {
  const s = `${desc} ${bankCat}`.toLowerCase();
  if (amount > 0) return 'INCOME';
  const any = w => w.some(x => s.includes(x));
  if (any(['аренд','жкх','коммунал','мтс','билайн','мегафон','теле2','интернет','связь','страхов','налог'])) return 'FIXED';
  if (any(['кредит','погашение'])) return 'DEBT';
  if (any(['пятёрочка','пятерочка','магнит','перекрёсток','перекресток','лента','вкусвилл','ашан','супермаркет','аптек','метро','транспорт','проезд','азс','топливо','дикси'])) return 'LIFE';
  if (any(['подписк','yandex plus','кинопоиск','okko','ivi','комисси','штраф','пени','букмекер','казино'])) return 'LEAK';
  if (any(['кафе','ресторан','доставк','самокат','такси','кино','ozon','wildberries','фастфуд','бар'])) return 'WANT';
  return 'LIFE';
}
const hashOf = (date, amount, desc) => `${date}|${amount.toFixed(2)}|${desc.trim().toLowerCase()}`;
function fromCsv(text) {
  const rows = parseCsv(text); if (!rows.length) return [];
  const h = rows[0];
  let di = col(h, ['дата операции','дата','date']), ai = col(h, ['сумма операции','сумма платежа','сумма','amount']);
  let si = col(h, ['описание','назначение','description','комментарий']);
  const ci = col(h, ['категория','category']), sti = col(h, ['статус','status']);
  let start = 1;
  if (di < 0 || ai < 0) { di = 0; ai = 1; si = 2; start = parseDate(h[0]) ? 0 : 1; }
  const out = [];
  for (const r of rows.slice(start)) {
    if (r.length <= ai || r.length <= di) continue;
    if (sti >= 0 && (r[sti] || '').toUpperCase() === 'FAILED') continue;
    const d = parseDate(r[di]), a = parseAmount(r[ai]);
    if (!d || a == null || a === 0) continue;
    const desc0 = si >= 0 ? (r[si] || '') : '', bc = ci >= 0 ? (r[ci] || '') : '';
    const desc = desc0 || bc;
    out.push({ date: d, amount: a, description: desc, category: guessCategory(desc0, a, bc), hash: hashOf(d, a, desc), source: 'server' });
  }
  return out;
}
module.exports = { decode, fromCsv };
