// Проверка в обычном браузере без Playwright: node serve.js → http://localhost:8787/
// Отдаёт android/assets, в index.html подкладывает /__mock.js — подмену fetch к API Т-Инвестиций записанными
// часовиками из research/data/mock (как ui19.js): 1ч как есть, 4ч и дни — склейкой. ?reset=1 — чистый запуск с токеном-заглушкой.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../android/assets'), MOCK = path.resolve(__dirname, '../data/mock');
const src = {};
for (const fn of fs.readdirSync(MOCK)) { const d = JSON.parse(fs.readFileSync(path.join(MOCK, fn), 'utf8')); src[d.inst.ticker] = d.bars; }
const mock = `(() => {
  const SRC = ${JSON.stringify(src)};
  if (location.search.includes('reset=1') && !sessionStorage.getItem('ewReset')) { sessionStorage.setItem('ewReset', '1'); localStorage.clear();
    localStorage.setItem('ew2.settings', JSON.stringify({ token: 't.GOOD', capital: 300000, inst: { id: 'SBER_TQBR', ticker: 'SBER', name: 'Сбербанк', classCode: 'TQBR' }, tf: '1d',
      favs: Object.keys(SRC).map((t) => ({ id: t + '_TQBR', ticker: t, name: t, classCode: 'TQBR' })), cfg: { maxBars: 2000 }, account: { id: 'A1', name: 'Брокерский счёт' } })); }
  const Q = (x) => ({ units: String(Math.trunc(x)), nano: Math.round((x - Math.trunc(x)) * 1e9) });
  const MS = { CANDLE_INTERVAL_HOUR: 36e5, CANDLE_INTERVAL_4_HOUR: 144e5 };
  function bars(tk, iv) {
    const s = (SRC[tk] || []).map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
    const key = iv === 'CANDLE_INTERVAL_DAY' ? (t) => Math.floor((t + 3 * 36e5) / 864e5) * 864e5 - 3 * 36e5 : MS[iv] ? (t) => Math.floor(t / MS[iv]) * MS[iv] : null;
    if (!key) return [];
    const m = new Map(); for (const x of s) { const k = key(x.t), c = m.get(k); if (!c) m.set(k, Object.assign({}, x, { t: k })); else { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; c.v += x.v; } }
    return Array.from(m.values());
  }
  const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch.bind(window);
  window.fetch = async (url, opt) => {
    const u = String(url); if (!/invest-public-api/.test(u)) return real(url, opt);
    const b = JSON.parse((opt && opt.body) || '{}'), tk = (id) => String(id || '').replace('uid-', '').split('_')[0];
    if (u.endsWith('/GetCandles')) { const from = Date.parse(b.from), to = Date.parse(b.to);
      return ok({ candles: bars(tk(b.instrumentId), b.interval).filter((x) => x.t >= from && x.t < to).slice(-(b.limit || 2400)).map((x) => ({ open: Q(x.o), high: Q(x.h), low: Q(x.l), close: Q(x.c), volume: String(Math.round(x.v)), time: new Date(x.t).toISOString(), isComplete: true })) }); }
    if (u.endsWith('/GetInstrumentBy')) { const t = tk(b.id); return ok({ instrument: { uid: 'uid-' + t, figi: 'F' + t, ticker: t, classCode: 'TQBR', lot: 1, instrumentType: 'share', currency: 'rub', name: t } }); }
    if (u.endsWith('/Shares')) return ok({ instruments: Object.keys(SRC).map((t) => ({ ticker: t, classCode: 'TQBR', uid: 'uid-' + t, figi: 'F' + t, name: t, lot: 1, currency: 'rub', apiTradeAvailableFlag: true, tradingStatus: 'SECURITY_TRADING_STATUS_NORMAL_TRADING' })) });
    if (u.endsWith('/GetAccounts')) return ok({ accounts: [{ id: 'A1', name: 'Брокерский счёт', type: 'ACCOUNT_TYPE_TINKOFF', status: 'ACCOUNT_STATUS_OPEN' }] });
    if (u.endsWith('/GetPortfolio')) return ok({ totalAmountPortfolio: { currency: 'rub', units: '300000', nano: 0 }, positions: [] });
    if (u.endsWith('/GetOperationsByCursor')) return ok({ hasNext: false, items: [] });
    if (u.endsWith('/GetLastPrices')) return ok({ lastPrices: [] });
    if (u.endsWith('/GetDividends')) return ok({ dividends: [] });
    return new Response('{}', { status: 404 });
  };
})();`;
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__mock.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(mock); }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(f);
  if (f.endsWith('index.html')) body = body.toString().replace('<head>', '<head><script src="/__mock.js"></script>');
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body);
}).listen(Number(process.env.PORT || 8787), () => console.log('http://localhost:' + (process.env.PORT || 8787) + '/?reset=1'));
