// Тест 3: порог по правилу Вильямса «пятёрка занимает 100–140 свечей» → средняя волна ≈ 24 свечи
const st=require('./strat.js'); const {evalCfg,portfolio,line,E,ser}=st;
function legBars(bars,sw){ const z=E.zzInit(sw/100), p=[], H=bars.map(b=>b.h), L=bars.map(b=>b.l); for(let i=0;i<bars.length;i++) E.zzPush(z,i,H,L,p);
  const d=[]; for(let k=1;k<p.length;k++) d.push(p[k].i-p[k-1].i); d.sort((a,b)=>a-b); return d.length?d[d.length>>1]:999; }
function swFor(bars,target){ let lo=0.2,hi=40; for(let k=0;k<30;k++){ const m=Math.sqrt(lo*hi); if(legBars(bars,m)<target) lo=m; else hi=m; } return Math.round(Math.sqrt(lo*hi)*10)/10; }
const SW={}, AUTO={};
for(const s of ser){ const b=E.trimGaps(s.bars,s.P).bars; SW[s.id]={}; for(const tg of [16,24]) SW[s.id][tg]=swFor(b,tg); AUTO[s.id]=E.autoSwing(b,1); }
const med=(a)=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};
console.log('медианный порог на дневках: авто', med(Object.values(AUTO)), '| «волна ≈24 свечи (пятёрка 120)»', med(Object.values(SW).map(v=>v[24])), '| «волна ≈16 свечей (пятёрка 80)»', med(Object.values(SW).map(v=>v[16])));
console.log('медианная длина волны при автопороге:', med(ser.map(s=>legBars(E.trimGaps(s.bars,s.P).bars,AUTO[s.id]))), 'свечей');
for(const [pn,o] of [['основной',{}],['агрессивный',{stopW2:true,localBars:5}]]){
  for(const [nm,f] of [['авто',null],['по Вильямсу: волна ≈24 св.',(s)=>SW[s.id][24]],['промежуточно: волна ≈16 св.',(s)=>SW[s.id][16]]]){
    const r=evalCfg(o,f?{sw:f}:{}); const a=portfolio(r,{cash:true}); console.log((pn+' · '+nm).padEnd(34).slice(0,34),line('',r).slice(34),`| ×${a.eq.toFixed(2)} ${(a.cagr*100).toFixed(1)}%/год, просадка ${(a.mdd*100).toFixed(0)}%`); }
}
