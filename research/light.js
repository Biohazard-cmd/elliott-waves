// Все сигналы системы как независимые сделки (в том числе «доливки», когда система уже в позиции)
// + признаки на момент сигнала: в позиции ли уже система, старшая степень в последней волне,
// только что завершён импульс рабочей степени в ту же сторону, номер сигнала подряд в тренде.
const S = require('./store.js'); const E = S.E;
const TF = process.argv[2] || '1h', SWK = Number(process.argv[3] || 1);
const cfg0 = E.merge(Object.assign({}, S.doc.cfg, { maxBars: 100000, addMarket: false }, process.env.NOSTRUCT ? { addStruct: false } : {}, process.env.PRESET === 'd_long' ? { longOnly: true, swingMult: 1, addRunner: true, addStruct: false } : {}));
const ser = S.series.filter((s) => s.tf === TF);

function scan(bars, cfg, sw) {
  const ctx = new E.Ctx(bars, cfg), c = ctx.cfg, N = ctx.N, O = ctx.O, H = ctx.H, L = ctx.L, C = ctx.C;
  const zm = E.zzInit(sw / 100), zs = E.zzInit(sw / 100 * c.subRatio), mp = []; ctx.sub = [];
  const tr = ctx.computeTrend(sw), fee = c.feePct / 100, slip = c.slipPct / 100, tbuf = c.trailBufPct / 100;
  const open = [], done = []; let pend = null, lastSide = 0, seq = 0, lastTrend = 0;
  // направление старшей степени и структура — как в computeTrend, по барам
  const zh = E.zzInit(sw * c.trendMult / 100), zs2 = E.zzInit(sw / 100), hp = [], sp = []; let h1 = 0, h2 = 0, l1 = 0, l2 = 0, nh = 0, nl = 0;
  const HD = new Array(N).fill(0), ST = new Array(N).fill(0);
  for (let k = 0; k < N; k++) { E.zzPush(zh, k, H, L, hp); HD[k] = zh.dir; if (E.zzPush(zs2, k, H, L, sp)) { const q = sp[sp.length - 1]; if (q.t === 1) { h2 = h1; h1 = q.p; nh++; } else { l2 = l1; l1 = q.p; nl++; } }
    ST[k] = nh >= 2 && nl >= 2 ? (h1 > h2 && l1 > l2 ? 1 : h1 < h2 && l1 < l2 ? -1 : 0) : 0; }
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
        const past = done.filter((d) => d.setup === pl.setup && d.iExit < i).slice(-20), pm = past.length ? past.reduce((x, d) => x + d.NR, 0) / past.length : 0;
        const rr = pl.notgt ? null : Math.abs(pl.target - C[i]) / Math.abs(C[i] - pl.stop);
        pend = Object.assign(pl, { steady: HD[i] === pl.side && ST[i] === pl.side, hdOk: HD[i] === pl.side, pastN: past.length, pastM: pm, rr, iSig: i, i0: s.idx[0], inPos: open.some((o) => o.side === pl.side), hiEnd: ctx.hiEnding(i, pl.side), after5, seq, T: ctx.T[i] });
        break;
      }
    }
  }
  return done;
}

// тренд старшего таймфрейма (дневки) на момент сигнала — по закрытым дням, без заглядывания вперёд
const HTF = process.env.HTF || '1d';
function htfTrend(id) {
  const d = S.series.find((x) => x.id === id && x.tf === HTF); if (!d) return null;
  const b = E.trimGaps(d.bars, d.P).bars, cx = new E.Ctx(b, cfg0), sw = E.autoSwing(b.slice(-2000), cfg0.swingMult);
  const tr = cx.computeTrend(sw); return { T: b.map((x) => x.t), tr, P: d.P };
}
const all = [];
for (const s of ser) {
  const bars = E.trimGaps(s.bars, s.P).bars;
  const sw = Math.max(0.1, ((process.env.AUTO ? 0 : (S.doc.swings || {})[s.id + '.' + TF]) || E.autoSwing(bars.slice(-2000), cfg0.swingMult)) * SWK);
  const ht = htfTrend(s.id);
  for (const t of scan(bars, cfg0, sw)) {
    let dt = 0;
    if (ht) { let lo = -1; for (let k = ht.T.length - 1; k >= 0; k--) if (ht.T[k] + ht.P <= t.T) { lo = k; break; } dt = lo >= 0 ? ht.tr[lo] : 0; }
    all.push(Object.assign(t, { id: s.id, dt }));
  }
}
const MID = (() => { const ts = all.map((t) => t.T).sort((a, b) => a - b); return ts[ts.length >> 1]; })();
const grp = (name, f) => {
  const a = all.filter(f); if (!a.length) return console.log(name.padEnd(46), '—');
  const R = a.reduce((x, t) => x + t.NR, 0), w = a.filter((t) => t.NR > 0).length;
  const h1 = a.filter((t) => t.T < MID).reduce((x, t) => x + t.NR, 0), h2 = R - h1;
  console.log(name.padEnd(46), 'сд', String(a.length).padStart(5), 'R', R.toFixed(0).padStart(5), 'ср', (R / a.length).toFixed(3).padStart(7), 'приб', (w / a.length * 100).toFixed(0).padStart(3) + '%', '| 1-я пол.', h1.toFixed(0).padStart(4), '2-я', h2.toFixed(0).padStart(4));
};
console.log(`ТФ ${TF}, порог ×${SWK}, бумаг ${ser.length}, сигналов ${all.length}`);
grp('все сигналы', () => true);
grp('тренд устойчивый (степень + структура)', (t) => t.steady);
grp('тренд неустойчивый', (t) => !t.steady);
grp('прошлые такие же на бумаге: ≥5, в среднем >0', (t) => t.pastN >= 5 && t.pastM > 0);
grp('прошлые такие же на бумаге: ≥5, в среднем ≤0', (t) => t.pastN >= 5 && t.pastM <= 0);
grp('прошлых меньше 5', (t) => t.pastN < 5);
grp('цель/стоп < 1', (t) => t.rr != null && t.rr < 1);
grp('цель/стоп 1–2', (t) => t.rr != null && t.rr >= 1 && t.rr < 2);
grp('цель/стоп ≥ 2', (t) => t.rr != null && t.rr >= 2);
grp('без цели', (t) => t.rr == null);
