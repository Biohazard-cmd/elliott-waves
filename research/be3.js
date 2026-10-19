// Безубыток на дневках: варианты «когда переносить стоп на вход (+комиссия)». Сделки системы те же, меняется только выход.
const st = require('./strat.js'); const { evalCfg, portfolio, ser, E, SPLIT } = st;
const PRE = (process.env.PRE || 'main') === 'aggr' ? { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 } : { addAO: true, addSma200: true, maxHoldDays: 182 };
const r0 = evalCfg(PRE);
const FEE = 0.0005, SLIP = 0.0002, BUF = 2 * FEE + 2 * SLIP + 0.0005;

function sma(a, n) { const o = new Array(a.length).fill(NaN); let s = 0; for (let k = 0; k < a.length; k++) { s += a[k]; if (k >= n) s -= a[k - n]; if (k >= n - 1) o[k] = s / n; } return o; }
const MK = st.mkt, mv50 = sma(MK.v, 50), mkI = new Map(MK.t.map((t, k) => [t, k]));
const D = {};
for (const s of ser) {
  const cfg = E.merge(Object.assign({}, st.BASE, PRE, { maxBars: s.bars.length }));
  const bars = E.trimGaps(s.bars.slice(-cfg.maxBars), s.P).bars;
  const H = bars.map((b) => b.h), L = bars.map((b) => b.l), C = bars.map((b) => b.c), O = bars.map((b) => b.o), M = H.map((h, k) => (h + L[k]) / 2);
  const ctx = new E.Ctx(bars, cfg), A = ctx.atr();
  const ao = sma(M, 5).map((v, k) => v - sma(M, 34)[k]);
  const sw = E.autoSwing(bars, cfg.swingMult), zs = E.zzInit(sw / 100 * cfg.subRatio), sub = []; const subAt = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) { if (E.zzPush(zs, i, H, L, sub)) subAt[i] = sub[sub.length - 1]; }   // разворот младшей степени подтверждён на свече i
  D[s.id] = { bars, H, L, C, O, A, ao, subAt, T: bars.map((b) => b.t) };
}
// trig(t, d, i, st) -> true: на закрытии свечи i включаем безубыток (стоп на вход + комиссии со следующей свечи)
const V = {
  'нет (как сейчас)': null,
  '+1R': (t, d, i, s) => s.fav >= 1 * s.risk,
  '+1.5R': (t, d, i, s) => s.fav >= 1.5 * s.risk,
  '+2R': (t, d, i, s) => s.fav >= 2 * s.risk,
  '2×ATR': (t, d, i, s) => s.fav >= 2 * s.a0,
  '3×ATR': (t, d, i, s) => s.fav >= 3 * s.a0,
  '4×ATR': (t, d, i, s) => s.fav >= 4 * s.a0,
  // по волнам: волна 3 прошла вершину волны 1 и на младшей степени подтвердился первый откат выше неё
  'волны: откат над вершиной W1': (t, d, i, s) => {
    if (t.setup !== 0 || !t.cnt || t.cnt.px.length < 2) return false;
    const w1 = t.cnt.px[1]; if (!s.w1x && t.side * (d.H[i] - w1) > 0 && t.side > 0) s.w1x = true; if (!s.w1x && t.side < 0 && d.L[i] < w1) s.w1x = true;
    const p = d.subAt[i]; return s.w1x && p && p.i > t.iEntry && (t.side > 0 ? p.t === -1 && p.p > w1 : p.t === 1 && p.p < w1);
  },
  // тревожные признаки (только если цена уже выше входа)
  'тревога: AO против': (t, d, i, s) => d.ao[i] * t.side < 0,
  'тревога: рынок < SMA50': (t, d, i, s) => { const k = mkI.get(d.T[i]); return k != null && !isNaN(mv50[k]) && t.side * (MK.v[k] - mv50[k]) < 0; },
  'тревога: 20 свечей без +0.5R': (t, d, i, s) => i - t.iEntry >= 20 && s.fav < 0.5 * s.risk,
  'тревога: любая из трёх': (t, d, i, s) => V['тревога: AO против'](t, d, i, s) || V['тревога: рынок < SMA50'](t, d, i, s) || V['тревога: 20 свечей без +0.5R'](t, d, i, s),
};
function apply(x, fn) {
  const t = x.t, d = D[x.id]; if (!fn || !d) return { nr: x.nr, exitP: t.exitP, iExit: t.iExit, fired: false, moved: false };
  const s = { risk: Math.abs(t.entry - t.stop0), a0: d.A[Math.max(0, t.iEntry - 1)], fav: 0 };
  const be = t.entry * (1 + t.side * BUF);
  let armed = false, fired = false;
  for (let i = t.iEntry; i <= Math.min(t.iExit, d.bars.length - 1); i++) {
    if (armed) {
      const hit = t.side > 0 ? d.L[i] <= be : d.H[i] >= be;
      if (hit && (i < t.iExit || t.reason === 0 || t.side * (t.exitP - be) < 0)) {
        const px = t.side > 0 ? Math.min(d.O[i], be) : Math.max(d.O[i], be);
        if (i === t.iExit && t.side * (t.exitP - px) >= 0) break;   // исходный выход не хуже
        const nr = (t.side * (px - t.entry) - (2 * FEE + 2 * SLIP) * t.entry) / s.risk;
        return { nr, exitP: px, iExit: i, fired: true, moved: true };
      }
    }
    s.fav = Math.max(s.fav, t.side * ((t.side > 0 ? d.H[i] : d.L[i]) - t.entry));
    // включаем, только если цена закрылась выше уровня безубытка (иначе это был бы просто выход по рынку)
    if (!armed && i < t.iExit && t.side * (d.C[i] - be) > 0 && fn(t, d, i, s)) armed = fired = true;
  }
  return { nr: x.nr, exitP: t.exitP, iExit: t.iExit, fired, moved: false };
}
function streak(a) { let m = 0, c = 0; for (const x of a.slice().sort((p, q) => p.T - q.T)) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; }
console.log('набор:', process.env.PRE || 'main', 'сделок', r0.all.length);
for (const [name, fn] of Object.entries(V)) {
  const all = [], st2 = { fired: 0, saved: 0, killed: 0, killedR: 0, savedR: 0 };
  for (const x of r0.all) {
    const z = apply(x, fn), d = D[x.id];
    if (z.fired) st2.fired++;
    if (z.moved) { if (x.nr < 0) { st2.saved++; st2.savedR += z.nr - x.nr; } else { st2.killed++; st2.killedR += x.nr - z.nr; } }
    all.push({ id: x.id, T: x.T, TOut: z.moved ? d.T[z.iExit] : x.TOut, nr: z.nr, t: Object.assign({}, x.t, { exitP: z.exitP }) });
  }
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length, h1 = all.filter((x) => x.T < SPLIT).reduce((s, x) => s + x.nr, 0);
  const p = portfolio({ all }, { cash: true });
  const ph = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio({ all: z }, { cash: true }));
  console.log(name.padEnd(30), 'R', R.toFixed(0).padStart(4), 'ср', (R / all.length).toFixed(2), 'приб', (w / all.length * 100).toFixed(0) + '%', 'серия', String(streak(all)).padStart(2), '| до23', h1.toFixed(0).padStart(4), 'с23', (R - h1).toFixed(0).padStart(4),
    '|', (p.cagr * 100).toFixed(1) + '%/год', '(' + (ph[0].cagr * 100).toFixed(0) + '/' + (ph[1].cagr * 100).toFixed(0) + ')', 'DD', (p.mdd * 100).toFixed(0) + '%', '| сработал', st2.fired, 'спас', st2.saved, '(+' + st2.savedR.toFixed(0) + 'R)', 'выбил', st2.killed, '(−' + st2.killedR.toFixed(0) + 'R)');
}
