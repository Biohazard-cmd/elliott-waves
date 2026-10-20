// Элдер, индекс новых максимумов — новых минимумов: по 65 бумагам за день считаем, сколько сделали
// максимум за L свечей минус сколько сделали минимум за L свечей; сумма за последние S дней > 0 — рынок «за быков».
// Фильтр: покупку брать, только если сумма > 0 (вдобавок к нашему фильтру рынка). Обёртка над marketOK в памяти.
const { evalCfg, SPLIT, E, ser } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');

const daily = ser;   // strat.js: только дневки
function build(L) {   // t (день) → NH − NL
  const m = new Map();
  for (const s of daily) {
    const b = s.bars;
    for (let i = L; i < b.length; i++) {
      let hi = -Infinity, lo = Infinity; for (let j = i - L; j < i; j++) { if (b[j].h > hi) hi = b[j].h; if (b[j].l < lo) lo = b[j].l; }
      const d = (b[i].h > hi ? 1 : 0) - (b[i].l < lo ? 1 : 0); if (!d) { if (!m.has(b[i].t)) m.set(b[i].t, 0); continue; }
      m.set(b[i].t, (m.get(b[i].t) || 0) + d);
    }
  }
  const t = Array.from(m.keys()).sort((a, b) => a - b);
  return { t, v: t.map((x) => m.get(x)) };
}
function smooth(x, S) { const t = x.t, v = x.v, o = new Array(v.length); let s = 0; for (let k = 0; k < v.length; k++) { s += v[k]; if (k >= S) s -= v[k - S]; o[k] = s; } return { t, v: o }; }
let NH = null;
const orig = E.Ctx.prototype.marketOK;
E.Ctx.prototype.marketOK = function (side, t) {
  if (!orig.call(this, side, t)) return false;
  if (!this.cfg.nhnl || !NH || t < NH.t[0]) return true;
  let lo = 0, hi = NH.t.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (NH.t[mid] <= t) lo = mid; else hi = mid - 1; }
  return side * NH.v[lo] > 0;
};

const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 17; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
const VAR = [['выкл.', 0, 0], ['250 св., 1 день', 250, 1], ['250 св., 10 дней', 250, 10], ['250 св., 20 дней', 250, 20], ['65 св., 1 день', 65, 1], ['65 св., 10 дней', 65, 10], ['65 св., 20 дней', 65, 20]];
const base = {}; for (const L of [65, 250]) base[L] = build(L);
for (const [, L, S] of VAR) if (L) { const x = smooth(base[L], S); const pos = x.v.filter((v) => v > 0).length; console.log(`NH−NL ${L} свечей, сумма за ${S}: «за быков» ${(pos / x.v.length * 100).toFixed(0)}% дней`); }
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('фильтр'.padEnd(18), 'сделок     R  ср.R  %/год  до23  с23  просадка серия | порядок');
  for (const [lab, L, S] of VAR) {
    NH = L ? smooth(base[L], S) : null;
    const r = evalCfg(Object.assign({}, pre, L ? { nhnl: true } : {}), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0);
    console.log(lab.padEnd(18), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
  }
}
