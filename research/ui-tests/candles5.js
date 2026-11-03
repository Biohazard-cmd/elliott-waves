const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const c = { localStorage: { getItem: () => null }, setTimeout, clearTimeout, URL };
vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '../../android/assets/data.js'), 'utf8'), c);
const D = c.EWData, t = Date.parse('2026-11-03T12:00:00Z');
const bar = () => ({t, o:100, h:102, l:99, c:101, done:false});
for (const q of [{price:150,t:t-1}, {price:150,t:t+3600000}, {price:0,t:t+1000}, {price:NaN,t:t+1000}, {price:150,t:0}]) {
  const b=bar(); assert.strictEqual(D.updateLiveCandle(b,q,'1h',t+2000),false); assert.strictEqual(b.c,101);
}
const b=bar(); assert(D.updateLiveCandle(b,{price:103,t:t+2000},'1h',t+3000)); assert.strictEqual(b.h,103);
assert(!D.updateLiveCandle(b,{price:105,t:t+1000},'1h',t+3000)); assert.strictEqual(b.h,103);
assert(!D.updateLiveCandle(b,{price:105,t:t+4000},'1h',t+3600000));
assert(!D.validCandle({...bar(),o:0})); assert(!D.validCandle({...bar(),c:103})); assert(!D.validCandle({...bar(),l:104}));
assert(D.validCandle({...bar(),h:1000})); // Настоящий большой хвост допустим: фильтруем ошибки структуры, не волатильность.
const input={time:new Date(t).toISOString(),open:{units:'100'},high:{units:'102'},low:{units:'99'},close:{units:'101'}};
assert.strictEqual(D.parseCandles({candles:[input,{...input,open:{units:'0'}}]}).length,1);
console.log('Свечи: старые/будущие/переставленные котировки, граница интервала, нулевые цены и настоящий длинный хвост — ОК.');
// Реальная функция загрузки: ответ бумаги A после выбора B не должен попасть на график B.
const app = fs.readFileSync(path.join(__dirname, '../../android/assets/app.js'), 'utf8');
const begin = app.indexOf('  async function load(force)'), finish = app.indexOf('  function compute(', begin);
let release, requested = [], computed = 0;
const qctx = { tr:null, loading:false, demo:false, lotInfo:null, err:'', Date, S:{token:'test',inst:{id:'A'},tf:'1h',cfg:{}}, $:()=>({hidden:false}), D:{ getBars:async(_,inst)=>{requested.push(inst.id);if(inst.id==='A')return new Promise(r=>release=r);return[];}, mxState:()=>({at:0}), withDividends:async(_,__,bars)=>({bars,adj:[]}), instInfo:async()=>({}),log(){} }, compute:()=>computed++, loadBrokerOps(){},refreshLive(){},renderPanel(){},mxSrc:0,lastLoad:0 };
vm.createContext(qctx);vm.runInContext(app.slice(begin,finish),qctx);
(async()=>{const first=qctx.load(false);qctx.S.inst={id:'B'};release([{t:1,o:1,h:1,l:1,c:1}]);await first;await new Promise(r=>setTimeout(r,0));assert.deepStrictEqual(requested,['A','B']);assert.strictEqual(computed,1);assert.strictEqual(qctx.all.length,0);console.log('Запоздалый ответ другой бумаги не попадает на новый график — ОК.');})().catch(e=>{console.error(e);process.exitCode=1;});
