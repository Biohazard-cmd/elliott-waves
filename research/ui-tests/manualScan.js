// Скриншоты сканера для инструкции (manual/, раздел 8): node manualScan.js <папка>
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `
  // настоящие часовики Мосбиржи 2018–2026 (research/data/moex1h) — вместо пяти записанных бумаг
  for (const tk of ['SBER','GAZP','LKOH','ROSN','GMKN','NVTK','YDEX','T','MOEX','VTBR','MGNT','PLZL','TATN','SNGS','CHMF','NLMK','ALRS','AFLT','OZON','MTSS']) {
    const fn = require('path').join(__dirname, '../data/moex1h/' + tk + '.json.gz'); if (!fs.existsSync(fn)) continue;
    src[tk] = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(fn))).map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
  }
  // 4ч — склейка часовиков по корзинам UTC 0/4/8… (общая заглушка отдаёт часовики на любой запрос, кроме дня)
  await ctx.route('https://invest-public-api.tbank.ru/**/GetCandles', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.interval !== 'CANDLE_INTERVAL_4_HOUR') return route.fallback();
    const tk = String(body.instrumentId).replace('uid-', '').split('_')[0], m = new Map();
    for (const x of src[tk] || []) { const k = Math.floor(x.t / 144e5) * 144e5; const c = m.get(k); if (!c) m.set(k, Object.assign({}, x, { t: k })); else { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; c.v += x.v; } }
    const from = Date.parse(body.from), to = Date.parse(body.to);
    const list = Array.from(m.values()).filter((x) => x.t >= from && x.t < to).slice(-(body.limit || 2400));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candles: list.map((x) => ({ open: Q(x.o), high: Q(x.h), low: Q(x.l), close: Q(x.c), volume: String(Math.round(x.v)), time: new Date(x.t).toISOString(), isComplete: true })) }) });
  });
  const OUT = process.argv[2] || 'shots'; const texts = {};
  const shot = (n) => p.screenshot({ path: OUT + '/' + n + '.png' });
  const txt = async (name, sel) => { texts[name] = (await p.$eval(sel, (e) => e.innerText).catch(() => '')); };
  const scrollTo = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); const b = document.querySelector('#scanBody'); if (e && b) b.scrollTop = e.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 60; }, sel);
  const done = async () => { for (let k = 0; k < 240; k++) { const m = await p.$eval('#scanMsg', (e) => e.textContent).catch(() => ''); if (m === 'готово') return; await p.waitForTimeout(1000); } };
  const preset = async (k) => { await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('[data-tab="ready"]'); await p.waitForTimeout(200); await p.click('[data-preset="' + k + '"]'); await p.waitForTimeout(800); await p.click('[data-close="settings"]').catch(() => {}); await p.waitForTimeout(1500); };
  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3500);
  await preset('h4_fig');
  await p.click('#instBtn'); await p.waitForTimeout(500); await shot('scan-0-search');
  await p.click('#scanOpen'); await p.waitForTimeout(600); await shot('scan-1-start');
  await p.click('#scanGo'); await p.waitForTimeout(2500); await shot('scan-2-busy'); await done();
  await p.click('[data-close="scanner"]').catch(() => {}); await p.click('[data-close="search"]').catch(() => {}); await p.waitForTimeout(300);
  await preset('h4_week');
  await p.click('#instBtn'); await p.waitForTimeout(500); await p.click('#scanOpen'); await p.waitForTimeout(600);
  await p.click('#scanGo'); await done();
  await txt('scan', '#scanBody');
  await scrollTo('.card'); await p.waitForTimeout(200); await shot('scan-3-tabel');
  await scrollTo('[data-sf]'); await p.waitForTimeout(200); await shot('scan-4-table');
  await scrollTo('.scan tbody tr:nth-child(8)'); await p.waitForTimeout(200); await shot('scan-5-table2');
  await scrollTo('#scanBody .note'); await p.waitForTimeout(200); await shot('scan-6-legend');
  await p.click('[data-sf="good"]'); await p.waitForTimeout(300); await scrollTo('[data-sf]'); await p.waitForTimeout(200); await shot('scan-7-good');
  await p.click('[data-sf="all"]'); await p.click('[data-ss="R"]'); await p.waitForTimeout(300); await scrollTo('[data-sf]'); await p.waitForTimeout(200); await shot('scan-8-sortR');
  await scrollTo('.grp'); await p.waitForTimeout(200); await shot('scan-9-store');
  await p.click('[data-ss="sig"]'); await p.waitForTimeout(300);
  await p.click('.scan tbody tr:first-child'); await p.waitForTimeout(3500); await shot('scan-10-chart');
  require('fs').writeFileSync(OUT + '/scan-texts.json', JSON.stringify(texts, null, 1));
  console.log(errs.length ? 'ошибки: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
})();
`;
eval(head + tail);
