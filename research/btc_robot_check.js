// Самопроверка робота «Биткоин · тренд» (3.2): настоящий robotStep из data.js ходит день за днём по истории BTC (data/crypto/BTC_1d, Binance подменён),
// итог сравнивается с тем же правилом в crypto_btc.js (средняя 100, доля по волатильности 30%, подгонка по воскресеньям). Комиссия 0,1%.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const mem = {}; global.window = globalThis;
global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] };
Object.defineProperty(global.localStorage, 'length', { get: () => Object.keys(mem).length });
global.EW2 = require('../android/assets/engine2.js'); require('../android/assets/data.js'); const D = globalThis.EWData;
const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'crypto', 'BTC_1d.json.gz'))));
const DAY = 864e5; let NOW = 0; const realNow = Date.now; Date.now = () => NOW;
global.fetch = async (u) => {
  u = String(u); if (!/binance/.test(u)) throw new Error('нет сети: ' + u);
  const q = new URL(u).searchParams, st = +q.get('startTime') || 0, en = +q.get('endTime') || NOW, lim = +q.get('limit') || 500;
  let rows = B.filter((r) => r[0] <= NOW && r[0] >= st && r[0] <= en).map((r) => [r[0], String(r[1]), String(r[2]), String(r[3]), r[0] + DAY > NOW ? String(r[1]) : String(r[4]), '1', r[0] + DAY - 1]);
  rows = st ? rows.slice(0, lim) : rows.slice(-lim);
  return { status: 200, text: async () => JSON.stringify(rows) };
};
const FROM = Date.UTC(+(process.env.Y0 || 2018), 6, 1);
(async () => {
  D.saveSettings(Object.assign(D.settings(), { token: 't' }));
  NOW = FROM + 3600e3;
  D.vaccSet({ on: true, startAt: NOW, mmRate: 0, top: 50, flows: [], lastAccrue: NOW, accs: [{ key: 'btc_trend', name: 'Биткоин · тренд', crypto: true, tf: '1d', cfg: {}, cash: 1000, dep: 1000, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0 }] });
  let nEv = 0, kinds = {};
  for (let t = FROM + DAY; t <= B[B.length - 1][0]; t += DAY) {
    NOW = t + 120e3;   // 00:02 UTC — день только что закрылся
    const ev = await D.robotStep(null, false);
    for (const e of ev) { nEv++; const k = e.title.split(' · ')[0].replace(/\d+%/g, 'N%'); kinds[k] = (kinds[k] || 0) + 1; }
  }
  const a = D.vaccGet().accs[0], eq = D.vEquity(a), yrs = (NOW - FROM) / DAY / 365.25;
  console.log(`робот: ${new Date(FROM).toISOString().slice(0, 10)}–${new Date(NOW).toISOString().slice(0, 10)}, $1000 → $${eq.toFixed(0)}, ${((Math.pow(eq / 1000, 1 / yrs) - 1) * 100).toFixed(1)}%/год, закрытых частей ${a.closed.length}, уведомлений ${nEv}`);
  console.log('виды уведомлений:', kinds);
  let pk = 0, mdd = 0; for (const h of a.hist) { pk = Math.max(pk, h.eq); mdd = Math.max(mdd, 1 - h.eq / pk); }
  console.log('просадка по дневной оценке:', (mdd * 100).toFixed(1) + '%', '· последний сигнал:', a.sig && { день: new Date(a.sig.t).toISOString().slice(0, 10), доля: a.sig.share.toFixed(2) });
  Date.now = realNow;
})();
