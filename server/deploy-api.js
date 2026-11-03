// Запуск на Linux после копирования status.js: node deploy-api.js.
// Не выводит секреты. Перезапускает только status.js из этой папки.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const dir = __dirname, configFile = path.join(dir, 'config.json');
(async () => {
  const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!cfg.apiKey) {
    cfg.apiKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(configFile + '.tmp', JSON.stringify(cfg, null, 2), { mode: 0o600 });
    fs.renameSync(configFile + '.tmp', configFile);
  }
  fs.chmodSync(configFile, 0o600);
  const data = path.join(dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'device-api-key.txt'), cfg.apiKey, { mode: 0o600 });
  const lsFile = path.join(data, 'localstorage.json');
  if (fs.existsSync(lsFile)) {
    const ls = JSON.parse(fs.readFileSync(lsFile, 'utf8'));
    const s = JSON.parse(ls['ew2.settings'] || '{}');
    for (const k of ['token', 'account', 'accounts', 'acct', 'serverKey']) delete s[k];
    s.robotMode = 'local'; ls['ew2.settings'] = JSON.stringify(s);
    fs.writeFileSync(lsFile + '.tmp', JSON.stringify(ls), { mode: 0o600 });
    fs.renameSync(lsFile + '.tmp', lsFile);
  }
  for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try {
      const args = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0');
      if (path.basename(args[0]) === 'node' && args[1] === 'status.js' && fs.realpathSync('/proc/' + pid + '/cwd') === dir) process.kill(Number(pid), 'SIGTERM');
    } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'EACCES' && e.code !== 'ESRCH') throw e; }
  }
  await new Promise((r) => setTimeout(r, 500));
  const log = fs.openSync(path.join(dir, 'status.log'), 'a');
  const child = spawn(process.execPath, ['status.js'], { cwd: dir, detached: true, stdio: ['ignore', log, log] });
  child.unref(); fs.closeSync(log);
  await new Promise((r) => setTimeout(r, 1500));
  const url = 'http://100.99.24.36:8090/api/robots';
  for (const [name, key, expected] of [['без ключа', '', 401], ['неверный ключ', 'wrong', 401], ['правильный ключ', cfg.apiKey, 200]]) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'ew-robots-request', v: 1 }), signal: AbortSignal.timeout(10000) });
    if (r.status !== expected) throw new Error(name + ': HTTP ' + r.status);
    if (expected === 200) { const x = await r.json(); if (x.kind !== 'ew-robots-state' || !x.state.accs.length) throw new Error('Неверное состояние'); console.log('API: состояние получено, счетов ' + x.state.accs.length); }
    else console.log('API: ' + name + ' — отказ подтверждён');
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
