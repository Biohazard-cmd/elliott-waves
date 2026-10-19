// Проверки движка: node test.js
const EW = require('./engine.js');
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fails++; };
const ctx = { F: Math.log, G: Math.exp, sub: [], bars: [] };
const P = (arr) => arr.map((p, k) => ({ i: k * 10, p }));

console.log('Правила импульса');
let e = EW.evalImpulse(P([100, 110, 104, 126, 121, 133]), ctx);
ok(e.ok, 'классический импульс принимается, оценка ' + e.score.toFixed(0));
ok(!EW.evalImpulse(P([100, 110, 99, 126, 121, 133]), ctx).ok, 'волна 2 за началом волны 1 — отказ');
ok(!EW.evalImpulse(P([100, 110, 104, 126, 109, 133]), ctx).ok, 'перекрытие 4 и 1 без сужения — отказ');
ok(!EW.evalImpulse(P([100, 120, 110, 122, 116, 140]), ctx).ok, 'волна 3 самая короткая — отказ');
e = EW.evalImpulse(P([100, 120, 108, 124, 115, 126]), ctx);
ok(e.ok && e.diag, 'сужающийся клин с перекрытием распознан как диагональ');

console.log('Коррекции');
let a = EW.evalABC(P([130, 115, 123, 108]), ctx);
ok(a.ok && a.kind === 'zigzag', 'зигзаг: B=53%, C=A');
a = EW.evalABC(P([130, 118, 131, 115]), ctx);
ok(a.ok && a.kind === 'flat' && a.subtype === 'расширенная', 'расширенная горизонтальная');
let t = EW.evalTriangle(P([100, 90, 97, 92, 96, 93]), ctx);
ok(t.ok, 'сужающийся треугольник');
ok(!EW.evalTriangle(P([100, 90, 97, 88, 99, 87]), ctx).ok, 'расходящиеся стороны — не сужающийся треугольник');

console.log('Зигзаг без заглядывания вперёд');
const bars = EW.synth({ n: 1500, seed: 3, mode: 'waves' });
const full = EW.zigzag(bars, 0.03).pivots;
const half = EW.zigzag(bars.slice(0, 700), 0.03).pivots;
const confirmedBefore = full.filter((p) => p.c < 700);
ok(JSON.stringify(half) === JSON.stringify(confirmedBefore), 'пивоты на обрезанных данных совпадают с подтверждёнными ранее');
ok(full.every((p) => p.c > p.i), 'каждый пивот подтверждается позже своего бара');

console.log('Сигналы бэктеста воспроизводятся живым анализом');
const bt = EW.backtest(bars, { swingPct: 3 });
let same = 0;
for (const tr of bt.trades) {
  const an = EW.analyze(bars.slice(0, tr.iSignal + 1), { swingPct: 3 });
  if (an.plan && an.plan.setup === tr.setup && an.plan.signalBar === tr.iSignal && Math.abs(an.plan.stop - tr.stop) < 1e-9) same++;
}
ok(bt.trades.length > 0 && same === bt.trades.length, `совпало ${same} из ${bt.trades.length}`);
ok(bt.trades.every((tr) => tr.iEntry > tr.iSignal), 'вход всегда на следующем баре после сигнала');

console.log('\nБэктест: учебный ряд с волнами vs случайное блуждание');
const fmt = (s) => `сделок ${s.trades}, выигрышных ${(s.winRate * 100).toFixed(0)}%, ср. R ${s.avgR.toFixed(2)}, PF ${s.profitFactor.toFixed(2)}, доходность ${(s.totalReturn * 100).toFixed(1)}%, просадка ${(s.maxDD * 100).toFixed(1)}%`;
for (const mode of ['waves', 'random']) {
  const agg = { n: 0, R: 0, wins: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const b = EW.synth({ n: 2000, seed, mode });
    const r = EW.backtest(b, { swingPct: 3 });
    agg.n += r.stats.trades; agg.R += r.trades.reduce((s, t) => s + t.R, 0); agg.wins += r.trades.filter((t) => t.ret > 0).length;
    if (seed === 1) console.log(`  ${mode} seed1: ${fmt(r.stats)}`);
  }
  console.log(`  ${mode} (20 рядов): сделок ${agg.n}, выигрышных ${(agg.wins / agg.n * 100).toFixed(0)}%, средний R ${(agg.R / agg.n).toFixed(3)}`);
}

const an = EW.analyze(bars, {});
console.log('\nТекущий анализ (учебный ряд):');
an.scenarios.slice(0, 4).forEach((s) => console.log(`  [${s.score.toFixed(0)}] ${s.title}`));
console.log('  план:', an.plan ? `${an.plan.name} ${an.plan.side > 0 ? 'long' : 'short'} RR ${an.plan.rr.toFixed(2)} (${an.plan.state})` : 'нет');

console.log('\nCSV');
const csv1 = '<TICKER>;<PER>;<DATE>;<TIME>;<OPEN>;<HIGH>;<LOW>;<CLOSE>;<VOL>\n' +
  Array.from({ length: 40 }, (_, k) => `SBER;D;202401${String(k % 28 + 1).padStart(2, '0')};000000;${100 + k};${101 + k};${99 + k};${100.5 + k};1000`).join('\n');
