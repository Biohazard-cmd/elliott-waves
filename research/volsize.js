// Тарп, модель 4 «процент волатильности»: позиция такая, чтобы ATR(14) × кол-во = v% капитала
// (размер не зависит от стопа). Против нашей модели «1% риска до стопа». Лимит 25% на бумагу, деньги в фонде,
// доливка (у агрессивного) — по той же модели, только если взята основная. Так как средний риск у моделей разный,
// главное сравнение — «доход / просадка» и при подобранном v со средним риском ≈1%.
const { evalCfg, SPLIT } = require('./strat.js');
const { byId } = require('./random_entry.js');

const atrCache = new Map();
function atrPct(id, T) {   // ATR(14)/цена на свече перед T
  const s = byId.get(id); if (!atrCache.has(id)) { const b = s.bars, a = new Array(b.length).fill(NaN); let sm = 0;
    for (let k = 1; k < b.length; k++) { const tr = Math.max(b[k].h - b[k].l, Math.abs(b[k].h - b[k - 1].c), Math.abs(b[k].l - b[k - 1].c)); sm += tr; if (k > 14) sm -= Math.max(b[k - 14].h - b[k - 14].l, Math.abs(b[k - 14].h - b[k - 15].c), Math.abs(b[k - 14].l - b[k - 15].c)); if (k >= 15) a[k] = sm / 14 / b[k].c; }
    atrCache.set(id, { t: b.map((x) => x.t), a }); }
  const c = atrCache.get(id); let lo = 0, hi = c.t.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.t[m] < T) lo = m; else hi = m - 1; }
  return c.a[lo];
}

function portfolio(all, mode, v) {
  const maxPos = 0.25, fee = 0.0005, slip = 0.0002;
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: x.i })).sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  const took = new Set(), done = []; let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, lastT = 0, riskSum = 0, riskMax = 0;
  const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut); const g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip); eq += g; if (!p.x.of) done.push({ t: p.tOut, g }); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) {
    if (t.x.of && !took.has(t.x.of)) continue;
    closeUntil(t.tIn); accrue(t.tIn);
    const dist = Math.abs(t.entry - t.stop) / t.entry, used = open.reduce((s, p) => s + p.val, 0);
    const want = mode === 'risk' ? eq * v / dist : eq * v / (t.x.atr || dist);   // нет ATR — как по стопу
    const val = Math.min(want, eq * maxPos, Math.max(0, eq - used));
    if (val < eq * 0.02) continue;
    if (!t.x.of) { taken++; took.add(t.x); const rk = val * dist / eq; riskSum += rk; riskMax = Math.max(riskMax, rk); }
    open.push(Object.assign({ val }, t));
  }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) { c++; st = Math.max(st, c); } else c = 0; }
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, st, avgRisk: riskSum / taken, riskMax };
}

const pct = (v) => (v * 100).toFixed(1).padStart(5);
for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ + ДОЛИВКА', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }]]) {
  const r = evalCfg(PRE, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = []; if (PRE.addPyramid) for (const x of r.all) if (x.t.add && x.t.add.NR != null) adds.push({ id: x.id, of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut });
  r.all.push(...adds); r.all.forEach((x, i) => { x.i = i; x.atr = atrPct(x.id, x.T); });
  const halves = [r.all.filter((x) => (x.of || x).T < SPLIT), r.all.filter((x) => (x.of || x).T >= SPLIT)];
  console.log(`\n${name}`);
  console.log('модель'.padEnd(26), '%/год  до23  с23  просадка доход/просадка серия взято  ср.риск макс.риск');
  for (const [lab, mode, v] of [['1% риска до стопа (сейчас)', 'risk', 0.01], ['волатильность 0,25%', 'vol', 0.0025], ['волатильность 0,35%', 'vol', 0.0035], ['волатильность 0,5% (Тарп)', 'vol', 0.005], ['волатильность 0,75%', 'vol', 0.0075], ['волатильность 1%', 'vol', 0.01]]) {
    const p = portfolio(r.all, mode, v), h = halves.map((z) => portfolio(z, mode, v));
    console.log(lab.padEnd(26), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', (p.cagr / p.mdd).toFixed(2).padStart(10), String(p.st).padStart(9), String(p.taken).padStart(5), pct(p.avgRisk) + '%', pct(p.riskMax) + '%');
  }
}
