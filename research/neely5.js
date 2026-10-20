// Нили, подтверждение импульса: после завершённой волны 5 по сделке — выход (на открытии следующей свечи),
// если закрытие пробило линию через концы волн 2 и 4 не позже, чем через длительность волны 5 (в свечах) после её конца.
// Не пробило за это время — импульс не подтверждён (5-я тянется), сделку не трогаем.
// Движок не меняем: в памяти добавляем опцию addNeelyExit (выход помечается как reason 9, как у div5).
// Сравнение: без выхода / выход после любой завершённой 5-й (addDiv5Exit:'all', из div5.js) / по Нили.
const fs = require('fs'), Module = require('module'), path = require('path');
const EP = path.resolve(__dirname, '../android/assets/engine2.js');
let src = fs.readFileSync(EP, 'utf8');
const A = '      if (cur) this.trailOne(cur, i, spiv, piv, mp, tbuf, keep ? cur.path : null);';
if (!src.includes(A)) throw new Error('engine2.js изменился — патч не применился');
src = src.replace(A, `      if (cur && c.addNeelyExit && !flipExit && !phaseExit && i < N - 1) {
        if (piv) { const s5 = this.buildScenarios(mp)[0];
          if (s5 && s5.fam === 0 && !s5.diag && s5.n === 6 && s5.dir === cur.side && s5.idx[5] > cur.iEntry && (!cur.nly || cur.nly.i5 !== s5.idx[5]))
            cur.nly = { i2: s5.idx[2], v2: s5.px[2], i4: s5.idx[4], v4: s5.px[4], i5: s5.idx[5], end: s5.idx[5] + Math.max(1, s5.idx[5] - s5.idx[4]) }; }
        const q = cur.nly;
        if (q && i > q.i5) { if (i > q.end) cur.nly = null; else { const ln = q.v2 + (q.v4 - q.v2) * (i - q.i2) / (q.i4 - q.i2); if (cur.side * (C[i] - ln) < 0) { flipExit = true; cur.divExit = true; } } }
      }
` + A);
const m = new Module(EP, null); m.filename = EP; m.paths = Module._nodeModulePaths(path.dirname(EP)); m._compile(src, EP); m.loaded = true; require.cache[EP] = m;

const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('выход'.padEnd(20), 'сделок     R  ср.R прибыльных  %/год  до23  с23  просадка серия | выходов по 5-й, их ср.R');
  for (const [lab, over] of [['без (сейчас)', {}], ['после любой 5-й', { addDiv5Exit: 'all' }], ['по Нили (линия 2–4)', { addNeelyExit: true }]]) {
    const r = evalCfg(Object.assign({}, pre, over), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), w = r.all.filter((x) => x.nr > 0).length, dx = r.all.filter((x) => x.t.reason === 9);
    console.log(lab.padEnd(20), String(r.n).padStart(6), R.toFixed(0).padStart(5), (r.R / r.n).toFixed(2).padStart(5), pct(w / r.n) + '%    ', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', String(dx.length).padStart(4), dx.length ? (dx.reduce((s, x) => s + x.nr, 0) / dx.length).toFixed(2) : '');
  }
}
