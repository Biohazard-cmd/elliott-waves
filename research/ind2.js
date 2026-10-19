// Фильтры в движке (меняют последовательность сделок) + портфель с деньгами на фонде денежного рынка.
const st = require('./strat.js'); const { evalCfg, portfolio, line, E, ser } = st;
const P = E.Ctx.prototype, ao0 = P.aoOK;
function sma(a, n) { const o = new Array(a.length).fill(NaN); let s = 0; for (let k = 0; k < a.length; k++) { s += a[k]; if (k >= n) s -= a[k - n]; if (k >= n - 1) o[k] = s / n; } return o; }
function adx(H, L, C, n) { const N = C.length, o = new Array(N).fill(NaN); let tr = 0, pd = 0, md = 0, ax = NaN, dxs = [];
  for (let k = 1; k < N; k++) { const t = Math.max(H[k] - L[k], Math.abs(H[k] - C[k - 1]), Math.abs(L[k] - C[k - 1])), up = H[k] - H[k - 1], dn = L[k - 1] - L[k];
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0; if (k <= n) { tr += t; pd += p; md += m; } else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; }
    if (k >= n) { const Pp = 100 * pd / tr, M = 100 * md / tr, dx = 100 * Math.abs(Pp - M) / ((Pp + M) || 1e-12); if (isNaN(ax)) { dxs.push(dx); if (dxs.length === n) ax = dxs.reduce((a, b) => a + b, 0) / n; } else ax = (ax * (n - 1) + dx) / n; o[k] = ax; } } return o; }
// равновзвешенный индекс рынка по всем бумагам
const mm = new Map(); for (const s of ser) { const b = s.bars; for (let k = 1; k < b.length; k++) { const d = Math.log(b[k].c / b[k - 1].c); if (!isFinite(d) || Math.abs(d) > 0.3) continue; const e = mm.get(b[k].t) || [0, 0]; e[0] += d; e[1]++; mm.set(b[k].t, e); } }
const mT = [...mm.keys()].sort((a, b) => a - b); let acc = 0; const mI = new Map(), mC = []; for (const t of mT) { const e = mm.get(t); acc += e[0] / e[1]; mC.push(Math.exp(acc)); mI.set(t, mC.length - 1); }
const MK = st.mkt; const mv50 = sma(MK.v, 50); const mkI = new Map(MK.t.map((t, k) => [t, k]));
function feats(ctx) {
  if (ctx._f) return ctx._f; const C = ctx.C, V = ctx.V, N = ctx.N;
  const s50 = sma(C, 50), s200 = sma(C, 200); const obv = []; let ob = 0; for (let k = 0; k < N; k++) { if (k) ob += C[k] > C[k - 1] ? V[k] : C[k] < C[k - 1] ? -V[k] : 0; obv.push(ob); }
  ctx._f = { s50, s200, obv, obS: sma(obv, 20), adx: adx(ctx.H, ctx.L, C, 14), v20: sma(V, 20), v50: sma(V, 50) }; return ctx._f;
}
const RULES = {
  'SMA200 растёт': (c, f, i, s) => { const L = +(process.env.LB || 20); return isNaN(f.s200[i - L]) || s * (f.s200[i] - f.s200[i - L]) > 0; },
  'цена выше SMA200': (c, f, i, s) => isNaN(f.s200[i]) || s * (c.C[i] - f.s200[i]) > 0,
  'SMA50 > SMA200': (c, f, i, s) => isNaN(f.s200[i]) || s * (f.s50[i] - f.s200[i]) > 0,
  'OBV выше средней': (c, f, i, s) => isNaN(f.obS[i]) || s * (f.obv[i] - f.obS[i]) > 0,
  'рынок выше SMA50': (c, f, i, s) => { const k = mkI.get(c.T[i]); return k == null || isNaN(mv50[k]) || s * (MK.v[k] - mv50[k]) > 0; },
  'без перегрева (рост 3 мес. < 33%)': (c, f, i, s) => i < 63 || s * (c.C[i] / c.C[i - 63] - 1) < 0.33,
  'ADX < 32': (c, f, i, s) => isNaN(f.adx[i]) || f.adx[i] < 32,
  'объём без всплеска (20/50 < 1.4)': (c, f, i, s) => isNaN(f.v50[i]) || f.v20[i] / f.v50[i] < 1.4,
};
let ACTIVE = [];
P.aoOK = function (side, i) { if (!ao0.call(this, side, i)) return false; if (!ACTIVE.length) return true; const f = feats(this); return ACTIVE.every((k) => RULES[k](this, f, i, side)); };
function streak(r) { const a = r.all.slice().sort((x, y) => x.T - y.T); let m = 0, c = 0; for (const x of a) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; }
const sets = process.env.ONLY ? [[process.env.ONLY]] : process.env.SHORT ? [[], ['SMA200 растёт'], ['рынок выше SMA50'], ['SMA200 растёт', 'рынок выше SMA50']] : [[], ...Object.keys(RULES).map((k) => [k]), ['SMA200 растёт', 'OBV выше средней'], ['SMA200 растёт', 'рынок выше SMA50'], ['OBV выше средней', 'рынок выше SMA50'], ['SMA200 растёт', 'OBV выше средней', 'рынок выше SMA50']];
const PRE = (process.env.PRE || 'main') === 'aggr' ? { addAO: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true } : { addAO: true, maxHoldDays: 182 };
console.log('набор:', JSON.stringify(PRE));
for (const s of sets) {
  ACTIVE = s; const r = evalCfg(PRE); const a = portfolio(r, { cash: true });
  const yrs = Object.entries(r.yr).map(([y, v]) => y.slice(2) + ':' + v.toFixed(0)).join(' ');
  console.log(line(s.length ? s.join(' + ') : 'текущий (AO)', r).replace(/^(.{34})/, (m) => m) + ` | серия стопов ${streak(r)} | ${(a.cagr * 100).toFixed(1)}%/год, просадка ${(a.mdd * 100).toFixed(0)}%, в рынке ${(a.expo * 100).toFixed(0)}%`);
  console.log('      годы R:', yrs);
}
