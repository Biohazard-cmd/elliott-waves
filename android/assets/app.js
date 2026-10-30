// Волны Эллиотта — приложение для телефона: котировки Т-Инвестиций, разметка, план, бэктест, уведомления.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const A = window.Android || null;
  const DESK = !!(A && A.desktop);   // 3.6: программа для компьютера (Electron) — мост тот же, раскладка шире, проверка идёт и в свёрнутом окне
  const D = window.EWData, E = window.EW2;
  const TFK = ['5m', '15m', '1h', '4h', '1d', '1w'];
  const FIG_COLOR = ['#3fbf7f', '#35b8b0', '#f0703a', '#b07cf0', '#d9b443'];
  const FIG_SHORT = ['Имп', 'Клин', 'Зигзаг', 'Флэт', 'Треуг'];
  const DEV = 'Егор';   // разработчик — показывается в «Настройки → Данные → О приложении»
  const FIG_FULL = ['Импульс', 'Клин (диагональ)', 'Зигзаг', 'Флэт', 'Треугольник'];

  let S = D.settings();
  if (!S.swings) S.swings = {};
  // однократный перевод настроек на выводы проверки 65 акций (версия 1.18)
  if ((S.cfgVer || 0) < 2) {
    S.cfg = S.cfg || {};
    if (S.cfg.setups) S.cfg.setups.w5 = false;
    if (S.cfg.swingMult == null) S.cfg.swingMult = 2;
    S.scanOpt = false;
    S.cfgVer = 2;
    D.saveSettings(S);
  }
  // версия 2.19: в дневные наборы добавлены фильтр AO 5/34 (оба) и доливка на 110% волны 1 (агрессивный) — кто стоит на наборе, получает обновление
  if ((S.cfgVer || 0) < 3) {
    S.cfg = S.cfg || {};
    if (S.preset === 'd_long' || S.preset === 'd_aggr') S.cfg.addAO = true;
    if (S.preset === 'd_aggr') S.cfg.addPyramid = true;
    S.cfgVer = 3;
    D.saveSettings(S);
  }
  // версия 2.21: в дневные наборы добавлен фильтр «SMA200 растёт» (проверка 65 бумаг 2019–2026)
  if ((S.cfgVer || 0) < 4) {
    S.cfg = S.cfg || {};
    if (S.preset === 'd_long' || S.preset === 'd_aggr') S.cfg.addSma200 = true;
    S.cfgVer = 4;
    D.saveSettings(S);
  }
  // версия 2.38: фильтр «прибыль/риск ≥ 1,5» (оба набора) и безубыток 3×ATR (агрессивный) — проверка 65 бумаг 2019–2026 (research/combo.js)
  if ((S.cfgVer || 0) < 5) {
    S.cfg = S.cfg || {};
    if (S.preset === 'd_long' || S.preset === 'd_aggr') { S.cfg.addMinRR = true; S.cfg.minRR = 1.5; }
    if (S.preset === 'd_aggr') Object.assign(S.cfg, { beMode: 'auto', beRule: 'atr', beAtr: 3 });
    S.cfgVer = 5;
    D.saveSettings(S);
  }
  // версия 3.0: основной дневной — безубыток 3×ATR; «4 часа · неделя» — канал, выход по открытию пн, только лучший подсчёт (research/fri_chan.js, recheck_div.js)
  if ((S.cfgVer || 0) < 6) {
    S.cfg = S.cfg || {};
    if (S.preset === 'd_long') Object.assign(S.cfg, { beMode: 'auto', beRule: 'atr', beAtr: 3 });
    if (S.preset === 'h4_week') Object.assign(S.cfg, { wkChan: true, wkNextOpen: true, topOnly: true });
    S.cfgVer = 6;
    D.saveSettings(S);
  }
  try { if (A && A.setQuiet) A.setQuiet(!!(S.notify && S.notify.quiet)); } catch (e) { /* старая сборка без моста */ }
  // ---------- оформление (темы) ----------
  // Меняются только фон, рамки, текст и цвет свечей. Цвета сигналов (стоп, цель, волны, сделки) во всех темах одни и те же.
  const SKINS = {
    night: { name: 'Ночь', note: 'тёмно-синяя, как раньше', css: {}, ch: {} },
    black: { name: 'Чёрная', note: 'чистый чёрный — бережёт батарею на AMOLED-экранах', css: { bg: '#000000', bg2: '#0c0e11', bg3: '#171b21', line: '#262c35', hud: 'rgba(0,0,0,.84)', acc: '#1f3f6e', accl: '#3a68ab' }, ch: { grid: '#151a20' } },
    ocean: { name: 'Океан', note: 'глубокий синий', css: { bg: '#0c1726', bg2: '#11203a', bg3: '#182b48', line: '#243c5e', mut: '#8ea3bd', dim: '#5a6f8a', hud: 'rgba(12,23,38,.86)', acc: '#1f4f8a', accl: '#4a86d6' }, ch: { grid: '#162a44', axis: '#7f93ad', tag: '#1f4f8a' } },
    graphite: { name: 'Графит', note: 'нейтральный серый, свечи бирюзовые и красные', css: { bg: '#1a1a1c', bg2: '#232326', bg3: '#2d2d31', line: '#3a3a3f', mut: '#9a9aa2', dim: '#66666e', hud: 'rgba(26,26,28,.86)', acc: '#3a4252', accl: '#6b7690' }, ch: { grid: '#26262a', axis: '#86868e', up: '#26a69a', dn: '#ef5350', tag: '#4a5262' } },
    sepia: { name: 'Сепия', note: 'тёплая, мягче для глаз вечером', css: { bg: '#1c1814', bg2: '#25201a', bg3: '#2f2921', line: '#3e352a', ink: '#efe5d6', mut: '#a8998a', dim: '#73675a', hud: 'rgba(28,24,20,.86)', acc: '#5a4526', accl: '#a07a3c' }, ch: { grid: '#2a241d', axis: '#94867a', up: '#7fb069', dn: '#dd6b4d', tag: '#6b5230' } },
  };
  const CH0 = { bg: '#14181e', grid: '#222a35', axis: '#7d8896', up: '#3fbf7f', dn: '#ef5b5b', tag: '#2b4a7a', lbl: 'rgba(20,24,30,.8)' };
  let K = CH0;   // цвета графика текущей темы
  function applySkin() {
    const sk = SKINS[S.skin] || SKINS.night, st = document.documentElement.style;
    for (const k of ['bg', 'bg2', 'bg3', 'line', 'ink', 'mut', 'dim', 'hud', 'acc', 'accl']) { if (sk.css[k]) st.setProperty('--' + k, sk.css[k]); else st.removeProperty('--' + k); }
    K = Object.assign({}, CH0, { bg: sk.css.bg || CH0.bg, lbl: sk.css.hud || CH0.lbl }, sk.ch);
    try { if (A && A.setBarColor) A.setBarColor(K.bg); } catch (e) { /* старая сборка без моста */ }
    D.store.set('wcolors', { bg: K.bg, ink: sk.css.ink || '#e8ecf1', mut: sk.css.mut || '#8d98a6', pos: '#3fbf7f', neg: '#ef5b5b' }); D.widgetPush();
  }
  applySkin();
  const skinPick = () => Object.entries(SKINS).map(([k, x]) => { const c = Object.assign({}, CH0, { bg: x.css.bg || CH0.bg, bg2: x.css.bg2 || '#1b2028' }, x.ch);
    return `<button class="pitem ${(S.skin || 'night') === k ? 'on' : ''}" data-skin="${k}"><span class="skinsw" style="background:${c.bg};border-color:${c.bg2}"><i style="background:${c.up}"></i><i style="background:${c.dn}"></i></span><span>${x.name}<br><small class="mut">${x.note}</small></span></button>`; }).join('');
  const skinBind = (root, after) => root.querySelectorAll('[data-skin]').forEach((b) => { b.onclick = () => { S.skin = b.dataset.skin; save(); applySkin(); draw(); if (after) after(); }; });
  let all = [];          // все свечи с биржи, включая формирующуюся
  let an = null;         // результат анализа
  let demo = false, mxSrc = 0;   // mxSrc — когда свечи графика взяты с Мосбиржи (0 — у брокера)
  let sel = -1;          // выбранная сделка
  let err = '';
  let divAdj = [], allRaw = [], lotInfo = null;   // allRaw — те же свечи без поправки на дивиденды (для тренажёра)
  let altSel = 0;
  const mktCache = {};
  function mktFor(tf) { if (!(tf in mktCache)) mktCache[tf] = D.getMarket(tf); return mktCache[tf]; }   // какой подсчёт показан: 0 — основной, 1..3 — альтернативы
  const curScen = () => (an && an.scen[altSel]) || (an && an.scen0) || null;
  const curTg = () => (an && an.allTargets && an.allTargets[altSel]) || (an && an.targets) || null;   // отсечки дивидендов в истории; лотность бумаги
  let loading = false;
  let lastLoad = 0;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pr = (p) => (an ? D.fmtPrice(p, an.bars) : String(p));
  const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', DEC());
  const pc = (x) => (x * 100).toFixed(1).replace('.', DEC()) + '%';
  const spc = (x) => (x > 0 ? '+' : '') + pc(x);
  const swKey = () => S.inst.id + '.' + S.tf;
  const DEC = () => (S.decComma ? ',' : '.');   // разделитель дробной части: точка по умолчанию
  let tr = null;   // тренажёр: прокрутка истории (null — обычный режим)
  const curSwing = () => (tr ? tr.sw : S.swings[swKey()] || 0);
  // 3.9: в тренажёре порог свой (tr.sw) — кнопки порога меняют его, а порог обычного графика бумаги не трогают
  function setSw(v) { if (tr) { tr.sw = v; tr.swAuto = false; if (tr.ev.length && tr.ev[tr.ev.length - 1].kind === 'порог') tr.ev.pop(); trLog('порог', 'порог системы ' + String(v).replace('.', DEC()) + '%'); } else S.swings[swKey()] = v; }
  function clrSw() { if (tr) { const done = all.filter((x) => x.done !== false); tr.sw = E.autoSwing(done.slice(-(S.cfg.maxBars || 2000)), S.cfg.swingMult || 1); tr.swAuto = true; if (tr.ev.length && tr.ev[tr.ev.length - 1].kind === 'порог') tr.ev.pop(); trLog('порог', 'порог системы — авто, ' + String(tr.sw).replace('.', DEC()) + '%'); } else delete S.swings[swKey()]; }
  // запись настроек + в лог — что именно поменялось (набор, таймфрейм, бумага, порог, дополнения, оповещения)
  let logSnap = null;
  function snapNow() { return { inst: S.inst.ticker, tf: S.tf, preset: S.preset || '', sw: S.swings[swKey()] || 0, cfg: JSON.stringify(S.cfg), watch: (S.watch || []).length, lv: (S.palerts || []).length, bg: S.bgMinutes }; }
  function save() {
    D.saveSettings(S);
    try {
      const n = snapNow(), o = logSnap; logSnap = n;
      if (!o) return;
      const moved = o.inst !== n.inst || o.tf !== n.tf;
      if (moved) D.log('view', n.inst + ' ' + n.tf);
      if (o.preset !== n.preset && n.preset) D.log('preset', n.preset);
      if (!moved && o.sw !== n.sw) D.log('swing', n.inst + ' ' + n.tf + ': порог ' + (n.sw ? n.sw + '%' : 'авто'));
      if (o.cfg !== n.cfg) { const a = JSON.parse(o.cfg), b = JSON.parse(n.cfg), ch = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) ch[k] = b[k] === undefined ? null : b[k]; D.log('cfg', Object.keys(ch).join(', '), ch); }
      if (o.watch !== n.watch) D.log('watch', 'слежений: ' + n.watch);
      if (o.lv !== n.lv) D.log('level', 'уровней: ' + n.lv);
      if (o.bg !== n.bg) D.log('bg', 'частота проверки: ' + (n.bg ? n.bg + ' мин' : 'выкл'));
    } catch (e) { /* лог не важнее настроек */ }
  }
  function fmtT(t, withTime) {
    // 3.9: время на экране — по Москве (как биржа и робот), по желанию — по часам телефона (⚙ → Данные)
    const d = D.dispDate(t), p = (n) => String(n).padStart(2, '0');
    const ds = p(d.D) + '.' + p(d.M + 1) + '.' + String(d.Y).slice(2);
    return withTime ? ds + ' ' + p(d.h) + ':' + p(d.m) : ds;
  }

  // ---------- демо-данные, пока нет токена ----------
  function demoBars(tf) {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const T = D.TF[tf].ms, n = 900, out = []; let p = 250, trend = 0;
    const legs = [[0.18, 40], [-0.09, 25], [0.3, 60], [-0.12, 35], [0.16, 45], [-0.2, 50], [0.08, 30], [-0.15, 45], [0.25, 70], [-0.1, 30], [0.2, 55], [-0.16, 50], [0.1, 35], [-0.08, 30], [0.22, 60], [-0.12, 40], [0.14, 45], [-0.1, 40], [0.12, 40]];
    let li = 0, left = legs[0][1];
    const t0 = Math.floor(Date.now() / T) * T - n * T;
    for (let i = 0; i < n; i++) {
      if (left <= 0) { li = (li + 1) % legs.length; left = legs[li][1]; }
      trend = legs[li][0] / legs[li][1]; left--;
      const o = p, ch = trend + (rnd() - 0.5) * 0.022;
      const c = o * (1 + ch), h = Math.max(o, c) * (1 + rnd() * 0.008), l = Math.min(o, c) * (1 - rnd() * 0.008);
      out.push({ t: t0 + i * T, o, h, l, c, v: Math.round(1000 + rnd() * 5000), done: i < n - 1 });
      p = c;
    }
    return out;
  }

  // ---------- загрузка и расчёт ----------
  let retrying = false, lastTry = 0;
  async function retryNow() {
    if (retrying) return; retrying = true; renderPanel();
    try { if (tr) { err = ''; await D.loadCandles(S.token, S.inst.id, S.tf, 1, Date.now() - 7 * 86400000); } else await load(false); }
    catch (e) { err = 'Связи с брокером по-прежнему нет: ' + e.message; }
    finally { retrying = false; lastTry = Date.now(); renderPanel(); }
  }
  async function load(force) {
    if (tr) { if (tr.inst === S.inst.id && tr.tf === S.tf) return; trQuit(); }   // сменили бумагу или ТФ — тренажёр закрываем
    if (loading) return;
    loading = true; $('#busy').hidden = false; err = '';
    try {
      demo = false; lotInfo = null;
      const t0 = Date.now();
      let raw = null;
      // без токена — цены с Мосбиржи; не ответила и она — учебный пример
      try { raw = await D.getBars(S.token, S.inst, S.tf, S.cfg.maxBars || 2000, force); }
      catch (e) { if (S.token || e.fatal) throw e; demo = true; all = demoBars(S.tf); err = 'Нет связи с Мосбиржей — показан учебный пример. ' + e.message; }
      mxSrc = raw && D.mxState().at >= t0 ? Date.now() : 0;
      if (raw) {
        if (raw.offline) { err = 'Нет связи' + (S.token ? ' с брокером' : ' с Мосбиржей') + ' — показаны сохранённые свечи' + (raw.length ? ' до ' + fmtT(raw[raw.length - 1].t, true) : '') + '. Обновятся сами, когда появится интернет.'; D.log('api', 'офлайн: показан кэш ' + S.inst.ticker); }
        const r = await D.withDividends(S.token, S.inst, raw, S.cfg.divAdj !== false);
        all = r.bars; divAdj = r.adj; allRaw = raw;
        D.instInfo(S.token, S.inst).then((x) => { lotInfo = x; if (an) renderPanel(); }).catch(() => {});
      }
      lastLoad = Date.now();
      compute(true);
      if (!demo) { loadBrokerOps(); refreshLive(); if (S.account && (!S.acct || Date.now() - S.acct.at > 300000)) refreshAccount(false); }
    } catch (e) {
      err = e.message;
      D.log('error', S.inst.ticker + ' ' + S.tf + ': ' + e.message);
      renderPanel();
    } finally {
      loading = false; $('#busy').hidden = true;
    }
  }

  function compute(keepView) {
    if (!keepView) altSel = 0;
    const done = all.filter((b) => b.done !== false);
    if (done.length < 60) { an = null; err = err || 'Мало свечей для анализа (' + done.length + '). Выберите таймфрейм меньше или другую бумагу.'; renderPanel(); draw(); return; }
    const cfg = Object.assign({}, S.cfg, { swingPct: curSwing(), mkt: S.cfg.addMarket ? mktFor(S.tf) : null });
    const prevN = an ? an.N : 0;
    an = E.run(done, cfg, D.TF[S.tf].ms);
    if (sel >= an.trades.length) sel = -1;
    // новый сигнал на графике — в лог (потом сверим, как он отработал)
    try {
      const sT = an.plan && an.planActive && an.bars[an.plan.sigBar] ? an.bars[an.plan.sigBar].t : 0, k = 'csig.' + swKey();
      if (sT && D.store.get(k, 0) !== sT) { D.store.set(k, sT); D.log('signal', S.inst.ticker + ' ' + S.tf + ' (график): ' + (an.plan.side > 0 ? 'покупка' : 'продажа'), { setup: an.plan.setup, entry: an.plan.entry, stop: an.plan.stop, target: an.plan.target, sigT: sT, sw: an.swing, preset: S.preset || '' }); }
    } catch (e) { /* не важно */ }
    if (!keepView || !view.init || Math.abs(an.N - prevN) > 3) fitView();
    renderPanel(); draw(); renderQuote();
  }

  // ---------- панель ----------
  function renderQuote() {
    if (!all.length) { $('#quote').innerHTML = ''; return; }
    renderGripQuote();
    const last = all[all.length - 1], prev = all.length > 1 ? all[all.length - 2] : last;
    const ch = last.c / prev.c - 1;
    renderHud();
    $('#quote').innerHTML = `<b class="mono">${pr(last.c)}</b> <span class="${ch >= 0 ? 'pos' : 'neg'}">${spc(ch)}</span> · ${fmtT(last.t, S.tf !== '1d' && S.tf !== '1w')}${S.tf !== '1d' && S.tf !== '1w' && S.tz !== 'local' ? ' МСК' : ''}${demo ? ' · <span class="warn">демо</span>' : ''}`;
  }

  // ---------- табличка в углу графика: какой «индикатор», тренд, что показывает сейчас ----------
  // устойчивость: старшая степень волн задаёт направление, структура (максимумы/минимумы) его подтверждает
  function trendState() {
    if (!an) return null;
    const hd = an.lastHD, st = an.lastST;
    if (!hd) return { d: 0, steady: false, txt: '↔ нет тренда', cls: 'mut', why: 'старшая степень волн без направления' };
    const up = hd > 0, ok = st === hd;
    return { d: hd, steady: ok, cls: ok ? (up ? 'pos' : 'neg') : 'warn',
      txt: (up ? '↑' : '↓') + ' ' + (ok ? 'устойчивый' : 'неустойчивый'),
      why: ok ? (up ? 'максимумы и минимумы растут' : 'максимумы и минимумы снижаются') : st === -hd ? (up ? 'минимумы уже снижаются' : 'максимумы уже растут') : 'структура не подтверждает' };
  }
  // светофор по сигналу: только признаки, которые подтвердила проверка 65 бумаг (1ч и дневки, 2019–2026):
  // сигналы при неустойчивом тренде в среднем −0.08 R на 1ч и +0.07 R на дневках против +0.07 / +0.19 R при устойчивом;
  // на 1ч порог мельче 0.6 от авто — в среднем убыток. На других таймфреймах разницы не нашли — вердикт не показываем.
  function lightInfo(p, ts, small) {
    if (!p || !ts) return null;
    if (S.tf !== '1h' && S.tf !== '1d') return { cls: 'mut', short: '⚪ правила «брать/ждать» для ' + D.TF[S.tf].name + ' нет', long: 'На этом таймфрейме проверка 65 бумаг не нашла признака, который отличал бы хорошие сигналы от плохих.' };
    const why = [], lng = [];
    if (!(ts.d === p.side && ts.steady)) { why.push('тренд неустойчивый'); lng.push('при неустойчивом тренде сигналы на истории заметно хуже (1ч: в среднем −0.08 R против +0.07 R; дневки: +0.07 R против +0.19 R)'); }
    if (S.tf === '1d' && an.aoNow && !isNaN(an.aoNow.v) && an.aoNow.v * p.side <= 0) { why.push('AO 5/34 против сделки'); lng.push('на дневках сигналы при осцилляторе 5/34 против сделки в среднем −0.16 R против +0.31 R (Вильямс; включите «Фильтр AO» в настройках)'); }
    if (S.tf === '1d' && an.smaNow && an.smaNow !== p.side) { why.push('SMA200 против сделки'); lng.push('на дневках сигналы, когда 200-дневная средняя идёт против сделки, в среднем +0.30 R против +0.63 R, а серии стопов длиннее (включите «Фильтр SMA200» в настройках)'); }
    if (S.tf === '1h' && small) { why.push('мелкий порог'); lng.push('на 1ч при пороге мельче 0.6 от авто сигналы в среднем убыточны'); }
    return why.length ? { cls: 'warn', short: '🟡 лучше подождать: ' + why.join(', '), long: lng.join('; ') + '.' }
      : { cls: 'pos', short: '🟢 можно брать', long: 'Тренд устойчивый, порог нормальный — это лучшая группа сигналов на проверке. Но и в ней в стоп уходит больше половины сделок: прибыль дают редкие длинные движения, поэтому важен стоп.' };
  }
  function lightHtml(p, ts, small) { const L = lightInfo(p, ts, small); return L ? `<div class="${L.cls}">${L.short}</div>` : ''; }
  function hudState() {
    const sw = tr ? tr.sw : an.swing, isAuto = tr ? tr.swAuto : !curSw();
    const ref = an.autoRef || (an.autoRef = E.autoSwing(an.bars, S.cfg.swingMult || 1)), small = sw < ref * 0.6;
    const p = an.plan, ot = an.openTrade, fresh = !!(p && an.planActive && (!ot || p.sigBar > ot.iSig));   // сигнал, который система уже взяла, — не «доливка»
    return { sw, isAuto, ref, small, ts: trendState(), p, ot, fresh };
  }
  function renderHud() {
    const el = $('#hud'); if (!el) return;
    const off = !an || (S.view.hide || {}).hud || (tr && !tr.waves) || S.view.clean && !tr;
    if (off) { el.hidden = true; return; }
    const { sw, isAuto, ref, small, ts, p, ot, fresh } = hudState(), N = an.N;
    const swS = String(+(+sw).toFixed(2)).replace('.', DEC());
    let sig;
    const planTxt = () => { const age = Math.max(0, N - 1 - p.sigBar); return `<b class="${p.side > 0 ? 'pos' : 'neg'}">${p.side > 0 ? '▲ ПОКУПКА' : '▼ ПРОДАЖА'}</b> ${esc(E.SETUP_NAME[p.setup])} · стоп ${pr(p.stop)}${p.notgt ? '' : ' · цель ' + pr(p.target)}<span class="mut"> · ${age ? age + ' св. назад' : 'сейчас'}</span>`; };
    if (ot && fresh) sig = `<span class="mut">Система в ${ot.side > 0 ? 'покупке' : 'продаже'} · </span>доливка: ` + planTxt();
    else if (ot) sig = `Система в <b class="${ot.side > 0 ? 'pos' : 'neg'}">${ot.side > 0 ? 'покупке' : 'продаже'}</b> с ${fmtT(an.bars[ot.iEntry].t, S.tf !== '1d' && S.tf !== '1w')} · стоп ${pr(ot.stop)}`;
    else if (fresh) sig = planTxt();
    else sig = '<span class="mut">Сигнала нет — ждём разворот</span>';
    const tg = `<span class="hudT" data-hudt aria-label="${S.view.hudMini ? 'Развернуть' : 'Свернуть'}">${S.view.hudMini ? '▾' : '▴'}</span>`;
    if (S.view.hudMini) { el.innerHTML = tg + `<div>${sig}</div>`; el.classList.add('mini'); el.title = ''; el.hidden = false; return; }
    el.classList.remove('mini');
    el.innerHTML = tg + `<div class="h1">${esc(presetLabel().replace(/\s*\(.*\)/, ''))} · ${D.TF[S.tf].name} · <span class="${small ? 'warn' : ''}">порог ${swS}% ${isAuto ? 'авто' : 'ручной'}${tr ? ' ❄' : ''}${small ? ' — мелкий!' : ''}</span></div>
      <div class="${ts.cls}">Тренд ${ts.txt}<span class="mut"> · ${ts.why}</span>${an.aoNow && !isNaN(an.aoNow.v) ? ` <span class="${an.aoNow.v > 0 ? 'pos' : 'neg'}">· AO ${an.aoNow.v > 0 ? '▲' : '▼'}</span>` : ''}${S.tf === '1d' && an.smaNow ? ` <span class="${an.smaNow > 0 ? 'pos' : 'neg'}">· SMA200 ${an.smaNow > 0 ? '↑' : '↓'}</span>` : ''}</div><div>${sig}</div>${lightHtml(fresh ? p : null, ts, small)}`;
    el.title = small ? 'Порог мельче 0.6 от авто (' + ref + '%): сигналы мелкой степени, на проверке 65 бумаг в среднем убыточны' : '';
    el.hidden = false;
  }
  function trendLine() {
    if (an.trendMode === 'off') return '<span class="mut">Тренд не учитывается: сделки в обе стороны</span>';
    const t = an.trendNow;
    const dir = t > 0 ? '<span class="pos">только покупки</span>' : t < 0 ? '<span class="neg">только продажи</span>' : '<span class="mut">новых входов нет</span>';
    const src = an.trendMode === 'ma' ? 'по средней ' + S.cfg.trendMA : 'старшая степень волн ' + (an.swing * (S.cfg.trendMult || 3)).toFixed(1).replace('.', DEC()) + '%';
    return 'Тренд → ' + dir + ` <span class="small">(${src})</span>` + (an.hiTitle ? `<div class="small">Старшая степень: ${esc(an.hiTitle)}</div>` : '');
  }

  const BE_RULE = { atr: 'после ухода на ATR', local: 'лесенка под опоры', r1: 'после +1R', r2: 'после +2R', ao: 'AO против сделки', mkt: 'рынок ниже средней 50', stall: '20 свечей без движения', wave: 'по волнам' };
  function beSummary() {
    if (S.cfg.beMode === 'auto') {
      const done = an.trades.filter((t) => t.reason !== 3), n8 = done.filter((t) => t.reason === 8).length, c0 = Object.assign({}, E.DEFAULTS, S.cfg);
      return `<div class="small" style="margin-top:6px">Безубыток включён (${esc(c0.beRule === 'atr' ? c0.beAtr + '×ATR' : BE_RULE[c0.beRule] || '')}): выходов по нему ${n8} из ${done.length} сделок — они уже учтены в результате.</div>`;
    }
    let hit = 0, saved = 0, lost = 0, sumBE = 0, sumR = 0, cnt = 0;
    an.trades.forEach((t, k) => {
      if (t.reason === 3) return;
      const sh = an.shadow[k]; cnt++; sumR += t.R;
      const r = sh && sh.hit >= 0 ? sh.R : t.R; sumBE += r;
      if (sh && sh.hit >= 0) { hit++; if (r > t.R + 1e-9) saved++; else if (r < t.R - 1e-9) lost++; }
    });
    const c = Object.assign({}, E.DEFAULTS, S.cfg), rule = c.beRule === 'atr' ? c.beAtr + '×ATR' : BE_RULE[c.beRule];
    return `<div class="small warn" style="margin-top:6px">Подсказка БУ (${esc(rule)}) — только для информации: сработала бы в ${hit} из ${cnt} сделок, спасла ${saved}, испортила ${lost}. Если бы следовали ей: ${f2(sumBE)} R вместо ${f2(sumR)} R.</div>`;
  }

  // ---------- дневник сделок ----------
  // Свои реальные сделки: вход, выход, комментарий; рядом — что в этот момент говорила система.
  const jList = () => D.store.get('journal', []);
  // 3.9: новые и закрытые записи «Моих сделок» — ещё и в журнал работы (чтобы в выгрузке лога была полная картина)
  const jSave = (l) => {
    try {
      const was = new Map(jList().map((x) => [x.id, x])), nNew = l.filter((x) => !was.has(x.id)).length;
      if (nNew > 20) D.log('journal', 'мои сделки: загружено записей ' + nNew + ' (по одной не пишем)', { kind: 'jimport', n: nNew });
      for (const x of l) {
        const y = was.get(x.id), base = { ticker: x.ticker, side: x.side, lots: x.lots, lot: x.lot, openT: x.openT, openP: x.openP, stop: x.stop, target: x.target, src: x.src || '' };
        if (!y) { if (nNew <= 20) D.log('journal', 'мои сделки: ' + (x.side < 0 ? 'продажа ' : 'покупка ') + x.ticker + ' по ' + x.openP + (x.closeP ? ', закрыта по ' + x.closeP : ''), Object.assign({ kind: 'jadd', closeT: x.closeT || null, closeP: x.closeP || null }, base)); }
        else if (!y.closeP && x.closeP) D.log('journal', 'мои сделки: закрыта ' + x.ticker + ' по ' + x.closeP + ' (вход ' + x.openP + ')', Object.assign({ kind: 'jclose', closeT: x.closeT, closeP: x.closeP, ret: +((x.side || 1) * (x.closeP / x.openP - 1) * 100).toFixed(2), R: x.stop ? +((x.side || 1) * (x.closeP - x.openP) / Math.abs(x.openP - x.stop)).toFixed(2) : null }, base));
      }
    } catch (e) { /* журнал не должен мешать дневнику */ }
    D.store.set('journal', l);
  };
  function barAt(t) {
    if (!an || !an.bars.length || t < an.bars[0].t) return null;
    let lo = 0, hi = an.bars.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (an.bars[m].t <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function lotsFor(entry, stop) {
    const cap = Number(S.capital) || 0, lot = lotInfo && lotInfo.lot ? lotInfo.lot : 1, r1 = Math.abs(entry - stop);
    if (!cap || !(r1 > 0)) return 1;
    let sh = Math.floor(cap * (S.cfg.riskPct || 1) / 100 / r1); sh = Math.min(sh, Math.floor(cap / entry));
    return Math.max(1, Math.floor(sh / lot));
  }
  const livePx = {};   // instId → последняя цена (обновляется раз в минуту для открытых сделок дневника)
  function jPnl(j, px) {   // результат в ₽, % и R (если указан стоп)
    const p = px != null ? px : j.closeT ? j.closeP : (livePx[j.instId] ? livePx[j.instId].price : null), q = (j.lots || 1) * (j.lot || 1);
    if (p == null) return null;
    const rub = j.side * (p - j.openP) * q, pct = j.side * (p / j.openP - 1);
    const R = j.stop ? j.side * (p - j.openP) / Math.abs(j.openP - j.stop) : null;
    return { rub, pct, R };
  }
  const fRub = (x) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x)).toLocaleString('ru-RU') + ' ₽';
  function sysNow() {   // снимок того, что говорит система сейчас
    if (!an) return null;
    const p = an.plan && an.planActive ? an.plan : null;
    return { title: an.title, phase: an.phase.text, plan: p ? { side: p.side, setup: E.SETUP_SHORT[p.setup], entry: p.entry, stop: p.stop, target: p.notgt ? null : p.target } : null,
      exit: an.phaseNext !== 0 || !!an.flipNow, tf: S.tf, swing: an.swing };
  }
  function journalPanel() {
    if (tr) return '';   // в тренажёре реальные позиции и дневник не показываем
    const mine = jList().filter((j) => j.instId === S.inst.id && !j.closeT);
    const cur = all.length ? all[all.length - 1].c : null;
    let h = '';
    const pos = S.acct && S.acct.positions && lotInfo && lotInfo.uid ? S.acct.positions.find((p) => p.uid === lotInfo.uid) : null;
    if (pos && pos.qty) {
      const pnl = (cur - pos.avg) * pos.qty, pct = pos.avg ? (cur / pos.avg - 1) * Math.sign(pos.qty) : 0;
      h += `<div class="plan ${pos.qty > 0 ? 'buy' : 'sell'}"><b>На счёте: ${Math.abs(pos.qty)} шт.${lotInfo.lot > 1 ? ' (' + Math.abs(pos.qty) / lotInfo.lot + ' лот.)' : ''}</b> · средняя ${pr(pos.avg)} · сейчас <span class="${pnl >= 0 ? 'pos' : 'neg'}">${fRub(pnl)} (${spc(pct)})</span><div class="small mut">по данным счёта на ${fmtT(S.acct.at, true)}</div></div>`;
    }
    for (const j of mine) {
      const r = jPnl(j, cur);
      h += `<div class="plan ${j.side > 0 ? 'buy' : 'sell'}"><b>Моя ${j.side > 0 ? 'покупка' : 'продажа'}</b> ${j.lots} лот. от ${pr(j.openP)} (${fmtT(j.openT, true)})${r ? ` · сейчас <span class="${r.rub >= 0 ? 'pos' : 'neg'}">${fRub(r.rub)} (${spc(r.pct)}${r.R != null ? ', ' + f2(r.R) + ' R' : ''})</span>` : ''}
        ${j.stop ? `<div class="small">Мой стоп ${pr(j.stop)}${j.target ? ' · цель ' + pr(j.target) : ''}</div>` : ''}
        <div class="row" style="margin-top:4px"><button data-jclose="${j.id}">Закрыть в дневнике</button></div></div>`;
    }
    if (!demo) h += `<div class="row" style="margin-top:6px"><button id="jrnQuick">📒 Записать мою сделку</button></div>`;
    return h;
  }
  let jEdit = null;   // открытая форма: { mode: 'open' | 'close', id }
  function openJournal(form) { jEdit = form || null; renderJournal(); openSheet('journal'); }
  // значки за мои сделки — про дисциплину: стоп, план, серия
  function achCard() {
    const l = jList(), cl = l.filter((j) => j.closeT).sort((a, b) => a.closeT - b.closeT), R = cl.map((j) => jPnl(j));
    let run = 0, best = 0; for (const r of R) { run = r && r.rub > 0 ? run + 1 : 0; best = Math.max(best, run); }
    const bySig = (j) => j.sys && j.sys.plan && j.sys.plan.side === j.side, m30 = cl.filter((j) => Date.now() - j.closeT < 30 * 864e5);
    const L = [
      ['first', '🎯', 'Первая сделка', 'запишите первую сделку', l.length > 0],
      ['ten', '🔟', '10 сделок', 'закройте 10 сделок', cl.length >= 10],
      ['three', '🔥', 'Три в плюс подряд', 'три прибыльные сделки подряд', best >= 3],
      ['stop', '🛡', 'Стоп в каждой', 'от 5 сделок, и у всех стоп', l.length >= 5 && l.every((j) => j.stop)],
      ['sig5', '📡', 'По сигналу ×5', '5 сделок по сигналу системы', l.filter(bySig).length >= 5],
      ['plan', '📋', 'Месяц по плану', 'за 30 дней от 3 сделок, все по сигналу и со стопом', m30.length >= 3 && m30.every((j) => j.stop && bySig(j))],
      ['r3', '🚀', 'Плюс 3R', 'сделка принесла 3 риска (R)', R.some((r) => r && r.R != null && r.R >= 3)],
      ['small', '✂️', 'Маленький убыток', 'убыток не больше 1R — стоп сработал как задумано', R.some((r) => r && r.R != null && r.R < 0 && r.R >= -1.1)],
    ];
    const got = L.filter((x) => x[4]).map((x) => x[0]), nw = S.achSeen ? got.filter((k) => !S.achSeen.includes(k)) : [];
    if (!S.achSeen || nw.length) { S.achSeen = Array.from(new Set((S.achSeen || []).concat(got))); save(); if (nw.length) setTimeout(fireworks, 300); }   // новый значок — один раз, с салютом
    return `<div class="card"><h3>🏅 Достижения · ${got.length} из ${L.length}</h3><div class="ach">${L.map(([k, ic, t, how, ok]) => `<div class="${ok ? 'got' : ''}${nw.includes(k) ? ' new' : ''}"><b>${ic}</b>${t}${ok ? '' : '<br><small>' + esc(how) + '</small>'}</div>`).join('')}</div></div>`;
  }
  function renderJournal() {
    const l = jList(), cur = all.length ? all[all.length - 1].c : null;
    let h = jEdit ? '' : achCard();
    if (jEdit && jEdit.mode === 'open') {
      const p = an && an.plan && an.planActive ? an.plan : null, px = jEdit.price || cur || (p ? p.entry : 0);
      const side = jEdit.side || (p ? p.side : (S.cfg.shortOnly ? -1 : 1)), stop = p ? p.stop : '', tgt = p && !p.notgt ? p.target : '';
      h += `<div class="card jform"><h3>Новая сделка · ${esc(S.inst.ticker)}${jEdit.t ? ' · ' + fmtT(jEdit.t, true) : ''}</h3>
        <div class="two"><div class="field"><label>Сторона</label><select id="jSide"><option value="1" ${side > 0 ? 'selected' : ''}>Покупка</option><option value="-1" ${side < 0 ? 'selected' : ''}>Продажа</option></select></div>
        <div class="field"><label>Цена входа</label><input type="number" step="any" id="jPrice" value="${px ? +px.toFixed(4) : ''}"></div></div>
        <div class="two"><div class="field"><label>Лотов</label><input type="number" min="1" id="jLots" value="${p && px ? lotsFor(px, p.stop) : 1}"></div>
        <div class="field"><label>Стоп</label><input type="number" step="any" id="jStop" value="${stop ? +stop.toFixed(4) : ''}"></div></div>
        <div class="field"><label>Цель (необязательно)</label><input type="number" step="any" id="jTgt" value="${tgt ? +tgt.toFixed(4) : ''}"></div>
        <div class="field"><label>Комментарий: почему вошёл</label><input id="jNote" placeholder="например: по сигналу W3, на откате"></div>
        <div class="small">${p ? 'Сейчас у системы план: ' + (p.side > 0 ? 'покупка' : 'продажа') + ' ' + esc(E.SETUP_SHORT[p.setup]) + ', вход ~' + pr(p.entry) + ', стоп ' + pr(p.stop) + '. Он сохранится рядом с вашей сделкой.' : 'Сейчас у системы нет плана на вход — сделка запишется как «без сигнала».'}</div>
        <div class="row" style="margin-top:8px"><button id="jOk">Записать</button><button id="jCancel">Отмена</button></div></div>`;
    }
    if (jEdit && jEdit.mode === 'close') {
      const j = l.find((x) => x.id === jEdit.id);
      if (j) h += `<div class="card jform"><h3>Закрыть: ${esc(j.ticker)} ${j.side > 0 ? 'покупка' : 'продажа'} от ${pr(j.openP)}</h3>
        <div class="field"><label>Цена выхода</label><input type="number" step="any" id="jcPrice" value="${j.instId === S.inst.id && cur ? +cur.toFixed(4) : ''}"></div>
        <div class="field"><label>Комментарий: почему вышел</label><input id="jcNote" placeholder="стоп / цель / по сигналу выхода / сам решил"></div>
        <div class="row"><button id="jcOk">Закрыть сделку</button><button id="jCancel">Отмена</button></div></div>`;
    }
    const closed = l.filter((j) => j.closeT), open = l.filter((j) => !j.closeT);
    // итоги
    if (closed.length) {
      let rub = 0, wins = 0, Rs = 0, nR = 0; const g = { sig: [0, 0, 0], nosig: [0, 0, 0] };
      for (const j of closed) { const r = jPnl(j); rub += r.rub; if (r.rub > 0) wins++; if (r.R != null) { Rs += r.R; nR++; } const k = j.sys && j.sys.plan && j.sys.plan.side === j.side ? 'sig' : 'nosig'; g[k][0]++; g[k][1] += r.rub; if (r.rub > 0) g[k][2]++; }
      h += `<div class="card"><h3>Итоги</h3><div class="kv"><div><small>Сделок</small><b>${closed.length}</b></div><div><small>Прибыльных</small><b>${Math.round(wins / closed.length * 100)}%</b></div><div><small>Результат</small><b class="${rub >= 0 ? 'pos' : 'neg'}">${fRub(rub)}</b></div></div>
        ${nR ? `<div class="small">Сумма R по сделкам со стопом: ${f2(Rs)} (${nR} сд.)</div>` : ''}
        <div class="small">По сигналу системы: ${g.sig[0]} сд., ${g.sig[0] ? Math.round(g.sig[2] / g.sig[0] * 100) : 0}% прибыльных, ${fRub(g.sig[1])} · без сигнала: ${g.nosig[0]} сд., ${g.nosig[0] ? Math.round(g.nosig[2] / g.nosig[0] * 100) : 0}% прибыльных, ${fRub(g.nosig[1])}</div></div>`;
    }
    const row = (j) => {
      const r = j.closeT ? jPnl(j) : jPnl(j, j.instId === S.inst.id && cur ? cur : null);
      const sp = j.sys && j.sys.plan;
      return `<div class="jrow"><div class="row"><span><b>${esc(j.ticker)}</b> ${j.side > 0 ? '▲ покупка' : '▼ продажа'} ${j.lots} лот.</span>${r ? `<span class="${r.rub >= 0 ? 'pos' : 'neg'}">${fRub(r.rub)} · ${spc(r.pct)}${r.R != null ? ' · ' + f2(r.R) + ' R' : ''}</span>` : ''}</div>
        ${j.src === 'broker' ? '<div class="small blue">из Т-Инвестиций' + (j.closeT ? '' : ' · позиция ' + Math.round((j.lots || 1) * (j.lot || 1)) + ' шт.') + '</div>' : ''}
        ${!j.closeT && livePx[j.instId] ? '<div class="small mut">цена ' + pr(livePx[j.instId].price) + ' на ' + fmtT(livePx[j.instId].t, true) + '</div>' : ''}
        <div class="small">${fmtT(j.openT, true)} по ${pr(j.openP)}${j.closeT ? ' → ' + fmtT(j.closeT, true) + ' по ' + pr(j.closeP) : ' · открыта'}${j.stop ? ' · стоп ' + pr(j.stop) : ''}</div>
        <div class="small">Система при входе: ${sp ? (sp.side === j.side ? '<span class="pos">был сигнал</span> ' : '<span class="warn">сигнал в другую сторону</span> ') + esc(sp.setup) + ', вход ~' + pr(sp.entry) + ', стоп ' + pr(sp.stop) : '<span class="mut">сигнала не было</span>'}${j.sys ? ' · ' + esc(j.sys.title || '') : ''}</div>
        ${j.closeT && j.sysClose ? `<div class="small">Система при выходе: ${j.sysClose.exit ? '<span class="warn">был сигнал на выход</span>' : 'сигнала на выход не было'} · ${esc(j.sysClose.title || '')}</div>` : ''}
        ${j.note || j.closeNote ? `<div class="small">💬 ${esc(j.note || '')}${j.closeNote ? ' → ' + esc(j.closeNote) : ''}</div>` : ''}
        <div class="row" style="margin-top:4px">${!j.closeT ? `<button data-jclose="${j.id}">Закрыть</button>` : ''}<button data-jgo="${j.id}">На график</button><button data-jdel="${j.id}">Удалить</button></div></div>`;
    };
    h += `<div class="card"><h3>Открытые (${open.length})</h3>${open.length ? open.map(row).join('') : '<div class="small">Нет. «+ Сделка» — записать вход по текущей бумаге.</div>'}</div>`;
    h += `<div class="card"><h3>Закрытые (${closed.length})</h3>${closed.length ? closed.slice().reverse().map(row).join('') : '<div class="small">Пока нет.</div>'}</div>`;
    if (S.account && S.token) h += `<div class="card"><h3>Сделки со счёта Т-Инвестиций</h3><div class="row"><button id="jImport">⟳ Загрузить все мои сделки (3 года)</button></div><div class="small" id="jImpRes">${S.lastImport ? 'Последняя загрузка: ' + fmtT(S.lastImport, true) + (S.lastImportMsg ? ' — ' + esc(S.lastImportMsg) : '') + '. ' : ''}Все бумаги со счёта «${esc(S.account.name)}»: покупки и продажи собираются в сделки, комментарии можно дописать. По открытой на графике бумаге это происходит само.</div></div>`;
    h += `<div class="card"><h3>Выгрузка</h3><div class="row"><button id="jCsv">Таблица (CSV для Excel)</button><button id="jJson">Файл для разбора (JSON)</button></div><div class="small" id="jRes">Дневник хранится только на этом телефоне. Выгрузите его, чтобы сохранить или прислать на разбор.</div></div>`;
    $('#jrnBody').innerHTML = h;
    const on = (sl, ev, fn) => { const el = $(sl); if (el) el.addEventListener(ev, fn); };
    on('#jCancel', 'click', () => { jEdit = null; renderJournal(); });
    on('#jOk', 'click', () => {
      const openP = Number($('#jPrice').value); if (!(openP > 0)) { alertSmall('Укажите цену входа'); return; }
      const l2 = jList();
      l2.push({ id: 'j' + Date.now(), instId: S.inst.id, ticker: S.inst.ticker, name: S.inst.name, side: Number($('#jSide').value), openT: jEdit.t || Date.now(), openP,
        lots: Math.max(1, Number($('#jLots').value) || 1), lot: lotInfo && lotInfo.lot ? lotInfo.lot : 1, stop: Number($('#jStop').value) || null, target: Number($('#jTgt').value) || null,
        note: $('#jNote').value.trim(), sys: sysNow() });
      jSave(l2); jEdit = null; renderJournal(); renderPanel(); draw();
    });
    on('#jcOk', 'click', () => {
      const l2 = jList(), j = l2.find((x) => x.id === jEdit.id), p = Number($('#jcPrice').value);
      if (!j || !(p > 0)) { alertSmall('Укажите цену выхода'); return; }
      j.closeT = Date.now(); j.closeP = p; j.closeNote = $('#jcNote').value.trim(); j.sysClose = j.instId === S.inst.id ? sysNow() : null;
      jSave(l2); jEdit = null; renderJournal(); renderPanel(); draw();
    });
    $('#jrnBody').querySelectorAll('[data-jclose]').forEach((b) => { b.onclick = () => { jEdit = { mode: 'close', id: b.dataset.jclose }; renderJournal(); $('#jrnBody').scrollTop = 0; }; });
    $('#jrnBody').querySelectorAll('[data-jdel]').forEach((b) => { b.onclick = () => { if (b.dataset.sure) { jSave(jList().filter((x) => x.id !== b.dataset.jdel)); renderJournal(); renderPanel(); draw(); } else { b.dataset.sure = 1; b.textContent = 'Точно удалить?'; } }; });
    $('#jrnBody').querySelectorAll('[data-jgo]').forEach((b) => { b.onclick = () => { const j = jList().find((x) => x.id === b.dataset.jgo); if (!j) return; closeSheet('journal'); if (j.instId !== S.inst.id) { S.inst = { id: j.instId, ticker: j.ticker, name: j.name, classCode: j.classCode || 'TQBR' }; save(); sel = -1; an = null; view.init = false; renderHead(); load(false); } }; });
    on('#jCsv', 'click', () => exportJournal('csv'));
    on('#jImport', 'click', importAllOps);
    on('#jJson', 'click', () => exportJournal('json'));
  }
  function alertSmall(t) { const r = $('#jrnBody').querySelector('.jform .small'); if (r) r.innerHTML = '<span class="neg">' + esc(t) + '</span>'; }
  function exportJournal(kind) {
    const l = jList(), d = new Date(), p2 = (x) => String(x).padStart(2, '0'), stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
    let name, mime, txt;
    if (kind === 'csv') {
      const num = (x) => x == null ? '' : String(x).replace('.', ',');   // CSV для русского Excel — всегда запятая (разделитель столбцов «;»)
      const rows = [['Бумага', 'Сторона', 'Лотов', 'Акций в лоте', 'Вход дата', 'Вход цена', 'Стоп', 'Цель', 'Выход дата', 'Выход цена', 'Результат ₽', 'Результат %', 'R', 'Сигнал системы при входе', 'Сигнал на выход при выходе', 'Комментарий вход', 'Комментарий выход']];
      for (const j of l) { const r = j.closeT ? jPnl(j) : null; const sp = j.sys && j.sys.plan;
        rows.push([j.ticker, j.side > 0 ? 'покупка' : 'продажа', j.lots, j.lot || 1, fmtT(j.openT, true), num(j.openP), num(j.stop), num(j.target), j.closeT ? fmtT(j.closeT, true) : '', num(j.closeP), r ? num(Math.round(r.rub)) : '', r ? num((r.pct * 100).toFixed(2)) : '', r && r.R != null ? num(r.R.toFixed(2)) : '',
          sp ? (sp.side === j.side ? 'да' : 'в другую сторону') + ' ' + sp.setup : 'нет', j.sysClose ? (j.sysClose.exit ? 'да' : 'нет') : '', j.note || '', j.closeNote || '']); }
      txt = '\ufeff' + rows.map((r) => r.map((c) => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
      name = 'ew-journal-' + stamp + '.csv'; mime = 'text/csv';
    } else { txt = JSON.stringify({ kind: 'ew-journal', app: 'Волны Эллиотта ' + APP_VER, exportedAt: d.toISOString(), journal: l }); name = 'ew-journal-' + stamp + '.json'; mime = 'application/json'; }
    if (A && A.saveDownload) { const r = A.saveDownload(name, mime, txt).split('|'); $('#jRes').innerHTML = r[0] === 'ok' ? 'Сохранено: ' + esc(r[1]) : '<span class="neg">' + esc(r[1]) + '</span>'; if (r[0] === 'ok' && A.shareLast) A.shareLast(mime); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); $('#jRes').textContent = 'Сохранено: ' + name; }
  }
  // цены открытых сделок дневника — раз в минуту, одним запросом
  async function refreshLive() {
    if (!S.token || demo || mxSrc) return;
    const open = jList().filter((j) => !j.closeT); if (!open.length) return;
    try {
      const ids = [...new Set(open.map((j) => j.instId))], uidOf = {};
      for (const id of ids) { const j = open.find((x) => x.instId === id); const info = await D.instInfo(S.token, { id, ticker: j.ticker, classCode: j.classCode || 'TQBR' }); if (info.uid) uidOf[info.uid] = id; }
      const px = await D.getLastPrices(S.token, Object.keys(uidOf));
      for (const [uid, v] of Object.entries(px)) if (uidOf[uid]) livePx[uidOf[uid]] = v;
      if (!$('#journal').hidden && !jEdit) renderJournal();
    } catch (e) { /* не страшно — попробуем через минуту */ }
  }
  setInterval(() => { if (!document.hidden) refreshLive(); }, 60000);

  // ---------- сделки со счёта Т-Инвестиций ----------
  const opsCache = {};   // instId → [{ t, side, qty, price }]
  async function loadBrokerOps() {
    if (!S.token || demo || !S.account || S.brokerSync === false) return;
    try {
      const info = await D.instInfo(S.token, S.inst); if (!info.uid) return;
      const from = all.length ? all[0].t : Date.now() - 365 * 86400000;
      const ops = await D.getOperations(S.token, S.account.id, info.uid, Math.min(from, Date.now() - 400 * 86400000));
      opsCache[S.inst.id] = ops;
      syncJournal(S.inst, ops, info.lot || 1);
      if (an) { renderPanel(); draw(); }
    } catch (e) { /* без операций — просто не рисуем */ }
  }
  // из исполненных заявок собираем сделки: позиция открылась (0 → ≠0) … закрылась (→ 0)
  function syncJournal(inst, ops, lot) {
    const l = jList(); let changed = false, pos = 0, cost = 0, trip = null;
    const flush = () => {
      if (!trip) return;
      const key = 'b' + trip.firstId, ex = l.find((x) => x.bid === key);
      const rec = { side: trip.side, openT: trip.openT, openP: trip.openP, lots: trip.maxQty / lot, lot, closeT: trip.closed ? trip.closeT : null, closeP: trip.closed ? trip.exitSum / trip.exitQty : null };
      if (!ex) { l.push(Object.assign({ id: 'j' + trip.openT + trip.firstId.slice(-4), bid: key, src: 'broker', instId: inst.id, ticker: inst.ticker, name: inst.name, classCode: inst.classCode, note: '', sys: null }, rec)); changed = true; }
      else if (ex.closeT !== rec.closeT || ex.openP !== rec.openP || ex.lots !== rec.lots) { Object.assign(ex, rec); changed = true; }
    };
    for (const o of ops) {
      const d = o.side * o.qty;
      if (pos === 0) { trip = { side: o.side, firstId: String(o.id), openT: o.t, openP: o.price, maxQty: o.qty, exitSum: 0, exitQty: 0, closed: false }; cost = o.price * o.qty; pos = d; continue; }
      if (Math.sign(d) === Math.sign(pos)) { cost += o.price * o.qty; pos += d; trip.openP = cost / Math.abs(pos); trip.maxQty = Math.max(trip.maxQty, Math.abs(pos)); }
      else {
        const closeQty = Math.min(o.qty, Math.abs(pos));
        trip.exitSum += o.price * closeQty; trip.exitQty += closeQty; cost -= trip.openP * closeQty; pos += Math.sign(d) * closeQty;
        if (pos === 0) { trip.closed = true; trip.closeT = o.t; flush(); trip = null; cost = 0;
          const rest = o.qty - closeQty; if (rest > 0) { trip = { side: o.side, firstId: String(o.id) + 'r', openT: o.t, openP: o.price, maxQty: rest, exitSum: 0, exitQty: 0, closed: false }; cost = o.price * rest; pos = o.side * rest; } }
      }
    }
    if (trip) flush();
    if (changed) jSave(l);
  }

  // ---------- виртуальный счёт робота ----------
  const robotTf = (key) => { const p = PRESETS.find((x) => x[0] === key); return p ? p[2] : '1d'; };
  // 3.1: риск на сделку у роботов — по набору (проверка 2018–2026: основной 26 → 30%/год, «4 часа · неделя» 20 → 23%, просадка +0,6…1,6 п.п.); остальные — как в настройках
  // 3.9: риск у роботов больше не берётся из ⚙ → Счета — у каждого робота свой (рекомендуемый по проверке 25.10 или свой: a.riskOwn)
  const ROBOT_RISK = { d_long: 1.5, h4_week: 1.5, d_aggr: 1, h4_tri: 1, h4_fig: 1.5 };
  function robotCfg(key) {
    const p = PRESETS.find((x) => x[0] === key);
    return Object.assign({ maxBars: 2000, riskPct: ROBOT_RISK[key] || 1, feePct: S.cfg.feePct != null ? S.cfg.feePct : 0.05, divAdj: true },
      { setups: Object.assign({}, W3ABC), addComplexTrade: false, addPhaseExit: false, addMinRR: false, addDepth: false, exitMode: 'fixed', targetMode: 'main', minScore: 45, bookTrend: true, addTrend: 'none', stopW2: false, localBars: 2, maxHoldDays: 0 }, p ? p[3] : {});
  }
  const robCfgFor = (a) => Object.assign(robotCfg(a.key), a.riskOwn ? { riskPct: a.riskOwn } : {});   // настройки набора + свой риск робота
  // 3.9: однократно — у запущенных роботов риск остаётся, каким был (свой, если не совпадает с рекомендуемым)
  function migrateRisk() {   // вызывается в конце запуска (PRESETS объявлены ниже)
    if ((S.cfgVer || 0) >= 7) return;
    try { const W = D.vaccGet(); if (W && W.accs) { for (const a of W.accs) if (!a.manual && !a.crypto && a.cfg && a.cfg.riskPct && a.cfg.riskPct !== robotCfg(a.key).riskPct) a.riskOwn = a.cfg.riskPct; D.vaccSet(W); } } catch (e) { /* роботов нет */ }
    S.cfgVer = 7; D.saveSettings(S);
  }
  let robotBusy = false, robotMsg = '', robotArm = '', riskArm = null;
  // 3.9: свой риск на сделку у робота — поле, кнопка «рекомендуемый» и предупреждение перед сохранением
  function riskBox(a) {
    const rec = robotCfg(a.key).riskPct, cur = a.cfg.riskPct || rec, n = (x) => String(x).replace('.', DEC());
    let h = `<div class="field" style="margin-top:8px"><label>Риск на сделку, % капитала — сейчас ${n(cur)}%${a.riskOwn ? ' (свой)' : ' (рекомендуемый)'}</label>
      <div class="row"><input type="number" step="0.1" min="0.1" max="5" id="rRisk" value="${cur}" style="flex:1"><button data-rrisk="${a.key}">Сохранить</button>${cur !== rec ? `<button data-rrrec="${a.key}">Вернуть ${n(rec)}%</button>` : ''}</div>
      <div class="small mut">Рекомендуемый по проверке на истории: ${n(rec)}%. Сколько потерять до стопа в одной сделке: ${n(cur)}% капитала робота.</div></div>`;
    if (riskArm && riskArm.key === a.key) {
      const v = riskArm.v, more = v > cur, big = v > rec;
      h += `<div class="note warn" style="margin-top:6px"><b>Поставить риск ${n(v)}% вместо ${n(cur)}%?</b><ul style="margin:4px 0 0 18px;padding:0">
        ${more ? `<li>Просадки станут глубже. На истории бывало до 15 стопов подряд: это примерно −${n(Math.round(v * 15 * 10) / 10)}% счёта при ${n(v)}% (сейчас −${n(Math.round(cur * 15 * 10) / 10)}%).</li>` : '<li>Сделки станут мельче: и прибыль, и убытки меньше.</li>'}
        ${big ? `<li>Выше рекомендуемого доход почти не растёт: позиции упираются в лимит 25% счёта и в свободные деньги${a.key === 'd_aggr' ? ', а у агрессивного выше 1% на истории было только хуже' : ''}.</li>` : ''}
        ${v !== rec ? '<li>Результат робота нельзя будет честно сравнить с проверкой на истории и с другими роботами в «гонке».</li>' : ''}
        <li>Новый риск — только для новых сделок; открытые позиции остаются, как были.</li></ul>
        <div class="row" style="margin-top:6px"><button data-rryes="${a.key}">Да, поставить ${n(v)}%</button><button data-rrno="1">Отмена</button></div></div>`;
    }
    return h;
  }
  const rub0 = (x) => Math.round(x).toLocaleString('ru-RU') + ' ₽';
  const usd0 = (x) => '$' + Math.round(x).toLocaleString('ru-RU');
  const money = (a, x) => (a && a.crypto ? usd0(x) : rub0(x));   // 3.2: счёт робота «Биткоин · тренд» — в долларах
  function eqSpark(hist) {
    const v = hist.map((h) => h.dep > 0 ? (h.eq + (S.vimOn ? h.mm || 0 : 0)) / h.dep : 1);
    if (v.length < 2) return '';
    const w = 120, hh = 28, lo = Math.min(...v, 1), hi = Math.max(...v, 1), sp = hi - lo || 0.01;
    const pts = v.map((x, k) => `${(k / (v.length - 1) * w).toFixed(1)},${(hh - (x - lo) / sp * hh).toFixed(1)}`).join(' ');
    const z = (hh - (1 - lo) / sp * hh).toFixed(1);
    return `<svg width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><line x1="0" x2="${w}" y1="${z}" y2="${z}" stroke="#2e3744"/><polyline fill="none" stroke="${v[v.length - 1] >= 1 ? '#3fbf7f' : '#ef5b5b'}" stroke-width="1.6" points="${pts}"/></svg>`;
  }
  // ---------- 2.41: роботы с характером и настроением ----------
  const animOn = () => S.anim !== false;
  // 3.10: таймер до закрытия свечи — <span data-cd="время закрытия">, тикает раз в секунду
  const cdTxt = (ms) => { const x = Math.max(0, Math.round(ms / 1000)), h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), p2 = (n) => String(n).padStart(2, '0'); return (h ? h + ':' + p2(m) : m) + ':' + p2(x % 60); };
  const cdSpan = (t, pre) => t > Date.now() ? `<span class="cd" data-cd="${t}" data-pre="${esc(pre || 'до закрытия свечи')}">⏱ ${esc(pre || 'до закрытия свечи')} ${cdTxt(t - Date.now())}</span>` : '';
  setInterval(() => { for (const el of document.querySelectorAll('[data-cd]')) { const left = +el.dataset.cd - Date.now(); if (left <= 0) { el.textContent = '⏱ свеча закрылась'; el.removeAttribute('data-cd'); } else el.textContent = '⏱ ' + el.dataset.pre + ' ' + cdTxt(left); } }, 1000);
  // 3.10: «мой (вручную)» — расходы и доходы брокера с первой сверки (уже входят в капитал и результат, здесь — отдельной строкой)
  function manCosts(a) {
    const c = a.costs || {}, NM = [['fee', 'обслуживание'], ['comm', 'комиссии'], ['tax', 'налог'], ['inc', 'дивиденды и купоны']];
    const parts = NM.filter(([k]) => Math.abs(c[k] || 0) >= 0.5).map(([k, n]) => `${n} ${(c[k] > 0 ? '+' : '−') + rub0(Math.abs(c[k]))}`);
    return parts.length ? `В результате уже учтено: ${parts.join(' · ')}. ` : 'Обслуживания, комиссий и налога с этого дня пока не было. ';
  }
  // 2.43: все уведомления — через одно место: шторка Android + история оповещений в приложении
  function sendNotes(ev, id0) {
    if (!ev || !ev.length) return;
    D.notifSave(ev);
    D.notifySend(ev, id0);
  }
  function notifRows(n) {
    const h = D.store.get('notifHist', []).slice(-n).reverse();
    if (!h.length) return '<div class="small mut" style="padding:4px 0">Пока ни одного. Здесь будут все уведомления, что приходили: сигналы, выходы, фигуры, отмена подсчёта, уровни, роботы.</div>';
    return h.map((x) => `<div class="feed"${x.open && x.open.id ? ` data-nopen="${esc(x.open.id)}|${esc(x.open.tf || '')}" role="button"` : ''}><time>${fmtT(x.t, true)}</time><b>${esc(x.title)}</b><div class="small mut">${esc(x.text || '')}</div></div>`).join('');
  }
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-nopen]'); if (!r) return;
    const [id, tf] = r.dataset.nopen.split('|'); goChart({ id, ticker: id.split('_')[0], tf: tf || undefined });
  });
  // 2.42: карточки сворачиваются нажатием на заголовок; что свёрнуто — помним (S.fold: ключ → true, если свёрнута)
  const foldC = (k, def) => ' fold' + ((S.fold && k in S.fold ? S.fold[k] : !!def) ? ' folded' : '');
  document.addEventListener('click', (e) => {
    const h = e.target.closest('.card.fold > h3'); if (!h || e.target.closest('button, input, select, a, label')) return;
    const c = h.parentElement, k = c.dataset.fold; if (!k) return;
    S.fold = Object.assign({}, S.fold); S.fold[k] = !c.classList.contains('folded'); c.classList.toggle('folded', S.fold[k]); save();
  });
  const applyAnim = () => document.body.classList.toggle('noanim', !animOn());
  // робот-картинка: цвет — как его сделки на графике; огонёк — агрессивный, часики — «4 часа · неделя»
  function botSvg(key, mood, big) {
    const c = key ? rmStyle(key).c : '#8fb4e8', ln = (d, cl) => `<path class="${cl}" d="${d}" stroke="#14181e" stroke-width="1.3" stroke-linecap="round" fill="none"/>`;
    const acc = key === 'd_aggr' ? '<path class="bot-fire" d="M20.5 1.5c1.2 1.6 2.3 2.8 1.4 4.6-.6 1.2-2.6 1.3-3.2 0-.5-1 .3-1.8.6-2.6.3.9.9 1.1 1.2.6.3-.7.1-1.5 0-2.6z" fill="#ff7a2f"/>'
      : key === 'h4_week' ? '<circle cx="20" cy="19" r="3.6" fill="#14181e" stroke="#e8ecf1" stroke-width="1"/><line class="bot-hand" x1="20" y1="19" x2="20" y2="16.6" stroke="#e8ecf1" stroke-width="1"/>'
      : key === 'h4_fig' ? '<rect x="15.4" y="16.2" width="8" height="6.6" rx="1.4" fill="#14181e" stroke="#e8ecf1" stroke-width=".8"/><path class="bot-hand" d="M16.3 19.4l1.3-1.4 1.1 2.6 1.2-1.2 1.1-0.4 1.5-1.8" stroke="#26c6da" stroke-width=".9" fill="none" stroke-linecap="round"/>'
      : key === 'btc_trend' ? '<circle cx="20" cy="19" r="3.8" fill="#f7931a" stroke="#14181e" stroke-width=".8"/><text x="20" y="21" font-size="5.2" text-anchor="middle" fill="#fff" font-weight="700">₿</text>' : '';
    return `<svg class="bot m-${mood || 'idle'}${big ? ' big' : ''}" viewBox="0 0 24 24" aria-hidden="true"><g class="bot-b">
      <g class="bot-ant"><line x1="12" y1="3" x2="12" y2="6" stroke="${c}" stroke-width="1.4"/><circle class="bot-led" cx="12" cy="2.4" r="1.7"/></g>
      <rect x="3.5" y="6" width="17" height="11" rx="3.2" fill="${c}"/><rect x="1.8" y="9.5" width="1.7" height="4" rx=".8" fill="${c}"/><rect x="20.5" y="9.5" width="1.7" height="4" rx=".8" fill="${c}"/>
      <g class="bot-eyes"><circle cx="9" cy="10.6" r="1.7" fill="#14181e"/><circle cx="15" cy="10.6" r="1.7" fill="#14181e"/></g>
      ${ln('M9.5 14.2h5', 'm-n')}${ln('M8.8 13.4q3.2 2.8 6.4 0', 'm-s')}${ln('M8.8 15.2q3.2-2.6 6.4 0', 'm-f')}
      <rect x="7" y="18" width="10" height="4.5" rx="1.6" fill="${c}" opacity=".75"/>${acc}</g>
      <text class="bot-z" x="19" y="5" font-size="6" fill="#8d98a6" font-weight="700">z</text></svg>`;
  }
  // что нового у роботов с прошлого взгляда: открытия и закрытия сделок
  const robCounts = (a) => ({ c: a.closed.length, o: a.closed.length + a.pos.length });
  function robMarkSeen(V) { const k = {}; for (const a of V.accs) k[a.key] = robCounts(a); S.robSeen = { at: V.startAt, k }; save(); }
  function robUnseen(V) {
    if (!V) return null;
    if (!S.robSeen || S.robSeen.at !== V.startAt) robMarkSeen(V);   // первый раз (или роботы запущены заново) — без «старых новостей»
    const out = { n: 0, by: {} };
    for (const a of V.accs) {
      const s0 = S.robSeen.k[a.key] || { c: 0, o: 0 }, c1 = robCounts(a);
      const n = Math.max(0, c1.c - s0.c) + Math.max(0, c1.o - s0.o);
      out.n += n; out.by[a.key] = { n, cl: a.closed.slice(Math.min(s0.c, a.closed.length)) };
    }
    return out;
  }
  const moodOf = (cl) => (cl && cl.length ? (cl.reduce((x, c) => x + c.pl, 0) >= 0 ? 'happy' : 'sad') : '');
  function renderRobIcon() {
    const b = $('#robBtn'); if (!b) return;
    let V = null; try { V = D.vaccGet(); } catch (e) { V = null; }
    const u = V && $('#robots').hidden ? robUnseen(V) : null;
    let mood = robotBusy ? 'think' : V && !V.on ? 'sleep' : 'idle';
    if (u && mood === 'idle') mood = moodOf([].concat(...Object.values(u.by).map((x) => x.cl))) || 'idle';
    b.innerHTML = botSvg('', mood) + (u && u.n ? `<span class="cnt">${u.n > 99 ? '99+' : u.n}</span>` : '');
  }
  let robFresh = {};   // что нового было, когда открыли экран «Роботы»: { ключ счёта: [закрытые сделки] }
  function robTakeNews(V) {
    const u = robUnseen(V); if (!u) return;
    let big = false;
    for (const a of V.accs) { const x = u.by[a.key]; if (!x || !x.n) continue; robFresh[a.key] = (robFresh[a.key] || []).concat(x.cl); if (x.cl.some((c) => c.pl >= 0.015 * a.dep)) big = true; }
    robMarkSeen(V);
    if (big) fireworks();   // сделка закрылась с хорошей прибылью (≈1,5 риска и больше)
  }
  function openRobots() { robFresh = {}; const V = D.vaccGet(); if (V) robTakeNews(V); renderRobot(); openSheet('robots'); renderRobIcon(); }
  function fireworks() {
    if (!animOn()) return;
    const cv = document.createElement('canvas'); cv.id = 'fx'; document.body.appendChild(cv);
    const W2 = cv.width = innerWidth, H2 = cv.height = innerHeight, g = cv.getContext('2d'), P = [], cols = ['#f5d742', '#3fbf7f', '#5b9cff', '#ef5b5b', '#c08cff', '#f0a23a'];
    for (let k = 0; k < 3; k++) {
      const x = W2 * (0.25 + 0.25 * k), y = H2 * (0.25 + 0.1 * (k % 2));
      for (let j = 0; j < 40; j++) { const ang = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5; P.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, c: Math.random() < 0.3 ? '#fff' : cols[(k * 2 + j) % cols.length], d: k * 12 }); }
    }
    let f = 0;
    (function step() {
      g.clearRect(0, 0, W2, H2);
      for (const p of P) { if (f < p.d) continue; p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.985; g.globalAlpha = Math.max(0, 1 - (f - p.d) / 70); g.fillStyle = p.c; g.fillRect(p.x, p.y, 3, 3); }
      if (++f < 100) requestAnimationFrame(step); else cv.remove();
    })();
  }
  const PHRASES = ['Сигналов нет — деньги в фонде, я отдыхаю.', 'Жду волну 2, чтобы войти в волну 3. Терпение — тоже стратегия.', 'Нет сигнала — нет сделки. Это не лень, это правило.', 'Волна 3 обычно самая сильная. Её и жду.',
    'Против старшего тренда не торгую — так спокойнее.', 'На истории — около сигнала в неделю. Скоро что-нибудь найду.', 'Стоп ставлю всегда. Даже во сне.', 'Пректер учит: рынок движется волнами. Я учусь у Пректера.'];
  const nPos = (n) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'позицию' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'позиции' : 'позиций');
  function robPhrase(V) {
    const msk = new Date(Date.now() + 3 * 36e5), wd = msk.getUTCDay(), robs = V.accs.filter((a) => !a.manual);
    const fresh = [].concat(...Object.values(robFresh)), wk = robs.reduce((s, a) => s + a.pos.filter((p) => p.wk).length, 0);
    const pend = robs.flatMap((a) => Object.keys(a.pend || {}).map((id) => [a, id]));
    if (robotBusy) return ['think', 'Думаю… перебираю бумаги и считаю волны.'];
    if (!V.on) return ['sleep', 'Я на паузе. Нажмите «▶ Продолжить» внизу — и снова за работу.'];
    if (fresh.length) return moodOf(fresh) === 'happy' ? ['happy', 'Сделка закрылась в плюс! Пректер был бы доволен.'] : ['sad', 'Сработал стоп. Это часть плана: убытки маленькие, прибыль — большая.'];
    if (pend.length) { const [a, id] = pend[0]; return ['happy', `Есть сигнал: ${id.split('_')[0]} — ${(a.tf || '1d') === '1d' ? 'завтра на открытии покупаю' : 'вход сейчас'} («${a.name}»).`, { id, tf: a.tf || '1d' }]; }
    if (wd === 0 || wd === 6) return ['sleep', 'Выходные — биржа спит, и я тоже.' + (wk ? ' 🧳 Прибыльные сделки уехали на следующую неделю: ' + wk + '.' : '')];
    const pos = robs.flatMap((a) => a.pos.map((p) => [a, p]));
    if (pos.length) {
      const pl = pos.reduce((s, [a, p]) => { const px = a.px[p.id] || p.entry; return s + (p.side < 0 ? p.cost - p.qty * px : p.qty * px - p.cost); }, 0);
      return pl >= 0 ? ['happy', `Держу ${nPos(pos.length)}, в плюсе. Не мешаем прибыли расти.`] : ['idle', `Держу ${nPos(pos.length)}. Пока в минусе, но стопы стоят — я спокоен.`];
    }
    return ['idle', PHRASES[Math.floor(msk / 864e5) % PHRASES.length]];
  }
  // гонка: кто дальше от черты старта — у того больше доход с начала
  function raceCard(V) {
    const L = V.accs.map((a) => { const eq = D.vEquity(a) + (S.vimOn ? a.mm || 0 : 0); return { a, pc: a.dep > 0 ? (eq / a.dep - 1) * 100 : 0 }; });
    const lo = Math.min(0, ...L.map((x) => x.pc)), hi = Math.max(0.5, ...L.map((x) => x.pc)), sx = (v) => 8 + (v - lo) / (hi - lo) * 78, best = Math.max(...L.map((x) => x.pc));
    return `<div class="card"><h3>🏁 Гонка роботов</h3>${L.map(({ a, pc }) => `<div class="race"><span class="lname">${esc(a.name)}</span><div class="track"><span class="lane0" style="left:${sx(0).toFixed(1)}%"></span>
      <span class="runner" data-to="${sx(pc).toFixed(1)}" style="left:${sx(animOn() ? 0 : pc).toFixed(1)}%">${a.manual ? '<span class="me">🙋</span>' : botSvg(a.key, robFresh[a.key] && robFresh[a.key].length ? moodOf(robFresh[a.key]) : pc === best && pc > 0 ? 'happy' : 'idle')}<small>${spc(pc / 100)}</small></span>
      <span class="fin">${pc === best && pc > 0 && L.length > 1 ? '👑' : '🏁'}</span></div></div>`).join('')}
      <div class="small mut">Кто дальше от черты старта — у того больше доход с начала${S.vimOn ? ' (с ВИМ)' : ''}. 👑 — лидер, 🙋 — ваш ручной счёт.</div></div>`;
  }
  function robFeed() {
    let L; try { L = D.logRead(); } catch (e) { return ''; }
    const it = L.app.items.concat(L.bg.items).filter((x) => x.k === 'robot').sort((a, b) => b.t - a.t).slice(0, 30);
    // бумага из строки журнала («имя робота: купил SBER …») — по нажатию её график в таймфрейме робота
    const V = D.vaccGet(), NOT = ['ATR', 'SMA200', 'AO', 'W1', 'CSV', 'JSON'];
    const go = (m) => { const a = V && V.accs.find((z) => m.startsWith(z.name + ':')); if (!a) return '';
      const t = (m.slice(a.name.length + 1).match(/\b[A-Z][A-Z0-9]{1,5}\b/g) || []).find((w) => !NOT.includes(w));
      if (a.crypto) return ` data-ropen="${D.CRYPTO_ID}|1d" role="button"`;
      return t ? ` data-ropen="${t}_TQBR|${a.manual ? '1d' : a.tf || '1d'}" role="button"` : ''; };
    return `<div class="card${foldC('robFeed', true)}" data-fold="robFeed"><h3>📜 Что делали роботы${it.length ? ' (' + it.length + ')' : ''}</h3>${it.length ? it.map((x) => `<div class="feed"${go(x.m)}><time>${fmtT(x.t, true)}</time>${esc(x.m)}</div>`).join('') : '<div class="small">Пока пусто.</div>'}</div>`;
  }
  // 3.2: что видит робот «Биткоин · тренд» на последнем закрытом дне
  function btcInfo(a) {
    const g = a.sig, pc = (x) => Math.round(x * 100) + '%';
    const t = g ? `Закрытие дня ${fmtT(g.t, false)}: ${usd0(g.c)} — <b class="${g.share > 0 ? 'pos' : 'neg'}">${g.share > 0 ? 'выше' : 'ниже'}</b> средней за 100 дней (${usd0(g.sma)}). Волатильность ${pc(g.vol)} в год → ${g.share > 0 ? 'держать <b>' + pc(g.share) + '</b> счёта в биткоине, остальное в долларах' : 'всё в долларах'}.` : 'Ещё не смотрел биткоин — нажмите «⟳ Ход».';
    return `<div class="small" style="margin:4px 0">${t}</div><div class="row" style="margin:4px 0 2px"><button data-ropen="${D.CRYPTO_ID}|1d" style="flex:none">📈 График биткоина</button></div>`;
  }
  // 3.4: панель роботов внизу экрана и обзор «Все»; дневные (основной, агрессивный) — в конце
  const ROB_SHORT = { d_long: 'Основной', d_aggr: 'Агрессив.', h4_week: '4ч неделя', h4_fig: 'Охотник', h4_tri: 'Треуг.', btc_trend: 'Биткоин', manual: 'Мой счёт' };
  const robDaily = (a) => a.key === 'd_long' || a.key === 'd_aggr';
  const robOrder = (V) => V.accs.filter((a) => !robDaily(a)).concat(V.accs.filter(robDaily));
  const robPc = (a) => { const eq = D.vEquity(a) + (S.vimOn ? a.mm || 0 : 0); return a.dep > 0 ? eq / a.dep - 1 : 0; };
  const robIco = (a, V) => (a.manual ? '<span class="me">✋</span>' : botSvg(a.key, robotBusy === 'all' || robotBusy === a.key ? 'think' : !V.on ? 'sleep' : moodOf(robFresh[a.key]) || 'idle'));
  let robMore = false;   // открыт ли список «Ещё»
  // 3.14: «Общий счёт» — отмеченные роботы вместе (их виртуальные счета складываются); проверка 30.10.2026 (research/split.js):
  // дневной основной и «Охотник» мало связаны — пополам ~31%/год при просадке ~3,7% (у каждого 6,8 и 7,2%)
  function comboCard(V) {
    const el = V.accs.filter((a) => !a.manual && !a.crypto); if (el.length < 2) return '';
    if (!Array.isArray(S.combo)) S.combo = ['d_long', 'h4_fig'].filter((k) => el.some((a) => a.key === k));
    const L = el.filter((a) => S.combo.includes(a.key)), vim = (h) => (S.vimOn ? h.mm || 0 : 0);
    const dd = (hs) => { const days = [...new Set(hs.flatMap((h) => h.map((x) => Math.floor((x.t + 3 * 36e5) / 864e5))))].sort((a, b) => a - b); let pk = 0, m = 0;
      for (const d of days) { let e = 0, dp = 0; for (const h of hs) { let z = null; for (const x of h) if (Math.floor((x.t + 3 * 36e5) / 864e5) <= d) z = x; else break; z = z || h[0]; e += z.eq + vim(z); dp += z.dep; }
        const r = dp > 0 ? e / dp : 1; pk = Math.max(pk, r); m = Math.max(m, 1 - r / pk); }
      return { m, days }; };
    let body = '';
    if (L.length) {
      const eq = L.reduce((t, a) => t + D.vEquity(a) + (S.vimOn ? a.mm || 0 : 0), 0), dep = L.reduce((t, a) => t + a.dep, 0), H = L.map((a) => a.hist && a.hist.length ? a.hist : [{ t: V.startAt, eq: a.dep, dep: a.dep }]), all = dd(H);
      const syn = all.days.map((d) => { let e = 0, dp = 0; for (const h of H) { let z = h[0]; for (const x of h) if (Math.floor((x.t + 3 * 36e5) / 864e5) <= d) z = x; else break; e += z.eq + vim(z); dp += z.dep; } return { eq: e, dep: dp }; });
      body = `<div class="row" style="align-items:center;margin:4px 0"><span class="grow">Вложено ${rub0(dep)} · сейчас <b>${rub0(eq)}</b> · <b class="${eq >= dep ? 'pos' : 'neg'}">${spc(dep > 0 ? eq / dep - 1 : 0)}</b></span>${eqSpark(syn)}</div>
        <div class="small">Наибольшая просадка общего счёта: <b>${pc(all.m)}</b>${L.length > 1 ? ' · по отдельности: ' + L.map((a, k) => esc(a.name) + ' ' + pc(dd([H[k]]).m)).join(', ') : ''}.</div>`;
    } else body = '<div class="small">Отметьте хотя бы одного робота.</div>';
    return `<div class="card${foldC('robCombo', false)}" data-fold="robCombo"><h3>🧺 Общий счёт</h3>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:4px">${el.map((a) => `<button data-combo="${a.key}" class="${S.combo.includes(a.key) ? 'on' : ''}" style="flex:none">${S.combo.includes(a.key) ? '✓ ' : ''}${esc(ROB_SHORT[a.key] || a.name)}</button>`).join('')}</div>${body}
      <div class="small mut" style="margin-top:4px">Как если бы ваши деньги поделили между отмеченными роботами (у каждого свой счёт, свои сделки). На истории 2019–2026 дневной основной и «Охотник» почти не связаны: пополам — ~31%/год, а просадка общего счёта ~3,7% против 6,8 и 7,2% у каждого. Основной вместе с агрессивным помогают друг другу мало — они похожи. На реальном счёте так проще всего с двумя брокерскими счетами: на каждом повторять своего робота, капитал робота — как деньги этого счёта.</div></div>`;
  }
  function robTable(V) {
    const row = (a) => { const pc = robPc(a), np = Object.keys(a.pend || {}).length;
      return `<div class="rrow" data-racc="${a.key}" role="button" style="--rc:${rmStyle(a.key).c}">${robIco(a, V)}<span class="grow"><b>${esc(a.name)}</b><small>${a.pos.length ? 'позиций ' + a.pos.length : 'без позиций'}${np ? ' · <span class="sigc">сигнал ' + np + '</span>' : ''} · закрыто ${a.closed.length}</small></span><b class="${pc >= 0 ? 'pos' : 'neg'}">${spc(pc)}</b></div>`; };
    const main = V.accs.filter((a) => !robDaily(a)), day = V.accs.filter(robDaily);
    let h = `<div class="card"><h3>Все роботы</h3>${main.map(row).join('')}<div class="small mut" style="margin-top:4px">Нажмите на робота — откроется всё о нём. Переключаться — панелью внизу.</div></div>`;
    if (day.length) h += `<div class="card${foldC('robDay', true)}" data-fold="robDay"><h3>Дневные роботы (${day.length})</h3>${day.map(row).join('')}</div>`;
    return h;
  }
  function robNav(V) {
    const nav = $('#robNav'); if (!nav) return;
    if (!V) { nav.hidden = true; nav.innerHTML = ''; return; }
    const cur = V.accs.some((a) => a.key === S.robotAcc) ? S.robotAcc : 'all', L = robOrder(V), MAX = 6;
    const vis = L.length + 1 > MAX ? L.slice(0, MAX - 2) : L, rest = L.slice(vis.length);
    const btn = (a) => { const pc = robPc(a), dot = (robFresh[a.key] && robFresh[a.key].length) || Object.keys(a.pend || {}).length;
      return `<button class="rnb${a.key === cur ? ' on' : ''}" data-rnav="${a.key}" style="--rc:${rmStyle(a.key).c}">${dot ? '<i class="rdot"></i>' : ''}${robIco(a, V)}<span>${esc(ROB_SHORT[a.key] || a.name)}</span><small class="${pc >= 0 ? 'pos' : 'neg'}">${spc(pc)}</small></button>`; };
    nav.hidden = false;
    nav.innerHTML = (robMore && rest.length ? `<div class="robmore">${rest.map(btn).join('')}</div>` : '')
      + `<button class="rnb${cur === 'all' ? ' on' : ''}" data-rnav="all" style="--rc:var(--accl)"><span class="me">📋</span><span>Все</span><small class="mut">обзор</small></button>${vis.map(btn).join('')}`
      + (rest.length ? `<button class="rnb${rest.some((a) => a.key === cur) || robMore ? ' on' : ''}" data-rnav="more" style="--rc:var(--mut)"><span class="me">${robMore ? '✕' : '⋯'}</span><span>Ещё</span><small class="mut">${rest.length}</small></button>` : '');
    nav.querySelectorAll('[data-rnav]').forEach((b) => { b.onclick = () => {
      const k = b.dataset.rnav;
      if (k === 'more') { robMore = !robMore; robNav(D.vaccGet()); return; }
      robMore = false; S.robotAcc = k; save(); renderRobot(); $('#robBody').scrollTop = 0;
    }; });
  }
  function renderRobot() {
    const V = D.vaccGet();
    let h = '';
    if (!V) {
      const cap = Math.round((S.acct && S.acct.total) || S.capital || 300000);
      h += `<div class="card"><h3>Виртуальный счёт робота</h3>
        <div class="small">Четыре робота торгуют на ненастоящие деньги, параллельно: <b>основной</b> и <b>агрессивный</b> дневной набор, <b>«4 часа · неделя»</b> (короткие сделки, на выходные — только прибыльные или с целым каналом) и <b>«продажи по треугольнику»</b> (наблюдение: шорт после треугольника на 4-часовых свечах).</div>
        <ul class="small bul"><li>Сами выбирают из топ-50 акций по обороту, покупают по сигналам, ведут стоп и выходят — ровно как бэктест, но с этого дня и вперёд.</li>
        <li>Деньги общие на все бумаги: риск на сделку у каждого робота свой (основной и «4 часа · неделя» — 1,5%, агрессивный и треугольник — 1%; меняется в «⚙ Настройки» на карточке робота), позиция не больше 25% счёта, без плеча; если на сигнал денег нет — пропускают.</li>
        <li>Свободные деньги лежат в фонде ликвидности. Пополнения и выводы вашего реального счёта повторяются сами. Дивиденды начисляются за вычетом налога.</li></ul>
        <div class="small" style="margin-top:6px">Про каждую покупку и продажу придёт уведомление — можно повторять в Т-Инвестициях. Сигнал по дневке приходит вечером после закрытия дня: «завтра на открытии купит…».</div>
        <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><div class="field"><label>Стартовый капитал, ₽</label><input type="number" id="vCap" step="1000" min="1000" value="${cap}"></div>
        <div class="field"><label>Ставка ВИМ для расчёта, % годовых</label><input type="number" id="vRate" step="0.5" min="0" value="${S.cfg.cashYield || 13.5}"></div></div>
        <div class="small">${S.acct ? 'Капитал подставлен со счёта «' + esc(S.account.name) + '».' : 'Подключите счёт (⚙ → Счёт → «Взять с брокерского счёта»), чтобы робот повторял ваши пополнения.'}</div>
        ${cap < 60000 ? '<div class="note">При капитале меньше ~60 000 ₽ роботы будут пропускать большинство сигналов: позиция ограничена 25% счёта, а лот многих акций стоит дороже. Для проверки стратегии можно поставить ту сумму, с которой планируете торговать, — пополнения реального счёта всё равно добавятся.</div>' : ''}
        <div class="small" style="margin-top:6px">Вместе с роботами появится счёт <b>«мой (вручную)»</b>: в нём — ваши настоящие сделки и деньги со счёта Т-Инвестиций, чтобы сравнивать себя с роботами.</div>
        <div class="row" style="margin-top:10px"><button id="vStart">🤖 Запустить роботов</button></div>
        ${S.token ? '' : '<div class="note">Без токена роботы ходят по ценам Мосбиржи (задержка ~15 мин); пополнения и сделки вашего счёта не повторяются.</div>'}</div>`;
      $('#robBody').innerHTML = h; robNav(null);
      const b = $('#vStart'); if (b) b.onclick = () => {
        const cap2 = Math.max(1000, Number($('#vCap').value) || cap), rate = Math.max(0, Number($('#vRate').value) || 0), now = Date.now();
        const mk = (key, name) => ({ key, name, tf: robotTf(key), cfg: robotCfg(key), be: key !== 'h4_tri', cash: cap2, dep: cap2, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: cap2, dep: cap2 }], px: {}, seen: {}, pend: {}, skipped: 0 });
        D.vaccSet({ on: true, startAt: now, mmRate: rate, top: 50, flows: [], lastAccrue: now, realStart: S.acct ? S.acct.total : null, accs: [mk('d_long', 'основной'), mk('d_aggr', 'агрессивный'), mk('h4_week', '4 часа · неделя'), mk('h4_fig', 'Охотник'), mk('h4_tri', 'продажи · треугольник'), Object.assign(mk('manual', 'мой (вручную)'), { manual: true, cfg: {} })] });
        D.log('robot', 'запущены: капитал ' + cap2 + ' ₽, фонд ' + rate + '%');
        ensureBg(); runRobot();
      };
      return;
    }
    // 3.4: внизу панель роботов — «Все» (обзор) или один робот на весь экран
    const rSel = V.accs.find((a) => a.key === S.robotAcc), ra = rSel || V.accs[0];
    if (!rSel) {
      { const [m, t, o] = robPhrase(V); h += `<div class="rsay">${botSvg('', m, true)}<div class="bub"${o ? ` data-ropen="${esc(o.id)}|${o.tf}" role="button"` : ''}>${esc(t)}${o ? '<div class="small mut">Нажмите — откроется график.</div>' : ''}</div></div>`; }
      h += `<div class="small" style="margin-bottom:6px">Старт ${fmtT(V.startAt, true)} · проверено бумаг: ${V.lastN || '—'} · последний ход ${(() => { const t = Math.max(V.lastRun || 0, ...V.accs.map((a) => a.lastRun || 0)); return t ? fmtT(t, true) : 'ещё не было'; })()}${V.on ? '' : ' · <span class="warn">остановлены</span>'}</div>`;
      // доход фонда ВИМ — только по кнопке: результат роботов показываем «чистым», без процентов на свободные деньги
      const vimTot = V.accs.filter((a) => !a.manual && !a.crypto).reduce((s, a) => s + (a.mm || 0), 0);
      h += `<div class="row" style="margin-bottom:8px;align-items:center"><button id="vVim" class="${S.vimOn ? 'on' : ''}">${S.vimOn ? '✓ С учётом ВИМ' : '＋ Рассчитать с ВИМ'}</button><span class="small mut" style="flex:1">${S.vimOn ? 'в капитале и результате — проценты ВИМ ' + String(V.mmRate).replace('.', DEC()) + '% на свободные деньги' : 'ВИМ ' + String(V.mmRate).replace('.', DEC()) + '% на свободные деньги дал бы ≈ +' + rub0(vimTot / Math.max(1, V.accs.filter((a) => !a.manual && !a.crypto).length)) + ' на робота'}</span></div>`;
      h += raceCard(V);
      h += robTable(V);
      h += comboCard(V);
      if (!a0trades(V)) h += `<div class="note" style="margin:0 0 8px">Сделок у роботов пока нет — это нормально. Робот покупает только по <b>свежим</b> сигналам на дневках, появившимся после старта. На истории 2019–2026 таких сигналов в среднем около одного в неделю на робота, бывает и 2–3 недели тишины. Пока денег в бумагах нет, результат равен нулю; сколько дали бы проценты ВИМ на эти деньги — по кнопке «Рассчитать с ВИМ».</div>`;
      if (V.realStart && S.acct) h += `<div class="small" style="margin:-2px 0 8px">Ваш реальный счёт: на старте ${rub0(V.realStart)}, сейчас ${rub0(S.acct.total)}${V.flows.length ? ', пополнения/выводы ' + rub0(V.flows.reduce((s, f) => s + f.amount, 0)) : ''}.</div>`;
      h += robFeed();
      h += `<div class="card"><h3>Управление</h3>
      <div class="row"><button id="vRun" ${robotBusy ? 'disabled' : ''}>${robotBusy ? 'Роботы думают…' : '⟳ Ход всех роботов'}</button><button id="vToggle">${V.on ? '⏸ Остановить' : '▶ Продолжить'}</button></div>
      <div class="small" id="vMsg">${esc(robotMsg) || 'Робот ходит сам: сразу после закрытия свечи своего таймфрейма (4 часа — в 3, 7, 11, 15, 19 и 23 ч МСК; телефон будит его, даже когда спит), а при открытом приложении проверка каждые 5 минут (⚙ → Сигналы). Нажатие на позицию открывает график.'}</div>
      <div class="field" style="margin-top:10px"><label>Пополнить (+) или вывести (−) вручную, ₽ — если деньги не через этот счёт</label><div class="row"><input type="number" id="vFlow" step="1000" style="flex:1"><button id="vFlowOk">Внести</button></div></div>
      ${V.accs.some((a) => a.manual) ? '' : '<div class="row" style="margin-top:6px"><button id="vAddMan">➕ Добавить мой ручной счёт</button></div>'}
      ${V.accs.some((a) => a.key === 'h4_week') ? '' : '<div class="row" style="margin-top:6px"><button id="vAddW">➕ Добавить робота «4 часа · неделя»</button></div><div class="small">Короткие сделки по 4-часовым свечам: в пятницу сделку без прибыли закрывает, прибыльную переносит на следующую неделю в безубытке. Стартовые деньги — как у основного; торгует только по новым сигналам.</div>'}
      ${V.accs.some((a) => a.key === 'h4_fig') ? '' : '<div class="row" style="margin-top:6px"><button id="vAddF">➕ Добавить робота «Охотник»</button></div><div class="small">Новый (3.13): на одном счёте две фигуры — перевёрнутая «голова и плечи» и пробой уровня, 4-часовые свечи. На истории 2018–2026 ~31%/год, просадка ~7%. Стартовые деньги — как у основного; торгует только по новым сигналам.</div>'}
      ${V.accs.some((a) => a.key === 'h4_tri') ? '' : '<div class="row" style="margin-top:6px"><button id="vAddT">➕ Добавить робота «продажи по треугольнику»</button></div><div class="small">Наблюдение (3.0): 4-часовые свечи, только продажи (шорт) после завершённого треугольника. На истории ~13 сделок в год, в среднем +0,5 R, но прибыль дали немногие бумаги — смотрим, как пойдёт вживую. Плата брокера за шорт тут не считается. Стартовые деньги — как у основного.</div>'}
      ${V.accs.some((a) => a.key === 'btc_trend') ? '' : '<div class="row" style="margin-top:6px"><button id="vAddB">➕ Добавить робота «Биткоин · тренд»</button></div><div class="small">Не волны, а тренд (3.2): держит биткоин, пока дневное закрытие выше средней за 100 дней, иначе всё в долларах. Доля биткоина — по волатильности, чтобы просадка была меньше. На истории 2018–2026 ~27%/год, просадка ~25%; за последний год — около нуля. Цены — с открытого сайта Binance, без ключа. Счёт условный, $1 000; робот сам не торгует — присылает сигнал «вход / выход / сменить долю».</div>'}
      ${(() => { const old = V.accs.filter((a) => !a.manual && !a.crypto && JSON.stringify(a.cfg) !== JSON.stringify(robCfgFor(a))); return old.length ? `<div class="note" style="margin-top:8px">Обновились настройки наборов: ${old.map((a) => '«' + esc(a.name) + '»').join(', ')} — ${(() => { const NEW = [['addSma200', 'фильтр «SMA200 растёт»'], ['addAO', 'фильтр AO 5/34'], ['addPyramid', 'доливка на 110% волны 1'], ['addMinRR', 'фильтр «прибыль/риск не меньше 1,5»'], ['wkChan', 'на выходные — и убыточную, пока цел канал'], ['wkNextOpen', 'пятничный выход — по открытию понедельника'], ['topOnly', 'сигнал только от лучшего подсчёта']]; const it = NEW.filter(([k]) => old.some((a) => robotCfg(a.key)[k] && !a.cfg[k])).map(([, t]) => t); for (const a of old) { const r = robCfgFor(a).riskPct; if (r !== a.cfg.riskPct) it.push('риск на сделку у «' + a.name + '» — ' + String(r).replace('.', ',') + '%'); } return it.join(', ') || 'обновлённые параметры'; })()}. Деньги, история и открытые позиции сохранятся; открытые позиции робот доведёт по старым правилам, новые сделки — по новым.</div><div class="row" style="margin-top:6px"><button id="vUpd">⬆ Обновить настройки роботов</button></div>` : ''; })()}
      <div class="row" style="margin-top:8px"><button id="vCsv">⬇ Отчёт CSV</button><button id="vJson">⬇ JSON</button></div>
      <div class="small" id="vExpRes">Все сделки роботов и ваши виртуальные: открытые и закрытые, вход, стоп, цель, выход, причина, ₽, дивиденды, доливки, плюс итоги по каждому счёту. CSV — открыть в таблице; JSON — прислать на разбор.</div>
      <div class="row" style="margin-top:6px"><button id="vReset">${robotArm === 'reset' ? 'Точно стереть? Нажмите ещё раз' : 'Сбросить роботов'}</button></div></div>`;
    } else {
      const a = ra;
      const eq = D.vEquity(a) + (S.vimOn ? a.mm || 0 : 0), pl = eq - a.dep, inPos = a.pos.reduce((s, p) => s + p.qty * (a.px[p.id] || p.entry), 0);
      h += `<div class="card robhd" style="--rc:${rmStyle(a.key).c}"><h3><span class="grow" style="display:flex;align-items:center;gap:6px">${a.manual ? '✋' : botSvg(a.key, robotBusy === 'all' || robotBusy === a.key ? 'think' : !V.on ? 'sleep' : moodOf(robFresh[a.key]) || 'idle')} ${esc(a.name)}${a.pos.some((p) => p.wk) ? ' <span class="wk">🧳</span>' : ''}</span>${eqSpark(a.hist)}</h3>
        <div class="kv"><div><small>Капитал</small><b>${money(a, eq)}</b></div><div><small>Результат</small><b class="${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : '−'}${money(a, Math.abs(pl))}</b></div><div><small>%</small><b class="${pl >= 0 ? 'pos' : 'neg'}">${spc(a.dep > 0 ? pl / a.dep : 0)}</b></div>
        <div><small>В бумагах</small><b>${a.pos.length} · ${Math.round(inPos / (eq || 1) * 100)}%</b></div><div><small>${S.vimOn ? 'Свободно + ВИМ' : 'Свободно'}</small><b>${money(a, a.cash + (S.vimOn ? a.mm || 0 : 0))}</b></div><div><small>Сделок закрыто</small><b>${a.closed.length}</b></div></div>
        <div class="row" style="margin:6px 0 2px;align-items:center"><button data-rrun="${a.key}" ${robotBusy || !V.on ? 'disabled' : ''} style="flex:none">${robotBusy === a.key || robotBusy === 'all' ? '⏳ Думает…' : '⟳ Ход'}</button><span class="small mut" style="flex:1">${a.manual ? 'сверить с вашим счётом: позиции и деньги' : a.crypto ? 'решает раз в сутки, после закрытия дня в 03:00 МСК · последний ход ' + (a.lastRun ? fmtT(a.lastRun, true) : '—') : 'последний ход ' + (a.lastRun || V.lastRun ? fmtT(a.lastRun || V.lastRun, true) : '—') + (a.tf === '4h' ? ' · 4-часовые свечи 50 бумаг грузятся несколько минут' : '')}</span></div>
        ${a.crypto ? btcInfo(a) : ''}
        ${a.crypto ? `<div class="small">Счёт в долларах (условно ${usd0(a.dep)} на старте), свободные доллары — без процентов, комиссия 0,1%. Пополнения рублёвого счёта сюда не идут. Робот сам не торгует — по уведомлению повторяйте на своей бирже.</div></div>` : `<div class="small">${a.manual ? (a.realCap ? 'Капитал — с вашего брокерского счёта (акции + деньги и прочее); результат — с ' + fmtT(a.realCap, false) + ', пополнения и выводы прибылью не считаются. ' + manCosts(a) : 'Капитал подтянется с вашего счёта при следующей сверке. ') : ''}Вложено (${a.manual && a.realCap ? 'на начало + пополнения' : 'старт + пополнения'}): ${rub0(a.dep)} · ВИМ ${S.vimOn ? 'учтён' : 'дал бы'} ≈ ${rub0(a.mm || 0)}${a.manual ? '' : ' · пропущено сигналов без денег: ' + a.skipped}</div></div>`}`;

      // подробности выбранного робота
      const pend = Object.entries(ra.pend || {});
      // дневки — «завтра на открытии»; 4ч и мельче — следующая свеча открывается сразу после сигнальной,
      // а робот видит только закрытые свечи и запишет покупку, когда закроется и она
      const rtf = ra.tf || '1d', rP = (D.TF[rtf] || D.TF['1d']).ms, hm = (t) => fmtT(t, true).slice(9);
      const pendRow = (id, p) => {
        const pu = D.pendUntil(p, rtf), cdl = pu ? `<div>${cdSpan(pu, rtf === '1d' ? 'до конца торгов' : 'до закрытия свечи входа')}</div>` : '';
        const lv = `стоп ${pr(p.stop)}${p.target ? ', цель ' + pr(p.target) : ''}`;
        if (rtf === '1d') return cdl + `<b>${esc(id.split('_')[0])}</b> — купит ~${p.qty} шт на открытии (~${pr(p.entry)}), ${lv}<div class="small">сигнал ${fmtT(p.sigT, false)}</div>`;
        const t1 = p.sigT + rP, now = Date.now();
        return cdl + `<b>${esc(id.split('_')[0])}</b> — вход по открытию свечи после сигнальной (~${pr(p.entry)}), ~${p.qty} шт, ${lv}.
          <div class="small">Сигнал по свече ${fmtT(p.sigT, true)}–${hm(t1)}. ${now >= t1 ? '<b>Следующая свеча уже идёт — повторить сделку можно сейчас.</b>' : 'Следующая свеча откроется в ' + hm(t1) + '.'} Робот видит только закрытые свечи: покупку по цене открытия он запишет, когда закроется и эта свеча (около ${hm(t1 + rP)} — робот ходит сразу после закрытия свечи${S.token ? '' : ', без токена — через ~15 мин'}).</div>`;
      };
      if (pend.length) h += `<div class="card pendc"><h3>⏳ ${rtf === '1d' ? 'Ждут открытия' : 'Сигнал — вход сейчас'} · ${esc(ra.name)}</h3>${pend.map(([id, p]) => `<div class="jrow" data-rgo="${esc(id)}" role="button">${pendRow(id, p)}</div>`).join('')}<div class="small mut">Нажмите на бумагу — откроется её график.</div></div>`;
      h += `<div class="card"><h3>📂 Позиции · ${esc(ra.name)} (${ra.pos.length})</h3>${ra.pos.length ? ra.pos.slice().sort((x, y) => y.entryT - x.entryT).map((p) => {
        const px = ra.px[p.id] || p.entry, pl = p.side < 0 ? p.cost - p.qty * px * 1.0005 : p.qty * px * (1 - 0.0005) - p.cost + (p.divs || 0), days = Math.floor((Date.now() - p.entryT) / 86400000);
        if (p.crypto) { const v = p.qty * px * (1 - 0.001), q = v - p.cost, eqA = D.vEquity(ra);
          return `<div class="jrow ${q >= 0 ? 'jp' : 'jn'}" data-rgo="${esc(p.id)}"><div class="row"><span><b>BTC</b> ${p.qty.toFixed(5).replace('.', DEC())} · ${Math.round(p.qty * px / (eqA || 1) * 100)}% счёта</span><span class="${q >= 0 ? 'pos' : 'neg'}">${q >= 0 ? '+' : '−'}${usd0(Math.abs(q))} · ${spc(px / (p.cost / p.qty) - 1)}</span></div>
          <div class="small">${fmtT(p.entryT, false)} по ${usd0(p.entry)}${Math.abs(p.entry / (p.cost / p.qty) - 1) > 0.005 ? ' (средняя ' + usd0(p.cost / p.qty) + ')' : ''} · сейчас ${usd0(px)} · ${days} дн. · стопа нет: выход, когда дневное закрытие ниже средней-100</div></div>`; }
        if (ra.manual) return `<div class="jrow ${pl >= 0 ? 'jp' : 'jn'}" data-rgo="${esc(p.id)}"><div class="row"><span><b>${esc(p.ticker)}</b> ${p.side < 0 ? '▼ шорт ' : ''}${p.qty} шт${p.src ? ' <span class="small mut">· с вашего счёта</span>' : ''}</span><span class="${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : '−'}${rub0(Math.abs(pl))} · ${spc((p.side < 0 ? -1 : 1) * (px / p.entry - 1))}</span></div>
          <div class="small">${fmtT(p.entryT, false)} по ${pr(p.entry)} · сейчас ${pr(px)} · ${days} дн.${p.divs ? ' · дивиденды +' + rub0(p.divs) : ''}</div></div>`;
        return `<div class="jrow ${pl >= 0 ? 'jp' : 'jn'}" data-rgo="${esc(p.id)}"><div class="row"><span><b>${esc(p.ticker)}</b> ${p.side < 0 ? '<span class="shrt">▼ шорт</span> ' : ''}${p.qty} шт${p.addOf ? ' <span class="small" style="color:#c9a6f5">доливка</span>' : ''}</span><span class="${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : '−'}${rub0(Math.abs(pl))} · ${spc((p.side < 0 ? -1 : 1) * (px / p.entry - 1))}</span></div>
          <div class="small">${fmtT(p.entryT, false)} по ${pr(p.entry)} · сейчас ${pr(px)} · стоп ${pr(p.stop)}${p.runner ? ' (цель пройдена, ведём)' : p.target ? ' · цель ' + pr(p.target) : ''} · ${days} дн.${p.divs ? ' · дивиденды +' + rub0(p.divs) : ''}${p.wk ? ' · <span class="wk">🧳</span> перенесена на следующую неделю (стоп в безубытке)' : ''}</div></div>`; }).join('') : (ra.manual ? '<div class="small">Нет. Здесь появятся акции, когда они будут на вашем счёте.</div>' : ra.crypto ? '<div class="small">Нет — все деньги в долларах. Робот купит, когда дневное закрытие биткоина будет выше средней за 100 дней.</div>' : '<div class="small">Нет. Робот ждёт сигналов.</div>')}</div>`;
      const cl = ra.closed.slice(-40).reverse();
      if (cl.length) { const w = ra.closed.filter((c) => c.pl > 0).length, s1 = ra.closed.reduce((s, c) => s + c.pl, 0);
        h += `<div class="card"><h3>✅ Закрытые · ${esc(ra.name)} (${ra.closed.length}, прибыльных ${Math.round(w / ra.closed.length * 100)}%, итого ${s1 >= 0 ? '+' : '−'}${money(ra, Math.abs(s1))})</h3>${cl.map((c) => `<div class="jrow ${Math.abs(c.pl) < 1 ? 'jz' : c.pl > 0 ? 'jp jc' : 'jn jc'}" data-rgo="${esc(c.id)}"><div class="row"><span><b>${esc(c.ticker)}</b> ${c.side < 0 ? '<span class="shrt">▼ шорт</span> ' : ''}${c.crypto ? c.qty.toFixed(5).replace('.', DEC()) : c.qty + ' шт'} · ${esc(c.why)}</span><span class="${c.pl >= 0 ? 'pos' : 'neg'}">${c.pl >= 0 ? '+' : '−'}${money(ra, Math.abs(c.pl))}</span></div><div class="small">${fmtT(c.entryT, false)} по ${c.crypto ? usd0(c.entry) : pr(c.entry)} → ${fmtT(c.exitT, false)} по ${c.crypto ? usd0(c.exit) : pr(c.exit)}</div></div>`).join('')}</div>`; }
      h += `<div class="card${foldC('robSet', true)}" data-fold="robSet"><h3>⚙ Настройки · ${esc(a.name)}</h3>
        ${a.manual || a.crypto ? '' : `<div class="row" style="margin:2px 0 6px;align-items:center"><button data-rbe="${a.key}" class="${a.be ? 'on' : ''}" style="flex:none">🛡 Безубыток 3×ATR: ${a.be ? 'вкл' : 'выкл'}</button><span class="small mut" style="flex:1">${(a.be ? 'новые сделки: стоп на вход, когда цена ушла на 3×ATR' : 'стоп как в наборе') + (a.pos.some((p) => !!p.be !== !!a.be) ? ' · открытые до переключения ведутся как были' : '')}</span></div>${(a.tf || '1d') === '4h' ? `<div class="row" style="margin:2px 0 6px;align-items:center"><button data-rstall="${a.key}" class="${a.stall ? 'on' : ''}" style="flex:none">⏳ Сделка стоит: ${a.stall ? 'вкл' : 'выкл'}</button><span class="small mut" style="flex:1">${(a.stall ? 'если 12 свечей (2–3 дня) после входа закрытие ни разу не выше входа — стоп на полпути к входу (риск вдвое меньше)' : 'выкл. — стоп как в наборе') + (a.pos.some((p) => !!p.stall !== !!a.stall) ? ' · открытые до переключения ведутся как были' : '')}. На истории 2018–2026: доход тот же, просадка ~7% вместо ~9% («неделя») и ~6,8% вместо 7,2% («Охотник»).</span></div>` : ''}${riskBox(a)}`}
        <div class="row rmst" style="margin:4px 0 2px;align-items:center;gap:4px" data-stop="1"><span class="small mut" style="flex:none">На графике:</span>${RM_SHAPES.map(([k, ic]) => `<button class="tg ${rmStyle(a.key).sh === k ? 'on' : ''}" data-rms="${a.key}|${k}" style="flex:none;padding:4px 8px">${ic}</button>`).join('')}<span style="width:6px"></span>${RM_COLORS.map((cl) => `<button class="tg" data-rmc="${a.key}|${cl}" style="flex:none;width:22px;height:22px;padding:0;border-radius:50%;background:${cl};border:2px solid ${rmStyle(a.key).c === cl ? '#fff' : 'transparent'}"></button>`).join('')}</div></div>`;
    }
    $('#robBody').innerHTML = h; robNav(V);
    $('#robBody').querySelectorAll('[data-rrun]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); runRobot(b.dataset.rrun); }; });
    requestAnimationFrame(() => requestAnimationFrame(() => $('#robBody').querySelectorAll('.runner').forEach((r) => { r.style.left = r.dataset.to + '%'; })));
    $('#robBody').querySelectorAll('[data-combo]').forEach((b) => { b.onclick = () => { const k = b.dataset.combo; S.combo = S.combo.includes(k) ? S.combo.filter((x) => x !== k) : S.combo.concat(k); save(); renderRobot(); }; });
    $('#robBody').querySelectorAll('[data-racc]').forEach((c) => { c.onclick = () => { S.robotAcc = c.dataset.racc; robMore = false; save(); renderRobot(); $('#robBody').scrollTop = 0; }; });
    $('#robBody').querySelectorAll('[data-rgo]').forEach((r) => { r.onclick = () => { const id = r.dataset.rgo; if (D.isCrypto(id)) { goChart({ id, tf: '1d' }); return; } closeSheet('robots'); const rtf = ra.tf || '1d'; if (S.inst.id !== id || S.tf !== rtf) { S.inst = { id, ticker: id.split('_')[0], name: id.split('_')[0], classCode: 'TQBR' }; S.tf = rtf; save(); sel = -1; an = null; view.init = false; renderHead(); load(false); } }; });
    $('#robBody').querySelectorAll('[data-ropen]').forEach((r) => { r.onclick = (e) => { e.stopPropagation(); const [id, tf] = r.dataset.ropen.split('|'); goChart({ id, ticker: id.split('_')[0], tf }); }; });
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('#vRun', () => runRobot());
    { const vb = $('#vVim'); if (vb) vb.onclick = () => { S.vimOn = !S.vimOn; save(); renderRobot(); }; }
    $('#robBody').querySelectorAll('[data-rstall]').forEach((b) => { b.onclick = (e) => {
      e.stopPropagation(); if (robWait()) return; const W = D.vaccGet(), a = W.accs.find((x) => x.key === b.dataset.rstall); if (!a) return;
      a.stall = !a.stall; D.vaccSet(W); D.log('robot', a.name + ': «сделка стоит» ' + (a.stall ? 'включено' : 'выключено') + ' для новых сделок');
      robotMsg = a.name + ': «сделка стоит» ' + (a.stall ? 'включено — если 12 свечей после входа закрытие ни разу не выше входа, стоп переедет на полпути к входу.' : 'выключено.') + (a.pos.length ? ' Открытые позиции ведутся так, как были открыты.' : ''); renderRobot();
    }; });
    $('#robBody').querySelectorAll('[data-rbe]').forEach((b) => { b.onclick = (e) => {
      e.stopPropagation(); if (robWait()) return; const W = D.vaccGet(), a = W.accs.find((x) => x.key === b.dataset.rbe); if (!a) return;
      a.be = !a.be; D.vaccSet(W); D.log('robot', a.name + ': безубыток 3×ATR ' + (a.be ? 'включён' : 'выключен') + (a.manual ? '' : ' для новых сделок'));
      robotMsg = a.name + ': безубыток ' + (a.be ? 'включён — ' + (a.manual ? 'ваши позиции' : 'новые сделки') + ' переводятся в безубыток, когда цена уйдёт на 3×ATR от входа.' : 'выключен.') + (!a.manual && a.pos.length ? ' Открытые позиции ведутся так, как были открыты.' : ''); renderRobot();
    }; });
    $('#robBody').querySelectorAll('[data-rrisk]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const a = V.accs.find((x) => x.key === b.dataset.rrisk), v = Math.round(Math.max(0.1, Math.min(5, Number($('#rRisk').value) || 0)) * 10) / 10; if (!a || !v || v === (a.cfg.riskPct || 0)) { riskArm = null; renderRobot(); return; } riskArm = { key: a.key, v }; renderRobot(); }; });
    $('#robBody').querySelectorAll('[data-rrrec]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); riskArm = { key: b.dataset.rrrec, v: robotCfg(b.dataset.rrrec).riskPct }; renderRobot(); }; });
    $('#robBody').querySelectorAll('[data-rrno]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); riskArm = null; renderRobot(); }; });
    $('#robBody').querySelectorAll('[data-rryes]').forEach((b) => { b.onclick = (e) => {
      e.stopPropagation(); if (robWait() || !riskArm) return; const W = D.vaccGet(), a = W.accs.find((x) => x.key === b.dataset.rryes); if (!a) return;
      const v = riskArm.v, old = a.cfg.riskPct, rec = robotCfg(a.key).riskPct;
      if (v === rec) delete a.riskOwn; else a.riskOwn = v;
      a.cfg = Object.assign({}, a.cfg, { riskPct: v }); D.vaccSet(W); riskArm = null;
      D.log('robot', a.name + ': риск на сделку ' + old + ' → ' + v + '%' + (v === rec ? ' (рекомендуемый)' : ' (свой)') + (a.pos.length ? ', открытые позиции — как были' : ''), { kind: 'risk', key: a.key, from: old, to: v });
      robotMsg = a.name + ': риск на сделку теперь ' + String(v).replace('.', DEC()) + '% — для новых сделок.'; renderRobot();
    }; });
    $('#robBody').querySelectorAll('[data-rms],[data-rmc]').forEach((b) => { b.onclick = (e) => {
      e.stopPropagation(); const [key, v] = (b.dataset.rms || b.dataset.rmc).split('|'); S.rmStyle = Object.assign({}, S.rmStyle); S.rmStyle[key] = Object.assign({}, rmStyle(key), b.dataset.rms ? { sh: v } : { c: v }); save(); robCache.at = 0; renderRobot(); draw();
    }; });
    on('#vCsv', () => robotExport('csv')); on('#vJson', () => robotExport('json'));
    const up = $('#vUpd'); if (up) up.onclick = () => {
      if (robWait()) return;
      const W = D.vaccGet(); let n = 0;
      for (const a of W.accs) {
        if (a.manual || a.crypto) continue;
        const nc = robCfgFor(a), oc = a.cfg; if (JSON.stringify(oc) === JSON.stringify(nc)) continue;
        if (a.pos.length) { a.cfgPrev = a.cfgPrev || oc; a.pos.forEach((p) => { p.legacy = true; }); }
        a.cfg = nc; n++;
        // 3.9: безубыток 🛡 здесь больше не включается сам — как вы его поставили кнопкой, так и остаётся
        D.log('robot', a.name + ': настройки обновлены (' + [nc.addSma200 && !oc.addSma200 && 'SMA200', nc.addAO && !oc.addAO && 'фильтр AO', nc.addPyramid && !oc.addPyramid && 'доливка 110% W1', nc.addMinRR && !oc.addMinRR && 'П/Р ≥ ' + nc.minRR, nc.wkChan && !oc.wkChan && 'неделя: канал', nc.wkNextOpen && !oc.wkNextOpen && 'выход по открытию пн', nc.topOnly && !oc.topOnly && 'только лучший подсчёт', nc.riskPct !== oc.riskPct && 'риск ' + oc.riskPct + ' → ' + nc.riskPct + '%'].filter(Boolean).join(', ') || 'параметры набора' + ')' + (a.pos.length ? ', ' + a.pos.length + ' открытых позиций ведём по старым' : ''));
      }
      D.vaccSet(W); robotMsg = n ? 'Настройки обновлены у ' + n + ' робота(ов). Новые сделки — по новым правилам.' : ''; renderRobot();
    };
    const am = $('#vAddMan'); if (am) am.onclick = () => { if (robWait()) return; const W = D.vaccGet(), b0 = W.accs[0]; W.accs.push({ key: 'manual', name: 'мой (вручную)', manual: true, cfg: {}, cash: b0.dep, dep: b0.dep, mm: 0, pos: [], closed: [], hist: [{ t: Date.now(), eq: b0.dep, dep: b0.dep }], px: {}, seen: {}, pend: {}, skipped: 0 }); D.vaccSet(W); S.robotAcc = 'manual'; save(); renderRobot(); };
    const addRob = (key, name, tf, be, msg) => { if (robWait()) return; const W = D.vaccGet(), b0 = W.accs[0], now = Date.now(); W.accs.splice(W.accs.findIndex((a) => a.manual) < 0 ? W.accs.length : W.accs.findIndex((a) => a.manual), 0, { key, name, tf, cfg: robotCfg(key), be, startAt: now, cash: b0.dep, dep: b0.dep, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: b0.dep, dep: b0.dep }], px: {}, seen: {}, pend: {}, skipped: 0 }); D.vaccSet(W); D.log('robot', 'добавлен робот «' + name + '»'); S.robotAcc = key; save(); robotMsg = msg; renderRobot(); runRobot(key); };
    const ab = $('#vAddB'); if (ab) ab.onclick = () => { if (robWait()) return; const W = D.vaccGet(), now = Date.now(), cap = 1000; W.accs.splice(W.accs.findIndex((a) => a.manual) < 0 ? W.accs.length : W.accs.findIndex((a) => a.manual), 0, { key: 'btc_trend', name: 'Биткоин · тренд', crypto: true, tf: '1d', cfg: {}, be: false, startAt: now, cash: cap, dep: cap, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: cap, dep: cap }], px: {}, seen: {}, pend: {}, skipped: 0 }); D.vaccSet(W); D.log('robot', 'добавлен робот «Биткоин · тренд»'); S.robotAcc = 'btc_trend'; save(); robotMsg = 'Робот «Биткоин · тренд» добавлен — сейчас посмотрит последний закрытый день биткоина.'; renderRobot(); runRobot('btc_trend'); };
    const af = $('#vAddF'); if (af) af.onclick = () => addRob('h4_fig', 'Охотник', '4h', true, 'Робот «Охотник» добавлен — первый ход загрузит 4-часовые свечи 50 бумаг (может занять несколько минут).');
    const at = $('#vAddT'); if (at) at.onclick = () => addRob('h4_tri', 'продажи · треугольник', '4h', false, 'Робот «продажи по треугольнику» добавлен — первый ход загрузит 4-часовые свечи 50 бумаг (может занять несколько минут).');
    const aw = $('#vAddW'); if (aw) aw.onclick = () => { if (robWait()) return; const W = D.vaccGet(), b0 = W.accs[0], now = Date.now(); W.accs.splice(W.accs.findIndex((a) => a.manual) < 0 ? W.accs.length : W.accs.findIndex((a) => a.manual), 0, { key: 'h4_week', name: '4 часа · неделя', tf: '4h', cfg: robotCfg('h4_week'), be: true, startAt: now, cash: b0.dep, dep: b0.dep, mm: 0, pos: [], closed: [], hist: [{ t: now, eq: b0.dep, dep: b0.dep }], px: {}, seen: {}, pend: {}, skipped: 0 }); D.vaccSet(W); D.log('robot', 'добавлен робот «4 часа · неделя»'); S.robotAcc = 'h4_week'; save(); robotMsg = 'Робот «4 часа · неделя» добавлен — первый ход загрузит 4-часовые свечи 50 бумаг (может занять несколько минут).'; renderRobot(); runRobot('h4_week'); };
    on('#vToggle', () => { if (robWait()) return; const W = D.vaccGet(); W.on = !W.on; D.vaccSet(W); D.log('robot', W.on ? 'продолжены' : 'остановлены'); applySchedule(); renderRobot(); });
    on('#vFlowOk', () => { const v = Number($('#vFlow').value); if (!v || robWait()) return; const W = D.vaccGet(); W.flows.push({ id: 'm' + Date.now(), t: Date.now(), amount: v, manual: true }); for (const a of W.accs) if (!a.crypto) { a.cash += v; a.dep += v; } D.vaccSet(W); D.log('robot', 'вручную ' + (v > 0 ? 'пополнено ' : 'выведено ') + Math.abs(v) + ' ₽'); renderRobot(); });
    on('#vReset', () => { if (robWait()) return; if (robotArm !== 'reset') { robotArm = 'reset'; renderRobot(); setTimeout(() => { robotArm = ''; }, 5000); return; } robotArm = ''; D.files.set('vacc.json', null); D.log('robot', 'сброшены'); applySchedule(); renderRobot(); });
  }
  // отчёт по роботам: все счета, позиции и закрытые сделки
  function robotExport(kind) {
    const V = D.vaccGet(); if (!V) return;
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0'), stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
    const T = (t) => (t ? fmtT(t, true) : '');
    let name, mime, txt;
    if (kind === 'csv') {
      const num = (x) => (x == null || x === '' ? '' : String(typeof x === 'number' ? +x.toFixed(4) : x).replace('.', ','));
      const rows = [['Роботы', 'старт ' + T(V.startAt), 'последний ход ' + T(V.lastRun), 'ставка ВИМ для расчёта ' + num(V.mmRate) + '%'], [],
        ['Счёт', 'Безубыток', 'Вложено ₽', 'Капитал ₽ (без ВИМ)', 'Результат ₽', 'Результат %', 'ВИМ дал бы ₽', 'Открыто позиций', 'Закрыто сделок', 'Прибыльных %', 'Пропущено сигналов без денег']];
      for (const a of V.accs) { const eq = D.vEquity(a), w = a.closed.filter((c) => c.pl > 0).length;
        rows.push([a.name, a.manual ? '' : a.be ? '3×ATR' : 'нет', num(Math.round(a.dep)), num(Math.round(eq)), num(Math.round(eq - a.dep)), num(a.dep > 0 ? +((eq / a.dep - 1) * 100).toFixed(2) : 0), num(Math.round(a.mm || 0)), a.pos.length, a.closed.length, a.closed.length ? Math.round(w / a.closed.length * 100) : '', a.manual ? '' : a.skipped || 0]); }
      rows.push([], ['Счёт', 'Бумага', 'Статус', 'Сторона', 'Кол-во', 'Вход дата', 'Вход цена', 'Стоп', 'Цель', 'Выход дата', 'Выход цена', 'Причина', 'Результат ₽', 'Дивиденды ₽', 'Сетап', 'Доливка']);
      for (const a of V.accs) {
        for (const p of a.pos) { const px = a.px[p.id] || p.entry, pl = p.side < 0 ? p.cost - p.qty * px * 1.0005 : p.qty * px * (1 - 0.0005) - p.cost + (p.divs || 0);
          rows.push([a.name, p.ticker, 'открыта', p.side < 0 ? 'продажа' : 'покупка', p.qty, T(p.entryT), num(p.entry), num(p.stop), num(p.target), '', num(px), 'сейчас', num(Math.round(pl)), num(Math.round(p.divs || 0)), p.setup != null ? E.SETUP_NAME[p.setup] || '' : '', p.addOf ? 'да' : '']); }
        for (const c of a.closed) rows.push([a.name, c.ticker, 'закрыта', c.side < 0 ? 'продажа' : c.side > 0 ? 'покупка' : '', c.qty, T(c.entryT), num(c.entry), '', '', T(c.exitT), num(c.exit), c.why, num(Math.round(c.pl)), num(Math.round(c.divs || 0)), c.setup != null ? E.SETUP_NAME[c.setup] || '' : '', '']);
      }
      txt = '\ufeff' + rows.map((r) => r.map((c) => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
      name = 'ew-robots-' + stamp + '.csv'; mime = 'text/csv';
    } else {
      const clean = (a) => ({ name: a.name, key: a.key, manual: !!a.manual, breakeven: a.manual ? null : a.be ? '3×ATR' : 'нет', stall: !!a.stall, dep: a.dep, equity: D.vEquity(a), vim: a.mm || 0, skipped: a.skipped || 0,
        positions: a.pos.map((p) => Object.assign({}, p, { entryT: T(p.entryT), price: a.px[p.id] || null })), closed: a.closed.map((c) => Object.assign({}, c, { entryT: T(c.entryT), exitT: T(c.exitT) })), equityHistory: (a.hist || []).map((h) => ({ t: T(h.t), eq: Math.round(h.eq), dep: Math.round(h.dep), vim: Math.round(h.mm || 0) })), cfg: a.cfg });
      txt = JSON.stringify({ kind: 'ew-robots', app: 'Волны Эллиотта ' + APP_VER, exportedAt: d.toISOString(), startAt: T(V.startAt), lastRun: T(V.lastRun), vimRate: V.mmRate, accounts: V.accs.map(clean) }, null, 1);
      name = 'ew-robots-' + stamp + '.json'; mime = 'application/json';
    }
    const res = $('#vExpRes'), say = (h) => { if (res) res.innerHTML = h; };
    if (A && A.saveDownload) { const r = A.saveDownload(name, mime, txt).split('|'); say(r[0] === 'ok' ? 'Сохранено: ' + esc(r[1]) : '<span class="neg">' + esc(r[1]) + '</span>'); if (r[0] === 'ok' && A.shareLast) A.shareLast(mime); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); say('Сохранено: ' + esc(name)); }
  }
  // сделки роботов по открытой бумаге — для графика (файл читаем не чаще раза в 5 с)
  // вид отметок сделок на графике: фигура и цвет — свои у каждого счёта
  const RM_SHAPES = [['tri', '▲'], ['dia', '◆'], ['dot', '●'], ['sq', '■'], ['star', '★']];
  const RM_COLORS = ['#c08cff', '#f0a23a', '#4fc3f7', '#3fbf7f', '#ef5b5b', '#f5d742', '#ffffff'];
  const RM_DEF = { d_long: { sh: 'tri', c: '#c08cff' }, d_aggr: { sh: 'dia', c: '#f0a23a' }, h4_week: { sh: 'sq', c: '#3fbf7f' }, h4_tri: { sh: 'tri', c: '#ef5b5b' }, h4_fig: { sh: 'hex', c: '#26c6da' }, btc_trend: { sh: 'star', c: '#f5d742' }, manual: { sh: 'dot', c: '#4fc3f7' }, me: { sh: 'dot', c: '#5b9cff' } };
  const rmStyle = (key) => Object.assign({}, RM_DEF[key] || RM_DEF.d_long, (S.rmStyle || {})[key] || {});
  function rmShape(sh, x, y, d, r) {   // фигура с вершиной у цены входа (d — сторона: +1 покупка снизу, −1 продажа сверху)
    const cy = y + d * (r + 2);
    ctx.beginPath();
    if (sh === 'tri') { ctx.moveTo(x, y + d * 2); ctx.lineTo(x - r, y + d * (2 * r + 2)); ctx.lineTo(x + r, y + d * (2 * r + 2)); }
    else if (sh === 'dia') { ctx.moveTo(x, cy - r); ctx.lineTo(x + r, cy); ctx.lineTo(x, cy + r); ctx.lineTo(x - r, cy); }
    else if (sh === 'sq') { ctx.rect(x - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); }
    else if (sh === 'hex') { for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = x + r * Math.cos(a), py = cy + r * Math.sin(a); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } }
    else if (sh === 'star') { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r * 1.05; const px = x + rr * Math.cos(a), py = cy + rr * Math.sin(a); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } }
    else ctx.arc(x, cy, r * 0.85, 0, Math.PI * 2);
    ctx.closePath(); ctx.fill();
  }
  let robCache = { at: 0, id: '', list: [] };
  function robotMarks() {
    const now = Date.now(); if (now - robCache.at < 5000 && robCache.id === S.inst.id) return robCache.list;
    const out = []; let V = null; try { V = D.vaccGet(); } catch (e) { V = null; }
    if (V && V.accs) for (const a of V.accs) {
      const lt = a.manual ? 'Я' : a.key === 'd_aggr' ? 'А' : a.key === 'h4_week' ? 'Н' : a.key === 'h4_tri' ? 'Т' : a.key === 'h4_fig' ? 'Ф' : a.key === 'btc_trend' ? 'Б' : 'О', key = a.manual ? 'manual' : a.key;
      for (const p of a.pos) if (p.id === S.inst.id) out.push({ lt, key, side: p.side || 1, t0: p.markT || p.entryT, e: p.mark || p.entry, open: true, stop: p.stop, be: !!p.stop && (p.side || 1) * (p.stop - p.entry) >= 0 });   // 3.9: «БУ» — когда стоп не хуже входа; позиция со счёта — на свече и по цене настоящей покупки
      for (const c of a.closed) if (c.id === S.inst.id) out.push({ lt, key, side: c.side || 1, t0: c.entryT, e: c.entry, t1: c.exitT, x: c.exit, pl: c.pl });
    }
    // одинаковые сделки разных роботов (оба купили в один момент) — одной отметкой «ОА»
    const m = new Map(); for (const x of out) { const k = [x.t0, x.e, x.t1 || '', x.open ? 1 : 0].join('|'); const y = m.get(k); if (y) { if (!y.lt.includes(x.lt)) y.lt += x.lt; } else m.set(k, Object.assign({}, x)); }
    const list = Array.from(m.values());
    robCache = { at: now, id: S.inst.id, list }; return list;
  }
  const a0trades = (V) => V.accs.some((a) => !a.manual && (a.pos.length || a.closed.length || Object.keys(a.pend || {}).length));
  // 3.7: пока идёт ход робота (по расписанию, в фоне), счета роботов не трогаем — ход в конце записал бы поверх старые данные
  function robWait() { if (!D.robBusy()) return false; alertMsg('Сейчас идёт ход робота — подождите минуту и нажмите ещё раз.'); return true; }
  async function runRobot(only) {   // only — ключ одного робота (кнопка «⟳ Ход» на его карточке)
    if (robotBusy || robWait()) return;
    const V0 = D.vaccGet(), nm = only && V0 ? (V0.accs.find((a) => a.key === only) || {}).name : '';
    robotBusy = only || 'all'; robotMsg = nm ? '«' + nm + '» проверяет бумаги…' : 'роботы проверяют бумаги…'; if (!$('#robots').hidden) renderRobot(); renderRobIcon();
    try {
      const ev = await D.robotStep((m) => { robotMsg = m; const el = $('#vMsg'); if (el) el.textContent = m; }, true, only);
      robotMsg = 'Готово: ' + (ev.length ? 'действий ' + ev.length : 'новых действий нет') + ' · ' + fmtT(Date.now(), true);
      if (S.notify.robot !== false) sendNotes(ev, 700);
    } catch (e) { robotMsg = 'Ошибка: ' + e.message; D.log('error', 'робот: ' + e.message); }
    robotBusy = false; D.logFlush();
    if (!$('#robots').hidden) { const V = D.vaccGet(); if (V) robTakeNews(V); renderRobot(); }
    renderRobIcon();
  }

  // все сделки со счёта за год — по всем бумагам
  async function importAllOps() {
    const res = $('#jImpRes'), say = (t) => { if (res) res.innerHTML = t; };
    if (!S.token || !S.account) return;
    try {
      say('запрашиваю операции у брокера…');
      const ops = await D.getOperations(S.token, S.account.id, '', Date.now() - 3 * 365 * 86400000);
      const byUid = {};
      for (const o of ops) if (o.uid) (byUid[o.uid] = byUid[o.uid] || []).push(o);
      const uids = Object.keys(byUid); let k = 0, before = jList().length;
      for (const uid of uids) {
        k++; say(`бумага ${k} из ${uids.length}…`);
        const info = await D.instByUid(S.token, uid);
        if (info.type && !/share|etf/.test(info.type)) continue;   // облигации и фонды денежного рынка — пропускаем
        const inst = { id: info.ticker + '_' + (info.classCode || 'TQBR'), ticker: info.ticker, name: info.name, classCode: info.classCode || 'TQBR' };
        let list = byUid[uid]; const fb = list.findIndex((o) => o.side > 0);
        if (!S.cfg.shortOnly && S.cfg.longOnly !== false && fb > 0) list = list.slice(fb);   // продажи бумаг, купленных раньше окна — не шорт
        opsCache[inst.id] = list;
        syncJournal(inst, list, info.lot || 1);
      }
      const added = jList().length - before;
      S.lastImport = Date.now(); S.lastImportMsg = `${ops.length} операций по ${uids.length} бумагам, новых записей ${added}`; save();
      renderJournal(); refreshLive();
      if (an) { renderPanel(); draw(); }
    } catch (e) { say('<span class="neg">Ошибка: ' + esc(e.message) + '</span>'); }
  }

  $('#jrnBtn').onclick = () => { openJournal(null); refreshLive(); };
  $('#robBtn').onclick = openRobots;
  applyAnim(); renderRobIcon();
  $('#jrnAdd').onclick = () => openJournal({ mode: 'open' });

  // ---------- брокерский счёт ----------
  function acctText() {
    const m = S.acct;
    if (!m || !S.account) return 'Подставлю стоимость портфеля как капитал и покажу свободные деньги. Обновляется при запуске приложения.';
    const f0 = (x) => Math.round(x).toLocaleString('ru-RU');
    const idle = m.free != null && m.total > 0 && m.free / m.total > 0.15 ? `<br><span class="mut">Свободно ${Math.round(m.free / m.total * 100)}% счёта. Пока нет сигналов, эти деньги можно держать в фонде денежного рынка — по истории это добавляет больше, чем любая настройка стратегии.</span>` : '';
    return `${esc(S.account.name)}: портфель ${f0(m.total)} ₽${m.free != null ? ', свободно ' + f0(m.free) + ' ₽' : ''} · обновлено ${fmtT(m.at, true)}${idle}`;
  }
  async function refreshAccount(manual) {
    if (!S.token || demo && !manual) return;
    const res = $('#acctRes');
    try {
      if (res) res.textContent = 'запрашиваю у брокера…';
      if (!S.accounts || manual) S.accounts = await D.getAccounts(S.token);
      if (!S.accounts.length) throw new Error('открытых счетов не найдено');
      if (!S.account || !S.accounts.some((a) => a.id === S.account.id)) S.account = S.accounts[0];
      S.acct = await D.getAccountMoney(S.token, S.account.id);
      S.capital = Math.round(S.acct.total); save();
      if (manual && !$('#settings').hidden) renderSettings();
      if (an) renderPanel();
    } catch (e) { if (res) res.innerHTML = '<span class="neg">' + esc(e.message) + '</span>'; }
  }

  const lotsW = (n) => n % 10 === 1 && n % 100 !== 11 ? 'лот' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'лота' : 'лотов';
  // текущая цена для плана: если цена ушла от «Вход ~», объём и П/Р считаем от неё
  const curPx = (p) => (all.length && !demo ? all[all.length - 1].c : p.entry);
  function staleLine(p) {
    if (!all.length) return '';
    const cur = all[all.length - 1].c, s = p.side, mv = s * (cur - p.entry) / p.entry;
    if (s * (cur - p.stop) <= 0) return `<div class="note">Цена ${pr(cur)} уже за стопом — план не действует.</div>`;
    if (!p.notgt && s * (cur - p.target) >= 0) return `<div class="note">Цена ${pr(cur)} уже дошла до цели — входить поздно.</div>`;
    if (Math.abs(mv) < 0.002) return '';
    const rrNow = p.notgt ? null : s * (p.target - cur) / (s * (cur - p.stop));
    const prog = p.notgt ? 0 : s * (cur - p.entry) / (s * (p.target - p.entry));
    const bad = rrNow != null && (rrNow < 1 || prog >= 0.5);
    return `<div class="small ${bad ? 'warn' : ''}">Сейчас ${pr(cur)} — ${mv > 0 ? 'выше' : 'ниже'} входа на ${Math.abs(mv * 100).toFixed(1).replace('.', DEC())}%${rrNow != null ? ' · П/Р при входе сейчас ' + rrNow.toFixed(2).replace('.', DEC()) : ''}${bad ? ' — вход уже невыгоден, лучше пропустить' : ''}.</div>`;
  }

  // объём позиции: риск на сделку от капитала, лоты по лотности бумаги, без плеча
  function sizeLine(entry, stop, isOpen) {
    const cap = tr ? trEq() : Number(S.capital) || 0;   // в тренажёре — его виртуальный капитал
    if (!cap || (demo && !tr)) return cap ? '' : '<div class="small mut">Объём в лотах — укажите капитал в ⚙ → «Объём позиции».</div>';
    const lot = lotInfo && lotInfo.lot ? lotInfo.lot : (S.inst.lot || 1), risk1 = Math.abs(entry - stop);
    if (!(risk1 > 0)) return '';
    const riskRub = cap * (S.cfg.riskPct || 1) / 100;
    let shares = Math.floor(riskRub / risk1);
    shares = Math.min(shares, Math.floor(cap / entry));            // без плеча: не больше капитала
    const lots = Math.floor(shares / lot);
    const lotRisk = lot * risk1, f0 = (x) => Math.round(x).toLocaleString('ru-RU');
    if (lots < 1) return `<div class="small warn">Объём: даже 1 лот (${lot} шт.) — риск ${f0(lotRisk)} ₽, это ${(lotRisk / cap * 100).toFixed(1).replace('.', DEC())}% капитала (больше ${S.cfg.riskPct || 1}%).</div>`;
    const sum = lots * lot * entry, r = lots * lotRisk;
    const free = tr ? null : S.acct && S.account ? S.acct.free : null;   // реальный счёт к тренажёру не относится
    const freeNote = !isOpen && free != null && sum > free ? `<div class="small warn">На счёте свободно ${f0(free)} ₽ — хватит на ${Math.floor(free / (lot * entry))} ${lotsW(Math.floor(free / (lot * entry)))}.</div>` : '';
    return `<div class="small"><b>Объём: ${lots} ${lotsW(lots)}</b> (${lots * lot} шт.) ≈ ${f0(sum)} ₽ · риск до стопа ≈ ${f0(r)} ₽ (${(r / cap * 100).toFixed(1).replace('.', DEC())}%)${shares * entry >= cap * 0.99 ? ' · ограничено капиталом' : ''}</div>${freeNote}`;
  }

  function addonsList() {
    const c = Object.assign({}, E.DEFAULTS, S.cfg), a = [];
    if (c.addTrend === 'ma') a.push('тренд по средней ' + c.trendMA);
    if (!c.bookTrend && c.addTrend !== 'ma') a.push('без фильтра тренда');
    if (c.addStruct) a.push('структура');
    if (c.exitMode !== 'fixed') a.push('перенос стопа');
    if (c.targetMode === 'near') a.push('ближняя цель');
    if (c.targetMode === 'none') a.push('без цели');
    if (c.maxHold > 0) a.push('макс. ' + c.maxHold + ' бар.');
    if (c.maxHoldDays > 0) a.push('сделка до ' + Math.round(c.maxHoldDays / 30.4) + ' мес');
    if (c.addMinRR) a.push('П/Р от ' + c.minRR);
    if (c.weekExit) a.push('выход в пятницу' + (c.wkChan ? ' (держать, пока цел канал)' : '') + (c.wkNextOpen ? ', по открытию пн' : ''));
    if (c.topOnly) a.push('только лучший подсчёт');
    if (c.addDepth) a.push('рамки волн 2 и 4');
    if (c.addPhaseExit) a.push('выход по смене фазы');
    if (c.addFlipExit) a.push('выход при смене подсчёта');
    if (c.addComplexTrade) a.push('входы по сложной волне 2/4');
    if (c.addRunner) a.push('после цели — держать');
    if (c.addAO) a.push(c.aoMode === 'both' ? 'фильтр AO строгий' : 'фильтр AO');
    if (c.addPyramid) a.push('доливка 110% W1');
    if (c.beMode === 'auto') a.push('безубыток ' + (c.beRule === 'atr' ? c.beAtr + '×ATR' : BE_RULE[c.beRule] || ''));
    if (c.addSma200) a.push('по SMA200');
    if (c.addMktFast && c.addMarket) a.push('осторожный рынок');
    if (c.longOnly) a.push('только покупки');
    if (c.shortOnly) a.push('только продажи');
    if (c.addMarket) a.push('по рынку');
    if ((c.swingMult || 1) !== 1) a.push('волны ×' + String(c.swingMult).replace('.', DEC()));
    if (c.stopW2) a.push('стоп за волной 2');
    return a;
  }

  // перерисовка панели (в тренажёре — на каждой свече) не должна сбрасывать прокрутку
  // правила и нормы книги для подсчёта: ✓ выполнено, ✗ нет, … ещё рано
  function rulesHtml(s) {
    const L = E.rulesCheck(s); if (!L.length) return '';
    const row = (x) => `<div class="rl ${x.ok === false ? (x.rule ? 'neg' : 'warn') : x.ok ? '' : 'mut'}"><b>${x.ok === true ? '✓' : x.ok === false ? '✗' : '…'}</b><span>${esc(x.t.replace(/(\d)\.(\d)/g, '$1' + DEC() + '$2'))}</span></div>`;
    const rules = L.filter((x) => x.rule), norms = L.filter((x) => !x.rule);
    return `<div class="rules">${rules.length ? '<div class="small mut">Правила книги (нарушать нельзя):</div>' + rules.map(row).join('') : ''}${norms.length ? '<div class="small mut" style="margin-top:4px">Нормы (обычно так бывает, но не обязательно):</div>' + norms.map(row).join('') : ''}</div>`;
  }
  // ослабление импульса на волне 5 (по книге): пик AO 5/34 на волне 5 ниже, чем на волне 3. Только подсказка.
  function divInfo(s) {
    if (!s || s.fam !== 0 || s.n < 5 || !an.aoArr) return null;
    const ao = an.aoArr, d = s.dir, peak = (a, b) => { let m = -Infinity; for (let i = a + 1; i <= b && i < ao.length; i++) if (!isNaN(ao[i])) m = Math.max(m, d * ao[i]); return m; };
    const p3 = peak(s.idx[2], s.idx[3]), p5 = peak(s.idx[4], s.n >= 6 ? s.idx[5] : an.N - 1);
    if (!isFinite(p3) || !isFinite(p5)) return null;
    const done = s.n >= 6;
    if (p5 < p3) return { cls: 'warn', txt: `Импульс ослаб: AO 5/34 на волне 5 ${done ? 'был' : 'пока'} слабее, чем на волне 3 (${Math.round(p5 / p3 * 100)}%) — по книге так обычно ${done ? 'и заканчивается' : 'заканчивается'} пятая волна. Это подсказка, на сделки не влияет.` };
    return { cls: 'mut', txt: `Расхождения нет: AO 5/34 на волне 5 ${done ? 'был' : 'пока'} не слабее, чем на волне 3${done ? '' : ' — волна 5 может продолжиться'}. Подсказка, на сделки не влияет.` };
  }
  // время по Фибоначчи: когда текущая волна достигла бы 0,618 / 1 / 1,618 длительности соответствующей прошлой волны
  function fibTime(s) {
    if (!s) return null;
    let a = -1, b = -1, st = -1, title = '';
    if (s.fam === 0 && s.n >= 2 && s.n <= 5) {
      const ref = { 2: [0, 1, 'волна 2 по длительности волны 1'], 3: [0, 1, 'волна 3 по длительности волны 1'], 4: [1, 2, 'волна 4 по длительности волны 2'], 5: [0, 1, 'волна 5 по длительности волны 1'] }[s.n];
      a = s.idx[ref[0]]; b = s.idx[ref[1]]; st = s.idx[s.n - 1]; title = ref[2];
    } else if (s.fam === 1 && s.n === 3) { a = s.idx[0]; b = s.idx[1]; st = s.idx[2]; title = 'волна C по длительности волны A'; }
    if (st < 0 || b <= a) return null;
    return { title, pts: [0.618, 1, 1.618].map((r) => { const i = st + Math.round((b - a) * r); return { r: String(r).replace('.', DEC()), i, left: i - (an.N - 1) }; }) };
  }
  function renderPanel() { const P = $('#panel'), st = P ? P.scrollTop : 0; renderPanel0(); if (P && st) P.scrollTop = st; }
  function renderPanel0() {
    const P = $('#panel');
    let h = '';
    if (demo) h += `<div class="banner">Это демо-данные. Введите токен Т-Инвестиций в настройках ⚙ — появятся настоящие котировки.</div>`;
    if (mxSrc && !demo) h += `<div class="banner">Цены с Мосбиржи, задержка ~15 мин — ${S.token ? 'сервер брокера сейчас не отвечает. Когда ответит, приложение само вернётся к нему.' : 'токена нет. С токеном Т-Инвестиций (⚙ → Счёт) цены без задержки и видны сделки со счёта.'}</div>`;
    if (err) h += `<div class="banner err" id="errRetry" role="button">${esc(err)}<div class="small" style="margin-top:6px;opacity:.85">${retrying ? '⟳ Проверяю связь…' : '↻ Нажмите, чтобы проверить связь' + (lastTry ? ' · последняя попытка ' + new Date(lastTry).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '')}</div>${/Минцифры/.test(err) && A && A.installRussianCA ? '<div style="margin-top:8px"><button id="caQuick">Скачать сертификат с gu-st.ru</button></div>' : ''}</div>`;
    if (tr) h += trainerCard();
    if (tr && !tr.waves) { h += '<div class="card"><div class="small">🌊 Разметка и анализ скрыты, чтобы вы размечали волны сами. Нажмите 🌊 на панели тренажёра, чтобы сверить свой подсчёт с системой.</div></div>'; P.innerHTML = h; bindPanel(); bindTrainerCard(); return; }
    if (!an) { P.innerHTML = h + '<button class="manl" data-man="">📖 Инструкция — как пользоваться приложением</button>'; bindPanel(); return; }
    const ad = addonsList();
    // 1. фаза, выход, план, открытая сделка
    const ph = an.phase;
    h += `<div class="card${foldC('now')}" id="nowCard" data-fold="now"><h3><span class="grow">Сейчас</span><span class="small">${ad.length ? 'доп.: ' + esc(ad.join(', ')) : 'как по книге'}</span></h3>`;
    const nowTop = h.length;   // открытая сделка встаёт сюда — первой, над фазой и планом
    h += `<div class="big ${ph.tone}">${esc(ph.text)}</div>`;
    if (an.phaseNext !== 0) h += `<div class="exit">ВЫХОД: закрыть ${an.phaseNext > 0 ? 'продажи' : 'покупки'} — фигура завершена</div>`;
    h += `<div style="margin-top:4px">${trendLine()}</div>`;
    { const hs = hudState(), L = lightInfo(hs.fresh ? hs.p : null, hs.ts, hs.small);
      h += `<div class="small ${hs.ts.cls}">Тренд ${hs.ts.txt} — ${hs.ts.why}</div>`;
      if (hs.small) h += `<div class="small warn">Порог ${String(hs.sw).replace('.', DEC())}% мельче 0.6 от авто (${String(hs.ref).replace('.', DEC())}%): система видит волны очень мелкой степени${S.tf === '1h' ? ', на 1ч такие сигналы в среднем убыточны' : ''}.</div>`;
      if (L) h += `<div class="small ${L.cls}" style="margin-top:2px"><b>${L.short}</b> — ${esc(L.long)}</div>`; }
    const p = an.plan;
    // 3.10: сигнал на последней закрытой свече — сколько осталось до закрытия свечи, которая идёт сейчас (свеча входа)
    const planCd = (age) => { if (age !== 0 || tr) return ''; const ms = D.TF[S.tf].ms, lastT = an.bars[an.N - 1].t, end = D.candleEnd(S.tf);
      return end && lastT + 2 * ms > Date.now() ? `<div class="small">${cdSpan(end, 'до закрытия текущей свечи')} — вход по цене, близкой к открытию, ещё возможен</div>` : ''; };
    if (p && an.planActive) {
      const age = an.N - 1 - p.sigBar;
      h += `<div class="plan ${p.side > 0 ? 'buy' : 'sell'}"><div class="big ${p.side > 0 ? 'pos' : 'neg'}">ПЛАН: ${p.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА'} · ${esc(E.SETUP_NAME[p.setup])}</div>
        <div class="mono">Вход ~${pr(p.entry)} · стоп ${pr(p.stop)}${p.notgt ? '' : ' · цель ' + pr(p.target)}</div>
        <div class="small">П/Р ${p.rr.toFixed(2).replace('.', DEC())} · сигнал ${age === 0 ? 'на последней свече' : age + ' св. назад'} (${fmtT(an.bars[p.sigBar].t, true)})</div>${planCd(age)}${staleLine(p)}${sizeLine(curPx(p), p.stop)}</div>`;
    } else h += `<div class="plan"><span class="mut">ПЛАН: ждать подтверждения следующего разворота</span></div>`;
    if (an.openTrade) {
      const rest = h.slice(nowTop); h = h.slice(0, nowTop);
      const t = an.openTrade, sh = an.shadow[an.shadow.length - 1], st = sh && sh.steps.length ? sh.steps[sh.steps.length - 1] : null;
      h += `<div class="plan ${t.side > 0 ? 'buy' : 'sell'}"><b>Открытая сделка: ${t.side > 0 ? 'покупка' : 'продажа'} от ${pr(t.entry)}</b> · сейчас <span class="${t.R >= 0 ? 'pos' : 'neg'}">${f2(t.R)} R</span>
        ${t.runner ? `<div class="warn" style="margin-top:4px">Цель ${pr(t.target)} пройдена — держим, стоп ${pr(t.stop)} подтягивать под минимумы</div>` : ''}
        ${an.flipNow ? `<div class="exit">ВЫХОД: подсчёт развернулся — ${esc(an.title)}</div>` : ''}
        ${(() => { const md = S.cfg.maxHoldDays || 0; if (!md || !an.bars[t.iEntry]) return ''; const held = Math.floor((an.bars[an.N - 1].t - an.bars[t.iEntry].t) / 86400000), left = md - held;
          return `<div class="small ${left <= 14 ? 'warn' : ''}">В сделке ${held} дн. из ${md}${left > 0 ? ' · до предельного срока ' + left + ' дн.' : ' · срок вышел — закрыть'}</div>`; })()}
        ${sizeLine(t.entry, t.stop0, true)}
        <div class="small">Стоп ${pr(t.stop)}${t.moves ? ' (перенесён ' + t.moves + ' раз)' : ''}${t.notgt && !t.runner ? '' : ' · цель ' + pr(t.target)}${st ? ' · <span class="warn">безубыток: стоп можно поднять на ' + pr(st.p) + '</span>' : S.view.be && sh && sh.armPx && !sh.armed ? ' · <span class="mut">подсказка БУ появится после ' + pr(sh.armPx) + '</span>' : ''}</div></div>`;
      h += rest;
    }
    h += journalPanel();
    h += `</div>`;

    // 2. подсчёт
    if (altSel >= an.scen.length) altSel = 0;
    const s = curScen(), tgc = curTg(), lastPx = an.bars[an.N - 1].c;
    h += `<div class="card${foldC('count')}" data-fold="count"><h3>Подсчёт волн</h3>`;
    if (an.scen.length > 1) {
      const top = an.scen.slice(0, 4), sum = top.reduce((a, x) => a + x.score, 0) || 1;
      h += `<div class="row sortb" style="margin-bottom:2px">${top.map((x, k) => `<button id="alt${k}" data-alt="${k}" class="${k === altSel ? 'on' : ''}">${k ? 'Альт. ' + k : 'Основной'} ${Math.round(x.score / sum * 100)}%</button>`).join('')}</div>`;
      h += `<div class="small" style="margin-bottom:6px">Проценты — доля каждого подсчёта по соответствию нормам книги среди этих ${top.length}. Это подсказка, какой вариант правдоподобнее, а не точная вероятность.</div>`;
    }
    if (s) {
      h += `<div class="big ${altSel ? 'violet' : 'blue'}">${esc(E.scenTitle(s))}</div><div class="small">Соответствие нормам ${s.score.toFixed(0)}/100${tgc && tgc.inv ? ' · отмена подсчёта ' + pr(tgc.inv) + ' (' + spc(tgc.inv / lastPx - 1) + ')' : ''}${altSel ? ' · <span class="violet">альтернативный подсчёт, на графике фиолетовым</span>' : ''}</div>`;
      h += rulesHtml(s);
      { const dv = divInfo(s); if (dv) h += `<div class="small ${dv.cls}" style="margin-top:4px">${dv.txt}</div>`; }
      if (S.view.fibT) { const ft = fibTime(s); h += `<div class="small" style="margin-top:4px">⏱ Время по Фибоначчи (сверх книги — в книге время вторично): ${ft ? esc(ft.title) + ' — ' + ft.pts.map((q) => `${q.r} — ${q.left > 0 ? 'через ' + q.left + ' св.' : q.left === 0 ? 'сейчас' : 'уже прошло'}`).join(' · ') : 'для этого подсчёта нет — только для волн 2–5 импульса и волны C'}</div>`; }
      if (tgc && tgc.tg.length) {
        h += `<table style="margin-top:6px"><thead><tr><th>Цель</th><th>Цена</th><th>От текущей</th></tr></thead><tbody>${tgc.tg.map((v, k) => `<tr><td>${esc(tgc.lb[k])}</td><td class="mono">${pr(v)}</td><td class="${v >= lastPx ? 'pos' : 'neg'}">${spc(v / lastPx - 1)}</td></tr>`).join('')}</tbody></table>`;
      }
      if (an.scen.length > 1) h += `<div class="small" style="margin-top:6px">Нажмите «Альт.», чтобы увидеть запасной подсчёт на графике с его целями и отменой.</div>`;
    } else h += `<div class="mut">Мало разворотов — уменьшите порог.</div>`;
    h += `</div>`;

    // 3. бэктест
    const st = an.stats, n = st.trades;
    const avgR = n ? st.sumR / n : 0, pf = st.gl > 0 ? st.gp / st.gl : st.gp > 0 ? 99 : 0;
    h += `<div class="card${foldC('bt')}" data-fold="bt"><h3><span class="grow">Порог разворота и бэктест</span></h3>
      <div class="stepper"><button id="swMinus">−</button><b class="mono" style="min-width:58px;text-align:center">${an.swing.toFixed(an.swing < 2 ? 2 : 1).replace('.', DEC())}%</b><button id="swPlus">+</button><button id="swAuto" class="${(tr ? !tr.swAuto : curSwing()) ? '' : 'on'}">Авто</button><button id="swOpt">Лучший R</button><button id="swOptRet">Макс. %</button></div>
      <div class="kv">
        <div><small>Сделок</small><b>${n}</b></div>
        <div><small>Прибыльных</small><b>${n ? Math.round(st.wins / n * 100) : 0}%</b></div>
        <div><small>Средний R</small><b class="${avgR >= 0 ? 'pos' : 'neg'}">${f2(avgR)}</b></div>
        <div><small>Доходность</small><b class="${st.totalRet >= 0 ? 'pos' : 'neg'}">${spc(st.totalRet)}</b></div>
        <div><small>Просадка</small><b>${pc(st.maxDD)}</b></div>
        <div><small>Профит-фактор</small><b>${pf.toFixed(2).replace('.', DEC())}</b></div>
      </div>
      <div class="small">Сумма R ${f2(st.sumR)} · <b class="${st.sumNR >= 0 ? 'pos' : 'neg'}">чистыми ${f2(st.sumNR || 0)} R</b> (за вычетом комиссии ${S.cfg.feePct != null ? S.cfg.feePct : 0.05}% и проскальзывания)</div>
      ${S.cfg.cashYield > 0 ? `<div class="small">В доходности учтены проценты фонда на свободные деньги (${String(S.cfg.cashYield).replace('.', DEC())}% годовых): ${spc(st.cashRet || 0)} от начального капитала.</div>` : ''}
      <div class="small">Купил и держал ${spc(an.buyHold)} · убытков подряд ${st.worst} · в сделке в среднем ${n ? Math.round(st.sumBars / n) : 0} св.</div>
            ${optBlock()}${retBlock()}
      <div class="small" style="margin-top:4px">Разворот засчитывается после отката на этот процент. Меньше — мелкие волны, больше — крупные.</div>
      <div class="small">Бэктест на ${an.N} свечах${an.gapFrom ? ' (после разрыва в истории, с ' + fmtT(an.gapFrom) + ')' : ''}</div>
      ${divAdj.length ? `<div class="small">История скорректирована на дивиденды: ${divAdj.length} ${divAdj.length === 1 ? 'отсечка' : divAdj.length < 5 ? 'отсечки' : 'отсечек'}, последняя ${fmtT(divAdj[0].t)} — ${pr(divAdj[0].d)} ₽. Цены до отсечки на графике ниже биржевых.</div>` : ''}
${n && n < 30 ? '<div class="note">Сделок меньше 30: результат может быть случайным.</div>' : ''}
      <div style="overflow-x:auto;max-width:100%"><table style="margin-top:8px;font-size:12px"><thead><tr><th>Порог</th>${an.sens.map((x) => `<th>${x.swing.toFixed(1).replace('.', DEC())}${x.cur ? '*' : ''}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Сделок</td>${an.sens.map((x) => `<td>${x.st.trades}</td>`).join('')}</tr>
        <tr><td>Ср. R</td>${an.sens.map((x) => `<td>${x.st.trades ? f2(x.st.sumR / x.st.trades) : '—'}</td>`).join('')}</tr>
        <tr><td>Доход</td>${an.sens.map((x) => `<td>${spc(x.st.totalRet)}</td>`).join('')}</tr>
      </tbody></table></div>
      ${S.view.be && n ? beSummary() : ''}
      ${n ? `<div class="small" style="margin-top:6px">По сетапам: ${st.sn.map((k, i) => (k ? E.SETUP_SHORT[i] + ' ' + k + '/' + Math.round(st.sw[i] / k * 100) + '%' : '')).filter(Boolean).join(' · ')}</div>` : ''}
    </div>`;

    // 4. сделки
    if (n) {
      h += `<div class="card${foldC('btTr')}" data-fold="btTr"><h3><span class="grow">Сделки бэктеста</span><button id="tPrev">◄</button><button id="tNext">►</button></h3>`;
      if (sel >= 0) {
        const t = an.trades[sel], sh = an.shadow[sel];
        h += `<div class="plan ${t.side > 0 ? 'buy' : 'sell'}" style="margin:0 0 8px"><b>Сделка ${sel + 1} из ${n} · ${t.side > 0 ? 'покупка' : 'продажа'} · ${esc(E.SETUP_NAME[t.setup])}</b>
          <div class="small mono">${fmtT(an.bars[t.iEntry].t, true)} → ${fmtT(an.bars[t.iExit].t, true)} · ${t.iExit - t.iEntry + 1} св.</div>
          <div class="small mono">Вход ${pr(t.entry)} · стоп ${pr(t.stop0)}${t.moves ? ' → ' + pr(t.stop) : ''}${t.notgt && !t.runner ? '' : ' · цель ' + pr(t.target)}</div>
          <div>Выход ${pr(t.exitP)} (${esc(reason(t))}) · <span class="${t.R >= 0 ? 'pos' : 'neg'}">R ${f2(t.R)}</span> · к капиталу ${spc(t.ret)}</div>
          ${t.cnt ? `<div class="small"><span style="color:#c08cff">■</span> На входе: ${esc(t.cnt.title)} · оценка ${t.cnt.score.toFixed(0)}${t.cnt.fam === 0 && t.cnt.n === 3 && t.cnt.r2 ? ' · волна 2 = ' + Math.round(t.cnt.r2 * 100) + '% волны 1' : ''}</div>` : ''}
          ${t.exitCnt ? `<div class="small"><span style="color:#ff7ab6">■</span> На выходе: ${esc(t.exitCnt.title)} · оценка ${t.exitCnt.score.toFixed(0)}</div>` : ''}
          ${S.view.be ? `<div class="small warn">${sh.hit >= 0 ? 'Стоп в безубыток выбило бы на ' + pr(sh.hitPx) + ' · R ' + f2(sh.R) : sh.steps.length ? 'Стоп в безубыток не выбило бы' : 'Безубыток не успел появиться'}</div>` : ''}</div>`;
      }
      h += `<table class="tlist"><thead><tr><th>#</th><th>Дата</th><th>Сетап</th><th>R</th><th>Выход</th></tr></thead><tbody>${an.trades.map((t, k) => `<tr data-t="${k}" class="${k === sel ? 'sel' : ''}"><td>${k + 1} ${t.side > 0 ? '▲' : '▼'}</td><td>${fmtT(an.bars[t.iEntry].t)}</td><td>${E.SETUP_SHORT[t.setup]}${t.add ? ' <span title="доливка по Вильямсу">+д</span>' : ''}</td><td class="${t.R >= 0 ? 'pos' : 'neg'}">${f2(t.R)}${t.add && t.add.R != null ? `<br><small class="${t.add.R >= 0 ? 'pos' : 'neg'}">+${f2(t.add.R)}</small>` : ''}</td><td>${esc(reason(t))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    h += `<div class="card${foldC('dbg')}" data-fold="dbg"><h3>Разбор ошибок</h3><div class="small">Выгрузит свечи, настройки и результат анализа этой бумаги в файл (без токена). Его можно прислать в чат вместе со скриншотом — разберём, где подсчёт ошибся.</div>
      <div class="row" style="margin-top:8px"><button id="expBtn">Выгрузить для разбора</button><button id="expShare" ${lastExport ? '' : 'hidden'}>Отправить</button></div>
      <div class="small" id="expRes">${lastExport ? 'Сохранено: ' + esc(lastExport) : ''}</div></div>`;
    h += '<button class="manl" data-man="">📖 Инструкция — как пользоваться приложением</button>';
    h += `<div class="small" style="text-align:center;margin-top:10px">${lastLoad && !demo ? 'Обновлено ' + fmtT(lastLoad, true) + ' · ' : ''}По книге Пректера и Фроста «Волновой принцип Эллиотта». Не является инвестиционной рекомендацией.</div>`;
    // перерисовка панели не должна сдвигать то, что сейчас на экране
    const anchor = panelAnchor; panelAnchor = '';
    const aTop = anchorTop;
    P.innerHTML = h;
    bindPanel();
    if (tr) bindTrainerCard();
    if (anchor) { const n2 = document.getElementById(anchor); if (n2) P.scrollTop += n2.getBoundingClientRect().top - aTop; }
  }

  // ---------- выгрузка для разбора ----------
  let lastExport = '';
  const APP_VER = '3.15';
  function exportData() {
    if (!an) return;
    const p2 = (n) => String(n).padStart(2, '0'), d = new Date();
    const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
    const name = `ew-${S.inst.ticker}-${S.tf}-${stamp}.json`;
    const cfgOut = Object.assign({}, S.cfg, { swingPct: curSwing() });
    const doc = {
      app: 'Волны Эллиотта ' + APP_VER, exportedAt: d.toISOString(), demo,
      inst: { id: S.inst.id, ticker: S.inst.ticker, name: S.inst.name, classCode: S.inst.classCode }, tf: S.tf,
      cfg: cfgOut, swingUsed: an.swing, gapFrom: an.gapFrom, analysedBars: an.N, view: S.view,
      // свечи: время (мс UTC), открытие, максимум, минимум, закрытие, объём, 1 — свеча закрыта
      columns: ['t', 'o', 'h', 'l', 'c', 'v', 'done'],
      bars: all.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v, b.done === false ? 0 : 1]),
      result: {
        title: an.title, score: an.scen0 ? an.scen0.score : null, phase: an.phase.text, phaseNext: an.phaseNext,
        scenarios: an.scen.slice(0, 5).map((x) => ({ title: E.scenTitle(x), score: x.score, points: x.idx.map((ix, k) => [an.bars[ix].t, x.px[k]]) })),
        pivots: an.main.map((q) => [an.bars[q.i].t, q.p, q.t]),
        plan: an.plan ? Object.assign({}, an.plan, { sigTime: an.bars[an.plan.sigBar] ? an.bars[an.plan.sigBar].t : null, active: an.planActive }) : null,
        stats: an.stats,
        trades: an.trades.map((t) => ({ setup: E.SETUP_SHORT[t.setup], side: t.side, entryT: an.bars[t.iEntry].t, entry: t.entry, stop0: t.stop0, stop: t.stop, target: t.target, exitT: an.bars[t.iExit].t, exitP: t.exitP, R: t.R, reason: reason(t) })),
      },
      dividendsAdjusted: divAdj, lot: lotInfo ? lotInfo.lot : null,
      lastError: D.store.get('lasterr', null), errorNow: err || null,
    };
    const txt = JSON.stringify(doc);
    if (A && A.saveDownload) {
      const r = A.saveDownload(name, 'application/json', txt);
      const [ok, info] = r.split('|');
      if (ok === 'ok') { lastExport = info; renderPanel(); if (A.shareLast) A.shareLast('application/json'); }
      else $('#expRes').innerHTML = '<span class="neg">Не удалось сохранить: ' + esc(info) + '</span>';
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      lastExport = name; renderPanel();
    }
  }

  // ---------- подбор порога ----------
  const optRes = {}, retRes = {};
  // подбор порога по наибольшей доходности
  function runRetOpt(after) {
    setTimeout(() => {
      const done = all.filter((x) => x.done !== false);
      const o = E.optimizeReturn(done, S.cfg, D.TF[S.tf].ms);
      retRes[swKey()] = o; setSw(o.best.sw); save(); sel = -1; compute(true);
      if (after) after();
    }, 30);
  }
  function retBlock() {
    const o = retRes[swKey()];
    if (!o) return '';
    const cur = curSwing() || (an ? an.swing : 0), mx = Math.max(0.0001, ...o.grid.map((r) => Math.abs(r.ret)));
    const hasNeg = o.grid.some((r) => r.ret < 0), zero = hasNeg ? 50 : 100;   // где линия нуля, % высоты
    const bars = o.grid.map((r) => {
      const hgt = Math.abs(r.ret) / mx * (hasNeg ? 50 : 100), isCur = Math.abs(r.sw - cur) < 1e-9, few = r.n < o.minN;
      const style = r.ret >= 0 ? `bottom:${100 - zero}%;height:${hgt}%` : `top:${zero}%;height:${hgt}%`;
      return `<button class="rb ${r === o.best ? 'best' : ''} ${isCur ? 'cur' : ''} ${few ? 'few' : ''}" data-rsw="${r.sw}" aria-label="${swFmt(r.sw)}%: ${spc(r.ret)}"><i class="${r.ret >= 0 ? 'p' : 'n'}" style="${style}"></i></button>`;
    }).join('');
    const ch = o.check, b = o.best;
    return `<div class="retopt"><div class="small" style="margin-top:8px"><b>Макс. доходность</b> из ${o.grid.length} порогов (${swFmt(o.grid[0].sw)}–${swFmt(o.grid[o.grid.length - 1].sw)}%): <b>${swFmt(b.sw)}%</b> → <b class="${b.ret >= 0 ? 'pos' : 'neg'}">${spc(b.ret)}</b>, ${b.trades} сд., просадка ${pc(b.dd)}, ${f2(b.NR)} R чистыми.</div>
      <div class="retbars">${bars}</div>
      <div class="small">Столбик — доходность на пороге, слева мелкие, справа крупные. <span class="gold">Жёлтая рамка</span> — максимум, синяя — стоит сейчас, бледные — меньше ${o.minN} сделок (не учитываются). Нажмите столбик — поставить этот порог.</div>
      ${o.lone ? '<div class="note">Максимум одиночный: соседние пороги дают намного меньше. Скорее всего, это удачное совпадение на истории, а не устойчивая настройка.</div>' : ''}
      <div class="small" style="margin-top:4px">Проверка «вперёд»: подбор по истории до ${fmtT(ch.splitT)} выбрал ${swFmt(ch.sw)}% — на оставшейся части он дал <b class="${ch.picked >= 0 ? 'pos' : 'neg'}">${spc(ch.picked)}</b>, авто — <b class="${ch.auto >= 0 ? 'pos' : 'neg'}">${spc(ch.auto)}</b>. ${ch.picked > ch.auto + 0.01 ? '<span class="pos">Подбор помогал.</span>' : ch.picked < ch.auto - 0.01 ? '<span class="neg">Подбор не помог — на будущем лучший по истории порог проиграл авто.</span>' : '<span class="mut">Разницы почти нет.</span>'}</div></div>`;
  }
  function bindRetBars(root) {
    root.querySelectorAll('[data-rsw]').forEach((bt) => { bt.onclick = () => { setSw(Number(bt.dataset.rsw)); save(); sel = -1; compute(true); if (!pop.hidden && popFor === 'swChip') fillPop(); }; });
  }
  function optBlock() {
    const o = optRes[swKey()];
    if (!o || !o.grid.some((r) => Math.abs(curSwing() - r.sw) < 1e-9)) return '<div class="small" style="margin-top:4px">«Лучший R» и «Макс. %» — перебрать 9 порогов на этой истории и поставить лучший по среднему R или по доходности.</div>';
    const ch = o.check, fR = (r) => `<b class="${r.R >= 0 ? 'pos' : 'neg'}">${f2(r.R)} R</b> (${r.n} сд.)`;
    const better = ch.picked.R > ch.auto.R + 0.5, worse = ch.picked.R < ch.auto.R - 0.5;
    return `<div class="small" style="margin-top:6px">Подобран <b>${o.best.sw.toFixed(2).replace('.', DEC())}%</b>: ${fR(o.best.all)} на всей истории.
      <div style="overflow-x:auto;max-width:100%"><table style="margin-top:6px;font-size:12px;width:100%"><thead><tr><th>Порог</th><th>Сд.</th><th>Приб.</th><th>Σ R</th><th>Доход</th><th>Просад.</th></tr></thead><tbody>
      ${o.grid.map((r, k) => {
        const nb = [o.grid[k - 1], o.grid[k + 1]].filter(Boolean), lone = r === o.best && nb.length && nb.every((x) => x.all.R < 0);
        const isCur = Math.abs(curSwing() - r.sw) < 1e-9;
        return `<tr class="${isCur ? 'sel' : ''} ${r === o.best ? 'cur' : ''}" data-osw="${r.sw}"><td>${r.sw.toFixed(2).replace('.', DEC())}%${r === o.best ? ' ★' : ''}${isCur ? ' ✓' : ''}</td><td>${r.all.n}</td><td>${r.all.n ? Math.round(r.all.w / r.all.n * 100) : 0}%</td>
          <td class="${r.all.R >= 0 ? 'pos' : 'neg'}">${f2(r.all.R)}</td><td class="${r.ret >= 0 ? 'pos' : 'neg'}">${spc(r.ret)}</td><td>${pc(r.dd)}</td></tr>${lone ? '' : ''}`;
      }).join('')}</tbody></table></div>
      <div class="small">Сд. — сделок, Σ R — сумма R. ★ — лучший по сумме R, ✓ — стоит сейчас. Нажмите на строку, чтобы поставить этот порог.</div>
      ${(() => { const k = o.grid.indexOf(o.best), nb = [o.grid[k - 1], o.grid[k + 1]].filter(Boolean); return nb.length && nb.every((x) => x.all.R < 0) ? '<div class="note">Лучший порог стоит особняком: у соседних порогов убыток. Скорее всего, это случайность истории — надёжнее порог из зоны, где хороши несколько соседних значений подряд.</div>' : ''; })()}
      <div style="margin-top:4px">Проверка «вперёд» — подбор только на истории до ${fmtT(ch.splitT)}, потом торговля дальше: подобранный ${ch.sw.toFixed(2).replace('.', DEC())}% дал ${fR(ch.picked)}, авто ${ch.autoSw.toFixed(2).replace('.', DEC())}% — ${fR(ch.auto)}.
      <span class="${better ? 'pos' : worse ? 'neg' : 'mut'}">${better ? 'Подбор на этой бумаге помогал.' : worse ? 'Подбор на этой бумаге не помог — лучший порог прошлого не повторился.' : 'Разница небольшая.'}</span></div>
      <div class="note">Лучший порог на прошлом — не обещание на будущее: результат по истории с подобранным порогом всегда выглядит лучше, чем будет в реальной торговле.</div></div>`;
  }

  function reason(t) {
    if (t.reason === 0 && t.moves > 0) return t.ret > 0 ? 'перенесённый стоп, в плюс' : 'перенесённый стоп';
    return E.REASON_NAME[t.reason];
  }

  // шаг порога ~4% от него самого: 0,01 у самых мелких … 1 у крупных — одинаково «плавно» на любом уровне
  function swStep(s) { const t = s * 0.04; let st = 0.01; for (const v of [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1]) if (v <= t + 1e-9) st = v; return st; }
  function swRound(s) { const st = swStep(s); return Math.max(0.1, Math.min(30, Math.round(Math.round(s / st) * st * 100) / 100)); }
  const swFmt = (s) => String(Number(s.toFixed(2))).replace('.', DEC());
  function swNext(s, up) { const st = up ? swStep(s) : swStep(s - swStep(s) * 0.5); return swRound(s + (up ? st : -st)); }
  function stepSwing(up, fixOnly) {
    let s = an ? an.swing : 3;
    if (fixOnly) { setSw(s); save(); compute(true); return; }
    setSw(swNext(s, up)); save(); sel = -1; compute(true);
  }
  // ползунок: логарифмическая шкала 0,1–20%
  const SW_MIN = 0.1, SW_MAX = 20;
  const swToX = (s) => Math.round(1000 * Math.log(s / SW_MIN) / Math.log(SW_MAX / SW_MIN));
  const xToSw = (x) => swRound(SW_MIN * Math.pow(SW_MAX / SW_MIN, x / 1000));
  let swLiveT = 0, swSlow = false;
  function swResText() {
    if (!an) return '';
    const st = an.stats, wr = st.trades ? Math.round(st.wins / st.trades * 100) : 0;
    return `Бэктест: <b class="${st.totalRet >= 0 ? 'pos' : 'neg'}">${spc(st.totalRet)}</b> · ${st.trades} сд. · ${wr}% прибыльных${st.sumNR != null ? ` · <span class="${st.sumNR >= 0 ? 'pos' : 'neg'}">${f2(st.sumNR)} R</span> чистыми` : ''}`;
  }
  function swApply(v, live) {
    setSw(v); sel = -1;
    const lab = $('#sxVal'); if (lab) lab.textContent = swFmt(v) + '%';
    if (live && swSlow) return;   // на медленном телефоне пересчёт только когда отпустили
    clearTimeout(swLiveT);
    swLiveT = setTimeout(() => {
      const t0 = performance.now(); compute(true); if (live) swSlow = performance.now() - t0 > 250;
      const r = $('#sxRes'); if (r) r.innerHTML = swResText();
      const a = $('#sxAuto'); if (a) a.classList.remove('on');
    }, live ? 40 : 0);
  }
  function swPop() {
    const s = an ? an.swing : curSwing() || 3, auto = !curSwing();
    return `<div class="pgrp">Порог разворота · ${esc(S.inst.ticker)} ${D.TF[S.tf].name}</div>
      <div class="swbig"><button id="sxM" aria-label="Меньше">−</button><b id="sxVal" class="mono">${swFmt(s)}%</b><button id="sxP" aria-label="Больше">+</button></div>
      <input type="range" id="sxR" min="0" max="1000" step="1" value="${swToX(s)}" aria-label="Порог разворота">
      <div class="swticks">${[[0.1, '0,1%'], [0.25, '0,25'], [0.5, '0,5'], [1, '1'], [2, '2'], [5, '5'], [10, '10'], [20, '20%']].map(([v, t]) => `<span style="left:calc(10px + (100% - 20px) * ${swToX(v) / 1000})">${t}</span>`).join('')}</div>
      <div class="pnote" id="sxRes">${swResText()}</div>
      <div class="seg"><button id="sxAuto" class="${auto ? 'on' : ''}">Авто ×${String(S.cfg.swingMult || E.DEFAULTS.swingMult || 1).replace('.', DEC())}${auto ? ' ✓' : ''}</button></div>
      <div class="pnote" style="padding-bottom:0">Подобрать лучший на истории:</div>
      <div class="seg"><button id="sxOpt">по чистому R</button><button id="sxRet">по доходности %</button></div>
      ${retRes[swKey()] ? '<div style="padding:0 6px">' + retBlock() + '</div>' : ''}
      <div class="pnote">Меньше порог — видны мелкие волны и сделок больше; больше — только крупные движения. Кнопки ± и ползунок меняют порог шагами ~4%; кнопку можно держать.</div>`;
  }
  function swBind() {
    const R = $('#sxR');
    R.oninput = () => swApply(xToSw(Number(R.value)), true);
    R.onchange = () => { swApply(xToSw(Number(R.value)), false); save(); };
    holdRepeat($('#sxM'), () => { const v = swNext(curSwing() || (an ? an.swing : 3), false); R.value = swToX(v); swApply(v, true); }, () => { save(); swApply(curSwing(), false); });
    holdRepeat($('#sxP'), () => { const v = swNext(curSwing() || (an ? an.swing : 3), true); R.value = swToX(v); swApply(v, true); }, () => { save(); swApply(curSwing(), false); });
    $('#sxAuto').onclick = () => { clrSw(); save(); sel = -1; compute(true); fillPop(); };
    $('#sxRet').onclick = () => { const bt = $('#sxRet'); bt.disabled = true; bt.textContent = 'Считаю…'; runRetOpt(fillPop); };
    bindRetBars(pop);
    $('#sxOpt').onclick = () => {
      const bt = $('#sxOpt'); bt.disabled = true; bt.textContent = 'Считаю…';
      setTimeout(() => { const done = all.filter((x) => x.done !== false); const o = E.optimizeSwing(done, S.cfg, D.TF[S.tf].ms); optRes[swKey()] = o; setSw(o.best.sw); save(); sel = -1; compute(true); fillPop(); }, 30);
    };
  }
  // нажать и держать: сразу шаг, через 0,4 с — повтор, всё быстрее
  // повтор останавливается при любом отпускании пальца (даже не на кнопке), если кнопку перерисовали и максимум через 80 шагов
  function holdRepeat(el, step, done) {
    if (!el) return;
    let t = 0, n = 0, active = false;
    const stop = () => {
      if (!active) return;
      active = false; clearTimeout(t); t = 0;
      window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true);
      done();
    };
    el.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (active) stop();
      active = true; n = 0;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener('pointerup', stop, true); window.addEventListener('pointercancel', stop, true);
      step();
      const go = () => { if (!active) return; if (!el.isConnected || ++n > 80) { stop(); return; } step(); t = setTimeout(go, Math.max(50, 160 - n * 10)); };
      t = setTimeout(go, 400);
    };
    el.onlostpointercapture = stop;
    el.onclick = (e) => e.preventDefault();
  }

  let panelAnchor = '', anchorTop = 0;
  function aTopSaved(id) { const el = document.getElementById(id); anchorTop = el ? el.getBoundingClientRect().top : 0; }   // кнопка, которую нажали: после перерисовки она остаётся на том же месте экрана
  function bindPanel() {
    const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = () => { panelAnchor = id; aTopSaved(id); fn(); }; };
    b('expBtn', exportData);
    b('expShare', () => { if (A && A.shareLast) A.shareLast('application/json'); });
    b('caQuick', () => { const el = $('#caQuick'); el.disabled = true; el.textContent = 'Скачиваю…'; A.installRussianCA(); });
    { const er = $('#errRetry'); if (er) er.onclick = (e) => { if (e.target.closest('button')) return; retryNow(); }; }
    b('swMinus', () => stepSwing(false));
    b('swPlus', () => stepSwing(true));
    document.querySelectorAll('[data-alt]').forEach((bt) => { bt.onclick = () => { panelAnchor = bt.id; aTopSaved(bt.id); altSel = Number(bt.dataset.alt); renderPanel(); draw(); }; });
    b('jrnQuick', () => openJournal({ mode: 'open' }));
    document.querySelectorAll('#panel [data-jclose]').forEach((bt) => { bt.onclick = () => openJournal({ mode: 'close', id: bt.dataset.jclose }); });
    b('swAuto', () => { clrSw(); save(); sel = -1; compute(true); });
    document.querySelectorAll('[data-osw]').forEach((ro) => { ro.onclick = () => { const o = optRes[swKey()]; const sw = Number(ro.dataset.osw); setSw(sw); save(); sel = -1; compute(true); }; });
    b('swOpt', () => {
      const bt = $('#swOpt'); if (bt) { bt.disabled = true; bt.textContent = 'Считаю…'; }
      setTimeout(() => {
        const done = all.filter((x) => x.done !== false);
        const o = E.optimizeSwing(done, S.cfg, D.TF[S.tf].ms);
        optRes[swKey()] = o; setSw(o.best.sw); save(); sel = -1; compute(true);
      }, 30);
    });
    b('swOptRet', () => { const bt = $('#swOptRet'); if (bt) { bt.disabled = true; bt.textContent = 'Считаю…'; } runRetOpt(); });
    bindRetBars($('#panel'));
    b('tPrev', () => selectTrade(sel < 0 ? an.trades.length - 1 : Math.max(0, sel - 1)));
    b('tNext', () => selectTrade(sel < 0 ? 0 : Math.min(an.trades.length - 1, sel + 1)));
    document.querySelectorAll('.tlist tr[data-t]').forEach((tr) => { tr.onclick = () => selectTrade(Number(tr.dataset.t)); });
  }

  function selectTrade(k) {
    sel = k;
    if (k >= 0 && (S.view.pane || 0) >= 2) setPane(1);
    if (k >= 0) {
      const t = an.trades[k], w = Math.max(view.bars(), (t.iExit - t.iEntry) * 2.2 + 20);
      view.barW = Math.max(1.2, Math.min(30, plotW() / w));
      view.x0 = Math.max(0, (t.iEntry + t.iExit) / 2 - view.bars() / 2);
    }
    renderPanel(); draw();
    window.scrollTo(0, 0);
  }

  // ---------- переключатели разметки ----------
  function renderChips() {
    const v = S.view;
    let h = an ? `<button data-sw="-1">−</button><button id="swChip" class="${curSwing() ? '' : 'on'}" aria-haspopup="true">Порог ${swFmt(an.swing)}%${curSwing() ? '' : ' авто'} ▾</button><button data-sw="1">+</button><span class="chipstat ${an.stats.totalRet >= 0 ? 'pos' : 'neg'}">${spc(an.stats.totalRet)}<small>${an.stats.trades} сд · ${an.stats.trades ? Math.round(an.stats.wins / an.stats.trades * 100) : 0}%</small></span>` : '';
    const dots = v.clean ? '' : FIG_COLOR.map((c, k) => v.figs[k] ? `<i style="background:${c}"></i>` : '').join('');
    h += `<span class="grow"></span><button id="viewBtn" aria-haspopup="true">Вид${v.clean ? ': сделки' : dots ? ' ' + dots : ''} 🎓▾</button>`;
    $('#chips').innerHTML = h;
    $('#chips').querySelectorAll('button[data-sw]').forEach((b) => {
      const up = Number(b.dataset.sw) > 0;
      holdRepeat(b, () => {
        const v = swNext(curSwing() || (an ? an.swing : 3), up); setSw(v);
        const c = $('#swChip'); if (c) { c.textContent = 'Порог ' + swFmt(v) + '% ▾'; c.classList.remove('on'); }
      }, () => { save(); sel = -1; compute(true); });
    });
    const sc = $('#swChip'); if (sc) sc.onclick = () => togglePop('swChip', swPop, swBind);
    $('#viewBtn').onclick = () => togglePop('viewBtn', viewPop);
  }

  // ---------- всплывающее меню ----------
  const pop = $('#pop'); let popFor = '', popFill = null;
  let popBind = null;
  function togglePop(anchorId, fill, bind) { if (!pop.hidden && popFor === anchorId) { closePop(); return; } popFor = anchorId; popFill = fill; popBind = bind || null; pop.hidden = false; pop.scrollTop = 0; fillPop(); }
  function closePop() { pop.hidden = true; popFor = ''; popFill = null; popBind = null; }
  function fillPop() {
    if (pop.hidden || !popFill) return;
    const keepScroll = pop.scrollTop;   // перерисовка после галочки не должна листать список наверх
    pop.innerHTML = popFill();
    const a = document.getElementById(popFor); if (!a) { closePop(); return; }
    const r = a.getBoundingClientRect(), H = vh(), Wd = window.innerWidth;
    pop.style.maxHeight = ''; pop.style.top = '0px'; pop.style.left = '0px';
    const ph = pop.offsetHeight, pw = pop.offsetWidth;
    const below = H - r.bottom - 8, above = r.top - 8;
    if (popFor === 'trBar') { pop.style.top = (r.bottom + 4) + 'px'; pop.style.maxHeight = Math.max(below, 160) + 'px'; }
    else if (ph <= below || below >= above) { pop.style.top = (r.bottom + 4) + 'px'; pop.style.maxHeight = below + 'px'; }
    else { const hh = Math.min(ph, above); pop.style.top = (r.top - 4 - hh) + 'px'; pop.style.maxHeight = above + 'px'; }
    pop.style.left = Math.max(8, Math.min(Wd - pw - 8, r.right - pw)) + 'px';
    pop.classList.toggle('wide', popFor === 'trBar');
    pop.scrollTop = keepScroll;
    const tro = document.getElementById('trOpen'); if (tro) tro.onclick = () => { popFill = trSetupPop; popBind = trSetupBind; pop.scrollTop = 0; fillPop(); };
    skinBind(pop, fillPop);
    pop.querySelectorAll('[data-pv]').forEach((b) => { b.onclick = () => { const k = b.dataset.pv; S.view[k] = !S.view[k]; save(); renderChips(); draw(); if (k === 'be' || k === 'fibT') renderPanel(); fillPop(); }; });
    pop.querySelectorAll('[data-pclean]').forEach((b) => { b.onclick = () => { S.view.clean = b.dataset.pclean === '1'; save(); renderChips(); draw(); fillPop(); }; });
    pop.querySelectorAll('[data-mys]').forEach((b) => { b.onclick = () => { const [k, v] = b.dataset.mys.split('|'); S.rmStyle = Object.assign({}, S.rmStyle); S.rmStyle.me = Object.assign({}, rmStyle('me'), k === 'sh' ? { sh: v } : { c: v }); save(); draw(); fillPop(); }; });
    pop.querySelectorAll('[data-ph]').forEach((b) => { b.onclick = () => { const k = b.dataset.ph; S.view.hide = S.view.hide || {}; S.view.hide[k] = !S.view.hide[k]; if (!S.view.hide[k]) S.view.clean = false; save(); draw(); fillPop(); }; });
    pop.querySelectorAll('[data-pfn]').forEach((b) => { b.onclick = () => { S.view.figN = Number(b.dataset.pfn); save(); draw(); fillPop(); }; });
    pop.querySelectorAll('[data-pall]').forEach((b) => { b.onclick = () => {
      const all1 = b.dataset.pall === '1';
      S.view.clean = false; S.view.figN = 0;
      S.view.hide = all1 ? {} : { lv: true, plan: true, hi: true, zz: true, ma: true, flbl: true, wedge: true, robot: true };
      S.view.figs = S.view.figs.map(() => all1); S.view.channels = all1; if (!all1) S.view.trades = false;
      save(); renderChips(); draw(); fillPop(); }; });
    pop.querySelectorAll('[data-pf]').forEach((b) => { b.onclick = () => { const k = Number(b.dataset.pf); S.view.figs[k] = !S.view.figs[k]; if (S.view.figs[k]) S.view.clean = false; save(); renderChips(); draw(); fillPop(); }; });
    if (popBind) popBind();
    pop.querySelectorAll('[data-ptf]').forEach((b) => { b.onclick = () => { closePop(); if (S.tf === b.dataset.ptf) return; S.tf = b.dataset.ptf; save(); sel = -1; an = null; view.init = false; renderHead(); load(false); }; });
  }
  document.addEventListener('pointerdown', (e) => {
    if (pop.hidden) return;
    const a = document.getElementById(popFor);
    if (pop.contains(e.target) || (a && a.contains(e.target))) return;
    if (popFor === 'trPl' && e.target.closest && e.target.closest('#trBar')) return;   // «План» не закрываем, пока жмёте ▶ +1 ⏭
    closePop();
  }, true);
  const ck = (on) => `<span class="ck">${on ? '✓' : ''}</span>`;
  function viewPop() {
    const v = S.view;
    let h = `<button class="pitem pbig" id="trOpen">🎓<span>Тренажёр — прокрутка истории<br><small class="mut">будущее скрыто, свечи растут по минутам, торгуете вы и система</small></span></button><div class="pgrp">На графике</div><div class="seg"><button data-pclean="0" class="${v.clean ? '' : 'on'}">Вся разметка</button><button data-pclean="1" class="${v.clean ? 'on' : ''}">Только сделки</button></div>`;
    h += [['trades', 'Сделки бэктеста'], ['be', 'Подсказка безубытка (БУ)'], ['channels', 'Каналы тренда'], ['fibT', '⏱ Время по Фибоначчи (сверх книги)']].map(([k, t]) => `<button class="pitem ${v[k] ? 'on' : ''}" data-pv="${k}">${ck(v[k])}${t}</button>`).join('');
    return h + layersPart(v) + `<div class="pgrp">Оформление</div>` + skinPick();
  }
  // «Мои сделки»: отметки входа/выхода, поводок (пунктир вход → выход) и их вид
  function myMarksPart(v, compact) {
    const hd = v.hide || {}, st = rmStyle('me');
    const tg = (attr, on, t) => `<button class="tg ${on ? 'on' : ''}" ${attr}>${t}</button>`;
    return `<div class="pgrp">Мои сделки${compact ? '' : ' (дневник и тренажёр)'}</div><div class="tgs">${tg('data-ph="my"', !hd.my, 'Отметки')}${tg('data-ph="leash"', !hd.leash, 'Поводок вход → выход')}</div>
      <div class="tgs" style="margin-top:4px">${RM_SHAPES.map(([k, ic]) => `<button class="tg ${st.sh === k ? 'on' : ''}" data-mys="sh|${k}">${ic}</button>`).join('')}${RM_COLORS.map((cl) => `<button class="tg" data-mys="c|${cl}" style="width:24px;height:24px;padding:0;border-radius:50%;background:${cl};border:2px solid ${st.c === cl ? '#fff' : 'transparent'}"></button>`).join('')}</div>`;
  }
  function layersPart(v) {
    let h = '';
    const hd = v.hide || {}, lay = (k, t, sw) => `<button class="pitem ${hd[k] ? '' : 'on'}" data-ph="${k}">${ck(!hd[k])}${sw ? `<i class="lsw" style="${sw}"></i>` : ''}${t}</button>`;
    h += `<div class="pgrp">Слои разметки${v.clean ? ' — видны в режиме «Вся разметка»' : ''}</div><div class="seg"><button data-pall="1">Показать всё</button><button data-pall="0">Только подсчёт</button></div>`;
    h += lay('cnt', 'Текущий подсчёт (1-2-3-4-5, A-B-C)', 'background:#5b9cff')
      + lay('lv', 'Цели и «Отмена подсчёта»', 'background:repeating-linear-gradient(90deg,#f0a23a 0 4px,transparent 4px 7px)')
      + lay('plan', 'План сигнала: вход, стоп, цель', 'background:linear-gradient(#3fbf7f 0 33%,#5b9cff 33% 66%,#ef5b5b 66%);height:9px')
      + lay('hi', 'Старшая степень волн', 'background:rgba(200,205,215,.45);height:4px')
      + lay('zz', 'Зигзаг (все развороты)', 'background:rgba(150,160,175,.8);height:1px')
      + lay('ma', 'Скользящая средняя (тренд)', 'background:rgba(217,180,67,.8)')
      + lay('wedge', 'Клин: заливка, «выброс», цель после клина', 'background:rgba(239,111,91,.35);border:1px solid #ef6f5b')
      + lay('robot', 'Сделки роботов: О — основной, А — агрессивный, Я — мой счёт', 'background:#c08cff')
      + lay('flbl', 'Названия и оценки фигур', '')
      + lay('hud', 'Табличка в углу графика (индикатор, тренд, сигнал)', '');
    h += myMarksPart(v, false);
    h += `<div class="pgrp">Фигуры</div><div class="seg">${[[0, 'все'], [3, 'последние 3'], [1, 'последняя']].map(([n, t]) => `<button data-pfn="${n}" class="${(v.figN || 0) === n ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    for (let k = 0; k < 5; k++) h += `<button class="pitem ${v.figs[k] ? 'on' : ''}" data-pf="${k}">${ck(v.figs[k]).replace('class="ck"', `class="ck" style="${v.figs[k] ? 'background:' + FIG_COLOR[k] + ';border-color:' + FIG_COLOR[k] : 'border-color:' + FIG_COLOR[k]}"`)}${FIG_FULL[k]}<span class="n">${an ? an.figCount[k] : ''}</span></button>`;
    return h;
  }
  // слои разметки прямо во время тренировки (кнопка «Слои ▾» на панели тренажёра)
  function trLayersPop() {
    if (!tr) return '';
    // компактно и под панелью тренажёра — чтобы график оставался виден, пока переключаете
    const v = S.view, hd = v.hide || {};
    const tg = (attr, on, t, col) => `<button class="tg ${on ? 'on' : ''}" ${attr}${col && on ? ` style="background:${col}33;border-color:${col}"` : col ? ` style="border-color:${col}66"` : ''}>${t}</button>`;
    let h = `<div class="tgs">${tg('id="trWp"', tr.waves, '🌊 Разметка системы')}</div>`;
    if (!tr.waves) return h + '<div class="pnote">Сейчас видны только свечи — вы размечаете сами.</div>' + apSection();
    h += `<div class="pgrp">Слои</div><div class="tgs">`
      + tg('data-ph="cnt"', !hd.cnt, 'Подсчёт', '#5b9cff') + tg('data-ph="lv"', !hd.lv, 'Цели/отмена', '#f0a23a') + tg('data-ph="plan"', !hd.plan, 'План сигнала', '#3fbf7f')
      + tg('data-ph="hi"', !hd.hi, 'Старшая степень', '#c8cdd7') + tg('data-ph="zz"', !hd.zz, 'Зигзаг', '#969fae') + tg('data-ph="ma"', !hd.ma, 'Средняя', '#d9b443')
      + tg('data-ph="wedge"', !hd.wedge, 'Клин', '#ef6f5b') + tg('data-ph="flbl"', !hd.flbl, 'Подписи фигур') + tg('data-ph="hud"', !hd.hud, 'Табличка') + tg('data-pv="channels"', v.channels, 'Каналы') + tg('data-pv="trades"', v.trades, 'Сделки системы') + '</div>';
    h += myMarksPart(v, true);
    h += `<div class="pgrp">Фигуры</div><div class="tgs">` + FIG_SHORT.map((t, k) => tg(`data-pf="${k}"`, v.figs[k], t, FIG_COLOR[k])).join('')
      + '<span class="tgsep"></span>' + [[0, 'все'], [3, '3 посл.'], [1, '1 посл.']].map(([n, t]) => tg(`data-pfn="${n}"`, (v.figN || 0) === n, t)).join('') + '</div>';
    h += `<div class="tgs" style="margin-top:6px">${tg('data-pall="1"', false, 'Показать всё')}${tg('data-pall="0"', false, 'Только подсчёт')}</div>`;
    return h + apSection();
  }
  function apSection() {
    return `<div class="pgrp">Автопауза</div><div class="tgs">${`<button class="tg ${tr.auto ? 'on' : ''}" id="apMain">${tr.auto ? '⏸ Вкл' : 'Выкл'}</button>`}${tr.auto ? apChips('tg') : ''}</div>`;
  }
  function trLayersBind() {
    const b = document.getElementById('trWp'); if (b) b.onclick = () => { trToggleWaves(); fillPop(); };
    const m = document.getElementById('apMain'); if (m) m.onclick = () => { tr.auto = !tr.auto; S.trAuto = tr.auto; save(); fillPop(); };
    apBind(pop, fillPop);
  }
  // ---------- оповещения по бумаге: кнопка 🔔 ----------
  // на одной бумаге и таймфрейме может быть несколько записей слежения — с разными настройками
  S.watch.forEach((w) => { if (!w.wid) w.wid = w.ticker + '.' + w.tf; });
  const instWatches = () => S.watch.filter((w) => w.id === S.inst.id);
  const sameCfg = (w) => w.tf === S.tf && w.cfg && JSON.stringify(w.cfg) === JSON.stringify(S.cfg) && (w.sw || 0) === curSw();
  const curWatch = () => S.watch.find((w) => w.id === S.inst.id && sameCfg(w));
  function presetLabel() {
    if (S.preset === 'book') return 'Как по книге';
    if (S.preset === 'mine') return 'Мои настройки';
    const p = PRESETS.find((x) => x[0] === S.preset);
    return p ? p[1] : 'свои (изменены вручную)';
  }
  const cfgSnap = () => JSON.parse(JSON.stringify(S.cfg));
  const curSw = () => S.swings[swKey()] || 0;   // 0 — авто
  const cfgDiffers = (w) => !w.cfg || JSON.stringify(w.cfg) !== JSON.stringify(S.cfg) || (w.sw != null && w.sw !== curSw());
  const swText = (sw, cfg) => sw ? 'порог ' + String(sw).replace('.', DEC()) + '% вручную' : 'порог авто ×' + String((cfg && cfg.swingMult) || 1).replace('.', DEC());
  function ensureBg() { if (!S.bgMinutes) S.bgMinutes = 30; save(); applySchedule(); }
  // добавить слежение с текущими настройками графика (если точно такое уже есть — ничего не делаем)
  function addWatch() {
    if (curWatch()) return;
    const w = { wid: S.inst.ticker + '.' + S.tf + '.' + Date.now().toString(36), id: S.inst.id, ticker: S.inst.ticker, name: S.inst.name, classCode: S.inst.classCode, tf: S.tf,
      cfg: cfgSnap(), sw: curSw(), label: presetLabel(), at: Date.now() };
    S.watch.push(w);
    ensureBg();
  }
  function delWatchId(wid) { const k = S.watch.findIndex((w) => w.wid === wid); if (k >= 0) S.watch.splice(k, 1); save(); applySchedule(); }
  // показать на графике, что видит эта запись: её таймфрейм, настройки и порог
  function showWatch(wid) {
    const w = S.watch.find((x) => x.wid === wid); if (!w) return;
    if (w.cfg) S.cfg = JSON.parse(JSON.stringify(w.cfg));
    const tfCh = S.tf !== w.tf; S.tf = w.tf;
    if (w.sw) S.swings[w.id + '.' + w.tf] = w.sw; else delete S.swings[w.id + '.' + w.tf];
    S.preset = null; save(); sel = -1; renderHead();
    if (tfCh) { an = null; view.init = false; load(false); } else if (all.length) compute(true);
  }
  function addLevel(price, note) {
    if (!(price > 0)) return false;
    const last = all.length ? all[all.length - 1].c : price;
    S.palerts = S.palerts || [];
    S.palerts.push({ id: 'a' + Date.now().toString(36), instId: S.inst.id, ticker: S.inst.ticker, name: S.inst.name, classCode: S.inst.classCode, price, dir: price >= last ? 1 : -1, at: Date.now(), note: note || '' });
    ensureBg(); renderHead(); draw(); bellAnim('wig');
    return true;
  }
  function delLevel(id) {
    S.palerts = (S.palerts || []).filter((a) => a.id !== id); save();
    const pf = D.store.get('pfired', {}); delete pf[id]; D.store.set('pfired', pf);
    applySchedule(); renderHead(); draw();
  }
  function bgLine() {
    if (!A) return 'Фоновая проверка работает только в приложении на телефоне.';
    if (DESK) { const l = D.store.get('lastcheck', 0); return 'Программа проверяет каждые 5 минут, пока открыта или свёрнута к часам' + (l ? ' · последняя ' + fmtT(l, true) : '') + '.'; }
    if (!S.bgMinutes) return '<span class="warn">Фоновая проверка выключена.</span>';
    const l = D.store.get('lastcheck', 0);
    return 'Проверка каждые ' + (S.bgMinutes >= 60 ? S.bgMinutes / 60 + ' ч' : S.bgMinutes + ' мин') + (l ? ' · последняя ' + fmtT(l, true) : '') + '. Android может сдвигать время проверки.';
  }
  function bellPop() {
    const w = curWatch(), tfn = D.TF[S.tf].name, pf = D.store.get('pfired', {});
    const ws = instWatches().slice().sort((a, b) => TFK.indexOf(a.tf) - TFK.indexOf(b.tf));
    const lv = (S.palerts || []).filter((a) => a.instId === S.inst.id).sort((a, b) => b.price - a.price);
    const last = all.length ? all[all.length - 1].c : 0;
    let h = `<div class="pgrp">Оповещения · ${esc(S.inst.ticker)}</div>`;
    h += `<div class="pgrp">Сигналы системы <span style="text-transform:none;letter-spacing:0">— вход, выход, цель и стоп</span></div>`;
    h += ws.map((x) => { const isCur = x === w, l = D.store.get('last.' + x.wid, null);
      return `<div class="plv"><span><b>${D.TF[x.tf].name}</b> · ${esc(x.label || 'настройки приложения')}${isCur ? ' <small class="pos">✓ как на графике</small>' : ''}<br><small class="mut">${x.sw != null ? swText(x.sw, x.cfg) : 'порог как в приложении'}${l ? ' · ' + esc(l.phase.replace('Фаза: ', '')) : ''}</small></span>${isCur ? '' : `<button data-wshow="${esc(x.wid)}" aria-label="Показать на графике">👁</button>`}<button data-wdel="${esc(x.wid)}" aria-label="Удалить">✕</button></div>`; }).join('');
    if (!ws.length) h += '<div class="pnote">Пока не слежу за этой бумагой.</div>';
    h += w ? `<div class="pnote">Текущие настройки графика (${tfn}, «${esc(presetLabel())}», ${swText(curSw(), S.cfg)}) уже отслеживаются.</div>`
      : `<button class="plink" id="pbAdd">+ Следить: ${tfn} · «${esc(presetLabel())}», ${swText(curSw(), S.cfg)}</button>
         <div class="pnote">Чтобы следить с другими настройками — поменяйте на графике таймфрейм, набор или порог и нажмите ещё раз. Записей на одной бумаге может быть сколько угодно; 👁 — показать на графике настройки записи.</div>`;
    h += `<div class="pgrp">Мои уровни цены</div>`;
    h += lv.map((a) => `<div class="plv ${pf[a.id] ? 'fired' : ''}"><span>${a.dir > 0 ? '▲ выше' : '▼ ниже'} <b class="mono">${pr(a.price)}</b>${last && !pf[a.id] ? ` <small class="mut">${spc(a.price / last - 1)}</small>` : ''}${pf[a.id] ? '<br><small>сработал ' + fmtT(pf[a.id], true) + '</small>' : ''}</span><button data-pdel="${a.id}" aria-label="Удалить">✕</button></div>`).join('')
      || '<div class="pnote">Нет. Введите цену или долго нажмите на графике → «Оповестить на этой цене».</div>';
    h += `<div class="padd"><input type="text" inputmode="decimal" id="paPrice" placeholder="${last ? pr(last) : 'цена'}" autocomplete="off"><button id="paAdd">+ Уровень</button></div>`;
    const mine = jList().filter((j) => !j.closeT && j.instId === S.inst.id && (j.stop || j.target));
    if (mine.length) h += `<div class="pnote">${S.notify.mine === false ? 'Стоп и цель моих сделок из дневника — оповещения выключены в настройках.' : '📒 Стоп и цель моих сделок из дневника тоже отслеживаются.'}</div>`;
    h += `<div class="pgrp">Последние оповещения</div>${notifRows(6)}`;
    h += `<div class="pnote">${bgLine()}</div><button class="plink" id="pbAll">Все оповещения и частота проверки →</button>`;
    return h;
  }
  function bellBind() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('pbAdd', () => { addWatch(); renderHead(); fillPop(); bellAnim('wig'); });
    pop.querySelectorAll('[data-wdel]').forEach((b) => { b.onclick = () => { delWatchId(b.dataset.wdel); renderHead(); fillPop(); }; });
    pop.querySelectorAll('[data-wshow]').forEach((b) => { b.onclick = () => { showWatch(b.dataset.wshow); fillPop(); }; });
    on('paAdd', () => { const v = parseFloat(String($('#paPrice').value).replace(/\s/g, '').replace(',', '.')); if (addLevel(v)) fillPop(); else $('#paPrice').focus(); });
    const inp = $('#paPrice'); if (inp) inp.onkeydown = (e) => { if (e.key === 'Enter') $('#paAdd').click(); };
    pop.querySelectorAll('[data-pdel]').forEach((b) => { b.onclick = () => { delLevel(b.dataset.pdel); fillPop(); }; });
    on('pbAll', () => { closePop(); S.setTab = 'alerts'; save(); renderSettings(); openSheet('settings'); });
  }
  function renderBell() {
    const b = $('#bellBtn'); if (!b) return;
    const pf = D.store.get('pfired', {});
    const n = (S.palerts || []).filter((a) => a.instId === S.inst.id && !pf[a.id]).length, w = instWatches().length > 0;
    b.classList.toggle('on', w || n > 0);
    b.innerHTML = '🔔' + (n ? `<span class="cnt">${n}</span>` : '');
    // 2.41: звенит, когда сработал мой уровень, стоп/цель моей сделки или появился сигнал по 🔔
    const jf = D.store.get('jfired', {}), cur = Object.keys(pf).concat(Object.keys(jf));
    for (const w of S.watch || []) { const r = D.store.get('last.' + (w.wid || w.ticker + '.' + w.tf), null); if (r && r.plan) cur.push((w.wid || w.ticker) + ':' + r.plan); }
    if (S.bellRung && cur.some((k) => !S.bellRung.includes(k))) bellAnim('ring');
    if (!S.bellRung || cur.join() !== S.bellRung.join()) { S.bellRung = cur; save(); }
  }
  function bellAnim(cls) {
    const b = $('#bellBtn'); if (!b || !animOn()) return;
    b.classList.remove('ring', 'wig'); void b.offsetWidth; b.classList.add(cls);
    setTimeout(() => b.classList.remove(cls), cls === 'ring' ? 3100 : 700);
  }

  // ================= ТРЕНАЖЁР =================
  // История показывается до «сегодня» тренажёра; текущая свеча растёт по свечам младшего ТФ (или по пути O→H/L→C).
  // Система (сигналы и сделки бэктеста) работает только по закрытым свечам; порог — свой у тренировки (tr.sw), с 3.9 его можно менять.
  const SUB_TF = { '1w': '1d', '1d': '1h', '4h': '15m', '1h': '5m' };
  // младшие свечи для роста текущей свечи грузим кусками по ходу прокрутки (дней за раз)
  const SUB_CHUNK = { '1h': 21, '4h': 60, '1d': 180, '1w': 720 };
  // история для тренажёра грузится сама под выбранные даты: до старта — ещё «предыстория» (сколько свечей анализирует система)
  const BARS_PER_DAY = { '5m': 128, '15m': 43, '1h': 10.7, '4h': 2.9, '1d': 0.71, '1w': 0.143 };   // в среднем на календарный день
  let trHist = null;   // { key, from, bars } — подгруженная длинная история (кэш на сеанс)
  const trHistKey = () => S.inst.id + '.' + S.tf;
  function trBase() { return trHist && trHist.key === trHistKey() && trHist.bars ? trHist.bars : all.filter((b) => b.done !== false); }
  const TR_FEE = 0.0005;
  function trSetupPop() {
    const P = D.TF[S.tf].ms, iso = (d) => d.toISOString().slice(0, 10);
    const keep = $('#trDate') && $('#trDate').value, keepE = $('#trEnd') && $('#trEnd').value;
    const d0 = new Date(Date.now() - 365 * 86400000), live = !demo, base = trBase();
    return `<div class="pgrp">🎓 Тренажёр · ${esc(S.inst.ticker)} ${D.TF[S.tf].name}</div>
      <div class="pnote">С выбранной даты будущее скрыто. Текущая свеча нарастает ${SUB_TF[S.tf] ? 'по свечам ' + D.TF[SUB_TF[S.tf]].name : 'по пути открытие → максимум/минимум → закрытие'}, скорость регулируется. Система торгует рядом по своим сигналам, вы — кнопками. Деньги ненастоящие.</div>
      <div style="padding:4px 6px"><div class="row" style="gap:8px"><div class="field" style="flex:1"><label>Начать с</label><input type="date" id="trDate" value="${keep || iso(d0)}" min="${live ? '2005-01-01' : base.length ? iso(new Date(base[0].t + 100 * P)) : ''}" max="${iso(new Date(Date.now() - 2 * P))}"></div>
      <div class="field" style="flex:1"><label>Закончить (необяз.)</label><input type="date" id="trEnd" value="${keepE || ''}" max="${iso(new Date())}"></div></div>
      <div class="small mut" style="margin:-4px 0 6px">${live ? 'Любые даты — история догрузится сама (на 1ч несколько лет — до полминуты).' : 'Без токена — только свечи с графика.'}</div>
      <div class="small" style="margin:2px 0 4px">Набор: <b>${esc(presetLabel())}</b> · ${D.TF[S.tf].name} — по нему система торгует рядом с вами и подаёт сигналы.</div>
      <div class="row" style="gap:4px;flex-wrap:wrap;margin-bottom:6px">${TR_SETS.map(([k, t]) => `<button class="tg ${S.preset === k ? 'on' : ''}" data-trp="${k}" style="flex:none">${t}</button>`).join('')}</div>
      <div class="field"><label>Учебный капитал, ₽</label><input type="number" id="trCap" value="100000" step="10000" min="1000"></div>
      <label class="sw" style="border:0;padding:4px 0"><input type="checkbox" id="trAuto" ${S.trAuto === false ? '' : 'checked'}><span>Автопауза<small>останавливать прокрутку на событиях:</small></span></label>
      <div class="tgs" id="apBox">${apChips('tg')}</div></div>
      <button class="plink" id="trGo" ${base.length > 150 || live ? '' : 'disabled'}>▶ Начать</button><div class="pnote" id="trMsg">${demo ? 'Сейчас демо-данные — для настоящей истории нужен токен.' : ''}</div>`;
  }
  // догрузить историю, чтобы до старта было достаточно свечей для анализа
  async function trEnsureHist(startT, msg) {
    const need = (S.cfg.maxBars || 2000) + 50, from = startT - need / (BARS_PER_DAY[S.tf] || 1) * 86400000 * 1.1, base = trBase();
    if (demo || (base.length && base[0].t <= from)) return;
    if (trHist && trHist.key === trHistKey() && trHist.from <= from) return;   // уже пробовали так глубоко — старее нет
    msg('загружаю историю с ' + fmtT(from, false) + '…');
    const bars = (await D.loadCandles(S.token, S.inst.id, S.tf, Infinity, from)).filter((b) => b.done !== false);
    const m = new Map(bars.map((b) => [b.t, b])); for (const b of (allRaw.length ? allRaw : all)) if (b.done !== false) m.set(b.t, b);   // свежий хвост — с графика (без поправки)
    // поправка на дивиденды — заново по всей склейке, как на графике (иначе старая часть без поправки, а новая с ней)
    const r = await D.withDividends(S.token, S.inst, Array.from(m.values()).sort((a, b) => a.t - b.t), S.cfg.divAdj !== false);
    trHist = { key: trHistKey(), from, bars: r.bars, adj: r.adj };
    D.log('trainer', 'история ' + S.inst.ticker + ' ' + S.tf + ': ' + trHist.bars.length + ' свечей с ' + fmtT(trHist.bars[0].t, false));
  }
  const TR_SETS = [['d_long', 'Дневки · основной'], ['d_aggr', 'Дневки · агрессивный'], ['h4_week', '4 часа · неделя'], ['h4_fig', 'Охотник']];
  function trSetupBind() { pop.querySelectorAll('[data-trp]').forEach((b) => { b.onclick = () => { applyPreset(b.dataset.trp); fillPop(); }; }); const g = $('#trGo'); if (g) g.onclick = trStart; const a = $('#trAuto'); if (a) a.onchange = () => { S.trAuto = a.checked; save(); }; apBind(pop); }
  async function trStart() {
    const msg = (t) => { const m = $('#trMsg'); if (m) m.textContent = t; };
    const startT = Date.parse($('#trDate').value + 'T00:00:00+03:00'), endV = $('#trEnd').value, endT = endV ? Date.parse(endV + 'T23:59:59+03:00') : 0;
    const cap = Math.max(1000, Number($('#trCap').value) || 100000), auto = $('#trAuto').checked; S.trAuto = auto;
    if (!(startT > 0)) { msg('Выберите дату начала.'); return; }
    if (endT && endT <= startT) { msg('Дата окончания должна быть позже начала.'); return; }
    const g = $('#trGo'); if (g) g.disabled = true;
    try { await trEnsureHist(startT, msg); } catch (e) { msg('История не загрузилась (' + e.message + ') — беру свечи с графика.'); }
    if (g) g.disabled = false;
    let full = trBase().slice();
    if (endT) full = full.filter((b) => b.t <= endT);
    let i0 = full.findIndex((b) => b.t >= startT);
    let early = false;
    if (i0 < 100) { early = i0 < 0 || full[0].t + 100 * D.TF[S.tf].ms > startT; i0 = Math.min(100, full.length - 2); }
    if (i0 < 0 || i0 >= full.length - 1) { msg('Нет истории после этой даты.'); return; }
    const sub = {};
    const pre = full.slice(0, i0);
    const adjL = ((trHist && trHist.key === trHistKey() && trHist.bars) ? trHist.adj : divAdj) || [];
    tr = { full, sub, i0, cur: i0, j: 0, sw: curSwing() ? S.swings[swKey()] : E.autoSwing(pre.slice(-(S.cfg.maxBars || 2000)), S.cfg.swingMult || 1), swAuto: !S.swings[swKey()], playing: false, speed: S.trSpeed || 2, timer: 0, auto,
      waves: true, lastFig: null, lastTitle: '', inst: S.inst.id, tf: S.tf, cap, cash: cap, poss: [], posN: 0, selPos: 0, posOpen: false, link: false, ev: [], trades: [], orders: [], ticket: false, startT: full[i0].t, startPx: full[i0].o, lastSig: 0, lastTrN: 0, lastOpen: null, note: '', adj: adjL.map((a) => ({ t: a.t, f: a.f })) };
    closePop(); document.body.classList.add('training');
    if (early) tr.note = 'Такой ранней истории у брокера нет — начали с ' + fmtT(full[i0].t, false) + '.';
    if (endT) tr.endT = endT;
    if (SUB_TF[S.tf] && !demo) { tr.subTo = full[i0].t - 1; msg('загружаю свечи ' + D.TF[SUB_TF[S.tf]].name + '…'); await trSubLoad(); }
    D.log('trainer', 'старт ' + S.inst.ticker + ' ' + S.tf + ' с ' + fmtT(full[i0].t, false));
    trSaveBars(); trSaveState();
    trShow(true); trRenderBar();
    if (S.view.pane === 3) setPane(3);   // график на весь экран — освободить строку под кнопки
  }
  // младшие свечи подгружаются кусками вперёд по ходу тренировки; прикрепляем только к будущим свечам
  async function trSubLoad() {
    const t = tr; if (!t || t.subLoading || t.subDone) return;
    const stf = SUB_TF[t.tf], days = SUB_CHUNK[t.tf] || 30, from = t.subTo + 1, until = Math.min(Date.now(), from + days * 86400000);
    if (from >= Date.now()) { t.subDone = true; return; }
    t.subLoading = true;
    try {
      const sb = await D.loadCandles(S.token, t.inst, stf, Infinity, from, until);
      if (tr !== t) return;
      const P = D.TF[t.tf].ms; let k = Math.max(t.cur, 0);
      while (k < t.full.length && t.full[k].t < from - P) k++;
      for (const b0 of sb) {
        if (b0.t < from || b0.t > until) continue;
        // младшие свечи приходят без поправки на дивиденды — приводим к шкале дневок (иначе цена «прыгает» на размер дивидендов)
        const f = trAdjF(t, b0.t), b = f === 1 ? b0 : Object.assign({}, b0, { o: b0.o * f, h: b0.h * f, l: b0.l * f, c: b0.c * f });
        while (k < t.full.length - 1 && t.full[k + 1].t <= b.t) k++;
        if ((k > t.cur || (k === t.cur && t.j === 0)) && b.t >= t.full[k].t && b.t < (t.full[k + 1] ? t.full[k + 1].t : t.full[k].t + P)) (t.sub[k] = t.sub[k] || []).push(b);
      }
      if (!t.adj) trFixSub(t, Object.keys(t.sub));
      t.subTo = until; trSaveBars();
    } catch (e) { t.subTo = until; D.log('trainer', 'младшие свечи не загрузились: ' + e.message); }
    finally { t.subLoading = false; }
  }
  // множитель поправки на дивиденды для момента t: все отсечки, что были позже t
  function trAdjF(t, ts) { let f = 1; for (const a of t.adj || []) if (ts < a.t) f *= a.f; return f; }
  // для сессий, сохранённых до 2.22 (нет списка отсечек): подгоняем младшие свечи к закрытию дневки по отношению цен
  function trFixSub(t, keys) {
    for (const k of keys) {
      const s = t.sub[k], b = t.full[k]; if (!s || !s.length || !b) continue;
      const f = b.c / s[s.length - 1].c;
      if (f > 0.5 && f < 0.995) t.sub[k] = s.map((x) => Object.assign({}, x, { o: x.o * f, h: x.h * f, l: x.l * f, c: x.c * f }));
    }
  }
  // путь цены внутри свечи: свечи младшего ТФ или 3 точки
  function trPath(k) {
    const b = tr.full[k], s = tr.sub[k];
    if (s && s.length) return s;
    const up = b.c >= b.o, a = up ? b.l : b.h, z = up ? b.h : b.l;
    return [{ t: b.t, o: b.o, h: Math.max(b.o, a), l: Math.min(b.o, a), c: a }, { t: b.t, o: a, h: Math.max(a, z), l: Math.min(a, z), c: z }, { t: b.t, o: z, h: Math.max(z, b.c), l: Math.min(z, b.c), c: b.c }];
  }
  function trForming() {
    if (tr.cur >= tr.full.length) return null;   // история кончилась — растущей свечи нет
    const b = tr.full[tr.cur], p = trPath(tr.cur).slice(0, tr.j);
    if (!p.length) return null;
    return { t: b.t, o: p[0].o, h: Math.max(...p.map((x) => x.h)), l: Math.min(...p.map((x) => x.l)), c: p[p.length - 1].c, v: 0, done: false };
  }
  // показать состояние: все закрытые свечи до cur + растущая
  function trShow(recompute) {
    const f = trForming();
    all = tr.full.slice(0, tr.cur).concat(f ? [f] : []);
    if (recompute) {
      // график стоит на месте: сдвигаем только когда новая свеча упёрлась в правый край,
      // и сразу «страницей» — последняя свеча встаёт на 70% ширины, масштаб не трогаем
      const right0 = view.x0 + view.bars(), n0 = totalBars(), sawEnd = view.init && n0 - 1 <= right0 + view.bars() * 0.5;   // конец виден или чуть за краем (после зума)
      compute(true);
      const n = totalBars();
      if (sawEnd && n - 1 > view.x0 + view.bars() - 1.5) view.x0 = Math.max(0, n - view.bars() * 0.7);
      trEvents();
    }
    renderQuote(); draw();
    if (popFor === 'trPl') fillPop();   // «План» открыт — обновляем вместе со свечами
  }
  const trPx = () => (all.length ? all[all.length - 1].c : 0);
  // автопауза по видам событий — настраивается в форме старта и в «Слои ▾»
  const AP_KINDS = [['sig', 'Сигналы системы'], ['sys', 'Сделки системы'], ['fig', 'Фигуры'], ['mine', 'Мои стопы, цели, ордера']];
  const apOn = (k) => (S.trAP || {})[k] !== false;
  const apChips = (cls) => AP_KINDS.map(([k, t]) => `<button class="${cls} ${apOn(k) ? 'on' : ''}" data-ap="${k}">${t}</button>`).join('');
  function apBind(root, after) { root.querySelectorAll('[data-ap]').forEach((b) => { b.onclick = () => { S.trAP = Object.assign({}, S.trAP); S.trAP[b.dataset.ap] = !apOn(b.dataset.ap); save(); if (after) after(); else b.classList.toggle('on', apOn(b.dataset.ap)); }; }); }
  // события для автопаузы: сигнал/сделка системы на только что закрытой свече
  function trEvents() {
    if (!an || !an.N) return;
    const N = an.N, notes = []; let stop = false;
    const add = (k, t) => { notes.push(t); if (k !== 'figoff' && apOn(k)) stop = true; };
    if (an.plan && an.planActive && an.plan.sigBar === N - 1 && tr.lastSig !== an.bars[N - 1].t) { tr.lastSig = an.bars[N - 1].t; add('sig', tr.waves ? 'Система: сигнал на ' + (an.plan.side > 0 ? 'покупку' : 'продажу') + ' (' + E.SETUP_NAME[an.plan.setup] + '), вход на открытии, стоп ' + pr(an.plan.stop) : 'Система увидела сигнал — ваш вариант? 🌊 — сверить'); }
    const ot = an.openTrade;
    if (ot && ot.iEntry === N - 1 && tr.lastOpen !== an.bars[ot.iEntry].t) { tr.lastOpen = an.bars[ot.iEntry].t; add('sys', tr.waves ? 'Система ' + (ot.side > 0 ? 'купила' : 'продала') + ' по ' + pr(ot.entry) + ', стоп ' + pr(ot.stop0) : 'Система вошла в сделку'); }
    const lt = an.trades.filter((t) => t.reason !== 3).pop();
    if (lt && lt.iExit === N - 1 && an.trades.length !== tr.lastTrN) add('sys', tr.waves ? 'Система вышла: ' + E.REASON_NAME[lt.reason] + ', ' + f2(lt.NR) + ' R' : 'Система вышла из сделки');
    tr.lastTrN = an.trades.length;
    // доливка по Вильямсу: волна 3 прошла 110% волны 1
    // ключ — время входа (не номер свечи: при длинной истории окно анализа сдвигается и номера меняются каждую свечу)
    const otKey = ot ? an.bars[ot.iEntry].t : 0;
    if (ot && ot.add && ot.add.i === N - 1 && tr.lastAddEv !== otKey) { tr.lastAddEv = otKey; tr.lastAddHint = otKey; add('sys', tr.waves ? 'Система долила по Вильямсу: волна 3 прошла 110% волны 1 (' + pr(ot.add.px) + ')' : 'Система долила позицию'); }
    else if (ot && ot.addLvl && !ot.add && tr.lastAddHint !== otKey && (ot.side > 0 ? an.bars[N - 1].h >= ot.addLvl : an.bars[N - 1].l <= ot.addLvl)) { tr.lastAddHint = otKey; add('sig', 'Волна 3 прошла 110% волны 1 (' + pr(ot.addLvl) + ') — по Вильямсу здесь можно добрать'); }
    // безубыток: система (режим «переносить») / подсказка по сделке системы / ваши позиции
    if (tr.waves) {
      const beAuto = S.cfg.beMode === 'auto';
      if (ot && beAuto && ot.beOn === N - 1 && tr.lastBeSys !== otKey) { tr.lastBeSys = otKey; add('sys', 'Система перевела стоп в безубыток (' + (ot.beWhy || '') + '): ' + pr(ot.stop)); }
      if (ot && !beAuto && an.shadow && an.shadow.length) {
        const sh = an.shadow[an.shadow.length - 1], stp = sh && sh.steps.length ? sh.steps[sh.steps.length - 1] : null;
        if (stp && stp.bar === N - 1 && tr.lastBeHint !== otKey + ':' + stp.p) { tr.lastBeHint = otKey + ':' + stp.p; add('sig', 'Подсказка: стоп сделки системы — в безубыток ' + pr(stp.p) + (stp.why ? ' (' + stp.why + ')' : '')); }
      }
    }
    for (const q of tr.poss) {
      if (q.stop && q.stop0 == null && q.side * (q.entry - q.stop) > 0) q.stop0 = q.stop;   // первый «защитный» стоп — мера риска (R)
      if (q.beHint || (q.stop && q.side * (q.stop - q.entry) >= 0)) continue;              // уже подсказали или стоп и так в безубытке
      const iE = an.bars.findIndex((b) => b.t >= q.t); if (iE < 0) continue;
      const r = E.beCheck(an.bars, Object.assign({}, S.cfg, { mkt: S.cfg.addMarket ? mktFor(S.tf) : null }), { side: q.side, entry: q.entry, stop0: q.stop0 || q.stop || q.entry, iEntry: iE });
      if (r && r.i === N - 1) { q.beHint = true; add('mine', 'Пора в безубыток' + (tr.poss.length > 1 ? ' #' + q.id : '') + ': ' + r.why + ' — стоп на ' + pr(r.be) + ' (кнопка «БУ» у позиции)'); }
      else if (r) q.beHint = true;   // условие сработало раньше — повторно не дёргаем
    }
    // рождение фигуры: последняя найденная фигура закончилась на одной из последних свечей
    const lf = an.figures && an.figures.length ? an.figures[an.figures.length - 1] : null;
    if (lf) {
      // фигура «рождается», когда подтверждён её последний разворот — это бывает на несколько свечей позже самой вершины
      const endI = lf.idx[lf.n - 1], endT = an.bars[endI] ? an.bars[endI].t : 0, key = lf.kind + ':' + endT;
      if (tr.lastFig === null) { tr.lastFig = key; tr.lastFigT = endT; }   // на старте — не событие
      else if (key !== tr.lastFig && endT > (tr.lastFigT || 0)) {
        tr.lastFig = key; tr.lastFigT = endT;
        add('fig', tr.waves ? 'Сформировалась фигура: ' + (lf.title || FIG_FULL[lf.kind]) + ([0, 1].includes(lf.kind) ? ' (1-2-3-4-5)' : [2, 3].includes(lf.kind) ? ' (A-B-C)' : ' (A-B-C-D-E)')
          + (lf.kind === 1 ? ' — клин завершён: по книге резкий разворот, обычно минимум к началу клина ' + pr(lf.px[0]) + ' (на истории доходит примерно в трети случаев)' : '')
          : 'Сформировалась фигура — нажмите 🌊 и сверьте со своим подсчётом');
      }
    }
    if (an.title && an.title !== tr.lastTitle) { if (tr.lastTitle && tr.waves && !notes.length) tr.subnote = 'Подсчёт: ' + an.title; tr.lastTitle = an.title; }
    notes.forEach((t) => trLog('система', t, an.bars[N - 1].t));   // событие на закрытии свечи
    if (notes.length) { tr.note = notes.join(' · '); if (tr.auto && stop && tr.playing) { trPause(); D.log('trainer', 'автопауза: ' + tr.note); } }
  }
  // ваши заявки исполняются по пути цены
  function trCheckOrders(sb) {
    // отложенные ордера: лимит — по цене или лучше, стоп — при пробое цены
    // каждый ордер сам по себе (как в MT5): исполнился — снимается только он
    for (const o of tr.orders.slice()) {
      const hit = o.side > 0 ? (o.type === 'limit' ? sb.l <= o.price : sb.h >= o.price) : (o.type === 'limit' ? sb.h >= o.price : sb.l <= o.price);
      if (!hit) continue;
      const fill = o.type === 'limit' ? (o.side > 0 ? Math.min(sb.o, o.price) : Math.max(sb.o, o.price)) : (o.side > 0 ? Math.max(sb.o, o.price) : Math.min(sb.o, o.price));
      tr.orders.splice(tr.orders.indexOf(o), 1);
      const nm = (o.side > 0 ? 'Buy ' : 'Sell ') + o.type;
      if (trOpen(o.side, { px: fill, sl: o.sl, tp: o.tp, pct: o.pct, quiet: true, why: 'исполнен ордер ' + nm })) tr.note = 'Исполнен отложенный ордер ' + nm + ' по ' + pr(fill);
      else { tr.note = 'Ордер ' + nm + ' ' + pr(fill) + ' снят: не хватило свободных денег'; trLog('вы', tr.note); }
      if (tr.auto && apOn('mine')) trPause();
    }
    for (const p of tr.poss.slice()) {
      const hitStop = p.stop && (p.side > 0 ? sb.l <= p.stop : sb.h >= p.stop), hitTgt = p.target && (p.side > 0 ? sb.h >= p.target : sb.l <= p.target);
      const nm = tr.poss.length > 1 ? ' (#' + p.id + ')' : '';
      if (hitStop) { trClose(p.id, p.side > 0 ? Math.min(sb.o, p.stop) : Math.max(sb.o, p.stop), 'ваш стоп'); tr.note = 'Сработал ваш стоп' + nm; if (tr.auto && apOn('mine')) trPause(); }
      else if (hitTgt) { trClose(p.id, p.side > 0 ? Math.max(sb.o, p.target) : Math.min(sb.o, p.target), 'ваша цель'); tr.note = 'Сработала ваша цель' + nm; if (tr.auto && apOn('mine')) trPause(); }
    }
  }
  function trStep() {
    if (!tr) return;
    // заранее подгрузить следующий кусок младших свечей
    if (tr.subTo && !tr.subDone && !tr.subLoading && tr.cur < tr.full.length && tr.full[tr.cur].t > tr.subTo - (SUB_CHUNK[tr.tf] || 30) * 86400000 / 3) trSubLoad();
    if (tr.cur >= tr.full.length) { trPause(); tr.note = tr.endT ? 'Дошли до даты окончания — итоги ниже' : 'История закончилась — итоги ниже'; tr.finished = true; trRenderBar(); renderPanel(); $('#panel').scrollTop = 0; return; }
    const path = trPath(tr.cur);
    if (tr.j < path.length) { tr.j++; trCheckOrders(path[tr.j - 1]); trShow(false); }
    if (tr.j >= path.length) { tr.cur++; tr.j = 0; trShow(true); }
    trRenderBar();
  }
  function trBarStep() { if (!tr) return; const k = tr.cur; let n = 0; while (tr && tr.cur === k && n++ < 500) trStep(); }
  function trPlay() { if (!tr) return; tr.playing = true; trTick(); trRenderBar(); }
  function trPause() { if (!tr) return; tr.playing = false; clearTimeout(tr.timer); trRenderBar(); }
  function trTick() { if (!tr || !tr.playing) return; trStep(); if (tr && tr.playing) tr.timer = setTimeout(trTick, 1000 / tr.speed); }
  // позиций может быть несколько (как в тестере MT5): каждая со своими SL/TP; Sell при покупке открывает отдельную продажу
  const trFree = (px) => trEq() - tr.poss.reduce((s, q) => s + q.qty * (px || trPx()), 0);   // без плеча: в бумагах не больше капитала
  function trOpen(side, o) {
    o = o || {};
    const px = o.px || trPx(); if (!(px > 0)) return false;
    const pct = (o.pct || S.trPct || 100) / 100, free = trFree(px);
    const qty = Math.floor(Math.min(trEq() * pct, free) / (px * (1 + TR_FEE)));
    if (qty < 1) { if (!o.quiet) { tr.note = 'Не хватает свободных денег: свободно ' + Math.max(0, Math.round(free)).toLocaleString('ru-RU') + ' ₽. Закройте позицию или уменьшите объём в «Ордер ▾».'; trRenderBar(); } return false; }
    if (side > 0) tr.cash -= qty * px * (1 + TR_FEE); else tr.cash += qty * px * (1 - TR_FEE);   // шорт: получили деньги, должны бумаги
    const p = { id: ++tr.posN, side, qty, entry: px, t: trNowT(), stop: o.sl || null, target: o.tp || null };
    if (tr.link && !o.sl && !o.tp) { const mate = tr.poss.find((x) => x.side === side); if (mate) { p.stop = mate.stop; p.target = mate.target; } }   // общий SL/TP — новая позиция встаёт в общий строй
    tr.poss.push(p); tr.selPos = p.id;
    trLog('вы', (o.why ? 'По ордеру (' + o.why.replace('исполнен ордер ', '') + '): ' : '') + (side > 0 ? 'Купили ' : 'Продали ') + qty + ' шт по ' + pr(px) + (tr.poss.length > 1 ? ' (#' + p.id + ')' : '') + (p.stop ? ', SL ' + pr(p.stop) : '') + (p.target ? ', TP ' + pr(p.target) : ''));
    D.log('trainer', (side > 0 ? 'покупка ' : 'продажа ') + qty + ' по ' + px);
    trRenderBar(); renderPanel(); draw();
    return true;
  }
  function trClose(id, px, why) {
    const p = tr.poss.find((q) => q.id === id); if (!p) return;
    px = px || trPx();
    if (p.side > 0) tr.cash += p.qty * px * (1 - TR_FEE); else tr.cash -= p.qty * px * (1 + TR_FEE);
    const pl = p.side > 0 ? p.qty * (px * (1 - TR_FEE) - p.entry * (1 + TR_FEE)) : p.qty * (p.entry * (1 - TR_FEE) - px * (1 + TR_FEE));
    tr.trades.push({ side: p.side, qty: p.qty, entry: p.entry, exit: px, t0: p.t, t1: trNowT(), pl, why: why || 'вы закрыли', stop: p.stop, target: p.target });
    trLog('вы', 'Закрыто' + (tr.poss.length > 1 ? ' #' + p.id : '') + ' по ' + pr(px) + ' — ' + (why || 'вы закрыли') + ', ' + (pl >= 0 ? '+' : '−') + Math.round(Math.abs(pl)).toLocaleString('ru-RU') + ' ₽');
    tr.poss.splice(tr.poss.indexOf(p), 1);
    trRenderBar(); renderPanel(); draw();
  }
  // журнал событий тренировки — для списка в карточке и выгрузки
  // время «сейчас» в тренажёре — свеча, которая сейчас растёт (сделка исполняется внутри неё)
  const trNowT = () => (tr.cur < tr.full.length ? tr.full[tr.cur].t : all.length ? all[all.length - 1].t : 0);
  function trLog(kind, text, t) { if (!tr) return; tr.ev.push({ t: t || trNowT(), kind, text }); if (tr.ev.length > 2000) tr.ev.shift(); }
  const pnm = (q) => (tr.poss.length > 1 || q.id > 1 ? ' #' + q.id : '');
  const lvTxt = (v) => (v ? pr(v) : 'нет');
  // запись в журнал смены SL/TP: «SL #2: 245.10 → 247.85 (перетащили)»
  function trLvLog(q, k, from, to, how) { if (!q || from === to) return; trLog('вы', (k === 'stop' ? 'SL' : 'TP') + pnm(q) + ': ' + lvTxt(from) + ' → ' + lvTxt(to) + (how ? ' (' + how + ')' : '')); }
  // общие SL/TP (кнопка 🔗): уровень меняется сразу у всех позиций той же стороны
  const linkedOf = (q) => (tr.link ? tr.poss.filter((x) => x.side === q.side) : [q]);
  function trSetLv(q, k, val, how, from) {
    const grp = linkedOf(q), old = from !== undefined ? from : q[k];
    grp.forEach((x) => { x[k] = val; });
    if (grp.length > 1) { if (old !== val) trLog('вы', (k === 'stop' ? 'SL' : 'TP') + ' всем (' + grp.length + '): ' + lvTxt(old) + ' → ' + lvTxt(val) + (how ? ' (' + how + ')' : '')); }
    else trLvLog(q, k, old, val, how);
  }
  const ordTxt = (o) => (o.side > 0 ? 'Buy ' : 'Sell ') + o.type + ' ' + pr(o.price) + (o.sl ? ', SL ' + pr(o.sl) : '') + (o.tp ? ', TP ' + pr(o.tp) : '');
  const trSel = () => (tr && tr.poss.length ? tr.poss.find((q) => q.id === tr.selPos) || tr.poss[tr.poss.length - 1] : null);
  const trEq = () => tr.cash + tr.poss.reduce((s, q) => s + q.side * q.qty * trPx(), 0);
  // «План» в тренажёре: карточка «Сейчас» (фаза, светофор, план сигнала, открытая сделка системы) — поверх графика, без прокрутки
  function trPlanPop() {
    const nc = document.getElementById('nowCard');
    if (!tr.waves) return '<div class="pnote">Разметка скрыта (🌊 выключена) — план системы не показываем, чтобы не подсказывать.</div>';
    // стоп и цель — кнопками: в заявку (Ордер ▾) или выбранной позиции
    const p = an && an.plan && an.planActive ? an.plan : null, ot = an && an.openTrade, q = trSel();
    const lv = (k, v, t) => v ? `<button class="tg" data-pl="${k}" data-v="${v}">${t} ${pr(v)}</button>` : '';
    let act = '';
    if (p) act += `<div class="pgrp">Сигнал ${p.side > 0 ? 'на покупку' : 'на продажу'} → в заявку</div><div class="tgs">${lv('sl', p.stop, '🛑 SL')}${p.notgt ? '' : lv('tp', p.target, '🎯 TP')}${p.notgt ? '' : `<button class="tg" data-pl="both">Оба</button>`}</div>`;
    if (ot) act += `<div class="pgrp">Сделка системы (${ot.side > 0 ? 'покупка' : 'продажа'} от ${pr(ot.entry)}) → в заявку</div><div class="tgs">${lv('sl', ot.stop, '🛑 SL')}${ot.notgt || !ot.target ? '' : lv('tp', ot.target, '🎯 TP')}</div>`;
    if (q && (p || ot)) { const src = p && p.side === q.side ? p : ot && ot.side === q.side ? ot : null;
      if (src) act += `<div class="pgrp">Моей позиции ${tr.poss.length > 1 ? '#' + q.id + ' ' : ''}(${q.side > 0 ? 'покупка' : 'продажа'} от ${pr(q.entry)})</div><div class="tgs">${lv('psl', src.stop, '🛑 SL')}${src.notgt || !src.target ? '' : lv('ptp', src.target, '🎯 TP')}</div>`; }
    if (act) act = '<div class="trplanAct">' + act + '<div class="pnote">Нажмите уровень — он встанет в SL/TP заявки (откроется «Ордер ▾»); для позиции — сразу в её стоп/цель.</div></div>';
    return nc ? '<div class="trplan"><div class="pgrp">План и состояние · ' + esc(tr.cur < tr.full.length ? fmtT(tr.full[tr.cur].t, S.tf !== '1d' && S.tf !== '1w') : '') + '</div>' + nc.innerHTML.replace(/<h3>[\s\S]*?<\/h3>/, '').replace(/ id="[^"]*"/g, '') + act + '</div>' : '<div class="pnote">Анализа пока нет.</div>';
  }
  function trPlanBind() {
    pop.querySelectorAll('[data-pl]').forEach((b) => { b.onclick = () => {
      const k = b.dataset.pl, v = Number(b.dataset.v), p = an && an.plan && an.planActive ? an.plan : null;
      if (k === 'psl' || k === 'ptp') {
        const q = trSel(); if (!q) return;
        const key = k === 'psl' ? 'stop' : 'target', bad = key === 'stop' ? q.side * (v - trPx()) >= 0 : q.side * (v - trPx()) <= 0;
        if (bad) { tr.note = (key === 'stop' ? 'SL' : 'TP') + ' ' + pr(v) + ' уже по другую сторону цены — не ставлю'; trRenderBar(); return; }
        trSetLv(q, key, +v.toFixed(4), 'из плана'); tr.note = (key === 'stop' ? 'SL' : 'TP') + ' позиции = ' + pr(v);
      } else {
        const rd = (id) => { const el = document.getElementById(id); const x = el ? parseFloat(String(el.value).replace(',', '.')) : NaN; return x > 0 ? x : null; };
        if (tr.ticket && document.getElementById('tkSL')) tr.tk = { sl: rd('tkSL'), tp: rd('tkTP') };   // уже введённое руками не теряем
        tr.ticket = true; tr.tk = Object.assign({}, tr.tk || {});
        if (k === 'sl') tr.tk.sl = +v.toFixed(4);
        else if (k === 'tp') tr.tk.tp = +v.toFixed(4);
        else if (k === 'both' && p) { tr.tk.sl = +p.stop.toFixed(4); tr.tk.tp = p.notgt ? null : +p.target.toFixed(4); }
        tr.note = 'В заявке: SL ' + (tr.tk.sl ? pr(tr.tk.sl) : '—') + ' · TP ' + (tr.tk.tp ? pr(tr.tk.tp) : '—') + ' — жмите Buy/Sell или «по цене»';
      }
      trRenderBar(); draw(); fillPop();
    }; });
  }
  // 2.42: главное из «Плана» — одной строкой под кнопками, без прокрутки панели; нажатие открывает полный план
  function trPlanStrip() {
    if (!tr.waves || !an) return '';
    const ot = an.openTrade, p = an.plan && an.planActive ? an.plan : null;
    const t = ot ? `<b class="${ot.side > 0 ? 'pos' : 'neg'}">Сделка системы: ${ot.side > 0 ? 'покупка' : 'продажа'}</b> от ${pr(ot.entry)} · стоп ${pr(ot.stop)}${ot.notgt || !ot.target ? '' : ' · цель ' + pr(ot.target)} · <span class="${ot.R >= 0 ? 'pos' : 'neg'}">${f2(ot.R)} R</span>`
      : p ? `<b class="${p.side > 0 ? 'pos' : 'neg'}">ПЛАН: ${p.side > 0 ? 'ПОКУПКА' : 'ПРОДАЖА'}</b> · вход ~${pr(p.entry)} · стоп ${pr(p.stop)}${p.notgt ? '' : ' · цель ' + pr(p.target)}`
      : 'ПЛАН: ждать подтверждения разворота';
    return `<div class="row trps" id="trPlS" role="button"><span class="inf">${t} <span class="mut">▸ подробнее</span></span></div>`;
  }
  function trRenderBar() {
    const B = $('#trBar'); if (!B) return;
    if (!tr) { B.hidden = true; renderTrQuick(); return; }
    B.hidden = false;
    const p = trSel(), px = trPx(), path = trPath(Math.min(tr.cur, tr.full.length - 1));
    const uplOf = (q) => (q.side > 0 ? px / q.entry - 1 : q.entry / px - 1), many = tr.poss.length > 1;
    const plSum = tr.poss.reduce((s, q) => s + q.side * q.qty * (px - q.entry), 0);
    const sp = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30], big = [1, 4, 15, 30];
    B.innerHTML = `<div class="row"><button id="trPP">${tr.playing ? '⏸' : '▶'}</button><button id="trS1" title="шаг">+1</button><button id="trSB" title="до конца свечи">⏭</button><button id="trW" class="${tr.waves ? 'on' : ''}" title="волновая разметка">🌊</button>
      <span class="spdg"><button id="trSm" aria-label="медленнее">−</button><button id="trSx" class="spdv" title="быстро переключить: 1 → 4 → 15 → 30 шагов/с">${tr.speed < 1 ? (1 / tr.speed) + ' с/шаг' : tr.speed + '/с'}<small>⏩</small></button><button id="trSp" aria-label="быстрее">+</button></span><button id="trX" class="${tr.finished && tr.xPane != null ? 'on' : ''}" aria-label="Закончить" title="итоги на весь экран; ещё раз — вернуть график">✕</button></div>
      <div class="row"><button id="trB" class="buy">Buy</button><button id="trSl" class="sell">Sell</button><button id="trTk" class="${tr.ticket ? 'on' : ''}">Ордер ▾</button><button id="trPl" class="${popFor === 'trPl' ? 'on' : ''}" title="план сигнала и открытая сделка системы">План</button><button id="trLy" class="${popFor === 'trBar' ? 'on' : ''}">Слои ▾</button></div>
      <div class="small mut" style="margin:2px 2px 0">🕒 ${tr.cur < tr.full.length ? fmtT(tr.full[tr.cur].t, S.tf !== '1d' && S.tf !== '1w') + ' · шаг ' + tr.j + '/' + path.length : 'конец истории'} · капитал ${Math.round(trEq()).toLocaleString('ru-RU')} ₽</div>
      ${trPlanStrip()}
      ${tr.ticket ? `<div class="row"><span class="inf" style="flex:none">Объём</span><select id="trPct" class="tin" style="flex:none;width:auto">${[10, 25, 50, 100].map((v) => `<option value="${v}" ${(S.trPct || 100) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select><span class="inf" style="flex:none">SL</span><input type="number" step="any" id="tkSL" class="tin" value="${tr.tk && tr.tk.sl ? tr.tk.sl : ''}" placeholder="нет"><span class="inf" style="flex:none">TP</span><input type="number" step="any" id="tkTP" class="tin" value="${tr.tk && tr.tk.tp ? tr.tk.tp : ''}" placeholder="нет"></div>
        <div class="row"><span class="inf" style="flex:none">Цена</span><input type="number" step="any" id="tkPx" class="tin" placeholder="${pr(trPx())}"><button id="tkBuyP">Buy по цене</button><button id="tkSellP">Sell по цене</button></div>
        ${an && an.plan && an.planActive ? `<div class="row"><button id="tkPlan">Взять SL/TP из сигнала системы</button></div>` : ''}` : ''}
      ${many ? `<div class="row psum" id="trPsum"><span class="inf">${tr.posOpen ? '▴' : '▾'} Позиций: ${tr.poss.length} · итого <span class="${plSum >= 0 ? 'pos' : 'neg'}">${plSum >= 0 ? '+' : '−'}${Math.round(Math.abs(plSum)).toLocaleString('ru-RU')} ₽</span> · свободно ${Math.max(0, Math.round(trFree())).toLocaleString('ru-RU')} ₽</span><button id="trLink" class="${tr.link ? 'on' : ''}" title="один SL/TP на все позиции">🔗 SL/TP всем</button><button id="trCA">Закрыть все</button></div>` : ''}
      ${!many || tr.posOpen ? `<div class="plist">${tr.poss.map((q) => `<div class="row prow ${many && q === p ? 'sel' : ''}" data-psel="${q.id}"><span class="inf">${q.side > 0 ? '▲' : '▼'}${many ? ' #' + q.id : ''} ${q.qty} шт · ${pr(q.entry)} · <span class="${uplOf(q) >= 0 ? 'pos' : 'neg'}">${spc(uplOf(q))}</span>${q.stop ? ' · SL ' + pr(q.stop) : ''}${q.target ? ' · TP ' + pr(q.target) : ''}</span><button data-pbe="${q.id}" title="стоп в безубыток">БУ</button><button data-pcl="${q.id}">Закрыть</button></div>`).join('')}</div>
      ${p ? `<div class="row"><span class="inf" style="flex:none">${many ? '#' + p.id + ' ' : ''}SL</span><input type="number" step="any" id="trSL" class="tin" value="${p.stop ? +p.stop.toFixed(4) : ''}" placeholder="нет"><span class="inf" style="flex:none">TP</span><input type="number" step="any" id="trTP" class="tin" value="${p.target ? +p.target.toFixed(4) : ''}" placeholder="нет"><button id="trSet">✓</button></div>` : ''}` : ''}
      ${tr.orders.length ? `<div class="row">${tr.orders.map((o, k) => `<span class="inf" style="flex:none">⏳ ${o.side > 0 ? 'Buy' : 'Sell'} ${o.type} ${pr(o.price)}${o.sl ? ' SL ' + pr(o.sl) : ''}${o.tp ? ' TP ' + pr(o.tp) : ''}</span><button data-odel="${k}">✕</button>`).join('')}</div>` : ''}
      ${tr.note ? `<div class="inf warn" style="white-space:normal">${esc(tr.note)}</div>` : tr.subnote && tr.waves ? `<div class="inf" style="white-space:normal">${esc(tr.subnote)}</div>` : ''}`;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('trPP', () => { tr.note = ''; tr.playing ? trPause() : trPlay(); });
    on('trS1', () => { trPause(); tr.note = ''; trStep(); });
    on('trSB', () => { trPause(); tr.note = ''; trBarStep(); });
    const num = (id) => { const el = $('#' + id); const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN; return v > 0 ? v : null; };
    const tkRead = () => { tr.tk = { sl: num('tkSL'), tp: num('tkTP') }; return tr.tk; };
    const okLevels = (side, px, sl, tp) => { if (sl && (side > 0 ? sl >= px : sl <= px)) return 'SL должен быть ' + (side > 0 ? 'ниже' : 'выше') + ' цены входа'; if (tp && (side > 0 ? tp <= px : tp >= px)) return 'TP должен быть ' + (side > 0 ? 'выше' : 'ниже') + ' цены входа'; return ''; };
    const mkt = (side) => { const k = tr.ticket ? tkRead() : {}; const e = okLevels(side, trPx(), k.sl, k.tp); if (e) { tr.note = e; trRenderBar(); return; } tr.note = ''; trOpen(side, { sl: k.sl, tp: k.tp }); };
    on('trB', () => mkt(1)); on('trSl', () => mkt(-1)); trMkt = mkt; renderTrQuick(); trSaveSoon();
    on('trPsum', () => { tr.posOpen = !tr.posOpen; trRenderBar(); });
    on('trLink', (e) => {
      e.stopPropagation(); tr.link = !tr.link;
      const q = trSel();
      if (tr.link && q) {   // включили — выровнять все по выбранной позиции
        for (const k of ['stop', 'target']) { const grp = linkedOf(q), diff = grp.some((x) => x[k] !== q[k]); if (diff && q[k]) { grp.forEach((x) => { x[k] = q[k]; }); trLog('вы', (k === 'stop' ? 'SL' : 'TP') + ' всем (' + grp.length + ') = ' + pr(q[k]) + ' (по #' + q.id + ')'); } }
        tr.note = 'Общие SL/TP включены: двигаете один — двигаются все' + (tr.poss.some((x) => x.side !== q.side) ? ' (' + (q.side > 0 ? 'покупки' : 'продажи') + ' отдельно от ' + (q.side > 0 ? 'продаж' : 'покупок') + ')' : '');
      } else tr.note = 'Общие SL/TP выключены — у каждой позиции свои';
      trRenderBar(); renderPanel(); draw();
    });
    on('trCA', (e) => { e.stopPropagation(); for (const q of tr.poss.slice()) trClose(q.id, null, 'вы закрыли все'); tr.note = 'Все позиции закрыты'; trRenderBar(); });
    B.querySelectorAll('[data-pcl]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); trClose(Number(b.dataset.pcl), null, 'вы закрыли'); }; });
    B.querySelectorAll('[data-pbe]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const q = tr.poss.find((x) => x.id === Number(b.dataset.pbe)); if (!q) return; trLvLog(q, 'stop', q.stop, q.entry, 'безубыток'); q.stop = q.entry; tr.selPos = q.id; tr.note = 'Стоп в безубыток: ' + pr(q.entry); trRenderBar(); draw(); }; });
    B.querySelectorAll('[data-psel]').forEach((r) => { r.onclick = () => { tr.selPos = Number(r.dataset.psel); trRenderBar(); draw(); }; });
    on('trTk', () => { tr.ticket = !tr.ticket; trRenderBar(); });
    on('trW', () => { trToggleWaves(); if (popFor === 'trBar') fillPop(); });
    on('trLy', () => togglePop('trBar', trLayersPop, trLayersBind));
    const pp = $('#trPct'); if (pp) pp.onchange = () => { S.trPct = Number(pp.value); save(); };
    const pend = (side) => { const k = tkRead(), price = num('tkPx'); if (!price) { tr.note = 'Укажите цену ордера'; trRenderBar(); return; }
      const cur = trPx(), type = side > 0 ? (price < cur ? 'limit' : 'stop') : (price > cur ? 'limit' : 'stop'), e = okLevels(side, price, k.sl, k.tp);
      if (e) { tr.note = e; trRenderBar(); return; }
      tr.orders.push({ side, price, type, sl: k.sl, tp: k.tp, pct: S.trPct || 100 }); trLog('вы', 'Выставлен ордер ' + ordTxt(tr.orders[tr.orders.length - 1])); tr.note = 'Выставлен ' + (side > 0 ? 'Buy ' : 'Sell ') + type + ' ' + pr(price); trRenderBar(); draw(); };
    on('tkBuyP', () => pend(1)); on('tkSellP', () => pend(-1));
    on('tkPlan', () => { const p2 = an.plan; tr.tk = { sl: +p2.stop.toFixed(4), tp: p2.notgt ? null : +p2.target.toFixed(4) }; trRenderBar(); });
    B.querySelectorAll('[data-odel]').forEach((b) => { b.onclick = () => { const o = tr.orders.splice(Number(b.dataset.odel), 1)[0]; if (o) trLog('вы', 'Снят ордер ' + ordTxt(o)); trRenderBar(); draw(); }; });
    on('trSet', () => { const q = trSel(); if (!q) return; const sl = num('trSL'), tp = num('trTP'), e = okLevels(q.side, trPx(), sl, tp); if (e && !(sl && sl === q.entry)) { tr.note = e.replace('цены входа', 'текущей цены'); trRenderBar(); return; } if (sl !== q.stop) trSetLv(q, 'stop', sl, 'вручную'); if (tp !== q.target) trSetLv(q, 'target', tp, 'вручную'); tr.note = 'SL/TP изменены' + (tr.link && tr.poss.length > 1 ? ' у всех' : tr.poss.length > 1 ? ' (#' + q.id + ')' : ''); trRenderBar(); renderPanel(); draw(); });
    // ✕ — итоги тренировки на весь экран; повторное нажатие — вернуть график как было и продолжить
    on('trX', () => {
      if (tr.finished && tr.xPane != null) { const k = tr.xPane; tr.xPane = null; tr.finished = false; setPane(k); renderPanel(); trRenderBar(); return; }
      trPause(); tr.xPane = S.view.pane || 0; tr.finished = true; setPane(2); renderPanel(); $('#panel').scrollTop = 0; trRenderBar();
    });
    on('trPl', () => togglePop('trPl', trPlanPop, trPlanBind));
    on('trPlS', () => togglePop('trPl', trPlanPop, trPlanBind));
    const setSpd = (v) => { tr.speed = v; S.trSpeed = v; save(); if (tr.playing) { clearTimeout(tr.timer); tr.timer = setTimeout(trTick, 1000 / tr.speed); } trRenderBar(); };
    const si = () => { let k = sp.indexOf(tr.speed); if (k < 0) k = sp.findIndex((v) => v > tr.speed) - 1; return Math.max(0, k); };
    on('trSm', () => setSpd(sp[Math.max(0, si() - 1)]));
    on('trSp', () => setSpd(sp[Math.min(sp.length - 1, si() + 1)]));
    on('trSx', () => setSpd(big.find((v) => v > tr.speed) || big[0]));
  }
  { const hu = $('#hud'); if (hu) hu.onclick = (e) => { if (e.target.closest('[data-hudt]')) { S.view.hudMini = !S.view.hudMini; save(); draw(); return; } if (document.body.classList.contains('chartfull')) setPane(0); setTimeout(() => { const c = $('#nowCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250); }; }
  let trMkt = null;   // рыночная заявка с учётом «Ордер ▾» (задаётся в trRenderBar)
  function renderTrQuick() {
    const q = $('#trQuick'); if (!q) return;
    if (!tr) { q.hidden = true; return; }
    const px = pr(trPx());
    q.innerHTML = `<button class="qs" id="qSell">SELL<small>${px}</small></button><button class="qb" id="qBuy">BUY<small>${px}</small></button>`;
    q.hidden = false;
    $('#qSell').onclick = (e) => { e.stopPropagation(); if (trMkt) trMkt(-1); };
    $('#qBuy').onclick = (e) => { e.stopPropagation(); if (trMkt) trMkt(1); };
  }
  function trToggleWaves() { tr.waves = !tr.waves; tr.note = tr.waves ? 'Разметка показана' + (an && an.title ? ': ' + an.title : '') : 'Разметка скрыта — считайте волны сами, 🌊 — сверить'; trRenderBar(); renderPanel(); draw(); }
  function trLongPress(x, y) {
    const price = view.hi - (y - 6) / ((view.ph || 300) - 12) * (view.hi - view.lo), lv = Number(pr(price).replace(',', '.'));
    const m = $('#ctxMenu');
    const cur = trPx();
    const q = trSel(), nm = q && tr.poss.length > 1 ? ' (#' + q.id + ')' : '';
    m.innerHTML = `<div class="small">${pr(lv)}</div><button id="trPB">⏳ Buy ${lv < cur ? 'limit' : 'stop'} здесь</button><button id="trPS">⏳ Sell ${lv > cur ? 'limit' : 'stop'} здесь</button>`
      + (q ? `<button id="trStopHere">🛑 Стоп здесь${tr.link && tr.poss.length > 1 ? ' (всем)' : nm}</button><button id="trTgtHere">🎯 Цель здесь${tr.link && tr.poss.length > 1 ? ' (всем)' : nm}</button>` : '') + '<button id="ctxNo">Отмена</button>';
    m.style.left = Math.min(x, W - 200) + 'px'; m.style.top = Math.min(y, Hh - 140) + 'px'; m.hidden = false;
    $('#ctxNo').onclick = () => { m.hidden = true; };
    const addP = (side) => { m.hidden = true; const k = tr.tk || {}; const o = { side, price: lv, type: side > 0 ? (lv < cur ? 'limit' : 'stop') : (lv > cur ? 'limit' : 'stop'), sl: k.sl && (side > 0 ? k.sl < lv : k.sl > lv) ? k.sl : null, tp: k.tp && (side > 0 ? k.tp > lv : k.tp < lv) ? k.tp : null, pct: S.trPct || 100 }; tr.orders.push(o); trLog('вы', 'Выставлен ордер ' + ordTxt(o)); trRenderBar(); draw(); };
    const pb = $('#trPB'); if (pb) pb.onclick = () => addP(1); const ps = $('#trPS'); if (ps) ps.onclick = () => addP(-1);
    const s1 = $('#trStopHere'); if (s1) s1.onclick = () => { m.hidden = true; trSetLv(q, 'stop', lv, 'долгое нажатие'); trRenderBar(); draw(); };
    const s2 = $('#trTgtHere'); if (s2) s2.onclick = () => { m.hidden = true; trSetLv(q, 'target', lv, 'долгое нажатие'); trRenderBar(); draw(); };
  }
  function trainerCard() {
    const eq = trEq(), ret = eq / tr.cap - 1, w = tr.trades.filter((t) => t.pl > 0).length;
    const sys = an ? an.trades.filter((t) => an.bars[t.iEntry] && an.bars[t.iEntry].t >= tr.startT) : [];
    const sysR = sys.filter((t) => t.reason !== 3).reduce((s, t) => s + t.NR, 0), sysW = sys.filter((t) => t.reason !== 3 && t.NR > 0).length, sysN = sys.filter((t) => t.reason !== 3).length;
    const bh = trPx() / tr.startPx - 1, days = Math.round(((all.length ? all[all.length - 1].t : tr.startT) - tr.startT) / 86400000);
    let h = `<div class="card${foldC('tr')}" data-fold="tr" style="border-color:#3f6fb3"><h3><span class="grow">🎓 Тренажёр · ${esc(S.inst.ticker)} ${D.TF[S.tf].name}${tr.finished ? ' · итоги' : ''}</span></h3>
      <div class="small">Старт ${fmtT(tr.startT, false)} · прошло ${days} дн. · порог системы ${String(tr.sw).replace('.', DEC())}%${tr.swAuto ? ' (авто на старте)' : ''} — можно менять кнопками порога, порог обычного графика при этом не меняется</div>
      <div class="kv"><div><small>Вы</small><b class="${ret >= 0 ? 'pos' : 'neg'}">${spc(ret)}</b></div><div><small>Система</small><b class="${sysR >= 0 ? 'pos' : 'neg'}">${f2(sysR)} R</b></div><div><small>Купил и держал</small><b class="${bh >= 0 ? 'pos' : 'neg'}">${spc(bh)}</b></div>
      <div><small>Ваших сделок</small><b>${tr.trades.length}${tr.trades.length ? ' · ' + Math.round(w / tr.trades.length * 100) + '%' : ''}</b></div><div><small>Сделок системы</small><b>${sysN}${sysN ? ' · ' + Math.round(sysW / sysN * 100) + '%' : ''}</b></div><div><small>Капитал</small><b>${Math.round(eq).toLocaleString('ru-RU')} ₽</b></div></div>
      ${tr.trades.slice(-6).reverse().map((t) => `<div class="small">${t.side > 0 ? '▲' : '▼'} ${fmtT(t.t0, false)} ${pr(t.entry)} → ${fmtT(t.t1, false)} ${pr(t.exit)} · ${esc(t.why)} · <span class="${t.pl >= 0 ? 'pos' : 'neg'}">${t.pl >= 0 ? '+' : '−'}${Math.round(Math.abs(t.pl)).toLocaleString('ru-RU')} ₽</span></div>`).join('')}
      <details class="trev" data-keep="trHelpOpen"${S.trHelpOpen ? ' open' : ''}><summary>Как пользоваться</summary><div class="small mut">Как в тестере MT5: <b>Buy/Sell</b> — по рынку; <b>Ордер ▾</b> — объём (% капитала), SL и TP, отложенные ордера по цене (лимит или стоп — определится сам). Линии SL, TP и ордеров на графике <b>перетаскиваются пальцем</b>. Долгое нажатие на график — отложенный ордер или SL/TP в этой точке. <b>БУ</b> — стоп в безубыток. Позиций может быть <b>несколько</b>, у каждой свои SL/TP — нажмите на строку позиции, чтобы править её. <b>🔗 SL/TP всем</b> — один стоп и цель на все позиции: тянете одну линию — двигаются все. Без плеча: всего в позициях не больше капитала. Комиссия 0,05%.</div><button class="manl" data-man="trainer">📖 Тренажёр в инструкции</button></details>
      ${tr.ev.length ? `<details class="trev" data-keep="trEvOpen"${S.trEvOpen ? ' open' : ''}><summary>События тренировки (${tr.ev.length})</summary>${tr.ev.slice(-30).reverse().map((e) => `<div class="small"><span class="mut">${fmtT(e.t, S.tf !== '1d' && S.tf !== '1w')}</span> ${e.kind === 'вы' ? '👤' : '🤖'} ${esc(e.text)}</div>`).join('')}${tr.ev.length > 30 ? '<div class="small mut">…ещё ' + (tr.ev.length - 30) + ' — все в выгрузке</div>' : ''}</details>` : ''}
      <div class="row" style="margin-top:8px">${tr.finished ? '<button id="trResume">Продолжить</button>' : ''}<button id="trCsv">⬇ Выгрузить CSV</button><button id="trJson">⬇ JSON</button><button id="trExit">Выйти из тренажёра</button></div><div class="small" id="trRes"></div>
      <details class="trev" data-keep="trExpHelp"${S.trExpHelp ? ' open' : ''}><summary>Какой формат выбрать: CSV или JSON?</summary><div class="small mut">
        <p style="margin:6px 0"><b>CSV — таблица для себя.</b> Открывается в Excel, Google Таблицах, WPS или «Р7» на телефоне — сразу по-русски: разделитель «;», дробная часть через запятую. Внутри: строка итогов (капитал, результат, «купил и держал», порог), затем все сделки — ваши и системы (вход, стоп, цель, выход, причина, ₽ и R, сетап) и журнал событий по времени. Подходит, чтобы отсортировать сделки, посчитать свою статистику, построить график, вести дневник трейдера.</p>
        <p style="margin:6px 0"><b>JSON — полный слепок тренировки для разбора.</b> Те же данные, но без потерь и в машинном виде: все поля сделок, открытые позиции, настройки и порог, события. Его удобно <b>прислать на разбор</b> (например, в чат с Claude), чтобы найти ошибки и сравнить ваши входы с сигналами системы, или загрузить в другую программу. Читать глазами и открывать в Excel неудобно.</p>
        <p style="margin:6px 0">Коротко: смотреть самому — CSV, отдать на разбор — JSON. В обоих нет токена, номеров счетов и денег реального счёта — только виртуальный капитал тренажёра. Файл сохраняется в «Загрузки», после сохранения откроется меню «Поделиться».</p>
      </div></details></div>`;
    return h;
  }
  function bindTrainerCard() {
    const a = $('#trExit'); if (a) a.onclick = trExit;
    const b = $('#trResume'); if (b) b.onclick = () => { tr.finished = false; renderPanel(); };
    const c = $('#trCsv'); if (c) c.onclick = () => trExport('csv');
    const j = $('#trJson'); if (j) j.onclick = () => trExport('json');
    // каждый раскрывающийся блок помнит своё состояние (карточка перерисовывается на каждой свече)
    document.querySelectorAll('#panel details[data-keep]').forEach((dv) => { dv.ontoggle = () => { const k = dv.dataset.keep; if (!!S[k] !== dv.open) { S[k] = dv.open; save(); } }; });
  }
  // выгрузка тренировки: ваши сделки, сделки системы и события — CSV для Excel или JSON
  function trExport(kind) {
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0'), stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
    const intra = S.tf !== '1d' && S.tf !== '1w', T = (t) => (t ? fmtT(t, intra) : '');
    const sys = an ? an.trades.filter((t) => an.bars[t.iEntry] && an.bars[t.iEntry].t >= tr.startT).map((t) => ({ side: t.side, entry: t.entry, stop: t.stop0, target: t.notgt ? null : t.target, t0: an.bars[t.iEntry].t, t1: t.reason === 3 ? null : an.bars[t.iExit].t, exit: t.reason === 3 ? null : t.exitP, R: t.reason === 3 ? null : t.NR, why: t.reason === 3 ? 'открыта' : E.REASON_NAME[t.reason], setup: E.SETUP_NAME[t.setup] || '' })) : [];
    const eq = trEq(), base = { app: 'Волны Эллиотта ' + APP_VER, ticker: S.inst.ticker, tf: S.tf, start: T(tr.startT), now: T(all.length ? all[all.length - 1].t : 0), capital: tr.cap, equity: Math.round(eq), resultPct: +((eq / tr.cap - 1) * 100).toFixed(2), threshold: tr.sw, buyHoldPct: +((trPx() / tr.startPx - 1) * 100).toFixed(2) };
    let name, mime, txt;
    if (kind === 'csv') {
      const num = (x) => (x == null || x === '' ? '' : String(typeof x === 'number' ? +x.toFixed(4) : x).replace('.', ','));
      const rows = [['Тренажёр', base.ticker + ' ' + D.TF[S.tf].name, 'старт ' + base.start, 'сейчас ' + base.now, 'капитал ' + base.capital, 'итог ' + base.equity, num(base.resultPct) + '%', 'купил и держал ' + num(base.buyHoldPct) + '%', 'порог ' + num(tr.sw) + '%'], [],
        ['Кто', 'Сторона', 'Вход дата', 'Вход цена', 'Кол-во', 'Стоп', 'Цель', 'Выход дата', 'Выход цена', 'Причина выхода', 'Результат ₽', 'R системы', 'Сетап']];
      for (const t of tr.trades) rows.push(['вы', t.side > 0 ? 'покупка' : 'продажа', T(t.t0), num(t.entry), t.qty, num(t.stop), num(t.target), T(t.t1), num(t.exit), t.why, num(Math.round(t.pl)), '', '']);
      for (const q of tr.poss) rows.push(['вы', q.side > 0 ? 'покупка' : 'продажа', T(q.t), num(q.entry), q.qty, num(q.stop), num(q.target), '', '', 'открыта', num(Math.round(q.side * q.qty * (trPx() - q.entry))), '', '']);
      for (const t of sys) rows.push(['система', t.side > 0 ? 'покупка' : 'продажа', T(t.t0), num(t.entry), '', num(t.stop), num(t.target), T(t.t1), num(t.exit), t.why, '', num(t.R), t.setup]);
      rows.push([], ['Время', 'Кто', 'Событие']);
      for (const e of tr.ev) rows.push([T(e.t), e.kind, e.text]);
      txt = '\ufeff' + rows.map((r) => r.map((c) => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
      name = 'ew-trainer-' + S.inst.ticker + '-' + stamp + '.csv'; mime = 'text/csv';
    } else {
      txt = JSON.stringify(Object.assign({ kind: 'ew-trainer', exportedAt: d.toISOString() }, base, { yourTrades: tr.trades.map((t) => Object.assign({}, t, { t0: T(t.t0), t1: T(t.t1) })), openPositions: tr.poss.map((q) => Object.assign({}, q, { t: T(q.t) })), systemTrades: sys.map((t) => Object.assign({}, t, { t0: T(t.t0), t1: T(t.t1) })), events: tr.ev.map((e) => ({ t: T(e.t), kind: e.kind, text: e.text })) }));
      name = 'ew-trainer-' + S.inst.ticker + '-' + stamp + '.json'; mime = 'application/json';
    }
    const res = $('#trRes'), say = (h) => { if (res) res.innerHTML = h; };
    if (A && A.saveDownload) { const r = A.saveDownload(name, mime, txt).split('|'); say(r[0] === 'ok' ? 'Сохранено: ' + esc(r[1]) : '<span class="neg">' + esc(r[1]) + '</span>'); if (r[0] === 'ok' && A.shareLast) A.shareLast(mime); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); say('Сохранено: ' + esc(name)); }
  }
  // ---------- сохранение тренировки: свернули или закрыли приложение — продолжите с того же места ----------
  // свечи пишем отдельным файлом (редко: на старте и после подгрузки младших), состояние — часто и коротко
  const TR_STATE = 'trainer_state.json', TR_BARS = 'trainer_bars.json';
  const trKey = () => tr.inst + '.' + tr.tf + '.' + tr.startT;
  const cmp = (b) => [b.t, b.o, b.h, b.l, b.c, b.v || 0], unc = (a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] });
  function trSaveBars() {
    if (!tr) return;
    const sub = {}; for (const k of Object.keys(tr.sub)) if (Number(k) >= tr.cur) sub[k] = tr.sub[k].map(cmp);   // прошлые младшие свечи уже не нужны
    try { D.files.set(TR_BARS, { key: trKey(), full: tr.full.map(cmp), sub }); } catch (e) { D.log('error', 'тренажёр: не сохранились свечи: ' + e.message); }
  }
  const TR_SKIP = { full: 1, sub: 1, timer: 1, playing: 1, subLoading: 1 };
  function trSaveState() {
    if (!tr) return;
    const o = {}; for (const k of Object.keys(tr)) if (!TR_SKIP[k]) o[k] = tr[k];
    try { D.files.set(TR_STATE, { v: 1, key: trKey(), at: Date.now(), inst: S.inst, tr: o }); } catch (e) { /* не страшно — сохраним в следующий раз */ }
  }
  let trSaveT = 0;
  function trSaveSoon() { if (!trSaveT) trSaveT = setTimeout(() => { trSaveT = 0; trSaveState(); }, 4000); }
  function trForget() { clearTimeout(trSaveT); trSaveT = 0; try { D.files.set(TR_STATE, null); D.files.set(TR_BARS, null); } catch (e) { /* нет */ } }
  function trRestore() {
    let st = null, bf = null;
    try { st = D.files.get(TR_STATE); bf = st && D.files.get(TR_BARS); } catch (e) { return false; }
    if (!st || !st.tr || !bf || bf.key !== st.key || !bf.full || !bf.full.length) return false;
    const sub = {}; for (const k of Object.keys(bf.sub || {})) sub[k] = bf.sub[k].map(unc);
    S.inst = st.inst; S.tf = st.tr.tf; save();
    tr = Object.assign({}, st.tr, { full: bf.full.map(unc), sub, playing: false, timer: 0, subLoading: false });
    if (!tr.adj) trFixSub(tr, Object.keys(tr.sub));
    demo = false; err = ''; sel = -1; an = null; view.init = false;
    document.body.classList.add('training'); renderHead();
    tr.note = 'Тренировка восстановлена (сохранена ' + fmtT(st.at, true) + '). ▶ — продолжить';
    trShow(true); trRenderBar(); renderPanel();
    D.log('trainer', 'восстановлена тренировка ' + S.inst.ticker + ' ' + S.tf);
    if (S.view.pane === 3) setPane(3);
    return true;
  }
  function trQuit() {
    if (!tr) return;
    trForget();
    trPause();
    const eq = trEq();
    D.log('trainer', 'итог: вы ' + ((eq / tr.cap - 1) * 100).toFixed(1) + '%, сделок ' + tr.trades.length);
    all = tr.full; tr = null; document.body.classList.remove('training'); trRenderBar();
    if (S.view.pane === 3) setPane(3);
    view.init = false;
  }
  function trExit() { trQuit(); load(false); }

  const TF_HINT = { '1d': 'основной' };
  function tfPop() {
    return `<div class="pgrp">Таймфрейм</div><div class="tfgrid">${TFK.map((k) => `<button data-ptf="${k}" class="${S.tf === k ? 'on' : ''}">${D.TF[k].name}${TF_HINT[k] ? '<small>' + TF_HINT[k] + '</small>' : '<small>&nbsp;</small>'}</button>`).join('')}</div>`;
  }

  // ---------- график ----------
  const cv = $('#chart'), ctx = cv.getContext('2d');
  const AXW = 58, BOTH = 18;
  const view = { x0: 0, barW: 6, init: false, yMan: null, bars() { return plotW() / this.barW; } };   // yMan: { scale, shift } — растянута шкала цен
  window.__view = view;   // для автотестов
  let W = 0, Hh = 0, dpr = 1;
  const plotW = () => Math.max(50, W - AXW);
  // ---------- высота графика: обычный (50%), компактный (25%), панель на весь экран (0) ----------
  // положения: 0 — обычное (50%), 1 — компактное (25%), 2 — панель на весь экран, 3 — график на весь экран
  const SNAPS = [0.5, 0.25, 0, 'full'];
  let chartH = null;
  function vh() { return window.innerHeight || document.documentElement.clientHeight; }
  // в тренажёре на полном экране снизу остаётся одна строка кнопок ▶ +1 ⏭ 🌊 − скорость + ✕
  const trMiniH = () => { const b = $('#trBar'); if (!tr || !b || b.hidden) return 0; const r = b.querySelector('.row'); return (r ? r.offsetHeight : 40) + 18; };
  function fullH() { const hd = document.querySelector('body > header'), ch = $('#chips'), gr = $('#grip'); return Math.max(200, vh() - (hd ? hd.offsetHeight : 50) - (ch ? ch.offsetHeight : 44) - 18 - trMiniH()); }
  const snapPx = (k) => SNAPS[k] === 'full' ? fullH() : SNAPS[k] * vh();
  // 3.6: на компьютере в широком окне график слева на всю высоту, панель справа — высоту задаёт раскладка, а не ручка
  const deskWide = () => DESK && window.innerWidth >= 900;
  function setChartH(px, anim) {
    document.body.classList.toggle('desk', deskWide());
    if (deskWide()) { const w = $('#chartWrap'); w.style.height = ''; chartH = w.getBoundingClientRect().height; document.body.classList.remove('chartbig', 'chartfull'); resize(); return; }
    const wrap = $('#chartWrap'), max = fullH();
    chartH = Math.max(0, Math.min(max, px));
    wrap.classList.toggle('anim', !!anim);
    wrap.style.height = chartH + 'px';
    $('#grip').classList.toggle('mini', chartH < 70);
    document.body.classList.toggle('chartbig', chartH > vh() * 0.55);
    document.body.classList.toggle('chartfull', chartH >= max - 4);
    if (chartH < 70) renderGripQuote();
    if (anim) setTimeout(resize, 200); else resize();
  }
  function snapChart() {
    let best = 0; for (let k = 1; k < SNAPS.length; k++) if (Math.abs(snapPx(k) - chartH) < Math.abs(snapPx(best) - chartH)) best = k;
    S.view.pane = best; save();
    setChartH(snapPx(best), true);
  }
  function setPane(k) { S.view.pane = k; save(); setChartH(snapPx(k), true); }
  function renderGripQuote() {
    const q = $('#gripQuote'); if (!q || !all.length) return;
    const last = all[all.length - 1], prev = all.length > 1 ? all[all.length - 2] : last, ch = last.c / prev.c - 1;
    q.innerHTML = `${esc(S.inst.ticker)} <b class="mono">${pr(last.c)}</b> <span class="${ch >= 0 ? 'pos' : 'neg'}">${spc(ch)}</span>`;
  }
  (function setupGrip() {
    const grip = $('#grip'), P = $('#panel');
    let g = null, lastTap = 0;
    grip.addEventListener('pointerdown', (e) => { g = { y: e.clientY, h: chartH, moved: false }; grip.setPointerCapture(e.pointerId); grip.classList.add('drag'); });
    grip.addEventListener('pointermove', (e) => { if (!g) return; const dy = e.clientY - g.y; if (Math.abs(dy) > 3) g.moved = true; if (g.moved) setChartH(g.h + dy); });
    const gEnd = () => {
      grip.classList.remove('drag');
      if (!g) return;
      if (!g.moved) { const now = Date.now(); if (now - lastTap < 350) setPane((S.view.pane || 0) === 0 ? 3 : 0); lastTap = now; }
      else snapChart();
      g = null;
    };
    grip.addEventListener('pointerup', gEnd); grip.addEventListener('pointercancel', gEnd);
    // строка кнопок под графиком тоже служит ручкой: ведём пальцем вверх-вниз — меняется высота, вбок — прокрутка кнопок
    const C = $('#chips'); let c = null, cDragged = 0;
    C.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('[data-sw]')) { c = null; return; } c = { x: e.clientX, y: e.clientY, h: chartH, act: false, id: e.pointerId }; });
    C.addEventListener('pointermove', (e) => {
      if (!c || e.pointerId !== c.id) return;
      const dx = e.clientX - c.x, dy = e.clientY - c.y;
      if (!c.act) { if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.3) { c.act = true; c.y = e.clientY; try { C.setPointerCapture(e.pointerId); } catch (_) {} grip.classList.add('drag'); } else return; }
      setChartH(c.h + (e.clientY - c.y));
    });
    const cEnd = () => { if (c && c.act) { snapChart(); cDragged = Date.now(); grip.classList.remove('drag'); } c = null; };
    C.addEventListener('pointerup', cEnd); C.addEventListener('pointercancel', cEnd);
    C.addEventListener('click', (e) => { if (Date.now() - cDragged < 300) { e.stopPropagation(); e.preventDefault(); } }, true);
    // панель тренажёра (▶ +1 ⏭ … Buy Sell) — тоже ручка: тянем вверх-вниз — меняется высота графика (в т.ч. из полноэкранного)
    const TB = $('#trBar'); let tb = null, tbDragged = 0;
    TB.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('input,select,textarea')) { tb = null; return; } tb = { x: e.clientX, y: e.clientY, h: chartH, act: false, id: e.pointerId }; });
    TB.addEventListener('pointermove', (e) => {
      if (!tb || e.pointerId !== tb.id) return;
      const dx = e.clientX - tb.x, dy = e.clientY - tb.y;
      if (!tb.act) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.3) { tb.act = true; tb.y = e.clientY; try { TB.setPointerCapture(e.pointerId); } catch (_) {} grip.classList.add('drag'); } else return; }
      setChartH(tb.h + (e.clientY - tb.y));
    });
    const tbEnd = () => { if (tb && tb.act) { snapChart(); tbDragged = Date.now(); grip.classList.remove('drag'); } tb = null; };
    TB.addEventListener('pointerup', tbEnd); TB.addEventListener('pointercancel', tbEnd);
    TB.addEventListener('click', (e) => { if (Date.now() - tbDragged < 300) { e.stopPropagation(); e.preventDefault(); } }, true);
    // панель: у нижнего края тянем дальше вверх — график уменьшается; у верхнего края тянем вниз — растёт
    let t = null;
    P.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) { t = null; return; } t = { y: e.touches[0].clientY, h: chartH, act: false, y0: 0 }; }, { passive: true });
    P.addEventListener('touchmove', (e) => {
      if (!t || e.touches.length !== 1) return;
      const y = e.touches[0].clientY, dy = y - t.y;
      const atBottom = P.scrollTop + P.clientHeight >= P.scrollHeight - 2, atTop = P.scrollTop <= 0;
      if (!t.act) {
        if ((dy < -6 && atBottom && chartH > 0) || (dy > 6 && atTop && chartH < fullH() - 1)) { t.act = true; t.y0 = y; t.h = chartH; }
        else { t.y = y; return; }
      }
      e.preventDefault();
      setChartH(t.h + (y - t.y0));
    }, { passive: false });
    P.addEventListener('touchend', () => { if (t && t.act) snapChart(); t = null; });
  })();

  function resize() {
    const r = $('#chartWrap').getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; Hh = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    draw();
  }
  function totalBars() { return an ? an.N + (all.length && all[all.length - 1].done === false ? 1 : 0) : 0; }
  function fitView() {
    view.yMan = null;
    view.barW = Math.max(3, Math.min(12, plotW() / 120));
    view.x0 = Math.max(0, totalBars() - view.bars() + 4);
    view.init = true;
  }
  function clampView() {
    const n = totalBars();
    view.barW = Math.max(1.2, Math.min(40, view.barW));
    view.x0 = Math.max(-view.bars() * 0.5, Math.min(n - 5, view.x0));
  }
  function chartBar(i) {
    if (!an) return null;
    if (i < an.N) return an.bars[i];
    const f = all[all.length - 1];
    return i === an.N && f && f.done === false ? f : null;
  }

  function draw() {
    renderChips(); renderHud();
    const pu = $('#sigPulse'); if (pu) pu.hidden = true;
    if (Hh < 40) return;   // график свёрнут — панель на весь экран
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = K.bg; ctx.fillRect(0, 0, W, Hh);
    if (!an) return;
    clampView();
    const n = totalBars(), pw = plotW(), ph = Hh - BOTH;
    const i0 = Math.max(0, Math.floor(view.x0)), i1 = Math.min(n - 1, Math.ceil(view.x0 + view.bars()));
    if (i1 < i0) return;
    let lo = Infinity, hi = -Infinity;
    // длинный хвост одной свечи (утренний аукцион, «прострел») не сжимает весь график:
    // хвост в шкале учитываем не дальше 4 обычных размахов свечи от её тела, остальное уходит за край
    const rg = []; for (let i = i0; i <= i1; i++) { const b = chartBar(i); if (b) rg.push(b.h - b.l); }
    rg.sort((a, b) => a - b); const cap = 4 * (rg[rg.length >> 1] || 0);
    for (let i = i0; i <= i1; i++) { const b = chartBar(i); if (b) { lo = Math.min(lo, cap > 0 ? Math.max(b.l, Math.min(b.o, b.c) - cap) : b.l); hi = Math.max(hi, cap > 0 ? Math.min(b.h, Math.max(b.o, b.c) + cap) : b.h); } }
    if (sel >= 0) { const t = an.trades[sel]; lo = Math.min(lo, t.stop0, t.target || lo); hi = Math.max(hi, t.stop0, t.target || hi); }
    else if (!tr && !S.view.clean && i1 >= an.N - 2) {
      // у правого края — показать план и цели, но не сжимать свечи больше чем вдвое
      const span = hi - lo, lim0 = lo - span * 0.6, lim1 = hi + span * 0.6;
      const want = [];
      const hd2 = S.view.hide || {};
      if (an.plan && an.planActive && !hd2.plan) want.push(an.plan.stop, an.plan.entry, an.plan.notgt ? null : an.plan.target);
      const tgw = hd2.lv ? null : curTg(); if (tgw) { want.push(tgw.inv || null); tgw.tg.forEach((v) => want.push(v)); }
      for (const v of want) if (v && v >= lim0 && v <= lim1) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    // тренажёр: шкала цен не «дышит» с каждой свечой — диапазон только расширяется,
    // пока вы не сдвинули/не масштабировали график или он не перелистнулся
    if (tr && sel < 0) {
      const st = view.yStick;
      if (st && st.x0 === view.x0 && st.barW === view.barW) { lo = Math.min(lo, st.lo); hi = Math.max(hi, st.hi); }
      view.yStick = { lo, hi, x0: view.x0, barW: view.barW };
    }
    const pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
    if (view.yMan) {
      const mid = (lo + hi) / 2 + view.yMan.shift * (hi - lo), half = (hi - lo) / 2 * view.yMan.scale;
      lo = mid - half; hi = mid + half;
    }
    view.ph = ph;
    const X = (i) => (i - view.x0) * view.barW + view.barW / 2;
    const Y = (p) => 6 + (hi - p) / (hi - lo) * (ph - 12);
    view.Y = Y; view.X = X; view.lo = lo; view.hi = hi;
    // сетка и шкала цен
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const step = niceStep((hi - lo) / 6);
    ctx.strokeStyle = K.grid; ctx.lineWidth = 1; ctx.fillStyle = K.axis;
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const y = Math.round(Y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      ctx.fillText(pr(p), pw + 4, y);
    }
    // шкала времени
    ctx.textBaseline = 'alphabetic';
    const every = Math.max(1, Math.round(90 / view.barW));
    for (let i = Math.ceil(i0 / every) * every; i <= i1; i += every) {
      const b = chartBar(i); if (!b) continue;
      const x = X(i); if (x < 20 || x > pw - 20) continue;
      ctx.fillText(fmtT(b.t, S.tf !== '1d' && S.tf !== '1w').slice(0, S.tf === '1d' || S.tf === '1w' ? 8 : 11), x - 28, Hh - 4);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
    // тренажёр с выключенной кнопкой 🌊 — только свечи: размечаете сами
    // с включённой 🌊 — всегда вся разметка, даже если на главном экране выбрано «Только сделки»
    const v = tr && !tr.waves ? Object.assign({}, S.view, { clean: true, trades: false, channels: false })
      : tr ? Object.assign({}, S.view, { clean: false }) : S.view;
    const hid = v.hide || {};
    const line = (pts, color, w, dash) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      ctx.beginPath(); pts.forEach((q, k) => (k ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.stroke(); ctx.setLineDash([]);
    };
    let offUp = 0, offDn = 0;
    const hudEl = $('#hud'), upTop = hudEl && !hudEl.hidden ? Math.max(38, 24 + hudEl.offsetHeight + 14) : 38;   // подписи «↑ цель» — под табличкой
    const usedY = [];   // где уже стоят подписи справа: близкие уровни (W4 50% и доливка) не налезают друг на друга
    const edgeText = (s, p, color) => {
      let y = Y(p);
      if (y < 8 || y > ph - 4) {
        // цель за пределами экрана — подпись со стрелкой у верхнего или нижнего края
        const up = y < 8; s = (up ? '↑ ' : '↓ ') + s;
        y = up ? upTop + 13 * offUp++ : ph - 6 - 13 * offDn++;
      } else {
        const free = (yy) => yy > 14 && yy < ph && !usedY.some((u) => Math.abs(u - yy) < 13);
        const dy = [0, 13, -13, 26, -26, 39, -39].find((d) => free(y + d));
        if (dy != null) y += dy;
      }
      usedY.push(y);
      s += '  ' + pr(p);
      ctx.font = '10px system-ui, sans-serif'; const w = ctx.measureText(s).width; ctx.fillStyle = K.lbl; ctx.fillRect(pw - w - 8, y - 13, w + 6, 12); ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(s, pw - 4, y - 1); ctx.textAlign = 'left'; };
    const text = (s, i, p, color, align, base, font) => { ctx.font = font || '11px system-ui, sans-serif'; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'middle'; ctx.fillText(s, X(i), Y(p)); ctx.textAlign = 'left'; };
    // 3.13: классические фигуры (Охотник) — точки «головы и плеч» с линией шеи, уровень пробоя
    const drawPat = (pt, iSig) => {
      if (!pt || !pt.pts) return;
      const cc = '#26c6da';
      if (pt.kind === 'hs') {
        const q = pt.pts, nk = (x) => q[1].p + (q[3].p - q[1].p) * (x - q[1].i) / (q[3].i - q[1].i);
        line(q.map((z) => [z.i, z.p]), cc, 2);
        line([[q[1].i, q[1].p], [iSig, nk(iSig)]], cc, 1.5, [6, 4]);
        text('плечо', q[0].i, q[0].p, cc, 'center', 'top'); text('голова', q[2].i, q[2].p, cc, 'center', 'top'); text('плечо', q[4].i, q[4].p, cc, 'center', 'top');
        text('шея ', q[1].i, q[1].p, cc, 'right', 'bottom');
      } else if (pt.kind === 'brk') {
        line([[Math.max(0, iSig - 120), pt.lvl], [iSig, pt.lvl]], cc, 2, [6, 4]);
        text('уровень (максимум за 500 свечей)', Math.max(0, iSig - 120), pt.lvl, cc, 'left', 'bottom');
        line([[pt.pts[0].i, pt.pts[0].p], [iSig, pt.pts[0].p]], cc, 1, [2, 3]);
      }
    };
    // клин (конечная диагональ, стр. 40-43): заливка между линиями 1-3 и 2-4, «выброс» за линию 1-3,
    // цель после завершения — начало клина («по меньшей мере до того уровня, где он начался»).
    // Только подсказка: на сделки и статистику не влияет.
    // моя сделка: фигура входа своего цвета; поводок — пунктир до выхода (зелёный/красный) или до текущей цены
    const myMark = (a, e, side, ex, stop, open) => {
      const st = rmStyle('me'), d = side > 0 ? 1 : -1;
      if (!hid.leash) {
        if (ex && ex.i != null) line([[a, e], [ex.i, ex.p]], ex.pl > 0 ? '#3fbf7f' : '#ef5b5b', 1.3, [3, 3]);
        else if (open && an.N) line([[a, e], [an.N - 1, all.length ? all[all.length - 1].c : e]], st.c, 1.3, [3, 3]);
      }
      if (a >= i0 - 2 && a <= i1 + 2) { ctx.fillStyle = st.c; rmShape(st.sh, X(a), Y(e), d, 6); }
      if (ex && ex.i != null && ex.i >= i0 - 2 && ex.i <= i1 + 2) { const xe = X(ex.i), ye = Y(ex.p); ctx.strokeStyle = ex.pl > 0 ? '#3fbf7f' : '#ef5b5b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xe - 4, ye - 4); ctx.lineTo(xe + 4, ye + 4); ctx.moveTo(xe + 4, ye - 4); ctx.lineTo(xe - 4, ye + 4); ctx.stroke(); }
      else if (!ex && stop) line([[a, stop], [i1 + 50, stop]], 'rgba(91,156,255,.7)', 1, [2, 4]);
    };
    const drawWedge = (f, live) => {
      if (f.n < 5) return;
      const a1 = f.idx[1], a2 = f.idx[2], a3 = f.idx[3], a4 = f.idx[4], d = f.dir;
      const up = (i) => E.lineAt(a1, f.px[1], a3, f.px[3], i), dn = (i) => E.lineAt(a2, f.px[2], a4, f.px[4], i);
      const s1 = (f.px[3] - f.px[1]) / ((a3 - a1) || 1), s2 = (f.px[4] - f.px[2]) / ((a4 - a2) || 1);
      const apex = Math.abs(s1 - s2) > 1e-12 ? (dn(0) - up(0)) / (s1 - s2) : Infinity;   // где линии сходятся
      let end = f.n >= 6 ? f.idx[5] : Math.max(an.N - 1, a4 + Math.round((a4 - a1) / 3));
      if (isFinite(apex) && apex > a4 && apex < end) end = apex;
      if (end < i0 - 2 || a1 > i1 + 2) return;
      ctx.fillStyle = 'rgba(239,111,91,.12)';
      ctx.beginPath(); ctx.moveTo(X(a1), Y(up(a1))); ctx.lineTo(X(end), Y(up(end))); ctx.lineTo(X(end), Y(dn(end))); ctx.lineTo(X(a1), Y(dn(a1))); ctx.closePath(); ctx.fill();
      line([[a1, up(a1)], [end, up(end)]], 'rgba(239,111,91,.85)', 1.5);
      line([[a1, dn(a1)], [end, dn(end)]], 'rgba(239,111,91,.85)', 1.5);
      // «выброс»: пятая волна прокалывает линию 1-3 (стр. 43)
      let tj = -1;
      if (f.n >= 6) { if (d * (f.px[5] - up(f.idx[5])) > 0) tj = f.idx[5]; }
      else for (let j = a4 + 1; j < an.N; j++) { const b = an.bars[j]; if (d * ((d > 0 ? b.h : b.l) - up(j)) > 0) { tj = j; break; } }
      if (tj >= 0 && tj >= i0 && tj <= i1) {
        const b = an.bars[tj], p = f.n >= 6 ? f.px[5] : d > 0 ? b.h : b.l;
        ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = '#ef6f5b'; ctx.textAlign = 'center'; ctx.textBaseline = d > 0 ? 'bottom' : 'top';
        ctx.fillText('выброс', X(tj), Y(p) - d * 16); ctx.textAlign = 'left';
      }
      // цель после клина — уровень его начала
      if (f.n >= 6) {
        const tp = f.px[0]; let hit = -1;
        for (let j = f.idx[5] + 1; j < an.N; j++) { const b = an.bars[j]; if (d > 0 ? b.l <= tp : b.h >= tp) { hit = j; break; } }
        line([[f.idx[5], tp], [hit >= 0 ? hit : i1 + 50, tp]], 'rgba(239,111,91,.65)', 1, [2, 3]);
        if (hit >= 0) { if (hit >= i0 && hit <= i1) text('✓', hit, tp, '#ef6f5b', 'center', d > 0 ? 'top' : 'bottom', 'bold 11px system-ui, sans-serif'); }
        else if (live || f.idx[5] >= i0) edgeText('Цель после клина', tp, '#ef6f5b');
      }
    };

    if (!v.clean) {
      // старшая степень и зигзаг
      if (!hid.hi && an.hiPivots && an.hiPivots.length) line(an.hiPivots.map((q) => [q.i, q.p]).concat(an.hiPend ? [[an.hiPend.i, an.hiPend.p]] : []), 'rgba(200,205,215,.28)', 3);
      if (!hid.ma && an.ma) line(an.ma.map((m, i) => [i, m]).filter((q) => q[1] > 0 && q[0] >= i0 - 1 && q[0] <= i1 + 1), 'rgba(217,180,67,.6)', 1.2);
      if (!hid.zz) line(an.main.map((q) => [q.i, q.p]).concat(an.pend ? [[an.pend.i, an.pend.p]] : []), 'rgba(150,160,175,.55)', 1);
      // фигуры (можно оставить только последние — меньше каши на графике)
      const figList = an.figures.filter((f) => v.figs[f.kind] && f.idx[0] < an.N);
      for (const f of v.figN ? figList.slice(-v.figN) : figList) {
        if (f.idx[f.n - 1] < i0 - 200 || f.idx[0] > i1 + 5) continue;
        const col = FIG_COLOR[f.kind];
        line(f.idx.map((ix, k) => [ix, f.px[k]]), col + 'aa', 3);
        for (let k = 1; k < f.n; k++) {
          const up = k + 1 < f.n ? f.px[k] > f.px[k + 1] : f.px[k] > f.px[k - 1];
          text(E.pointLabel(f, k), f.idx[k], f.px[k] * (up ? 1 : 1), col, 'center', up ? 'bottom' : 'top');
        }
        let hiP = -Infinity, loP = Infinity; f.px.forEach((x) => { hiP = Math.max(hiP, x); loP = Math.min(loP, x); });
        const above = f.kind === 4 || f.dir < 0;
        if (!hid.flbl) text(E.figName(f) + ' ' + f.score.toFixed(0), (f.idx[0] + f.idx[f.n - 1]) / 2, above ? hiP : loP, col, 'center', above ? 'bottom' : 'top', 'bold 11px system-ui, sans-serif');
        if (v.channels) {
          const iEnd = Math.min(an.N - 1, f.idx[f.n - 1] + Math.max(5, Math.round((f.idx[f.n - 1] - f.idx[0]) / 4)));
          for (const L of E.channelLines(f)) line([[L.from, E.lineAt(L.i1, L.p1, L.i2, L.p2, L.from)], [iEnd, E.lineAt(L.i1, L.p1, L.i2, L.p2, iEnd)]], col + '99', 1, [5, 4]);
        }
        if (f.kind === 1 && !hid.wedge) drawWedge(f, false);
        if (S.cfg.addBreak24 && f.brk >= 0) text('Пробой 2-4', f.brk, an.bars[f.brk].c, '#f0a23a', 'center', 'bottom', 'bold 10px system-ui, sans-serif');
      }
    }
    // свечи
    const bw = Math.max(1, view.barW * 0.7);
    for (let i = i0; i <= i1; i++) {
      const b = chartBar(i); if (!b) continue;
      const x = X(i), up = b.c >= b.o, forming = i >= an.N;
      ctx.strokeStyle = ctx.fillStyle = forming ? '#8d98a6' : up ? K.up : K.dn;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(b.h)); ctx.lineTo(Math.round(x) + 0.5, Y(b.l)); ctx.lineWidth = 1; ctx.stroke();
      const yo = Y(b.o), yc = Y(b.c);
      if (forming) ctx.strokeRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
      else ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
    // ломаная подсчёта с подписями; мелкие (a)(b) — внутри сложной волны 2/4
    function drawPath(pts, colLine, colText, dash) {
      line(pts.map((q) => [q.i, q.p]), colLine, 2, dash);
      pts.forEach((q, k) => {
        const nb = pts[k + 1] || pts[k - 1], up = k + 1 < pts.length ? q.p > pts[k + 1].p : q.p > (pts[k - 1] ? pts[k - 1].p : q.p);
        text(q.lbl, q.i, q.p, colText, 'center', up ? 'bottom' : 'top', q.small ? '11px system-ui, sans-serif' : 'bold 14px system-ui, sans-serif');
      });
    }
    if (!v.clean) {
      // текущий подсчёт
      const s = curScen();
      if (s && !hid.cnt) drawPath(E.countPath(s), altSel ? '#b07cf0' : '#5b9cff', altSel ? '#c9a6f5' : '#8fbaff', altSel ? [7, 4] : null);
      if (s) {
        // клин в текущем подсчёте (волна 5 ещё идёт или только что закончилась и фигура ещё не в списке)
        if (s.kind === 1 && s.n >= 5 && !hid.wedge && !hid.cnt && !(s.n >= 6 && v.figs[1] && an.figures.some((f) => f.kind === 1 && f.idx[0] === s.idx[0]))) drawWedge(s, true);
        if (v.channels && !hid.cnt) for (const L of E.channelLines(s)) line([[L.from, E.lineAt(L.i1, L.p1, L.i2, L.p2, L.from)], [i1 + 50, E.lineAt(L.i1, L.p1, L.i2, L.p2, i1 + 50)]], 'rgba(91,156,255,.7)', 1, [6, 4]);
        const tg = curTg();
        const t0 = s.idx[s.n - 1];
        if (!hid.lv) tg.tg.forEach((p, k) => { line([[t0, p], [i1 + 50, p]], 'rgba(240,162,58,.75)', 1, [4, 4]); edgeText(tg.lb[k], p, '#f0a23a'); });
        if (tg.inv && !hid.lv) { line([[s.idx[0], tg.inv], [i1 + 50, tg.inv]], 'rgba(239,91,91,.8)', 1, [4, 4]); edgeText('Отмена подсчёта', tg.inv, '#ef5b5b'); }
        // время по Фибоначчи (опция, сверх книги): вертикальный пунктир и подпись у нижнего края
        const ft = S.view.fibT && !hid.cnt ? fibTime(s) : null;
        if (ft) for (const q of ft.pts) {
          const x = X(q.i); if (x < 0 || x > pw) continue;
          ctx.strokeStyle = 'rgba(79,195,247,.6)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, ph); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#4fc3f7'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('⏱' + q.r, x, ph - 2); ctx.textAlign = 'left';
        }
      }
      const p = an.plan;
      if (p && an.planActive && !hid.plan) {
        if (p.pat) drawPat(p.pat, p.sigBar);
        line([[p.sigBar, p.entry], [i1 + 50, p.entry]], '#5b9cff', 2);
        line([[p.sigBar, p.stop], [i1 + 50, p.stop]], '#ef5b5b', 2);
        if (!p.notgt) line([[p.sigBar, p.target], [i1 + 50, p.target]], '#3fbf7f', 2);
        const px0 = X(p.sigBar), py0 = Y(p.entry);   // сигнал на последней или предпоследней свече — точка входа пульсирует
        if (pu && animOn() && an.N - 1 - p.sigBar <= 1 && px0 >= 0 && px0 <= pw && py0 >= 0 && py0 <= ph) { pu.hidden = false; pu.style.left = px0 + 'px'; pu.style.top = py0 + 'px'; }
      }
    }
    // сделки виртуальных роботов по этой бумаге (не в тренажёре — там своя история)
    if (!tr && !hid.robot && an.N) {
      const pms = (D.TF[S.tf] || D.TF['1d']).ms;
      // сделка в паузе между свечами (утро до первой свечи дня, ночь) — на следующую свечу, а не на прошлую вечернюю
      const ix = (t) => { let lo = 0, hi = an.N - 1; if (t < an.bars[0].t) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (an.bars[m].t <= t) lo = m; else hi = m - 1; } return lo + 1 < an.N && t >= an.bars[lo].t + pms ? lo + 1 : lo; };
      for (const m of robotMarks()) {
        const a = ix(m.t0); if (a < 0) continue;
        const b = m.open ? an.N - 1 : ix(m.t1); if (b < i0 - 2 || a > i1 + 2) continue;
        const stl = rmStyle(m.key), good = m.open ? null : m.pl > 0, col = m.open ? stl.c : good ? '#3fbf7f' : '#ef5b5b';
        line([[a, m.e], [b, m.open ? an.bars[an.N - 1].c : m.x]], m.open ? stl.c : col, 1.2, [1, 3]);   // 3.9: открытая — от входа к цене последней свечи
        const x = X(a), y = Y(m.e), d = m.side > 0 ? 1 : -1;
        ctx.fillStyle = stl.c; rmShape(stl.sh, x, y, d, 6);
        ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = d > 0 ? 'top' : 'bottom'; ctx.fillText(m.lt, x, y + d * 16); ctx.textAlign = 'left';
        if (m.open) { if (m.stop) { line([[a, m.stop], [i1 + 1, m.stop]], m.be ? 'rgba(63,191,127,.6)' : 'rgba(239,91,91,.45)', 1, [3, 3]); if (m.be) text('БУ', i1 - 2, m.stop, '#3fbf7f', 'right', d > 0 ? 'bottom' : 'top', 'bold 10px system-ui, sans-serif'); } }
        else { const xe = X(b), ye = Y(m.x); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xe - 4, ye - 4); ctx.lineTo(xe + 4, ye + 4); ctx.moveTo(xe + 4, ye - 4); ctx.lineTo(xe - 4, ye + 4); ctx.stroke(); }
      }
    }
    // сделки бэктеста
    if (v.trades) {
      an.trades.forEach((t, k) => {
        if (t.iExit < i0 - 2 || t.iEntry > i1 + 2) return;
        const good = t.ret > 0, col = good ? '#3fbf7f' : '#ef5b5b', isSel = k === sel;
        line([[t.iEntry, t.entry], [t.iExit, t.exitP]], col, isSel ? 1.5 : 1, [2, 3]);
        // стрелка входа
        const x = X(t.iEntry), y = Y(t.entry), d = t.side > 0 ? 1 : -1;
        ctx.fillStyle = t.side > 0 ? '#3fbf7f' : '#ef5b5b';
        ctx.beginPath(); ctx.moveTo(x, y + d * 2); ctx.lineTo(x - 6, y + d * 11); ctx.lineTo(x + 6, y + d * 11); ctx.closePath(); ctx.fill();
        // выход — крестик
        const xe = X(t.iExit), ye = Y(t.exitP);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xe - 4, ye - 4); ctx.lineTo(xe + 4, ye + 4); ctx.moveTo(xe + 4, ye - 4); ctx.lineTo(xe - 4, ye + 4); ctx.stroke();
        // доливка по Вильямсу — маленький треугольник
        if (t.add && t.add.i >= i0 - 2 && t.add.i <= i1 + 2) { const xa = X(t.add.i), ya = Y(t.add.px), da = t.side > 0 ? 1 : -1; ctx.fillStyle = '#b07cf0'; ctx.beginPath(); ctx.moveTo(xa, ya + da * 2); ctx.lineTo(xa - 5, ya + da * 9); ctx.lineTo(xa + 5, ya + da * 9); ctx.closePath(); ctx.fill(); }
        // ступеньки перенесённого стопа
        if (t.path && t.path.length) stepsLine(t.iEntry, t.stop0, t.path, t.iExit, '#ef5b5b', isSel ? 2 : 1, line);
        if (v.be) {
          const sh = an.shadow[k];
          if (sh.steps.length) {
            stepsLine(sh.steps[0].bar, sh.steps[0].p, sh.steps.slice(1), sh.hit >= 0 ? sh.hit : t.iExit, '#f0a23a', isSel ? 2 : 1.2, line);
            if (sh.hit >= 0) { const hx = X(sh.hit), hy = Y(sh.hitPx); ctx.strokeStyle = '#f0a23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 4, hy - 4); ctx.lineTo(hx + 4, hy + 4); ctx.moveTo(hx + 4, hy - 4); ctx.lineTo(hx - 4, hy + 4); ctx.stroke(); }
          }
        }
        if (isSel) {
          // волны, по которым открыта сделка (фиолетовые), и подсчёт, из-за которого вышли (оранжевые)
          const drawCnt = (s, colr, dash) => drawPath(E.countPath(s), colr, colr, dash);
          if (t.cnt) drawCnt(t.cnt, '#c08cff');
          if (t.pat) drawPat(t.pat, t.iSig);
          if (t.exitCnt) drawCnt(t.exitCnt, '#ff7ab6', [6, 4]);
          line([[t.iEntry, t.stop0], [t.iExit, t.stop0]], '#ef5b5b', 2);
          if (!t.notgt) line([[t.iEntry, t.target], [t.iExit, t.target]], '#3fbf7f', 2);
          line([[t.iEntry, t.entry], [t.iExit, t.entry]], '#5b9cff', 1, [5, 4]);
          const lbl = 'Сделка ' + (k + 1) + ': R ' + f2(t.R), nearEdge = X(t.iExit) > pw - 110;
          text(nearEdge ? lbl + ' ' : ' ' + lbl, t.iExit, t.exitP, col, nearEdge ? 'right' : 'left', 'bottom', 'bold 12px system-ui, sans-serif');
        }
      });
      // исполненные заявки со счёта: ▲ покупка, ▼ продажа
      for (const o of tr ? [] : opsCache[S.inst.id] || []) {   // в тренажёре — без ваших реальных сделок (они из «будущего»)
        const ii = barAt(o.t); if (ii == null) continue;
        const xo = X(ii), yo = Y(o.price), up = o.side > 0;
        ctx.fillStyle = up ? '#3fbf7f' : '#ef5b5b'; ctx.strokeStyle = K.bg; ctx.lineWidth = 1;
        ctx.beginPath(); if (up) { ctx.moveTo(xo, yo); ctx.lineTo(xo - 6, yo + 10); ctx.lineTo(xo + 6, yo + 10); } else { ctx.moveTo(xo, yo); ctx.lineTo(xo - 6, yo - 10); ctx.lineTo(xo + 6, yo - 10); } ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // мои сделки из дневника: фигура входа (вид — «Вид ▾ → Мои сделки»), поводок до выхода или текущей цены
      for (const j of tr || hid.my ? [] : jList().filter((x) => x.instId === S.inst.id)) {
        const i0 = barAt(j.openT), i1j = j.closeT ? barAt(j.closeT) : null; if (i0 == null) continue;
        myMark(i0, j.openP, j.side || 1, j.closeT ? { i: i1j, p: j.closeP, pl: (j.side || 1) * (j.closeP - j.openP) } : null, j.stop, !j.closeT);
      }
      // стоп открытой сделки
      if (an.openTrade) { const t = an.openTrade; line([[t.iEntry, t.stop], [i1 + 50, t.stop]], '#ef5b5b', 2, [6, 3]); text('Стоп ' + pr(t.stop), i1 - 1, t.stop, '#ef5b5b', 'right', 'bottom', '10px system-ui, sans-serif');
        // уровень доливки по Вильямсу: волна 3 прошла 110% волны 1
        if (t.addLvl && !t.add) { line([[t.iEntry, t.addLvl], [i1 + 50, t.addLvl]], 'rgba(176,124,240,.85)', 1.2, [3, 3]); edgeText('Доливка 110% W1', t.addLvl, '#c9a6f5'); } }
    }
    // тренажёр: ваши закрытые сделки и открытые позиции — отметка входа и «поводок» до выхода (или до текущей цены)
    if (tr && !hid.my && an.N) {
      for (const t of tr.trades) { const a = barAt(t.t0), b = barAt(t.t1); if (a == null) continue; myMark(a, t.entry, t.side, { i: b == null ? an.N - 1 : b, p: t.exit, pl: t.pl }); }
      for (const q of tr.poss) { const a = barAt(q.t); if (a != null) myMark(a, q.entry, q.side, null, null, true); }
    }
    // тренажёр: ваша позиция — вход, стоп, цель
    if (tr && tr.poss.length) {
      const many = tr.poss.length > 1, selQ = trSel();
      const hl = (p, col, dash, label, wd) => { const yy = Y(p); ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.setLineDash([]); edgeText(label, p, col); };
      const grp = {};   // одинаковые уровни рисуем одной линией: «Стоп ×9»
      for (const q of tr.poss) {
        const nm = many ? ' #' + q.id : '', wd = many && q !== selQ ? 1 : 1.5;
        hl(q.entry, '#5b9cff', [], 'Вы' + nm + ': ' + (q.side > 0 ? 'покупка' : 'продажа'), wd);
        for (const k of ['stop', 'target']) if (q[k]) { const key = k + q[k].toFixed(6); (grp[key] = grp[key] || { k, p: q[k], ids: [], sel: false }).ids.push(q.id); if (q === selQ) grp[key].sel = true; }
      }
      for (const g2 of Object.values(grp)) {
        const nm = g2.ids.length > 1 ? ' ×' + g2.ids.length : many ? ' #' + g2.ids[0] : '';
        hl(g2.p, g2.k === 'stop' ? '#ef5b5b' : '#3fbf7f', [6, 4], (g2.k === 'stop' ? 'Стоп' : 'Цель') + nm, g2.sel || g2.ids.length > 1 || !many ? 1.5 : 1);
      }
    }
    if (tr && tr.orders.length) for (const o of tr.orders) { const yy = Y(o.price); ctx.strokeStyle = '#f0a23a'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.setLineDash([]); edgeText('⏳ ' + (o.side > 0 ? 'Buy ' : 'Sell ') + o.type, o.price, '#f0a23a'); }
    // мои уровни оповещений: жёлтый пунктир через весь график
    const pfd = D.store.get('pfired', {});
    for (const a of tr ? [] : (S.palerts || []).filter((x) => x.instId === S.inst.id && !pfd[x.id])) {
      const ya = Y(a.price);
      ctx.strokeStyle = 'rgba(217,180,67,.9)'; ctx.lineWidth = 1; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(0, ya); ctx.lineTo(pw, ya); ctx.stroke(); ctx.setLineDash([]);
      edgeText('🔔 ' + (a.dir > 0 ? 'выше' : 'ниже'), a.price, '#d9b443');
    }
    ctx.restore();
    // последняя цена
    const last = all[all.length - 1];
    if (last && last.c >= lo && last.c <= hi) {
      const y = Y(last.c);
      ctx.strokeStyle = 'rgba(91,156,255,.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = K.tag; ctx.fillRect(pw, y - 8, AXW, 16); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(pr(last.c), pw + 4, y);
    }
  }
  function stepsLine(i0, p0, steps, iEnd, color, w, line) {
    const pts = [[i0, p0]]; let p = p0;
    for (const s of steps) { pts.push([s.bar, p]); pts.push([s.bar, s.p]); p = s.p; }
    pts.push([iEnd, p]);
    line(pts, color, w);
  }
  function niceStep(raw) { const m = Math.pow(10, Math.floor(Math.log10(raw))); const r = raw / m; return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * m; }

  // жесты: сдвиг одним пальцем, масштаб двумя, касание — свеча
  const pts = new Map(); let g = null;
  let lpTimer = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); g = startGesture(e);
    clearTimeout(lpTimer); $('#ctxMenu').hidden = true;
    if (pts.size === 1 && g && g.zone === 'p') { const g0 = g; lpTimer = setTimeout(() => { if (g === g0 && !g.moved && pts.size === 1) { g.moved = true; longPress(e.clientX - cvLeft(), e.clientY - cv.getBoundingClientRect().top); } }, 550); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (pts.size >= 2 && g.pinch) {
      const [a, b] = Array.from(pts.values()), d = Math.abs(a.x - b.x) || 1;
      view.barW = g.barW * d / g.d; clampView();
      view.x0 = g.anchor - (g.mid - cvLeft()) / view.barW;
      g.moved = true; draw();
    } else if (pts.size === 1) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { g.moved = true; if (!$('#cinfo').hidden) hideInfo(); }
      if (g.zone === 'drag') {
        const ly = e.clientY - cv.getBoundingClientRect().top, price = Number(pr(view.hi - (ly - 6) / ((view.ph || 300) - 12) * (view.hi - view.lo)).replace(',', '.'));
        if (g.drag.k === 'order') { const o = tr.orders[g.drag.i]; if (o) { o.price = price; const cur = trPx(); o.type = o.side > 0 ? (price < cur ? 'limit' : 'stop') : (price > cur ? 'limit' : 'stop'); } }
        else { const q = tr.poss.find((x) => x.id === g.drag.id); if (q) linkedOf(q).forEach((x) => { x[g.drag.k] = price; }); }
        draw(); return;
      } else if (g.zone === 'y') {
        // тянем шкалу цен: вниз — свечи сжимаются, вверх — растягиваются
        const sc = Math.max(0.05, Math.min(20, g.scale * Math.exp(dy / 160)));
        view.yMan = { scale: sc, shift: g.shift };
      } else if (g.zone === 'x' && (g.resize || (g.resize !== false && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.3))) {
        // по шкале дат вверх-вниз — меняем высоту графика (как за ручку)
        if (!g.resize) { g.resize = true; g.h = chartH; g.ry = e.clientY; $('#grip').classList.add('drag'); }
        setChartH(g.h + (e.clientY - g.ry));
        return;
      } else if (g.zone === 'x') {
        if (Math.abs(dx) > 8) g.resize = false;
        // тянем шкалу времени: вправо — свечи шире, влево — уже (правый край остаётся на месте)
        const right = g.x0 + plotW() / g.barW;
        view.barW = Math.max(1.2, Math.min(40, g.barW * Math.exp(dx / 160)));
        view.x0 = right - plotW() / view.barW;
      } else {
        view.x0 = g.x0 - dx / view.barW;
        if (view.yMan) view.yMan = { scale: view.yMan.scale, shift: g.shift + dy / ((view.ph || 300) - 12) * view.yMan.scale };
      }
      draw();
    }
  });
  const end = (e) => {
    clearTimeout(lpTimer);
    if (g && g.zone === 'drag') {
      const d = g.drag; pts.delete(e.pointerId); g = null;
      if (tr) {
        if (d.k === 'order') { const o = tr.orders[d.i]; if (o && o.price !== d.from) trLog('вы', 'Ордер перенесён: ' + pr(d.from) + ' → ' + ordTxt(o)); }
        else { const q = tr.poss.find((x) => x.id === d.id); if (q) trSetLv(q, d.k, q[d.k], 'перетащили', d.from); }
        tr.note = 'Уровень перенесён'; trRenderBar(); renderPanel();
      }
      return;
    }
    if (g && g.resize) { $('#grip').classList.remove('drag'); snapChart(); pts.delete(e.pointerId); g = null; return; }
    if (g && !g.moved && pts.size === 1 && Date.now() - g.t < 400) tap(e.clientX - cvLeft(), e.clientY - cv.getBoundingClientRect().top);
    pts.delete(e.pointerId);
    g = pts.size ? startGesture(null) : null;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const mx = e.clientX - cvLeft(), anchor = view.x0 + mx / view.barW; view.barW *= e.deltaY < 0 ? 1.15 : 0.87; clampView(); view.x0 = anchor - mx / view.barW; draw(); }, { passive: false });
  let lastTap = 0;
  function cvLeft() { return cv.getBoundingClientRect().left; }
  function startGesture(e) {
    const arr = Array.from(pts.values());
    if (arr.length >= 2) {
      const mid = (arr[0].x + arr[1].x) / 2;
      return { pinch: true, d: Math.abs(arr[0].x - arr[1].x) || 1, barW: view.barW, mid, anchor: view.x0 + (mid - cvLeft()) / view.barW, moved: true, t: 0 };
    }
    const p = arr[0] || { x: e ? e.clientX : 0, y: e ? e.clientY : 0 };
    const r = cv.getBoundingClientRect(), lx = p.x - r.left, ly = p.y - r.top;
    const zone = lx > plotW() ? 'y' : ly > Hh - BOTH - 2 ? 'x' : 'p';
    const ym = view.yMan || { scale: 1, shift: 0 };
    // тренажёр: схватить пальцем линию SL / TP / отложенного ордера и перетащить
    if (tr && zone === 'p' && view.Y && e) {
      const near = (price) => price && Math.abs(view.Y(price) - ly) < 16;
      let drag = null;
      // сначала выбранная позиция, потом остальные
      const sq = trSel();
      for (const q of sq ? [sq].concat(tr.poss.filter((x) => x !== sq)) : []) { if (near(q.stop)) { drag = { k: 'stop', id: q.id }; break; } if (near(q.target)) { drag = { k: 'target', id: q.id }; break; } }
      if (drag) { tr.selPos = drag.id; drag.from = tr.poss.find((x) => x.id === drag.id)[drag.k]; }
      else { const oi = tr.orders.findIndex((o) => near(o.price)); if (oi >= 0) drag = { k: 'order', i: oi, from: tr.orders[oi].price }; }
      if (drag) return { x: p.x, y: p.y, x0: view.x0, barW: view.barW, scale: ym.scale, shift: ym.shift, zone: 'drag', drag, moved: true, t: Date.now() };
    }
    return { x: p.x, y: p.y, x0: view.x0, barW: view.barW, scale: ym.scale, shift: ym.shift, zone, moved: false, t: Date.now() };
  }
  let infoTimer = 0;
  function hideInfo() { clearTimeout(infoTimer); $('#cinfo').hidden = true; }
  // долгое нажатие на графике: отметить свою сделку в этой точке
  function longPress(x, y) {
    if (!an || !view.Y) return;
    if (tr) { trLongPress(x, y); return; }
    const i = Math.max(0, Math.min(totalBars() - 1, Math.round(view.x0 + x / view.barW - 0.5)));
    const b = chartBar(i); if (!b) return;
    const price = view.hi - (y - 6) / ((view.ph || 300) - 12) * (view.hi - view.lo);
    const p = Math.min(b.h, Math.max(b.l, price));   // цена в пределах свечи
    const m = $('#ctxMenu');
    const lvP = Number(pr(price).replace(',', '.'));   // уровень — там, где палец, округлённо до шага цены
    m.innerHTML = `<div class="small">${fmtT(b.t, true)} · ${pr(p)}</div><button id="ctxBell">🔔 Оповестить на ${pr(lvP)}</button><button id="ctxBuy">📒 Моя покупка здесь</button><button id="ctxSell">📒 Моя продажа здесь</button><button id="ctxNo">Отмена</button>`;
    m.style.left = Math.min(x, W - 200) + 'px'; m.style.top = Math.min(y, Hh - 175) + 'px'; m.hidden = false;
    $('#ctxBell').onclick = () => { m.hidden = true; addLevel(lvP); };
    $('#ctxNo').onclick = () => { m.hidden = true; };
    const go = (side) => { m.hidden = true; openJournal({ mode: 'open', price: p, t: b.t, side }); };
    $('#ctxBuy').onclick = () => go(1); $('#ctxSell').onclick = () => go(-1);
  }

  function tap(x, y) {
    if (!an) return;
    if (!$('#cinfo').hidden) { hideInfo(); return; }   // второе касание просто закрывает окно
    const now = Date.now();
    if (now - lastTap < 300) {
      if (x > plotW()) view.yMan = null;   // по шкале цен — только автомасштаб цены
      else { fitView(); sel = -1; renderPanel(); }
      $('#cinfo').hidden = true; draw(); lastTap = 0; return;
    }
    if (x > plotW() || y > Hh - BOTH - 2) { lastTap = now; return; }   // касание шкал — не свеча
    lastTap = now;
    const i = Math.round(view.x0 + x / view.barW - 0.5);
    // нажали на сделку?
    let best = -1, bd = 14;
    an.trades.forEach((t, k) => { for (const [ii, pp] of [[t.iEntry, t.entry], [t.iExit, t.exitP]]) { const d = Math.hypot(view.X(ii) - x, view.Y(pp) - y); if (d < bd) { bd = d; best = k; } } });
    if (best >= 0 && S.view.trades) { $('#cinfo').hidden = true; sel = best; renderPanel(); draw(); return; }
    const b = chartBar(i);
    if (!b) { $('#cinfo').hidden = true; return; }
    $('#cinfo').hidden = false;
    $('#cinfo').innerHTML = `<b>${fmtT(b.t, true)}</b>${i >= an.N ? ' <span class="mut">формируется</span>' : ''} · О ${pr(b.o)} М ${pr(b.h)} Н ${pr(b.l)} З ${pr(b.c)}`;
    clearTimeout(infoTimer); infoTimer = setTimeout(hideInfo, 5000);
  }

  // ---------- выбор бумаги ----------
  function openSheet(id) { $('#' + id).hidden = false; }
  function closeSheet(id) { $('#' + id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeSheet(b.dataset.close); });
  // 3.8: инструкция — manual.html (та же, что manual/Инструкция.html) экраном поверх остальных. Грузится при первом открытии и не выгружается:
  // открыли снова без раздела — читаете с того же места. Цвета — темы приложения; раздел и новые цвета — сообщением в страницу
  function manColors() {
    const sk = (SKINS[S.skin] || SKINS.night).css, c = { chbg: K.bg, grid: K.grid, axis: K.axis };
    for (const k of ['bg', 'bg2', 'bg3', 'line', 'ink', 'mut', 'dim', 'acc', 'accl']) if (sk[k]) c[k] = sk[k];
    return c;
  }
  function openManual(sec) {
    const f = $('#manFrame');
    closePop();
    openSheet('manual');
    if (!f.getAttribute('src')) f.src = 'manual.html?app=1&c=' + encodeURIComponent(JSON.stringify(manColors())) + (sec ? '#' + sec : '');
    else if (f.contentWindow) f.contentWindow.postMessage({ ew: 'go', sec: sec || '', c: manColors() }, '*');
  }
  // любая кнопка или ссылка с data-man="раздел" (и в шапках экранов, и в панели, которую перерисовывают)
  document.addEventListener('click', (e) => {
    const m = e.target && e.target.closest ? e.target.closest('[data-man]') : null;
    if (!m) return;
    e.preventDefault();
    openManual(m.dataset.man);
  });
  // клавиатура не выскакивает сама: поиск активируется, только когда нажмёте на поле
  $('#instBtn').onclick = () => { openSheet('search'); $('#q').value = ''; $('#q').blur(); $('#qres').innerHTML = quickList(); bindRes(); };
  const POPULAR = [['SBER', 'Сбербанк'], ['GAZP', 'Газпром'], ['LKOH', 'Лукойл'], ['ROSN', 'Роснефть'], ['GMKN', 'Норникель'], ['NVTK', 'Новатэк'], ['YDEX', 'Яндекс'], ['T', 'Т-Технологии'], ['MOEX', 'Мосбиржа'], ['VTBR', 'ВТБ'], ['MGNT', 'Магнит'], ['PLZL', 'Полюс'], ['TATN', 'Татнефть'], ['SNGS', 'Сургутнефтегаз'], ['ALRS', 'Алроса'], ['CHMF', 'Северсталь'], ['NLMK', 'НЛМК'], ['AFLT', 'Аэрофлот'], ['OZON', 'Озон'], ['MTSS', 'МТС']];
  const isFav = (id) => (S.favs || []).some((f) => f.id === id);
  function resRow(id, t, n, c, extra) {
    return `<div class="res" data-id="${esc(id)}" data-t="${esc(t)}" data-n="${esc(n)}" data-c="${esc(c)}"><span class="star ${isFav(id) ? 'on' : ''}" data-star="1">${isFav(id) ? '★' : '☆'}</span><b>${esc(t)}</b>${esc(n)}${extra || ''}</div>`;
  }
  // быстрый список при нажатии на бумагу: что у меня на счёте, недавние, избранное, сигналы сканера, все акции по обороту
  const univList = () => { if (!univ) { const c = D.files.get('universe.json'); if (c && c.list) univ = c; } return univ && univ.list ? univ.list : []; };
  function instOfUid(uid) {
    const u = univList().find((x) => x.uid === uid); if (u) return u;
    const c = D.store.get('uid.' + uid, null); return c && c.ticker ? { id: c.ticker + '_' + (c.classCode || 'TQBR'), ticker: c.ticker, name: c.name, classCode: c.classCode || 'TQBR', type: c.type } : null;
  }
  let uidResolving = false;
  async function resolveUids(uids) {
    if (uidResolving || !S.token || !uids.length) return;
    uidResolving = true;
    for (const u of uids) { try { await D.instByUid(S.token, u); } catch (e) { /* не страшно */ } }
    uidResolving = false;
    if (!$('#search').hidden && !$('#q').value.trim()) { $('#qres').innerHTML = quickList(); bindRes(); }
  }
  const grp = (t, extra) => `<div class="grp">${t}${extra ? ' <span class="small" style="text-transform:none;letter-spacing:0">' + extra + '</span>' : ''}</div>`;
  function quickList() {
    const shown = new Set(), favs = S.favs || [];
    const row = (x, extra) => { shown.add(x.id); return resRow(x.id, x.ticker, x.name || '', x.classCode || 'TQBR', extra); };
    let h = '';
    // 1) на счёте
    const pos = S.acct && S.acct.positions ? S.acct.positions.filter((p) => p.qty) : [];
    if (pos.length) {
      const miss = [];
      const rows = pos.map((p) => {
        const x = instOfUid(p.uid); if (!x) { miss.push(p.uid); return ''; }
        if (x.type && !/share|etf/.test(x.type)) return '';
        const pct = p.avg ? (p.cur / p.avg - 1) * Math.sign(p.qty) : 0;
        return row(x, `<br><span class="small">${Math.abs(p.qty)} шт. · <span class="${pct >= 0 ? 'pos' : 'neg'}">${spc(pct)}</span>${p.qty < 0 ? ' · шорт' : ''}</span>`);
      }).join('');
      if (rows) h += grp('На счёте', S.account ? esc(S.account.name) + ' · ' + fmtT(S.acct.at, true) : '') + rows;
      if (miss.length) resolveUids(miss);
    }
    // 2) избранное
    h += grp('Избранное');
    const fv = favs.filter((f) => !shown.has(f.id));
    h += fv.length ? fv.map((f) => row(f, lastPhase(f))).join('') : (favs.length ? '<div class="small" style="padding:6px 0">Все избранные — выше.</div>' : '<div class="small" style="padding:8px 0">Пусто. Нажмите ☆ рядом с бумагой или ★ в шапке.</div>');
    // 3) недавние
    const rc = (S.recent || []).filter((r) => !shown.has(r.id) && r.id !== S.inst.id).slice(0, 6);
    if (rc.length) h += grp('Недавние') + rc.map((r) => row(r, lastPhase(r))).join('');
    // 4) сигналы последнего скана на этом таймфрейме
    const sc = scanHist().filter((x) => x.tf === S.tf).pop();
    if (sc) {
      const sg = sc.rows.filter((r) => r.sig && !r.err).sort((a, b) => (b.R || 0) - (a.R || 0));
      h += grp('Сигналы сканера · ' + D.TF[S.tf].name, 'скан ' + fmtT(sc.at, true));
      h += sg.length ? sg.slice(0, 12).map((r) => row(r, `<br><span class="small"><span class="${r.side < 0 ? 'neg' : 'pos'}">${r.side < 0 ? '▼ продажа' : '▲ покупка'}</span> · история ${r.R >= 0 ? '+' : ''}${(r.R || 0).toFixed(0)} R, ${r.n} сд.</span>`)).join('')
        : '<div class="small" style="padding:6px 0">Сейчас сигналов нет.</div>';
      if (Date.now() - sc.at > 3 * 86400000) h += '<div class="small warn" style="padding:4px 0">Скан старше 3 дней — сигналы могли устареть, запустите заново.</div>';
    } else h += grp('Сигналы сканера') + '<div class="small" style="padding:6px 0">Сканер ещё не запускался на ' + esc(D.TF[S.tf].name) + '. Кнопка «Сканер» вверху — найдёт бумаги с сигналом сейчас.</div>';
    // 5) все акции по обороту
    const ul = univList();
    if (ul.length) {
      const rest = ul.filter((x) => !shown.has(x.id));
      h += grp('Акции Мосбиржи по обороту', ul.length + ' шт. · обновлён ' + fmtT(univ.at, true)) + rest.slice(0, 30).map((x) => row(x, ` <span class="small">${fmtTurn(x.turn)}${x.turn < 1e9 ? ' млн' : ''} ₽/день</span>`)).join('');
      if (rest.length > 30) h += `<div class="small" style="padding:8px 0">И ещё ${rest.length - 30} — наберите тикер или название в поиске.</div>`;
    } else {
      h += grp('Крупные акции Мосбиржи') + POPULAR.filter(([t]) => !shown.has(t + '_TQBR')).map(([t, n]) => resRow(t + '_TQBR', t, n, 'TQBR')).join('');
      h += '<div class="small" style="padding:8px 0">Полный список всех акций с оборотом появится после «Обновить список» в сканере.</div>';
    }
    return h;
  }
  function lastPhase(f) {
    const l = D.store.get('last.' + f.ticker + '.' + S.tf, null);
    return l ? `<br><span class="small">${esc(l.phase)}${l.plan ? ' · план: ' + l.plan : ''}</span>` : '';
  }
  function toggleFav(inst) {
    S.favs = S.favs || [];
    const k = S.favs.findIndex((f) => f.id === inst.id);
    if (k >= 0) S.favs.splice(k, 1); else S.favs.push({ id: inst.id, ticker: inst.ticker, name: inst.name, classCode: inst.classCode });
    save(); renderHead();
  }
  function bindRes() {
    $('#qres').querySelectorAll('.res').forEach((r) => {
      r.onclick = (ev) => {
        if (ev.target && ev.target.dataset && ev.target.dataset.star) {
          toggleFav({ id: r.dataset.id, ticker: r.dataset.t, name: r.dataset.n, classCode: r.dataset.c });
          const on = isFav(r.dataset.id); ev.target.textContent = on ? '★' : '☆'; ev.target.classList.toggle('on', on);
          return;
        }
        S.inst = { id: r.dataset.id, ticker: r.dataset.t, classCode: r.dataset.c, name: r.dataset.n };
        save(); closeSheet('search'); sel = -1; an = null; view.init = false; renderHead(); load(false);
      };
    });
  }
  let qTimer = 0;
  $('#q').addEventListener('input', () => {
    clearTimeout(qTimer);
    const v = $('#q').value.trim();
    if (!v) { $('#qres').innerHTML = quickList(); bindRes(); return; }
    const up = v.toUpperCase(), low = v.toLowerCase();
    const loc = univList().filter((x) => x.ticker.startsWith(up) || (x.name || '').toLowerCase().includes(low)).sort((a, b) => (b.ticker === up) - (a.ticker === up) || b.turn - a.turn).slice(0, 20);
    let h = loc.map((x) => resRow(x.id, x.ticker, x.name, 'TQBR', ` <span class="small">${fmtTurn(x.turn)}${x.turn < 1e9 ? ' млн' : ''} ₽/день</span>`)).join('');
    if (!loc.length && /^[A-Z0-9.]{1,12}$/.test(up)) h += resRow(up + '_TQBR', up, 'акция Мосбиржи', 'TQBR', ' <span class="small">тикер на Мосбирже (TQBR)</span>');
    $('#qres').innerHTML = h + '<div class="small" style="padding:10px">поиск…</div>'; bindRes();
    qTimer = setTimeout(async () => {
      try {
        const list = await D.findInstrument(S.token, v);
        const rows = list.filter((x) => !loc.some((u) => u.id === x.id)).slice(0, 30).map((x) => resRow(x.id, x.ticker, x.name, x.classCode, ` <span class="small">${esc(x.type || '')} · ${esc(x.classCode)}</span>`)).join('');
        $('#qres').innerHTML = h + (rows ? (loc.length ? '<div class="grp">Другие бумаги у брокера</div>' : '') + rows : (h ? '' : '<div class="small" style="padding:10px">Ничего не найдено</div>')); bindRes();
      } catch (e) { $('#qres').innerHTML = h + (loc.length ? '' : `<div class="banner err">${esc(e.message)}</div>`); bindRes(); }
    }, 450);
  });

  // ---------- сканер бумаг ----------
  // Список: избранное или акции Мосбиржи от брокера (топ по обороту / все ликвидные).
  // Для каждой бумаги — бэктест с текущими настройками и оценка надёжности (0–4 ★).
  const SCAN_KEY = 'scan.hist';
  let scanPick = 0;   // время скана, выбранного в таблице сравнения
  let scanRows = null, scanBusy = false, scanSort = 'sig', scanMsg = '', univ = null;
  const LISTS = [['fav', 'Избранное'], ['top20', 'Топ-20 по обороту'], ['top50', 'Топ-50'], ['top100', 'Топ-100'], ['liquid', 'Все ликвидные']];
  function scanList() {
    const mode = S.scanList || 'top20', minT = (S.scanMinTurn == null ? 50 : S.scanMinTurn) * 1e6;
    if (mode === 'fav') return (S.favs || []).map((f) => ({ id: f.id, ticker: f.ticker, name: f.name, classCode: f.classCode }));
    const base = univ && univ.list.length ? univ.list : POPULAR.map(([t, n]) => ({ id: t + '_TQBR', ticker: t, name: n, classCode: 'TQBR', turn: 0 }));
    let l = base.filter((x) => !univ || x.turn >= minT);
    if (mode === 'top20') l = l.slice(0, 20); else if (mode === 'top50') l = l.slice(0, 50); else if (mode === 'top100') l = l.slice(0, 100);
    return l;
  }
  const turnOf = (id) => { const x = univ && univ.list.find((u) => u.id === id); return x ? x.turn : null; };
  const fmtTurn = (v) => v == null ? '—' : v >= 1e9 ? (v / 1e9).toFixed(1).replace('.', DEC()) + ' млрд' : Math.round(v / 1e6) + '';
  function scanHist() { return D.files.get('scanhist.json') || D.store.get(SCAN_KEY, []); }
  function prevScan(tf) {
    const h = scanHist().filter((x) => x.tf === tf);
    return h.length >= 2 ? h[h.length - 2] : null;
  }
  function spark(vals) {
    if (vals.length < 2) return '';
    const w = 54, h = 18, lo = Math.min(...vals, 0), hi = Math.max(...vals, 0), sp = hi - lo || 1;
    const pts = vals.map((v, k) => `${(k / (vals.length - 1) * w).toFixed(1)},${(h - (v - lo) / sp * h).toFixed(1)}`).join(' ');
    const z = (h - (0 - lo) / sp * h).toFixed(1), last = vals[vals.length - 1], col = last >= vals[0] ? '#3fbf7f' : '#ef5b5b';
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" x2="${w}" y1="${z}" y2="${z}" stroke="#2e3744"/><polyline fill="none" stroke="${col}" stroke-width="1.5" points="${pts}"/></svg>`;
  }
  const stars = (k) => '<span class="gold">' + '★'.repeat(k) + '</span><span class="mut">' + '☆'.repeat(4 - k) + '</span>';
  function renderScanner() {
    const on = (sl, ev, fn) => { const el = $(sl); if (el) el.addEventListener(ev, fn); };
    if (!univ) univ = D.files.get('universe.json');
    const tf = S.tf, list = scanList(), mode = S.scanList || 'top20';
    const hist = scanHist().filter((x) => x.tf === tf);
    // какой скан показывать: выбранный в сравнении или последний
    const picked = scanPick ? hist.find((x) => x.at === scanPick) : null;
    const last = picked || (scanRows && scanRows.tf === tf ? scanRows : hist.length ? hist[hist.length - 1] : null);
    let h = `<div class="small">Таймфрейм <b>${esc(D.TF[tf].name)}</b> (как на графике) · настройки и дополнения — текущие.</div>
      <div class="field" style="margin-top:8px"><label>Какие бумаги</label><select id="scanListSel">${LISTS.map(([k, t]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      ${mode !== 'fav' ? `<div class="field"><label>Мин. средний оборот, млн ₽ в день</label><input type="number" id="scanMinTurn" min="0" step="10" value="${S.scanMinTurn == null ? 50 : S.scanMinTurn}"></div>
      <div class="small">${univ ? `Список акций от брокера: ${univ.list.length} шт., обновлён ${fmtTurnDate(univ.at)}. Подходит под фильтр: ${list.length}.` : 'Список акций ещё не загружен — сейчас взяты 20 популярных. Нажмите «Обновить список акций» (≈ 1–2 мин, раз в сутки).'} <button id="univBtn" ${scanBusy ? 'disabled' : ''}>Обновить список акций</button></div>` : `<div class="small">Бумаг в избранном: ${list.length}.</div>`}
      <label class="sw"><input type="checkbox" id="scanOpt" ${S.scanOpt ? 'checked' : ''}><span>Подбирать порог для каждой бумаги<small>Дольше примерно в 10 раз. Без галочки — сохранённый порог бумаги или «Авто»</small></span></label>
      <div class="row" style="margin:10px 0"><button id="scanGo" ${scanBusy || !list.length ? 'disabled' : ''}>${scanBusy ? 'Сканирую…' : 'Сканировать ' + list.length}</button><span class="small" id="scanMsg">${esc(scanMsg)}</span></div>`;
    if (!S.token) h += '<div class="small">Без токена свечи и список акций — с Мосбиржи (задержка ~15 мин).</div>';
    if (last) {
      // Δ R и динамика — только по сканам тем же набором и тем же списком
      const same = (x) => (x.preset || '') === (last.preset || '') && (x.list || '') === (last.list || '');
      const prev = hist.filter((x) => x.at < last.at && same(x)).pop() || null, pmap = new Map(prev ? prev.rows.map((r) => [r.id, r]) : []);
      const seriesOf = (id) => hist.filter((x) => x.at <= last.at && same(x)).map((x) => x.rows.find((r) => r.id === id)).filter(Boolean).map((r) => r.R);
      const key = { sig: (r) => (r.sig ? 1e15 : 0) + (turnOf(r.id) || r.turn || 0), wr: (r) => r.n ? r.w / r.n : -1, R: (r) => r.R, ret: (r) => r.ret, avg: (r) => r.n ? r.R / r.n : -9, dd: (r) => -r.dd, turn: (r) => turnOf(r.id) || r.turn || 0 }[scanSort];
      const okr = last.rows.filter((r) => !r.err && r.bars);
      const kOf = (r) => (r.chk ? r.chk.reduce((s, x) => s + x, 0) : -1), fold = (r) => { const k = kOf(r); return k < 0 ? '' : k === 4 ? 'good' : k >= 2 ? 'mid' : 'bad'; };
      const folder = S.scanFolder || 'all';
      const rows = last.rows.filter((r) => folder === 'all' || fold(r) === folder).sort((a, b) => (a.err ? 1 : 0) - (b.err ? 1 : 0) || key(b) - key(a));
      h += `<div class="small">Скан ${fmtT(last.at, true)}${prev ? ' · сравнение с ' + fmtT(prev.at, true) : ''}${okr.length ? ' · история ~' + okr[0].bars + ' свечей (' + Math.round(okr.reduce((m, r) => m + r.days, 0) / okr.length) + ' дн.)' : ''}</div>
        ${scanCard(last, hist)}
        ${okr.some((r) => r.chk) ? `<div class="row sortb" style="margin:6px 0">Папки: ${[['all', 'Все', okr.length], ['good', 'Надёжные', okr.filter((r) => fold(r) === 'good').length], ['mid', 'Под вопросом', okr.filter((r) => fold(r) === 'mid').length], ['bad', 'Не подходят', okr.filter((r) => fold(r) === 'bad').length]].map(([k, t, c]) => `<button data-sf="${k}" class="${folder === k ? 'on' : ''}">${t} ${c}</button>`).join('')}</div>` : ''}
        <div class="row sortb" style="margin:6px 0">Сортировка: ${[['sig', 'сигнал → оборот'], ['wr', '% прибыльных'], ['R', 'сумма R'], ['avg', 'ср. R'], ['ret', 'доходность'], ['dd', 'просадка'], ['turn', 'оборот']].map(([k, t]) => `<button data-ss="${k}" class="${scanSort === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div style="overflow-x:auto;margin:0 -4px"><table class="scan"><thead><tr><th>Бумага</th><th>Порог</th><th>Сд.</th><th>%</th><th>R</th><th>Доход</th><th>Оборот</th><th>Δ R</th><th>Динамика</th></tr></thead><tbody>
        ${rows.map((r) => {
          if (r.err) return `<tr class="mut" data-id="${esc(r.id)}"><td>${esc(r.ticker)}</td><td colspan="8">${esc(r.err)}</td></tr>`;
          const p = pmap.get(r.id), dR = p && !p.err ? r.R - p.R : null;
          return `<tr data-id="${esc(r.id)}" class="${r.n < 8 ? 'mut' : ''}"><td><b>${esc(r.ticker)}</b>${r.sig ? (r.side < 0 ? ' <span class="neg">●</span>' : ' <span class="pos">●</span>') : ''}${r.chk ? ' <span class="chk" title="½ · ± · 8 · ★">' + r.chk.map((x) => (x ? '<i class="ok">✓</i>' : '<i>✗</i>')).join('') + '</span>' : ''}<br><span class="small">${esc(r.phase || '')}</span></td>
            <td class="mono">${r.sw.toFixed(2).replace('.', DEC())}${r.opt ? '*' : ''}</td><td>${r.n}</td><td>${r.n ? Math.round(r.w / r.n * 100) : 0}</td>
            <td class="${r.R >= 0 ? 'pos' : 'neg'}">${f2(r.R)}</td><td class="${r.ret >= 0 ? 'pos' : 'neg'}">${spc(r.ret)}</td><td>${fmtTurn(turnOf(r.id) != null ? turnOf(r.id) : r.turn)}</td>
            <td class="${dR == null ? 'mut' : dR >= 0 ? 'pos' : 'neg'}">${dR == null ? '—' : (dR >= 0 ? '▲' : '▼') + Math.abs(dR).toFixed(1).replace('.', DEC())}</td><td>${spark(seriesOf(r.id))}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="note">Папки — справка, а не фильтр: на 65 акциях бумаги, «надёжные» по истории до 2023 года, в 2023–2026 торговались не лучше остальных (связь «до» и «после» даже отрицательная, −0,24). Проверки полезны для оценки <b>настроек</b> по всем бумагам сразу — смотрите табель вверху. Сканер — чтобы видеть, где сейчас сигнал, какая фаза и оборот.</div>
        <div class="small" style="margin-top:6px">Проверки ✓✗ по порядку: <b>½</b> — обе половины истории в плюсе; <b>±</b> — пороги на 20–25% меньше и больше тоже в плюсе; <b>8</b> — сделок не меньше 8; <b>★</b> — в плюсе и без самой удачной сделки. Все четыре — «Надёжные», 2–3 — «Под вопросом», 0–1 — «Не подходят».</div>
        <div class="small" style="margin-top:6px">R — чистый, за вычетом комиссии. <span class="pos">●</span> — сейчас активен план на вход. * — порог подобран. Оборот — млн ₽ в день за месяц. Серые строки — меньше 8 сделок.
        Δ R — изменение суммы R с прошлого скана, «Динамика» — сумма R по сканам. Нажмите на строку, чтобы открыть бумагу${S.scanOpt ? ' с найденным порогом' : ''}.</div>`;
    } else h += '<div class="small">Сканов ещё не было.</div>';
    h += `<div class="grp">Хранилище котировок</div>
      <div class="small">${(() => { const n = D.files.list('scan_'); const byTf = {}; n.forEach((x) => { const t = x.replace(/\.json$/, '').split('_').pop(); byTf[t] = (byTf[t] || 0) + 1; }); return n.length ? 'Сохранено рядов: ' + n.length + ' (' + Object.entries(byTf).map(([t, c]) => (D.TF[t] ? D.TF[t].name : t) + ' — ' + c).join(', ') + ').' : 'Пока пусто — появится после первого скана.'; })()}</div>
      <div class="row" style="margin-top:6px"><select id="dumpTf" style="width:auto"><option value="cur">Только ${esc(D.TF[tf].name)}</option><option value="all">Все таймфреймы</option></select><button id="dumpBtn" ${scanBusy ? 'disabled' : ''}>Выгрузить хранилище для разбора</button></div>
      <div class="small" id="dumpRes">Один сжатый файл (.json.gz) со свечами, дивидендами, лотностью, списком акций, историей сканов и настройками — без токена и данных счёта.</div>`;
    if (hist.length) h += `<div class="small" style="margin-top:8px">Сканов в истории (${esc(D.TF[tf].name)}): ${hist.length}. <button id="scanClear">Очистить историю</button></div>`;
    $('#scanBody').innerHTML = h;
    on('#scanListSel', 'change', () => { S.scanList = $('#scanListSel').value; save(); renderScanner(); });
    on('#scanMinTurn', 'change', () => { S.scanMinTurn = Math.max(0, Number($('#scanMinTurn').value) || 0); save(); renderScanner(); });
    on('#scanOpt', 'change', () => { S.scanOpt = $('#scanOpt').checked; save(); });
    on('#scanGo', 'click', runScan);
    on('#univBtn', 'click', () => loadUniverse(true));
    on('#dumpBtn', 'click', () => dumpStore($('#dumpTf').value === 'all' ? null : tf));
    on('#scanClear', 'click', () => { D.files.set('scanhist.json', scanHist().filter((x) => x.tf !== tf)); scanRows = null; renderScanner(); });
    $('#scanBody').querySelectorAll('[data-ss]').forEach((b) => { b.onclick = () => { scanSort = b.dataset.ss; renderScanner(); }; });
    $('#scanBody').querySelectorAll('tr[data-scan]').forEach((tr) => { tr.onclick = () => { scanPick = Number(tr.dataset.scan); renderScanner(); }; });
    $('#scanBody').querySelectorAll('[data-sf]').forEach((b) => { b.onclick = () => { S.scanFolder = b.dataset.sf; save(); renderScanner(); }; });
    $('#scanBody').querySelectorAll('.scan tr[data-id]').forEach((tr) => {
      tr.onclick = () => {
        const r = last.rows.find((x) => x.id === tr.dataset.id); if (!r) return;
        S.inst = { id: r.id, ticker: r.ticker, classCode: r.classCode, name: r.name };
        if (r.opt) S.swings[r.id + '.' + tf] = r.sw;
        save(); closeSheet('scanner'); closeSheet('search'); sel = -1; an = null; view.init = false; renderHead(); load(false);
      };
    });
  }
  const fmtTurnDate = (t) => fmtT(t, true);
  // «табель» настроек: итоги скана по всем бумагам сразу + сравнение с прошлыми сканами (другими наборами)
  function scanSum(rec) {
    const ok = rec.rows.filter((r) => !r.err && r.bars && r.chk);
    if (!ok.length) return null;
    const s = { n: ok.length, plus: 0, both: 0, good: 0, R: 0, tr: 0, h1: 0, h2: 0, nb: 0 };
    for (const r of ok) { if (r.R > 0) s.plus++; if (r.chk[0]) s.both++; if (r.chk.every((x) => x)) s.good++; if (r.chk[1]) s.nb++; s.R += r.R; s.tr += r.n; s.h1 += r.h1 || 0; s.h2 += r.h2 || 0; }
    return s;
  }
  function scanCard(last, hist) {
    const s = scanSum(last);
    if (!s) return '<div class="small" style="margin:6px 0">Табель настроек и проверки надёжности появятся после нового скана.</div>';
    const pc0 = (a) => Math.round(a / s.n * 100) + '%';
    const verdict = s.R > 0 && s.h1 > 0 && s.h2 > 0 && s.plus / s.n >= 0.6 ? '<span class="pos">настройки выглядят устойчиво</span>' : s.R > 0 ? '<span class="warn">плюс есть, но неустойчивый</span>' : '<span class="neg">настройки в минусе</span>';
    let h = `<div class="card" style="margin:8px 0"><h3>Табель настроек · ${esc(last.preset || 'настройки')}</h3>
      <div class="kv"><div><small>В плюсе</small><b>${s.plus} из ${s.n}</b></div><div><small>Обе половины в плюсе</small><b>${s.both} (${pc0(s.both)})</b></div><div><small>Надёжных</small><b>${s.good}</b></div>
      <div><small>Сумма R</small><b class="${s.R >= 0 ? 'pos' : 'neg'}">${f2(s.R)}</b></div><div><small>1-я / 2-я половина</small><b><span class="${s.h1 >= 0 ? 'pos' : 'neg'}">${s.h1.toFixed(0)}</span> / <span class="${s.h2 >= 0 ? 'pos' : 'neg'}">${s.h2.toFixed(0)}</span></b></div><div><small>R на сделку</small><b class="${s.R >= 0 ? 'pos' : 'neg'}">${s.tr ? f2(s.R / s.tr) : '—'}</b></div></div>
      <div class="small">Итог: ${verdict}. Соседние пороги в плюсе у ${s.nb} из ${s.n}. Хорошие настройки: сумма R в плюсе в обеих половинах и плюс хотя бы у 60% бумаг.</div>`;
    // по одному (последнему) скану на каждый набор и список бумаг, до 6 штук
    const seen = new Set(), cmp = [];
    for (const x of hist.slice().reverse()) { if (!scanSum(x)) continue; const k = (x.preset || '') + '|' + (x.list || ''); if (seen.has(k)) continue; seen.add(k); cmp.push(x); if (cmp.length >= 6) break; }
    if (!cmp.some((x) => x.at === last.at)) cmp.unshift(last);
    if (cmp.length > 1) h += `<div class="small" style="margin-top:8px"><b>Сравнение наборов на ${esc(D.TF[last.tf].name)}</b> — нажмите строку, чтобы посмотреть этот скан:</div>
      <table class="cmp"><thead><tr><th>Набор</th><th>Плюс</th><th>½+½</th><th>R</th><th>R/сд</th></tr></thead><tbody>
      ${cmp.map((x) => { const q = scanSum(x); return `<tr data-scan="${x.at}" class="${x.at === last.at ? 'sel' : ''}"><td>${esc((x.preset || 'настройки').replace('Дневки · ', ''))}<br><small class="mut">${fmtT(x.at, true)} · ${q.n} бум.</small></td><td>${q.plus}/${q.n}</td><td>${q.both}</td><td class="${q.R >= 0 ? 'pos' : 'neg'}">${q.R.toFixed(0)}</td><td>${q.tr ? (q.R / q.tr).toFixed(2).replace('.', DEC()) : '—'}</td></tr>`; }).join('')}</tbody></table>
      <div class="small">Сравнивать честно — на одном списке бумаг и одном таймфрейме. Повторный скан тем же набором заменяет строку.</div>`;
    return h + '</div>';
  }
  // выгрузка хранилища одним сжатым файлом
  async function dumpStore(onlyTf) {
    const res = $('#dumpRes'), say = (t) => { if (res) res.innerHTML = t; };
    try {
      say('собираю…');
      const names = D.files.list('scan_').filter((n) => !onlyTf || n.endsWith('_' + onlyTf + '.json'));
      const series = {};
      for (const n of names) { const c = D.files.get(n); if (c) series[n] = c; }
      const ids = new Set(names.map((n) => n.replace(/^scan_/, '').replace(/_[^_]+\.json$/, '')));
      const divs = {}, ins = {};
      for (const id of ids) { const dv = D.store.get('div.' + id, null); if (dv) divs[id] = dv; const io = D.store.get('ins.' + id, null); if (io) ins[id] = io; }
      const doc = {
        kind: 'ew-store', app: 'Волны Эллиотта ' + APP_VER, exportedAt: new Date().toISOString(), tf: onlyTf || 'all',
        columns: ['t', 'o', 'h', 'l', 'c', 'v', 'done'], note: 'свечи без поправки на дивиденды; divs — lastBuyDate и размер',
        cfg: S.cfg, swings: S.swings, favs: S.favs, scan: { list: S.scanList, minTurn: S.scanMinTurn, opt: S.scanOpt },
        series, divs, ins, journal: D.store.get('journal', []), universe: D.files.get('universe.json'), scanHist: scanHist().filter((x) => !onlyTf || x.tf === onlyTf),
      };
      say('сжимаю ' + Object.keys(series).length + ' рядов…');
      const txt = JSON.stringify(doc);
      let blob = new Blob([txt], { type: 'application/json' }), gz = false;
      if (typeof CompressionStream !== 'undefined') { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); gz = true; }
      const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
      const name = `ew-store-${onlyTf || 'all'}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json${gz ? '.gz' : ''}`;
      const mime = gz ? 'application/gzip' : 'application/json', mb = (blob.size / 1048576).toFixed(1).replace('.', DEC());
      if (A && A.saveBegin) {
        const r0 = A.saveBegin(name, mime).split('|'); if (r0[0] !== 'ok') throw new Error(r0[1]);
        const buf = new Uint8Array(await blob.arrayBuffer()), CH = 3 * 256 * 1024;
        for (let o = 0; o < buf.length; o += CH) {
          let bin = ''; const part = buf.subarray(o, o + CH);
          for (let i = 0; i < part.length; i += 8192) bin += String.fromCharCode.apply(null, part.subarray(i, i + 8192));
          if (!A.saveChunk(btoa(bin))) throw new Error('не удалось записать файл');
          say(`записываю ${Math.min(100, Math.round((o + CH) / buf.length * 100))}%…`);
          await new Promise((r) => setTimeout(r, 0));
        }
        const r1 = A.saveEnd().split('|'); if (r1[0] !== 'ok') throw new Error(r1[1]);
        say(`Сохранено: ${esc(r1[1])} (${mb} МБ). <button id="dumpShare">Отправить</button>`);
        const sb = $('#dumpShare'); if (sb) sb.onclick = () => A.shareLast(mime);
        A.shareLast(mime);
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        say(`Сохранено: ${esc(name)} (${mb} МБ)`);
      }
    } catch (e) { say('<span class="neg">Ошибка: ' + esc(e.message) + '</span>'); }
  }

  async function loadUniverse(force) {
    if (scanBusy) return;
    scanBusy = true; scanMsg = 'загружаю список…'; renderScanner();
    try {
      univ = await D.getUniverse(S.token, (k, n, t) => { scanMsg = `оборот ${k}/${n}: ${t}`; const m = $('#scanMsg'); if (m) m.textContent = scanMsg; }, force);
      scanMsg = 'список обновлён';
    } catch (e) { scanMsg = 'ошибка: ' + e.message; }
    scanBusy = false; renderScanner();
  }
  async function runScan() {
    if (scanBusy) return;
    scanBusy = true; const tf = S.tf, list = scanList(), out = [];
    const hist = scanHist().filter((x) => x.tf === tf);
    renderScanner();
    for (let k = 0; k < list.length; k++) {
      const x = list[k];
      scanMsg = `${k + 1}/${list.length}: ${x.ticker}`; const m = $('#scanMsg'); if (m) m.textContent = scanMsg;
      try {
        const need = D.scanNeed(tf, S.cfg.maxBars || 2000);
        const raw = await D.getScanBars(S.token, x, tf, need);
        const bars = (await D.withDividends(S.token, x, raw, S.cfg.divAdj !== false)).bars.filter((b) => b.done !== false);
        if (bars.length < 100) throw new Error('мало свечей (' + bars.length + ')');
        const cfg = Object.assign({}, S.cfg, { maxBars: need }), P = D.TF[tf].ms;
        let sw = S.swings[x.id + '.' + tf] || 0, opt = false, grid = null;
        if (S.scanOpt) { await new Promise((r) => setTimeout(r, 0)); const o = E.optimizeSwing(bars, cfg, P); sw = o.best.sw; grid = o.grid; opt = true; }
        const a = E.run(bars, Object.assign({}, cfg, { swingPct: sw }), P);
        let R = 0, n = 0, w = 0, h1 = 0, h2 = 0, best = -Infinity;
        const tMid = (a.bars[0].t + a.bars[a.N - 1].t) / 2;
        for (const t of a.trades) { if (t.reason === 3) continue; R += t.NR; n++; if (t.NR > 0) w++; if (a.bars[t.iEntry].t < tMid) h1 += t.NR; else h2 += t.NR; if (t.NR > best) best = t.NR; }
        // проверки надёжности: обе половины истории, соседние пороги, число сделок, без самой удачной сделки
        const nbR = [0.8, 1.25].map((k) => E.quickStats(bars, cfg, P, a.swing * k).NR);
        const chk = [h1 > 0 && h2 > 0, nbR.every((v) => v > 0), n >= 8, n > 0 && R - best > 0].map((x) => (x ? 1 : 0));
        out.push({ id: x.id, ticker: x.ticker, name: x.name, classCode: x.classCode, sw: a.swing, opt, n, w, R, h1, h2, nbR, chk, ret: a.stats.totalRet, dd: a.stats.maxDD, turn: turnOf(x.id) != null ? turnOf(x.id) : null,
          sig: !!(a.plan && a.planActive), side: a.plan && a.planActive ? a.plan.side : 0, phase: a.phase.text.replace('Фаза: ', ''), bars: a.N, days: Math.round((a.bars[a.N - 1].t - a.bars[0].t) / 86400000) });
      } catch (e) { out.push({ id: x.id, ticker: x.ticker, name: x.name, classCode: x.classCode, err: e.message }); }
      await new Promise((r) => setTimeout(r, 0));
    }
    const rec = { at: Date.now(), tf, rows: out, preset: presetLabel(), list: S.scanList || 'top20' };
    const all2 = scanHist(); all2.push(rec);
    const keep = []; const cnt = {};
    for (let i = all2.length - 1; i >= 0; i--) { const t = all2[i].tf; cnt[t] = (cnt[t] || 0) + 1; if (cnt[t] <= 30) keep.unshift(all2[i]); }
    // история сканов может быть большой — держим в файле
    D.files.set('scanhist.json', keep); D.store.del(SCAN_KEY);
    try { const m = D.buildMarket(tf, S.cfg.marketMA || 200); mktCache[tf] = m; } catch (e) { /* индекс не обязателен */ }
    scanRows = rec; scanPick = 0; scanBusy = false; scanMsg = 'готово';
    renderScanner();
  }
  $('#scanOpen').onclick = () => { openSheet('scanner'); renderScanner(); };

  // ---------- шапка ----------
  function renderHead() {
    const fb = $('#favBtn'); fb.textContent = isFav(S.inst.id) ? '★' : '☆'; fb.classList.toggle('fav', isFav(S.inst.id));
    $('#instTicker').textContent = S.inst.ticker;
    S.recent = [{ id: S.inst.id, ticker: S.inst.ticker, name: S.inst.name, classCode: S.inst.classCode }].concat((S.recent || []).filter((r) => r.id !== S.inst.id)).slice(0, 10);
    $('#instName').textContent = S.inst.name || S.inst.classCode;
    $('#tfBtn').textContent = D.TF[S.tf].name + ' ▾';
    renderBell();
  }
  $('#tfBtn').onclick = () => togglePop('tfBtn', tfPop);
  $('#bellBtn').onclick = () => togglePop('bellBtn', bellPop, bellBind);
  $('#refreshBtn').onclick = () => load(false);
  $('#favBtn').onclick = () => toggleFav(S.inst);

  // ---------- настройки ----------
  const ADD = [
    ['addMarket', 'Торговать по рынку', 'Покупки — только когда «индекс» из бумаг сканера выше своей средней за 200 свечей, продажи — когда ниже. Индекс строится после скана на этом таймфрейме. Проверка на 65 акциях: меньше сделок, выше средний результат'],
    ['stopW2', 'Стоп за волной 2', 'Вход в волну 3: стоп под концом волны 2 — ближе, чем по книге'],
    ['addPhaseExit', 'Выход по смене фазы в бэктесте', 'Закрывать сделку, когда фигура в её сторону завершена'],
    ['addRunner', 'После цели не закрывать', 'Когда цена дошла до цели, стоп переносится в безубыток и дальше подтягивается под локальные минимумы. Не держим, если старшая степень в последней волне в сторону сделки (волна 5 или C) — тогда выход по цели, как в книге'],
    ['addComplexTrade', 'Входы по сложной волне 2 и 4', 'Подсчёт видит расширенный флэт внутри волны 2 или 4 всегда; с этой галочкой по такому подсчёту ещё и открываются сделки'],
    ['addFlipExit', 'Выход при смене подсчёта', 'Закрывать сделку, не дожидаясь стопа, когда основной подсчёт: стал импульсом в обратную сторону с волнами 1-2-3, или увидел в нашей «волне 1» волну A уже завершённого зигзага/флэта. Выход на открытии следующей свечи'],
    ['addStruct', 'Тренд подтверждать структурой', 'Максимумы и минимумы растут (падают)'],
    ['addMinRR', 'Фильтр: мин. прибыль/риск 1,5', ''],
    ['weekExit', 'Выход в пятницу (неделя)', 'В пятницу по закрытию последней свечи сделка без прибыли закрывается, прибыльная остаётся на следующую неделю со стопом в безубытке. Новые входы — только пн–пт'],
    ['wkChan', 'Неделя: убыточную держать, пока цел канал', 'С «выходом в пятницу»: сделку без прибыли закрывать, только если за неделю цена закрылась ниже нижней линии канала её подсчёта (пока идёт волна 3 — линия от начала волны 1 через конец волны 2); иначе — на следующую неделю со своим стопом. 4ч 2018–2026: 18,4 → 19,5%/год, просадка 10,4 → 8,9%'],
    ['wkNextOpen', 'Неделя: выход в понедельник по открытию', 'С «выходом в пятницу»: закрывать не по закрытию пятницы, а по открытию следующей свечи — так и реально исполнить. 4ч 2018–2026: 18,4 → 19,6%/год, лучше в каждом году'],
    ['topOnly', 'Сигнал только от лучшего подсчёта', 'Входить, только если сигнал дал первый (лучший) подсчёт в списке. Сделок на четверть меньше, счёт ровнее, но доход обычно чуть ниже; в «4 часа · неделя» вместе с каналом и понедельником — 20%/год при просадке ~7,5%'],
    ['addDepth', 'Фильтр: рамки глубины волн 2 и 4', 'Волна 2 — 30–80%, волна 4 — до 50%'],
    ['setupCounter', 'Сетап против тренда после 5 волн', ''],
    ['addBreak24', 'Отмечать пробой линии 2-4', 'После пяти волн'],
  ];
  // ---------- готовые настройки (проверка: 65 акций Мосбиржи, чистый R после комиссии) ----------
  const W3ABC = { w3: true, w5: false, abc: true, tri: true };
  const PRESETS = [
    ['d_long', 'Дневки · покупки (основной)', '1d', { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, maxHoldDays: 182, addAO: true, addSma200: true, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 }, '2019–2026: 315 сделок, +162 R, прибыльных 59%. Фильтры AO 5/34 (Вильямс) и «SMA200 растёт» отсеивают входы против долгого тренда, «прибыль/риск не меньше 1,5» (Кеннеди) — сделки со слишком близкой целью, стоп в безубыток, когда цена ушла на 3×ATR (3.0). На общем счёте ~26%/год, просадка ~6%, убыточных подряд до 8 (без безубытка было ~25%, ~8,5% и 15). Робот ведёт набор с риском 1,5% на сделку (3.1): ~30%/год, просадка ~7%. Сделка обычно 1–3 месяца, не дольше 6.'],
    ['d_aggr', 'Дневки · покупки (агрессивный)', '1d', { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, stopW2: true, localBars: 5, maxHoldDays: 182, addAO: true, addPyramid: true, addSma200: true, addMinRR: true, minRR: 1.5, beMode: 'auto', beRule: 'atr', beAtr: 3 }, '2019–2026: +555 R с доливками — стоп под концом волны 2, после цели стоп под минимумами 5 свечей, фильтры AO 5/34, «SMA200 растёт» и «прибыль/риск не меньше 1,5», доливка, когда волна 3 прошла 110% волны 1 (Вильямс), стоп в безубыток, когда цена ушла на 3×ATR. На общем счёте ~27%/год (сильно зависит от того, какие сигналы робот успел взять: 25–33%), просадка ~9,5%. Сделка не дольше 6 месяцев. Прибыльна примерно каждая вторая сделка (46%), убыточных подряд до ~13.'],
    ['h4_week', '4 часа · неделя (покупки)', '4h', { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: true, w5: false, abc: false, tri: false }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true }, '2018–2026 (65 акций, свечи Мосбиржи): ~20%/год на общем счёте, просадка ~7,5%, около 12 сделок в месяц, сделка обычно 2–3 дня. Только вход в волну 3 и только от лучшего подсчёта, фильтры AO 5/34 и «SMA200 растёт», безубыток после хода на 3×ATR. Пятница: с прибылью — на следующую неделю со стопом в безубытке; без прибыли — закрыть, если цена за неделю закрылась ниже нижней линии канала подсчёта, иначе тоже на следующую неделю со своим стопом; выход — по открытию следующей свечи (утро понедельника). Нужна комиссия не больше ~0,1% (тариф «Трейдер»): при 0,2% — ~14%/год. До 3.0 (просто «без прибыли — закрыть в пятницу»): ~18%/год, просадка ~10%. Робот ведёт набор с риском 1,5% на сделку (3.1): ~23%/год, просадка ~9%; плечо не помогает (долг съедает прибавку).'],
    ['h4_fig', '4 часа · Охотник (фигуры)', '4h', { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, addAO: true, addSma200: true, setups: { w3: false, w5: false, abc: false, tri: false, hs: true, brk: true }, beMode: 'auto', beRule: 'atr', beAtr: 3, weekExit: true, wkChan: true, wkNextOpen: true, topOnly: true,
      subs: [{ key: 'hs', cfg: { setups: { w3: false, w5: false, abc: false, tri: false, hs: true, brk: false } } }, { key: 'brk', cfg: { setups: { w3: false, w5: false, abc: false, tri: false, hs: false, brk: true } } }] },
      'Не волны, а две классические фигуры на одном счёте (3.13): перевёрнутая «голова и плечи» по мелким волнам (вход — закрытие выше линии шеи, стоп под правым плечом) и пробой уровня (закрытие выше максимума за 500 свечей, ~4 месяца; стоп под последним минимумом волны). Деньги общие, сигналы у каждой фигуры свои. 2018–2026 (65 акций, свечи Мосбиржи): ~31%/год на общем счёте, первая/вторая половина истории ~28/36%, просадка ~7%, около 10 сделок в месяц, сделка обычно 3 дня. Фильтры (рынок, AO 5/34, SMA200, тренд старшей степени), безубыток 3×ATR и пятничный выход — как у «4 часа · неделя». Проверено 29.10.2026 (research/figures.js); сверх книги — робот для наблюдения.'],
    ['h4_tri', '4 часа · продажи по треугольнику', '4h', { longOnly: false, shortOnly: true, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, setups: { w3: false, w5: false, abc: false, tri: true } }, 'Только продажи (шорт) после завершённого треугольника, когда рынок ниже своей средней. 2018–2026 (65 акций, свечи Мосбиржи): 112 сделок — около 13 в год, в среднем +0,5 R с платой за шорт 15% годовых, отдельным счётом ~15%/год вместе с фондом на свободные деньги, просадка ~2%; сделка обычно 3 дня. Осторожно: сделок мало, прибыль дали немногие бумаги, запреты шорта и список бумаг брокера не учтены — пока для наблюдения.'],
    ['d_both', 'Дневки · с шортом', '1d', { longOnly: false, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: false, maxHoldDays: 182 }, 'Сделка не дольше 6 месяцев. 2019–2026: +266 R, 973 сделки, +0,27 R, 55 из 65.'],
    ['h4_long', '4 часа · покупки', '4h', { longOnly: true, shortOnly: false, swingMult: 1, addMarket: true, addRunner: true, addFlipExit: true, addStruct: true }, '2025–2026: +19 R, 550 сделок — около нуля. Лучше для уточнения входа по дневкам.'],
    ['h4_short', '4 часа · продажи', '4h', { longOnly: false, shortOnly: true, swingMult: 1.5, addMarket: true, addRunner: false, addFlipExit: true, addStruct: true }, '2025–2026: +51 R, 444 сделки, +0,12 R, 41 из 65. Проверено только на падающем рынке.'],
    ['h1_long', '1 час · покупки', '1h', { longOnly: true, shortOnly: false, swingMult: 2, addMarket: true, addRunner: false, addFlipExit: true, addStruct: true }, '2026: +16 R, 424 сделки — около нуля.'],
    ['h1_short', '1 час · продажи', '1h', { longOnly: false, shortOnly: true, swingMult: 1.5, addMarket: true, addRunner: false, addFlipExit: true, addStruct: true }, '2026: +128 R, 904 сделки, +0,14 R, 47 из 65. Только падающий рынок 2026 года.'],
  ];
  function applyPreset(key) {
    const p = PRESETS.find((x) => x[0] === key); if (!p) return;
    flashPreset('поставлено');
    const keep = { maxBars: S.cfg.maxBars || 2000, riskPct: S.cfg.riskPct, feePct: S.cfg.feePct, beRule: S.cfg.beRule, beAtr: S.cfg.beAtr, beMode: S.cfg.beMode, divAdj: S.cfg.divAdj, cashYield: S.cfg.cashYield };
    S.cfg = Object.assign({}, keep, { setups: Object.assign({}, W3ABC), addComplexTrade: false, addPhaseExit: false, addMinRR: false, addDepth: false, exitMode: 'fixed', targetMode: 'main', minScore: 45, bookTrend: true, addTrend: 'none', stopW2: false, localBars: 2, maxHoldDays: 0 }, p[3]);
    Object.keys(S.cfg).forEach((k) => { if (S.cfg[k] === undefined) delete S.cfg[k]; });
    S.preset = key;
    const tfChanged = S.tf !== p[2]; S.tf = p[2]; save();
    renderSettings(); renderHead(); sel = -1;
    if (tfChanged) { an = null; view.init = false; load(false); } else if (all.length) compute(true);
  }
  let presetFlash = '';   // короткое «поставлено» после нажатия
  function flashPreset(t) { presetFlash = t; setTimeout(() => { presetFlash = ''; }, 4000); }
  function presetBlock() {
    const mine = S.myCfg;
    return `<div class="note" style="margin-bottom:10px">Сейчас стоит: <b>${esc(presetLabel())}</b> · ${esc(D.TF[S.tf].name)}${presetFlash ? ' — <span class="pos">' + esc(presetFlash) + '</span>' : ''}</div><div class="card"><h3>Готовые настройки</h3>
      <div class="small">Проверены на 65 акциях Мосбиржи (чистый R — после комиссии). Ставят таймфрейм и дополнения; риск, комиссия, капитал и ручные пороги не меняются.</div>
      ${PRESETS.map(([k, t, tf, , d]) => `<div class="jrow"><div class="row"><b>${t}</b><button data-preset="${k}" class="${S.preset === k ? 'on' : ''}">${S.preset === k ? '✓ Выбрано' : 'Поставить'}</button></div><div class="small">${d}</div></div>`).join('')}
      ${S.cfg.addMarket && !mktFor(S.tf) ? `<div class="note">Для фильтра рынка нужен индекс на ${esc(D.TF[S.tf].name)}: откройте сканер и просканируйте «Топ-50» на этом таймфрейме.</div>` : ''}</div>
      <div class="card"><h3>Свои настройки</h3>
      <div class="jrow"><div class="row"><b>Как по книге</b><button id="presetBook" class="${S.preset === 'book' ? 'on' : ''}">${S.preset === 'book' ? '✓ Выбрано' : 'Поставить'}</button></div><div class="small">Без дополнений, все сетапы, крупность ×1.</div></div>
      <div class="jrow" style="border-bottom:0"><div class="row"><b>Мои настройки</b><span><button id="mySave">Сохранить текущие</button> <button id="myLoad" class="${S.preset === 'mine' ? 'on' : ''}" ${mine ? '' : 'disabled'}>${S.preset === 'mine' ? '✓ Выбрано' : 'Вернуть'}</button></span></div><div class="small">${mine ? 'Сохранены ' + fmtT(mine.at, true) + ' (' + esc(D.TF[mine.tf] ? D.TF[mine.tf].name : mine.tf) + ').' : 'Сохраните свои настройки, чтобы спокойно пробовать готовые.'}</div></div>
      <div class="row" style="margin-top:10px"><button id="resetCfg">Сбросить анализ к «как по книге»</button></div>
      <div class="small">То же, что «Как по книге», плюс пороги разворота по всем бумагам вернутся на «авто» (ручные пороги сотрутся). Риск, комиссия и дивиденды не меняются.</div></div>`;
  }

  function bgStatus() {
    if (!A || DESK || !S.bgMinutes) return '';
    const lb = D.store.get('lastbg', null), now = Date.now(), lim = Math.max(S.bgMinutes, 15) * 60000 * 2.5;
    let h = '<div class="small" style="margin-top:4px">';
    if (!lb) h += '<span class="warn">Фоновая проверка ещё ни разу не запускалась.</span>';
    else {
      const ago = Math.round((now - lb.at) / 60000);
      const agoT = ago < 60 ? ago + ' мин' : Math.round(ago / 60) + ' ч';
      if (lb.running && ago < 5) h += `Проверка в фоне идёт сейчас (началась ${fmtT(lb.at, true)}).`;
      else if (lb.running) h += `Последний запуск в фоне: ${fmtT(lb.at, true)} (${agoT} назад) — <span class="warn">не успел закончиться: Android остановил его раньше времени${lb.step ? ' (на шаге «' + esc(lb.step) + '»' + (lb.n ? ', бумага ' + lb.i + ' из ' + lb.n : '') + ')' : ''}</span>.`;
      else h += `Последний запуск в фоне: ${fmtT(lb.at, true)} (${agoT} назад)${lb.ok ? ' — успешно' + (lb.sec != null ? ', ' + lb.sec + ' с' : '') : ' — <span class="neg">с ошибкой' + (lb.err ? ': ' + esc(lb.err) : '') + '</span>'}.`;
      if (now - lb.at > lim) h += ' <span class="warn">Давно не было — похоже, телефон усыпляет приложение.</span>';
    }
    h += '</div>';
    const bat = A.batteryOk ? A.batteryOk() : true;
    if (!bat) h += `<div class="note">Для приложения включена экономия батареи — Android может не запускать проверки вовремя. <button id="batBtn">Отключить экономию</button><br><span class="small">В открывшемся списке найдите «Волны Эллиотта» → «Не экономить». На Xiaomi ещё: Настройки → Приложения → Волны Эллиотта → Контроль активности → «Нет ограничений».</span></div>`;
    return h;
  }

  function renderSettings() {
    const c = Object.assign({}, E.DEFAULTS, S.cfg);
    const sched = A && A.isScheduled ? A.isScheduled() : false;
    const TABS = [['ready', 'Готовые'], ['anal', 'Анализ'], ['acct', 'Счёт'], ['alerts', 'Сигналы'], ['data', 'Данные']];
    const tab = TABS.some(([k]) => k === S.setTab) ? S.setTab : (S.token ? 'ready' : 'acct');
    $('#setTabs').innerHTML = TABS.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}${k === 'acct' && !S.token ? '<span class="dot"></span>' : ''}${k === 'alerts' && (S.watch.length + (S.palerts || []).length) ? ' ' + (S.watch.length + (S.palerts || []).length) : ''}</button>`).join('');
    $('#setTabs').querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.setTab = b.dataset.tab; save(); renderSettings(); $('#setBody').scrollTop = 0; }; });
    let h = '';
    if (tab === 'ready') h = presetBlock();
    if (tab === 'anal') h = `<div class="card"><h3>Направление и крупность волн</h3>
      <div class="field"><label>Направление сделок</label><select id="dirSel">
        <option value="long" ${c.longOnly ? 'selected' : ''}>Только покупки</option>
        <option value="short" ${c.shortOnly ? 'selected' : ''}>Только продажи (шорт)</option>
        <option value="both" ${!c.longOnly && !c.shortOnly ? 'selected' : ''}>Обе стороны</option></select></div>
      <div class="small">Продажи — это и подсказка «сейчас не покупать». Для шорта у брокера нужна маржинальная торговля; плату за перенос короткой позиции бэктест не учитывает.</div>
      <div class="field" style="margin-top:8px"><label>Крупность волн для порога «Авто»</label><select id="swMult">${[[1, '×1 — мелкие волны'], [1.5, '×1,5'], [2, '×2 — крупнее (рекомендую)'], [3, '×3 — самые крупные']].map(([v, t]) => `<option value="${v}" ${(c.swingMult || 1) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="small">Проверка на 65 акциях (часовки, янв–окт 2026): ×1 — минус после комиссий, ×2 — лучший результат. На порог, выставленный вручную, не влияет.</div>
      ${c.addMarket ? `<div class="small" style="margin-top:6px">Индекс рынка для ${esc(D.TF[S.tf].name)}: ${(() => { const m = mktFor(S.tf); return m ? m.n + ' бумаг, обновлён ' + fmtT(m.at, true) + ', сейчас рынок ' + (m.up[m.up.length - 1] ? '<span class="pos">выше</span>' : '<span class="neg">ниже</span>') + ' средней' : '<span class="warn">нет — запустите сканер на этом таймфрейме (нужно хотя бы 5 бумаг)</span>'; })()}</div>` : ''}</div>
<div class="card"><h3>По книге</h3>
      <div class="field"><label>Мин. соответствие нормам для сигнала (0–100)</label><input type="number" id="minScore" value="${c.minScore}" min="0" max="100"></div>
      <label class="sw"><input type="checkbox" id="bookTrend" ${c.bookTrend ? 'checked' : ''}><span>Торговать по тренду старшей степени<small>Стр. 34: движущие волны идут по тренду большей степени</small></span></label>
      ${[['w3', 'Сетап: вход в волну 3'], ['w5', 'Сетап: вход в волну 5'], ['abc', 'Сетап: после коррекции A-B-C'], ['tri', 'Сетап: рывок из треугольника']].map(([k, t]) => `<label class="sw"><input type="checkbox" data-s="${k}" ${c.setups[k] ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      <div class="field" style="margin-top:8px"><label>Запас за уровнем стопа, %</label><input type="number" step="0.01" id="stopBuf" value="${c.stopBufPct}"></div></div>
<div class="card"><h3>Дополнения <span class="small" style="text-transform:none;letter-spacing:0">по умолчанию выключены</span></h3>
      ${ADD.map(([k, t, d]) => `<label class="sw"><input type="checkbox" data-a="${k}" ${c[k] ? 'checked' : ''}><span>${t}${d ? '<small>' + d + '</small>' : ''}</span></label>`).join('')}
      <div class="small" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.05em">По Вильямсу («Торговый хаос»)</div>
      <label class="sw"><input type="checkbox" data-a="addAO" ${c.addAO ? 'checked' : ''}><span>Фильтр AO 5/34<small>Вход только если осциллятор 5/34 на стороне сделки (покупка — выше нуля).<em class="hist">Проверка на дневках 65 акций 2019–2026: сделок на четверть меньше, в среднем +0,54 R вместо +0,45, на общем счёте ~25%/год вместо ~23%. На 1ч не помогает.</em></small></span></label>
      ${c.addAO ? `<div class="field"><label>Строгость фильтра AO</label><select id="aoMode"><option value="pos" ${c.aoMode !== 'both' ? 'selected' : ''}>AO на стороне сделки</option><option value="both" ${c.aoMode === 'both' ? 'selected' : ''}>Строже: AO ещё и выше своей средней — сделок вдвое меньше, просадка ниже</option></select></div>` : ''}
      <label class="sw"><input type="checkbox" data-a="addPyramid" ${c.addPyramid ? 'checked' : ''}><span>Доливка на 110% волны 1<small>Когда волна 3 прошла 110% длины волны 1, докупить ещё на тот же риск; стоп общий — системы.<em class="hist">Проверка на дневках: агрессивный набор ~34%/год вместо ~29%, у основного эффект смешанный. Стоп «за вершину волны 1» по Вильямсу проверку не прошёл (прибыль вдвое меньше) — не используется.</em></small></span></label>
 <div class="small" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.05em">Фильтры тренда</div>
      <label class="sw"><input type="checkbox" data-a="addSma200" ${c.addSma200 ? 'checked' : ''}><span>Фильтр «SMA200 растёт»<small>Покупка — только если 200-дневная средняя бумаги выше, чем месяц (20 свечей) назад; продажа — наоборот.<em class="hist">Проверка на дневках 65 акций 2019–2026: сделок на 15% меньше, в среднем +0,58 R вместо +0,51, серия стопов 11 вместо 17, просадка счёта 8% вместо 12%, ~26%/год вместо ~25%. Срок 5–60 дней — результат похожий.</em></small></span></label>
      <label class="sw"><input type="checkbox" data-a="addMktFast" ${c.addMktFast ? 'checked' : ''} ${c.addMarket ? '' : 'disabled'}><span>Осторожный режим: рынок выше средней за 50 дней<small>${c.addMarket ? 'Вдобавок к фильтру рынка: покупка — только если индекс всех бумаг выше своей средней за 50 дней. Вместе с SMA200 на дневках: основной — просадка 6% вместо 8%, серия стопов 9, но ~24,5%/год вместо ~26%; агрессивный — просадка 8% вместо 11%, ~36,5%/год вместо ~38%. Для тех, кому важнее спокойствие.' : 'Нужен включённый фильтр «по рынку».'}</small></span></label>
      <label class="sw"><input type="checkbox" id="maTrend" ${c.addTrend === 'ma' ? 'checked' : ''}><span>Тренд по скользящей средней ${c.trendMA}<small>Вместо старшей степени волн</small></span></label>
      <div class="small" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.05em">Подсказки сверх книги</div>
      <label class="sw"><input type="checkbox" id="fibTime" ${S.view.fibT ? 'checked' : ''}><span>⏱ Время по Фибоначчи<small>На графике голубой пунктир там, где текущая волна достигла бы 0,618, 1 и 1,618 длительности прошлой волны (волна 5 и 3 — по волне 1, волна 4 — по волне 2, волна C — по волне A). В книге время вторично, поэтому это только подсказка: на сделки не влияет. То же — в «Вид ▾».</small></span></label>
      <div class="field" style="margin-top:8px"><label>Перенос стопа в бэктесте</label><select id="exitMode">
        <option value="fixed" ${c.exitMode === 'fixed' ? 'selected' : ''}>Выкл: стоп и цель неподвижны, как в книге</option>
        <option value="sub" ${c.exitMode !== 'fixed' ? 'selected' : ''}>Под локальными минимумами, только в плюс</option></select></div>
      <div class="field"><label>Цель сделки</label><select id="tgtMode">
        <option value="main" ${c.targetMode === 'main' ? 'selected' : ''}>По соотношениям волн, как в книге</option>
        <option value="near" ${c.targetMode === 'near' ? 'selected' : ''}>Ближняя (волна 3 = волна 1)</option>
        <option value="none" ${c.targetMode === 'none' ? 'selected' : ''}>Без цели: выход только по стопу</option></select></div>
      <div class="field"><label>Стоп после цели («После цели не закрывать») — под минимумами за</label><select id="locBars">${[[1, '1 свечу'], [2, '2 свечи (как было)'], [3, '3 свечи'], [5, '5 свечей — держит тренд дольше (рекомендую)'], [8, '8 свечей']].map(([v, t]) => `<option value="${v}" ${(c.localBars || 2) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Предельный срок сделки</label><select id="maxHoldD">${[[0, 'Без ограничения'], [30, '1 месяц'], [91, '3 месяца'], [122, '4 месяца'], [182, '6 месяцев (рекомендую для дневок)'], [274, '9 месяцев'], [365, '12 месяцев']].map(([v, t]) => `<option value="${v}" ${(c.maxHoldDays || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="small">Если сделка открыта дольше — выход по закрытию свечи, придёт уведомление «срок вышел». Проверка на 65 акциях (дневки): 6 месяцев почти не меняют результат, 3–4 месяца — заметно хуже (обрезают самые сильные тренды).</div></div>
<div class="card"><h3>Безубыток</h3>
      <div class="field"><label>Режим</label><select id="beMode">
        <option value="hint" ${c.beMode !== 'auto' ? 'selected' : ''}>Только подсказка — сделки не меняются</option>
        <option value="auto" ${c.beMode === 'auto' ? 'selected' : ''}>Переносить стоп (бэктест и тренажёр)</option></select></div>
      <div class="small">${c.beMode === 'auto' ? 'Когда сработает условие, стоп системы встаёт на цену входа + комиссии — в бэктесте, статистике и у системы в тренажёре. Выход по нему в таблице — «безубыток». Роботы торгуют по своим наборам — их это не меняет.' : 'Подсказка видна в «Вид ▾ → Подсказка безубытка»: ступенька стопа и крестик, где выбило бы; в тренажёре — событие «Пора в безубыток» и для ваших позиций; уведомление — ⚙ → Сигналы → «Безубыток и подтягивание стопа».'}</div>
      <div class="field" style="margin-top:8px"><label>Когда переносить</label><select id="beRule">
        <option value="atr" ${c.beRule === 'atr' ? 'selected' : ''}>Цена ушла на N×ATR от входа (рекомендую)</option>
        <option value="ao" ${c.beRule === 'ao' ? 'selected' : ''}>Тревога: AO 5/34 повернул против сделки</option>
        <option value="r2" ${c.beRule === 'r2' ? 'selected' : ''}>Цена прошла +2R</option>
        <option value="wave" ${c.beRule === 'wave' ? 'selected' : ''}>По волнам: волна 3 прошла вершину волны 1 и сделала первый откат</option>
        <option value="stall" ${c.beRule === 'stall' ? 'selected' : ''}>Тревога: 20 свечей без движения (меньше +0,5R)</option>
        <option value="mkt" ${c.beRule === 'mkt' ? 'selected' : ''}>Тревога: рынок ниже своей средней за 50 дней</option>
        <option value="r1" ${c.beRule === 'r1' ? 'selected' : ''}>Цена прошла +1R</option>
        ${c.beMode === 'auto' ? '' : `<option value="local" ${c.beRule === 'local' ? 'selected' : ''}>Лесенка: стоп за каждую новую опору выше входа (только подсказка)</option>`}</select></div>
      <div class="field" ${c.beRule === 'atr' ? '' : 'hidden'}><label>N — сколько ATR (средних размахов свечи) должна пройти цена</label><input type="number" step="0.5" min="1" id="beAtr" value="${c.beAtr}"></div>
      <details class="trev"><summary>Что показала проверка (дневки, 65 бумаг, 2019–2026)</summary><div class="small mut">
        <p style="margin:6px 0">Переносить стоп всегда немного режет сумму R: часть сделок выбивает в ноль перед большим ходом. Зато освободившиеся деньги идут в следующие сигналы, и на общем счёте итог почти не меняется, а «нервов» меньше.</p>
        <p style="margin:6px 0"><b>3×ATR</b> — основной набор: ~26%/год вместо ~25%, просадка 6% вместо 8,5%, серия стопов 8 вместо 15, прибыльных 59% вместо 50%. Агрессивный (с доливками): ~31%/год вместо ~32%, просадка 9% вместо 11%, серия стопов 13 вместо 26. Серии короче при 2,5–3,5×ATR; доход от множителя скачет (29–34%/год).</p>
        <p style="margin:6px 0"><b>AO против</b> — основной ~27%/год, агрессивный ~35% (без доливок). <b>+2R</b> — почти без изменений. <b>По волнам</b>, <b>20 свечей</b>, <b>+1R</b> — хуже или без пользы. <b>Рынок ниже средней</b> — меньше просадка (6%), но ~23%/год вместо ~26%.</p>
        <p style="margin:6px 0">Поэтому по умолчанию — только подсказка, а «переносить стоп» — по желанию: если для вас важнее короткие серии стопов, чем лишний процент.</p></div></details></div>
`;
    if (tab === 'acct') h = `<div class="card"><h3>Т-Инвестиции</h3>
      <div class="field"><label>Токен T-Invest API (только для чтения)</label><input id="tok" type="password" autocomplete="off" placeholder="t.xxxxxxxx…" value="${esc(S.token)}"></div>
      <div class="row"><button id="tokSave">Сохранить и проверить</button><button id="tokShow">Показать</button>${S.token ? '<button id="tokDel">Удалить</button>' : ''}</div>
      <div class="small" id="tokRes" style="margin-top:6px">Токен хранится только в этом телефоне. Выпустить его можно на компьютере: tbank.ru/invest/settings → «Токены T-Bank Invest API» → «Только для чтения».</div></div>
<div class="card"><h3>Объём позиции</h3>
      <div class="field"><label>Капитал для расчёта, ₽ (0 — не считать)</label><input type="number" step="1000" min="0" id="capital" value="${Number(S.capital) || 0}"></div>
      ${S.token ? `<div class="row"><button id="acctBtn">Взять с брокерского счёта</button>${(S.accounts || []).length > 1 ? `<select id="acctSel" style="width:auto">${S.accounts.map((a) => `<option value="${esc(a.id)}" ${S.account && S.account.id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}</div>
      <div class="small" id="acctRes">${acctText()}</div>
      ${S.account ? `<label class="sw"><input type="checkbox" id="brokerSync" ${S.brokerSync !== false ? 'checked' : ''}><span>Мои сделки со счёта на графике и в дневнике<small>Исполненные покупки ▲ и продажи ▼ по открытой бумаге; из них сами собираются записи дневника (комментарий можно дописать)</small></span></label>` : ''}` : ''}
      <div class="small">В плане покажу, сколько лотов брать, чтобы потеря до стопа была не больше «риска на сделку» (${c.riskPct}%) и без плеча. Лотность берётся у брокера.</div></div>
<div class="card"><h3>Риск и комиссия</h3>
      <div class="field"><label>Риск на сделку, % капитала</label><input type="number" step="0.1" id="risk" value="${c.riskPct}"></div>
      <div class="field"><label>Комиссия брокера, % за сторону</label><input type="number" step="0.01" id="fee" value="${c.feePct}"></div>
      <label class="sw"><input type="checkbox" id="cashOn" ${c.cashYield > 0 ? 'checked' : ''}><span>Свободные деньги — в фонде денежного рынка<small>Сделки занимают в среднем около половины счёта. Остальное можно держать в фонде денежного рынка (это почти вклад, но на бирже) и продавать его часть, когда пришёл сигнал. С галочкой бэктест начисляет проценты на свободную часть.</small></span></label>
      ${c.cashYield > 0 ? `<div class="field"><label>Доходность фонда, % годовых (≈ ключевая ставка минус 0,5–1)</label><input type="number" step="0.5" min="0" id="cashRate" value="${c.cashYield}"></div>` : ''}</div>
      ${A && A.installRussianCA ? `<div class="card"><h3>Сертификат Минцифры</h3>
      <div class="small">Сервер API Т-Банка подписан российским удостоверяющим центром (Russian Trusted Root CA). Android ему по умолчанию не доверяет. Приложение скачает сертификат с официального сайта gu-st.ru и будет использовать его только для своих запросов к брокеру — на остальной телефон это не влияет.</div>
      <div id="caInfo" class="small" style="margin:6px 0">${caText()}</div>
      <div class="row"><button id="caBtn">${A.caInfo() ? 'Скачать заново' : 'Скачать с gu-st.ru'}</button></div></div>` : ''}
`;
    if (tab === 'alerts') h = `<div class="card"><h3>Как это работает</h3>
      <div class="small">${DESK ? 'Пока программа открыта или свёрнута к часам, она каждые 5 минут' : 'Android раз в 15 минут — 4 часа (как выберете ниже) будит приложение, даже закрытое. Оно'} скачивает свечи, пересчитывает волны и сравнивает с прошлой проверкой: появилось новое — присылает уведомление. Нажатие на уведомление открывает эту бумагу.<br>Быстрее всего включать с главного экрана: кнопка 🔔 рядом с таймфреймом.</div></div>
      <div class="card${foldC('notifs')}" data-fold="notifs"><h3>📨 История оповещений</h3><div class="small">Все уведомления, что приходили (последние 50). Нажмите — откроется график бумаги.</div>${notifRows(50)}</div>
      <div class="card"><h3>Сигналы системы</h3>
      <div class="small">Бумаги и таймфреймы, по которым присылать вход, выход и уровни. Каждая проверяется по тем настройкам, что стояли, когда её добавили.</div>
      <div id="watchList"></div>
      <div class="row" style="margin-top:8px"><button id="wAdd">+ Добавить ${esc(S.inst.ticker)} ${D.TF[S.tf].name}</button><button id="wTest">Проверить сейчас</button></div>
      ${DESK ? '' : `<div class="field" style="margin-top:10px"><label>Как часто проверять</label><select id="bg">${[[0, 'Выключено'], [15, 'Каждые 15 минут'], [30, 'Каждые 30 минут'], [60, 'Каждый час'], [240, 'Каждые 4 часа']].map(([m, t]) => `<option value="${m}" ${S.bgMinutes === m ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`}
      <div class="small">${DESK ? 'На компьютере программа проверяет сигналы и роботов каждые 5 минут, пока она открыта или свёрнута к часам (значок рядом с часами Windows). Когда компьютер выключен или спит, проверок нет.' : A ? (sched ? 'Фоновая проверка включена.' : 'Фоновая проверка выключена.') : 'Фоновая проверка работает только в приложении на телефоне.'} ${(() => { const l = D.store.get('lastcheck', 0); return l ? 'Последняя проверка ' + fmtT(l, true) + '.' : ''; })()}</div>
      <div id="bgStat">${bgStatus()}</div>
      ${(() => { const le = D.store.get('lasterr', null); return le && Date.now() - le.at < 86400000 ? `<div class="note">Ошибка проверки ${fmtT(le.at, true)}: ${esc(le.msg)}</div>` : ''; })()}
      <label class="sw"><input type="checkbox" data-n="signal" ${S.notify.signal ? 'checked' : ''}><span>Новый сигнал на вход<small>Покупка/продажа с входом, стопом и целью</small></span></label>
      <label class="sw"><input type="checkbox" data-n="exit" ${S.notify.exit ? 'checked' : ''}><span>Сигналы на выход<small>Фигура завершена, а при включённом дополнении — подсчёт развернулся против сделки</small></span></label>
      <label class="sw"><input type="checkbox" data-n="levels" ${S.notify.levels !== false ? 'checked' : ''}><span>Уровни<small>Сделка дошла до цели или стопа; цена прошла уровень отмены подсчёта</small></span></label>
      <label class="sw"><input type="checkbox" data-n="stop" ${S.notify.stop ? 'checked' : ''}><span>Безубыток и подтягивание стопа<small>Новый минимум выше входа у открытой сделки индикатора</small></span></label>
      <label class="sw"><input type="checkbox" data-n="robot" ${S.notify.robot !== false ? 'checked' : ''}><span>Действия робота (виртуальный счёт)<small>Сигнал «завтра купит», покупка, продажа, перенос стопа после цели. Включается в 📒 → «🤖 Робот»</small></span></label></div>
      <div class="card"><h3>Мои уровни и сделки</h3>
      ${(() => { const pf = D.store.get('pfired', {}), l = (S.palerts || []).slice().sort((a, b) => a.ticker.localeCompare(b.ticker) || b.price - a.price);
        return l.length ? l.map((a) => `<div class="watch"><span><b>${esc(a.ticker)}</b> ${a.dir > 0 ? '▲ выше' : '▼ ниже'} <span class="mono">${a.price.toFixed(a.price < 10 ? 4 : 2).replace('.', DEC())}</span><br><span class="small">${pf[a.id] ? 'сработал ' + fmtT(pf[a.id], true) : 'ждёт · поставлен ' + fmtT(a.at, true)}</span></span><button data-lvdel="${a.id}">✕</button></div>`).join('') : '<div class="small" style="padding:4px 0 8px">Уровней нет. Поставить: 🔔 на главном экране или долгое нажатие на графике.</div>'; })()}
      <label class="sw"><input type="checkbox" data-n="quiet" ${S.notify.quiet ? 'checked' : ''}><span>🔕 Без звука<small>Уведомления приходят тихо: видны в шторке, но без звука, вибрации и всплывающего окна. Тонко звук настраивается и в Android: Настройки → Приложения → Волны Эллиотта → Уведомления.</small></span></label>
      <label class="sw"><input type="checkbox" data-n="mine" ${S.notify.mine !== false ? 'checked' : ''}><span>Стоп и цель моих сделок из дневника<small>Когда у открытой записи в дневнике указан стоп или цель, придёт уведомление, если цена до них дошла. Один раз на каждый уровень.</small></span></label>
      <div class="small">Уровни проверяются по 5-минутным свечам с прошлой проверки, так что касание не пропустится, даже если цена потом ушла обратно. Уведомление придёт с задержкой до интервала проверки.</div></div>
`;
    if (tab === 'data') h = `<div class="card"><h3>Оформление</h3><div class="skins">${skinPick()}</div>
      <label class="sw" style="margin-top:8px"><input type="checkbox" id="tzMsk" ${S.tz !== 'local' ? 'checked' : ''}><span>Время по Москве (МСК)<small>Как на бирже и у роботов: свечи, сделки, журнал и уведомления — по московскому времени, где бы вы ни были. Без галочки — по часам телефона (сейчас разница с Москвой ${(() => { const h = -new Date().getTimezoneOffset() / 60 - 3; return h ? (h > 0 ? '+' : '−') + Math.abs(h) + ' ч' : 'нет'; })()}). Роботы в любом случае считают по Москве.</small></span></label>
      <label class="sw" style="margin-top:8px"><input type="checkbox" id="animOn" ${animOn() ? 'checked' : ''}><span>Анимации<small>Роботы с настроением, колокольчик звенит, гонка роботов, салют за хорошую сделку и новый значок, пульсирующая точка входа на свежем сигнале. На торговлю не влияют.</small></span></label><div class="small" style="margin-top:4px">Меняются фон и цвет свечей. Цвета сигналов — стоп, цель, волны, сделки — во всех темах одинаковые. Тему можно сменить и в «Вид ▾» под графиком.</div></div>
<div class="card"><h3>Свечи</h3>
      <div class="field"><label>Сколько свечей загружать и анализировать</label><select id="maxBars">${[1000, 2000, 3000].map((m) => `<option ${(c.maxBars || 2000) === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Дробная часть чисел</label><select id="decSel"><option value="dot" ${S.decComma ? '' : 'selected'}>Точка: 43.54</option><option value="comma" ${S.decComma ? 'selected' : ''}>Запятая: 43,54</option></select></div>
      <label class="sw"><input type="checkbox" id="divAdj" ${c.divAdj !== false ? 'checked' : ''}><span>Учитывать дивиденды<small>Свечи до отсечки уменьшаются на размер дивиденда, чтобы гэп отсечки не считался падением. Так делают терминалы.</small></span></label></div>
<div class="card"><h3>Перенос на другое устройство</h3>
      <div class="small">Роботы (счета, позиции, сделки, журнал), мои сделки, список слежения, уровни, избранное, оповещения и настройки — одним файлом. Без токена и номера счёта: на новом устройстве токен вводится заново.</div>
      <div class="row" style="margin-top:8px"><button id="xferExp">Выгрузить в файл</button>${!A || DESK ? '<button id="xferImp">Загрузить из файла</button>' : ''}</div>
      <input type="file" id="xferFile" accept=".json,application/json" hidden>
      <div class="small" id="xferRes">${DESK ? 'С телефона: ⚙ → Данные → «Выгрузить в файл», файл из «Загрузок» перенесите на компьютер (Telegram, почта, кабель) и нажмите здесь «Загрузить из файла».' : 'Для программы на компьютере: файл появится в «Загрузках», отправьте его себе (Telegram, почта) и загрузите в программе.'} После переноса роботы на двух устройствах ведутся отдельно.</div></div>
<div class="card"><h3>Журнал работы (лог)</h3>
      ${(() => { const L = D.logRead(), all2 = L.app.items.concat(L.bg.items), errN = all2.filter((x) => x.k === 'error' || x.k === 'crash').length, sigN = all2.filter((x) => x.k === 'signal').length, first = all2.reduce((m, x) => Math.min(m, x.t), Infinity);
        return `<div class="small">Приложение само записывает: ошибки, сбои связи с брокером, фоновые проверки, отправленные уведомления, новые сигналы (чтобы потом сверить, как они отработали) и смену настроек. Без токена, номеров счетов и сумм. Хранятся последние 3000 записей.</div>
        <div class="small" style="margin-top:6px">Сейчас: ${L.app.items.length} в приложении + ${L.bg.items.length} в фоне${isFinite(first) ? ', с ' + fmtT(first, true) : ''} · ошибок <b class="${errN ? 'neg' : ''}">${errN}</b> · сигналов ${sigN}.</div>
        ${L.app.items.concat(L.bg.items).filter((x) => x.k === 'error' || x.k === 'crash').sort((a, b) => b.t - a.t).slice(0, 3).map((x) => `<div class="small mut">${fmtT(x.t, true)} — ${esc(x.m)}</div>`).join('')}`; })()}
      <div class="row" style="margin-top:8px"><button id="logExp">Выгрузить лог</button><button id="logClr">Очистить</button></div>
      <div class="small" id="logRes">Пришлите файл в чат, когда что-то пошло не так или через пару недель работы — по сигналам из лога проверим стратегию «вживую».</div></div>
<div class="card"><h3>О приложении</h3><div><b>Волны Эллиотта</b> · версия ${APP_VER}</div><div style="margin-top:4px">Разработчик: <b>${esc(DEV)}</b></div><div class="small" style="margin-top:4px">Анализ по книге Пректера и Фроста «Волновой принцип Эллиотта». Движок как в индикаторе MT5 2.40 + дополнения приложения.</div></div>`;
    $('#setBody').innerHTML = h;
    skinBind($('#setBody'), renderSettings);
    { const ao = $('#animOn'); if (ao) ao.onchange = () => { S.anim = ao.checked; save(); applyAnim(); draw(); }; }
    { const tz = $('#tzMsk'); if (tz) tz.onchange = () => { S.tz = tz.checked ? 'msk' : 'local'; save(); renderHead(); draw(); D.log('settings', 'время на экране: ' + (tz.checked ? 'МСК' : 'по телефону')); }; }
    const sv = $('#setVer'); if (sv) sv.textContent = 'v' + APP_VER;
    $('#manBtn').dataset.man = { ready: 'sets', acct: 'token', alerts: 'alerts' }[tab] || 'settings';   // раздел инструкции про эту вкладку
    renderWatch();
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
    on('#caBtn', 'click', () => { const b = $('#caBtn'); b.disabled = true; b.textContent = 'Скачиваю…'; A.installRussianCA(); });
    on('#tokShow', 'click', () => { const t = $('#tok'); t.type = t.type === 'password' ? 'text' : 'password'; });
    on('#tokDel', 'click', () => { S.token = ''; save(); renderSettings(); load(false); });
    on('#tokSave', 'click', async () => {
      const t = $('#tok').value.trim().replace(/\s+/g, '');
      $('#tokRes').textContent = 'Проверяю…';
      try {
        const t0 = Date.now(), bars = await D.loadCandles(t, 'SBER_TQBR', '1d', 5, Date.now() - 10 * 86400000);
        S.token = t; save();
        $('#tokRes').innerHTML = D.mxState().at >= t0 ? '<span class="warn">Сервер брокера сейчас не отвечает — токен сохранён, но не проверен. Пока цены с Мосбиржи.</span>'
          : `<span class="pos">Токен работает: получено ${bars.length} дневных свечей SBER.</span>`;
        load(true);
      } catch (e) {
        if (e.cert) { S.token = t; save(); }
        $('#tokRes').innerHTML = `<span class="neg">${esc(e.message)}</span>`;
      }
    });
    on('#wAdd', 'click', () => {
      addWatch(); renderHead(); renderSettings();
    });
    on('#wTest', 'click', async () => {
      if (!S.token) { alertMsg('Сначала введите токен.'); return; }
      const btn = $('#wTest'); btn.textContent = 'Проверяю…';
      const logs = [];
      const ev = await D.checkAll((m) => logs.push(m));
      btn.textContent = 'Проверить сейчас';
      sendNotes(ev, 500);
      alertMsg((ev.length ? 'Новых событий: ' + ev.length + ' (отправлены уведомления).\n' : 'Новых событий нет.\n') + logs.join('\n'));
      renderSettings();
    });
    on('#bg', 'change', () => { S.bgMinutes = Number($('#bg').value); save(); applySchedule(); renderSettings(); });
    $('#setBody').querySelectorAll('input[data-n]').forEach((i) => i.addEventListener('change', () => { S.notify[i.dataset.n] = i.checked; save(); if (i.dataset.n === 'quiet' && A && A.setQuiet) A.setQuiet(i.checked); applySchedule(); }));
    $('#setBody').querySelectorAll('[data-lvdel]').forEach((b) => { b.onclick = () => { delLevel(b.dataset.lvdel); renderSettings(); }; });
    const cfgChange = (fn) => () => { fn(); S.preset = null; save(); sel = -1; if (all.length) compute(true); };
    on('#minScore', 'change', cfgChange(() => { S.cfg.minScore = Number($('#minScore').value) || 0; }));
    on('#bookTrend', 'change', cfgChange(() => { S.cfg.bookTrend = $('#bookTrend').checked; }));
    on('#stopBuf', 'change', cfgChange(() => { S.cfg.stopBufPct = Number($('#stopBuf').value) || 0; }));
    on('#maTrend', 'change', cfgChange(() => { S.cfg.addTrend = $('#maTrend').checked ? 'ma' : 'none'; }));
    on('#exitMode', 'change', cfgChange(() => { S.cfg.exitMode = $('#exitMode').value; S.cfg.trailSrc = 'local'; S.cfg.trailProfit = true; }));
    on('#tgtMode', 'change', cfgChange(() => { S.cfg.targetMode = $('#tgtMode').value; }));
    on('#maxHoldD', 'change', cfgChange(() => { S.cfg.maxHoldDays = Number($('#maxHoldD').value); }));
    on('#locBars', 'change', cfgChange(() => { S.cfg.localBars = Number($('#locBars').value); }));
    on('#cashOn', 'change', cfgChange(() => { S.cfg.cashYield = $('#cashOn').checked ? (S.cfg.cashRate || 14) : 0; renderSettings(); }));
    on('#cashRate', 'change', cfgChange(() => { const v = Number($('#cashRate').value) || 0; S.cfg.cashYield = v; S.cfg.cashRate = v; }));
    on('#beRule', 'change', cfgChange(() => { S.cfg.beRule = $('#beRule').value; if (S.cfg.beMode !== 'auto') S.view.be = true; renderSettings(); }));
    on('#beMode', 'change', cfgChange(() => { S.cfg.beMode = $('#beMode').value; if (S.cfg.beMode === 'auto' && S.cfg.beRule === 'local') S.cfg.beRule = 'atr'; renderSettings(); }));
    on('#beAtr', 'change', cfgChange(() => { const v = parseFloat($('#beAtr').value); if (v >= 0.5) S.cfg.beAtr = v; }));
    on('#dirSel', 'change', cfgChange(() => { const v = $('#dirSel').value; S.cfg.longOnly = v === 'long'; S.cfg.shortOnly = v === 'short'; }));
    on('#swMult', 'change', cfgChange(() => { S.cfg.swingMult = Number($('#swMult').value); }));
    on('#risk', 'change', cfgChange(() => { S.cfg.riskPct = Number($('#risk').value) || 1; }));
    on('#acctBtn', 'click', () => refreshAccount(true));
    on('#brokerSync', 'change', () => { S.brokerSync = $('#brokerSync').checked; save(); if (S.brokerSync) loadBrokerOps(); else { delete opsCache[S.inst.id]; draw(); } });
    on('#acctSel', 'change', () => { const a = (S.accounts || []).find((x) => x.id === $('#acctSel').value); if (a) { S.account = a; save(); refreshAccount(true); } });
    on('#capital', 'change', () => { S.capital = Math.max(0, Number($('#capital').value) || 0); save(); if (an) renderPanel(); });
    on('#logExp', 'click', exportLog);
    on('#xferExp', 'click', exportXfer);
    on('#xferImp', 'click', () => $('#xferFile').click());
    on('#xferFile', 'change', () => { const f = $('#xferFile').files[0]; if (f) f.text().then(importXfer).catch((e) => { $('#xferRes').innerHTML = '<span class="neg">' + esc(e.message) + '</span>'; }); });
    on('#logClr', 'click', () => { D.logClear(); D.log('start', 'лог очищен'); renderSettings(); });
    on('#decSel', 'change', () => { S.decComma = $('#decSel').value === 'comma'; D.setDec(S.decComma); save(); renderHead(); renderChips(); if (an) { renderPanel(); draw(); renderQuote(); } renderSettings(); });
    on('#fibTime', 'change', () => { S.view.fibT = $('#fibTime').checked; save(); renderPanel(); draw(); });
    on('#divAdj', 'change', () => { S.cfg.divAdj = $('#divAdj').checked; save(); load(false); });
    on('#batBtn', 'click', () => { if (A.openBattery) A.openBattery(); });
    on('#fee', 'change', cfgChange(() => { S.cfg.feePct = Number($('#fee').value) || 0; }));
    on('#maxBars', 'change', () => { S.cfg.maxBars = Number($('#maxBars').value); save(); load(true); });
    $('#setBody').querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => applyPreset(b.dataset.preset); });
    on('#presetBook', 'click', () => { S.cfg = { maxBars: S.cfg.maxBars || 2000, riskPct: S.cfg.riskPct, feePct: S.cfg.feePct, cashYield: S.cfg.cashYield, swingMult: 1, setups: { w3: true, w5: true, abc: true, tri: true } }; Object.keys(S.cfg).forEach((k) => { if (S.cfg[k] === undefined) delete S.cfg[k]; }); S.preset = 'book'; flashPreset('поставлено'); save(); renderSettings(); if (all.length) compute(true); });
    on('#mySave', 'click', () => { S.myCfg = { at: Date.now(), tf: S.tf, cfg: JSON.parse(JSON.stringify(S.cfg)) }; save(); renderSettings(); });
    on('#myLoad', 'click', () => { if (!S.myCfg) return; S.cfg = JSON.parse(JSON.stringify(S.myCfg.cfg)); const ch = S.tf !== S.myCfg.tf; S.tf = S.myCfg.tf; S.preset = 'mine'; flashPreset('возвращены сохранённые'); save(); renderSettings(); renderHead(); sel = -1; if (ch) { an = null; view.init = false; load(false); } else if (all.length) compute(true); });
    on('#resetCfg', 'click', () => { const c0 = S.cfg; S.cfg = { maxBars: c0.maxBars || 2000, riskPct: c0.riskPct, feePct: c0.feePct, divAdj: c0.divAdj, cashYield: c0.cashYield, swingMult: 1, setups: { w3: true, w5: true, abc: true, tri: true } }; Object.keys(S.cfg).forEach((k) => { if (S.cfg[k] === undefined) delete S.cfg[k]; }); S.swings = {}; S.preset = 'book'; flashPreset('сброшено: как по книге, все пороги — авто'); save(); renderSettings(); if (all.length) compute(true); });
    $('#setBody').querySelectorAll('input[data-s]').forEach((i) => i.addEventListener('change', cfgChange(() => { S.cfg.setups = Object.assign({}, E.DEFAULTS.setups, S.cfg.setups, { [i.dataset.s]: i.checked }); })));
    $('#setBody').querySelectorAll('input[data-a]').forEach((i) => i.addEventListener('change', cfgChange(() => { S.cfg[i.dataset.a] = i.checked; if (i.dataset.a === 'addMarket' || i.dataset.a === 'addAO') setTimeout(renderSettings, 0); })));
    { const am = $('#aoMode'); if (am) am.addEventListener('change', cfgChange(() => { S.cfg.aoMode = am.value; })); }
  }
  // статус фоновой проверки обновляется сам, пока открыта вкладка «Сигналы»
  setInterval(() => { const el = $('#bgStat'); if (!el || $('#settings').hidden) return; el.innerHTML = bgStatus(); const b = $('#batBtn'); if (b) b.onclick = () => { if (A.openBattery) A.openBattery(); }; }, 15000);
  function caText() {
    const i = A && A.caInfo ? A.caInfo() : '';
    if (!i) return '<span class="warn">Сертификат не установлен.</span>';
    const [subj, till, fp] = i.split('|');
    return '<span class="pos">Установлен:</span> ' + esc(subj.replace(/,.*$/, '').replace('CN=', '')) + ', действует ' + esc(till) + '<br><span class="mono" style="font-size:10px;word-break:break-all">' + esc(fp) + '</span>';
  }
  window.__caDone = (ok, msg) => {
    const el = $('#caInfo');
    if (ok) { if (el) el.innerHTML = caText(); err = ''; load(false); }
    else if (el) el.innerHTML = '<span class="neg">Не удалось скачать: ' + esc(msg) + '</span>';
    const b = $('#caBtn'); if (b) { b.disabled = false; b.textContent = ok ? 'Скачать заново' : 'Скачать с gu-st.ru'; }
  };
  function renderWatch() {
    const el = $('#watchList'); if (!el) return;
    el.innerHTML = S.watch.length ? S.watch.map((w, k) => {
      const l = D.store.get('last.' + w.wid, null) || D.store.get('last.' + w.ticker + '.' + w.tf, null);
      return `<div class="watch"><span data-wgo="${k}" role="button"><b>${esc(w.ticker)}</b> ${D.TF[w.tf].name} <span class="small">· ${esc(w.label || 'текущие настройки')}${w.sw != null ? ', ' + swText(w.sw, w.cfg) : ''}</span><br><span class="small">${l ? esc(l.phase) + (l.plan ? ' · план: ' + l.plan : '') : 'ещё не проверялось'}</span></span><button data-del="${k}">✕</button></div>`;
    }).join('') : '<div class="small" style="padding:8px 0">Список пуст. Откройте нужную бумагу и таймфрейм и нажмите «Добавить».</div>';
    el.querySelectorAll('[data-wgo]').forEach((s) => { s.onclick = () => { const w = S.watch[Number(s.dataset.wgo)]; if (w) goChart({ id: w.id || w.ticker + '_TQBR', ticker: w.ticker, tf: w.tf }); }; });
    el.querySelectorAll('button[data-del]').forEach((b) => { b.onclick = () => { S.watch.splice(Number(b.dataset.del), 1); save(); renderWatch(); applySchedule(); renderHead(); }; });
  }
  function applySchedule() { if (A && A.schedule) A.schedule(D.needBg(S) ? S.bgMinutes : 0); if (A && A.setAlarm) A.setAlarm(String(D.nextAlarm())); }   // 2.43: + «будильник» робота после закрытия свечи
  function alertMsg(m) { window.alert(m); }
  $('#setBtn').onclick = () => { renderSettings(); openSheet('settings'); };

  // ---------- кнопка «назад», возврат в приложение, автообновление ----------
  window.appBack = () => {
    for (const id of ['manual', 'journal', 'robots', 'scanner', 'search', 'settings']) if (!$('#' + id).hidden) { closeSheet(id); if (id === 'settings') renderPanel(); return true; }
    if (sel >= 0) { sel = -1; renderPanel(); draw(); return true; }
    return false;
  };
  // нажали на уведомление — открыть эту бумагу и таймфрейм
  window.appOpen = () => {
    if (!A || !A.takeOpen) return;
    let o = null; try { o = JSON.parse(A.takeOpen() || 'null'); } catch (e) { return; }
    if (!o || !o.id) return;
    goChart(o);
  };
  // открыть бумагу на графике: { id, ticker, tf } — из уведомления, у роботов, в списке слежения
  function goChart(o) {
    for (const id of ['manual', 'journal', 'robots', 'scanner', 'search', 'settings']) closeSheet(id);
    closePop();
    const ch = o.id !== S.inst.id || (o.tf && o.tf !== S.tf);
    S.inst = D.isCrypto(o.id) ? { id: o.id, ticker: 'BTC', name: 'Биткоин', classCode: 'CRYPTO' } : { id: o.id, ticker: o.ticker, name: o.name || o.ticker, classCode: o.classCode || 'TQBR' };
    if (o.tf && D.TF[o.tf]) S.tf = o.tf;
    save();
    if (ch) { sel = -1; an = null; view.init = false; renderHead(); load(false); }
  }
  // 2.43: пока приложение открыто — проверка сигналов и роботов каждые 5 минут (роботы ходят, только когда закрылась новая свеча их таймфрейма)
  let fgBusy = false;
  async function fgCheck() {
    if (fgBusy || robotBusy || tr || (document.hidden && !DESK) || !D.bgLock(8 * 60000)) return;
    fgBusy = true;
    try { const ev = await D.checkAll(() => {}); sendNotes(ev, 900); if (ev.length) { renderBell(); renderRobIcon(); if (!$('#robots').hidden) renderRobot(); } }
    catch (e) { D.log('error', 'проверка в приложении: ' + e.message); }
    finally { D.bgUnlock(); fgBusy = false; D.logFlush(); if (A && A.setAlarm) A.setAlarm(String(D.nextAlarm())); }
  }
  setInterval(fgCheck, 5 * 60000);
  window.appAlarm = fgCheck;   // 3.6: на компьютере «будильник» робота (закрытие свечи) и пробуждение компьютера — проверка сразу
  window.appResume = () => { renderBell(); renderRobIcon(); if (Date.now() - lastLoad > 30000) load(false); };
  setInterval(() => { if (!document.hidden && Date.now() - lastLoad > 60000) load(false); }, 15000);
  // 2.42: живая цена — последняя (незакрытая) свеча растёт каждые 5 с: запрос последней цены лёгкий; свечи целиком и анализ — по-прежнему раз в минуту
  let liveBusy = false, liveFail = 0;
  setInterval(async () => {
    if (liveBusy || tr || demo || loading || err || document.hidden || !lotInfo || D.isCrypto(S.inst.id) || !all.length || Date.now() - liveFail < 60000) return;
    const b = all[all.length - 1]; if (b.done !== false) return;   // свеча закрыта (биржа закрыта) — обновлять нечего
    liveBusy = true;
    try {
      const id = S.inst.id, uid = lotInfo.uid || id, m = await D.getLastPrices(S.token, [uid]), v = m[uid];
      if (v && v.price > 0 && id === S.inst.id && all[all.length - 1] === b) { b.c = v.price; if (v.price > b.h) b.h = v.price; if (v.price < b.l) b.l = v.price; draw(); renderQuote(); }
    } catch (e) { liveFail = Date.now(); } finally { liveBusy = false; }
  }, 5000);
  window.addEventListener('resize', () => setChartH(snapPx(S.view.pane || 0)));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.appResume(); else if (tr) { trPause(); trSaveState(); } });
  window.addEventListener('pagehide', () => { if (tr) trSaveState(); });

  // старт
  // ---------- лог: запуск и необработанные ошибки ----------
  D.log('start', 'Волны Эллиотта ' + APP_VER, { ua: String(navigator.userAgent || '').replace(/^.*?\(/, '(').slice(0, 140), w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, inst: S.inst.ticker, tf: S.tf, preset: S.preset || '', watch: (S.watch || []).length, bg: S.bgMinutes });
  logSnap = snapNow();
  window.addEventListener('error', (e) => D.log('crash', (e.message || 'ошибка') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno, { stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1200) : undefined }));
  window.addEventListener('unhandledrejection', (e) => D.log('crash', 'promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)), { stack: e.reason && e.reason.stack ? String(e.reason.stack).slice(0, 1200) : undefined }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) D.logFlush(); });
  // 3.6: перенос на другое устройство (телефон → компьютер): роботы, мои сделки, настройки — без токена и номера счёта
  const XFER_FILES = ['vacc.json'], XFER_STORE = ['journal', 'notifHist', 'wcolors', 'jfired', 'pfired'];
  const XFER_SECRET = ['token', 'account', 'accounts', 'acct'];
  const xferKey = (k) => XFER_STORE.includes(k) || k.startsWith('last.') || k.startsWith('siglog.');
  function exportXfer() {
    const st = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ew2.') && xferKey(k.slice(4))) st[k.slice(4)] = D.store.get(k.slice(4), null); } } catch (e) { /* нет хранилища */ }
    const set = Object.assign({}, S); for (const k of XFER_SECRET) delete set[k];
    const fl = {}; for (const n of XFER_FILES) { const v = D.files.get(n); if (v != null) fl[n] = v; }
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = `ew-perenos-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    const txt = JSON.stringify({ kind: 'ew-transfer', v: 1, app: 'Волны Эллиотта ' + APP_VER, exportedAt: d.toISOString(), settings: set, store: st, files: fl });
    const say = (h) => { const el = $('#xferRes'); if (el) el.innerHTML = h; };
    D.log('settings', 'перенос: выгрузка в файл');
    if (A && A.saveDownload) { const r = A.saveDownload(name, 'application/json', txt).split('|'); say(r[0] === 'ok' ? 'Сохранено: ' + esc(r[1]) : '<span class="neg">' + esc(r[1]) + '</span>'); if (r[0] === 'ok' && A.shareLast) A.shareLast('application/json'); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); say('Сохранено: ' + esc(name)); }
  }
  function importXfer(txt) {
    let doc = null; try { doc = JSON.parse(txt); } catch (e) { /* ниже */ }
    if (!doc || doc.kind !== 'ew-transfer' || !doc.settings) throw new Error('Это не файл переноса (нужен файл ew-perenos-….json из «Выгрузить в файл»).');
    const V = doc.files && doc.files['vacc.json'], nRob = V && V.accs ? V.accs.length : 0, nJ = ((doc.store && doc.store.journal) || []).length;
    if (!window.confirm(`Заменить данные на этом устройстве данными из файла?\n\n${doc.app || ''}, выгружено ${fmtT(Date.parse(doc.exportedAt), true)}.\nРоботов: ${nRob}, моих сделок: ${nJ}.\n\nТокен и выбранный счёт останутся здешние.`)) return;
    for (const [k, v] of Object.entries(doc.store || {})) if (xferKey(k)) D.store.set(k, v);
    for (const n of XFER_FILES) if (doc.files && doc.files[n] != null) D.files.set(n, doc.files[n]);
    const keep = {}; for (const k of XFER_SECRET) if (S[k] !== undefined) keep[k] = S[k];
    const ns = Object.assign({}, doc.settings); for (const k of XFER_SECRET) delete ns[k];
    D.saveSettings(Object.assign(ns, keep));
    D.log('settings', 'перенос: загружены данные из файла (' + (doc.app || '?') + ', роботов ' + nRob + ')'); D.logFlush();
    location.reload();
  }
  function exportLog() {
    const L = D.logRead(), d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = `ew-log-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    // 3.9: сводка роботов (сделки в R и %) и «Мои сделки» — чтобы по выгрузке была полная картина
    let robots = null; try { const V = D.vaccGet(); if (V && V.accs) robots = V.accs.map((a) => { const eq = D.vEquity(a), R = a.closed.map((c) => c.R).filter((x) => x != null);
      return { key: a.key, name: a.name, tf: a.tf || '1d', riskPct: a.cfg && a.cfg.riskPct, riskOwn: !!a.riskOwn, be: !!a.be, stall: !!a.stall, resultPct: a.dep ? +((eq / a.dep - 1) * 100).toFixed(2) : 0, closed: a.closed.length, wins: a.closed.filter((c) => c.pl > 0).length, sumR: +R.reduce((x, y) => x + y, 0).toFixed(2), skipped: a.skipped || 0,
        open: a.pos.map((p) => ({ ticker: p.ticker, side: p.side || 1, qty: p.qty, entry: p.entry, entryT: p.entryT, stop0: p.stop0, stop: p.stop, target: p.target, runner: !!p.runner, now: a.px[p.id] || null, src: p.src || '' })),
        last: a.closed.slice(-30).map((c) => ({ ticker: c.ticker, side: c.side, qty: c.qty, entry: c.entry, entryT: c.entryT, exit: c.exit, exitT: c.exitT, why: c.why, R: c.R, pl: Math.round(c.pl) })) }; }); } catch (e) { robots = null; }
    const doc = { version: 'Волны Эллиотта ' + APP_VER, exportedAt: d.toISOString(), tz: S.tz === 'local' ? 'телефон, UTC' + (-d.getTimezoneOffset() / 60 >= 0 ? '+' : '') + (-d.getTimezoneOffset() / 60) : 'МСК', note: 'Журнал работы: без токена и номеров счетов. Суммы в рублях есть (сделки роботов и вашего счёта).',
      robots, journal: jList().slice(-100).map((x) => ({ ticker: x.ticker, side: x.side, lots: x.lots, openT: x.openT, openP: x.openP, stop: x.stop, target: x.target, closeT: x.closeT || null, closeP: x.closeP || null, src: x.src || '' })),
      settings: { inst: S.inst.ticker, tf: S.tf, preset: S.preset || '', cfg: S.cfg, swings: S.swings, bgMinutes: S.bgMinutes, notify: S.notify,
        watch: (S.watch || []).map((w) => ({ ticker: w.ticker, tf: w.tf, label: w.label, sw: w.sw })), levels: (S.palerts || []).map((a) => ({ ticker: a.ticker, price: a.price, dir: a.dir, at: a.at })) },
      lastbg: D.store.get('lastbg', null), lasterr: D.store.get('lasterr', null), app: L.app, background: L.bg };
    const txt = JSON.stringify(doc), res = $('#logRes'), say = (h) => { if (res) res.innerHTML = h; };
    if (A && A.saveDownload) { const r = A.saveDownload(name, 'application/json', txt).split('|'); say(r[0] === 'ok' ? 'Сохранено: ' + esc(r[1]) : '<span class="neg">' + esc(r[1]) + '</span>'); if (r[0] === 'ok' && A.shareLast) A.shareLast('application/json'); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); say('Сохранено: ' + esc(name)); }
  }

  migrateRisk();
  renderHead(); setChartH(snapPx(S.view.pane || 0));
  if (!trRestore()) load(false);
  if (S.account && S.token && (!S.acct || Date.now() - S.acct.at > 3600000)) setTimeout(() => refreshAccount(false), 3000);
  if (A && S.bgMinutes && D.needBg(S) && A.isScheduled && !A.isScheduled()) applySchedule();
  if (A && A.setAlarm) A.setAlarm(String(D.nextAlarm()));   // 2.43: «будильник» робота — при каждом запуске (после обновления приложения он сброшен)
  window.appOpen();
})();
