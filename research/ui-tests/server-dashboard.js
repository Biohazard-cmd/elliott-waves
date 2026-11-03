const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),{chromium}=require('playwright');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ew-dashboard-test-')),key='a'.repeat(64),port=18490+Math.floor(Math.random()*1000),url='http://127.0.0.1:'+port;
const write=(n,x)=>{const p=path.join(root,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x));};
const now=Date.now();const a={key:'d_long',name:'Основной · очень длинное название для маленького экрана',cash:100000,dep:100000,mm:0,pos:[],closed:[],hist:[],cfg:{},px:{}};
write('files/vacc.json',{on:true,mm2:true,accs:[a],lastRun:now});write('maintenance.json',{trackingStartedOn:'2026-11-03'});
write('monitor.json',{at:now,activeSeconds:3600,lastMailAt:now,mailConfigured:true,queue:[],conditions:{},sample:{power:{ac:true,percent:100,status:'Full'},temperature:49,memory:{available:1024**3,total:4*1024**3},disk:{free:20*1024**3,total:100*1024**3},internet:true,tailscale:true,uptime:1000,cores:4,load:0.5,run:{ok:true,startedAt:now,lastSuccessAt:now,durationMs:5000}}});
const server=spawn(process.execPath,[path.resolve(__dirname,'../../server/status.js')],{env:{...process.env,EW_DATA_DIR:root,EW_SERVER_KEY:key,EW_STATUS_TEST:'1',EW_PORT:String(port)},stdio:'pipe'});let stderr='';server.stderr.on('data',x=>stderr+=x);
(async()=>{
 let ready=false;for(let i=0;i<40;i++){try{const r=await fetch(url);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,stderr);
 const post=async(action,payload={},auth=key)=>fetch(url+'/api/admin',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({kind:'ew-admin-request',v:1,action,...payload})});
 assert.strictEqual((await post('reboot',{confirm:'REBOOT'},'wrong')).status,401);
 assert.strictEqual((await post('reboot')).status,400);
 assert.strictEqual((await post('restartStatus')).status,400);
 const api=await fetch(url+'/api/robots',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({kind:'ew-robots-request',v:1})});assert.strictEqual(api.status,200);assert.strictEqual((await api.json()).state.accs.length,1);
 const browser=await chromium.launch();try{
  const p=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);assert(await p.locator('text=От сети').count());
  for(const width of [320,390,960]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'shots/server-mobile.png'),fullPage:true});
  await p.locator('#diagnostics summary').click();await p.locator('#control summary').first().click();await p.fill('#adminKey',key);
  await p.evaluate(()=>refresh());assert.strictEqual(await p.inputValue('#adminKey'),key);assert(await p.locator('#diagnostics').evaluate(e=>e.open));
  await p.click('[data-action="testMail"]');await p.waitForFunction(()=>document.querySelector('#actionStatus').textContent.includes('очередь'));assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,'mail-requests.json'))).length,1);
  await p.click('[data-action="backup"]');await p.waitForFunction(()=>!document.querySelector('#downloadCopy').hidden);
  const [download]=await Promise.all([p.waitForEvent('download'),p.click('#downloadCopy')]);const doc=JSON.parse(fs.readFileSync(await download.path()));assert.strictEqual(doc.state.accs.length,1);
  p.once('dialog',d=>d.dismiss());await p.click('[data-action="restartMonitor"]');assert.deepStrictEqual(errors,[]);
 }finally{await browser.close();}
 console.log('Страница сервера: мобильная ширина, ключ, подтверждения, API роботов, очередь письма, копия и сохранение раскрытых разделов — ОК.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
