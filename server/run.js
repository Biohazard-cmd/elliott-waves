// Робот «Волн Эллиотта» на сервере — ход всех счетов один раз и выход.
// Запуск: node run.js [--force] [--only ключ_робота]
// Тот же движок, что в приложении (assets/engine2.js + assets/data.js), цены — с Мосбиржи (без токена).
'use strict';
const fs = require('fs'), path = require('path');
const health = require('./monitor-lib');

const DIR = __dirname;
const DATA = path.join(DIR, 'data');
const FILES = path.join(DATA, 'files');           // то, что в приложении лежит в файлах (vacc.json, свечи сканера, журнал)
fs.mkdirSync(FILES, { recursive: true });

// ---------- секреты: server/config.json (не в git, права 600) ----------
// { "token": "t-инвестиций (только чтение)", "account": {"id","name"} — необязательно, "mail": {host,port,user,pass,to} }
const CFG_FILE = path.join(DIR, 'config.json');
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) { CFG = {}; }

// ---------- localStorage → data/localstorage.json ----------
const LS_FILE = path.join(DATA, 'localstorage.json');
let lsData = {};
try { lsData = JSON.parse(fs.readFileSync(LS_FILE, 'utf8')); } catch (e) { lsData = {}; }
let lsTimer = null;
function lsSave() {
  const tmp = LS_FILE + '.tmp';
  const out = Object.assign({}, lsData);
  if (out['ew2.settings']) {   // токен не сохраняем в файл состояния — живёт только в config.json
    try { const s = JSON.parse(out['ew2.settings']); for (const k of ['token', 'account', 'accounts', 'acct', 'serverKey']) delete s[k]; out['ew2.settings'] = JSON.stringify(s); } catch (e) { delete out['ew2.settings']; }
  }
  fs.writeFileSync(tmp, JSON.stringify(out));
  fs.renameSync(tmp, LS_FILE);
}
global.window = globalThis;
global.localStorage = {
  getItem: (k) => (k in lsData ? lsData[k] : null),
  setItem: (k, v) => { lsData[k] = String(v); clearTimeout(lsTimer); lsTimer = setTimeout(lsSave, 3000); },
  removeItem: (k) => { delete lsData[k]; clearTimeout(lsTimer); lsTimer = setTimeout(lsSave, 3000); },
  key: (i) => Object.keys(lsData)[i],
};
Object.defineProperty(global.localStorage, 'length', { get: () => Object.keys(lsData).length });

// ---------- мост «Android» для data.js: файлы — в data/files, уведомления — в очередь писем ----------
const outbox = [];
const safeName = (name) => path.join(FILES, path.basename(String(name)));
global.Android = {
  server: true,
  fileRead(name) { try { return fs.readFileSync(safeName(name), 'utf8'); } catch (e) { return null; } },
  fileWrite(name, txt) {
    try {
      const f = safeName(name), tmp = f + '.tmp';
      fs.writeFileSync(tmp, txt); fs.renameSync(tmp, f);
      return true;
    } catch (e) { return false; }
  },
  listFiles(prefix) {
    try { return JSON.stringify(fs.readdirSync(FILES).filter((f) => f.startsWith(prefix) && !f.endsWith('.tmp'))); }
    catch (e) { return '[]'; }
  },
  notify(title, text) { outbox.push({ title, text }); },
  notifyOpen(title, text) { outbox.push({ title, text }); },
  notifyTimer(title, text) { outbox.push({ title, text }); },
};

// ---------- движок приложения ----------
const ASSETS = path.join(DIR, '..', 'android', 'assets');
require(path.join(ASSETS, 'divs.js'));
global.EW2 = require(path.join(ASSETS, 'engine2.js'));
require(path.join(ASSETS, 'data.js'));
const D = globalThis.EWData;

// токен и счёт — из config.json в настройки в памяти (в файл состояния не пишутся, см. lsSave)
if (CFG.token) {
  try {
    const s = D.settings();
    s.token = CFG.token;
    if (CFG.account && CFG.account.id) { s.account = { id: CFG.account.id, name: CFG.account.name || 'счёт' }; s.acct = null; }
    D.saveSettings(s);
  } catch (e) { console.log('настройки: ' + e.message); }
}

