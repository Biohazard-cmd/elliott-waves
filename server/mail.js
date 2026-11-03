// Отправка письма по SMTP через TLS (порт 465) — без внешних библиотек.
// cfg: { host, port?, user, pass, to, fromName? }  — пароль приложения из настроек почты.
'use strict';
const tls = require('tls');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

module.exports = function sendMail(cfg, subject, text) {
  return new Promise((resolve, reject) => {
    const host = cfg.host, port = cfg.port || 465;
    const sock = tls.connect(port, host, { servername: host });
    let buf = '', step = 0, done = false, stage = 'connect';

    const fail = (m) => { if (!done) { done = true; try { sock.destroy(); } catch (e) {} const err = new Error(m || ('SMTP-соединение закрыто на этапе ' + stage)); err.stage = stage; reject(err); } };
    const ok = () => { if (!done) { done = true; try { sock.end(); } catch (e) {} resolve(); } };
    const send = (line) => { try { sock.write(line + '\r\n'); } catch (e) { fail(e.message); } };

    const to = Array.isArray(cfg.to) ? cfg.to : [cfg.to];
    const from = cfg.user, name = cfg.fromName || 'Робот «Волны Эллиотта»';
    const d = new Date();
    const body = Buffer.from(String(text), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
    const letter = [
      'From: =?UTF-8?B?' + b64(name) + '?= <' + from + '>',
      'To: ' + to.join(', '),
      'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Date: ' + d.toUTCString(),
      'Message-ID: <' + Date.now() + (cfg.fromName === 'Домашний сервер' ? '.server@' : '.ewrobot@') + host + '>',
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
      () => { send('QUIT'); ok(); }, // 250 после DATA уже означает приём письма SMTP-сервером.
      () => ok(),
    ];

    sock.setTimeout(30000, () => fail('почтовый сервер не отвечает (таймаут)'));
    sock.on('error', (e) => fail('почта: ' + (e.message || e.code || 'ошибка соединения')));
    sock.on('end', () => fail('SMTP-соединение завершилось до подтверждения письма'));
    sock.on('close', () => { if (!done) fail('SMTP-соединение закрыто до подтверждения письма'); });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      // ответ сервера может быть многострочным («250-…», последняя «250 …»)
      if (buf.length > 100000) return fail('Слишком длинный ответ SMTP');
      let end;
      while ((end = buf.indexOf('\n')) >= 0 && !done) {
        const line = buf.slice(0, end).replace(/\r$/, ''); buf = buf.slice(end + 1);
        const match = line.match(/^(\d{3})([ -])/); if (!match || match[2] === '-') continue;
        const code = Number(match[1]);
        if (code >= 400) return fail('почтовый сервер ответил ' + code);
        const fn = steps[step++];
        if (fn) { stage = 'SMTP шаг ' + step; fn(); }
      }
    });
  });
};
