// Human-readable FlightCore USB monitor. Presentation only: never alter,
// suppress or delay the raw serial lines used by WebApp, Python and plotters.
// Supports the shipped FlightCore A1/A2 ZJTEL v1 and ZJRC diagnostic frames.
export function createReadableKitMonitor({now=()=>Date.now(),intervalMs=200,staleMs=350}={}){
 let rc=null,lastPrint=-Infinity;
 const safeInt=s=>/^\d{1,10}$/.test(String(s))&&Number.isSafeInteger(Number(s));
 const angle=s=>{
  if(!/^[+-]?(?:\d{1,5}(?:\.\d{1,3})?|\.\d{1,3})$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2):null;
 };
 function clear(){rc=null;lastPrint=-Infinity}
 function view(line){
  const value=String(line||'').trim();
  const frame=/^ZJRC,(AP|STA|USB),(ANDROID|WEB),(\d+),T=(\d+),R=(\d+),P=(\d+),Y=(\d+),ARM=([01])$/.exec(value);
  if(frame){
   const numbers=frame.slice(3,8).map(Number);
   if(numbers.every((n,i)=>Number.isSafeInteger(n)&&(i===0?n>0:n>=1000&&n<=2000))){
    rc={transport:frame[1],source:frame[2],seq:numbers[0],throttle:numbers[1],roll:numbers[2],pitch:numbers[3],yaw:numbers[4],armed:frame[8]==='1',at:now()};
   }
   return null; // The next telemetry sample includes RC data in ONE line.
  }
  if(/^ZJRC,(?:RELEASE|FAILSAFE|STOP),/.test(value)){rc=null;return value+' • input reset • MOTORS OFF'}
  if(/^ZJRC,CLAIM,/.test(value)){rc=null;return value+' • waiting for input • MOTORS OFF'}
  if(!value.startsWith('ZJTEL,1,'))return value;
  const f=value.split(',');
  if(f.length!==12||!/^A[12]$/.test(f[2])||!safeInt(f[3])||!safeInt(f[4])||
     !/^0x[0-9a-f]{2}$/i.test(f[5])||!safeInt(f[11])||
     !/^(?:READY|NOT_FOUND|READ_ERROR|STARTING|[A-Z_]{2,28})$/.test(f[6]))return value;
  const rates=f.slice(7,10).map(angle);
  if(rates.some(x=>x===null))return value;
  const timestamp=now();
  if(timestamp-lastPrint<intervalMs)return null;
  lastPrint=timestamp;
  const active=rc&&timestamp-rc.at<=staleMs;
  const readout=active?
   'RC '+rc.transport+'/'+rc.source+' #'+rc.seq+
   ' | THR='+rc.throttle+' ROLL='+rc.roll+' PITCH='+rc.pitch+' YAW='+rc.yaw+
   ' | INPUT '+(rc.armed?'ARMED':'DISARMED'):
   'RC '+(rc?'STALE / FAILSAFE':'IDLE')+' | THR=1000 ROLL=1500 PITCH=1500 YAW=1500 | INPUT OFF';
  return f[2]+' | IMU '+f[6]+' ('+f[5]+') | Gyro R='+rates[0]+' P='+rates[1]+
    ' Y='+rates[2]+' deg/s | '+readout+' | MOTORS OFF';
 }
 return {view,clear};
}
