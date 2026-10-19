/*
 * Волновой движок по книге Р. Пректера и А. Фроста «Волновой принцип Эллиотта».
 * Чистый JS без зависимостей: работает и в браузере (window.EW), и в Node (module.exports).
 *
 * Что внутри:
 *  - Zigzag      — причинный (без заглядывания вперёд) поиск разворотов по % порогу;
 *  - evalImpulse — проверка правил импульса (стр. 34–37) и норм (гл. 2, гл. 4);
 *  - evalABC     — зигзаг / горизонтальная коррекция (стр. 46–54, 144–146);
 *  - evalTriangle— сужающийся треугольник (стр. 54–57, 146);
 *  - analyze     — сценарии «предпочтительный + альтернативы» с целями и уровнем отмены;
 *  - backtest    — пошаговая проверка торговых сетапов без заглядывания в будущее;
 *  - parseCSV / synth — загрузка котировок и учебные данные.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    swingPct: 3,          // порог разворота зигзага, %
    subRatio: 0.4,        // порог младшей степени = swingPct * subRatio
    scale: 'log',         // 'log' (полулогарифмический) или 'linear' (стр. 81–83)
    minScore: 45,         // минимальная оценка сценария для сигнала
    minRR: 1.5,           // минимальное отношение прибыль/риск
    riskPct: 1,           // риск на сделку, % капитала
    maxLev: 3,            // максимальное плечо (ограничивает размер позиции)
    feePct: 0.05,         // комиссия на одну сторону, %
    slipPct: 0.02,        // проскальзывание на одну сторону, %
    maxHold: 200,         // максимум баров в позиции
    stopBufPct: 0.1,      // запас за уровень стопа, %
    w2min: 0.3, w2max: 0.8,
    setups: { w3: true, w5: true, abc: true, tri: true, counter: false },
    events: [],           // [{ t, type, title }] — события для фильтра (уже отобранные под бумагу)
    eventFilter: false,   // не открывать сделки, если событие в ближайшие eventDays дней
    eventDays: 2,
    eventClose: false     // закрывать позицию накануне события
  };

  const SETUP_NAMES = {
    w3: 'Вход в волну 3',
    w5: 'Вход в волну 5',
    abc: 'После коррекции A-B-C',
    tri: 'Рывок из треугольника',
    counter: 'Против тренда после 5 волн'
  };

  // ---------------------------------------------------------------- utils
  const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  /** Близость x к ближайшему из уровней: 1 — точно, 0 — дальше допуска. */
  function near(x, levels, tol) {
    let best = { c: 0, lvl: null };
    for (const l of levels) {
      const c = 1 - Math.abs(x - l) / (tol * Math.max(l, 0.2));
      if (c > best.c) best = { c, lvl: l };
    }
    best.c = clamp(best.c, 0, 1);
    return best;
  }
  const pct = (x) => (x * 100).toFixed(1).replace(/\.0$/, '').replace('.', ',') + '%';
  const fx = (x) => (Math.round(x * 1000) / 1000).toString().replace('.', ',');

  function makeCtx(opts, bars, subPivots) {
    const log = opts.scale !== 'linear';
    return {
      opts,
      bars,
      sub: subPivots || [],
      F: log ? Math.log : (x) => x,
      G: log ? Math.exp : (x) => x
    };
  }

  // ---------------------------------------------------------------- zigzag
  /**
   * Причинный зигзаг. Разворот подтверждается, когда цена ушла от экстремума на thr.
   * Каждый пивот хранит i (бар экстремума) и c (бар подтверждения).
   */
  class Zigzag {
    constructor(thr) {
      this.thr = thr;
      this.pivots = [];
      this.dir = 0;
      this.hiP = -Infinity; this.hiI = 0;
      this.loP = Infinity; this.loI = 0;
      this.extP = 0; this.extI = 0;
    }
    push(b, i) {
      const t = this.thr;
      let out = null;
      if (this.dir === 0) {
        if (b.h > this.hiP) { this.hiP = b.h; this.hiI = i; }
        if (b.l < this.loP) { this.loP = b.l; this.loI = i; }
        if (this.hiI > this.loI && this.hiP >= this.loP * (1 + t)) {
          out = { i: this.loI, p: this.loP, t: 'L', c: i };
          this.dir = 1; this.extP = this.hiP; this.extI = this.hiI;
        } else if (this.loI > this.hiI && this.loP <= this.hiP * (1 - t)) {
          out = { i: this.hiI, p: this.hiP, t: 'H', c: i };
          this.dir = -1; this.extP = this.loP; this.extI = this.loI;
        }
      } else if (this.dir === 1) {
        if (b.h > this.extP) { this.extP = b.h; this.extI = i; }
        else if (b.l <= this.extP * (1 - t)) {
          out = { i: this.extI, p: this.extP, t: 'H', c: i };
          this.dir = -1; this.extP = b.l; this.extI = i;
        }
      } else {
        if (b.l < this.extP) { this.extP = b.l; this.extI = i; }
        else if (b.h >= this.extP * (1 + t)) {
          out = { i: this.extI, p: this.extP, t: 'L', c: i };
          this.dir = 1; this.extP = b.h; this.extI = i;
        }
      }
      if (out) this.pivots.push(out);
      return out;
    }
    /** Текущий неподтверждённый экстремум (куда тянется последняя волна). */
    pending() {
      if (this.dir === 0) return null;
      return { i: this.extI, p: this.extP, t: this.dir === 1 ? 'H' : 'L', c: null };
    }
  }

  function zigzag(bars, thr) {
    const z = new Zigzag(thr);
    for (let i = 0; i < bars.length; i++) z.push(bars[i], i);
    return { pivots: z.pivots, pending: z.pending() };
  }

  /** Сколько колебаний младшей степени внутри отрезка [a, b] (по подтверждённым пивотам). */
  function subLegs(ctx, a, b) {
    let n = 0;
    for (const p of ctx.sub) if (p.i > a && p.i < b) n++;
    return n + 1;
  }

  function legVolume(ctx, a, b) {
    let s = 0, k = 0;
    for (let i = a + 1; i <= b; i++) { const v = ctx.bars[i] && ctx.bars[i].v; if (v > 0) { s += v; k++; } }
    return k ? s / k : 0;
  }

  // ---------------------------------------------------------------- impulse
  const STATUS_IMP = { 2: 'w2', 3: 'w3', 4: 'w4', 5: 'w5', 6: 'done' };

  /**
   * Проверка последовательности 0-1-2-3-4-5 (может быть неполной: 2..6 точек).
   * Правила (не допускают исключений, стр. 34–35):
   *  - волна 2 не заходит за начало волны 1;
   *  - волна 3 не бывает самой короткой из 1, 3, 5;
   *  - волна 4 не заходит на территорию волны 1 (иначе — диагональный треугольник).
   */
  function evalImpulse(P, ctx) {
    const n = P.length, F = ctx.F;
    const v = P.map((x) => F(x.p));
    const d = sgn(v[1] - v[0]);
    const w = [];
    for (let k = 1; k < n; k++) w.push(Math.abs(v[k] - v[k - 1]));
    const rules = [], notes = [], flags = {};
    let ok = true, score = 35, diag = false;
    const rule = (good, text, ref) => { rules.push({ ok: good, text, ref }); if (!good) ok = false; };

    if (n >= 3) rule(d * (v[2] - v[0]) > 0, 'Волна 2 не уходит за начало волны 1', 'стр. 34');
    if (n >= 4) rule(d * (v[3] - v[1]) > 0, 'Волна 3 проходит дальше конца волны 1', 'стр. 34');
    if (n >= 5) {
      const overlap = d * (v[4] - v[1]) <= 0;
      if (overlap) {
        // Перекрытие допустимо только в диагональном треугольнике (клине)
        const contracting = w[2] < w[0] && w[3] < w[1];
        rule(d * (v[4] - v[2]) > 0, 'Волна 4 не уходит за начало волны 3', 'стр. 34');
        rule(contracting, 'Перекрытие 4 и 1 допустимо только в сужающемся клине', 'стр. 40');
        diag = true;
      } else {
        rule(true, 'Волна 4 не заходит на территорию волны 1', 'стр. 34');
      }
    }
    if (n >= 6) {
      rule(!(w[2] < w[0] && w[2] < w[4]), 'Волна 3 не самая короткая из 1, 3, 5', 'стр. 34');
      if (diag) rule(w[4] < w[2], 'В клине волна 5 короче волны 3', 'стр. 40');
      if (d * (v[5] - v[3]) <= 0) {
        flags.truncated = true;
        notes.push({ s: 0, t: 'Усечённая пятая: волна 5 не обновила экстремум волны 3 — признак слабости (стр. 38)' });
      }
    }
    if (!ok) return { ok: false, rules, notes, score: 0 };

    // --- нормы и соотношения Фибоначчи
    const add = (pts, text) => { score += pts; notes.push({ s: pts, t: text }); };
    let r2 = null, r4 = null;
    if (n >= 3) {
      r2 = w[1] / w[0];
      const c = near(r2, [0.382, 0.5, 0.618, 0.786], 0.14);
      if (c.c > 0) add(8 * c.c, `Откат волны 2 = ${pct(r2)} от волны 1 (норма 50–61,8%, стр. 141)`);
    }
    if (n >= 4) {
      const r3 = w[2] / w[0];
      const c = near(r3, [1, 1.618, 2.618], 0.12);
      if (c.c > 0) add(8 * c.c, `Волна 3 = ${fx(r3)} × волна 1 (ориентиры 1,618 и 2,618, стр. 142)`);
      if (r3 > 1.3) add(4, 'Волна 3 растянута — так бывает чаще всего (стр. 37)');
    }
    if (n >= 5) {
      r4 = w[3] / w[2];
      const c = near(r4, [0.236, 0.382, 0.5], 0.18);
      if (c.c > 0) add(6 * c.c, `Откат волны 4 = ${pct(r4)} от волны 3 (норма 38,2%, стр. 141)`);
      // Чередование (стр. 70): одна коррекция резкая и глубокая, другая боковая и мелкая
      if ((r2 >= 0.5 && r4 <= 0.4) || (r2 <= 0.4 && r4 >= 0.5)) add(6, 'Чередование: волны 2 и 4 разной глубины (стр. 70)');
      else if (Math.abs(r2 - r4) < 0.1) add(-4, 'Нет чередования: волны 2 и 4 одинаково глубоки (стр. 70)');
      // Время: четвёртая обычно дольше второй, если она боковая
      const t2 = P[2].i - P[1].i, t4 = P[4].i - P[3].i;
      if (r4 < r2 && t4 > t2) add(2, 'Волна 4 мельче, но дольше волны 2 — типичная боковая коррекция');
    }
    if (n >= 6) {
      const r5 = w[4] / w[0];
      const total03 = Math.abs(v[3] - v[0]);
      const c1 = near(r5, [0.618, 1, 1.618], 0.1);
      const c2 = near(w[4] / total03, [0.618, 1.618], 0.1);
      if (c1.c >= c2.c && c1.c > 0) add(7 * c1.c, `Волна 5 = ${fx(r5)} × волна 1 (равенство волн, стр. 76, 142)`);
      else if (c2.c > 0) add(7 * c2.c, `Волна 5 = ${fx(w[4] / total03)} × путь 0→3 (стр. 143)`);
      if (w[2] / w[0] > 1.5 && Math.abs(r5 - 1) < 0.25) add(4, 'Волна 3 растянута, волны 1 и 5 близки к равенству (стр. 36)');
      // Канал: линия 2–4 и параллель через 3 (стр. 78–79)
      const s = (v[4] - v[2]) / (P[4].i - P[2].i || 1);
      const upper = v[3] + s * (P[5].i - P[3].i);
      const width = Math.abs(v[3] - (v[2] + s * (P[3].i - P[2].i))) || 1e-9;
      const over = d * (v[5] - upper) / width;
      if (Math.abs(over) <= 0.35) add(5, 'Волна 5 закончилась у верхней границы канала (стр. 79)');
      else if (over > 0.35) notes.push({ s: 0, t: 'Прокол границы канала волной 5 («выброс», стр. 79–81)' });
    }
    // Объём (стр. 83–84): в волне 3 выше, в волне 5 ниже
    if (n >= 6) {
      const v1 = legVolume(ctx, P[0].i, P[1].i), v3 = legVolume(ctx, P[2].i, P[3].i), v5 = legVolume(ctx, P[4].i, P[5].i);
      if (v3 > 0 && v3 > v5 && v3 > v1) add(4, 'Объём в волне 3 выше, чем в 1 и 5 (стр. 83, 88)');
    }
    // Внутреннее деление на младшей степени: 1,3,5 — пятёрки, 2,4 — тройки
    if (ctx.sub.length) {
      let good = 0, checked = 0;
      for (let k = 0; k < n - 1; k++) {
        const legs = subLegs(ctx, P[k].i, P[k + 1].i);
        const motive = k % 2 === 0;
        checked++;
        if (motive ? legs >= 5 : legs >= 3) good++;
      }
      if (checked) {
        const pts = Math.round((8 * good) / checked);
        if (pts > 0) add(pts, `Деление на младшей степени согласуется в ${good} из ${checked} волн`);
      }
    }
    if (diag) score -= 10;
    const evidence = Math.min(n - 1, 5);
    score = clamp(score + evidence * 2, 0, 100);
    return { ok: true, rules, notes, score, d, v, w, r2, r4, diag, flags };
  }

  // ---------------------------------------------------------------- corrections
  /**
   * A-B-C: зигзаг (5-3-5) или горизонтальная коррекция (3-3-5).
   * P: 3 точки (A завершена, идёт B) — не оцениваем; 3 точки = 0,A,B; 4 точки = 0,A,B,C.
   */
  function evalABC(P, ctx) {
    const n = P.length, F = ctx.F;
    const v = P.map((x) => F(x.p));
    const d = sgn(v[1] - v[0]);
    const A = Math.abs(v[1] - v[0]);
    const B = Math.abs(v[2] - v[1]);
    const rB = B / A;
    const rules = [], notes = [];
    let ok = true, score = 32, kind;
    const rule = (good, text, ref) => { rules.push({ ok: good, text, ref }); if (!good) ok = false; };
    const add = (pts, text) => { score += pts; notes.push({ s: pts, t: text }); };

    if (rB < 0.9) kind = 'zigzag';
    else kind = 'flat';
    rule(rB <= 1.382 + 0.05, 'Волна B не длиннее 138,2% волны A', 'стр. 146');
    if (kind === 'zigzag') {
      const c = near(rB, [0.382, 0.5, 0.618], 0.2);
      if (c.c > 0) add(6 * c.c, `Откат B = ${pct(rB)} от A (резкая коррекция, стр. 141)`);
    } else {
      notes.push({ s: 0, t: rB > 1.05 ? `B = ${pct(rB)} от A: расширенная горизонтальная (стр. 51)` : `B ≈ ${pct(rB)} от A: обычная горизонтальная (стр. 51)` });
    }
    let subtype = kind === 'flat' ? (rB > 1.05 ? 'расширенная' : 'обычная') : '';
    if (n >= 4) {
      const C = Math.abs(v[3] - v[2]);
      const beyond = d * (v[3] - v[1]); // >0: C ушла дальше конца A
      const rC = C / A;
      if (kind === 'zigzag') {
        rule(beyond > 0, 'В зигзаге C проходит дальше конца A', 'стр. 46');
        const c = near(rC, [0.618, 1, 1.618], 0.12);
        if (c.c > 0) add(10 * c.c, `C = ${fx(rC)} × A (обычно C = A, стр. 144)`);
      } else {
        if (beyond < 0 && rB > 1.05) { subtype = 'бегущая'; add(-6, 'Бегущая коррекция — редкость, не спешите с этим подсчётом (стр. 54)'); }
        const c = rB > 1.05 ? near(rC, [1.618, 2.618], 0.1) : near(rC, [1, 1.236], 0.12);
        if (c.c > 0) add(10 * c.c, `C = ${fx(rC)} × A (${rB > 1.05 ? 'в расширенной часто 1,618' : 'в обычной A ≈ B ≈ C'}, стр. 144)`);
      }
      // деление: зигзаг 5-3-5, горизонтальная 3-3-5
      if (ctx.sub.length) {
        const lA = subLegs(ctx, P[0].i, P[1].i), lC = subLegs(ctx, P[2].i, P[3].i);
        const goodA = kind === 'zigzag' ? lA >= 5 : lA >= 3 && lA < 5 || lA >= 3;
        if (lC >= 5) add(4, 'Волна C делится на пять (стр. 45–46)');
        if (goodA && kind === 'zigzag') add(3, 'Волна A зигзага делится на пять');
        if (kind === 'flat' && lA < 5) add(2, 'Волна A горизонтальной — тройка (стр. 50)');
      }
    }
    if (!ok) return { ok: false, rules, notes, score: 0 };
    score = clamp(score + (n - 1) * 2, 0, 100);
    return { ok: true, rules, notes, score, kind, subtype, d, v, A, rB };
  }

  /** Сужающийся треугольник A-B-C-D-E (стр. 54–57). P: 0,A,B,C,D[,E]. */
  function evalTriangle(P, ctx) {
    const n = P.length, F = ctx.F;
    const v = P.map((x) => F(x.p));
    const d = sgn(v[1] - v[0]);
    const s = [];
    for (let k = 1; k < n; k++) s.push(Math.abs(v[k] - v[k - 1]));
    const rules = [], notes = [];
    let ok = true, score = 30;
    const rule = (good, text, ref) => { rules.push({ ok: good, text, ref }); if (!good) ok = false; };
    const add = (pts, text) => { score += pts; notes.push({ s: pts, t: text }); };
    rule(s[2] < s[0] && s[3] < s[1], 'Стороны сужаются: C < A и D < B', 'стр. 54');
    if (n >= 6) rule(s[4] < s[2], 'Волна E короче волны C', 'стр. 54');
    rule(s[1] < s[0] * 1.6, 'Волна B не выходит далеко за начало A', 'стр. 54');
    if (!ok) return { ok: false, rules, notes, score: 0 };
    const pairs = [[2, 0, 'c/a'], [3, 1, 'd/b']];
    if (n >= 6) pairs.push([4, 2, 'e/c']);
    for (const [a, b, lbl] of pairs) {
      const r = s[a] / s[b];
      const c = near(r, [0.618], 0.15);
      if (c.c > 0) add(6 * c.c, `${lbl} = ${fx(r)} (норма 0,618, стр. 146)`);
    }
    // треугольник не должен быть слишком коротким по времени
    const dur = P[n - 1].i - P[0].i;
    if (dur > 0 && (P[1].i - P[0].i) / dur < 0.5) add(3, 'Волны треугольника сопоставимы по времени');
    notes.push({ s: 0, t: 'Треугольник бывает только перед последней волной: 4, B, последней X (стр. 56)' });
    score = clamp(score + (n - 1) * 2, 0, 100);
    return { ok: true, rules, notes, score, d, v, s };
  }

  // ---------------------------------------------------------------- scenarios
  const IMP_LABELS = ['0', '1', '2', '3', '4', '5'];
  const ABC_LABELS = ['0', 'A', 'B', 'C'];
  const TRI_LABELS = ['0', 'A', 'B', 'C', 'D', 'E'];

  function lvl(ctx, fromV, dir, size, ratio, label) {
    const val = fromV + dir * size * ratio;
    return { price: ctx.G(val), label, ratio };
  }

  function impulseScenario(P, e, ctx) {
    const n = P.length, d = e.d, v = e.v, w = e.w;
    const st = STATUS_IMP[n];
    const name = e.diag ? 'Диагональный треугольник (клин)' : 'Импульс';
    const dirTxt = d > 0 ? 'вверх' : 'вниз';
    const s = {
      family: 'impulse', kind: e.diag ? 'diag' : 'impulse', status: st, dir: d,
      title: '', points: P.map((p, k) => ({ i: p.i, p: p.p, label: IMP_LABELS[k] })),
      score: e.score, rules: e.rules, notes: e.notes, targets: [], zone: null, invalid: null, expect: '', r2: e.r2, r4: e.r4, diag: e.diag
    };
    const G = ctx.G;
    if (n === 2) {
      s.title = `${name} ${dirTxt}: идёт волна 2`;
      s.expect = 'Откат волны 2 — обычно резкий, на 50–61,8% волны 1. Затем ожидается сильная волна 3.';
      s.targets = [0.382, 0.5, 0.618, 0.786].map((r) => lvl(ctx, v[1], -d, w[0], r, `W2 ${pct(r)}`));
      s.zone = [lvl(ctx, v[1], -d, w[0], 0.5, '').price, lvl(ctx, v[1], -d, w[0], 0.618, '').price];
      s.invalid = { price: P[0].p, text: 'Уход за начало волны 1 отменяет подсчёт (правило, стр. 34)' };
    } else if (n === 3) {
      s.title = `${name} ${dirTxt}: начинается волна 3`;
      s.expect = 'Волна 3 обычно самая сильная и длинная: цели 1,618 и 2,618 длины волны 1 от конца волны 2.';
      s.targets = [1, 1.618, 2.618].map((r) => lvl(ctx, v[2], d, w[0], r, `W3 = ${r} × W1`));
      s.invalid = { price: P[0].p, text: 'Уход за начало волны 1 (правило: волна 2 не откатывает больше 100%)' };
    } else if (n === 4) {
      s.title = `${name} ${dirTxt}: идёт волна 4`;
      const sideways = e.r2 >= 0.5;
      s.expect = 'Волна 4 обычно откатывает 23,6–38,2% волны 3 и не заходит на территорию волны 1. ' +
        (sideways ? 'Волна 2 была глубокой, поэтому волна 4 скорее будет боковой и мелкой (чередование).' : 'Волна 2 была мелкой, поэтому волна 4 может быть резкой (чередование).');
      s.targets = [0.236, 0.382, 0.5].map((r) => lvl(ctx, v[3], -d, w[2], r, `W4 ${pct(r)}`));
      s.zone = [lvl(ctx, v[3], -d, w[2], 0.236, '').price, lvl(ctx, v[3], -d, w[2], 0.382, '').price];
      s.invalid = { price: P[1].p, text: 'Заход на территорию волны 1 отменяет импульс (возможен только клин)' };
      // временный канал: линия 1–3 и параллель через 2 (стр. 78)
      const sl = (v[3] - v[1]) / (P[3].i - P[1].i || 1);
      s.channel = { a: { i: P[1].i, v: v[1] }, b: { i: P[3].i, v: v[3] }, c: { i: P[2].i, v: v[2] }, slope: sl };
    } else if (n === 5) {
      s.title = `${name} ${dirTxt}: идёт волна 5`;
      const ext3 = w[2] / w[0] > 1.618 * 0.95;
      const total03 = Math.abs(v[3] - v[0]);
      const t = [];
      t.push(lvl(ctx, v[4], d, w[0], 1, 'W5 = W1'));
      t.push(lvl(ctx, v[4], d, w[0], 0.618, 'W5 = 0,618 × W1'));
      t.push(lvl(ctx, v[4], d, total03, 0.618, 'W5 = 0,618 × (0→3)'));
      if (!ext3) t.push(lvl(ctx, v[4], d, total03, 1.618, 'Растянутая W5 = 1,618 × (0→3)'));
      t.sort((a, b) => d * (a.price - b.price));
      s.targets = t;
      s.expect = ext3
        ? 'Волна 3 растянута, поэтому волна 5 скорее всего близка к волне 1 по длине (стр. 36). Если 5 не обновит вершину 3 — это усечение и сигнал разворота.'
        : 'Волна 3 не растянута — возможна растянутая волна 5. Следите за объёмом: в пятой он обычно ниже, чем в третьей.';
      s.invalid = { price: e.diag ? P[3].p : P[1].p, text: e.diag ? 'Выход за начало волны 4 клина' : 'Заход на территорию волны 1 отменяет подсчёт' };
      const sl = (v[4] - v[2]) / (P[4].i - P[2].i || 1);
      s.channel = { a: { i: P[2].i, v: v[2] }, b: { i: P[4].i, v: v[4] }, c: { i: P[3].i, v: v[3] }, slope: sl };
    } else {
      s.title = `${name} ${dirTxt} завершён: ожидается коррекция`;
      const tot = Math.abs(v[5] - v[0]);
      s.targets = [0.382, 0.5, 0.618].map((r) => lvl(ctx, v[5], -d, tot, r, `Откат ${pct(r)} всего импульса`));
      s.targets.unshift({ price: P[4].p, label: 'Район волны 4 (стр. 72–73)', ratio: null });
      s.expect = e.diag
        ? 'После конечного клина обычно следует резкий разворот, по меньшей мере к началу клина (стр. 43).'
        : 'После пяти волн идёт коррекция из трёх волн. Обычно она доходит до района четвёртой волны меньшей степени (стр. 73).';
      if (e.flags.truncated) s.expect += ' Пятая волна усечена — разворот может быть резким.';
      s.invalid = { price: P[5].p, text: 'Новый экстремум за концом волны 5 — пятая растягивается или подсчёт неверен' };
    }
    return s;
  }

  function abcScenario(P, e, ctx) {
    const n = P.length, d = e.d, v = e.v;
    const kindName = e.kind === 'zigzag' ? 'Зигзаг A-B-C' : `Горизонтальная коррекция A-B-C${e.subtype ? ' (' + e.subtype + ')' : ''}`;
    const s = {
      family: 'abc', kind: e.kind, status: n === 3 ? 'c' : 'done', dir: d,
      points: P.map((p, k) => ({ i: p.i, p: p.p, label: ABC_LABELS[k] })),
      score: e.score, rules: e.rules, notes: e.notes, targets: [], zone: null, invalid: null, title: '', expect: ''
    };
    const dirTxt = d > 0 ? 'вверх' : 'вниз';
    if (n === 3) {
      s.title = `${kindName} ${dirTxt}: идёт волна C`;
      s.targets = (e.kind === 'zigzag' ? [0.618, 1, 1.618] : e.rB > 1.05 ? [1, 1.618, 2.618] : [1, 1.236])
        .map((r) => lvl(ctx, v[2], d, e.A, r, `C = ${r} × A`));
      s.expect = e.kind === 'zigzag'
        ? 'В зигзаге волна C чаще всего равна волне A, реже 0,618 или 1,618 от неё (стр. 144).'
        : 'В горизонтальной коррекции C обычно заканчивается чуть дальше конца A; в расширенной — около 1,618 × A (стр. 144).';
      s.invalid = { price: e.kind === 'zigzag' ? P[0].p : null, text: 'Выход за начало A превращает зигзаг в горизонтальную коррекцию или в импульс' };
      if (!s.invalid.price) s.invalid = null;
    } else {
      s.title = `${kindName} ${dirTxt} ${e.kind === 'zigzag' ? 'завершён' : 'завершена'}: ожидается возобновление тренда ${d > 0 ? 'вниз' : 'вверх'}`;
      const tot = Math.abs(v[3] - v[0]);
      const t = [0.618, 1].map((r) => lvl(ctx, v[3], -d, tot, r, r === 1 ? 'Возврат к началу коррекции' : `Возврат ${pct(r)} коррекции`));
      if (e.kind === 'flat') t.push({ price: P[2].p, label: 'Уровень конца B', ratio: null });
      s.targets = t;
      s.expect = 'Коррекция из трёх волн закончена — возобновляется более крупный тренд. Если вместо пятёрки пойдёт тройка, коррекция усложняется (двойная тройка).';
      s.invalid = { price: P[3].p, text: 'Новый экстремум за концом C — коррекция продолжается' };
    }
    return s;
  }

  function triScenario(P, e, ctx) {
    const n = P.length, d = e.d, v = e.v;
    const trend = -d; // треугольник идёт против тренда старшей степени
    const s = {
      family: 'triangle', kind: 'triangle', status: n === 5 ? 'e' : 'done', dir: d,
      points: P.map((p, k) => ({ i: p.i, p: p.p, label: TRI_LABELS[k] })),
      score: e.score, rules: e.rules, notes: e.notes, targets: [], zone: null, invalid: null, title: '', expect: ''
    };
    if (n === 5) {
      s.title = 'Треугольник: формируется волна E';
      s.targets = [lvl(ctx, v[4], -sgn(v[4] - v[3]), e.s[2], 0.618, 'E = 0,618 × C')];
      s.expect = 'Волна E часто не доходит до линии A–C или ложно прокалывает её (стр. 54, 93). После E — рывок по тренду.';
      s.invalid = { price: P[3].p, text: 'Выход за конец C ломает сужение' };
    } else {
      const widest = e.s[1];
      s.title = `Треугольник завершён: ожидается рывок ${trend > 0 ? 'вверх' : 'вниз'}`;
      s.targets = [lvl(ctx, v[5], trend, widest, 1, 'Рывок ≈ ширина треугольника (стр. 57)')];
      s.expect = 'Рывок после треугольника обычно короткий и быстрый, примерно на ширину треугольника (стр. 57).';
      s.invalid = { price: P[5].p, text: 'Обновление конца E — треугольник не завершён' };
    }
    return s;
  }

  /** Все сценарии, которые заканчиваются последним подтверждённым пивотом. */
  function scenarios(pivots, ctx) {
    const out = [];
    const n = pivots.length;
    const take = (k) => pivots.slice(n - k);
    for (const k of [2, 3, 4, 5, 6]) {
      if (n < k) continue;
      const P = take(k);
      const e = evalImpulse(P, ctx);
      if (e.ok) out.push(impulseScenario(P, e, ctx));
    }
    for (const k of [3, 4]) {
      if (n < k) continue;
      const P = take(k);
      const e = evalABC(P, ctx);
      if (e.ok) out.push(abcScenario(P, e, ctx));
    }
    for (const k of [5, 6]) {
      if (n < k) continue;
      const P = take(k);
      const e = evalTriangle(P, ctx);
      if (e.ok) out.push(triScenario(P, e, ctx));
    }
    out.sort((a, b) => b.score - a.score || b.points.length - a.points.length);
    return out;
  }

  // ---------------------------------------------------------------- trade plans
  function tradePlan(s, entry, cfg) {
    const set = cfg.setups;
    const buf = cfg.stopBufPct / 100;
    const P = s.points;
    let setup = null, side = 0, stop = null, target = null;
    if (s.family === 'impulse' && !s.diag && s.status === 'w3' && set.w3) {
      if (s.r2 < cfg.w2min || s.r2 > cfg.w2max) return null;
      setup = 'w3'; side = s.dir; stop = P[0].p; target = s.targets[1].price;
    } else if (s.family === 'impulse' && !s.diag && s.status === 'w5' && set.w5) {
      if (s.r4 > 0.5) return null;
      setup = 'w5'; side = s.dir; stop = P[4].p;
      target = null;
      for (const t of s.targets) {
        const rr = side * (t.price - entry) / Math.abs(entry - stop);
        if (rr >= cfg.minRR) { target = t.price; break; }
      }
      if (target == null) return null;
    } else if (s.family === 'abc' && s.status === 'done' && set.abc) {
      setup = 'abc'; side = -s.dir; stop = P[3].p; target = s.targets[0].price;
    } else if (s.family === 'triangle' && s.status === 'done' && set.tri) {
      setup = 'tri'; side = -s.dir; stop = P[5].p; target = s.targets[0].price;
    } else if (s.family === 'impulse' && s.status === 'done' && set.counter) {
      setup = 'counter'; side = -s.dir; stop = P[5].p; target = s.targets[0].price;
    }
    if (!setup) return null;
    stop = side > 0 ? stop * (1 - buf) : stop * (1 + buf);
    const risk = side * (entry - stop);
    const reward = side * (target - entry);
    if (risk <= 0 || reward <= 0) return null;
    const rr = reward / risk;
    if (rr < cfg.minRR) return null;
    return { setup, name: SETUP_NAMES[setup], side, entry, stop, target, rr, score: s.score, scenario: s.title };
  }

  function bestPlan(list, entry, cfg) {
    for (const s of list) {
      if (s.score < cfg.minScore) continue;
      const p = tradePlan(s, entry, cfg);
      if (p) return p;
    }
    return null;
  }

  // ---------------------------------------------------------------- analyze
  function analyze(bars, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    cfg.setups = Object.assign({}, DEFAULTS.setups, (opts && opts.setups) || {});
    const thr = cfg.swingPct / 100;
    const main = zigzag(bars, thr);
    const sub = zigzag(bars, thr * cfg.subRatio);
    const ctx = makeCtx(cfg, bars, sub.pivots);
    const list = scenarios(main.pivots, ctx);
    const last = bars[bars.length - 1];
    const lastPivot = main.pivots[main.pivots.length - 1];
    let plan = null;
    if (lastPivot) {
      const confBar = bars[lastPivot.c];
      plan = bestPlan(list, confBar.c, cfg);
      if (plan) {
        plan.signalBar = lastPivot.c;
        plan.age = bars.length - 1 - lastPivot.c;
        const movedPast = plan.side * (last.c - plan.target) >= 0 || plan.side * (last.c - plan.stop) <= 0;
        plan.state = movedPast ? 'expired' : plan.age === 0 ? 'new' : 'active';
        plan.rrNow = plan.side * (plan.target - last.c) / Math.abs(last.c - plan.stop);
      }
    }
    const evs = sortEvents(cfg.events);
    const lastT = last.t;
    const upcoming = evs.filter((e) => e.t > lastT).slice(0, 5);
    if (plan && cfg.eventFilter) {
      const ev = eventAhead(evs, lastT, cfg.eventDays);
      if (ev) plan.eventBlock = ev;
    }
    return { cfg, pivots: main.pivots, pending: main.pending, subPivots: sub.pivots, scenarios: list, plan, upcoming };
  }

  // ---------------------------------------------------------------- events
  /** Ближайшее событие в интервале (t, t + days]; события отсортированы по времени. */
  function eventAhead(evs, t, days) {
    let lo = 0, hi = evs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (evs[m].t <= t) lo = m + 1; else hi = m; }
    const e = evs[lo];
    return e && e.t <= t + days * 86400000 ? e : null;
  }
  const sortEvents = (list) => (list || []).filter((e) => e && isFinite(e.t)).slice().sort((a, b) => a.t - b.t);

  // ---------------------------------------------------------------- backtest
  function backtest(bars, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    cfg.setups = Object.assign({}, DEFAULTS.setups, (opts && opts.setups) || {});
    const thr = cfg.swingPct / 100;
    const zz = new Zigzag(thr), zs = new Zigzag(thr * cfg.subRatio);
    const ctx = makeCtx(cfg, bars, zs.pivots);
    const fee = cfg.feePct / 100, slip = cfg.slipPct / 100;
    const trades = [];
    const eq = new Array(bars.length).fill(1);
    let equity = 1, pos = null, pendingSig = null, closedByEvent = 0;
    const evs = sortEvents(cfg.events), blocked = [];

    const close = (i, px, reason) => {
      const gross = pos.side * (px - pos.entry) / pos.entry;
      const net = gross - 2 * fee - 2 * slip;
      const ret = pos.frac * net;
      equity *= 1 + ret;
      trades.push(Object.assign({}, pos, { iExit: i, exit: px, reason, R: pos.side * (px - pos.entry) / Math.abs(pos.entry - pos.stop), ret, bars: i - pos.iEntry }));
      pos = null;
    };

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      // 1) вход по сигналу прошлого бара — по цене открытия
      if (pendingSig && !pos) {
        const s = pendingSig; pendingSig = null;
        const e = b.o;
        const ok = s.side * (e - s.stop) > 0 && s.side * (s.target - e) > 0;
        if (ok) {
          const stopPct = Math.abs(e - s.stop) / e;
          const frac = Math.min(cfg.riskPct / 100 / stopPct, cfg.maxLev);
          pos = Object.assign({}, s, { iEntry: i, entry: e, frac, rrReal: s.side * (s.target - e) / Math.abs(e - s.stop) });
        }
      }
      // 2) сопровождение позиции: стоп проверяется первым (консервативно)
      if (pos) {
        if (pos.side > 0) {
          if (b.l <= pos.stop) close(i, Math.min(b.o, pos.stop), 'стоп');
          else if (b.h >= pos.target) close(i, Math.max(b.o, pos.target), 'цель');
        } else {
          if (b.h >= pos.stop) close(i, Math.max(b.o, pos.stop), 'стоп');
          else if (b.l <= pos.target) close(i, Math.min(b.o, pos.target), 'цель');
        }
        if (pos && i - pos.iEntry >= cfg.maxHold) close(i, b.c, 'время');
        // закрытие накануне события (по цене закрытия текущего бара)
        if (pos && cfg.eventClose && evs.length) { const ev = eventAhead(evs, b.t, 1); if (ev) { close(i, b.c, 'перед событием'); closedByEvent++; } }
      }
      // 3) новые пивоты — только по данным до бара i включительно
      zs.push(b, i);
      const piv = zz.push(b, i);
      if (piv && !pos && !pendingSig && i < bars.length - 1) {
        const list = scenarios(zz.pivots, ctx);
        const plan = bestPlan(list, b.c, cfg);
        if (plan) {
          const ev = cfg.eventFilter && evs.length ? eventAhead(evs, b.t, cfg.eventDays) : null;
          if (ev) blocked.push({ i, setup: plan.setup, event: ev });
          else pendingSig = Object.assign(plan, { iSignal: i });
        }
      }
      eq[i] = pos ? equity * (1 + pos.frac * (pos.side * (b.c - pos.entry) / pos.entry)) : equity;
    }
    if (pos) close(bars.length - 1, bars[bars.length - 1].c, 'конец данных');
    eq[bars.length - 1] = equity;
    const st = stats(trades, eq, bars);
    st.blocked = blocked.length; st.closedByEvent = closedByEvent;
    return { trades, equity: eq, stats: st, blocked, cfg };
  }

  function stats(trades, eq, bars) {
    const n = trades.length;
    const wins = trades.filter((t) => t.ret > 0);
    const losses = trades.filter((t) => t.ret <= 0);
    const gp = wins.reduce((s, t) => s + t.ret, 0);
    const gl = -losses.reduce((s, t) => s + t.ret, 0);
    let peak = -Infinity, mdd = 0;
    for (const e of eq) { peak = Math.max(peak, e); mdd = Math.max(mdd, 1 - e / peak); }
    let streak = 0, worst = 0;
    for (const t of trades) { streak = t.ret <= 0 ? streak + 1 : 0; worst = Math.max(worst, streak); }
    const avgR = n ? trades.reduce((s, t) => s + t.R, 0) / n : 0;
    const bySetup = {};
    for (const t of trades) {
      const b = bySetup[t.setup] || (bySetup[t.setup] = { n: 0, wins: 0, R: 0, ret: 1 });
      b.n++; if (t.ret > 0) b.wins++; b.R += t.R; b.ret *= 1 + t.ret;
    }
    return {
      trades: n,
      winRate: n ? wins.length / n : 0,
      avgR,
      profitFactor: gl > 0 ? gp / gl : wins.length ? Infinity : 0,
      totalReturn: eq[eq.length - 1] - 1,
      maxDD: mdd,
      worstStreak: worst,
      buyHold: bars.length ? bars[bars.length - 1].c / bars[0].c - 1 : 0,
      bySetup
    };
  }

  function sweep(bars, opts, swings) {
    return swings.map((s) => {
      const r = backtest(bars, Object.assign({}, opts, { swingPct: s }));
      return Object.assign({ swingPct: s }, r.stats);
    });
  }

  // ---------------------------------------------------------------- data
  function parseDate(s, s2) {
    s = String(s).trim().replace(/^"|"$/g, '');
    if (s2) s = s + ' ' + String(s2).trim();
    if (/^\d{9,13}$/.test(s)) { const n = +s; return n > 1e11 ? n : n * 1000; }
    let m;
    if ((m = s.match(/^(\d{4})[.\-\/]?(\d{2})[.\-\/]?(\d{2})(?:[ T]?(\d{1,2}):?(\d{2})(?::?(\d{2}))?)?/)))
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      let y = +m[3]; if (y < 100) y += 2000;
      return Date.UTC(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  }

  /**
   * Понимает выгрузки Финама/MOEX (<DATE>;<TIME>;<OPEN>…), MetaTrader, TradingView, Yahoo
   * и простые CSV «дата,open,high,low,close[,volume]». Разделители: , ; таб.
   */
  function parseCSV(text) {
    const raw = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
    if (!raw.some(Boolean)) throw new Error('Файл пустой');
    const sample = raw.filter(Boolean).slice(0, 60).join('\n');
    const delim = [';', '\t', ','].map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    // Пропускаем преамбулу (у Мосбиржи ISS это имя блока «candles») и берём первый блок таблицы
    const s0 = raw.findIndex((l) => l.split(delim).length >= 5);
    if (s0 < 0) throw new Error('Не найдено строк с котировками: нужны столбцы даты, open, high, low, close');
    const lines = [];
    for (let k = s0; k < raw.length; k++) {
      const l = raw[k];
      if (!l) { if (lines.length > 1) break; continue; }
      if (l.split(delim).length < 5) break;
      lines.push(l);
    }
    const first = lines[0];
    const split = (l) => l.split(delim).map((x) => x.trim().replace(/^"|"$/g, ''));
    let header = split(first).map((h) => h.toLowerCase().replace(/[<>]/g, ''));
    const hasHeader = header.some((h) => /[a-zа-я]/.test(h) && !/^\d/.test(h));
    let idx = {};
    const find = (...names) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    if (hasHeader) {
      idx.date = find('date', 'datetime', 'time', 'timestamp', 'дата', 'begin', 'open time', 'opentime');
      idx.time = header.findIndex((h, k) => k !== idx.date && (h === 'time' || h === 'время'));
      idx.o = find('open', 'откр'); idx.h = find('high', 'макс'); idx.l = find('low', 'мин');
      idx.c = header.findIndex((h) => h === 'close' || h === 'закр' || h.startsWith('close') && !h.includes('adj') || h.startsWith('закр'));
      if (idx.c < 0) idx.c = find('adj close', 'price', 'цена', 'last');
      idx.v = find('vol', 'объем', 'объём', 'volume');
      if (idx.o === idx.date) idx.o = header.findIndex((h, k) => k !== idx.date && h.startsWith('open'));
    } else {
      const f0 = split(first);
      const k = f0.length;
      const isDate = (s) => /^\d{4}[-.\/]\d{2}[-.\/]\d{2}/.test(s) || /^\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}/.test(s);
      // 8 цифр подряд считаем датой ГГГГММДД только если это правдоподобная дата (иначе это объём)
      const isYmd = (s) => /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s);
      let di = f0.findIndex(isDate);
      if (di < 0) di = f0.findIndex(isYmd);
      if (di >= 4) {
        // Мосбиржа ISS без заголовка: open;close;high;low;value;volume;begin;end
        idx = { date: di, time: -1, o: 0, c: 1, h: 2, l: 3, v: k >= 6 ? 5 : -1 };
      } else if (k >= 7) idx = { date: 0, time: 1, o: 2, h: 3, l: 4, c: 5, v: 6 };
      else if (k === 6) idx = { date: 0, time: -1, o: 1, h: 2, l: 3, c: 4, v: 5 };
      else if (k === 5) idx = { date: 0, time: -1, o: 1, h: 2, l: 3, c: 4, v: -1 };
      else throw new Error('Не удалось распознать столбцы: нужны дата, open, high, low, close');
      // время может быть во втором столбце при 7+ колонках
      if (di < 4 && k >= 7 && !/^\d{1,2}:\d{2}/.test(split(first)[1])) idx = { date: 0, time: -1, o: 1, h: 2, l: 3, c: 4, v: 5 };
    }
    if ([idx.o, idx.h, idx.l, idx.c].some((x) => x == null || x < 0)) throw new Error('Не найдены столбцы open/high/low/close');
    const num = (x) => parseFloat(String(x).replace(/\s/g, '').replace(',', '.'));
    const bars = [];
    for (let r = hasHeader ? 1 : 0; r < lines.length; r++) {
      const c = split(lines[r]);
      const o = num(c[idx.o]), h = num(c[idx.h]), l = num(c[idx.l]), cl = num(c[idx.c]);
      if (![o, h, l, cl].every(isFinite) || cl <= 0) continue;
      const t = idx.date >= 0 ? parseDate(c[idx.date], idx.time >= 0 ? c[idx.time] : null) : r;
      bars.push({ t: t == null ? r : t, o, h: Math.max(h, o, cl), l: Math.min(l, o, cl), c: cl, v: idx.v >= 0 ? num(c[idx.v]) || 0 : 0 });
    }
    if (bars.length > 2 && bars[0].t > bars[bars.length - 1].t) bars.reverse();
    // Защита от перепутанных столбцов: у настоящих свечей размах бара мал относительно цены
    if (bars.length >= 5) {
      const r = bars.map((b) => (b.h - b.l) / b.c).sort((a, b) => a - b);
      if (r[r.length >> 1] > 0.5) throw new Error('столбцы цен распознаны неверно: размах свечей больше 50% цены. Нужен порядок дата, open, high, low, close или файл с заголовками');
    }
    return bars;
  }

  /** Склеивает несколько выгрузок (например, страницы по 500 свечей с Мосбиржи), убирает повторы. */
  function mergeBars(lists) {
    const map = new Map();
    for (const l of lists) for (const b of l) map.set(b.t, b);
    const out = Array.from(map.values()).sort((a, b) => a.t - b.t);
    if (out.length < 30) throw new Error(`Слишком мало свечей (${out.length}), нужно хотя бы 30. Если файл с Мосбиржи пустой — проверьте тикер и дату начала`);
    return out;
  }

  /**
   * Проверка набора файлов перед склейкой: одна ли это бумага, нет ли пропусков.
   * Возвращает { errors: [], warnings: [] }. names — имена файлов для сообщений.
   */
  function checkFiles(lists, names) {
    const res = { errors: [], warnings: [] };
    const items = lists.map((l, k) => ({ l, name: (names && names[k]) || `файл ${k + 1}` })).filter((x) => x.l.length).sort((a, b) => a.l[0].t - b.l[0].t);
    const all = [].concat(...items.map((x) => x.l)).map((b) => b.t).sort((a, b) => a - b);
    const gaps = []; for (let i = 1; i < all.length; i++) if (all[i] > all[i - 1]) gaps.push(all[i] - all[i - 1]);
    gaps.sort((a, b) => a - b);
    const step = gaps.length ? gaps[gaps.length >> 1] : 86400000;
    const fp = (x) => x.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
    const day = (t) => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('.');
    for (let k = 1; k < items.length; k++) {
      const A = items[k - 1], B = items[k];
      const mapA = new Map(A.l.map((b) => [b.t, b.c]));
      let same = 0, diff = 0;
      for (const b of B.l) if (mapA.has(b.t)) { const c = mapA.get(b.t); if (Math.abs(c - b.c) / c > 0.005) diff++; else same++; }
      if (diff > 0 && diff >= same) {
        res.errors.push(`«${A.name}» и «${B.name}» пересекаются по датам, но цены в них разные. Похоже, это разные бумаги. Загрузите файлы одного тикера.`);
        continue;
      }
      if (same + diff > 0) continue;
      const a = A.l[A.l.length - 1], b = B.l[0];
      const jump = b.o / a.c - 1;
      if (Math.abs(jump) > 0.2) res.warnings.push(`Между «${A.name}» и «${B.name}» цена прыгает с ${fp(a.c)} до ${fp(b.o)} (${(jump * 100).toFixed(0)}%). Проверьте, что это одна и та же бумага.`);
      if (b.t - a.t > Math.max(step * 15, 6 * 86400000)) res.warnings.push(`Нет свечей с ${day(a.t)} по ${day(b.t)}. Возможно, не скачана одна из частей.`);
    }
    return res;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /**
   * Учебные данные. mode='waves' — ряд, собранный из волн Эллиотта с шумом;
   * mode='random' — случайное блуждание без структуры (контрольная проверка).
   */
  function synth(o) {
    o = Object.assign({ n: 1500, seed: 11, mode: 'waves', start: 100, noise: 0.006 }, o || {});
    const r = rng(o.seed);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const jit = (x, k) => x * (1 + (r() - 0.5) * 2 * k);
    const logp = [];
    if (o.mode === 'random') {
      let x = Math.log(o.start);
      for (let i = 0; i < o.n + 1; i++) { logp.push(x); x += gauss(r) * 0.014; }
    } else {
      // набор опорных точек: импульс 5 волн + коррекция 3 волны, направление чаще вверх
      const piv = [Math.log(o.start)];
      const dur = [];
      let x = piv[0];
      const leg = (size, dir) => { x += dir * size; piv.push(x); dur.push(Math.max(4, Math.round(size / 0.009 * jit(1, 0.35)))); };
      while (dur.reduce((s, d) => s + d, 0) < o.n) {
        const dir = r() < 0.72 ? 1 : -1;
        const w1 = jit(0.11, 0.35);
        const r2 = pick([0.5, 0.618, 0.55, 0.65]) * jit(1, 0.12);
        const ext = pick([1.618, 1.618, 2.0, 2.618]);
        const w3 = w1 * ext * jit(1, 0.08);
        const r4 = (r2 > 0.55 ? pick([0.236, 0.3, 0.382]) : pick([0.382, 0.5])) * jit(1, 0.12);
        const w5 = w1 * pick([1, 0.618, 1, 0.8]) * jit(1, 0.1);
        leg(w1, dir); leg(w1 * r2, -dir); leg(w3, dir); leg(w3 * r4, -dir); leg(w5, dir);
        const tot = w1 - w1 * r2 + w3 - w3 * r4 + w5;
        const A = tot * pick([0.3, 0.382, 0.25]) * jit(1, 0.15);
        const B = A * pick([0.5, 0.618, 0.786, 0.95]);
        const C = A * pick([1, 1, 1.618, 0.618]) * jit(1, 0.08);
        leg(A, -dir); leg(B, dir); leg(C, -dir);
      }
      let k = 0;
      for (let s = 0; s < dur.length && logp.length < o.n + 1; s++) {
        const a = piv[s], b = piv[s + 1], K = dur[s];
        // броуновский мост между опорными точками
        const W = [0];
        for (let j = 1; j <= K; j++) W.push(W[j - 1] + gauss(r) * o.noise);
        for (let j = 0; j < K && logp.length < o.n + 1; j++) logp.push(a + (b - a) * j / K + (W[j] - (j / K) * W[K]));
        k += K;
      }
    }
    const bars = [];
    let t = Date.UTC(2021, 0, 4);
    for (let i = 1; i < logp.length; i++) {
      const o2 = Math.exp(logp[i - 1]), c = Math.exp(logp[i]);
      const wig = Math.abs(gauss(r)) * 0.004;
      const h = Math.max(o2, c) * (1 + wig * r()), l = Math.min(o2, c) * (1 - wig * r());
      const v = Math.round(1e5 * Math.exp(gauss(r) * 0.3) * (1 + Math.abs(logp[i] - logp[i - 1]) * 40));
      bars.push({ t, o: o2, h, l, c, v });
      t += 86400000;
      const wd = new Date(t).getUTCDay();
      if (wd === 6) t += 2 * 86400000; else if (wd === 0) t += 86400000;
    }
    return bars;
  }

  const EW = { DEFAULTS, SETUP_NAMES, Zigzag, zigzag, evalImpulse, evalABC, evalTriangle, scenarios, analyze, backtest, sweep, parseCSV, mergeBars, checkFiles, synth, tradePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = EW;
  else root.EW = EW;
})(typeof window !== 'undefined' ? window : globalThis);
