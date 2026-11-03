'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ew-monitor-test-'));
process.env.EW_DATA_DIR=root;process.env.EW_CONFIG_FILE=path.join(root,'config.json');
const L=require('../../server/monitor-lib'),{evaluate}=require('../../server/monitor-core'),admin=require('../../server/admin'),{tick}=require('../../server/monitor');
const t=Date.now(),healthy=(at=t)=>({power:{ac:true,percent:100,status:'Full',critical:false},temperature:50,disk:{free:100*1024**3,total:200*1024**3,percentFree:50},memory:{total:1000,available:800},internet:true,tailscale:true,robotDataOk:true,run:{startedAt:at,finishedAt:at,ok:true,running:false},bootId:'test-boot',monotonic:100,uptime:100});
async function main(){
 let s=healthy(),p=evaluate(s,{}, {},t);assert.strictEqual(p.events.length,0);
 s.power={ac:false,percent:50,status:'Discharging'};p=evaluate(s,p,{},t+1);assert(p.events.some(e=>e.key==='power'&&e.level===1));
 assert.strictEqual(evaluate(s,p,{},t+1000).events.length,0);
 s.power.percent=20;p=evaluate(s,p,{},t+2000);assert.strictEqual(p.conditions.battery.level,2);
 s.power.percent=21;assert.strictEqual(evaluate(s,p,{},t+3000).conditions.battery.level,2);
 s.power.percent=10;p=evaluate(s,p,{},t+4000);assert.strictEqual(p.conditions.battery.level,3);
 assert.strictEqual(evaluate({...s,power:{...s.power,percent:null}},p,{},t+4500).conditions.battery.level,3);
 assert(!evaluate(s,p,{},t+5000).events.some(e=>e.key==='battery'));
 assert(evaluate(s,p,{},t+6*3600000+5000).events.some(e=>e.key==='battery'&&e.level===3));
 s.power.ac=true;p=evaluate(s,p,{},t+6000);assert(p.events.some(e=>e.key==='battery'&&e.level===0));
 s=healthy();s.run.running=true;s.run.processMissing=true;assert.strictEqual(evaluate(s,{}, {},t).conditions.job.level,3);
 s=healthy();s.run.startedAt=t-13*60000;assert(evaluate(s,{}, {},t).conditions.schedule);
 s=healthy();s.temperature=95;p=evaluate(s,{}, {},t);s.temperature=null;assert(!evaluate(s,p,{},t+1).events.some(e=>e.key==='temperature'&&e.level===0));
 const powerRoot=path.join(root,'power');for(const [dir,files] of Object.entries({AC0:{type:'Mains',online:'0'},BAT0:{type:'Battery',capacity:'15',status:'Discharging',energy_now:'1000000',power_now:'500000'}})){fs.mkdirSync(path.join(powerRoot,dir),{recursive:true});for(const [name,value]of Object.entries(files))fs.writeFileSync(path.join(powerRoot,dir,name),value);}
 assert.deepStrictEqual(L.power(powerRoot),{ac:false,percent:15,status:'Discharging',critical:false,remainingMinutes:120});
 assert(!admin.authorized('Bearer wrong','a'.repeat(64)));assert(admin.authorized('Bearer '+'a'.repeat(64),'a'.repeat(64)));
 assert.throws(()=>admin.control({kind:'ew-admin-request',v:1,action:'reboot'}),/Подтвердите/);
 assert.throws(()=>admin.control({kind:'ew-admin-request',v:1,action:'restartMonitor'}),/Подтвердите/);
 assert.throws(()=>admin.control({kind:'ew-admin-request',v:1,action:'maintenance',type:'__proto__'}),/Проверьте/);
 assert.throws(()=>admin.control({kind:'ew-admin-request',v:1,action:'thresholds',batteryWarning:10,batteryCritical:20}),/целые/);
 assert.throws(()=>admin.control({kind:'ew-admin-request',v:1,action:'downloadBackup',name:'../../config.json'}),/Неверное имя/);
 L.write(L.file('files/vacc.json'),{accs:[{key:'test',cash:100,pos:[],closed:[]} ]});
 const copy=admin.control({kind:'ew-admin-request',v:1,action:'backup'});assert(copy.backup);assert(admin.control({kind:'ew-admin-request',v:1,action:'downloadBackup',name:copy.backup}).download.state.accs.length===1);
 L.write(L.file('maintenance.json'),{trackingStartedOn:L.mskDate()});
 L.write(process.env.EW_CONFIG_FILE,{mail:{host:'test',user:'test',pass:'dummy',to:'owner@example.test'}});
 let current=healthy(),sent=[];const deps={sample:()=>current,internet:async()=>true,send:async(...x)=>{sent.push(x);}};
 await tick(deps);current={...healthy(),power:{ac:false,percent:15,status:'Discharging'}};
 await tick({...deps,send:async()=>{assert(L.read(L.file('monitor.json')).queue.length>=2);throw Error('synthetic failure');}});
 let state=L.read(L.file('monitor.json'));assert(state.mailError&&state.queue.length===2);
 state.queue.forEach(x=>x.nextAt=0);L.write(L.file('monitor.json'),state);
 await tick(deps);assert.strictEqual(sent.length,2);assert.strictEqual(L.read(L.file('monitor.json')).queue.length,0);
 await tick(deps);assert.strictEqual(sent.length,2);
 for(const [cfg,subject,text]of sent){assert.strictEqual(cfg.fromName,'Домашний сервер');assert(subject.startsWith('[Сервер]'));assert(text.includes('МСК'));}
 // SMTP-подтверждения приходят кусками; тестовый TLS-сокет не отправляет писем.
 let letter='';class Sock extends EventEmitter{setTimeout(){}destroy(){}end(){}write(line){let answer;if(line.startsWith('EHLO'))answer='250-test\r\n250 AUTH LOGIN\r\n';else if(line.startsWith('AUTH'))answer='334 user\r\n';else if(line.trim()===Buffer.from('user').toString('base64'))answer='334 password\r\n';else if(line.trim()===Buffer.from('pass').toString('base64'))answer='235 ok\r\n';else if(line.startsWith('DATA'))answer='354 send\r\n';else if(line.startsWith('From:')){letter=line;answer='250 accepted\r\n';}else if(line.startsWith('QUIT'))return;else answer='250 ok\r\n';setImmediate(()=>{this.emit('data',Buffer.from(answer.slice(0,4)));setImmediate(()=>this.emit('data',Buffer.from(answer.slice(4))));});}}
 const socket=new Sock(),context={module:{exports:{}},require:n=>{assert.strictEqual(n,'tls');return{connect:()=>{setImmediate(()=>socket.emit('data',Buffer.from('220 ready\r\n')));return socket;}};},Buffer,Date};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../server/mail.js'),'utf8'),context);
 await context.module.exports({host:'test',user:'user',pass:'pass',to:'to',fromName:'Домашний сервер'},'[Сервер] Тест','test');
 assert(letter.includes(Buffer.from('Домашний сервер').toString('base64')));assert(letter.includes('.server@'));
 console.log('Монитор: питание, гистерезис, напоминания, восстановление, ошибки запуска, очередь/повтор, SMTP и защита действий — ОК.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
