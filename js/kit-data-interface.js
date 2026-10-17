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
   seq,ageMs:age,age_ms:age,active:fresh,inputValid:fresh,input_valid:fresh,
   failsafe:!fresh,inputArmed:fresh&&rc.inputArmed===true,
   throttle:fresh?rc.throttle:neutral.throttle,roll:fresh?rc.roll:neutral.roll,
   pitch:fresh?rc.pitch:neutral.pitch,yaw:fresh?rc.yaw:neutral.yaw,
   accepted:null,rejected:null,round_trip_ms:0,motorsDisabled:true,motors_disabled:true,
   motorsArmed:false,readSource:'verified-usb-serial'};
 }
 root.ZebjusKitData=Object.freeze({isNetwork,matchesTarget,validateReply,usbJoystick});
})(globalThis);
