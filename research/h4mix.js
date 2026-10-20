// Дневной набор + тот же набор на 4ч (история Мосбиржи, moex4h.js) на одном счёте: роботная модель, комиссия 0,05%.
// Оговорка: одна бумага может быть открыта дважды (по дневкам и по 4ч) — модель портфеля этого не запрещает.
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const ser4 = require('./moex4h.js').series(S), mkt4 = S.D.buildMarket('4h', 200);
const pct = (v) => (v * 100).toFixed(1).padStart(5), SPLIT = Date.UTC(2022, 7, 9);
const DL = { addAO: true, addSma200: true, addMinRR: true, minRR: 1.5 };
const DA = Object.assign({}, DL, { stopW2: true, localBars: 5, addPyramid: true, beMode: 'auto', beRule: 'atr', beAtr: 3 });
function trades(cfg, opt) {
  const r = evalCfg(Object.assign({ feePct: 0.05 }, cfg), Object.assign({ tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } }, opt));
  const adds = r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut }));
  return r.all.concat(adds);
}
console.log('вариант'.padEnd(30), 'взято пропущ  %/год  1-я  2-я  просадка серия');
for (const [nm, cfg] of [['основной', DL], ['агрессивный', DA]]) {
  const d = trades(Object.assign({ maxHoldDays: 182 }, cfg), {}), h = trades(cfg, { ser: ser4, mkt: mkt4 });
  for (const [lab, all] of [['дневки', d], ['4ч', h], ['дневки + 4ч', d.concat(h)]]) {
    all.forEach((x, i) => { x.i = i; });
    const p = portfolio(all, 0.25, (x) => x.i, 0.0005), hv = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, 0.0005));
    console.log((nm + ': ' + lab).padEnd(30), String(p.taken).padStart(5), String(p.skipped).padStart(6), pct(p.cagr), pct(hv[0].cagr), pct(hv[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5));
  }
}
