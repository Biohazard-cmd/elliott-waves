// Раздельные деньги между роботами (30.10.2026): у каждого робота своя доля счёта, кривые счёта (по закрытым сделкам, деньги в фонде)
// складываются по долям; «ребаланс» — доли выравниваются каждый день (как общий счёт с постоянными долями), «без» — доли плывут.
// Нужны выгрузки: FIG=dump OUT=…/t4h.json node figures.js, PART=main|agr DUMP=…/td_main|agr.json node candles_d.js
const fs = require('fs'), { portfolio } = require('./maxpos_add.js'), D = process.env.DIR || '/tmp/claude-0';
const ld = (f) => JSON.parse(fs.readFileSync(D + '/' + f));
const fix = (z) => { const m = new Map(z.map((x) => [x.id, x])); for (const x of z) if (x.ofId) x.of = m.get(x.ofId); return z; };
const h4 = ld('t4h.json'), R = { main: [fix(ld('td_main.json')), 0.015], agr: [fix(ld('td_agr.json')), 0.01], week: [h4.week, 0.015], hunt: [h4.hunt, 0.015] };
const NM = { main: 'основной', agr: 'агрессивный', week: '«неделя»', hunt: '«Охотник»' };
const DAY = 864e5, T0 = Date.UTC(2019, 0, 1), SPLIT = Date.UTC(2023, 0, 1);
const curves = {};
for (const [k, [z, risk]] of Object.entries(R)) { portfolio.curve = []; z.forEach((x) => { x.i = -(x.of || x).turn; }); portfolio(z, 0.25, (x) => x.i, 0.0005, risk); curves[k] = portfolio.curve.sort((a, b) => a[0] - b[0]); }
portfolio.curve = null;
const T1 = Math.min(...Object.values(curves).map((c) => c[c.length - 1][0]));
const grid = []; for (let t = T0; t <= T1; t += DAY) grid.push(t);
const onGrid = (c) => { let j = 0, v = 1; return grid.map((t) => { while (j < c.length && c[j][0] <= t) v = c[j++][1]; return v; }); };
const G = {}; for (const k in curves) { const g = onGrid(curves[k]), b = g[0]; G[k] = g.map((v) => v / b); }
const stats = (e) => { let pk = e[0], mdd = 0; for (const v of e) { pk = Math.max(pk, v); mdd = Math.max(mdd, 1 - v / pk); }
  const yrs = (grid[grid.length - 1] - grid[0]) / 31557600000, iS = grid.findIndex((t) => t >= SPLIT);
  const cg = (a, b) => Math.pow(e[b] / e[a], 31557600000 / (grid[b] - grid[a])) - 1;
  let w = 0; for (let q = 365; q < e.length; q += 30) if (e[q] / e[q - 365] < 1.0) w++;
  return { cagr: Math.pow(e[e.length - 1] / e[0], 1 / yrs) - 1, mdd, h1: cg(0, iS), h2: cg(iS, e.length - 1) }; };
const mix = (ws, reb) => { const ks = Object.keys(ws); if (!reb) return grid.map((_, i) => ks.reduce((s, k) => s + ws[k] * G[k][i], 0));
  const e = [1]; for (let i = 1; i < grid.length; i++) e.push(e[i - 1] * (1 + ks.reduce((s, k) => s + ws[k] * (G[k][i] / G[k][i - 1] - 1), 0))); return e; };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
console.log(`\nРАЗДЕЛЬНЫЕ ДЕНЬГИ МЕЖДУ РОБОТАМИ, ${new Date(T0).toISOString().slice(0, 10)} – ${new Date(T1).toISOString().slice(0, 10)}; просадка — по дням, по закрытым сделкам; половины до/после 2023`);
console.log('доли'.padEnd(52), '%/год  до23  с23 просадка');
const show = (lab, e) => { const s = stats(e); console.log(lab.padEnd(52), pct(s.cagr), pct(s.h1), pct(s.h2), pct(s.mdd) + '%'); };
for (const k in G) show('только ' + NM[k], G[k]);
// корреляция месячных доходов
const mon = (e) => { const r = []; for (let i = 30; i < e.length; i += 30) r.push(e[i] / e[i - 30] - 1); return r; };
const cor = (a, b) => { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return c / Math.sqrt(va * vb); };
const ks = Object.keys(G); console.log('корреляция месячных доходов: ' + ks.flatMap((a, i) => ks.slice(i + 1).map((b) => `${NM[a]}–${NM[b]} ${cor(mon(G[a]), mon(G[b])).toFixed(2)}`)).join(', '));
const C = [{ main: 0.5, hunt: 0.5 }, { main: 0.5, week: 0.5 }, { main: 0.5, agr: 0.5 }, { hunt: 0.5, week: 0.5 }, { agr: 0.5, hunt: 0.5 }, { main: 1 / 3, hunt: 1 / 3, week: 1 / 3 }, { main: 0.25, agr: 0.25, hunt: 0.25, week: 0.25 }, { main: 0.67, hunt: 0.33 }, { main: 0.33, hunt: 0.67 }];
for (const ws of C) for (const reb of [true, false]) show(Object.entries(ws).map(([k, w]) => `${NM[k]} ${Math.round(w * 100)}%`).join(' + ') + (reb ? ' (выравн.)' : ' (без)'), mix(ws, reb));
