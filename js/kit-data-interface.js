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
 function isNetwork(transport){return network.has(String(transport||'').toLowerCase())}
 function createReadScheduler({now=()=>Date.now(),limit=16}={}){
  const entries=new Map();let epoch=0;
  function clear(){++epoch;entries.clear()}
  function read(key,load,ttl=0){
   const old=entries.get(key);if(old?.pending)return old.pending;
   if(old&&now()-old.at<ttl)return Promise.resolve(old.value);
   if(entries.size>=limit&&[...entries.values()].every(e=>e.pending))return Promise.reject(Error('Read queue capacity reached'));
   const generation=epoch,entry={at:0};
   const pending=Promise.resolve().then(load).then(value=>{if(generation!==epoch)throw Error('Read generation changed');entry.value=value;entry.at=now();return value;})
    .catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error}).finally(()=>{entry.pending=null});
   entry.pending=pending;entries.set(key,entry);
   for(const [id,e] of entries){if(entries.size<=limit)break;if(!e.pending)entries.delete(id)}
   return pending;
  }
  function invalidate(){for(const [key,e] of entries)if(!e.pending)entries.delete(key)}
  return {read,clear,invalidate};
 }
 function selectMonitorPath(kit,paths,choice='auto',now=Date.now()){
  const verified=paths.filter(p=>p.verified===true&&p.kitId===kit?.kitId&&p.available===true);
  const usb=verified.find(p=>p.transport==='usb'&&now-(p.lastPacketAt||0)<=900);
  const direct=verified.find(p=>['sta','ap'].includes(p.transport)&&p.fresh===true);
  const relay=verified.find(p=>p.transport==='android-relay'&&p.permitted===true&&p.fresh===true);
  const selected=choice==='auto'?(usb||direct||relay||verified.find(p=>p.transport==='usb')):verified.find(p=>p.transport===choice&&(choice==='usb'||p.fresh===true));
  return {path:selected||null,reason:selected?(choice==='auto'?'AUTO • verified '+selected.transport.toUpperCase():'Manual • verified '+choice.toUpperCase()):'No verified '+(choice==='auto'?'monitor path':choice.toUpperCase()+' path')+' available for this Kit'};
 }
 function matchesTarget(kit,target){
  if(!kit?.connected||!kit.kitId)return false;
  if(target==='usb')return kit.transport==='usb';
  if(target==='android-relay')return kit.transport==='android-relay';
  return ['ap','sta'].includes(target)&&(kit.transport===target||
   kit.transport==='android-relay'&&kit.physicalLink===target);
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
  const age=kit.rcAt?Math.max(0,now-kit.rcAt):null;
  const fresh=rc.active===true&&source!=='NONE'&&age!==null&&age<=350&&
   ['throttle','roll','pitch','yaw'].every(c=>safePulse(rc[c]));
  const seq=Number.isSafeInteger(rc.seq)&&rc.seq>=0?rc.seq:0;
  return {kitId:kit.kitId,device_id:kit.kitId,source:fresh?source:'NONE',transport:'usb',
   monitorTransport:'USB',inputTransport:String(rc.transport||'NONE').toUpperCase(),seq,ageMs:age,age_ms:age,active:fresh,inputValid:fresh,input_valid:fresh,
   failsafe:!fresh,inputArmed:fresh&&rc.inputArmed===true,
   throttle:fresh?rc.throttle:neutral.throttle,roll:fresh?rc.roll:neutral.roll,
   pitch:fresh?rc.pitch:neutral.pitch,yaw:fresh?rc.yaw:neutral.yaw,
   accepted:null,rejected:null,round_trip_ms:0,motorsDisabled:true,motors_disabled:true,
   motorsArmed:false,readSource:'verified-usb-serial'};
 }
 root.ZebjusKitData=Object.freeze({createReadScheduler,selectMonitorPath,isNetwork,matchesTarget,validateReply,usbJoystick});
})(globalThis);
