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
