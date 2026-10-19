const st = require('./strat.js'); const { evalCfg, portfolio, SPLIT } = st;
const PRE = process.env.PRE === 'aggr' ? { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 } : { addAO: true, addSma200: true, maxHoldDays: 182 };
const streak = (a) => { let m = 0, c = 0; for (const x of a.slice().sort((p, q) => p.T - q.T)) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
for (const rule of ['none', 'r1', 'r2', 'atr', 'ao', 'mkt', 'stall', 'wave']) {
  const r = evalCfg(Object.assign({}, PRE, rule === 'none' ? {} : { beMode: 'auto', beRule: rule }));
  const p = portfolio(r, { cash: true }), ph = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)].map((z) => portfolio({ all: z }, { cash: true }));
  const be = r.all.filter((x) => x.t.reason === 8).length, w = r.all.filter((x) => x.nr > 0).length;
  console.log(rule.padEnd(6), 'R', r.R.toFixed(0).padStart(4), 'сд', r.n, 'ср', (r.R / r.n).toFixed(2), 'приб', (w / r.n * 100).toFixed(0) + '%', 'серия', streak(r.all), '|', (p.cagr * 100).toFixed(1) + '%/год (' + (ph[0].cagr * 100).toFixed(0) + '/' + (ph[1].cagr * 100).toFixed(0) + ')', 'DD', (p.mdd * 100).toFixed(0) + '%', '| выходов по БУ', be);
}
