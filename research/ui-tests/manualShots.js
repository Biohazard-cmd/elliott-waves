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
  // экран «Роботы» (3.4): учебные счета — позиции и сделки выдуманы, только для картинки
  await p.evaluate(() => { const D = window.EWData, now = Date.now(), DAY = 864e5;
    const P = (id, qty, entry, px, side) => ({ id: id + '_TQBR', ticker: id, qty, entry, cost: qty * entry, entryT: now - 3 * DAY, stop: entry * (side < 0 ? 1.04 : 0.96), target: entry * (side < 0 ? 0.92 : 1.06), side: side || 1, _px: px });
    const C = (id, pl, why, d) => ({ id: id + '_TQBR', ticker: id, qty: 10, entry: 100, exit: 100 + pl / 10, entryT: now - (d + 3) * DAY, exitT: now - d * DAY, pl, why });
    const mk = (key, name, tf, pos, closed, pend) => { const px = {}; pos.forEach((q) => { px[q.id] = q._px; delete q._px; });
      return { key, name, tf, cfg: { maxBars: 2000, riskPct: 1.5, longOnly: true }, be: true, cash: 100000 - pos.reduce((a, q) => a + q.cost, 0) + closed.reduce((a, c) => a + c.pl, 0), dep: 100000, mm: 0, pos, closed, hist: [], px, seen: {}, pend: pend || {}, skipped: 0, lastRun: now }; };
    D.vaccSet({ on: true, startAt: now - 30 * DAY, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [
      mk('d_long', 'основной', '1d', [P('SBER', 80, 300, 309)], [C('GAZP', 1200, 'цель', 12)]),
      mk('d_aggr', 'агрессивный', '1d', [P('MGNT', 5, 5000, 4950)], [C('NVTK', 2100, 'цель', 9)]),
      mk('h4_week', '4 часа · неделя', '4h', [P('TATN', 40, 600, 612), P('ROSN', 45, 500, 497)], [C('CHMF', 900, 'конец недели', 4), C('PLZL', -1200, 'стоп', 6), C('VTBR', 4, 'безубыток', 2)], { SNGS_TQBR: { qty: 900, entry: 25.1, stop: 24.2, target: 27, sigT: now - 4 * 36e5 } }),
      mk('h4_tri', 'продажи · треугольник', '4h', [], [C('AFLT', 1400, 'цель', 8)]),
      Object.assign(mk('manual', 'мой (вручную)', '1d', [P('YDEX', 2, 4000, 4100)], []), { manual: true, cfg: {} }) ] });
    const S = JSON.parse(localStorage.getItem('ew2.settings')); delete S.robotAcc; localStorage.setItem('ew2.settings', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(2500);
  await box('main.rob', '#robBtn');
  await p.click('#robBtn'); await p.waitForTimeout(800);
  for (const k of ['all', 'd_long', 'd_aggr', 'h4_week', 'h4_tri', 'manual']) await box('rob.' + k, '#robNav [data-rnav="' + k + '"]');
  await shot('robots');
  await p.click('#robNav [data-rnav="h4_week"]'); await p.waitForTimeout(500);
  await box('rob.body', '#robBody'); await shot('robot-week');
  require('fs').writeFileSync(OUT + '/boxes.json', JSON.stringify(boxes, null, 1));
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
