// Convert the existing serial I2C scanner output to structured results.
// No changes to the exact Arduino sketch or firmware are necessary.
export function createI2CParser(onScan=()=>{}){
 let collecting=false,addresses=[],last=null;
 function acceptLine(raw){
  const line=String(raw??'').trim();
  if(/Scanning I2C bus/i.test(line)){collecting=true;addresses=[];return null}
  if(!collecting)return null;
  const device=line.match(/Found device at 0x([0-9a-f]{1,2})\b/i);
  if(device){
   const num=parseInt(device[1],16);
   const addr='0x'+num.toString(16).toUpperCase().padStart(2,'0');
   if(num>0&&num<127&&!addresses.includes(addr))addresses.push(addr);
   return null;
  }
  if(/No I2C devices found/i.test(line))return complete([]);
  const total=line.match(/Total I2C devices found:\s*(\d+)/i);
  if(total)return complete(addresses,Number(total[1]));
  return null;
 }
 function complete(addressList,reported=null){
  collecting=false;
  const data={addresses:[...addressList],total:addressList.length,reported_count:reported??addressList.length,timestamp:new Date().toISOString(),source:'USB Serial'};
  last=data;onScan(data);return data;
 }
 return {acceptLine,getLatest:()=>last,reset:()=>{collecting=false;addresses=[];last=null}};
}
export function createI2CBridge({host=window,parser=createI2CParser()}={}){
 const subs=new Set(),pending=new Set();
 const report=scan=>{
  for(const handler of subs)try{handler(scan)}catch{}
  for(const p of [...pending]){clearTimeout(p.timer);pending.delete(p);p.resolve(scan)}
 };
 const p=createI2CParser(report);
 function handler(e){p.acceptLine(e?.detail?.line)}
 host.addEventListener('dronelab:serial-line',handler);
 function waitForScan(timeoutMs=12000){
  const ms=Math.max(1000,Math.min(60000,Number(timeoutMs)||12000));
  return new Promise((resolve,reject)=>{
   const p={resolve,reject,timer:null};
   p.timer=setTimeout(()=>{pending.delete(p);reject(new Error('No I2C scan received in '+ms+' ms. Open the USB Serial Port at 115200 and check that the scanner firmware is running.'))},ms);
   pending.add(p);
  });
 }
 function subscribe(cb){subs.add(cb);return()=>subs.delete(cb)}
 function close(){host.removeEventListener('dronelab:serial-line',handler);for(const p of pending){clearTimeout(p.timer);p.reject(new Error('USB I2C bridge closed'))}pending.clear();subs.clear()}
 return {waitForScan,subscribe,getLatest:p.getLatest,close};
}


