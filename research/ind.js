// Скрининг индикаторов-фильтров на сделках основного набора (дневки, покупки, AO включён).
// Признаки считаются на свече сигнала (iSig) — без заглядывания вперёд.
const st = require('./strat.js'); const { evalCfg, ser, SPLIT } = st;
const OVER = Object.assign({ addAO: true, maxHoldDays: 182 }, JSON.parse(process.env.OVER || '{}'));
const r = evalCfg(OVER);

function sma(a, n) { const o = new Array(a.length).fill(NaN); let s = 0; for (let k = 0; k < a.length; k++) { s += a[k]; if (k >= n) s -= a[k - n]; if (k >= n - 1) o[k] = s / n; } return o; }
function ema(a, n) { const o = new Array(a.length).fill(NaN), al = 2 / (n + 1); let e = a[0]; for (let k = 0; k < a.length; k++) { e = k ? e + al * (a[k] - e) : a[0]; o[k] = k >= n - 1 ? e : NaN; } return o; }
function rsi(C, n) { const o = new Array(C.length).fill(NaN); let g = 0, l = 0; for (let k = 1; k < C.length; k++) { const d = C[k] - C[k - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (k <= n) { g += up / n; l += dn / n; if (k === n) o[k] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[k] = 100 - 100 / (1 + g / (l || 1e-12)); } } return o; }
function adx(H, L, C, n) {
  const N = C.length, adxA = new Array(N).fill(NaN), pdi = new Array(N).fill(NaN), mdi = new Array(N).fill(NaN);
  let tr = 0, pd = 0, md = 0, ax = NaN, dxs = [];
  for (let k = 1; k < N; k++) {
    const t = Math.max(H[k] - L[k], Math.abs(H[k] - C[k - 1]), Math.abs(L[k] - C[k - 1]));
    const up = H[k] - H[k - 1], dn = L[k - 1] - L[k];
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    if (k <= n) { tr += t; pd += p; md += m; } else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; }
    if (k >= n) { const P = 100 * pd / tr, M = 100 * md / tr; pdi[k] = P; mdi[k] = M; const dx = 100 * Math.abs(P - M) / ((P + M) || 1e-12);
      if (isNaN(ax)) { dxs.push(dx); if (dxs.length === n) ax = dxs.reduce((a, b) => a + b, 0) / n; } else ax = (ax * (n - 1) + dx) / n; adxA[k] = ax; }
  }
  return { adx: adxA, pdi, mdi };
}
function atr(H, L, C, n) { const t = C.map((c, k) => k ? Math.max(H[k] - L[k], Math.abs(H[k] - C[k - 1]), Math.abs(L[k] - C[k - 1])) : H[k] - L[k]); return sma(t, n); }

// индекс рынка: среднее нормированных цен всех бумаг (равновзвешенный), по датам
const mktMap = new Map();
for (const s of ser) { const b = s.bars; for (let k = 1; k < b.length; k++) { const d = Math.log(b[k].c / b[k - 1].c); if (!isFinite(d) || Math.abs(d) > 0.3) continue; const e = mktMap.get(b[k].t) || [0, 0]; e[0] += d; e[1]++; mktMap.set(b[k].t, e); } }
const mT = [...mktMap.keys()].sort((a, b) => a - b); let acc = 0; const mIdx = new Map(); const mC = [];
for (const t of mT) { const e = mktMap.get(t); acc += e[0] / e[1]; mC.push(acc); mIdx.set(t, mC.length - 1); }
const mS200 = sma(mC.map(Math.exp), 200), mS50 = sma(mC.map(Math.exp), 50);

const F = {};
for (const s of ser) {
  const bars = s.bars, O = bars.map((b) => b.o), H = bars.map((b) => b.h), L = bars.map((b) => b.l), C = bars.map((b) => b.c), V = bars.map((b) => b.v || 0);
  const M = H.map((h, k) => (h + L[k]) / 2);
  const s50 = sma(C, 50), s200 = sma(C, 200), e20 = ema(C, 20), rs = rsi(C, 14), ad = adx(H, L, C, 14), at = atr(H, L, C, 14);
  const m12 = ema(C, 12), m26 = ema(C, 26), macd = m12.map((v, k) => v - m26[k]), msig = ema(macd.map((v) => isNaN(v) ? 0 : v), 9);
  const v20 = sma(V, 20), v50 = sma(V, 50);
  // недельный AO: по последним 5 дневкам как неделя (скользящая)
  const ao = sma(M, 5).map((v, k) => v - sma(M, 34)[k]);
  const wAO = sma(M, 25).map((v, k) => v - sma(M, 170)[k]);
  const hi250 = C.map((_, k) => { let m = -Infinity; for (let j = Math.max(0, k - 249); j <= k; j++) m = Math.max(m, H[j]); return m; });
  const obv = []; let ob = 0; for (let k = 0; k < C.length; k++) { if (k) ob += C[k] > C[k - 1] ? V[k] : C[k] < C[k - 1] ? -V[k] : 0; obv.push(ob); } const obS = sma(obv, 20);
  F[s.id] = { bars, O, H, L, C, V, s50, s200, e20, rs, ad, at, macd, msig, v20, v50, ao, wAO, hi250, obv, obS };
}

