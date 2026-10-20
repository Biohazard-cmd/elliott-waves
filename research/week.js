// Сделки «на неделю» (идея Егора 20.10.2026): вход пн–пт, в пятницу вечером сделку закрываем, а прибыльную
// оставляем на следующую неделю со стопом в безубытке. Перебор наших фильтров/опций движка по одному от базы.
// Выходы: «нет» — как есть; «нед» — закрыть по последней свече пятницы; «нед+БУ» — прибыльную (> 0R) не закрывать,
// стоп в безубыток (как beLevel движка), дальше — что раньше: безубыток или обычный выход.
// История: 1ч и 4ч — Мосбиржа 2018–2026 (moex_dl.js, moex4h.js), 1д — хранилище. Комиссия 0,05% + 0,02%. Роботная модель.
// TF=1h node week.js   (ONLY=метка1,метка2 — только эти варианты; DIR=both|short — направление вместо покупок;
// FEE=0.3 — другая комиссия; RC=1 — разброс %/год при случайном порядке сигналов, 20 прогонов; EXTRA='{…}' — добавить ко всем)
const S = require('./store.js');
const { evalCfg, ser: ser1d, mkt: mkt1d } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const { series } = require('./moex4h.js');
const MSK = 3 * 3600e3, DAY = 864e5, SPLIT = Date.UTC(2022, 7, 9), FEE = Number(process.env.FEE || 0.05), SLIP = 0.02;
const pct = (v) => (isFinite(v) ? (v * 100).toFixed(1) : '—').padStart(5);
const dayN = (t) => Math.floor((t + MSK) / DAY), wday = (t) => (dayN(t) + 4) % 7, week = (t) => Math.floor((dayN(t) + 3) / 7);   // 0 — вс

// пятничный выход: последняя свеча той же недели (пн–пт) не позже фактического выхода; вход в выходные — пропуск
function cutWeek(t, bars) {
  const i0 = t.iEntry, w0 = week(bars[i0].t);
  if (wday(bars[i0].t) % 6 === 0) return null;
  let j = i0;
  while (j + 1 < bars.length && week(bars[j + 1].t) === w0 && wday(bars[j + 1].t) % 6 !== 0) j++;
  return t.iExit <= j ? { iExit: t.iExit, px: t.exitP } : { iExit: j, px: bars[j].c };
}
function keepBE(t, bars, c) {
  if (!c || c.iExit >= t.iExit) return c;
  const be = t.entry * (1 + t.side * (2 * FEE + 2 * SLIP + 0.05) / 100);
  if (t.side * (bars[c.iExit].c - be) <= 0) return c;
  for (let i = c.iExit + 1; i < t.iExit; i++) {
    const b = bars[i];
    if (t.side > 0 ? b.l <= be : b.h >= be) return { iExit: i, px: t.side > 0 ? Math.min(b.o, be) : Math.max(b.o, be) };
  }
  return { iExit: t.iExit, px: t.exitP };
}
const nrOf = (t, px) => (t.side * (px - t.entry) - (2 * FEE + 2 * SLIP) / 100 * t.entry) / Math.abs(t.entry - t.stop0);