// FlightCore v1.3 USB gyro frames are emitted by the board firmware. This
// listener does not probe I2C from the browser or take ownership of Serial.
// Other connected I2C devices remain visible through createI2CBridge().
export const FLIGHTCORE_GYROS=Object.freeze({
 A1:Object.freeze({sensor:'LSM6DS3',address:'0x6B'}),
 A2:Object.freeze({sensor:'MPU6050',address:'0x68'})
});
export function createGyroParser(onReading=()=>{},onFailure=()=>{}){
 let last=null,unifiedSeen=false,latestError='';
 const fail=(message)=>{
  last=null;latestError=message;onFailure(message);
 };
 const makeReading=(board,address,roll,pitch,yaw,source,seq=null,boardMs=null,deviceDrops=0)=>{
  const spec=FLIGHTCORE_GYROS[board];
  if(!spec||address!==spec.address)return null;
  const rates=[roll,pitch,yaw].map(Number);
  if(!rates.every(Number.isFinite))return null;
  const data={board,boardId:'ZFC-'+board,sensor:spec.sensor,address,
   RateRoll:rates[0],RatePitch:rates[1],RateYaw:rates[2],
   units:'deg/s',status:'READY',source,sequence:seq,boardMs,deviceDrops,
   timestamp:new Date().toISOString()};
  latestError='';last=data;onReading(data);return data;
 };
 function acceptLine(raw){
  const line=String(raw??'').trim();
  if(!line)return null;
  const f=line.split(',');
  if(f[0]==='ZJTEL'&&f[1]==='1'&&f.length===12){
   const board=f[2],spec=FLIGHTCORE_GYROS[board],addr=f[5].toUpperCase();
   const seq=Number(f[3]),ms=Number(f[4]),drops=Number(f[11]);
   if(!spec||addr!==spec.address||![seq,ms,drops].every(x=>Number.isSafeInteger(x)&&x>=0))return null;
   unifiedSeen=true;
   if(f[6]==='STARTING')return null;
   if(f[6]!=='READY'){fail(spec.sensor+' '+addr+' on '+board+' is '+f[6]+'. Check sensor power and I2C wiring.');return null}
   return makeReading(board,addr,f[7],f[8],f[9],'ZJTEL',seq,ms,drops);
  }
  if(f[0]==='ZJGYRO'&&f[1]==='STATUS'&&f.length>=6){
   const board=f[2],spec=FLIGHTCORE_GYROS[board];
   if(spec&&f[3]===spec.sensor&&f[4].toUpperCase()===spec.address&&f[5]!=='READY')
    fail(spec.sensor+' '+spec.address+' on '+board+' is '+f[5]+'. Check SDA/SCL, 3V3, GND.');
   return null;
  }
  // Older FlightCore firmware has only ZJGYRO,DATA. Do not double-count the
  // low-rate legacy frame after a versioned ZJTEL stream has been seen.
  if(!unifiedSeen&&f[0]==='ZJGYRO'&&f[1]==='DATA'&&f.length===8){
   const board=f[2],spec=FLIGHTCORE_GYROS[board];
   if(spec&&f[3]===spec.sensor&&f[4].toUpperCase()===spec.address)
    return makeReading(board,spec.address,f[5],f[6],f[7],'ZJGYRO');
  }
  return null;
 }
 return {acceptLine,getLatest:()=>last,getError:()=>latestError,reset:()=>{last=null;unifiedSeen=false;latestError=''}};
}
export function createGyroBridge({host=window}={}){
 const waiting=new Set();
 let latestError='',disconnected=false;
 const parser=createGyroParser(
  reading=>{
   for(const p of [...waiting]){clearTimeout(p.timer);waiting.delete(p);p.resolve(reading)}
  },
  message=>{
   latestError=message;
   for(const p of [...waiting]){clearTimeout(p.timer);waiting.delete(p);p.reject(new Error(message))}
  }
 );
 const serial=e=>parser.acceptLine(e?.detail?.line);
 const usbState=e=>{
  if(e?.detail?.connected===true){disconnected=false;latestError='';parser.reset();return}
  if(e?.detail?.connected===false){
   disconnected=true;parser.reset();
   latestError='USB Serial disconnected. Reconnect the running FlightCore firmware at 115200 baud.';
   for(const p of [...waiting]){clearTimeout(p.timer);waiting.delete(p);p.reject(new Error(latestError))}
  }
 };
 host.addEventListener('dronelab:serial-line',serial);
 host.addEventListener('dronelab:usb-state',usbState);
 function readGyro(timeoutMs=3000){
  const timeout=Math.max(200,Math.min(10000,Number(timeoutMs)||3000));
  if(disconnected)return Promise.reject(new Error('USBDisconnectedError: '+latestError));
  return new Promise((resolve,reject)=>{
   const entry={resolve,reject,timer:null};
   entry.timer=setTimeout(()=>{
    waiting.delete(entry);
    reject(new Error('No live gyro frame within '+timeout+' ms. Check USB Serial, firmware version, and A1 0x6B / A2 0x68 wiring.'));
   },timeout);
   waiting.add(entry);
  });
 }
 function close(){
  host.removeEventListener('dronelab:serial-line',serial);
  host.removeEventListener('dronelab:usb-state',usbState);
  for(const p of waiting){clearTimeout(p.timer);p.reject(new Error('USB gyro bridge closed'))}
  waiting.clear();parser.reset();
 }
 return {readGyro,getLatest:parser.getLatest,getError:parser.getError,close};
}
