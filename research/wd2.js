// Клин на старшем ТФ как фильтр сигналов младшего: сигналы системы на 1h во время «окна» после клина на 4h
const HT = process.env.HT || '4h', LT = process.env.LT || '1h';
process.argv[2] = HT; const W = require('./wd.js'); const S = require('./store.js'); const E = S.E;
const cfg0 = E.merge(Object.assign({}, S.doc.cfg, { maxBars: 100000, addMarket: false }));
function scan(bars, cfg, sw) {
  const ctx = new E.Ctx(bars, cfg), c = ctx.cfg, N = ctx.N, O = ctx.O, H = ctx.H, L = ctx.L, C = ctx.C;
  const zm = E.zzInit(sw / 100), zs = E.zzInit(sw / 100 * c.subRatio), mp = []; ctx.sub = [];
  const tr = ctx.computeTrend(sw), fee = c.feePct / 100, slip = c.slipPct / 100, tbuf = c.trailBufPct / 100;
  const open = [], done = []; let pend = null, lastSide = 0, seq = 0, lastTrend = 0;
  for (let i = 0; i < N; i++) {
    if (pend) {   // вход на открытии следующей свечи
      const sig = pend; pend = null; const e = O[i];
      if (sig.side * (e - sig.stop) > 0 && sig.side * (sig.target - e) > 0)
        open.push(Object.assign({}, sig, { iEntry: i, entry: e, stop0: sig.stop, best: e, path: [], moves: 0, flip: false }));
    }
    for (const cur of open.slice()) {
      let reason = -1, px = 0;
      if (cur.flip) { px = O[i]; reason = 6; }
      else if (cur.side > 0) { if (L[i] <= cur.stop) { px = Math.min(O[i], cur.stop); reason = 0; } else if (!cur.notgt && H[i] >= cur.target) { px = Math.max(O[i], cur.target); reason = 1; } }
      else { if (H[i] >= cur.stop) { px = Math.max(O[i], cur.stop); reason = 0; } else if (!cur.notgt && L[i] <= cur.target) { px = Math.min(O[i], cur.target); reason = 1; } }
      if (reason < 0 && c.maxHoldDays > 0 && ctx.T[i] - ctx.T[cur.iEntry] >= c.maxHoldDays * 86400000) { px = C[i]; reason = 2; }
      if (reason < 0 && i === N - 1) { px = C[i]; reason = 3; }
      if (reason >= 0) {
        cur.NR = (cur.side * (px - cur.entry) - (2 * fee + 2 * slip) * cur.entry) / Math.abs(cur.entry - cur.stop0);
        cur.reason = reason; cur.iExit = i; open.splice(open.indexOf(cur), 1); if (reason !== 3) done.push(cur);
      }
    }
    const spiv = E.zzPush(zs, i, H, L, ctx.sub), piv = E.zzPush(zm, i, H, L, mp);
    for (const cur of open) {
      if (c.addFlipExit && piv && mp[mp.length - 1].c > cur.iSig && i < N - 1) { const sc = ctx.buildScenarios(mp); if (sc.length && ctx.isFlip(sc[0], cur.side, cur.i0)) cur.flip = true; }
      ctx.trailOne(cur, i, spiv, piv, mp, tbuf, null);
    }
    if (tr[i] !== lastTrend) { lastTrend = tr[i]; seq = 0; }
    if (piv && !pend && i < N - 1) {
      const sc = ctx.buildScenarios(mp);
      for (const s of sc) {
        if (s.score < c.minScore) continue;
        const pl = ctx.makePlan(s, C[i]);
        if (!(pl && ctx.trendOK(pl.side, tr[i]))) continue;
        // признак «после пятёрки»: точки до начала нового счёта (без волны 0) образуют завершённый импульс в ту же сторону
        const k0 = mp.findIndex((q) => q.i === s.idx[0]);
        let after5 = false;
        if (k0 > 2) { const prev = ctx.buildScenarios(mp.slice(0, k0)).slice(0, 2); after5 = prev.some((p) => p.fam === 0 && p.n === 6 && p.dir === pl.side && p.score >= c.minScore); }
        if (pl.side !== lastSide) { seq = 0; lastSide = pl.side; }
        seq++;
        pend = Object.assign(pl, { iSig: i, i0: s.idx[0], inPos: open.some((o) => o.side === pl.side), hiEnd: ctx.hiEnding(i, pl.side), after5, seq, T: ctx.T[i] });
        break;
      }
    }
  }
  return done;
}
const evs = W.all; const HP = S.series.find((s) => s.tf === HT).P;
const sigs = [];
for (const s of S.series.filter((x) => x.tf === LT)) {
  const bars = E.trimGaps(s.bars, s.P).bars, sw = Math.max(0.1, E.autoSwing(bars.slice(-2000), cfg0.swingMult));
  const ws = evs.filter((e) => e.id === s.id);
  const hb = S.series.find((x) => x.id === s.id && x.tf === HT); const hT = hb ? E.trimGaps(hb.bars, hb.P).bars.map((b) => b.t) : [];
  for (const t of scan(bars, cfg0, sw)) {
    // окно: от закрытия свечи подтверждения на старшем ТФ до стопа/цели клина (не дольше 60 свечей старшего ТФ)
    let tag = 'нет фигуры';
    for (const e of ws) {
      const t0 = e.T + HP, t1 = Math.min(e.end < hT.length ? hT[e.end] + HP : Infinity, t0 + 60 * HP);
      if (t.T >= t0 && t.T < t1) { tag = (e.diag ? 'клин' : 'импульс') + (t.side === e.side ? ': по развороту' : ': против разворота'); if (e.diag) break; }
    }
    sigs.push(Object.assign(t, { tag, id: s.id }));
  }
}
const MID = (() => { const ts = sigs.map((t) => t.T).sort((a, b) => a - b); return ts[ts.length >> 1]; })();
const grp = (name, f) => { const a = sigs.filter(f); if (!a.length) return console.log(name, '—'); const R = a.reduce((x, t) => x + t.NR, 0), w = a.filter((t) => t.NR > 0).length, h1 = a.filter((t) => t.T < MID).reduce((x, t) => x + t.NR, 0);
  console.log(name.padEnd(48), 'сд', String(a.length).padStart(5), 'ср', (R / a.length).toFixed(3).padStart(7), 'приб', (w / a.length * 100).toFixed(0) + '%', '| 1-я пол.', h1.toFixed(0), '2-я', (R - h1).toFixed(0)); };
console.log(`Сигналы ${LT} в окне после завершённой фигуры на ${HT}`);
for (const g of ['все', 'нет фигуры', 'клин: по развороту', 'клин: против разворота', 'импульс: по развороту', 'импульс: против разворота']) grp(g, g === 'все' ? () => true : (t) => t.tag === g);
grp('система свободна + клин: по развороту', (t) => !t.inPos && t.tag === 'клин: по развороту');
grp('система свободна + клин: против', (t) => !t.inPos && t.tag === 'клин: против разворота');
grp('система свободна (все)', (t) => !t.inPos);
