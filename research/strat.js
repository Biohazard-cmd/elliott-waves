// оценка стратегии на дневках 65 бумаг: чистый R, половины по времени, годы, сетапы
const S=require('./store.js'); const D=S.D, E=S.E;
for(const [n,c] of Object.entries(S.doc.series)) D.files.set(n,c);
const mkt=D.buildMarket('1d',200);
const ser=S.series.filter(s=>s.tf==='1d');
const BASE={ longOnly:true, shortOnly:false, swingMult:1, addMarket:true, addRunner:true, addFlipExit:true, addStruct:false,
  setups:{w3:true,w5:false,abc:true,tri:true}, addComplexTrade:false, addPhaseExit:false, addMinRR:false, addDepth:false,
  exitMode:'fixed', targetMode:'main', minScore:45, bookTrend:true, addTrend:'none', feePct:0.05, slipPct:0.02 };
const SPLIT=Date.UTC(2023,0,1);
function evalCfg(over, opt={}){
  const cfg=Object.assign({},BASE,over); const mk=opt.mkt||mkt;
  let R=0,n=0,w=0,h1=0,h2=0,pos=0; const yr={}, su={}, hold=[]; const per=[]; const all=[];
  for(const s of ser){
    const st=E.quickStats(s.bars,Object.assign({},cfg,{mkt:cfg.addMarket?mk:null,maxBars:s.bars.length}),s.P,opt.sw?opt.sw(s):0);
    const bars=s.bars.slice(-st.N); let r=0;
    for(const t of st.trades){ if(t.reason===3) continue; const T=bars[t.iEntry].t; const nr=opt.tr?opt.tr(t,bars):t.NR;
      R+=nr; n++; r+=nr; if(nr>0)w++; if(T<SPLIT)h1+=nr; else h2+=nr; const y=new Date(T).getUTCFullYear(); yr[y]=(yr[y]||0)+nr;
      su[t.setup]=su[t.setup]||[0,0]; su[t.setup][0]+=nr; su[t.setup][1]++; hold.push(t.iExit-t.iEntry); all.push({id:s.id,t,T,TOut:bars[Math.min(t.iExit,bars.length-1)].t,nr}); }
    if(r>0)pos++; per.push([s.id,r]);
  }
  return {R,n,w,h1,h2,pos,yr,su,hold,per,all};
}
function line(name,r){ return `${name.padEnd(34)} R ${r.R.toFixed(0).padStart(4)} сд ${String(r.n).padStart(4)} ср ${(r.R/r.n).toFixed(3)} приб ${(r.w/r.n*100).toFixed(0)}% плюс ${r.pos}/65 до23 ${r.h1.toFixed(0).padStart(4)} с23 ${r.h2.toFixed(0).padStart(4)}`; }
module.exports={evalCfg,line,BASE,ser,mkt,E,D,SPLIT};
if(require.main===module){
  const b=evalCfg({}); console.log(line('база d_long',b));
  console.log('годы:',Object.entries(b.yr).map(([y,v])=>y+':'+v.toFixed(0)).join(' '));
  console.log('сетапы:',Object.entries(b.su).map(([k,v])=>E.SETUP_NAME[k]+' '+v[0].toFixed(0)+'R/'+v[1]).join(' | '));
  const h=b.hold.sort((a,b)=>a-b); console.log('удержание (свечей): медиана',h[h.length>>1],'90%',h[Math.floor(h.length*.9)]);
  const rs=b.all.map(x=>x.nr).sort((a,b)=>a-b); console.log('распределение R: мин',rs[0].toFixed(2),'10%',rs[Math.floor(rs.length*.1)].toFixed(2),'медиана',rs[rs.length>>1].toFixed(2),'90%',rs[Math.floor(rs.length*.9)].toFixed(2),'макс',rs[rs.length-1].toFixed(2));
  const top=b.all.slice().sort((a,b)=>b.nr-a.nr); const top10=top.slice(0,10).reduce((s,x)=>s+x.nr,0); console.log('топ-10 сделок дают',top10.toFixed(0),'R из',b.R.toFixed(0));
  const rr={}; for(const x of b.all){ const k=x.t.reason; rr[k]=rr[k]||[0,0]; rr[k][0]+=x.nr; rr[k][1]++; } console.log('выходы:',Object.entries(rr).map(([k,v])=>E.REASON_NAME[k]+' '+v[0].toFixed(0)+'R/'+v[1]).join(' | '));
}
// портфель: капитал общий, риск на сделку riskPct, позиция не больше maxPos капитала, всего в позициях не больше 100% (без плеча)
function portfolio(r, o={}){
  const risk=(o.risk||1)/100, maxPos=o.maxPos||0.25, fee=0.0005, slip=0.0002;
  const ev=[]; for(const x of r.all){ const bars=x.bars; ev.push(x); }
  const tr=r.all.map(x=>({id:x.id,tIn:x.T,tOut:x.TOut,side:x.t.side,entry:x.t.entry,stop:x.t.stop0,exit:x.t.exitP})).sort((a,b)=>a.tIn-b.tIn);
  let eq=1, open=[], peak=1, mdd=0, taken=0, skipped=0; const yearEq={}; let sumDist=0, lastT=0, expoT=0, totT=0;
  // примерная доходность фонда денежного рынка (≈ ключевая ставка − 0,7 п.п., среднее за год)
  const RATE={2019:0.066,2020:0.043,2021:0.051,2022:0.098,2023:0.092,2024:0.173,2025:0.183,2026:0.143};
  const accrue=(t)=>{ if(!lastT){ lastT=t; return; } const dt=(t-lastT)/31557600000; if(dt<=0) return; const used=open.reduce((s,p)=>s+p.val,0);
    expoT+=Math.min(1,used/eq)*dt; totT+=dt; if(o.cash){ const r=RATE[new Date(t).getUTCFullYear()]||0.1; eq+=Math.max(0,eq-used)*r*dt; } lastT=t; };
  const closeUntil=(t)=>{ open.sort((a,b)=>a.tOut-b.tOut); while(open.length&&open[0].tOut<=t){ const p=open.shift(); accrue(p.tOut); eq+=p.val*(p.side*(p.exit-p.entry)/p.entry-2*fee-2*slip); if(eq>peak)peak=eq; mdd=Math.max(mdd,1-eq/peak); yearEq[new Date(p.tOut).getUTCFullYear()]=eq; } };
  for(const t of tr){ closeUntil(t.tIn); accrue(t.tIn); const dist=Math.abs(t.entry-t.stop)/t.entry; sumDist+=dist;
    const used=open.reduce((s,p)=>s+p.val,0); let val=Math.min(eq*risk/dist, eq*maxPos, Math.max(0,eq-used));
    if(val<eq*0.02){ skipped++; continue; } taken++; open.push(Object.assign({val},t)); }
  closeUntil(Infinity);
  const yrs=(tr[tr.length-1].tIn-tr[0].tIn)/31557600000;
  return {eq,cagr:Math.pow(eq,1/yrs)-1,mdd,taken,skipped,avgDist:sumDist/tr.length,yearEq,expo:expoT/totT};
}
module.exports.portfolio=portfolio;
