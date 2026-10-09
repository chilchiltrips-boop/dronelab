/* Landscape input preview + authenticated virtual-flight transmitter. */
(function(){'use strict';
const $=id=>document.getElementById(id),F=window.ZebjusFlightMath;
let peer=null,sender=null,raf=0,last=0,seq=0,preset='Medium',left=null,right=null,throttle=1000,mode='angle',armed=false,halted=true,ready=false,lastAckAt=0,lastAckSeq=0,sent=new Map(),drag={left:null,right:null},loopStarted=false,lastApplied=null,authority=false,sessionId='',splashTimer=null;
const settingsKey='zebjus.flight.preset.v1';
try{const v=localStorage.getItem(settingsKey);if(F.PRESETS[v])preset=v}catch{}
const current=()=>F.mapState({left:left||{x:0,y:0},right:right||{x:0,y:0},throttle,mode,armed,preset});
function isOwned(){const s=peer?.status();return !!s?.connected&&!!s?.paired&&s.controller==='mobile'&&s.simulatorReady===true}
function clearTouches(){
 for(const side of ['left','right']){
  const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),id=drag[side]?.id;drag[side]=null;
  if(id!=null&&pad?.hasPointerCapture(id))try{pad.releasePointerCapture(id)}catch{}
 }
 left=right=null;
}
function skipIntro(){clearTimeout(splashTimer);$('flightSplash').hidden=true}
function stopLocally(message='STOP • DISARMED'){
 armed=false;halted=true;throttle=1000;clearTouches();sent.clear();ready=false;lastApplied=null;skipIntro();
 render();updateStatus(message);
}
function updateStatus(message){
 $('flightWarning').textContent=message;
 $('flightConnection').textContent=peer?.status().connected?'WEBRTC CONNECTED':'DISCONNECTED';
 $('flightConnection').dataset.ready=String(isOwned());
 $('flightOwner').textContent=isOwned()?'ANDROID OWNS CONTROLS':peer?.status().controller==='web'?'WEB OWNS CONTROLS':'INPUT PREVIEW • NO FLIGHT COMMAND';
}
function stickRender(side,position){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),ring=$(side==='left'?'flightLeftRing':'flightRightRing'),knob=$(side==='left'?'flightLeftKnob':'flightRightKnob'),label=$(side==='left'?'flightLeftTouch':'flightRightTouch');
 if(!position){ring.style.left='50%';ring.style.top='67%';ring.classList.remove('dragging');knob.style.transform='translate(-50%,-50%)';label.textContent=armed&&isOwned()?'TOUCH TO CONTROL':'TOUCH TO PREVIEW';return}
 const rect=pad.getBoundingClientRect(),d=position.data;
 ring.style.left=(position.cx-rect.left)+'px';ring.style.top=(position.cy-rect.top)+'px';ring.classList.add('dragging');
 knob.style.transform='translate(calc(-50% + '+(d.x*position.radius)+'px), calc(-50% + '+(d.y*position.radius)+'px))';
 label.textContent='X '+Math.round(d.x*100)+'% Y '+Math.round(-d.y*100)+'% • '+(armed&&isOwned()?'FLIGHT':'PREVIEW ONLY');
}
function render(){
 const preview=current(),a=isOwned()&&armed&&lastApplied?.armed?lastApplied:null;
 const m=a?{...a.axes,throttle:a.throttle}:preview;
 $('flightThrottle').textContent=m.throttle+' µs';$('flightRoll').textContent=Math.round(m.roll*100)+'%';$('flightPitch').textContent=Math.round(m.pitch*100)+'%';$('flightYaw').textContent=Math.round(m.yaw*100)+'%';
 $('flightMode').value=mode;$('flightModeState').textContent=(a?'APPLIED • ':armed?'REQUESTED • ':'PREVIEW • ')+(mode==='acro'?'ACRO / RATE':'ANGLE');
 $('flightArm').textContent=armed?'DISARM':'ARM';$('flightArm').disabled=!isOwned()||(!armed&&(!ready||throttle>1050));$('flightArm').setAttribute('aria-pressed',String(armed));
 $('flightStop').disabled=false;$('flightPreset').value=preset;
 $('flightFeedback').textContent=lastAckSeq?'ACK #'+lastAckSeq+' • '+(performance.now()-lastAckAt>400?'STALE':$('flightLatency').textContent)+(a?' • APPLIED '+a.throttle+' µs': ' • DISARMED'):'INPUT PREVIEW • NO FLIGHT COMMAND';
 for(const side of ['left','right'])$(side==='left'?'flightLeftZone':'flightRightZone').dataset.preview=String(!isOwned()||!armed);
 $('flightTakeControl').disabled=!peer?.status().paired||isOwned();$('flightReleaseControl').disabled=!isOwned();
 $('flightSent').textContent='#'+seq;
 for(const side of ['left','right'])stickRender(side,drag[side]);
}
function setupStick(side){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone');
 const move=(e,first=false)=>{
  const d=drag[side];if(!d||d.id!==e.pointerId)return;
  d.data=first?{x:0,y:0}:F.vector(e.clientX,e.clientY,d.cx,d.cy,d.radius);
  if(side==='left')left=d.data;else right=d.data;
  if(!armed)updateStatus('INPUT PREVIEW • NO FLIGHT COMMAND');render();
 };
 pad.addEventListener('pointerdown',e=>{
  if(drag[side]||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();skipIntro();const zone=pad.getBoundingClientRect();
  drag[side]={id:e.pointerId,cx:e.clientX,cy:e.clientY,radius:Math.max(22,Math.min($(side==='left'?'flightLeftRing':'flightRightRing').getBoundingClientRect().width*.32,Math.min(zone.width,zone.height)*.28)),data:{x:0,y:0}};
  pad.setPointerCapture(e.pointerId);move(e,true);
 });
 pad.addEventListener('pointermove',e=>{if(drag[side]?.id===e.pointerId){e.preventDefault();move(e)}});
 const release=e=>{if(drag[side]?.id!==e.pointerId)return;drag[side]=null;if(side==='left')left=null;else right=null;render();if(isOwned()&&armed)send(true)};
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>pad.addEventListener(type,release));
}
function tick(now){
 if(!loopStarted)return;
 const dt=last?Math.min(.08,Math.max(0,(now-last)/1000)):0;last=now;
 if(drag.left&&isOwned()&&armed&&!halted)throttle=F.integrateThrottle(throttle,drag.left.data.y,dt,preset);
 for(const [key,val] of sent)if(now-val>2000)sent.delete(key);
 if(isOwned()&&armed&&lastAckAt&&now-lastAckAt>650){stopLocally('NO RECEIVER FEEDBACK • STOPPED');send(true)}
 if(Math.floor(now/80)!==Math.floor((now-dt*1000)/80))render();raf=requestAnimationFrame(tick);
}
function send(critical=false){
 if(!isOwned())return false;
 const m=halted?{...F.neutral(),mode}:current();
 const payload={seq:++seq,sessionId:peer.status().sessionId,mode:m.mode,armed:m.armed,throttle:m.throttle,axes:{roll:m.roll,pitch:m.pitch,yaw:m.yaw},sticks:halted?{left:{x:0,y:0},right:{x:0,y:0}}:{left:{...left||{x:0,y:0}},right:{...right||{x:0,y:0}}}};
 if(!peer.sendSimulatorControl(payload,critical))return false;
 sent.set(seq,performance.now());return true;
}
function connect(p){
 peer=p;authority=false;sessionId='';seq=lastAckSeq=0;lastAckAt=0;sent.clear();
 clearInterval(sender);sender=setInterval(()=>{if(isOwned())send()},40);
 updateStatus('INPUT PREVIEW • PAIR IN CONNECTION SETTINGS');render();
 if(!loopStarted){loopStarted=true;last=performance.now();raf=requestAnimationFrame(tick)}
}
function onStatus(s){
 if(s?.sessionId!==sessionId){if(authority||armed)stopLocally('NEW SESSION • DISARMED');sessionId=s?.sessionId||'';seq=lastAckSeq=0;lastAckAt=0;sent.clear();ready=false;lastApplied=null}
 const owns=isOwned();if(authority&&!owns)stopLocally('CONTROL LOST • SAFE STOP');
 if(!authority&&owns){stopLocally('CONNECTED • RECEIVER DISARM CHECK');send(true)}authority=owns;
 if(!owns)updateStatus('INPUT PREVIEW • NO FLIGHT COMMAND');else if(!armed)updateStatus(ready?'CONNECTED • THROTTLE LOW • READY TO ARM':'CONNECTED • WAITING FOR RECEIVER');render();
}
function validApplied(a){return a&&['angle','acro'].includes(a.mode)&&typeof a.armed==='boolean'&&Number.isInteger(a.throttle)&&a.throttle>=1000&&a.throttle<=2000&&a.axes&&['roll','pitch','yaw'].every(k=>Number.isFinite(a.axes[k])&&Math.abs(a.axes[k])<=1)}
function onAck(a){
 if(!a||a.sessionId!==peer?.status().sessionId||!Number.isSafeInteger(a.ackSeq)||a.ackSeq<=lastAckSeq)return;
 const sentTime=sent.get(a.ackSeq);if(sentTime==null)return;sent.delete(a.ackSeq);
 lastAckSeq=a.ackSeq;lastAckAt=performance.now();$('flightLatency').textContent=Math.round(lastAckAt-sentTime)+' ms';
 if(!a.accepted||!validApplied(a.applied)){stopLocally(a.reason||'INVALID RECEIVER FEEDBACK');return}
 lastApplied=a.applied;ready=true;
 if(armed&&!a.applied.armed){stopLocally('RECEIVER DISARMED');return}
 // Fractional local throttle integrates continuously; applied integer readout comes from the ACK.
 if(a.applied.mode!==mode)mode=a.applied.mode;
 onTelemetry({sessionId:a.sessionId,applied:a.applied});render();
}
function onTelemetry(packet){
 if(packet?.sessionId!==peer?.status().sessionId||!validApplied(packet.applied))return;
 const a=packet.applied;
 if(a.angles&&a.motors&&a.vertical){
  const finite=v=>Number.isFinite(v)?v:0;
  $('flightAppliedTelemetry').textContent='SIM • R '+finite(a.angles.roll).toFixed(1)+'° P '+finite(a.angles.pitch).toFixed(1)+'° Y '+finite(a.angles.yaw).toFixed(1)+'° • '+Math.round((a.motors.rpm||[]).reduce((v,n)=>v+finite(n),0)/4)+' RPM • z '+(finite(a.vertical.z)*100).toFixed(1)+' cm';
 }
 if(isOwned()&&armed&&!a.armed)stopLocally('WEB STOP • VIRTUAL MOTORS OFF');
 if(!isOwned())$('flightAppliedTelemetry').textContent+=' • '+a.throttle+' µs '+a.mode.toUpperCase()+' '+(a.armed?'WEB ARMED':'DISARMED');
}
function remoteStop(reason){stopLocally(reason||'WEB STOP • VIRTUAL MOTORS OFF');send(true)}
function doStop(){stopLocally('STOP • VIRTUAL MOTORS OFF');send(true)}
function openConnection(){clearTouches();render();const d=$('mobileConnection');if(!d.open)d.showModal();$('flightSettings').setAttribute('aria-expanded','true')}
function closeConnection(){window.ZebjusPairingStopCamera?.();$('mobileConnection').close();$('flightSettings').setAttribute('aria-expanded','false');$('flightSettings').focus()}
function bind(){
 setupStick('left');setupStick('right');
 $('flightArm').onclick=()=>{
  if(armed){doStop();return}if(!isOwned()||!ready){updateStatus('PAIR, GRANT CONTROL AND WAIT FOR RECEIVER');return}
  if(throttle>1050){updateStatus('THROTTLE MUST BE ≤1050');return}
  clearTouches();armed=true;halted=false;lastAckAt=performance.now();sent.clear();
  if(!send(true)){doStop();return}updateStatus('VIRTUAL ARM REQUESTED');render();
 };
 $('flightStop').onclick=doStop;$('mobileSettingsStop').onclick=doStop;
 $('flightMode').onchange=e=>{mode=e.target.value==='acro'?'acro':'angle';render();if(isOwned())send(true)};
 $('flightPreset').onchange=e=>{preset=F.PRESETS[e.target.value]?e.target.value:'Medium';clearTouches();try{localStorage.setItem(settingsKey,preset)}catch{}render()};
 $('flightPair').onclick=openConnection;$('flightBack').onclick=closeConnection;$('flightSettings').onclick=openConnection;
 $('mobileConnection').addEventListener('close',()=>{window.ZebjusPairingStopCamera?.();$('flightSettings').setAttribute('aria-expanded','false')});
 $('flightTakeControl').onclick=()=>{peer?.requestControl();updateStatus('REQUESTED • GRANT MOBILE CONTROL ON WEB')};
 $('flightReleaseControl').onclick=()=>{doStop();peer?.releaseControl();render()};
 window.addEventListener('blur',doStop);document.addEventListener('visibilitychange',()=>{if(document.hidden)doStop()});
 window.addEventListener('pagehide',()=>{doStop();clearInterval(sender);cancelAnimationFrame(raf);loopStarted=false});
 window.addEventListener('pageshow',e=>{if(e.persisted){connect(peer);doStop()}});
 window.addEventListener('resize',()=>{clearTouches();render()});window.addEventListener('orientationchange',doStop);
}
function show(){document.documentElement.classList.add('cockpit-active');$('flightCockpit').hidden=false;render()}
function intro(){
 show();const splash=$('flightSplash');if(matchMedia('(prefers-reduced-motion: reduce)').matches){splash.hidden=true;return}
 splash.hidden=false;splashTimer=setTimeout(()=>{splash.classList.add('closing');splashTimer=setTimeout(()=>splash.hidden=true,350)},4650);
}
function init(){bind();intro();render()}
window.ZebjusFlightApp={connect,onStatus,onAck,onTelemetry,remoteStop,doStop,show};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
