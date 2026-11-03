// Импорт состояния роботов из файла переноса телефона (ew-perenos-….json).
// Запуск: node import.js путь/к/ew-perenos-....json
// Берёт только: роботов (vacc.json), журнал сделок, историю уведомлений, настройки без токена и счёта.
'use strict';
const fs = require('fs'), path = require('path');

const file = process.argv[2];
if (!file) { console.log('Укажите файл: node import.js ew-perenos-....json'); process.exit(1); }

let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('Не читается файл: ' + e.message); process.exit(1); }
if (!doc || doc.kind !== 'ew-transfer' || !doc.settings) { console.log('Это не файл переноса (нужен ew-perenos-….json из «⚙ → Данные → Перенос на другое устройство»).'); process.exit(1); }

const DATA = path.join(__dirname, 'data'), FILES = path.join(DATA, 'files');
fs.mkdirSync(FILES, { recursive: true });

// роботы — главное
const V = doc.files && doc.files['vacc.json'];
if (!V || !V.accs || !V.accs.length) { console.log('В файле нет роботов (vacc.json пуст).'); process.exit(1); }
fs.writeFileSync(path.join(FILES, 'vacc.json'), JSON.stringify(V));

// настройки и небольшие хранилища — в localstorage.json (ключи ew2.*)
const LS_FILE = path.join(DATA, 'localstorage.json');
let ls = {};
try { ls = JSON.parse(fs.readFileSync(LS_FILE, 'utf8')); } catch (e) { ls = {}; }
const set = Object.assign({}, doc.settings);
for (const k of ['token', 'account', 'accounts', 'acct', 'serverKey', 'serverUrl']) delete set[k];
set.robotMode = 'local';   // сервер всегда считает самостоятельно
set.token = '';
ls['ew2.settings'] = JSON.stringify(set);
for (const [k, v] of Object.entries(doc.store || {})) ls['ew2.' + k] = JSON.stringify(v);
fs.writeFileSync(LS_FILE, JSON.stringify(ls));

console.log('Перенесено с телефона (' + (doc.app || '?') + ', выгружено ' + doc.exportedAt + '):');
for (const a of V.accs) console.log(`- ${a.name}: позиций ${a.pos.length}, закрыто сделок ${a.closed.length}`);
console.log('Готово. Токен и номер счёта из файла не переносятся — сервер берёт их из config.json (если заданы); иначе цены с Мосбиржи.');
