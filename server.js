// Личный sync-сервер трекера. Без зависимостей. node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { decode, fromCsv } = require('./parser');
for (const l of (fs.existsSync(path.join(__dirname, '.env')) ? fs.readFileSync(path.join(__dirname, '.env'), 'utf8') : '').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const TOKEN = process.env.LEDGER_SYNC_TOKEN, PORT = +(process.env.PORT || 8787);
if (!TOKEN) { console.error('LEDGER_SYNC_TOKEN не задан'); process.exit(1); }
const DB = path.join(__dirname, 'data', 'ops.json');
const load = () => fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { ops: [] };
const save = db => { fs.writeFileSync(DB + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(DB + '.tmp', DB); };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const authOk = req => {
  const h = req.headers.authorization || '', a = Buffer.from(h), b = Buffer.from('Bearer ' + TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
function extractCsv(req, body) {
  const ct = req.headers['content-type'] || '';
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
  if (!ct.startsWith('multipart/') || !m) return body;
  const bnd = Buffer.from('--' + (m[1] || m[2]));
  let i = body.indexOf(bnd);
  while (i >= 0) {
    const next = body.indexOf(bnd, i + bnd.length); if (next < 0) break;
    const part = body.slice(i + bnd.length, next);
    const he = part.indexOf('\r\n\r\n');
    if (he >= 0 && /filename=|name="file"/.test(part.slice(0, he).toString())) return part.slice(he + 4, part.length - 2);
    i = next;
  }
  return body;
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/v1/health') return send(res, 200, { ok: true });
  if (!authOk(req)) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && u.pathname === '/v1/ops') {
    const since = u.searchParams.get('since') || '';
    const ops = load().ops.filter(o => !since || o.received_at > since);
    return send(res, 200, { ops, server_time: new Date().toISOString() });
  }
  if (req.method === 'POST' && u.pathname === '/v1/upload') {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 20e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      try {
        const ops = fromCsv(decode(extractCsv(req, Buffer.concat(chunks))));
        const db = load(), seen = new Set(db.ops.map(o => o.hash)), now = new Date().toISOString();
        let added = 0;
        for (const o of ops) if (!seen.has(o.hash)) { seen.add(o.hash); db.ops.push({ ...o, received_at: now }); added++; }
        save(db);
        send(res, 200, { parsed: ops.length, added, duplicates: ops.length - added, total: db.ops.length });
      } catch (e) { send(res, 400, { error: String(e) }); }
    });
    return;
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, '0.0.0.0', () => console.log(`ledger sync on :${PORT}`));
