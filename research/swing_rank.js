// «4 часа · неделя»: входит ли робот в бумаги, где его авто-порог — худший в сетке «Порог и бэктест» (23.10.2026).
// Робот берёт порог EW2.autoSwing (2,5 × медианный размах свечи за 300 свечей) и не смотрит на бэктест по порогам.
// SNAP=1 — снимок по бумагам из журнала (IRAO, SNGS, AFKS, SGZH, MTLR): место авто-порога в сетке ×0,5…×2.
// Иначе — проверка «вперёд» по кварталам: на начало квартала по прошлым 3000 свечам считаем сетку порогов,
// место авто-порога (1 = лучший … 9 = худший по сумме R) и лучший порог; сделки квартала — с авто-порогом
// (как робот) и с подобранным. MOEX=1 — 4ч Мосбиржи 2018–2026.
const S = require('./store.js');
const { evalCfg, E } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const MOEX = !!process.env.MOEX;
const ser = MOEX ? require('./moex4h.js').series(S) : S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const SPLIT = MOEX ? Date.UTC(2022, 7, 9) : Date.parse('2025-08-17');
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 };
const K = [0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2.0], HIST = 3000, MINH = 600;
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const cfgFor = (n) => Object.assign({}, H4W, { mkt, maxBars: n });
const sumR = (trades, from = 0) => { let R = 0, n = 0; for (const t of trades) { if (t.reason === 3 || t.iEntry < from) continue; R += t.NR; n++; } return { R, n }; };
// сетка порогов по истории hist: место авто-порога (1 — лучший), лучший порог
function grid(hist, P) {
  const auto = E.autoSwing(hist.slice(-HIST), 1);
  const rows = K.map((k) => { const sw = Math.max(0.1, Math.round(auto * k * 100) / 100); return Object.assign({ k, sw }, sumR(E.quickStats(hist, cfgFor(Math.min(HIST, hist.length)), P, sw).trades)); });
  const a = rows[K.indexOf(1)], rank = 1 + rows.filter((r) => r.R > a.R + 1e-9).length;
  const best = rows.reduce((x, y) => (y.R > x.R ? y : x));
  return { auto, rows, rank, best };
}

if (process.env.SNAP) {
  for (const tk of (process.env.SNAP === '1' ? 'IRAO,SNGS,AFKS,SGZH,MTLR' : process.env.SNAP).split(',')) {
    const s = ser.find((z) => z.id === tk + '_TQBR'); if (!s) { console.log(tk, 'нет 4ч в данных'); continue; }
    const g = grid(s.bars, s.P);
    console.log(`${tk.padEnd(5)} до ${new Date(s.bars[s.bars.length - 1].t).toISOString().slice(0, 10)}: авто ${g.auto}% — место ${g.rank} из 9; лучший ×${g.best.k} (${g.best.sw}%)`);
    console.log('   ' + g.rows.map((r) => `×${r.k} ${r.sw}%: ${r.R.toFixed(1)}R/${r.n}`).join(' | '));
  }
  return;
}

// ---------- проверка «вперёд» по кварталам ----------
const Q = 91 * 864e5, LAG = 120 * 864e5;   // сделки квартала досчитываем до выхода (свечи после квартала нужны только для выхода)
const fwd = { auto: [], best: [] }, rankStat = Array.from({ length: 10 }, () => ({ n: 0, R: 0, q: 0 }));
const t0 = Date.now();
for (const s of ser) {
  const b = s.bars;
  let i0 = MINH; if (i0 >= b.length) continue;
  for (let T = b[i0].t; T < b[b.length - 1].t; T += Q) {
    const iT = b.findIndex((x) => x.t >= T); if (iT < MINH) continue;
    const hist = b.slice(Math.max(0, iT - HIST), iT), g = grid(hist, s.P);
    const iEnd = b.findIndex((x) => x.t >= T + Q + LAG), seg = b.slice(Math.max(0, iT - HIST), iEnd < 0 ? b.length : iEnd), from = iT - Math.max(0, iT - HIST);
    for (const [key, sw] of [['auto', g.auto], ['best', g.best.sw]]) {
      const st = E.quickStats(seg, cfgFor(seg.length), s.P, sw), off = seg.length - st.N, bars = seg.slice(off);
      for (const t of st.trades) {
        if (t.reason === 3) continue; const iE = t.iEntry + off; if (iE < from || bars[t.iEntry].t >= T + Q) continue;
        const x = { id: s.id, t, T: bars[t.iEntry].t, TOut: bars[Math.min(t.iExit, bars.length - 1)].t, nr: t.NR, rank: g.rank, bestK: g.best.k };
        fwd[key].push(x); if (key === 'auto') { rankStat[g.rank].n++; rankStat[g.rank].R += t.NR; }
      }
    }
    rankStat[g.rank].q++;
  }
}
console.log(`\n«4 часа · неделя», покупки; ${MOEX ? 'Мосбиржа 2018–2026, половины до/после 09.08.2022' : 'выгрузка VI.2024–X.2026, половины до/после 17.08.2025'}; расчёт ${((Date.now() - t0) / 1000).toFixed(0)} с`);
console.log('место авто-порога в сетке (по прошлым свечам) → сделки следующего квартала с авто-порогом:');
for (let r = 1; r <= 9; r++) { const z = rankStat[r]; if (z.q) console.log(`  место ${r}: кварталов ${String(z.q).padStart(4)}, сделок ${String(z.n).padStart(4)}, ср.R ${z.n ? (z.R / z.n).toFixed(3) : '—'}`); }
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function report(lab, list) {
  const L = list.map((x, i) => Object.assign({}, x, { i }));
  const p = portfolio(L, 0.25, (x) => x.i), h = [L.filter((x) => x.T < SPLIT), L.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i).cagr);
  const rc = Array.from({ length: 20 }, () => { const m = new Map(L.map((x) => [x, rnd()])); return portfolio(L, 0.25, (x) => m.get(x)).cagr; }).sort((a, b) => a - b);
  const R = L.reduce((a, x) => a + x.nr, 0);
  console.log(lab.padEnd(40), String(L.length).padStart(5), (R / L.length).toFixed(3).padStart(7), pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), `| взято ${p.taken} | порядок ${pct(rc[0])} – ${pct(rc[19])}`);
}
console.log('\nвариант'.padEnd(41), 'сделок   ср.R  %/год  1пол  2пол просадка серия');
report('как робот: авто-порог, все бумаги', fwd.auto);
for (const m of [9, 8, 7, 6]) report(`авто, пропуск при месте ≥ ${m}`, fwd.auto.filter((x) => x.rank < m));
for (const m of [1, 2, 3]) report(`авто, только при месте ≤ ${m}`, fwd.auto.filter((x) => x.rank <= m));
report('подобранный порог (лучший по прошлому)', fwd.best);
