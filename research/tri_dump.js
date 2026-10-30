// Выгрузка сделок «продажи по треугольнику» на 4ч Мосбиржи 2018–2026 (плата за шорт 15%/год) для split.js: OUT=…/ttri.json node tri_dump.js
const S = require('./store.js'), strat = require('./strat.js'), M = require('./moex4h.js'), fs = require('fs');
const BOR = 0.15, FEE = 0.0014, H4 = 4 * 3600e3;
const turn = (b, iE) => { let s = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) s += b[j].c * (b[j].v || 0); return s; };
const ser4 = M.series(S), mkt4 = S.D.buildMarket('4h', 200);
const rs = strat.evalCfg({ shortOnly: true, longOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, feePct: 0.05, setups: { w3: false, w5: false, abc: false, tri: true } }, { ser: ser4, mkt: mkt4, tr: (t, bars) => { t._b = bars; return t.NR; } });
const out = rs.all.map((x) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1), TOut = b[iX].t + H4, cost = t.entry * BOR * (TOut - x.T) / 864e5 / 365;
  return { id: x.id + '-', T: x.T, TOut, nr: (t.entry - t.exitP - t.entry * FEE - cost) / (t.stop0 - t.entry), turn: turn(b, t.iEntry), t: { side: -1, entry: t.entry, stop0: t.stop0, exitP: t.exitP + cost } }; });
fs.writeFileSync(process.env.OUT || '/tmp/claude-0/ttri.json', JSON.stringify(out)); console.log('сделок', out.length);
