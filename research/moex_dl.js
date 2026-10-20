// Часовые свечи 65 бумаг с открытого сайта Мосбиржи (ISS, без токена) → data/moex1h/<ТИКЕР>.json.gz,
// строки [t (UTC, мс), o, h, l, c, v]. Повторный запуск докачивает только недостающие бумаги.
// FROM=2018-06-01 node moex_dl.js (с какой даты, по умолчанию 2018-06-01)
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const { doc } = require('./store.js');
const INT = Number(process.env.INT || 60);   // 60 — часовики, 10 — 10-минутные (INT=10 FROM=2018-10-01 node moex_dl.js)
const DIR = path.join(__dirname, 'data', INT === 60 ? 'moex1h' : 'moex' + INT + 'm'); fs.mkdirSync(DIR, { recursive: true });
const FROM = process.env.FROM || '2018-06-01', TILL = '2026-10-18';   // FROM не в argv: его читает store.js
const tickers = Object.keys(doc.series).filter((n) => n.endsWith('_4h.json')).map((n) => n.replace('scan_', '').replace('_TQBR_4h.json', ''));
const MSK = 3 * 3600e3;   // время ISS — московское (UTC+3 без перехода на летнее)

async function get(url) {
  for (let k = 0; ; k++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (k >= 4) throw e; await new Promise((ok) => setTimeout(ok, 2000 * (k + 1))); }
  }
}
async function one(tk) {
  const file = path.join(DIR, tk + '.json.gz'); if (fs.existsSync(file)) return;
  const rows = [];
  for (let start = 0; ; start += 500) {
    const js = await get(`https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${tk}/candles.json?from=${FROM}&till=${TILL}&interval=${INT}&iss.meta=off&candles.columns=begin,open,high,low,close,volume&start=${start}`);
    const d = js.candles.data; if (!d.length) break;
    for (const [b, o, h, l, c, v] of d) rows.push([Date.parse(b.replace(' ', 'T') + 'Z') - MSK, o, h, l, c, v]);
    if (d.length < 500) break;
  }
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(rows)));
  console.log(tk, rows.length, rows.length ? new Date(rows[0][0]).toISOString().slice(0, 10) : '—');
}
(async () => {
  const q = process.env.REV ? tickers.slice().reverse() : tickers.slice();   // REV=1 — вторая закачка с конца списка, параллельно первой
  await Promise.all(Array.from({ length: Number(process.env.PAR || 4) }, async () => { while (q.length) { const tk = q.shift(); try { await one(tk); } catch (e) { console.log(tk, 'ошибка', e.message); } } }));
  console.log('готово', fs.readdirSync(DIR).length, 'из', tickers.length);
})();
