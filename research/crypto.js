// стратегия на монетах (дневки Bybit): STORE=data/crypto-1d.json.gz node crypto.js
// наборы как в приложении, комиссия спота Bybit 0,1%, свободные деньги без процентов (фонд ВИМ — рублёвый)
if (!process.env.STORE) process.env.STORE = __dirname + '/data/crypto-1d.json.gz';
const st = require('./strat.js'); const { evalCfg, portfolio, line, SPLIT, ser } = st;
const FEE = { feePct: 0.1, slipPct: 0.05 };
const PRE = {
  'основной': Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, FEE),
  'агрессивный': Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 }, FEE),
};
const VAR = [
  ['как в приложении', {}],
  ['без фильтра рынка', { addMarket: false }],
  ['без AO 5/34', { addAO: false }],
  ['без SMA200', { addSma200: false }],
  ['без фильтров', { addMarket: false, addAO: false, addSma200: false }],
  ['покупки и продажи', { longOnly: false }],
];
const streak = (a) => { let m = 0, c = 0; for (const x of a.slice().sort((p, q) => p.T - q.T)) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
const y0 = new Date(Math.min(...ser.map((s) => s.bars[0].t))).getUTCFullYear();
console.log('монет', ser.length, 'история с', y0, '| делим на половины: до 2023 и с 2023');
const btc = ser.find((s) => s.id === 'BTC');
if (btc) { const b = btc.bars, i0 = Math.min(200, b.length - 1), yrs = (b[b.length - 1].t - b[i0].t) / 31557600000; console.log('для сравнения: BTC «купил и держи» с', new Date(b[i0].t).toISOString().slice(0, 10), ((Math.pow(b[b.length - 1].c / b[i0].c, 1 / yrs) - 1) * 100).toFixed(1) + '%/год'); }
for (const [nm, pre] of Object.entries(PRE)) {
  console.log('== ' + nm);
  for (const [vn, o] of VAR) {
    const r = evalCfg(Object.assign({}, pre, o));
    if (!r.n) { console.log(vn.padEnd(22), 'сделок нет'); continue; }
    const hv = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)];
    const PF = { fee: FEE.feePct / 100, slip: FEE.slipPct / 100 }, p = portfolio(r, PF), ph = hv.map((z) => z.length ? portfolio({ all: z }, PF) : { cagr: 0 });
    console.log(line(vn, r), 'серия', streak(r.all), '|', (p.cagr * 100).toFixed(1) + '%/год (' + (ph[0].cagr * 100).toFixed(0) + '/' + (ph[1].cagr * 100).toFixed(0) + ')', 'DD', (p.mdd * 100).toFixed(0) + '%');
    if (vn === 'как в приложении') {
      console.log('  годы:', Object.entries(r.yr).map(([y, v]) => y + ' ' + v.toFixed(0) + 'R').join(' · '));
      console.log('  монеты:', r.per.slice().sort((a, b) => b[1] - a[1]).map(([id, v]) => id + ' ' + v.toFixed(1)).join(' · '));
    }
  }
}
