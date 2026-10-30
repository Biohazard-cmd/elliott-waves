// Свечные фигуры на дневках (30.10.2026): PART=main|agr — фильтр входа и выход по медвежьей фигуре для дневных наборов 3.1,
// PART=alone — отдельный робот по фигуре (правила основного набора). Хранилище 2019–2026, порядок по обороту, половины до/после 2023.
const Module = require('module'), path = require('path');
const ENG = path.resolve(__dirname, '../android/assets/engine2.js'), comp = Module.prototype._compile;
Module.prototype._compile = function (src, file) {
  if (path.resolve(file) === ENG) { const at = 'const eqNow = cur ? equity';
    src = src.replace(at, 'if (c.patHook && !cur && !hasSig && i < N - 1) { const pl = c.patHook.call(this, i, mp, this.sub); if (pl && this.marketOK(pl.side, this.T[i]) && (c.patFilt === \'mkt\' || (this.trendOK(pl.side, tr[i]) && this.aoOK(pl.side, i)))) { sig = pl; sigBar = i; hasSig = true; } }\n      ' + at); }
  return comp.call(this, src, file);
};
const { evalCfg, SPLIT } = require('./strat.js'), { portfolio } = require('./maxpos_add.js'), CD = require('./candles.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const RR = { addMinRR: true, minRR: 1.5 }, BE = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
const MAIN = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR, BE);
const AGR = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE);
const PART = process.env.PART || 'main', PRE = PART === 'agr' ? AGR : MAIN, RISK = PART === 'agr' ? 0.01 : 0.015, FEE = 0.0014;
function run(over) {
  const cfg = Object.assign({}, PRE, over);
  const r = evalCfg(cfg, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; t.turn = 0; for (let j = Math.max(0, t.iEntry - 30); j < t.iEntry; j++) t.turn += bars[j].c * (bars[j].v || 0); t._b = bars; return t.NR; } });
  return r.all.map((x) => Object.assign(x, { b: x.t._b, iE: x.t.iEntry, iX: Math.min(x.t.iExit, x.t._b.length - 1) }));
}
function rep(lab, base) {
  if (!base.length) { console.log(lab.padEnd(46), 'сделок нет'); return; }
  const adds = base.filter((x) => x.t.add && x.t.add.NR != null && PRE.addPyramid).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.exitP || x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut }));
  const all = base.map((x) => x.exitP ? Object.assign({}, x, { t: Object.assign({}, x.t, { exitP: x.exitP }) }) : x).concat(adds); all.forEach((x) => { x.i = -(x.of || x).t.turn; });
  const pf = (z, k) => portfolio(z, 0.25, k || ((x) => x.i), 0.0005, RISK);
  const p = pf(all), h = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => z.length > 1 ? pf(z).cagr : NaN);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return pf(all, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = base.reduce((s, x) => s + x.nr, 0), w = base.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(46), String(base.length).padStart(5), R.toFixed(0).padStart(5), (R / base.length).toFixed(2).padStart(5), pct(w / base.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]));
}
const HDR = () => console.log('вариант'.padEnd(46), 'сделок    R  ср.R прибыльн. %/год  до23  с23 просадка серия | случайный порядок');
const av = (q) => q.length ? (q.reduce((s, x) => s + x.nr, 0) / q.length).toFixed(2) : '—';
const KS = ['any', 'engulf', 'hammer', 'mstar', 'doji', 'pierce'];
console.log(`\nДНЕВКИ, ${PART === 'agr' ? 'агрессивный 3.1 (риск 1%)' : PART === 'main' ? 'основной 3.1 (риск 1,5%)' : 'отдельный робот по свечной фигуре (правила основного, риск 1,5%)'}`);
if (process.env.DD) {
  const B = run({}); HDR();
  for (const [lab, R] of require('./dd_list.js')) { portfolio.rules = R; rep('  ' + lab, B); }
  portfolio.rules = null;
} else if (PART !== 'alone') {
  const B = run({}); HDR(); rep('набор как сейчас', B);
  const w2lo = (x) => { let m = x.iE - 1; for (let j = Math.max(0, x.iE - 30); j < x.iE; j++) if (x.b[j].l < x.b[m].l) m = j; return m; };
  const WIN = { 'сигнальная свеча': (x) => [x.iE - 1], 'сигнальная или прошлая': (x) => [x.iE - 1, x.iE - 2], 'у минимума отката ±2': (x) => { const m = w2lo(x); return [m - 2, m - 1, m, m + 1, m + 2].filter((j) => j < x.iE); } };
  for (const [wn, wf] of Object.entries(WIN)) for (const k of KS) for (const ctx of [true, false]) {
    if (!ctx && k !== 'any') continue;
    const ok = (x) => wf(x).some((j) => CD.bull(x.b, j, k, ctx)), kp = B.filter(ok), dr = B.filter((x) => !ok(x));
    rep(`  ${wn}: ${k}${ctx ? '' : ' (без «после снижения»)'}`, kp);
    console.log(`     оставлено ${kp.length} по ${av(kp)}R (половины ${av(kp.filter((x) => x.T < SPLIT))}/${av(kp.filter((x) => x.T >= SPLIT))}), отсеяно ${dr.length} по ${av(dr)}R`);
  }
  console.log('\nВЫХОД ПО МЕДВЕЖЬЕЙ ФИГУРЕ (по открытию следующего дня; доливка закрывается вместе)'); HDR(); rep('как сейчас', B);
  for (const k of ['any', 'engulf', 'star', 'estar']) for (const pr of [-99, 0, 1, 2, 3]) {
    let ch = 0;
    const L = B.map((x) => { const r = Math.abs(x.t.entry - x.t.stop0);
      for (let j = x.iE; j < x.iX - 1; j++) if ((x.b[j].c - x.t.entry) / r >= pr && CD.bear(x.b, j, k)) { const ex = x.b[j + 1].o; ch++;
        return Object.assign({}, x, { TOut: x.b[j + 1].t, exitP: ex, nr: ((ex - x.t.entry) - x.t.entry * FEE) / r }); }
      return x; });
    rep(`  ${k}, прибыль ≥ ${pr < -9 ? 'любая' : pr + 'R'} (выходов ${ch})`, L);
  }
} else {
  const B0 = run({}); HDR(); rep('основной как сейчас', B0);
  const NONE = { w3: false, w5: false, abc: false, tri: false };
  const hook = (k, minA) => function (i) {
    this._bars = this._bars || this.T.map((t, j) => ({ o: this.O[j], h: this.H[j], l: this.L[j], c: this.C[j] }));
    const w = CD.bull(this._bars, i, k); if (!w) return null; const C = this.C, A = this.atr();
    const lo = Math.min(Math.min(...this.L.slice(i - w + 1, i + 1)) * 0.999, C[i] - minA * A[i]), risk = C[i] - lo; if (!(risk > 0)) return null;
    return { setup: 5, side: 1, entry: C[i], stop: lo, target: C[i] + 2 * risk, rr: 2, score: 50, notgt: false, sigBar: -1, scen: -1, w1: null, i0: i - w + 1 };
  };
  for (const k of (process.env.KS ? process.env.KS.split(',') : KS)) for (const filt of ['all', 'mkt']) for (const minA of [0, 1]) {
    const al = run({ setups: NONE, patHook: hook(k, minA), patFilt: filt, addMinRR: false });
    rep(`  ${k}, ${filt === 'all' ? 'все фильтры' : 'только рынок'}${minA ? ', стоп ≥ 1 ATR' : ''}`, al);
    if (process.env.MIX) rep('     + на одном счёте с основным', B0.concat(al.map((x) => Object.assign({}, x, { id: x.id + '#c' }))));
    console.log(`     половины ${av(al.filter((x) => x.T < SPLIT))}/${av(al.filter((x) => x.T >= SPLIT))}R на сделку`);
  }
}
