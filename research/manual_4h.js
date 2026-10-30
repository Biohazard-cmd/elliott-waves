// Примеры 4ч сделок для инструкции: наборы «4 часа · неделя» и «продажи по треугольнику» (как в PRESETS app.js), свечи 4ч из хранилища (VI.2024–X.2026).
// node manual_4h.js — список сделок; OUT=<файл> PICK='[["SBER_TQBR","week","2025-05-12"],...]' node manual_4h.js — выгрузка
const S = require('./store.js'), { BASE } = require('./strat.js'), E = S.E, D = S.D;
const mkt = D.buildMarket('4h', 200);
const SETS = {
  week: { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: true, w5: false, abc: false, tri: false }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true },
  hunt: { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: false, w5: false, abc: false, tri: false, hs: true, brk: true }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true },
  hs: { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: false, w5: false, abc: false, tri: false, hs: true, brk: false }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true },
  brk: { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: false, w5: false, abc: false, tri: false, hs: false, brk: true }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true },
  tri: { longOnly: false, shortOnly: true, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, setups: { w3: false, w5: false, abc: false, tri: true } },
};
const ser = S.series.filter((s) => s.tf === '4h');
const dt = (t) => new Date(t + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const cfgOf = (k, n) => Object.assign({}, BASE, SETS[k], { mkt, maxBars: n });
const runs = {};
const runOf = (id, k) => runs[id + k] || (runs[id + k] = (() => { const s = ser.find((x) => x.id === id); return E.run(s.bars, cfgOf(k, s.bars.length), s.P); })());
if (require.main === module && !process.env.OUT) {
  for (const k of (process.env.SETS || 'week,tri').split(',')) for (const s of ser) {
    const a = runOf(s.id, k);
    for (const t of a.trades) { if (t.reason === 3) continue;
      console.log(k.padEnd(5), s.id.padEnd(10), dt(a.bars[t.iEntry].t), E.SETUP_SHORT[t.setup].padEnd(3), 'R', t.R.toFixed(2).padStart(6), (E.REASON_NAME[t.reason] || t.reason).padEnd(18), 'св', String(t.iExit - t.iEntry).padStart(3), 'стоп-шагов', (t.path || []).length, t.wkCarry ? 'перенос' : '', t.wkHold ? 'канал' + t.wkHold : ''); }
  }
}
module.exports = { SETS, runOf, ser, cfgOf, mkt };

// ---------- выгрузка: свечи окна + подсчёт на каждой свече + сделка ----------
const rd = (x) => (x == null ? null : Math.round(x * 100) / 100);
const day = (t) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);
function lvlBar(a, t) { let bi = -1, bv = -Infinity; for (let i = Math.max(0, t.iSig - 500); i < t.iSig; i++) if (a.bars[i].c > bv) { bv = a.bars[i].c; bi = i; } return [a.bars[bi].t, t.iSig - bi]; }
function exportOne([id, k, d]) {
  const a = runOf(id, k), cfg = E.merge(cfgOf(k, 99999));
  const t = a.trades.find((x) => x.reason !== 3 && day(a.bars[x.iEntry].t) === d);
  if (!t) throw new Error('нет сделки ' + id + ' ' + d);
  const c0 = t.cnt ? t.cnt.idx[0] : t.iSig - 20, i0 = Math.max(0, Math.min(c0, t.iSig) - 30), i1 = Math.min(a.bars.length - 1, t.iExit + 14);
  const snaps = []; let prev = '';
  for (let i = i0; i <= i1; i++) {
    const c = new E.Ctx(a.bars.slice(0, i + 1), cfg); c.analyzeNow(a.swing);
    const sc = c.scen[0], pts = sc ? E.countPath(sc).filter((p) => !p.small && p.i >= i0).map((p) => [p.i - i0, rd(p.p), p.lbl]) : [];
    const key = JSON.stringify(pts);
    if (key !== prev) { snaps.push({ at: i - i0, pts, title: sc ? E.scenTitle(sc) : '' }); prev = key; }
  }
  let iT = -1; for (let i = t.iEntry; i <= t.iExit; i++) if (t.side * ((t.side > 0 ? a.bars[i].h : a.bars[i].l) - t.target) >= 0) { iT = i; break; }
  const cx = new E.Ctx(a.bars, cfg), fri = []; for (let i = t.iEntry; i < t.iExit; i++) if (cx.weekEnd(i)) fri.push(i - i0);
  const bars = a.bars.slice(i0, i1 + 1).map((b) => [b.t, rd(b.o), rd(b.h), rd(b.l), rd(b.c)]);
  const cntPts = (s) => (s ? E.countPath(s).filter((p) => !p.small).map((p) => [p.i - i0, rd(p.p), p.lbl]) : []);
  return { id: id.replace('_TQBR', ''), set: k, d, bars, snaps,
    tr: { side: t.side, iSig: t.iSig - i0, iE: t.iEntry - i0, iX: t.iExit - i0, iT: iT < 0 ? -1 : iT - i0, entry: rd(t.entry), stop0: rd(t.stop0), target: rd(t.target), exitP: rd(t.exitP), R: rd(t.R), why: E.REASON_NAME[t.reason], reason: t.reason,
      path: (t.path || []).map((p) => [p.bar - i0, rd(p.p), p.be ? 1 : 0]), beWhy: t.beWhy || '', wkCarry: t.wkCarry || 0, wkHold: t.wkHold || 0, fri, cnt: cntPts(t.cnt), setup: E.SETUP_NAME[t.setup], pat: t.pat ? { kind: t.pat.kind, lvl: rd(t.pat.lvl), pts: (t.pat.pts || []).map((q) => [q.i - i0, rd(q.p)]), lvlT: t.pat.kind === 'brk' ? lvlBar(a, t) : null } : null } };
}
if (require.main === module && process.env.OUT) {
  const out = JSON.parse(process.env.PICK).map(exportOne);
  require('fs').writeFileSync(process.env.OUT, JSON.stringify(out));
  for (const x of out) console.log(x.id, x.set, x.d, 'свечей', x.bars.length, 'снимков', x.snaps.length, JSON.stringify(x.tr).slice(0, 400));
}
