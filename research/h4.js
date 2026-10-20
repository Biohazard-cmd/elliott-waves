// Короткие сделки на 4ч (история 4ч: VI.2024–X.2026, 65 бумаг): наборы h4_* из app.js и дневные наборы на 4ч,
// с комиссией тарифа «Трейдер» (0,05%) и «Инвестор» (0,3%) на сторону + проскальзывание 0,02%. Роботная модель портфеля.
// Для сравнения — дневные наборы за тот же период.
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
// MOEX=1 — 4ч собраны из часовиков Мосбиржи (moex_dl.js) с 2018 года вместо свечей Т-Инвестиций с 2024-го
let ser4 = S.series.filter((s) => s.tf === '4h');
if (process.env.MOEX) ser4 = require('./moex4h.js').series(S);
const mkt4 = S.D.buildMarket('4h', 200);
const FROM = Math.min(...ser4.map((s) => s.bars[0].t));
const MID = FROM + (Math.max(...ser4.map((s) => s.bars.at(-1).t)) - FROM) / 2;
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const H4 = { addStruct: true, addRunner: false };
const DL = { addAO: true, addSma200: true, addMinRR: true, minRR: 1.5 };
const DA = Object.assign({}, DL, { stopW2: true, localBars: 5, addPyramid: true, beMode: 'auto', beRule: 'atr', beAtr: 3 });
const RUNS = [
  ['4ч покупки (h4_long)', '4h', { swingMult: 1, addStruct: true }],
  ['4ч продажи (h4_short)', '4h', Object.assign({ longOnly: false, shortOnly: true, swingMult: 1.5 }, H4)],
  ['4ч основной', '4h', DL], ['4ч основной ≤7 дн', '4h', Object.assign({ maxHoldDays: 7 }, DL)],
  ['4ч агрессивный', '4h', DA], ['4ч агрессивный ≤7 дн', '4h', Object.assign({ maxHoldDays: 7 }, DA)],
  ['дневки основной', '1d', Object.assign({ maxHoldDays: 182 }, DL)], ['дневки агрессивный', '1d', Object.assign({ maxHoldDays: 182 }, DA)],
];
for (const fee of [0.05, 0.3]) {
  console.log(`\nКОМИССИЯ ${fee}% на сторону (+0,02% проскальзывание). Период ${new Date(FROM).toISOString().slice(0, 10)}…, половины до/после ${new Date(MID).toISOString().slice(0, 10)}`);
  console.log('вариант'.padEnd(24), 'сделок     R  ср.R приб%  дней(мед) %/год  1-я  2-я  просадка серия | порядок   | фонд %/год');
  for (const [lab, tf, over] of RUNS) {
    const r = evalCfg(Object.assign({ feePct: fee }, over), { ser: tf === '4h' ? ser4 : undefined, mkt: tf === '4h' ? mkt4 : undefined,
      tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const main = r.all.filter((x) => x.T >= FROM);
    const adds = main.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut }));
    const all = main.concat(adds); all.forEach((x, i) => { x.i = i; });
    const p = portfolio(all, 0.25, (x) => x.i, fee / 100);
    const h = [all.filter((x) => (x.of || x).T < MID), all.filter((x) => (x.of || x).T >= MID)].map((z) => portfolio(z, 0.25, (x) => x.i, fee / 100));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), fee / 100).cagr; }).sort((a, b) => a - b);
    const R = main.reduce((s, x) => s + x.nr, 0) + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = main.filter((x) => x.nr > 0).length;
    const days = main.map((x) => (x.TOut - x.T) / 864e5).sort((a, b) => a - b);
    // «просто фонд» за тот же период — на одну пустую сделку в начале и конце
    const cash = portfolio([{ i: 0, T: FROM, TOut: FROM + 1, t: { side: 1, entry: 1, stop0: 0.5, exitP: 1 } }, { i: 1, T: main.at(-1).T, TOut: main.at(-1).T + 1, t: { side: 1, entry: 1, stop0: 0.5, exitP: 1 } }], 0.25, (x) => x.i, 0);
    console.log(lab.padEnd(24), String(main.length).padStart(6), R.toFixed(0).padStart(5), (main.reduce((s, x) => s + x.nr, 0) / main.length).toFixed(2).padStart(5), pct(w / main.length),
      days[days.length >> 1].toFixed(1).padStart(8), '  ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]), ' |', pct(cash.cagr));
  }
}
