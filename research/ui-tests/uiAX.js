// 3.2: робот «Биткоин · тренд» — добавление, ход по свечам Binance (подменены записанными дневками BTC, последний день — сегодняшний), карточка, график BTC
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  const zlib = require('zlib'), DAY = 864e5;
  const BB = JSON.parse(zlib.gunzipSync(fs.readFileSync(require('path').join(__dirname, '../data/crypto/BTC_1d.json.gz'))));
  const today = Math.floor(Date.now() / DAY) * DAY, sh = today - BB[BB.length - 1][0];   // сдвиг: последняя свеча — сегодняшняя (ещё идёт)
  let bnCalls = 0;
  await ctx.route('https://data-api.binance.vision/**', (route) => { bnCalls++;
    const q = new URL(route.request().url()).searchParams, st = +q.get('startTime') || 0, en = +q.get('endTime') || Date.now(), lim = +q.get('limit') || 500;
    let rows = BB.map((r) => [r[0] + sh, String(r[1]), String(r[2]), String(r[3]), String(r[4]), '1', r[0] + sh + DAY - 1]).filter((r) => r[0] >= st && r[0] <= en);
    rows = st ? rows.slice(0, lim) : rows.slice(-lim);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows) }); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  // роботы уже запущены (основной + ручной), ходили только что
  await p.evaluate(() => { const D = window.EWData, now = Date.now();
    const mk = (key, name, tf) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, be: true, cash: 300000, dep: 300000, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0, lastRun: now });
    D.vaccSet({ on: true, startAt: now - 10 * 864e5, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [mk('d_long', 'основной', '1d'), Object.assign(mk('manual', 'мой (вручную)'), { manual: true, cfg: {} })] }); });
  await p.click('#robBtn'); await p.waitForTimeout(600);
  console.log('кнопка добавить:', !!(await p.$('#vAddB')));
  await p.click('#vAddB'); await p.waitForTimeout(4000);
  let A = await p.evaluate(() => window.EWData.vaccGet().accs.find((a) => a.key === 'btc_trend'));
  console.log('запросов к Binance:', bnCalls, '| сигнал:', A.sig && { доля: A.sig.share.toFixed(2), выше: A.sig.c > A.sig.sma }, '| позиций', A.pos.length, '| капитал $' + Math.round(A.cash + A.pos.reduce((s, x) => s + x.qty * (A.px[x.id] || x.entry), 0)));
  const card = await p.textContent('#robBody');
  console.log('карточка: $', /\\$1\\s000/.test(card), '| средней за 100', /средней за 100 дней/.test(card), '| 03:00', /03:00 МСК/.test(card));
  await (await p.$('.robhd')).screenshot({ path: __dirname + '/shots/AX1-btc-card.png' });
  console.log('элементов:', await p.evaluate(() => [...document.querySelectorAll('.robhd')].map((e) => e.tagName + ':' + e.textContent.length).join(',')));
  console.log('текст карточки:', (await p.textContent('.robhd')).replace(/\\s+/g, ' ').slice(0, 600));
  // история: робот 200 дней не ходил — разбирает пропущенные дни по порядку (входы, выходы, подгонка доли)
  await p.evaluate(() => { const V = window.EWData.vaccGet(), a = V.accs.find((x) => x.key === 'btc_trend'); Object.assign(a, { lastT: a.lastT - 200 * 864e5, pos: [], closed: [], cash: 1000, dep: 1000, lastRun: 0 }); window.EWData.vaccSet(V); });
  const ev = await p.evaluate(async () => (await window.EWData.robotStep(null, true, 'btc_trend')).map((e) => e.title));
  A = await p.evaluate(() => window.EWData.vaccGet().accs.find((a) => a.key === 'btc_trend'));
  const others = await p.evaluate(() => window.EWData.vaccGet().accs.filter((a) => !a.crypto).map((a) => a.key + ':' + (Date.now() - a.lastRun < 60e3 ? 'ходил' : 'нет')).join(' '));
  console.log('за 200 дней уведомлений:', ev.length, '| первые:', ev.slice(0, 3).join(' / '), '| закрытых частей', A.closed.length, '| капитал $' + Math.round(await p.evaluate(() => window.EWData.vEquity(window.EWData.vaccGet().accs.find((a) => a.key === 'btc_trend')))), '| остальные роботы:', others);
  console.log('журнал:', await p.evaluate(() => window.EWData.logRead().app.items.filter((x) => x.k === 'robot').slice(-3).map((x) => x.m).join(' / ')));
  console.log('рубли не тронуты: основной', await p.evaluate(() => window.EWData.vaccGet().accs[0].cash));
  await p.evaluate(() => { document.querySelector('#robots').hidden = true; }); await p.click('#robBtn'); await p.waitForTimeout(600);
  await p.click('[data-rnav="btc_trend"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: __dirname + '/shots/AX2-btc-history.png', fullPage: true });
  const lst = await p.textContent('#robBody');
  console.log('закрытые в $:', /Закрытые · Биткоин/.test(lst) && /\\$/.test(lst), '| лента:', /Биткоин · тренд: (купил|продал|воскресенье)/.test(lst));
  // график биткоина
  await p.click('#robBody button[data-ropen^="BTCUSDT_CRYPTO"]'); await p.waitForTimeout(3500);
  const hd = await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('ew2.settings')); return S.inst.id + ' ' + S.tf; });
  console.log('график:', hd, '| ошибка на панели:', (await p.textContent('#panel')).match(/Ошибка[^.]*\\./)?.[0] || 'нет');
  await p.screenshot({ path: __dirname + '/shots/AX3-btc-chart.png' });
  // будильник: ближайшее закрытие свечи роботов — дневки МСК (21:00 UTC) или сутки UTC (00:00)
  console.log('будильник:', new Date(await p.evaluate(() => window.EWData.nextAlarm())).toISOString());
  console.log(errs.length ? 'ошибки: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
})();`;
eval(head + tail);
