// 2.42: сворачиваемые карточки, «Что делали роботы» свёрнут, клик по сигналу → график, строка плана в тренажёре, живая цена, отмена несработавшего сигнала робота
let base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
// последняя свеча — незакрытая (как днём на бирже), чтобы проверить живую цену
base = base.replace('list.map((x) => ({', 'list.map((x, i) => ({').replace('isComplete: true', 'isComplete: i < list.length - 1');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  const q0 = await p.textContent('#quote'); await p.waitForTimeout(6500); const q1 = await p.textContent('#quote');
  console.log('живая цена:', q0.replace(/\\s+/g, ' '), '→', q1.replace(/\\s+/g, ' '));
  // сворачивание «Подсчёт волн»
  const cnt = '.card[data-fold="count"]';
  await p.click(cnt + ' > h3'); await p.waitForTimeout(200);
  console.log('подсчёт свёрнут:', await p.$eval(cnt, (e) => e.classList.contains('folded')), 'видно содержимое:', await p.$eval(cnt, (e) => [...e.children].filter((c) => c.tagName !== 'H3' && c.offsetHeight > 0).length));
  await p.screenshot({ path: 'shots/360-fold.png' });
  await p.reload(); await p.waitForTimeout(3000);
  console.log('после перезапуска свёрнут:', await p.$eval(cnt, (e) => e.classList.contains('folded')));
  await p.click(cnt + ' > h3'); await p.waitForTimeout(200);
  console.log('раскрыт:', !(await p.$eval(cnt, (e) => e.classList.contains('folded'))));
  // роботы: сигнал, который не исполнился, и плашка «Есть сигнал»
  await p.evaluate(() => { const now = Date.now();
    const mk = (key, name, tf, pend) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true, setups: { w3: true } }, cash: 100000, dep: 100000, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: 100000, dep: 100000 }], px: {}, seen: {}, pend, skipped: 0 });
    window.EWData.vaccSet({ on: true, startAt: now - 86400000 * 10, mmRate: 13, top: 50, flows: [], lastAccrue: now, accs: [
      mk('h4_week', '4 часа · неделя', '4h', { OZON_TQBR: { sigT: Date.parse('2026-10-15T07:00:00Z'), entry: 3500, stop: 3400, target: 3700, qty: 5 } })] });
    window.EWData.log('robot', '4 часа · неделя: вход сейчас, по открытию новой свечи: купит OZON ~5 шт (~3500), стоп 3400'); window.EWData.logFlush(); });
  await p.click('#robBtn'); await p.waitForTimeout(600);
  const fe = '.card[data-fold="robFeed"]';
  console.log('плашка:', (await p.textContent('.rsay .bub')).replace(/\\s+/g, ' '), '| кликабельна:', !!(await p.$('.rsay .bub[data-ropen]')));
  console.log('«Что делали роботы» свёрнут:', await p.$eval(fe, (e) => e.classList.contains('folded')), '|', (await p.textContent(fe + ' > h3')).trim());
  await p.click(fe + ' > h3'); await p.waitForTimeout(200);
  console.log('строк со ссылкой на график:', await p.$$eval(fe + ' .feed[data-ropen]', (l) => l.map((e) => e.dataset.ropen).join(', ')));
  await p.screenshot({ path: 'shots/361-robots.png' });
  await p.click('.rsay .bub'); await p.waitForTimeout(1500);
  console.log('после нажатия на плашку: роботы скрыты', await p.$eval('#robots', (e) => e.hidden), '| бумага', await p.evaluate(() => JSON.parse(localStorage.getItem('ew2.settings')).inst.ticker + ' ' + JSON.parse(localStorage.getItem('ew2.settings')).tf));
  // ход робота: свеча входа давно закрылась, сделки нет — заявка убирается с причиной
  await p.evaluate(() => window.EWData.robotStep(null, true)); await p.waitForTimeout(500);
  const V = await p.evaluate(() => window.EWData.vaccGet());
  console.log('заявка после хода:', JSON.stringify(V.accs[0].pend), '| журнал:', (await p.evaluate(() => { const L = window.EWData.logRead(); return L.app.items.concat(L.bg.items).filter((x) => x.k === 'robot').map((x) => x.m).slice(-4).join(' / '); })));
  // тренажёр: строка плана
  await p.click('#viewBtn'); await p.click('#trOpen'); await p.fill('#trDate', '2026-07-21'); await p.click('#trGo'); await p.waitForTimeout(3000);
  for (let k = 0; k < 6; k++) { await p.click('#trSB'); await p.waitForTimeout(150); }
  console.log('строка плана:', (await p.textContent('#trPlS').catch(() => 'нет')).replace(/\\s+/g, ' '));
  await p.click('#trPlS'); await p.waitForTimeout(300);
  console.log('окно плана открыто:', !(await p.$eval('#pop', (e) => e.hidden)), (await p.textContent('#pop')).replace(/\\s+/g, ' ').slice(0, 120));
  await p.screenshot({ path: 'shots/362-trainer-strip.png' });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
