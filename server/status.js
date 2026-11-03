// Страничка статуса сервера и роботов: http://<tailscale-IP>:8090
// Слушает только адрес Tailscale; при загрузке ждёт появления интерфейса.
// Запуск: node status.js (ставится в cron @reboot).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { execSync } = require('child_process');

const L = require('./monitor-lib'), dashboard = require('./dashboard'), admin = require('./admin');
const DIR = __dirname, DATA = L.DATA;
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

function tail(file,n) {
  let fd;
  try { fd=fs.openSync(file,'r'); const size=fs.fstatSync(fd).size, count=Math.min(size,65536),buf=Buffer.alloc(count);fs.readSync(fd,buf,0,count,size-count);return buf.toString('utf8').trim().split('\n').filter(Boolean).slice(-n); }
  catch(e){return[];}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function cleanLog(text){for(const x of [SERVER_CFG.token,SERVER_CFG.apiKey,SERVER_CFG.mail?.pass,SERVER_CFG.account?.id])if(x)text=text.split(String(x)).join('[скрыто]');return text;}

function page() {
  reread();
  let backups=[]; try { backups=fs.readdirSync(L.file('backups')).filter(x=>x.endsWith('.json')); } catch(e) {}
  return dashboard.render({ monitor:L.read(L.file('monitor.json'),{}), maintenance:L.read(L.file('maintenance.json'),{}), state:D.vaccGet(), equity:D.vEquity, logs:tail(L.file('cron.log'),12).concat(tail(L.file('monitor.log'),6),(L.read(L.file('files/log_srv.json'),{}).items||[]).filter(x=>x.k==='error').slice(-6).map(x=>dashboard.time(x.t)+' '+x.m)).map(cleanLog), rebootAllowed:process.platform==='linux'&&L.canReboot(), busy:L.busy(), settings:{...SERVER_CFG.monitor,...L.read(L.file('monitor-settings.json'),{})}, backups });
}

// слушаем только адрес Tailscale (100.64.0.0/10) — страничка видна лишь в твоей частной сети
function bindAddr() {
  if (process.env.EW_STATUS_TEST === '1') return '127.0.0.1';
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs).filter(n=>/^tailscale\d*$/i.test(n))) for (const i of ifs[name] || [])
    if (i.family === 'IPv4' && /^100\.(\d+)\./.test(i.address) && Number(i.address.split('.')[1]) >= 64 && Number(i.address.split('.')[1]) <= 127) return i.address;
  return null;
}
const PORT = Number(process.env.EW_PORT || 8090);
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  const reply=(status,x,cors=false)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...(cors?{'Access-Control-Allow-Origin':'*'}:{})});res.end(JSON.stringify(x));};
  if (req.method === 'OPTIONS' && req.url === '/api/robots') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-app-name', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }); return res.end();
  }
  if (req.method === 'POST' && ['/api/robots','/api/admin'].includes(req.url)) {
    const cors=req.url==='/api/robots';
    if(!admin.authorized(req.headers.authorization,API_KEY))return reply(401,{error:'Неверный ключ доступа'},cors);
    let body='',tooLarge=false;
    req.on('data',c=>{body+=c;if(Buffer.byteLength(body)>10000){tooLarge=true;req.destroy();}});
    req.on('end',()=>{
      if(tooLarge)return;
      let q;try{q=JSON.parse(body);}catch{return reply(400,{error:'Неверный JSON'},cors);}
      try{
        if(!q||typeof q!=='object')return reply(400,{error:'Неверный запрос'},cors);
        if(cors){
          if(q.kind!=='ew-robots-request'||q.v!==1)return reply(400,{error:'Неверный запрос'},true);
          const state=robotState();if(!state?.accs?.length)return reply(503,{error:'Состояние пока недоступно'},true);
          return reply(200,{kind:'ew-robots-state',v:1,serverAt:Date.now(),lastRun:state.lastRun||0,state},true);
        }
        return reply(200,admin.control(q));
      }catch(e){return reply(e.status||500,{error:e.status?e.message:'Не удалось выполнить действие. Проверьте журнал сервера.'},cors);}
    });return;
  }
  if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);return res.end();}
  try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page());}
  catch(e){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Не удалось прочитать данные. Повторите позже.');}
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
