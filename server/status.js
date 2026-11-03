// Страничка статуса сервера и роботов: http://<tailscale-IP>:8090
// Слушает только адрес Tailscale; при загрузке ждёт появления интерфейса.
// Запуск: node status.js (ставится в cron @reboot).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { execSync } = require('child_process');

const DIR = __dirname, DATA = path.join(DIR, 'data');
let SERVER_CFG = {};
try { SERVER_CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8')); } catch (e) { /* ключ можно передать переменной окружения */ }
const API_KEY = process.env.EW_SERVER_KEY || SERVER_CFG.apiKey || '';

// ---------- тот же мост, что в run.js: считаем капитал роботов настоящим движком ----------
const FILES = path.join(DATA, 'files');
fs.mkdirSync(FILES, { recursive: true });
const LS_FILE = path.join(DATA, 'localstorage.json');
let lsData = {};
try { lsData = JSON.parse(fs.readFileSync(LS_FILE, 'utf8')); } catch (e) { lsData = {}; }
global.window = globalThis;
global.localStorage = {
  getItem: (k) => (k in lsData ? lsData[k] : null),
  setItem: () => {}, removeItem: () => {}, key: (i) => Object.keys(lsData)[i],
};
Object.defineProperty(global.localStorage, 'length', { get: () => Object.keys(lsData).length });
global.Android = {
  server: true,
  fileRead(n) { try { return fs.readFileSync(path.join(FILES, path.basename(String(n))), 'utf8'); } catch (e) { return null; } },
  fileWrite() { return false; }, listFiles() { return '[]'; },
  notify() {}, notifyOpen() {}, notifyTimer() {},
};
const ASSETS = path.join(DIR, '..', 'android', 'assets');
require(path.join(ASSETS, 'divs.js'));
global.EW2 = require(path.join(ASSETS, 'engine2.js'));
require(path.join(ASSETS, 'data.js'));
const D = globalThis.EWData;

function reread() { try { lsData = JSON.parse(fs.readFileSync(LS_FILE, 'utf8')); } catch (e) { /* не важно */ } }

function robotState() {
  try { return JSON.parse(fs.readFileSync(path.join(FILES, 'vacc.json'), 'utf8')); }
  catch (e) { return null; }
}

const fmtT = (t) => {
  if (!t) return '—';
  const d = new Date(t + 3 * 3600000), p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
const ago = (t) => {
  if (!t) return 'никогда';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин назад';
};
const money = (a, x) => (a.crypto ? '$' : '') + Math.round(x).toLocaleString('ru-RU') + (a.crypto ? '' : ' ₽');

function tail(file, n) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n);
  } catch (e) { return []; }
}