const rows = [];
for (const x of r.all) {
  const f = F[x.id], t = x.t; const N = f.bars.length;
  // индексы из quickStats относятся к bars.slice(-st.N); quickStats в strat берёт s.bars целиком (maxBars = длина), значит совпадают
  const k = t.iSig, c = f.C[k];
  const cnt = t.cnt || {}; const idx = cnt.idx || [], px = cnt.px || [];
  const legV = (a, b) => { if (a == null || b == null || b <= a) return NaN; let s = 0; for (let j = a + 1; j <= b; j++) s += f.V[j]; return s / (b - a); };
  const mi = mIdx.get(f.bars[k].t);
  const ret = (n) => k >= n ? c / f.C[k - n] - 1 : NaN;
  const mret = (n) => (mi != null && mi >= n) ? Math.exp(mC[mi] - mC[mi - n]) - 1 : NaN;
  rows.push({
    nr: x.nr, T: x.T, id: x.id, setup: t.setup,
    'выше SMA200': c > f.s200[k], 'SMA200 растёт': f.s200[k] > f.s200[k - 20], 'выше SMA50': c > f.s50[k], 'SMA50 > SMA200': f.s50[k] > f.s200[k],
    RSI: f.rs[k], ADX: f.ad.adx[k], '+DI > -DI': f.ad.pdi[k] > f.ad.mdi[k],
    'MACD > сигн.': f.macd[k] > f.msig[k], 'MACD > 0': f.macd[k] > 0,
    'объём 20/50': f.v20[k] / f.v50[k], 'объём волны 1 / волны 2': legV(idx[0], idx[1]) / legV(idx[1], idx[2]),
    'OBV выше средней': f.obv[k] > f.obS[k],
    'ATR%': f.at[k] / c * 100, 'стоп %': Math.abs(t.entry - t.stop0) / t.entry * 100,
    'от 52-нед. макс. %': (1 - c / f.hi250[k]) * 100, 'над EMA20 в ATR': (c - f.e20[k]) / f.at[k],
    'недельный AO > 0': f.wAO[k] > 0,
    'рост 3 мес. %': ret(63) * 100, 'сила к рынку 3 мес.': (ret(63) - mret(63)) * 100,
    'рынок выше SMA200': mi != null ? Math.exp(mC[mi]) > mS200[mi] : null, 'рынок выше SMA50': mi != null ? Math.exp(mC[mi]) > mS50[mi] : null,
    'волна 2, % от 1': cnt.r2 ? cnt.r2 * 100 : NaN, 'оценка счёта': cnt.score,
  });
}
module.exports = { rows, r };
if (require.main === module) {
  const tot = rows.reduce((a, b) => a + b.nr, 0);
  console.log(`База: ${rows.length} сделок, ${tot.toFixed(0)} R, ср ${(tot / rows.length).toFixed(3)} (параметры ${JSON.stringify(OVER)})`);
  const show = (name, a) => { if (a.length < 15) return console.log('  ' + name.padEnd(28), 'мало (' + a.length + ')'); const R = a.reduce((s, x) => s + x.nr, 0), h1 = a.filter((x) => x.T < SPLIT).reduce((s, x) => s + x.nr, 0);
    const w = a.filter((x) => x.nr > 0).length; console.log('  ' + name.padEnd(28), 'сд', String(a.length).padStart(4), 'R', R.toFixed(0).padStart(4), 'ср', (R / a.length).toFixed(2).padStart(6), 'приб', (w / a.length * 100).toFixed(0).padStart(3) + '%', '| до23', (h1).toFixed(0).padStart(4), 'с23', (R - h1).toFixed(0).padStart(4)); };
  for (const key of Object.keys(rows[0]).filter((k) => !['nr', 'T', 'id', 'setup'].includes(k))) {
    console.log(key);
    const vals = rows.filter((x) => x[key] !== null && x[key] !== undefined && !(typeof x[key] === 'number' && isNaN(x[key])));
    if (typeof vals[0][key] === 'boolean') { show('да', vals.filter((x) => x[key])); show('нет', vals.filter((x) => !x[key])); continue; }
    const v = vals.map((x) => x[key]).sort((a, b) => a - b), q = [0.25, 0.5, 0.75].map((p) => v[Math.floor(v.length * p)]);
    const b = [-Infinity, ...q, Infinity];
    for (let j = 0; j < 4; j++) show(`${j === 0 ? '<' : b[j].toFixed(1) + '…'}${j === 3 ? '' : b[j + 1].toFixed(1)}${j === 3 ? '+' : ''}`, vals.filter((x) => x[key] >= b[j] && x[key] < b[j + 1]));
  }
}
