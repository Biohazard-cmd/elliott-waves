// дневки крупных монет с Bybit (открытые котировки, без ключа) → хранилище в формате приложения
// node crypto-load.js → data/crypto-1d.json.gz; дальше: STORE=data/crypto-1d.json.gz node crypto.js
// по каждой монете берём ту историю, что длиннее: спот или бессрочный фьючерс к USDT (цены почти одинаковые)
// SRC=binance — открытое зеркало котировок Binance (data-api.binance.vision): история с 2017, доступно и там,
// где Bybit закрыт (облачный сервер в США). Для проверки на истории годится: цены крупных монет на биржах почти равны.
const fs = require('fs'), zlib = require('zlib'), { execFileSync } = require('child_process');
const SYMS = ['BTC', 'ETH', 'SOL', 'XRP', 'TRX', 'DOGE', 'ADA', 'LTC', 'LINK', 'DOT', 'AVAX', 'BCH', 'XLM', 'ATOM', 'ETC',
  'NEAR', 'UNI', 'FIL', 'AAVE', 'ALGO', 'XTZ', 'EOS', 'SAND', 'MANA', 'AXS', 'SHIB', 'CRV', 'COMP', 'SUSHI', 'GRT'];
const MIN_BARS = 3 * 365, DAY = 86400000;
const OUT = process.argv[2] || __dirname + '/data/crypto-1d.json.gz';

function get(url) {
  for (let k = 0; k < 4; k++) {
    try { return JSON.parse(execFileSync('curl', ['-s', '-m', '30', url], { encoding: 'utf8' })); }
    catch (e) { execFileSync('sleep', [String(2 ** (k + 1))]); }
  }
  throw new Error('нет ответа: ' + url);
}
function load(category, sym) {
  const m = new Map(); let end = Date.now();
  for (let k = 0; k < 20; k++) {
    const js = get(`https://api.bybit.com/v5/market/kline?category=${category}&symbol=${sym}USDT&interval=D&limit=1000&end=${end}`);
    if (js.retCode !== 0) break;
    const list = js.result.list || [];   // от новых к старым: [начало, open, high, low, close, volume, оборот]
    for (const a of list) m.set(+a[0], [+a[0], +a[1], +a[2], +a[3], +a[4], +a[5], +a[0] + DAY <= Date.now() ? 1 : 0]);
    if (list.length < 1000) break;
    end = +list[list.length - 1][0] - 1;
  }
  return Array.from(m.values()).sort((a, b) => a[0] - b[0]).filter((a) => a[2] > 0 && a[3] > 0);
}
function loadBinance(sym) {
  const m = new Map(); let start = 0;
  for (let k = 0; k < 20; k++) {
    const list = get(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=1000&startTime=${start}`);
    if (!Array.isArray(list) || !list.length) break;   // от старых к новым: [начало, open, high, low, close, volume, конец, …]
    for (const a of list) m.set(+a[0], [+a[0], +a[1], +a[2], +a[3], +a[4], +a[5], +a[6] < Date.now() ? 1 : 0]);
    if (list.length < 1000) break;
    start = +list[list.length - 1][0] + 1;
  }
  return Array.from(m.values()).sort((a, b) => a[0] - b[0]).filter((a) => a[2] > 0 && a[3] > 0);
}
const series = {};
if (process.env.SRC === 'binance') for (const s of SYMS) {
  const r = loadBinance(s);
  console.log(s.padEnd(6), 'binance', String(r.length).padStart(5), 'с', r.length ? new Date(r[0][0]).toISOString().slice(0, 10) : '—', r.length >= MIN_BARS ? '' : '— мало истории, пропуск');
  if (r.length >= MIN_BARS) series['scan_' + s + '_1d.json'] = { r, at: Date.now(), src: 'binance-spot' };
}
else for (const s of SYMS) {
  const sp = load('spot', s), ln = load('linear', s), r = ln.length > sp.length ? ln : sp;
  const from = r.length ? new Date(r[0][0]).toISOString().slice(0, 10) : '—';
  console.log(s.padEnd(6), 'спот', String(sp.length).padStart(5), 'фьюч', String(ln.length).padStart(5), '→', r === ln ? 'фьюч' : 'спот', 'с', from, r.length >= MIN_BARS ? '' : '— мало истории, пропуск');
  if (r.length >= MIN_BARS) series['scan_' + s + '_1d.json'] = { r, at: Date.now(), src: 'bybit-' + (r === ln ? 'linear' : 'spot') };
}
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify({ series, divs: {}, cfg: { divAdj: false }, swings: {}, src: (process.env.SRC === 'binance' ? 'Binance data-api.binance.vision' : 'Bybit /v5/market/kline') + ', ' + new Date().toISOString().slice(0, 10) })));
console.log('монет:', Object.keys(series).length, '→', OUT);
