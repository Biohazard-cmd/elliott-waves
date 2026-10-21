// 2.43: время хода робота (после закрытия свечи), «будильник», сделки со счёта в «мой (вручную)», история оповещений
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.addInitScript(() => { window.__alarms = []; const mk = () => { if (window.Android) return; window.Android = { setAlarm: (t) => window.__alarms.push(Number(t)), notifyOpen: () => {}, notify: () => {} }; }; mk(); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  // 1) когда роботу пора ходить и когда будить телефон
  const r1 = await p.evaluate(() => { const D = window.EWData, now = Date.now(), H = 3600e3;
    const mk = (key, name, tf, lastRun) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, cash: 100000, dep: 100000, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0, lastRun });
    const b4 = Math.floor(now / (4 * H)) * 4 * H;   // начало текущей 4ч свечи (UTC)
    D.vaccSet({ on: true, startAt: now - 30 * 864e5, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now - 10 * 60e3, accs: [mk('h4_week', '4 часа · неделя', '4h', b4 - 5 * 60e3), Object.assign(mk('manual', 'мой (вручную)', undefined, now - 10 * 60e3), { manual: true, cfg: {} })] });
    const t = D.nextAlarm(); return { alarm: new Date(t).toISOString(), minsAfterBoundary: Math.round((t - b4 - 4 * H) / 1000) }; });
  console.log('будильник:', JSON.stringify(r1));
  const said = await p.evaluate(async () => { const m = []; await window.EWData.robotStep((x) => m.push(x), false); return m.slice(-2).join(' | '); });
  const V1 = await p.evaluate(() => window.EWData.vaccGet());
  console.log('ход без нажатия:', said, '| 4ч ходил:', V1.accs[0].lastRun > Date.now() - 60e3, '| ручной ходил:', V1.accs[1].lastRun > Date.now() - 60e3);
  const said2 = await p.evaluate(async () => { const m = []; await window.EWData.robotStep((x) => m.push(x), false); return m.length; });
  console.log('сразу ещё раз — сообщений хода:', said2, '(0 = никому не пора)');
  // 2) сделки со счёта → «мой (вручную)»: первая сверка — портфель (SBER 30 шт по средней 284), ручная позиция по той же бумаге не задваивается
  await p.evaluate(() => { const V = window.EWData.vaccGet(); const m = V.accs[1]; m.lastRun = 0; m.pos = [{ id: 'SBER_TQBR', ticker: 'SBER', lot: 10, qty: 10, entry: 280, entryT: Date.now() - 864e5, side: 1, stop: 270, target: 0, cost: 2800, divs: 0 }]; window.EWData.vaccSet(V); });
  await p.evaluate(() => window.EWData.robotStep(null, true, 'manual'));
  let M = await p.evaluate(() => window.EWData.vaccGet().accs[1]);
  console.log('после первой сверки:', M.pos.map((x) => x.ticker + ' ' + x.qty + '@' + x.entry + (x.src ? '(счёт)' : '')).join(', '), '| закрыто', M.closed.length);
  // вторая сверка: операций после сверки нет, портфель тот же — изменений нет
  await p.evaluate(() => window.EWData.robotStep(null, true, 'manual'));
  const M2 = await p.evaluate(() => window.EWData.vaccGet().accs[1]);
  console.log('повторная сверка не задваивает:', JSON.stringify(M2.pos.map((x) => x.qty)) === JSON.stringify(M.pos.map((x) => x.qty)), M2.closed.length === M.closed.length);
  console.log('журнал:', (await p.evaluate(() => { const L = window.EWData.logRead(); return L.app.items.filter((x) => x.k === 'robot').map((x) => x.m).slice(-4).join(' / '); })));
  // 3) история оповещений
  await p.evaluate(() => window.EWData.notifSave([{ title: 'SBER 1ч: ВЫХОД — закрыть покупки', text: 'Фигура завершена', open: { id: 'SBER_TQBR', ticker: 'SBER', tf: '1h' } }, { title: 'OZON 4ч: подсчёт отменён', text: 'Цена прошла 3547', open: { id: 'OZON_TQBR', ticker: 'OZON', tf: '4h' } }]));
  await p.click('#bellBtn'); await p.waitForTimeout(400);
  console.log('колокольчик:', (await p.textContent('#pop')).replace(/\\s+/g, ' ').match(/Последние оповещения.{0,160}/)?.[0]);
  await p.screenshot({ path: 'shots/363-notif-pop.png' });
  await p.click('#pop [data-nopen^="OZON"]'); await p.waitForTimeout(1500);
  console.log('нажали на оповещение OZON → бумага', await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); return s.inst.ticker + ' ' + s.tf; }));
  await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs [data-tab="alerts"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { const h = [...document.querySelectorAll('#setBody h3')].find((x) => /История оповещений/.test(x.textContent)); if (h) h.scrollIntoView(); });
  console.log('настройки:', (await p.textContent('#setBody')).replace(/\\s+/g, ' ').match(/История оповещений.{0,120}/)?.[0]);
  await p.screenshot({ path: 'shots/364-notif-settings.png', fullPage: false });
  console.log('будильники, которые ставило приложение:', (await p.evaluate(() => window.__alarms)).length);
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
