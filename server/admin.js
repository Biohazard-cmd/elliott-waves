'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto'),{spawn}=require('child_process'),L=require('./monitor-lib');
const maintenanceKeys={cleaning:'lastCleaningOn',thermalPaste:'lastThermalPasteReplacementOn',battery:'lastBatteryInspectionOn',restore:'lastBackupRestoreTestOn',review:'lastMonthlyReviewOn'};
function authorized(header,key){const v=String(header||'').replace(/^Bearer\s+/i,'');return typeof key==='string'&&key.length>=16&&Buffer.byteLength(v)===Buffer.byteLength(key)&&crypto.timingSafeEqual(Buffer.from(v),Buffer.from(key));}
function control(q){
 const error=(text,status=400)=>{throw Object.assign(new Error(text),{status});};
 if(q.kind!=='ew-admin-request'||q.v!==1)error('Неверный запрос');
 if(q.action==='testMail'){
  const list=L.read(L.file('mail-requests.json'),[]),at=Date.now();
  if(list.some(x=>at-x.at<60000))error('Тестовое письмо уже запрошено. Подождите минуту.',429);
  list.push({id:crypto.randomUUID(),at,level:0,title:'Проверка технических оповещений',text:'Это тестовое письмо домашнего сервера. Проверка отправки запрошена владельцем. Аварии не обнаружено.'});
  L.write(L.file('mail-requests.json'),list.slice(-1000));return{message:'Тестовое письмо поставлено в очередь. Монитор отправит его при ближайшей проверке.'};
 }
 if(q.action==='backup')return{message:'Резервная копия создана на сервере.',backup:L.backup()};
 if(q.action==='downloadBackup'){
  const name=String(q.name||'');if(!/^robots-[\dTZ-]+\.json$/.test(name))error('Неверное имя копии');
  const x=L.read(L.file('backups/'+name));if(!x)error('Копия не найдена',404);return{message:'Копия готова.',download:x,name};
 }
 if(q.action==='maintenance'){
  const key=Object.hasOwn(maintenanceKeys,q.type)?maintenanceKeys[q.type]:null,date=q.date||L.mskDate();
  if(!key||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>L.mskDate())error('Проверьте вид работ и дату');
  const x=L.read(L.file('maintenance.json'),{});x[key]=date;L.write(L.file('maintenance.json'),x);return{message:'Фактическая дата обслуживания сохранена.'};
 }
 if(q.action==='thresholds'){
  const {batteryWarning:w,batteryCritical:c}=q;
  if(!Number.isInteger(w)||!Number.isInteger(c)||c<1||w>90||c>=w)error('Нужны целые проценты: критический ниже предупреждения, от 1 до 90');
  const x=L.read(L.file('monitor-settings.json'),{});x.batteryWarning=w;x.batteryCritical=c;L.write(L.file('monitor-settings.json'),x);return{message:'Пороги батареи сохранены.'};
 }
 if(q.action==='restartStatus'||q.action==='restartMonitor'){
  if(q.confirm!=='RESTART')error('Подтвердите перезапуск');
  setTimeout(()=>{const child=spawn(process.execPath,['manage.js',q.action==='restartStatus'?'restart-status':'restart-monitor'],{cwd:__dirname,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();},300);
  return{message:'Перезапуск запрошен. Обновите страницу через несколько секунд.'};
 }
 if(q.action==='reboot'){
  if(q.confirm!=='REBOOT')error('Подтвердите перезагрузку');
  if(!L.canReboot())error('Право перезагрузки ещё не настроено владельцем.',403);
  if(L.read(L.file('control-lock.json'),{}).until>Date.now())error('Другое действие ещё выполняется',409);
  L.write(L.file('control-lock.json'),{until:Date.now()+120000});
  if(L.busy()){L.write(L.file('control-lock.json'),{});error('Сейчас идёт проверка роботов. Дождитесь завершения.',409);}
  try{L.backup();}catch{L.write(L.file('control-lock.json'),{});error('Не удалось сохранить резервную копию. Перезагрузка отменена.',503);}
  setTimeout(()=>{
   const child=spawn('sudo',['-n','/usr/bin/systemctl','reboot'],{stdio:'ignore'});
   child.once('error',()=>L.write(L.file('control-lock.json'),{}));child.once('exit',code=>{if(code)L.write(L.file('control-lock.json'),{});});
  },1000);
  return{message:'Перезагрузка запрошена. Сервер временно недоступен. Проверьте возвращение связи.'};
 }
 error('Неизвестное действие');
}
module.exports={authorized,control};
