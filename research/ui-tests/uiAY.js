// 3.2: цены с Мосбиржи без токена (запросы к iss.moex.com идут по-настоящему, через node — в браузере только подмена сети).
// Нужен запущенный serve.js (PORT=8788 node serve.js). NODE_USE_ENV_PROXY=1 — если интернет через прокси.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8788;
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 400, height: 860 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let nIss = 0;
  await p.route(/iss\.moex\.com/, async (r) => {
    nIss++;
    for (let k = 0; k < 3; k++) {
      try { const x = await fetch(r.request().url()); return r.fulfill({ status: x.status, body: await x.text(), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }); }
      catch (e) { if (k === 2) return r.abort(); }
    }
  });
  await p.goto(`http://localhost:${PORT}/`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ew2.settings', JSON.stringify({ token: '', inst: { id: 'GAZP_TQBR', ticker: 'GAZP', name: 'Газпром', classCode: 'TQBR' }, tf: '4h', cfg: { maxBars: 2000 } })); });
  const t0 = Date.now(); await p.reload();
  await p.waitForFunction(() => { const q = document.querySelector('#quote'); return q && q.innerText.trim(); }, null, { timeout: 120000 }).catch(() => {});
  console.log('график загрузился за', Math.round((Date.now() - t0) / 1000), 'с'); await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ quote: document.querySelector('#quote') && document.querySelector('#quote').innerText, banner: Array.from(document.querySelectorAll('.banner')).map((x) => x.innerText).join(' | ') }));
  console.log('без токена, GAZP 4ч:', st.quote, '\n  плашка:', st.banner);
  await p.screenshot({ path: __dirname + '/shots/AY1-no-token.png' });
  // поиск бумаги без токена — Мосбиржа
  const found = await p.evaluate(async () => (await window.EWData.findInstrument('', 'лукойл')).map((x) => x.id).slice(0, 3));
  console.log('поиск «лукойл»:', found.join(', '));
  // дневки и дивиденды из встроенной таблицы
  const dv = await p.evaluate(async () => { const D = window.EWData, inst = { id: 'MTSS_TQBR', ticker: 'MTSS', classCode: 'TQBR' }; const raw = await D.getBars('', inst, '1d', 2000, true); const r = await D.withDividends('', inst, raw, true); return { n: raw.length, adj: r.adj.length, first: new Date(raw[0].t).toISOString().slice(0, 10) }; });
  console.log('MTSS дневки:', dv.n, 'с', dv.first, '· поправок на дивиденды', dv.adj);
  // фоновая проверка без токена: бумага в слежении
  const ck = await p.evaluate(async () => { const D = window.EWData, s = D.settings(); s.watch = [{ id: 'SBER_TQBR', ticker: 'SBER', name: 'Сбербанк', tf: '1h' }]; D.saveSettings(s); const m = []; await D.checkAll((x) => m.push(x)); return { needBg: D.needBg(), log: m.slice(-2) }; });
  console.log('фон без токена: нужна проверка', ck.needBg, '·', ck.log.join(' | '));
  console.log('запросов к Мосбирже:', nIss);
  console.log(errs.length ? 'ошибки страницы: ' + errs.join('; ') : 'ошибок нет');
  await b.close();
})();
