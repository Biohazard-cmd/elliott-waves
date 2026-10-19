const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(2500);
  await p.click('#setBtn'); await p.waitForTimeout(200);
  for (const t of await p.$$('#setTabs button')) { if (/Данные/.test(await t.textContent())) { await t.click(); break; } }
  await p.waitForTimeout(200); await p.selectOption('#maxBars', '1000'); await p.waitForTimeout(300);
  await p.click('[data-close="settings"]'); await p.waitForTimeout(1500);
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.fill('#trDate', '2026-08-20'); await p.click('#trGo');
  await p.waitForFunction(() => !document.querySelector('#trBar').hidden, null, { timeout: 30000 });
  for (let k = 0; k < 400; k++) await p.click('#trSB');
  await p.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return o(b); }; });
  await p.click('#trCsv'); await p.waitForTimeout(500);
  const t = await p.evaluate(() => window.__csv); const m = t.match(/[^\\n]*110%[^\\n]*/g) || []; console.log('событий «110%»:', m.length); console.log(m.slice(0, 4).join('\\n'));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
