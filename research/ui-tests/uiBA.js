// 3.6: программа для компьютера — широкая раскладка (график слева, панель справа), перенос данных в файл и обратно.
// Нужен запущенный serve.js (PORT=8799 node serve.js). Мост компьютера подменён заглушкой { desktop: true }.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { window.Android = { desktop: true, setAlarm: () => {}, notifyOpen: () => {}, notify: () => {}, takeOpen: () => '' }; });
  await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(6000);
  const lay = await p.evaluate(() => { const r = (s) => { const x = document.querySelector(s).getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; };
    return { desk: document.body.classList.contains('desk'), chart: r('#chartWrap'), panel: r('#panel'), canvas: [document.querySelector('#chart').width, document.querySelector('#chart').height] }; });
  console.log('раскладка 1440×900:', JSON.stringify(lay));
  await p.screenshot({ path: 'shots/400-desk-main.png' });
  // роботы: два счёта с позицией и закрытой сделкой
  await p.evaluate(() => { const D = window.EWData, now = Date.now();
    const mk = (key, name, tf) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, cash: 90000, dep: 100000, mm: 0, pos: [{ id: 'SBER_TQBR', ticker: 'SBER', lot: 10, qty: 30, entry: 300, entryT: now - 5 * 864e5, side: 1, stop: 290, target: 330, cost: 9000, divs: 0 }], closed: [{ id: 'GAZP_TQBR', ticker: 'GAZP', qty: 100, entry: 130, exit: 136, entryT: now - 20 * 864e5, exitT: now - 12 * 864e5, side: 1, pnl: 600, R: 1.2, why: 'цель' }], hist: [], px: { SBER_TQBR: 305 }, seen: {}, pend: {}, skipped: 0, lastRun: now });
    D.vaccSet({ on: true, startAt: now - 30 * 864e5, mmRate: 13, top: 50, flows: [], lastAccrue: now, lastRun: now, accs: [mk('d_long', 'Дневки · основной', '1d'), mk('h4_week', '4 часа · неделя', '4h')] }); });
  await p.click('#robBtn'); await p.waitForTimeout(800);
  await p.screenshot({ path: 'shots/401-desk-robots.png' });
  await p.click('[data-close="robots"]'); await p.waitForTimeout(300);
  // перенос: выгрузка
  await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs [data-tab="data"]'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#xferExp').scrollIntoView());
  await p.screenshot({ path: 'shots/402-desk-transfer.png' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xferExp')]);
  const f = path.join(__dirname, 'shots', 'perenos.json'); await dl.saveAs(f);
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('файл:', dl.suggestedFilename(), '| роботов', doc.files['vacc.json'].accs.length, '| токен в файле:', JSON.stringify(doc).includes('t.GOOD'), '| счёт в файле:', 'account' in doc.settings);
  // на «другом» устройстве: свой токен, роботов нет
  await p.evaluate(() => { localStorage.removeItem('ew2f.vacc.json'); const s = JSON.parse(localStorage.getItem('ew2.settings')); s.token = 't.PC'; s.tf = '4h'; localStorage.setItem('ew2.settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000);
  await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs [data-tab="data"]'); await p.waitForTimeout(300);
  await p.setInputFiles('#xferFile', f); await p.waitForTimeout(4000);
  const after = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')), V = JSON.parse(localStorage.getItem('ew2f.vacc.json') || 'null'); return { token: s.token, tf: s.tf, robots: V ? V.accs.length : 0, account: s.account && s.account.id }; });
  console.log('после загрузки:', JSON.stringify(after), '(токен должен остаться t.PC, таймфрейм — из файла 1d, роботов 2)');
  // узкое окно — обычная раскладка телефона
  await p.setViewportSize({ width: 800, height: 900 }); await p.waitForTimeout(800);
  console.log('окно 800: широкая раскладка', await p.evaluate(() => document.body.classList.contains('desk')));
  await p.screenshot({ path: 'shots/403-desk-narrow.png' });
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(800);
  console.log('снова 1440: широкая раскладка', await p.evaluate(() => document.body.classList.contains('desk')));
  await p.screenshot({ path: 'shots/404-desk-back.png' });
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close();
})();
