// Свечные фигуры (30.10.2026, вопрос Егора): поиск бычьих/медвежьих фигур на свече j массива bars ({o,h,l,c}).
// Бычьи: поглощение, молот, утренняя звезда, доджи, пронизывающая; медвежьи (для выхода): поглощение, падающая звезда, вечерняя звезда.
// «После снижения» — минимум фигуры ниже минимума за 5 свечей до неё (фигура разворота, а не посреди роста).
const body = (b) => Math.abs(b.c - b.o), rng = (b) => b.h - b.l;
const avgBody = (bars, j, n = 10) => { let s = 0, k = 0; for (let q = Math.max(0, j - n); q < j; q++) { s += body(bars[q]); k++; } return k ? s / k : 0; };
const lowAfterFall = (bars, j, w) => { const lo = Math.min(...bars.slice(j - w + 1, j + 1).map((b) => b.l)); for (let q = Math.max(0, j - w - 4); q <= j - w; q++) if (bars[q].l < lo) return false; return true; };
const highAfterRise = (bars, j, w) => { const hi = Math.max(...bars.slice(j - w + 1, j + 1).map((b) => b.h)); for (let q = Math.max(0, j - w - 4); q <= j - w; q++) if (bars[q].h > hi) return false; return true; };
const BULL = {
  engulf: (B, j) => { const p = B[j - 1], b = B[j]; return p.c < p.o && b.c > b.o && b.c >= p.o && b.o <= p.c && body(b) > body(p) ? 2 : 0; },
  hammer: (B, j) => { const b = B[j], r = rng(b), bd = body(b), lo = Math.min(b.o, b.c) - b.l, up = b.h - Math.max(b.o, b.c); return r > 0 && lo >= 2 * bd && up <= 0.25 * r && bd > 0.05 * r ? 1 : 0; },
  mstar: (B, j) => { const a = B[j - 2], m = B[j - 1], b = B[j], ab = avgBody(B, j - 2); return a.c < a.o && body(a) >= ab && body(m) <= 0.4 * body(a) && Math.max(m.o, m.c) <= a.c + 0.1 * body(a) && b.c > b.o && b.c >= (a.o + a.c) / 2 ? 3 : 0; },
  doji: (B, j) => { const b = B[j], r = rng(b); return r > 0 && body(b) <= 0.1 * r ? 1 : 0; },
  pierce: (B, j) => { const p = B[j - 1], b = B[j]; return p.c < p.o && body(p) >= avgBody(B, j - 1) && b.c > b.o && b.o <= p.c && b.c > (p.o + p.c) / 2 && b.c < p.o ? 2 : 0; },
};
const BEAR = {
  engulf: (B, j) => { const p = B[j - 1], b = B[j]; return p.c > p.o && b.c < b.o && b.c <= p.o && b.o >= p.c && body(b) > body(p) ? 2 : 0; },
  star: (B, j) => { const b = B[j], r = rng(b), bd = body(b), up = b.h - Math.max(b.o, b.c), lo = Math.min(b.o, b.c) - b.l; return r > 0 && up >= 2 * bd && lo <= 0.25 * r && bd > 0.05 * r ? 1 : 0; },
  estar: (B, j) => { const a = B[j - 2], m = B[j - 1], b = B[j], ab = avgBody(B, j - 2); return a.c > a.o && body(a) >= ab && body(m) <= 0.4 * body(a) && Math.min(m.o, m.c) >= a.c - 0.1 * body(a) && b.c < b.o && b.c <= (a.o + a.c) / 2 ? 3 : 0; },
};
// бычья фигура kind ('any' — любая из BULL) заканчивается на свече j; ctx — требовать «после снижения». Возвращает число свечей фигуры или 0.
function bull(B, j, kind, ctx = true) {
  if (j < 8) return 0;
  for (const k of kind === 'any' ? Object.keys(BULL) : [kind]) { const w = BULL[k](B, j); if (w && (!ctx || lowAfterFall(B, j, w))) return w; }
  return 0;
}
function bear(B, j, kind, ctx = true) {
  if (j < 8) return 0;
  for (const k of kind === 'any' ? Object.keys(BEAR) : [kind]) { const w = BEAR[k](B, j); if (w && (!ctx || highAfterRise(B, j, w))) return w; }
  return 0;
}
module.exports = { bull, bear, BULL, BEAR };
