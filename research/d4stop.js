// Стоп дневной сделки за поддержкой 4ч графика (Мэрфи: младший график показывает поддержку ближе — стоп ближе, позиция больше при том же 1%), 25.10.2026.
// Новый стоп = последний подтверждённый к входу минимум 4ч зигзага × (1 − buf), если он выше дневного стопа и ниже входа, и риск не меньше k × прежнего.
// Дальше сделка — как у движка; стоп считается сработавшим на дневной свече, если её минимум ≤ нового стопа, а стоп движка (перенос, безубыток) ниже.
// Цель и фильтр П/Р — по прежнему стопу. PART=main|agr node d4stop.js
const { evalCfg, SPLIT, E } = require('./strat.js');
const S = require('./store.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const RR = { addMinRR: true, minRR: 1.5 }, BE3 = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
const PART = process.env.PART || 'main';
const CFG = PART === 'main' ? Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR)
  : Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE3);
const FEE = 0.0014;
const PV = new Map();   // минимумы 4ч зигзага по бумагам: { c: время подтверждения (закрытие свечи), p }
for (const sd of require('./moex4h.js').series(S)) {
  const ctx = new E.Ctx(sd.bars, E.merge({})), z = E.zzInit(E.autoSwing(sd.bars, 1) / 100), mp = [], a = PV.get(sd.id) || [];
  for (let k = 0; k < sd.bars.length; k++) if (E.zzPush(z, k, ctx.H, ctx.L, mp)) { const p = mp[mp.length - 1]; if (p.t === -1) a.push({ c: sd.bars[k].t + 4 * 3600e3, p: p.p }); }
  PV.set(sd.id, a);
}
const r = evalCfg(CFG, { tr: (t, bars) => { t._b = bars; if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; t.turn = 0; for (let j = Math.max(0, t.iEntry - 30); j < t.iEntry; j++) t.turn += bars[j].c * (bars[j].v || 0); return t.NR; } });
// стоп движка на свече j: последний перенос (path) до этой свечи
const stopAt = (t, j) => { let s = t.stop0; for (const m of t.path || []) if (m.bar < j && m.p > s) s = m.p; return s; };
function variant(buf, k) {
  let n = 0, hit = 0;
  const main = r.all.map((x) => {
    if (buf == null) return x;
    const t = x.t, b = t._b, a = PV.get(x.id) || []; let lo = null;
    for (let q = a.length - 1; q >= 0; q--) if (a[q].c <= x.T) { lo = a[q].p; break; }
    if (lo == null) return x;
    const st = lo * (1 - buf);
    if (!(st > t.stop0 && st < t.entry && t.entry - st >= k * (t.entry - t.stop0))) return x;
    n++;
    let ex = t.exitP, TOut = x.TOut, iX = t.iExit;
    for (let j = t.iEntry; j < Math.min(t.iExit, b.length); j++) if (b[j].l <= st && stopAt(t, j) < st) { ex = Math.min(b[j].o, st); TOut = b[j].t; iX = j; hit++; break; }
    const add = t.add && t.add.NR != null && t.add.i < iX ? Object.assign({}, t.add, { NR: (ex - t.add.px - t.add.px * FEE) / t.add.risk }) : null;
    return Object.assign({}, x, { nr: (ex - t.entry - t.entry * FEE) / (t.entry - st), TOut, t: Object.assign({}, t, { stop0: st, exitP: ex, add }) });
  });
  const adds = CFG.addPyramid ? main.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: 1, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = main.concat(adds); all.forEach((x) => { x.i = -(x.of || x).t.turn; });
  const p = portfolio(all, 0.25, (x) => x.i), h = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i).cagr);
  const R = main.reduce((s, x) => s + x.nr, 0) + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = main.filter((x) => x.nr > 0).length;
  return { n, hit, R, w: w / main.length, p, h };
}
console.log(`\nДНЕВКИ · ${PART === 'main' ? 'основной' : 'агрессивный с доливками'} (2.38): стоп за 4ч минимумом; порядок по обороту; половины до/после 2023`);
console.log('вариант'.padEnd(46), '    R прибыльн. %/год  до23  с23  просадка серия');
const show = (lab, v) => console.log(lab.padEnd(46), v.R.toFixed(0).padStart(5), pct(v.w) + '%  ', pct(v.p.cagr), pct(v.h[0]), pct(v.h[1]), pct(v.p.mdd) + '%', String(v.p.st).padStart(4));
show('дневной стоп (как сейчас)', variant(null));
for (const buf of [0, 0.005, 0.01]) for (const k of [0.25, 0.5]) { const v = variant(buf, k); show(`  запас ${buf * 100}%, риск ≥ ${k} прежнего (${v.n} сд., выбило ${v.hit})`, v); }
