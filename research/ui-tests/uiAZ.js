// 3.4: экран «Роботы» — панель роботов внизу, «Все» (обзор), один робот на весь экран, «Ещё», цвета позиций/сигналов/закрытых
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  await p.evaluate(() => { const D = window.EWData, now = Date.now(), DAY = 864e5;
    const P = (id, qty, entry, px, side) => ({ id: id + '_TQBR', ticker: id, qty, entry, cost: qty * entry, entryT: now - 5 * DAY, stop: entry * (side < 0 ? 1.05 : 0.95), target: entry * (side < 0 ? 0.9 : 1.1), side: side || 1, _px: px });
    const C = (id, pl, why) => ({ id: id + '_TQBR', ticker: id, qty: 10, entry: 100, exit: 100 + pl / 10, entryT: now - 20 * DAY, exitT: now - 10 * DAY, pl, why });
    const mk = (key, name, tf, pos, closed, pend) => { const px = {}; pos.forEach((p) => { px[p.id] = p._px; delete p._px; });
      return { key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, be: true, cash: 200000, dep: 300000, mm: 0, pos, closed, hist: [], px, seen: {}, pend: pend || {}, skipped: 0, lastRun: now }; };
    D.vaccSet({ on: true, startAt: now - 30 * DAY, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [
      mk('d_long', 'основной', '1d', [P('SBER', 100, 300, 312)], [C('GAZP', 1200, 'цель'), C('LKOH', -800, 'стоп')]),
      mk('d_aggr', 'агрессивный', '1d', [P('MGNT', 5, 5000, 4900)], [C('NVTK', 3000, 'цель')]),
      mk('h4_week', '4 часа · неделя', '4h', [P('TATN', 50, 600, 615), P('ROSN', 40, 500, 492)], [C('CHMF', 900, 'конец недели'), C('PLZL', -500, 'стоп'), C('VTBR', 0.4, 'безубыток')], { SNGS_TQBR: { qty: 1000, entry: 25.1, stop: 24.2, target: 27, sigT: now - 4 * 36e5 } }),
      mk('h4_tri', 'продажи · треугольник', '4h', [P('AFLT', 300, 60, 58, -1)], []),
      Object.assign(mk('manual', 'мой (вручную)', '1d', [P('YDEX', 2, 4000, 4100)], []), { manual: true, cfg: {} }) ] });
    const S = JSON.parse(localStorage.getItem('ew2.settings')); delete S.robotAcc; localStorage.setItem('ew2.settings', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('#robBtn'); await p.waitForTimeout(800);
  const navTxt = async () => (await p.$$eval('#robNav .rnb', (b) => b.map((x) => x.textContent.replace(/\\s+/g, ' ').trim()))).join(' | ');
  console.log('панель (5 роботов + Все):', await navTxt());
  await p.screenshot({ path: __dirname + '/shots/AZ1-all.png' });
  console.log('обзор: строк роботов', await p.$$eval('#robBody .rrow', (x) => x.length), '| управление', !!(await p.$('#vRun')));
  await p.click('#robNav [data-rnav="h4_week"]'); await p.waitForTimeout(500);
  const t = await p.textContent('#robBody');
  console.log('4ч: сигнал', /Сигнал — вход сейчас/.test(t), '| позиции', /Позиции · 4 часа/.test(t), '| закрытые', /Закрытые · 4 часа/.test(t), '| нет чужих', !/основной/.test(t), '| нет управления', !(await p.$('#vRun')));
  await p.screenshot({ path: __dirname + '/shots/AZ2-h4week.png', fullPage: true });
  await p.click('#robNav [data-rnav="h4_tri"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: __dirname + '/shots/AZ3-tri.png' });
  // 6 роботов + «Все» > 6 — появляется «Ещё»
  await p.evaluate(() => { const D = window.EWData, V = D.vaccGet(), a = JSON.parse(JSON.stringify(V.accs[3])); Object.assign(a, { key: 'btc_trend', name: 'Биткоин · тренд', crypto: true, pos: [], closed: [], pend: {}, px: {}, cash: 1000, dep: 1000 }); V.accs.splice(4, 0, a); D.vaccSet(V); });
  await p.evaluate(() => { document.querySelector('#robots').hidden = true; }); await p.click('#robBtn'); await p.waitForTimeout(600);
  console.log('панель (6 роботов):', await navTxt());
  await p.click('#robNav [data-rnav="more"]'); await p.waitForTimeout(300);
  console.log('после «Ещё»:', await navTxt());
  await p.screenshot({ path: __dirname + '/shots/AZ4-more.png' });
  await p.click('#robNav .robmore [data-rnav="d_aggr"]'); await p.waitForTimeout(400);
  console.log('агрессивный открыт:', /Позиции · агрессивный/.test(await p.textContent('#robBody')), '| «Ещё» подсвечено:', await p.$eval('#robNav [data-rnav="more"]', (b) => b.classList.contains('on')));
  await p.click('#robBody [data-fold="robSet"] h3'); await p.waitForTimeout(200);
  await p.screenshot({ path: __dirname + '/shots/AZ5-aggr.png', fullPage: true });
  await p.click('#robNav [data-rnav="all"]'); await p.waitForTimeout(300);
  await p.click('#robBody [data-fold="robDay"] h3'); await p.waitForTimeout(200);
  await p.click('#robBody .rrow[data-racc="d_long"]'); await p.waitForTimeout(300);
  console.log('из обзора — основной:', /Позиции · основной/.test(await p.textContent('#robBody')));
  console.log(errs.length ? 'ошибки: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
})();`;
eval(head + tail);
