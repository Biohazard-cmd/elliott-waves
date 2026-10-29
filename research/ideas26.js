// Три идеи Егора 26.10.2026 на наборах 3.1 (робот: риск 1,5%, позиция ≤ 25%, одновременные сигналы — по обороту, свободные деньги в фонде).
// SET=h4 — «4 часа · неделя» 3.1 (4ч Мосбиржи 2018–2026, половины до/после 09.08.2022); SET=d — дневки · основной 3.1 (хранилище 2019–2026, половины до/после 2023).
// IDEA=part — часть позиции фиксировать на цели (два «полробота»: доля w закрывается на цели, остальное — бегунок, как сейчас);
// IDEA=idx — тот же набор на индексе Мосбиржи (IMOEX, data/moexidx, без дивидендов — как фьючерс); IDEA=macd — недельный фильтр Элдера.
const SET = process.env.SET || 'h4', IDEA = process.env.IDEA || 'part';
if (SET === 'h4') process.env.MOEX = '1';
process.env.V = 'x';
require('./fri_chan.js');   // правит движок в памяти (clarHook — фильтр в выборе сигнала); сам ничего не считает при V=x
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const S = require('./store.js'), strat = require('./strat.js'), M = require('./moex4h.js'), { portfolio } = require('./maxpos_add.js');
const E = S.E, H4 = 4 * 3600e3, DAY = 864e5, WEEK = 7 * DAY;
const RISK = +(process.env.RISK || 1.5) / 100;
const H4W = { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true,
  setups: { w3: true, w5: false, abc: false, tri: false }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true, feePct: 0.05, slipPct: 0.02 };
const DL = { addAO: true, addSma200: true, maxHoldDays: 182, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 };
const ser = SET === 'h4' ? M.series(S) : strat.ser, mkt = SET === 'h4' ? S.D.buildMarket('4h', 200) : strat.mkt;
const CFG = SET === 'h4' ? H4W : DL, SPLIT = SET === 'h4' ? Date.UTC(2022, 7, 9) : strat.SPLIT, TF = SET === 'h4' ? H4 : DAY;
const LAST = Date.UTC(2025, 9, 18);   // последний год данных: 18.10.2025–18.10.2026
const pct = (v) => (v * 100).toFixed(1).padStart(5);
let CUR = null;
// индекс: часовики IMOEX → 4ч или дни, режем на разрывах > 10 дней, как moex4h.js
function idxSeries() {
  const r = M.to4h(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'moexidx', 'IMOEX.json.gz')))), TF);
  const bars = r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] / a[4], done: true }));   // v — оборот в рублях → «штуки»
  const out = []; for (let k = 1, s = 0; k <= bars.length; k++) if (k === bars.length || bars[k].t - bars[k - 1].t > 10 * DAY) { if (k - s >= 300) out.push({ id: 'IMOEX', tf: SET === 'h4' ? '4h' : '1d', bars: bars.slice(s, k), P: TF }); s = k; }
  return out;
}
const turn = (b, iE) => { let s = 0; for (let j = Math.max(0, iE - 30); j < iE; j++) s += b[j].c * (b[j].v || 0); return s; };
function trades(over, opt = {}) {
  const r = strat.evalCfg(Object.assign({}, CFG, over), { ser: opt.ser || ser, mkt, sw: (s) => { CUR = s.id; return 0; }, tr: (t, bars) => { t._b = bars; return t.NR; } });
  return r.all.map((x) => { const t = x.t, b = t._b, iX = Math.min(t.iExit, b.length - 1);
    return { id: x.id, T: x.T, TOut: b[iX].t + TF, nr: x.nr, turn: turn(b, t.iEntry), reason: t.reason, t: { side: t.side, entry: t.entry, stop0: t.stop0, exitP: t.exitP } }; });
}
// доля w позиции: риск w от обычного (стоп для расчёта размера — в 1/w раз дальше), R — w от R сделки
const part = (x, w) => Object.assign({}, x, { nr: x.nr * w, w, t: Object.assign({}, x.t, { stop0: x.t.entry - x.t.side * Math.abs(x.t.entry - x.t.stop0) / w }) });
let seed = 23; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function rep(lab, list, maxPos = 0.25, risk = RISK) {
  for (const x of list) x.i = -x.turn;
  const P = (z, k = (x) => x.i) => z.length ? portfolio(z, maxPos, k, 0.0005, risk) : { cagr: 0, mdd: 0, st: 0 };
  const p = P(list), h = [P(list.filter((x) => x.T < SPLIT)), P(list.filter((x) => x.T >= SPLIT))]; const lyz = list.filter((x) => x.T >= LAST), lyR = lyz.reduce((s, x) => s + x.nr, 0);
  const rc = Array.from({ length: 10 }, () => { const mm = new Map(list.map((x) => [x, rnd()])); return P(list, (x) => mm.get(x)).cagr; }).sort((a, b) => a - b);
  const n = list.reduce((s, x) => s + (x.w || 1), 0), R = list.reduce((s, x) => s + x.nr, 0), w = list.filter((x) => x.nr > 0).reduce((s, x) => s + (x.w || 1), 0);
  console.log(lab.padEnd(38), String(Math.round(n)).padStart(5), R.toFixed(0).padStart(5), (R / n).toFixed(3).padStart(6), pct(w / n) + '%', pct(p.cagr), pct(h[0].cagr), pct(h[1].cagr), pct(p.mdd) + '%', String(p.st).padStart(4), '|', lyR.toFixed(1).padStart(5) + 'R', '|', pct(rc[0]), '–', pct(rc[rc.length - 1]), `| взято ${p.taken}, пропущ. ${p.skipped}`);
}
console.log(`\n${SET === 'h4' ? '«4 часа · неделя» 3.1, 4ч Мосбиржи 2018–2026' : 'дневки · основной 3.1, 2019–2026'}; риск ${RISK * 100}%, позиция ≤ 25%, порядок по обороту; идея ${IDEA}`);
console.log('вариант'.padEnd(38), 'сделок    R   ср.R прибыльн.  %/год  1пол  2пол просадка серия | R посл.год | порядок        |');
const base = trades({});
rep('сейчас', base);

