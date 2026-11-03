'use strict';
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),L=require('./monitor-lib');
function start(name){
 const log=fs.openSync(L.file(name.replace('.js','.log')),'a');
 const child=spawn(process.execPath,[name],{cwd:__dirname,detached:true,stdio:['ignore',log,log],env:{...process.env,NODE_EXTRA_CA_CERTS:process.env.NODE_EXTRA_CA_CERTS||path.join(__dirname,'nuc-ca.pem')}});
 child.on('error',()=>console.error('Не удалось запустить '+name));child.unref();fs.closeSync(log);
}
async function manage(action='ensure'){
 fs.mkdirSync(L.DATA,{recursive:true});
 let lock;try{lock=fs.openSync(L.file('supervisor.lock'),'wx');fs.writeFileSync(lock,String(process.pid));}catch{
  const pid=+(L.raw(L.file('supervisor.lock'))||0);
  try{if(pid>0){process.kill(pid,0);return;}if(Date.now()-fs.statSync(L.file('supervisor.lock')).mtimeMs<10000)return;}catch{}
  try{fs.unlinkSync(L.file('supervisor.lock'));}catch{}return manage(action);
 }
 try{
  if(action==='restart-status'||action==='restart-monitor'){
   const name=action==='restart-status'?'status.js':'monitor.js';
   for(const pid of L.processes(name))process.kill(pid,'SIGTERM');
   await new Promise(r=>setTimeout(r,700));
  }else if(action!=='ensure')throw new Error('Неизвестное действие');
  // Отдельный cron-супервизор замечает и живой, но зависший монитор.
  if(action==='ensure'){
   const m=L.read(L.file('monitor.json'),{}),w=L.read(L.file('monitor-watchdog.json'),{}),now=Date.now();
   if(m.at&&now-m.at>180000&&now-(w.lastRestartAt||0)>10*60000){
    const event={id:require('crypto').randomUUID(),at:now,level:3,title:'Монитор перестал обновлять показатели',text:'Супервизор обнаружил отсутствие свежих показателей и перезапустил технический монитор. Проверьте страницу и журнал. Торговые роботы не останавливались.'};
    L.write(L.file('monitor-watchdog.json'),{lastRestartAt:now,event});
    for(const pid of L.processes('monitor.js'))process.kill(pid,'SIGTERM');
    await new Promise(r=>setTimeout(r,700));
   }
  }
  for(const name of ['status.js','monitor.js'])if(!L.processes(name).length)start(name);
 }finally{fs.closeSync(lock);fs.unlinkSync(L.file('supervisor.lock'));}
}
module.exports={manage};
if(require.main===module)manage(process.argv[2]).catch(e=>{console.error('Супервизор: '+e.message);process.exitCode=1;});
