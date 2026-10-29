// Новые фигуры для роботов (29.10.2026, просьба Егора): проверить по очереди на 4ч Мосбиржи 2018–2026 (65 бумаг), как отдельный робот
// и как добавку к набору «4 часа · неделя» (3.1: канал, выход по открытию пн, только лучший подсчёт, риск 1,5%, комиссия 0,05% + 0,02%).
// Волновые фигуры — сетапы движка (w5, abc с отбором зигзаг/флэт, клин — сделка против завершённого клина, треугольник вверх);
// классические (двойное дно/вершина, голова и плечи, флаг, пробой уровня) — свой поиск по точкам зигзага в копии движка в памяти
// (хук c.patHook рядом с выбором сигнала; выходы, фильтры, пятничные правила — движка). engine2.js не меняется.
// FIG=base|w5|zz|flat|wedge|triup|db|dt|hs|hst|flag|brk node figures.js
const Module = require('module'), path = require('path');
const ENG = path.resolve(__dirname, '../android/assets/engine2.js');
const comp = Module.prototype._compile;
Module.prototype._compile = function (src, file) {
  if (path.resolve(file) === ENG) {
    const at = 'const eqNow = cur ? equity';
    if (src.split(at).length !== 2) throw new Error('figures: не нашёл место для хука в engine2.js');
    src = src.replace(at, 'if (c.patHook && !cur && !hasSig && i < N - 1) { const pl = c.patHook.call(this, i, mp, this.sub); if (pl && this.marketOK(pl.side, this.T[i]) && (c.patFilt === \'mkt\' || (this.trendOK(pl.side, tr[i]) && this.aoOK(pl.side, i)))) { sig = pl; sigBar = i; hasSig = true; } }\n      ' + at);
  }
  return comp.call(this, src, file);
};
const S = require('./store.js'), { evalCfg } = require('./strat.js'), M = require('./moex4h.js'), { portfolio } = require('./maxpos_add.js');
const E = S.E;
const ser = M.series(S), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = Date.UTC(2022, 7, 9), FEEP = +(process.env.FEEP || 0.05), FEE = (FEEP + 0.02) * 2 / 100, BOR = 0.15, RISK = +(process.env.RISK || 1.5) / 100;
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true, feePct: FEEP, slipPct: 0.02 };
const NONE = { w3: false, w5: false, abc: false, tri: false };

// отбор внутри сетапа: abc — только зигзаг (kind 2) или только флэт (kind 3); «против тренда после 5 волн» — только после клина
const mp0 = E.Ctx.prototype.makePlan;
E.Ctx.prototype.makePlan = function (s, entry) {
  const pl = mp0.call(this, s, entry), f = this.cfg.abcKind;
  if (!pl) return pl;
  if (pl.setup === 2 && f && s.kind !== f) return null;
  if (pl.setup === 4 && this.cfg.counterDiag && !s.diag) return null;
  return pl;
};

