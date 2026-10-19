// Клин (конечная диагональ) vs обычный импульс: что происходит после завершения пятой волны.
// Вход против фигуры на открытии свечи после подтверждения вершины 5, стоп за экстремум 5.
// Цели: конец волны 4 и начало фигуры (по книге после клина — «по меньшей мере до уровня, где он начался»).
const S = require('./store.js'); const E = S.E;
const TF = process.argv[2] || '4h';
const cfg0 = E.merge(Object.assign({}, S.doc.cfg, { maxBars: 100000 }));
const fee = cfg0.feePct / 100, slip = cfg0.slipPct / 100;

function events(bars, sw) {
  const ctx = new E.Ctx(bars, cfg0), N = ctx.N, O = ctx.O, H = ctx.H, L = ctx.L;
  const zm = E.zzInit(sw / 100), zs = E.zzInit(sw / 100 * ctx.cfg.subRatio), mp = []; ctx.sub = [];
  const seen = new Set(), out = [];
  for (let i = 0; i < N - 1; i++) {
    E.zzPush(zs, i, H, L, ctx.sub); const piv = E.zzPush(zm, i, H, L, mp);
    if (!piv || mp.length < 6) continue;
    const sc = ctx.buildScenarios(mp);
    const top = sc[0];
    for (const s of sc) {
      if (s.fam !== 0 || s.n !== 6 || s.cx || s.score < ctx.cfg.minScore) continue;
      if (s.idx[5] !== mp[mp.length - 1].i) continue;
      const key = s.idx.join(','); if (seen.has(key)) continue; seen.add(key);
      const side = -s.dir, e = O[i + 1], stop = s.px[5];
      if (side * (e - stop) <= 0) continue;
      const risk = Math.abs(e - stop), t4 = s.px[4], t0 = s.px[0];
      const ev = { id: '', T: ctx.T[i], diag: s.diag, top: s === top, side, R4: side * (t4 - e) / risk, R0: side * (t0 - e) / risk, hit4: 0, hit0: 0, stopped: 0, b4: 0, b0: 0, len: s.idx[5] - s.idx[0], end: N };
      for (let j = i + 1; j < N; j++) {
        const adv = side > 0 ? H[j] : L[j], adv2 = side > 0 ? L[j] : H[j];
        if (side * (stop - adv2) >= 0) { ev.stopped = j; break; }
        if (!ev.hit4 && side * (adv - t4) >= 0) { ev.hit4 = 1; ev.b4 = j - i; }
        if (!ev.hit0 && side * (adv - t0) >= 0) { ev.hit0 = 1; ev.b0 = j - i; ev.end = j; break; }
      }
      if (ev.stopped) ev.end = ev.stopped;
      if (!ev.hit0 && !ev.stopped) ev.open = true;
      ev.c = (2 * fee + 2 * slip) * e / risk;
      out.push(ev);
    }
  }
  return out;
}

const ser = S.series.filter((s) => s.tf === TF);
const all = [];
for (const s of ser) {
  const bars = E.trimGaps(s.bars, s.P).bars;
  const sw = Math.max(0.1, E.autoSwing(bars.slice(-2000), cfg0.swingMult));
  for (const ev of events(bars, sw)) { ev.id = s.id; all.push(ev); }
}
module.exports = { all };
if (require.main === module) {
  const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  const rep = (name, a) => {
    a = a.filter((e) => !e.open);
    if (!a.length) return console.log(name, '—');
    const n = a.length, h4 = a.filter((e) => e.hit4).length, h0 = a.filter((e) => e.hit0).length;
    // сделка «цель — конец волны 4»: +R4 если дошли до 4 раньше стопа, иначе −1
    const r4 = a.reduce((x, e) => x + (e.hit4 ? e.R4 : -1) - e.c, 0) / n;
    const r0 = a.reduce((x, e) => x + (e.hit0 ? e.R0 : -1) - e.c, 0) / n;
    console.log(name.padEnd(30), 'n', String(n).padStart(4), '| до волны 4:', (h4 / n * 100).toFixed(0).padStart(3) + '%', 'цель', med(a.map((e) => e.R4)).toFixed(1) + 'R', 'ср', r4.toFixed(2) + 'R', 'свечей', med(a.filter((e) => e.hit4).map((e) => e.b4)),
      '| до начала:', (h0 / n * 100).toFixed(0).padStart(3) + '%', 'цель', med(a.map((e) => e.R0)).toFixed(1) + 'R', 'ср', r0.toFixed(2) + 'R', 'свечей', med(a.filter((e) => e.hit0).map((e) => e.b0)));
  };
  console.log(`ТФ ${TF}, бумаг ${ser.length}`);
  rep('клин (все)', all.filter((e) => e.diag));
  rep('клин (главный сценарий)', all.filter((e) => e.diag && e.top));
  rep('импульс (все)', all.filter((e) => !e.diag));
  rep('импульс (главный сценарий)', all.filter((e) => !e.diag && e.top));
}
