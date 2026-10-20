// Сверка: опция движка weekExit (2.39) против week.js («нед+БУ» вокруг движка) — набор «4 часа · неделя», Мосбиржа 2018–2026.
// Плюс самопроверка: выходы «конец недели» — только в пятницу, входов в выходные нет.
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const ser = require('./moex4h.js').series(S), mkt = S.D.buildMarket('4h', 200);
const SPLIT = Date.UTC(2022, 7, 9), MSK = 3 * 3600e3, wd = (t) => (Math.floor((t + MSK) / 864e5) + 4) % 7;
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const EX = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};   // EXTRA='{"beAtr":2.5}' — соседние настройки
for (const fee of (process.env.FEES || '0.05,0.3').split(',').map(Number)) {
  const r = evalCfg(Object.assign({ feePct: fee }, H4W, EX), { ser, mkt, tr: (t, bars) => { t.wdIn = wd(bars[t.iEntry].t); t.wdOut = wd(bars[Math.min(t.iExit, bars.length - 1)].t); return t.NR; } });
  const all = r.all.map((x, i) => Object.assign(x, { i }));
  const p = portfolio(all, 0.25, (x) => x.i, fee / 100), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, fee / 100).cagr);
  const wk = all.filter((x) => x.t.reason === 4), carried = all.filter((x) => x.t.wkCarry).length;
  console.log(`комиссия ${fee}%: сделок ${all.length}, ср.R ${(r.R / r.n).toFixed(2)}, ${pct(p.cagr)}%/год (${pct(h[0])} /${pct(h[1])}), просадка ${pct(p.mdd)}%, серия ${p.st}; закрыто в пятницу ${wk.length}, перенесено ${carried}`);
  const byWd = {}; for (const x of wk) byWd[x.t.wdOut] = (byWd[x.t.wdOut] || 0) + 1; console.log('  выходы «конец недели» по дням недели (5 — пт):', JSON.stringify(byWd));
  require('assert').ok(wk.every((x) => x.t.wdOut % 6 !== 0), 'выход «конец недели» в выходные');
  require('assert').ok(all.every((x) => x.t.wdIn % 6 !== 0), 'вход в выходные');
}
console.log('самопроверка ok');
