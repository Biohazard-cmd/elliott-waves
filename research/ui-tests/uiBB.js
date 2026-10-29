// 3.7: пока идёт ход робота, правки роботов в приложении (пауза, пополнение, «Ход», сброс) не проходят — приложение просит подождать;
// после хода — проходят. Нужен запущенный serve.js (PORT=8799 node serve.js).
const { chromium } = require('playwright');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [], dialogs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await p.addInitScript(() => { window.Android = { setAlarm: () => {}, notifyOpen: () => {}, notify: () => {}, takeOpen: () => '' }; });
  await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(5000);
  await p.evaluate(() => { const D = window.EWData, now = Date.now();
    const mk = (key, name, tf) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, cash: 100000, dep: 100000, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: 100000, dep: 100000 }], px: {}, seen: {}, pend: {}, skipped: 0, lastRun: now });
    D.vaccSet({ on: true, startAt: now - 30 * 864e5, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [mk('d_long', 'основной', '1d'), mk('h4_week', '4 часа · неделя', '4h')] }); });
  await p.click('#robBtn'); await p.waitForTimeout(600);
  const V = () => p.evaluate(() => JSON.parse(localStorage.getItem('ew2f.vacc.json')));
  // ход идёт (метка, как её ставит robotStep)
  await p.evaluate(() => localStorage.setItem('ew2.robRun', String(Date.now())));
  await p.click('#vToggle'); await p.waitForTimeout(300);
  await p.fill('#vFlow', '5000'); await p.click('#vFlowOk'); await p.waitForTimeout(300);
  const v1 = await V();
  console.log('во время хода: окон «подождите»', dialogs.filter((m) => /идёт ход робота/.test(m)).length, '| роботы не на паузе:', v1.on, '| пополнение не внесено:', v1.flows.length === 0 && v1.accs[0].cash === 100000);
  // ход закончился
  await p.evaluate(() => localStorage.removeItem('ew2.robRun'));
  await p.click('#vToggle'); await p.waitForTimeout(300);
  await p.click('#vToggle'); await p.waitForTimeout(300);
  await p.fill('#vFlow', '5000'); await p.click('#vFlowOk'); await p.waitForTimeout(300);
  const v2 = await V();
  console.log('после хода: роботы снова включены:', v2.on, '| пополнение внесено:', v2.flows.length === 1 && v2.accs[0].cash === 105000, '| окон «подождите» всего', dialogs.filter((m) => /идёт ход робота/.test(m)).length);
  const ok = !v1.flows.length && v1.on && v2.on && v2.flows.length === 1 && dialogs.filter((m) => /идёт ход робота/.test(m)).length === 2;
  console.log(ok ? 'проверка пройдена' : 'ПРОВЕРКА НЕ ПРОЙДЕНА');
  console.log(errs.length ? 'ошибки страницы: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
