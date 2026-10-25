// Продажи по треугольнику на 4ч Мосбиржи 2018–2026 (25.10.2026): R с платой за шорт и отдельный счёт (риск 1%, позиция ≤ 25%, свободные деньги в фонде).
const S = require('./store.js'), { evalCfg } = require('./strat.js'), M = require('./moex4h.js'), { portfolio } = require('./maxpos_add.js');
const FEE = 0.0014, SPLIT = Date.UTC(2022, 7, 9), pct = (v) => (v * 100).toFixed(1).padStart(5);
const ser = M.series(S), mkt = S.D.buildMarket('4h', 200);
for (const [flab, f] of [['без AO/SMA200', {}], ['AO + SMA200', { addAO: true, addSma200: true }]]) {
  const r = evalCfg(Object.assign({ shortOnly: true, longOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, feePct: 0.05, setups: { w3: false, w5: false, abc: false, tri: true } }, f), { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  for (const bor of [0, 0.15, 0.25]) {
    const all = r.all.map((x, i) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1), TOut = b[iX].t + 4 * 3600e3, days = (TOut - x.T) / 864e5, cost = t.entry * bor * days / 365;
      return { id: x.id, i, T: x.T, TOut, nr: (t.entry - t.exitP - t.entry * FEE - cost) / (t.stop0 - t.entry), days, t: { side: -1, entry: t.entry, stop0: t.stop0, exitP: t.exitP + cost } }; });
    const p = portfolio(all, 0.25, (x) => x.i), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i).cagr);
    const R = all.reduce((s, x) => s + x.nr, 0), d = all.map((x) => x.days).sort((a, b) => a - b);
    console.log(`${flab.padEnd(14)} плата ${String(bor * 100).padStart(2)}%/год: ${all.length} сд., ${R.toFixed(0)}R, ср. ${(R / all.length).toFixed(3)}R, %/год ${pct(p.cagr)} (${pct(h[0])} / ${pct(h[1])}), просадка ${pct(p.mdd)}%, серия ${p.st}, удержание медиана ${d[d.length >> 1].toFixed(1)} дн.`);
  }
}
console.log('для сравнения: фонд денежного рынка за 2018–2026 ≈ 11%/год');
// устойчивость (плата 15%): по годам и бумагам
{
  const r = evalCfg({ shortOnly: true, longOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, feePct: 0.05, setups: { w3: false, w5: false, abc: false, tri: true } }, { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  const q = r.all.map((x) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1), days = (b[iX].t + 4 * 3600e3 - x.T) / 864e5; return { id: x.id, y: new Date(x.T).getUTCFullYear(), nr: (t.entry - t.exitP - t.entry * FEE - t.entry * 0.15 * days / 365) / (t.stop0 - t.entry) }; });
  const yr = {}; for (const x of q) { yr[x.y] = yr[x.y] || [0, 0]; yr[x.y][0] += x.nr; yr[x.y][1]++; }
  console.log('по годам (R / сделок):', Object.entries(yr).map(([y, a]) => `${y}: ${a[0].toFixed(1)}/${a[1]}`).join('  '));
  const by = {}; for (const x of q) by[x.id] = (by[x.id] || 0) + x.nr; const ids = Object.entries(by).sort((a, b) => b[1] - a[1]), tot = ids.reduce((s, x) => s + x[1], 0);
  console.log(`бумаг ${ids.length}: в плюсе ${ids.filter((x) => x[1] > 0).length}, в минусе ${ids.filter((x) => x[1] < 0).length}; всего ${tot.toFixed(0)}R, топ-5: ${ids.slice(0, 5).map((x) => x[0].replace('_TQBR', '') + ' ' + x[1].toFixed(1)).join(', ')}; без топ-5 ${(tot - ids.slice(0, 5).reduce((s, x) => s + x[1], 0)).toFixed(0)}R`);
  const rs = q.map((x) => x.nr).sort((a, b) => b - a); console.log(`лучшие сделки: ${rs.slice(0, 5).map((v) => v.toFixed(1)).join(' ')}; без 5 лучших сделок ${(tot - rs.slice(0, 5).reduce((s, v) => s + v, 0)).toFixed(0)}R; прибыльных ${(q.filter((x) => x.nr > 0).length / q.length * 100).toFixed(0)}%`);
}
