// Треугольник по Кеннеди на 4ч и 1ч Мосбиржи 2018–2026 (25.10.2026): вход не сразу после E (как в движке), а стоп-заявкой на пробое конца волны D.
// Сделки — движка (только сетап «треугольник»), вход переносится: ждём, пока цена пройдёт уровень D, не дольше W свечей; стоп (конец E) раньше — отмена.
// Выход — как у движка (если сделка движка ещё идёт). R — к стопу движка, комиссия 0,05% + 0,02% на сторону. node tri_kennedy.js
const S = require('./store.js'), { evalCfg } = require('./strat.js'), M = require('./moex4h.js');
const FEE = 0.0014, SPLIT = Date.UTC(2022, 7, 9);
const base = { longOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, feePct: 0.05, setups: { w3: false, w5: false, abc: false, tri: true } };
const nr = (sd, e, st, ex) => (sd * (ex - e) - e * FEE) / Math.abs(e - st);
function kennedy(t, b, W) {
  const sd = t.side, D = t.cnt && t.cnt.px[4]; if (D == null) return null;
  if (sd * (b[t.iEntry].o - D) >= 0) return { e: b[t.iEntry].o, ex: t.exitP, same: true };   // уже за D на открытии — вход как сейчас
  for (let k = t.iEntry; k < Math.min(b.length, t.iEntry + W); k++) {
    const hit = sd > 0 ? b[k].l <= t.stop0 : b[k].h >= t.stop0, trg = sd > 0 ? b[k].h >= D : b[k].l <= D;
    if (k >= t.iExit && !trg) return null;   // сделка движка уже закончилась
    if (hit && !trg) return null;
    if (!trg) continue;
    const e = sd > 0 ? Math.max(b[k].o, D) : Math.min(b[k].o, D);
    if (hit) return { e, ex: t.stop0 };
    if (k >= t.iExit) return null;
    for (let j = k + 1; j < t.iExit; j++) if (sd > 0 ? b[j].l <= t.stop0 : b[j].h >= t.stop0) return { e, ex: sd > 0 ? Math.min(b[j].o, t.stop0) : Math.max(b[j].o, t.stop0) };
    return { e, ex: t.exitP };
  }
  return null;
}
const st = (z) => { const n = z.length, R = z.reduce((s, x) => s + x, 0); return `${String(n).padStart(4)} сд., ${R.toFixed(0).padStart(4)}R, ср. ${(R / (n || 1)).toFixed(3).padStart(6)}, прибыльных ${(z.filter((x) => x > 0).length / (n || 1) * 100).toFixed(0)}%`; };
for (const [tf, ms] of [['4h', 4 * 3600e3], ['1h', 3600e3]]) {
  const ser = M.series(S, { ms, tf }), mkt = S.D.buildMarket(tf, 200);
  for (const [flab, f] of [['без AO/SMA200', {}], ['AO + SMA200', { addAO: true, addSma200: true }]]) {
    const r = evalCfg(Object.assign({}, base, f), { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
    for (const sd of [1, -1]) {
      const tr = r.all.filter((x) => x.t.side === sd);
      console.log(`\n${tf}, ${flab}, ${sd > 0 ? 'покупки' : 'продажи'}`);
      const now = tr.map((x) => ({ T: x.T, R: x.nr }));
      const line = (lab, z) => console.log('  ' + lab.padEnd(26), st(z.map((q) => q.R)), '| до/после 08.2022:', (z.filter((q) => q.T < SPLIT).reduce((s, q) => s + q.R, 0) / (z.filter((q) => q.T < SPLIT).length || 1)).toFixed(3), '/', (z.filter((q) => q.T >= SPLIT).reduce((s, q) => s + q.R, 0) / (z.filter((q) => q.T >= SPLIT).length || 1)).toFixed(3));
      line('сейчас (после E)', now);
      for (const W of [3, 6, 12, 24]) {
        const k = tr.map((x) => { const q = kennedy(x.t, x.t._b, W); return q && { T: x.T, R: nr(sd, q.e, x.t.stop0, q.ex) }; }).filter(Boolean);
        line(`Кеннеди, ждать ${W} свечей`, k);
      }
    }
  }
}
