// Пересчёт главных решений после исправления поправки на дивиденды (20.10.2026, 2.40).
// PART=main|agr node recheck_div.js — наборы как в 2.38 и они же без одного правила; 20 случайных порядков сигналов.
const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const RR = { addMinRR: true, minRR: 1.5 }, BE = (k) => ({ beMode: 'auto', beRule: 'atr', beAtr: k });
const MAIN = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR);
const AGR = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE(3));
const RUNS = {
  main: ['ОСНОВНОЙ', MAIN, [['набор 2.38', {}], ['без П/Р 1,5', { addMinRR: false }], ['П/Р 1,2', { minRR: 1.2 }], ['П/Р 2', { minRR: 2 }], ['без AO', { addAO: false }], ['без SMA200', { addSma200: false }], ['+ безубыток 3×ATR', BE(3)]]],
  agr: ['АГРЕССИВНЫЙ + ДОЛИВКА', AGR, [['набор 2.38', {}], ['без П/Р 1,5', { addMinRR: false }], ['без безубытка', { beMode: 'hint' }], ['БУ 2,5×ATR', { beAtr: 2.5 }], ['БУ 3,5×ATR', { beAtr: 3.5 }], ['П/Р 1,2', { minRR: 1.2 }], ['П/Р 2', { minRR: 2 }], ['без AO', { addAO: false }], ['без SMA200', { addSma200: false }], ['без доливки', { addPyramid: false }]]],
};
const [nm, pre, vars] = RUNS[process.env.PART || 'main'];
console.log(`\n${nm} (поправка на дивиденды исправлена)`);
console.log('вариант'.padEnd(20), 'сделок     R  ср.R прибыльных  %/год  до23  с23  просадка серия | порядок');
for (const [lab, over] of vars) {
  const cfg = Object.assign({}, pre, over);
  const r = evalCfg(cfg, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = cfg.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
  const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
  const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(20), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(w / r.n) + '%    ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
}
