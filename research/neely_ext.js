// Нили, тест растянутой волны: у завершённого импульса (5 волн, не клин) самая длинная из волн 1/3/5 должна быть
// ≥ extK × второй по длине (у Нили 1,618); дополнительно (w5) — волна 5 не короче 38,2% волны 4.
// Не прошёл — подсчёт «импульс» отбрасывается из сценариев (по Нили это коррекция). Влияет на всё, что опирается
// на завершённый импульс: смена подсчёта/фазы (выходы), выбор лучшего сценария. Обёртка над E.Ctx в памяти.
const { evalCfg, SPLIT, E } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const orig = E.Ctx.prototype.buildScenarios;
let dropped = 0;
E.Ctx.prototype.buildScenarios = function (P) {
  const out = orig.call(this, P), k = this.cfg.extK;
  if (!k) return out;
  return out.filter((s) => {
    if (s.fam !== 0 || s.n !== 6 || s.diag) return true;
    const w = s.w, m = [w[0], w[2], w[4]].sort((a, b) => b - a);
    const ok = m[0] >= k * m[1] && (!this.cfg.extW5 || w[4] >= 0.382 * w[3]);
    if (!ok) dropped++;
    return ok;
  });
};

const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('тест'.padEnd(20), 'сделок     R  ср.R  %/год  до23  с23  просадка серия | порядок | смен подсчёта (выход) | отброшено подсчётов');
  for (const [lab, over] of [['выкл.', {}], ['≥ 1,382', { extK: 1.382 }], ['≥ 1,5', { extK: 1.5 }], ['≥ 1,618 (Нили)', { extK: 1.618 }], ['1,618 + 5≥38,2% от 4', { extK: 1.618, extW5: true }]]) {
    dropped = 0;
    const r = evalCfg(Object.assign({}, pre, over), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), fl = r.all.filter((x) => x.t.reason === 6);
    console.log(lab.padEnd(20), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]), '|', String(fl.length).padStart(5), (fl.length ? (fl.reduce((s, x) => s + x.nr, 0) / fl.length).toFixed(2) : '').padStart(6), '|', dropped);
  }
}
