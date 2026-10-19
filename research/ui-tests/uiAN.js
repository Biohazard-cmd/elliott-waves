const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  // настройки: карточка безубытка
  await p.click('#setBtn'); await p.waitForTimeout(300);
  const nt = (await p.$$('#setTabs button')).length; for (let k = 0; k < nt; k++) { await p.click('#setTabs button >> nth=' + k); await p.waitForTimeout(150); if (await p.$('#beMode')) break; }
  console.log('режим:', await p.$eval('#beMode', (e) => e.value), 'правило:', await p.$eval('#beRule', (e) => e.value));
  await p.selectOption('#beMode', 'auto'); await p.waitForTimeout(800);
  console.log('после auto: правил', await p.$$eval('#beRule option', (o) => o.length));
  const el = await p.$('#beMode'); await el.scrollIntoViewIfNeeded(); await p.screenshot({ path: 'shots/310-be-set.png' });
  await p.selectOption('#beMode', 'hint'); await p.waitForTimeout(500);
  await p.click('[data-close="settings"]'); await p.waitForTimeout(800);
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.fill('#trDate', '2026-07-21'); await p.click('#trGo');
  await p.waitForFunction(() => !document.querySelector('#trBar').hidden, null, { timeout: 30000 });
  await p.click('#trB'); await p.waitForTimeout(300);
  // стоп 1% ниже
  const px = await p.evaluate(() => parseFloat(document.querySelector('#trBar .prow .inf').innerText.split('·')[1].replace(',', '.')));
  console.log('вход ~', px);
  await p.fill('#trSL', String((px * 0.96).toFixed(2))); await p.click('#trSet'); await p.waitForTimeout(200);
  for (let k = 0; k < 250; k++) await p.click('#trSB');
  await p.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return o(b); }; });
  await p.click('#trCsv'); await p.waitForTimeout(500);
  const t = await p.evaluate(() => window.__csv); console.log(t.split('\\n').slice(0, 30).join('\\n'));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
