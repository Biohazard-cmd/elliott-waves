const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  console.log('миграция:', await p.evaluate(() => JSON.parse(localStorage.getItem('ew2.settings')).cfgVer));
  await p.click('#setBtn'); await p.waitForTimeout(300);
  const nt = (await p.$$('#setTabs button')).length; for (let k = 0; k < nt; k++) { await p.click('#setTabs button >> nth=' + k); await p.waitForTimeout(150); if (await p.$('input[data-a="addSma200"]')) break; }
  console.log('чекбоксы:', !!(await p.$('input[data-a="addSma200"]')), !!(await p.$('input[data-a="addMktFast"]')));
  await p.click('input[data-a="addSma200"]'); await p.waitForTimeout(300);
  const el = await p.$('input[data-a="addSma200"]'); await el.scrollIntoViewIfNeeded(); await p.screenshot({ path: 'shots/240-set.png' });
  await p.click('[data-close="settings"]'); await p.waitForTimeout(800);
  // дневки
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); console.log(s.tf); });
  await p.click('#tfBtn').catch(() => {}); await p.waitForTimeout(300);
  const d = await p.$('[data-ptf="1d"]'); if (d) { await d.click(); await p.waitForTimeout(2500); }
  console.log('HUD:', await p.evaluate(() => document.querySelector('#hud').innerText));
  console.log('доп.:', await p.evaluate(() => (document.querySelector('#panel').innerText.match(/[^\\n]*по SMA200[^\\n]*/) || ['нет'])[0]));
  await p.screenshot({ path: 'shots/241-hud.png', clip: { x: 0, y: 0, width: 390, height: 330 } });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
