'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const DATA=process.env.EW_DATA_DIR||path.join(__dirname,'data');
const read=(p,d=null)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;}};
const raw=(p)=>{try{return fs.readFileSync(p,'utf8').trim();}catch{return null;}};
function write(p,x){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),{mode:0o600});fs.renameSync(tmp,p);}
const file=(n)=>path.join(DATA,n);
const number=(p)=>{const x=raw(p);return x!==null&&x!==''&&Number.isFinite(+x)?+x:null;};
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',timeout:3000,maxBuffer:256*1024});return r.status===0?r.stdout.trim():null;}
function processes(script){
 if(process.platform!=='linux')return[];
 return fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x)).filter(pid=>{try{const a=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0');return path.basename(a[0])==='node' && path.basename(a[1]||'')===script && fs.realpathSync('/proc/'+pid+'/cwd')===__dirname;}catch{return false;}}).map(Number);
}
function power(root='/sys/class/power_supply'){
 const out={ac:null,percent:null,status:'Неизвестно',critical:false,remainingMinutes:null};let dirs=[];try{dirs=fs.readdirSync(root);}catch{return out;}
 for(const d of dirs){const p=path.join(root,d),type=raw(path.join(p,'type'));
  if(type==='Mains'||type==='USB'||type==='USB_C'){const on=number(path.join(p,'online'));if(on!==null)out.ac=out.ac===true||on===1;}
  if(type==='Battery') {out.percent=number(path.join(p,'capacity'));out.status=raw(path.join(p,'status'))||'Unknown';out.critical=raw(path.join(p,'capacity_level'))==='Critical';
   const energy=number(path.join(p,'energy_now')),watts=number(path.join(p,'power_now'));
   if(out.status==='Discharging'&&energy!==null&&watts>0)out.remainingMinutes=Math.round(60*energy/watts);
  }
 }
 return out;
}
function sample(){
 let temperature=null;try{for(const d of fs.readdirSync('/sys/class/thermal').filter(x=>x.startsWith('thermal_zone'))){const n=number('/sys/class/thermal/'+d+'/temp');if(n!==null&&n>0&&n<150000)temperature=Math.max(temperature||0,n/1000);}}catch{}
 let disk=null;try{const s=fs.statfsSync('/');disk={free:s.bavail*s.bsize,total:s.blocks*s.bsize,percentFree:100*s.bavail/s.blocks};}catch{}
 const mem=raw('/proc/meminfo'),available=mem&&mem.match(/^MemAvailable:\s+(\d+)/m);
 const robot=read(file('files/vacc.json'));let stateAt=0;try{stateAt=fs.statSync(file('files/vacc.json')).mtimeMs;}catch{}
 const ts=command('tailscale',['status','--json']);let tailscale=null;try{const j=JSON.parse(ts);tailscale=j.BackendState==='Running'&&j.Self?.Online!==false;}catch{}
 return {at:Date.now(),uptime:os.uptime(),monotonic:Number(process.hrtime.bigint()/1000000000n),bootId:raw('/proc/sys/kernel/random/boot_id'),power:power(),temperature,disk,memory:{total:os.totalmem(),available:available?+available[1]*1024:os.freemem()},load:os.loadavg()[0],cores:os.cpus().length,tailscale,robotDataOk:!!(robot&&Array.isArray(robot.accs)&&robot.accs.length),stateAt,run:(()=>{const h=read(file('run-health.json'));if(h?.running&&h.pid)h.processMissing=!processes('run.js').includes(h.pid);return h;})()};
}
function canReboot(){return command('sudo',['-n','-l','/usr/bin/systemctl','reboot'])!==null;}
function busy(){return processes('run.js').length>0;}
function backup(){const v=read(file('files/vacc.json'));if(!v?.accs?.length)throw new Error('Состояние роботов не читается');const name='robots-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';write(file('backups/'+name),{kind:'ew-server-backup',v:1,at:Date.now(),state:v});return name;}
const mskDate=(now=Date.now())=>new Date(now+3*3600000).toISOString().slice(0,10);
module.exports={DATA,read,raw,write,file,command,processes,power,sample,canReboot,busy,backup,mskDate};
