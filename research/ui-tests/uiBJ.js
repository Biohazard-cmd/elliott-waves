// Серверный слой: ошибки, таймаут, резервная копия и запоздалый ответ.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const values = new Map(); let mode = 'ok', delayed, timeoutMs;
const state = (cash) => ({ on:true, mm2:true, accs:[{key:'d_long',name:'основной',cash,dep:100000,pos:[],closed:[],hist:[],cfg:{},px:{},seen:{},pend:{}}] });
const response = () => ({status:200,text:async()=>JSON.stringify({kind:'ew-robots-state',v:1,state:state(123456)})});
const c = { URL, console, clearTimeout, setTimeout(fn,ms){timeoutMs=ms;return setTimeout(fn,ms===20000?5:ms);}, localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}, fetch:async()=>{
 if(mode==='wait') return new Promise(r=>{delayed=r;});
 if(mode==='401') return {status:401,text:async()=>'{}'};
 if(mode==='bad') return {status:200,text:async()=>JSON.stringify({kind:'ew-robots-state',v:1,state:{accs:[{}]}})};
 return response();
}};
vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../android/assets/data.js'),'utf8'),c);const D=c.EWData;
(async()=>{
 D.saveSettings({...D.settings(),serverUrl:'https://robots.test/api/robots',serverKey:'test'}); D.vaccSet(state(100000));
 await D.serverSync(); assert.strictEqual(D.settings().robotMode,'server');assert.strictEqual(D.vaccGet().accs[0].cash,123456); assert.strictEqual(D.nextAlarm(),0);assert.strictEqual((await D.robotStep()).length,0);
 const at=D.store.get('serverRobots').at;
 for(mode of ['401','bad','wait']){await assert.rejects(D.serverSync());assert.strictEqual(D.vaccGet().accs[0].cash,123456);assert.strictEqual(D.store.get('serverRobots').at,at);}
 assert.strictEqual(timeoutMs,20000);
 assert(D.serverOffline());assert.strictEqual(D.vaccGet().accs[0].cash,123456);
 let local=D.vaccGet();local.accs[0].cash=130000;D.vaccSet(local);mode='ok';await D.serverSync();assert.strictEqual(D.files.get('vacc-local.json').accs[0].cash,130000);
 mode='wait';const pending=D.serverSync();D.serverOffline();delayed(response());await assert.rejects(pending,/изменён/);assert.strictEqual(D.settings().robotMode,'local');
 console.log('Серверный слой: 401, повреждённое состояние, таймаут, автономная копия и запоздалый ответ — ОК.');
})().catch(e=>{console.error(e);process.exit(1);});
