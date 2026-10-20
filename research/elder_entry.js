// Элдер, «третий экран»: вместо покупки на открытии после сигнала — стоп-заявка на покупку выше максимума
// сигнальной свечи; не сработала — на следующий день переносим на максимум последней свечи (вниз), ждём до W дней.
// Если до входа цена дошла до стопа сигнала — сигнал отменён. Стоп и цель — уровни сигнала (не пересчитываем).
// Выход у обоих вариантов одинаковый простой (simAbs из random_entry.js).
// shortcut: на свече входа порядок «вход/стоп» внутри дня неизвестен — стоп на ней проверяем (осторожно, против Элдера).
const { evalCfg, SPLIT } = require('./strat.js');
const { simAbs, stats, line, byId } = require('./random_entry.js');

for (const [name, PRE] of [['ОСНОВНОЙ', { addAO: true, addSma200: true, maxHoldDays: 182 }], ['АГРЕССИВНЫЙ (без доливок)', { addAO: true, addSma200: true, maxHoldDays: 182, stopW2: true, localBars: 5 }]]) {
  const r = evalCfg(PRE), sig = [];
  for (const x of r.all) {
    const s = byId.get(x.id), bars = s.bars, i = bars.findIndex((b) => b.t === x.T);
    if (i < 1 || !(x.t.target > x.t.entry)) continue;
    const z = simAbs(bars, i, bars[i].o, x.t.stop0, x.t.target); if (z) sig.push({ bars, i, stop: x.t.stop0, tgt: x.t.target, open: z });
  }
  console.log(`\n${name}: сигналов ${sig.length}`);
  console.log('вход'.padEnd(30), 'сдел', '     R', ' ср.R', 'прибыльных', '%/год  до23  с23  просадка | отсеяно: сколько, их R на открытии; вход выше открытия');
  line('на открытии (как сейчас)', stats(sig.map((q) => q.open)));
  for (const W of [1, 2, 3, 5, 10]) {
    const all = [], cut = []; let dEntry = 0;
    for (const q of sig) {
      const { bars, i, stop, tgt } = q; let lv = bars[i - 1].h, z = null, k = 0;
      for (; k < W && i + k < bars.length; k++) {
        const b = bars[i + k];
        if (b.o >= lv) { z = simAbs(bars, i + k, b.o, stop, tgt); break; }   // открылись выше заявки — исполнение по открытию
        if (b.h >= lv) { z = simAbs(bars, i + k, lv, stop, tgt); break; }
        if (b.l <= stop) { k = W; break; }   // дошли до стопа раньше входа — сигнал сломан
        lv = Math.min(lv, b.h);
      }
      if (z) { all.push(z); dEntry += z.t.entry / bars[i].o - 1; } else cut.push(q.open.nr);
    }
    const s = stats(all);
    line(`стоп-заявка, ждать ${W} дн.`, s);
    console.log(''.padEnd(30), `отсеяно ${cut.length} сигналов, на открытии они дали ${cut.reduce((a, b) => a + b, 0).toFixed(0)}R (${(cut.reduce((a, b) => a + b, 0) / Math.max(1, cut.length)).toFixed(2)}R на сделку); вход в среднем ${(dEntry / all.length * 100).toFixed(1)}% выше открытия дня сигнала+1`);
  }
}
