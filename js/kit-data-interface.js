/* Read-only FlightCore hardware data routing.
 * AP / STA / Android WebRTC relay share the same verified Kit contract;
 * USB uses the physically verified Serial frame state, not fake HTTP.
 * This module never claims RC control or alters firmware permissions.
 */
(function(root){
 'use strict';
 const network=new Set(['ap','sta','android-relay']);
 const neutral={throttle:1000,roll:1500,pitch:1500,yaw:1500};
 const safePulse=value=>Number.isSafeInteger(value)&&value>=1000&&value<=2000;
 function flightModeState(d){
  const m=d?.flightModeState;
  return m?.supported===true&&['angle','acro'].includes(m.saved)&&['angle','acro'].includes(m.active)&&
   (m.pending===null||m.pending===m.saved)&&((m.pending===null)===(m.saved===m.active))?{...m}:null;
 }
 function isNetwork(transport){return network.has(String(transport||'').toLowerCase())}
 // Single-flight diagnostic GETs; no control or mutation request may be queued here.
 function createReadScheduler({now=()=>Date.now(),limit=16}={}){
  const entries=new Map();let epoch=0;
  const clear=()=>{++epoch;entries.clear()};
  function read(key,load,ttl=0){
   const old=entries.get(key);
   if(old?.pending)return old.pending;
   if(old&&now()-old.at<ttl)return Promise.resolve(old.value);
   if(entries.size>=limit&&[...entries.values()].every(v=>v.pending))return Promise.reject(Error('Read queue full'));
   const generation=epoch,entry={at:0};
   entry.pending=Promise.resolve().then(load).then(value=>{
    if(generation!==epoch)throw Error('Read generation changed');
    entry.value=value;entry.at=now();return value;
   }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error})
    .finally(()=>{entry.pending=null});
   entries.set(key,entry);
   for(const [id,e] of entries){if(entries.size<=limit)break;if(!e.pending)entries.delete(id)}
   return entry.pending;
  }
  const invalidate=()=>{for(const [id,e] of entries)if(!e.pending)entries.delete(id)};
  return {read,clear,invalidate};
 }
 // A monitoring path is usable only after physical/Kit ID verification.
 function selectMonitorPath(kit,paths,choice='auto',at=Date.now()){
  const verified=(Array.isArray(paths)?paths:[]).filter(p=>p.verified===true&&p.available===true&&p.kitId===kit?.kitId);
  const usb=verified.find(p=>p.transport==='usb'&&at-(p.lastPacketAt||0)<=900);
  const direct=verified.find(p=>['ap','sta'].includes(p.transport)&&p.fresh===true);
  const relay=verified.find(p=>p.transport==='android-relay'&&p.permitted===true&&p.fresh===true);
  const selected=choice==='auto'?(usb||direct||relay||verified.find(p=>p.transport==='usb')):
   verified.find(p=>p.transport===choice&&(choice==='usb'||p.fresh===true)&&
    (choice!=='android-relay'||p.permitted===true));
  return {path:selected||null,reason:selected?
   (choice==='auto'?'AUTO • verified '+selected.transport.toUpperCase():'Manual • verified '+choice.toUpperCase()):
   'No verified '+(choice==='auto'?'monitor path':choice.toUpperCase()+' path')+' available'};
 }
 function matchesTarget(kit,target){
  if(!kit?.connected||!kit.kitId)return false;
  if(target==='usb')return kit.transport==='usb';
  if(target==='android-relay')return kit.transport==='android-relay';
  return ['ap','sta'].includes(target)&&(kit.transport===target||
   kit.transport==='android-relay'&&kit.physicalLink===target);
 }
 function resolvePythonTarget(kit,paths,requested='auto',operation='read',at=Date.now()){
  if(requested==='python')return {transport:'python',kitId:'',capability:'isolated',reason:'Python Simulator • hardware access disabled'};
  const candidates=(Array.isArray(paths)?paths:[]).filter(p=>p.verified===true&&p.available===true&&p.kitId===kit?.kitId&&(p.transport==='usb'||kit?.connected===true)&&
   (p.transport==='usb'?(p.fresh===true||p.lastPacketAt>0&&at-p.lastPacketAt<=900):p.fresh===true)&&
   (p.transport!=='android-relay'||p.permitted===true));
  const write=['led','i2c_scan','wifi_scan','wifi_test_save'].includes(operation);
  const compatible=p=>{
   if(['wifi_scan','wifi_test_save'].includes(operation))return ['ap','sta'].includes(p.transport)&&kit.setupAuthorized===true&&!kit.owner&&!kit.rc?.claimed;
   if(write&&p.transport==='android-relay'&&requested==='auto')return false; // Auto relay is read-only; manual Android grants still govern every request
   return !write||p.transport==='usb'||kit.controlAuthorized===true;
  };
  const order=['usb','ap','sta','android-relay'];
  const path=candidates.filter(p=>(requested==='auto'||p.transport===requested||p.transport==='android-relay'&&kit?.physicalLink===requested)&&compatible(p))
   .sort((a,b)=>order.indexOf(a.transport)-order.indexOf(b.transport))[0];
  if(!path)return {transport:null,kitId:kit?.kitId||'',capability:'none',reason:'NO VERIFIED KIT • '+operation+' needs a fresh, authorized '+(requested==='auto'?'compatible USB/AP/STA/Relay connection':requested.toUpperCase()+' connection')+'. Connect Kit in Devices & Firmware.'};
  return {transport:path.transport,kitId:path.kitId,bootId:kit.bootId||'',physicalLink:kit.physicalLink||'',generation:path.generation,
   relaySessionId:kit.relaySessionId||'',capability:path.transport==='usb'||kit.controlAuthorized&&(path.transport!=='android-relay'||requested!=='auto')?'read/write diagnostics':'read-only',
   reason:(requested==='auto'?'AUTO • ':'Manual • ')+'verified '+path.transport.toUpperCase()+' • '+operation+' supported; firmware authorization applies'};
 }
 function validatePythonBinding(binding,kit,paths){
  const current=resolvePythonTarget(kit,paths,binding.transport,'read');
  if(!current.transport||current.transport!==binding.transport||current.kitId!==binding.kitId||
   binding.transport==='usb'&&current.generation!==binding.generation||
   binding.transport!=='usb'&&(current.bootId!==binding.bootId||current.physicalLink!==binding.physicalLink||current.relaySessionId!==binding.relaySessionId))
   throw Error('KitDataDisconnectedError: Python hardware connection, Device ID or session changed. Stop, verify the intended Kit and Run again.');
  return current;
 }
 function validateReply(before,after,reply,{requireKitId=true}={}){
  if(!before?.connected||!before.kitId||!after?.connected||after.kitId!==before.kitId||
    after.transport!==before.transport)throw Error('NetworkDisconnectedError: verified Kit identity or transport changed during read.');
  if(requireKitId&&reply?.kitId!==before.kitId)throw Error('Device ID mismatch or absent: Kit data rejected.');
  if(reply?.kitId&&reply.kitId!==before.kitId)throw Error('Device ID mismatch: Kit data rejected.');
  return reply;
 }
 function usbJoystick(kit,now=Date.now()){
  if(!matchesTarget(kit,'usb'))throw Error('USBDisconnectedError: connect and verify the physical USB Kit.');
  const rc=kit.rc||{},source=['WEB','ANDROID','PPM'].includes(rc.source)?rc.source:'NONE';
  const age=kit.rcAt?Math.max(0,now-kit.rcAt)+(Number.isFinite(rc.ageMs)?rc.ageMs:0):null;
  const fresh=rc.active===true&&source!=='NONE'&&age!==null&&age<=350&&
   ['throttle','roll','pitch','yaw'].every(c=>safePulse(rc[c]));
  const seq=Number.isSafeInteger(rc.seq)&&rc.seq>=0?rc.seq:0;
  return {kitId:kit.kitId,device_id:kit.kitId,source:fresh?source:'NONE',transport:'usb',
   seq,ageMs:age,age_ms:age,active:fresh,inputValid:fresh,input_valid:fresh,
   failsafe:!fresh,inputArmed:fresh&&rc.inputArmed===true,
   throttle:fresh?rc.throttle:neutral.throttle,roll:fresh?rc.roll:neutral.roll,
   pitch:fresh?rc.pitch:neutral.pitch,yaw:fresh?rc.yaw:neutral.yaw,
   ch5:safePulse(rc.ch5)?rc.ch5:null,ch6:safePulse(rc.ch6)?rc.ch6:null,flightMode:kit.flightMode||null,flightModeState:kit.flightModeState||null,
   accepted:null,rejected:null,round_trip_ms:0,motorsDisabled:true,motors_disabled:true,
   motorsArmed:false,readSource:'verified-usb-serial'};
 }
 root.ZebjusKitData=Object.freeze({flightModeState,createReadScheduler,selectMonitorPath,isNetwork,matchesTarget,resolvePythonTarget,validatePythonBinding,validateReply,usbJoystick});
})(globalThis);
