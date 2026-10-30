// 3.13: робот «Охотник» (h4_fig) — две части на одном счёте (голова и плечи + пробой уровня): ход на моках, позиции помнят часть, экран робота
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  // запуск роботов кнопкой не трогаем: ставим счёт «Охотник» с началом 200 дней назад и делаем ход
  await p.evaluate(() => { const D = window.EWData, now = Date.now(), DAY = 864e5;
    const mk = (key, name, tf) => ({ key, name, tf, cfg: {}, be: true, startAt: now - 200 * DAY, cash: 300000, dep: 300000, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0 });
    D.vaccSet({ on: true, startAt: now - 200 * DAY, mmRate: 13, top: 50, flows: [], lastAccrue: now, accs: [mk('d_long', 'основной', '1d'), mk('h4_fig', 'Охотник', '4h')] }); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('#robBtn'); await p.waitForTimeout(800);
  // настройки счёта — из набора (как после «Обновить настройки роботов»)
  console.log('кнопка «Добавить Охотника» скрыта (уже есть):', !(await p.$('#vAddF')));
  const cfg = await p.evaluate(() => { const D = window.EWData, V = D.vaccGet(); return V.accs[1].cfg; });
  console.log('cfg до обновления пустой:', JSON.stringify(cfg));
  const upd = await p.$('#vUpd'); if (upd) { await upd.click(); await p.waitForTimeout(500); }
  const c2 = await p.evaluate(() => window.EWData.vaccGet().accs[1].cfg);
  console.log('части счёта:', (c2.subs || []).map((s) => s.key).join('+'), '| риск', c2.riskPct);
  const r = await p.evaluate(async () => { const D = window.EWData; await D.robotStep(null, true, 'h4_fig'); const a = D.vaccGet().accs.find((x) => x.key === 'h4_fig');
    return { pos: a.pos.map((z) => z.ticker + ':' + z.sub + ':' + window.EW2.SETUP_SHORT[z.setup]), closed: a.closed.map((z) => z.ticker + ':' + window.EW2.SETUP_SHORT[z.setup] + ':' + z.why + ':' + z.R), pend: Object.entries(a.pend).map(([k, v]) => k + ':' + v.sub), cash: Math.round(a.cash), seen: Object.keys(a.seen).slice(0, 4) }; });
  console.log('ход Охотника:', JSON.stringify(r));
  const lg = await p.evaluate(() => window.EWData.logRead().app.items.filter((x) => /Охотник/.test(x.m || x.msg || JSON.stringify(x))).slice(-6).map((x) => (x.m || x.msg || '').slice(0, 140)));
  console.log('журнал:', lg.join(' || '));
  await p.click('#robNav [data-rnav="h4_fig"]').catch(() => {}); await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + '/shots/BG1-hunter.png', fullPage: true });
  console.log('экран: «Охотник»', /Охотник/.test(await p.textContent('#robBody')));
  // набор на графике: фигуры в бэктесте
  await p.evaluate(() => { document.querySelector('#robots').hidden = true; });
  // набор «Охотник» на графике: OZON 4ч, сделки бэктеста с фигурами
  await p.click('#setBtn'); await p.waitForTimeout(500);
  await p.click('#setTabs [data-tab="ready"]').catch(() => {}); await p.waitForTimeout(400);
  await p.click('#setBody [data-preset="h4_fig"]'); await p.waitForTimeout(3500);
  await p.screenshot({ path: __dirname + '/shots/BG2-preset.png' });
  await p.evaluate(() => { document.querySelectorAll('.sheet').forEach((x) => { x.hidden = true; }); });
  const st = await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('ew2.settings')); return S.preset + ' ' + S.tf + ' ' + JSON.stringify(S.cfg.setups); });
  console.log('набор на графике:', st);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: __dirname + '/shots/BG3-chart.png' });
  console.log(errs.length ? 'ошибки: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
})();`;
eval(head + tail);
