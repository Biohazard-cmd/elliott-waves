// «Ясный подсчёт» (Пректер, гл. 6; Кеннеди): брать сигнал, только если подсчёт ясный. 25.10.2026.
// Варианты: (а) лучший подсчёт против сделки хуже подсчёта сигнала на G пунктов оценки; (б) K лучших подсчётов не против сделки;
// (в) сигнал только от лучшего (первого) подсчёта. Фильтр — в копии движка в памяти (engine2.js не меняется).
// SET=main|agr|h4w node clarity.js   (h4w — «4 часа · неделя» на 4ч Мосбиржи 2018–2026)
const Module = require('module'), path = require('path');
const ENG = path.resolve(__dirname, '../android/assets/engine2.js');
const comp = Module.prototype._compile;
Module.prototype._compile = function (src, file) {
  if (path.resolve(file) === ENG) {
    const from = 'this.aoOK(pl.side, i)) { sig = pl;';
    if (src.split(from).length !== 2) throw new Error('clarity: не нашёл выбор сигнала в engine2.js');
    src = src.replace(from, 'this.aoOK(pl.side, i) && (!c.clarHook || c.clarHook.call(this, s, sc, pl, i))) { sig = pl;');
  }
  return comp.call(this, src, file);
};
const S = require('./store.js');
const strat = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const SET = process.env.SET || 'main';
const RR = { addMinRR: true, minRR: 1.5 }, BE3 = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
const CFG = {
  main: Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182 }, RR),
  agr: Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true }, RR, BE3),
  h4w: Object.assign({ longOnly: true, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
    setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 }, BE3),
}[SET];
const H4 = SET === 'h4w';
const opt = H4 ? { ser: require('./moex4h.js').series(S), mkt: S.D.buildMarket('4h', 200) } : {};
const SPLIT = H4 ? Date.UTC(2022, 7, 9) : strat.SPLIT;
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// куда ведёт подсчёт: незавершённая фигура — по её направлению, завершённая — против; незавершённый треугольник — никуда (0)
const done = (x) => (x.fam === 0 && x.n === 6) || (x.fam === 1 && x.n === 4) || (x.fam === 2 && x.n === 6);
const imp = (x) => done(x) ? -x.dir : x.fam === 2 ? 0 : x.dir;
// самопроверка направления: импульс вверх идёт — вверх, завершён — вниз; треугольник идёт — нейтрально
require('assert').deepStrictEqual([imp({ fam: 0, n: 3, dir: 1 }), imp({ fam: 0, n: 6, dir: 1 }), imp({ fam: 1, n: 4, dir: -1 }), imp({ fam: 2, n: 5, dir: 1 })], [1, -1, 1, 0]);
const avgV = (V, a, b) => { let s = 0, n = 0; for (let j = Math.max(0, a); j <= b; j++) { s += V[j]; n++; } return n ? s / n : 0; };
function hook(v) {
  return function (s, sc, pl, i) {
    if (v.vol) {   // объём (Пректер): только для входа в волну 3
      if (s.fam !== 0 || s.n !== 3) return true;
      const V = this.V, x = s.idx, v1 = avgV(V, x[0] + 1, x[1]), v2 = avgV(V, x[1] + 1, x[2]);
      if (!(v1 > 0 && v2 > 0)) return true;
      return v.vol === 'w2lo' ? v2 <= v.m * v1 : v.vol === 'up' ? avgV(V, x[2] + 1, i) >= v.m * v2 : V[i] >= v.m * avgV(V, i - 20, i - 1);
    }
    const ms = this.cfg.minScore, alt = sc.filter((x) => x !== s && x.score >= ms);
    if (v.top) return sc[0] === s;
    if (v.k) return sc.filter((x) => x.score >= ms).slice(0, v.k).every((x) => imp(x) !== -pl.side);
    const opp = alt.filter((x) => imp(x) === -pl.side);
    return !opp.length || opp[0].score <= s.score - v.gap;
  };
}
function run(lab, v, base) {
  const cfg = Object.assign({}, CFG, v ? { clarHook: hook(v) } : {});
  const r = strat.evalCfg(cfg, Object.assign({ tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } }, opt));
  if (H4) for (const x of r.all) x.TOut += 4 * 3600e3;   // как в fri_chan.js: деньги свободны после закрытия свечи выхода
  const adds = cfg.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
  const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
  const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length;
  // отсеянные: сделки базы, которых в варианте нет (по бумаге и времени входа)
  let gone = '';
  if (base) { const k = new Set(r.all.map((x) => x.id + '|' + x.T)), g = base.all.filter((x) => !k.has(x.id + '|' + x.T));
    gone = `| ушло ${String(g.length).padStart(4)} сд., ср. ${(g.reduce((s, x) => s + x.nr, 0) / (g.length || 1)).toFixed(2).padStart(5)}R`; }
  console.log(lab.padEnd(30), String(r.n).padStart(5), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(3).padStart(6), pct(w / r.n) + '%', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]), gone);
  return r;
}
const NM = { main: 'дневки · основной (2.38)', agr: 'дневки · агрессивный с доливками (2.38)', h4w: '«4 часа · неделя» (как сейчас, без канала), 4ч Мосбиржи 2018–2026' }[SET];
console.log(`\n${NM}; половины до/после ${new Date(SPLIT).toISOString().slice(0, 10)}`);
console.log('вариант'.padEnd(30), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия | порядок        | отсеяно');
const base = run('как сейчас');
if (process.env.VOL) { for (const [vol, m] of [['w2lo', 0.7], ['w2lo', 0.85], ['w2lo', 1], ['up', 1], ['up', 1.25], ['up', 1.5], ['sig', 1], ['sig', 1.5]]) run(`объём ${vol} ${m}`, { vol, m }, base); process.exit(0); }
for (const gap of [0, 5, 10, 15, 20]) run(`против хуже на ${gap} пунктов`, { gap }, base);
for (const k of [2, 3]) run(`${k} лучших не против`, { k }, base);
run('только от лучшего подсчёта', { top: true }, base);
