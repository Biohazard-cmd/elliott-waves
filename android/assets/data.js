// Котировки Т-Инвестиций (T-Invest API, REST), хранение настроек и проверка сигналов.
// Общий код для приложения (index.html) и фоновой проверки (worker.html).
(function (root) {
  'use strict';

  const HOSTS = ['https://invest-public-api.tbank.ru/rest', 'https://invest-public-api.tinkoff.ru/rest'];
  const MD = '/tinkoff.public.invest.api.contract.v1.MarketDataService/';
  const INS = '/tinkoff.public.invest.api.contract.v1.InstrumentsService/';

  // таймфреймы: интервал API, длительность свечи, окно одного запроса, предел свечей в ответе
  const TF = {
    '5m':  { api: 'CANDLE_INTERVAL_5_MIN',  ms: 300000,     win: 7,    limit: 2400, name: '5м' },
    '15m': { api: 'CANDLE_INTERVAL_15_MIN', ms: 900000,     win: 21,   limit: 2400, name: '15м' },
    '1h':  { api: 'CANDLE_INTERVAL_HOUR',   ms: 3600000,    win: 90,   limit: 2400, name: '1ч' },
    '4h':  { api: 'CANDLE_INTERVAL_4_HOUR', ms: 14400000,   win: 90,   limit: 700,  name: '4ч' },
    '1d':  { api: 'CANDLE_INTERVAL_DAY',    ms: 86400000,   win: 365 * 6, limit: 2400, name: '1д' },
    '1w':  { api: 'CANDLE_INTERVAL_WEEK',   ms: 604800000,  win: 365 * 5, limit: 300,  name: '1н' },
  };

  // ---------- хранилище ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ew2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ew2.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('ew2.' + k); } catch (e) { /* нет хранилища */ } },
  };

  function settings() {
    return Object.assign({
      token: '',
      inst: { id: 'SBER_TQBR', ticker: 'SBER', classCode: 'TQBR', name: 'Сбербанк', lot: 10 },
      tf: '1h',
      cfg: { maxBars: 2000 },
      watch: [],                // [{ id, ticker, name, tf }] — что проверять в фоне
      bgMinutes: 0,             // 0 — фоновая проверка выключена
      notify: { signal: true, exit: true, stop: true },
      view: { figs: [true, true, true, true, true], channels: true, be: false, trades: true, clean: false, panel: true },
    }, store.get('settings', {}));
  }
  function saveSettings(s) { store.set('settings', s); }

  // ---------- запросы ----------
  // в приложении на телефоне запрос делает сам Android (без ограничений браузера), в браузере — fetch
  const CERT_MSG = 'Сервер Т-Банка подписан сертификатом Минцифры, которому телефон пока не доверяет. Откройте ⚙ → «Сертификат Минцифры» → «Скачать с gu-st.ru».';
  let seq = 0; const pending = {};
  root.__httpDone = (id, status, text) => { const p = pending[id]; if (p) { delete pending[id]; p({ status, text }); } };
  function httpPost(url, token, body) {
    const A = root.Android;
    if (A && A.postAsync) {
      return new Promise((res) => { const id = ++seq; pending[id] = res; A.postAsync(id, url, token, JSON.stringify(body)); })
        .then((r) => {
          if (r.status === 0 && /CertPath|SSLHandshake|Trust anchor/i.test(r.text || '')) throw Object.assign(new Error(CERT_MSG), { fatal: true, cert: true });
          if (r.status === 0) throw new Error(r.text || 'нет связи');
          return r;
        });
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-app-name': 'elliott-waves-app' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, text: await r.text() }));
  }

  // ---------- журнал работы (лог) ----------
  // Приложение и фоновая проверка пишут в разные файлы, чтобы не затирать друг друга. Без токена, счетов и сумм.
  const LOG_MAX = 3000;
  let logName = 'log_app.json', logBuf = null, logTimer = 0, apiStat = null;
  function logInit(name) { logName = name; logBuf = null; apiStat = null; }
  function logLoad() { if (!logBuf) { const f = files.get(logName) || {}; logBuf = Array.isArray(f) ? f : (f.items || []); apiStat = (f && f.api) || {}; } }
  function log(kind, msg, data) {
    try {
      logLoad();
      const e = { t: Date.now(), k: kind, m: String(msg == null ? '' : msg).slice(0, 400) };
      if (data !== undefined) e.d = data;
      logBuf.push(e);
      if (logBuf.length > LOG_MAX) logBuf.splice(0, logBuf.length - LOG_MAX);
      clearTimeout(logTimer); logTimer = setTimeout(logFlush, 1500);
    } catch (x) { /* лог не должен ломать приложение */ }
  }
  function logFlush() { try { if (logBuf) files.set(logName, { items: logBuf, api: apiStat }); } catch (x) { /* место кончилось — не страшно */ } }
  function apiNote(method, ms, ok) { try { logLoad(); const a = apiStat[method] || (apiStat[method] = [0, 0, 0]); a[0]++; a[1] += ms; if (!ok) a[2]++; } catch (x) { /* не важно */ } }
  function logRead() {
    const rd = (n) => { const f = files.get(n) || {}; return Array.isArray(f) ? { items: f, api: {} } : { items: f.items || [], api: f.api || {} }; };
    logFlush();
    return { app: rd('log_app.json'), bg: rd('log_bg.json') };
  }
  function logClear() { files.set('log_app.json', { items: [], api: {} }); files.set('log_bg.json', { items: [], api: {} }); logBuf = []; apiStat = {}; }

  async function call(token, path, body) {
    const method = path.split('/').pop(), t0 = Date.now();
    try {
      const js = await call0(token, path, body);
      const ms = Date.now() - t0; apiNote(method, ms, true);
      if (ms > 5000) log('api', method + ': медленно, ' + ms + ' мс');
      return js;
    } catch (e) {
      apiNote(method, Date.now() - t0, false);
      log('api', method + ': ' + e.message, { ms: Date.now() - t0 });
      throw e;
    }
  }
  async function call0(token, path, body) {
    let lastErr = null;
    for (const h of HOSTS) {
      try {
        const r = await httpPost(h + path, token, body);
        r.ok = r.status >= 200 && r.status < 300;
        const txt = r.text;
        let js = null; try { js = JSON.parse(txt); } catch (e) { /* не JSON */ }
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Токен не подходит (ответ ' + r.status + '). Проверьте, что он скопирован целиком и не отозван.'), { fatal: true });
        if (!r.ok) {
          const msg = js && (js.message || js.description) ? (js.message || js.description) : txt.slice(0, 200);
          throw Object.assign(new Error('Ошибка API ' + r.status + ': ' + msg), { fatal: r.status >= 400 && r.status < 500 });
        }
        return js || {};
      } catch (e) {
        lastErr = e;
        if (e.fatal) throw e;   // ошибка запроса — второй адрес не поможет
      }
    }
    throw new Error('Нет связи с сервером брокера: ' + (lastErr ? lastErr.message : '') + '. Проверьте интернет.');
  }

  const q = (x) => (x ? Number(x.units || 0) + Number(x.nano || 0) / 1e9 : 0);

  function parseCandles(js) {
    const list = js.candles || [];
    return list.map((c) => ({
      t: Date.parse(c.time), o: q(c.open), h: q(c.high), l: q(c.low), c: q(c.close),
      v: Number(c.volume || 0), done: c.isComplete !== false && c.is_complete !== false,
    })).filter((b) => b.t && b.h > 0 && b.l > 0);
  }

  // свечи за период [from, to] окнами, от нового к старому, пока не наберём need
  // untilT — грузить не от «сейчас», а до этой даты (тренажёр подгружает младшие свечи кусками)
  async function loadCandles(token, instId, tf, need, sinceT, untilT) {
    const T = TF[tf];
    const out = new Map();
    let to = (untilT ? Math.min(untilT, Date.now()) : Date.now()) + T.ms;
    const minFrom = sinceT ? sinceT - T.ms : 0;
    for (let k = 0; k < 40; k++) {
      let from = to - T.win * 86400000;
      if (minFrom && from < minFrom) from = minFrom;
      const js = await call(token, MD + 'GetCandles', {
        instrumentId: instId, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
        interval: T.api, limit: T.limit,
      });
      const got = parseCandles(js);
      for (const b of got) out.set(b.t, b);
      if (minFrom && from <= minFrom) break;
      if (out.size >= need) break;
      if (!got.length && k > 2 && out.size > 0) break;          // дальше истории нет
      if (!got.length && k > 6) break;
      to = got.length ? Math.min(from, got[0].t) : from;
    }
    return Array.from(out.values()).sort((a, b) => a.t - b.t);
  }

  // кэш свечей: при обновлении догружаем только хвост
  async function getBars(token, inst, tf, need, force) {
    const key = 'bars.' + inst.id + '.' + tf;
    let cached = force ? null : readCache(key);
    let bars;
    if (cached && cached.bars && cached.bars.length > 50) {
      const lastT = cached.bars[cached.bars.length - 1].t;
      let fresh;
      try { fresh = await loadCandles(token, inst.id, tf, 0, lastT); }
      catch (e) {
        if (e.fatal) throw e;   // токен и т.п. — не про связь
        // нет связи — показываем сохранённые свечи
        const off = cached.bars.slice(-Math.max(need, 300)); off.offline = { at: cached.at || lastT, msg: e.message };
        return off;
      }
      const m = new Map(cached.bars.map((b) => [b.t, b]));
      for (const b of fresh) m.set(b.t, b);
      bars = Array.from(m.values()).sort((a, b) => a.t - b.t);
      if (bars.length < need * 0.8 && cached.full !== true) bars = await loadCandles(token, inst.id, tf, need);
    } else {
      bars = await loadCandles(token, inst.id, tf, need);
    }
    bars = bars.slice(-Math.max(need, 300));
    saveCache(key, bars, bars.length < need);
    return bars;
  }

  // свечи в хранилище компактно: [t, o, h, l, c, v, 0/1]; храним не больше 10 рядов
  function saveCache(key, bars, full) {
    const rows = bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v, b.done === false ? 0 : 1]);
    const idx = store.get('cacheIdx', []).filter((k) => k !== key);
    idx.push(key);
    while (idx.length > 10) store.del(idx.shift());
    if (!store.set(key, { r: rows, at: Date.now(), full })) {
      // не влезло — освобождаем место от старых рядов и пробуем ещё раз
      while (idx.length > 1 && !store.set(key, { r: rows, at: Date.now(), full })) store.del(idx.shift());
    }
    store.set('cacheIdx', idx);
  }
  function readCache(key) {
    const c = store.get(key, null);
    if (!c || !c.r) return null;
    return { bars: c.r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], done: a[6] !== 0 })), at: c.at, full: c.full };
  }

  async function findInstrument(token, query) {
    const js = await call(token, INS + 'FindInstrument', { query, apiTradeAvailableFlag: false });
    return (js.instruments || []).map((x) => ({
      id: x.uid || (x.ticker + '_' + x.classCode), ticker: x.ticker, classCode: x.classCode, name: x.name,
      type: x.instrumentType, lot: Number(x.lot || 1), api: x.apiTradeAvailableFlag,
    }));
  }

  // ---------- проверка сигналов для уведомлений ----------
  // возвращает список событий, которые ещё не сообщали; состояние хранится по инструменту и таймфрейму
  // skey — своё состояние у каждой записи слежения (на одной бумаге их может быть несколько), tag — подпись набора в заголовке
  function events(an, label, tf, notify, skey, tag) {
    const key = 'state.' + (skey || label + '.' + tf);
    const st = store.get(key, {});
    const out = [];
    const T = (i) => an.bars[i] ? an.bars[i].t : 0;
    const fx = (p) => fmtPrice(p, an.bars);
    const name = label + ' ' + (TF[tf] ? TF[tf].name : tf) + (tag ? ' · ' + tag : '');
    // 1) новый сигнал на вход
    if (an.plan && an.planActive) {
      const sigT = T(an.plan.sigBar);
      if (sigT && sigT !== st.sigT) {
        if (notify.signal && st.sigT !== undefined) out.push({
          title: name + ': ' + (an.plan.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА'),
          text: EW2.SETUP_NAME[an.plan.setup] + '. Вход ~' + fx(an.plan.entry) + ', стоп ' + fx(an.plan.stop) + (an.plan.notgt ? '' : ', цель ' + fx(an.plan.target)) + ', П/Р ' + an.plan.rr.toFixed(2),
        });
        st.sigT = sigT;
      }
    } else if (st.sigT === undefined) st.sigT = 0;
    // 2) фигура завершена — выход
    const lastPiv = an.main.length ? T(an.main[an.main.length - 1].i) : 0;
    if (an.phaseNext !== 0) {
      const ek = lastPiv + ':' + an.phaseNext;
      if (ek !== st.exitK) {
        if (notify.exit && st.exitK !== undefined) out.push({
          title: name + ': ВЫХОД — закрыть ' + (an.phaseNext > 0 ? 'продажи' : 'покупки'),
          text: an.title + '. ' + an.phase.text,
        });
        st.exitK = ek;
      }
    } else if (st.exitK === undefined) st.exitK = '';
    // 2б) дополнение: основной подсчёт развернулся против открытой сделки
    if (an.flipNow) {
      const fk = T(an.openTrade.iEntry) + ':' + lastPiv;
      if (fk !== st.flipK) {
        if (notify.exit && st.flipK !== undefined) out.push({
          title: name + ': ВЫХОД — подсчёт развернулся',
          text: (an.openTrade.side > 0 ? 'Покупка' : 'Продажа') + ' от ' + fx(an.openTrade.entry) + '. Теперь: ' + an.title + '. Закрыть, не дожидаясь стопа ' + fx(an.openTrade.stop),
        });
        st.flipK = fk;
      }
    } else if (st.flipK === undefined) st.flipK = '';
    // 2в) дополнение «после цели держать»: цель пройдена / стоп подтянут
    if (an.openTrade && an.openTrade.runner) {
      const ot2 = an.openTrade, rk = T(ot2.iEntry) + ':' + ot2.stop;
      if (rk !== st.runK) {
        if (notify.stop && st.runK !== undefined) out.push({
          title: name + ': цель ' + fx(ot2.target) + ' пройдена — держим',
          text: (ot2.side > 0 ? 'Покупка' : 'Продажа') + ' от ' + fx(ot2.entry) + '. Переставьте стоп на ' + fx(ot2.stop) + (Math.abs(ot2.stop - ot2.entry) < 1e-9 ? ' (безубыток)' : ' (под локальный минимум)'),
        });
        st.runK = rk;
      }
    } else if (st.runK === undefined) st.runK = '';
    // 3) открытая сделка индикатора: стоп в безубыток / подтянуть под минимум
    const ot = an.openTrade;
    if (ot) {
      const sh = an.shadow[an.shadow.length - 1];
      const last = sh && sh.steps.length ? sh.steps[sh.steps.length - 1] : null;
      const sk = T(ot.iEntry) + ':' + (last ? last.p : 0);
      if (last && sk !== st.stopK) {
        if (notify.stop && st.stopK !== undefined) out.push({
          title: name + ': подтяните стоп',
          text: (ot.side > 0 ? 'Покупка' : 'Продажа') + ' от ' + fx(ot.entry) + '. Стоп в безубыток / под минимум: ' + fx(last.p) + (last.why ? ' (' + last.why + ')' : '') + (sh.steps.length > 1 ? ' (ступень ' + sh.steps.length + ')' : ' — безубыток'),
        });
      }
      st.stopK = sk;
    } else if (st.stopK === undefined) st.stopK = '';
    // 4) уровни: сделка индикатора закрылась по цели/стопу; цена прошла уровень отмены подсчёта
    const lastT = an.bars.length ? an.bars[an.bars.length - 1].t : 0;
    if (notify.levels !== false && st.lastT) {
      for (const t of an.trades) {
        const xt = T(t.iExit);
        if (xt > st.lastT && (t.reason === 0 || t.reason === 1 || t.reason === 2 || t.reason === 7)) out.push({
          title: name + ': ' + (t.reason === 1 ? 'ЦЕЛЬ достигнута' : t.reason === 2 ? 'СРОК сделки вышел — закрыть' : 'сработал СТОП'),
          text: (t.side > 0 ? 'Покупка' : 'Продажа') + ' от ' + fx(t.entry) + ' закрыта по ' + fx(t.exitP) + ' (' + (t.R >= 0 ? '+' : '') + t.R.toFixed(2) + ' R).',
        });
      }
      const s0 = an.scen0, inv = an.targets && an.targets.inv;
      if (s0 && inv && st.invK !== inv) {
        let crossed = false;
        for (let i = an.bars.length - 1; i >= 0 && an.bars[i].t > st.lastT; i--) {
          const b = an.bars[i];
          if ((s0.dir > 0 && b.l <= inv && st.lastC > inv) || (s0.dir < 0 && b.h >= inv && st.lastC < inv)) crossed = true;
        }
        if (crossed) { out.push({ title: name + ': подсчёт отменён', text: 'Цена прошла ' + fx(inv) + ' — «' + an.title + '» больше не действует. Проверьте график.' }); st.invK = inv; }
      }
    }
    st.lastT = lastT; st.lastC = an.bars.length ? an.bars[an.bars.length - 1].c : 0;
    store.set(key, st);
    return out;
  }

  function decimals(bars) {
    let d = 2;
    const p = bars.length ? bars[bars.length - 1].c : 1;
    if (p < 1) d = 5; else if (p < 10) d = 4; else if (p < 100) d = 3; else if (p < 10000) d = 2; else d = 1;
    return d;
  }
  let decComma = !!store.get('settings', {}).decComma;
  function setDec(v) { decComma = !!v; }
  function fmtPrice(p, bars) { const t = Number(p).toFixed(decimals(bars)); return decComma ? t.replace('.', ',') : t; }

  // ---------- файловое хранилище (большие данные сканера) ----------
  // на телефоне — файлы приложения через мост Android, в браузере — localStorage/память
  const mem = {};
  const files = {
    get(name) {
      const A = root.Android;
      try {
        if (A && A.fileRead) { const t = A.fileRead(name); return t ? JSON.parse(t) : null; }
        const t = localStorage.getItem('ew2f.' + name); if (t) return JSON.parse(t);
      } catch (e) { /* повреждён — считаем, что нет */ }
      return mem[name] || null;
    },
    list(prefix) {
      const A = root.Android;
      if (A && A.listFiles) { try { return JSON.parse(A.listFiles(prefix)); } catch (e) { return []; } }
      const out = new Set(Object.keys(mem).filter((k) => k.startsWith(prefix)));
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ew2f.' + prefix)) out.add(k.slice(5)); } } catch (e) { /* нет хранилища */ }
      return Array.from(out);
    },
    set(name, obj) {
      const A = root.Android, txt = JSON.stringify(obj);
      if (A && A.fileWrite) return A.fileWrite(name, txt);
      try { localStorage.setItem('ew2f.' + name, txt); return true; } catch (e) { mem[name] = obj; return true; }
    },
  };

  // ---------- сведения об инструменте: uid, figi, лотность (кэш на 7 дней) ----------
  async function instInfo(token, inst) {
    const key = 'ins.' + inst.id, c = store.get(key, null);
    if (c && Date.now() - c.at < 7 * 86400000) return c;
    const isUid = /^[0-9a-f]{8}-/.test(inst.id);
    const body = isUid ? { idType: 'INSTRUMENT_ID_TYPE_UID', id: inst.id } : { idType: 'INSTRUMENT_ID_TYPE_TICKER', classCode: inst.classCode || 'TQBR', id: inst.ticker };
    const js = await call(token, INS + 'GetInstrumentBy', body);
    const x = js.instrument || {};
    const info = { at: Date.now(), uid: x.uid || '', figi: x.figi || '', lot: Number(x.lot || 1), type: x.instrumentType || '', currency: x.currency || 'rub' };
    store.set(key, info);
    return info;
  }

  // ---------- дивиденды и корректировка истории ----------
  // Цены у брокера не скорректированы: в день отсечки акция открывается ниже на размер дивиденда.
  // Чтобы этот провал не считался падением (ложные развороты, «выбитые» стопы), умножаем
  // все свечи до даты отсечки на (1 − дивиденд / цена закрытия перед отсечкой) — как в терминалах.
  async function getDividends(token, inst) {
    const key = 'div.' + inst.id, c = store.get(key, null);
    if (c && Date.now() - c.at < 86400000) return c.list;
    let list = [];
    try {
      const info = await instInfo(token, inst);
      if (info.type && info.type !== 'share') { store.set(key, { at: Date.now(), list }); return list; }
      const js = await call(token, INS + 'GetDividends', { instrumentId: info.uid || inst.id, figi: info.figi || undefined, from: new Date(Date.now() - 12 * 365 * 86400000).toISOString(), to: new Date(Date.now() + 120 * 86400000).toISOString() });
      list = (js.dividends || []).map((d) => ({ last: (d.lastBuyDate || '').slice(0, 10), d: q(d.dividendNet), cur: (d.dividendNet && d.dividendNet.currency) || 'rub' }))
        .filter((d) => d.last && d.d > 0 && /rub/i.test(d.cur));
    } catch (e) {
      if (e.fatal && /Токен/.test(e.message)) throw e;
      list = c ? c.list : [];          // не удалось — пользуемся старыми данными
    }
    store.set(key, { at: Date.now(), list });
    return list;
  }
  const mskDay = (t) => new Date(t + 3 * 3600000).toISOString().slice(0, 10);
  function adjustDividends(bars, divs) {
    if (!divs || !divs.length || !bars.length) return { bars, adj: [] };
    const out = bars.map((b) => Object.assign({}, b)), adj = [];
    const sorted = divs.slice().sort((a, b) => (a.last < b.last ? 1 : -1));   // от новых к старым
    for (const d of sorted) {
      // первая свеча после последнего дня покупки с дивидендом — день отсечки
      let k = out.findIndex((b) => mskDay(b.t) > d.last);
      if (k <= 0) continue;
      const before = bars[k - 1].c;   // настоящая цена: out[] уже поправлен более новыми дивидендами
      if (!(before > 0)) continue;
      const f = 1 - d.d / before;
      if (!(f > 0.5 && f < 1)) continue;
      for (let i = 0; i < k; i++) { const b = out[i]; b.o *= f; b.h *= f; b.l *= f; b.c *= f; }
      adj.push({ t: out[k].t, d: d.d, f });
    }
    return { bars: out, adj };
  }
  async function withDividends(token, inst, bars, on) {
    if (!on) return { bars, adj: [] };
    try { return adjustDividends(bars, await getDividends(token, inst)); } catch (e) { return { bars, adj: [], err: e.message }; }
  }

  // ---------- свечи для сканера: своё хранилище, догружаем только хвост ----------
  function scanNeed(tf, base) { return ['5m', '15m', '1h'].includes(tf) ? Math.max(base || 2000, 5000) : tf === '4h' ? Math.max(base || 2000, 3000) : (base || 2000); }
  async function getScanBars(token, inst, tf, need) {
    const name = 'scan_' + inst.id.replace(/[^A-Za-z0-9_-]/g, '_') + '_' + tf + '.json';
    const c = files.get(name);
    let bars, full = false;
    if (c && c.r && c.r.length > 50) {
      const old = c.r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], done: a[6] !== 0 }));
      const fresh = await loadCandles(token, inst.id, tf, 0, old[old.length - 1].t);
      const m = new Map(old.map((b) => [b.t, b]));
      for (const b of fresh) m.set(b.t, b);
      bars = Array.from(m.values()).sort((a, b) => a.t - b.t);
      full = c.full;
      if (bars.length < need * 0.8 && !full) { bars = await loadCandles(token, inst.id, tf, need); full = bars.length < need; }
    } else { bars = await loadCandles(token, inst.id, tf, need); full = bars.length < need; }
    bars = bars.slice(-need);
    files.set(name, { r: bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v, b.done === false ? 0 : 1]), at: Date.now(), full });
    return bars;
  }

  // ---------- «индекс рынка» из бумаг хранилища сканера (равные веса) ----------
  // Для дополнения «торговать по рынку»: up[i] = 1, если индекс выше своей средней за maLen точек.
  function buildMarket(tf, maLen) {
    const names = files.list('scan_').filter((n) => n.endsWith('_' + tf + '.json'));
    if (names.length < 5) return null;
    const series = [];
    for (const n of names) { const c = files.get(n); if (c && c.r && c.r.length > 50) series.push(c.r.filter((a) => a[6] !== 0)); }
    if (series.length < 5) return null;
    const tset = new Set(); for (const r of series) for (const a of r) tset.add(a[0]);
    const T = Array.from(tset).sort((a, b) => a - b);
    const ptr = series.map(() => 0), lastRatio = series.map(() => null), base = series.map((r) => r[0][4]);
    const v = [];
    for (const t of T) {
      let s = 0, k = 0;
      series.forEach((r, j) => {
        while (ptr[j] < r.length && r[ptr[j]][0] <= t) { lastRatio[j] = r[ptr[j]][4] / base[j]; ptr[j]++; }
        if (lastRatio[j] != null) { s += lastRatio[j]; k++; }
      });
      v.push(k ? s / k : 1);
    }
    const L = Math.max(2, maLen || 200), up = []; let sum = 0;
    for (let i = 0; i < v.length; i++) { sum += v[i]; if (i >= L) sum -= v[i - L]; up.push(i >= L - 1 ? (v[i] > sum / L ? 1 : 0) : 1); }
    const out = { at: Date.now(), tf, n: series.length, ma: L, t: T, up, v: v.map((x) => Math.round(x * 10000) / 10000) };
    files.set('mkt_' + tf + '.json', out);
    return out;
  }
  function getMarket(tf) { return files.get('mkt_' + tf + '.json'); }

  // ---------- брокерский счёт: стоимость портфеля и свободные рубли (токен «только для чтения» это позволяет) ----------
  const USR = '/tinkoff.public.invest.api.contract.v1.UsersService/';
  const OPS = '/tinkoff.public.invest.api.contract.v1.OperationsService/';
  async function getAccounts(token) {
    const js = await call(token, USR + 'GetAccounts', {});
    return (js.accounts || []).filter((a) => !a.status || a.status === 'ACCOUNT_STATUS_OPEN')
      .map((a) => ({ id: a.id, name: a.name || (a.type === 'ACCOUNT_TYPE_TINKOFF_IIS' ? 'ИИС' : 'Брокерский счёт'), type: a.type }));
  }
  async function getAccountMoney(token, accountId) {
    const pf = await call(token, OPS + 'GetPortfolio', { accountId, currency: 'RUB' });
    let free = null;
    try {
      const wl = await call(token, OPS + 'GetWithdrawLimits', { accountId });
      const rub = (wl.money || []).find((m) => /rub/i.test(m.currency || ''));
      free = rub ? q(rub) : 0;
    } catch (e) { /* не критично */ }
    const positions = (pf.positions || []).filter((p) => /share|etf|bond|futures/i.test(p.instrumentType || 'share') && p.instrumentType !== 'currency')
      .map((p) => ({ uid: p.instrumentUid || '', figi: p.figi || '', qty: q(p.quantity), avg: q(p.averagePositionPrice), cur: q(p.currentPrice), yield: q(p.expectedYield) }));
    return { at: Date.now(), total: q(pf.totalAmountPortfolio), free, positions };
  }

  // исполненные покупки/продажи по бумаге со счёта (для отметок на графике и дневника)
  async function getOperations(token, accountId, uid, fromMs) {
    const from = new Date(fromMs || Date.now() - 365 * 86400000).toISOString(), to = new Date(Date.now() + 86400000).toISOString();
    let list = [];
    try {
      let cursor = '';
      for (let k = 0; k < 10; k++) {
        const js = await call(token, OPS + 'GetOperationsByCursor', { accountId, instrumentId: uid || undefined, operationTypes: ['OPERATION_TYPE_BUY', 'OPERATION_TYPE_SELL'], from, to, cursor, limit: 500, state: 'OPERATION_STATE_EXECUTED', withoutCommissions: true, withoutTrades: true, withoutOvernights: true });
        list = list.concat(js.items || []);
        if (!js.hasNext || !js.nextCursor) break;
        cursor = js.nextCursor;
      }
    } catch (e) {
      if (e.fatal && /Токен/.test(e.message)) throw e;
      const js = await call(token, OPS + 'GetOperations', { accountId, from, to, state: 'OPERATION_STATE_EXECUTED', figi: '' });
      list = (js.operations || []).filter((o) => !uid || o.instrumentUid === uid);
    }
    return list.map((o) => {
      const type = String(o.type || o.operationType || '');
      const side = /SELL/.test(type) ? -1 : /BUY/.test(type) ? 1 : 0;
      const qty = Number(o.quantityDone != null && o.quantityDone !== '0' ? o.quantityDone : o.quantity || 0);
      return { id: o.id, uid: o.instrumentUid || '', figi: o.figi || '', t: Date.parse(o.date), side, qty: Math.abs(qty), price: q(o.price) };
    }).filter((o) => o.side !== 0 && o.qty > 0 && o.price > 0 && o.t).sort((a, b) => a.t - b.t);
  }

  // инструмент по uid (для сделок со счёта по всем бумагам)
  async function instByUid(token, uid) {
    const key = 'uid.' + uid, c = store.get(key, null);
    if (c) return c;
    const js = await call(token, INS + 'GetInstrumentBy', { idType: 'INSTRUMENT_ID_TYPE_UID', id: uid });
    const x = js.instrument || {};
    const info = { uid, ticker: x.ticker || '?', classCode: x.classCode || '', name: x.name || x.ticker || '', lot: Number(x.lot || 1), type: x.instrumentType || '' };
    store.set(key, info);
    return info;
  }

  // последние цены сразу по нескольким бумагам (по uid)
  async function getLastPrices(token, uids) {
    if (!uids.length) return {};
    const js = await call(token, MD + 'GetLastPrices', { instrumentId: uids });
    const out = {};
    for (const p of js.lastPrices || []) { const id = p.instrumentUid || p.figi; if (id) out[id] = { price: q(p.price), t: Date.parse(p.time || '') || Date.now() }; }
    return out;
  }

  // ---------- список акций Мосбиржи от брокера + средний дневной оборот (обновляется раз в сутки) ----------
  async function getUniverse(token, onProgress, force) {
    const c = files.get('universe.json');
    if (!force && c && c.list && Date.now() - c.at < 86400000) return c;
    const js = await call(token, INS + 'Shares', { instrumentStatus: 'INSTRUMENT_STATUS_BASE' });
    const shares = (js.instruments || []).filter((x) => x.classCode === 'TQBR' && /rub/i.test(x.currency || '') && !x.forQualInvestorFlag && x.buyAvailableFlag !== false);
    const prev = new Map((c && c.list ? c.list : []).map((x) => [x.id, x]));
    const list = [];
    for (let k = 0; k < shares.length; k++) {
      const x = shares[k], id = x.ticker + '_TQBR', lot = Number(x.lot || 1);
      if (onProgress) onProgress(k + 1, shares.length, x.ticker);
      let turn = 0;
      try {
        const now = Date.now();
        const dj = await call(token, MD + 'GetCandles', { instrumentId: x.uid || id, from: new Date(now - 45 * 86400000).toISOString(), to: new Date(now).toISOString(), interval: 'CANDLE_INTERVAL_DAY', limit: 60 });
        const days = parseCandles(dj).slice(-30);
        if (days.length) turn = days.reduce((s, b) => s + b.v * lot * b.c, 0) / days.length;
      } catch (e) {
        if (e.fatal && /Токен/.test(e.message)) throw e;
        turn = prev.has(id) ? prev.get(id).turn : 0;
      }
      list.push({ id, uid: x.uid || '', ticker: x.ticker, name: x.name, classCode: 'TQBR', lot, turn });
    }
    list.sort((a, b) => b.turn - a.turn);
    const out = { at: Date.now(), list };
    files.set('universe.json', out);
    return out;
  }

  // фоновая проверка всего списка
  async function checkAll(onLog, opt) {
    const s = settings();
    if (!s.token) return [];
    const all = [], t0 = Date.now(), budget = (opt && opt.budgetMs) || 0;
    // бумаги — по кругу с той, до которой не дошли в прошлый раз (если время кончилось)
    const n = s.watch.length, start = n ? (store.get('bgNext', 0) % n) : 0;
    const order = s.watch.map((_, k) => s.watch[(start + k) % n]);
    let done = 0;
    // роботы — первыми: ходят раз в час, и раньше до них часто не доходила очередь, если Android прерывал проверку
    try { const V = vaccGet(); if (V && V.on) { try { store.set('lastbg', Object.assign({}, store.get('lastbg', {}), { step: 'роботы' })); } catch (x) { /* не важно */ } const re = await robotStep(onLog, false); logFlush(); if (s.notify.robot !== false) all.push(...re); } }
    catch (e) { if (onLog) onLog('робот: ' + e.message); log('error', 'робот: ' + e.message); }
    for (const w of order) {
      if (budget && Date.now() - t0 > budget) { log('bg', 'время вышло: проверено ' + done + ' из ' + n + ', остальные — в следующий раз'); store.set('bgNext', (start + done) % n); break; }
      try { store.set('lastbg', Object.assign({}, store.get('lastbg', {}), { step: w.ticker + ' ' + w.tf, i: done + 1, n })); } catch (x) { /* не важно */ }
      done++;
      try {
        const T = TF[w.tf];
        const raw = await getBars(s.token, w, w.tf, s.cfg.maxBars || 2000, false);
        const bars = (await withDividends(s.token, w, raw, s.cfg.divAdj !== false)).bars;
        const done = bars.filter((b) => b.done !== false);
        // порог — тот же, что выставлен для бумаги в приложении (иначе уведомления расходились бы с графиком)
        // порог: запомненный при включении 🔔 (0 — авто); у старых записей — текущий из приложения
        const sw = w.sw != null ? w.sw : ((s.swings || {})[w.id + '.' + w.tf] || 0);
        const mkt = s.cfg.addMarket ? getMarket(w.tf) : null;
        const an = EW2.run(done, Object.assign({}, s.cfg, w.cfg || {}, { swingPct: sw, mkt }), T.ms);
        const skey = w.wid || (w.ticker + '.' + w.tf);
        const many = s.watch.filter((x) => x.id === w.id && x.tf === w.tf).length > 1;
        const ev = events(an, w.ticker, w.tf, s.notify, skey, many ? (w.label || '') : '');
        for (const e of ev) e.open = { id: w.id, ticker: w.ticker, name: w.name, classCode: w.classCode, tf: w.tf };
        all.push(...ev);
        const lastRec = { at: Date.now(), phase: an.phase.text, plan: an.plan && an.planActive ? (an.plan.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА') : '', px: done.length ? fmtPrice(done[done.length - 1].c, done) : '' };
        const prevRec = store.get('last.' + skey, null);
        store.set('last.' + skey, lastRec);
        store.set('last.' + w.ticker + '.' + w.tf, lastRec);
        if (onLog) onLog(w.ticker + ' ' + w.tf + ': ' + an.phase.text);
        // в лог — только перемены (иначе каждые 15 минут одно и то же)
        if (!prevRec || prevRec.phase !== lastRec.phase || prevRec.plan !== lastRec.plan) log('check', w.ticker + ' ' + w.tf + (w.label ? ' · ' + w.label : '') + ': ' + an.phase.text.replace('Фаза: ', ''), { sw: an.swing, bars: an.N, plan: lastRec.plan || undefined, ev: ev.length || undefined });
        for (const e of ev) log('notify', e.title, { text: e.text });
        const sigT = an.plan && an.planActive && an.bars[an.plan.sigBar] ? an.bars[an.plan.sigBar].t : 0;
        if (sigT && store.get('siglog.' + skey, 0) !== sigT) { store.set('siglog.' + skey, sigT); log('signal', w.ticker + ' ' + w.tf + ': ' + (an.plan.side > 0 ? 'покупка' : 'продажа'), { setup: an.plan.setup, entry: an.plan.entry, stop: an.plan.stop, target: an.plan.target, sigT, sw: an.swing, label: w.label || '' }); }
      } catch (e) {
        log('error', 'проверка ' + w.ticker + ' ' + w.tf + ': ' + e.message);
        if (onLog) onLog(w.ticker + ': ' + e.message);
        store.set('lasterr', { at: Date.now(), msg: w.ticker + ': ' + e.message });
      }
      logFlush();   // журнал — после каждой бумаги: если Android прервёт проверку, будет видно, где
    }
    if (done === n) store.set('bgNext', 0);
    try { store.set('lastbg', Object.assign({}, store.get('lastbg', {}), { step: 'уровни' })); } catch (x) { /* не важно */ }
    try { const pe = await checkPrices(s, onLog); for (const e of pe) log('notify', e.title, { text: e.text }); all.push(...pe); }
    catch (e) { if (onLog) onLog('уровни: ' + e.message); store.set('lasterr', { at: Date.now(), msg: 'уровни: ' + e.message }); }
    store.set('lastcheck', Date.now());
    widgetPush();
    return all;
  }

  // виджет на главном экране: бумаги с 🔔 (цена, план или фаза из последней проверки) и роботы (позиции, %).
  // Без токена, сумм и номеров счетов. Цвета — текущей темы (их записывает приложение: store 'wcolors').
  function widgetPush() {
    try {
      const A = root.Android; if (!A || !A.widgetUpdate) return;
      const s = settings(), col = store.get('wcolors', null) || { bg: '#14181e', ink: '#e8ecf1', mut: '#8d98a6', pos: '#3fbf7f', neg: '#ef5b5b' };
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      // порядок по важности: сигналы ▲/▼ → роботы → остальные фазы → «не ясна»; список в виджете листается.
      // У строки бумаги — что открыть по нажатию (как у уведомлений: { id, ticker, name, classCode, tf })
      const sig = [], other = [], unclear = [], robots = [], seen = {};
      const short = (ph) => { const t = String(ph || '').replace('Фаза: ', ''), m = t.match(/, идёт волна (\S+)/);
        return m ? (/вверх/.test(t) ? '↑ ' : /вниз/.test(t) ? '↓ ' : '') + 'идёт волна ' + m[1] : t.split(' — ')[0]; };
      for (const w of s.watch || []) {
        const key = w.wid || (w.ticker + '.' + w.tf); if (seen[key]) continue; seen[key] = 1;
        const r = store.get('last.' + key, null); if (!r) continue;
        const head = `<b>${esc(w.ticker)}</b> ${esc((TF[w.tf] || {}).name || w.tf)}${r.px ? ' · ' + esc(r.px) : ''} · `;
        const open = JSON.stringify({ id: w.id, ticker: w.ticker, name: w.name || w.ticker, classCode: w.classCode || 'TQBR', tf: w.tf });
        if (r.plan) sig.push({ h: head + `<font color="${r.plan === 'ПОКУПКА' ? col.pos : col.neg}"><b>${r.plan === 'ПОКУПКА' ? '▲' : '▼'} ${r.plan}</b></font>`, o: open });
        else (/не ясна/.test(r.phase || '') ? unclear : other).push({ h: head + `<font color="${col.mut}">${esc(short(r.phase))}</font>`, o: open });
      }
      const V = vaccGet();
      if (V && V.on) for (const a of V.accs || []) {
        const pc = a.dep ? (vEquity(a) / a.dep - 1) * 100 : 0;
        // характер и настроение робота: последняя сделка за 2 дня — в плюс 🎉, в минус 😢
        const lc = a.closed[a.closed.length - 1], mood = lc && Date.now() - lc.exitT < 2 * 86400000 ? (lc.pl >= 0 ? '🎉' : '😢') : '';
        robots.push({ h: `${({ d_aggr: '🔥', h4_week: '⏰', manual: '✋' })[a.key] || '🤖'}${mood} ${esc(a.name)}: позиций ${a.pos.length} · <font color="${pc >= 0 ? col.pos : col.neg}">${pc >= 0 ? '+' : '−'}${Math.abs(pc).toFixed(1).replace('.', decComma ? ',' : '.')}%</font>`, o: '' });
      }
      const list = sig.concat(robots, other, unclear);
      const t = store.get('lastcheck', 0), d = new Date(t || Date.now()), p2 = (n) => String(n).padStart(2, '0');
      const title = 'Волны Эллиотта · ' + (t ? 'проверено ' + p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) : 'ещё не проверялось');
      A.widgetUpdate(JSON.stringify({ title, rows: list.map((x) => x.h), opens: list.map((x) => x.o), bg: col.bg, ink: col.ink, mut: col.mut }));
    } catch (e) { /* виджет — не главное, проверку не ломаем */ }
  }

  // мои уровни цены и стоп/цель открытых сделок из дневника: смотрим 5-минутки с прошлой проверки
  function priceItems(s) {
    const items = [], pf = store.get('pfired', {}), jf = store.get('jfired', {});
    for (const a of s.palerts || []) if (!pf[a.id]) items.push({ key: a.id, kind: 'p', instId: a.instId, ticker: a.ticker, name: a.name, classCode: a.classCode, price: a.price, dir: a.dir, since: a.at, note: a.note || '' });
    if (s.notify && s.notify.mine === false) return items;
    for (const j of store.get('journal', []) || []) {
      if (j.closeT || !j.instId) continue;
      const base = { instId: j.instId, ticker: j.ticker, name: j.name, classCode: j.classCode || 'TQBR', since: j.openT, side: j.side, entry: j.openP };
      if (j.stop && !jf[j.id + ':s']) items.push(Object.assign({ key: j.id + ':s', kind: 's', price: j.stop, dir: j.side > 0 ? -1 : 1 }, base));
      if (j.target && !jf[j.id + ':t']) items.push(Object.assign({ key: j.id + ':t', kind: 't', price: j.target, dir: j.side > 0 ? 1 : -1 }, base));
    }
    return items;
  }
  async function checkPrices(s, onLog) {
    const items = priceItems(s), out = [];
    if (!items.length) return out;
    const now = Date.now(), lastP = store.get('lastpcheck', 0), byInst = {};
    for (const it of items) (byInst[it.instId] = byInst[it.instId] || []).push(it);
    const pf = store.get('pfired', {}), jf = store.get('jfired', {});
    for (const [id, list] of Object.entries(byInst)) {
      // с прошлой проверки (с запасом 10 мин), но не раньше создания уровня и не дальше 3 суток назад
      const from = Math.max(now - 3 * 86400000, Math.min(...list.map((x) => Math.max(x.since, lastP ? lastP - 600000 : 0))));
      const bars = await loadCandles(s.token, id, '5m', 0, from);
      if (!bars.length) continue;
      const fx = (p) => fmtPrice(p, bars), last = bars[bars.length - 1].c;
      for (const it of list) {
        const t0 = Math.max(it.since, lastP ? lastP - 600000 : 0);
        const hit = bars.find((b) => b.t >= t0 && (it.dir > 0 ? b.h >= it.price : b.l <= it.price));
        if (!hit) continue;
        const open = { id: it.instId, ticker: it.ticker, name: it.name, classCode: it.classCode };
        if (it.kind === 'p') {
          pf[it.key] = hit.t;
          out.push({ title: it.ticker + ': цена ' + fx(it.price) + ' ' + (it.dir > 0 ? 'достигнута снизу ▲' : 'достигнута сверху ▼'), text: (it.note ? it.note + '. ' : '') + 'Сейчас ' + fx(last) + '. Ваш уровень — оповещение больше не повторится.', open });
        } else {
          jf[it.key] = hit.t;
          const side = it.side > 0 ? 'покупки' : 'продажи';
          out.push(it.kind === 's'
            ? { title: it.ticker + ': СТОП вашей ' + side + ' ' + fx(it.price), text: 'Цена дошла до стопа из дневника (вход ' + fx(it.entry) + '). Сейчас ' + fx(last) + '. Проверьте, исполнилась ли заявка.', open }
            : { title: it.ticker + ': ЦЕЛЬ вашей ' + side + ' ' + fx(it.price), text: 'Цена дошла до цели из дневника (вход ' + fx(it.entry) + '). Сейчас ' + fx(last) + '.', open });
        }
        if (onLog) onLog(it.ticker + ': уровень ' + fx(it.price) + ' достигнут');
      }
    }
    store.set('pfired', pf); store.set('jfired', jf); store.set('lastpcheck', now);
    return out;
  }
  // нужна ли фоновая проверка вообще
  function needBg(s) { s = s || settings(); const V = files.get('vacc.json'); return !!(s.token && ((s.watch || []).length || priceItems(s).length || (V && V.on))); }

  // ---------- виртуальный счёт робота ----------
  // Робот повторяет сделки бэктеста по топ-50 акциям (дневки) на общем капитале: риск на сделку, позиция ≤ 25% счёта,
  // без плеча; если денег на сигнал нет — пропускает. Доход фонда ВИМ на свободные деньги (mmRate) считается отдельно (a.mm) — только для оценки, в торговле не участвует.
  // Пополнения и выводы реального счёта повторяются автоматически. Цены — реальные, комиссия брокера с каждой стороны.
  const VFILE = 'vacc.json', VFEE = 0.0005, VMAXPOS = 0.25, VTAX = 0.87;
  function vaccGet() {
    const V = files.get(VFILE);
    // 2.27: проценты фонда ВИМ больше не смешиваются с деньгами робота — считаются отдельно, только для оценки.
    // Раньше начисленное уже лежит в cash — вынимаем его оттуда один раз.
    if (V && V.accs && !V.mm2) { for (const a of V.accs) { if (a.mm) a.cash -= a.mm; } V.mm2 = true; files.set(VFILE, V); }
    return V;
  }
  function vaccSet(V) { files.set(VFILE, V); }
  async function getCashFlows(token, accountId, fromMs) {
    const from = new Date(fromMs).toISOString(), to = new Date(Date.now() + 86400000).toISOString(), out = [];
    let cursor = '';
    for (let k = 0; k < 5; k++) {
      const js = await call(token, OPS + 'GetOperationsByCursor', { accountId, from, to, cursor, limit: 300, state: 'OPERATION_STATE_EXECUTED', operationTypes: ['OPERATION_TYPE_INPUT', 'OPERATION_TYPE_OUTPUT'], withoutCommissions: true, withoutTrades: true, withoutOvernights: true });
      for (const o of js.items || []) { const a = q(o.payment); if (a) out.push({ id: o.id, t: Date.parse(o.date), amount: a }); }
      if (!js.hasNext || !js.nextCursor) break;
      cursor = js.nextCursor;
    }
    return out;
  }
  function vEquity(a) { return a.cash + a.pos.reduce((s, p) => s + (p.side < 0 ? -1 : 1) * p.qty * (a.px[p.id] || p.entry), 0); }
  // only — ключ одного счёта (кнопка «Ход» у робота); без него ходят все
  async function robotStep(onLog, force, only) {
    const s = settings(), V = vaccGet(), ev = [];
    if (!V || !V.on || !s.token) return ev;
    const one = only ? V.accs.find((a) => a.key === only) : null;
    if (only && !one) return ev;
    const now = Date.now();
    if (!force && now - (V.lastRun || 0) < 50 * 60000) return ev;
    const say = (m) => { if (onLog) onLog(m); };
    // 1) пополнения и выводы реального счёта
    if (s.account) {
      try {
        const fl = await getCashFlows(s.token, s.account.id, V.startAt);
        for (const f of fl) {
          if (f.t < V.startAt || V.flows.some((x) => x.id === f.id)) continue;
          V.flows.push(f);
          for (const a of V.accs) { a.cash += f.amount; a.dep += f.amount; }
          log('robot', (f.amount > 0 ? 'пополнение ' : 'вывод ') + Math.round(Math.abs(f.amount)) + ' ₽ — повторено на виртуальных счетах');
        }
      } catch (e) { log('robot', 'пополнения: ' + e.message); }
    }
    // 2) проценты фонда ликвидности на свободные деньги
    const dt = (now - (V.lastAccrue || V.startAt)) / 31557600000;
    // только оценка «а если бы свободные деньги лежали в ВИМ»: в деньги робота не попадает и на размер позиций не влияет
    if (dt > 0) { for (const a of V.accs) { const base = Math.max(0, a.cash) + (a.mm || 0); if (base > 0) a.mm = (a.mm || 0) + base * (V.mmRate / 100) * dt; } V.lastAccrue = now; }
    // 3) бумаги: топ-50 по обороту
    let U = files.get('universe.json');
    if (!U || !U.list || !U.list.length || now - U.at > 7 * 86400000) { try { U = await getUniverse(s.token, null, false); } catch (e) { log('robot', 'список акций: ' + e.message); } }
    if (!U || !U.list || !U.list.length) { log('robot', 'нет списка акций — откройте сканер и обновите список'); return ev; }
    const held = new Set(V.accs.flatMap((a) => a.pos.map((p) => p.id)));
    const list = U.list.filter((x) => x.turn >= 50e6).slice(0, V.top || 50);
    for (const x of U.list) if (held.has(x.id) && !list.includes(x)) list.push(x);   // бумаги в позиции — даже если выпали из топа
    // свечи — по таймфреймам роботов (дневки нужны всегда: ручной счёт берёт из них ATR); 2.39: робот «4 часа · неделя»
    const tfs = one ? [one.manual ? '1d' : one.tf || '1d'] : Array.from(new Set(['1d'].concat(V.accs.filter((a) => !a.manual).map((a) => a.tf || '1d'))));
    const dataBy = {}, mktBy = {};
    for (const tf of tfs) {
      const dd = dataBy[tf] = {};
      for (const x of list) {
        try {
          const raw = await getScanBars(s.token, x, tf, tf === '1d' ? 2000 : scanNeed(tf, 2000));
          const bars = (await withDividends(s.token, x, raw, true)).bars.filter((b) => b.done !== false);
          if (bars.length > 100) dd[x.id] = { x, bars };
        } catch (e) { say(x.ticker + ' ' + tf + ': ' + e.message); }
      }
      mktBy[tf] = buildMarket(tf, 200);
    }
    const data = dataBy['1d'] || dataBy[tfs[0]];
    const T = (an, i) => (an.bars[i] ? an.bars[i].t : 0);
    for (const a of V.accs) {
      if (one && a !== one) continue;
      const aLast = a.lastRun || V.lastRun || 0;   // прошлый ход этого счёта: робот мог ходить и один, по своей кнопке
      const tag = (a.manual ? 'Вирт. счёт · ' : 'Робот · ') + a.name, atf = a.manual ? '1d' : a.tf || '1d', mkt = mktBy[atf], aStart = a.startAt || V.startAt;
      const sold = (p, px, t, why) => {
        let pl;
        if (p.side < 0) { const val = p.qty * px * (1 + VFEE); a.cash -= val; pl = p.cost - val; }   // шорт: откупили бумаги
        else { const val = p.qty * px * (1 - VFEE); a.cash += val; pl = val - p.cost + (p.divs || 0); }
        a.closed.push({ id: p.id, ticker: p.ticker, side: p.side || 1, qty: p.qty, entry: p.entry, entryT: p.entryT, exit: px, exitT: t, why, pl, divs: p.divs || 0, setup: p.setup, addOf: p.addOf });
        a.pos = a.pos.filter((z) => z !== p);
        const msg = `${p.side < 0 ? 'откупил' : 'продал'} ${p.ticker} ${p.qty} шт по ${fmtPrice(px, [{ c: px }])} (${why}), ${pl >= 0 ? '+' : '−'}${Math.round(Math.abs(pl))} ₽`;
        log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': ' + msg.split(' (')[0], text: msg, open: { id: p.id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
      };
      // ручной счёт: стопы и цели, поставленные вами, проверяем по 5-минуткам с прошлой проверки
      if (a.manual) {
        for (const p of a.pos.slice()) {
          try {
            const from = Math.max(p.lastChk || p.entryT, now - 5 * 86400000);
            const bars = await loadCandles(s.token, p.id, '5m', 0, from);
            // безубыток 3×ATR (кнопка 🛡 у ручного счёта): ATR — по дневкам до дня входа
            let beLv = 0, atrLim = 0;
            if (a.be && !p.beOn) {
              const dd = data[p.id] && data[p.id].bars, k = dd ? dd.findIndex((x) => x.t > p.entryT) : -1, end = k < 0 ? (dd ? dd.length : 0) : k;
              if (dd && end > 15) { let sm = 0; for (let j = end - 14; j < end; j++) sm += Math.max(dd[j].h - dd[j].l, Math.abs(dd[j].h - dd[j - 1].c), Math.abs(dd[j].l - dd[j - 1].c)); atrLim = 3 * sm / 14; }
              beLv = p.entry * (1 + (p.side < 0 ? -1 : 1) * (2 * VFEE + 0.0005));
            }
            const sd = p.side < 0 ? -1 : 1;
            for (const b of bars) {
              if (b.t < from) continue;
              const hs = p.stop && (p.side > 0 ? b.l <= p.stop : b.h >= p.stop), ht = p.target && (p.side > 0 ? b.h >= p.target : b.l <= p.target);
              if (hs) { sold(p, p.side > 0 ? Math.min(b.o, p.stop) : Math.max(b.o, p.stop), b.t, p.beOn && Math.abs(p.stop - p.beLv) < 1e-9 ? 'безубыток' : 'ваш стоп'); break; }
              if (ht) { sold(p, p.side > 0 ? Math.max(b.o, p.target) : Math.min(b.o, p.target), b.t, 'ваша цель'); break; }
              p.best = sd > 0 ? Math.max(p.best || p.entry, b.h) : Math.min(p.best || p.entry, b.l);
              if (atrLim > 0 && !p.beOn && sd * (p.best - p.entry) >= atrLim && sd * (b.c - beLv) > 0 && (!p.stop || sd * (beLv - p.stop) > 0)) {
                p.stop = beLv; p.beOn = b.t; p.beLv = beLv;
                const msg = `${p.ticker}: стоп в безубыток ${fmtPrice(beLv, [{ c: beLv }])} — цена ушла на 3×ATR от входа`;
                log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': ' + p.ticker + ' — безубыток', text: msg, open: { id: p.id, ticker: p.ticker, classCode: 'TQBR', tf: '1d' }, kind: 'robot' });
              }
            }
            if (bars.length) a.px[p.id] = bars[bars.length - 1].c;
            p.lastChk = bars.length ? bars[bars.length - 1].t : now;
          } catch (e) { say(p.ticker + ': ' + e.message); }
        }
      }
      for (const [id, d] of a.manual ? [] : Object.entries(dataBy[atf] || {})) {
        // порог фиксируем: «авто» меняется с каждой новой свечой и перекраивает прошлые сделки.
        // Обновляем раз в месяц и только когда по бумаге нет позиции.
        a.sw = a.sw || {}; a.swAt = a.swAt || {};
        if (!a.sw[id] || (!a.pos.some((z) => z.id === id) && now - (a.swAt[id] || 0) > 30 * 86400000)) { a.sw[id] = EW2.autoSwing(d.bars.slice(-(a.cfg.maxBars || 2000)), a.cfg.swingMult || 1); a.swAt[id] = now; }
        // безубыток 3×ATR — переключатель у каждого робота; позиция ведётся так, как была открыта (p.be)
        const runs = {}, BE = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
        const runWith = (base, be) => { const k = (base === a.cfg ? 'c' : 'p') + (be ? 1 : 0); if (!(k in runs)) { try { runs[k] = EW2.run(d.bars, Object.assign({}, base, be ? BE : { beMode: 'hint' }, { swingPct: a.sw[id], mkt: base.addMarket ? mkt : null }), TF[atf].ms); } catch (e) { runs[k] = null; } } return runs[k]; };
        const an = runWith(a.cfg, !!a.be);
        if (!an) { say(d.x.ticker + ': ошибка расчёта'); continue; }
        const last = an.bars[an.N - 1]; a.px[id] = last.c;
        // а) открытые позиции: закрыть, если сделка бэктеста закрылась; подтянуть стоп
        // доливка по Вильямсу — отдельная позиция, живёт и закрывается вместе с основной сделкой
        const openAdd = (p, tr) => {
          const A = tr.add, tA = T(an, A.i), key = id + '|' + p.entryT + '|add';
          if (a.seen[key] || a.pos.some((z) => z.addOf === p.entryT && z.id === id)) return;
          a.seen[key] = 1;
          if (tA < (aLast || aStart) - 10 * 86400000) return;
          const eq = vEquity(a), dist = Math.abs(A.px - A.stop) / A.px, lot = d.x.lot || 1;
          const held = a.pos.filter((z) => z.id === id).reduce((sm, z) => sm + z.qty * A.px, 0);
          const val = Math.min(eq * (a.cfg.riskPct || 1) / 100 / dist, Math.max(0, eq * VMAXPOS * 2 - held), a.cash / (1 + VFEE));   // на бумагу вместе с доливкой — не больше двух лимитов позиции
          const qty = Math.floor(val / (A.px * lot)) * lot;
          if (qty < lot) { log('robot', `${a.name}: ${d.x.ticker} — доливка пропущена, не хватает свободных денег`); return; }
          const cost = qty * A.px * (1 + VFEE); a.cash -= cost;
          const q = { id, ticker: d.x.ticker, lot, qty, entry: A.px, entryT: tA, addOf: p.entryT, be: !!p.be, stop0: A.stop, stop: tr.stop, target: tr.target, setup: tr.setup, cost, divs: 0, runner: !!tr.runner };
          a.pos.push(q);
          const msg = `долил ${q.ticker} ${qty} шт по ${fmtPrice(A.px, an.bars)} — волна 3 прошла 110% волны 1 (по Вильямсу)`;
          log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': долил ' + q.ticker, text: msg, open: { id, ticker: q.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
          if (tr.reason !== 3) sold(q, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]);
        };
        // позиции, открытые до обновления настроек робота, ведём по старым настройкам — иначе их «пересчитало» бы
        for (const p of a.pos.filter((z) => z.id === id)) {
          const A2 = runWith(p.legacy && a.cfgPrev ? a.cfgPrev : a.cfg, !!p.be) || an;
          const tr = A2.trades.find((t) => T(A2, t.iEntry) === (p.addOf || p.entryT));
          if (!tr) { sold(p, last.c, last.t, 'подсчёт пересчитан'); continue; }
          if (tr.reason !== 3) { sold(p, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]); continue; }
          if (Math.abs(tr.stop - p.stop) > 1e-9) { log('robot', `${a.name}: ${p.ticker} стоп ${fmtPrice(p.stop, an.bars)} → ${fmtPrice(tr.stop, an.bars)}`); if (tr.runner && !p.runner) ev.push({ title: tag + ': ' + p.ticker + ' цель пройдена — держим', text: 'Стоп переносится на ' + fmtPrice(tr.stop, an.bars), open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          // «неделя»: в пятницу сделка в плюсе — остаётся на следующую неделю, стоп в безубытке
          if (tr.wkCarry && tr.wkCarry !== (p.wk || 0)) { p.wk = tr.wkCarry; const msg = `${p.ticker}: пятница, сделка в плюсе — переносим на следующую неделю, стоп ${fmtPrice(tr.stop, an.bars)} (безубыток)`; log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': ' + p.ticker + ' — на следующую неделю', text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          p.stop = tr.stop; p.runner = !!tr.runner;
          if (!p.addOf && !p.legacy && tr.add && a.cfg.addPyramid) openAdd(p, tr);
        }
        // б) новые сделки бэктеста после старта робота
        for (const tr of an.trades) {
          const tIn = T(an, tr.iEntry), key = id + '|' + tIn;
          // только новые сделки: после старта и не раньше прошлого хода (иначе после смены порога «вспомнились» бы старые)
          if (tIn < aStart || tIn < Math.max(aLast, aStart) - 10 * 86400000 || a.seen[key]) continue;
          a.seen[key] = 1; delete a.pend[id];
          const eq = vEquity(a), dist = Math.abs(tr.entry - tr.stop0) / tr.entry, lot = d.x.lot || 1;
          let val = Math.min(eq * (a.cfg.riskPct || 1) / 100 / dist, eq * VMAXPOS, a.cash / (1 + VFEE));
          const qty = Math.floor(val / (tr.entry * lot)) * lot;
          if (qty < lot) { a.skipped++; log('robot', `${a.name}: ${d.x.ticker} — сигнал пропущен, не хватает свободных денег`); continue; }
          const cost = qty * tr.entry * (1 + VFEE); a.cash -= cost;
          const p = { id, ticker: d.x.ticker, lot, qty, entry: tr.entry, entryT: tIn, stop0: tr.stop0, stop: tr.stop, target: tr.target, setup: tr.setup, cost, divs: 0, runner: !!tr.runner , be: !!a.be };
          a.pos.push(p);
          if (tr.add && a.cfg.addPyramid) openAdd(p, tr);
          const msg = `купил ${p.ticker} ${qty} шт по ${fmtPrice(tr.entry, an.bars)}, стоп ${fmtPrice(tr.stop0, an.bars)}${tr.notgt ? '' : ', цель ' + fmtPrice(tr.target, an.bars)}`;
          log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': купил ' + p.ticker, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
          if (tr.reason !== 3) sold(p, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]);   // вошёл и вышел между проверками
        }
        // в) сигнал на последней закрытой свече — заявка «купить на открытии» (чтобы успеть повторить)
        if (an.plan && an.planActive && an.plan.sigBar === an.N - 1 && !a.pos.some((z) => z.id === id)) {
          const sigT = T(an, an.plan.sigBar);
          if (!a.pend[id] || a.pend[id].sigT !== sigT) {
            const eq = vEquity(a), dist = Math.abs(an.plan.entry - an.plan.stop) / an.plan.entry, lot = d.x.lot || 1;
            const qty = Math.floor(Math.min(eq * (a.cfg.riskPct || 1) / 100 / dist, eq * VMAXPOS, a.cash) / (an.plan.entry * lot)) * lot;
            a.pend[id] = { sigT, entry: an.plan.entry, stop: an.plan.stop, target: an.plan.target, qty };
            const msg = qty >= lot ? `${atf === '1d' ? 'завтра на открытии' : 'вход сейчас, по открытию новой свечи:'} купит ${d.x.ticker} ~${qty} шт (~${fmtPrice(an.plan.entry, an.bars)}), стоп ${fmtPrice(an.plan.stop, an.bars)}` : `сигнал ${d.x.ticker}, но свободных денег нет — пропустит`;
            log('robot', a.name + ': ' + msg); ev.push({ title: tag + ': ' + (qty >= lot ? 'сигнал ' + d.x.ticker : d.x.ticker + ' — пропуск'), text: msg, open: { id, ticker: d.x.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
          }
        }
        if (a.pend[id] && now - a.pend[id].sigT > 5 * 86400000) delete a.pend[id];
      }
      if (a.cfgPrev && !a.pos.some((z) => z.legacy)) { delete a.cfgPrev; log('robot', a.name + ': старые позиции закрыты — дальше только новые настройки'); }
      // г) дивиденды по бумагам в позиции (за вычетом налога 13%; по шорту дивиденды не начисляем)
      for (const p of a.pos.filter((z) => z.side !== -1)) {
        try {
          const dv = await getDividends(s.token, { id: p.id, ticker: p.ticker, classCode: 'TQBR' });
          for (const x of dv) {
            const lastT = Date.parse(x.last + 'T23:59:59+03:00');
            if (lastT < p.entryT || lastT > now || (p.divKeys || []).includes(x.last)) continue;
            const g = x.d * p.qty * VTAX; a.cash += g; p.divs = (p.divs || 0) + g; (p.divKeys = p.divKeys || []).push(x.last);
            log('robot', `${a.name}: дивиденды ${p.ticker} +${Math.round(g)} ₽`);
          }
        } catch (e) { /* дивиденды не критичны */ }
      }
      // д) кривая капитала: точка в день
      const eq = vEquity(a), lh = a.hist[a.hist.length - 1];
      if (!lh || new Date(lh.t + 3 * 36e5).toISOString().slice(0, 10) !== new Date(now + 3 * 36e5).toISOString().slice(0, 10)) a.hist.push({ t: now, eq, mm: a.mm || 0, dep: a.dep }); else { lh.t = now; lh.eq = eq; lh.mm = a.mm || 0; lh.dep = a.dep; }
      if (a.hist.length > 2000) a.hist.splice(0, a.hist.length - 2000);
      if (a.closed.length > 3000) a.closed.splice(0, a.closed.length - 3000);
    }
    // без связи ход не засчитываем: иначе после долгого перерыва робот «забыл» бы сделки, случившиеся без него
    if (!Object.keys(data).length && list.length) { log('robot', 'нет связи — ход отложен'); vaccSet(V); return ev; }
    for (const a of V.accs) if (!one || a === one) a.lastRun = now;
    if (!one) V.lastRun = now;
    V.lastN = Object.keys(data).length;
    vaccSet(V);
    say('робот: проверено ' + V.lastN + ' бумаг');
    return ev;
  }

  root.EWData = { widgetPush, vaccGet, vaccSet, vEquity, robotStep, getCashFlows, log, logInit, logFlush, logRead, logClear, setDec, needBg, priceItems, instByUid, getOperations, getLastPrices, buildMarket, getMarket, getAccounts, getAccountMoney, getUniverse, files, instInfo, getDividends, adjustDividends, withDividends, scanNeed, getScanBars, TF, store, settings, saveSettings, call, loadCandles, getBars, findInstrument, events, checkAll, decimals, fmtPrice, parseCandles };
})(typeof window !== 'undefined' ? window : globalThis);
