const {ser,mkt,E,BASE,portfolio,SPLIT}=require('./strat.js');
function run(over){ const cfg=Object.assign({},BASE,over); const all=[]; let R=0,n=0;
  for(const s of ser){ const st=E.quickStats(s.bars,Object.assign({},cfg,{mkt,maxBars:s.bars.length}),s.P); const bars=s.bars.slice(-st.N);
    for(const t of st.trades){ if(t.reason===3) continue; n++; R+=t.NR; const TOut=bars[Math.min(t.iExit,bars.length-1)].t;
      all.push({id:s.id,t,T:bars[t.iEntry].t,TOut}); if(t.add&&t.add.NR!=null){ R+=t.add.NR; all.push({id:s.id+'+',t:{side:t.side,entry:t.add.px,stop0:t.add.stop,exitP:t.exitP},T:bars[t.add.i].t,TOut}); } } }
  return {all,R,n}; }
for(const [nm,o] of [['основной',{}],['основной+AO',{addAO:true}],['основной+AO+доливка',{addAO:true,addPyramid:true}],['агрессивный',{stopW2:true,localBars:5}],['агр+AO',{stopW2:true,localBars:5,addAO:true}],['агр+доливка',{stopW2:true,localBars:5,addPyramid:true}],['агр+AO+доливка',{stopW2:true,localBars:5,addAO:true,addPyramid:true}]]){
  const r=run(o), a=portfolio(r,{cash:true}), h=[r.all.filter(x=>x.T<SPLIT),r.all.filter(x=>x.T>=SPLIT)].map(z=>portfolio({all:z},{cash:true}));
  const y=a.yearEq; console.log(nm.padEnd(22),`R ${r.R.toFixed(0)} сд ${r.n} | ×${a.eq.toFixed(2)} ${(a.cagr*100).toFixed(1)}%/год просадка ${(a.mdd*100).toFixed(0)}% | до23 ${(h[0].cagr*100).toFixed(0)}% с23 ${(h[1].cagr*100).toFixed(0)}% | 2025 ${(y[2025]/y[2024]*100-100).toFixed(0)}% 2026 ${(y[2026]/y[2025]*100-100).toFixed(0)}%`); }
