// Наборы 3.1 на криптовалютах (26.10.2026, идея Егора): 25 крупных монет к USDT, Binance 2018–X.2026 (data/crypto, см. crypto_dl.js).
// Фильтр рынка — равновзвешенный индекс тех же монет выше SMA200 (как индекс 65 акций). Комиссия FEE (по умолчанию 0,1% на сторону, Binance) + 0,05% проскальзывание.
// Портфель как у робота: риск RISK % (1,5), позиция ≤ 25%, без плеча, одновременные сигналы — по обороту; свободные деньги — под CASH % годовых (USDT, по умолчанию 0).
// SET=h4 — «4 часа · неделя» 3.1 и варианты; SET=d — дневки · основной 3.1
process.env.V = 'x';
require('./fri_chan.js');
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const S = require('./store.js'), strat = require('./strat.js'), D = S.D;
const SET = process.env.SET || 'h4', TFN = SET === 'd' ? '1d' : '4h', P = SET === 'd' ? 864e5 : 4 * 3600e3;
const FEEP = +(process.env.FEE || 0.1), SLIPP = 0.05, FEE = (FEEP + SLIPP) / 100, RISK = +(process.env.RISK || (SET === 'tri' ? 1 : 1.5)) / 100, CASH = +(process.env.CASH || 0) / 100;
const SPLIT = Date.UTC(2022, 4, 1), LAST = Date.UTC(2025, 9, 18);
const ser = [];
for (const f of fs.readdirSync(path.join(__dirname, 'data', 'crypto')).filter((x) => x.endsWith('_' + TFN + '.json.gz'))) {
  const id = f.replace('_' + TFN + '.json.gz', ''), r = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'crypto', f))));
  D.files.set(`scan_${id}_CRYPTO_${TFN}.json`, { r: r.map((a) => [...a, 1]) });
  const bars = r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] / a[4], done: true }));
  for (let k = 1, s = 0; k <= bars.length; k++) if (k === bars.length || bars[k].t - bars[k - 1].t > 10 * 864e5) { if (k - s >= 300) ser.push({ id, tf: TFN, bars: bars.slice(s, k), P }); s = k; }
}
const list0 = D.files.list; D.files.list = (pre) => list0.call(D.files, pre).filter((n) => !n.startsWith('scan_') || n.includes('_CRYPTO_'));   // рынок — только из монет
const mkt = D.buildMarket(TFN, 200); D.files.list = list0;
console.log('индекс рынка: монет', mkt.n);
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  setups: { w3: true, w5: false, abc: false, tri: false }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true };
const DL = Object.assign({}, strat.BASE, { addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 });
const TRI = { longOnly: false, shortOnly: true, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, setups: { w3: false, w5: false, abc: false, tri: true } };   // робот «продажи по треугольнику» 3.0
const turn = (b, iE) => { let s = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) s += b[j].c * (b[j].v || 0); return s; };
function trades(over) {
  const r = strat.evalCfg(Object.assign({}, SET === 'h4' ? H4W : SET === 'tri' ? TRI : DL, { feePct: FEEP, slipPct: SLIPP }, over), { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  return r.all.map((x) => { const t = x.t, b = t._b; return { id: x.id, T: x.T, TOut: b[Math.min(t.iExit, b.length - 1)].t + P, nr: x.nr, turn: turn(b, t.iEntry), side: t.side, entry: t.entry, stop: t.stop0, exit: t.exitP }; });
}
// портфель (как maxpos_add.js), но доходность свободных денег — CASH
function portfolio(all, key) {
  const tr = all.slice().sort((a, b) => a.T - b.T || key(a) - key(b));
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, lastT = 0; const done = [];
  const accrue = (t) => { if (lastT) { const dt = (t - lastT) / 31557600000, used = open.reduce((s, p) => s + p.val, 0); if (dt > 0) eq += Math.max(0, eq - used) * CASH * dt; } lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.TOut - b.TOut); while (open.length && open[0].TOut <= t) { const p = open.shift(); accrue(p.TOut); const g = p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * FEE); eq += g; done.push({ t: p.TOut, g }); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const x of tr) { closeUntil(x.T); accrue(x.T); const dist = Math.abs(x.entry - x.stop) / x.entry, used = open.reduce((s, p) => s + p.val, 0);
    const val = Math.min(eq * RISK / dist, eq * 0.25, Math.max(0, eq - used)); if (val < eq * 0.02) { skipped++; continue; } taken++; open.push(Object.assign({ val }, x)); }
  closeUntil(Infinity);
  let st = 0, c = 0; for (const d of done.sort((a, b) => a.t - b.t)) { if (d.g < 0) st = Math.max(st, ++c); else c = 0; }
  const yrs = (tr[tr.length - 1].T - tr[0].T) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, st, taken, skipped };
}
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pct = (v) => (v * 100).toFixed(1).padStart(6);
function rep(lab, z) {
  const k = (x) => -x.turn, p = portfolio(z, k), h = [portfolio(z.filter((x) => x.T < SPLIT), k), portfolio(z.filter((x) => x.T >= SPLIT), k)];
  const rc = Array.from({ length: 10 }, () => { const m = new Map(z.map((x) => [x, rnd()])); return portfolio(z, (x) => m.get(x)).cagr; }).sort((a, b) => a - b);
  const R = z.reduce((s, x) => s + x.nr, 0), w = z.filter((x) => x.nr > 0).length, ly = z.filter((x) => x.T >= LAST), lyR = ly.reduce((s, x) => s + x.nr, 0);
  const by = {}; for (const x of z) by[x.id] = (by[x.id] || 0) + x.nr; const pos = Object.values(by).filter((v) => v > 0).length, top = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const yr = {}; for (const x of z) { const y = new Date(x.T).getUTCFullYear(); yr[y] = (yr[y] || 0) + x.nr; }
  console.log(lab.padEnd(30), String(z.length).padStart(5), R.toFixed(0).padStart(5), (R / z.length).toFixed(3).padStart(6), pct(w / z.length) + '%', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(4), '|', `${lyR.toFixed(1)}R (${ly.length})`.padStart(12), '|', pct(rc[0]), '–', pct(rc[9]), `| взято ${p.taken}/${z.length}; в плюсе ${pos} из ${top.length} монет; без топ-3 (${top.slice(0, 3).map((x) => x[0]).join(', ')}) ${(R - top.slice(0, 3).reduce((s, x) => s + x[1], 0)).toFixed(0)}R`);
  console.log(' '.repeat(30), 'R по годам:', Object.entries(yr).map(([y, v]) => `${y}: ${v.toFixed(0)}`).join('  '));
}
console.log(`\nКриптовалюты, ${ser.length} рядов (${TFN}), ${{ h4: '«4 часа · неделя» 3.1', d: 'дневки · основной 3.1', tri: '«продажи по треугольнику» 3.0' }[SET]}; комиссия ${FEEP}% + ${SLIPP}%, риск ${RISK * 100}%, свободные деньги ${CASH * 100}%/год; половины до/после 01.05.2022`);
console.log('вариант'.padEnd(30), 'сделок    R   ср.R прибыльн.   %/год   1пол   2пол просадка серия | R посл. год    | порядок');
rep('набор 3.1', trades({}));
if (SET === 'h4') {
  rep('без пятничного выхода', trades({ weekExit: false, wkChan: false, wkNextOpen: false }));
  rep('без фильтров AO и SMA200', trades({ addAO: false, addSma200: false }));
  rep('и продажи тоже', trades({ longOnly: false }));
}
if (SET === 'tri') {
  rep('+ фильтры AO и SMA200', trades({ addAO: true, addSma200: true }));
  rep('покупки по треугольнику (зеркало)', trades({ longOnly: true, shortOnly: false }));
  rep('покупки и продажи по треугольнику', trades({ longOnly: false, shortOnly: false }));
}
// SEL=1: «торговать только лучшими монетами» — лучшие K по R в одной половине, проверка на другой (и задним числом — по всей истории)
if (process.env.SEL) {
  const z = trades({}), half = (h) => z.filter((x) => (x.T < SPLIT) === (h === 0)), byR = (q) => { const o = {}; for (const x of q) o[x.id] = (o[x.id] || 0) + x.nr; return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const sum = (q) => q.reduce((s, x) => s + x.nr, 0);
  for (const K of [3, 5]) {
    const all = new Set(byR(z).slice(0, K).map((x) => x[0]));
    rep(`задним числом: топ-${K} (${[...all].join(', ')})`, z.filter((x) => all.has(x.id)));
    for (const [pick, test] of [[0, 1], [1, 0]]) {
      const sel = new Set(byR(half(pick)).slice(0, K).map((x) => x[0])), t = half(test);
      console.log(`  топ-${K} по ${pick ? 'второй' : 'первой'} половине (${[...sel].join(', ')}): в ${test ? 'второй' : 'первой'} половине ${sum(t.filter((x) => sel.has(x.id))).toFixed(1)}R за ${t.filter((x) => sel.has(x.id)).length} сделок; остальные монеты — ${sum(t.filter((x) => !sel.has(x.id))).toFixed(1)}R за ${t.filter((x) => !sel.has(x.id)).length}; %/год у выбранных ${pct(portfolio(t.filter((x) => sel.has(x.id)), (x) => -x.turn).cagr)}`);
    }
  }
}
