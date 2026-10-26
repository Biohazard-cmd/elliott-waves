// Известные «крипто-стратегии» (26.10.2026, просьба Егора) на дневках 25 монет (data/crypto/*_1d, см. crypto_dl.js), 2018–X.2026.
// Решение — по закрытию дня, сделка — по открытию следующего, доход — от открытия до открытия; комиссия FEE % + 0,05% проскальзывания с оборота;
// свободные деньги — в USDT под 0%. Половины до/после 01.05.2022, «последний год» — с 18.10.2025.
// (1) «купить и держать»: BTC; все монеты поровну (раз в неделю — снова поровну);
// (2) тренд: держать монету, пока закрытие выше SMA N (или после пробоя максимума за N дней — до закрытия ниже минимума за N/2), иначе в долларах;
//     BTC один или 25 монет по 1/25 капитала (свободная доля — в долларах);
// (3) ротация по силе: раз в неделю (пн) — K монет с наибольшим ростом за L недель, поровну; с фильтром — только если BTC выше SMA 200, иначе в долларах.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const FEE = (+(process.env.FEE || 0.1) + 0.05) / 100, DAY = 864e5, SPLIT = Date.UTC(2022, 4, 1), LAST = Date.UTC(2025, 9, 18);
const DIR = path.join(__dirname, 'data', 'crypto');
const C = {};   // монета → Map(день → {o, c})
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('_1d.json.gz'))) {
  const m = new Map(); for (const [t, o, , , c] of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))))) m.set(t, { o, c });
  C[f.replace('_1d.json.gz', '')] = m;
}
const coins = Object.keys(C), T0 = Date.UTC(2018, 0, 1), T1 = Math.max(...C.BTC.keys());
const days = []; for (let t = T0; t <= T1; t += DAY) days.push(t);
// индикаторы по закрытию каждого дня
const ind = {};
for (const k of coins) {
  const cl = days.map((t) => C[k].get(t)?.c ?? null), sma = (n) => cl.map((_, i) => { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) { if (cl[j] == null) return null; s += cl[j]; } return s / n; });
  const ext = (n, f) => cl.map((_, i) => { if (i < n) return null; let v = f === 'max' ? -Infinity : Infinity; for (let j = i - n; j < i; j++) { if (cl[j] == null) return null; v = Math[f](v, cl[j]); } return v; });
  ind[k] = { cl, sma: { 50: sma(50), 100: sma(100), 200: sma(200) }, hi: { 20: ext(20, 'max'), 50: ext(50, 'max'), 100: ext(100, 'max') }, lo: { 10: ext(10, 'min'), 25: ext(25, 'min'), 50: ext(50, 'min') } };
}
// прогон: wfn(i) → веса {монета: доля} по закрытию дня i; доход дня i+1 → i+2 по открытиям
function run(wfn, from = T0, to = T1) {
  let eq = 1, w = {}, peak = 1, mdd = 0, inMkt = 0, n = 0, turn = 0; const eqAt = new Map();
  for (let i = 0; i + 2 < days.length; i++) {
    if (days[i] < from || days[i + 1] > to) continue;
    const tw = wfn(i) || {}, nw = {};
    // монеты, которые остаются, держим с их долей после роста/падения (без ежедневной перебалансировки); новые — по целевой доле, сколько позволяют свободные деньги;
    // полная перебалансировка — только когда стратегия так решила (вернула тот же объект с флагом reb)
    if (tw.__reb) { for (const k of Object.keys(tw)) if (k !== '__reb') nw[k] = tw[k]; }
    else { let used = 0; for (const k of Object.keys(tw)) if (w[k]) { nw[k] = w[k]; used += w[k]; } for (const k of Object.keys(tw)) if (!w[k]) { const x = Math.min(tw[k], Math.max(0, 1 - used)); if (x > 0) { nw[k] = x; used += x; } } }
    const ks = new Set([...Object.keys(w), ...Object.keys(nw)]); let tv = 0; for (const k of ks) tv += Math.abs((nw[k] || 0) - (w[k] || 0));
    eq *= 1 - tv * FEE; turn += tv; w = nw;
    let g = 0, used = 0; for (const [k, x] of Object.entries(w)) { const a = C[k].get(days[i + 1]), b = C[k].get(days[i + 2]); if (a && b) { g += x * (b.o / a.o - 1); used += x; } }
    eq *= 1 + g; inMkt += used; n++;
    // веса дрейфуют с ценой до следующего решения
    const tot = 1 + g; for (const k of Object.keys(w)) { const a = C[k].get(days[i + 1]), b = C[k].get(days[i + 2]); if (a && b) w[k] = w[k] * (b.o / a.o) / tot; else w[k] /= tot; }
    peak = Math.max(peak, eq); mdd = Math.max(mdd, 1 - eq / peak); eqAt.set(days[i + 2], eq);
  }
  const yrs = n / 365.25;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, inMkt: inMkt / n, turnY: turn / yrs, eq };
}
const pct = (v) => (v * 100).toFixed(1).padStart(6);
function rep(lab, wfn) {
  const a = run(wfn), h1 = run(wfn, T0, SPLIT), h2 = run(wfn, SPLIT, T1), ly = run(wfn, LAST, T1);
  console.log(lab.padEnd(44), pct(a.cagr), pct(h1.cagr), pct(h2.cagr), pct(ly.eq - 1) + '%', pct(a.mdd) + '%', pct(a.inMkt) + '%', (a.turnY).toFixed(1).padStart(6));
}
const live = (k, i) => ind[k].cl[i] != null && C[k].get(days[i + 1]);
console.log(`\nКрипта, дневки ${coins.length} монет, ${new Date(T0).toISOString().slice(0, 10)}–${new Date(T1).toISOString().slice(0, 10)}; комиссия+проскальзывание ${(FEE * 100).toFixed(2)}% с оборота; свободные деньги — 0%`);
console.log('стратегия'.padEnd(44), ' %/год  1пол   2пол  посл.год  просадка в рынке оборот/год');
rep('BTC: купить и держать', () => ({ BTC: 1 }));
let eqw = {}; rep('все монеты поровну, раз в неделю', (i) => { if (new Date(days[i]).getUTCDay() === 0 || !Object.keys(eqw).length) { const z = coins.filter((k) => live(k, i)); eqw = Object.fromEntries(z.map((k) => [k, 1 / z.length])); return Object.assign({ __reb: true }, eqw); } return eqw; });
// тренд
for (const N of [50, 100, 200]) {
  rep(`тренд BTC: выше SMA ${N}`, (i) => { const s = ind.BTC.sma[N][i]; return s && ind.BTC.cl[i] > s ? { BTC: 1 } : {}; });
  rep(`тренд, 25 монет по 1/25: выше SMA ${N}`, (i) => { const o = {}; for (const k of coins) { const s = ind[k].sma[N][i]; if (s && live(k, i) && ind[k].cl[i] > s) o[k] = 1 / coins.length; } return o; });
}
for (const [N, M] of [[20, 10], [50, 25], [100, 50]]) {
  const st = {};
  const f = (only) => (i) => { const o = {}; for (const k of only || coins) { const x = ind[k], c = x.cl[i]; if (c == null || !live(k, i)) { st[k] = false; continue; }
    if (!st[k] && x.hi[N][i] != null && c > x.hi[N][i]) st[k] = true; else if (st[k] && x.lo[M][i] != null && c < x.lo[M][i]) st[k] = false;
    if (st[k]) o[k] = only ? 1 : 1 / coins.length; } return o; };
  rep(`пробой BTC: максимум ${N} дн., выход — минимум ${M}`, f(['BTC'])); for (const k of coins) st[k] = false;
  rep(`пробой, 25 монет по 1/25: ${N}/${M}`, f(null)); for (const k of coins) st[k] = false;
}
// ротация по силе
for (const flt of [false, true]) for (const L of [1, 2, 4, 12]) for (const K of [3, 5]) {
  let cur = {};
  rep(`ротация: топ-${K} за ${L} нед.${flt ? ', BTC > SMA 200' : ''}`, (i) => {
    if (flt) { const s = ind.BTC.sma[200][i]; if (!s || ind.BTC.cl[i] <= s) return (cur = {}); }
    if (new Date(days[i]).getUTCDay() !== 0 && Object.keys(cur).length) return cur;   // решение в вс по закрытию → вход в пн
    const r = coins.filter((k) => live(k, i) && ind[k].cl[i - 7 * L] != null).map((k) => [k, ind[k].cl[i] / ind[k].cl[i - 7 * L]]).sort((a, b) => b[1] - a[1]).slice(0, K);
    cur = r.length ? Object.fromEntries(r.map(([k]) => [k, 1 / r.length])) : {}; return Object.assign({ __reb: true }, cur);
  });
}
