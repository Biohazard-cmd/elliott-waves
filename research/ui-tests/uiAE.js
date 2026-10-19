const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3500);
  for (const [x0, w, fn] of [[1235, 3.4, 'shots/232-wedge-main.png'], [340, 4, 'shots/233-wedge-old.png']]) {
    await p.evaluate(([x0, w]) => { window.__view.barW = w; window.__view.x0 = x0; window.__view.init = true; window.dispatchEvent(new Event('resize')); }, [x0, w]);
    await p.waitForTimeout(600); await p.screenshot({ path: fn, clip: { x: 0, y: 100, width: 390, height: 420 } });
  }
  await p.click('#viewBtn'); await p.waitForTimeout(300); await p.click('[data-ph="wedge"]'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
  await p.mouse.click(5, 820); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__view.x0 = 1235; window.dispatchEvent(new Event('resize')); }); await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/234-wedge-off.png', clip: { x: 0, y: 100, width: 390, height: 420 } });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
