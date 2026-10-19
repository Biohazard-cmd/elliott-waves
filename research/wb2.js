// Тест 2: управление позицией по Вильямсу на сделках «вход в волну 3» (дневки):
//  A) когда волна 3 прошла 110% волны 1 — стоп всей позиции за вершину волны 1 (без доливки);
//  B) половина на входе + половина на 110% волны 1, общий стоп за вершину волны 1; начальный риск тот же (размер ×2).
const {ser,mkt,E,BASE,SPLIT}=require('./strat.js');
const FEE=0.0014;
function run(over){
  const cfg=Object.assign({},BASE,over); const out=[];
  for(const s of ser){ const st=E.quickStats(s.bars,Object.assign({},cfg,{mkt:cfg.addMarket?mkt:null,maxBars:s.bars.length}),s.P);
    const bars=s.bars.slice(-st.N); for(const t of st.trades) if(t.reason!==3) out.push({t,bars,T:bars[t.iEntry].t}); }
  return out;
}
function sim(x, mode){
  const {t,bars}=x, c=t.cnt; if(t.setup!==0||!c||c.px.length<3) return {r:t.NR,app:false};
  const sd=t.side, p1=c.px[1], p0=c.px[0], R0=Math.abs(t.entry-t.stop0), W1=Math.abs(p1-p0), L=p1+sd*0.1*W1;
  if(!(R0>0)||sd*(L-t.entry)<=0||sd*(t.entry-p1)>=0&&false) return {r:t.NR,app:false};
  let add=null, ex=null;
  for(let i=t.iEntry;i<=t.iExit;i++){ const b=bars[i];
    if(!add){ if(sd>0?b.h>=L:b.l<=L) add={i,px:sd>0?Math.max(b.o,L):Math.min(b.o,L)}; continue; }
    if(sd>0?b.l<=p1:b.h>=p1){ ex={i,px:sd>0?Math.min(b.o,p1):Math.max(b.o,p1)}; break; }
  }
  if(!add) return {r:mode==='C'?t.NR:t.NR,app:true,trig:false};
  const x1=ex&&ex.i<=t.iExit?ex.px:t.exitP, r=(e,xp)=>(sd*(xp-e)-FEE*e)/R0;
  if(mode==='A') return {r:r(t.entry,x1),app:true,trig:true};
  if(mode==='C') return {r:r(t.entry,t.exitP)+r(add.px,t.exitP),app:true,trig:true};          // доливка на 110%, стоп системы
  if(mode==='D') return {r:r(t.entry,t.exitP)+0.5*r(add.px,t.exitP),app:true,trig:true};      // полная позиция + доливка половины
  return {r:r(t.entry,x1)+r(add.px,x1),app:true,trig:true};
}
const agg=(a)=>{ const R=a.reduce((s,v)=>s+v.r,0); const h1=a.filter(v=>v.T<SPLIT).reduce((s,v)=>s+v.r,0); let eq=0,pk=0,dd=0; for(const v of a.slice().sort((p,q)=>p.T-q.T)){eq+=v.r;pk=Math.max(pk,eq);dd=Math.max(dd,pk-eq);} return `R ${R.toFixed(0).padStart(4)} ср ${(R/a.length).toFixed(3)} | до23 ${h1.toFixed(0).padStart(4)} с23 ${(R-h1).toFixed(0).padStart(4)} | худшая серия ${dd.toFixed(0)} R`; };
for(const [pn,o] of [['основной d_long',{}],['агрессивный',{stopW2:true,localBars:5}]]){
  const all=run(o); console.log('=== '+pn+', сделок '+all.length+', из них «вход в волну 3» '+all.filter(x=>x.t.setup===0).length);
  const base=all.map(x=>({r:x.t.NR,T:x.T})); console.log('как сейчас                         '+agg(base));
  for(const m of ['A','B','C','D']){ const v=all.map(x=>Object.assign(sim(x,m),{T:x.T})); const trg=v.filter(z=>z.trig).length;
    console.log(({A:'A: стоп за вершину W1 на 110%     ',B:'B: ½ + ½ на 110%, стоп за W1      ',C:'C: 1 + 1 на 110%, стоп системы    ',D:'D: 1 + ½ на 110%, стоп системы    '}[m])+agg(v)+` | подтверждение в ${trg} сделках`); }
  // отдельно по сделкам, где 110% сработало
  const w3=all.filter(x=>x.t.setup===0); const trg=w3.filter(x=>sim(x,'A').trig);
  console.log(`   сделки с подтверждением 110%: ${trg.length}; без него: ${w3.length-trg.length}, их средний R ${ (w3.filter(x=>!sim(x,'A').trig).reduce((s,x)=>s+x.t.NR,0)/Math.max(1,w3.length-trg.length)).toFixed(2)}; с ним (как сейчас) ${(trg.reduce((s,x)=>s+x.t.NR,0)/Math.max(1,trg.length)).toFixed(2)}`);
}
// доливка на 110% как отдельная сделка: R в её собственном риске (до стопа системы на момент доливки)
for(const [pn,o] of [['основной d_long',{}],['агрессивный',{stopW2:true,localBars:5}]]){
  const all=run(o); const rs=[]; const FEE2=0.0014;
  for(const x of all){ const {t,bars}=x, c=t.cnt; if(t.setup!==0||!c||c.px.length<3) continue; const sd=t.side, p1=c.px[1], W1=Math.abs(p1-c.px[0]), L=p1+sd*0.1*W1;
    if(sd*(L-t.entry)<=0) continue; let add=null; for(let i=t.iEntry;i<=t.iExit;i++){ const b=bars[i]; if(sd>0?b.h>=L:b.l<=L){ add={i,px:sd>0?Math.max(b.o,L):Math.min(b.o,L)}; break; } }
    if(!add) continue; let stopAt=t.stop0; for(const m of t.path||[]) if(m.bar<=add.i) stopAt=m.p; const risk=Math.abs(add.px-stopAt); if(!(risk>0)) continue;
    rs.push({r:(sd*(t.exitP-add.px)-FEE2*add.px)/risk,T:x.T}); }
  const R=rs.reduce((s,v)=>s+v.r,0), w=rs.filter(v=>v.r>0).length, h1=rs.filter(v=>v.T<SPLIT).reduce((s,v)=>s+v.r,0);
  console.log(`${pn}: доливок ${rs.length}, средний R доливки ${(R/rs.length).toFixed(3)} (в плюс ${(w/rs.length*100).toFixed(0)}%), до23 ${h1.toFixed(0)} с23 ${(R-h1).toFixed(0)}`);
}
