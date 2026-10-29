// Мост window.Android для компьютера — те же методы, что у Bridge.java в телефоне, чтобы страница из android/assets работала без переделки.
// Файлы и запросы делаются здесь (Node.js), окно, уведомления и значок у часов — в main.js.
'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http'), tls = require('tls'), crypto = require('crypto');

const P = ipcRenderer.sendSync('paths');
const DATA = path.join(P.userData, 'data');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) { /* есть */ }
const back = (code) => webFrame.executeJavaScript(code).catch(() => { /* страница перезагружается */ });

// ---------- сертификат Минцифры (Russian Trusted Root CA) — как в телефоне: скачивается с gu-st.ru, только для запросов программы ----------
const CA_URLS = ['https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt', 'https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt'];
const caFile = (k) => path.join(P.userData, 'mincifry_ca_' + k + '.crt');
let caList = null;
function cas() {
  if (caList) return caList;
  const ru = [0, 1].map((k) => { try { return new crypto.X509Certificate(fs.readFileSync(caFile(k))).toString(); } catch (e) { return null; } }).filter(Boolean);
  caList = ru.length ? tls.rootCertificates.concat(ru) : null;   // null — обычные корневые сертификаты
  return caList;
}
function describe(c) {
  const d = new Date(c.validTo), p2 = (n) => String(n).padStart(2, '0');
  return c.subject.split('\n').reverse().join(',') + '|до ' + p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear() + '|SHA-256 ' + c.fingerprint256;
}

// ---------- запросы: ответ — в window.__httpDone(id, код, текст), как в телефоне; код 0 — нет связи ----------
function request(url, opt, body) {
  return new Promise((res) => {
    let done = false;
    const fin = (code, text) => { if (!done) { done = true; res({ code, text }); } };
    try {
      const u = new URL(url), lib = u.protocol === 'http:' ? http : https, ca = cas();
      const req = lib.request(u, Object.assign({ timeout: 40000 }, ca && lib === https ? { ca } : {}, opt), (r) => {
        const ch = []; r.on('data', (d) => ch.push(d));
        r.on('end', () => fin(r.statusCode, Buffer.concat(ch).toString('utf8')));
        r.on('error', (e) => fin(0, String(e.message || e)));
      });
      req.on('timeout', () => { req.destroy(new Error('нет ответа 40 с')); });
      req.on('error', (e) => fin(0, /CERT|ISSUER|SELF_SIGNED|certificate/i.test((e.code || '') + e.message) ? 'SSLHandshake: ' + (e.code || e.message) : String(e.message || e)));
      if (body) req.write(body);
      req.end();
    } catch (e) { fin(0, String(e.message || e)); }
  });
}
function reply(id, r) { back('window.__httpDone && window.__httpDone(' + Number(id) + ',' + Number(r.code) + ',' + JSON.stringify(r.text) + ')'); }

// ---------- файлы программы (роботы, кэш свечей сканера, журнал) ----------
const appFile = (name) => path.join(DATA, String(name).replace(/[^A-Za-z0-9_.-]/g, '_'));
let bigOut = null, bigPath = '', lastPath = '';
function freeName(name) {
  const dir = P.downloads, ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let f = path.join(dir, name);
  for (let k = 2; fs.existsSync(f) && k < 100; k++) f = path.join(dir, base + ' (' + k + ')' + ext);
  return f;
}

contextBridge.exposeInMainWorld('Android', {
  desktop: true,
  version: () => '1',
  setBarColor: () => {},
  widgetUpdate: (json) => ipcRenderer.send('widget', String(json)),
  isBackground: () => false,
  log: (msg) => console.log(String(msg)),
  notify: (title, text, id) => ipcRenderer.send('notify', { title: String(title), text: String(text), id, open: '' }),
  notifyOpen: (title, text, id, open) => ipcRenderer.send('notify', { title: String(title), text: String(text), id, open: String(open || '') }),
  setQuiet: (q) => ipcRenderer.send('quiet', !!q),
  isQuiet: () => ipcRenderer.sendSync('isQuiet'),
  takeOpen: () => ipcRenderer.sendSync('takeOpen'),
  // фоновой проверки по расписанию у компьютера нет: страница сама проверяет каждые 5 минут, пока программа открыта или у часов
  schedule: () => true,
  isScheduled: () => true,
  setAlarm: (at) => ipcRenderer.send('alarm', String(at)),
  postAsync: (id, url, token, body) => {
    request(String(url), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-app-name': 'elliott-waves-app', 'Content-Length': Buffer.byteLength(String(body)) } }, String(body)).then((r) => reply(id, r));
  },
  getAsync: (id, url) => { request(String(url), { method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'elliott-waves-desktop' } }).then((r) => reply(id, r)); },
  caInfo: () => { try { return describe(new crypto.X509Certificate(fs.readFileSync(caFile(0)))); } catch (e) { return ''; } },
  installRussianCA: () => {
    (async () => {
      let info = '';
      for (let k = 0; k < CA_URLS.length; k++) {
        const data = await new Promise((res, rej) => https.get(CA_URLS[k], { timeout: 30000 }, (r) => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('gu-st.ru ответил ' + r.statusCode)); } const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => res(Buffer.concat(ch))); }).on('error', rej));
        const c = new crypto.X509Certificate(data);
        if (!/Russian Trusted/.test(c.subject)) throw new Error('неожиданный сертификат: ' + c.subject);
        if (!c.ca) throw new Error('это не сертификат удостоверяющего центра');
        if (Date.now() > Date.parse(c.validTo) || Date.now() < Date.parse(c.validFrom)) throw new Error('сертификат просрочен');
        fs.writeFileSync(caFile(k), data);
        if (k === 0) info = describe(c);
      }
      caList = null;
      return info;
    })().then((info) => back('window.__caDone && window.__caDone(true,' + JSON.stringify(info) + ')'),
      (e) => back('window.__caDone && window.__caDone(false,' + JSON.stringify(String(e.message || e)) + ')'));
  },
  fileWrite: (name, text) => { try { const f = appFile(name); fs.writeFileSync(f + '.tmp', String(text), 'utf8'); fs.renameSync(f + '.tmp', f); return true; } catch (e) { return false; } },
  fileRead: (name) => { try { return fs.readFileSync(appFile(name), 'utf8'); } catch (e) { return ''; } },
  listFiles: (prefix) => { try { return JSON.stringify(fs.readdirSync(DATA).filter((n) => n.startsWith(prefix) && !n.endsWith('.tmp'))); } catch (e) { return '[]'; } },
  saveBegin: (name) => { try { bigPath = freeName(String(name)); bigOut = fs.openSync(bigPath, 'w'); return 'ok|' + bigPath; } catch (e) { return 'err|' + e.message; } },
  saveChunk: (b64) => { try { fs.writeSync(bigOut, Buffer.from(String(b64), 'base64')); return true; } catch (e) { return false; } },
  saveEnd: () => { try { fs.closeSync(bigOut); bigOut = null; lastPath = bigPath; return 'ok|' + bigPath; } catch (e) { return 'err|' + e.message; } },
  batteryOk: () => true,
  openBattery: () => {},
  saveDownload: (name, mime, text) => { try { const f = freeName(String(name)); fs.writeFileSync(f, String(text), 'utf8'); lastPath = f; return 'ok|' + f; } catch (e) { return 'err|' + e.message; } },
  // «Поделиться» на компьютере — показать файл в папке «Загрузки»
  shareLast: () => { if (!lastPath) return false; ipcRenderer.send('showItem', lastPath); return true; },
  done: () => {},
});
