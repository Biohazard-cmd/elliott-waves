// Элдер: доливать, только когда стоп основной позиции уже в безубытке. Агрессивный набор.
// Стоп доливки в движке = стоп основной в момент доливки (t.add.stop) — значит, «основная в безубытке» = t.add.stop ≥ входа.
// Сравниваем: без доливок / все доливки (сейчас) / только при безубытке; с безубытком 3×ATR выключенным (сейчас) и включённым.
// shortcut: вариант «в момент доливки перенести стоп основной в безубыток» требует правки движка — не проверялся.
const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');

const pct = (v) => (v * 100).toFixed(1).padStart(5);
const AGR = { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true };
for (const [name, PRE] of [['АГРЕССИВНЫЙ, безубыток выкл. (как сейчас)', AGR], ['АГРЕССИВНЫЙ, безубыток 3×ATR вкл.', Object.assign({}, AGR, { beMode: 'auto', beRule: 'atr', beAtr: 3 })]]) {
  const r = evalCfg(PRE, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const mains = r.all.slice();
  const mkAdd = (x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut, nr: x.t.add.NR });
  const withAdd = mains.filter((x) => x.t.add && x.t.add.NR != null);
  const atBE = withAdd.filter((x) => x.t.side * (x.t.add.stop - x.t.entry) >= 0);
  console.log(`\n${name}: сделок ${mains.length}, доливок ${withAdd.length}, из них при стопе основной в безубытке ${atBE.length}`);
  const sumR = (a) => a.reduce((s, x) => s + x.t.add.NR, 0);
  console.log(`R доливок: все ${sumR(withAdd).toFixed(0)} (${(sumR(withAdd) / withAdd.length).toFixed(2)} на доливку); при безубытке ${sumR(atBE).toFixed(0)} (${(sumR(atBE) / Math.max(1, atBE.length)).toFixed(2)}); без безубытка ${(sumR(withAdd) - sumR(atBE)).toFixed(0)}`);
  console.log('доливки'.padEnd(22), '%/год  до23  с23  просадка серия  взято доливок');
  for (const [lab, adds] of [['без доливок', []], ['все (сейчас)', withAdd], ['только при безубытке', atBE]]) {
    const all = mains.concat(adds.map(mkAdd)); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    console.log(lab.padEnd(22), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), String(p.taken).padStart(6), String(p.addT).padStart(7));
  }
}
