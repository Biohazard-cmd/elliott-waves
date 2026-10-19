const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  await p.click('#viewBtn'); await p.waitForTimeout(300);
  console.log('слой в Виде:', await p.evaluate(() => !!document.querySelector('[data-ph="wedge"]')));
  await p.click('#trOpen'); await p.fill('#trDate', '2026-09-14'); await p.click('#trGo');
  await p.waitForFunction(() => !document.querySelector('#trBar').hidden, null, { timeout: 30000 });
  let got = '';
  for (let k = 0; k < 200 && !got; k++) { await p.click('#trSB'); got = await p.evaluate(() => { const m = document.body.innerText.match(/[^\\n]*клин завершён[^\\n]*/); return m ? m[0] : ''; }); }
  console.log('событие:', got || 'нет');
  await p.screenshot({ path: 'shots/230-wedge-tr.png' });
  for (let k = 0; k < 25; k++) await p.click('#trSB');
  await p.screenshot({ path: 'shots/231-wedge-tr2.png' });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
