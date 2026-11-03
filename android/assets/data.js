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

  // 3.9: дата для показа — по Москве (по умолчанию) или по часам телефона (settings.tz === 'local')
  let tzLoc = null;
  function dispDate(t) {
    if (tzLoc === null) { try { tzLoc = settings().tz === 'local'; } catch (e) { tzLoc = false; } }
    const loc = tzLoc;
    const d = new Date(loc ? t : t + 3 * 3600000);
    return loc ? { Y: d.getFullYear(), M: d.getMonth(), D: d.getDate(), h: d.getHours(), m: d.getMinutes(), wd: d.getDay() } : { Y: d.getUTCFullYear(), M: d.getUTCMonth(), D: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), wd: d.getUTCDay() };
  }
  function settings() {
    return Object.assign({
      token: '',
      inst: { id: 'SBER_TQBR', ticker: 'SBER', classCode: 'TQBR', name: 'Сбербанк', lot: 10 },
      tf: '1h',
      cfg: { maxBars: 2000 },
      watch: [],                // [{ id, ticker, name, tf }] — что проверять в фоне
      bgMinutes: 0,             // 0 — фоновая проверка выключена
      robotMode: 'local',       // 'local' — расчёт на телефоне, 'server' — состояние с сервера
      serverUrl: '',            // POST endpoint серверных роботов (обычно через Tailscale)
      serverKey: '',            // необязательный ключ API, хранится только на устройстве
      notify: { signal: true, exit: true, stop: true },
      view: { figs: [true, true, true, true, true], channels: true, be: false, trades: true, clean: false, panel: true },
    }, store.get('settings', {}));
  }
  function saveSettings(s) { tzLoc = s.tz === 'local'; store.set('settings', s); }

  // ---------- запросы ----------
  // в приложении на телефоне запрос делает сам Android (без ограничений браузера), в браузере — fetch
  const CERT_MSG = 'Сервер Т-Банка подписан сертификатом Минцифры, которому телефон (компьютер) пока не доверяет. Откройте ⚙ → «Сертификат Минцифры» → «Скачать с gu-st.ru».';
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
  // открытые данные без токена (цены биткоина, Мосбиржа): GET без авторизации
  function httpGet(url) {
    const A = root.Android;
    if (A && A.getAsync) return new Promise((res) => { const id = ++seq; pending[id] = res; A.getAsync(id, url); }).then((r) => { if (r.status === 0) throw new Error(r.text || 'нет связи'); return r; });
    return fetch(url).then(async (r) => ({ status: r.status, text: await r.text() }));
  }
  async function serverGet(url, key) {
    if (!url) throw new Error('не указан адрес сервера роботов');
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === '100.99.24.36')) throw new Error('Нужен HTTPS или HTTP домашнего сервера 100.99.24.36');
    let timer;
    const r = await Promise.race([httpPost(url, key || '', { kind: 'ew-robots-request', v: 1 }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('сервер не ответил за 20 секунд')), 20000); })]).finally(() => clearTimeout(timer));
    if (r.status < 200 || r.status >= 300) throw new Error('сервер роботов: ответ ' + r.status);
    let x; try { x = JSON.parse(r.text || '{}'); } catch (e) { throw new Error('сервер роботов: неверный JSON'); }
    if (x.kind !== 'ew-robots-state' || x.v !== 1 || !x.state || !Array.isArray(x.state.accs) || !x.state.accs.length || x.state.accs.some((a) => !a || !a.key || !Array.isArray(a.pos) || !Array.isArray(a.closed) || !Array.isArray(a.hist) || !Number.isFinite(a.cash) || !Number.isFinite(a.dep))) throw new Error('сервер роботов: неполное состояние');
    return x;
  }

  // ---------- журнал работы (лог) ----------
  // Приложение и фоновая проверка пишут в разные файлы, чтобы не затирать друг друга. Без токена, счетов и сумм.
  const LOG_MAX = 6000;   // 3.9: было 3000 — при 5 роботах на 4ч не хватало на месяц
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

  // ---------- запасной источник цен: открытый сайт Мосбиржи (ISS, без токена) ----------
  // Цены те же, биржевые, но бесплатно — с задержкой ~15 мин. Работает без токена и подхватывает, когда сервер брокера не отвечает.
  // Ответы приводятся к виду API брокера, чтобы остальной код не знал, откуда свечи: время свечей — как у брокера (UTC), объём — в лотах.
  // Дивидендов у Мосбиржи бесплатно нет — без токена берём встроенную таблицу (divs.js) и то, что брокер отдал раньше.
  const ISS = 'https://iss.moex.com/iss', MSK = 3 * 3600000, MX_DELAY = 16 * 60000;
  let mxAt = 0, mxUntil = 0;
  const mxFatal = (m) => Object.assign(new Error(m), { fatal: true });
  async function iss(path) {
    const t0 = Date.now(), m = 'ISS ' + path.split('?')[0].split('/').pop().replace('.json', '');
    let r;
    const url = ISS + path + (path.includes('?') ? '&' : '?') + 'iss.meta=off';
    for (let k = 0; !r; k++) {   // обрыв связи — ещё раз через 1,5 с
      try { r = await httpGet(url); }
      catch (e) { if (k >= 1) { apiNote(m, Date.now() - t0, false); throw new Error('Нет связи с Мосбиржей: ' + e.message); } await new Promise((ok) => setTimeout(ok, 1500)); }
    }
    apiNote(m, Date.now() - t0, r.status >= 200 && r.status < 300);
    if (r.status < 200 || r.status >= 300) throw new Error('Мосбиржа: ответ ' + r.status);
    try { return JSON.parse(r.text); } catch (e) { throw new Error('Мосбиржа: непонятный ответ'); }
  }
  const issRows = (blk) => (blk && blk.data ? blk.data : []).map((d) => { const o = {}; blk.columns.forEach((c, i) => { o[c.toUpperCase()] = d[i]; }); return o; });
  const mskStr = (t) => new Date(t + MSK).toISOString().slice(0, 19).replace('T', ' ');
  const pq = (x) => ({ units: x, nano: 0 });   // цена в виде брокера (q() её прочитает)

  // какая бумага на бирже: «ТИКЕР_РЕЖИМ» читается сразу, uid брокера — по тому, что уже встречалось
  function mxRemember(uid, ticker, board) {
    if (!uid || !ticker || !/^[0-9a-f]{8}-/.test(uid)) return;
    const m = store.get('mxIds', {}); if (m[uid] && m[uid][0] === ticker) return;
    m[uid] = [ticker, board || 'TQBR']; store.set('mxIds', m);
  }
  function mxSec(id) {
    const s = String(id || '');
    if (!/^[0-9a-f]{8}-/.test(s)) { const k = s.match(/^(.+)_([A-Z0-9]+)$/); if (k) return { tk: k[1], board: k[2] }; }
    const m = store.get('mxIds', {})[s]; if (m) return { tk: m[0], board: m[1] };
    const D = root.EW_DIVS || {};
    for (const key in D) if (D[key].u === s) { const k = key.match(/^(.+)_([A-Z0-9]+)$/); return { tk: k[1], board: k[2] }; }
    const U = files.get('universe.json'), x = U && U.list ? U.list.find((z) => z.uid === s) : null;
    if (x) return { tk: x.ticker, board: x.classCode || 'TQBR' };
    throw mxFatal('Мосбиржа: не знаю тикер этой бумаги — найдите её заново через поиск.');
  }
  // лот, название и вид бумаги (кэш на 7 дней)
  async function mxInfo(sec) {
    const key = 'mxSec.' + sec.tk + '_' + sec.board, c = store.get(key, null);
    if (c && Date.now() - c.at < 7 * 86400000) return c;
    const js = await iss(`/engines/stock/markets/shares/boards/${sec.board}/securities/${encodeURIComponent(sec.tk)}.json?iss.only=securities&securities.columns=SECID,SHORTNAME,SECNAME,LOTSIZE,SECTYPE`);
    const x = issRows(js.securities)[0];
    if (!x) throw mxFatal('Мосбиржа: бумага ' + sec.tk + ' не найдена в режиме ' + sec.board);
    const info = { at: Date.now(), lot: Number(x.LOTSIZE || 1), name: x.SHORTNAME || x.SECNAME || sec.tk, type: /^TQTF/.test(sec.board) ? 'etf' : 'share' };
    store.set(key, info);
    return info;
  }
  // свечи: у Мосбиржи нет 4ч, 5м и 15м — собираем их из часовых и минутных (корзины по UTC, как у брокера)
  const MX_TF = { CANDLE_INTERVAL_5_MIN: [1, 300000], CANDLE_INTERVAL_15_MIN: [1, 900000], CANDLE_INTERVAL_HOUR: [60, 0], CANDLE_INTERVAL_4_HOUR: [60, 14400000], CANDLE_INTERVAL_DAY: [24, 0], CANDLE_INTERVAL_WEEK: [7, 0] };
  async function mxCandles(body) {
    const sec = mxSec(body.instrumentId), tf = MX_TF[body.interval];
    if (!tf) throw mxFatal('Мосбиржа: такой таймфрейм не поддерживается');
    const [iv, agg] = tf, daily = iv === 24 || iv === 7, now = Date.now();
    const span = agg || (daily ? 0 : iv * 60000);
    let from = Date.parse(body.from), to = Math.min(Date.parse(body.to), now);
    if (agg) from = Math.floor(from / agg) * agg;
    if (daily) from -= iv === 7 ? 7 * 86400000 : 0;
    const lot = (await mxInfo(sec)).lot || 1;
    const f = daily ? mskStr(from).slice(0, 10) : mskStr(from), t = daily ? mskStr(to).slice(0, 10) : mskStr(to);
    const rows = [];
    for (let start = 0; start < 50000; start += 500) {
      const js = await iss(`/engines/stock/markets/shares/boards/${sec.board}/securities/${encodeURIComponent(sec.tk)}/candles.json?from=${encodeURIComponent(f)}&till=${encodeURIComponent(t)}&interval=${iv}&candles.columns=begin,open,high,low,close,volume&start=${start}`);
      const d = (js.candles && js.candles.data) || [];
      for (const r of d) rows.push(r);
      if (d.length < 500) break;
    }
    // время ISS — московское; дневная и недельная свеча у брокера — с полуночи UTC
    let bars = rows.map(([b, o, h, l, c, v]) => ({ t: daily ? Date.parse(b.slice(0, 10) + 'T00:00:00Z') : Date.parse(b.replace(' ', 'T') + 'Z') - MSK, o, h, l, c, v: v / lot }))
      .filter((b) => b.t && b.h > 0);
    if (agg) {
      const m = new Map();
      for (const b of bars) {
        const k = Math.floor(b.t / agg) * agg, x = m.get(k);
        if (!x) m.set(k, { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
        else { x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; x.v += b.v; }
      }
      bars = Array.from(m.values());
    }
    // свеча закрыта, когда кончилось её время и прошла задержка Мосбиржи; день кончается в полночь по МСК
    const endOf = (b) => (daily ? b.t + (iv === 7 ? 7 : 1) * 86400000 - MSK : b.t + span);
    const out = bars.filter((b) => endOf(b) > Date.parse(body.from) && b.t <= to).sort((a, b) => a.t - b.t);
    mxAt = now;
    return {
      candles: out.map((b) => ({ time: new Date(b.t).toISOString(), open: pq(b.o), high: pq(b.h), low: pq(b.l), close: pq(b.c), volume: Math.round(b.v), isComplete: endOf(b) + MX_DELAY <= now })),
    };
  }
  async function mxFind(body) {
    const js = await iss(`/securities.json?q=${encodeURIComponent(body.query || '')}&engine=stock&market=shares&is_trading=1&limit=30&securities.columns=secid,shortname,name,primary_boardid,type`);
    const D = root.EW_DIVS || {};
    return {
      instruments: issRows(js.securities).filter((x) => /^TQ/.test(x.PRIMARY_BOARDID || '')).map((x) => {
        const id = x.SECID + '_' + x.PRIMARY_BOARDID;
        return { uid: '', ticker: x.SECID, classCode: x.PRIMARY_BOARDID, name: x.SHORTNAME || x.NAME, instrumentType: /ppif|etf/i.test(x.TYPE || '') ? 'etf' : 'share', lot: D[id] ? D[id].l : 1, apiTradeAvailableFlag: true };
      }),
    };
  }
  async function mxInstrument(body) {
    const sec = body.idType === 'INSTRUMENT_ID_TYPE_UID' ? mxSec(body.id) : { tk: body.id, board: body.classCode || 'TQBR' };
    const info = await mxInfo(sec), D = root.EW_DIVS || {}, known = D[sec.tk + '_' + sec.board];
    return { instrument: { uid: body.idType === 'INSTRUMENT_ID_TYPE_UID' ? body.id : known ? known.u : '', figi: '', lot: info.lot, instrumentType: info.type, ticker: sec.tk, classCode: sec.board, name: info.name, currency: 'rub', mx: true } };
  }
  async function mxDividends(body) {
    const sec = mxSec(body.instrumentId), x = (root.EW_DIVS || {})[sec.tk + '_' + sec.board];
    return { dividends: x ? x.d.map(([d, v]) => ({ lastBuyDate: d + 'T00:00:00Z', dividendNet: Object.assign(pq(v), { currency: 'rub' }) })) : [] };
  }
  async function mxLastPrices(body) {
    const ids = body.instrumentId || [], by = {};
    for (const id of ids) { try { const s = mxSec(id); (by[s.board] = by[s.board] || []).push([id, s.tk]); } catch (e) { /* неизвестная бумага — пропускаем */ } }
    const out = [];
    for (const [board, list] of Object.entries(by)) {
      const js = await iss(`/engines/stock/markets/shares/boards/${board}/securities.json?securities=${encodeURIComponent(list.map((z) => z[1]).join(','))}&iss.only=marketdata&marketdata.columns=SECID,LAST,LCURRENTPRICE,SYSTIME`);
      const px = new Map(issRows(js.marketdata).map((r) => [r.SECID, r]));
      for (const [id, tk] of list) {
        const r = px.get(tk), p = r && (r.LAST || r.LCURRENTPRICE);
        if (p) out.push({ instrumentUid: id, price: pq(p), time: r.SYSTIME ? new Date(Date.parse(r.SYSTIME.replace(' ', 'T') + 'Z') - MSK - MX_DELAY).toISOString() : '' });
      }
    }
    return { lastPrices: out };
  }
  async function mxShares() {
    const D = root.EW_DIVS || {};
    const js = await iss('/engines/stock/markets/shares/boards/TQBR/securities.json?iss.only=securities&securities.columns=SECID,SHORTNAME,LOTSIZE,STATUS,SECTYPE');
    // только торгуемые обыкновенные и привилегированные акции (без фондов)
    return { instruments: issRows(js.securities).filter((x) => x.STATUS === 'A' && /^[12D]$/.test(x.SECTYPE || '')).map((x) => ({ uid: (D[x.SECID + '_TQBR'] || {}).u || '', ticker: x.SECID, classCode: 'TQBR', name: x.SHORTNAME, lot: Number(x.LOTSIZE || 1), currency: 'rub', buyAvailableFlag: true })) };
  }
  const MX = { GetCandles: mxCandles, FindInstrument: mxFind, GetInstrumentBy: mxInstrument, GetDividends: mxDividends, GetLastPrices: mxLastPrices, Shares: mxShares };
  // откуда последние цены: { at — когда брали с Мосбиржи, token — есть ли токен }
  function mxState() { return { at: mxAt, down: Date.now() < mxUntil, delay: MX_DELAY }; }

  async function call(token, path, body) {
    const method = path.split('/').pop(), t0 = Date.now(), mx = MX[method];
    // без токена — биржевые данные с Мосбиржи, остальное (счёт, операции) недоступно
    if (!token) { if (!mx) throw mxFatal('Нужен токен Т-Инвестиций (⚙ → Счёт).'); return mx(body); }
    // брокер недавно не отвечал — 5 мин не ждём его, сразу берём с Мосбиржи
    if (mx && Date.now() < mxUntil) return mx(body);
    try {
      const js = await call0(token, path, body);
      const ms = Date.now() - t0; apiNote(method, ms, true);
      if (ms > 5000) log('api', method + ': медленно, ' + ms + ' мс');
      return js;
    } catch (e) {
      apiNote(method, Date.now() - t0, false);
      log('api', method + ': ' + e.message, { ms: Date.now() - t0 });
      if (!mx || e.fatal) throw e;
      // нет связи с брокером или сбой на его стороне — цены с Мосбиржи
      mxUntil = Date.now() + 5 * 60000;
      log('api', 'брокер не отвечает — цены с Мосбиржи (задержка ~15 мин)');
      try { return await mx(body); } catch (e2) { throw new Error(e.message + ' Мосбиржа тоже не ответила: ' + e2.message); }
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
  function validCandle(b) {
    return b && Number.isFinite(b.t) && b.t > 0 && [b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0) && b.h >= Math.max(b.o, b.c, b.l) && b.l <= Math.min(b.o, b.c);
  }
  function updateLiveCandle(b, v, tf, now) {
    const T = TF[tf]; now = now || Date.now();
    if (!validCandle(b) || b.done !== false || !T || !v || !Number.isFinite(v.price) || v.price <= 0 || !Number.isFinite(v.t) || v.t < b.t || v.t >= b.t + T.ms || v.t > now + 5000 || now >= b.t + T.ms || (b.liveT && v.t < b.liveT)) return false;
    b.c = v.price; b.h = Math.max(b.h, v.price); b.l = Math.min(b.l, v.price); b.liveT = v.t;
    return true;
  }

  function parseCandles(js) {
    const list = js.candles || [];
    return list.map((c) => ({
      t: Date.parse(c.time), o: q(c.open), h: q(c.high), l: q(c.low), c: q(c.close),
      v: Number(c.volume || 0), done: c.isComplete !== false && c.is_complete !== false,
    })).filter(validCandle);
  }

  // свечи за период [from, to] окнами, от нового к старому, пока не наберём need
  // untilT — грузить не от «сейчас», а до этой даты (тренажёр подгружает младшие свечи кусками)
  async function loadCandles(token, instId, tf, need, sinceT, untilT) {
    if (isCrypto(instId)) return cryptoCandles(instId, tf, need, sinceT, untilT);
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

  // 3.2: биткоин — свечи с открытых данных Binance (без ключа и токена), если Binance недоступен — Kraken (только BTC, до 720 свечей)
  const CRYPTO_ID = 'BTCUSDT_CRYPTO', isCrypto = (id) => /_CRYPTO$/.test(String(id || ''));
  async function cryptoCandles(instId, tf, need, sinceT, untilT) {
    const sym = instId.replace(/_CRYPTO$/, ''), P = TF[tf].ms, now = Date.now(), out = new Map();
    const put = (t, o, h, l, c, v) => { if (h > 0 && l > 0) out.set(t, { t, o, h, l, c, v, done: t + P <= now }); };
    const iv = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' }[tf] || '1d', base = 'https://data-api.binance.vision/api/v3/klines?symbol=' + sym + '&interval=' + iv + '&limit=1000';
    try {
      if (sinceT) {   // хвост: вперёд от sinceT
        let st = sinceT - P;
        for (let k = 0; k < 10; k++) {
          const r = await httpGet(base + '&startTime=' + st); if (r.status !== 200) throw new Error('Binance: ответ ' + r.status);
          const rows = JSON.parse(r.text); for (const x of rows) put(x[0], +x[1], +x[2], +x[3], +x[4], +x[5]);
          if (rows.length < 1000) break; st = rows[rows.length - 1][0] + 1;
        }
      } else {        // история: назад от «сейчас» (или от untilT), пока не наберём need
        let end = untilT ? Math.min(untilT, now) : now;
        for (let k = 0; k < 10; k++) {
          const r = await httpGet(base + '&endTime=' + end); if (r.status !== 200) throw new Error('Binance: ответ ' + r.status);
          const rows = JSON.parse(r.text); for (const x of rows) put(x[0], +x[1], +x[2], +x[3], +x[4], +x[5]);
          if (rows.length < 1000 || out.size >= (need || 0)) break; end = rows[0][0] - 1;
        }
      }
    } catch (e) {
      if (sym !== 'BTCUSDT') throw e;
      const r = await httpGet('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=' + Math.round(P / 60000)), js = JSON.parse(r.text);
      const k = js && js.result && Object.keys(js.result).find((x) => x !== 'last');
      if (!k) throw new Error('нет цен биткоина: ' + e.message);
      for (const x of js.result[k]) if (!sinceT || x[0] * 1000 >= sinceT - P) put(x[0] * 1000, +x[1], +x[2], +x[3], +x[4], +x[6]);
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
    return { bars: c.r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], done: a[6] !== 0 })).filter(validCandle), at: c.at, full: c.full };
  }

  async function findInstrument(token, query) {
    const js = await call(token, INS + 'FindInstrument', { query, apiTradeAvailableFlag: false });
    for (const x of js.instruments || []) mxRemember(x.uid, x.ticker, x.classCode);
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
          title: name + ': ' + (an.plan.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА'), sig: true,
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
    if (isCrypto(inst.id)) return { at: Date.now(), uid: '', figi: '', lot: 1, type: 'crypto', currency: 'usd' };
    const key = 'ins.' + inst.id, c = store.get(key, null);
    if (c && Date.now() - c.at < (c.mx ? 3600000 : 7 * 86400000)) return c;   // сведения с Мосбиржи — на час: появится токен, возьмём у брокера
    const isUid = /^[0-9a-f]{8}-/.test(inst.id);
    const body = isUid ? { idType: 'INSTRUMENT_ID_TYPE_UID', id: inst.id } : { idType: 'INSTRUMENT_ID_TYPE_TICKER', classCode: inst.classCode || 'TQBR', id: inst.ticker };
    const js = await call(token, INS + 'GetInstrumentBy', body);
    const x = js.instrument || {};
    const info = { at: Date.now(), uid: x.uid || '', figi: x.figi || '', lot: Number(x.lot || 1), type: x.instrumentType || '', currency: x.currency || 'rub' };
    if (x.mx) info.mx = true; else mxRemember(x.uid, x.ticker || inst.ticker, x.classCode || inst.classCode);
    store.set(key, info);
    return info;
  }

  // ---------- дивиденды и корректировка истории ----------
  // Цены у брокера не скорректированы: в день отсечки акция открывается ниже на размер дивиденда.
  // Чтобы этот провал не считался падением (ложные развороты, «выбитые» стопы), умножаем
  // все свечи до даты отсечки на (1 − дивиденд / цена закрытия перед отсечкой) — как в терминалах.
  async function getDividends(token, inst) {
    if (isCrypto(inst.id)) return [];
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
    if (!x.mx) { mxRemember(uid, x.ticker, x.classCode); store.set(key, info); }
    return info;
  }

  // последние цены сразу по нескольким бумагам (по uid)
  async function getLastPrices(token, uids) {
    if (!uids.length) return {};
    const js = await call(token, MD + 'GetLastPrices', { instrumentId: uids });
    const out = {};
    for (const p of js.lastPrices || []) { const id = p.instrumentUid || p.figi; if (id) out[id] = { price: q(p.price), t: Date.parse(p.time || '') || 0 }; }
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
    const s = settings();   // без токена — цены с Мосбиржи
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
        // 3.10: сигнал на последней закрытой свече — таймер до закрытия свечи, которая идёт сейчас (свеча входа)
        const cd = an.plan && an.planActive && an.plan.sigBar === an.N - 1 ? candleEnd(w.tf) : 0;
        for (const e of ev) { e.open = { id: w.id, ticker: w.ticker, name: w.name, classCode: w.classCode, tf: w.tf }; if (e.sig && cd) e.until = cd; delete e.sig; }
        all.push(...ev);
        const lastRec = { at: Date.now(), phase: an.phase.text, plan: an.plan && an.planActive ? (an.plan.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА') : '', px: done.length ? fmtPrice(done[done.length - 1].c, done) : '', cd };
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
      const sig = [], other = [], unclear = [], robots = [], seen = {}, nowW = Date.now();
      const short = (ph) => { const t = String(ph || '').replace('Фаза: ', ''), m = t.match(/, идёт волна (\S+)/);
        return m ? (/вверх/.test(t) ? '↑ ' : /вниз/.test(t) ? '↓ ' : '') + 'идёт волна ' + m[1] : t.split(' — ')[0]; };
      for (const w of s.watch || []) {
        const key = w.wid || (w.ticker + '.' + w.tf); if (seen[key]) continue; seen[key] = 1;
        const r = store.get('last.' + key, null); if (!r) continue;
        const head = `<b>${esc(w.ticker)}</b> ${esc((TF[w.tf] || {}).name || w.tf)}${r.px ? ' · ' + esc(r.px) : ''} · `;
        const open = JSON.stringify({ id: w.id, ticker: w.ticker, name: w.name || w.ticker, classCode: w.classCode || 'TQBR', tf: w.tf });
        if (r.plan) sig.push({ h: head + `<font color="${r.plan === 'ПОКУПКА' ? col.pos : col.neg}"><b>${r.plan === 'ПОКУПКА' ? '▲' : '▼'} ${r.plan}</b></font>`, o: open, u: r.cd > nowW ? r.cd : 0 });
        else (/не ясна/.test(r.phase || '') ? unclear : other).push({ h: head + `<font color="${col.mut}">${esc(short(r.phase))}</font>`, o: open });
      }
      const V = vaccGet();
      if (V && V.on) for (const a of V.accs || []) {
        const pc = a.dep ? (vEquity(a) / a.dep - 1) * 100 : 0;
        // характер и настроение робота: последняя сделка за 2 дня — в плюс 🎉, в минус 😢
        const lc = a.closed[a.closed.length - 1], mood = lc && Date.now() - lc.exitT < 2 * 86400000 ? (lc.pl >= 0 ? '🎉' : '😢') : '';
        const pu = Object.values(a.pend || {}).map((z) => pendUntil(z, accTf(a), nowW)).filter((u) => u > nowW);   // 3.10: сигнал робота на 4ч — таймер до закрытия свечи входа
        robots.push({ u: pu.length ? Math.min(...pu) : 0, h: `${({ d_aggr: '🔥', h4_week: '⏰', h4_fig: '📐', manual: '✋', btc_trend: '₿' })[a.key] || '🤖'}${mood} ${esc(a.name)}: позиций ${a.pos.length} · <font color="${pc >= 0 ? col.pos : col.neg}">${pc >= 0 ? '+' : '−'}${Math.abs(pc).toFixed(1).replace('.', decComma ? ',' : '.')}%</font>`, o: '' });
      }
      const list = sig.concat(robots, other, unclear);
      const t = store.get('lastcheck', 0), d = dispDate(t || Date.now()), p2 = (n) => String(n).padStart(2, '0');
      const title = 'Волны Эллиотта · ' + (t ? 'проверено ' + p2(d.D) + '.' + p2(d.M + 1) + ' ' + p2(d.h) + ':' + p2(d.m) + (s.tz !== 'local' ? ' МСК' : '') : 'ещё не проверялось');
      A.widgetUpdate(JSON.stringify({ title, rows: list.map((x) => x.h), opens: list.map((x) => x.o), untils: list.map((x) => x.u || 0), bg: col.bg, ink: col.ink, mut: col.mut }));
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
    let fail = 0;
    for (const [id, list] of Object.entries(byInst)) {
      // с прошлой проверки (с запасом 10 мин), но не раньше создания уровня и не дальше 3 суток назад
      const from = Math.max(now - 3 * 86400000, Math.min(...list.map((x) => Math.max(x.since, lastP ? lastP - 600000 : 0))));
      // 3.7: одна бумага без свечей (нет связи, бумагу убрали с биржи) больше не останавливает проверку уровней остальных
      let bars;
      try { bars = await loadCandles(s.token, id, '5m', 0, from); }
      catch (e) { fail++; log('error', 'уровни ' + list[0].ticker + ': ' + e.message); if (onLog) onLog(list[0].ticker + ': ' + e.message); continue; }
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
    // не проверили какую-то бумагу — в следующий раз смотрим с того же места (уже сработавшие уровни не повторятся: они отмечены)
    store.set('pfired', pf); store.set('jfired', jf); if (!fail) store.set('lastpcheck', now);
    return out;
  }
  // нужна ли фоновая проверка вообще
  function needBg(s) { s = s || settings(); const V = files.get('vacc.json'); return !!(((s.watch || []).length || priceItems(s).length || (V && V.on && s.robotMode !== 'server'))); }

  // ---------- виртуальный счёт робота ----------
  // Робот повторяет сделки бэктеста по топ-50 акциям (дневки) на общем капитале: риск на сделку, позиция ≤ 25% счёта,
  // без плеча; если денег на сигнал нет — пропускает. Доход фонда ВИМ на свободные деньги (mmRate) считается отдельно (a.mm) — только для оценки, в торговле не участвует.
  // Пополнения и выводы реального счёта повторяются автоматически. Цены — реальные, комиссия брокера с каждой стороны.
  const VFILE = 'vacc.json', VFEE = 0.0005, VMAXPOS = 0.25, VTAX = 0.87;
  function vaccGet() {
    const s = settings(), V = s.robotMode === 'server' ? files.get('vacc-server.json') : files.get(VFILE);
    // 2.27: проценты фонда ВИМ больше не смешиваются с деньгами робота — считаются отдельно, только для оценки.
    // Раньше начисленное уже лежит в cash — вынимаем его оттуда один раз.
    if (V && V.accs && !V.mm2) { for (const a of V.accs) { if (a.mm) a.cash -= a.mm; } V.mm2 = true; files.set(s.robotMode === 'server' ? 'vacc-server.json' : VFILE, V); }
    return V;
  }
  function vaccSet(V) { if (settings().robotMode === 'server') return false; return files.set(VFILE, V); }
  let serverGeneration = 0;
  async function serverSync() {
    if (robBusy()) throw new Error('Дождитесь окончания локального хода роботов');
    const s = settings(), generation = serverGeneration;
    const x = await serverGet(s.serverUrl, s.serverKey);
    const current = settings();
    if (robBusy()) throw new Error('Дождитесь окончания локального хода роботов');
    if (generation !== serverGeneration || current.serverUrl !== s.serverUrl || current.serverKey !== s.serverKey) throw new Error('Режим или адрес сервера изменён — ответ пропущен');
    const local = files.get(VFILE);
    if (current.robotMode !== 'server' && local && !files.set('vacc-local.json', local)) throw new Error('Не удалось сохранить локальную копию');
    if (!files.set('vacc-server.json', x.state)) throw new Error('Не удалось сохранить состояние сервера');
    current.robotMode = 'server'; saveSettings(current);
    store.set('serverRobots', { at: Date.now(), serverAt: x.serverAt, lastRun: x.lastRun || x.state.lastRun || 0, ok: true, error: '' });
    widgetPush();
    return x;
  }
  function serverOffline() {
    serverGeneration++;
    const s = settings(), restore = s.robotMode === 'server' ? (files.get('vacc-server.json') || files.get(VFILE) || files.get('vacc-local.json')) : files.get(VFILE);
    if (!restore || !files.set(VFILE, restore)) return false;
    s.robotMode = 'local'; saveSettings(s);
    store.set('serverRobots', Object.assign({}, store.get('serverRobots', {}), { ok: false, offline: true, offlineAt: Date.now() }));
    widgetPush();
    return !!restore;
  }
  // 3.10: денежные операции счёта: пополнения/выводы (flows) и расходы/доходы брокера (costs: обслуживание, комиссии, налог, дивиденды и купоны).
  // Раньше брались только OPERATION_TYPE_INPUT/OUTPUT — пополнение картой, по СБП или переводом между счетами (свои типы) не находилось
  // и у «мой (вручную)» выглядело как прибыль. Типы не перечисляем в запросе (неизвестный брокеру тип ломает весь запрос) — разбираем ответ
  const FLOW_RE = /^OPERATION_TYPE_(INPUT|OUTPUT)(_SWIFT|_ACQUIRING)?$|^OPERATION_TYPE_(INP|OUT)_MULTI$|^OPERATION_TYPE_TRANS_/;
  function costKind(t) {
    if (t === 'OPERATION_TYPE_BROKER_FEE') return 'comm';
    if (/TAX/.test(t)) return 'tax';
    if (/FEE|PENALTY|STAMP|OVER_COM/.test(t)) return 'fee';
    if (/DIVIDEND$|COUPON$|DIV_EXT|DIVIDEND_TRANSFER|OVERNIGHT|OVER_INCOME/.test(t)) return 'inc';
    return '';
  }
  async function getAccOps(token, accountId, fromMs) {
    const from = new Date(fromMs).toISOString(), to = new Date(Date.now() + 86400000).toISOString(), flows = [], costs = [];
    let cursor = '';
    for (let k = 0; k < 10; k++) {
      const js = await call(token, OPS + 'GetOperationsByCursor', { accountId, from, to, cursor, limit: 300, state: 'OPERATION_STATE_EXECUTED', withoutCommissions: false, withoutTrades: true, withoutOvernights: false });
      for (const o of js.items || []) {
        const a = q(o.payment), t = Date.parse(o.date), ty = String(o.type || '');
        if (!a) continue;
        if (FLOW_RE.test(ty)) flows.push({ id: o.id, t, amount: a });
        else { const kd = costKind(ty); if (kd) costs.push({ id: o.id, t, kind: kd, amount: a }); }
      }
      if (!js.hasNext || !js.nextCursor) break;
      cursor = js.nextCursor;
    }
    return { flows, costs };
  }
  async function getCashFlows(token, accountId, fromMs) { return (await getAccOps(token, accountId, fromMs)).flows; }
  function vEquity(a) { return a.cash + a.pos.reduce((s, p) => s + (p.side < 0 ? -1 : 1) * p.qty * (a.px[p.id] || p.entry), 0); }
  // 3.7: ход робота идёт (в приложении, в фоне или по кнопке «Ход»). Второй ход одновременно не начинаем, а правки роботов в приложении
  // ждут конца хода: ход в конце записывает счета целиком и иначе затёр бы и чужой ход, и правку (пополнение, «Обновить настройки», нового робота)
  const robBusy = () => Date.now() - store.get('robRun', 0) < 8 * 60000;
  // only — ключ одного счёта (кнопка «Ход» у робота); без него ходят все
  async function robotStep(onLog, force, only) {
    if (settings().robotMode === 'server') { log('robot', 'локальный ход пропущен: включён серверный режим'); return []; }
    if (robBusy()) { log('robot', 'ход робота уже идёт — этот пропускаем'); if (onLog) onLog('ход робота уже идёт'); return []; }
    store.set('robRun', Date.now());
    try { return await robotRun(onLog, force, only); } finally { store.del('robRun'); widgetPush(); }   // 3.10: виджет — и после хода в приложении (раньше только после фоновой проверки)
  }
  async function robotRun(onLog, force, only) {
    const s = settings(), V = vaccGet(), ev = [];
    if (!V || !V.on) return ev;
    const one = only ? V.accs.find((a) => a.key === only) : null;
    if (only && !one) return ev;
    const now = Date.now(), dly = s.token ? 0 : MX_DELAY;   // без токена свечи с Мосбиржи — закрытая свеча видна через ~15 мин
    // 2.43: счёт ходит, когда у его таймфрейма закрылась новая свеча (4ч — в 03/07/11/15/19/23 МСК, дневки — после конца дня по МСК),
    // но не чаще раза в 4 мин; без новой свечи — раз в 50 мин (стопы ручного счёта, пополнения). Грузим свечи только тех, кому пора.
    // биткоин (Binance) задержки Мосбиржи не ждёт — как и его «будильник» (nextAlarm)
    const due = (a) => { const l = a.lastRun || V.lastRun || 0, tf = accTf(a); return now - l >= 50 * 60000 || (now - l >= 4 * 60000 && l < lastClose(tf, now - (tf === 'u1d' ? 0 : dly))); };
    const runAccs = force ? V.accs.filter((a) => !one || a === one) : V.accs.filter(due);
    if (!runAccs.length) return ev;
    const runSet = new Set(runAccs);
    const say = (m) => { if (onLog) onLog(m); };
    // 1) пополнения и выводы реального счёта
    if (s.account) {
      try {
        const man = V.accs.find((a) => a.manual), from = Math.min(V.startAt, man && man.realCap ? man.realCap : Infinity);
        const { flows: fl, costs } = await getAccOps(s.token, s.account.id, from);
        for (const f of fl) {
          if (f.t < V.startAt || V.flows.some((x) => x.id === f.id)) continue;
          V.flows.push(f);
          // счёт биткоина — в долларах, рубли туда не идут; «мой (вручную)» — только после первой сверки 3.0 (более ранние уже в его капитале)
          for (const a of V.accs) if (!a.crypto && !(a.manual && a.realCap && f.t < a.realCap)) { a.cash += f.amount; a.dep += f.amount; }
          log('robot', (f.amount > 0 ? 'пополнение' : 'вывод') + ' на вашем счёте — повторено на виртуальных счетах');
        }
        // 3.10: расходы и доходы брокера по вашему счёту (обслуживание, комиссии, налог, дивиденды/купоны) — для отдельной строки у «мой (вручную)»;
        // в его капитале они уже есть (капитал = итог портфеля), здесь — только чтобы показать, из чего сложился результат
        if (man && man.realCap) {
          man.costs = man.costs || {}; man.costSeen = man.costSeen || {};
          const NM = { fee: 'обслуживание', comm: 'комиссия', tax: 'налог', inc: 'дивиденды/купоны' };
          for (const c of costs) {
            if (c.t < man.realCap || man.costSeen[c.id]) continue;
            man.costSeen[c.id] = 1; man.costs[c.kind] = (man.costs[c.kind] || 0) + c.amount;
            if (c.kind !== 'comm') log('robot', `${man.name}: операция брокера — ${NM[c.kind]}`);
          }
        }
      } catch (e) { log('robot', 'пополнения: ' + e.message); }
    }
    // 2) проценты фонда ликвидности на свободные деньги
    const dt = (now - (V.lastAccrue || V.startAt)) / 31557600000;
    // только оценка «а если бы свободные деньги лежали в ВИМ»: в деньги робота не попадает и на размер позиций не влияет
    if (dt > 0) { for (const a of V.accs) { if (a.crypto) continue; const base = Math.max(0, a.cash) + (a.mm || 0); if (base > 0) a.mm = (a.mm || 0) + base * (V.mmRate / 100) * dt; } V.lastAccrue = now; }
    // 3.2: робот «Биткоин · тренд» — свои свечи (Binance), акции ему не нужны
    for (const a of runAccs.filter((z) => z.crypto)) {
      try { await btcStep(a, ev, now); a.lastRun = now; } catch (e) { log('robot', a.name + ': ход отложен — ' + e.message); say(a.name + ': ' + e.message); }
    }
    if (!runAccs.some((z) => !z.crypto)) { vaccSet(V); return ev; }
    // 3) бумаги: топ-50 по обороту
    let U = files.get('universe.json');
    if (!U || !U.list || !U.list.length || now - U.at > 7 * 86400000) { try { U = await getUniverse(s.token, null, false); } catch (e) { log('robot', 'список акций: ' + e.message); } }
    // пополнения, проценты и ход биткоина уже сделаны — сохраняем, иначе они повторились бы (а с ними и уведомления) в следующий раз
    if (!U || !U.list || !U.list.length) { log('robot', 'нет списка акций — откройте сканер и обновите список'); vaccSet(V); return ev; }
    const held = new Set(V.accs.flatMap((a) => a.pos.map((p) => p.id)));
    const list = U.list.filter((x) => x.turn >= 50e6).slice(0, V.top || 50);
    for (const x of U.list) if (held.has(x.id) && !list.includes(x)) list.push(x);   // бумаги в позиции — даже если выпали из топа
    // свечи — по таймфреймам роботов (дневки нужны всегда: ручной счёт берёт из них ATR); 2.39: робот «4 часа · неделя»
    const tfs = Array.from(new Set(runAccs.filter((a) => !a.manual && !a.crypto).map((a) => a.tf || '1d')));   // 3.0: ручному счёту свечи не нужны — позиции и цены со счёта
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
    const T = (an, i) => (an.bars[i] ? an.bars[i].t : 0);
    for (const a of V.accs) {
      if (!runSet.has(a) || a.crypto) continue;
      const aLast = a.lastRun || V.lastRun || 0;   // прошлый ход этого счёта: робот мог ходить и один, по своей кнопке
      // заголовок уведомления начинается с бумаги: в шторке длинный заголовок обрезается с конца
      const tag = (a.manual ? 'вирт. счёт «' : 'робот «') + a.name + '»', atf = a.manual ? '1d' : a.tf || '1d', mkt = mktBy[atf], aStart = a.startAt || V.startAt;
      const sold = (p, px, t, why) => {
        let pl;
        if (p.side < 0) { const val = p.qty * px * (1 + VFEE); a.cash -= val; pl = p.cost - val; }   // шорт: откупили бумаги
        else { const val = p.qty * px * (1 - VFEE); a.cash += val; pl = val - p.cost + (p.divs || 0); }
        const R = p.stop0 && p.stop0 !== p.entry ? +((p.side || 1) * (px - p.entry) / Math.abs(p.entry - p.stop0)).toFixed(2) : null;
        a.closed.push({ id: p.id, ticker: p.ticker, side: p.side || 1, qty: p.qty, entry: p.entry, entryT: p.entryT, exit: px, exitT: t, why, pl, divs: p.divs || 0, setup: p.setup, addOf: p.addOf, stop0: p.stop0, R });
        a.pos = a.pos.filter((z) => z !== p);
        const msg = `${p.side < 0 ? 'откупил' : 'продал'} ${p.ticker} ${p.qty} шт по ${fmtPrice(px, [{ c: px }])} (${why}), ${pl >= 0 ? '+' : '−'}${Math.round(Math.abs(pl))} ₽`;
        log('robot', a.name + ': ' + msg, { kind: 'close', key: a.key, ticker: p.ticker, tf: atf, side: p.side || 1, qty: p.qty, entry: p.entry, entryT: p.entryT, stop0: p.stop0, stopLast: p.stop, exit: px, exitT: t, why, pl: Math.round(pl), R, setup: p.setup != null ? EW2.SETUP_NAME[p.setup] : '', days: +((t - p.entryT) / 86400000).toFixed(1), src: p.src || '' }); ev.push({ title: p.ticker + ': ' + msg.split(' ')[0] + ' (' + why + ') · ' + tag, text: msg, open: { id: p.id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
      };
      // ручной счёт: стопы и цели, поставленные вами, проверяем по 5-минуткам с прошлой проверки
      if (a.manual) {
        // 2.44: ваши сделки со счёта Т-Инвестиций повторяются здесь (без уведомлений — вы их сделали сами):
        // 1) новые покупки/продажи — по точной цене из операций; 2) сверка с портфелем — бумаги, что лежат на счёте (в т.ч. купленные
        // до запуска роботов), ставятся позициями по средней цене, а если на счёте их стало меньше — лишнее закрывается по текущей цене
        // 3.10: сделки виртуальной эпохи (до первой сверки 3.0) — в архив: иначе итог «Закрытых» не сходится с результатом
        if (a.realCap && !a.oldCut) { a.closedOld = (a.closedOld || []).concat(a.closed.filter((c) => c.exitT < a.realCap)); a.closed = a.closed.filter((c) => c.exitT >= a.realCap); a.oldCut = 1; }
        if (s.account) {
          const n0 = ev.length;
          try {
            a.opSeen = a.opSeen || {};
            const ref = (o) => instByUid(s.token, o.uid).catch(() => null);
            const mine = (id) => a.pos.filter((z) => z.id === id && z.src === 'счёт');
            const closeQty = (id, qty, px, t) => {   // закрыть qty шт позиций «со счёта» по бумаге, старые — первыми
              let left = qty;
              for (const p of mine(id).sort((x, y) => x.entryT - y.entryT)) {
                if (left <= 0) break;
                if (p.qty > left) { const k = left / p.qty, part = Object.assign({}, p, { qty: left, cost: p.cost * k, divs: (p.divs || 0) * k }); p.qty -= left; p.cost -= part.cost; p.divs = (p.divs || 0) - part.divs; a.pos.push(part); sold(part, px, t, 'продажа на вашем счёте'); left = 0; }
                else { left -= p.qty; sold(p, px, t, 'продажа на вашем счёте'); }
              }
              return qty - left;
            };
            const openQty = (ins, qty, px, t, note) => {
              const cost = qty * px * (1 + VFEE); a.cash -= cost;
              a.pos.push({ id: ins.ticker + '_TQBR', ticker: ins.ticker, lot: ins.lot || 1, qty, entry: px, entryT: t, side: 1, stop: 0, target: 0, cost, divs: 0, src: 'счёт', be: !!a.be, lastChk: t });
              log('robot', `${a.name}: с вашего счёта — ${note} ${ins.ticker} ${qty} шт по ${fmtPrice(px, [{ c: px }])}`);
            };
            let nOps = 0;
            if (a.syncAt) {   // операции — только после прошлой сверки (более ранние уже учтены портфелем)
              const ops = await getOperations(s.token, s.account.id, null, a.syncAt - 3 * 86400000);
              for (const o of ops) {
                if (a.opSeen[o.id] || o.t < a.syncAt - 60000) { a.opSeen[o.id] = 1; continue; }
                a.opSeen[o.id] = 1;
                const ins = await ref(o); if (!ins || ins.classCode !== 'TQBR') continue;
                if (o.side > 0) { openQty(ins, o.qty, o.price, o.t, 'купил'); a.pos[a.pos.length - 1].markChk = 1; } else closeQty(ins.ticker + '_TQBR', o.qty, o.price, o.t);
                nOps++;
              }
            }
            // сверка с портфелем: сколько каждой акции на счёте сейчас против позиций «со счёта» здесь
            const acc = await getAccountMoney(s.token, s.account.id), real = new Map();
            for (const p of acc.positions) {
              if (!(p.qty > 0) || !p.uid) continue;
              const ins = await ref(p); if (!ins || ins.classCode !== 'TQBR' || !/share/i.test(ins.type || 'share')) continue;
              real.set(ins.ticker + '_TQBR', { ins, qty: p.qty, avg: p.avg || p.cur, cur: p.cur || p.avg });
            }
            let nAdd = 0, nCut = 0;
            // первая сверка: вашу позицию, заведённую вручную по бумаге, которая есть на счёте, считаем позицией «со счёта» — без задвоения
            if (!a.syncAt) for (const [id] of real) if (!mine(id).length) for (const p of a.pos.filter((z) => z.id === id && !z.src && z.side !== -1)) p.src = 'счёт';
            const ids = new Set([...real.keys(), ...a.pos.filter((z) => z.src === 'счёт').map((z) => z.id)]);
            for (const id of ids) {
              const r = real.get(id), have = mine(id).reduce((sm, z) => sm + z.qty, 0), want = r ? r.qty : 0;
              if (want > have) { openQty(r.ins, want - have, a.syncAt ? r.cur : r.avg, now, a.syncAt ? 'сверка: на счёте больше, добавил' : 'уже на счёте'); nAdd++; }
              else if (want < have) { const px = r ? r.cur : (a.px[id] || mine(id)[0].entry); closeQty(id, have - want, px, now); nCut++; }
            }
            // 3.9: «изменений нет» — не чаще раза в сутки (раньше забивало журнал каждые 15–60 мин)
            if (nOps || nAdd || nCut || now - (a.syncLogAt || 0) > 86400000) { a.syncLogAt = now; log('robot', `${a.name}: сверка со счётом — акций на счёте ${real.size}${nOps ? ', новых сделок ' + nOps : ''}${nAdd ? ', добавлено позиций ' + nAdd : ''}${nCut ? ', закрыто ' + nCut : ''}${nOps || nAdd || nCut ? '' : ', изменений нет'}`); }
            // 3.0: здесь только то, что лежит на счёте — виртуальные позиции прежних версий убираем (без записи в закрытые)
            const virt = a.pos.filter((z) => z.src !== 'счёт');
            if (virt.length) { a.pos = a.pos.filter((z) => z.src === 'счёт'); log('robot', `${a.name}: убраны виртуальные позиции (${virt.map((z) => z.ticker).join(', ')}) — дальше только сделки со счёта`); }
            // капитал = стоимость счёта у брокера: цены — из портфеля, деньги и прочее (облигации, фонды) = итог − акции
            let inShares = 0;
            for (const [id, r] of real) { a.px[id] = r.cur; inShares += r.qty * r.cur; }
            if (acc.total > 0) {
              a.cash = acc.total - inShares;
              if (!a.realCap) { a.realCap = now; a.oldCut = 1; a.closedOld = (a.closedOld || []).concat(a.closed); a.closed = []; a.dep = vEquity(a); a.hist = [{ t: now, eq: a.dep, dep: a.dep }]; log('robot', `${a.name}: капитал теперь со счёта — ${Math.round(a.dep)} ₽, результат считаем с этой минуты`); }
            }
            // 3.9: позиция, найденная сверкой (по средней цене и времени сверки), — на графике ставим на свечу и цену настоящей покупки
            // (последняя ещё не проданная покупка из истории операций за 2 года; ищем один раз на позицию)
            const need = a.pos.filter((z) => z.src === 'счёт' && !z.markChk);
            if (need.length) {
              try {
                const lots = {};
                for (const id of new Set(need.map((z) => z.id))) {
                  const r = real.get(id); if (!r || !r.ins || !r.ins.uid) continue;
                  const L = lots[id] = [];
                  for (const o of (await getOperations(s.token, s.account.id, r.ins.uid, now - 730 * 86400000)).slice().sort((x, y) => x.t - y.t)) {
                    if (o.side > 0) L.push({ t: o.t, px: o.price, q: o.qty });
                    else { let left = o.qty; while (left > 0 && L.length) { const x = L[0]; if (x.q > left) { x.q -= left; left = 0; } else { left -= x.q; L.shift(); } } }
                  }
                }
                let nm = 0;
                for (const z of need) { const L = lots[z.id]; if (L && L.length) { const x = L[L.length - 1]; z.markT = x.t; z.mark = x.px; nm++; } z.markChk = 1; }
                if (nm) log('robot', `${a.name}: на графике ${nm} поз. со счёта поставлены на свечу настоящей покупки`);
              } catch (e) { log('robot', `${a.name}: история покупок для графика — ${e.message}`); }
            }
            a.syncAt = now; a.opAt = now;
          } catch (e) { log('robot', `${a.name}: сверка со счётом не удалась — ${e.message}`); say('ваши сделки со счёта: ' + e.message); }
          ev.length = n0;
        }
      }
      for (const [id, d] of a.manual ? [] : Object.entries(dataBy[atf] || {})) {
        // порог фиксируем: «авто» меняется с каждой новой свечой и перекраивает прошлые сделки.
        // Обновляем раз в месяц и только когда по бумаге нет позиции.
        a.sw = a.sw || {}; a.swAt = a.swAt || {};
        if (!a.sw[id] || (!a.pos.some((z) => z.id === id) && now - (a.swAt[id] || 0) > 30 * 86400000)) { a.sw[id] = EW2.autoSwing(d.bars.slice(-(a.cfg.maxBars || 2000)), a.cfg.swingMult || 1); a.swAt[id] = now; }
        // безубыток 3×ATR — переключатель у каждого робота; позиция ведётся так, как была открыта (p.be)
        // 3.13: «несколько роботов на одном счёте» (a.cfg.subs) — у каждой части свои сигналы и сделки (по бумаге может быть по позиции
        // на часть), деньги общие. Позиция помнит свою часть (p.sub), заявка — тоже (a.pend[id].sub)
        for (const sub of a.cfg.subs || [null]) {
        const SC = sub ? sub.key : null, onSub = (z) => (z.sub || null) === SC, myPend = () => !!a.pend[id] && (a.pend[id].sub || null) === SC;
        const cfgA = sub ? Object.assign({}, a.cfg, sub.cfg) : a.cfg, cfgPA = a.cfgPrev ? (sub ? Object.assign({}, a.cfgPrev, sub.cfg) : a.cfgPrev) : null;
        const runs = {}, BE = { beMode: 'auto', beRule: 'atr', beAtr: 3 };
        // 3.14: «сделка стоит» (a.stall у счёта, p.stall у позиции) — 12 свечей без закрытия выше входа → стоп на полпути к входу
        const runWith = (base, be, sl) => { const k = (base === cfgA ? 'c' : 'p') + (be ? 1 : 0) + (sl ? 's' : ''); if (!(k in runs)) { try { runs[k] = EW2.run(d.bars, Object.assign({}, base, be ? BE : { beMode: 'hint' }, sl ? { stallOn: true, stallBars: 12, stallK: 0.5 } : { stallOn: false }, { swingPct: a.sw[id], mkt: base.addMarket ? mkt : null }), TF[atf].ms); } catch (e) { runs[k] = null; } } return runs[k]; };
        const an = runWith(cfgA, !!a.be, !!a.stall);
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
          const q = { id, ticker: d.x.ticker, lot, qty, entry: A.px, entryT: tA, addOf: p.entryT, be: !!p.be, stall: !!p.stall, stop0: A.stop, stop: tr.stop, target: tr.target, setup: tr.setup, cost, divs: 0, runner: !!tr.runner };
          a.pos.push(q);
          const msg = `долил ${q.ticker} ${qty} шт по ${fmtPrice(A.px, an.bars)} — волна 3 прошла 110% волны 1 (по Вильямсу)`;
          log('robot', a.name + ': ' + msg); ev.push({ title: q.ticker + ': долил · ' + tag, text: msg, open: { id, ticker: q.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
          if (tr.reason !== 3) sold(q, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]);
        };
        // позиции, открытые до обновления настроек робота, ведём по старым настройкам — иначе их «пересчитало» бы
        for (const p of a.pos.filter((z) => z.id === id && onSub(z))) {
          const A2 = runWith(p.legacy && cfgPA ? cfgPA : cfgA, !!p.be, !!p.stall) || an;
          const tr = A2.trades.find((t) => T(A2, t.iEntry) === (p.addOf || p.entryT));
          if (!tr) { sold(p, last.c, last.t, 'подсчёт пересчитан'); continue; }
          if (tr.reason !== 3) { sold(p, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]); continue; }
          if (Math.abs(tr.stop - p.stop) > 1e-9) { log('robot', `${a.name}: ${p.ticker} стоп ${fmtPrice(p.stop, an.bars)} → ${fmtPrice(tr.stop, an.bars)}`, { kind: 'stop', key: a.key, ticker: p.ticker, tf: atf, from: p.stop, to: tr.stop, why: tr.runner && !p.runner ? 'цель пройдена' : tr.runner ? 'под откат' : tr.stallLv != null && Math.abs(tr.stop - tr.stallLv) < 1e-9 ? 'сделка стоит' : tr.beOn != null && (p.side || 1) * (tr.stop - p.entry) >= 0 ? 'безубыток' : 'перенос', t: last.t }); if (tr.runner && !p.runner) ev.push({ title: p.ticker + ': цель пройдена — держим · ' + tag, text: 'Стоп переносится на ' + fmtPrice(tr.stop, an.bars), open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); else if (!tr.wkCarry || tr.wkCarry === (p.wk || 0)) ev.push({ title: p.ticker + ': стоп перенесён · ' + tag, text: `${p.ticker}: стоп ${fmtPrice(p.stop, an.bars)} → ${fmtPrice(tr.stop, an.bars)}${(p.side || 1) * (tr.stop - p.entry) >= 0 ? ' (не хуже входа — сделка уже не в убыток)' : tr.stallLv != null && Math.abs(tr.stop - tr.stallLv) < 1e-9 ? ' — 12 свечей без роста, риск вдвое меньше' : ''}`, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          // «неделя»: в пятницу сделка в плюсе — остаётся на следующую неделю, стоп в безубытке
          if (tr.wkCarry && tr.wkCarry !== (p.wk || 0)) { p.wk = tr.wkCarry; const msg = `${p.ticker}: пятница, сделка в плюсе — переносим на следующую неделю, стоп ${fmtPrice(tr.stop, an.bars)} (безубыток)`; log('robot', a.name + ': ' + msg); ev.push({ title: p.ticker + ': на следующую неделю · ' + tag, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          // 3.0: без прибыли, но канал цел — тоже на следующую неделю (стоп прежний); канал пробит — закрытие по открытию следующей свечи
          if (tr.wkHold && tr.wkHold !== (p.wkh || 0)) { p.wkh = tr.wkHold; const msg = `${p.ticker}: пятница, сделка без прибыли, но канал подсчёта цел — переносим на следующую неделю, стоп ${fmtPrice(tr.stop, an.bars)}`; log('robot', a.name + ': ' + msg); ev.push({ title: p.ticker + ': на следующую неделю (канал цел) · ' + tag, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          if (tr.wkOut && !p.wko) { p.wko = 1; const msg = `${p.ticker}: пятница, сделка без прибыли — закроем по открытию следующей свечи (утро понедельника)`; log('robot', a.name + ': ' + msg); ev.push({ title: p.ticker + ': закроем в понедельник · ' + tag, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' }); }
          p.stop = tr.stop; p.runner = !!tr.runner;
          // 3.9: предупреждение заранее — на следующей свече робот, скорее всего, перенесёт стоп (один раз на каждый будущий перенос)
          try {
            const hn = EW2.stopHint(A2.bars, A2.cfg, tr), hk = hn ? (hn.kind === 'be' || hn.kind === 'stall' ? hn.kind : 'trail|' + T(A2, hn.j)) : '';   // безубыток — одно предупреждение на сделку
            // 3.10: перенос за свечу — не повторяем, пока прежнее предупреждение в силе (стоп с тех пор не двигался) и новый уровень почти тот же
            // (у IRAO приходило дважды за 20 мин: новая свеча-кандидат, стоп 2,8280 → 2,8270)
            const near = hn && hn.kind === 'trail' && p.hintS != null && p.hintP === p.stop && Math.abs(hn.stop - p.hintS) < (p.stop0 && p.stop0 !== p.entry ? 0.25 * Math.abs(p.entry - p.stop0) : 0.005 * p.entry);
            if (hn && p.hint !== hk && near) p.hint = hk;
            else if (hn && p.hint !== hk) {
              p.hint = hk; p.hintS = hn.stop; p.hintP = p.stop; const up = (p.side || 1) > 0, F = (x) => fmtPrice(x, an.bars);
              const msg = hn.kind === 'stall' ? `${p.ticker}: сделка стоит — если и следующая свеча не закроется выше ${F(hn.at)} (цена входа), стоп переедет на ${F(hn.stop)} (сейчас ${F(p.stop)})`
                : hn.kind === 'be' ? `${p.ticker}: готовится безубыток — если цена дойдёт до ${F(hn.at)}, стоп переедет на ${F(hn.stop)} (цена входа с комиссией)`
                : `${p.ticker}: готовится перенос стопа — если ${hn.left > 1 ? 'следующие ' + hn.left + ' свечи не уйдут' : 'следующая свеча не уйдёт'} ${up ? 'ниже' : 'выше'} ${F(hn.at)}, стоп переедет на ~${F(hn.stop)} (сейчас ${F(p.stop)})`;
              log('robot', a.name + ': ' + msg, { ticker: p.ticker, tf: atf, kind: 'stopHint', hint: hn.kind, at: hn.at, stop: hn.stop, now: p.stop });
              ev.push({ title: p.ticker + ': ' + (hn.kind === 'be' ? 'скоро безубыток' : hn.kind === 'stall' ? 'сделка стоит' : 'скоро перенос стопа') + ' · ' + tag, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
            }
          } catch (e) { /* подсказка не должна мешать ходу */ }
          if (!p.addOf && !p.legacy && tr.add && a.cfg.addPyramid) openAdd(p, tr);
        }
        // б) новые сделки бэктеста после старта робота
        for (const tr of an.trades) {
          const tIn = T(an, tr.iEntry), key = id + '|' + tIn + (SC ? '|' + SC : '');
          // только новые сделки: после старта и не раньше прошлого хода (иначе после смены порога «вспомнились» бы старые)
          if (tIn < aStart || tIn < Math.max(aLast, aStart) - 10 * 86400000 || a.seen[key]) continue;
          a.seen[key] = 1; if (myPend()) delete a.pend[id];
          const eq = vEquity(a), dist = Math.abs(tr.entry - tr.stop0) / tr.entry, lot = d.x.lot || 1;
          let val = Math.min(eq * (a.cfg.riskPct || 1) / 100 / dist, eq * VMAXPOS, a.cash / (1 + VFEE));
          const qty = Math.floor(val / (tr.entry * lot)) * lot;
          if (qty < lot) { a.skipped++; log('robot', `${a.name}: ${d.x.ticker} — сигнал пропущен, не хватает свободных денег`); continue; }
          const side = tr.side < 0 ? -1 : 1, cost = side < 0 ? qty * tr.entry * (1 - VFEE) : qty * tr.entry * (1 + VFEE);
          a.cash += side < 0 ? cost : -cost;   // шорт: деньги от продажи на счёте, при закрытии бумаги откупаем (sold)
          const p = { id, ticker: d.x.ticker, lot, qty, side, entry: tr.entry, entryT: tIn, stop0: tr.stop0, stop: tr.stop, target: tr.target, setup: tr.setup, cost, divs: 0, runner: !!tr.runner , be: !!a.be, stall: !!a.stall };
          if (SC) p.sub = SC;
          a.pos.push(p);
          if (tr.add && a.cfg.addPyramid) openAdd(p, tr);
          const msg = `${side < 0 ? 'продал (шорт)' : 'купил'} ${p.ticker} ${qty} шт по ${fmtPrice(tr.entry, an.bars)}, стоп ${fmtPrice(tr.stop0, an.bars)}${tr.notgt ? '' : ', цель ' + fmtPrice(tr.target, an.bars)}${SC ? ' — ' + EW2.SETUP_NAME[tr.setup].toLowerCase() : ''}`;
          log('robot', a.name + ': ' + msg, { kind: 'open', key: a.key, ticker: p.ticker, tf: atf, side, qty, entry: tr.entry, entryT: tIn, stop0: tr.stop0, target: tr.notgt ? null : tr.target, riskPct: a.cfg.riskPct, setup: EW2.SETUP_NAME[tr.setup] || '', sigT: T(an, tr.iSig), swing: an.swing, be: !!a.be }); ev.push({ title: p.ticker + ': ' + (side < 0 ? 'продал (шорт)' : 'купил') + ' · ' + tag, text: msg, open: { id, ticker: p.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot' });
          if (tr.reason !== 3) sold(p, tr.exitP, T(an, tr.iExit), EW2.REASON_NAME[tr.reason]);   // вошёл и вышел между проверками
        }
        // в) сигнал на последней закрытой свече — заявка «купить на открытии» (чтобы успеть повторить)
        // 2.42: пока у бэктеста по бумаге открыта прошлая сделка (робот её не брал — была до старта или без денег), новый вход он не сделает — и робот не купит; такой сигнал не объявляем
        if (an.plan && an.planActive && an.plan.sigBar === an.N - 1 && !a.pos.some((z) => z.id === id && onSub(z)) && !an.trades.some((t) => t.reason === 3) && (!a.pend[id] || myPend())) {
          const sigT = T(an, an.plan.sigBar);
          if (!a.pend[id] || a.pend[id].sigT !== sigT) {
            const eq = vEquity(a), dist = Math.abs(an.plan.entry - an.plan.stop) / an.plan.entry, lot = d.x.lot || 1;
            const qty = Math.floor(Math.min(eq * (a.cfg.riskPct || 1) / 100 / dist, eq * VMAXPOS, a.cash / (1 + VFEE)) / (an.plan.entry * lot)) * lot;   // как при самой покупке (пункт «б»)
            const until = atf === '1d' ? 0 : candleEnd(atf);   // 3.10: свеча входа закроется — таймер в карточке, виджете и уведомлении
            a.pend[id] = { sigT, side: an.plan.side, entry: an.plan.entry, stop: an.plan.stop, target: an.plan.target, qty, until, setup: an.plan.setup };
            if (SC) a.pend[id].sub = SC;
            const msg = qty >= lot ? `${atf === '1d' ? 'завтра на открытии' : 'вход сейчас, по открытию новой свечи:'} ${an.plan.side < 0 ? 'продаст (шорт)' : 'купит'} ${d.x.ticker} ~${qty} шт (~${fmtPrice(an.plan.entry, an.bars)}), стоп ${fmtPrice(an.plan.stop, an.bars)}${SC ? ' — ' + EW2.SETUP_NAME[an.plan.setup].toLowerCase() : ''}` : `сигнал ${d.x.ticker}, но свободных денег нет — пропустит`;
            log('robot', a.name + ': ' + msg); ev.push({ title: d.x.ticker + ': ' + (qty >= lot ? (atf === '1d' ? 'сигнал, завтра на открытии' : 'сигнал — вход сейчас') : 'сигнал, пропуск — нет денег') + ' · ' + tag, text: msg, open: { id, ticker: d.x.ticker, classCode: 'TQBR', tf: atf }, kind: 'robot', until: qty >= lot && until ? until : 0 });
          }
        }
        // свеча входа уже закрылась, а сделки нет (купил бы — заявку убрал бы пункт «б») — убираем и пишем почему
        if (myPend() && last.t > a.pend[id].sigT) {
          const q = a.pend[id], sd = q.stop < q.entry ? 1 : -1, k = an.bars.findIndex((b) => b.t > q.sigT), o = k >= 0 ? an.bars[k].o : 0;
          const why = o && sd * (o - q.stop) <= 0 ? 'цена открылась за стопом — вход отменён' : o && q.target && sd * (q.target - o) <= 0 ? 'цена открылась за целью — вход отменён'
            : an.trades.some((t) => t.reason === 3 && T(an, t.iEntry) <= q.sigT) ? 'по истории система ещё в прошлой сделке по этой бумаге' : 'после новой свечи подсчёт пересчитался и сигнал не подтвердился';
          log('robot', `${a.name}: ${d.x.ticker} — сигнал не исполнен: ${why}`); delete a.pend[id];
        }
        if (myPend() && now - a.pend[id].sigT > 5 * 86400000) delete a.pend[id];
        }   // части счёта (a.cfg.subs)
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
    const nData = Math.max(0, ...Object.values(dataBy).map((d) => Object.keys(d).length));   // бумаг со свечами (по таймфрейму, где их больше всего)
    if (tfs.length && !nData && list.length) { log('robot', 'нет связи — ход отложен'); vaccSet(V); return ev; }
    for (const a of runAccs) if (!a.crypto) a.lastRun = now;
    if (runAccs.length === V.accs.length) V.lastRun = now;
    if (tfs.length) V.lastN = nData;
    vaccSet(V);
    say('робот: проверено ' + V.lastN + ' бумаг');
    return ev;
  }

  // 3.2: робот «Биткоин · тренд» — не волны, а тренд: держит биткоин, пока дневное закрытие выше средней за 100 дней, иначе всё в долларах.
  // Доля биткоина в счёте — по волатильности: min(100%, 30% / годовая волатильность за 30 дней); по воскресеньям подгоняется, если ушла больше чем на 5% счёта.
  // Решение — по закрытию дня (00:00 UTC = 03:00 МСК), сделка — по открытию следующего дня. Счёт в долларах, комиссия 0,1%, свободные доллары — без процентов.
  // На истории 2018–2026: ~27%/год, просадка ~25% (research/crypto_btc.js, «доля по волатильности, цель 30%»).
  const BTC = { n: 100, vt: 0.30, band: 0.05, fee: 0.001 };
  function btcSignal(b, i) {
    if (i < Math.max(BTC.n, 31)) return null;
    let s = 0; for (let j = i - BTC.n + 1; j <= i; j++) s += b[j].c;
    const r = []; for (let j = i - 29; j <= i; j++) r.push(Math.log(b[j].c / b[j - 1].c));
    const m = r.reduce((x, y) => x + y, 0) / r.length, vol = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / (r.length - 1) * 365), sma = s / BTC.n;
    return { sma, vol, up: b[i].c > sma, share: b[i].c > sma ? Math.min(1, BTC.vt / vol) : 0 };
  }
  async function btcStep(a, ev, now) {
    const bars = await loadCandles('', CRYPTO_ID, '1d', 400), done = bars.filter((b) => b.t + 864e5 <= now);
    if (done.length < 140) throw new Error('мало свечей биткоина (' + done.length + ')');
    const last = bars[bars.length - 1]; a.px[CRYPTO_ID] = last.c;
    const open = { id: CRYPTO_ID, ticker: 'BTC', name: 'Биткоин', classCode: 'CRYPTO', tf: '1d' }, tag = 'робот «' + a.name + '»';
    const usd = (x) => '$' + Math.round(x).toLocaleString('ru-RU'), pc = (x) => Math.round(x * 100) + '%';
    const note = (title, text) => { log('robot', a.name + ': ' + text); ev.push({ title: 'BTC: ' + title + ' · ' + tag, text, open, kind: 'robot' }); };
    const sell = (p, qty, px, t, why) => {
      const k = qty / p.qty, cost = p.cost * k, v = qty * px * (1 - BTC.fee), pl = v - cost; a.cash += v;
      a.closed.push({ id: CRYPTO_ID, ticker: 'BTC', crypto: true, side: 1, qty, entry: p.cost / p.qty, entryT: p.entryT, exit: px, exitT: t, why, pl, divs: 0 });
      if (k >= 1 - 1e-9) a.pos = a.pos.filter((z) => z !== p); else { p.qty -= qty; p.cost -= cost; }
      return pl;
    };
    // дни, закрывшиеся после прошлого хода; в первый ход — только последний (робот торгует с этого дня вперёд)
    let i0 = a.lastT ? done.findIndex((b) => b.t > a.lastT) : done.length - 1;
    for (let i = i0 < 0 ? done.length : i0; i < done.length; i++) {
      const sg = btcSignal(done, i), first = !a.lastT;
      const nb = bars.find((b) => b.t === done[i].t + 864e5);
      if (sg && !nb && i === done.length - 1) break;   // свечи нового дня ещё нет — решение по последнему дню примем в следующий ход, а не потеряем
      a.lastT = done[i].t; if (!sg) continue;
      a.sig = { t: done[i].t, c: done[i].c, sma: sg.sma, vol: sg.vol, share: sg.share };
      if (!nb) continue;   // пропуск в данных биржи (дня нет)
      // сделка — по открытию следующего дня; в самый первый ход — по текущей цене (открытие могло быть почти сутки назад)
      const o = first ? last.c : nb.o, t = first ? now : nb.t, p = a.pos[0], val = p ? p.qty * o : 0, eq = a.cash + val;
      const why = `закрытие ${usd(done[i].c)} ${sg.up ? 'выше' : 'ниже'} средней за 100 дней ${usd(sg.sma)}`;
      if (!p && sg.share > 0) {
        const buy = eq * sg.share; a.cash -= buy;
        a.pos.push({ id: CRYPTO_ID, ticker: 'BTC', crypto: true, qty: buy * (1 - BTC.fee) / o, side: 1, entry: o, entryT: t, stop: 0, target: 0, cost: buy, divs: 0, share: sg.share });
        note('вход, держать ' + pc(sg.share) + ' счёта', `купил BTC на ${pc(sg.share)} счёта (${usd(buy)}) по ~${usd(o)}: ${why}; волатильность ${pc(sg.vol)} в год — поэтому доля ${pc(sg.share)}, остальное в долларах`);
      } else if (p && sg.share === 0) {
        const pl = sell(p, p.qty, o, t, 'ниже средней-100');
        note('выход, всё в доллары', `продал весь BTC по ~${usd(o)} (${pl >= 0 ? '+' : '−'}${usd(Math.abs(pl))}): ${why}. Ждём, пока закрытие снова будет выше средней`);
      } else if (p && new Date(done[i].t).getUTCDay() === 0 && Math.abs(eq * sg.share - val) > BTC.band * eq) {
        const d = eq * sg.share - val;
        if (d > 0) { p.qty += d * (1 - BTC.fee) / o; p.cost += d; a.cash -= d; } else sell(p, -d / o, o, t, 'подгонка доли');
        p.share = sg.share; p.entry = p.cost / p.qty;
        note('доля ' + pc(val / eq) + ' → ' + pc(sg.share), `воскресенье, подгонка доли: BTC было ${pc(val / eq)} счёта, нужно ${pc(sg.share)} — ${d > 0 ? 'докупил' : 'продал'} на ${usd(Math.abs(d))} по ~${usd(o)} (волатильность ${pc(sg.vol)} в год)`);
      }
    }
    // кривая капитала: точка в день
    const eq = vEquity(a), lh = a.hist[a.hist.length - 1];
    if (!lh || new Date(lh.t + 3 * 36e5).toISOString().slice(0, 10) !== new Date(now + 3 * 36e5).toISOString().slice(0, 10)) a.hist.push({ t: now, eq, mm: 0, dep: a.dep }); else { lh.t = now; lh.eq = eq; lh.dep = a.dep; }
    if (a.hist.length > 2000) a.hist.splice(0, a.hist.length - 2000);
  }

  // 2.43: время закрытия последней свечи таймфрейма (+1 мин, пока брокер отдаст её закрытой); 4ч — по UTC 0/4/8…, дневки — конец дня по МСК
  // 3.2: 'u1d' — сутки по UTC (биткоин: день закрывается в 00:00 UTC = 03:00 МСК)
  function lastClose(tf, now) { const p = tf === '4h' ? 4 * 3600e3 : tf === '1h' ? 3600e3 : 864e5, off = p === 864e5 && tf !== 'u1d' ? 3 * 3600e3 : 0; return Math.floor((now - 60e3 + off) / p) * p - off; }
  // 3.10: когда закроется свеча, которая идёт сейчас (таймер «до закрытия свечи» у сигнала: в приложении, виджете и уведомлении).
  // Внутри дня — по часам UTC, как свечи брокера (4ч: 03/07/11/15/19/23 МСК), но не позже конца торгов 23:50 МСК; дневка — 23:50 МСК.
  // 0 — торгов нет (23:50–06:50 МСК: следующая свеча откроется утром) или таймфрейм крупнее дня
  function candleEnd(tf, now) {
    now = now || Date.now();
    const H = 3600e3, msk = now + 3 * H, tod = ((msk % 864e5) + 864e5) % 864e5;
    if (tod >= 23 * H + 50 * 60e3 || tod < 6 * H + 50 * 60e3) return 0;
    const close = now - tod + 23 * H + 50 * 60e3, T = TF[tf];
    if (tf === '1d') return close;
    if (!T || T.ms > 4 * H) return 0;
    return Math.min(Math.floor(now / T.ms) * T.ms + T.ms, close);
  }
  // 3.10: таймер у сигнала робота — до закрытия свечи входа. У сигналов до 3.10 времени нет — считаем по времени сигнальной свечи:
  // 4ч и мельче — если сейчас идёт свеча сразу после сигнальной; дневка — если сейчас торги следующего дня после сигнала
  function pendUntil(p, tf, now) {
    now = now || Date.now();
    if (p.until) return p.until > now ? p.until : 0;
    const T = TF[tf]; if (!T || !p.sigT) return 0;
    if (tf === '1d') { const day = (t) => Math.floor((t + 3 * 3600e3) / 864e5); return day(now) > day(p.sigT) && day(now) - day(p.sigT) <= 4 ? candleEnd('1d', now) : 0; }
    return Math.floor(now / T.ms) * T.ms === Math.floor(p.sigT / T.ms) * T.ms + T.ms ? candleEnd(tf, now) : 0;
  }
  const accTf = (a) => (a.crypto ? 'u1d' : a.manual ? '1d' : a.tf || '1d');
  // когда разбудить телефон: сразу после закрытия ближайшей свечи роботов (+90 с); 0 — роботов нет или они на паузе
  function nextAlarm() {
    if (settings().robotMode === 'server') return 0;
    const V = vaccGet(); if (!V || !V.on) return 0;
    const dly = settings().token ? 0 : MX_DELAY;   // без токена свечи с Мосбиржи видны через ~15 мин после закрытия
    const now = Date.now(), tfs = new Set(V.accs.filter((a) => !a.manual).map(accTf)); let t = 0;
    for (const tf of tfs) { const d = tf === 'u1d' ? 0 : dly, c = lastClose(tf, now - d) + (tf === '4h' ? 4 * 3600e3 : tf === '1h' ? 3600e3 : 864e5) + 90e3 + d; if (!t || c < t) t = c; }
    return t;
  }
  // 3.10: отправка уведомлений (приложение и фон). У сигнала с таймером (e.until) — живой отсчёт до закрытия свечи (Bridge.notifyTimer)
  // и время закрытия в тексте (на случай, если телефон отсчёт не показывает)
  function notifySend(ev, id0) {
    const A = root.Android; if (!A || !ev) return;
    const p2 = (n) => String(n).padStart(2, '0'), msk = settings().tz !== 'local';
    let id = id0;
    for (const e of ev) {
      try {
        const op = e.open ? JSON.stringify(e.open) : '', tm = e.until > Date.now();
        let text = e.text || '';
        if (tm) { const d = dispDate(e.until); text += ` Свеча закроется в ${p2(d.h)}:${p2(d.m)}${msk ? ' МСК' : ''}.`; }
        if (tm && A.notifyTimer) A.notifyTimer(e.title, text, id, op, String(e.until));
        else if (A.notifyOpen) A.notifyOpen(e.title, text, id, op); else A.notify(e.title, text, id);
      } catch (x) { log('error', 'уведомление: ' + x.message); }
      id++;
    }
  }
  // история всех отправленных уведомлений (для списка в приложении)
  function notifSave(ev) {
    if (!ev || !ev.length) return;
    const h = store.get('notifHist', []), t = Date.now();
    for (const e of ev) h.push({ t, title: e.title, text: e.text, open: e.open || null });
    store.set('notifHist', h.slice(-200));
  }
  // одна проверка за раз: фон по расписанию, «будильник» и проверка при открытом приложении не должны идти одновременно
  function bgLock(ms) { const l = store.get('bgLock', 0); if (Date.now() - l < ms) return false; store.set('bgLock', Date.now()); return true; }
  function bgUnlock() { store.set('bgLock', 0); }

  root.EWData = { validCandle, updateLiveCandle, pendUntil, notifySend, candleEnd, dispDate, mxState, CRYPTO_ID, isCrypto, nextAlarm, robBusy, notifSave, bgLock, bgUnlock, widgetPush, vaccGet, vaccSet, vEquity, robotStep, serverGet, serverSync, serverOffline, getCashFlows, log, logInit, logFlush, logRead, logClear, setDec, needBg, priceItems, instByUid, getOperations, getLastPrices, buildMarket, getMarket, getAccounts, getAccountMoney, getUniverse, files, instInfo, getDividends, adjustDividends, withDividends, scanNeed, getScanBars, TF, store, settings, saveSettings, call, loadCandles, getBars, findInstrument, events, checkAll, decimals, fmtPrice, parseCandles };
})(typeof window !== 'undefined' ? window : globalThis);
