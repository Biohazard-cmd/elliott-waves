// Тест 1: фильтр Вильямса — вход только если осциллятор 5/34 на стороне сделки (встроен в движок через marketOK)
const st=require('./strat.js'); const {evalCfg,portfolio,line,E}=st;
const P=E.Ctx.prototype, mk0=P.marketOK;
let MODE=null;   // null — без фильтра; 'pos' — AO>0 для покупки; 'mom' — AO выше сигнальной; 'both'
function aoOf(ctx){ if(ctx._ao) return ctx._ao; const N=ctx.N,H=ctx.H,L=ctx.L,M=H.map((h,k)=>(h+L[k])/2);
  const sma=(a,n)=>{const o=new Array(N).fill(NaN);let s=0,c=0;for(let k=0;k<N;k++){const v=a[k];if(isNaN(v))continue;s+=v;c++;if(c>n)s-=a[k-n];if(c>=n)o[k]=s/n;}return o;};
  const ao=sma(M,5).map((v,k)=>v-sma(M,34)[k]); const sg=sma(ao,5); const idx=new Map(ctx.T.map((t,k)=>[t,k])); ctx._ao={ao,sg,idx}; return ctx._ao; }
P.marketOK=function(side,t){ if(!mk0.call(this,side,t)) return false; if(!MODE) return true; const a=aoOf(this), i=a.idx.get(t); if(i==null||isNaN(a.ao[i])) return true;
  const pos=a.ao[i]*side>0, mom=(a.ao[i]-a.sg[i])*side>0; return MODE==='pos'?pos:MODE==='mom'?mom:pos&&mom; };
for(const [pn,over] of [['основной d_long',{}],['агрессивный',{stopW2:true,localBars:5}]]){
  console.log('=== '+pn);
  for(const m of [null,'pos','mom','both']){ MODE=m; const r=evalCfg(over); const a=portfolio(r,{cash:true});
    console.log(line(m?('AO: '+{pos:'на стороне сделки',mom:'моментум по сделке',both:'оба'}[m]):'без фильтра',r)+` | портфель ×${a.eq.toFixed(2)} ${(a.cagr*100).toFixed(1)}%/год, просадка ${(a.mdd*100).toFixed(0)}%`);
    if(m===null||m==='pos') console.log('   по годам R:',Object.entries(r.yr).map(([y,v])=>y+':'+v.toFixed(0)).join(' ')); }
}
