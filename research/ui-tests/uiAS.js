const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  // «Сейчас»: открытая сделка — первой, над фазой
  console.log('сейчас:', (await p.$eval('#nowCard', (e) => e.innerText)).replace(/\\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: 'shots/350-main.png' });
  // табличка над графиком сворачивается и разворачивается
  await p.click('#hud [data-hudt]'); await p.waitForTimeout(300);
  console.log('табличка свёрнута:', await p.$eval('#hud', (e) => e.classList.contains('mini') + ' · ' + e.innerText.replace(/\\s+/g, ' ')));
  await p.screenshot({ path: 'shots/351-hudmini.png' });
  await p.click('#hud [data-hudt]'); await p.waitForTimeout(300);
  console.log('табличка развёрнута:', await p.$eval('#hud', (e) => !e.classList.contains('mini')), '| «Сейчас» не открылся от стрелки:', await p.$eval('#panel', (e) => e.scrollTop === 0));
  // темы: «Вид ▾» → Оформление
  await p.click('#viewBtn'); await p.waitForTimeout(200); await p.click('#pop [data-skin="black"]'); await p.waitForTimeout(300);
  await p.click('#viewBtn'); await p.waitForTimeout(200);
  for (const k of ['black', 'ocean', 'graphite', 'sepia']) {   // тема из настроек, снимок главного экрана
    if (k !== 'black') { await p.click('#setBtn'); await p.click('[data-tab="data"]'); await p.click('#setBody [data-skin="' + k + '"]'); await p.click('[data-close="settings"]'); }
    await p.waitForTimeout(300); await p.screenshot({ path: 'shots/352-skin-' + k + '.png' });
  }
  console.log('тема:', await p.evaluate(() => JSON.parse(localStorage.getItem('ew2.settings')).skin));
  // настройки → Данные: оформление и «О приложении»
  await p.click('#setBtn'); await p.click('[data-tab="data"]'); await p.waitForTimeout(300);
  console.log('о приложении:', (await p.textContent('#setBody')).match(/О приложении.{0,80}/)?.[0]);
  await p.click('#setBody [data-skin="ocean"]'); await p.waitForTimeout(300);
  console.log('фон после «Океан»:', await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
  await p.screenshot({ path: 'shots/353-set-data.png' });
  await p.click('#setBody [data-skin="night"]'); await p.click('[data-tab="anal"]'); await p.waitForTimeout(200);
  await p.evaluate(() => { const el = [...document.querySelectorAll('#setBody .sw')].find((x) => /AO 5\\/34/.test(x.innerText)); if (el) el.scrollIntoView(); });
  await p.screenshot({ path: 'shots/354-set-anal.png' }); await p.click('[data-close="settings"]');
  // роботы: «На график» у позиции другой бумаги / с часового графика
  await p.evaluate(() => { const now = Date.now();
    const mk = (key, name) => ({ key, name, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, cash: 50000, dep: 100000, mm: 0, pos: key === 'd_aggr' ? [{ id: 'OZON_TQBR', ticker: 'OZON', lot: 1, qty: 5, entry: 3800, entryT: now - 86400000 * 5, stop0: 3600, stop: 3600, cost: 19000 }] : [], closed: [], hist: [{ t: now, eq: 100000, dep: 100000 }], px: {}, seen: {}, pend: {}, skipped: 0 });
    window.EWData.vaccSet({ on: true, startAt: now - 86400000 * 10, mmRate: 13, top: 50, flows: [], lastAccrue: now, accs: [mk('d_long', 'основной'), mk('d_aggr', 'агрессивный')] }); });
  await p.click('#jrnBtn'); await p.waitForTimeout(300); await p.click('[data-jtab="robot"]'); await p.waitForTimeout(400);
  await p.click('[data-racc="d_aggr"] h3'); await p.waitForTimeout(300);
  console.log('после клика:', errs.join(' / ') || 'нет', (await p.textContent('#jrnBody')).replace(/\s+/g, ' ').match(/Позиции.{0,200}/)?.[0]);
  await p.screenshot({ path: 'shots/355-robot.png' }); console.log('кнопки:', await p.evaluate(() => [...document.querySelectorAll('[data-rgo],[data-racc]')].map((e) => e.tagName + ':' + (e.dataset.rgo || e.dataset.racc)).join(' ')));
  await p.click('[data-rgo="OZON_TQBR"]'); await p.waitForTimeout(2500);
  console.log('на графике после «На график»:', await p.textContent('#instTicker'), await p.textContent('#tfBtn'));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
