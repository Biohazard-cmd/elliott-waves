// 2.40: карточка «Сигнал — вход сейчас» у робота на 4ч (время сигнальной свечи, «можно повторить сейчас») и «Ждут открытия» у дневного
const base = require('fs').readFileSync(require('path').join(__dirname, 'ui19.js'), 'utf8');
const head = base.slice(0, base.indexOf("  await p.goto("));
const tail = `  await p.goto('file://' + require('path').resolve(__dirname, '../../android/assets/index.html')); await p.waitForTimeout(3000);
  await p.evaluate(() => { const now = Date.now(), H = 3600000, s0 = Math.floor((now - 5 * H) / (4 * H)) * 4 * H;
    const mk = (key, name, tf, pend) => ({ key, name, tf, cfg: { maxBars: 2000, riskPct: 1, longOnly: true }, cash: 100000, dep: 100000, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: 100000, dep: 100000 }], px: {}, seen: {}, pend, skipped: 0 });
    window.EWData.vaccSet({ on: true, startAt: now - 86400000 * 10, mmRate: 13, top: 50, flows: [], lastAccrue: now, accs: [
      mk('d_long', 'основной', undefined, { SBER_TQBR: { sigT: now - 86400000, entry: 287.3, stop: 272.9, target: 298.3, qty: 30 } }),
      mk('h4_week', '4 часа · неделя', '4h', { IRAO_TQBR: { sigT: s0, entry: 2.64, stop: 2.4915, target: 2.8208, qty: 7100 } })] }); });
  await p.click('#jrnBtn'); await p.waitForTimeout(300); await p.click('[data-jtab="robot"]'); await p.waitForTimeout(400);
  for (const k of ['d_long', 'h4_week']) {
    await p.click('[data-racc="' + k + '"] h3'); await p.waitForTimeout(300);
    console.log(k + ':', (await p.textContent('#jrnBody')).replace(/\\s+/g, ' ').match(/(Ждут открытия|Сигнал — вход сейчас).{0,420}/)?.[0]);
  }
  await p.evaluate(() => { const c = [...document.querySelectorAll('#jrnBody h3')].find((h) => /Сигнал — вход/.test(h.textContent)); if (c) c.scrollIntoView(); });
  await p.screenshot({ path: 'shots/356-robot-pend4h.png' });
  console.log(errs.length ? errs.join('\\n') : 'ошибок нет'); await b.close();
})();`;
eval(head + tail);