if (IDEA === 'part') {
  const atT = trades({ addRunner: false });   // всё закрывается на цели
  const hitT = base.filter((x) => x.reason === 7).length;
  console.log(`(сейчас дошли до цели и стали «бегунком» ${hitT} сделок из ${base.length}; если закрывать на цели — ${atT.filter((x) => x.reason === 1).length} закрытий на цели)`);
  rep('всё закрывать на цели', atT);
  for (const w of [0.25, 1 / 3, 0.5, 2 / 3]) rep(`на цели ${w === 1 / 3 ? '⅓' : w === 2 / 3 ? '⅔' : w * 100 + '%'}, остальное — бегунок`, [...atT.map((x) => part(x, w)), ...base.map((x) => part(x, 1 - w))]);
}

if (IDEA === 'idx') {
  const ix = idxSeries(), it = trades({}, { ser: ix });
  for (const x of it) x.turn = 1e15;   // индекс — первым
  console.log(`индекс: ${ix.reduce((s, a) => s + a.bars.length, 0)} свечей`);
  rep('только индекс, позиция ≤ 25%', it.map((x) => Object.assign({}, x)));
  rep('только индекс, позиция ≤ 100%', it.map((x) => Object.assign({}, x)), 1);
  for (const r of [3, 5]) rep(`только индекс, риск ${r}%, позиция ≤ 100%`, it.map((x) => Object.assign({}, x)), 1, r / 100);
  for (const [lab, over] of [['мягче: все сетапы, не только лучший подсчёт', { topOnly: false, setups: { w3: true, w5: true, abc: true, tri: true } }], ['мягче + без AO и SMA200', { topOnly: false, addAO: false, addSma200: false, setups: { w3: true, w5: true, abc: true, tri: true } }]]) {
    const z = trades(over, { ser: ix }); for (const x of z) x.turn = 1e15; rep('индекс, ' + lab, z, 1);
  }
  rep('акции + индекс на одном счёте', [...base, ...it].map((x) => Object.assign({}, x)));
  const yr = {}; for (const x of it) { const y = new Date(x.T).getUTCFullYear(); yr[y] = (yr[y] || 0) + x.nr; }
  console.log('индекс, R по годам:', Object.entries(yr).map(([y, v]) => y + ': ' + v.toFixed(1)).join('  '));
}

if (IDEA === 'macd') {
  // недельные свечи (неделя с понедельника) по каждой бумаге; к свече — только закрытые недели
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; let e = a[0]; for (const v of a) { e = e + k * (v - e); o.push(e); } return o; };
  const wkOf = (t) => Math.floor((t + 3 * 3600e3 - 4 * DAY) / WEEK);   // по московскому времени
  function weekly(list) {
    const m = new Map();
    for (const sr of list) {
      const W = [], C = [];
      for (const b of sr.bars) { const w = wkOf(b.t); if (W[W.length - 1] === w) C[C.length - 1] = b.c; else { W.push(w); C.push(b.c); } }
      const e12 = ema(C, 12), e26 = ema(C, 26), mac = C.map((_, k) => e12[k] - e26[k]), sg = ema(mac, 9), e13 = ema(C, 13);
      const o = m.get(sr.id) || new Map();
      W.forEach((w, k) => { if (k >= 35) o.set(w, { h: mac[k] - sg[k], hp: mac[k - 1] - sg[k - 1], e: e13[k], ep: e13[k - 1] }); });
      m.set(sr.id, o);
    }
    return m;
  }
  const WM = weekly(ser), IX = weekly(idxSeries()).get('IMOEX');
  const at = (mp, t) => mp && mp.get(wkOf(t) - 1);   // прошлая (закрытая) неделя
  const RULE = {
    up: (q) => q.h > q.hp,                 // Элдер: наклон недельной гистограммы MACD вверх
    pos: (q) => q.h > 0,                   // гистограмма выше нуля
    upOrPos: (q) => q.h > q.hp || q.h > 0,
    ema13: (q) => q.e > q.ep,              // Элдер, второй вариант: недельная EMA13 растёт
  };
  for (const [src, lab] of [['own', 'по бумаге'], ['idx', 'по индексу']])
    for (const k of Object.keys(RULE)) {
      const tr = trades({ clarHook: function (s, sc, pl, i) { const q = at(src === 'own' ? WM.get(CUR) : IX, this.T[i]); if (!q) return true; return RULE[k](q); } });
      rep(`неделя ${lab}: ${k}`, tr);
    }
  rep('сейчас (для сравнения)', trades({}));
}