const p1 = EW.parseCSV(csv1);
ok(p1.length === 40 && p1[0].c === 100.5 && p1[0].v === 1000, 'формат Финама');
const csv2 = 'Date,Open,High,Low,Close,Adj Close,Volume\n' + Array.from({ length: 35 }, (_, k) => `2024-02-${String(k % 28 + 1).padStart(2, '0')},${10 + k},${11 + k},${9 + k},${10.2 + k},${10.1 + k},500`).join('\n');
const p2 = EW.parseCSV(csv2);
ok(p2.length === 35 && p2[0].c === 10.2, 'формат Yahoo (Close, не Adj Close)');
const csv3 = Array.from({ length: 35 }, (_, k) => `2024.03.01,10:${String(k).padStart(2, '0')},1.1${k},1.2${k},1.0${k},1.15,77`).join('\n');
const p3 = EW.parseCSV(csv3);
ok(p3.length === 35 && p3[0].v === 77, 'формат MetaTrader без заголовка');

const iss = (k0, k1) => 'candles\n\nopen;close;high;low;value;volume;begin;end\n' +
  Array.from({ length: k1 - k0 }, (_, j) => { const k = k0 + j; const d = new Date(Date.UTC(2025, 0, 1) + k * 86400000).toISOString().slice(0, 10); return `${300 + k};${301 + k};${302 + k};${299 + k};1e9;12345;${d} 00:00:00;${d} 23:59:59`; }).join('\n') + '\n';
const pg1 = EW.parseCSV(iss(0, 30)), pg2 = EW.parseCSV(iss(25, 60));
ok(pg1.length === 30 && pg1[0].o === 300 && pg1[0].c === 301 && pg1[0].h === 302 && pg1[0].l === 299 && pg1[0].v === 12345, 'формат Мосбиржи ISS (столбцы open;close;high;low)');
const merged = EW.mergeBars([pg2, pg1]);
ok(merged.length === 60 && merged[0].t < merged[59].t, 'склейка страниц без повторов');
ok(EW.parseCSV('candles\n\nopen;close;high;low;value;volume;begin;end\n').length === 0, 'пустая страница — ноль свечей без ошибки');

const fs = require('fs');
const up = '/root/.claude/uploads/3a2c4cfc-f297-560e-8c31-f6ccd1b9bd3c/';
if (fs.existsSync(up + 'dbd70d75-candles.csv')) {
  const a1 = EW.parseCSV(fs.readFileSync(up + 'dbd70d75-candles.csv', 'utf8'));
  const a2 = EW.parseCSV(fs.readFileSync(up + '40ff4117-candles_1.csv', 'utf8'));
  ok(a1[0].o === 134.03 && a1[0].c === 137.24 && a1[0].h === 138.8 && a1[0].l === 133.96 && a1[0].v === 78152550, 'реальный файл Мосбиржи без заголовка: цены и объём на местах');
  const all = EW.mergeBars([a1, a2]);
  ok(all.length === a1.length + a2.length && all[all.length - 1].c === 108.04, `склейка двух реальных файлов: ${all.length} свечей, последняя 16.10.2026 = 108,04`);
  const c1 = EW.checkFiles([a1, a2], ['candles.csv', 'candles (1).csv']);
  ok(!c1.errors.length && !c1.warnings.length, 'две части одной бумаги: без ошибок и предупреждений');
  const other = a2.map((b) => ({ t: b.t, o: b.o * 1.4, h: b.h * 1.4, l: b.l * 1.4, c: b.c * 1.4, v: b.v }));
  const c2 = EW.checkFiles([a1, other], ['SBER_1.csv', 'GAZP_2.csv']);
  ok(c2.warnings.some((w) => /прыгает/.test(w)), 'стык с другой бумагой даёт предупреждение о скачке цены');
  const c3 = EW.checkFiles([a2, other], ['a.csv', 'b.csv']);
  ok(c3.errors.length === 1, 'пересечение дат с разными ценами — ошибка «разные бумаги»');
  const c4 = EW.checkFiles([a1.slice(0, 200), a2], ['p1.csv', 'p3.csv']);
  ok(c4.warnings.some((w) => /Нет свечей/.test(w)), 'пропущенная часть даёт предупреждение о пропуске');
  const an = EW.analyze(all, { swingPct: 6 });
  console.log('  сценарии на реальных данных:', an.scenarios.slice(0, 3).map((s) => `[${Math.round(s.score)}] ${s.title}`).join(' | '));
}
ok((() => { try { EW.parseCSV(Array.from({ length: 40 }, (_, k) => `2024-01-${String(k % 28 + 1).padStart(2, '0')},1,5000000,9000000,2,3`).join('\n')); return false; } catch (e) { return /неверно/.test(e.message); } })(), 'перепутанные столбцы дают понятную ошибку, а не мусорный график');

console.log(fails ? `\nОШИБОК: ${fails}` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
