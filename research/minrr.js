// Кеннеди: брать сделку, только если план «прибыль к риску» (цель − вход) / (вход − стоп) ≥ k (у Кеннеди 3:1).
// Опция движка addMinRR/minRR (есть в engine2.js, по умолчанию выключена). Роботная модель портфеля (maxpos_add.js).
const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 19; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('R:R ≥'.padEnd(10), 'сделок     R  ср.R прибыльных  %/год  до23  с23  просадка серия | порядок');
  for (const k of [0, 1.2, 1.5, 2, 2.5, 3]) {
    const r = evalCfg(Object.assign({}, pre, k ? { addMinRR: true, minRR: k } : {}), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length;
    console.log((k ? k + ':1' : 'выкл.').padEnd(10), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(w / r.n) + '%    ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
  }
}
