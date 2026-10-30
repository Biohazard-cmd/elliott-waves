// Варианты правил против просадки (30.10.2026) — общий список для figures.js FIG=dd и candles_d.js DD=1
const secOf = require('./sectors.js');
const L = [['как сейчас', null]];
for (const dd of [0.03, 0.05, 0.08]) for (const mult of [0.5, 0.67]) L.push([`просадка > ${dd * 100}% → риск ×${mult}`, { dd, mult }]);
for (const ma of [10, 20, 40]) L.push([`счёт ниже средней ${ma} сделок → риск ×0.5`, { ma, mult: 0.5 }]);
for (const heat of [0.04, 0.06, 0.08, 0.10]) L.push([`общий риск открытых ≤ ${heat * 100}%`, { heat }]);
for (const sec of [1, 2, 3, 4]) L.push([`не больше ${sec} бумаг одной отрасли`, { sec, secOf }]);
L.push(['просадка>5% ×0.5 + общий риск ≤6%', { dd: 0.05, mult: 0.5, heat: 0.06 }]);
L.push(['просадка>5% ×0.5 + отрасль ≤2', { dd: 0.05, mult: 0.5, sec: 2, secOf }]);
L.push(['общий риск ≤6% + отрасль ≤2', { heat: 0.06, sec: 2, secOf }]);
module.exports = L;
