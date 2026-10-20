// 4ч из часовиков Мосбиржи (data/moex1h, см. moex_dl.js): корзины по 4 часа UTC, как у Т-Инвестиций (0, 4, 8 … 20 ч).
// Заменяет scan_*_4h.json в D.files (для индекса рынка) и возвращает ряды в виде store.js, с поправкой на дивиденды.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const H4 = 4 * 3600e3;
function to4h(rows, ms = H4) {
  const out = [];
  for (const [t, o, h, l, c, v] of rows) {
    const k = Math.floor(t / ms) * ms, b = out[out.length - 1];
    if (b && b[0] === k) { b[2] = Math.max(b[2], h); b[3] = Math.min(b[3], l); b[4] = c; b[5] += v; }
    else out.push([k, o, h, l, c, v, 1]);
  }
  return out;
}
// o: { dir: 'moex10m', ms: 30 * 60e3, tf: '30m' } — другие таймфреймы (внутри дня)
function series(S, o = {}) {
  const dir = path.join(__dirname, 'data', o.dir || 'moex1h'), ms = o.ms || H4, tf = o.tf || '4h';
  const out = [];
  for (const name of Object.keys(S.doc.series).filter((n) => n.endsWith('_4h.json'))) {
    const id = name.replace('scan_', '').replace('_4h.json', ''), f = path.join(dir, id.replace('_TQBR', '') + '.json.gz');
    if (!fs.existsSync(f)) continue;
    const r = to4h(JSON.parse(zlib.gunzipSync(fs.readFileSync(f))), ms); if (r.length < 300) continue;
    S.D.files.set(name.replace('_4h.json', '_' + tf + '.json'), { r });
    let bars = r.map((a) => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5], done: true }));
    if (S.doc.cfg.divAdj !== false && S.doc.divs[id]) bars = S.D.adjustDividends(bars, S.doc.divs[id].list).bars;
    // движок (trimGaps) на 4ч отбрасывает всё до разрыва >10 дней (биржа закрыта 28.02–24.03.2022) — режем на куски сами
    for (let k = 1, s = 0; k <= bars.length; k++) if (k === bars.length || bars[k].t - bars[k - 1].t > 10 * 86400000) { if (k - s >= 300) out.push({ id, tf, bars: bars.slice(s, k), P: ms }); s = k; }
  }
  return out;
}
module.exports = { series, to4h };
// самопроверка: две часовые свечи в одной корзине склеиваются, третья — новая корзина
if (require.main === module) {
  const a = to4h([[0, 1, 2, 0.5, 1.5, 10], [3600e3, 1.5, 3, 1, 2, 5], [H4, 2, 2, 2, 2, 1]]);
  require('assert').deepStrictEqual(a, [[0, 1, 3, 0.5, 2, 15, 1], [H4, 2, 2, 2, 2, 1, 1]]); console.log('ok');
}
