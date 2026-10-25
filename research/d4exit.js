// Выход из дневной сделки по 4ч подсчёту (Мэрфи «момент выхода — по младшему графику»; 21.10 было «мало данных»), 25.10.2026.
// Дневные сделки — наборы 2.38 на хранилище (2019–2026), 4ч — Мосбиржа 2018–2026 (moex4h.js). События на 4ч на закрытии свечи:
// A — пятёрка вверх завершена, F — любая фигура вверх завершена, B — встречный импульс вниз до волны 4, C — закрытие под последним 4ч минимумом.
// Выход — по открытию следующей 4ч свечи, если раньше прежнего выхода; m — только если закрытие ≥ входа + m×риск. Порядок сигналов — по обороту.
// PART=main|agr node d4exit.js
const { evalCfg, SPLIT, E } = require('./strat.js');
const S = require('./store.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const RR = { addMinRR: true, minRR: 1.5 }, BE3 = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
const PART = process.env.PART || 'main';
const CFG = PART === 'main' ? Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR)
  : Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE3);
const H4 = 4 * 3600e3, FEE = 0.0014;
// события 4ч по бумагам
const EV = new Map();
for (const sd of require('./moex4h.js').series(S)) {
  const cfg = E.merge({}), ctx = new E.Ctx(sd.bars, cfg), z = E.zzInit(E.autoSwing(sd.bars, 1) / 100), mp = [], a = EV.get(sd.id) || [];
  let A = false, F = false, B = false, lo = -Infinity;
  for (let k = 0; k < sd.bars.length; k++) {
    if (E.zzPush(z, k, ctx.H, ctx.L, mp)) {
      const t = ctx.buildScenarios(mp)[0], ok = !!t && t.score >= cfg.minScore;
      A = ok && t.fam === 0 && t.dir === 1 && t.n === 6; F = ok && ctx.phaseNext(t) === -1; B = ok && t.fam === 0 && t.dir === -1 && t.n >= 4;
      const pl = mp.filter((p) => p.t === -1).pop(); lo = pl ? pl.p : -Infinity;
    }
    a.push({ t: sd.bars[k].t, c: sd.bars[k].c, nx: k + 1 < sd.bars.length ? sd.bars[k + 1] : null, A, F, B, C: sd.bars[k].c < lo });
  }
  EV.set(sd.id, a);
}
const first = (a, t) => { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m].t < t) l = m + 1; else h = m; } return l; };
const r = evalCfg(CFG, { tr: (t, bars) => { t._b = bars; if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; t.turn = 0; for (let j = Math.max(0, t.iEntry - 30); j < t.iEntry; j++) t.turn += bars[j].c * (bars[j].v || 0); return t.NR; } });
console.log(`сделок ${r.all.length}, с 4ч историей ${r.all.filter((x) => EV.has(x.id)).length}`);
// дневная сделка: вход по открытию дня T (свеча дня начинается в T), выход — в день TOut; 4ч события — от входа до начала дня выхода
function variant(ev, m, key) {
  let n = 0, dR = 0;
  const main = r.all.map((x) => {
    const a = ev && EV.get(x.id), t = x.t;
    if (a) for (let k = first(a, x.T); k < a.length && a[k].t + H4 <= x.TOut; k++) {
      const q = a[k]; if (!q[ev] || !q.nx || (m != null && q.c < t.entry + m * (t.entry - t.stop0))) continue;
      const ex = q.nx.o, nr = (ex - t.entry - t.entry * FEE) / (t.entry - t.stop0); n++; dR += nr - x.nr;
      const add = t.add && t.add.NR != null && (t.addT || 0) < q.nx.t ? Object.assign({}, t.add, { NR: (ex - t.add.px - t.add.px * FEE) / t.add.risk }) : null;
      return Object.assign({}, x, { nr, TOut: q.nx.t, t: Object.assign({}, t, { exitP: ex, add }) });
    }
    return x;
  });
  const adds = CFG.addPyramid ? main.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: 1, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = main.concat(adds); all.forEach((x) => { x.i = key ? key(x.of || x) : -(x.of || x).t.turn; });
  const p = portfolio(all, 0.25, (x) => x.i), h = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i).cagr);
  const R = main.reduce((s, x) => s + x.nr, 0) + adds.reduce((s, a) => s + a.of.t.add.NR, 0);
  return { n, dR, R, p, h };
}
const NM = { A: 'пятёрка вверх', F: 'фигура вверх', B: 'встречный импульс', C: 'под 4ч минимумом' };
console.log(`\nДНЕВКИ · ${PART === 'main' ? 'основной' : 'агрессивный с доливками'} (2.38), выход по 4ч подсчёту; порядок по обороту; половины до/после 2023`);
console.log('вариант'.padEnd(44), '    R  %/год  до23  с23  просадка серия');
const show = (lab, v) => console.log(lab.padEnd(44), v.R.toFixed(0).padStart(5), pct(v.p.cagr), pct(v.h[0]), pct(v.h[1]), pct(v.p.mdd) + '%', String(v.p.st).padStart(4));
show('без 4ч выхода', variant(null));
for (const ev of ['A', 'F', 'B', 'C']) for (const m of [null, 0, 0.5, 1, 2]) { const v = variant(ev, m); show(`  ${NM[ev]}${m == null ? '' : ', прибыль ≥ ' + m + 'R'} (${v.n} вых., ${v.dR >= 0 ? '+' : ''}${v.dR.toFixed(0)}R)`, v); }
// разброс по 20 случайным порядкам сигналов: RC=1
if (process.env.RC) {
  let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [lab, ev, m] of [['без 4ч выхода', null], ['встречный импульс, прибыль ≥ 0R', 'B', 0], ['встречный импульс, прибыль ≥ 0,5R', 'B', 0.5], ['под 4ч минимумом', 'C', null], ['под 4ч минимумом, прибыль ≥ 0R', 'C', 0]]) {
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(); return variant(ev, m, (x) => { if (!mm.has(x.id + x.T)) mm.set(x.id + x.T, rnd()); return mm.get(x.id + x.T); }).p.cagr; }).sort((a, b) => a - b);
    console.log('случайный порядок:', lab.padEnd(36), pct(rc[0]), '–', pct(rc[19]), ' медиана', pct(rc[10]));
  }
}
