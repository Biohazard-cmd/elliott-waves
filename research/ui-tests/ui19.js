const { chromium } = require('playwright');
const fs = require('fs');
const up = require('path').join(__dirname, '../data/mock/');
const src = {};
for (const fn of ['ew-SBER-1h-20261018-1048.json', 'ew-OZON-1h-20261018-1048.json', 'ew-CHMF-1h-20261018-1049.json', 'ew-GMKN-1h-20261018-1048.json', 'ew-NVTK-1h-20261018-1020.json']) {
  const d = JSON.parse(fs.readFileSync(up + fn, 'utf8')); src[d.inst.ticker] = d.bars.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
}
const Q = (x) => ({ units: String(Math.trunc(x)), nano: Math.round((x - Math.trunc(x)) * 1e9) });
let candleCalls = 0;
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://invest-public-api.tbank.ru/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}'), url = route.request().url();
    if (url.endsWith('/GetCandles')) {
      candleCalls++;
      const tk = String(body.instrumentId).replace('uid-', '').split('_')[0];
      let s = src[tk] || [];
      if (body.interval === 'CANDLE_INTERVAL_DAY') { const m = new Map(); for (const x of s) { const k = Math.floor((x.t + 3 * 36e5) / 864e5); const c = m.get(k); if (!c) m.set(k, Object.assign({}, x)); else { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; c.v += x.v; } } s = Array.from(m.values()); }
      const from = Date.parse(body.from), to = Date.parse(body.to);
      const list = s.filter((x) => x.t >= from && x.t < to).slice(-(body.limit || 2400));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candles: list.map((x) => ({ open: Q(x.o), high: Q(x.h), low: Q(x.l), close: Q(x.c), volume: String(Math.round(x.v)), time: new Date(x.t).toISOString(), isComplete: true })) }) });
    }
    if (url.endsWith('/GetInstrumentBy') && body.idType === 'INSTRUMENT_ID_TYPE_UID') { const tk = body.id.replace('uid-', ''); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instrument: { uid: body.id, ticker: tk, classCode: tk === 'OFZ' ? 'TQOB' : 'TQBR', name: tk + ' ПАО', lot: tk === 'SBER' ? 10 : 1, instrumentType: tk === 'OFZ' ? 'bond' : 'share' } }) }); }
    if (url.endsWith('/GetInstrumentBy')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instrument: { uid: 'uid-' + body.id, figi: 'F' + body.id, lot: body.id === 'SBER' ? 10 : 1, instrumentType: 'share', currency: 'rub' } }) });
    if (url.endsWith('/Shares')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instruments: ['SBER','OZON','CHMF','GMKN','NVTK','QIWI'].map((t) => ({ ticker: t, classCode: 'TQBR', uid: 'uid-' + t, name: t + ' ПАО', lot: t === 'SBER' ? 10 : 1, currency: 'rub', forQualInvestorFlag: t === 'QIWI', buyAvailableFlag: true })).concat([{ ticker: 'XYZ', classCode: 'SPBXM', currency: 'usd' }]) }) });
    if (url.endsWith('/GetAccounts')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [{ id: 'A1', name: 'Брокерский счёт', type: 'ACCOUNT_TYPE_TINKOFF', status: 'ACCOUNT_STATUS_OPEN' }, { id: 'A2', name: 'ИИС', type: 'ACCOUNT_TYPE_TINKOFF_IIS', status: 'ACCOUNT_STATUS_OPEN' }] }) });
    if (url.endsWith('/GetPortfolio')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ totalAmountPortfolio: { currency: 'rub', units: body.accountId === 'A1' ? '312450' : '50000', nano: 0 }, positions: [{ instrumentType: 'share', instrumentUid: 'uid-SBER', figi: 'FSBER', quantity: { units: '30', nano: 0 }, averagePositionPrice: { currency: 'rub', units: '284', nano: 0 }, currentPrice: { units: '287', nano: 0 } }] }) });
    if (url.endsWith('/GetOperationsByCursor')) { const T0 = src.SBER[src.SBER.length - 300].t, T1 = src.SBER[src.SBER.length - 200].t, T2 = src.SBER[src.SBER.length - 60].t;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasNext: false, items: !body.instrumentId ? [
        { id: 'z1', instrumentUid: 'uid-OZON', type: 'OPERATION_TYPE_SELL', date: new Date(T0).toISOString(), price: { units: '4000', nano: 0 }, quantity: '5', quantityDone: '5' },
        { id: 'z2', instrumentUid: 'uid-OZON', type: 'OPERATION_TYPE_BUY', date: new Date(T1).toISOString(), price: { units: '3800', nano: 0 }, quantity: '3', quantityDone: '3' },
        { id: 'z3', instrumentUid: 'uid-GMKN', type: 'OPERATION_TYPE_BUY', date: new Date(T0).toISOString(), price: { units: '120', nano: 0 }, quantity: '100', quantityDone: '100' },
        { id: 'z4', instrumentUid: 'uid-GMKN', type: 'OPERATION_TYPE_SELL', date: new Date(T2).toISOString(), price: { units: '131', nano: 0 }, quantity: '100', quantityDone: '100' },
        { id: 'z5', instrumentUid: 'uid-OFZ', type: 'OPERATION_TYPE_BUY', date: new Date(T1).toISOString(), price: { units: '950', nano: 0 }, quantity: '10', quantityDone: '10' },
        { id: 'op1', instrumentUid: 'uid-SBER', type: 'OPERATION_TYPE_BUY', date: new Date(T0).toISOString(), price: { units: '280', nano: 0 }, quantity: '20', quantityDone: '20' } ] : body.instrumentId === 'uid-SBER' ? [
        { id: 'op1', type: 'OPERATION_TYPE_BUY', date: new Date(T0).toISOString(), price: { units: '280', nano: 0 }, quantity: '20', quantityDone: '20' },
        { id: 'op2', type: 'OPERATION_TYPE_SELL', date: new Date(T1).toISOString(), price: { units: '290', nano: 0 }, quantity: '20', quantityDone: '20' },
        { id: 'op3', type: 'OPERATION_TYPE_BUY', date: new Date(T2).toISOString(), price: { units: '284', nano: 0 }, quantity: '30', quantityDone: '30' } ] : [] }) }); }
    if (url.endsWith('/GetLastPrices')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lastPrices: (body.instrumentId || []).map((u) => ({ instrumentUid: u, price: { units: '288', nano: 500000000 }, time: new Date().toISOString() })) }) });
    if (url.endsWith('/GetWithdrawLimits')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ money: [{ currency: 'rub', units: '20300', nano: 0 }] }) });
    if (url.endsWith('/GetDividends')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dividends: body.instrumentId === 'uid-SBER' ? [{ lastBuyDate: '2026-07-17T00:00:00Z', dividendNet: { currency: 'rub', units: '34', nano: 840000000 } }] : [] }) });
    return route.fulfill({ status: 404, body: '{}' });
  });
  await ctx.addInitScript(() => { if (!localStorage.getItem('ew2.settings')) localStorage.setItem('ew2.settings', JSON.stringify({ token: 't.GOOD', capital: 300000, inst: { id: 'SBER_TQBR', ticker: 'SBER', name: 'Сбербанк', classCode: 'TQBR' }, tf: '1h', scanList: 'top20', scanMinTurn: 0,
    favs: ['SBER', 'OZON', 'CHMF', 'GMKN', 'NVTK'].map((t) => ({ id: t + '_TQBR', ticker: t, name: t, classCode: 'TQBR' })), cfg: { maxBars: 2000, longOnly: true, addFlipExit: true, addStruct: true }, account: { id: 'A1', name: 'Брокерский счёт' }, accounts: [{ id: 'A1', name: 'Брокерский счёт' }] })); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(2500);
  const t = await p.textContent('#panel');
  console.log('дивиденды:', t.match(/История скорректирована[^.]*\./)?.[0]);
  console.log('объём:', t.match(/Объём:[^·]*·[^·]*·[^)]*\)/)?.[0] || t.match(/Объём[^.]*\./)?.[0]);
  await p.waitForTimeout(1500);
  const t1 = await p.textContent('#panel'); console.log('позиция:', t1.match(/На счёте:[^)]*\)[^)]*\)/)?.[0]);
  await p.click('#jrnBtn'); await p.waitForTimeout(800);
  console.log('дневник:', (await p.textContent('#jrnBody')).replace(/\s+/g,' ').slice(0, 420));
  await p.click('#jImport'); await p.waitForTimeout(1500);
  console.log('импорт:', await p.textContent('#jImpRes'));
  console.log('дневник после:', (await p.textContent('#jrnBody')).replace(/\s+/g,' ').slice(0, 700));
  console.log('записи:', JSON.stringify((await p.evaluate(() => Object.entries(localStorage).filter(([k]) => /journal/.test(k)).map(([k,v]) => JSON.parse(v)))).flat().map((j) => [j.ticker, j.side, j.lots, j.openP, j.closeP])));
  await p.screenshot({ path: 'shots/31-import.png' });
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close(); return;
  await p.click('[data-close="journal"]');
  // долгое нажатие
  const cvb = await (await p.$('#chart')).boundingBox();
  await p.mouse.move(cvb.x + 150, cvb.y + 150); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(200);
  console.log('меню:', (await p.textContent('#ctxMenu')).replace(/\s+/g,' '), 'hidden', await p.$eval('#ctxMenu', (e) => e.hidden));
  await p.click('#ctxBuy'); await p.waitForTimeout(300); console.log('форма:', (await p.textContent('#jrnBody')).replace(/\s+/g,' ').slice(0, 80), 'цена', await p.$eval('#jPrice', (e) => e.value));
  await p.click('#jCancel'); await p.click('[data-close="journal"]');
  await p.screenshot({ path: 'shots/29-ops.png' });
  // пресеты
  await p.click('#setBtn'); await p.waitForTimeout(200); await p.click('[data-preset="d_long"]'); await p.waitForTimeout(1500);
  console.log('tf после пресета:', await p.$eval('#tfs .on, #tfs button.on', (e) => e.textContent).catch(() => '?'), '| доп:', (await p.textContent('#panel')).match(/доп\.:[^\n]*/)?.[0]?.slice(0, 90));
  await p.click('[data-close="settings"]');
  // график на весь экран: двойной тап по ручке
  const gb = await (await p.$('#grip')).boundingBox(); await p.mouse.click(gb.x + gb.width / 2, gb.y + 8); await p.mouse.click(gb.x + gb.width / 2, gb.y + 8); await p.waitForTimeout(500);
  console.log('высота графика', await p.$eval('#chartWrap', (e) => e.getBoundingClientRect().height), 'панель', await p.$eval('#panel', (e) => e.getBoundingClientRect().height));
  await p.screenshot({ path: 'shots/30-fullchart.png' });
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close();
})();
