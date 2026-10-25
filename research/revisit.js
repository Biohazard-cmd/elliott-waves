// Старые идеи для «4 часа · неделя» на ровном варианте Егора (канал + выход по открытию пн + только лучший подсчёт), 25.10.2026:
// (1) нет денег — закрыть самую слабую позицию (Мэрфи, как rank4.js); (2) лимит позиции 15–30%; (3) порядок одновременных сигналов;
// (4) вход «толчком» (Даннигэн, как wk4.js). Сделки — из fri_chan.js, Мосбиржа 4ч 2018–2026. BASE=b0 — то же на нынешнем наборе.
process.env.MOEX = '1'; process.env.V = 'x';
if (process.env.BASE !== 'b0') { process.env.CLAR = 'top'; process.env.CAND = 'book,0,1,next'; } else process.env.CAND = 'none,0,0,close';
const fc = require('./fri_chan.js');
const H4 = 4 * 3600e3, SPLIT = Date.UTC(2022, 7, 9);
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const TR = fc.cand.map((x) => { const t = x.tr, b = t._b, iE = t.iEntry, iX = Math.min(t.iExit, b.length - 1); let turn = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) turn += b[j].c * (b[j].v || 0);
  return { id: x.id, b, iE, iX, e: t.entry, st: t.stop0, ex: t.exitP, T: b[iE].t, TOut: b[iX].t + H4, ord: x.i, score: fc.SC.get(b[t.i0].t + '|' + t.stop0) || 0, rr: (t.target - t.entry) / (t.entry - t.stop0), dist: (t.entry - t.stop0) / t.entry, turn }; });
