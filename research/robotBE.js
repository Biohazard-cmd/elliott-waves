// прогон робота «вперёд»: история подаётся кусками, как будто робот работал с START
const zlib=require('zlib'), fs=require('fs'); const mem={}; global.window=globalThis;
global.localStorage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},key:i=>Object.keys(mem)[i]}; Object.defineProperty(global.localStorage,'length',{get:()=>Object.keys(mem).length});
global.fetch=async()=>({status:200,text:async()=>'{}'});   // сеть не нужна: свечи уже в хранилище
const E=require(__dirname + '/../android/assets/engine2.js'); global.EW2=E; require(__dirname + '/../android/assets/data.js'); const D=globalThis.EWData;
const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.STORE||(__dirname+'/data/ew-store-all.json.gz'))).toString());
const full={}; for(const [n,c] of Object.entries(doc.series)) if(n.endsWith('_1d.json')) full[n]=c;
D.files.set('universe.json', Object.assign({}, doc.universe, {at: Date.now()}));
for(const [id,v] of Object.entries(doc.divs)) D.store.set('div.'+id,{at:Date.now()+1e12,list:v.list});
D.store.set('settings',{token:'t.x',watch:[],notify:{}});
const START=Date.parse(process.env.START||'2023-01-10'), END=Date.parse(process.env.END||'2024-01-10'), STEP=7*864e5;
const cfgBase={ maxBars:2000, riskPct:1, feePct:0.05, divAdj:true, setups:{w3:true,w5:false,abc:true,tri:true}, exitMode:'fixed', targetMode:'main', minScore:45, bookTrend:true, addTrend:'none',
  longOnly:true, shortOnly:false, swingMult:1, addMarket:true, addRunner:true, addFlipExit:true, addStruct:false, maxHoldDays:182 };
const mk=(key,name,cfg)=>({key,name,cfg,cash:300000,dep:300000,mm:0,pos:[],closed:[],hist:[],px:{},seen:{},pend:{},skipped:0});
D.vaccSet({on:true,startAt:START,mmRate:13.5,top:50,flows:[],lastAccrue:START,accs:[Object.assign(mk('d_long','основной+БУ',Object.assign({},cfgBase,{stopW2:false,localBars:2})),{be:true}),mk('d_long','основной',Object.assign({},cfgBase,{stopW2:false,localBars:2})),mk('d_aggr','агрессивный',Object.assign({},cfgBase,{stopW2:true,localBars:5}))]});
const realNow=Date.now; let evN=0, buys=0, sells=0;
(async()=>{
  for(let t=START;t<=END;t+=STEP){
    for(const [n,c] of Object.entries(full)) D.files.set(n,{...c, full:true, r:c.r.filter(a=>a[0]<t)});   // история до «сегодня»
    Date.now=()=>t+20*3600e3;
    if(t>=START+182*864e5){ const W=D.vaccGet(); const ag=W.accs.find(a=>a.key==='d_aggr'); if(ag&&!ag.be){ ag.be=true; D.vaccSet(W); console.log('агрессивный: БУ включён', new Date(t).toISOString().slice(0,10), 'открытых', ag.pos.length); } }
    const ev=await D.robotStep(null,true); evN+=ev.length; for(const e of ev){ if(/купил/.test(e.title)) buys++; if(/продал/.test(e.title)) sells++; }
  }
  Date.now=realNow;
  const V=D.vaccGet();
  for(const a of V.accs){ const eq=D.vEquity(a); const w=a.closed.filter(c=>c.pl>0).length;
    console.log(`${a.name}: капитал ${Math.round(eq)} (${((eq/a.dep-1)*100).toFixed(1)}%), закрыто ${a.closed.length} (прибыльных ${a.closed.length?Math.round(w/a.closed.length*100):0}%), открыто ${a.pos.length}, пропущено ${a.skipped}, проценты фонда ${Math.round(a.mm)}, дивиденды ${Math.round(a.closed.reduce((s,c)=>s+c.divs,0)+a.pos.reduce((s,p)=>s+(p.divs||0),0))}`);
    console.log('   по БУ:', a.closed.filter(c=>c.why==='безубыток').length, 'позиции с be:', a.pos.filter(p=>p.be).length+'/'+a.pos.length, 'закрытые: ');console.log('   примеры:', a.closed.slice(0,4).map(c=>`${c.ticker} ${new Date(c.entryT).toISOString().slice(0,10)}→${new Date(c.exitT).toISOString().slice(0,10)} ${c.why} ${Math.round(c.pl)}`).join(' | ')); }
  for(const a of V.accs) console.log(a.name,'увидел сделок:',Object.keys(a.seen).length,'порогов:',Object.keys(a.sw||{}).length);
  console.log('событий',evN,'покупок',buys,'продаж',sells,'| перерасчётов подсчёта:',V.accs.map(a=>a.closed.filter(c=>c.why==='подсчёт пересчитан').length));
})();
