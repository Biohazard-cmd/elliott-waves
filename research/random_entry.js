// Тарп: сколько даёт сам вход по подсчёту волн? Сравниваем на ОДНОМ и том же простом выходе:
//   «наш вход»  — дни и бумаги реальных сделок набора;
//   «случайный» — для каждой реальной сделки случайный день в той же бумаге (столько же сделок на бумагу);
//   «случайный + фильтры» — случайный день, где выполнены фильтры набора: SMA200 растёт (20 свечей) и AO 5/34 > 0.
// Стоп и цель у случайной сделки — те же, что у реальной, в % от цены входа (стоп) и в R (цель).
// Простой выход (одинаковый для всех): стоп; цель → стоп в безубыток и дальше под минимум 5 свечей; не дольше 182 дней.
// shortcut: без фильтров рынка/тренда старшей степени и без доливок — они у случайного входа не воспроизводятся.
const st = require('./strat.js'); const { evalCfg, portfolio, ser, SPLIT } = st;
const FEE = 0.0005, SLIP = 0.0002;

function sim(bars, i, d, rr) {   // вход по открытию свечи i
  const e = bars[i].o;
  return simAbs(bars, i, e, e * (1 - d), e * (1 + d * rr));
}
function simAbs(bars, i, e, stop0, tgt) {   // вход на свече i по цене e; стоп и цель — уровни
  const risk = e - stop0; let stop = stop0, run = false;
  if (!(risk > 0)) return null;
  for (let j = i; j < bars.length; j++) {
    const b = bars[j]; let px = null;
    if (b.l <= stop) px = Math.min(b.o, stop);
    else if (!run && b.h >= tgt) { run = true; stop = Math.max(stop, e); }
    if (px == null && run && j - 5 >= i) stop = Math.max(stop, Math.min(...bars.slice(j - 4, j + 1).map((x) => x.l)));
    if (px == null && b.t - bars[i].t >= 182 * 864e5) px = b.c;
    if (px == null && j === bars.length - 1) return null;   // не закрылась к концу истории — не считаем (как reason 3)
    if (px != null) return { T: bars[i].t, TOut: b.t, t: { side: 1, entry: e, stop0: e - risk, exitP: px }, nr: (px - e - (2 * FEE + 2 * SLIP) * e) / risk };
  }
  return null;
}
function filt(bars) {   // фильтры набора на свече перед входом
  const n = bars.length, sma = new Array(n).fill(NaN), med = bars.map((b) => (b.h + b.l) / 2), ao = new Array(n).fill(NaN);
  let s = 0; for (let k = 0; k < n; k++) { s += bars[k].c; if (k >= 200) s -= bars[k - 200].c; if (k >= 199) sma[k] = s / 200; }
  let s5 = 0, s34 = 0; for (let k = 0; k < n; k++) { s5 += med[k]; s34 += med[k]; if (k >= 5) s5 -= med[k - 5]; if (k >= 34) s34 -= med[k - 34]; if (k >= 33) ao[k] = s5 / 5 - s34 / 34; }
  return (i) => i >= 221 && sma[i - 1] > sma[i - 21] && ao[i - 1] > 0;
}
function stats(all) {
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length;
  const p = portfolio({ all }, { cash: true }), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio({ all: z }, { cash: true }));
  return { n: all.length, R, avg: R / all.length, win: w / all.length, cagr: p.cagr, h1: h[0].cagr, h2: h[1].cagr, mdd: p.mdd };
}
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const line = (lab, s) => console.log(lab.padEnd(30), String(s.n).padStart(4), s.R.toFixed(0).padStart(6), s.avg.toFixed(2).padStart(6), pct(s.win) + '%', pct(s.cagr), pct(s.h1), pct(s.h2), pct(s.mdd) + '%');
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

const byId = new Map(ser.map((s) => [s.id, s]));
module.exports = { simAbs, stats, line, byId };
if (require.main !== module) return;
for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ (без доливок)', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 }]]) {
  const r = evalCfg(PRE), eng = stats(r.all.map((x) => ({ T: x.T, TOut: x.TOut, t: x.t, nr: x.t.NR })));
  const real = [], base = [];
  for (const x of r.all) {
    const s = byId.get(x.id), bars = s.bars, i = bars.findIndex((b) => b.t === x.T); if (i < 0) continue;
    const d = (x.t.entry - x.t.stop0) / x.t.entry, rr = (x.t.target - x.t.entry) / (x.t.entry - x.t.stop0);
    if (!(d > 0) || !(rr > 0)) continue;
    const z = sim(bars, i, d, rr); if (z) { real.push(z); base.push({ s, d, rr }); }
  }
  console.log(`\n${name}: сделок ${r.all.length}, в сравнении ${real.length}`);
  console.log('вход'.padEnd(30), 'сдел', '     R', ' ср.R', 'прибыльных', '%/год  до23  с23  просадка');
  line('движок (наши выходы, справочно)', eng);
  line('наш вход, простой выход', stats(real));
  const F = new Map();
  for (const [lab, useF] of [['случайный, медиана 20 раз', false], ['случайный + фильтры, медиана', true]]) {
    const runs = [];
    for (let k = 0; k < 20; k++) {
      const all = [];
      for (const b of base) {
        const bars = b.s.bars; if (useF && !F.has(b.s.id)) F.set(b.s.id, filt(bars));
        const ok = useF ? F.get(b.s.id) : (i) => i >= 221;
        for (let tries = 0; tries < 200; tries++) { const i = 221 + Math.floor(rnd() * (bars.length - 222)); if (!ok(i)) continue; const z = sim(bars, i, b.d, b.rr); if (z) { all.push(z); break; } }
      }
      runs.push(stats(all));
    }
    const m = {}; for (const k of ['n', 'R', 'avg', 'win', 'cagr', 'h1', 'h2', 'mdd']) m[k] = med(runs.map((x) => x[k]));
    line(lab, m);
    console.log(''.padEnd(30), `разброс: ср.R ${Math.min(...runs.map((x) => x.avg)).toFixed(2)}…${Math.max(...runs.map((x) => x.avg)).toFixed(2)}, %/год ${pct(Math.min(...runs.map((x) => x.cagr)))}…${pct(Math.max(...runs.map((x) => x.cagr)))}`);
  }
}
