// Подбор реальных примеров для инструкции (manual/): сделки агрессивного набора на дневках 65 бумаг.
// node manual_examples.js — список сделок; OUT=<файл> node manual_examples.js — выгрузка выбранных примеров
const { BASE, ser, mkt, E } = require('./strat.js');
const AGR = Object.assign({}, BASE, { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5, addPyramid: true, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3, mkt });
const dt = (t) => new Date(t).toISOString().slice(0, 10);
if (require.main === module && !process.env.OUT) {
  for (const s of ser) {
    const a = E.run(s.bars, Object.assign({}, AGR, { maxBars: s.bars.length }), s.P);
    for (const t of a.trades) {
      if (t.reason === 3) continue;
      console.log(s.id.padEnd(10), dt(a.bars[t.iEntry].t), E.SETUP_SHORT[t.setup].padEnd(3), 'R', t.R.toFixed(2).padStart(6), (E.REASON_NAME[t.reason] || t.reason).padEnd(16), 'дн', String(t.iExit - t.iEntry).padStart(3), 'шагов стопа', (t.path || []).length, t.add ? 'доливка' : '', 'sw', a.swing.toFixed(1));
    }
  }
}
module.exports = { AGR };

// ---------- выгрузка примеров: свечи окна + подсчёт, каким его видел движок на каждой свече ----------
const IMPULSES = [
  ['PLZL_TQBR', '2024-11-27', '2025-03-06'],
  ['LKOH_TQBR', '2023-09-20', '2024-05-20'],
  ['GAZP_TQBR', '2025-08-11', '2025-10-28'],
  ['MGNT_TQBR', '2021-02-26', '2021-07-15'],
];
const TRADES = [['SBER_TQBR', '2021-04-19'], ['SBER_TQBR', '2025-02-18'], ['SBER_TQBR', '2024-02-27'], ['GAZP_TQBR', '2021-07-16']];
const rd = (x) => (x == null ? null : Math.round(x * 100) / 100);
function exportAll() {
  const cfg = E.merge(Object.assign({}, AGR, { maxBars: 99999 })), runs = {};
  const runOf = (id) => runs[id] || (runs[id] = (() => { const s = ser.find((x) => x.id === id); return E.run(s.bars, Object.assign({}, AGR, { maxBars: s.bars.length }), s.P); })());
  const ix = (a, d) => a.bars.findIndex((b) => dt(b.t) >= d);
  function snaps(a, i0, i1) {
    const out = []; let prev = '';
    for (let i = i0; i <= i1; i++) {
      const c = new E.Ctx(a.bars.slice(0, i + 1), cfg); c.analyzeNow(a.swing);
      const sc = c.scen[0], pts = sc ? E.countPath(sc).filter((p) => !p.small).map((p) => [p.i - i0, rd(p.p), p.lbl]) : [];
      const key = JSON.stringify(pts);
      if (key !== prev) { out.push({ at: i - i0, pts, title: sc ? E.scenTitle(sc) : '', rules: sc ? E.rulesCheck(sc).map((r) => [r.ok ? 1 : 0, r.rule ? 1 : 0, r.t]) : [] }); prev = key; }
    }
    return out;
  }
  const win = (a, i0, i1) => a.bars.slice(i0, i1 + 1).map((b) => [b.t, rd(b.o), rd(b.h), rd(b.l), rd(b.c)]);
  const res = { impulses: [], trades: [] };
  for (const [id, d0, d1] of IMPULSES) {
    const a = runOf(id), j0 = ix(a, d0), j1 = ix(a, d1), i0 = Math.max(0, j0 - 15);
    let k = j1; for (; k < Math.min(a.bars.length, j1 + 120); k++) { const c = new E.Ctx(a.bars.slice(0, k + 1), cfg); c.analyzeNow(a.swing); const sc = c.scen[0]; if (sc && sc.n === 6 && sc.idx[5] === j1) break; }
    const i1 = Math.min(a.bars.length - 1, Math.max(j1 + 25, k + 12));   // до момента, когда движок увидел пятую волну, и ещё немного
    res.impulses.push({ id: id.replace('_TQBR', ''), d0, d1, bars: win(a, i0, i1), snaps: snaps(a, i0, i1), w0: j0 - i0, w5: j1 - i0 });
  }
  for (const [id, d] of TRADES) {
    const a = runOf(id), t = a.trades.find((x) => dt(a.bars[x.iEntry].t) === d);
    const c0 = t.cnt ? t.cnt.idx[0] : t.iSig - 20, i0 = Math.max(0, Math.min(c0, t.iSig) - 25), i1 = Math.min(a.bars.length - 1, t.iExit + 12);
    let iT = -1; for (let i = t.iEntry; i <= t.iExit; i++) if (t.side * ((t.side > 0 ? a.bars[i].h : a.bars[i].l) - t.target) >= 0) { iT = i; break; }
    res.trades.push({ id: id.replace('_TQBR', ''), d, bars: win(a, i0, i1), snaps: snaps(a, i0, i1),
      tr: { iSig: t.iSig - i0, iE: t.iEntry - i0, iX: t.iExit - i0, iT: iT < 0 ? -1 : iT - i0, entry: rd(t.entry), stop0: rd(t.stop0), target: rd(t.target), exitP: rd(t.exitP), R: rd(t.R), why: E.REASON_NAME[t.reason],
        path: (t.path || []).map((p) => [p.bar - i0, rd(p.p), p.be ? 1 : 0]), add: t.add ? { i: t.add.i - i0, px: rd(t.add.px), R: rd(t.add.R) } : null,
        cnt: t.cnt ? E.countPath(t.cnt).filter((p) => !p.small).map((p) => [p.i - i0, rd(p.p), p.lbl]) : [], exitCnt: t.exitCnt ? E.countPath(t.exitCnt).filter((p) => !p.small).map((p) => [p.i - i0, rd(p.p), p.lbl]) : [] } });
  }
  return res;
}
if (require.main === module && process.env.OUT) {
  const r = exportAll(); require('fs').writeFileSync(process.env.OUT, JSON.stringify(r));
  for (const x of r.impulses) console.log(x.id, x.d0, 'свечей', x.bars.length, 'снимков', x.snaps.length);
  for (const x of r.trades) console.log(x.id, x.d, 'свечей', x.bars.length, 'снимков', x.snaps.length, 'R', x.tr.R, x.tr.why, 'путь', JSON.stringify(x.tr.path), 'доливка', JSON.stringify(x.tr.add), 'цель на', x.tr.iT);
}
