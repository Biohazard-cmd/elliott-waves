// Тренд по биткоину (держать, пока закрытие выше SMA N) + приёмы из приложения, чтобы уменьшить просадку (26.10.2026, Егор).
// Дневки BTC/USDT (data/crypto/BTC_1d), 2018–X.2026. Решение по закрытию, сделка по открытию следующего дня, комиссия 0,1% + 0,05%; в долларах, свободные — под 0%.
// Просадка — двумя способами: по ежедневной оценке счёта (строже) и по закрытым сделкам (как у наших роботов в «Что проверено»).
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const FEE = 0.0015, DAY = 864e5, SPLIT = Date.UTC(2022, 4, 1), LAST = Date.UTC(2025, 9, 18);
const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'crypto', 'BTC_1d.json.gz')))).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
const n = B.length, C = B.map((b) => b.c);
const sma = (N) => C.map((_, i) => { if (i < N - 1) return null; let s = 0; for (let j = i - N + 1; j <= i; j++) s += C[j]; return s / N; });
const SMA = { 20: sma(20), 50: sma(50), 100: sma(100), 200: sma(200) };
const atr = (() => { const a = []; let v = null; for (let i = 0; i < n; i++) { const tr = i ? Math.max(B[i].h - B[i].l, Math.abs(B[i].h - C[i - 1]), Math.abs(B[i].l - C[i - 1])) : B[i].h - B[i].l; v = v == null ? tr : (v * 13 + tr) / 14; a.push(v); } return a; })();
const med = (k) => B.map((b) => (b.h + b.l) / 2).map((_, i, M) => { if (i < k - 1) return null; let s = 0; for (let j = i - k + 1; j <= i; j++) s += M[j]; return s / k; });
const AO = (() => { const a = med(5), b = med(34); return a.map((x, i) => (x != null && b[i] != null ? x - b[i] : null)); })();
const vol = ((k) => C.map((_, i) => { if (i < k) return null; const r = []; for (let j = i - k + 1; j <= i; j++) r.push(Math.log(C[j] / C[j - 1])); const m = r.reduce((s, x) => s + x, 0) / k; return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (k - 1) * 365); }))(30);

