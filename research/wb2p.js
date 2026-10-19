const {ser,mkt,E,BASE,portfolio}=require('./strat.js');
function run(over,withAdd,aoMode){
  const cfg=Object.assign({},BASE,over); const all=[];
  for(const s of ser){ const st=E.quickStats(s.bars,Object.assign({},cfg,{mkt:cfg.addMarket?mkt:null,maxBars:s.bars.length}),s.P); const bars=s.bars.slice(-st.N);
    for(const t of st.trades){ if(t.reason===3) continue; all.push({id:s.id,t,T:bars[t.iEntry].t,TOut:bars[Math.min(t.iExit,bars.length-1)].t});
      if(!withAdd||t.setup!==0||!t.cnt) continue; const c=t.cnt, sd=t.side, p1=c.px[1], L=p1+sd*0.1*Math.abs(p1-c.px[0]); if(sd*(L-t.entry)<=0) continue;
      for(let i=t.iEntry+1;i<=t.iExit;i++){ const b=bars[i]; if(sd>0?b.h>=L:b.l<=L){ let st0=t.stop0; for(const m of t.path||[]) if(m.bar<=i) st0=m.p; const e=sd>0?Math.max(b.o,L):Math.min(b.o,L);
        if(sd*(e-st0)>0&&i<t.iExit) all.push({id:s.id+'+',t:{side:sd,entry:e,stop0:st0,exitP:t.exitP},T:b.t,TOut:bars[t.iExit].t}); break; } } } }
  return {all};
}
for(const [pn,o] of [['основной d_long',{}],['агрессивный',{stopW2:true,localBars:5}]]) for(const add of [false,true]){
  const r=run(o,add); const a=portfolio(r,{cash:true}); console.log(`${pn}${add?' + доливка на 110% W1':''}: ×${a.eq.toFixed(2)} ${(a.cagr*100).toFixed(1)}%/год, просадка ${(a.mdd*100).toFixed(0)}%, в позициях ${(a.expo*100).toFixed(0)}%, пропущено из-за денег ${a.skipped}`); }
const {SPLIT}=require('./strat.js');
for(const [pn,o] of [['основной',{}],['агрессивный',{stopW2:true,localBars:5}]]) for(const add of [false,true]){ const r=run(o,add);
  const h=[r.all.filter(x=>x.T<SPLIT), r.all.filter(x=>x.T>=SPLIT)].map(a=>portfolio({all:a},{cash:true}));
  console.log(`${pn}${add?' +доливка':''}: до 2023 ${(h[0].cagr*100).toFixed(1)}%/год (просадка ${(h[0].mdd*100).toFixed(0)}%), с 2023 ${(h[1].cagr*100).toFixed(1)}%/год (просадка ${(h[1].mdd*100).toFixed(0)}%)`); }
