/* Landscape input preview + authenticated virtual-flight transmitter. */
(function(){'use strict';
const $=id=>document.getElementById(id),F=window.ZebjusFlightMath;
let peer=null,sender=null,raf=0,last=0,seq=0,directPreviewSeq=0,preset='Medium',left=null,right=null,throttle=1000,mode='angle',armed=false,halted=true,ready=false,lastAckAt=0,lastAckSeq=0,criticalRequestSeq=0,armRequestSeq=0,sent=new Map(),drag={left:null,right:null},loopStarted=false,lastApplied=null,authority=false,sessionId='',splashTimer=null,clockAt=0,clockElapsed=0;
let diagnosticThrottle=1000,kitArmPending=false,kitArmGeneration=0,kitModePending=false;
let mirrorSeq=0,lastMirrorAt=-Infinity,modeUiSeq=0;
const mirroring=()=>peer?.status()?.inputMirrorVersion===1;
const selectedPath=()=>window.ZebjusNetwork?.getState?.()?.rcAccess?.controlPath||'AUTO';
const inputLocked=()=>{const a=window.ZebjusNetwork?.getState?.()?.rcAccess;return !!a?.paused||a?.selection==='PPM'||a?.selection==='WEB'||['PPM','WEB_STA'].includes(selectedPath())};
const directKit=()=>selectedPath()!=='ANDROID_WEBRTC'&&(!peer?.status()?.connected||mirroring())&&!!window.ZebjusNetwork?.isConnected?.();
const kitArmed=()=>directKit()&&!!window.ZebjusNetwork?.inputArmed?.();
const kitInputState=()=>{
 const f=window.ZebjusNetwork?.feedback?.();
 if(!kitArmed())return 'KIT DISARMED';
 return f?.inputArmed&&f.at>0&&Date.now()-f.at<=500?'KIT INPUT ARMED':'ARM STREAMING • KIT UNCONFIRMED';
};
let lastControlSentAt=0,lastControlAttemptAt=0,lastRejectedAt=0,acceptedFrames=0,rejectedFrames=0;
function controlLinkDiagnostic(now=performance.now()){
 const ackAge=lastAckAt?Math.round(now-lastAckAt):-1;
 const sentAge=lastControlSentAt?Math.round(now-lastControlSentAt):-1;
 const buffered=Math.max(0,Number(peer?.channel?.bufferedAmount)||0);
 const reason=sentAge<0||sentAge>180?'PHONE SENDER SCHEDULE DELAY':
  buffered>32768||now-lastRejectedAt<250?'WEBRTC QUEUE / SEND REJECTION':
  'WEBAPP RECEIVER / RETURN ACK DELAY';
 return {reason,ackAgeMs:ackAge,lastSentAgeMs:sentAge,bufferedBytes:buffered,
  sentSeq:seq,ackSeq:lastAckSeq,acceptedFrames,rejectedFrames};
}
function recordControlLinkTimeout(now){
 const detail=controlLinkDiagnostic(now);
 // Preserve the actual safety stop. These are symptoms, not proof of
 // a specific Wi-Fi fault; collect the two sequence counters for diagnosis.
 console.warn('ZEBJUS virtual flight receiver ACK timeout',detail);
 return 'NO RECEIVER ACK FOR >650ms • SAFE DISARM • '+detail.reason+
  ' • TX #'+detail.sentSeq+' ACK #'+detail.ackSeq+
  ' • sent '+detail.lastSentAgeMs+'ms ago • queue '+detail.bufferedBytes+'B';
}

const diagnosticInput=()=>{const m=current();return {throttle:diagnosticThrottle,axes:{roll:m.roll,pitch:m.pitch,yaw:m.yaw},responseMode:preset,ch5:Number($('flightCh5')?.value||1000),ch6:Number($('flightCh6')?.value||1000),previewRequested:!!drag.left||!!drag.right}};
const settingsKey='zebjus.flight.preset.v1';
try{const v=localStorage.getItem(settingsKey);if(F.PRESETS[v])preset=v}catch{}
const current=()=>F.mapState({left:left||{x:0,y:0},right:right||{x:0,y:0},throttle,mode,armed,preset});
function isOwned(){const s=peer?.status();return !inputLocked()&&!mirroring()&&!!s?.connected&&!!s?.paired&&s.controller==='mobile'&&s.simulatorReady===true}
function clearTouches(){
 for(const side of ['left','right']){
  const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),id=drag[side]?.id;drag[side]=null;
  if(id!=null&&pad?.hasPointerCapture(id))try{pad.releasePointerCapture(id)}catch{}
 }
 left=right=null;
}
function skipIntro(){clearTimeout(splashTimer);$('flightSplash').hidden=true}
function stopLocally(message='STOP • DISARMED'){
 const applied=$('flightAppliedControls');if(applied)applied.textContent='STOP • AWAITING RECEIVER / DISCONNECTED';
 armed=false;halted=true;throttle=1000;armRequestSeq=0;clearTouches();sent.clear();ready=false;lastApplied=null;skipIntro();
 $('flightAttitudeLadder').style.transform='';$('flightAttitude').dataset.source='preview';$('flightAttitudeLabel').textContent='INPUT PREVIEW';
 render();updateStatus(message);
}
function renderControlTarget(){
 const label=$('flightTarget');if(!label)return;
 const web=peer?.status()?.connected===true&&!mirroring();
 const kit=directKit();
 label.dataset.target=web?'simulator':kit?'kit':'preview';
 label.textContent=selectedPath()==='ANDROID_WEBRTC'?'TARGET • SIMULATOR / WEBRTC':mirroring()?(kit?'TARGET • KIT + READ-ONLY SIM MIRROR':'READ-ONLY SIM INPUT • RUN ON WEB'):web?'TARGET • SIMULATOR / WEBRTC':kit?
  'TARGET • KIT / '+String(window.ZebjusNetwork.selectedTransport?.()||'Wi-Fi').toUpperCase():
  'TARGET • PREVIEW ONLY';
 label.title=web?'Virtual simulator controlled only after WebRTC authorization':
  kit?'FlightCore input • motor output state comes from the A2 setup session':
  'No confirmed receiver; joystick values are local preview only';
}
function refreshConnectionLabel(){
 renderControlTarget();
 const receiver=!!peer?.status()?.connected;
 const kit=!receiver&&!!window.ZebjusNetwork?.isConnected?.();
 const label=$('flightConnection');
 label.textContent=receiver?'CONNECTED':kit?'KIT '+window.ZebjusNetwork.selectedTransport().toUpperCase()+' CONNECTED':'NOT CONNECTED';
 label.dataset.ready=String(receiver||kit);
 label.title=receiver?'WebRTC simulator receiver connected':kit?'FlightCore Wi-Fi connected • ARM sends Kit input; motor outputs disabled':'No verified WebRTC receiver or FlightCore Kit';
}
function updateStatus(message){
 $('flightWarning').textContent=message;
 refreshConnectionLabel();
 $('flightOwner').textContent=directKit()?(kitArmed()?'ANDROID • '+kitInputState():'KIT CONNECTED • PRESS ARM'):isOwned()?'ANDROID OWNS CONTROLS':peer?.status().controller==='web'?'WEB OWNS CONTROLS':'INPUT PREVIEW • NO FLIGHT COMMAND';
}
function stickRender(side,position){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone'),ring=$(side==='left'?'flightLeftRing':'flightRightRing'),knob=$(side==='left'?'flightLeftKnob':'flightRightKnob'),label=$(side==='left'?'flightLeftTouch':'flightRightTouch');
 if(!position){ring.style.left='';ring.style.top='';ring.classList.remove('dragging');knob.style.transform='translate(-50%,-50%)';label.textContent=(armed&&isOwned()||kitArmed())?'TOUCH TO CONTROL':'TOUCH TO PREVIEW';return}
 const rect=pad.getBoundingClientRect(),d=position.data;
 ring.style.left=(position.cx-rect.left)+'px';ring.style.top=(position.cy-rect.top)+'px';ring.classList.add('dragging');
 knob.style.transform='translate(calc(-50% + '+(d.x*position.radius)+'px), calc(-50% + '+(d.y*position.radius)+'px))';
 label.textContent='X '+Math.round(d.x*100)+'% Y '+Math.round(-d.y*100)+'% • '+((armed&&isOwned()||kitArmed())?'FLIGHT':'PREVIEW ONLY');
}
function render(){
 refreshConnectionLabel();
 if(directKit())$('flightOwner').textContent=kitArmed()?'ANDROID • '+kitInputState():window.ZebjusNetwork?.canArm?.()?'KIT CONNECTED • PRESS ARM':'KIT CONNECTED • CHECK CONTROL PERMISSION / FIRMWARE';
 const preview=current(),a=isOwned()&&armed&&lastApplied?.armed?lastApplied:null;
 const now=performance.now();if(a||kitArmed()){if(!clockAt)clockAt=now;clockElapsed=now-clockAt}else if(clockAt){clockElapsed=now-clockAt;clockAt=0}
 const seconds=Math.floor(clockElapsed/1000);$('flightTimer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 $('flightCockpit').dataset.armed=String(!!a||kitArmed());$('flightConnect').textContent=peer?.status().connected?'LINK SETTINGS':'CONNECT';
 $('flightResponseValue').textContent=preset==='Medium'?'MED':preset.toUpperCase();$('flightResponse').setAttribute('aria-label','Joystick response '+preset+'. Tap to change');
 $('flightCockpit').dataset.response=preset;$('mobileConnection').dataset.response=preset;$('flightResponse').title=preset+' • Roll/Pitch/Yaw '+Math.round(F.PRESETS[preset].axisScale*100)+'% maximum • throttle '+F.PRESETS[preset].throttleRate+' µs/s';
 const m=a?{...a.axes,throttle:a.throttle}:preview;
 $('flightThrottle').textContent=m.throttle+' µs';$('flightRoll').textContent=Math.round(m.roll*100)+'%';$('flightPitch').textContent=Math.round(m.pitch*100)+'%';$('flightYaw').textContent=Math.round(m.yaw*100)+'%';
 if(directKit()&&!kitModePending){
  const saved=window.ZebjusNetwork?.savedFlightMode?.();
  if(['angle','acro'].includes(saved))mode=saved;
 }
 $('flightMode').value=mode;
 $('flightModeState').textContent=directKit()?
   (kitModePending?'SAVING KIT • ':window.ZebjusNetwork?.savedFlightMode?.()?'KIT SAVED • ':'KIT MODE UNAVAILABLE • ')+mode.toUpperCase():
   (a?'APPLIED • ':armed?'REQUESTED • ':'PREVIEW • ')+((a?.mode||mode)==='acro'?'ACRO / RATE':'ANGLE');
 $('flightArm').textContent=kitArmPending?'ARMING…':armed||kitArmed()?'DISARM':'ARM';
 $('flightArm').disabled=inputLocked()||kitArmPending||(directKit()?(!kitArmed()&&!window.ZebjusNetwork?.canArm?.()):!isOwned()||(!armed&&(!ready||throttle>1050)));
 $('flightArm').setAttribute('aria-pressed',String(armed||kitArmed()));
 $('flightStop').disabled=false;$('flightPreset').value=preset;
 $('flightFeedback').textContent=lastAckSeq?'ACK #'+lastAckSeq+' • '+(performance.now()-lastAckAt>400?'STALE':$('flightLatency').textContent)+(a?' • APPLIED '+a.throttle+' µs': ' • DISARMED'):'INPUT PREVIEW • NO FLIGHT COMMAND';
 const diagnostic=window.ZebjusNetwork?.feedback?.();
 const motorState=window.ZebjusNetwork?.getState?.();
 const outputLabel=motorState?.connected&&Date.now()-(motorState.heartbeatAt||0)<1500?(motorState.motorsDisabled===true?'OUTPUT DISABLED':motorState.motorsDisabled===false?'BENCH OUTPUT ENABLED':'OUTPUT UNKNOWN'):'OUTPUT UNKNOWN';
 if(diagnostic){
  if(diagnostic.ackRequired===false){
   $('flightFeedback').textContent='AP STREAM TX #'+(diagnostic.sentSeq||0)+' • RX '+(diagnostic.seq?'#'+diagnostic.seq:'unconfirmed')+' • '+kitInputState()+' • '+outputLabel;
  }else{
   $('flightFeedback').textContent='ESP32 RX #'+diagnostic.seq+' • '+diagnostic.rtt+' ms • '+(Date.now()-diagnostic.at>350?'STALE':diagnostic.inputArmed?'INPUT ARMED':'INPUT DISARMED')+' • '+outputLabel;
  }
  $('flightThrottle').textContent=Math.round(diagnosticThrottle)+' µs';
  if(directKit()){
   $('flightLatency').textContent=diagnostic.seq?diagnostic.rtt+' ms':'—';
   // Mode status is rendered below from signed firmware state.

  }
 }
 $('flightFeedback').hidden=!lastAckSeq&&!diagnostic;
 if(!peer?.status().connected)$('flightAppliedTelemetry').textContent='';
 for(const side of ['left','right'])$(side==='left'?'flightLeftZone':'flightRightZone').dataset.preview=String(!(isOwned()&&armed||kitArmed()));
 $('flightTakeControl').disabled=mirroring()||!peer?.status().paired||isOwned();$('flightReleaseControl').disabled=!isOwned();
 $('flightMode').disabled=mirroring()&&!directKit();
 if(directKit()){
  const actual=window.ZebjusNetwork?.flightModeState?.();
  $('flightModeState').textContent=kitModePending?'SAVING • '+mode.toUpperCase():actual?
   'SAVED '+actual.saved.toUpperCase()+' • ACTIVE '+actual.active.toUpperCase()+(actual.pending?' • PENDING '+actual.pending.toUpperCase():''):
   (window.ZebjusNetwork?.savedFlightMode?.()?'ACTIVE '+window.ZebjusNetwork.savedFlightMode().toUpperCase()+' • UPDATE FIRMWARE FOR MODE CHANGES':'KIT MODE UNSUPPORTED • UPDATE FIRMWARE');
 }
 $('flightSent').textContent='#'+(directKit()?diagnostic?.sentSeq||diagnostic?.seq||0:seq);
 if(directKit())$('flightAppliedControls').textContent=diagnostic?(diagnostic.ackRequired===false?kitInputState()+' • TX #'+(diagnostic.sentSeq||0):'KIT RECEIVED #'+diagnostic.seq+' • '+(diagnostic.inputArmed?'INPUT ARMED':'DISARMED'))+' • MOTOR OUTPUTS OFF':'KIT INPUT DISARMED • PRESS ARM';
 if(!peer?.status().connected){$('flightAttitude').dataset.source='preview';$('flightAttitudeLabel').textContent='INPUT PREVIEW'}
 for(const side of ['left','right'])stickRender(side,drag[side]);
 for(const side of ['flightLeftZone','flightRightZone'])$(side).setAttribute('aria-disabled',String(inputLocked()));
 if(inputLocked()){
  $('flightOwner').textContent=selectedPath()==='PPM'?'PPM CONTROLS RC':'JOYSTICK LOCKED';
  $('flightWarning').textContent='Selected input owns RC • telemetry monitoring available';
 }
}
function setupStick(side){
 const pad=$(side==='left'?'flightLeftZone':'flightRightZone');
 const move=(e,first=false)=>{
  const d=drag[side];if(!d||d.id!==e.pointerId)return;
  d.data=first?{x:0,y:0}:F.vector(e.clientX,e.clientY,d.cx,d.cy,d.radius);
  if(side==='left')left=d.data;else right=d.data;
  if(!armed&&!kitArmed())updateStatus(directKit()?'KIT CONNECTED • PRESS ARM':'INPUT PREVIEW • NO FLIGHT COMMAND');render();
 };
 pad.addEventListener('pointerdown',e=>{
  if(inputLocked()){updateStatus('JOYSTICK LOCKED • use the selected input; telemetry available');return;}
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
 // Local-input expiry runs against monotonic time in the native sender.
 // AP ACK feedback is optional; STA retains its native feedback watchdog.
  // A congested WebView/UI callback queue is NOT proof the Kit missed ACKs.
  // Keep the legacy HTTP feedback watchdog until that fallback is removed.
  const kitFeedback=window.ZebjusNetwork?.feedback?.();
  if(kitArmed()&&kitFeedback&&kitFeedback.protocol!=='ZJUDP1'&&Date.now()-kitFeedback.at>500){
   void doStop('ACK_TIMEOUT');updateStatus('KIT ACK TIMEOUT • INPUT DISARMED')
  }
 if(window.ZebjusNetwork?.hasControl?.()){if(drag.left)diagnosticThrottle=F.integrateThrottle(diagnosticThrottle,drag.left.data.y,dt,preset)}else diagnosticThrottle=1000;
 if(drag.left&&isOwned()&&armed&&!halted)throttle=F.integrateThrottle(throttle,drag.left.data.y,dt,preset);
 if(mirroring()&&!window.ZebjusNetwork?.hasControl?.()&&drag.left)throttle=F.integrateThrottle(throttle,drag.left.data.y,dt,preset);
 for(const [key,val] of sent)if(now-val>2000)sent.delete(key);
 if(isOwned()&&armed&&lastAckAt&&now-lastAckAt>650){stopLocally(recordControlLinkTimeout(now));send(true)}
 if(Math.floor(now/80)!==Math.floor((now-dt*1000)/80))render();raf=requestAnimationFrame(tick);
}
function send(critical=false){
 if(!isOwned())return false;
 // Even while disarmed, raw stick movement is sent only as a preview.
 // The web receiver must not apply disarmed preview axes/throttle to physics.
 const m=halted?{...current(),armed:false,throttle:1000}:current();
 const payload={seq:++seq,sessionId:peer.status().sessionId,mode:m.mode,armed:m.armed,throttle:m.throttle,axes:{roll:m.roll,pitch:m.pitch,yaw:m.yaw},sticks:{left:{...(left||{x:0,y:0})},right:{...(right||{x:0,y:0})}}};
 if(critical)criticalRequestSeq=seq;
 // Simulator control always has priority over optional FlightCore HTTP
 // diagnostics, which can schedule bridge traffic and generate UI updates.
 lastControlAttemptAt=performance.now();
 if(!peer.sendSimulatorControl(payload,critical)){
  rejectedFrames++;lastRejectedAt=performance.now();return false;
 }
 const at=performance.now();sent.set(seq,at);lastControlSentAt=at;acceptedFrames++;
 try{if(directKit())window.ZebjusNetwork?.previewControls?.(diagnosticInput())}catch(error){
  console.warn('Optional FlightCore preview failed; WebRTC control preserved',error?.message||error);
 }
 return true;
}
function sendMirror(){
 const status=peer?.status(),now=performance.now();
 if(inputLocked()||!mirroring()||!status?.paired||!status?.connected||document.hidden||now-lastMirrorAt<50)return;
 lastMirrorAt=Number.isFinite(lastMirrorAt)?now-(now-lastMirrorAt)%50:now;
 const physical=window.ZebjusNetwork?.hasControl?.()===true,m=current();
 const input=physical?diagnosticInput():{throttle:m.throttle,axes:{roll:m.roll,pitch:m.pitch,yaw:m.yaw}};
 const kit=window.ZebjusNetwork?.identity?.();
 peer.sendInputMirror?.({mirrorVersion:1,sessionId:status.sessionId,seq:++mirrorSeq,
  channels:F.pulseChannels(input),aux:{ch5:Number($('flightCh5')?.value||1000),ch6:Number($('flightCh6')?.value||1000)},inputAgeMs:0,kitId:kit?.connected?kit.kitId:'',
  transport:kit?.connected?kit.transport:'preview',kind:physical?'android-command':'android-preview'});
}
function connect(p){
 peer=p;authority=false;sessionId='';seq=lastAckSeq=criticalRequestSeq=0;lastAckAt=0;lastControlSentAt=lastControlAttemptAt=lastRejectedAt=0;acceptedFrames=rejectedFrames=0;clockAt=clockElapsed=0;sent.clear();
 clearInterval(sender);sender=setInterval(()=>{if(isOwned())send();else if(directKit())window.ZebjusNetwork?.previewControls?.(diagnosticInput());sendMirror()},40);
 updateStatus('INPUT PREVIEW • PAIR IN CONNECTION SETTINGS');render();
 if(!loopStarted){loopStarted=true;last=performance.now();raf=requestAnimationFrame(tick)}
}
function onStatus(s){
 // Switching the visible target to WebRTC also releases any previous physical
 // diagnostic Kit session. A simulator target must never send to the Kit.
 if(s?.connected&&!mirroring()&&window.ZebjusNetwork?.hasControl?.()){
  diagnosticThrottle=1000;
  void Promise.resolve(window.ZebjusNetwork.releaseRc()).catch(()=>{});
 }
 if(s?.sessionId!==sessionId){if(authority||armed)stopLocally('NEW SESSION • DISARMED');sessionId=s?.sessionId||'';mirrorSeq=0;lastMirrorAt=-Infinity;seq=lastAckSeq=criticalRequestSeq=0;lastAckAt=0;lastControlSentAt=lastControlAttemptAt=lastRejectedAt=0;acceptedFrames=rejectedFrames=0;sent.clear();ready=false;lastApplied=null}
 if(mirroring()){updateStatus(directKit()?'KIT CONTROL • READ-ONLY SIM MIRROR':'ANDROID INPUT • RUN / STOP ON WEBAPP');render();return;}
 const owns=isOwned();if(authority&&!owns)stopLocally('CONTROL LOST • SAFE STOP');
 if(!authority&&owns){stopLocally('CONNECTED • RECEIVER DISARM CHECK');send(true)}authority=owns;
 if(!owns)updateStatus('INPUT PREVIEW • NO FLIGHT COMMAND');else if(!armed)updateStatus(ready?'CONNECTED • THROTTLE LOW • READY TO ARM':'CONNECTED • WAITING FOR RECEIVER');render();
}
function validApplied(a){return a&&['angle','acro'].includes(a.mode)&&typeof a.armed==='boolean'&&Number.isInteger(a.throttle)&&a.throttle>=1000&&a.throttle<=2000&&a.axes&&['roll','pitch','yaw'].every(k=>Number.isFinite(a.axes[k])&&Math.abs(a.axes[k])<=1)}
function onAck(a){
 if(mirroring())return;
 if(!a||a.sessionId!==peer?.status().sessionId||!Number.isSafeInteger(a.ackSeq)||a.ackSeq<=lastAckSeq)return;
 const sentTime=sent.get(a.ackSeq);if(sentTime==null)return;sent.delete(a.ackSeq);
 // A queued DISARM ACK from the pre-arm preview must never undo a newer
 // explicit ARM; the receiver is authoritative for all ACKs >= armRequestSeq.
 if(armed&&a.ackSeq<armRequestSeq)return;
 lastAckSeq=a.ackSeq;lastAckAt=performance.now();$('flightLatency').textContent=Math.round(lastAckAt-sentTime)+' ms';
 if(!a.accepted||!validApplied(a.applied)){stopLocally(a.reason||'INVALID RECEIVER FEEDBACK');return}
 lastApplied=a.applied;ready=true;
 if(armed&&!a.applied.armed){stopLocally('RECEIVER DISARMED');return}
 if(armed&&a.applied.armed)updateStatus('VIRTUAL ARMED • RECEIVER APPLIED');
 // Fractional local throttle integrates continuously; applied integer readout comes from the ACK.
 if(a.applied.mode!==mode)mode=a.applied.mode;
 onTelemetry({sessionId:a.sessionId,applied:a.applied});render();
}
function onTelemetry(packet){
 if(mirroring())return;
 if(packet?.sessionId!==peer?.status().sessionId||!validApplied(packet.applied))return;
 const a=packet.applied;
 // Telemetry may already be queued before ARM or a newer ACK. It must never
 // overwrite that command or interpret an old DISARM as a fresh receiver STOP.
 if(isOwned()&&(!Number.isSafeInteger(a.seq)||a.seq<Math.max(lastAckSeq,criticalRequestSeq)))return;
 if(!isOwned()&&a.source==='mobile')return;
 $('flightAppliedControls').textContent='APPLIED • '+a.throttle+' µs '+a.mode.toUpperCase()+' • '+(a.armed?'VIRTUAL ARMED':'DISARMED')+' • '+(a.source||'web').toUpperCase()+' #'+a.seq;
 if(a.angles&&a.motors&&a.vertical){
  const finite=v=>Number.isFinite(v)?v:0;
  $('flightAppliedTelemetry').textContent='SIM • R '+finite(a.angles.roll).toFixed(1)+'° P '+finite(a.angles.pitch).toFixed(1)+'° Y '+finite(a.angles.yaw).toFixed(1)+'° • '+Math.round((a.motors.rpm||[]).reduce((v,n)=>v+finite(n),0)/4)+' RPM • z '+(finite(a.vertical.z)*100).toFixed(1)+' cm';
  $('flightAttitudeLadder').style.transform='rotate('+(-finite(a.angles.roll))+'deg) translateY('+F.clamp(finite(a.angles.pitch)*.55,-16,16)+'px)';
  $('flightAttitude').dataset.source='applied';$('flightAttitudeLabel').textContent=a.armed?'SIM ATTITUDE':'SIM DISARMED';
 }
 if(isOwned()&&armed&&!a.armed)stopLocally('WEB STOP • VIRTUAL MOTORS OFF');
 if(!isOwned())$('flightAppliedTelemetry').textContent+=' • '+a.throttle+' µs '+a.mode.toUpperCase()+' '+(a.armed?'WEB ARMED':'DISARMED');
}
function remoteStop(reason){if(mirroring())return;stopLocally(reason||'WEB STOP • VIRTUAL MOTORS OFF');send(true)}
function doStop(cause='USER_STOP'){const wasKit=directKit()||kitArmPending;++kitArmGeneration;kitArmPending=false;diagnosticThrottle=1000;const released=window.ZebjusNetwork?.releaseRc?.(cause);stopLocally(wasKit?'KIT STOP • INPUT DISARMED • CHECK A2 OUTPUT STATE':'STOP • VIRTUAL MOTORS OFF');send(true);return released}
function openConnection(){
 // Pairing is an observer of the existing Kit stream. Clear captured sticks
 // without releasing the independent physical session or its held throttle.
 if(!window.ZebjusNetwork?.hasControl?.())stopLocally();
 clearTouches();render();const d=$('mobileConnection');if(!d.open)d.showModal();$('flightSettings').setAttribute('aria-expanded','true')
}
function closeConnection(){
  window.ZebjusPairingStopCamera?.();
  const dialog=$('mobileConnection');if(dialog?.open)dialog.close();
  $('flightSettings').setAttribute('aria-expanded','false');
  $('flightSettings').focus({preventScroll:true});
  // Android WebView can retain a text-selection range after a long press.
  const selection=window.getSelection?.();if(selection?.rangeCount)selection.removeAllRanges();
}
function bind(){
 setupStick('left');setupStick('right');
 $('flightArm').onclick=async()=>{
  if(inputLocked()){updateStatus('Joystick locked by the selected input');return;}
  if(directKit()){
   if(kitArmed()){await doStop();updateStatus('KIT DISARMED • CHECK A2 OUTPUT STATE');return}
   if(kitArmPending)return;
   const generation=++kitArmGeneration;
   kitArmPending=true;diagnosticThrottle=1000;clearTouches();render();
   try{
    await window.ZebjusNetwork.armControls();
    if(generation!==kitArmGeneration)return;
    clockAt=clockElapsed=0;updateStatus(kitInputState()+' • CHECK A2 OUTPUT STATE');
   }catch(error){if(generation===kitArmGeneration)updateStatus('KIT ARM: '+error.message)}
   finally{if(generation===kitArmGeneration){kitArmPending=false;render()}}
   return;
  }
  if(armed){doStop();return}if(!isOwned()||!ready){updateStatus('PAIR, GRANT CONTROL AND WAIT FOR RECEIVER');return}
  if(throttle>1050){updateStatus('THROTTLE MUST BE ≤1050');return}
  clearTouches();armed=true;halted=false;clockAt=clockElapsed=0;lastAckAt=performance.now();sent.clear();
  if(!send(true)){doStop();return}armRequestSeq=seq;updateStatus('VIRTUAL ARM REQUESTED');render();
 };
 $('flightStop').onclick=doStop;$('mobileSettingsStop').onclick=doStop;
 for(const id of ['flightStop','mobileSettingsStop'])$(id).addEventListener('pointerdown',e=>{
  // Non-primary third-finger touches may not synthesize click on Android.
  // STOP must take effect immediately for every touchscreen pointer.
  e.preventDefault();doStop();
 });
 $('flightMode').onchange=async e=>{
   const desired=e.target.value==='acro'?'acro':'angle',previous=mode,request=++modeUiSeq;
   if(directKit()){
    mode=desired;kitModePending=true;render();
    try{
     const actual=await window.ZebjusNetwork.setSavedFlightMode(desired);
     if(request!==modeUiSeq)return;
     mode=actual.saved;updateStatus(actual.pending?'SAVED • PENDING UNTIL KIT DISARM':'SAVED • ACTIVE '+actual.active.toUpperCase());
    }catch(error){
     if(request!==modeUiSeq)return;
     mode=window.ZebjusNetwork?.savedFlightMode?.()||previous;
     updateStatus('FLIGHT MODE NOT VERIFIED • '+error.message);
    }finally{if(request===modeUiSeq){kitModePending=false;render()}}
    return;
   }
   mode=desired;render();if(isOwned()){sent.clear();send(true)}
  };
  for(const channel of ['flightCh5','flightCh6'])$(channel)?.addEventListener('input',()=>{
  $(channel+'Value').textContent=$(channel).value+' µs';
  if(directKit())window.ZebjusNetwork?.previewControls?.({...diagnosticInput(),previewRequested:true});
 });
 $('flightPreset').onchange=e=>{preset=F.PRESETS[e.target.value]?e.target.value:'Medium';clearTouches();try{localStorage.setItem(settingsKey,preset)}catch{}render()};
 document.addEventListener('contextmenu',event=>{if(event.target.closest('button,select,.flight-touch-zone'))event.preventDefault()});
 $('flightPair').onclick=openConnection;$('flightBack').onclick=closeConnection;$('flightSettings').onclick=openConnection;
 // Keep the dialog present until the touch ends. Closing on pointerdown lets
 // Android retarget the later compatibility click to the header underneath.
 // Cancel compatibility mouse events and close on touchend, including a hold
 // for which WebView does not synthesize click. Mouse/keyboard use onclick.
 $('flightBack').addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
 $('flightBack').addEventListener('touchend',e=>{e.preventDefault();closeConnection()},{passive:false});
 $('flightConnect').onclick=openConnection;
 $('flightQuickScan').onclick=()=>{openConnection();$('scanOfferBtn').click()};
 $('flightResponse').onclick=()=>{const names=Object.keys(F.PRESETS);$('flightPreset').value=names[(names.indexOf(preset)+1)%names.length];$('flightPreset').dispatchEvent(new Event('change',{bubbles:true}))};
 $('mobileConnection').addEventListener('close',()=>{window.ZebjusPairingStopCamera?.();$('flightSettings').setAttribute('aria-expanded','false')});
 $('flightTakeControl').onclick=()=>{peer?.requestControl();updateStatus('REQUESTED • GRANT MOBILE CONTROL ON WEB')};
 $('flightReleaseControl').onclick=()=>{doStop();peer?.releaseControl();render()};
 window.addEventListener('zebjus:diagnostic-control',event=>{diagnosticThrottle=1000;clearTouches();if(event.detail?.active===false&&directKit())updateStatus('KIT INPUT DISARMED • CHECK A2 OUTPUT STATE');render()});
 window.addEventListener('blur',()=>{if(!document.hidden&&!armed)return;stopLocally('APP LOST FOCUS • SAFE DISARM');send(true)});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopLocally('APP BACKGROUND • SAFE DISARM');send(true)}});
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
window.addEventListener('dronelab:control-path',()=>{diagnosticThrottle=1000;clearTouches();stopLocally('Input source changed • disarmed');if(window.ZebjusNetwork?.hasControl?.())void window.ZebjusNetwork.releaseRc('SOURCE_CHANGED');render()});
window.ZebjusFlightApp={connect,onStatus,onAck,onTelemetry,remoteStop,doStop,show,controlLinkDiagnostic,
 peerState:()=>peer?.status()||{},
 virtualState:()=>({running:armed&&isOwned(),origin:'webrtc',fresh:!!lastAckAt&&performance.now()-lastAckAt<=650})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
