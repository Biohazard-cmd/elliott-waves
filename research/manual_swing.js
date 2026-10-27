// Пример для инструкции «Порог разворота» (3.9): один и тот же настоящий график при трёх порогах — точки зигзага и лучший подсчёт.
// OUT=../manual/data/swing.json ID=SBER_TQBR D1=2025-10-01 W=160 node manual_swing.js
const { ser, E } = require('./strat.js');
const { AGR } = require('./manual_examples.js');
const id = process.env.ID || 'SBER_TQBR', d1 = process.env.D1 || '2025-10-01', W = Number(process.env.W || 160);
const s = ser.find((x) => x.id === id), dt = (t) => new Date(t).toISOString().slice(0, 10), rd = (x) => Math.round(x * 100) / 100;
let iEnd = s.bars.findIndex((b) => dt(b.t) >= d1); if (iEnd < 0) iEnd = s.bars.length - 1;
const bars = s.bars.slice(0, iEnd + 1), i0 = bars.length - W, cfg = E.merge(Object.assign({}, AGR, { maxBars: 99999 }));
const auto = E.autoSwing(bars, 1);
const res = { id: id.replace('_TQBR', ''), auto, bars: bars.slice(i0).map((b) => [b.t, rd(b.o), rd(b.h), rd(b.l), rd(b.c)]), vars: [] };
for (const [k, name] of [[0.4, 'мелкий'], [1, 'авто'], [Number(process.env.KB || 2), 'крупный']]) {
  const sw = Math.round(auto * k * 10) / 10, c = new E.Ctx(bars, cfg); c.analyzeNow(sw);
  const piv = c.main.filter((p) => p.i >= i0).map((p) => [p.i - i0, rd(p.p), 0, Math.max(0, p.c - i0)]);
  if (c.pend && c.pend.i >= i0) piv.push([c.pend.i - i0, rd(c.pend.p), 1, W - 1]);
  const sc = c.scen[0], cnt = sc ? E.countPath(sc).filter((p) => !p.small && p.i >= i0).map((p) => [p.i - i0, rd(p.p), p.lbl]) : [];
  res.vars.push({ name, k, sw, piv, cnt, title: sc ? E.scenTitle(sc) : 'подсчёта нет', phase: c.phase, plan: c.plan ? { side: c.plan.side, entry: rd(c.plan.entry), stop: rd(c.plan.stop), target: rd(c.plan.target) } : null });
  console.log(name, sw + '%', 'точек', piv.length, '|', sc ? E.scenTitle(sc) : '-', '| метки', cnt.map((p) => p[2]).join(' '));
}
if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(res));