// o: { N, beAtr, trail, stop0, ao, rising, golden, volT, frac, riskPct, fresh }
function run(o, from = B[0].t, to = B[n - 1].t) {
  const N = o.N || 100, S = SMA[N];
  let eq = 1, pos = 0, peak = 1, mdd = 0, inMkt = 0, days = 0, trades = 0, cash = 1;
  let entry = 0, best = 0, stop = -Infinity, blocked = false, eqClosed = 1, peakC = 1, mddC = 0;
  for (let i = 1; i + 1 < n; i++) {
    if (B[i].t < from || B[i + 1].t > to) continue;
    const c = C[i];
    // сигнал по закрытию дня i
    let want = S[i] != null && c > S[i];
    if (o._hold) want = true;
    if (want && o.ao) want = AO[i] != null && AO[i] > 0;
    if (want && o.rising) want = SMA[200][i] != null && i >= 20 && SMA[200][i] > SMA[200][i - 20];
    if (want && o.golden) want = SMA[50][i] != null && SMA[200][i] != null && SMA[50][i] > SMA[200][i];
    if (!(S[i] != null && c > S[i])) blocked = false;   // после стопа ждём, пока цена уйдёт под среднюю и вернётся (новый сигнал)
    if (pos > 0) {
      best = Math.max(best, c);
      if (o.beAtr && best - entry >= o.beAtr * atr[i]) stop = Math.max(stop, entry);
      if (o.trail) stop = Math.max(stop, best - o.trail * atr[i]);
      if (c < stop) { want = false; blocked = true; }
    } else if (blocked) want = false;
    // целевая доля
    let tgt = 0;
    if (want) {
      tgt = o.frac || 1;
      if (o.volT && vol[i]) tgt = Math.min(tgt, o.volT / vol[i]);
      if (o.riskPct) { const st = pos > 0 ? stop : c - (o.stop0 || 3) * atr[i]; tgt = Math.min(tgt, o.riskPct / 100 / Math.max(1e-6, (c - st) / c)); }
    }
    // исполнение по открытию i+1; доля держится до выхода (без ежедневной подгонки), кроме volT и frac — подгонка к целевой доле раз в неделю
    const op = B[i + 1].o;
    const val = pos * op;   // стоимость позиции в долях капитала
    const eqNow = cash + val;
    if (pos > 0 && tgt === 0) { cash += val * (1 - FEE); pos = 0; trades++; eqClosed = cash; peakC = Math.max(peakC, eqClosed); mddC = Math.max(mddC, 1 - eqClosed / peakC); }
    else if (pos === 0 && tgt > 0) { const buy = eqNow * tgt; pos = buy * (1 - FEE) / op; cash -= buy; entry = op; best = op; stop = o.stop0 ? op - o.stop0 * atr[i] : -Infinity; }
    else if (pos > 0 && (o.volT || o.frac) && new Date(B[i].t).getUTCDay() === 0) { const d = eqNow * tgt - val; if (Math.abs(d) > 0.05 * eqNow) { pos += d / op; cash -= d + Math.abs(d) * FEE; } }
    eq = cash + pos * B[i + 1].o; inMkt += pos > 0 ? 1 : 0; days++;
    peak = Math.max(peak, eq); mdd = Math.max(mdd, 1 - eq / peak);
  }
  const yrs = days / 365.25;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, eq, mdd, mddC, inMkt: inMkt / days, tr: trades / yrs };
}
const pct = (v) => (v * 100).toFixed(1).padStart(6);
function rep(lab, o) {
  const a = run(o), h1 = run(o, B[0].t, SPLIT), h2 = run(o, SPLIT, B[n - 1].t), ly = run(o, LAST, B[n - 1].t);
  console.log(lab.padEnd(42), pct(a.cagr), pct(h1.cagr), pct(h2.cagr), pct(ly.eq - 1) + '%', pct(a.mdd) + '%', pct(a.mddC) + '%', pct(a.inMkt) + '%', a.tr.toFixed(1).padStart(5));
}
console.log(`\nТренд по BTC + приёмы против просадки; дневки ${new Date(B[0].t).toISOString().slice(0, 10)}–${new Date(B[n - 1].t).toISOString().slice(0, 10)}, комиссия 0,15%, в долларах`);
console.log('вариант'.padEnd(42), ' %/год  1пол   2пол  посл.год просадка(день) (по сделкам) в рынке сделок/год');
rep('купить и держать', { N: 20, frac: 1, _hold: true });
for (const N of [50, 100, 200]) {
  console.log(`— средняя ${N}`);
  rep(`  как есть`, { N });
  for (const k of [2, 3, 4]) rep(`  + безубыток после ${k}×ATR`, { N, beAtr: k });
  for (const k of [3, 5, 8]) rep(`  + стоп ${k}×ATR за максимумом (поводок)`, { N, trail: k });
  rep(`  + AO 5/34 > 0`, { N, ao: true });
  rep(`  + SMA200 растёт`, { N, rising: true });
  rep(`  + AO и SMA200 растёт`, { N, ao: true, rising: true });
  rep(`  + SMA50 выше SMA200`, { N, golden: true });
  for (const v of [0.2, 0.3, 0.5]) rep(`  + доля по волатильности (цель ${v * 100}%/год)`, { N, volT: v });
  for (const f of [0.25, 0.5]) rep(`  + в биткоине только ${f * 100}% счёта`, { N, frac: f });
  for (const [r, k] of [[1.5, 3], [1.5, 5], [3, 5]]) rep(`  + риск ${r}% до стопа ${k}×ATR`, { N, riskPct: r, stop0: k });
  rep(`  + AO, SMA200↑, поводок 5×ATR`, { N, ao: true, rising: true, trail: 5 });
  rep(`  + AO, SMA200↑, безубыток 3×ATR`, { N, ao: true, rising: true, beAtr: 3 });
}