function page() {
  reread();
  const now = Date.now();
  // система
  const upH = Math.floor(os.uptime() / 3600), mem = process.memoryUsage();
  const free = Math.round(os.freemem() / 1048576), tot = Math.round(os.totalmem() / 1048576);
  let disk = '';
  try { disk = execSync('df -h / | tail -1').toString().trim().split(/\s+/).slice(1).join(' · '); } catch (e) { /* не важно */ }
  // cron жив?
  let cronAt = 0;
  try { cronAt = fs.statSync(path.join(DATA, 'cron.log')).mtimeMs; } catch (e) { /* ещё не было */ }
  const cronOk = now - cronAt < 11 * 60000;
  // роботы
  let rows = '', lastRun = 0, errRows = '';
  try {
    const V = D.vaccGet();
    if (V && V.accs) {
      lastRun = Math.max(V.lastRun || 0, ...V.accs.map((a) => a.lastRun || 0));
      for (const a of V.accs) {
        const eq = D.vEquity(a), pc = a.dep > 0 ? (eq / a.dep - 1) * 100 : 0;
        const cls = pc >= 0 ? 'pos' : 'neg';
        rows += `<tr><td>${a.name}</td><td class="${cls}">${money(a, eq)}</td><td class="${cls}">${pc >= 0 ? '+' : ''}${pc.toFixed(1)}%</td><td>${a.pos.length}</td><td>${a.closed.length}</td><td>${ago(a.lastRun)}</td></tr>`;
      }
    } else rows = '<tr><td colspan="6">роботы не запущены (нет состояния)</td></tr>';
  } catch (e) { rows = `<tr><td colspan="6">ошибка чтения состояния: ${e.message}</td></tr>`; }
  // последние строки лога хода
  const logLines = tail(path.join(DATA, 'cron.log'), 8).map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Робот · статус</title>
<style>
body{background:#14181e;color:#e8ecf1;font:15px/1.45 -apple-system,Roboto,sans-serif;margin:0;padding:14px;max-width:640px;margin:auto}
h1{font-size:18px;margin:6px 0 12px} h2{font-size:15px;margin:16px 0 6px;color:#8d98a6}
table{width:100%;border-collapse:collapse} td,th{padding:5px 6px;border-bottom:1px solid #2e3744;text-align:right;white-space:nowrap}
td:first-child,th:first-child{text-align:left}
.pos{color:#3fbf7f}.neg{color:#ef5b5b}.mut{color:#8d98a6}
.pill{display:inline-block;padding:2px 10px;border-radius:10px;font-size:13px}
.ok{background:#173a2a;color:#3fbf7f}.bad{background:#3a1c1c;color:#ef5b5b}
pre{background:#0e1217;border-radius:8px;padding:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap}
</style></head><body>
<h1>🤖 Робот на сервере</h1>
<div>Ход робота: <span class="pill ${cronOk ? 'ok' : 'bad'}">${cronOk ? 'работает' : 'НЕТ ХОДА > 10 МИН'}</span> <span class="mut">· ${ago(cronAt)}</span></div>
<div class="mut" style="margin-top:4px">Сервер: аптайм ${upH} ч · память свободно ${free} из ${tot} МБ${disk ? ' · диск: ' + disk : ''}</div>
<h2>Счета роботов</h2>
<table><tr><th>счёт</th><th>капитал</th><th>доход</th><th>поз.</th><th>закр.</th><th>ход</th></tr>${rows}</table>
<div class="mut" style="margin-top:4px">Последний ход: ${fmtT(lastRun)} МСК (${ago(lastRun)})</div>
<h2>Последние строки журнала</h2>
<pre>${logLines.join('\n') || 'пусто'}</pre>
<div class="mut">Страница обновляется сама раз в минуту · ${fmtT(now)} МСК</div>
</body></html>`;
}

// слушаем только адрес Tailscale (100.64.0.0/10) — страничка видна лишь в твоей частной сети
function bindAddr() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const i of ifs[name] || [])
    if (i.family === 'IPv4' && /^100\.(\d+)\./.test(i.address) && Number(i.address.split('.')[1]) >= 64 && Number(i.address.split('.')[1]) <= 127) return i.address;
  return null;
}
const PORT = 8090;
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS' && req.url === '/api/robots') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-app-name', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/api/robots') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!API_KEY || auth !== API_KEY) { res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ error: 'unauthorized' })); }
        const q = body ? JSON.parse(body) : {};
        if (q.kind !== 'ew-robots-request') { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ error: 'bad request' })); }
        const state = robotState();
        if (!state || !state.accs) { res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ error: 'state unavailable' })); }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ kind: 'ew-robots-state', v: 1, serverAt: Date.now(), lastRun: state.lastRun || 0, state }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ошибка: ' + e.message);
  }
});
function listen() {
  const ip = bindAddr();
  if (!ip) { console.log('статус: ожидаю Tailscale'); setTimeout(listen, 10000); return; }
  server.listen(PORT, ip, () => console.log('статус: http://' + ip + ':' + PORT));
}
server.on('error', (e) => {
  if (e.code === 'EADDRNOTAVAIL') setTimeout(listen, 10000);
  else { console.error('статус: ' + e.code); process.exit(1); }
});
listen();
