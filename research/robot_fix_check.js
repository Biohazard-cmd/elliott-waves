// Самопроверка исправлений 3.7 в data.js (без сети, всё подменено):
// 1) два хода робота одновременно — второй пропускается; 2) биткоин: нет свечи нового дня — решение по последнему дню не теряется;
// 3) без токена биткоин ходит сразу после 00:00 UTC (не ждёт задержки Мосбиржи); 4) нет списка акций — пополнения/проценты/ход биткоина сохраняются;
// 5) уровни: одна бумага без свечей не мешает остальным. Запуск: node robot_fix_check.js — в конце «ошибок нет» или список.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const mem = {}; global.window = globalThis;
global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] };
Object.defineProperty(global.localStorage, 'length', { get: () => Object.keys(mem).length });
global.EW2 = require('../android/assets/engine2.js'); require('../android/assets/data.js'); const D = globalThis.EWData;
const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'crypto', 'BTC_1d.json.gz'))));
const DAY = 864e5; let NOW = 0, noCur = false, slow = 0; Date.now = () => NOW;
const errs = [], ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) errs.push(m); };
const issHits = [];
global.fetch = async (u) => {
  u = String(u);
  if (slow) await new Promise((r) => setTimeout(r, slow));
  if (/binance/.test(u)) {
    const q = new URL(u).searchParams, st = +q.get('startTime') || 0, en = +q.get('endTime') || NOW, lim = +q.get('limit') || 500;
    let rows = B.filter((r) => r[0] <= NOW && r[0] >= st && r[0] <= en && !(noCur && r[0] + DAY > NOW)).map((r) => [r[0], String(r[1]), String(r[2]), String(r[3]), r[0] + DAY > NOW ? String(r[1]) : String(r[4]), '1', r[0] + DAY - 1]);
    rows = st ? rows.slice(0, lim) : rows.slice(-lim);
    return { status: 200, text: async () => JSON.stringify(rows) };
  }
  if (/iss\.moex\.com/.test(u)) {
    issHits.push(u);
    if (/securities\/BAD/.test(u) || /boards\/TQBR\/securities\.json/.test(u)) return { status: 500, text: async () => 'ошибка' };
    if (/securities\/SBER\.json/.test(u)) return { status: 200, text: async () => JSON.stringify({ securities: { columns: ['SECID', 'SHORTNAME', 'SECNAME', 'LOTSIZE', 'SECTYPE'], data: [['SBER', 'Сбербанк', 'Сбербанк', 10, '1']] } }) };
    if (/securities\/SBER\/candles/.test(u)) {
      const start = +new URL(u).searchParams.get('start') || 0; if (start) return { status: 200, text: async () => JSON.stringify({ candles: { columns: [], data: [] } }) };
      const t0 = NOW - 2 * 3600e3, msk = (t) => new Date(t + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
      const data = []; for (let k = 0; k < 100; k++) { const p = 300 + (k > 60 ? 6 : 0); data.push([msk(t0 + k * 60e3), p, p + 0.5, p - 0.5, p, 100]); }
      return { status: 200, text: async () => JSON.stringify({ candles: { columns: ['begin', 'open', 'high', 'low', 'close', 'volume'], data } }) };
    }
  }
  throw new Error('нет сети: ' + u);
};
const btcAcc = (cash) => ({ key: 'btc_trend', name: 'Биткоин · тренд', crypto: true, tf: '1d', cfg: {}, cash, dep: cash, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0 });
const T0 = Date.UTC(2026, 8, 10);   // 10.09.2026 00:00 UTC

(async () => {
  // 1) одновременный ход
  D.saveSettings(Object.assign(D.settings(), { token: 't' }));
  NOW = T0 + 120e3;
  D.vaccSet({ on: true, startAt: NOW - 3 * DAY, mmRate: 0, top: 50, flows: [], lastAccrue: NOW, accs: [btcAcc(1000)] });
  slow = 30;
  const p1 = D.robotStep(null, true), r2 = await D.robotStep(null, true), r1 = await p1;
  slow = 0;
  ok(Array.isArray(r2) && r2.length === 0 && D.logRead().app.items.some((x) => /уже идёт/.test(x.m)), 'второй ход, пока идёт первый, пропущен');
  ok(r1.length === 1 && D.vaccGet().accs[0].lastT === T0 - DAY, 'первый ход сделан (одно уведомление, день ' + new Date(D.vaccGet().accs[0].lastT).toISOString().slice(0, 10) + ')');
  ok(!D.robBusy() && D.store.get('robRun', null) == null, 'после хода метка «идёт ход» снята');

  // 2) нет свечи нового дня
  const V2 = D.vaccGet(); V2.accs[0] = Object.assign(btcAcc(1000), { lastT: T0 - 2 * DAY }); D.vaccSet(V2);
  noCur = true; NOW = T0 + DAY + 60e3;   // 11.09 00:01 UTC — день 10.09 закрыт, а свечи 11.09 у биржи ещё нет
  await D.robotStep(null, true);
  const a2 = D.vaccGet().accs[0];
  ok(a2.lastT === T0 - DAY, 'свечи нового дня нет — последний день (10.09) не помечен решённым, ждёт следующего хода (lastT ' + new Date(a2.lastT).toISOString().slice(0, 10) + ')');
  noCur = false; NOW = T0 + DAY + 300e3;
  await D.robotStep(null, true);
  ok(D.vaccGet().accs[0].lastT === T0, 'свеча появилась — решение по 10.09 принято');

  // 3) без токена: биткоин ходит в 00:02 UTC, не ждёт 16 мин
  D.saveSettings(Object.assign(D.settings(), { token: '' }));
  const V3 = D.vaccGet(); V3.accs[0].lastRun = T0 + 2 * DAY - 1800e3; D.vaccSet(V3);   // прошлый ход в 23:30 UTC — меньше 50 мин назад
  NOW = T0 + 2 * DAY + 120e3;
  await D.robotStep(null, false);
  ok(D.vaccGet().accs[0].lastRun === NOW, 'без токена биткоин ходит сразу после закрытия дня (00:02 UTC)');
  ok(D.nextAlarm() === T0 + 3 * DAY + 90e3, 'будильник биткоина — в 00:01:30 UTC');

  // 4) нет списка акций (Мосбиржа не отвечает): ход биткоина и проценты сохранены
  const V4 = D.vaccGet();
  V4.mmRate = 10; V4.lastAccrue = NOW - DAY;
  V4.accs.unshift({ key: 'd_long', name: 'основной', tf: '1d', cfg: {}, cash: 100000, dep: 100000, mm: 0, pos: [], closed: [], hist: [], px: {}, seen: {}, pend: {}, skipped: 0 });
  V4.accs[1].lastRun = 0; delete V4.accs[1].lastT; V4.accs[1].pos = []; V4.accs[1].cash = 1000;
  D.vaccSet(V4);
  const ev4 = await D.robotStep(null, true);
  const V4b = D.vaccGet();
  ok(ev4.some((e) => /^BTC:/.test(e.title)) && V4b.accs[1].lastRun === NOW && V4b.lastAccrue === NOW && V4b.accs[0].mm > 0, 'нет списка акций — ход биткоина и проценты ВИМ сохранены (не повторятся)');
  const ev4b = await D.robotStep(null, true);
  ok(!ev4b.some((e) => /^BTC: вход/.test(e.title)), 'повторный ход не присылает тот же вход биткоина второй раз');

  // 5) уровни: BAD без свечей, SBER — уровень достигнут
  D.files.set('vacc.json', null);
  const s5 = D.settings(); s5.watch = []; s5.palerts = [
    { id: 'p1', instId: 'BAD_TQBR', ticker: 'BAD', name: 'BAD', classCode: 'TQBR', price: 100, dir: 1, at: NOW - 3600e3 },
    { id: 'p2', instId: 'SBER_TQBR', ticker: 'SBER', name: 'Сбербанк', classCode: 'TQBR', price: 305, dir: 1, at: NOW - 3600e3 }];
  D.saveSettings(s5); D.store.set('lastpcheck', NOW - 1800e3);
  const ev5 = await D.checkAll(null, {});
  ok(ev5.some((e) => /^SBER: цена 305/.test(e.title)), 'уровень SBER сработал, хотя у BAD нет свечей');
  ok(D.store.get('lastpcheck', 0) === NOW - 1800e3, 'BAD не проверен — следующая проверка уровней начнётся с прежнего места');
  ok(D.store.get('pfired', {}).p2 && !D.store.get('pfired', {}).p1, 'SBER отмечен сработавшим и не повторится, BAD — нет');
  const ev5b = await D.checkAll(null, {});
  ok(!ev5b.some((e) => /^SBER/.test(e.title)), 'повторная проверка не присылает уровень SBER второй раз');

  console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log('сбой:', e.stack); process.exit(1); });
