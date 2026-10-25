// «4 часа · неделя»: пятничный выход по каналу (ТЗ 24.10.2026, п. 5.9). Сейчас (B0) в пятницу закрывается всякая сделка без прибыли;
// кандидат — убыточную закрывать, только если закрытие ниже нижней линии канала её подсчёта, иначе перенести на неделю со своим стопом.
// Правило — в копии движка в памяти (engine2.js не меняется). Подсчёт и линии — по точкам зигзага, известным к этой свече.
// MOEX=1 V=b0,b1,base,book,w2 FEE=0.05 node fri_chan.js  (V — какие группы вариантов считать; FEE — комиссия на сторону, %)
const Module = require('module'), path = require('path');
const ENG = path.resolve(__dirname, '../android/assets/engine2.js');
const comp = Module.prototype._compile;
Module.prototype._compile = function (src, file) {
  if (path.resolve(file) === ENG) {
    const from = 'else { px = C[i]; reason = 4; }';
    if (src.split(from).length !== 2) throw new Error('fri_chan: не нашёл пятничный выход в engine2.js');
    // хук: 'close' — как сейчас, 'next' — выход по открытию следующей свечи (через phaseExit, причина 5), 'carry' — перенести
    src = src.replace(from, "else { const h = c.wkHook ? c.wkHook.call(this, cur, i, mp) : 'close'; if (h === 'close') { px = C[i]; reason = 4; } else if (h === 'next') { phaseExit = true; cur.wkNext = true; } }");
    // дневной фильтр удержания (DAYH): дневка против сделки — выход по открытию следующей свечи, прибыльная или нет
    const hp = 'if (cur.side * (C[i] - be) > 0) { cur.wkCarry';
    if (src.split(hp).length !== 2) throw new Error('fri_chan: не нашёл пятничный перенос в engine2.js');
    src = src.replace(hp, 'if (c.wkHold && !c.wkHold.call(this, cur, i, mp, tr[i])) { phaseExit = true; cur.wkNext = true; cur.wkDay = true; } else ' + hp);
    // фильтр «ясного подсчёта» в выборе сигнала (как в clarity.js), включается CLAR=top|gap5|k2
    const sg = 'this.aoOK(pl.side, i)) { sig = pl;';
    if (src.split(sg).length !== 2) throw new Error('fri_chan: не нашёл выбор сигнала в engine2.js');
    src = src.replace(sg, 'this.aoOK(pl.side, i) && (!c.clarHook || c.clarHook.call(this, s, sc, pl, i))) { sig = pl;');
  }
  return comp.call(this, src, file);
};
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const E = S.E;
// оценка подсчёта сигнала (для revisit.js): по (время начала фигуры, стоп)
const SC = new Map(), mp0 = E.Ctx.prototype.makePlan;
E.Ctx.prototype.makePlan = function (s, entry) { const pl = mp0.call(this, s, entry); if (pl) SC.set(this.T[s.idx[0]] + '|' + pl.stop, pl.score); return pl; };
module.exports.SC = SC;
const MOEX = !!process.env.MOEX;
const ser = MOEX ? require('./moex4h.js').series(S) : S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = MOEX ? Date.UTC(2022, 7, 9) : Date.parse('2025-08-17');
const FEEP = +(process.env.FEE || 0.05), SLIPP = +(process.env.SLIP || 0.02), FEE = (FEEP + SLIPP) / 100;
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: +(process.env.BEATR || 3), setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: FEEP, slipPct: SLIPP };   // BEATR — безубыток после k×ATR
const CLAR = process.env.CLAR;
if (CLAR) {   // куда ведёт подсчёт: незавершённая фигура — по направлению, завершённая — против, незавершённый треугольник — никуда
  const done = (x) => (x.fam === 0 && x.n === 6) || (x.fam === 1 && x.n === 4) || (x.fam === 2 && x.n === 6), imp = (x) => done(x) ? -x.dir : x.fam === 2 ? 0 : x.dir;
  H4W.clarHook = function (s, sc, pl) {
    const ms = this.cfg.minScore;
    if (CLAR === 'top') return sc[0] === s;
    if (CLAR.startsWith('k')) return sc.filter((x) => x.score >= ms).slice(0, +CLAR.slice(1)).every((x) => imp(x) !== -pl.side);
    const opp = sc.filter((x) => x !== s && x.score >= ms && imp(x) === -pl.side);
    return !opp.length || opp[0].score <= s.score - +CLAR.slice(3);
  };
}
// объём (Пректер, гл. 2): VOL=w2lo:k — средний объём волны 2 ≤ k × волны 1; up:m — после конца волны 2 объём ≥ m × волны 2;
// sig:m — объём сигнальной свечи ≥ m × средней за 20 свечей. Только для входа в волну 3, вдобавок к CLAR
const VOL = process.env.VOL;
if (VOL) {
  const [vk, vm] = VOL.split(':'), m = +vm, prev = H4W.clarHook;
  H4W.clarOnly = prev;   // для TAG: база — с CLAR, без VOL
  const avg = (V, a, b) => { let s = 0, n = 0; for (let j = Math.max(0, a); j <= b; j++) { s += V[j]; n++; } return n ? s / n : 0; };
  H4W.clarHook = function (s, sc, pl, i) {
    if (prev && !prev.call(this, s, sc, pl, i)) return false;
    if (s.fam !== 0 || s.n !== 3) return true;
    const V = this.V, x = s.idx, v1 = avg(V, x[0] + 1, x[1]), v2 = avg(V, x[1] + 1, x[2]);
    if (!(v1 > 0 && v2 > 0)) return true;   // объёма нет — не фильтруем
    if (vk === 'w2lo') return v2 <= m * v1;
    if (vk === 'up') return avg(V, x[2] + 1, i) >= m * v2;
    if (vk === 'sig') return V[i] >= m * avg(V, i - 20, i - 1);
    throw new Error('VOL: ' + VOL);
  };
}
// дневка как старшая степень (ТЗ B10): DAYE=nb — вход, если дневной подсчёт не медвежий, bull — если бычий; DAYH=0|1 — в пятницу выход по открытию
// следующей свечи, если дневка против сделки (1 — два дневных закрытия подряд). Дневки — из тех же часовиков Мосбиржи; подсчёт — лучший сценарий
// по точкам зигзага на закрытии каждого дня, к 4ч свече — последний день, закрытый не позже её закрытия
const DAYE = process.env.DAYE, DAYH = process.env.DAYH, DAY = new Map(); let CUR = null;
if (DAYE || DAYH) {
  const done = (x) => (x.fam === 0 && x.n === 6) || (x.fam === 1 && x.n === 4) || (x.fam === 2 && x.n === 6), imp = (x) => done(x) ? -x.dir : x.fam === 2 ? 0 : x.dir;
  for (const sd of require('./moex4h.js').series(S, { ms: 864e5, tf: '1d' })) {
    const cfg = E.merge({}), ctx = new E.Ctx(sd.bars, cfg), z = E.zzInit(E.autoSwing(sd.bars, 1) / 100), mp = [], a = DAY.get(sd.id) || [];
    let d = 0;
    for (let i = 0; i < sd.bars.length; i++) { if (E.zzPush(z, i, ctx.H, ctx.L, mp)) { const t = ctx.buildScenarios(mp)[0]; d = t && t.score >= cfg.minScore ? imp(t) : 0; } a.push({ k: sd.bars[i].t + 864e5, d }); }
    DAY.set(sd.id, a);
  }
  const all = [...DAY.values()].flat(); console.log(`дневной подсчёт: бычий ${(all.filter((x) => x.d > 0).length / all.length * 100).toFixed(0)}% дней, медвежий ${(all.filter((x) => x.d < 0).length / all.length * 100).toFixed(0)}%, нейтральный ${(all.filter((x) => !x.d).length / all.length * 100).toFixed(0)}%`);
}
function dayAt(id, q, back) { const a = DAY.get(id); if (!a) return 0; let lo = 0, hi = a.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m].k <= q) { r = m; lo = m + 1; } else hi = m - 1; } return r - back >= 0 ? a[r - back].d : 0; }
if (DAYE) { const prev = H4W.clarHook; H4W.clarHook = function (s, sc, pl, i) { if (prev && !prev.call(this, s, sc, pl, i)) return false; const d = dayAt(CUR, this.T[i] + 4 * 3600e3, 0); return DAYE === 'bull' ? d === pl.side : d !== -pl.side; }; }
// пятничные признаки разворота (ТЗ B5–B8): FRI=flip3|senior|seniorOpp|hiCount|low|mkt200|mkt200x2|mkt50|mkt50x2|br40|br50|2of3 (через запятую — любой из них);
// сработал — выход по открытию следующей свечи (и прибыльной, и убыточной). Всё — по данным, известным к закрытию пятничной свечи
const FRI = process.env.FRI ? process.env.FRI.split(',') : null;
let BR = null;   // ширина рынка: доля бумаг выше своей средней за 50 свечей, по времени свечи
if (FRI && FRI.some((x) => x.startsWith('br'))) {
  const acc = new Map();
  for (const sr of ser) { let sm = 0; const C = sr.bars.map((b) => b.c); for (let k = 0; k < C.length; k++) { sm += C[k]; if (k >= 50) sm -= C[k - 50]; if (k >= 49) { const a = acc.get(sr.bars[k].t) || [0, 0]; a[0] += C[k] > sm / 50 ? 1 : 0; a[1]++; acc.set(sr.bars[k].t, a); } } }
  BR = new Map([...acc].filter(([, a]) => a[1] >= 20).map(([t, a]) => [t, a[0] / a[1]]));
}
if (FRI) {
  const done = (x) => (x.fam === 0 && x.n === 6) || (x.fam === 1 && x.n === 4) || (x.fam === 2 && x.n === 6), imp = (x) => done(x) ? -x.dir : x.fam === 2 ? 0 : x.dir;
  const test = {
    flip3(cur, i, mp) { const t = this.buildScenarios(mp)[0]; return t && t.score >= this.cfg.minScore && t.fam === 0 && t.dir === -cur.side && t.n >= 3; },
    senior(cur, i, mp, tr) { return tr !== cur.side; },
    seniorOpp(cur, i, mp, tr) { return tr === -cur.side; },
    hiCount(cur, i) { const hp = (this.hiPivots || []).filter((p) => p.c < i); const t = hp.length >= 2 && this.buildScenarios(hp)[0]; return !!t && t.score >= this.cfg.minScore && imp(t) === -cur.side; },
    low(cur, i, mp) { for (let k = mp.length - 1; k >= 0; k--) if (mp[k].t === -cur.side) return cur.side * (this.C[i] - mp[k].p) < 0; return false; },
    mkt200(cur, i) { return !this.marketOK(cur.side, this.T[i]); },
    mkt200x2(cur, i) { return i > 0 && !this.marketOK(cur.side, this.T[i]) && !this.marketOK(cur.side, this.T[i - 1]); },
    mkt50(cur, i) { return this.mkt50(this.T[i]) === -cur.side; },
    mkt50x2(cur, i) { return i > 0 && this.mkt50(this.T[i]) === -cur.side && this.mkt50(this.T[i - 1]) === -cur.side; },
    br40(cur, i) { const b = BR.get(this.T[i]); return b != null && (cur.side > 0 ? b < 0.4 : b > 0.6); },
    br50(cur, i) { const b = BR.get(this.T[i]); return b != null && (cur.side > 0 ? b < 0.5 : b > 0.5); },
    '2of3'(cur, i, mp, tr) {   // структура (ранний встречный импульс или старший тренд не с нами), опора (минимум или канал «book»), рынок
      const st = test.flip3.call(this, cur, i, mp) || tr !== cur.side;
      const s0 = this.buildScenarios(mp).find((x) => x.fam === 0 && x.dir === cur.side && x.idx[0] === cur.i0), fl = s0 && lineFn(s0, 'book');
      const sp = test.low.call(this, cur, i, mp) || (!!fl && cur.side * (this.C[i] - fl(i)) < 0);
      return st + sp + test.mkt200.call(this, cur, i) >= 2;
    },
  };
  for (const k of FRI) if (!test[k]) throw new Error('FRI: ' + k);
  H4W.wkHold = function (cur, i, mp, tr) { return !FRI.some((k) => test[k].call(this, cur, i, mp, tr)); };
}
if (DAYH) H4W.wkHold = function (cur, i) { const q = this.T[i] + 4 * 3600e3, bad = (b) => dayAt(CUR, q, b) === -cur.side; return !(bad(0) && (DAYH === '0' || bad(1))); };
if (process.env.EXTRA) Object.assign(H4W, JSON.parse(process.env.EXTRA));   // опции движка напрямую, напр. EXTRA='{"wkChan":true}'
const pct = (v) => (v * 100).toFixed(1).padStart(5);
const PF = (FEEP + SLIPP - 0.02) / 100;   // в portfolio проскальзывание 0,02% уже заложено — лишнее добавляем к комиссии

