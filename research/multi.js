// «4 часа · неделя»: несколько сделок по одной бумаге одновременно (21.10.2026).
// Движок держит одну сделку на бумагу; «слои»: прогон 1 — как сейчас; прогон k — те же правила, но сигналы, взятые в прогонах 1..k-1,
// запрещены (обёртка над aoOK по бару сигнала) — движок свободен и берёт сигналы, которые раньше пропускал из-за открытой сделки.
// Каждая такая сделка ведётся по своим правилам (стоп, безубыток, пятница). MOEX=1 — 4ч Мосбиржи 2018–2026.
const S = require('./store.js');
const { evalCfg, E } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const MOEX = !!process.env.MOEX;
const ser = MOEX ? require('./moex4h.js').series(S) : S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = MOEX ? Date.UTC(2022, 7, 9) : Date.parse('2025-08-17'), FEE = 0.0007;
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const SKIP = new Map();   // ключ ряда → Set времени сигнальных баров, которые уже взяты
const kOf = (T, N) => T[0] + '|' + T[N - 1];
const ao0 = E.Ctx.prototype.aoOK;
E.Ctx.prototype.aoOK = function (side, i) { const s = SKIP.get(kOf(this.T, this.N)); if (s && s.has(this.T[i])) return false; return ao0.call(this, side, i); };
const layers = [];
for (let L = 0; L < 8; L++) {
  const r = evalCfg(H4W, { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  const got = r.all.map((x) => { const t = x.t, b = t._b, iE = t.iEntry, iX = Math.min(t.iExit, b.length - 1);
    return { id: x.id, b, key: kOf(b.map((z) => z.t), b.length), sigT: b[t.iSig].t, e: t.entry, st: t.stop0, ex: t.exitP, T: b[iE].t, TOut: b[iX].t + H4, L }; })
    .filter((q) => !(SKIP.get(q.key) || new Set()).has(q.sigT));
  if (!got.length) break;
  layers.push(got); for (const q of got) { if (!SKIP.has(q.key)) SKIP.set(q.key, new Set()); SKIP.get(q.key).add(q.sigT); }
  console.log(`прогон ${L + 1}: новых сделок ${got.length}`);
}
const allT = [].concat(...layers);
// не больше K одновременно открытых сделок по бумаге (берём по времени, как робот)
function capK(list, K) {
  const out = [], open = new Map();
  for (const q of list.slice().sort((a, b) => a.T - b.T)) { const o = (open.get(q.id) || []).filter((z) => z.TOut > q.T); if (o.length < K) { o.push(q); out.push(q); } open.set(q.id, o); }
  return out;
}
function report(lab, list) {
  const all = list.map((q, i) => ({ id: q.id, i, T: q.T, TOut: q.TOut, nr: (q.ex - q.e - q.e * FEE * 2) / Math.abs(q.e - q.st), t: { side: 1, entry: q.e, stop0: q.st, exitP: q.ex } }));
  const p = portfolio(all, 0.25, (x) => x.i, 0.0005), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, 0.0005).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), 0.0005).cagr; }).sort((a, b) => a - b);
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(36), String(all.length).padStart(5), R.toFixed(0).padStart(5), (R / all.length).toFixed(2).padStart(6), pct(w / all.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '| взято', p.taken, 'пропущ.', p.skipped, '|', pct(rc[0]), '–', pct(rc[19]));
}
console.log(`\n«4 часа · неделя», покупки; ${MOEX ? '4ч Мосбиржи 2018–2026, половины до/после 09.08.2022' : '4ч VI.2024–X.2026'}`);
console.log('вариант'.padEnd(36), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия');
report('1 сделка на бумагу (как сейчас)', layers[0]);
const extra = allT.filter((q) => q.L > 0), avg = (z) => (z.reduce((s, q) => s + (q.ex - q.e - q.e * FEE * 2) / Math.abs(q.e - q.st), 0) / z.length).toFixed(3);
console.log(`  сделки, которые сейчас пропускаются из-за открытой: ${extra.length}, в среднем ${avg(extra)}R (обычные ${avg(layers[0])}R)`);
for (const K of [2, 3]) report(`до ${K} сделок на бумагу`, capK(allT, K));
report('все сигналы (без ограничения)', allT);
