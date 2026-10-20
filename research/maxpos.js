// Проверка: лимит позиции 15–30% капитала вместо 25%. Остальное — как в strat.js portfolio (риск 1%, деньги в фонде).
const ROOT = require('path').resolve(__dirname, '..');
const { evalCfg, SPLIT } = require(ROOT + '/research/strat.js');

function portfolio(all, maxPos, key) {
  const risk = 0.01, fee = 0.0005, slip = 0.0002;
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: key(x) }))
    .sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, lastT = 0, used0 = 0, n0 = 0, capped = 0;
  const done = [];
  const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); used0 += Math.min(1, used / eq) * dt; n0 += dt; eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut); const g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip); eq += g; done.push({ t: p.tOut, g }); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) {
    closeUntil(t.tIn); accrue(t.tIn); const dist = Math.abs(t.entry - t.stop) / t.entry;
    const used = open.reduce((s, p) => s + p.val, 0); const val = Math.min(eq * risk / dist, eq * maxPos, Math.max(0, eq - used));
    if (val < eq * 0.02) { skipped++; continue; } taken++; if (eq * maxPos < eq * risk / dist) capped++; open.push(Object.assign({ val }, t));
  }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) { c++; st = Math.max(st, c); } else c = 0; }
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, skipped, st, capped, busy: used0 / n0 };
}

let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 }]]) {
  const r = evalCfg(PRE); r.all.forEach((x, i) => { x.i = i; });
  const halves = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)];
  const keys = Array.from({ length: 20 }, () => new Map(r.all.map((x) => [x, rnd()])));
  console.log(`\n${name}: сигналов ${r.all.length}`);
  console.log('лимит  %/год  до23  с23  просадка серия  взято пропущ. упёрлись  занято  | случайный порядок %/год');
  for (const mp of [0.15, 0.175, 0.20, 0.225, 0.25, 0.30]) {
    const p = portfolio(r.all, mp, (x) => x.i), h = halves.map((z) => portfolio(z, mp, (x) => x.i));
    const rc = keys.map((k) => portfolio(r.all, mp, (x) => k.get(x)).cagr).sort((a, b) => a - b);
    console.log((mp * 100).toFixed(1).padStart(4) + '%', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), String(p.taken).padStart(6), String(p.skipped).padStart(6), String(p.capped).padStart(8), pct(p.busy) + '%', ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
  }
}
