/* ZEBJUS v1.6 landscape virtual flight transmitter. Physical motors are NEVER driven. */
(function(){'use strict';
const $=id=>document.getElementById(id),F=window.ZebjusFlightMath;
let peer=null,active=false,splashTimer=null,sender=null,raf=0,last=0,seq=0,preset='Medium',left=null,right=null,throttle=1000,mode='angle',armed=false,halted=true,ready=false,lastAckAt=0,lastAckSeq=0,lastSentAt=0,sent=new Map(),drag={left:null,right:null},loopStarted=false,shown=false;
const settingsKey='zebjus.flight.preset.v1';
try{const v=localStorage.getItem(settingsKey);if(F.PRESETS[v])preset=v}catch{}
const current=()=>F.mapState({left:left||{x:0,y:0},right:right||{x:0,y:0},throttle,mode,armed,preset});
function stopLocally(message='STOP • DISARMED'){
 armed=false;halted=true;throttle=1000;left=right=null;
 drag.left=drag.right=null;sent.clear();ready=false;
 render();updateStatus(message);
}
function updateStatus(message){
 $('flightWarning').textContent=message;
 $('flightConnection').textContent=peer?.status().connected?'WEBRTC CONNECTED':'DISCONNECTED';
 $('flightConnection').dataset.ready=String(isOwned());
 $('flightOwner').textContent=isOwned()?'CONTROL GRANTED':'VIEW ONLY';
}
function isOwned(){const s=peer?.status();return !!s?.connected&&!!s?.paired&&s.controller==='mobile'&&s.simulatorReady===true}
function recenterView(side){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),ring=$(side==='left'?'flightLeftRing':'flightRightRing');
 if(!pad||!ring)return;
 ring.style.left='50%';ring.style.top='67%';ring.classList.remove('dragging');
 $(side==='left'?'flightLeftTouch':'flightRightTouch').textContent='TOUCH TO CONTROL';
}
function stickRender(side,position){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),ring=$(side==='left'?'flightLeftRing':'flightRightRing');
 const knob=$(side==='left'?'flightLeftKnob':'flightRightKnob'),label=$(side==='left'?'flightLeftTouch':'flightRightTouch');
 if(!pad||!ring)return;
 if(!position){knob.style.transform='translate(-50%,-50%)';recenterView(side);return}
 const rect=pad.getBoundingClientRect(),d=position.data;
 ring.style.left=(position.cx-rect.left)+'px';ring.style.top=(position.cy-rect.top)+'px';
 ring.classList.add('dragging');
 knob.style.transform='translate(calc(-50% + '+(d.x*position.radius)+'px), calc(-50% + '+(d.y*position.radius)+'px))';
 label.textContent='X '+Math.round(d.x*100)+'%  Y '+Math.round(-d.y*100)+'% • '+Math.round(position.cx-rect.left)+','+Math.round(position.cy-rect.top);
}
function render(){
 const m=current();
 $('flightThrottle').textContent=m.throttle+' µs';$('flightRoll').textContent=Math.round(m.roll*100)+'%';
 $('flightPitch').textContent=Math.round(m.pitch*100)+'%';$('flightYaw').textContent=Math.round(m.yaw*100)+'%';
 $('flightMode').value=mode;$('flightModeState').textContent=mode==='acro'?'ACRO / RATE':'ANGLE';
 $('flightArm').textContent=armed?'DISARM':'ARM';$('flightArm').disabled=!isOwned()||(!armed&&throttle>1050);
 $('flightArm').setAttribute('aria-pressed',String(armed));
 $('flightStop').disabled=false;$('flightPreset').value=preset;
 $('flightFeedback').textContent=lastAckSeq?'ACK #'+lastAckSeq+' • '+(Date.now()-lastAckAt>400?'STALE':$('flightLatency').textContent):'NO ACK';
 $('flightSent').textContent='#'+seq;
 for(const side of ['left','right'])stickRender(side,drag[side]);
}
function setupStick(side){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone');
 const move=(e,first)=>{
  const d=drag[side];if(!d||d.id!==e.pointerId)return;
  d.data=first?{x:0,y:0}:F.vector(e.clientX,e.clientY,d.cx,d.cy,d.radius);
  if(side==='left')left=d.data;else right=d.data;
  render();
 };
 pad.addEventListener('pointerdown',e=>{
  if(drag[side]||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();
  const zone=pad.getBoundingClientRect();
  drag[side]={id:e.pointerId,cx:e.clientX,cy:e.clientY,
   radius:Math.min($(side==='left'?'flightLeftRing':'flightRightRing').getBoundingClientRect().width*.32,Math.min(zone.width,zone.height)*.28),data:{x:0,y:0}};
  pad.setPointerCapture(e.pointerId);move(e,true);
 });
 pad.addEventListener('pointermove',e=>{if(drag[side]?.id===e.pointerId){e.preventDefault();move(e,false)}});
 const release=e=>{
  if(drag[side]?.id!==e.pointerId)return;
  drag[side]=null;if(side==='left')left=null;else right=null;
  render();
 };
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>pad.addEventListener(type,release));
}
function tick(now){
 if(!loopStarted)return;
 const dt=last?Math.min(.08,Math.max(0,(now-last)/1000)):0;last=now;
 if(drag.left&&isOwned()&&armed&&!halted)throttle=F.integrateThrottle(throttle,drag.left.data.y,dt,preset);
 if(sent.size){for(const [key,val] of sent)if(now-val>2000)sent.delete(key)}
 if(isOwned()&&armed&&lastAckAt&&performance.now()-lastAckAt>650){stopLocally('NO FEEDBACK • STOPPED');send(true)}
 if(Math.floor(now/80)!==Math.floor((now-dt*1000)/80))render();
 raf=requestAnimationFrame(tick);
}
function send(critical=false){
 if(!peer)return false;
 if(!isOwned())return false;
 const m=halted?F.neutral():current();
 const payload={seq:++seq,sessionId:peer.status().sessionId,mode:m.mode,armed:m.armed,
  throttle:m.throttle,axes:{roll:m.roll,pitch:m.pitch,yaw:m.yaw}};
 if(!peer.sendSimulatorControl(payload,critical))return false;
 sent.set(seq,performance.now());lastSentAt=performance.now();return true;
}
function connect(p){
 peer=p;if(sender)clearInterval(sender);
 sender=setInterval(()=>{
  if(!isOwned())return;
  // When not armed, heartbeat neutral safe control. On STOP, send neutral snapshots.
  send(false);
 },40);
 updateStatus('PAIR WITH WEB APP TO ENABLE FLIGHT');render();
 if(!loopStarted){loopStarted=true;last=performance.now();raf=requestAnimationFrame(tick)}
}
function onStatus(s){
 if(!s?.connected||!s?.paired||s.controller!=='mobile'){stopLocally('CONTROL UNAVAILABLE • SAFE STOP');}
 else if(!armed)updateStatus('CONNECTED • HOLD THROTTLE LOW AND ARM');
 render();
}
function onAck(a){
 if(!a||!Number.isSafeInteger(a.ackSeq))return;
 const sentTime=sent.get(a.ackSeq);if(sentTime==null)return;
 sent.delete(a.ackSeq);
 if(a.ackSeq<=lastAckSeq)return;
 lastAckSeq=a.ackSeq;lastAckAt=performance.now();
 const ms=Math.round(lastAckAt-sentTime);
 $('flightLatency').textContent=ms+' ms';
 if(!a.accepted){stopLocally(a.reason||'RECEIVER REJECTED CONTROL');return}
 if(a.applied&&a.applied.mode!==mode)updateStatus('MODE MISMATCH • CHECK SIMULATOR');
 render();
}
function doStop(){stopLocally('STOP • VIRTUAL MOTORS OFF');send(true)}
function bind(){
 setupStick('left');setupStick('right');
 $('flightArm').onclick=()=>{
  if(!isOwned()){updateStatus('GRANT MOBILE CONTROL IN WEB APP');return}
  if(armed){doStop();return}
  if(throttle>1050){updateStatus('THROTTLE MUST BE ≤1050');return}
  armed=true;halted=false;lastAckAt=performance.now();lastAckSeq=0;sent.clear();
  if(!send(true)){doStop();return}
  updateStatus('VIRTUAL ARM REQUESTED');render();
 };
 $('flightStop').onclick=doStop;
 $('flightMode').onchange=e=>{mode=e.target.value==='acro'?'acro':'angle';render();if(isOwned())send(true)};
 $('flightPreset').onchange=e=>{preset=F.PRESETS[e.target.value]?e.target.value:'Medium';
  left=right=null;drag.left=drag.right=null;try{localStorage.setItem(settingsKey,preset)}catch{}render()};
 $('flightPair').onclick=()=>show(false);
 $('flightBack').onclick=()=>show(true);
 $('flightSettings').onclick=()=>{$('flightOptions').hidden=!$('flightOptions').hidden};
 window.addEventListener('blur',()=>{doStop()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)doStop()});
 window.addEventListener('pagehide',()=>{doStop();clearInterval(sender);cancelAnimationFrame(raf);loopStarted=false});
 window.addEventListener('resize',()=>{drag.left=drag.right=null;left=right=null;render()});
 window.addEventListener('orientationchange',()=>{drag.left=drag.right=null;left=right=null;doStop()});
}
function show(yes=true){
 shown=!!yes;
 document.documentElement.classList.toggle('cockpit-active',shown);
 $('flightCockpit').hidden=!shown;
 $('flightBack').hidden=shown;
 if(!shown)doStop();
 render();
}
function intro(){
 const onAndroid=/android/i.test(navigator.userAgent)||location.search.includes('cockpit=1');
 if(!onAndroid)return;
 show(true);const splash=$('flightSplash');
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){splash.hidden=true;return}
 splash.hidden=false;
 splashTimer=setTimeout(()=>{splash.classList.add('closing');setTimeout(()=>splash.hidden=true,350)},4650);
}
function init(){bind();intro();render()}
window.ZebjusFlightApp={connect,onStatus,onAck,doStop,show};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
