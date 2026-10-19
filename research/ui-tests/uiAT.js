const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  // проценты у альтернатив: в сумме ~100
  const pc = await p.$$eval('[data-alt]', (bs) => bs.map((b) => b.textContent));
  console.log('альтернативы:', pc.join(' | '), '· сумма', pc.reduce((a, t) => a + Number((t.match(/(\\d+)%/) || [0, 0])[1]), 0));
  // правила книги галочками для каждого подсчёта
  for (let k = 0; k < pc.length; k++) {
    await p.click('#alt' + k); await p.waitForTimeout(300);
    console.log('подсчёт ' + k + ':', await p.evaluate(() => { const c = document.querySelector('.rules'); const card = c ? c.closest('.card') : null;
      return (card ? card.querySelector('.big').textContent : '?') + ' :: ' + (c ? [...c.querySelectorAll('.rl')].map((r) => r.innerText.replace(/\\s+/g, ' ')).join(' / ') : 'нет правил'); }));
    const dv = await p.evaluate(() => { const e = [...document.querySelectorAll('#panel .small')].find((x) => /AO 5\\/34 на волне 5/.test(x.textContent)); return e ? e.textContent.slice(0, 90) : ''; });
    if (dv) console.log('   дивергенция:', dv);
  }
  await p.click('#alt0'); await p.waitForTimeout(300);
  await p.evaluate(() => { const c = document.querySelector('.rules'); if (c) c.closest('.card').scrollIntoView(); });
  await p.screenshot({ path: 'shots/360-rules.png' });
  // время по Фибоначчи: опция в настройках, по умолчанию выключена
  console.log('время по умолчанию:', await p.evaluate(() => !!JSON.parse(localStorage.getItem('ew2.settings')).view?.fibT));
  await p.click('#setBtn'); await p.click('[data-tab="anal"]'); await p.check('#fibTime'); await p.click('[data-close="settings"]'); await p.waitForTimeout(500);
  console.log('время:', await p.evaluate(() => { const e = [...document.querySelectorAll('#panel .small')].find((x) => /Время по Фибоначчи/.test(x.textContent)); return e ? e.textContent : 'нет'; }));
  await p.evaluate(() => { const e = document.querySelector('#panel'); if (e) e.scrollTop = 0; });
  await p.screenshot({ path: 'shots/361-fibtime.png' });
  // виджет: данные из последней проверки, без токена и сумм
  const wj = await p.evaluate(() => { let got = ''; window.Android = { widgetUpdate: (j) => { got = j; } };
    const st = JSON.parse(localStorage.getItem('ew2.settings')); st.watch = [{ id: 'SBER_TQBR', ticker: 'SBER', tf: '1d' }, { id: 'OZON_TQBR', ticker: 'OZON', tf: '1h' }]; localStorage.setItem('ew2.settings', JSON.stringify(st));
    window.EWData.store.set('last.SBER.1d', { at: Date.now(), phase: 'Фаза: импульс — идёт волна 3', plan: 'ПОКУПКА', px: '287.30' });
    window.EWData.store.set('last.OZON.1h', { at: Date.now(), phase: 'Фаза: не ясна — подсчёт слабый', plan: '', px: '3800' });
    window.EWData.widgetPush(); delete window.Android; return got; });
  console.log('виджет:', wj.replace(/<[^>]+>/g, ''), '| токен в данных:', /t\\.GOOD/.test(wj) ? 'ЕСТЬ!' : 'нет');
  // дивергенция на волне 5: ищем подсчёт с волной 5 у других бумаг
  let dvN = 0;
  for (const tk of ['OZON', 'CHMF', 'GMKN', 'NVTK']) {
    await p.evaluate((tk) => { const st = JSON.parse(localStorage.getItem('ew2.settings')); st.inst = { id: tk + '_TQBR', ticker: tk, name: tk, classCode: 'TQBR' }; localStorage.setItem('ew2.settings', JSON.stringify(st)); }, tk);
    await p.reload(); await p.waitForTimeout(3000);
    const nAlt = (await p.$$('[data-alt]')).length || 1;
    for (let k = 0; k < nAlt; k++) {
      if (await p.$('#alt' + k)) { await p.click('#alt' + k); await p.waitForTimeout(250); }
      const dv = await p.evaluate(() => { const e = [...document.querySelectorAll('#panel .small')].find((x) => /AO 5\\/34 на волне 5/.test(x.textContent)); return e ? document.querySelector('.rules').closest('.card').querySelector('.big').textContent + ' :: ' + e.textContent.slice(0, 110) : ''; });
      if (dv) { dvN++; console.log('дивергенция ' + tk + ':', dv); }
    }
  }
  console.log('подсказок о дивергенции:', dvN);
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
