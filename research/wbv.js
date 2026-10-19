const {evalCfg,line,ser,mkt,E,BASE}=require('./strat.js');
console.log(line('база',evalCfg({}))); console.log(line('addAO pos',evalCfg({addAO:true}))); console.log(line('addAO both',evalCfg({addAO:true,aoMode:'both'})));
for(const o of [{},{addPyramid:true},{stopW2:true,localBars:5},{stopW2:true,localBars:5,addPyramid:true}]){ let NR=0,n=0,ad=0;
  for(const s of ser){ const st=E.quickStats(s.bars,Object.assign({},BASE,o,{mkt,maxBars:s.bars.length}),s.P); for(const t of st.trades){ if(t.reason===3) continue; NR+=t.NR; n++; if(t.add&&t.add.NR!=null){ NR+=t.add.NR; ad++; } } }
  console.log(JSON.stringify(o),'R вместе с доливками',NR.toFixed(0),'сделок',n,'доливок',ad); }
