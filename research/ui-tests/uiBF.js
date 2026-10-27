// 3.10: «мой (вручную)» — пополнение картой/СБП не прибыль, обслуживание отдельной строкой, старые закрытые — в архив;
// таймер до закрытия свечи (candleEnd, уведомление notifyTimer, виджет untils); ошибок нет. Нужен serve.js (PORT, по умолчанию 8799).
const { chromium } = require('playwright');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), errs = [], bad = [];
  const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad.push(m); };
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { window.__n = []; window.__w = []; window.Android = { setAlarm: () => {}, notifyOpen: (...a) => window.__n.push(['open', ...a]), notifyTimer: (...a) => window.__n.push(['timer', ...a]), notify: () => {}, takeOpen: () => '', widgetUpdate: (j) => window.__w.push(JSON.parse(j)) }; });
  await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(3000);
  // подмена брокера: итог портфеля и операции (пополнение картой + обслуживание)
  await p.evaluate(() => {
    window.__tot = 5636; window.__ops = [];
    const f0 = window.fetch;
    window.fetch = async (url, opt) => {
      const u = String(url), Q = (x) => ({ units: String(Math.trunc(x)), nano: Math.round((x - Math.trunc(x)) * 1e9) }), J = (o) => new Response(JSON.stringify(o), { status: 200 });
      if (u.endsWith('/GetPortfolio')) return J({ totalAmountPortfolio: Q(window.__tot), positions: [] });
      if (u.endsWith('/GetOperationsByCursor')) { const bd = JSON.parse(opt.body); if (!bd.operationTypes) return J({ hasNext: false, items: window.__ops }); }
      return f0(url, opt);
    };
  });
  await p.click('#robBtn'); await p.waitForTimeout(500);
  await p.click('#vStart'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.EWData.robotStep(null, true, 'manual'));
  let V = await p.evaluate(() => window.EWData.vaccGet()), m = V.accs.find((a) => a.manual);
  ok(m.realCap && Math.round(m.dep) === 5636, 'первая сверка: капитал со счёта 5636 ₽ — ' + Math.round(m.dep));
  // как у Егора: старая виртуальная сделка до сверки, версия до 3.10 (без oldCut)
  await p.evaluate(() => { const D = window.EWData, W = D.vaccGet(), a = W.accs.find((x) => x.manual); a.closed = [{ id: 'RTKM_TQBR', ticker: 'RTKM', side: 1, qty: 30, entry: 43.68, entryT: a.realCap - 9e8, exit: 43.1, exitT: a.realCap - 8e8, why: 'ваш стоп', pl: -19 }]; delete a.oldCut; D.vaccSet(W);
    const t = a.realCap + 1000; window.__tot = 6815;
    window.__ops = [{ id: 'op1', type: 'OPERATION_TYPE_INPUT_ACQUIRING', date: new Date(t).toISOString(), payment: { units: '1500', nano: 0 } }, { id: 'op2', type: 'OPERATION_TYPE_SERVICE_FEE', date: new Date(t + 6e5).toISOString(), payment: { units: '-350', nano: 0 } }, { id: 'op3', type: 'OPERATION_TYPE_BROKER_FEE', date: new Date(t + 7e5).toISOString(), payment: { units: '-12', nano: -500000000 } }]; });
  await p.evaluate(() => window.EWData.robotStep(null, true, 'manual'));
  await p.evaluate(() => window.EWData.robotStep(null, true, 'manual'));   // второй ход — без повторного учёта
  V = await p.evaluate(() => window.EWData.vaccGet()); m = V.accs.find((a) => a.manual);
  const eq = await p.evaluate(() => { const D = window.EWData, a = D.vaccGet().accs.find((x) => x.manual); return D.vEquity(a); });
  ok(Math.round(m.dep) === 7136, 'пополнение картой 1500 ₽ — во «Вложено», не в прибыль: ' + Math.round(m.dep));
  ok(Math.round(eq - m.dep) === -321, 'результат = 6815 − 7136 = −321 ₽: ' + Math.round(eq - m.dep));
  ok(m.costs && Math.round(m.costs.fee) === -350 && Math.round(-m.costs.comm) === 13, 'обслуживание −350, комиссии −12,5: ' + JSON.stringify(m.costs));
  ok(m.closed.length === 0 && m.closedOld && m.closedOld.length === 1, 'старая сделка до сверки — в архиве, в «Закрытых» пусто');
  ok(V.accs.filter((a) => !a.manual && !a.crypto).every((a) => Math.round(a.dep) >= 1500), 'пополнение повторено и на виртуальных счетах');
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('ew2.settings')); });
  await p.click('#robNav [data-rnav="manual"]').catch(async () => { await p.evaluate(() => { const el = [...document.querySelectorAll('#robNav button')].find((x) => /вручную/.test(x.textContent)); if (el) el.click(); }); });
  await p.waitForTimeout(500);
  const txt = await p.evaluate(() => document.getElementById('robBody').innerText);
  ok(/обслуживание −350/.test(txt) && /комиссии −13/.test(txt) && !/Т-Инвестиций/.test(txt), 'на экране: «В результате уже учтено: обслуживание −350 ₽ · комиссии −13 ₽», без названия брокера');
  await p.screenshot({ path: 'shots/uiBF-manual.png' });
  ok((await p.evaluate(() => window.__w.length)) > 0 && (await p.evaluate(() => Array.isArray(window.__w[window.__w.length - 1].untils))), 'виджет обновлён после хода в приложении, у строк есть таймеры (untils)');
  // карточка сигнала робота «4 часа · неделя» — живой отсчёт
  await p.evaluate(() => { const D = window.EWData, W = D.vaccGet(), a = W.accs.find((x) => x.key === 'h4_week'), now = Date.now(); a.pend = { SBER_TQBR: { sigT: now - 4 * 36e5 - 6e4, side: 1, entry: 300, stop: 290, target: 330, qty: 10, until: now + 30 * 6e4 } }; D.vaccSet(W); });
  await p.evaluate(() => { const el = [...document.querySelectorAll('#robNav button')].find((x) => /4ч/.test(x.textContent)); if (el) el.click(); });
  await p.waitForTimeout(1200);
  const c1 = await p.evaluate(() => (document.querySelector('.pendc [data-cd]') || {}).textContent || '');
  await p.waitForTimeout(2100);
  const c2 = await p.evaluate(() => (document.querySelector('.pendc [data-cd]') || {}).textContent || '');
  console.log('таймер:', c1, '→', c2);
  ok(/до закрытия свечи входа (29|30):\d\d/.test(c1) && c1 !== c2, 'в карточке сигнала робота — таймер до закрытия свечи входа, тикает');
  await p.screenshot({ path: 'shots/uiBF-pend.png' });
  // сигнал, записанный до 3.10 (без until): таймер считается по времени сигнальной свечи
  const old = await p.evaluate(() => { const D = window.EWData, ms = 4 * 36e5, now = Date.parse('2026-10-27T09:30:00Z'), sigT = Math.floor(now / ms) * ms - ms;
    return [D.pendUntil({ sigT }, '4h', now), D.pendUntil({ sigT: sigT - ms }, '4h', now), D.pendUntil({ sigT: Date.parse('2026-10-26T07:00:00Z') }, '1d', now)].map((t) => t ? new Date(t).toISOString().slice(0, 16) : 0); });
  console.log('старые сигналы:', JSON.stringify(old));
  ok(old[0] === '2026-10-27T12:00' && old[1] === 0 && old[2] === '2026-10-27T20:50', 'сигнал до 3.10: таймер по сигнальной свече (4ч — до 15:00 МСК, устаревший — нет, дневка — до 23:50)');
  // таймер: время закрытия свечи
  const ce = await p.evaluate(() => { const D = window.EWData, at = (s) => Date.parse(s), f = (t) => t ? new Date(t).toISOString().slice(0, 16) : 0;
    return [f(D.candleEnd('4h', at('2026-10-27T09:30:00Z'))), f(D.candleEnd('4h', at('2026-10-27T20:10:00Z'))), f(D.candleEnd('4h', at('2026-10-27T21:00:00Z'))), f(D.candleEnd('1h', at('2026-10-27T07:05:00Z'))), f(D.candleEnd('1d', at('2026-10-27T10:00:00Z'))), f(D.candleEnd('4h', at('2026-10-27T03:00:00Z')))]; });
  console.log('candleEnd:', JSON.stringify(ce));
  ok(ce[0] === '2026-10-27T12:00' && ce[1] === '2026-10-27T20:50' && ce[2] === 0 && ce[3] === '2026-10-27T08:00' && ce[4] === '2026-10-27T20:50' && ce[5] === 0, 'конец свечи: 4ч 15:00 МСК, вечером 23:50, ночью нет; 1ч; дневка 23:50');
  await p.evaluate(() => window.EWData.notifySend([{ title: 'SBER: сигнал — вход сейчас', text: 'купит', until: Date.now() + 3e6, open: { id: 'SBER_TQBR' } }, { title: 'GAZP: ПОКУПКА', text: 'x' }], 5));
  const n = await p.evaluate(() => window.__n.slice(-2));
  ok(n[0][0] === 'timer' && /^\d+$/.test(n[0][5]) && /Свеча закроется в \d\d:\d\d/.test(n[0][2]) && n[1][0] === 'open', 'уведомление с таймером — notifyTimer и время закрытия в тексте, без таймера — как раньше');
  console.log(bad.length ? 'не пройдено: ' + bad.length : 'все проверки пройдены');
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close();
})();
