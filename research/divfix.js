// Ошибка поправки на дивиденды (20.10.2026): adjustDividends делит дивиденд на уже поправленную цену.
// FIX=1 node divfix.js — те же наборы, но поправка от настоящей цены закрытия. Сравнение основного и агрессивного.
const mem = {}; global.window = globalThis;
global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] };
Object.defineProperty(global.localStorage, 'length', { get: () => Object.keys(mem).length });
global.EW2 = require(__dirname + '/../android/assets/engine2.js'); require(__dirname + '/../android/assets/data.js');
if (process.env.FIX) {
  const D = globalThis.EWData, msk = (t) => new Date(t + 3 * 36e5).toISOString().slice(0, 10);
  D.adjustDividends = (bars, divs) => {
    if (!divs || !divs.length || !bars.length) return { bars, adj: [] };
    const out = bars.map((b) => Object.assign({}, b)), adj = [];
    for (const d of divs.slice().sort((a, b) => (a.last < b.last ? 1 : -1))) {
      const k = out.findIndex((b) => msk(b.t) > d.last); if (k <= 0) continue;
      const before = bars[k - 1].c; if (!(before > 0)) continue;   // настоящая цена, а не уже поправленная
      const f = 1 - d.d / before; if (!(f > 0.5 && f < 1)) continue;
      for (let i = 0; i < k; i++) { const b = out[i]; b.o *= f; b.h *= f; b.l *= f; b.c *= f; }
      adj.push({ t: out[k].t, d: d.d, f });
    }
    return { bars: out, adj };
  };
}
const { evalCfg, SPLIT } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const MAIN = { addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5 };
const AGR = { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 };
console.log(process.env.FIX ? 'ПОПРАВКА ИСПРАВЛЕНА' : 'КАК СЕЙЧАС (с ошибкой)');
for (const [nm, cfg] of [['основной', MAIN], ['агрессивный', AGR]]) {
  const r = evalCfg(cfg, { tr: (t, bars) => { if (t.add && t.add.i != null) t.addT = bars[t.add.i].t; return t.NR; } });
  const adds = cfg.addPyramid ? r.all.filter((x) => x.t.add && x.t.add.NR != null).map((x) => ({ id: x.id + '+', of: x, t: { side: x.t.side, entry: x.t.add.px, stop0: x.t.add.stop, exitP: x.t.exitP }, T: Math.max(x.T + 1, x.t.addT || 0), TOut: x.TOut })) : [];
  const all = r.all.concat(adds); all.forEach((x, i) => { x.i = i; });
  const p = portfolio(all, 0.25, (x) => x.i), h = [all.filter((x) => (x.of || x).T < SPLIT), all.filter((x) => (x.of || x).T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i));
  const w = r.all.filter((x) => x.nr > 0).length;
  console.log(nm.padEnd(12), 'сделок', r.n, 'R', r.R.toFixed(0), 'ср', (r.R / r.n).toFixed(2), 'прибыльных', pct(w / r.n) + '%', '%/год', pct(p.cagr), 'до/после 2023', pct(h[0].cagr), pct(h[1].cagr), 'просадка', pct(p.mdd) + '%', 'серия', p.st);
}
