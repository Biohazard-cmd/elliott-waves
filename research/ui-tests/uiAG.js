const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  await p.click('#tfBtn'); await p.waitForTimeout(300); await p.click('[data-ptf="1d"]'); await p.waitForTimeout(2500);
  console.log('дивиденды:', (await p.textContent('#panel')).match(/История скорректирована[^.]*\\./)?.[0]);
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.fill('#trDate', '2026-07-14'); await p.click('#trGo');
  await p.waitForFunction(() => !document.querySelector('#trBar').hidden, null, { timeout: 30000 });
  for (let k = 0; k < 12; k++) {
    await p.click('#trSB'); await p.waitForTimeout(80);
    const q = await p.evaluate(() => document.querySelector('#hud') ? document.body.innerText.split('\\n').slice(0, 6).join(' | ') : '');
    if (k % 3 === 0) console.log(k, q.slice(0, 120));
  }
  // пошагово внутри свечи
  for (let k = 0; k < 6; k++) { await p.click('#trS1'); }
  await p.screenshot({ path: 'shots/250-div-tr.png', clip: { x: 0, y: 0, width: 390, height: 520 } });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