// ---------- классические фигуры по точкам зигзага (zz: 'main' — основной, 'sub' — младший) ----------
// сторона d: +1 — фигура на покупку (дно), −1 — на продажу (вершина). Вход — первое закрытие за уровнем, не позже wait свечей
// после подтверждения последней точки; стоп — за экстремумом фигуры; цель — высота фигуры от уровня (дальше — бегунок движка)
function pat(kind, o) {
  const d = o.side || 1, wait = o.wait || 30, buf = 0.001;
  return function (i, mp, sub) {
    const P = o.zz === 'sub' ? sub : mp, n = P.length, C = this.C, A = this.atr();
    if (n < 3 || i < 1) return null;
    const last = P[n - 1];
    if (last.t !== -d || i - last.c > wait || i <= last.c) return null;
    this._used = this._used || new Set();
    const mk = (lvl, stop, target, i0) => {
      if (!(d * (C[i] - lvl) > 0 && d * (C[i - 1] - lvl) <= 0)) return null;
      const key = kind + last.i; if (this._used.has(key)) return null;
      stop = d > 0 ? stop * (1 - buf) : stop * (1 + buf);
      const risk = d * (C[i] - stop), rew = d * (target - C[i]);
      if (risk <= 0 || rew <= 0) return null;
      this._used.add(key);
      return { setup: 5, side: d, entry: C[i], stop, target, rr: rew / risk, score: 50, notgt: false, sigBar: -1, scen: -1, w1: null, i0 };
    };
    if (kind === 'db') {   // двойное дно: низ — середина — низ, низы различаются не больше tol×ATR
      const a = P[n - 3], b = P[n - 2];
      if (Math.abs(last.p - a.p) > (o.tol || 0.5) * A[last.c]) return null;
      const lo = d > 0 ? Math.min(a.p, last.p) : Math.max(a.p, last.p);
      return mk(b.p, lo, b.p + (b.p - lo), a.i);
    }
    if (kind === 'hs') {   // голова и плечи: плечо — шея — голова — шея — плечо; голова дальше плеч, плечи сопоставимы
      if (n < 5) return null;
      const l1 = P[n - 5], h1 = P[n - 4], hd = P[n - 3], h2 = P[n - 2], l3 = last;
      if (!(d * (l1.p - hd.p) > 0 && d * (l3.p - hd.p) > 0)) return null;
      const neck = (j) => h1.p + (h2.p - h1.p) * (j - h1.i) / (h2.i - h1.i), depth = d * (neck(hd.i) - hd.p);
      if (!(depth > 0) || Math.abs(l1.p - l3.p) > (o.tol || 0.5) * depth) return null;
      return mk(neck(i), l3.p, neck(i) + d * depth, l1.i);
    }
    if (kind === 'flag') {   // флаг: быстрый «флагшток» ≥ pole×ATR за ≤ bars свечей, откат ≤ 50% флагштока, вход — пробой вершины флагштока
      const a = P[n - 3], b = P[n - 2], pole = d * (b.p - a.p);
      if (!(pole >= (o.pole || 4) * A[b.c]) || b.i - a.i > (o.bars || 12) || d * (b.p - last.p) > 0.5 * pole) return null;
      return mk(b.p, last.p, last.p + d * pole, a.i);
    }
    if (kind === 'brk') {   // пробой уровня: закрытие выше максимума за N свечей (до последней точки), стоп — за последней точкой
      const N = o.N || 120, key = 'hh' + N + d;
      if (!this[key]) { const H = d > 0 ? this.H : this.L.map((v) => -v), q = new Array(this.N).fill(NaN), dq = [];   // максимум за N свечей до j (не включая j)
        for (let j = 0; j < this.N; j++) { while (dq.length && dq[0] < j - N) dq.shift(); if (dq.length) q[j] = d * H[dq[0]]; while (dq.length && H[dq[dq.length - 1]] <= H[j]) dq.pop(); dq.push(j); } this[key] = q; }
      const lvl = this[key][i]; if (isNaN(lvl)) return null;
      const risk = d * (lvl - last.p); if (!(risk > 0)) return null;
      return mk(lvl, last.p, lvl + d * (o.rr || 2) * risk, last.i);
    }
    throw new Error('pat: ' + kind);
  };
}

