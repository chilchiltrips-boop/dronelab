/* Live Inputs — read-only hardware-received RC telemetry.
 * Never claims controller ownership, arms motors, or writes joystick values.
 * AP/STA reads authenticated /api/rc/snapshot; USB follows the verified
 * Serial Monitor's shared frame decoder. PPM is display-only until firmware
 * actually advertises it in an authenticated RC snapshot.
 */
import {sharedInputStore} from './simulator-input.js';
// Reuse the existing authenticated read-only RC monitor while PID is visible;
// no independent poller and no simulator-triggered hardware writes.
const SNAPSHOT_TTL_MS=900, INPUT_MAX_AGE_MS=400, SEQUENCE_TTL_MS=800;
// Monitor-only HTTP/RPC reads are rate-limited; native UDP command streaming stays at 50 Hz.
const NETWORK_POLL_MS=140, UI_TICK_MS=70, MAX_RETRY_BACKOFF_MS=2400;
const ACTIVE_CONTROL_POLL_MS=250;
const channels=['throttle','roll','pitch','yaw'];
const neutral={throttle:1000,roll:1500,pitch:1500,yaw:1500};
const finitePulse=n=>Number.isInteger(n)&&n>=1000&&n<=2000;
const bounded=(v,min,max)=>Math.max(min,Math.min(max,v));

const ownerKey=rc=>String(rc?.ownerId||rc?.diagnosticId||'');
export function isOlderAcceptedInput(previous,next){
 const before=previous?.accepted,after=next?.accepted;
 const counters=Number.isSafeInteger(before)&&Number.isSafeInteger(after);
 if(counters&&after<before)return true;
 if(ownerKey(previous)!==ownerKey(next))return false;
 return Number(next?.seq)<Number(previous?.seq)&&!(counters&&after>before);
}

export function normalizeAcceptedInput(kit,sample,{now=Date.now()}={}){
 const connected=kit?.connected===true,transport=String(kit?.transport||'').toUpperCase();
 const name=connected?String(kit.kitName||'Kit').slice(0,48):'No kit connected';
 const base={kitName:name,transport:connected?transport:'—',source:'NONE',state:'offline',
  inputTransport:'—',seq:null,values:null,ppmChannels:null,ageMs:null,rateHz:null,accepted:null,rejected:null,
  aux:{ch5:null,ch6:null},inputArm:'NOT REPORTED',ownerId:'',flightMode:['angle','acro'].includes(kit?.flightMode)?kit.flightMode:null,led:'NOT REPORTED',motors:'NOT REPORTED'};
 if(!connected)return base;
 const network=['AP','STA','ANDROID-RELAY'].includes(transport);
 const m={...base,state:'idle',led:typeof kit.ledOn==='boolean'?(kit.ledOn?'ON':'OFF'):'NOT REPORTED',
  motors:(kit.motorsDisabled===true||kit.motorsArmed===false)?'DISABLED':'NOT REPORTED'};
 if(!sample||sample.kitId!==kit.kitId)return {...m,state:'waiting'};
 const rc=sample.rc;
 if(!rc||typeof rc!=='object')return {...m,state:'waiting'};
 const valid=channels.every(field=>finitePulse(rc[field]));
 if(!valid)return {...m,state:'waiting'};
 const seq=Number(rc.seq),ageBase=Number(rc.ageMs);
 const receiveAge=Math.max(0,now-sample.at);
 const sequenceAge=sample.sequenceAt==null?receiveAge:Math.max(0,now-sample.sequenceAt);
 const ageMs=Math.max(sequenceAge,(Number.isFinite(ageBase)&&ageBase>=0?ageBase:0)+receiveAge);
 const recent=receiveAge<=SNAPSHOT_TTL_MS&&ageMs<=INPUT_MAX_AGE_MS&&sequenceAge<=SEQUENCE_TTL_MS;
 const source=String(rc.source||'NONE').toUpperCase();
 const validSource=['WEB','ANDROID','PPM'].includes(source)?source:'NONE';
 const active=rc.active===true&&rc.inputValid!==false&&rc.failsafe!==true&&validSource!=='NONE';
 const stale=active&&!recent;
 // Do not equate diagnostic INPUT_ARMED with physical ESC/motor arming.
 const armed=active&&rc.inputArmed===true;
 return {...m,
  ownerId:ownerKey(rc),inputTransport:String(rc.transport||'—').toUpperCase(),source:active?validSource:'NONE',state:stale?'stale':active?'live':recent?'idle':'stale',
  seq:Number.isSafeInteger(seq)&&seq>0?seq:null,
  values:Object.fromEntries(channels.map(field=>[field,rc[field]])),
  ppmChannels:validSource==='PPM'&&active&&Array.isArray(rc.channels)&&rc.channels.length===8&&
   rc.channels.every(finitePulse)?rc.channels.slice():null,
  ageMs:Math.round(ageMs),rateHz:recent&&Number.isFinite(sample.rateHz)?sample.rateHz:null,
  accepted:Number.isSafeInteger(rc.accepted)&&rc.accepted>=0?rc.accepted:null,
  rejected:Number.isSafeInteger(rc.rejected)&&rc.rejected>=0?rc.rejected:null,
  aux:{ch5:finitePulse(rc.ch5)?rc.ch5:null,ch6:finitePulse(rc.ch6)?rc.ch6:null},
  inputArm:stale?'STALE':typeof rc.inputArmed!=='boolean'?'NOT REPORTED':armed?'ARMED':'DISARMED',
   flightMode:['angle','acro'].includes(rc.flightMode)?rc.flightMode:
    ['angle','acro'].includes(kit.flightMode)?kit.flightMode:null,
  led:typeof sample.ledOn==='boolean'?(sample.ledOn?'ON':'OFF'):m.led,
  motors:sample.motorsOff===true?'DISABLED':m.motors
 };
}

