// Проверка: если в один день несколько сигналов, а денег на все не хватает — какой брать первым.
// Движок не меняем: в памяти добавляем к сделке оценку подсчёта (score) и план R:R (rr) — то, что известно в момент входа.
const fs = require('fs'), Module = require('module'), path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const EP = path.resolve(ROOT, 'android/assets/engine2.js');
let src = fs.readFileSync(EP, 'utf8');
const A = 'notgt: sig.notgt, i0: sig.i0,';
if (!src.includes(A)) throw new Error('engine2.js изменился — патч не применился');
src = src.replace(A, 'notgt: sig.notgt, score: sig.score, rr: sig.rr, i0: sig.i0,');
const m = new Module(EP, null); m.filename = EP; m.paths = Module._nodeModulePaths(path.dirname(EP)); m._compile(src, EP); m.loaded = true;
require.cache[EP] = m;
const { evalCfg, SPLIT } = require(ROOT + '/research/strat.js');

// копия portfolio из strat.js; отличие — порядок сигналов внутри одного дня задаёт key (меньше — раньше)
function portfolio(all, key) {
  const risk = 0.01, maxPos = 0.25, fee = 0.0005, slip = 0.0002;
  const tr = all.map((x) => ({ x, tIn: x.T, tOut: x.TOut, side: x.t.side, entry: x.t.entry, stop: x.t.stop0, exit: x.t.exitP, k: key(x) }))
    .sort((a, b) => a.tIn - b.tIn || a.k - b.k);
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, lastT = 0, R = 0;
  const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const closeUntil = (t) => { open.sort((a, b) => a.tOut - b.tOut); while (open.length && open[0].tOut <= t) { const p = open.shift(); accrue(p.tOut); eq += p.val * (p.side * (p.exit - p.entry) / p.entry - 2 * fee - 2 * slip); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); } };
  for (const t of tr) {
    closeUntil(t.tIn); accrue(t.tIn); const dist = Math.abs(t.entry - t.stop) / t.entry;
    const used = open.reduce((s, p) => s + p.val, 0); const val = Math.min(eq * risk / dist, eq * maxPos, Math.max(0, eq - used));
    if (val < eq * 0.02) { skipped++; continue; } taken++; R += t.x.nr; open.push(Object.assign({ val }, t));
  }
  closeUntil(Infinity);
  const yrs = (tr[tr.length - 1].tIn - tr[0].tIn) / 31557600000;
  return { cagr: Math.pow(eq, 1 / yrs) - 1, mdd, taken, skipped, R };
}

let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ORD = {
  'как сейчас (порядок в списке)': (x) => x.i,
  'по обороту (как в приложении)': (x) => -x.turn,
  'оценка подсчёта — выше первой': (x) => -(x.t.score || 0),
  'план R:R — больше первым': (x) => -(x.t.rr || 0),
  'стоп дальше — первым (меньше денег)': (x) => -Math.abs(x.t.entry - x.t.stop0) / x.t.entry,
  'стоп ближе — первым': (x) => Math.abs(x.t.entry - x.t.stop0) / x.t.entry,
};
const pct = (v) => (v * 100).toFixed(1).padStart(5);
for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 }]]) {
  // оборот за 20 свечей до входа — то, по чему сортирует список приложение
  const r = evalCfg(PRE, { tr: (t, bars) => { let s = 0; for (let j = Math.max(0, t.iEntry - 20); j < t.iEntry; j++) s += bars[j].c * (bars[j].v || 0); t.turn = s; return t.NR; } });
  r.all.forEach((x, i) => { x.i = i; x.turn = x.t.turn; });
  const miss = r.all.filter((x) => x.t.score == null).length; if (miss) console.log('!! без оценки:', miss);
  const halves = [r.all.filter((x) => x.T < SPLIT), r.all.filter((x) => x.T >= SPLIT)];
  console.log(`\n${name}: сигналов ${r.all.length}`);
  console.log('порядок при нехватке денег'.padEnd(38), '%/год  до23  с23  просадка  взято  пропущ.  R взятых');
  for (const [lab, key] of Object.entries(ORD)) {
    const p = portfolio(r.all, key), h = halves.map((z) => portfolio(z, key));
    console.log(lab.padEnd(38), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%  ', String(p.taken).padStart(5), String(p.skipped).padStart(6), p.R.toFixed(0).padStart(8));
  }
  const rs = []; for (let k = 0; k < 30; k++) { const key = new Map(r.all.map((x) => [x, rnd()])); rs.push(portfolio(r.all, (x) => key.get(x))); }
  const c = rs.map((p) => p.cagr).sort((a, b) => a - b), d = rs.map((p) => p.mdd).sort((a, b) => a - b);
  console.log('случайный порядок, 30 раз:'.padEnd(38), `от ${pct(c[0])} до ${pct(c[c.length - 1])} %/год, просадка ${pct(d[0])}–${pct(d[d.length - 1])}%`);
}
