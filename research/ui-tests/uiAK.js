const base = require('fs').readFileSync('ui19.js', 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html') + ''); await p.waitForTimeout(3000);
  await p.evaluate(() => { const now = Date.now(), H = 3600000;
    const mk = (key, name) => ({ key, name, cfg: {}, cash: 90000, dep: 100000, mm: 120, pos: [{ id: 'SBER_TQBR', ticker: 'SBER', lot: 10, qty: 30, side: 1, entry: 284.2, entryT: now - 50 * H, stop0: 283.4, stop: 283.4, target: 300, cost: 8400, divs: 0, setup: 0 }],
      closed: [{ id: 'SBER_TQBR', ticker: 'SBER', side: 1, qty: 20, entry: 282, entryT: now - 300 * H, exit: 286, exitT: now - 200 * H, why: 'цель', pl: 80, divs: 0, setup: 0 }], hist: [{ t: now - 86400000, eq: 100000, dep: 100000 }], px: { SBER_TQBR: 285 }, seen: {}, pend: {}, skipped: 2 });
    window.EWData.vaccSet({ on: true, mm2: true, startAt: now - 86400000 * 20, mmRate: 13.5, top: 50, flows: [], lastAccrue: now, accs: [mk('d_long', 'основной'), mk('d_aggr', 'агрессивный')] }); });
  await p.evaluate(() => { window.__view.barW = 2.4; window.__view.x0 = 1850; window.dispatchEvent(new Event('resize')); }); await p.waitForTimeout(6000);
  await p.evaluate(() => { window.dispatchEvent(new Event('resize')); }); await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/280-robot-chart.png', clip: { x: 0, y: 100, width: 390, height: 430 } });
  await p.click('#robBtn'); await p.waitForTimeout(500);
  await p.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return o(b); }; });
  await p.click('#vCsv'); await p.waitForTimeout(500); console.log((await p.evaluate(() => window.__csv)).split('\\r\\n').slice(0, 9).join('\\n'));
  await p.click('[data-close="robots"]').catch(() => {}); await p.waitForTimeout(300);
  await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs button >> nth=0'); await p.waitForTimeout(200);
  await p.click('#presetBook'); await p.waitForTimeout(400);
  console.log('после «по книге»:', await p.evaluate(() => document.querySelector('#setBody .note').innerText), '|', await p.textContent('#presetBook'));
  await p.click('#resetCfg'); await p.waitForTimeout(400); console.log('после сброса:', await p.evaluate(() => document.querySelector('#setBody .note').innerText));
  const nt = (await p.$$('#setTabs button')).length; for (let k = 0; k < nt; k++) { await p.click('#setTabs button >> nth=' + k); await p.waitForTimeout(150); if (await p.$('input[data-n="quiet"]')) break; }
  console.log('без звука:', !!(await p.$('input[data-n="quiet"]')));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