const turn = (b, iE) => { let s = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) s += b[j].c * (b[j].v || 0); return s; };
function trades(over) {
  const cfg = Object.assign({}, H4W, over);
  const r = evalCfg(cfg, { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  return r.all.map((x) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1), TOut = b[iX].t + H4, cost = t.side < 0 ? t.entry * BOR * (TOut - x.T) / 864e5 / 365 : 0;
    const ex = t.exitP + (t.side < 0 ? cost : 0);
    return { id: x.id, T: x.T, TOut, setup: t.setup, nr: (t.side * (ex - t.entry) - t.entry * FEE) / Math.abs(t.entry - t.stop0), turn: turn(b, t.iEntry), t: { side: t.side, entry: t.entry, stop0: t.stop0, exitP: ex } }; });
}
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function rep(lab, list, sub) {
  if (!list.length) { console.log(lab.padEnd(44), 'сделок нет'); return; }
  for (const x of list) x.i = -x.turn;
  const PF = FEEP / 100, pf = (z, k) => portfolio(z, 0.25, k || ((x) => x.i), PF, RISK);
  const p = pf(list), h = [list.filter((x) => x.T < SPLIT), list.filter((x) => x.T >= SPLIT)].map((z) => z.length > 1 ? pf(z).cagr : NaN);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(list.map((x) => [x, rnd()])); return pf(list, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const R = list.reduce((s, x) => s + x.nr, 0), w = list.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(44), String(list.length).padStart(5), R.toFixed(0).padStart(5), (R / list.length).toFixed(3).padStart(6), pct(w / list.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]), `| взято ${p.taken}`);
  if (sub) {   // сделки новой фигуры: R по половинам, по годам, по бумагам
    const z = list.filter(sub); if (!z.length) { console.log('   сделок фигуры нет'); return; }
    const a = (q) => q.length ? (q.reduce((s, x) => s + x.nr, 0) / q.length).toFixed(2) : '—';
    const yr = {}; for (const x of z) { const y = new Date(x.T).getUTCFullYear(); yr[y] = (yr[y] || 0) + x.nr; }
    const by = {}; for (const x of z) by[x.id] = (by[x.id] || 0) + x.nr; const ids = Object.entries(by).sort((p, q) => q[1] - p[1]), tot = ids.reduce((s, x) => s + x[1], 0);
    console.log(`   сделок фигуры ${z.length}, ср. ${a(z)}R (половины ${a(z.filter((x) => x.T < SPLIT))} / ${a(z.filter((x) => x.T >= SPLIT))}), прибыльных ${(z.filter((x) => x.nr > 0).length / z.length * 100).toFixed(0)}%; по годам R: ${Object.entries(yr).map(([y, v]) => y.slice(2) + ':' + v.toFixed(0)).join(' ')}`);
    console.log(`   бумаг ${ids.length}: в плюсе ${ids.filter((x) => x[1] > 0).length}; всего ${tot.toFixed(0)}R, топ-5 ${ids.slice(0, 5).map((x) => x[0].replace('_TQBR', '') + ' ' + x[1].toFixed(1)).join(', ')}; без топ-5 ${(tot - ids.slice(0, 5).reduce((s, x) => s + x[1], 0)).toFixed(0)}R`);
  }
}
const HDR = () => console.log('вариант'.padEnd(44), 'сделок    R   ср.R прибыльн. %/год  1пол  2пол просадка серия | случайный порядок');
const base = () => trades({});
let B = null; const baseRep = () => { B = B || base(); rep('«4 часа · неделя» сейчас', B); };
// вариант: alone — отдельный робот с правилами «4 часа · неделя»; mix — добавлено в набор «4 часа · неделя» (тот же движок, одна сделка на бумагу)
function test(lab, over, isNew, opt = {}) {
  const alone = trades(Object.assign({ setups: NONE }, over, { setups: Object.assign({}, NONE, over.setups || {}) }));
  rep(lab + ': отдельно', alone, isNew);
  if (opt.sepShort) { B = B || base(); rep(lab + ': отдельный счёт + покупки на одном', B.concat(alone), isNew); }
  if (opt.noMix) return;
  const mix = trades(Object.assign({}, over, { setups: Object.assign({}, H4W.setups, over.setups || {}) }));
  rep(lab + ': в наборе', mix, isNew);
  // контроль: если вариант меняет общие правила (не только новую фигуру) — тот же набор без фигуры с этими правилами
  const own = ['setups', 'abcKind', 'counterDiag', 'patHook', 'patFilt', 'setupCounter'], ch = Object.keys(over).filter((k) => !own.includes(k));
  if (ch.length) { const k = JSON.stringify(ch.map((x) => [x, over[x]])); CTRL[k] = CTRL[k] || trades(Object.fromEntries(ch.map((x) => [x, over[x]]))); rep('   контроль: набор без фигуры, ' + ch.join('+'), CTRL[k]); }
}
const CTRL = {};
const FIG = (process.env.FIG || 'base').split(',');
console.log(`\n4ч Мосбиржи 2018–2026, ${ser.length} рядов; половины до/после 09.08.2022; риск ${RISK * 100}%, позиция ≤ 25%, свободные деньги в фонде (~11%/год), порядок по обороту; комиссия 0,05% + 0,02%${FIG.some((f) => ['dt', 'hst'].includes(f)) ? '; шорт — плата 15%/год' : ''}`);
HDR(); baseRep();
const S5 = (x) => x.setup === 1, SA = (x) => x.setup === 2, ST = (x) => x.setup === 3, S4 = (x) => x.setup === 4, SP = (x) => x.setup === 5;
for (const f of FIG) {
  if (f === 'w5') {
    test('волна 5', { setups: { w5: true } }, S5);
    test('волна 5, без «только лучший подсчёт»', { setups: { w5: true }, topOnly: false }, S5);
    test('волна 5, без AO/SMA200', { setups: { w5: true }, addAO: false, addSma200: false }, S5);
  }
  if (f === 'zz' || f === 'flat') {
    const k = f === 'zz' ? 2 : 3, nm = f === 'zz' ? 'конец зигзага ABC' : 'конец флэта ABC';
    test(nm, { setups: { abc: true }, abcKind: k }, SA);
    test(nm + ', без «только лучший»', { setups: { abc: true }, abcKind: k, topOnly: false }, SA);
    test(nm + ', без AO/SMA200', { setups: { abc: true }, abcKind: k, addAO: false, addSma200: false }, SA);
    test(nm + ', без тренда старшей степени', { setups: { abc: true }, abcKind: k, bookTrend: false }, SA);
  }
  if (f === 'wedge') {
    test('после клина вниз (разворот)', { setupCounter: true, counterDiag: true }, S4);
    test('после клина, без тренда ст. степени', { setupCounter: true, counterDiag: true, bookTrend: false }, S4);
    test('после клина, без тренда и AO/SMA', { setupCounter: true, counterDiag: true, bookTrend: false, addAO: false, addSma200: false }, S4);
    test('после клина, без всех фильтров кроме рынка', { setupCounter: true, counterDiag: true, bookTrend: false, addAO: false, addSma200: false, topOnly: false }, S4);
  }
  if (f === 'triup') {
    test('выход из треугольника вверх', { setups: { tri: true } }, ST);
    test('треугольник вверх, без «только лучший»', { setups: { tri: true }, topOnly: false }, ST);
    test('треугольник вверх, без AO/SMA200', { setups: { tri: true }, addAO: false, addSma200: false }, ST);
    test('треугольник вверх, как робот продаж', { setups: { tri: true }, addAO: false, addSma200: false, weekExit: false, wkChan: false, wkNextOpen: false, topOnly: false, beMode: 'hint' }, ST);
  }
  const P = (kind, o, lab) => {
    for (const zz of ['main', 'sub']) for (const filt of ['all', 'mkt'])
      test(`${lab}, ${zz === 'main' ? 'осн.' : 'мл.'} зигзаг, ${filt === 'all' ? 'все фильтры' : 'только рынок'}`, { patHook: pat(kind, Object.assign({ zz }, o)), patFilt: filt }, SP, { noMix: o.side < 0 });
  };
  if (f === 'db') for (const tol of [0.5, 1]) P('db', { tol }, `двойное дно ${tol}ATR`);
  if (f === 'hs') for (const tol of [0.3, 0.6]) P('hs', { tol }, `перевёрн. голова-плечи ${tol}`);
  if (f === 'flag') for (const [pole, bars] of [[3, 12], [4, 12], [5, 18]]) P('flag', { pole, bars }, `флаг ${pole}ATR/${bars}св`);
  if (f === 'brk') for (const N of [60, 120, 250]) for (const rr of [2]) P('brk', { N, rr }, `пробой max ${N} свечей`);
  // фигуры на продажу — отдельный счёт (в набор покупок не смешиваем), плата за шорт 15%/год
  const PS = (kind, o, lab) => {
    for (const zz of ['main', 'sub']) {
      const over = { longOnly: false, shortOnly: true, patHook: pat(kind, Object.assign({ zz, side: -1 }, o)), patFilt: 'all', setups: NONE };
      test(`${lab}, ${zz === 'main' ? 'осн.' : 'мл.'} зигзаг`, over, SP, { noMix: true, sepShort: true });
    }
  };
  // устойчивость перевёрнутой «головы и плеч» на младшем зигзаге: допуск плеч, срок ожидания пробоя, комиссия; два робота на одном счёте
  if (f === 'hsrob') {
    for (const tol of [0.2, 0.3, 0.45, 0.6, 0.8]) for (const wait of [10, 30, 60]) test(`гол.-плечи мл. tol ${tol} ждать ${wait}`, { patHook: pat('hs', { zz: 'sub', tol, wait }), patFilt: 'all' }, SP, { noMix: true });
    for (const k of [0.6, 0.8]) for (const [ab, o] of [['', {}], [' без AO/SMA', { addAO: false, addSma200: false }], [' без тренда ст.', { bookTrend: false }], [' без пт-правил', { weekExit: false, wkChan: false, wkNextOpen: false }], [' без БУ', { beMode: 'hint' }]]) {
      const al = trades(Object.assign({ setups: NONE, patHook: pat('hs', { zz: 'sub', tol: 0.3 }), patFilt: 'all' }, o, { subRatio: 0.4 * k / 0.8 }));
      if (k === 0.8) rep('гол.-плечи мл. 0.3' + ab, al, SP);
    }
    for (const sr of [0.25, 0.3, 0.5, 0.6]) rep(`гол.-плечи, младший зигзаг ×${sr} (сейчас 0.4)`, trades({ setups: NONE, patHook: pat('hs', { zz: 'sub', tol: 0.3 }), patFilt: 'all', subRatio: sr }), SP);
    B = B || base(); const al = trades({ setups: NONE, patHook: pat('hs', { zz: 'sub', tol: 0.3 }), patFilt: 'all' });
    rep('два робота на одном счёте (неделя + гол.-плечи)', B.concat(al.map((x) => Object.assign({}, x, { id: x.id + '#' }))), SP);
    const d = (t) => new Date(t).toISOString().slice(0, 16);
    for (const x of al.slice(0, 6)) console.log('   пример', x.id, d(x.T), 'вход', x.t.entry.toFixed(2), 'стоп', x.t.stop0.toFixed(2), 'выход', x.t.exitP.toFixed(2), d(x.TOut), x.nr.toFixed(2) + 'R');
    const dist = al.map((x) => Math.abs(x.t.entry - x.t.stop0) / x.t.entry * 100).sort((a, b) => a - b), hold = al.map((x) => (x.TOut - x.T) / 864e5).sort((a, b) => a - b);
    console.log(`   стоп от входа: медиана ${dist[dist.length >> 1].toFixed(1)}%, удержание медиана ${hold[hold.length >> 1].toFixed(1)} дн.`);
  }
  if (f === 'dbrob') {   // устойчивость двойного дна (осн. зигзаг, все фильтры) и два робота на одном счёте
    B = B || base();
    for (const tol of [0.75, 1, 1.25, 1.5]) { const al = trades({ setups: NONE, patHook: pat('db', { zz: 'main', tol }), patFilt: 'all' }); rep(`двойное дно ${tol}ATR отдельно`, al); rep(`   два робота на одном счёте`, B.concat(al.map((x) => Object.assign({}, x, { id: x.id + '#' })))); }
  }
  if (f === 'brkrob') {   // устойчивость пробоя уровня (все фильтры) и два робота на одном счёте; годы базы для сравнения
    B = B || base(); rep('база (по годам)', B, () => true);
    for (const zz of ['main', 'sub']) for (const N of [90, 180, 250, 360, 500]) { const al = trades({ setups: NONE, patHook: pat('brk', { zz, N, rr: 2 }), patFilt: 'all' }); rep(`пробой ${N}, ${zz === 'main' ? 'осн.' : 'мл.'} зигзаг`, al, SP); rep('   два робота на одном счёте', B.concat(al.map((x) => Object.assign({}, x, { id: x.id + '#' })))); }
    for (const rr of [1.5, 3]) rep(`пробой 250, осн., цель ${rr}R`, trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N: 250, rr }), patFilt: 'all' }));
    rep('пробой 250, осн., без пт-правил', trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N: 250, rr: 2 }), patFilt: 'all', weekExit: false, wkChan: false, wkNextOpen: false }));
  }
  if (f === 'brk2') {
    B = B || base();
    for (const N of [360, 500, 750, 1000]) { const al = trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N, rr: 2 }), patFilt: 'all' }); rep(`пробой ${N}, осн. зигзаг`, al, SP); rep('   два робота на одном счёте', B.concat(al.map((x) => Object.assign({}, x, { id: x.id + '#' })))); }
    for (const N of [360, 500]) { const al = trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N, rr: 2 }), patFilt: 'all', bookTrend: false }); rep(`пробой ${N}, без тренда ст. степени`, al); }
    for (const N of [360, 500]) { const al = trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N, rr: 2 }), patFilt: 'all', addAO: false, addSma200: false }); rep(`пробой ${N}, без AO/SMA200`, al); }
  }
  if (f === 'trio') {   // три робота на одном счёте: «неделя» + голова и плечи (мл. зигзаг) + пробой 500
    B = B || base(); const tag = (z, k) => z.map((x) => Object.assign({}, x, { id: x.id + k }));
    const hs = tag(trades({ setups: NONE, patHook: pat('hs', { zz: 'sub', tol: 0.3 }), patFilt: 'all' }), '#h'), br = tag(trades({ setups: NONE, patHook: pat('brk', { zz: 'main', N: 500, rr: 2 }), patFilt: 'all' }), '#b');
    rep('голова-плечи + пробой', hs.concat(br)); rep('неделя + голова-плечи + пробой', B.concat(hs, br));
    rep('пробой вместо недели + голова-плечи', br.concat(hs));
  }
  if (f === 'dt') for (const tol of [0.5, 1]) PS('db', { tol }, `двойная вершина ${tol}ATR`);
  if (f === 'hst') for (const tol of [0.3, 0.6]) PS('hs', { tol }, `голова-плечи (вершина) ${tol}`);
}