console.log(`сделок ${TR.length}, оценка подсчёта найдена у ${TR.filter((q) => q.score).length}`);
const RATE = { 2019: 0.066, 2020: 0.043, 2021: 0.051, 2022: 0.098, 2023: 0.092, 2024: 0.173, 2025: 0.183, 2026: 0.143 }, fee = 0.0005, slip = 0.0002;
function pxAt(q, t) { const b = q.b; let lo = q.iE, hi = q.iX; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m].t <= t) lo = m; else hi = m - 1; } return b[lo].t === t ? b[lo].o : b[lo].c; }
// портфель как в rank4.js (риск 1%, позиция ≤ maxPos, свободные деньги в фонде) + замена слабой позиции
function port(list, key, o = {}) {
  const maxPos = o.maxPos || 0.25, tr = list.map((q) => ({ q, k: key(q) })).sort((a, b) => a.q.T - b.q.T || a.k - b.k);
  let eq = 1, open = [], peak = 1, mdd = 0, taken = 0, skipped = 0, swaps = 0, lastT = 0, st = 0, c = 0;
  const done = (g) => { if (g < 0) { c++; st = Math.max(st, c); } else c = 0; };
  const accrue = (t) => { if (!lastT) { lastT = t; return; } const dt = (t - lastT) / 31557600000; if (dt <= 0) return; const used = open.reduce((s, p) => s + p.val, 0); eq += Math.max(0, eq - used) * (RATE[new Date(t).getUTCFullYear()] || 0.1) * dt; lastT = t; };
  const close = (p, px, t) => { accrue(t); const g = p.val * ((px - p.q.e) / p.q.e - 2 * fee - 2 * slip); eq += g; done(g); if (eq > peak) peak = eq; mdd = Math.max(mdd, 1 - eq / peak); };
  const closeUntil = (t) => { open.sort((a, b) => a.q.TOut - b.q.TOut); while (open.length && open[0].q.TOut <= t) { const p = open.shift(); close(p, p.q.ex, p.q.TOut); } };
  for (const { q } of tr) {
    closeUntil(q.T); accrue(q.T);
    const size = () => { const used = open.reduce((s, p) => s + p.val, 0); return Math.min(eq * 0.01 / q.dist, eq * maxPos, Math.max(0, eq - used)); };
    let val = size();
    if (val < eq * 0.02 && o.rep != null) {
      const cand = open.filter((p) => p.q.id !== q.id).map((p) => { const px = pxAt(p.q, q.T); return { p, px, R: (px - p.q.e) / (p.q.e - p.q.st) }; }).sort((a, b) => a.R - b.R)[0];
      if (cand && cand.R < o.rep) { open = open.filter((p) => p !== cand.p); close(cand.p, cand.px, q.T); swaps++; val = size(); }
    }
    if (val < eq * 0.02) { skipped++; continue; }
    taken++; open.push({ val, q });
  }
  closeUntil(Infinity);
  return { cagr: Math.pow(eq, 1 / ((tr[tr.length - 1].q.T - tr[0].q.T) / 31557600000)) - 1, mdd, taken, skipped, swaps, st };
}
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function report(lab, list, key, o) {
  const p = port(list, key, o), h = [list.filter((q) => q.T < SPLIT), list.filter((q) => q.T >= SPLIT)].map((z) => port(z, key, o).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(list.map((q) => [q, rnd()])); return port(list, (q) => mm.get(q), o).cagr; }).sort((a, b) => a - b);
  console.log(lab.padEnd(42), pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), `| взято ${p.taken}, пропущ. ${p.skipped}${o && o.rep != null ? ', замен ' + p.swaps : ''}`, `| порядок ${pct(rc[0])} – ${pct(rc[19])}`);
}
// вход толчком (wk4.js): после сигнала ждём свечу против сделки, вход на пробое её максимума, ждём W свечей; стоп раньше входа — отмена
function thrust(q, W) {
  const { b } = q; let down = -1;
  for (let k = q.iE; k < Math.min(b.length, q.iE + W); k++) {
    const hit = b[k].l <= q.st;
    if (down < 0) { if (hit) return null; if (k > 0 && b[k].h < b[k - 1].h && b[k].l < b[k - 1].l) down = k; continue; }
    const trg = b[k].h > b[k - 1].h;
    if (hit && !trg) return null;
    if (!trg) continue;
    const e = Math.max(b[k].o, b[k - 1].h);
    if (k > q.iX) return null;
    if (hit) return Object.assign({}, q, { iE: k, e, ex: q.st, iX: k, T: b[k].t, TOut: b[k].t + H4, dist: (e - q.st) / e });
    let ex = q.ex, iX = q.iX;
    for (let j = k + 1; j <= q.iX; j++) if (b[j].l <= q.st) { ex = Math.min(b[j].o, q.st); iX = j; break; }
    return Object.assign({}, q, { iE: k, e, ex, iX, T: b[k].t, TOut: b[iX].t + H4, dist: (e - q.st) / e });
  }
  return null;
}
const turn = (q) => -q.turn;
if (!process.env.H1) {
console.log(`\n«4 часа · неделя», ${process.env.BASE === 'b0' ? 'нынешний набор' : 'ровный вариант (канал + пн + лучший подсчёт)'}; Мосбиржа 2018–2026, половины до/после 09.08.2022`);
console.log('вариант'.padEnd(42), '%/год  1пол  2пол просадка серия');
report('как сейчас в приложении (по обороту)', TR, turn);
report('порядок как в проверках (по бумагам)', TR, (q) => q.ord);
console.log('— (3) порядок одновременных сигналов');
report('первой — выше оценка подсчёта', TR, (q) => -q.score);
report('первой — выше прибыль/риск', TR, (q) => -q.rr);
report('первой — ближе стоп', TR, (q) => q.dist);
report('первой — дальше стоп', TR, (q) => -q.dist);
console.log('— (1) нет денег: закрыть самую слабую позицию, если её R ниже');
for (const b of [-0.3, 0, 0.5, 99]) report(`  ${b === 99 ? 'любая' : b}`, TR, turn, { rep: b });
console.log('— (2) лимит позиции');
for (const m of [0.15, 0.175, 0.2, 0.3]) report(`  ${m * 100}%`, TR, turn, { maxPos: m });
console.log('— (4) вход толчком, ждать W свечей');
for (const W of [3, 6, 9, 12]) report(`  W = ${W}`, TR.map((q) => thrust(q, W)).filter(Boolean), turn);
}

