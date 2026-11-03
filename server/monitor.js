'use strict';
const path=require('path'),fs=require('fs'),L=require('./monitor-lib'),{evaluate}=require('./monitor-core'),send=require('./mail');
let running=false;
let initialAt=Date.now();
async function tick(deps={}){
 if(running)return;running=true;
 try{
  const cfg=L.read(process.env.EW_CONFIG_FILE||path.join(__dirname,'config.json'),{}),options={...cfg.monitor,...L.read(L.file('monitor-settings.json'),{})},old=L.read(L.file('monitor.json'),{}),s=(deps.sample||L.sample)(),now=Date.now();
  initialAt=old.monitorStartedAt||initialAt;
  // Проверка реального HTTP-доступа, а не только наличия сетевого интерфейса.
  try{if(deps.internet)s.internet=await deps.internet();else{const r=await fetch('https://iss.moex.com/iss/engines.json?iss.meta=off',{signal:AbortSignal.timeout(7000)});s.internet=r.ok;await r.body?.cancel();}}catch{s.internet=false;}
  if(!s.run && now-initialAt>15*60000)s.run={startedAt:initialAt};
  const result=evaluate(s,old,options,now),queue=old.queue||[];
  for(const e of result.events)queue.push({...e,id:require('crypto').randomUUID(),attempts:0,nextAt:now});
  const sameBoot=old.sample?.bootId===s.bootId;
  const activeSeconds=(old.activeSeconds||0)+(sameBoot?Math.max(0,s.monotonic-(old.sample?.monotonic||s.monotonic)):0);
  const state={...old,...result,events:undefined,queue,sample:s,activeSeconds,at:now,monitorStartedAt:initialAt,mailConfigured:!!(cfg.mail?.host&&cfg.mail?.user&&cfg.mail?.pass&&cfg.mail?.to)};
  const maintenance=L.read(L.file('maintenance.json'),{}),started=maintenance.trackingStartedOn||L.mskDate();
  const due=(key,days,lastKey)=>{
   const date=maintenance[lastKey]||started;
   if(now-Date.parse(date+'T00:00:00+03:00')>=days*86400000 && now-(state[key]||0)>=30*86400000){queue.push({id:require('crypto').randomUUID(),level:1,title:'Плановое обслуживание',text:key==='reviewReminderAt'?'Пора проверить температуры, диск, батарею и резервные копии.':'Пора осмотреть вентиляцию и необходимость чистки. Замена термопасты по календарю не требуется.',at:now,attempts:0,nextAt:now});state[key]=now;}
  };due('reviewReminderAt',30,'lastMonthlyReviewOn');due('cleanReminderAt',90,'lastCleaningOn');
  L.write(L.file('monitor.json'),state); // Очередь фиксируется ДО попытки отправки.
  if(!state.backupAt || now-state.backupAt>86400000){try{L.backup();state.backupAt=now;state.backupError=false;}catch{state.backupError=true;}}
  const requests=L.read(L.file('mail-requests.json'),[]); // Запросы из страницы имеют отдельный файл и уникальные id.
  const watchdog=L.read(L.file('monitor-watchdog.json'),{});if(watchdog.event)requests.push(watchdog.event);
  state.handledRequests=state.handledRequests||[];
  for(const r of requests)if(!state.handledRequests.includes(r.id)){queue.push({...r,attempts:0,nextAt:now});state.handledRequests.push(r.id);}
  L.write(L.file('monitor.json'),state);
  if(cfg.mail?.host&&cfg.mail?.user&&cfg.mail?.pass&&cfg.mail?.to){
   let sent=0;
   for(const m of [...queue]){
    if(m.nextAt>now||sent>=5)continue;
    try{
     const when=new Date(m.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});
     await (deps.send||send)({...cfg.mail,fromName:'Домашний сервер'},'[Сервер] '+m.title,`Домашний сервер\nВремя: ${when} МСК\n\n${m.text}\n\nЭто техническое сообщение сервера, не торговый сигнал.`);
     queue.splice(queue.findIndex(x=>x.id===m.id),1);state.lastMailAt=Date.now();state.mailError=false;sent++;
    }catch{m.attempts++;m.nextAt=Date.now()+Math.min(3600000,60000*2**Math.min(m.attempts,6));state.mailError=true;state.mailErrorAt=Date.now();break;}
    L.write(L.file('monitor.json'),state);
   }
  }else if(queue.length)state.mailError=true;
  state.handledRequests=state.handledRequests.slice(-1000);L.write(L.file('monitor.json'),state);
 }catch(e){console.error('Монитор: не удалось завершить проверку ('+(e.code||e.name||'ошибка')+')');}
 finally{running=false;}
}
module.exports={tick};
if(require.main===module){tick();setInterval(tick,30000);}
