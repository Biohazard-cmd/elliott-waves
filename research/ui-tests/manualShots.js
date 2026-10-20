// Скриншоты для инструкции (manual/): тестовые свечи из ui19.js, телефонный экран 390×844.
// node manualShots.js <папка> → PNG-снимки и boxes.json (координаты кнопок для подсказок-номеров)
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  const OUT = process.argv[2] || 'shots'; const boxes = {};
  const box = async (name, sel) => { const e = await p.$(sel); if (!e) return; const b = await e.boundingBox(); if (b) boxes[name] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const shot = (n) => p.screenshot({ path: OUT + '/' + n + '.png' });
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3500);
  for (const [n, s] of [['inst', '#instBtn'], ['tf', '#tfBtn'], ['fav', '#favBtn'], ['bell', '#bellBtn'], ['refresh', '#refreshBtn'], ['jrn', '#jrnBtn'], ['set', '#setBtn'], ['chart', '#chartWrap'], ['grip', '#grip'], ['chips', '#chips'], ['panel', '#panel'], ['view', '#viewBtn'], ['sw', '#swChip'], ['now', '#nowCard']]) await box('main.' + n, s);
  await shot('main');
  await p.evaluate(() => document.querySelector('#panel').scrollIntoView()); await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(300); await shot('main-scroll');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#setBtn'); await p.waitForTimeout(400);
  await p.click('[data-tab="acct"]'); await p.waitForTimeout(300); await box('acct.tok', '#tok'); await box('acct.save', '#tokSave'); await box('acct.tabs', '#setTabs'); await shot('set-acct');
  await p.click('[data-tab="ready"]'); await p.waitForTimeout(300); await shot('set-ready');
  await p.click('[data-close="settings"]'); await p.waitForTimeout(300);
  await p.click('#instBtn'); await p.waitForTimeout(500); await shot('search');
  await p.click('[data-close="search"]').catch(() => p.keyboard.press('Escape')); await p.waitForTimeout(300);
  await p.click('#tfBtn'); await p.waitForTimeout(400); await shot('tf');
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
