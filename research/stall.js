// «Подтянуть стоп у стоящей сделки» (30.10.2026, Кеннеди «сначала уменьшить риск»): если за N свечей после входа закрытие ни разу
// не поднялось выше входа + g×R, стоп переносится на вход − k×R (если это выше прежнего стопа). Переделка готовой сделки по свечам:
// дальше, до выхода системы, минимум ≤ нового стопа — выход по новому стопу (открытие ниже — по открытию).
module.exports = function stall(list, N, g, k, fee) {
  let ch = 0;
  const out = list.map((x) => {
    const b = x.b, e = x.t.entry, R = Math.abs(e - x.t.stop0), ns = e - k * R;
    if (x.t.side < 0 || !(ns > x.t.stop0) || x.iE + N >= x.iX) return x;
    for (let j = x.iE; j < x.iE + N; j++) if (b[j].c > e + g * R) return x;
    for (let j = x.iE + N; j <= x.iX; j++) if (b[j].l <= ns) {
      const px = Math.min(ns, b[j].o); if (px >= x.t.exitP && j === x.iX) return x; ch++;
      return Object.assign({}, x, { TOut: b[j].t + (x.dt || 0), nr: ((px - e) - e * fee) / R, exitP: px, t: Object.assign({}, x.t, { exitP: px }) });
    }
    return x;
  });
  out.changed = ch; return out;
};