// (5) выход по часовому подсчёту: H1=1 [BASE=b0]. События на 1ч (лучший сценарий по зигзагу на 1ч, на закрытии часа):
// A — пятёрка вверх завершена, F — любая фигура вверх завершена, B — встречный импульс вниз дошёл до волны 4, C — закрытие под последним 1ч минимумом.
// Выход — по открытию следующего часа, если раньше прежнего выхода; при m — только если закрытие часа ≥ входа + m×риск
if (process.env.H1) {
  const S = require('./store.js'), E = S.E, H1 = 3600e3, EV = new Map();
  for (const sd of require('./moex4h.js').series(S, { ms: H1, tf: '1h' })) {
    const cfg = E.merge({}), ctx = new E.Ctx(sd.bars, cfg), z = E.zzInit(E.autoSwing(sd.bars, 1) / 100), mp = [], a = EV.get(sd.id) || [];
    let A = false, F = false, B = false, lo = -Infinity;
    for (let k = 0; k < sd.bars.length; k++) {
      if (E.zzPush(z, k, ctx.H, ctx.L, mp)) {
        const t = ctx.buildScenarios(mp)[0], ok = !!t && t.score >= cfg.minScore;
        A = ok && t.fam === 0 && t.dir === 1 && t.n === 6; F = ok && ctx.phaseNext(t) === -1; B = ok && t.fam === 0 && t.dir === -1 && t.n >= 4;
        const pl = mp.filter((p) => p.t === -1).pop(); lo = pl ? pl.p : -Infinity;
      }
      a.push({ t: sd.bars[k].t, c: sd.bars[k].c, nx: k + 1 < sd.bars.length ? sd.bars[k + 1] : null, A, F, B, C: sd.bars[k].c < lo });
    }
    EV.set(sd.id, a);
  }
  const first = (a, t) => { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m].t < t) l = m + 1; else h = m; } return l; };
  function h1exit(q, ev, m) {
    const a = EV.get(q.id); if (!a) return q;
    for (let k = first(a, q.T); k < a.length && a[k].t + H1 <= q.TOut - H4; k++) {   // часы, закрытые до начала 4ч свечи прежнего выхода
      const x = a[k]; if (!x[ev] || !x.nx || (m != null && x.c < q.e + m * (q.e - q.st))) continue;
      return Object.assign({}, q, { ex: x.nx.o, TOut: x.nx.t + H1, h1: true });
    }
    return q;
  }
  const R = (q) => (q.ex - q.e - q.e * 0.0014) / (q.e - q.st);
  console.log(`\n«4 часа · неделя», ${process.env.BASE === 'b0' ? 'нынешний набор' : 'ровный вариант'}: выход по часовому подсчёту; порядок как в приложении`);
  console.log('вариант'.padEnd(42), '%/год  1пол  2пол просадка серия');
  report('без часового выхода', TR, turn);
  const NM = { A: 'пятёрка вверх', F: 'фигура вверх', B: 'встречный импульс', C: 'под 1ч минимумом' };
  for (const ev of ['A', 'F', 'B', 'C']) for (const m of [null, 0, 0.5, 1]) {
    const L = TR.map((q) => h1exit(q, ev, m)), d = L.reduce((s, q, i) => s + (q.h1 ? R(q) - R(TR[i]) : 0), 0), n = L.filter((q) => q.h1).length;
    report(`  ${NM[ev]}${m == null ? '' : ', прибыль ≥ ' + m + 'R'} (${n} вых., ${d >= 0 ? '+' : ''}${d.toFixed(0)}R)`, L, turn);
  }
}