function fmtT(t) {
  const d = new Date(t + 3 * 3600000), p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} МСК`;
}

(async () => {
  const args = process.argv.slice(2);
  // обслуживание: node run.js --accounts — показать счета Т-Инвестиций по токену из config.json (для поля account)
  if (args.includes('--accounts')) {
    if (!CFG.token) { console.log('нет токена в config.json'); process.exit(1); }
    try {
      const accs = await D.getAccounts(CFG.token);
      for (const a of accs) console.log(a.id + '  ' + a.name);
      if (!accs.length) console.log('счетов не найдено');
    } catch (e) { console.log('ошибка: ' + e.message); }
    process.exit(0);
  }
  const force = args.includes('--force');
  const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1] : undefined;
  const t0 = Date.now();
  if (health.read(health.file('control-lock.json'), {}).until > t0) { console.log('Проверка отложена: запрошено управление сервером.'); process.exit(0); }
  const lock = health.file('run.lock');
  try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch (e) {
    const owner = +(health.raw(lock) || 0);
    if (health.processes('run.js').includes(owner)) { console.log('Предыдущая проверка ещё работает.'); process.exit(0); }
    fs.writeFileSync(lock, String(process.pid), { mode: 0o600 });
  }
  process.once('exit', () => { if (health.raw(lock) === String(process.pid)) { try { fs.unlinkSync(lock); } catch (e) {} } });
  const priorHealth = health.read(health.file('run-health.json'), {});
  health.write(health.file('run-health.json'), { ...priorHealth, startedAt: t0, running: true, pid: process.pid });
  let runFailed = false;
  process.once('uncaughtException', () => {
    health.write(health.file('run-health.json'), { startedAt: t0, finishedAt: Date.now(), running: false, ok: false, lastSuccessAt: priorHealth.lastSuccessAt || 0 });
    console.error('Аварийное завершение проверки роботов.'); process.exit(1);
  });
  D.logInit('log_srv.json');
  D.log('server', 'ход робота на сервере' + (force ? ' (принудительно)' : '') + (only ? ' (только ' + only + ')' : ''));

  const onLog = (m) => console.log('· ' + m);
  let ev = [];
  try {
    ev = (await D.robotStep(onLog, force, only)) || [];
  } catch (e) {
    runFailed = true;
    D.log('error', 'ход робота: ' + (e && e.message));
    // Техническое письмо отправит независимый монитор от имени «Домашний сервер».
  }
  try { D.logFlush(); } catch (e) { /* не важно */ }

  // события — в историю уведомлений и в очередь писем (notify* моста уже наполнили outbox через notifySend)
  if (ev.length) {
    try { D.notifSave(ev); } catch (e) { /* не важно */ }
    try { D.notifySend(ev, 9000); } catch (e) { console.log('уведомления: ' + e.message); }
  }

  // короткая сводка по счетам — в консоль и в лог
  try {
    const V = D.vaccGet();
    if (V && V.accs) for (const a of V.accs) {
      const eq = D.vEquity(a);
      console.log(`${a.name}: ${Math.round(eq)} ${a.crypto ? '$' : '₽'} · позиций ${a.pos.length} · закрыто сделок ${a.closed.length}`);
    }
  } catch (e) { /* сводка не обязательна */ }

  // ---------- почта ----------
  const mail = CFG.mail;
  if (outbox.length) {
    if (mail && mail.host && mail.user && mail.pass && mail.to) {
      const sendMail = require(path.join(DIR, 'mail.js'));
      for (const m of outbox) {
        try {
          await sendMail(mail, m.title, m.text + '\n\n— робот на сервере, ' + fmtT(Date.now()));
          console.log('письмо отправлено: ' + m.title);
          D.log('mail', 'письмо: ' + m.title);
        } catch (e) {
          console.log('ПИСЬМО НЕ УШЛО: ' + e.message + ' (тема: ' + m.title + ')');
          D.log('error', 'почта: ' + e.message);
        }
      }
    } else {
      console.log('События есть, но почта не настроена (server/config.json) — они записаны в историю уведомлений.');
    }
  }

  try { D.logFlush(); } catch (e) { /* не важно */ }
  lsSave();
  const logState = health.read(health.file('files/log_srv.json'), {});
  const errors = (logState.items || []).filter((x) => x.t >= t0 && x.k === 'error').length;
  runFailed = runFailed || errors > 0;
  health.write(health.file('run-health.json'), { startedAt: t0, finishedAt: Date.now(), running: false, ok: !runFailed, errorCount: errors, durationMs: Date.now() - t0, lastSuccessAt: runFailed ? priorHealth.lastSuccessAt || 0 : Date.now() });
  console.log(ev.length ? 'Событий: ' + ev.length : 'Событий нет', '· заняло ' + ((Date.now() - t0) / 1000).toFixed(0) + ' с');
  process.exit(0);
})();
