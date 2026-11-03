'use strict';
// Чистые правила тревог: тестируются без писем, выключения и настоящих датчиков.
const DEFAULTS = { batteryWarning:20, batteryCritical:10, temperatureWarning:80, temperatureCritical:90, reminderMs:6*3600000, staleRunMs:12*60000 };
function evaluate(s, previous, options={}, now=Date.now()) {
  const c={...DEFAULTS,...options}, conditions={}, events=[];
  const add=(key,level,title,text)=>{ conditions[key]={level,title,text}; };
  const old=previous.conditions||{};
  if(s.power.ac===null){if(old.power)conditions.power={...old.power};if(old.battery)conditions.battery={...old.battery};}
  if (s.power.ac===false) add('power',1,'Питание отключено','Ноутбук работает от батареи. Проверьте розетку и блок питания.');
  const p=s.power.percent, prior=old.battery?.level||0;
  if(s.power.ac===false&&p===null&&old.battery)conditions.battery={...old.battery};
  if (s.power.ac===false && (p!==null || s.power.critical)) {
    if (s.power.critical || (p!==null && (p<=c.batteryCritical || (prior===3 && p<c.batteryCritical+3)))) add('battery',3,'Критический заряд батареи',p===null?'Датчик сообщает критический заряд. Подключите питание: сервер может выключиться.':`Осталось ${p}%. Подключите питание: сервер может выключиться.`);
    else if(p<=c.batteryWarning || (prior>=2 && p<c.batteryWarning+3)) add('battery',2,'Низкий заряд батареи',`Осталось ${p}%. Подключите питание.`);
  }
  if(s.temperature!==null) {
    if(s.temperature>=c.temperatureCritical || (old.temperature?.level===3 && s.temperature>c.temperatureCritical-3)) add('temperature',3,'Опасная температура',`Датчик показывает ${s.temperature} °C. Проверьте охлаждение и нагрузку.`);
    else if(s.temperature>=c.temperatureWarning || (old.temperature && s.temperature>c.temperatureWarning-3)) add('temperature',2,'Высокая температура',`Датчик показывает ${s.temperature} °C. Проверьте вентиляцию.`);
  }
  else if(old.temperature)conditions.temperature={...old.temperature};
  if(s.disk && (s.disk.free<256*1024**2 || s.disk.percentFree<2)) add('disk',3,'Критически мало места','Место на системном диске заканчивается. Возможна потеря новых записей.');
  else if(s.disk && (s.disk.free<1024**3 || s.disk.percentFree<5)) add('disk',2,'Мало места на диске','Проверьте журнал и свободное место; данные автоматически не удаляются.');
  else if(!s.disk&&old.disk)conditions.disk={...old.disk};
  if(s.memory.available/s.memory.total<0.05) add('memory',2,'Мало свободной памяти','Доступно менее 5% оперативной памяти. Проверьте процессы.');
  if(s.internet===false && ((previous.internetFailures||0)>=1||old.internet)) add('internet',2,'Нет связи с интернетом','Не удалось получить ответ от Мосбиржи. Письма будут ждать восстановления связи.');
  if(s.tailscale===false && ((previous.tailscaleFailures||0)>=1||old.tailscale)) add('tailscale',2,'Недоступен Tailscale','Проверьте службу частной сети. Телефон может не получать состояние роботов.');
  if(s.tailscale==null&&old.tailscale)conditions.tailscale={...old.tailscale};
  if(s.internet==null&&old.internet)conditions.internet={...old.internet};
  if(!s.robotDataOk) add('state',3,'Не читается состояние роботов','Файл состояния отсутствует или повреждён. Проверьте резервную копию; текущие данные автоматически не заменяются.');
  const h=s.run;
  if(h?.startedAt && now-h.startedAt>c.staleRunMs) add('schedule',3,'Нет новых запусков проверки','Расписание давно не запускало роботов. Проверьте cron и журнал.');
  if(h?.running && (h.processMissing || now-h.startedAt>c.staleRunMs)) add('job',3,'Проверка роботов зависла','Проверка не завершилась в ожидаемое время. Принудительная остановка не выполнялась.');
  else if(h?.ok===false && !h.running) add('job',2,'Ошибка проверки роботов','Последняя проверка завершилась с ошибкой. Откройте журнал на странице сервера.');
  for(const [key,v] of Object.entries(conditions)) {
    const was=old[key], same=was && was.level===v.level;
    const remind=same && v.level===3 && now-(was.notifiedAt||0)>=c.reminderMs;
    conditions[key].notifiedAt=same&&!remind?was.notifiedAt:now;
    if(!same || remind) events.push({key,level:v.level,title:v.title,text:v.text+(remind?' Проблема сохраняется.':''),at:now});
  }
  for(const [key,v] of Object.entries(old)) if(!conditions[key]) events.push({key,level:0,title:'Восстановление: '+v.title,text:'Условие тревоги больше не наблюдается. Проверьте актуальные показатели на странице сервера.',at:now});
  return {conditions,events,internetFailures:s.internet===false?(previous.internetFailures||0)+1:0,tailscaleFailures:s.tailscale===false?(previous.tailscaleFailures||0)+1:0};
}
module.exports={evaluate,DEFAULTS};
