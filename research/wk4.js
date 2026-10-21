// Набор «4 часа · неделя» + идеи Мэрфи (21.10.2026): вход «толчком» (Даннигэн), выход по свече перелома, ближняя цель W3 = W1.
// 4ч из выгрузки приложения (VI.2024–X.2026), 65 бумаг; роботная модель, комиссия 0,05% + 0,02%; шорт — плата 15%/год.
// DIR=long|short|both node wk4.js
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const ser = S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = Date.parse('2025-08-17'), FEE = 0.0007, BOR = 0.15;
const DIR = process.env.DIR || 'long';
const H4W = { longOnly: DIR === 'long', shortOnly: DIR === 'short', swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// R сделки по ценам, с комиссией и платой за шорт
const nrOf = (sd, e, st, ex, days) => (sd * (ex - e) - e * FEE * 2 - (sd < 0 ? e * BOR * days / 365 : 0)) / Math.abs(e - st);
function trades(over) {
  const r = evalCfg(Object.assign({}, H4W, over), { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
  return r.all.map((x) => { const t = x.t, b = t._b, iE = t.iEntry, iX = Math.min(t.iExit, b.length - 1);
    return { id: x.id, sd: t.side, b, iE, iX, e: t.entry, st: t.stop0, ex: t.exitP, T: b[iE].t, TOut: b[iX].t + H4 }; });
}
// вход толчком: ждём свечу против сделки (оба экстремума против), затем вход на пробое экстремума прошлой свечи; W — сколько свечей ждём
function thrust(q, W, tight) {
  const { b, sd } = q; let down = -1;
  for (let k = q.iE; k < Math.min(b.length, q.iE + W); k++) {
    const hit = sd > 0 ? b[k].l <= q.st : b[k].h >= q.st;
    if (down < 0) { if (hit) return null; if (sd > 0 ? b[k].h < b[k - 1].h && b[k].l < b[k - 1].l : b[k].h > b[k - 1].h && b[k].l > b[k - 1].l) down = k; continue; }
    const trg = sd > 0 ? b[k].h > b[k - 1].h : b[k].l < b[k - 1].l;
    if (hit && !trg) return null;   // стоп раньше входа — отмена
    if (!trg) continue;
    const e = sd > 0 ? Math.max(b[k].o, b[k - 1].h) : Math.min(b[k].o, b[k - 1].l);
    if (k > q.iX) return null;   // сделка системы уже закончилась
    if (hit) return Object.assign({}, q, { iE: k, e, ex: q.st, iX: k, T: b[k].t, TOut: b[k].t + H4 });   // вход и стоп в одной свече — считаем убытком
    let st = q.st; if (tight) { const s2 = sd > 0 ? b[k].l : b[k].h; if (sd * (s2 - st) > 0 && sd * (e - s2) >= 0.25 * sd * (e - q.st)) st = s2; }   // стоп ближе, но не меньше ¼ прежнего риска
    let ex = q.ex, iX = q.iX;
    for (let j = k + 1; j <= q.iX; j++) if (sd > 0 ? b[j].l <= st : b[j].h >= st) { ex = sd > 0 ? Math.min(b[j].o, st) : Math.max(b[j].o, st); iX = j; break; }
    return Object.assign({}, q, { iE: k, e, st, ex, iX, T: b[k].t, TOut: b[iX].t + H4 });
  }
  return null;
}
// свеча перелома: новый экстремум сделки, а закрытие хуже прошлого закрытия; при прибыли ≥ minR — выход по закрытию ('close') или стоп за её экстремум ('stop')
function revExit(q, minR, mode) {
  const { b, sd } = q, risk = Math.abs(q.e - q.st); let best = sd > 0 ? b[q.iE].h : b[q.iE].l, stR = null;
  for (let i = q.iE + 1; i < q.iX; i++) {
    if (stR != null && (sd > 0 ? b[i].l <= stR : b[i].h >= stR)) { const ex = sd > 0 ? Math.min(b[i].o, stR) : Math.max(b[i].o, stR); return Object.assign({}, q, { ex, iX: i, TOut: b[i].t + H4 }); }
    const nx = sd > 0 ? b[i].h > best : b[i].l < best, rev = nx && sd * (b[i].c - b[i - 1].c) < 0 && sd * (b[i].c - q.e) / risk >= minR;
    if (sd > 0) best = Math.max(best, b[i].h); else best = Math.min(best, b[i].l);
    if (!rev) continue;
    if (mode === 'close') return Object.assign({}, q, { ex: b[i].c, iX: i, TOut: b[i].t + H4 });
    const s2 = sd > 0 ? b[i].l : b[i].h; if (stR == null || sd * (s2 - stR) > 0) stR = s2;
  }
  return q;
}
function report(lab, list) {
  const all = list.filter(Boolean).map((q, i) => ({ id: q.id, i, T: q.T, TOut: q.TOut, nr: nrOf(q.sd, q.e, q.st, q.ex, (q.TOut - q.T) / 864e5),
    t: { side: q.sd, entry: q.e, stop0: q.st, exitP: q.sd < 0 ? q.ex + q.e * BOR * (q.TOut - q.T) / 864e5 / 365 : q.ex } }));
  const p = portfolio(all, 0.25, (x) => x.i, 0.0005), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, 0.0005).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), 0.0005).cagr; }).sort((a, b) => a - b);
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length, L = all.filter((x) => x.t.side > 0), Sh = all.filter((x) => x.t.side < 0);
  const avg = (z) => z.length ? (z.reduce((s, x) => s + x.nr, 0) / z.length).toFixed(2) : '—';
  console.log(lab.padEnd(36), String(all.length).padStart(5), R.toFixed(0).padStart(5), (R / all.length).toFixed(2).padStart(6), pct(w / all.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]), DIR === 'both' ? `| пок ${L.length} ${avg(L)}R, прод ${Sh.length} ${avg(Sh)}R` : '');
}
const base = trades({}), near = trades({ targetMode: 'near' });
console.log(`\n«4 часа · неделя», ${({ long: 'только покупки', short: 'только продажи (плата за шорт 15%/год)', both: 'покупки и продажи' })[DIR]}; 4ч VI.2024–X.2026, половины до/после 17.08.2025`);
console.log('вариант'.padEnd(36), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия | порядок');
report('как сейчас', base);
report('ближняя цель W3 = W1', near);
// фонд денежного рынка без сделок за тот же период (как в portfolio)
{ const RATE = { 2024: 0.173, 2025: 0.183, 2026: 0.143 }; let eq = 1; const t0 = Math.min(...base.map((q) => q.T)), t1 = Math.max(...base.map((q) => q.T));
  for (let t = t0; t < t1; t += 864e5) eq *= 1 + (RATE[new Date(t).getUTCFullYear()] || 0.1) / 365.25; console.log('только фонд, без сделок'.padEnd(36), ''.padEnd(32), pct(Math.pow(eq, 1 / ((t1 - t0) / 31557600000)) - 1)); }
for (const W of [6, 12]) { const tk = base.map((q) => thrust(q, W, false)), nr = (q) => nrOf(q.sd, q.e, q.st, q.ex, (q.TOut - q.T) / 864e5);
  const off = base.filter((q, i) => !tk[i]), on = base.filter((q, i) => tk[i]); console.log(`  толчок ${W}: отсеяно ${off.length}, их R при обычном входе ${(off.reduce((s, q) => s + nr(q), 0) / off.length).toFixed(2)} на сделку; оставшиеся при обычном входе ${(on.reduce((s, q) => s + nr(q), 0) / on.length).toFixed(2)}`); }
for (const W of [3, 6, 9, 12]) { report(`толчок, ждать ${W} св., стоп прежний`, base.map((q) => thrust(q, W, false))); report(`толчок, ждать ${W} св., стоп под свечой входа`, base.map((q) => thrust(q, W, true))); }
for (const m of [0.5, 1, 2]) { report(`свеча перелома ≥${m}R → выход`, base.map((q) => revExit(q, m, 'close'))); report(`свеча перелома ≥${m}R → стоп за неё`, base.map((q) => revExit(q, m, 'stop'))); }
report('толчок 12 + перелом ≥1R стоп', base.map((q) => thrust(q, 12, false)).map((q) => q && revExit(q, 1, 'stop')));
report('ближняя цель + толчок 12', near.map((q) => thrust(q, 12, false)));