const tf = process.env.TF || '1h';
const SRC = { '1h': { dir: 'moex1h', ms: 3600e3 }, '4h': {} };
const ser = tf === '1d' ? ser1d : series(S, Object.assign({ tf }, SRC[tf])), mkt = tf === '1d' ? mkt1d : S.D.buildMarket(tf, 200);
const DIRS = { long: { longOnly: true, shortOnly: false }, short: { longOnly: false, shortOnly: true }, both: { longOnly: false, shortOnly: false } };
const BASE = Object.assign({ swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false }, DIRS[process.env.DIR || 'long']);
const VARS = [
  ['база (книга+рынок+бегунок)', {}],
  ['волны мельче ×0,7', { swingMult: 0.7 }], ['волны крупнее ×1,5', { swingMult: 1.5 }], ['волны крупнее ×2', { swingMult: 2 }],
  ['AO 5/34', { addAO: true }], ['AO строже (both)', { addAO: true, aoMode: 'both' }], ['SMA200 растёт', { addSma200: true }],
  ['AO + SMA200', { addAO: true, addSma200: true }], ['П/Р ≥ 1,5', { addMinRR: true, minRR: 1.5 }], ['П/Р ≥ 2', { addMinRR: true, minRR: 2 }],
  ['структура (addStruct)', { addStruct: true }], ['глубина волн 2 и 4', { addDepth: true }], ['без тренда старшей степени', { bookTrend: false }],
  ['тренд по средней (ma)', { addTrend: 'ma' }], ['без фильтра рынка', { addMarket: false }], ['осторожный рынок (SMA50)', { addMktFast: true }],
  ['без бегунка', { addRunner: false }], ['без выхода по смене подсчёта', { addFlipExit: false }], ['выход по фазе', { addPhaseExit: true }],
  ['трейлинг по младшей (sub)', { exitMode: 'sub' }], ['трейлинг по основной (main)', { exitMode: 'main' }], ['ближняя цель', { targetMode: 'near' }],
  ['стоп под волной 2', { stopW2: true }], ['стоп под 5 свечами', { localBars: 5 }], ['безубыток 2×ATR', { beMode: 'auto', beRule: 'atr', beAtr: 2 }],
  ['безубыток 3×ATR', { beMode: 'auto', beRule: 'atr', beAtr: 3 }], ['безубыток +1R', { beMode: 'auto', beRule: 'r1' }],
  ['только вход в волну 3', { setups: { w3: true, w5: false, abc: false, tri: false } }], ['без ABC', { setups: { w3: true, w5: false, abc: true, tri: true }, _abc: 0 }],
  ['с входом в волну 5', { setups: { w3: true, w5: true, abc: true, tri: true } }], ['оценка подсчёта ≥ 60', { minScore: 60 }], ['сложные коррекции', { addComplexTrade: true }],
];
VARS.find((v) => v[0] === 'без ABC')[1] = { setups: { w3: true, w5: false, abc: false, tri: true } };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const extra = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};   // EXTRA='{"addAO":true}' — добавить ко всем вариантам

console.log(`${tf}, ${process.env.DIR || 'long'}, ${ser.length} рядов; половины до/после 09.08.2022. EXTRA ${JSON.stringify(extra)}`);
console.log('вариант'.padEnd(30), '| нет %/год | нед %/год | нед+БУ: сделок  ср.R  дней  %/год  1-я  2-я  просадка серия');
for (const [lab, over] of VARS) {
  if (ONLY && !ONLY.includes(lab)) continue;
  const r = evalCfg(Object.assign({ feePct: FEE, slipPct: SLIP }, BASE, extra, over), { ser, mkt, tr: (t, bars) => { t.cw = cutWeek(t, bars); t.kb = keepBE(t, bars, t.cw); t.bt = bars; return t.NR; } });
  const res = {};
  for (const mode of ['нет', 'нед', 'нед+БУ']) {
    const all = [];
    for (const x of r.all) {
      const c = mode === 'нет' ? { iExit: x.t.iExit, px: x.t.exitP } : mode === 'нед' ? x.t.cw : x.t.kb;
      if (!c) continue;
      const TOut = x.t.bt[Math.min(c.iExit, x.t.bt.length - 1)].t;
      all.push({ id: x.id, i: all.length, T: x.T, TOut: Math.max(TOut, x.T + 1), nr: nrOf(x.t, c.px), t: { side: x.t.side, entry: x.t.entry, stop0: x.t.stop0, exitP: c.px } });
    }
    if (all.length < 30) { res[mode] = null; continue; }
    const p = portfolio(all, 0.25, (x) => x.i, FEE / 100);
    const h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => (z.length > 10 ? portfolio(z, 0.25, (x) => x.i, FEE / 100).cagr : NaN));
    const d = all.map((x) => (x.TOut - x.T) / DAY).sort((a, b) => a - b);
    let rc = null; if (process.env.RC && mode === 'нед+БУ') { let sd = 23; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), FEE / 100).cagr; }).sort((a, b) => a - b); }
    const carried = mode === 'нед+БУ' ? r.all.filter((x) => x.t.kb && x.t.cw && x.t.kb.iExit > x.t.cw.iExit).length : 0;
    res[mode] = { rc, carried, n: all.length, R: all.reduce((s, x) => s + x.nr, 0) / all.length, cagr: p.cagr, h, mdd: p.mdd, st: p.st, d: d[d.length >> 1] };
  }
  const k = res['нед+БУ'];
  console.log(lab.padEnd(30), '|', pct(res['нет'] && res['нет'].cagr).padStart(9), '|', pct(res['нед'] && res['нед'].cagr).padStart(9), '|',
    k ? [String(k.n).padStart(13), k.R.toFixed(2).padStart(5), k.d.toFixed(1).padStart(5), pct(k.cagr), pct(k.h[0]), pct(k.h[1]), pct(k.mdd) + '%', String(k.st).padStart(5), ' перенесено', k.carried, k.rc ? ' порядок ' + pct(k.rc[0]) + ' –' + pct(k.rc[19]) : ''].join(' ') : 'мало сделок');
}
