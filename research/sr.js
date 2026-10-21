// Мэрфи: фильтр «места мало» (21.10.2026). Покупку пропускаем, если прошлый максимум (сопротивление)
// до начала фигуры сигнала лежит между входом и целью. L — сколько свечей назад искать максимум; share — доля пути до цели.
// PART=main|agr node sr.js; роботная модель, 20 случайных порядков сигналов
const { evalCfg, SPLIT, E } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const RR = { addMinRR: true, minRR: 1.5 }, BE = (k) => ({ beMode: 'auto', beRule: 'atr', beAtr: k });
const MAIN = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR);
const AGR = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE(3));
let SR = null, cut = 0;   // { L, share }
const mp0 = E.Ctx.prototype.makePlan;
E.Ctx.prototype.makePlan = function (s, entry) {
  const pl = mp0.call(this, s, entry);
  if (!pl || !SR || pl.side < 0 || pl.notgt) return pl;
  const j0 = s.idx[0]; let hi = -Infinity;
  for (let j = Math.max(0, j0 - SR.L); j < j0; j++) if (this.H[j] > hi) hi = this.H[j];
  if (hi > pl.entry && hi < pl.entry + SR.share * (pl.target - pl.entry)) { cut++; return null; }
  return pl;
};
const VARS = [['без фильтра', null], ['макс. 60 св., до цели', { L: 60, share: 1 }], ['макс. 120 св., до цели', { L: 120, share: 1 }], ['макс. 250 св., до цели', { L: 250, share: 1 }],
  ['макс. 250 св., ½ пути', { L: 250, share: 0.5 }], ['макс. 120 св., ½ пути', { L: 120, share: 0.5 }], ['макс. 500 св., до цели', { L: 500, share: 1 }]];
const [nm, pre] = process.env.PART === 'agr' ? ['АГРЕССИВНЫЙ + ДОЛИВКА', AGR] : ['ОСНОВНОЙ', MAIN];
console.log(`\n${nm}: фильтр «до сопротивления ближе, чем до цели — пропустить»`);
console.log('вариант'.padEnd(24), 'сделок     R  ср.R прибыльных  %/год  до23  с23  просадка серия | порядок     | отсеяно');
for (const [lab, sr] of VARS) {
  SR = sr; cut = 0;
  const cfg = Object.assign({}, pre);
  const r = evalCfg(cfg, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = cfg.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
  const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
  const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(24), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(w / r.n) + '%    ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[19]), '|', cut);
}
