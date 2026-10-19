// node store.js файл.json.gz — загрузить хранилище приложения и прогнать бэктест по всем рядам
const zlib=require('zlib'), fs=require('fs'); const mem={}; global.window=globalThis;
global.localStorage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},key:i=>Object.keys(mem)[i]};Object.defineProperty(global.localStorage,'length',{get:()=>Object.keys(mem).length});
const E=require(__dirname + '/../android/assets/engine2.js'); global.EW2=E; require(__dirname + '/../android/assets/data.js'); const D=globalThis.EWData;
const FP=process.env.STORE||process.argv[2]||(__dirname+'/data/ew-store-all.json.gz'); const raw=fs.readFileSync(FP); const doc=JSON.parse((FP.endsWith('.gz')?zlib.gunzipSync(raw):raw).toString());
const TFMS={'5m':3e5,'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5};
const out=[];
for(const [name,c] of Object.entries(doc.series)){ const m=name.match(/^scan_(.+)_([^_]+)\.json$/); const id=m[1], tf=m[2];
  let bars=c.r.map(a=>({t:a[0],o:a[1],h:a[2],l:a[3],c:a[4],v:a[5],done:a[6]!==0}));
  if(doc.cfg.divAdj!==false && doc.divs[id]) bars=D.adjustDividends(bars,doc.divs[id].list).bars;
  bars=bars.filter(b=>b.done);
  out.push({id,tf,bars,P:TFMS[tf]});
}
module.exports={doc,series:out,E,D};
if(require.main===module){ for(const s of out){ const a=E.run(s.bars,Object.assign({},doc.cfg,{maxBars:s.bars.length,swingPct:(doc.swings||{})[s.id+'.'+s.tf]||0}),s.P);
  console.log(s.id.padEnd(12),s.tf,s.bars.length,'сд',a.stats.trades,'R',a.stats.sumR.toFixed(1)); } }
