// 3.14: «Общий счёт» (комбинация роботов) на экране «Роботы» и кнопка «⏳ Сделка стоит» у 4ч робота; ход с a.stall
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  await p.evaluate(() => { const D = window.EWData, now = Date.now(), DAY = 864e5;
    const mk = (key, name, tf, k) => ({ key, name, tf, cfg: {}, be: true, startAt: now - 200 * DAY, cash: 300000 * k, dep: 300000, mm: 0, pos: [], closed: [], px: {}, seen: {}, pend: {}, skipped: 0,
      hist: Array.from({ length: 60 }, (_, j) => ({ t: now - (60 - j) * DAY, eq: 300000 * (1 + (k - 1) * j / 60 + 0.02 * Math.sin(j / (k > 1 ? 4 : 6))), dep: 300000 })) });
    D.vaccSet({ on: true, startAt: now - 200 * DAY, mmRate: 13, top: 50, flows: [], lastAccrue: now, accs: [mk('d_long', 'основной', '1d', 1.05), mk('h4_fig', 'Охотник', '4h', 1.08), mk('h4_week', '4 часа · неделя', '4h', 0.98)] }); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('#robBtn'); await p.waitForTimeout(800);
  const t1 = await p.textContent('#robBody');
  console.log('карточка «Общий счёт»:', /Общий счёт/.test(t1), '| выбрано:', await p.evaluate(() => JSON.parse(localStorage.getItem('ew2.settings')).combo));
  console.log('строка:', (t1.match(/Вложено[^.]*\\./) || [''])[0], '|', (t1.match(/Наибольшая просадка[^.]*\\./) || [''])[0]);
  await p.click('[data-combo="h4_week"]'); await p.waitForTimeout(400);
  console.log('после «неделя»:', await p.evaluate(() => JSON.parse(localStorage.getItem('ew2.settings')).combo), ((await p.textContent('#robBody')).match(/Вложено[^·]*/) || [''])[0]);
  const card = await p.$('[data-fold="robCombo"]'); if (card) await card.screenshot({ path: __dirname + '/shots/BH1-combo.png' });
  await p.click('#robNav [data-rnav="h4_fig"]'); await p.waitForTimeout(500);
  const set = await p.$('[data-fold="robSet"] h3'); if (set) { await set.click(); await p.waitForTimeout(300); }
  console.log('кнопка «Сделка стоит» у 4ч:', !!(await p.$('[data-rstall="h4_fig"]')));
  await p.click('[data-rstall="h4_fig"]'); await p.waitForTimeout(400);
  console.log('a.stall:', await p.evaluate(() => window.EWData.vaccGet().accs.find((a) => a.key === 'h4_fig').stall), '|', (await p.textContent('#robBody')).match(/«сделка стоит»[^.]*\\./)?.[0]);
  await p.screenshot({ path: __dirname + '/shots/BH2-stall.png', fullPage: true });
  await p.click('#robNav [data-rnav="d_long"]'); await p.waitForTimeout(400);
  console.log('у дневного кнопки нет:', !(await p.$('[data-rstall="d_long"]')));
  await p.evaluate(() => { const D = window.EWData, W = D.vaccGet(); W.accs.find((a) => a.key === 'h4_week').stall = true; D.vaccSet(W); });
  const r = await p.evaluate(async () => { const D = window.EWData; await D.robotStep(null, true, 'h4_week'); const a = D.vaccGet().accs.find((x) => x.key === 'h4_week');
    return { pos: a.pos.map((z) => z.ticker + ':stall=' + z.stall), closed: a.closed.length }; });
  console.log('ход «недели» с «сделка стоит»:', JSON.stringify(r));
  console.log(errs.length ? 'ошибки: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
})();`;
eval(head + tail);
