import './serial-rc-decoder.js?v=ppm-ch8-20261017';
// Presentation only. USB monitor, gyro/Python parsers and plotter retain original bytes.
// Accepts original 12-field ZJTEL + separate ZJRC, and native 20-field combined ZJTEL.
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
  const decoded=globalThis.ZebjusSerialRcDecoder.parseSerialRc(value);
  if(decoded?.kind==='frame'){
   rc={...decoded,armed:decoded.inputArmed,at:now()};
   if(value.startsWith('ZJRC,'))return null; // Combined ZJTEL still renders the gyro + RC line.
  }
  if(decoded?.kind==='reset'){rc=null;return value+' • input reset • MOTORS OFF'}
  if(decoded?.kind==='claim'){rc=null;return value+' • waiting for input • MOTORS OFF'}
  if(decoded?.kind==='idle')rc=null;
  if(/^ZJRC,(?:USB|AP|STA),(?:WEB|ANDROID),/.test(value))return null; // Invalid legacy frames never show as verified input.
  if(!value.startsWith('ZJTEL,1,'))return value;
  const f=value.split(',');
  if(![12,20].includes(f.length)||!/^A[12]$/.test(f[2])||!safeInt(f[3])||!safeInt(f[4])||
     !/^0x[0-9a-f]{2}$/i.test(f[5])||!safeInt(f[11])||
     !/^(?:READY|NOT_FOUND|READ_ERROR|STARTING)$/.test(f[6]))return value;
  const rates=f.slice(7,10).map(angle);
  if(rates.some(v=>v===null))return value;
  // The exact same validated RC frame feeds the dashboard and readable monitor.
  if(f.length===20&&!['frame','idle'].includes(decoded?.kind))return value;
  const timestamp=now();
  if(timestamp-lastPrint<intervalMs)return null;
  lastPrint=timestamp;
  const active=rc&&timestamp-rc.at<=staleMs;
  const out=active?
    'RC '+rc.transport+'/'+rc.source+' #'+rc.seq+' | THR='+rc.throttle+' ROLL='+rc.roll+' PITCH='+rc.pitch+
       ' YAW='+rc.yaw+' | INPUT '+(rc.armed?'ARMED':'DISARMED'):
    'RC '+(rc?'STALE / FAILSAFE':'IDLE')+' | THR=1000 ROLL=1500 PITCH=1500 YAW=1500 | INPUT OFF';
  return f[2]+' | IMU '+f[6]+' ('+f[5]+') | Gyro R='+rates[0]+' P='+rates[1]+
      ' Y='+rates[2]+' deg/s | '+out+' | MOTORS OFF';
 }
 return {view,clear};
}
