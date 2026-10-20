// Лимит позиции 15–30% для агрессивного набора С ДОЛИВКАМИ. Доливка — отдельная позиция со своим лимитом,
// берётся только если основная сделка взята (как у робота), закрывается вместе с основной.
const ROOT = require('path').resolve(__dirname, '..');
const { evalCfg, SPLIT } = require(ROOT + '/research/strat.js');

function portfolio(all, maxPos, key, fee = 0.0005) {
  const risk = 0.01, slip = 0.0002;
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: key(x) }))
    .sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  const took = new Set();
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, addT = 0, addS = 0, lastT = 0;
  const done = [];
  const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut); const g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip); eq += g; if (!p.x.of) done.push({ t: p.tOut, g }); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) {
    if (t.x.of && !took.has(t.x.of)) continue;
    closeUntil(t.tIn); accrue(t.tIn); const dist = Math.abs(t.entry - t.stop) / t.entry;
    const used = open.reduce((s, p) => s + p.val, 0); const val = Math.min(eq * risk / dist, eq * maxPos, Math.max(0, eq - used));
    if (val < eq * 0.02) { if (t.x.of) addS++; else skipped++; continue; }
    if (t.x.of) addT++; else { taken++; took.add(t.x); }
    open.push(Object.assign({ val }, t));
  }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) { c++; st = Math.max(st, c); } else c = 0; }
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, skipped, addT, addS, st };
}

module.exports = { portfolio };
if (require.main !== module) return;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const r = evalCfg({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
  { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
const adds = [];
for (const x of r.all) if (x.t.add && x.t.add.NR != null) adds.push({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut });
const mains = r.all.length; r.all.push(...adds); r.all.forEach((x, i) => { x.i = i; });
const halves = [r.all.filter((x) => (x.of || x).T < SPLIT), r.all.filter((x) => (x.of || x).T >= SPLIT)];
const keys = Array.from({ length: 20 }, () => new Map(r.all.map((x) => [x, rnd()])));
console.log(`АГРЕССИВНЫЙ + ДОЛИВКА: сигналов ${mains}, доливок в истории ${adds.length}`);
console.log('лимит  %/год  до23  с23  просадка серия  взято пропущ. доливок(взято/пропущ.) | случайный порядок %/год');
for (const mp of [0.15, 0.175, 0.20, 0.225, 0.25, 0.30]) {
  const p = portfolio(r.all, mp, (x) => x.i), h = halves.map((z) => portfolio(z, mp, (x) => x.i));
  const rc = keys.map((k) => portfolio(r.all, mp, (x) => k.get(x)).cagr).sort((a, b) => a - b);
  console.log((mp * 100).toFixed(1).padStart(4) + '%', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), String(p.taken).padStart(6), String(p.skipped).padStart(6), String(p.addT).padStart(10) + '/' + p.addS, ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
}
