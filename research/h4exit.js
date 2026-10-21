// Выход из дневной сделки по 4-часовому подсчёту (21.10.2026, вопрос Егора про младший таймфрейм).
// 4ч из выгрузки приложения (VI.2024–X.2026). Дневные сделки наборов как обычно; если до обычного выхода
// на 4ч случилось событие — выходим по закрытию этой 4ч свечи. PART=main|agr node h4exit.js
const { evalCfg, E, BASE } = require('./strat.js');
const S = require('./store.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const RR = { addMinRR: true, minRR: 1.5 }, BE = (k) => ({ beMode: 'auto', beRule: 'atr', beAtr: k });
const MAIN = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR);
const AGR = Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE(3));
const H4 = 4 * 3600e3, WARM = 300;
// события на 4ч по каждой бумаге: { t: время закрытия свечи, px: закрытие, k: вид }
function events4h(bars, mult) {
  const cfg = Object.assign({}, E.DEFAULTS, BASE, { longOnly: false });
  const sw = E.autoSwing(bars, 1) * mult;
  const ctx = new E.Ctx(bars, cfg), zm = E.zzInit(sw / 100), zs = E.zzInit(sw / 100 * cfg.subRatio), mp = [];
  const out = []; let lastLow = null;
  for (let i = 0; i < bars.length; i++) {
    E.zzPush(zs, i, ctx.H, ctx.L, ctx.sub);
    const piv = E.zzPush(zm, i, ctx.H, ctx.L, mp);
    const t = bars[i].t + H4, px = bars[i].c;
    if (i < WARM) { if (piv && mp.length && mp[mp.length - 1].t < 0) lastLow = mp[mp.length - 1].p; continue; }
    if (piv) {
      const last = mp[mp.length - 1]; if (last.t < 0) lastLow = last.p;
      const sc = ctx.buildScenarios(mp), s0 = sc[0];
      if (s0) {
        if (ctx.phaseNext(s0) === -1) out.push({ t, px, k: 'A' });                 // фигура вверх завершена (5-я / клин / коррекция вверх)
        if (s0.fam === 0 && s0.dir < 0) out.push({ t, px, k: 'B' });              // подсчёт развернулся: импульс вниз
        if (s0.fam === 0 && s0.dir > 0 && s0.n === 6) out.push({ t, px, k: 'F' }); // завершён импульс/клин вверх (пять волн)
      }
    }
    if (lastLow != null && px < lastLow) { out.push({ t, px, k: 'C' }); lastLow = null; }   // закрытие под последним минимумом 4ч (пробой поддержки)
  }
  return out;
}
const h4 = {}; for (const s of S.series.filter((x) => x.tf === '4h')) h4[s.id] = s.bars;
const ev = {};
const MULT = Number(process.env.MULT || 1);
for (const [id, b] of Object.entries(h4)) ev[id] = events4h(b, MULT);
const [nm, pre] = process.env.PART === 'agr' ? ['АГРЕССИВНЫЙ + ДОЛИВКА', AGR] : ['ОСНОВНОЙ', MAIN];
const r = evalCfg(pre, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
// только сделки, где есть 4ч история с запасом до входа
const cov = r.all.filter((x) => h4[x.id] && h4[x.id].length > WARM && x.T >= h4[x.id][WARM].t);
const SPLIT = Date.parse('2025-10-01');
function run(kinds, minR) {
  let n = 0, dR = 0;
  const mod = cov.map((x) => {
    const e = kinds && (ev[x.id] || []).find((z) => kinds.includes(z.k) && z.t > x.T + 864e5 * 0.4 && z.t < x.TOut
      && (minR == null || (z.px - x.t.entry) / Math.abs(x.t.entry - x.t.stop0) >= minR));
    if (!e) return x;
    n++; const risk = Math.abs(x.t.entry - x.t.stop0); dR += (e.px - x.t.exitP) / risk;
    return Object.assign({}, x, { TOut: e.t, t: Object.assign({}, x.t, { exitP: e.px }), nr: x.nr + (e.px - x.t.exitP) / risk, cutT: e.t });
  });
  const adds = pre.addPyramid ? mod.filter((x) => x.t.add && x.t.add.NR != null && (!x.cutT || (x.t.addT || 0) < x.cutT)).map((x) => ({ id: x.id + '+', of: x, t: { side: 1, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = mod.concat(adds); all.forEach((x, i) => { x.i = i; });
  const p = portfolio(all, 0.25, (x) => x.i), h = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i));
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = mod.reduce((s, x) => s + x.nr, 0), w = mod.filter((x) => x.nr > 0).length;
  return `${String(mod.length).padStart(5)} ${R.toFixed(1).padStart(6)} ${(R / mod.length).toFixed(2).padStart(5)} ${pct(w / mod.length)}%  ${pct(p.cagr)} ${pct(h[0].cagr)} ${pct(h[1].cagr)} ${pct(p.mdd)}% ${String(p.st).padStart(4)} | ${pct(rc[0])} – ${pct(rc[19])} | выходов ${n}, изменение ${dR >= 0 ? '+' : ''}${dR.toFixed(1)}R`;
}
const t0 = Math.min(...cov.map((x) => x.T)), t1 = Math.max(...cov.map((x) => x.T));
console.log(`\n${nm}: выход по 4ч подсчёту (волны 4ч ×${MULT}); дневных сделок с 4ч историей: ${cov.length} (${new Date(t0).toISOString().slice(0, 10)} … ${new Date(t1).toISOString().slice(0, 10)}), половины до/после 01.10.2025`);
console.log('вариант'.padEnd(34), 'сделок     R  ср.R прибыльн.   %/год  1пол  2пол  просадка серия | порядок');
const V = [['как сейчас (дневной выход)', null], ['A: 4ч фигура вверх завершена', ['A']], ['F: 4ч пять волн вверх завершены', ['F']], ['B: 4ч подсчёт развернулся вниз', ['B']],
  ['A или B', ['A', 'B']], ['C: пробой 4ч минимума', ['C']], ['F, только в прибыли ≥1R', ['F'], 1], ['A, только в прибыли ≥1R', ['A'], 1], ['C, только в прибыли ≥1R', ['C'], 1]];
for (const [lab, k, m] of V) console.log(lab.padEnd(34), run(k, m));
