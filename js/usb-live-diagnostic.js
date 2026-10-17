// FlightCore USB diagnostic protocol v1. No device probing or firmware reads are inferred.
export function parseTelemetry(line){
 const p=String(line||'').trim().split(',');
 if(![12,20].includes(p.length)||p[0]!=='ZJTEL'||p[1]!=='1'||!/^A[12]$/.test(p[2]))return null;
 const board=p[2],sensor=board==='A1'?'LSM6DS3':'MPU6050',address=board==='A1'?'0x6B':'0x68';
 if(('0x'+p[5].replace(/^0x/i,'').toUpperCase())!==address)return null;
 const sequence=Number(p[3]),uptime=Number(p[4]),dropped=Number(p[11]);
 const rates=p.slice(7,10).map(Number);
 if(![sequence,uptime,dropped].every(Number.isSafeInteger)||sequence<0||uptime<0||dropped<0||!rates.every(Number.isFinite))return null;
 if(!/^(READY|STARTING|NOT_FOUND|READ_ERROR)$/.test(p[6])||!/^[A-Z0-9_]+$/.test(p[10]))return null;
 let rc=null;
 if(p.length===20){
  const extra=p.slice(12);
  if(!/^RC=(?:NONE\/IDLE|(?:USB|STA|AP)\/(?:WEB|ANDROID))$/.test(extra[0])||
     !/^RCSEQ=\d+$/.test(extra[1])||
     !['T','R','P','Y'].every((label,i)=>new RegExp('^'+label+'=\\d+$').test(extra[i+2]))||
     !/^INPUT_ARMED=[01]$/.test(extra[6])||extra[7]!=='MOTORS=OFF')return null;
  rc={link:extra[0].slice(3),seq:Number(extra[1].slice(6)),throttle:Number(extra[2].slice(2)),
   roll:Number(extra[3].slice(2)),pitch:Number(extra[4].slice(2)),yaw:Number(extra[5].slice(2)),
   inputArmed:extra[6].endsWith('1')};
  if([rc.throttle,rc.roll,rc.pitch,rc.yaw].some(n=>!Number.isInteger(n)||n<1000||n>2000))return null;
  if(rc.link==='NONE/IDLE'&&(rc.inputArmed||rc.seq!==0))return null;
 }
 return {board,sensor,address,sequence,uptime,sensorStatus:p[6],RateRoll:rates[0],RatePitch:rates[1],
  RateYaw:rates[2],led:p[10],deviceDrops:dropped,rc};
}
export function formatDiagnostic({sample=null,now=Date.now(),lastAt=0,connected=false,bootloader=false,firmware='?',missed=0,error='',staleAfter=250,lastRenderedSeq=null}={}){
 const age=lastAt?Math.max(0,Math.round(now-lastAt)):null;
 let state=sample?(!connected?'DISCONNECTED':age>staleAfter?'STALE':sample.sequence===lastRenderedSeq?'HOLD':'LIVE'):connected?'WAITING':bootloader?'BOOTLOADER':'DISCONNECTED';
 const implausibleDrops=!!sample&&sample.deviceDrops>Math.floor(sample.uptime/20)+100;
 const err=error||(implausibleDrops?'DROP_COUNTER_OVERFLOW':sample?.sensorStatus==='NOT_FOUND'?'GYRO_NOT_FOUND':sample?.sensorStatus==='READ_ERROR'?'GYRO_READ_ERROR':sample&&age>staleAfter?'TELEM_STALE':sample&&missed?'TELEM_GAP':!sample?(bootloader?'ROM_NO_APP':'NO_DATA'):'NONE');
 if(err!=='NONE'&&!['NO_DATA','ROM_NO_APP'].includes(err)&&state!=='DISCONNECTED')state='ERROR';
 const f=x=>Number.isFinite(x)?x.toFixed(2):'--',clean=x=>String(x??'--').replace(/[^A-Za-z0-9_.+-]/g,'_');
 const out=[
  'ZJDIAG','v=1','state='+state,'board='+clean(sample?.board||'?'),'fw='+clean(firmware),
  'seq='+clean(sample?.sequence??'?'),'uptime_ms='+clean(sample?.uptime??'?'),'age_ms='+clean(age??'?'),
  'sensor='+clean(sample?.sensor||'?'),'addr='+clean(sample?.address||'?'),
  'imu='+clean(sample?.sensorStatus||'UNKNOWN'),'roll_dps='+f(sample?.RateRoll),
  'pitch_dps='+f(sample?.RatePitch),'yaw_dps='+f(sample?.RateYaw),
  'led='+clean(sample?.led||'?'),'drop_rx='+clean(missed),'drop_device='+clean(sample?.deviceDrops??'?'),'err='+clean(err)
 ];
 return {state,text:out.join('|'),error:err};
}
