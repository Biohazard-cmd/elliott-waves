'use strict';
// Запускается из загруженной staging-папки. Не читает и не выводит секреты.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const source=__dirname,target=path.resolve(process.argv[2]||__dirname);
const names=['monitor-core.js','monitor-lib.js','monitor.js','manage.js','admin.js','dashboard.js','mail.js','run.js','status.js','enable-reboot.sh','SERVER_README.md'];
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
function run(bin,args,opts={}){const r=spawnSync(bin,args,{encoding:'utf8',...opts});if(r.status!==0)throw new Error('Не выполнено: '+path.basename(bin)+' '+args[0]);return r.stdout;}
(async()=>{
 if(!fs.existsSync(path.join(target,'config.json'))||!fs.existsSync(path.join(target,'data/files/vacc.json')))throw new Error('Не найдена установленная папка сервера и состояние роботов');
 for(const name of names)if(name.endsWith('.js'))run(process.execPath,['--check',path.join(source,name)]);
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=path.join(target,'data/code-backups',stamp);fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const name of names){const dst=path.join(target,name);if(fs.existsSync(dst))fs.copyFileSync(dst,path.join(backup,name));fs.copyFileSync(path.join(source,name),dst+'.new');fs.renameSync(dst+'.new',dst);}
 const maintenance=path.join(target,'data/maintenance.json');if(!fs.existsSync(maintenance)){fs.copyFileSync(path.join(source,'maintenance-default.json'),maintenance);fs.chmodSync(maintenance,0o600);}
 const old=spawnSync('crontab',['-l'],{encoding:'utf8'});if(old.status!==0&&old.status!==1)throw new Error('Не удалось прочитать crontab');
 const lines=(old.stdout||'').split('\n').filter(x=>x.trim()&&!x.includes('# home-server-monitor')&&!(x.startsWith('@reboot')&&x.includes(target)&&x.includes('status.js')));
 const cmd='cd '+quote(target)+' && NODE_EXTRA_CA_CERTS='+quote(path.join(target,'nuc-ca.pem'))+' '+quote(process.execPath)+' manage.js ensure >> '+quote(path.join(target,'data/supervisor.log'))+' 2>&1';
 lines.push('*/1 * * * * '+cmd+' # home-server-monitor','@reboot '+cmd+' # home-server-monitor');
 fs.writeFileSync(path.join(backup,'crontab-before.txt'),old.stdout||'',{mode:0o600});run('crontab',['-'],{input:lines.join('\n')+'\n'});
 run(process.execPath,[path.join(target,'manage.js'),'restart-monitor'],{cwd:target});
 run(process.execPath,[path.join(target,'manage.js'),'restart-status'],{cwd:target});
 console.log('Установлен монитор и супервизор. Расписание роботов сохранено. Перезагрузка и сон НЕ выполнялись.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