export function createInputRateTracker(){
 let previous=null,rate=null;
 function reset(){previous=null;rate=null}
 function observe(kitId,rc,at){
  const seq=Number(rc?.seq),counter=Number(rc?.accepted);
  const key=kitId+'|'+String(rc?.source||'')+'|'+String(rc?.transport||'')+'|'+ownerKey(rc);
  const valid=rc?.active===true&&Number.isSafeInteger(seq)&&seq>0;
  if(!valid){reset();return null}
  const accepted=Number.isSafeInteger(counter)&&counter>=0?counter:null;
  if(!previous||previous.key!==key||seq<previous.seq||accepted!==null&&previous.accepted!==null&&accepted<previous.accepted){
   previous={key,seq,accepted,at};rate=null;return rate;
  }
  const elapsed=at-previous.at;
  if(seq===previous.seq||elapsed<=0)return rate;
  const delta=accepted!==null&&previous.accepted!==null?accepted-previous.accepted:seq-previous.seq;
  previous={key,seq,accepted,at};
  if(delta<=0||delta>1000||elapsed>10000){rate=null;return rate}
  const instantaneous=bounded(delta*1000/elapsed,0,100);
  rate=rate===null?instantaneous:0.4*instantaneous+0.6*rate;
  return rate;
 }
 return {observe,reset};
}