// нижняя линия канала подсчёта сделки на свече j: 'w2' — минимум волны 2; 'base' — линия 0–2; 'book' — 0–2, пока идёт волна 3,
// потом как в книге: параллель через 2 к линии 1–3 (идёт волна 4), линия 2–4 (идёт волна 5)
function lineFn(s, kind) {
  if (s.n < 3) return null;
  if (kind === 'w2') return () => s.px[2];
  const base = (j) => E.lineAt(s.idx[0], s.px[0], s.idx[2], s.px[2], j);
  if (kind === 'base' || s.n === 3) return base;
  const L = E.channelLines(s), l = s.n === 4 ? L[1] : L[0];
  return l ? (j) => E.lineAt(l.i1, l.p1, l.i2, l.p2, j) : base;
}
// v: { line: 'none' (B0) | 'all' (переносить все убыточные) | 'w2' | 'base' | 'book', buf (в ATR), week (пробой на любой свече недели), exec: 'close' | 'next' }
function hook(v) {
  return function (cur, i, mp) {
    if (v.line === 'none') return v.exec || 'close';
    let go = 'carry';
    if (v.line !== 'all') {
      const s = this.buildScenarios(mp).find((x) => x.fam === 0 && x.dir === cur.side && x.idx[0] === cur.i0), f = s && lineFn(s, v.line);
      if (!f) { cur.wkNoCnt = (cur.wkNoCnt || 0) + 1; return v.exec; }   // подсчёта сделки уже нет — закрываем, как сейчас
      const a = this.atr(), C = this.C;
      let j0 = i; if (v.week) while (j0 > cur.iEntry && !this.weekEnd(j0 - 1)) j0--;
      for (let j = j0; j <= i; j++) if (cur.side * (C[j] - f(j)) < -v.buf * a[j]) { go = v.exec; break; }
    }
    if (go === 'carry') cur.wkLoss = (cur.wkLoss || 0) + 1;
    return go;
  };
}
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const nrOf = (sd, e, st, ex) => (sd * (ex - e) - e * FEE * 2) / Math.abs(e - st);
function run(lab, over, v) {
  const t0 = Date.now();
  const r = evalCfg(Object.assign({}, H4W, over, v ? { wkHook: hook(v) } : {}), { ser, mkt, sw: (s) => { CUR = s.id; return 0; }, tr: (t, bars) => { t._b = bars; return t.NR; } });
  const all = r.all.map((x, i) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1);
    return { id: x.id, i, T: b[t.iEntry].t, TOut: b[iX].t + H4, nr: nrOf(t.side, t.entry, t.stop0, t.exitP), tr: t, t: { side: t.side, entry: t.entry, stop0: t.stop0, exitP: t.exitP } }; });
  const p = portfolio(all, 0.25, (x) => x.i, PF), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, PF).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), PF).cagr; }).sort((a, b) => a - b);
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length;
  const car = all.filter((x) => x.tr.wkLoss), fri = all.filter((x) => x.tr.reason === 4 || x.tr.wkNext), nc = all.filter((x) => x.tr.wkNoCnt).length;
  const avg = (z) => z.length ? (z.reduce((s, x) => s + x.nr, 0) / z.length).toFixed(2) : '  —';
  console.log(lab.padEnd(34), String(all.length).padStart(5), R.toFixed(0).padStart(5), (R / all.length).toFixed(3).padStart(6), pct(w / all.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]),
    '| пятн.выход', String(fri.length).padStart(4), avg(fri).padStart(6), '| перенос убыт.', String(car.length).padStart(4), avg(car).padStart(6), nc ? '| нет подсчёта ' + nc : '', all.some((x) => x.tr.wkDay) ? '| выход по дневке ' + all.filter((x) => x.tr.wkDay).length + ' ср. ' + avg(all.filter((x) => x.tr.wkDay)) : '', `(${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  return all;
}
console.log(`\n«4 часа · неделя», покупки; ${MOEX ? '4ч Мосбиржи 2018–2026, половины до/после 09.08.2022' : '4ч VI.2024–X.2026, половины до/после 17.08.2025'}; комиссия ${FEEP}% + ${SLIPP}%`);
console.log('вариант'.padEnd(34), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия | порядок        | пятничных выходов: число, ср.R | перенесено убыточных: сделок, ср.R');
const G = (process.env.V || 'b0,b1,base').split(',');
if (G.includes('b0')) run('B0 сейчас', {});
if (G.includes('b0n')) run('B0, но выход по открытию пн', {}, { line: 'none', exec: 'next' });
if (G.includes('b1')) run('B1 без пятничного выхода', { weekExit: false });
// кандидат с подробностями: CAND=book,0,1,next (линия, запас ATR, неделя 0/1, исполнение)
if (process.env.CAND) { const [line, buf, week, exec] = process.env.CAND.split(','); module.exports.cand = run('кандидат ' + process.env.CAND, {}, { line, buf: +buf, week: week === '1', exec }); }
if (G.includes('all')) run('убыточные переносить все', {}, { line: 'all' });
for (const kind of ['w2', 'base', 'book']) if (G.includes(kind))
  for (const week of [false, true]) for (const buf of [0, 0.1, 0.25, 0.5]) for (const exec of ['close', 'next'])
    run(`${kind} ${week ? 'неделя' : 'пятн.'} ${buf}ATR ${exec === 'close' ? 'закр.пт' : 'откр.пн'}`, {}, { line: kind, buf, week, exec });
// подробности кандидата против B0 (DETAIL=1 вместе с CAND): годы, бумаги, сделки, где решение поменялось, гэпы после переноса убыточных
if (process.env.DETAIL && module.exports.cand) {
  const A = process.env.BASEN ? run('B0 выход пн (для сравнения)', {}, { line: 'none', exec: 'next' }) : run('B0 сейчас (для сравнения)', {}), B = module.exports.cand, d = (t) => new Date(t).toISOString().slice(0, 10);
  const yr = (z) => { const o = {}; for (const x of z) { const y = new Date(x.T).getUTCFullYear(); o[y] = (o[y] || 0) + x.nr; } return o; };
  const ya = yr(A), yb = yr(B);
  console.log('\nR по годам (сейчас → кандидат):', Object.keys(ya).map((y) => `${y}: ${ya[y].toFixed(0)}→${(yb[y] || 0).toFixed(0)}`).join('  '));
  const by = (z) => { const o = {}; for (const x of z) o[x.id] = (o[x.id] || 0) + x.nr; return o; };
  const ba = by(A), bb = by(B), ids = [...new Set([...Object.keys(ba), ...Object.keys(bb)])].map((id) => [id, (bb[id] || 0) - (ba[id] || 0)]).sort((a, b) => b[1] - a[1]);
  const tot = ids.reduce((s, x) => s + x[1], 0), better = ids.filter((x) => x[1] > 0.5).length, worse = ids.filter((x) => x[1] < -0.5).length;
  console.log(`по бумагам: разница ${tot.toFixed(0)}R; лучше ${better}, хуже ${worse}, без разницы ${ids.length - better - worse}; топ-5 вклада: ${ids.slice(0, 5).map((x) => x[0].replace('_TQBR', '') + ' +' + x[1].toFixed(1)).join(', ')}; без топ-5: ${(tot - ids.slice(0, 5).reduce((s, x) => s + x[1], 0)).toFixed(0)}R; худшие: ${ids.slice(-3).map((x) => x[0].replace('_TQBR', '') + ' ' + x[1].toFixed(1)).join(', ')}`);
  // гэп после переноса убыточной: стоп сработал на открытии первой свечи новой недели ниже стопа
  const car = B.filter((x) => x.tr.wkLoss), gap = car.filter((x) => { const t = x.tr, b = t._b; return t.reason === 0 && b[t.iExit].o < t.stop && t.iExit > 0 && new Date(b[t.iExit].t).getUTCDay() !== new Date(b[t.iExit - 1].t).getUTCDay(); });
  const loss = gap.map((x) => x.nr).sort((a, b) => a - b);
  console.log(`перенесено убыточных: ${car.length} (ср. ${(car.reduce((s, x) => s + x.nr, 0) / car.length).toFixed(2)}R, в плюсе ${car.filter((x) => x.nr > 0).length}); из них стоп с разрывом на открытии нового дня: ${gap.length}, R: среднее ${(loss.reduce((s, v) => s + v, 0) / (loss.length || 1)).toFixed(2)}, худшие ${loss.slice(0, 5).map((v) => v.toFixed(2)).join(' ')}`);
  // сделки с тем же входом, где выход поменялся
  const key = (x) => x.id + '|' + x.T, mA = new Map(A.map((x) => [key(x), x])), RN = { 0: 'стоп', 1: 'цель', 4: 'пятница', 5: 'пн откр.', 6: 'смена подсчёта', 7: 'бегунок', 8: 'безубыток' };
  const ch = B.filter((x) => mA.has(key(x)) && Math.abs(mA.get(key(x)).tr.exitP - x.tr.exitP) > 1e-9);
  const dR = ch.map((x) => x.nr - mA.get(key(x)).nr);
  console.log(`\nсделки с тем же входом, где поменялся выход: ${ch.length}; кандидат лучше в ${dR.filter((v) => v > 0).length}, хуже в ${dR.filter((v) => v < 0).length}; сумма ${dR.reduce((s, v) => s + v, 0).toFixed(0)}R`);
  const show = ch.map((x, k) => [x, dR[k]]).sort((a, b) => a[0].T - b[0].T), pick = [...show.filter((z) => z[1] > 0).slice(0, 15), ...show.filter((z) => z[1] < 0).slice(0, 15)];
  console.log('бумага   вход        | сейчас: выход, причина, R | кандидат: выход, причина, R, переносов убыточной');
  for (const [x, dv] of pick) { const a = mA.get(key(x)), ta = a.tr, tb = x.tr;
    console.log(x.id.replace('_TQBR', '').padEnd(6), d(x.T), '|', d(ta._b[Math.min(ta.iExit, ta._b.length - 1)].t), (RN[ta.reason] || ta.reason).padEnd(14), a.nr.toFixed(2).padStart(6), '|', d(tb._b[Math.min(tb.iExit, tb._b.length - 1)].t), (RN[tb.reason] || tb.reason).padEnd(14), x.nr.toFixed(2).padStart(6), tb.wkLoss || 0, dv > 0 ? 'лучше' : 'хуже'); }
}
// канал только для «своих» бумаг (идея Егора 25.10): бумаги выбираем по одной половине истории (где канал дал больше R, чем выход в пн),
// проверяем на другой: у выбранных — канал + выход в пн, у остальных — только выход в пн. MIX=1 CAND=book,0,1,next
if (process.env.MIX && module.exports.cand) {
  const A = run('выход в пн у всех', {}, { line: 'none', exec: 'next' }), B = module.exports.cand;
  const half = (z, h) => z.filter((x) => (x.T < SPLIT) === (h === 0));
  const byId = (z) => { const o = {}; for (const x of z) o[x.id] = (o[x.id] || 0) + x.nr; return o; };
  const cg = (z) => portfolio(z.map((x, i) => Object.assign({}, x, { i })), 0.25, (x) => x.i, PF);
  for (const [pickH, testH] of [[0, 1], [1, 0]]) {
    const a = byId(half(A, pickH)), b = byId(half(B, pickH)), ids = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const diff = ids.map((id) => [id, (b[id] || 0) - (a[id] || 0)]).sort((p, q) => q[1] - p[1]);
    for (const [lab, sel] of [['лучшие 5', new Set(diff.slice(0, 5).map((x) => x[0]))], ['все, где канал в плюсе', new Set(diff.filter((x) => x[1] > 0).map((x) => x[0]))]]) {
      const tA = half(A, testH), tB = half(B, testH), mix = [...tA.filter((x) => !sel.has(x.id)), ...tB.filter((x) => sel.has(x.id))].sort((p, q) => p.T - q.T);
      const rS = (z) => z.filter((x) => sel.has(x.id)).reduce((s, x) => s + x.nr, 0);
      console.log(`выбор по ${pickH ? 'второй' : 'первой'} половине, проверка на ${testH ? 'второй' : 'первой'}: ${lab} (${sel.size} бумаг: ${[...sel].slice(0, 5).map((s) => s.replace('_TQBR', '')).join(', ')}${sel.size > 5 ? '…' : ''}) — у выбранных канал ${rS(tB).toFixed(1)}R против ${rS(tA).toFixed(1)}R; %/год: пн у всех ${pct(cg(tA).cagr)}, канал у всех ${pct(cg(tB).cagr)}, смесь ${pct(cg(mix).cagr)}; просадка ${pct(cg(tA).mdd)} / ${pct(cg(tB).mdd)} / ${pct(cg(mix).mdd)}`);
    }
  }
}
// «сильный сигнал» (подсветка, не фильтр): TAG=1 VOL=up:1.25 [CLAR=top CAND=…] — сделки базы, которые проходят VOL, против остальных
if (process.env.TAG) {
  const vh = H4W.clarHook; if (H4W.clarOnly) H4W.clarHook = H4W.clarOnly; else delete H4W.clarHook;   // база — с CLAR, без VOL
  const v = process.env.CAND ? (([line, buf, week, exec]) => ({ line, buf: +buf, week: week === '1', exec }))(process.env.CAND.split(',')) : null;
  const base = run('база', {}, v);
  const tagged = run('сильные (' + VOL + ')', { clarHook: vh }, v), key = (x) => x.id + '|' + x.T, k = new Set(tagged.map(key));
  const st = (z, lab) => { const n = z.length, R = z.reduce((s, x) => s + x.nr, 0), w = z.filter((x) => x.nr > 0).length; return `${lab} ${String(n).padStart(4)} сд., ср. ${(R / (n || 1)).toFixed(3)}R, прибыльных ${(w / (n || 1) * 100).toFixed(0)}%`; };
  const yes = base.filter((x) => k.has(key(x))), no = base.filter((x) => !k.has(key(x)));
  for (const [lab, f] of [['вся история', () => true], ['1-я половина', (x) => x.T < SPLIT], ['2-я половина', (x) => x.T >= SPLIT]])
    console.log(lab.padEnd(13), '|', st(yes.filter(f), 'сильные'), '|', st(no.filter(f), 'остальные'));
  const yr = {}; for (const x of base) { const y = new Date(x.T).getUTCFullYear(), t = k.has(key(x)) ? 0 : 1; yr[y] = yr[y] || [[0, 0], [0, 0]]; yr[y][t][0] += x.nr; yr[y][t][1]++; }
  console.log('по годам ср.R сильные/остальные:', Object.entries(yr).map(([y, a]) => `${y}: ${(a[0][0] / (a[0][1] || 1)).toFixed(2)}/${(a[1][0] / (a[1][1] || 1)).toFixed(2)}`).join('  '));
  const ids = [...new Set(base.map((x) => x.id))].map((id) => { const a = yes.filter((x) => x.id === id), b = no.filter((x) => x.id === id); return a.length && b.length ? a.reduce((s, x) => s + x.nr, 0) / a.length - b.reduce((s, x) => s + x.nr, 0) / b.length : null; }).filter((d) => d != null);
  console.log(`по бумагам: у ${ids.filter((d) => d > 0).length} из ${ids.length} бумаг сильные в среднем лучше остальных`);
}
// уменьшение позиции вместо выхода (ТЗ B9): HALF=1 FRI=… — у сделок с тем же входом половина ведётся без правила FRI, половина — с ним
// (две позиции по полрисика: стоп для расчёта размера — вдвое дальше); сделки, которые есть только в одном прогоне, — целиком
if (process.env.HALF && FRI) {
  const keep = H4W.wkHold; delete H4W.wkHold; const v = process.env.CAND ? (([line, buf, week, exec]) => ({ line, buf: +buf, week: week === '1', exec }))(process.env.CAND.split(',')) : null;
  const A = run('без правила', {}, v); H4W.wkHold = keep; const B = run('с правилом ' + FRI, {}, v);
  const key = (x) => x.id + '|' + x.T, mB = new Map(B.map((x) => [key(x), x])), half = (x) => Object.assign({}, x, { nr: x.nr / 2, t: Object.assign({}, x.t, { stop0: x.t.entry - 2 * (x.t.entry - x.t.stop0) }) });
  const mixed = [];
  for (const a of A) { const b = mB.get(key(a)); if (!b) { mixed.push(a); continue; } mB.delete(key(a)); if (b.t.exitP === a.t.exitP && b.TOut === a.TOut) mixed.push(a); else mixed.push(half(a), half(b)); }
  mixed.push(...mB.values()); mixed.sort((p, q) => p.T - q.T); mixed.forEach((x, i) => { x.i = i; });
  const p = portfolio(mixed, 0.25, (x) => x.i, PF), h = [mixed.filter((x) => x.T < SPLIT), mixed.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, PF).cagr);
  console.log(`половина по правилу ${FRI}: R ${mixed.reduce((s, x) => s + x.nr, 0).toFixed(0)}, %/год ${pct(p.cagr)}, половины ${pct(h[0])} / ${pct(h[1])}, просадка ${pct(p.mdd)}%, серия ${p.st}`);
}
