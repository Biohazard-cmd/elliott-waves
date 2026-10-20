// Нили, «подобие и баланс»: в подсчёте, по которому берётся сигнал, каждая пара соседних волн должна быть
// сопоставима — меньшая ≥ k от большей по цене ИЛИ по времени (у Нили k = 1/3). Нет — этот подсчёт пропускаем
// (движок пробует следующий). Опция simK добавляется в копию движка в памяти, файл не меняется.
const fs = require('fs'), Module = require('module'), path = require('path');
const EP = path.resolve(__dirname, '../android/assets/engine2.js');
let src = fs.readFileSync(EP, 'utf8');
const A = '          const pl = this.makePlan(s, C[i]);';
if (!src.includes(A)) throw new Error('engine2.js изменился — патч не применился');
src = src.replace(A, '          if (c.simK && !globalThis.__simOK(s, c.simK)) continue;\n' + A);
globalThis.__simOK = (s, k) => {
  for (let j = 1; j + 1 < s.n; j++) {
    const p1 = Math.abs(s.px[j] - s.px[j - 1]), p2 = Math.abs(s.px[j + 1] - s.px[j]), t1 = s.idx[j] - s.idx[j - 1], t2 = s.idx[j + 1] - s.idx[j];
    if (!(Math.min(p1, p2) >= k * Math.max(p1, p2) || Math.min(t1, t2) >= k * Math.max(t1, t2))) return false;
  }
  return true;
};
const m = new Module(EP, null); m.filename = EP; m.paths = Module._nodeModulePaths(path.dirname(EP)); m._compile(src, EP); m.loaded = true; require.cache[EP] = m;

const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('подобие'.padEnd(14), 'сделок     R  ср.R прибыльных  %/год  до23  с23  просадка серия | случайный порядок');
  for (const k of [0, 0.25, 1 / 3, 0.4, 0.5]) {
    const r = evalCfg(Object.assign({}, pre, k ? { simK: k } : {}), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length;
    console.log((k ? '≥ ' + (k === 1 / 3 ? '1/3 (Нили)' : k) : 'выкл.').padEnd(14), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(w / r.n) + '%    ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]));
  }
}
