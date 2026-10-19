// равноудалённый канал (видео 19.10.2026): вход в волну 5 только если волна 4 закончилась у линии канала,
// цель — граница канала. book — каналы по книге (Пректер, Фрост), video — канал 0-2 с параллелью через 3 (как в видео).
// node chan5.js — оба набора; PRE=aggr node chan5.js — только агрессивный, PRE=long — только основной
const st = require('./strat.js'); const { evalCfg, portfolio, SPLIT, E } = st;
const ALL = {
  'основной': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'агрессивный': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 },
};
const PRE = process.env.PRE === 'aggr' ? { 'агрессивный': ALL['агрессивный'] } : process.env.PRE === 'long' ? { 'основной': ALL['основной'] } : ALL;
const W5 = { setups: { w3: true, w5: true, abc: true, tri: true } };
const VAR = [
  ['без W5', {}],
  ['W5 как есть', W5],
  ['W5 + Фибо 38,2', Object.assign({ addChanFib: true }, W5)],
  ['W5 + канал книги', Object.assign({ addChan4: 'book' }, W5)],
  ['W5 + канал видео (середина)', Object.assign({ addChan4: 'video' }, W5)],
  ['W5 + канал видео (линия 0-2)', Object.assign({ addChan4: 'video0' }, W5)],
  ['W5 + канал книги + Фибо', Object.assign({ addChan4: 'book', addChanFib: true }, W5)],
  ['W5 + канал видео + Фибо', Object.assign({ addChan4: 'video', addChanFib: true }, W5)],
  ['W5 · цель канал книги', Object.assign({ chan5Target: 'book' }, W5)],
  ['W5 · цель канал видео', Object.assign({ chan5Target: 'video' }, W5)],
  ['W5 · стоп за волной 1', Object.assign({ stopW5: 'w1' }, W5)],
  ['W5 + канал книги · цель канал', Object.assign({ addChan4: 'book', chan5Target: 'book' }, W5)],
  ['W5 + канал видео · цель канал', Object.assign({ addChan4: 'video', chan5Target: 'video' }, W5)],
  ['W5 + канал видео+Фибо · цель · стоп W1', Object.assign({ addChan4: 'video', addChanFib: true, chan5Target: 'video', stopW5: 'w1' }, W5)],
];
for (const tol of [0.25, 1, 1.5]) for (const m of ['book', 'video']) VAR.push([`W5 + канал ${m === 'book' ? 'книги' : 'видео'} · допуск ${tol} ATR`, Object.assign({ addChan4: m, chan4Tol: tol }, W5)]);

const streak = (a) => { let m = 0, c = 0; for (const x of a.slice().sort((p, q) => p.T - q.T)) { if (x.nr < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
const su = (r, k) => r.su[k] ? r.su[k][0].toFixed(0) + 'R/' + r.su[k][1] : '0';
for (const [nm, pre] of Object.entries(PRE)) {
  console.log('== ' + nm);
  for (const [vn, o] of VAR) {
    const r = evalCfg(Object.assign({}, pre, o));
    const halves = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)];
    const p = portfolio(r, { cash: true }), ph = halves.map((z) => portfolio({ all: z }, { cash: true }));
    const h = halves.map((z) => z.reduce((s, x) => s + x.nr, 0)), w = r.all.filter((x) => x.nr > 0).length;
    const w5 = r.all.filter((x) => x.t.setup === 1), w5w = w5.filter((x) => x.nr > 0).length;
    console.log(vn.padEnd(40), 'R', r.R.toFixed(0).padStart(4), '(' + h[0].toFixed(0) + '/' + h[1].toFixed(0) + ')', 'сд', String(r.n).padStart(3), 'приб', (w / r.n * 100).toFixed(0) + '%', 'серия', String(streak(r.all)).padStart(2),
      '|', (p.cagr * 100).toFixed(1) + '%/год (' + (ph[0].cagr * 100).toFixed(0) + '/' + (ph[1].cagr * 100).toFixed(0) + ')', 'DD', (p.mdd * 100).toFixed(0) + '%',
      '| W3', su(r, 0), 'W5', su(r, 1), w5.length ? 'приб W5 ' + (w5w / w5.length * 100).toFixed(0) + '% ср ' + (w5.reduce((s, x) => s + x.nr, 0) / w5.length).toFixed(2) : '');
  }
}
