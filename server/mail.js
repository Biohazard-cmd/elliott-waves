// Отправка письма по SMTP через TLS (порт 465) — без внешних библиотек.
// cfg: { host, port?, user, pass, to, fromName? }  — пароль приложения из настроек почты.
'use strict';
const tls = require('tls');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

module.exports = function sendMail(cfg, subject, text) {
  return new Promise((resolve, reject) => {
    const host = cfg.host, port = cfg.port || 465;
    const sock = tls.connect(port, host, { servername: host });
    let buf = '', step = 0, done = false;

    const fail = (m) => { if (!done) { done = true; try { sock.destroy(); } catch (e) {} reject(new Error(m)); } };
    const ok = () => { if (!done) { done = true; try { sock.end(); } catch (e) {} resolve(); } };
    const send = (line) => sock.write(line + '\r\n');

    const to = Array.isArray(cfg.to) ? cfg.to : [cfg.to];
    const from = cfg.user, name = cfg.fromName || 'Робот «Волны Эллиотта»';
    const d = new Date();
    const body = Buffer.from(String(text), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
    const letter = [
      'From: =?UTF-8?B?' + b64(name) + '?= <' + from + '>',
      'To: ' + to.join(', '),
      'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Date: ' + d.toUTCString(),
      'Message-ID: <' + Date.now() + '.ewrobot@' + host + '>',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      body,
      '.',
    ].join('\r\n');

    // шаги диалога: что отправить после каждого положительного ответа сервера
    const steps = [
      () => send('EHLO ew-robot'),
      () => send('AUTH LOGIN'),
      () => send(b64(cfg.user)),
      () => send(b64(cfg.pass)),
      () => send('MAIL FROM:<' + from + '>'),
      ...to.map((t) => () => send('RCPT TO:<' + t + '>')),
      () => send('DATA'),
      () => send(letter),
      () => send('QUIT'),
      () => ok(),
    ];

    sock.setTimeout(30000, () => fail('почтовый сервер не отвечает (таймаут)'));
    sock.on('error', (e) => fail('почта: ' + e.message));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      // ответ сервера может быть многострочным («250-…», последняя «250 …»)
      const lines = buf.split(/\r?\n/).filter((l) => l.length);
      if (!lines.length) return;
      const lastLine = lines[lines.length - 1];
      if (!/^\d{3} /.test(lastLine)) return;   // ждём конца многострочного ответа
      const code = parseInt(lastLine.slice(0, 3), 10);
      buf = '';
      if (code >= 400) return fail('почтовый сервер ответил ' + code + ' ' + lastLine.slice(4));
      const fn = steps[step++];
      if (fn) fn();
    });
  });
};
