// Тест 4: где на истории заканчивается волна 5 завершённых импульсов. Зона Джозефа: 62–100% от (0→3), отложенных от конца волны 4
const S=require('./store.js'), E=S.E;
for(const tf of ['1d','4h','1h']){
  const q=[], q1=[];
  for(const s of S.series.filter(x=>x.tf===tf)){ const a=E.run(s.bars,Object.assign({},S.doc.cfg,{maxBars:5000,swingPct:0,addMarket:false}),s.P);
    for(const f of a.figures||[]){ if(f.kind!==0||f.n!==6) continue; const p=f.px, d=Math.sign(p[5]-p[0]); const w03=Math.abs(p[3]-p[0]), w5=d*(p[5]-p[4]), w1=Math.abs(p[1]-p[0]); if(w03>0&&w5>0){ q.push(w5/w03); q1.push(w5/w1); } } }
  q.sort((a,b)=>a-b); q1.sort((a,b)=>a-b); const fr=(arr,lo,hi)=>(arr.filter(v=>v>=lo&&v<=hi).length/arr.length*100).toFixed(0)+'%';
  const pc=(arr,p)=>arr[Math.floor(arr.length*p)].toFixed(2);
  console.log(`${tf}: импульсов ${q.length}. W5/(0→3): медиана ${pc(q,.5)}, 25–75% = ${pc(q,.25)}–${pc(q,.75)} | в зоне Джозефа 0.62–1.0: ${fr(q,.62,1.0)} | ниже 0.62: ${fr(q,0,.62)} | выше 1.0: ${fr(q,1.0,99)}`);
  console.log(`     W5/W1: медиана ${pc(q1,.5)}, 25–75% = ${pc(q1,.25)}–${pc(q1,.75)} | 0.62–1.0 × W1: ${fr(q1,.62,1.0)}`);
}
