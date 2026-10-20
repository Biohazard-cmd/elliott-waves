// Правило Элдера: если закрытые сделки за календарный месяц дали убыток ≥X% капитала на начало месяца —
// новых сделок до конца месяца не открывать (открытые ведём как обычно). Портфель как в maxpos_add.js (лимит 25%, риск 1%).
// shortcut: считаем только закрытые сделки (без бумажного убытка открытых) — в портфеле нет дневных цен.
const { evalCfg, SPLIT } = require('./strat.js');

function portfolio(all, stopPct) {
  const risk = 0.01, maxPos = 0.25, fee = 0.0005, slip = 0.0002;
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: x.i }))
    .sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  const took = new Set(), done = [];
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, blocked = 0, lastT = 0;
  let mon = '', monEq = 1, monPL = 0; const offMon = new Set();
  const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const mk = (t) => new Date(t + 3 * 36e5).toISOString().slice(0, 7);   // месяц по Москве
  const roll = (t) => { const m = mk(t); if (m !== mon) { mon = m; monEq = eq; monPL = 0; } };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut); roll(p.tOut);
    const g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip); eq += g; monPL += g; if (!p.x.of) done.push({ t: p.tOut, g });
    if (stopPct && monPL <= -stopPct * monEq) offMon.add(mon);
    if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) {
    if (t.x.of && !took.has(t.x.of)) continue;
    closeUntil(t.tIn); accrue(t.tIn); roll(t.tIn);
    if (offMon.has(mon)) { if (!t.x.of) blocked++; continue; }
    const dist = Math.abs(t.entry - t.stop) / t.entry, used = open.reduce((s, p) => s + p.val, 0);
    const val = Math.min(eq * risk / dist, eq * maxPos, Math.max(0, eq - used));
    if (val < eq * 0.02) { if (!t.x.of) skipped++; continue; }
    if (!t.x.of) { taken++; took.add(t.x); }
    open.push(Object.assign({ val }, t));
  }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) { c++; st = Math.max(st, c); } else c = 0; }
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, skipped, blocked, st, months: offMon.size };
}

const pct = (v) => (v * 100).toFixed(1).padStart(5);
for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ + ДОЛИВКА', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }]]) {
  const r = evalCfg(PRE, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = []; if (PRE.addPyramid) for (const x of r.all) if (x.t.add && x.t.add.NR != null) adds.push({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut });
  r.all.push(...adds); r.all.forEach((x, i) => { x.i = i; });
  const halves = [r.all.filter((x) => (x.of || x).T < SPLIT), r.all.filter((x) => (x.of || x).T >= SPLIT)];
  console.log(`\n${name}`);
  console.log('правило  %/год  до23  с23  просадка серия  взято пропущ.(деньги) не взято(правило) месяцев');
  for (const sp of [0, 0.04, 0.05, 0.06, 0.07, 0.08]) {
    const p = portfolio(r.all, sp), h = halves.map((z) => portfolio(z, sp));
    console.log((sp ? (sp * 100).toFixed(0) + '%' : 'нет').padStart(5), '  ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), String(p.taken).padStart(6), String(p.skipped).padStart(9), String(p.blocked).padStart(14), String(p.months).padStart(8));
  }
}
