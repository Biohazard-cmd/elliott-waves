// 3.9: свой риск у робота (с предупреждением), «Обновить настройки» не включает 🛡, порог в тренажёре — свой (обычный график не трогает),
// строка «дата · шаг · капитал» тренажёра — отдельной строкой, таблица порогов не вылезает за край, время на экране — МСК.
// Нужен запущенный serve.js (PORT=8799 node serve.js).
const { chromium } = require('playwright');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), errs = [], bad = [];
  const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad.push(m); };
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { window.Android = { setAlarm: () => {}, notifyOpen: () => {}, notify: () => {}, takeOpen: () => '' }; });
  await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(3000);
  // роботы «как до 3.9»: агрессивный с риском 2% из настроек, основной с выключенным 🛡 и старым набором
  await p.evaluate(() => {
    const D = window.EWData, now = Date.now();
    const mk = (key, name, tf, cfg, be) => ({ key, name, tf, cfg, be, cash: 90000, dep: 100000, mm: 0, pos: [{ id: 'SBER_TQBR', ticker: 'SBER', lot: 10, qty: 30, entry: 300, entryT: now - 5 * 864e5, side: 1, stop: 301, stop0: 290, target: 330, cost: 9000, divs: 0 }], closed: [], hist: [{ t: now - 30 * 864e5, eq: 100000, dep: 100000 }], px: { SBER_TQBR: 310 }, seen: {}, pend: {}, skipped: 0, lastRun: now });
    D.vaccSet({ on: true, startAt: now - 30 * 864e5, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [mk('d_long', 'основной', '1d', { maxBars: 2000, riskPct: 1.5 }, false), mk('d_aggr', 'агрессивный', '1d', { maxBars: 2000, riskPct: 2 }, true)] });
    const s = JSON.parse(localStorage.getItem('ew2.settings')); s.cfgVer = 6; s.cfg.riskPct = 2; s.tf = '1h'; localStorage.setItem('ew2.settings', JSON.stringify(s));
  });
  await p.reload(); await p.waitForTimeout(3500);
  let V = await p.evaluate(() => window.EWData.vaccGet());
  ok(V.accs[1].riskOwn === 2 && V.accs[1].cfg.riskPct === 2, 'переход на 3.9: у агрессивного остался его риск 2% (свой)');
  ok(!V.accs[0].riskOwn, 'у основного 1,5% = рекомендуемый — «своего» нет');
  // агрессивный → ⚙ Настройки робота
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); s.robotAcc = 'd_aggr'; s.fold = Object.assign({}, s.fold, { robSet: false }); localStorage.setItem('ew2.settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000);
  await p.click('#robBtn'); await p.waitForTimeout(800);
  const box = p.locator('#rRisk');
  if (!(await box.count())) { await p.locator('[data-fold="robSet"] h3').click(); await p.waitForTimeout(300); }
  ok(await box.count() === 1, 'на карточке робота есть поле «Риск на сделку»');
  ok(await p.locator('[data-rrrec="d_aggr"]').count() === 1, 'есть кнопка «Вернуть 1%» (рекомендуемый агрессивного)');
  await box.fill('3'); await p.click('[data-rrisk="d_aggr"]'); await p.waitForTimeout(400);
  const warn = await p.locator('.note.warn').innerText().catch(() => '');
  ok(/Поставить риск 3% вместо 2%/.test(warn) && /15 стопов/.test(warn) && /агрессивного выше 1%/.test(warn) && /только для новых сделок/.test(warn), 'перед сохранением — предупреждение (просадка, рекомендуемый, только новые сделки)');
  await p.locator('[data-fold="robSet"]').screenshot({ path: 'shots/uiBD-1-risk-warn.png' });
  ok((await p.evaluate(() => window.EWData.vaccGet().accs[1].cfg.riskPct)) === 2, 'пока не подтвердили — риск прежний');
  await p.click('[data-rryes="d_aggr"]'); await p.waitForTimeout(400);
  V = await p.evaluate(() => window.EWData.vaccGet());
  ok(V.accs[1].cfg.riskPct === 3 && V.accs[1].riskOwn === 3 && V.accs[1].pos[0].qty === 30, 'после «Да» — риск 3%, открытая позиция не тронута');
  await p.click('[data-rrrec="d_aggr"]'); await p.waitForTimeout(300); await p.click('[data-rryes="d_aggr"]'); await p.waitForTimeout(300);
  V = await p.evaluate(() => window.EWData.vaccGet());
  ok(V.accs[1].cfg.riskPct === 1 && !V.accs[1].riskOwn, '«Вернуть рекомендуемый» — 1%, своего риска нет');
  const lg = await p.evaluate(() => window.EWData.logRead().app.items.filter((e) => e.k === 'robot' && /риск на сделку/.test(e.m)).map((e) => e.m));
  ok(lg.length >= 2, 'смена риска записана в журнал: ' + lg.slice(-1)[0]);
  // «Обновить настройки роботов» — у основного старый набор и выключенный 🛡
  await p.click('[data-racc=""]').catch(() => {});
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); s.robotAcc = ''; localStorage.setItem('ew2.settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000); await p.click('#robBtn'); await p.waitForTimeout(800);
  ok(await p.locator('#vUpd').count() === 1, 'кнопка «⬆ Обновить настройки роботов» есть (у основного старый набор)');
  await p.click('#vUpd'); await p.waitForTimeout(500);
  V = await p.evaluate(() => window.EWData.vaccGet());
  ok(V.accs[0].be === false, 'после обновления 🛡 у основного так и выключен');
  ok(V.accs[0].cfg.addAO === true && V.accs[0].cfg.riskPct === 1.5, 'набор обновлён (AO, риск 1,5%)');
  const lu = await p.evaluate(() => window.EWData.logRead().app.items.filter((e) => /основной: настройки обновлены/.test(e.m)).map((e) => e.m).slice(-1)[0] || '');
  ok(/основной: настройки обновлены \(/.test(lu) && !/безубыток/.test(lu), 'в журнале — что изменилось, без «безубыток 3×ATR»: ' + lu.slice(0, 120));
  await p.click('[data-close="robots"]'); await p.waitForTimeout(300);
  // время — МСК
  const q = await p.locator('#quote').innerText();
  ok(/МСК/.test(q), 'у цены над графиком подпись «МСК»: ' + q);
  // тренажёр: порог свой
  const sw0 = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('ew2.settings')).swings || {}));
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.fill('#trDate', '2026-07-21'); await p.click('#trGo'); await p.waitForTimeout(3500);
  const trSw = async () => p.evaluate(() => { const b = document.getElementById('swMinus'); return b ? b.nextElementSibling.textContent : ''; });
  const before = await trSw();
  // кнопка «+» порога в карточке «Порог и бэктест»
  await p.evaluate(() => { const b = document.getElementById('swPlus'); if (b) b.scrollIntoView(); });
  const plus = p.locator('#swPlus');
  ok(await plus.count() === 1, 'в тренажёре есть кнопки порога');
  await plus.click(); await p.waitForTimeout(1500); await plus.click(); await p.waitForTimeout(1500);
  const after = await trSw();
  ok(before && after && before !== after, 'порог системы в тренажёре изменился: ' + before + '% → ' + after + '%');
  const sw1 = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('ew2.settings')).swings || {}));
  ok(sw0 === sw1, 'порог обычного графика не тронут');
  const info = await p.evaluate(() => { const el = [...document.querySelectorAll('div.small.mut')].find((x) => /🕒/.test(x.textContent)); return el ? el.textContent.trim() : ''; });
  ok(/шаг \d+\/\d+ · капитал/.test(info), 'строка тренажёра целиком: ' + info);
  const wide = await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('#panel .card')].map((c) => c.scrollWidth - c.clientWidth).filter((x) => x > 2).length + '|' + (document.scrollingElement.scrollWidth - W); });
  ok(/^0\|/.test(wide), 'карточки панели не шире экрана (' + wide + ')');
  await p.screenshot({ path: 'shots/uiBD-2-trainer.png', fullPage: false });
  console.log(bad.length ? 'не пройдено: ' + bad.length : 'все проверки пройдены');
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close();
})();
