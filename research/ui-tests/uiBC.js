// 3.8: инструкция внутри приложения — экран 📖 (manual.html в рамке), кнопки 📖 открывают нужный раздел, цвета темы приложения,
// «Назад» закрывает, повторное открытие — с того же места; шапки экранов с 📖 не вылезают за край на узком телефоне (360).
// Нужен запущенный serve.js (PORT=8799 node serve.js).
const { chromium } = require('playwright');
const URL0 = 'http://localhost:' + (process.env.PORT || 8799) + '/';
(async () => {
  const b = await chromium.launch(), errs = [], bad = [];
  const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad.push(m); };
  const run = async (W, H, tag, desk) => {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    await p.addInitScript((dk) => { window.Android = { desktop: dk, setAlarm: () => {}, notifyOpen: () => {}, notify: () => {}, takeOpen: () => '' }; }, !!desk);
    await p.goto(URL0 + '?reset=1'); await p.waitForTimeout(3000);
    // тема «Океан» — инструкция должна взять её цвета
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); s.skin = 'ocean'; localStorage.setItem('ew2.settings', JSON.stringify(s)); });
    await p.reload(); await p.waitForTimeout(4000);
    const shown = () => p.evaluate(() => !document.getElementById('manual').hidden);
    const frame = () => p.frames().find((f) => /manual\.html/.test(f.url()));
    // где раздел внутри инструкции (0 — ровно сверху)
    const topOf = async (id) => (await frame().evaluate((i) => Math.round(document.getElementById(i).getBoundingClientRect().top), id));
    return { p, shown, frame, topOf };
  };

  // ---------- телефон 390 ----------
  { const { p, shown, frame, topOf } = await run(390, 844, 'телефон');
    const low = p.locator('#panel .manl[data-man=""]');
    ok(await low.count() === 1, 'внизу панели «Сейчас» есть кнопка «📖 Инструкция»');
    await low.click(); await p.waitForTimeout(2500);
    ok(await shown(), 'кнопка открывает экран инструкции');
    const f = frame();
    ok(!!f && /app=1/.test(f.url()), 'в рамке — manual.html в режиме приложения');
    const st = await f.evaluate(() => ({ inapp: document.documentElement.classList.contains('inapp'), head: getComputedStyle(document.querySelector('header.top')).display, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), sec: document.querySelectorAll('section.ch').length, y: scrollY }));
    ok(st.inapp && st.head === 'none', 'своя шапка инструкции спрятана (у экрана приложения своя)');
    ok(st.bg === '#0c1726', 'цвета — темы приложения «Океан» (--bg ' + st.bg + ')');
    ok(st.sec >= 14 && st.y < 5, 'все разделы на месте (' + st.sec + '), открыта с начала');
    await p.screenshot({ path: 'shots/uiBC-1-open.png' });
    ok(await p.evaluate(() => window.appBack()) === true && !(await shown()), '«Назад» закрывает инструкцию');

    // роботы → 📖 → раздел «Роботы»
    await p.click('#robBtn'); await p.waitForTimeout(600);
    await p.click('#robots [data-man="robots"]'); await p.waitForTimeout(1500);
    let t = await topOf('robots');
    ok(await shown() && t >= 0 && t < 30, 'на экране «Роботы» 📖 открывает раздел «Роботы» (сверху ' + t + ')');
    await p.screenshot({ path: 'shots/uiBC-2-robots.png' });
    // «↑ Оглавление»
    ok(await frame().evaluate(() => document.getElementById('toToc').classList.contains('on')), 'внизу справа видна кнопка «↑ Оглавление»');
    await frame().click('#toToc'); await p.waitForTimeout(1500);
    t = await topOf('toc');
    ok(t >= 0 && t < 30, '«↑ Оглавление» возвращает к списку разделов (сверху ' + t + ')');
    // переход по оглавлению — и закрыть: при открытии без раздела читаем с того же места (ролики выше могут сдвинуть страницу на несколько точек)
    await frame().click('nav.toc a[href="#tested"]'); await p.waitForTimeout(1500);
    const y1 = await frame().evaluate(() => Math.round(scrollY));
    await p.evaluate(() => window.appBack()); await p.evaluate(() => window.appBack());   // инструкция, потом «Роботы»
    ok(!(await shown()) && await p.evaluate(() => document.getElementById('robots').hidden), '«Назад» закрывает сначала инструкцию, потом «Роботы»');
    await p.click('#panel .manl[data-man=""]'); await p.waitForTimeout(800);
    const y2 = await frame().evaluate(() => Math.round(scrollY));
    ok(Math.abs(y2 - y1) < 30 && y1 > 1000, 'открыли снова — с того же места (' + y1 + ' → ' + y2 + ')');
    await p.evaluate(() => window.appBack());

    // настройки: кнопка ведёт к разделу про открытую вкладку
    await p.click('#setBtn'); await p.waitForTimeout(500);
    for (const [tab, sec] of [['acct', 'token'], ['ready', 'sets'], ['alerts', 'alerts'], ['data', 'settings']]) {
      await p.click('#setTabs [data-tab="' + tab + '"]'); await p.waitForTimeout(300);
      ok(await p.getAttribute('#manBtn', 'data-man') === sec, 'настройки, вкладка «' + tab + '» → раздел «' + sec + '»');
    }
    await p.click('#setTabs [data-tab="acct"]'); await p.waitForTimeout(300);
    await p.click('#manBtn'); await p.waitForTimeout(1500);
    t = await topOf('token');
    ok(await shown() && t >= 0 && t < 30, '«📖 Инструкция» в настройках («Счёт») открывает шаг про токен (сверху ' + t + ')');
    await p.screenshot({ path: 'shots/uiBC-3-token.png' });
    await p.evaluate(() => window.appBack()); await p.evaluate(() => window.appBack());

    // мои сделки и сканер
    await p.click('#jrnBtn'); await p.waitForTimeout(500);
    await p.click('#journal [data-man="mytrades"]'); await p.waitForTimeout(1500);
    t = await topOf('mytrades'); ok(await shown() && t >= 0 && t < 30, '«Мои сделки» → 📖 → шаг «Мои сделки» (сверху ' + t + ')');
    await p.evaluate(() => window.appBack()); await p.evaluate(() => window.appBack());
    await p.click('#instBtn'); await p.waitForTimeout(300); await p.click('#scanOpen'); await p.waitForTimeout(500);
    await p.click('#scanner [data-man="scan"]'); await p.waitForTimeout(1500);
    t = await topOf('scan'); ok(await shown() && t >= 0 && t < 30, '«Сканер» → 📖 → шаг «Сканер» (сверху ' + t + ')');
    // смена темы при открытой (уже загруженной) инструкции — новые цвета приходят с переходом
    await p.evaluate(() => window.appBack()); await p.evaluate(() => window.appBack()); await p.evaluate(() => window.appBack());
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ew2.settings')); return s; });
    await p.click('#setBtn'); await p.waitForTimeout(300); await p.click('#setTabs [data-tab="data"]'); await p.waitForTimeout(300);
    const sk = p.locator('#setBody [data-skin="sepia"]');
    if (await sk.count()) {
      await sk.first().click(); await p.waitForTimeout(400);
      await p.click('#manBtn'); await p.waitForTimeout(1200);
      const bg2 = await frame().evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
      ok(bg2 === '#1c1814', 'сменили тему на «Сепия» — инструкция перекрасилась (--bg ' + bg2 + ')');
    } else ok(false, 'не нашёл кнопку темы «Сепия» ([data-skin])');
    await p.close();
  }

  // ---------- узкий телефон 360: шапки с 📖 не вылезают ----------
  { const { p } = await run(360, 760, 'узкий');
    const over = async (sel) => p.evaluate((s) => { const h = document.querySelector(s + ' > header'); return h.scrollWidth - h.clientWidth; }, sel);
    await p.click('#robBtn'); await p.waitForTimeout(400); ok(await over('#robots') <= 0, '360: шапка «Роботы» помещается');
    await p.evaluate(() => window.appBack());
    await p.click('#jrnBtn'); await p.waitForTimeout(400); ok(await over('#journal') <= 0, '360: шапка «Мои сделки» помещается');
    await p.evaluate(() => window.appBack());
    await p.click('#setBtn'); await p.waitForTimeout(400); ok(await over('#settings') <= 0, '360: шапка «Настройки» с «📖 Инструкция» помещается');
    await p.screenshot({ path: 'shots/uiBC-4-set360.png' });
    await p.close();
  }

  // ---------- компьютер: широкое окно (мост компьютера — заглушка { desktop: true }) ----------
  { const { p, shown, topOf } = await run(1400, 860, 'широкое', true);
    ok(await p.evaluate(() => document.body.classList.contains('desk')), 'раскладка компьютера (график слева, панель справа)');
    await p.click('#robBtn'); await p.waitForTimeout(500);
    await p.click('#robots [data-man="robots"]'); await p.waitForTimeout(2500);
    const w = await p.evaluate(() => Math.round(document.getElementById('manual').getBoundingClientRect().width));
    const t = await topOf('robots');
    ok(await shown() && t >= 0 && t < 30 && w === 900, 'в широком окне 📖 тоже открывает раздел «Роботы», инструкция выезжает справа шириной ' + w);
    await p.screenshot({ path: 'shots/uiBC-5-wide.png' });
    await p.close();
  }

  console.log(bad.length ? 'НЕ ПРОЙДЕНО: ' + bad.join('; ') : 'все проверки пройдены');
  console.log(errs.length ? 'ошибки страницы: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
