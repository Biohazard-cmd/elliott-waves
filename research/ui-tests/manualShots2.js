// Скриншоты для полной инструкции (manual/): тренажёр, «Вид», 🔔, «Мои сделки», вкладки настроек, сканер.
// node manualShots2.js <папка> → PNG-снимки, boxes.json и texts.json (текст экранов — для описаний)
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  const OUT = process.argv[2] || 'shots'; const boxes = {}, texts = {};
  const box = async (name, sel) => { const e = await p.$(sel); if (!e) return; const b = await e.boundingBox(); if (b) boxes[name] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const txt = async (name, sel) => { texts[name] = (await p.$eval(sel, (e) => e.innerText).catch(() => '')); };
  const shot = (n) => p.screenshot({ path: OUT + '/' + n + '.png' });
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3500);
  // «Вид»
  await p.click('#viewBtn'); await p.waitForTimeout(400); await txt('view', '#pop'); await box('view.tr', '#trOpen'); await shot('view');
  // 🔔
  await p.click('#viewBtn'); await p.waitForTimeout(200);
  await p.click('#bellBtn'); await p.waitForTimeout(400); await txt('bell', '#pop'); await shot('bell');
  await p.click('#bellBtn'); await p.waitForTimeout(200);
  // настройки
  await p.click('#setBtn'); await p.waitForTimeout(400);
  for (const t of ['ready', 'anal', 'acct', 'alerts', 'data']) { await p.click('[data-tab="' + t + '"]'); await p.waitForTimeout(300); await txt('set.' + t, '#setBody'); await shot('set-' + t);
    for (let k = 1; k <= 3; k++) { await p.evaluate((k) => { const b = document.querySelector('#setBody'); b.scrollTop = b.clientHeight * 0.85 * k; }, k); await p.waitForTimeout(150); await shot('set-' + t + '-' + k); }
    await p.evaluate(() => { document.querySelector('#setBody').scrollTop = 0; }); }
  await p.click('[data-close="settings"]'); await p.waitForTimeout(300);
  // поиск и сканер
  await p.click('#instBtn'); await p.waitForTimeout(500); await txt('search', '#search'); await shot('search');
  await p.click('#scanOpen'); await p.waitForTimeout(600); await txt('scanner', '#scanner'); await shot('scanner');
  await p.click('#scanGo').catch(() => {}); await p.waitForTimeout(6000); await txt('scanner2', '#scanner'); await shot('scanner2');
  await p.click('[data-close="scanner"]').catch(() => {}); await p.waitForTimeout(300);
  await p.click('[data-close="search"]').catch(() => {}); await p.waitForTimeout(300);
  // мои сделки
  await p.click('#jrnBtn'); await p.waitForTimeout(800); await txt('journal', '#journal'); await shot('journal');
  await p.click('[data-close="journal"]').catch(() => {}); await p.waitForTimeout(300);
  // тренажёр
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.waitForTimeout(300); await txt('trsetup', '#pop'); await shot('tr-setup');
  await p.fill('#trDate', '2026-07-21'); await p.click('#trGo'); await p.waitForTimeout(3000);
  for (let k = 0; k < 30; k++) { await p.click('#trSB'); await p.waitForTimeout(120); }
  await box('tr.bar', '#trBar'); for (const id of ['trPP', 'trS1', 'trSB', 'trW', 'trB', 'trSl', 'trTk', 'trPl', 'trPlS', 'trX']) await box('tr.' + id, '#' + id);
  await txt('trbar', '#trBar'); await shot('trainer');
  await p.click('#trB'); await p.waitForTimeout(300); for (let k = 0; k < 8; k++) { await p.click('#trSB'); await p.waitForTimeout(120); }
  await txt('trbar2', '#trBar'); await shot('trainer-pos');
  await p.click('#trPl').catch(() => {}); await p.waitForTimeout(300); await txt('trplan', '#pop'); await shot('trainer-plan');
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  require('fs').writeFileSync(OUT + '/texts.json', JSON.stringify(texts, null, 1));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
