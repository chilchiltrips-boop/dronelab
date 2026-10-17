/* Phase 1 remote telemetry. Read-only phone→physical Kit telemetry through
 * approved encrypted WebRTC, independent of virtual simulator control.
 * Never sends /api/rc/claim, /preview, motor, firmware, or Wi-Fi commands.
 */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const PER_POLL_MS=1100,STALE_MS=2800,RC_DEADMAN_MS=350;
 let enabled=false,pending=false,readAt=0,lastSeen=0,sequence=0,kitId='',boundSession='',lastPacketAt=0;
 function write(id,s){const e=$(id);if(e)e.textContent=String(s)}
 function status(s){write('remoteTelemetryStatus',s)}
 function bound(){
  const relay=root.ZebjusDeviceRelay,session=relay?.status?.();
  return session?.paired===true&&session?.approved===true&&session?.connected===true?session:null;
 }
 function reset(message='Not connected'){
  lastSeen=lastPacketAt=sequence=0;kitId='';boundSession='';
  write('remoteKitName','—');write('remoteKitGyro','—');
  write('remoteKitRc','—');write('remoteKitAge','—');
  status(message);
 }
 function start(){
  if(!bound()){reset('Pair Android and confirm its Safety PIN first');return}
  enabled=true;readAt=0;
  const b=$('remoteTelemetryToggle');if(b)b.textContent='Stop remote telemetry';
  status('Waiting for Android read-only Kit permission…');
 }
 function stop(message='Remote telemetry stopped'){
  enabled=false;
  const b=$('remoteTelemetryToggle');if(b)b.textContent='Start remote telemetry';
  reset(message);
 }
 function validate(data,session){
  if(!data||typeof data!=='object'||!/^ZFC-A[12]-[0-9A-F]{12}$/i.test(data.kitId||''))throw Error('Kit identity missing');
  if(!session?.sessionId||!bound()||bound().sessionId!==session.sessionId)throw Error('WebRTC session changed');
  if(kitId&&kitId!==data.kitId)throw Error('Physical Kit changed; start new monitoring session');
  if(!Number.isSafeInteger(data.millis)||data.millis<0||
    !['A1','A2'].includes(data.board)||typeof data.gyroReady!=='boolean')throw Error('Invalid Kit telemetry');
  const gyro=['roll','pitch','yaw'].map(k=>Number(data[k]));
  if(gyro.some(x=>!Number.isFinite(x)||Math.abs(x)>50000))throw Error('Invalid gyro data');
  return gyro;
 }
 function render(data,gyro){
  const rc=data.rc||{},now=Date.now(),fresh=rc.inputValid===true&&rc.failsafe===false&&
    ['WEB','ANDROID','PPM'].includes(rc.source)&&Number.isSafeInteger(rc.seq)&&rc.seq>0&&
    Number.isFinite(rc.ageMs)&&rc.ageMs>=0&&rc.ageMs<=RC_DEADMAN_MS&&
    ['throttle','roll','pitch','yaw'].every(c=>Number.isSafeInteger(rc[c])&&rc[c]>=1000&&rc[c]<=2000);
  if(fresh&&rc.seq!==sequence){lastPacketAt=now;sequence=rc.seq}
  write('remoteKitName',data.kitId+' • '+data.board);
  write('remoteKitGyro',data.gyroReady?gyro.map(v=>v.toFixed(2)).join(' / ')+' °/s':'GYRO NOT READY');
  write('remoteKitRc',fresh?rc.source+' • '+[rc.throttle,rc.roll,rc.pitch,rc.yaw].join(' / '):'NO LIVE RC • MOTORS OFF');
  write('remoteKitAge',fresh?Math.round(rc.ageMs)+' ms':'—');
  status(fresh?'REMOTE KIT TELEMETRY LIVE • RC '+rc.source+' • MOTORS OFF':
    'REMOTE GYRO LIVE • RC IDLE / FAILSAFE • MOTORS OFF');
  lastSeen=now;
 }
 async function poll(){
  if(!enabled||pending||document.hidden||!$('remoteTelemetryPanel'))return;
  const current=bound();
  if(!current){stop('WebRTC lost • re-pair and explicitly start telemetry');return}
  if(boundSession&&current.sessionId!==boundSession){stop('New WebRTC session • remote telemetry reset');return}
  boundSession=current.sessionId;
  if(Date.now()-readAt<PER_POLL_MS)return;
  readAt=Date.now();pending=true;
  try{
   const data=await root.ZebjusDeviceRelay.request('/api/telemetry');
   const gyro=validate(data,current);
   kitId=data.kitId;render(data,gyro);
  }catch(e){
   const note=String(e?.message||'Read failed').slice(0,100);
   if(/Physical Kit changed|WebRTC session changed|identity missing/.test(note)){stop(note);return}
   // A permission-denied or interrupted relay cannot be shown as healthy.
   status('REMOTE TELEMETRY UNAVAILABLE • '+note);
  }finally{pending=false}
 }
 function tick(){
  if(!enabled)return;
  if(!bound()){stop('Disconnected • remote telemetry stopped');return}
  if(lastSeen&&Date.now()-lastSeen>STALE_MS){
   write('remoteKitRc','STALE • NO LIVE INPUT');write('remoteKitAge','—');
   status('REMOTE TELEMETRY STALE • awaiting verified Kit');
  }
  if(!document.hidden)void poll();
 }
 function setup(){
  if(!$('remoteTelemetryToggle'))return;
  $('remoteTelemetryToggle').addEventListener('click',()=>enabled?stop():start());
  setInterval(tick,300);
  root.addEventListener('pagehide',()=>stop('Page closed'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Browser backgrounded • remote telemetry stopped')});
  setInterval(()=>{
   const s=root.ZebjusRemoteRTC?.status?.();
   write('remoteIceStatus',s?(s.turnReady?'TURN RELAY READY':'STUN ONLY • TURN NOT CONFIGURED'):
     'STUN default');
  },2500);
  tick();
 }
 if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
 }
 root.ZebjusRemoteTelemetry=Object.freeze({start,stop});
})(typeof window!=='undefined'?window:globalThis);
