// Идея из интернета (Коннорс, «Short Term Trading Strategies That Work»): RSI(2) — покупать короткий откат в долгом росте.
// Дневки 65 бумаг (хранилище), вход по открытию после закрытия, где close > SMA200 и RSI(2) < L; выход по закрытию выше SMA5.
// Стоп k×ATR(14) (нужен и для размера позиции 1% риска). Режимы: «как есть» / «до пятницы» / «до пятницы, прибыльные — дальше в безубытке».
// Не волны — сверх книги, только для сравнения. Комиссия 0,05% + 0,02%. Роботная модель портфеля.
const S = require('./store.js');
const { portfolio } = require('./maxpos_add.js');
const FEE = 0.05, SLIP = 0.02, MSK = 3 * 3600e3, DAY = 864e5, SPLIT = Date.UTC(2022, 7, 9);
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const week = (t) => Math.floor((Math.floor((t + MSK) / DAY) + 3) / 7);
function rsi(c, n) {
  const out = new Array(c.length).fill(50); let up = 0, dn = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
    if (i <= n) { up += u / n; dn += w / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + w) / n; }
    if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}
const sma = (c, n, i) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += c[k]; return s / n; };
function trades(L, kATR, mode) {
  const out = [];
  for (const s of S.series.filter((x) => x.tf === '1d')) {
    const b = s.bars, c = b.map((x) => x.c), R = rsi(c, 2);
    const atr = []; let a = 0; for (let i = 0; i < b.length; i++) { const tr = i ? Math.max(b[i].h - b[i].l, Math.abs(b[i].h - c[i - 1]), Math.abs(b[i].l - c[i - 1])) : b[i].h - b[i].l; a = i < 14 ? (a * i + tr) / (i + 1) : (a * 13 + tr) / 14; atr.push(a); }
    for (let i = 200; i < b.length - 1; ) {
      if (!(c[i] > sma(c, 200, i) && R[i] < L)) { i++; continue; }
      const e = b[i + 1].o, stop = e - kATR * atr[i], be = e * (1 + (2 * FEE + 2 * SLIP + 0.05) / 100);
      let j = i + 1, px = null, carry = false;
      for (; j < b.length; j++) {
        if (b[j].l <= (carry ? Math.max(stop, be) : stop)) { px = Math.min(b[j].o, carry ? Math.max(stop, be) : stop); break; }
        if (c[j] > sma(c, 5, j)) { px = c[j]; break; }
        const fri = j + 1 >= b.length || week(b[j + 1].t) !== week(b[j].t);
        if (mode !== 'нет' && fri && !carry) { if (mode === 'нед+БУ' && c[j] > be) carry = true; else { px = c[j]; break; } }
      }
      if (px == null) break;
      out.push({ id: s.id, T: b[i + 1].t, TOut: Math.max(b[j].t, b[i + 1].t + 1), nr: (px - e - (2 * FEE + 2 * SLIP) / 100 * e) / (e - stop), t: { side: 1, entry: e, stop0: stop, exitP: px } });
      i = j + 1;
    }
  }
  out.sort((x, y) => x.T - y.T); out.forEach((x, i) => { x.i = i; });
  return out;
}
console.log('RSI(2) < L, стоп k×ATR, режим'.padEnd(34), 'сделок  ср.R  дней  %/год  1-я  2-я  просадка серия');
for (const L of [5, 10, 20]) for (const k of [2, 3]) for (const mode of ['нет', 'нед', 'нед+БУ']) {
  const all = trades(L, k, mode), p = portfolio(all, 0.25, (x) => x.i, FEE / 100);
  const h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, FEE / 100).cagr);
  const d = all.map((x) => (x.TOut - x.T) / DAY).sort((a, b) => a - b);
  console.log(`L=${L}, k=${k}, ${mode}`.padEnd(34), String(all.length).padStart(6), (all.reduce((s, x) => s + x.nr, 0) / all.length).toFixed(2).padStart(5), d[d.length >> 1].toFixed(1).padStart(5), pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(5));
}
