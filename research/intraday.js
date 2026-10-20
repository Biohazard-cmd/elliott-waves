// Торговля строго внутри дня (история Мосбиржи с 2018–2019, 65 бумаг): сигналы движка на 10м / 30м / 1ч,
// сделка закрывается по закрытию последней свечи дня. Режимы выхода: «нет» — как есть (для сравнения),
// «день» — до конца вечерней сессии (23:50 МСК), «осн» — только основная сессия: вход 10:00–18:00, выход до 18:40.
// Комиссия 0,05% / 0,3% на сторону + 0,02% проскальзывание. Роботная модель портфеля (риск 1%, позиция ≤25%, фонд).
// «БУ>0 / БУ.5R / БУ1R» — к вечеру прибыльные (> 0 / 0,5 / 1 R) остаются на ночь со стопом в безубытке (keepBE)
// TF=10m,30m,1h MODES=нет,день,БУ>0 node intraday.js
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const { series } = require('./moex4h.js');
const SRC = { '10m': { dir: 'moex10m', ms: 600e3 }, '30m': { dir: 'moex10m', ms: 1800e3 }, '1h': { dir: 'moex1h', ms: 3600e3 } };
const MSK = 3 * 3600e3, DAY = 864e5, SLIP = 0.02;
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const mskMin = (t) => Math.floor(((t + MSK) % DAY) / 60e3);   // минута суток по Москве
const DL = { addAO: true, addSma200: true, addMinRR: true, minRR: 1.5 };
const VARS = [
  ['покупки (как в книге)', {}],
  ['продажи (как h1_short)', { longOnly: false, shortOnly: true, swingMult: 1.5, addRunner: false, addStruct: true }],
  ['основной', DL],
  ['агрессивный без доливки', Object.assign({}, DL, { stopW2: true, localBars: 5, beMode: 'auto', beRule: 'atr', beAtr: 3 })],
];
// конец сделки внутри дня: последняя свеча того же дня (или основной сессии) не позже фактического выхода
function cut(t, bars, main) {
  const i0 = t.iEntry, d0 = Math.floor((bars[i0].t + MSK) / DAY);
  if (main && (mskMin(bars[i0].t) < 600 || mskMin(bars[i0].t) >= 1080)) return null;   // вход только 10:00–18:00
  let j = i0;
  while (j + 1 < bars.length && Math.floor((bars[j + 1].t + MSK) / DAY) === d0 && (!main || mskMin(bars[j + 1].t) < 1120)) j++;
  return t.iExit <= j ? { iExit: t.iExit, px: t.exitP } : { iExit: j, px: bars[j].c };
}
// предложение Егора: к вечеру убыточные закрываем, а сделку с прибылью > k R оставляем на ночь со стопом в безубытке
// (уровень как beLevel движка); дальше — что раньше: касание безубытка или обычный выход движка
function keepBE(t, bars, c, k, fee) {
  if (!c || c.iExit >= t.iExit) return c;
  const risk = Math.abs(t.entry - t.stop0), be = t.entry * (1 + t.side * (2 * fee + 2 * SLIP + 0.05) / 100);
  if (t.side * (bars[c.iExit].c - be) <= 0 || t.side * (bars[c.iExit].c - t.entry) / risk < k) return c;
  for (let i = c.iExit + 1; i < t.iExit; i++) {
    const b = bars[i];
    if (t.side > 0 ? b.l <= be : b.h >= be) return { iExit: i, px: t.side > 0 ? Math.min(b.o, be) : Math.max(b.o, be) };
  }
  return { iExit: t.iExit, px: t.exitP };
}
const KEEP = [0, 0.5, 1], KEEP_LAB = ['БУ>0', 'БУ.5R', 'БУ1R'], MODES = (process.env.MODES || 'нет,день,осн,' + KEEP_LAB.join(',')).split(',');
const nrOf = (t, px, fee) => (t.side * (px - t.entry) - (2 * fee + 2 * SLIP) / 100 * t.entry) / Math.abs(t.entry - t.stop0);

for (const tf of (process.env.TF || '10m,30m,1h').split(',')) {
  // FROM=2024-10-01 — только последние годы (10м скачаны за 2 года не у всех бумаг)
  const ser = series(S, Object.assign({ tf }, SRC[tf])).map((s) => Object.assign(s, { bars: s.bars.filter((b) => !process.env.FROM || b.t >= Date.parse(process.env.FROM)) })).filter((s) => s.bars.length >= 300), mkt = S.D.buildMarket(tf, 200);
  const from = Math.min(...ser.map((s) => s.bars[0].t)), SPLIT = (from + Math.max(...ser.map((s) => s.bars.at(-1).t))) / 2;
  for (const fee of (process.env.FEES || '0.05,0.3').split(',').map(Number)) {
    console.log(`\n${tf}: КОМИССИЯ ${fee}% на сторону. ${ser.length} рядов с ${new Date(from).toISOString().slice(0, 10)}, половины до/после ${new Date(SPLIT).toISOString().slice(0, 10)}`);
    console.log('вариант'.padEnd(24), 'выход сделок  в день ср.R приб%  мин(мед) %/год  1-я  2-я  просадка серия');
    for (const [lab, over] of VARS) {
      const r = evalCfg(Object.assign({ feePct: fee, slipPct: SLIP }, over), { ser, mkt,
        tr: (t, bars) => { t.cutDay = cut(t, bars, false); t.cutMain = cut(t, bars, true); t.bt = bars;
          t.keep = KEEP.map((k) => keepBE(t, bars, t.cutDay, k, fee)); return t.NR; } });
      for (const mode of MODES) {
        const all = [];
        for (const x of r.all) {
          const c = mode === 'нет' ? { iExit: x.t.iExit, px: x.t.exitP } : mode === 'день' ? x.t.cutDay : mode === 'осн' ? x.t.cutMain : x.t.keep[KEEP_LAB.indexOf(mode)];
          if (!c) continue;
          const bars = x.t.bt, TOut = bars[Math.min(c.iExit, bars.length - 1)].t;
          all.push({ id: x.id, i: all.length, T: x.T, TOut: Math.max(TOut, x.T + 1), nr: nrOf(x.t, c.px, fee), t: { side: x.t.side, entry: x.t.entry, stop0: x.t.stop0, exitP: c.px } });
        }
        if (all.length < 20) { console.log(lab.padEnd(24), mode.padEnd(6), 'мало сделок', all.length); continue; }
        const p = portfolio(all, 0.25, (x) => x.i, fee / 100);
        const h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => (z.length > 5 ? portfolio(z, 0.25, (x) => x.i, fee / 100).cagr : NaN));
        const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length;
        const mins = all.map((x) => (x.TOut - x.T) / 60e3).sort((a, b) => a - b), days = (all.at(-1).T - all[0].T) / DAY * 5 / 7;
        console.log(lab.padEnd(24), mode.padEnd(6), String(all.length).padStart(6), (p.taken / days).toFixed(1).padStart(6), (R / all.length).toFixed(2).padStart(5), pct(w / all.length),
          String(Math.round(mins[mins.length >> 1])).padStart(8), '  ', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(5));
      }
    }
  }
}
