// Продажи (шорт) на дневках: заполнят ли они месяцы, когда покупки молчат? Зеркала наших наборов:
// фильтры AO/SMA200/рынок у движка уже работают в обе стороны (для шорта — AO < 0, SMA200 падает, рынок вниз).
// Портфель как у робота (риск 1%, позиция ≤25%), плюс плата за шорт: k % годовых от суммы позиции за время удержания.
// shortcut: не учтены запреты на шорт (ЦБ, 28.02–2022) и то, что не все бумаги брокер даёт в шорт.
const { evalCfg, SPLIT } = require('./strat.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const mk = (t) => new Date(t + 3 * 36e5).toISOString().slice(0, 7);
function portfolio(all, borrow) {
  const fee = 0.0005, slip = 0.0002, RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: x.i })).sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  const took = new Set(), done = []; let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, lastT = 0;
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut);
    const yrs = (p.tOut - p.tIn) / 31557600000, g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip - (p.side < 0 ? borrow * yrs : 0));
    eq += g; done.push({ t: p.tOut, g, tIn: p.tIn }); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) { if (t.x.of && !took.has(t.x.of)) continue; closeUntil(t.tIn); accrue(t.tIn);
    const dist = Math.abs(t.entry - t.stop) / t.entry, used = open.reduce((s, p) => s + p.val, 0), val = Math.min(eq * 0.01 / dist, eq * 0.25, Math.max(0, eq - used));
    if (val < eq * 0.02) continue; if (!t.x.of) { taken++; took.add(t.x); } open.push(Object.assign({ val }, t)); }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) { c++; st = Math.max(st, c); } else c = 0; }
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, st, entries: new Set(done.map((d) => mk(d.tIn))), done };
}
const build = (pre) => { const r = evalCfg(pre, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; }); return { r, all }; };
const S = { longOnly: false, shortOnly: true };
const VARS = [
  ['шорт · зеркало основного', Object.assign({}, S, { addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5 })],
  ['шорт · зеркало агрессивного', Object.assign({}, S, { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 })],
  ['шорт · без SMA200', Object.assign({}, S, { addAO: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5 })],
  ['шорт · без фильтров AO/SMA', Object.assign({}, S, { maxHoldDays: 182, addMinRR: true, minRR: 1.5 })],
  ['шорт · зеркало осн., держать ≤60 дн', Object.assign({}, S, { addAO: true, addSma200: true, maxHoldDays: 60, addMinRR: true, minRR: 1.5 })],
];
const IDLE = ['2022-01', '2022-02', '2022-03', '2022-04', '2022-05', '2022-06', '2022-07', '2022-08', '2022-09', '2022-10', '2022-11', '2022-12', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-09', '2025-10', '2025-11', '2025-12'];
console.log('шорт'.padEnd(36), 'сделок     R  ср.R  приб.  плата за шорт: %/год (до23/с23) просадка серия | входов в «тихие» месяцы покупок');
for (const [lab, pre] of VARS) {
  const { r, all } = build(pre), w = r.all.filter((x) => x.nr > 0).length;
  const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
  const cells = [0, 0.15, 0.25].map((b) => { const p = portfolio(all, b), h = halves.map((z) => portfolio(z, b)); return `${(b * 100).toFixed(0)}%: ${pct(p.cagr)} (${pct(h[0].cagr)}/${pct(h[1].cagr)}) ${pct(p.mdd)}% ${String(p.st).padStart(3)}`; });
  const p0 = portfolio(all, 0.15), idleHit = IDLE.filter((m) => p0.entries.has(m)).length;
  console.log(lab.padEnd(36), String(r.n).padStart(6), r.R.toFixed(0).padStart(5), (r.n ? r.R / r.n : 0).toFixed(2).padStart(5), pct(w / Math.max(1, r.n)) + '%', '|', cells.join(' | '), `| ${idleHit} из ${IDLE.length}`);
}
// общий счёт «покупки + продажи» (как набор «с шортом»): основной в обе стороны
const both = build({ longOnly: false, shortOnly: false, addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5 });
const lo = build({ addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5 });
for (const [lab, x] of [['только покупки (основной 2.38)', lo], ['покупки + продажи, один счёт', both]]) {
  const halves = [x.all.filter((y) => y.T < SPLIT), x.all.filter((y) => y.T >= SPLIT)];
  const p = portfolio(x.all, 0.15), h = halves.map((z) => portfolio(z, 0.15)), idleHit = IDLE.filter((m) => p.entries.has(m)).length;
  console.log(lab.padEnd(36), String(x.r.n).padStart(6), x.r.R.toFixed(0).padStart(5), (x.r.R / x.r.n).toFixed(2).padStart(5), '| плата 15%:', pct(p.cagr), `(${pct(h[0].cagr)}/${pct(h[1].cagr)})`, pct(p.mdd) + '%', 'серия', p.st, `| входов в «тихие» месяцы: ${idleHit} из ${IDLE.length}`);
}
