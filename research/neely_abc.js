// Нили, подтверждение коррекции A-B-C: цена должна вернуться к началу волны C (уровень B) не позже,
// чем через длительность волны C после её конца. Для сетапа «После коррекции A-B-C» (setup 2) два варианта:
//   wait — входить только после подтверждения (закрытие за уровнем B в срок; уже подтверждено к сигналу — сразу;
//          срок вышел или дошли до стопа — сигнал отменён);
//   time — входить как сейчас, но если к концу срока подтверждения нет — выход на открытии следующей свечи.
// Движок не меняем: опция nlyAbc добавляется в копию в памяти. Выход по time помечается reason 9.
const fs = require('fs'), Module = require('module'), path = require('path');
const EP = path.resolve(__dirname, '../android/assets/engine2.js');
let src = fs.readFileSync(EP, 'utf8');
const rep = (a, b) => { if (!src.includes(a)) throw new Error('engine2.js изменился — патч не применился: ' + a.trim().slice(0, 60)); src = src.replace(a, b); };
rep('    let cur = null, frac = 0, phaseExit = false, flipExit = false;', '    let cur = null, frac = 0, phaseExit = false, flipExit = false;\n    this.__pend = null;');
const ACC = '          if (pl && this.trendOK(pl.side, tr[i]) && this.marketOK(pl.side, this.T[i]) && this.aoOK(pl.side, i)) { sig = pl; sig.i0 = s.idx[0]; sig.cnt = keep ? snapCount(s) : null; sigBar = i; hasSig = true; break; }';
rep(ACC, `          if (pl && this.trendOK(pl.side, tr[i]) && this.marketOK(pl.side, this.T[i]) && this.aoOK(pl.side, i)) {
            if (c.nlyAbc && pl.setup === 2) {
              const lvl = s.px[2], end = s.idx[3] + Math.max(1, s.idx[3] - s.idx[2]);
              pl.nly = { lvl, end };
              if (c.nlyAbc === 'wait' && pl.side * (C[i] - lvl) < 0) { if (i > end) continue; pl.i0 = s.idx[0]; pl.cnt = null; this.__pend = { sig: pl, lvl, end }; break; }
            }
            sig = pl; sig.i0 = s.idx[0]; sig.cnt = keep ? snapCount(s) : null; sigBar = i; hasSig = true; this.__pend = null; break; }`);
rep('      if (piv && !cur && !hasSig && i < N - 1) {', `      if (this.__pend && !cur && !hasSig) { const q = this.__pend;
        if (i > q.end || (q.sig.side > 0 ? L[i] <= q.sig.stop : H[i] >= q.sig.stop)) this.__pend = null;
        else if (q.sig.side * (C[i] - q.lvl) >= 0 && i < N - 1) { sig = q.sig; sigBar = i; hasSig = true; this.__pend = null; } }
      if (piv && !cur && !hasSig && i < N - 1) {`);
rep('          if (sig.w1) { const lv', '          cur.nly2 = sig.nly;\n          if (sig.w1) { const lv');
const TR = '      if (cur) this.trailOne(cur, i, spiv, piv, mp, tbuf, keep ? cur.path : null);';
rep(TR, `      if (cur && c.nlyAbc === 'time' && cur.nly2 && !flipExit && !phaseExit && i < N - 1) { const q = cur.nly2;
        if (cur.side * (C[i] - q.lvl) >= 0) cur.nly2 = null; else if (i >= q.end) { flipExit = true; cur.divExit = true; cur.nly2 = null; } }
` + TR);
const m = new Module(EP, null); m.filename = EP; m.paths = Module._nodeModulePaths(path.dirname(EP)); m._compile(src, EP); m.loaded = true; require.cache[EP] = m;

const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const PRE = {
  'ОСНОВНОЙ': { addAO: true, addSma200: true, maxHoldDays: 182 },
  'АГРЕССИВНЫЙ + ДОЛИВКА': { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true },
};
for (const [nm, pre] of Object.entries(PRE)) {
  console.log(`\n${nm}`);
  console.log('ABC'.padEnd(22), 'сделок  ABC  R(ABC) ср.R(ABC)    R  %/год  до23  с23  просадка серия | порядок | выходов по сроку, ср.R');
  for (const [lab, mode] of [['как сейчас', false], ['вход после подтверждения', 'wait'], ['выход без подтверждения', 'time']]) {
    const r = evalCfg(Object.assign({}, pre, mode ? { nlyAbc: mode } : {}), { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
    const adds = pre.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
    const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
    const halves = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)];
    const p = portfolio(all, 0.25, (x) => x.i), h = halves.map((z) => portfolio(z, 0.25, (x) => x.i));
    const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
    const R = r.R + adds.reduce((s, a) => s + a.of.t.add.NR, 0), abc = r.all.filter((x) => x.t.setup === 2), Ra = abc.reduce((s, x) => s + x.nr, 0), dx = r.all.filter((x) => x.t.reason === 9);
    console.log(lab.padEnd(22), String(r.n).padStart(6), String(abc.length).padStart(4), Ra.toFixed(0).padStart(7), (Ra / Math.max(1, abc.length)).toFixed(2).padStart(9), R.toFixed(0).padStart(5), pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(5), ' |', pct(rc[0]), '–', pct(rc[rc.length - 1]), '|', String(dx.length).padStart(4), dx.length ? (dx.reduce((s, x) => s + x.nr, 0) / dx.length).toFixed(2) : '');
  }
}
