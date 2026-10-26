// Волны Эллиотта для компьютера (Windows): окно Electron со страницей из android/assets.
// Мост window.Android — в preload.js (файлы, запросы к брокеру и Мосбирже, сохранение в «Загрузки»),
// здесь — то, что умеет только главный процесс: окно, значок у часов, уведомления Windows, «будильник» робота.
'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, nativeTheme, nativeImage, powerMonitor } = require('electron');
const path = require('path'), fs = require('fs');

app.setName('ElliottWaves');                     // данные — в %APPDATA%\ElliottWaves (переживают обновление папки программы)
app.setAppUserModelId('ru.elliottwaves.desktop'); // без этого Windows не показывает уведомления
nativeTheme.themeSource = 'dark';                 // тёмная рамка окна, как у приложения

// --quit — выйти (так установщик закрывает программу перед обновлением: данные успевают сохраниться)
if (!app.requestSingleInstanceLock() || process.argv.includes('--quit')) { app.quit(); process.exit(0); }

const ICON = path.join(__dirname, 'icon.png');
const prefsFile = () => path.join(app.getPath('userData'), 'desktop.json');
function prefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (e) { return {}; } }
function setPrefs(p) { try { fs.writeFileSync(prefsFile(), JSON.stringify(Object.assign(prefs(), p))); } catch (e) { /* не важно */ } }

let win = null, tray = null, quitting = false, pendingOpen = null, alarm = null;
const notes = [];   // держим ссылки, иначе нажатие на уведомление теряется (сборщик мусора)

function js(code) { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(code, true).catch(() => { /* страница перезагружается */ }); }
function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function createWindow() {
  const p = prefs(), b = p.bounds || {};
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width || 1400, height: b.height || 900, minWidth: 420, minHeight: 500,
    backgroundColor: '#14181e', title: 'Волны Эллиотта', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, spellcheck: false },
  });
  win.removeMenu();
  if (p.maximized) win.maximize();
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.loadFile(path.join(__dirname, 'assets', 'index.html'));

  // размер и место окна — в файл, но не на каждый сдвиг мыши: раз в полсекунды после того, как окно перестали двигать
  let bTimer = null;
  const saveBounds = () => { clearTimeout(bTimer); bTimer = setTimeout(() => { if (!win || win.isDestroyed()) return; const p2 = { maximized: win.isMaximized() }; if (!p2.maximized && !win.isMinimized() && win.isVisible()) p2.bounds = win.getBounds(); setPrefs(p2); }, 500); };
  win.on('resize', saveBounds); win.on('move', saveBounds);
  // выключение или перезагрузка Windows: окно закрывается по-настоящему, иначе «крестик = свернуть» мешал бы выключению
  win.on('query-session-end', () => { quitting = true; }); win.on('session-end', () => { quitting = true; });
  win.on('show', () => js('window.appResume && window.appResume()'));
  // крестик — не выход, а «свернуть к часам»: роботы и проверка сигналов продолжают работать
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!prefs().trayHint && Notification.isSupported()) {
      setPrefs({ trayHint: true });
      new Notification({ title: 'Волны Эллиотта работают у часов', body: 'Роботы и сигналы проверяются, пока программа свёрнута. Выйти совсем — правой кнопкой по значку у часов → «Выход».', icon: ICON }).show();
    }
  });
  // клавиши: Esc — назад, F5 — обновить, F11 — во весь экран, Ctrl+Shift+I — инструменты разработчика
  win.webContents.on('before-input-event', (e, inp) => {
    if (inp.type !== 'keyDown') return;
    if (inp.key === 'Escape') js('window.appBack && window.appBack()');
    else if (inp.key === 'F5') { e.preventDefault(); js("document.getElementById('refreshBtn') && document.getElementById('refreshBtn').click()"); }
    else if (inp.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (inp.key === 'I' && inp.control && inp.shift) { e.preventDefault(); win.webContents.toggleDevTools(); }
  });
  // ссылки наружу — в обычном браузере; сама страница никуда не уходит
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Волны Эллиотта');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть', click: showWin },
    // в Windows автозапуск ищется вместе с ключом запуска: без args галочка после перезапуска показывалась бы снятой
    { label: 'Запускать вместе с Windows', type: 'checkbox', checked: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWin);
}

// ---------- мост: то, что делает главный процесс ----------
ipcMain.on('paths', (e) => { e.returnValue = { userData: app.getPath('userData'), downloads: app.getPath('downloads') }; });
ipcMain.on('takeOpen', (e) => { e.returnValue = pendingOpen || ''; pendingOpen = null; });
ipcMain.on('quiet', (e, q) => setPrefs({ quiet: !!q }));
ipcMain.on('isQuiet', (e) => { e.returnValue = !!prefs().quiet; });
ipcMain.on('showItem', (e, f) => { try { shell.showItemInFolder(f); } catch (x) { /* нет файла */ } });
// «виджет»: на компьютере — подсказка у значка у часов (первые строки списка)
ipcMain.on('widget', (e, json) => {
  if (!tray) return;
  try { const w = JSON.parse(json), rows = (w.rows || []).slice(0, 4).map((h) => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()); tray.setToolTip([w.title || 'Волны Эллиотта'].concat(rows).join('\n').slice(0, 127)); } catch (x) { /* не важно */ }
});
ipcMain.on('notify', (e, n) => {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: n.title, body: n.text, silent: !!prefs().quiet, icon: ICON });
  note.on('click', () => { if (n.open) pendingOpen = n.open; showWin(); js('window.appOpen && window.appOpen()'); });
  note.on('close', () => { const k = notes.indexOf(note); if (k >= 0) notes.splice(k, 1); });
  notes.push(note); if (notes.length > 30) notes.shift();
  note.show();
});
// «будильник» робота: в это время (закрытие свечи + 90 с) проверить роботов, не дожидаясь пятиминутки
ipcMain.on('alarm', (e, at) => {
  clearTimeout(alarm); alarm = null;
  const dt = Number(at) - Date.now();
  if (dt > 0 && dt < 7 * 86400000) alarm = setTimeout(() => js('window.appAlarm && window.appAlarm()'), Math.min(dt, 2147483647));
});

app.on('second-instance', (e, argv) => { if ((argv || []).includes('--quit')) { quitting = true; app.quit(); } else showWin(); });
app.on('before-quit', () => { quitting = true; });
app.whenReady().then(() => {
  createWindow(); createTray();
  // компьютер проснулся — сразу проверить (через минуту, когда появится сеть)
  powerMonitor.on('resume', () => setTimeout(() => js('window.appAlarm && window.appAlarm()'), 60000));
});
app.on('window-all-closed', () => { /* остаёмся у часов */ });
