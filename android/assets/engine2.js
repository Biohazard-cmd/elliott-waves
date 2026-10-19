// Волны Эллиотта — движок анализа (перенос индикатора ElliottWaves.mq5 v2.40 для MT5).
// Книга: Р. Пректер, А. Фрост «Волновой принцип Эллиотта».
// Свечи: { t: время в мс, o, h, l, c, v }, только завершённые.
(function (root) {
  'use strict';

  const LV_R2 = [0.382, 0.5, 0.618, 0.786], LV_R3 = [1.0, 1.618, 2.618], LV_R4 = [0.236, 0.382, 0.5];
  const LV_R5 = [0.618, 1.0, 1.618], LV_R5B = [0.618, 1.618], LV_B = [0.382, 0.5, 0.618];
  const LV_CZZ = [0.618, 1.0, 1.618], LV_CEXP = [1.618, 2.618], LV_CREG = [1.0, 1.236], LV_T = [0.618];
  const SENS_K = [0.6, 0.8, 1.0, 1.25, 1.6];
  const SETUP_NAME = ['Вход в волну 3', 'Вход в волну 5', 'После коррекции A-B-C', 'Рывок из треугольника', 'Против тренда после 5 волн'];
  const SETUP_SHORT = ['W3', 'W5', 'ABC', 'Тр', 'Пр'];
  const REASON_NAME = ['стоп', 'цель', 'срок вышел', 'конец данных', 'конец недели', 'смена фазы', 'смена подсчёта', 'стоп после цели', 'безубыток'];
  const BE_WHY = { r1: 'цена прошла +1R', r2: 'цена прошла +2R', atr: 'цена ушла на N×ATR', ao: 'AO 5/34 повернул против сделки', mkt: 'рынок ушёл ниже своей средней за 50 дней', stall: '20 свечей без движения (меньше +0,5R)', wave: 'волна 3 прошла вершину волны 1, подтвердился первый откат' };
  const FIG_NAME = ['Импульс', 'Клин', 'Зигзаг', 'Флэт', 'Треугольник'];

  // настройки по умолчанию — «как по книге», дополнения выключены
  const DEFAULTS = {
    swingPct: 0,          // порог разворота, % (0 — подобрать)
    swingMult: 2,         // «крупность волн»: авто-порог × это число (проверка на 65 акциях: ×2 лучше ×1)
    subRatio: 0.4,        // порог младшей степени — доля от основного
    logScale: true,
    maxBars: 3000,
    minScore: 45,
    bookTrend: true,      // торговать по тренду старшей степени (стр. 34)
    trendMult: 3.0,
    setups: { w3: true, w5: false, abc: true, tri: true },   // W5 выключен: на 65 акциях давал убыток
    stopBufPct: 0.1,
    // дополнения
    addTrend: 'none',     // 'none' | 'ma'
    trendMA: 200,
    addStruct: false,
    exitMode: 'fixed',    // 'fixed' | 'sub' | 'main'
    trailStartR: 0,
    trailProfit: true,
    trailSrc: 'local',    // 'local' | 'wave'
    localBars: 2,
    trailBufPct: 0.03,
    targetMode: 'main',   // 'main' | 'near' | 'none'
    maxHold: 0,
    maxHoldDays: 0,       // предел срока сделки в календарных днях (0 — без ограничения), выход по закрытию свечи
    addMinRR: false, minRR: 1.5,
    addDepth: false, w2Min: 0.30, w2Max: 0.80, w4Max: 0.50,
    setupCounter: false,
    addBreak24: false,
    addPhaseExit: false,
    addFlipExit: false,   // дополнение: выход, когда основной подсчёт стал импульсом против сделки
    addRunner: false,     // дополнение: у цели не закрывать, а перевести стоп в безубыток и вести под локальными минимумами
    complexCorr: true,    // по книге: волна 2/4 может быть расширенным флэтом (показ в подсчёте)
    addComplexTrade: false, // дополнение: входить по подсчёту со сложной волной 2/4
    beRule: 'atr', beAtr: 3,   // правило безубытка: r1 / r2 (+1R/+2R), atr (beAtr×ATR), ao, mkt, stall, wave, local (только подсказка)
    beMode: 'hint',            // 'hint' — только подсказка (сделки не меняются); 'auto' — система сама переносит стоп на вход + комиссии
    longOnly: false,
    shortOnly: false,     // только продажи
    addMarket: false,     // дополнение: покупки — только когда рынок (индекс из бумаг сканера) выше своей средней, продажи — когда ниже
    marketMA: 200,
    stopW2: false,
    // по Вильямсу («Торговый хаос»), проверено на 65 акциях, дневки 2019–2026:
    addAO: false,         // вход только если осциллятор 5/34 (AO) на стороне сделки: покупка — AO > 0
    addSma200: false,     // вход только по направлению 200-дневной средней: покупка — SMA200 выше, чем sma200Lb свечей назад
    sma200Lb: 20,
    addMktFast: false,    // осторожный режим: индекс рынка ещё и выше своей средней за 50 свечей (нужен фильтр рынка)
    aoMode: 'pos',        // 'pos' — AO на стороне сделки; 'both' — ещё и выше своей средней за 5 (строже)
    addPyramid: false,    // доливка: когда волна 3 прошла 110% волны 1 — докупить ещё на 1% риска со стопом системы
    // бэктест
    riskPct: 1.0, maxLev: 3.0, feePct: 0.05, slipPct: 0.02,
    cashYield: 0,         // % годовых на свободные деньги (фонд денежного рынка); 0 — не учитывать
  };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  function near(x, lv, tol) {
    let best = 0;
    for (const l of lv) { const c = 1 - Math.abs(x - l) / (tol * Math.max(l, 0.2)); if (c > best) best = c; }
    return clamp(best, 0, 1);
  }
  function merge(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    c.setups = Object.assign({}, DEFAULTS.setups, (cfg && cfg.setups) || {});
    return c;
  }

  // ---------- зигзаг без заглядывания вперёд ----------
  function zzInit(thr) { return { thr, dir: 0, hiP: -Infinity, hiI: 0, loP: Infinity, loI: 0, extP: 0, extI: 0 }; }
  function zzPush(z, i, H, L, arr) {
    const t = z.thr; let pv = null;
    if (z.dir === 0) {
      if (H[i] > z.hiP) { z.hiP = H[i]; z.hiI = i; }
      if (L[i] < z.loP) { z.loP = L[i]; z.loI = i; }
      if (z.hiI > z.loI && z.hiP >= z.loP * (1 + t)) { pv = { i: z.loI, p: z.loP, t: -1, c: i }; z.dir = 1; z.extP = z.hiP; z.extI = z.hiI; }
      else if (z.loI > z.hiI && z.loP <= z.hiP * (1 - t)) { pv = { i: z.hiI, p: z.hiP, t: 1, c: i }; z.dir = -1; z.extP = z.loP; z.extI = z.loI; }
    } else if (z.dir === 1) {
      if (H[i] > z.extP) { z.extP = H[i]; z.extI = i; }
      else if (L[i] <= z.extP * (1 - t)) { pv = { i: z.extI, p: z.extP, t: 1, c: i }; z.dir = -1; z.extP = L[i]; z.extI = i; }
    } else {
      if (L[i] < z.extP) { z.extP = L[i]; z.extI = i; }
      else if (H[i] >= z.extP * (1 + t)) { pv = { i: z.extI, p: z.extP, t: -1, c: i }; z.dir = 1; z.extP = H[i]; z.extI = i; }
    }
    if (pv) arr.push(pv);
    return !!pv;
  }

  // ---------- контекст расчёта (замена глобальных переменных индикатора) ----------
  function Ctx(bars, cfg) {
    this.cfg = cfg;
    this.N = bars.length;
    this.O = bars.map((b) => b.o); this.H = bars.map((b) => b.h); this.L = bars.map((b) => b.l);
    this.C = bars.map((b) => b.c); this.V = bars.map((b) => b.v || 0); this.T = bars.map((b) => b.t);
    this.sub = [];
    this.Fv = cfg.logScale ? Math.log : (x) => x;
    this.Gv = cfg.logScale ? Math.exp : (x) => x;
    // действующие настройки: книга + включённые дополнения
    this.trendMode = cfg.addTrend === 'ma' ? 'ma' : cfg.bookTrend ? 'degree' : 'off';
    this.struct = cfg.addStruct && this.trendMode !== 'off';
    this.minRR = cfg.addMinRR ? cfg.minRR : 0;
    this.w2Min = cfg.addDepth ? cfg.w2Min : 0;
    this.w2Max = cfg.addDepth ? cfg.w2Max : 1;
    this.w4Max = cfg.addDepth ? cfg.w4Max : 1;
  }

  Ctx.prototype.subLegs = function (a, b) {
    let n = 0;
    for (const p of this.sub) if (p.i > a && p.i < b) n++;
    return n + 1;
  };

  // форма коррекции между разворотами a и b по младшей степени (стр. 69):
  // 0 — резкая (зигзаг), 1 — боковая (флэт), 2 — треугольник, -1 — не видно
  Ctx.prototype.corrForm = function (a, b) {
    const s = this.sub; let k = s.length - 1;
    while (k >= 0 && s[k].i >= b.i) k--;
    const hi = k;
    while (k >= 0 && s[k].i > a.i) k--;
    const lo = k + 1, cnt = hi - lo + 1;
    if (cnt < 2) return -1;
    if (s[lo].t === a.t || s[hi].t === b.t) return -1;
    const v = [this.Fv(a.p)];
    for (let j = 0; j < cnt; j++) v.push(this.Fv(s[lo + j].p));
    v.push(this.Fv(b.p));
    const m = v.length, L = [0];
    for (let j = 1; j < m; j++) L[j] = Math.abs(v[j] - v[j - 1]);
    if (m >= 6 && L[3] < L[1] && L[4] < L[2]) return 2;
    let maxR = 0;
    for (let j = 2; j < m; j += 2) if (L[j - 1] > 0) maxR = Math.max(maxR, L[j] / L[j - 1]);
    return maxR >= 0.85 ? 1 : 0;
  };

  Ctx.prototype.legVol = function (a, b) {
    let s = 0, k = 0;
    for (let i = a + 1; i <= b && i < this.N; i++) if (this.V[i] > 0) { s += this.V[i]; k++; }
    return k > 0 ? s / k : 0;
  };

  // ---------- импульс 0-1-2-3-4-5 (стр. 34-37) и нормы ----------
  Ctx.prototype.evalImpulse = function (P, cxPos) {
    const n = P.length, e = { ok: false, score: 0, diag: false, trunc: false, r2: 0, r4: 0, kind: 0, subtype: 0, A: 0, rB: 0, f2: -1, f4: -1, subOk: 0, subN: 0, v: [], w: [], s: [] };
    for (let k = 0; k < n; k++) e.v[k] = this.Fv(P[k].p);
    const d = e.d = e.v[1] > e.v[0] ? 1 : -1;
    for (let k = 1; k < n; k++) e.w[k - 1] = Math.abs(e.v[k] - e.v[k - 1]);
    if (e.w[0] <= 0) return null;
    if (n >= 3 && !(d * (e.v[2] - e.v[0]) > 0)) return null;
    if (n >= 4 && !(d * (e.v[3] - e.v[1]) > 0)) return null;
    if (n >= 5) {
      const overlap = d * (e.v[4] - e.v[1]) <= 0;
      if (overlap) {
        if (!(d * (e.v[4] - e.v[2]) > 0)) return null;
        if (!(e.w[2] < e.w[0] && e.w[3] < e.w[1])) return null;
        e.diag = true;
      }
    }
    if (n >= 6) {
      if (e.w[2] < e.w[0] && e.w[2] < e.w[4]) return null;
      if (e.diag && !(e.w[4] < e.w[2])) return null;
      if (d * (e.v[5] - e.v[3]) <= 0) e.trunc = true;
    }
    let sc = 35;
    if (n >= 3) { e.r2 = e.w[1] / e.w[0]; sc += 8 * near(e.r2, LV_R2, 0.14); }
    if (n >= 4) { const r3 = e.w[2] / e.w[0]; sc += 8 * near(r3, LV_R3, 0.12); if (r3 > 1.3) sc += 4; }
    if (n >= 5) {
      e.r4 = e.w[3] / e.w[2];
      sc += 6 * near(e.r4, LV_R4, 0.18);
      e.f2 = this.corrForm(P[1], P[2]); e.f4 = this.corrForm(P[3], P[4]);
      const sh2 = e.f2 === 0, sh4 = e.f4 === 0;
      if (e.diag) { /* в клине чередования нет */ }
      else if (e.f2 >= 0 && e.f4 >= 0) { if (sh2 !== sh4) sc += 8; else sc -= 5; }
      else {
        if ((e.r2 >= 0.5 && e.r4 <= 0.4) || (e.r2 <= 0.4 && e.r4 >= 0.5)) sc += 4;
        else if (Math.abs(e.r2 - e.r4) < 0.1) sc -= 3;
        const t2 = P[2].i - P[1].i, t4 = P[4].i - P[3].i;
        if (e.r4 < e.r2 && t4 > t2) sc += 2;
      }
    }
    if (n >= 3 && !e.diag) {
      if (e.f2 < 0) e.f2 = this.corrForm(P[1], P[2]);
      if (e.f2 === 2) sc -= 8;   // волна 2 не бывает треугольником
    }
    if (n >= 6) {
      const r5 = e.w[4] / e.w[0], tot = Math.abs(e.v[3] - e.v[0]);
      const c1 = near(r5, LV_R5, 0.1), c2 = tot > 0 ? near(e.w[4] / tot, LV_R5B, 0.1) : 0;
      if (c1 >= c2 && c1 > 0) sc += 7 * c1; else if (c2 > 0) sc += 7 * c2;
      if (e.w[2] / e.w[0] > 1.5 && Math.abs(r5 - 1) < 0.25) sc += 4;
      let di = P[4].i - P[2].i; if (di === 0) di = 1;
      const sl = (e.v[4] - e.v[2]) / di;
      const upper = e.v[3] + sl * (P[5].i - P[3].i);
      let width = Math.abs(e.v[3] - (e.v[2] + sl * (P[3].i - P[2].i)));
      if (width < 1e-12) width = 1e-12;
      if (Math.abs(d * (e.v[5] - upper) / width) <= 0.35) sc += 5;
      const v1 = this.legVol(P[0].i, P[1].i), v3 = this.legVol(P[2].i, P[3].i), v5 = this.legVol(P[4].i, P[5].i);
      if (v3 > 0 && v3 > v5 && v3 > v1) sc += 4;
    }
    if (this.sub.length > 0) {
      let good = 0, bad = 0, checked = 0;
      for (let k = 0; k < n - 1; k++) {
        if (cxPos && k + 1 === cxPos) { checked++; good++; continue; }   // сложная коррекция проверена как A-B-C
        const legs = this.subLegs(P[k].i, P[k + 1].i);
        if (legs <= 1) continue;
        const motive = k % 2 === 0;
        checked++;
        if (e.diag) { if (legs === 3) good++; continue; }
        if (motive) { if (legs >= 5) good++; else bad++; }
        else if (legs === 3 || (k === 3 && legs === 5)) good++;
      }
      e.subOk = good; e.subN = checked;
      if (checked > 0) sc += 8 * good / checked - 8 * bad / checked;
    }
    if (e.diag) sc -= 10;
    e.score = clamp(sc + Math.min(n - 1, 5) * 2, 0, 100);
    e.ok = true;
    return e;
  };

  // ---------- A-B-C: зигзаг или флэт (стр. 46-54) ----------
  Ctx.prototype.evalABC = function (P) {
    const n = P.length, e = { ok: false, score: 0, diag: false, trunc: false, subtype: 0, r2: 0, r4: 0, v: [], w: [], s: [], f2: -1, f4: -1, subOk: 0, subN: 0 };
    for (let k = 0; k < n; k++) e.v[k] = this.Fv(P[k].p);
    const d = e.d = e.v[1] > e.v[0] ? 1 : -1;
    const A = Math.abs(e.v[1] - e.v[0]);
    if (A <= 0) return null;
    const rB = Math.abs(e.v[2] - e.v[1]) / A;
    e.A = A; e.rB = rB;
    let sc = 32;
    e.kind = rB < 0.9 ? 2 : 3;
    if (!(rB <= 1.382 + 0.05)) return null;
    if (e.kind === 2) sc += 6 * near(rB, LV_B, 0.2);
    else e.subtype = rB > 1.05 ? 2 : 1;
    if (n >= 4) {
      const C = Math.abs(e.v[3] - e.v[2]), beyond = d * (e.v[3] - e.v[1]), rC = C / A;
      if (e.kind === 2) { if (!(beyond > 0)) return null; sc += 10 * near(rC, LV_CZZ, 0.12); }
      else {
        if (beyond < 0 && rB > 1.05) { e.subtype = 3; sc -= 6; }
        sc += rB > 1.05 ? 10 * near(rC, LV_CEXP, 0.1) : 10 * near(rC, LV_CREG, 0.12);
      }
      if (this.sub.length > 0) {
        const lA = this.subLegs(P[0].i, P[1].i), lC = this.subLegs(P[2].i, P[3].i);
        if (lC >= 5) sc += 4; else if (lC === 3) sc -= 4;
        if (e.kind === 2 && lA >= 5) sc += 3;
        if (e.kind === 3 && lA < 5) sc += 2;
      }
    }
    e.score = clamp(sc + (n - 1) * 2, 0, 100);
    e.ok = true;
    return e;
  };

  // ---------- сужающийся треугольник A-B-C-D-E ----------
  Ctx.prototype.evalTri = function (P) {
    const n = P.length, e = { ok: false, score: 0, diag: false, trunc: false, kind: 4, subtype: 0, r2: 0, r4: 0, A: 0, rB: 0, v: [], w: [], s: [], f2: -1, f4: -1, subOk: 0, subN: 0 };
    for (let k = 0; k < n; k++) e.v[k] = this.Fv(P[k].p);
    e.d = e.v[1] > e.v[0] ? 1 : -1;
    for (let k = 1; k < n; k++) e.s[k - 1] = Math.abs(e.v[k] - e.v[k - 1]);
    if (e.s[0] <= 0 || e.s[1] <= 0) return null;
    if (!(e.s[2] < e.s[0] && e.s[3] < e.s[1])) return null;
    if (n >= 6 && !(e.s[4] < e.s[2])) return null;
    if (!(e.s[1] < e.s[0] * 1.6)) return null;
    let sc = 30;
    sc += 6 * near(e.s[2] / e.s[0], LV_T, 0.15);
    sc += 6 * near(e.s[3] / e.s[1], LV_T, 0.15);
    if (n >= 6 && e.s[2] > 0) sc += 6 * near(e.s[4] / e.s[2], LV_T, 0.15);
    const dur = P[n - 1].i - P[0].i;
    if (dur > 0 && (P[1].i - P[0].i) / dur < 0.5) sc += 3;
    e.score = clamp(sc + (n - 1) * 2, 0, 100);
    e.ok = true;
    return e;
  };

  // треугольник бывает только в волне 4, B или X — перед ним движение больше его волны A
  Ctx.prototype.triPosOK = function (P, start, e) {
    if (start < 1) return false;
    return Math.abs(this.Fv(P[start].p) - this.Fv(P[start - 1].p)) >= e.s[0];
  };

  // компактная копия подсчёта для показа на графике у сделки
  function snapCount(s) {
    return { idx: s.idx.slice(), px: s.px.slice(), fam: s.fam, n: s.n, dir: s.dir, kind: s.kind, diag: s.diag, subtype: s.subtype, score: s.score, r2: s.r2, cx: s.cx || null, title: scenTitle(s) };
  }
  // точки для рисования подсчёта: внутри сложной волны 2/4 добавляются (a) и (b)
  function countPath(s) {
    const out = [];
    for (let k = 0; k < s.n; k++) {
      if (s.cx && k === s.cx.pos) { out.push({ i: s.cx.idx[0], p: s.cx.px[0], lbl: '(a)', small: true }); out.push({ i: s.cx.idx[1], p: s.cx.px[1], lbl: '(b)', small: true }); }
      out.push({ i: s.idx[k], p: s.px[k], lbl: pointLabel(s, k) + (s.cx && k === s.cx.pos ? ' (c)' : ''), small: false });
    }
    return out;
  }

  function fillScen(fam, e, P) {
    const n = P.length;
    return {
      fam, kind: fam === 0 ? (e.diag ? 1 : 0) : fam === 1 ? e.kind : 4,
      n, dir: e.d, score: e.score,
      idx: P.map((p) => p.i), px: P.map((p) => p.p), v: e.v.slice(0, n),
      w: e.w.slice(), s: e.s.slice(), r2: e.r2, r4: e.r4, A: e.A || 0, rB: e.rB || 0,
      diag: e.diag, trunc: e.trunc, subtype: e.subtype,
      f2: fam === 0 ? e.f2 : -1, f4: fam === 0 ? e.f4 : -1,
      subOk: fam === 0 ? e.subOk : 0, subN: fam === 0 ? e.subN : 0,
    };
  }

  Ctx.prototype.buildScenarios = function (P) {
    const np = P.length, out = [];
    for (let k = 2; k <= 6 && np >= k; k++) { const sub = P.slice(np - k); const e = this.evalImpulse(sub); if (e) out.push(fillScen(0, e, sub)); }
    for (let k = 3; k <= 4 && np >= k; k++) { const sub = P.slice(np - k); const e = this.evalABC(sub); if (e) out.push(fillScen(1, e, sub)); }
    for (let k = 5; k <= 6 && np >= k; k++) { const sub = P.slice(np - k); const e = this.evalTri(sub); if (e && this.triPosOK(P, np - k, e)) out.push(fillScen(2, e, sub)); }
    // Сложная коррекция в волне 2 или 4: расширенный флэт A-B-C той же степени (стр. 46-54).
    // Три отрезка сворачиваем в одну волну и проверяем импульс целиком.
    // В расширенном флэте волна B выходит за конец предыдущей волны — это допустимо.
    if (this.cfg.complexCorr !== false) {
      for (let k = 3; k <= 6; k++) {
        for (const pos of [2, 4]) {
          if (pos > k - 1 || np < k + 2) continue;
          const tail = P.slice(np - k - 2);
          const abc = tail.slice(pos - 1, pos + 3);
          const ea = this.evalABC(abc);
          if (!ea) continue;
          // берём только расширенный флэт: его волна B выходит за конец предыдущей волны,
          // и простой подсчёт ошибочно принимает её за следующую волну импульса.
          // Остальные A-B-C находятся почти везде и на проверке давали ложные сигналы.
          if (!(ea.kind === 3 && ea.subtype === 2)) continue;
          const col = tail.slice(0, pos).concat(tail.slice(pos + 2));
          const e = this.evalImpulse(col, pos);
          if (!e || e.diag) continue;
          e.score = clamp(e.score + Math.max(-3, Math.min(3, Math.round((ea.score - 50) / 5))), 0, 100);
          const sc = fillScen(0, e, col);
          if (!this.cfg.addComplexTrade) sc.noPlan = true;   // по умолчанию — только для подсчёта, без входов
          sc.cx = { pos, kind: ea.kind, subtype: ea.subtype, idx: [abc[1].i, abc[2].i], px: [abc[1].p, abc[2].p] };
          out.push(sc);
        }
      }
    }
    // по оценке, при равенстве — больше точек (устойчивая сортировка вставками, как в индикаторе)
    for (let a = 1; a < out.length; a++) {
      const tmp = out[a]; let b = a - 1;
      while (b >= 0 && (out[b].score < tmp.score || (out[b].score === tmp.score && out[b].n < tmp.n))) { out[b + 1] = out[b]; b--; }
      out[b + 1] = tmp;
    }
    return out;
  };

  const pct = (r) => (r * 100).toFixed(1) + '%';

  // цели, подписи и уровень отмены подсчёта
  Ctx.prototype.scenTargets = function (s) {
    const tg = [], lb = []; let inv = 0;
    const d = s.dir, lvl = (fromV, dir, size, ratio) => this.Gv(fromV + dir * size * ratio);
    const add = (p, l) => { tg.push(p); lb.push(l); };
    if (s.fam === 0) {
      if (s.n === 2) { for (const r of [0.382, 0.5, 0.618, 0.786]) add(lvl(s.v[1], -d, s.w[0], r), 'W2 ' + pct(r)); inv = s.px[0]; }
      else if (s.n === 3) { for (const r of [1.0, 1.618, 2.618]) add(lvl(s.v[2], d, s.w[0], r), 'W3 = ' + r.toFixed(3) + ' x W1'); inv = s.px[0]; }
      else if (s.n === 4) { for (const r of [0.236, 0.382, 0.5]) add(lvl(s.v[3], -d, s.w[2], r), 'W4 ' + pct(r)); inv = s.px[1]; }
      else if (s.n === 5) {
        const ext3 = s.w[2] / s.w[0] > 1.618 * 0.95, tot = Math.abs(s.v[3] - s.v[0]);
        add(lvl(s.v[4], d, s.w[0], 1.0), 'W5 = W1');
        add(lvl(s.v[4], d, s.w[0], 0.618), 'W5 = 0.618 x W1');
        add(lvl(s.v[4], d, tot, 0.618), 'W5 = 0.618 x (0-3)');
        if (!ext3) add(lvl(s.v[4], d, tot, 1.618), 'W5 растянута: 1.618 x (0-3)');
        for (let a = 0; a < tg.length; a++) for (let b = a + 1; b < tg.length; b++)
          if (d * (tg[b] - tg[a]) < 0) { [tg[a], tg[b]] = [tg[b], tg[a]]; [lb[a], lb[b]] = [lb[b], lb[a]]; }
        inv = s.diag ? s.px[3] : s.px[1];
      } else {
        const tot = Math.abs(s.v[5] - s.v[0]);
        add(s.px[4], 'Район волны 4');
        for (const r of [0.382, 0.5, 0.618]) add(lvl(s.v[5], -d, tot, r), 'Откат ' + pct(r));
        inv = s.px[5];
      }
    } else if (s.fam === 1) {
      if (s.n === 3) {
        const rs = s.kind === 2 ? [0.618, 1.0, 1.618] : s.rB > 1.05 ? [1.0, 1.618, 2.618] : [1.0, 1.236];
        for (const r of rs) add(lvl(s.v[2], d, s.A, r), 'C = ' + r.toFixed(3) + ' x A');
        if (s.kind === 2) inv = s.px[0];
      } else {
        const tot = Math.abs(s.v[3] - s.v[0]);
        add(lvl(s.v[3], -d, tot, 0.618), 'Возврат 61.8% коррекции');
        add(lvl(s.v[3], -d, tot, 1.0), 'Возврат к началу коррекции');
        if (s.kind === 3) add(s.px[2], 'Уровень конца B');
        inv = s.px[3];
      }
    } else if (s.n === 5) {
      const dd = -sgn(s.v[4] - s.v[3]);
      add(lvl(s.v[4], dd, s.s[2], 0.618), 'E = 0.618 x C');
      inv = s.px[3];
    } else {
      add(lvl(s.v[5], -d, s.s[1], 1.0), 'Рывок = ширина треугольника');
      inv = s.px[5];
    }
    return { tg, lb, inv };
  };

  function scenTitle(s) {
    const dir = s.dir > 0 ? 'вверх' : 'вниз';
    if (s.fam === 0 && s.cx) {
      const cn = s.cx.kind === 2 ? 'зигзаг' : s.cx.subtype === 2 ? 'расшир. флэт' : s.cx.subtype === 3 ? 'бегущий флэт' : 'флэт';
      const base = scenTitle(Object.assign({}, s, { cx: null }));
      return base + ' (волна ' + s.cx.pos + ' — ' + cn + ')';
    }
    if (s.fam === 0) {
      const nm = s.diag ? 'Клин' : 'Импульс';
      if (s.n === 2) return nm + ' ' + dir + ': идёт волна 2';
      if (s.n === 3) return nm + ' ' + dir + ': начинается волна 3';
      if (s.n === 4) return nm + ' ' + dir + ': идёт волна 4';
      if (s.n === 5) return nm + ' ' + dir + ': идёт волна 5';
      return nm + ' ' + dir + ' завершён: ждём коррекцию';
    }
    if (s.fam === 1) {
      const nm = s.kind === 2 ? 'Зигзаг A-B-C' : s.subtype === 2 ? 'Расшир. A-B-C' : s.subtype === 3 ? 'Бегущая A-B-C' : 'Горизонт. A-B-C';
      if (s.n === 3) return nm + ' ' + dir + ': идёт волна C';
      return nm + ' ' + dir + ' завершена: тренд ' + (s.dir > 0 ? 'вниз' : 'вверх');
    }
    if (s.n === 5) return 'Треугольник: идёт волна E';
    return 'Треугольник завершён: рывок ' + (s.dir > 0 ? 'вниз' : 'вверх');
  }

  function pointLabel(s, k) {
    if (s.fam === 0) return String(k);
    if (s.fam === 1) return ['0', 'A', 'B', 'C'][k];
    return ['0', 'A', 'B', 'C', 'D', 'E'][k];
  }

  function figName(s) {
    const arrow = s.dir > 0 ? ' ↑' : ' ↓';
    if (s.kind === 0) return 'Импульс' + arrow;
    if (s.kind === 1) return 'Клин' + arrow;
    if (s.kind === 2) return 'Зигзаг' + arrow;
    if (s.kind === 3) return 'Флэт' + (s.subtype === 2 ? ' расширенный' : s.subtype === 3 ? ' бегущий' : '') + arrow;
    return 'Треугольник';
  }

  // ---------- торговый план по сценарию ----------
  Ctx.prototype.makePlan = function (s, entry) {
    const c = this.cfg;
    if (s.noPlan) return null;
    const { tg } = this.scenTargets(s);
    const nt = tg.length;
    let setup = -1, side = 0, stop = 0, target = 0;
    if (s.fam === 0 && !s.diag && s.n === 3 && c.setups.w3) {
      if (s.r2 < this.w2Min || s.r2 > this.w2Max) return null;
      setup = 0; side = s.dir; stop = c.stopW2 ? s.px[2] : s.px[0];
      target = c.targetMode === 'near' ? tg[0] : tg[1];
    } else if (s.fam === 0 && !s.diag && s.n === 5 && c.setups.w5) {
      if (s.r4 > this.w4Max) return null;
      setup = 1; side = s.dir; stop = s.px[4];
      const risk0 = Math.abs(entry - stop);
      if (risk0 <= 0) return null;
      let found = false;
      for (let k = 0; k < nt; k++) { if (side * (tg[k] - entry) / risk0 > this.minRR) { target = tg[k]; found = true; break; } }
      if (!found) return null;
    } else if (s.fam === 1 && s.n === 4 && c.setups.abc) { setup = 2; side = -s.dir; stop = s.px[3]; target = tg[0]; }
    else if (s.fam === 2 && s.n === 6 && c.setups.tri) { setup = 3; side = -s.dir; stop = s.px[5]; target = tg[0]; }
    else if (s.fam === 0 && s.n === 6 && c.setupCounter) { setup = 4; side = -s.dir; stop = s.px[5]; target = tg[0]; }
    if (setup < 0 || nt === 0) return null;
    if (c.longOnly && side < 0) return null;
    if (c.shortOnly && side > 0) return null;
    const buf = c.stopBufPct / 100;
    stop = side > 0 ? stop * (1 - buf) : stop * (1 + buf);
    const risk = side * (entry - stop), reward = side * (target - entry);
    if (risk <= 0 || reward <= 0) return null;
    const rr = reward / risk;
    if (rr < this.minRR) return null;
    return { setup, side, entry, stop, target, rr, score: s.score, notgt: c.targetMode === 'none', sigBar: -1, scen: -1, w1: setup === 0 ? [s.px[0], s.px[1]] : null };
  };

  // ---------- тренд старшей степени (стр. 34) или по средней ----------
  Ctx.prototype.computeTrend = function (swingPct) {
    const N = this.N, tr = new Array(N).fill(0), hd = new Array(N).fill(0);
    this.hiPivots = [];
    if (this.trendMode === 'ma') {
      const P = Math.max(2, this.cfg.trendMA); let sum = 0; const ma = new Array(N).fill(0);
      for (let i = 0; i < N; i++) {
        sum += this.C[i]; if (i >= P) sum -= this.C[i - P];
        ma[i] = i >= P - 1 ? sum / P : 0;
        let t = 0;
        if (i >= P + 4) {
          if (this.C[i] > ma[i] && ma[i] > ma[i - 5]) t = 1;
          else if (this.C[i] < ma[i] && ma[i] < ma[i - 5]) t = -1;
        }
        hd[i] = t;
      }
      this.ma = ma;
    } else {
      const zh = zzInit(swingPct * this.cfg.trendMult / 100);
      for (let i = 0; i < N; i++) { zzPush(zh, i, this.H, this.L, this.hiPivots); hd[i] = zh.dir; }
      this.hiPend = zh.dir !== 0 ? { i: zh.extI, p: zh.extP } : null;
    }
    const zs = zzInit(swingPct / 100), sp = [];
    let h1 = 0, h2 = 0, l1 = 0, l2 = 0, nh = 0, nl = 0, lastST = 0;
    for (let i = 0; i < N; i++) {
      if (zzPush(zs, i, this.H, this.L, sp)) {
        const q = sp[sp.length - 1];
        if (q.t === 1) { h2 = h1; h1 = q.p; nh++; } else { l2 = l1; l1 = q.p; nl++; }
      }
      let st = 0;
      if (nh >= 2 && nl >= 2) { if (h1 > h2 && l1 > l2) st = 1; else if (h1 < h2 && l1 < l2) st = -1; }
      let t = hd[i];
      if (this.struct && st !== t) t = 0;
      tr[i] = t; lastST = st;
    }
    this.lastHD = N ? hd[N - 1] : 0; this.lastST = lastST;
    return tr;
  };
  // Старшая степень в последней волне в сторону сделки (волна 5 импульса/клина или волна C коррекции):
  // по книге это конец движения, поэтому после цели позицию не держим, а закрываем.
  Ctx.prototype.hiEnding = function (i, side) {
    const hp = this.hiPivots.filter((q) => q.c <= i);
    if (hp.length < 2) return false;
    const s = this.buildScenarios(hp)[0];
    if (!s || s.dir !== side) return false;
    return (s.fam === 0 && s.n >= 5) || s.fam === 1;
  };
  // дополнение «торговать по рынку»: cfg.mkt = { t: [...], up: [...] } — индекс из бумаг сканера выше/ниже своей средней
  Ctx.prototype.marketOK = function (side, t) {
    const m = this.cfg.addMarket && this.cfg.mkt;
    if (!m || !m.t || !m.t.length || t < m.t[0]) return true;
    let lo = 0, hi = m.t.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m.t[mid] <= t) lo = mid; else hi = mid - 1; }
    if (t - m.t[lo] > 7 * 86400000) return true;   // данных индекса на эту дату нет
    return side > 0 ? m.up[lo] === 1 : m.up[lo] === 0;
  };
  // осциллятор Вильямса 5/34 по медианной цене и его сигнальная линия (средняя за 5)
  Ctx.prototype.aoArr = function () {
    if (this._ao) return this._ao;
    const N = this.N, M = this.H.map((h, k) => (h + this.L[k]) / 2);
    const sma = (a, n) => { const o = new Array(N).fill(NaN); let sm = 0, c = 0; for (let k = 0; k < N; k++) { const v = a[k]; if (isNaN(v)) continue; sm += v; c++; if (c > n) sm -= a[k - n]; if (c >= n) o[k] = sm / n; } return o; };
    const s5 = sma(M, 5), s34 = sma(M, 34), ao = s5.map((v, k) => v - s34[k]);
    this._ao = { ao, sig: sma(ao, 5) };
    return this._ao;
  };
  // наклон 200-свечной средней: +1 растёт, −1 падает, 0 — данных мало
  Ctx.prototype.smaArr = function () {
    if (this._s200) return this._s200;
    const C = this.C, N = this.N, o = new Array(N).fill(NaN); let s = 0;
    for (let k = 0; k < N; k++) { s += C[k]; if (k >= 200) s -= C[k - 200]; if (k >= 199) o[k] = s / 200; }
    return (this._s200 = o);
  };
  Ctx.prototype.smaSlope = function (i) {
    const a = this.smaArr(), lb = this.cfg.sma200Lb || 20;
    if (i - lb < 0 || isNaN(a[i]) || isNaN(a[i - lb])) return 0;
    return a[i] > a[i - lb] ? 1 : a[i] < a[i - lb] ? -1 : 0;
  };
  Ctx.prototype.smaOK = function (side, i) {
    if (!this.cfg.addSma200) return true;
    const d = this.smaSlope(i);
    return d === 0 || d === side;
  };
  // индекс рынка выше/ниже своей средней за 50 свечей (осторожный режим)
  Ctx.prototype.mktFastOK = function (side, t) {
    const m = this.cfg.addMktFast && this.cfg.addMarket && this.cfg.mkt;
    if (!m || !m.v || !m.t || m.t.length < 50 || t < m.t[0]) return true;
    if (!m._s50) { const o = new Array(m.v.length).fill(NaN); let s = 0; for (let k = 0; k < m.v.length; k++) { s += m.v[k]; if (k >= 50) s -= m.v[k - 50]; if (k >= 49) o[k] = s / 50; } m._s50 = o; }
    let lo = 0, hi = m.t.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m.t[mid] <= t) lo = mid; else hi = mid - 1; }
    if (t - m.t[lo] > 7 * 86400000 || isNaN(m._s50[lo])) return true;
    return side * (m.v[lo] - m._s50[lo]) > 0;
  };
  Ctx.prototype.aoOK = function (side, i) {
    if (!this.smaOK(side, i) || !this.mktFastOK(side, this.T[i])) return false;   // фильтры SMA200 и «осторожный рынок» — здесь же, в одной точке входа
    if (!this.cfg.addAO) return true;
    const a = this.aoArr(), v = a.ao[i];
    if (isNaN(v)) return true;
    if (v * side <= 0) return false;
    return this.cfg.aoMode !== 'both' || isNaN(a.sig[i]) || (v - a.sig[i]) * side > 0;
  };
  Ctx.prototype.trendOK = function (side, t) { return this.trendMode === 'off' || (t !== 0 && side === t); };

  // основной подсчёт — импульс против позиции (дополнение «выход при смене подсчёта»)
  // Требуем, чтобы встречный импульс дошёл хотя бы до волны 4: волны 1-2 ещё неотличимы от A-B коррекции,
  // импульс опознаётся только после появления третьей волны.
  // Второй случай: наша «волна 1» переосмыслена как волна A, и зигзаг/флэт в сторону сделки уже завершён
  // (движение оказалось коррекцией 5-3-5 / 3-3-5, а не импульсом).
  Ctx.prototype.isFlip = function (s, side, i0) {
    if (!s || s.score < this.cfg.minScore) return false;
    if (s.fam === 0) return s.dir === -side && s.n >= 4;
    return s.fam === 1 && s.dir === side && i0 !== undefined && s.idx[0] === i0 && this.phaseNext(s) === -side;
  };

  Ctx.prototype.phaseNext = function (s) {
    if (s.score < this.cfg.minScore) return 0;
    if ((s.fam === 0 && s.n === 6) || (s.fam === 1 && s.n === 4) || (s.fam === 2 && s.n === 6)) return -s.dir;
    return 0;
  };

  // перенос стопа одной позиции
  Ctx.prototype.trailOne = function (cur, i, spiv, piv, mp, tbuf, moves) {
    const c = this.cfg, H = this.H, L = this.L;
    if (cur.side > 0) cur.best = Math.max(cur.best, H[i]); else cur.best = Math.min(cur.best, L[i]);
    const on = cur.side * (cur.best - cur.entry) >= c.trailStartR * Math.abs(cur.entry - cur.stop0);
    if (c.exitMode === 'fixed' || !on) return;
    const tryMove = (ns) => {
      if (ns > 0 && cur.side * (ns - cur.stop) > 0 && cur.side * (this.C[i] - ns) > 0 && (!c.trailProfit || cur.side * (ns - cur.entry) >= 0)) {
        cur.stop = ns; cur.moves++; if (moves) moves.push({ bar: i, p: ns });
      }
    };
    const K = Math.max(1, c.localBars), j = i - K;
    if (c.trailSrc === 'local' && j - K >= 0 && j >= cur.iEntry) {
      let isLo = true, isHi = true;
      for (let m = 1; m <= K; m++) {
        if (!(L[j] < L[j - m] && L[j] <= L[j + m])) isLo = false;
        if (!(H[j] > H[j - m] && H[j] >= H[j + m])) isHi = false;
      }
      if (cur.side > 0 && isLo) tryMove(L[j] * (1 - tbuf));
      if (cur.side < 0 && isHi) tryMove(H[j] * (1 + tbuf));
    }
    if (c.trailSrc === 'wave' && (c.exitMode === 'sub' ? spiv : piv)) {
      const pv = c.exitMode === 'sub' ? this.sub[this.sub.length - 1] : mp[mp.length - 1];
      if (pv.i >= cur.iEntry) {
        if (cur.side > 0 && pv.t === -1) tryMove(pv.p * (1 - tbuf));
        if (cur.side < 0 && pv.t === 1) tryMove(pv.p * (1 + tbuf));
      }
    }
  };

  // ---------- бэктест: сигнал по данным до бара, вход по открытию следующего ----------
  Ctx.prototype.backtest = function (swingPct, keep) {
    const c = this.cfg, N = this.N, O = this.O, H = this.H, L = this.L, C = this.C;
    const st = { cashRet: 0, trades: 0, wins: 0, sumR: 0, sumNR: 0, gp: 0, gl: 0, totalRet: 0, maxDD: 0, worst: 0, sumBars: 0, sn: [0, 0, 0, 0, 0], sw: [0, 0, 0, 0, 0], sr: [0, 0, 0, 0, 0] };
    const trades = [];
    if (N < 30) return { st, trades };
    const zm = zzInit(swingPct / 100), zs = zzInit(swingPct / 100 * c.subRatio);
    const mp = []; this.sub = [];
    const tr = this.computeTrend(swingPct);
    const fee = c.feePct / 100, slip = c.slipPct / 100, tbuf = c.trailBufPct / 100;
    let equity = 1, peak = 1, maxdd = 0, streak = 0, hasSig = false, sig = null, sigBar = 0;
    let cur = null, frac = 0, phaseExit = false, flipExit = false;
    const cashY = (c.cashYield || 0) / 100;
    for (let i = 0; i < N; i++) {
      // свободная часть капитала лежит в фонде денежного рынка и приносит проценты
      if (cashY > 0 && i > 0) { const dt = (this.T[i] - this.T[i - 1]) / 31557600000, idle = cur ? Math.max(0, 1 - frac) : 1, g = equity * idle * cashY * dt; equity += g; st.cashRet += g; }
      if (hasSig) {
        hasSig = false;
        const e = O[i];
        if (!cur && sig.side * (e - sig.stop) > 0 && sig.side * (sig.target - e) > 0) {
          frac = Math.min(c.riskPct / 100 / (Math.abs(e - sig.stop) / e), c.maxLev);
          cur = { setup: sig.setup, side: sig.side, iSig: sigBar, iEntry: i, entry: e, stop: sig.stop, stop0: sig.stop, target: sig.target, notgt: sig.notgt, i0: sig.i0, cnt: sig.cnt, moves: 0, best: e, path: [] };
          // уровень доливки по Вильямсу: волна 3 прошла 110% волны 1 (подтверждение, что третья волна настоящая)
          if (sig.w1) { const lv = sig.w1[1] + sig.side * 0.1 * Math.abs(sig.w1[1] - sig.w1[0]); if (sig.side * (lv - e) > 0) cur.addLvl = lv; }
          phaseExit = false; flipExit = false;
        }
      }
      if (cur) {
        let reason = -1, px = 0;
        if (phaseExit) { px = O[i]; reason = 5; }
        else if (flipExit) { px = O[i]; reason = 6; }
        else if (cur.side > 0) {
          if (L[i] <= cur.stop) { px = Math.min(O[i], cur.stop); reason = 0; }
          else if (!cur.notgt && H[i] >= cur.target) { px = Math.max(O[i], cur.target); reason = 1; }
        } else {
          if (H[i] >= cur.stop) { px = Math.max(O[i], cur.stop); reason = 0; }
          else if (!cur.notgt && L[i] <= cur.target) { px = Math.min(O[i], cur.target); reason = 1; }
        }
        if (reason === 0 && cur.runner) reason = 7;
        else if (reason === 0 && cur.beOn != null && Math.abs(cur.stop - cur.beLv) < 1e-9) reason = 8;   // выбило по безубытку
        if (reason === 1 && c.addRunner && !this.hiEnding(i, cur.side)) {
          // цель достигнута: не закрываем, стоп в безубыток, дальше — под локальные минимумы
          reason = -1; cur.runner = true; cur.notgt = true; cur.iRun = i;
          if (cur.side * (cur.entry - cur.stop) > 0) { cur.stop = cur.entry; cur.moves++; if (keep) cur.path.push({ bar: i, p: cur.entry }); }
        }
        if (reason < 0 && c.maxHold > 0 && i - cur.iEntry >= c.maxHold) { px = C[i]; reason = 2; }
        if (reason < 0 && c.maxHoldDays > 0 && this.T[i] - this.T[cur.iEntry] >= c.maxHoldDays * 86400000) { px = C[i]; reason = 2; }
        if (reason < 0 && i === N - 1) { px = C[i]; reason = 3; }
        if (reason >= 0) {
          const net = cur.side * (px - cur.entry) / cur.entry - 2 * fee - 2 * slip;
          const ret = frac * net;
          let retA = 0;
          if (cur.add) {   // доливка закрывается вместе с основной позицией; R — в её собственном риске (1%)
            const A = cur.add, netA = cur.side * (px - A.px) / A.px - 2 * fee - 2 * slip;
            retA = A.frac * netA; A.exit = px;
            A.R = cur.side * (px - A.px) / A.risk; A.NR = (cur.side * (px - A.px) - (2 * fee + 2 * slip) * A.px) / A.risk;
            if (reason !== 3) { st.sumR += A.R; st.sumNR += A.NR; st.adds = (st.adds || 0) + 1; }
          }
          equity *= 1 + ret + retA; cur.eqRet = ret + retA;
          const R = cur.side * (px - cur.entry) / Math.abs(cur.entry - cur.stop0);
          const NR = (cur.side * (px - cur.entry) - (2 * fee + 2 * slip) * cur.entry) / Math.abs(cur.entry - cur.stop0);   // R за вычетом комиссии и проскальзывания
          st.trades++; st.sumR += R; st.sumNR += NR; cur.NR = NR; st.sumBars += i - cur.iEntry + 1;
          st.sn[cur.setup]++; st.sr[cur.setup] += R;
          if (ret > 0) { st.wins++; st.gp += ret; st.sw[cur.setup]++; streak = 0; }
          else { st.gl -= ret; streak++; if (streak > st.worst) st.worst = streak; }
          if (keep) { cur.iExit = i; cur.exitP = px; cur.R = R; cur.ret = ret; cur.reason = reason; trades.push(cur); }
          cur = null; phaseExit = false; flipExit = false;
        }
      }
      // доливка: позиция жива после проверки выхода, цена дошла до 110% волны 1
      if (cur && c.addPyramid && cur.addLvl && !cur.add && i > cur.iEntry && (cur.side > 0 ? H[i] >= cur.addLvl : L[i] <= cur.addLvl)) {
        const pa = cur.side > 0 ? Math.max(O[i], cur.addLvl) : Math.min(O[i], cur.addLvl), risk = Math.abs(pa - cur.stop);
        if (risk > 0 && cur.side * (pa - cur.stop) > 0) {
          const fa = Math.max(0, Math.min(c.riskPct / 100 / (risk / pa), c.maxLev - frac));
          if (fa > 0) cur.add = { i, px: pa, risk, stop: cur.stop, frac: fa };
        }
      }
      const spiv = zzPush(zs, i, H, L, this.sub);
      const piv = zzPush(zm, i, H, L, mp);
      if (cur && c.addPhaseExit && piv && mp[mp.length - 1].i >= cur.iEntry && i < N - 1) {
        const sc = this.buildScenarios(mp);
        if (sc.length > 0 && this.phaseNext(sc[0]) === -cur.side) phaseExit = true;
      }
      if (cur && c.addFlipExit && piv && mp[mp.length - 1].c > cur.iSig && i < N - 1) {
        const sc = this.buildScenarios(mp);
        if (sc.length > 0 && this.isFlip(sc[0], cur.side, cur.i0)) { flipExit = true; if (keep) cur.exitCnt = snapCount(sc[0]); }
      }
      if (cur) this.trailOne(cur, i, spiv, piv, mp, tbuf, keep ? cur.path : null);
      // безубыток (опция «переносить стоп»): условие на закрытии свечи — стоп на вход + комиссии со следующей
      if (cur && c.beMode === 'auto' && cur.beOn == null && i < N - 1) {
        cur._bs = cur._bs || {};
        const be = this.beLevel(cur);
        if (this.beTrig(cur, i, cur._bs) && cur.side * (C[i] - be) > 0) {
          cur.beOn = i; cur.beLv = be; cur.beWhy = this.beWhyText();
          if (cur.side * (be - cur.stop) > 0) { cur.stop = be; cur.moves++; if (keep) cur.path.push({ bar: i, p: be, be: true }); } else cur.beLv = NaN;
        }
      }
      if (cur && cur.runner) {
        const K = Math.max(1, c.localBars), j = i - K;
        if (j - K >= cur.iEntry) {
          let ok = true;
          for (let m = 1; m <= K && ok; m++) ok = cur.side > 0 ? (L[j] < L[j - m] && L[j] <= L[j + m]) : (H[j] > H[j - m] && H[j] >= H[j + m]);
          const ns = cur.side > 0 ? L[j] * (1 - tbuf) : H[j] * (1 + tbuf);
          if (ok && cur.side * (ns - cur.stop) > 0 && cur.side * (C[i] - ns) > 0) { cur.stop = ns; cur.moves++; if (keep) cur.path.push({ bar: i, p: ns }); }
        }
      }
      if (piv && !cur && !hasSig && i < N - 1) {
        const sc = this.buildScenarios(mp);
        for (const s of sc) {
          if (s.score < c.minScore) continue;
          const pl = this.makePlan(s, C[i]);
          if (pl && this.trendOK(pl.side, tr[i]) && this.marketOK(pl.side, this.T[i]) && this.aoOK(pl.side, i)) { sig = pl; sig.i0 = s.idx[0]; sig.cnt = keep ? snapCount(s) : null; sigBar = i; hasSig = true; break; }
        }
      }
      const eqNow = cur ? equity * (1 + frac * (cur.side * (C[i] - cur.entry) / cur.entry) + (cur.add ? cur.add.frac * cur.side * (C[i] - cur.add.px) / cur.add.px : 0)) : equity;
      if (eqNow > peak) peak = eqNow;
      const dd = 1 - eqNow / peak;
      if (dd > maxdd) maxdd = dd;
    }
    st.totalRet = equity - 1;
    st.maxDD = maxdd;
    return { st, trades };
  };

  // ---------- текущий подсчёт ----------
  Ctx.prototype.analyzeNow = function (swingPct) {
    const c = this.cfg, N = this.N;
    const zm = zzInit(swingPct / 100), zs = zzInit(swingPct / 100 * c.subRatio);
    this.main = []; this.sub = [];
    for (let i = 0; i < N; i++) { zzPush(zs, i, this.H, this.L, this.sub); zzPush(zm, i, this.H, this.L, this.main); }
    this.pend = zm.dir !== 0 ? { i: zm.extI, p: zm.extP, t: zm.dir } : null;
    this.scen = this.buildScenarios(this.main);
    this.phase = this.scen.length ? this.phaseNext(this.scen[0]) : 0;
    if (c.longOnly && this.phase > 0) this.phase = 0;
    if (c.shortOnly && this.phase < 0) this.phase = 0;
    this.trend = this.computeTrend(swingPct);
    this.plan = null;
    if (this.main.length > 0) {
      const lp = this.main[this.main.length - 1], entry = this.C[lp.c];
      for (let k = 0; k < this.scen.length; k++) {
        const s = this.scen[k];
        if (s.score < c.minScore) continue;
        const pl = this.makePlan(s, entry);
        if (pl && this.trendOK(pl.side, this.trend[lp.c]) && this.marketOK(pl.side, this.T[lp.c]) && this.aoOK(pl.side, lp.c)) { pl.scen = k; pl.sigBar = lp.c; this.plan = pl; break; }
      }
    }
  };

  Ctx.prototype.planActive = function () {
    const p = this.plan; if (!p) return false;
    const last = this.C[this.N - 1];
    if (p.side * (last - p.target) >= 0) return false;
    if (p.side * (last - p.stop) <= 0) return false;
    return true;
  };

  // ---------- фигуры на истории ----------
  Ctx.prototype.findBreak24 = function (s) {
    if (!(s.kind === 0 || s.kind === 1) || s.n < 6) return -1;
    const last = Math.min(this.N - 1, s.idx[5] + 2 * (s.idx[5] - s.idx[0]) + 5);
    for (let j = s.idx[5] + 1; j <= last; j++) {
      if (s.dir > 0 && this.H[j] > s.px[5]) return -1;
      if (s.dir < 0 && this.L[j] < s.px[5]) return -1;
      const ln = lineAt(s.idx[2], s.px[2], s.idx[4], s.px[4], j);
      if (s.dir * (this.C[j] - ln) < 0) return j;
    }
    return -1;
  };

  Ctx.prototype.findFigures = function () {
    const figs = [], cnt = [0, 0, 0, 0, 0], M = this.main, ms = this.cfg.minScore;
    let k0 = 0;
    while (k0 + 3 < M.length) {
      let best = null;
      if (k0 + 5 < M.length) {
        const sub = M.slice(k0, k0 + 6);
        let e = this.evalImpulse(sub);
        if (e && e.score >= ms) { const s = fillScen(0, e, sub); if (!best || s.score > best.score) best = s; }
        e = this.evalTri(sub);
        if (e && e.score >= ms && this.triPosOK(M, k0, e)) { const s = fillScen(2, e, sub); if (!best || s.score > best.score) best = s; }
      }
      if (!best) {
        const sub = M.slice(k0, k0 + 4);
        const e = this.evalABC(sub);
        if (e && e.score >= ms) best = fillScen(1, e, sub);
      }
      if (best) {
        best.brk = this.findBreak24(best);
        figs.push(best); cnt[best.kind]++;
        k0 += best.n - 1;
      } else k0++;
    }
    return { figs, cnt };
  };

  function lineAt(i1, p1, i2, p2, i) { return i2 === i1 ? p1 : p1 + (p2 - p1) * (i - i1) / (i2 - i1); }

  // линии канала: [[i1,p1,i2,p2,label], ...] — продлевать до нужного бара через lineAt
  function channelLines(s) {
    if (s.kind === 0 && s.n >= 5) {
      const di = s.idx[4] - s.idx[2];
      return [
        { i1: s.idx[2], p1: s.px[2], i2: s.idx[4], p2: s.px[4], from: s.idx[2], label: 'Линия 2-4' },
        { i1: s.idx[3], p1: s.px[3], i2: s.idx[3] + di, p2: s.px[3] + (s.px[4] - s.px[2]), from: s.idx[3], label: 'Параллель через 3: вероятный конец волны 5' },
      ];
    }
    if (s.kind === 0 && s.n === 4) {
      const di = s.idx[3] - s.idx[1];
      return [
        { i1: s.idx[1], p1: s.px[1], i2: s.idx[3], p2: s.px[3], from: s.idx[1], label: 'Линия 1-3' },
        { i1: s.idx[2], p1: s.px[2], i2: s.idx[2] + di, p2: s.px[2] + (s.px[3] - s.px[1]), from: s.idx[2], label: 'Параллель через 2: граница волны 4' },
      ];
    }
    if ((s.kind === 1 || s.kind === 4) && s.n >= 5) {
      return [
        { i1: s.idx[1], p1: s.px[1], i2: s.idx[3], p2: s.px[3], from: s.idx[1], label: s.kind === 1 ? 'Линия 1-3' : 'Линия A-C' },
        { i1: s.idx[2], p1: s.px[2], i2: s.idx[4], p2: s.px[4], from: s.idx[2], label: s.kind === 1 ? 'Линия 2-4' : 'Линия B-D' },
      ];
    }
    return [];
  }

  // ---------- отметки «стоп в безубыток» (сделки не меняются) ----------
  // Подсказка «безубыток» — только информация, на сделки и статистику не влияет.
  // beRule: 'atr' — после ухода цены на beAtr×ATR от входа стоп за локальный минимум выше входа,
  //                  после которого цена обновила максимум (рынок построил опору);
  //         'local' — за первый локальный минимум выше входа (как было);
  //         'r1' — на цену входа после прохода +1R.
  Ctx.prototype.atr = function () {
    if (this._atr) return this._atr;
    const N = this.N, H = this.H, L = this.L, C = this.C, a = new Array(N).fill(0);
    for (let i = 1; i < N; i++) {
      const tr = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
      a[i] = i < 14 ? (a[i - 1] * (i - 1) + tr) / i : (a[i - 1] * 13 + tr) / 14;
    }
    if (N > 1) a[0] = a[1];
    return (this._atr = a);
  };
  // ---------- безубыток: когда «действительно нужно» (проверка 65 бумаг, дневки 2019–2026) ----------
  Ctx.prototype.beLevel = function (t) { const c = this.cfg; return t.entry * (1 + t.side * (2 * c.feePct + 2 * c.slipPct + 0.05) / 100); };
  Ctx.prototype.beWhyText = function () { const r = this.cfg.beRule; return r === 'atr' ? 'цена ушла на ' + (this.cfg.beAtr || 3) + '×ATR' : BE_WHY[r] || ''; };
  Ctx.prototype.mkt50 = function (t) {   // знак: индекс рынка выше (+1) или ниже (−1) своей средней за 50 свечей, 0 — нет данных
    const m = this.cfg.mkt; if (!m || !m.v || !m.t || m.t.length < 50 || t < m.t[0]) return 0;
    if (!m._s50) { const o = new Array(m.v.length).fill(NaN); let sm = 0; for (let k = 0; k < m.v.length; k++) { sm += m.v[k]; if (k >= 50) sm -= m.v[k - 50]; if (k >= 49) o[k] = sm / 50; } m._s50 = o; }
    let lo = 0, hi = m.t.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m.t[mid] <= t) lo = mid; else hi = mid - 1; }
    if (t - m.t[lo] > 7 * 86400000 || isNaN(m._s50[lo])) return 0;
    return m.v[lo] > m._s50[lo] ? 1 : m.v[lo] < m._s50[lo] ? -1 : 0;
  };
  Ctx.prototype.subAt = function (i) {   // разворот младшей степени, подтверждённый на свече i
    if (!this._sbc || this._sbcN !== this.sub.length) { this._sbc = new Map(); for (const p of this.sub) this._sbc.set(p.c, p); this._sbcN = this.sub.length; }
    return this._sbc.get(i) || null;
  };
  // true — на закрытии свечи i сработало условие; st — состояние по сделке (лучшая цена и т. п.)
  Ctx.prototype.beTrig = function (t, i, st) {
    const c = this.cfg, s = t.side, risk = Math.abs(t.entry - t.stop0);
    st.fav = Math.max(st.fav || 0, s * ((s > 0 ? this.H[i] : this.L[i]) - t.entry));
    switch (c.beRule) {
      case 'r1': return st.fav >= risk;
      case 'r2': return st.fav >= 2 * risk;
      case 'atr': return st.fav >= (c.beAtr || 3) * this.atr()[Math.max(0, t.iEntry - 1)];
      case 'ao': { const a = this.aoArr().ao[i]; return !isNaN(a) && a * s < 0; }
      case 'mkt': return this.mkt50(this.T[i]) === -s;
      case 'stall': return i - t.iEntry >= 20 && st.fav < 0.5 * risk;
      case 'wave': {
        if (t.setup !== 0 || !t.cnt || !t.cnt.px || t.cnt.px.length < 2) return false;
        const w1 = t.cnt.px[1];
        if (!st.w1x && s * ((s > 0 ? this.H[i] : this.L[i]) - w1) > 0) st.w1x = true;
        const p = st.w1x ? this.subAt(i) : null;
        return !!(p && p.i > t.iEntry && p.t === -s && s * (p.p - w1) > 0);
      }
      default: return false;
    }
  };
  Ctx.prototype.shadow = function (trades) {
    const c = this.cfg, buf = c.trailBufPct / 100, K = Math.max(1, c.localBars), H = this.H, L = this.L, O = this.O, C = this.C;
    const rule = c.beRule || 'atr', A = this.atr();
    const NEW = { r1: 1, r2: 1, atr: 1, ao: 1, mkt: 1, stall: 1, wave: 1 };   // 'local' — прежняя «лесенка» под опоры
    if (NEW[rule]) return trades.map((t) => {   // простые правила: один шаг — стоп на вход + комиссии
      const steps = [], st = {}, be = this.beLevel(t), s = t.side, risk = Math.abs(t.entry - t.stop0); let stop = t.stop0, moved = false, hit = -1, hitPx = 0;
      for (let i = t.iEntry; i <= t.iExit && i < this.N; i++) {
        if (moved && (s > 0 ? L[i] <= stop : H[i] >= stop)) { hit = i; hitPx = s > 0 ? Math.min(O[i], stop) : Math.max(O[i], stop); break; }
        if (!moved && (i < t.iExit || t.reason === 3) && this.beTrig(t, i, st) && s * (C[i] - be) > 0 && s * (be - stop) > 0) { stop = be; moved = true; steps.push({ bar: i, p: be, why: this.beWhyText() }); }
      }
      return { steps, hit, hitPx, R: hit >= 0 ? s * (hitPx - t.entry) / risk : null, armPx: rule === 'r2' ? t.entry + s * 2 * risk : rule === 'r1' ? t.entry + s * risk : rule === 'atr' ? t.entry + s * (c.beAtr || 3) * this.atr()[Math.max(0, t.iEntry - 1)] : null, armed: moved };
    });
    return trades.map((t) => {
      const steps = []; let stop = t.stop0, moved = false, hit = -1, hitPx = 0, armed = rule === 'local';
      const s = t.side, risk = Math.abs(t.entry - t.stop0), a0 = A[Math.max(0, t.iEntry - 1)];
      let ext = t.entry; // лучший максимум (минимум для продаж) с момента входа
      for (let i = t.iEntry; i <= t.iExit && i < this.N; i++) {
        if (moved && s > 0 && L[i] <= stop) { hit = i; hitPx = Math.min(O[i], stop); break; }
        if (moved && s < 0 && H[i] >= stop) { hit = i; hitPx = Math.max(O[i], stop); break; }
        const fav = s > 0 ? H[i] : L[i];
        if (!armed) {
          if (rule === 'atr' && s * (fav - t.entry) >= (c.beAtr || 3) * a0) armed = true;
          if (rule === 'r1' && s * (fav - t.entry) >= risk) {
            armed = true;
            if (s * (t.entry - stop) > 0 && s * (C[i] - t.entry) > 0) { stop = t.entry; moved = true; steps.push({ bar: i, p: t.entry }); }
          }
        }
        const newExt = s * (fav - ext) > 0;
        if (newExt) ext = fav;
        if (!armed || rule === 'r1') continue;
        const j = i - K;
        if (j - K < 0 || j < t.iEntry) continue;
        let isLo = true, isHi = true;
        for (let m = 1; m <= K; m++) {
          if (!(L[j] < L[j - m] && L[j] <= L[j + m])) isLo = false;
          if (!(H[j] > H[j - m] && H[j] >= H[j + m])) isHi = false;
        }
        let ns = 0;
        if (s > 0 && isLo) ns = L[j] * (1 - buf);
        if (s < 0 && isHi) ns = H[j] * (1 + buf);
        if (ns > 0 && rule === 'atr') {
          // опора подтверждается, только если после неё цена обновила экстремум
          let before = t.entry, after = -Infinity * s;
          for (let m = t.iEntry; m < j; m++) before = s > 0 ? Math.max(before, H[m]) : Math.min(before, L[m]);
          for (let m = j + 1; m <= i; m++) after = s > 0 ? Math.max(after, H[m]) : Math.min(after, L[m]);
          if (!(s * (after - before) > 0)) ns = 0;
        }
        if (ns > 0 && s * (ns - stop) > 0 && s * (C[i] - ns) > 0 && s * (ns - t.entry) >= 0) { stop = ns; moved = true; steps.push({ bar: i, p: ns }); }
      }
      const R = hit >= 0 ? s * (hitPx - t.entry) / risk : null;
      const armPx = rule === 'atr' ? t.entry + s * (c.beAtr || 3) * a0 : rule === 'r1' ? t.entry + s * risk : null;
      return { steps, hit, hitPx, R, armPx, armed };
    });
  };

  Ctx.prototype.phaseText = function () {
    const s = this.scen[0];
    if (!s || s.score < this.cfg.minScore) return { text: 'Фаза: не ясна — подсчёт слабый', tone: 'mut' };
    const d = s.dir > 0 ? 'вверх' : 'вниз';
    if (s.fam === 0) {
      if (s.n < 6) return { text: 'Фаза: тренд ' + d + (s.diag ? ' (клин)' : ' (импульс)') + ', идёт волна ' + s.n, tone: s.dir > 0 ? 'pos' : 'neg' };
      return { text: 'Фаза: ' + (s.diag ? 'клин' : 'импульс') + ' ' + d + ' завершён — ждём коррекцию', tone: 'warn' };
    }
    if (s.fam === 1) {
      const nm = s.kind === 3 ? 'боковик (флэт)' : 'коррекция (зигзаг)';
      if (s.n < 4) return { text: 'Фаза: ' + nm + ', идёт волна C', tone: 'violet' };
      return { text: 'Фаза: ' + nm + ' завершена — ждём тренд ' + (s.dir > 0 ? 'вниз' : 'вверх'), tone: 'warn' };
    }
    if (s.n < 6) return { text: 'Фаза: боковик (треугольник) — ждать рывка', tone: 'gold' };
    return { text: 'Фаза: треугольник завершён — рывок ' + (s.dir > 0 ? 'вниз' : 'вверх'), tone: 'warn' };
  };

  function autoSwing(bars, mult) {
    const N = bars.length, k = Math.min(300, N);
    if (k < 10) return 3.0;
    const r = [];
    for (let i = 0; i < k; i++) { const b = bars[N - k + i]; r.push(b.c > 0 ? (b.h - b.l) / b.c : 0); }
    r.sort((a, b) => a - b);
    return clamp(Math.round(r[Math.floor(k / 2)] * 100 * 2.5 * (mult || 1) * 10) / 10, 0.1, 30);
  }

  // разрыв в истории больше 10 дней (или 50 баров) — берём только кусок после последнего разрыва
  function trimGaps(bars, periodMs) {
    const thr = Math.max(10 * 86400000, 50 * periodMs);
    for (let k = bars.length - 1; k >= 1; k--) {
      if (bars[k].t - bars[k - 1].t > thr) {
        if (bars.length - k >= 60) return { bars: bars.slice(k), gapFrom: bars[k].t };
        break;
      }
    }
    return { bars, gapFrom: 0 };
  }

  // ---------- всё вместе ----------
  // bars — завершённые свечи; periodMs — длительность свечи
  // Подбор порога разворота по истории. Сетка вокруг авто-порога; лучший — по сумме R
  // при не менее чем minTrades сделках. Плюс честная проверка «вперёд»: подбор только
  // на первых 60% истории и результат этого порога на оставшихся 40% (в сравнении с авто).
  const OPT_K = [0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2.0];
  function optimizeSwing(barsIn, cfgIn, periodMs) {
    const cfg = merge(Object.assign({}, cfgIn, { swingPct: 0 }));
    let bars = trimGaps(barsIn.slice(-cfg.maxBars), periodMs || 3600000).bars;
    const N = bars.length, split = Math.floor(N * 0.6), minTr = 8;
    const sumUp = (trades, from, to) => {
      let R = 0, n = 0, w = 0;
      for (const t of trades) { if (t.reason === 3 || t.iEntry < from || t.iEntry >= to) continue; R += t.NR; n++; if (t.NR > 0) w++; }   // чистый R
      return { R, n, w };
    };
    const pick = (rows, key) => {
      const ok = rows.filter((r) => r[key].n >= Math.min(minTr, Math.max(3, Math.floor(rows.reduce((m, x) => Math.max(m, x[key].n), 0) / 2))));
      return (ok.length ? ok : rows).reduce((a, b) => (b[key].R > a[key].R ? b : a));
    };
    const autoAll = autoSwing(bars, cfg.swingMult), autoTr = autoSwing(bars.slice(0, split), cfg.swingMult);
    const grid = OPT_K.map((k) => {
      const sw = Math.max(0.1, Math.round(autoAll * k * 100) / 100);
      const bt = new Ctx(bars, cfg).backtest(sw, true);
      return { sw, all: sumUp(bt.trades, 0, N), ret: bt.st.totalRet, dd: bt.st.maxDD };
    });
    const best = pick(grid, 'all');
    // проверка вперёд
    const g2 = OPT_K.map((k) => {
      const sw = Math.max(0.1, Math.round(autoTr * k * 100) / 100);
      const bt = new Ctx(bars, cfg).backtest(sw, true);
      return { sw, tr: sumUp(bt.trades, 0, split), te: sumUp(bt.trades, split, N) };
    });
    const bTr = pick(g2, 'tr'), aTr = g2[OPT_K.indexOf(1)];
    return { grid, best, auto: autoAll, check: { splitT: bars[split] ? bars[split].t : 0, sw: bTr.sw, picked: bTr.te, autoSw: aTr.sw, auto: aTr.te } };
  }

  // подбор порога по наибольшей доходности: ~28 порогов от 0,3× до 3,5× авто, шаг ~4%
  function swNice(s) { const t = s * 0.04; let st = 0.01; for (const v of [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1]) if (v <= t + 1e-9) st = v; return Math.max(0.1, Math.min(30, Math.round(Math.round(s / st) * st * 100) / 100)); }
  function optimizeReturn(barsIn, cfgIn, periodMs) {
    const cfg = merge(Object.assign({}, cfgIn, { swingPct: 0 }));
    const bars = trimGaps(barsIn.slice(-cfg.maxBars), periodMs || 3600000).bars;
    const N = bars.length, split = Math.floor(N * 0.6);
    const auto = autoSwing(bars, cfg.swingMult), lo = Math.max(0.1, auto * 0.3), hi = Math.min(30, auto * 3.5);
    const sws = [];
    for (let k = 0; k < 28; k++) { const v = swNice(lo * Math.pow(hi / lo, k / 27)); if (!sws.includes(v)) sws.push(v); }
    const retIn = (tr, a, b) => tr.reduce((e, t) => (t.iEntry >= a && t.iEntry < b ? e * (1 + (t.eqRet || 0)) : e), 1) - 1;
    const grid = sws.map((sw) => {
      const bt = new Ctx(bars, cfg).backtest(sw, true);
      const n = bt.trades.filter((t) => t.reason !== 3).length;
      return { sw, ret: bt.st.totalRet, n, trades: bt.st.trades, wins: bt.st.wins, dd: bt.st.maxDD, NR: bt.st.sumNR, tr: retIn(bt.trades, 0, split), te: retIn(bt.trades, split, N), nTr: bt.trades.filter((t) => t.iEntry < split).length };
    });
    // не берём пороги с 1–2 сделками: там «доходность» — случайность
    const maxN = Math.max(...grid.map((r) => r.n)), minN = Math.min(8, Math.max(3, Math.floor(maxN / 4)));
    const ok = grid.filter((r) => r.n >= minN);
    const best = (ok.length ? ok : grid).reduce((a, b) => (b.ret > a.ret ? b : a));
    const k = grid.indexOf(best), nb = [grid[k - 1], grid[k + 1]].filter(Boolean);
    const lone = nb.length > 0 && nb.every((x) => x.ret < best.ret * 0.4);
    // проверка вперёд: подобрали по первым 60% истории — сколько это дало на остальных 40%
    const okTr = grid.filter((r) => r.nTr >= Math.max(2, Math.floor(minN * 0.6)));
    const bTr = (okTr.length ? okTr : grid).reduce((a, b) => (b.tr > a.tr ? b : a));
    const autoRow = grid.reduce((a, b) => (Math.abs(b.sw - auto) < Math.abs(a.sw - auto) ? b : a));
    return { grid, best, auto, minN, lone, check: { splitT: bars[split] ? bars[split].t : 0, sw: bTr.sw, picked: bTr.te, autoSw: autoRow.sw, auto: autoRow.te } };
  }

  // быстрый бэктест без остального анализа: для сканера (соседние пороги, части истории)
  function quickStats(barsIn, cfgIn, periodMs, swing) {
    const cfg = merge(cfgIn);
    const bars = trimGaps(barsIn.slice(-cfg.maxBars), periodMs || 3600000).bars;
    const sw = swing > 0 ? swing : autoSwing(bars, cfg.swingMult);
    const bt = new Ctx(bars, cfg).backtest(sw, true);
    let R = 0, n = 0, w = 0;
    let NR = 0;
    for (const t of bt.trades) { if (t.reason === 3) continue; R += t.R; NR += t.NR; n++; if (t.NR > 0) w++; }
    return { sw, R, NR, n, w, trades: bt.trades, N: bars.length };
  }

  function run(barsIn, cfgIn, periodMs) {
    const cfg = merge(cfgIn);
    let bars = barsIn.slice(-cfg.maxBars);
    const g = trimGaps(bars, periodMs || 3600000);
    bars = g.bars;
    const swing = cfg.swingPct > 0 ? cfg.swingPct : autoSwing(bars, cfg.swingMult);
    const ctx = new Ctx(bars, cfg);
    const bt = ctx.backtest(swing, true);
    const sens = SENS_K.map((k) => {
      const sw = Math.max(0.1, Math.round(swing * k * 10) / 10);
      if (k === 1) return { swing: sw, st: bt.st, cur: true };
      return { swing: sw, st: new Ctx(bars, cfg).backtest(sw, false).st };
    });
    ctx.analyzeNow(swing);
    const figs = ctx.findFigures();
    const shadow = ctx.shadow(bt.trades);
    const s0 = ctx.scen[0] || null;
    const tgt = s0 ? ctx.scenTargets(s0) : null;
    const open = bt.trades.length && bt.trades[bt.trades.length - 1].reason === 3 ? bt.trades[bt.trades.length - 1] : null;
    let bh = bars.length > 1 ? bars[bars.length - 1].c / bars[0].c - 1 : 0;
    return {
      cfg, swing, bars, gapFrom: g.gapFrom, N: bars.length,
      main: ctx.main, sub: ctx.sub, pend: ctx.pend, hiPivots: ctx.hiPivots, hiPend: ctx.hiPend, ma: ctx.ma,
      scen: ctx.scen, scen0: s0, targets: tgt, title: s0 ? scenTitle(s0) : '', allTargets: ctx.scen.slice(0, 4).map((x) => ctx.scenTargets(x)),
      plan: ctx.plan, planActive: ctx.planActive(),
      trend: ctx.trend, trendNow: ctx.trend.length ? ctx.trend[ctx.trend.length - 1] : 0, trendMode: ctx.trendMode, lastHD: ctx.lastHD, lastST: ctx.lastST,
      phase: ctx.phaseText(), phaseNext: ctx.phase,
      hiTitle: (() => { if (ctx.hiPivots.length < 2) return ''; const s = ctx.buildScenarios(ctx.hiPivots)[0]; return s ? scenTitle(s) : ''; })(),
      hiEnding: open ? ctx.hiEnding(bars.length - 1, open.side) : false,
      smaNow: ctx.smaSlope(bars.length - 1),
      aoNow: (() => { const A = ctx.aoArr(), n = bars.length - 1; return { v: A.ao[n], sig: A.sig[n] }; })(),
      figures: figs.figs, figCount: figs.cnt,
      trades: bt.trades, stats: bt.st, sens, shadow, openTrade: open, buyHold: bh,
      flipNow: !!(open && cfg.addFlipExit && s0 && ctx.main.length && ctx.main[ctx.main.length - 1].c > open.iSig && ctx.isFlip(s0, open.side, open.i0)),
    };
  }

  // проверка условия безубытка для своей позиции (тренажёр): t = { side, entry, stop0, iEntry }; null — ещё нет
  function beCheck(bars, cfgIn, t) {
    const cfg = merge(cfgIn); if (cfg.beRule === 'local' || cfg.beRule === 'wave') cfg.beRule = 'atr';   // для своих позиций нет подсчёта волн — берём ATR
    const ctx = new Ctx(bars, cfg), st = {}, be = ctx.beLevel(t);
    if (!(Math.abs(t.entry - t.stop0) > 0) && cfg.beRule !== 'ao' && cfg.beRule !== 'mkt' && cfg.beRule !== 'atr') return null;
    for (let i = Math.max(0, t.iEntry); i < ctx.N; i++) if (ctx.beTrig(t, i, st) && t.side * (ctx.C[i] - be) > 0) return { i, be, why: ctx.beWhyText() };
    return null;
  }
  const API = { BE_WHY, beCheck, quickStats, optimizeSwing, optimizeReturn, countPath, DEFAULTS, SETUP_NAME, SETUP_SHORT, REASON_NAME, FIG_NAME, run, autoSwing, trimGaps, scenTitle, pointLabel, figName, channelLines, lineAt, merge, Ctx, zzInit, zzPush };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EW2 = API;
})(typeof window !== 'undefined' ? window : globalThis);
