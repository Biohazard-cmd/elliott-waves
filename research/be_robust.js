// Безубыток k×ATR у агрессивного набора с доливками в «роботной» модели портфеля
// (доливка только при взятой основной, лимит 25%, риск 1%, деньги в фонде — maxpos_add.js).
// Устойчивость: k = 2…5, обе половины, просадка, серия убыточных, разброс от порядка сигналов в один день.
const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');

const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const AGR = { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true };
console.log('АГРЕССИВНЫЙ + ДОЛИВКА');
console.log('безубыток  сделок     R  %/год  до23  с23  просадка серия  взято доливок | случайный порядок %/год');
for (const k of [0, 2, 2.5, 3, 3.5, 4, 5]) {
  const cfg = k ? Object.assign({}, AGR, { beMode: 'auto', beRule: 'atr', beAtr: k }) : AGR;
  const r = evalCfg(cfg, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut }));
  const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), n = r.all.length;
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
  const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
  const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
  const rc = Array.from({ length: 20 }, () => { const m = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => m.get(x)).cagr; }).sort((a, b) => a - b);
  console.log((k ? k + '×ATR' : 'выкл.').padEnd(9), String(n).padStart(6), R.toFixed(0).padStart(6), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), String(p.taken).padStart(6), String(p.addT).padStart(7), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
}