function initLiveInputs(){
 const card=document.getElementById('fwLiveInputs');
 if(!card||!window.ZebjusKits)return;
 const $=id=>document.getElementById(id);
 let monitorChoice='auto',selectionReason='';
 const getKit=()=>{
  const kit=window.ZebjusKits?.getState?.()||{connected:false};
  const selected=window.ZebjusKitData?.selectMonitorPath?.(kit,window.ZebjusKits?.getMonitorPaths?.()||[],monitorChoice);
  selectionReason=selected?.reason||'No verified monitor connection';
  return selected?.path?{...kit,...(selected.path.transport==='usb'&&kit.usbStatus?{flightModeState:kit.usbStatus.flightModeState,flightMode:kit.usbStatus.flightModeState.active,ledOn:kit.usbStatus.ledOn,motorsDisabled:true,motorsArmed:false}:{}),connected:true,transport:selected.path.transport,
   physicalLink:selected.path.transport==='usb'?'usb':kit.physicalLink}:{...kit,connected:false};
 };
 const rate=createInputRateTracker(),simInputs=sharedInputStore();
 let modeSaving=false,modeUiRequest=0;
 let sample=null,usbPpm=null,inFlight=false,lastKit='',lastTransport='',lastPhysicalLink='',
  nextPollAt=0,readFailures=0,requestGeneration=0,lastBoot='';
 const visible=()=>document.getElementById('tab-firmware')?.classList.contains('active')&&
  window.ZebjusDevicesWorkspace?.active?.()==='inputs'&&!document.hidden&&
  !$('fwKitDemoMode')?.checked;
 const pidVisible=()=>document.getElementById('tab-pid')?.classList.contains('active')&&
  !document.hidden&&!$('fwKitDemoMode')?.checked;
 const monitoring=()=>visible()||pidVisible();
 function wipe(){modeSaving=false;++modeUiRequest;if($('liModeStatus'))$('liModeStatus').textContent='';sample=null;usbPpm=null;rate.reset();nextPollAt=0;readFailures=0;++requestGeneration}
 // Use firmware-accepted RC from a newer authenticated /api/status response
 // when the dedicated faster /api/rc/snapshot read is temporarily unavailable.
 function reuseVerifiedStatus(kit){
  const rc=kit.rc,at=Number(kit.rcAt),now=Date.now();
  if(!kit.connected||!window.ZebjusKitData?.isNetwork(kit.transport)||
     !rc||rc.kitId!==kit.kitId||!Number.isFinite(at)||at<=0||
     at<=Number(sample?.at||0)||now-at>SNAPSHOT_TTL_MS||
     !channels.every(field=>finitePulse(rc[field])))return;
  const previous=sample;
  const sequenceAt=previous?.rc?.seq===rc.seq&&previous?.rc?.source===rc.source&&ownerKey(previous.rc)===ownerKey(rc)&&previous.rc.accepted===rc.accepted?
   previous.sequenceAt??previous.at:at;
  sample={kitId:kit.kitId,rc:{...rc},at,sequenceAt,
   rateHz:rate.observe(kit.kitId,rc,at),ledOn:kit.ledOn,
   motorsOff:rc.motorsDisabled===true||rc.motorsArmed===false};
 }
 const write=(id,value)=>{const e=$(id);if(e)e.textContent=String(value)};
 function display(){
  const kit=getKit(),identity=kit.kitId&&(kit.connected||['stale','reconnecting'].includes(kit.linkState))?kit.kitId:'';
  if(identity!==lastKit||kit.transport!==lastTransport||kit.physicalLink!==lastPhysicalLink||kit.bootId!==lastBoot){
   wipe();lastKit=identity;lastTransport=kit.transport;lastPhysicalLink=kit.physicalLink;lastBoot=kit.bootId;
  }
  reuseVerifiedStatus(kit);
  const v=normalizeAcceptedInput(kit,sample);
  if(pidVisible())simInputs.acceptKit({kit,input:v});
  else simInputs.clearKit();
  card.dataset.liveState=v.state;
  write('liLiveState',v.state.toUpperCase());
  $('liLiveState').dataset.state=v.state;
  write('liKitName',v.kitName);
  write('liInputSource',v.source);
  write('liInputTransport',v.inputTransport);
  write('liSelectionReason',selectionReason);
  write('liBoardVersion',[kit.board,kit.version].filter(Boolean).join(' • ')||'—');
  if(!kit.connected&&kit.kitId&&monitorChoice!=='auto'){write('liLiveState','UNVERIFIED');card.dataset.liveState='unverified';}
  write('liKitTransport',kit.transport==='android-relay'?'RELAY • '+String(kit.physicalLink||'KIT').toUpperCase():v.transport);
  write('liPacketNumber',v.seq??'—');
  write('liAge',v.ageMs===null?'—':v.ageMs+' ms');
  write('liRate',v.rateHz===null?'— Hz':v.rateHz.toFixed(1)+' Hz');
  write('liCounts',String(v.accepted??'—')+' / '+String(v.rejected??'—'));
  write('liInputArm',v.inputArm);
  write('liFlightMode',v.flightMode?v.flightMode.toUpperCase():'NOT REPORTED');
  const actual=kit.connected?kit.flightModeState:null;
  const modeSelect=$('liModeSelect');
  if(modeSelect){modeSelect.disabled=!kit.connected||kit.transport==='android-relay';if(actual&&!modeSaving)modeSelect.value=actual.saved;}
  if(!modeSaving&&!$('liModeStatus')?.textContent?.startsWith('NOT VERIFIED'))write('liModeStatus',actual?'SAVED '+actual.saved.toUpperCase()+' • ACTIVE '+actual.active.toUpperCase()+(actual.pending?' • PENDING '+actual.pending.toUpperCase():''):'UNSUPPORTED • update FlightCore for authoritative mode settings');
  for(const [key,id] of [['ch5','liAux5'],['ch6','liAux6']])write(id,v.aux?.[key]===null||v.aux?.[key]===undefined?'NOT REPORTED':v.aux[key]+' µs');
  const connectionState=kit.connected?(v.state==='stale'?'STALE':'CONNECTED'):
   monitorChoice==='usb'&&!globalThis.navigator?.serial?'UNSUPPORTED':
   monitorChoice==='usb'&&!kit.usbAvailable?'PERMISSION REQUIRED':'DISCONNECTED';
  write('liConnectionState',connectionState);
  write('liKitIdentity',kit.connected?kit.kitId:'—');
  $('liInputArm').dataset.state=v.inputArm==='ARMED'?'armed':v.inputArm==='DISARMED'?'off':'unknown';
  write('liLed',v.led);
  write('liMotors',v.motors);
  $('liMotors').dataset.state=v.motors==='DISABLED'?'off':'unknown';
  for(const field of channels){
   const label=field[0].toUpperCase()+field.slice(1),n=v.values?.[field];
   const pct=finitePulse(n)?(n-1000)/10:0;
   write('li'+label,finitePulse(n)?n:'—');
   const bar=$('li'+label+'Bar');if(bar){
    bar.style.width=pct+'%';const track=bar.parentElement;
    if(track){if(finitePulse(n))track.setAttribute('aria-valuenow',String(n));else track.removeAttribute('aria-valuenow')}
   }
  }
  const stick=(id,x,y)=>{const e=$(id);if(e){e.style.left=bounded(x,0,100)+'%';e.style.top=bounded(y,0,100)+'%'}};
  const n=v.values||neutral;
  stick('liLeftDot',(n.yaw-1000)/10,100-(n.throttle-1000)/10);
  stick('liRightDot',(n.roll-1000)/10,100-(n.pitch-1000)/10);
  write('liLeftYaw',v.values?n.yaw:'—');write('liLeftThrottle',v.values?n.throttle:'—');
  write('liRightRoll',v.values?n.roll:'—');write('liRightPitch',v.values?n.pitch:'—');
  const message=v.state==='live'?'Received by physical Kit • monitoring only; no control session was claimed.':
   v.state==='idle'?'No current accepted RC input. Joysticks neutral; no Take Control needed to view.':
   v.state==='stale'?'Last confirmed packet is stale. Values are historical, not live control.':
   v.state==='waiting'?'Waiting for authenticated accepted-input telemetry from this Kit. PPM requires firmware support.':
   'Select and connect a verified Kit to view its accepted RC inputs.';
  write('liHelp',message+' INPUT ARM is diagnostic only; motors are never armed by this monitor.');
  const ppmActive=v.source==='PPM'&&v.ppmChannels!==null;
  write('liPpmHealth',ppmActive?(v.state==='live'?'RECEIVER LIVE': 'RECEIVER STALE'):
   'No accepted PPM channels');
  for(let i=0;i<8;i++){
   const n=ppmActive?v.ppmChannels[i]:null;
   write('liCh'+(i+1),n??'—');
   const bar=$('liCh'+(i+1)+'Bar');
   if(bar)bar.style.width=n===null?'0%':((n-1000)/10)+'%';
  }
 }
 async function poll(){
  const kit=getKit();
  if(!monitoring()||!kit.connected||!window.ZebjusKitData?.isNetwork(kit.transport)||

    kit.working||kit.otaInProgress||inFlight)return;
  inFlight=true;
  const id=kit.kitId,transport=kit.transport,physicalLink=kit.physicalLink,bootId=kit.bootId,token=requestGeneration,
   startedAt=Date.now();
  try{
   const reply=await window.ZebjusKits.request('/api/rc/snapshot');
   const current=getKit();
   if(token!==requestGeneration||!monitoring()||!current.connected||current.kitId!==id||
      current.transport!==transport||current.physicalLink!==physicalLink||reply?.kitId!==id||current.bootId!==bootId)return;
   const at=Number.isFinite(reply.__observedAt)?reply.__observedAt:Date.now();
   const prev=sample;
   if(prev?.rc?.active&&reply.active&&isOlderAcceptedInput(prev.rc,reply))return;
   const seqChanged=!prev||prev.rc?.seq!==reply.seq||prev.rc?.source!==reply.source||ownerKey(prev.rc)!==ownerKey(reply)||Number(reply.accepted)>Number(prev.rc.accepted);
   const sequenceAt=seqChanged?at:prev.sequenceAt??prev.at;
   const hz=rate.observe(id,reply,at);
   // Period is measured start-to-start; network wait already consumes budget.
   // A single in-flight request still caps load when ESP32/WRTC is slow.
   // The visible PID cockpit needs a fresh virtual RC input every ~140ms;
   // the ordinary hardware Live Inputs pane keeps its existing reduced 250ms
   // cadence under active physical control. All requests remain bounded GETs.
   const interval=pidVisible()?NETWORK_POLL_MS:
    (current.rc?.active===true?ACTIVE_CONTROL_POLL_MS:NETWORK_POLL_MS);
   readFailures=0;nextPollAt=Math.max(at,startedAt+interval);
   sample={kitId:id,rc:reply,at,sequenceAt,rateHz:hz,ledOn:current.ledOn,
    motorsOff:reply.motorsDisabled===true||reply.motorsArmed===false};
   display();
  }catch{
   // Connection might be temporarily unavailable; don't invent a fresh packet.
   // Exponential retry capped at 2.4 s prevents hammering a recovering AP/STA/relay.
   if(token===requestGeneration){readFailures=Math.min(5,readFailures+1);
    nextPollAt=Date.now()+Math.min(MAX_RETRY_BACKOFF_MS,NETWORK_POLL_MS*2**readFailures);}
  }finally{inFlight=false}
 }
 window.addEventListener('dronelab:serial-line',event=>{
  const kit=getKit();
  if(!kit.connected||kit.transport!=='usb'||!kit.kitId||event.detail?.transport&&event.detail.transport!=='usb')return;
  const line=String(event.detail?.line||'');
  const decoder=window.ZebjusSerialRcDecoder;
  const ppm=decoder?.parsePpmChannels?.(line);
  if(ppm){
   usbPpm={...ppm,at:Date.now()};
   if(ppm.owner&&sample?.rc?.source==='PPM'&&sample?.rc?.active===true){
    sample.rc={...sample.rc,channels:ppm.channels};
    if(visible())display();
   }
   return;
  }
  if(line.startsWith('ZJPPM,1,LOST,')){usbPpm=null;if(sample){sample.rc={...sample.rc,ppmSignal:'LOST',channels:null};if(sample.rc.source==='PPM')sample.rc={...sample.rc,...neutral,active:false,inputArmed:false,source:'NONE'};}if(visible())display();return;}
  const statusRecord=decoder?.parseSerialStatus?.(line);
  if(statusRecord){
   if(statusRecord.kitId!==kit.kitId)return;
   const at=Date.now(),rc=statusRecord.rc,previous=sample;
   const same=previous?.rc?.seq===rc.seq&&previous?.rc?.source===rc.source&&previous.rc.accepted===rc.accepted;
   sample={kitId:kit.kitId,rc,at,sequenceAt:same?previous.sequenceAt??previous.at:at,
    rateHz:rate.observe(kit.kitId,rc,at),ledOn:statusRecord.ledOn,motorsOff:true};
   if(visible())display();return;
  }
  const received=decoder?.parseSerialRc?.(line);
  if(!received)return;
  const at=Date.now(),motorReported=line.startsWith('ZJTEL,1,')&&line.includes(',MOTORS=OFF');
  if(received.kind==='frame'){
   if(sample?.rc?.active&&sample.rc.source===received.source&&Number(received.seq)<Number(sample.rc.seq))return;
   const hz=rate.observe(kit.kitId,received,at);
   const prev=sample;
   const seqChanged=!prev||prev.rc?.seq!==received.seq||prev.rc?.source!==received.source;
   const confirmed=received.source==='PPM'&&usbPpm?.owner===true&&
      at-usbPpm.at<=300?usbPpm.channels:null;
   sample={kitId:kit.kitId,rc:{...received,accepted:sample?.rc?.accepted,rejected:sample?.rc?.rejected,ch5:sample?.rc?.ch5,ch6:sample?.rc?.ch6,...(confirmed?{channels:confirmed}:{})},
    at,sequenceAt:seqChanged?at:prev.sequenceAt??prev.at,
    rateHz:hz,motorsOff:motorReported};
  }else if(received.kind==='idle'||received.kind==='reset'||received.kind==='claim'){
   rate.reset();simInputs.clearKit();
   sample={kitId:kit.kitId,rc:{...neutral,source:'NONE',active:false,seq:0,inputArmed:false},
    at,rateHz:null,motorsOff:motorReported};
  }
  if(visible())display();
 });
 document.addEventListener('visibilitychange',()=>{
  // Preserve the historical IMU/RC snapshot; never resurrect a stale value as LIVE.
  // Invalidate old in-flight requests and poll immediately after re-verification.
  ++requestGeneration;nextPollAt=0;readFailures=0;rate.reset();display();
 });
 window.addEventListener('dronelab:kit-link',()=>{wipe();display();});
 $('liModeSelect')?.addEventListener('change',async e=>{
  const request=++modeUiRequest;modeSaving=true;write('liModeStatus','SAVING • '+e.target.value.toUpperCase());
  try{
   const actual=await window.ZebjusKits.setFlightMode(e.target.value,{transport:getKit().transport});
   if(request===modeUiRequest)write('liModeStatus',actual.pending?'SAVED • PENDING UNTIL DISARM':'SAVED • ACTIVE '+actual.active.toUpperCase());
  }catch(error){if(request===modeUiRequest)write('liModeStatus','NOT VERIFIED • '+error.message)}
  finally{if(request===modeUiRequest){modeSaving=false;}}
 });
 $('liMonitorSelect')?.addEventListener('change',e=>{monitorChoice=e.target.value;wipe();display();});
 window.addEventListener('dronelab:devices-view',()=>{++requestGeneration;nextPollAt=0;display();});
 function tick(){display();if(monitoring()&&!inFlight&&Date.now()>=nextPollAt)void poll()}
 tick();
 setInterval(tick,UI_TICK_MS);
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initLiveInputs,{once:true});
 else initLiveInputs();
}
