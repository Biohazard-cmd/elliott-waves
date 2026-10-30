// Криптовалюты (спот к USDT) с открытого зеркала Binance data-api.binance.vision, без ключа → data/crypto/<МОНЕТА>_<tf>.json.gz,
// строки [t (UTC, мс), o, h, l, c, v (оборот в USDT)]. TF=4h|1d (по умолчанию 4h). Повторный запуск докачивает только недостающие.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const TF = process.env.TF || '4h', DIR = path.join(__dirname, 'data', 'crypto'); fs.mkdirSync(DIR, { recursive: true });
const COINS = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'TRX', 'LTC', 'LINK', 'DOT', 'AVAX', 'XLM', 'BCH', 'ATOM', 'ETC', 'UNI', 'NEAR', 'FIL', 'XMR', 'EOS', 'VET', 'ALGO', 'AAVE', 'HBAR'];
const FROM = Date.UTC(2018, 0, 1), TILL = Date.UTC(2026, 9, 18);
async function one(c) {
  const f = path.join(DIR, `${c}_${TF}.json.gz`); if (fs.existsSync(f)) return;
  const rows = []; let t = FROM;
  while (t < TILL) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${c}USDT&interval=${TF}&startTime=${t}&endTime=${TILL}&limit=1000`);
    if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); if (!d.length) break;
    for (const k of d) rows.push([k[0], +k[1], +k[2], +k[3], +k[4], +k[7]]);
    t = d[d.length - 1][0] + 1;
    if (d.length < 1000) break;
  }
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(rows)));
  console.log(c, TF, rows.length, rows.length ? new Date(rows[0][0]).toISOString().slice(0, 10) : '—');
}
(async () => { const q = COINS.slice(); await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const c = q.shift(); try { await one(c); } catch (e) { console.log(c, 'ошибка', e.message); } } })); })();
