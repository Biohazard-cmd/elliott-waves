// дивергенция на волне 5 (2.36): выход после завершённой волны 5 по сделке, если AO 5/34 на ней слабее, чем на волне 3
// div — только с дивергенцией, all — после любой завершённой волны 5 (для сравнения: даёт ли что-то сама дивергенция)
const st = require('./strat.js'); const { evalCfg, portfolio, SPLIT } = st;
const PRE = {
  'основной': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'агрессивный': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 },
};
const streak = (a) => { let m = 0, c = 0; for (const x of a.slice().sort((p, q) => p.T - q.T)) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
for (const [nm, pre] of Object.entries(PRE)) {
  for (const mode of [false, 'div', 'all']) {
    const r = evalCfg(Object.assign({}, pre, mode ? { addDiv5Exit: mode } : {}));
    const p = portfolio(r, { cash: true }), ph = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)].map((z) => portfolio({ all: z }, { cash: true }));
    const h = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)].map((z) => z.reduce((s, x) => s + x.nr, 0));
    const dx = r.all.filter((x) => x.t.reason === 9), w = r.all.filter((x) => x.nr > 0).length;
    console.log((nm + ' · ' + (mode || 'без')).padEnd(18), 'R', r.R.toFixed(0).padStart(4), '(' + h[0].toFixed(0) + '/' + h[1].toFixed(0) + ')', 'сд', r.n, 'ср', (r.R / r.n).toFixed(2), 'приб', (w / r.n * 100).toFixed(0) + '%', 'серия', streak(r.all),
      '|', (p.cagr * 100).toFixed(1) + '%/год (' + (ph[0].cagr * 100).toFixed(0) + '/' + (ph[1].cagr * 100).toFixed(0) + ')', 'DD', (p.mdd * 100).toFixed(0) + '%',
      '| выходов по дивергенции', dx.length, dx.length ? 'ср ' + (dx.reduce((s, x) => s + x.nr, 0) / dx.length).toFixed(2) + ' R' : '');
  }
}
