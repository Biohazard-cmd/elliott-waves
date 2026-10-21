// «4 часа · неделя»: когда входить после сигнала (21.10.2026). Сейчас — по открытию свечи после сигнальной.
// Варианты: по закрытию сигнальной свечи (если это не последняя свеча дня — вечером закрытие уже не купить), через 1 и 2 свечи, по закрытию свечи входа.
// MOEX=1 — 4ч Мосбиржи 2018–2026; DIR=long|short; роботная модель, комиссия 0,05%+0,02%
const S = require('./store.js');
const { evalCfg } = require('./strat.js');
const { portfolio } = require('./maxpos_add.js');
const MOEX = !!process.env.MOEX, DIR = process.env.DIR || 'long';
const ser = MOEX ? require('./moex4h.js').series(S) : S.series.filter((s) => s.tf === '4h'), mkt = S.D.buildMarket('4h', 200);
const H4 = 4 * 3600e3, SPLIT = MOEX ? Date.UTC(2022, 7, 9) : Date.parse('2025-08-17'), FEE = 0.0007, BOR = 0.15;
const H4W = { longOnly: DIR === 'long', shortOnly: DIR === 'short', swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  beMode: 'auto', beRule: 'atr', beAtr: 3, setups: { w3: true, w5: false, abc: false, tri: false }, weekExit: true, feePct: 0.05 };
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const nrOf = (sd, e, st, ex, days) => (sd * (ex - e) - e * FEE * 2 - (sd < 0 ? e * BOR * days / 365 : 0)) / Math.abs(e - st);
const r = evalCfg(H4W, { ser, mkt, tr: (t, bars) => { t._b = bars; return t.NR; } });
const base = r.all.map((x) => { const t = x.t, b = t._b, iE = t.iEntry, iX = Math.min(t.iExit, b.length - 1);
  return { id: x.id, sd: t.side, b, iE, iX, e: t.entry, st: t.stop0, ex: t.exitP, T: b[iE].t, TOut: b[iX].t + H4 }; });
let gapN = 0, gapSum = 0, eveN = 0;
// вход раньше: по закрытию сигнальной свечи
function atSigClose(q) {
  const { b, sd } = q, s = q.iE - 1; if (s < 0) return q;
  if (b[q.iE].t - b[s].t > 5 * 3600e3) { eveN++; return q; }   // сигнальная — последняя свеча дня: закрытие не купить, остаётся утреннее открытие
  const e = b[s].c; if (sd * (e - q.st) <= 0) return null;
  // разрыв на открытии следующей свечи за стопом — стоп по открытию
  if (sd > 0 ? b[q.iE].o <= q.st : b[q.iE].o >= q.st) return Object.assign({}, q, { e, ex: b[q.iE].o, iX: q.iE, TOut: b[q.iE].t + H4 });
  return Object.assign({}, q, { e, T: b[s].t + H4 });
}
// вход позже: по открытию свечи iE+d (или по закрытию свечи входа, close=true); стоп раньше входа или сделка уже закрыта — отмена
function later(q, d, close) {
  const { b, sd } = q, k = q.iE + d; if (k >= b.length) return null;
  for (let j = q.iE; j < k + (close ? 1 : 0); j++) if (sd > 0 ? b[j].l <= q.st : b[j].h >= q.st) return null;
  if (k > q.iX || (k === q.iX && !close)) return null;
  const e = close ? b[k].c : b[k].o; if (sd * (e - q.st) <= 0) return null;
  return Object.assign({}, q, { e, iE: k, T: close ? b[k].t + H4 : b[k].t });
}
function report(lab, list) {
  const all = list.filter(Boolean).map((q, i) => ({ id: q.id, i, T: q.T, TOut: q.TOut, nr: nrOf(q.sd, q.e, q.st, q.ex, (q.TOut - q.T) / 864e5),
    t: { side: q.sd, entry: q.e, stop0: q.st, exitP: q.sd < 0 ? q.ex + q.e * BOR * (q.TOut - q.T) / 864e5 / 365 : q.ex } }));
  const p = portfolio(all, 0.25, (x) => x.i, 0.0005), h = [all.filter((x) => x.T < SPLIT), all.filter((x) => x.T >= SPLIT)].map((z) => portfolio(z, 0.25, (x) => x.i, 0.0005).cagr);
  const rc = Array.from({ length: 20 }, () => { const mm = new Map(all.map((x) => [x, rnd()])); return portfolio(all, 0.25, (x) => mm.get(x), 0.0005).cagr; }).sort((a, b) => a - b);
  const R = all.reduce((s, x) => s + x.nr, 0), w = all.filter((x) => x.nr > 0).length;
  console.log(lab.padEnd(40), String(all.length).padStart(5), R.toFixed(0).padStart(5), (R / all.length).toFixed(2).padStart(6), pct(w / all.length) + '%', pct(p.cagr), pct(h[0]), pct(h[1]), pct(p.mdd) + '%', String(p.st).padStart(4), '|', pct(rc[0]), '–', pct(rc[19]));
}
console.log(`\n«4 часа · неделя», ${DIR === 'long' ? 'покупки' : 'продажи'}; ${MOEX ? '4ч Мосбиржи 2018–2026, половины до/после 09.08.2022' : '4ч VI.2024–X.2026, половины до/после 17.08.2025'}`);
console.log('когда входить'.padEnd(40), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия | порядок');
report('по закрытию сигнальной свечи', base.map(atSigClose));
report('по открытию следующей (как сейчас)', base);
report('по закрытию следующей свечи', base.map((q) => later(q, 0, true)));
report('через 1 свечу (открытие)', base.map((q) => later(q, 1)));
report('через 2 свечи (открытие)', base.map((q) => later(q, 2)));
// насколько открытие следующей свечи отличается от закрытия сигнальной (в R), отдельно утро после вечернего сигнала
const g = (q) => { const s = q.iE - 1; return q.sd * (q.b[q.iE].o - q.b[s].c) / Math.abs(q.e - q.st); };
const eve = base.filter((q) => q.iE > 0 && q.b[q.iE].t - q.b[q.iE - 1].t > 5 * 3600e3), day = base.filter((q) => q.iE > 0 && q.b[q.iE].t - q.b[q.iE - 1].t <= 5 * 3600e3);
const av = (z) => (z.reduce((s, q) => s + g(q), 0) / z.length).toFixed(3);
console.log(`сигналов: днём ${day.length} (открытие следующей против закрытия сигнальной: ${av(day)}R в пользу сделки), вечером ${eve.length} (утренний разрыв: ${av(eve)}R)`);
