// «4 часа · неделя»: какой сигнал брать, когда денег на все не хватает (21.10.2026). MOEX=1 — 4ч Мосбиржи 2018–2026.
// (а) порядок при одновременных сигналах; (б) Мэрфи «сначала закрывайте убыточные»: нет денег на новый сигнал — закрыть самую слабую открытую позицию.
const S = require('./store.js');
const { evalCfg, E } = require('./strat.js');
const MOEX = !!process.env.MOEX;
const ser = MOEX ? require('./moex4h.js').series(S) : S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = MOEX ? Date.UTC(2022, 7, 9) : Date.parse('2025-08-17');
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
// оценка подсчёта сигнала: запоминаем в makePlan по (начало фигуры, стоп)
const SC = new Map(), mp0 = E.Ctx.prototype.makePlan;
E.Ctx.prototype.makePlan = function (s, entry) { const pl = mp0.call(this, s, entry); if (pl) SC.set(this.T[s.idx[0]] + '|' + pl.stop, pl.score); return pl; };
const r = evalCfg(H4W, { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
const TR = r.all.map((x) => { const t = x.t, b = t._b, iE = t.iEntry, iX = Math.min(t.iExit, b.length - 1); let turn = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) turn += b[j].c * (b[j].v || 0);
  return { id: x.id, b, iE, iX, e: t.entry, st: t.stop0, ex: t.exitP, T: b[iE].t, TOut: b[iX].t + H4, score: SC.get(b[t.i0].t + '|' + t.stop0) || 0, rr: (t.target - t.entry) / (t.entry - t.stop0), dist: (t.entry - t.stop0) / t.entry, turn }; });
console.log('оценка подсчёта найдена у', TR.filter((q) => q.score).length, 'из', TR.length);
const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 }, fee = 0.0005, slip = 0.0002;
// цена позиции на момент t (закрытие последней 4ч свечи до t; если свеча начинается ровно в t — её открытие)
function pxAt(q, t) { const b = q.b; let lo = q.iE, hi = q.iX; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m].t <= t) lo = m; else hi = m - 1; } return b[lo].t === t ? b[lo].o : b[lo].c; }
function port(list, key, rep) {
  const tr = list.map((q) => ({ q, k: key(q) })).sort((a, b) => a.q.T - b.q.T || a.k - b.k);
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, swaps = 0, lastT = 0, st = 0, c = 0;
  const done = (g) => { if (g < 0) { c++; st = Math.max(st, c); } else c = 0; };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const close = (p, px, t) => { accrue(t); const g = p.val * ((px - p.q.e) / p.q.e - 2 * fee - 2 * slip); eq += g; done(g); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); };
  const closeUntil = (t) => { open.sort((a, b) => a.q.TOut - b.q.TOut); while (open.length && open[0].q.TOut <= t) { const p = open.shift(); close(p, p.q.ex, p.q.TOut); } };
  for (const { q } of tr) {
    closeUntil(q.T); accrue(q.T);
    const size = () => { const used = open.reduce((s, p) => s + p.val, 0); return Math.min(eq * 0.01 / q.dist, eq * 0.25, Math.max(0, eq - used)); };
    let val = size();
    if (val < eq * 0.02 && rep) {   // нет денег: закрыть самую слабую (по текущему R) позицию, если она хуже порога
      const cand = open.filter((p) => p.q.id !== q.id).map((p) => { const px = pxAt(p.q, q.T); return { p, px, R: (px - p.q.e) / (p.q.e - p.q.st) }; }).sort((a, b) => a.R - b.R)[0];
      if (cand && cand.R < rep.below) { open = open.filter((p) => p !== cand.p); close(cand.p, cand.px, q.T); swaps++; val = size(); }
    }
    if (val < eq * 0.02) { skipped++; continue; }
    taken++; open.push({ val, q });
  }
  closeUntil(Infinity);
  const yrs = (tr[tr.length - 1].q.T - tr[0].q.T) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, skipped, swaps, st };
}
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function report(lab, key, rep) {
  const p = port(TR, key, rep), h = [TR.filter((q) => q.T < SPLIT), TR.filter((q) => q.T >= SPLIT)].map((z) => port(z, key, rep).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(TR.map((q) => [q, rnd()])); return port(TR, (q) => mm.get(q), rep).cagr; }).sort((a, b) => a - b);
  console.log(lab.padEnd(44), pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), `| взято ${p.taken}, пропущ. ${p.skipped}${rep ? ', замен ' + p.swaps : ''}`, `| случайный порядок ${pct(rc[0])} – ${pct(rc[19])}`);
}
// сколько сигналов приходит одновременно (на одной свече)
const byT = new Map(); for (const q of TR) byT.set(q.T, (byT.get(q.T) || 0) + 1);
console.log(`\n«4 часа · неделя», покупки; ${MOEX ? 'Мосбиржа 2018–2026, половины до/после 09.08.2022' : 'VI.2024–X.2026'}; сигналов ${TR.length}, из них на свечах, где их 2 и больше: ${TR.filter((q) => byT.get(q.T) > 1).length}`);
console.log('вариант'.padEnd(44), '%/год  1пол  2пол просадка серия');
report('по обороту (как в приложении: список акций)', (q) => -q.turn);
report('первой — выше оценка подсчёта', (q) => -q.score);
report('первой — выше прибыль/риск', (q) => -q.rr);
report('первой — ближе стоп (в %)', (q) => q.dist);
report('первой — дальше стоп (в %)', (q) => -q.dist);
for (const b of [0, -0.3, 0.5, 99]) report(`нет денег → закрыть худшую, если её R < ${b === 99 ? 'любой' : b}`, (q) => -q.turn, { below: b });
report('нет денег → худшую при R<0, оценка первой', (q) => -q.score, { below: 0 });
