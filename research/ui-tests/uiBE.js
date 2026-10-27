// 3.9: ход робота на моках — сделки с подробностями в журнале (open/close/stop с данными), предупреждения о переносе стопа, ошибок нет.
const { chromium } = require('playwright');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), errs = [], bad = [];
  const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad.push(m); };
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { window.Android = { setAlarm: () => {}, notifyOpen: () => {}, notify: () => {}, takeOpen: () => '' }; });
  await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(3000);
  await p.click('#robBtn'); await p.waitForTimeout(500);
  await p.click('#vStart'); await p.waitForTimeout(1500);
  // сдвинуть старт на 60 дней назад и сходить всеми
  await p.evaluate(() => { const D = window.EWData, V = D.vaccGet(), back = 60 * 864e5; V.startAt -= back; V.lastRun = 0; for (const a of V.accs) { if (a.startAt) a.startAt -= back; a.lastRun = 0; a.hist[0].t -= back; } D.vaccSet(V); });
  await p.click('#vRun'); await p.waitForTimeout(1000);
  for (let k = 0; k < 120; k++) { const busy = await p.evaluate(() => /думают|Думает/.test(document.getElementById('robBody').innerText)); if (!busy) break; await p.waitForTimeout(1000); }
  const L = await p.evaluate(() => window.EWData.logRead().app.items.filter((e) => e.k === 'robot'));
  const opens = L.filter((e) => e.d && e.d.kind === 'open'), closes = L.filter((e) => e.d && e.d.kind === 'close'), stops = L.filter((e) => e.d && e.d.kind === 'stop'), hints = L.filter((e) => e.d && e.d.kind === 'stopHint');
  console.log('покупок', opens.length, 'закрытий', closes.length, 'переносов стопа', stops.length, 'предупреждений', hints.length);
  if (opens[0]) console.log('пример покупки:', JSON.stringify(opens[0].d).slice(0, 300));
  if (closes[0]) console.log('пример закрытия:', JSON.stringify(closes[0].d).slice(0, 300));
  if (hints[0]) console.log('пример предупреждения:', hints[0].m);
  ok(opens.length > 0 && opens.every((e) => e.d.ticker && e.d.entry && e.d.stop0 && e.d.setup !== undefined && e.d.sigT), 'покупки робота — с бумагой, входом, стопом, сетапом и временем сигнала');
  ok(closes.every((e) => e.d.exit && e.d.why && 'R' in e.d), 'закрытия — с выходом, причиной и R');
  const V = await p.evaluate(() => window.EWData.vaccGet());
  ok(V.accs.every((a) => a.closed.every((c) => 'R' in c)), 'у закрытых сделок счёта записан R');
  // выгрузка журнала
  await p.click('[data-close="robots"]').catch(() => {});
  await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs [data-tab="data"]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#logExp')]);
  const doc = require('fs').readFileSync(await dl.path(), 'utf8');
  const J = doc ? JSON.parse(doc) : {};
  console.log('роботы в выгрузке:', JSON.stringify((J.robots || []).map((r) => [r.key, r.riskPct, r.closed, r.sumR])));
  ok(J.robots && J.robots.length >= 4 && J.robots.every((r) => 'sumR' in r && (r.key === 'manual' || 'riskPct' in r)), 'в выгрузке журнала — сводка роботов (риск, сделки, сумма R)');
  ok(Array.isArray(J.journal) && J.tz === 'МСК', 'в выгрузке — «Мои сделки» и пояс времени (МСК)');
  console.log(bad.length ? 'не пройдено: ' + bad.length : 'все проверки пройдены');
  console.log(errs.length ? errs.join('\n') : 'ошибок нет'); await b.close();
})();
