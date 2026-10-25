// Покупки + продажи по треугольнику на 4ч на одном счёте (25.10.2026). Продажи — сетап «треугольник» на 4ч Мосбиржи 2018–2026, плата за шорт 15%/год;
// покупки — «4 часа · неделя» (LONG=h4 — нынешний, h4r — ровный: канал + пн + лучший подсчёт) или дневки (LONG=main|agr, наборы 2.38, хранилище 2019–2026).
// Портфель: риск 1%, позиция ≤ 25%, без плеча, свободные деньги в фонде; одновременные сигналы — по обороту. NO22=1 — без шортов в 2022 (запрет ЦБ).
const LONG = process.env.LONG || 'h4r', BOR = 0.15, FEE = 0.0014, H4 = 4 * 3600e3;
if (LONG.startsWith('h4')) { process.env.MOEX = '1'; process.env.V = 'x'; if (LONG === 'h4r') { process.env.CLAR = 'top'; process.env.CAND = 'book,0,1,next'; } else process.env.CAND = 'none,0,0,close'; }
const fc = LONG.startsWith('h4') ? require('./fri_chan.js') : null;
const S = require('./store.js'), strat = require('./strat.js'), M = require('./moex4h.js'), { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const turn = (b, iE) => { let s = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) s += b[j].c * (b[j].v || 0); return s; };
// продажи по треугольнику
const ser4 = M.series(S), mkt4 = S.D.buildMarket('4h', 200);
const rs = strat.evalCfg({ shortOnly: true, longOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, feePct: 0.05, setups: { w3: false, w5: false, abc: false, tri: true } }, { ser: ser4, mkt: mkt4, tr: (t, bars) => { t._b = bars; return t.NR; } });
let shorts = rs.all.map((x) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1), TOut = b[iX].t + H4, cost = t.entry * BOR * (TOut - x.T) / 864e5 / 365;
  return { id: x.id + '-', T: x.T, TOut, nr: (t.entry - t.exitP - t.entry * FEE - cost) / (t.stop0 - t.entry), turn: turn(b, t.iEntry), t: { side: -1, entry: t.entry, stop0: t.stop0, exitP: t.exitP + cost } }; });
if (process.env.NO22) shorts = shorts.filter((x) => new Date(x.T).getUTCFullYear() !== 2022);
// покупки
let longs, SPLIT;
if (fc) {
  SPLIT = Date.UTC(2022, 7, 9);
  longs = fc.cand.map((x) => { const t = x.tr, b = t._b; return { id: x.id, T: x.T, TOut: x.TOut, nr: x.nr, turn: turn(b, t.iEntry), t: { side: 1, entry: t.entry, stop0: t.stop0, exitP: t.exitP } }; });
} else {
  SPLIT = strat.SPLIT;
  const RR = { addMinRR: true, minRR: 1.5 };
  const CFG = LONG === 'main' ? Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, beMode: 'auto', beRule: 'atr', beAtr: 3 }, RR) :   // основной — как в 3.0, с безубытком
    Object.assign({ addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true, beMode: 'auto', beRule: 'atr', beAtr: 3 }, RR);
  const r = strat.evalCfg(CFG, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; t.turn = turn(bars, t.iEntry); return t.NR; } });
  const main = r.all.map((x) => Object.assign({}, x, { turn: x.t.turn }));
  const adds = CFG.addPyramid ? main.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, nr: x.t.add.NR, turn: x.turn, t: { side: 1, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  longs = main.concat(adds);
  shorts = shorts.filter((x) => x.T >= longs.reduce((m, x) => Math.min(m, x.T), Infinity));   // тот же период, что у дневок
}
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function rep(lab, list, risk = 0.01, lev = 1) {
  const MR = +(process.env.MRATE || 0.2);
  const all = list; for (const x of all) x.i = -x.turn;   // portfolio сортирует по времени входа, затем по i; объекты не копируем — доливка ищет свою основную сделку по ссылке
  const half = (z) => z.filter((x) => (x.of ? x.of.T : x.T) < SPLIT), half2 = (z) => z.filter((x) => (x.of ? x.of.T : x.T) >= SPLIT);
  const p = portfolio(all, 0.25, (x) => x.i, 0.0005, risk, lev, MR), h = [half(all), half2(all)].map((z) => portfolio(z, 0.25, (x) => x.i, 0.0005, risk, lev, MR).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), 0.0005, risk, lev, MR).cagr; }).sort((a, b) => a - b);
  console.log(lab.padEnd(34), String(list.length).padStart(5), pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), `| взято ${p.taken}, пропущ. ${p.skipped}${lev > 1 ? `, в бумагах до ${(p.maxExpo * 100).toFixed(0)}% капитала, за долг уплачено ${(p.borrow * 100).toFixed(0)}% начального` : ''}`, `| порядок ${pct(rc[0])} – ${pct(rc[19])}`);
}
const NM = { h4: '«4 часа · неделя» (нынешний)', h4r: '«4 часа · неделя» (ровный)', main: 'дневки · основной', agr: 'дневки · агрессивный с доливками' }[LONG];
console.log(`\n${NM} + продажи по треугольнику на 4ч (плата за шорт 15%/год${process.env.NO22 ? ', без шортов в 2022' : ''}); половины до/после ${new Date(SPLIT).toISOString().slice(0, 10)}`);
console.log('счёт'.padEnd(34), 'сделок %/год  1пол  2пол просадка серия');
// RISKS=0.5,1,2 — только покупки при разном риске на сделку (% капитала до стопа), позиция по-прежнему ≤ 25%
if (process.env.RISKS) for (const r of process.env.RISKS.split(',')) for (const L of (process.env.LEVS || '1').split(',')) rep(`риск ${r}%${+L > 1 ? ', плечо ' + L : ''}`, longs, +r / 100, +L);
else {
rep('только покупки', longs);
rep('только продажи по треугольнику', shorts);
rep('вместе на одном счёте', longs.concat(shorts));
}
