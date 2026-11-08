import {describePpmMonitorHealth,isOlderReceiverCounter,parseReceiverSnapshot,ppmMonitorEvidence,PPM_OBSERVATION_MS} from './input-monitor.js';
export {describePpmMonitorHealth} from './input-monitor.js';
/* Live Inputs — read-only hardware-received RC telemetry.
 * Never claims controller ownership, arms motors, or writes joystick values.
 * AP/STA consumes the Kit's shared authenticated RC observation; USB follows the verified
 * Serial Monitor's shared frame decoder. PPM is display-only until firmware
 * actually advertises it in an authenticated RC snapshot.
 */
import {sharedInputStore} from './simulator-input.js';
// Keep the simulator's accepted-frame deadline separate from display history.
const SNAPSHOT_TTL_MS=900, INPUT_MAX_AGE_MS=400, SEQUENCE_TTL_MS=800;
const UI_TICK_MS=70;
const channels=['throttle','roll','pitch','yaw'];
const neutral={throttle:1000,roll:1500,pitch:1500,yaw:1500};
const finitePulse=n=>Number.isInteger(n)&&n>=1000&&n<=2000;
const bounded=(v,min,max)=>Math.max(min,Math.min(max,v));

const motorLabel=flags=>flags?.motorsDisabled===true?'DISABLED':flags?.motorsDisabled===false?'ENABLED':'NOT REPORTED';
const ownerKey=rc=>String(rc?.ownerId||rc?.diagnosticId||'');
export function isOlderAcceptedInput(previous,next){
 const earlier=parseReceiverSnapshot(previous),later=parseReceiverSnapshot(next);
 if(earlier&&later){
  if(later.generation!==earlier.generation)return isOlderReceiverCounter(later.generation,earlier.generation);
  if(later.accepted!==earlier.accepted)return isOlderReceiverCounter(later.accepted,earlier.accepted);
  return later.valid&&earlier.valid&&isOlderReceiverCounter(later.receivedAtMs,earlier.receivedAtMs);
 }
 if(previous?.active===false||next?.active===false)return false;
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
 const m={...base,state:'idle',led:typeof kit.ledOn==='boolean'?(kit.ledOn?'ON':'OFF'):'NOT REPORTED',
  motors:motorLabel(kit)};
 if(!sample||sample.kitId!==kit.kitId||!Number.isFinite(sample.at)||sample.at>now)return {...m,state:'waiting'};
 const rc=sample.rc;
 if(!rc||typeof rc!=='object')return {...m,state:'waiting'};
 const valid=channels.every(field=>finitePulse(rc[field]));
 if(!valid)return {...m,state:'waiting'};
 const receiver=parseReceiverSnapshot(rc);
 const seq=Number(rc.seq),ageBase=rc.ageMs;
 const receiveAge=now-sample.at;
 const sequenceAge=sample.sequenceAt==null?receiveAge:Math.max(0,now-sample.sequenceAt);
 const ageMs=Number.isFinite(ageBase)&&ageBase>=0?Math.max(sequenceAge,ageBase+receiveAge):null;
 const recent=!sample.historicalOnly&&receiveAge<=SNAPSHOT_TTL_MS&&ageMs!==null&&ageMs<=INPUT_MAX_AGE_MS&&sequenceAge<=SEQUENCE_TTL_MS;
 const source=String(rc.source||'NONE').toUpperCase();
 const validSource=['WEB','ANDROID','PPM'].includes(source)?source:'NONE';
 const evidence=ppmMonitorEvidence(kit,rc,sample.at,now);
 const unavailable=validSource==='PPM'&&(evidence.lost||evidence.absent)||rc.receiver&&rc.active===true&&receiver?.valid!==true;
 const active=!unavailable&&rc.active===true&&rc.inputValid!==false&&rc.failsafe!==true&&validSource!=='NONE';
 const stale=active&&!recent;
 // Do not equate diagnostic INPUT_ARMED with physical ESC/motor arming.
 const armed=active&&rc.inputArmed===true;
 return {...m,
  ownerId:ownerKey(rc),inputTransport:String(rc.transport||'—').toUpperCase(),source:active?validSource:'NONE',state:stale?'stale':active?'live':!sample.historicalOnly&&receiveAge<=SNAPSHOT_TTL_MS?'idle':'stale',
  seq:Number.isSafeInteger(seq)&&seq>0?seq:null,
  values:unavailable?null:Object.fromEntries(channels.map(field=>[field,rc[field]])),
  ppmChannels:validSource==='PPM'&&active&&Array.isArray(rc.channels)&&rc.channels.length===8&&
   rc.channels.every(finitePulse)?rc.channels.slice():null,
  ageMs:ageMs===null?null:Math.round(ageMs),rateHz:active&&recent&&Number.isFinite(sample.rateHz)?sample.rateHz:null,
  accepted:Number.isSafeInteger(rc.accepted)&&rc.accepted>=0?rc.accepted:null,
  rejected:Number.isSafeInteger(rc.rejected)&&rc.rejected>=0?rc.rejected:null,
  ...(receiver?.valid&&active?{receiverChannels:receiver.channels,receiverGeneration:receiver.generation}:{}),
  aux:{ch5:receiver?receiver.channels[4]:finitePulse(rc.ch5)?rc.ch5:null,
       ch6:receiver?receiver.channels[5]:finitePulse(rc.ch6)?rc.ch6:null},
  inputArm:stale?'STALE':unavailable||typeof rc.inputArmed!=='boolean'?'NOT REPORTED':armed?'ARMED':'DISARMED',
   flightMode:['angle','acro'].includes(rc.flightMode)?rc.flightMode:
    ['angle','acro'].includes(kit.flightMode)?kit.flightMode:null,
  led:typeof sample.ledOn==='boolean'?(sample.ledOn?'ON':'OFF'):m.led,
  motors:!sample.historicalOnly&&receiveAge<=SNAPSHOT_TTL_MS&&typeof rc.motorsDisabled==='boolean'?motorLabel(rc):m.motors
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
  if(!selected?.path)return {...kit,connected:false};
  const usb=selected.path.transport==='usb',generation=usb?selected.path.generation:kit.connectionGeneration;
  const status=usb?kit.usbStatus:null;
  const serialPpm=usb&&usbPpm?.kitId===kit.kitId&&usbPpm.bootId===kit.bootId&&usbPpm.generation===generation?usbPpm:null;
  return {...kit,...(status?{flightModeState:status.flightModeState,flightMode:status.flightModeState.active,ledOn:status.ledOn,motorsDisabled:status.rc?.motorsDisabled,motorsArmed:status.rc?.motorsArmed}:{}),
   connected:true,transport:selected.path.transport,monitorGeneration:generation,
   physicalLink:usb?'usb':kit.physicalLink,
   ppm:serialPpm||(usb&&kit.transport!=='usb'?null:kit.ppm)};
 };
 const rate=createInputRateTracker(),simInputs=sharedInputStore();
 let modeSaving=false,modeUiRequest=0;
 let sample=null,usbPpm=null,lastBinding='',lastConnected=false;
 const visible=()=>document.getElementById('tab-firmware')?.classList.contains('active')&&
  window.ZebjusDevicesWorkspace?.active?.()==='inputs'&&!document.hidden&&
  !$('fwKitDemoMode')?.checked;
 const pidVisible=()=>document.getElementById('tab-pid')?.classList.contains('active')&&
  !document.hidden&&!$('fwKitDemoMode')?.checked;
 function wipe(){modeSaving=false;++modeUiRequest;if($('liModeStatus'))$('liModeStatus').textContent='';sample=null;usbPpm=null;rate.reset()}
 // The header, Flight Data and this monitor share one authenticated RC reader.
 function reuseVerifiedStatus(kit){
  const rc=kit.rc,at=Number(kit.rcAt),now=Date.now();
  if(!kit.connected||!window.ZebjusKitData?.isNetwork(kit.transport)||
     !rc||rc.kitId!==kit.kitId||!Number.isFinite(at)||at<=0||at>now||
     at<=Number(sample?.at||0)||now-at>SNAPSHOT_TTL_MS||
     !channels.every(field=>finitePulse(rc[field])))return;
  if(isOlderAcceptedInput(sample?.rc,rc))return;
  const previous=sample;
  const sequenceAt=previous?.rc?.seq===rc.seq&&previous?.rc?.source===rc.source&&ownerKey(previous.rc)===ownerKey(rc)&&previous.rc.accepted===rc.accepted?
   previous.sequenceAt??previous.at:at;
  sample={kitId:kit.kitId,rc:{...rc},at,sequenceAt,
   rateHz:rate.observe(kit.kitId,rc,at),ledOn:kit.ledOn,
   motorsOff:rc.motorsDisabled};
 }
 const write=(id,value)=>{const e=$(id),text=String(value);if(e&&e.textContent!==text)e.textContent=text};
 function display(){
  const kit=getKit(),identity=kit.kitId&&(kit.connected||['stale','reconnecting'].includes(kit.linkState))?kit.kitId:'';
  const connected=kit.connected===true,at=Date.now();
  const binding=[identity,kit.bootId,kit.transport,kit.physicalLink,kit.monitorGeneration].join('|');
  if(binding!==lastBinding){
   wipe();lastBinding=binding;lastConnected=connected;
  }
  if(connected!==lastConnected){
   if(sample)sample={...sample,historicalOnly:true};
   lastConnected=connected;
  }
  reuseVerifiedStatus(kit);
  const accepted=normalizeAcceptedInput(kit,sample,{now:at});
  // Retained values are presentation only. The simulator still receives the
  // real disconnected state and cannot consume this historical display.
  const history=!connected&&sample?.kitId===kit.kitId&&at-sample.at<15000?
   normalizeAcceptedInput({...kit,connected:true},{...sample,historicalOnly:true},{now:at}):null;
  const v=history?.values?{...accepted,kitName:history.kitName,values:history.values,
   seq:history.seq,ageMs:history.ageMs,accepted:history.accepted,rejected:history.rejected,
   inputTransport:history.inputTransport,inputArm:'STALE',historical:true}:accepted;
  if(pidVisible())simInputs.acceptKit({kit,input:accepted});
  else simInputs.clearKit();
  const ppm=ppmMonitorEvidence(kit,sample?.rc,sample?.at,at);
  const path=kit.rcAccess?.controlPath;
  const selectedPpm=connected&&(path==='PPM'||accepted.source==='PPM'||
   ppm.lost&&accepted.source==='NONE'&&(!path||path==='AUTO'));
  const lost=selectedPpm&&ppm.lost,absent=selectedPpm&&ppm.absent;
  const delayed=selectedPpm&&!lost&&!absent&&v.state==='stale';
  const displayState=lost?'lost':absent?'waiting':delayed?'stale':v.state;
  const historicalPpm=delayed&&(accepted.ageMs===null||accepted.ageMs>PPM_OBSERVATION_MS);
  const values=historicalPpm||lost||absent?null:v.values;
  card.dataset.liveState=displayState;
  write('liLiveState',lost?'PPM SIGNAL LOST':absent?'WAITING FOR PPM':delayed?'MONITOR DELAYED':displayState.toUpperCase());
  $('liLiveState').dataset.state=displayState;
  write('liKitName',v.kitName);
  write('liInputSource',selectedPpm&&v.source==='NONE'?'PPM · selected':v.source);
  write('liInputTransport',v.inputTransport);
  write('liSelectionReason',selectionReason);
  write('liBoardVersion',[kit.board,kit.version].filter(Boolean).join(' • ')||'—');
  if(!kit.connected&&kit.kitId&&monitorChoice!=='auto'){write('liLiveState','UNVERIFIED');card.dataset.liveState='unverified';}
  write('liKitTransport',kit.transport==='android-relay'?'RELAY • '+String(kit.physicalLink||'KIT').toUpperCase():v.transport);
  write('liPacketNumber',v.seq??'—');
  write('liAge',v.ageMs===null?'—':v.ageMs+' ms');
  write('liRate',v.rateHz===null?'— Hz':v.rateHz.toFixed(1)+' Hz');
  write('liCounts',String(v.accepted??'—')+' / '+String(v.rejected??'—'));
  const inputArm=delayed||lost||absent?'UNVERIFIED':v.inputArm;
  write('liInputArm',inputArm);
  write('liFlightMode',v.flightMode?v.flightMode.toUpperCase():'NOT REPORTED');
  const actual=kit.connected?kit.flightModeState:null;
  const modeSelect=$('liModeSelect');
  if(modeSelect){modeSelect.disabled=!kit.connected||!actual||kit.transport==='android-relay';if(actual&&!modeSaving)modeSelect.value=actual.saved;
   modeSelect.title=!actual?'UNSUPPORTED • update FlightCore for authoritative Kit mode settings':kit.transport==='android-relay'?'Relay monitoring is read-only':'Kit classroom metadata • physical stabilization is not supported';}
  if(!modeSaving&&!$('liModeStatus')?.textContent?.startsWith('NOT VERIFIED'))write('liModeStatus',actual?'SAVED '+actual.saved.toUpperCase()+' • ACTIVE '+actual.active.toUpperCase()+(actual.pending?' • PENDING '+actual.pending.toUpperCase():''):'UNSUPPORTED • update FlightCore for authoritative mode settings');
  for(const [key,id] of [['ch5','liAux5'],['ch6','liAux6']])write(id,v.aux?.[key]===null||v.aux?.[key]===undefined?'NOT REPORTED':v.aux[key]+' µs');
  const connectionState=kit.connected?(kit.linkState==='delayed'?'RESPONSE DELAYED':'CONNECTED'):
   monitorChoice==='usb'&&!globalThis.navigator?.serial?'UNSUPPORTED':
   monitorChoice==='usb'&&!kit.usbAvailable?'PERMISSION REQUIRED':'DISCONNECTED';
  write('liConnectionState',connectionState);
  write('liKitIdentity',kit.connected?kit.kitId:'—');
  $('liInputArm').dataset.state=inputArm==='ARMED'?'armed':inputArm==='DISARMED'?'off':'unknown';
  write('liLed',v.led);
  write('liMotors',v.motors);
  $('liMotors').dataset.state=v.motors==='DISABLED'?'off':'unknown';
  for(const field of channels){
   const label=field[0].toUpperCase()+field.slice(1),n=values?.[field];
   const pct=finitePulse(n)?(n-1000)/10:0;
   write('li'+label,finitePulse(n)?n:'—');
   const bar=$('li'+label+'Bar');if(bar){
    bar.style.width=pct+'%';const track=bar.parentElement;
    if(track){if(finitePulse(n))track.setAttribute('aria-valuenow',String(n));else track.removeAttribute('aria-valuenow')}
   }
  }
  const stick=(id,x,y)=>{const e=$(id);if(e){e.style.left=bounded(x,0,100)+'%';e.style.top=bounded(y,0,100)+'%'}};
  const n=values||neutral;
  stick('liLeftDot',(n.yaw-1000)/10,100-(n.throttle-1000)/10);
  stick('liRightDot',(n.roll-1000)/10,100-(n.pitch-1000)/10);
  write('liLeftYaw',values?n.yaw:'—');write('liLeftThrottle',values?n.throttle:'—');
  write('liRightRoll',values?n.roll:'—');write('liRightPitch',values?n.pitch:'—');
  const message=lost?'FlightCore reported PPM receiver loss.':
   absent?'Waiting for the PPM receiver.':
   delayed?'Accepted-stick updates are delayed. Dimmed sticks are the last observed values.':
   v.state==='live'?'Received by physical Kit • monitoring only.':
   v.state==='idle'?'No current accepted RC input. Joysticks neutral; no Take Control needed to view.':
   v.state==='stale'?'RC telemetry is delayed or stale. Values are historical, not live control; this alone does not prove PPM receiver loss.':
   v.state==='waiting'?'Waiting for authenticated accepted-input telemetry from this Kit. PPM requires firmware support.':
   v.historical?'Kit connection unavailable. Dimmed values are the last confirmed input; verify this Kit to resume.':
   'Select and connect a verified Kit to view its accepted RC inputs.';
  write('liHelp',message+' INPUT ARM is diagnostic only; motors are never armed by this monitor.');
  const receiverChannels=ppm.ppm?.present===true&&Array.isArray(ppm.ppm.channels)&&
   ppm.ppm.channels.length===8&&ppm.ppm.channels.every(finitePulse)?ppm.ppm.channels:null;
  const ppmChannels=ppm.lost||ppm.absent?null:receiverChannels||
   (accepted.source==='PPM'&&!historicalPpm?(v.receiverChannels||v.ppmChannels):null);
  write('liPpmHealth',describePpmMonitorHealth(kit,accepted,{rc:sample?.rc,rcAt:sample?.at,now:at}));
  for(let i=0;i<8;i++){
   const n=ppmChannels?.[i]??null;
   write('liCh'+(i+1),n??'—');
   const bar=$('liCh'+(i+1)+'Bar');
   if(bar)bar.style.width=n===null?'0%':((n-1000)/10)+'%';
  }
 }
 window.addEventListener('dronelab:serial-line',event=>{
  const kit=getKit();
  if(!kit.connected||kit.transport!=='usb'||!kit.kitId||event.detail?.transport&&event.detail.transport!=='usb')return;
  const line=String(event.detail?.line||'');
  const decoder=window.ZebjusSerialRcDecoder;
  const ppm=decoder?.parsePpmChannels?.(line);
  if(ppm){
   usbPpm={...ppm,present:true,observedAt:Date.now(),kitId:kit.kitId,bootId:kit.bootId,generation:kit.monitorGeneration};
   if(ppm.owner&&sample?.rc?.source==='PPM'&&sample?.rc?.active===true){
    sample.rc={...sample.rc,channels:ppm.channels};
    if(visible())display();
   }
   return;
  }
  if(line.startsWith('ZJPPM,1,LOST,')){
   const at=Date.now();
   usbPpm={present:false,signalLost:true,observedAt:at,kitId:kit.kitId,bootId:kit.bootId,generation:kit.monitorGeneration};
   if(sample?.rc?.source==='PPM'){
    sample={...sample,at,rc:{...sample.rc,...neutral,active:false,inputArmed:false,source:'NONE',
     receiver:undefined,channels:null,lastReleaseReason:'PPM_SIGNAL_LOST'}};
   }
   if(visible())display();return;
  }
  const statusRecord=decoder?.parseSerialStatus?.(line);
  if(statusRecord){
   if(statusRecord.kitId!==kit.kitId)return;
   const at=Date.now(),rc=statusRecord.rc,previous=sample;
   const same=previous?.rc?.seq===rc.seq&&previous?.rc?.source===rc.source&&previous.rc.accepted===rc.accepted;
   sample={kitId:kit.kitId,rc,at,sequenceAt:same?previous.sequenceAt??previous.at:at,
    rateHz:rate.observe(kit.kitId,rc,at),ledOn:statusRecord.ledOn,motorsOff:rc.motorsDisabled};
   if(visible())display();return;
  }
  const received=decoder?.parseSerialRc?.(line);
  if(!received)return;
  const at=Date.now(),motorReported=received.motorsDisabled;
  if(received.kind==='frame'){
   if(sample?.rc?.active&&sample.rc.source===received.source&&Number(received.seq)<Number(sample.rc.seq))return;
   const hz=rate.observe(kit.kitId,received,at);
   const prev=sample;
   const seqChanged=!prev||prev.rc?.seq!==received.seq||prev.rc?.source!==received.source;
   const confirmed=received.source==='PPM'&&usbPpm?.owner===true&&
      at-usbPpm.observedAt<=300?usbPpm.channels:null;
   sample={kitId:kit.kitId,rc:{...received,ageMs:0,accepted:sample?.rc?.accepted,rejected:sample?.rc?.rejected,ch5:sample?.rc?.ch5,ch6:sample?.rc?.ch6,...(confirmed?{channels:confirmed}:{})},
    at,sequenceAt:seqChanged?at:prev.sequenceAt??prev.at,
    rateHz:hz,motorsOff:motorReported};
  }else if(received.kind==='idle'||received.kind==='reset'||received.kind==='claim'){
   rate.reset();simInputs.clearKit();
   sample={kitId:kit.kitId,rc:{...neutral,source:'NONE',active:false,seq:0,inputArmed:false,motorsDisabled:received.motorsDisabled},
    at,rateHz:null,motorsOff:motorReported};
  }
  if(visible())display();
 });
 document.addEventListener('visibilitychange',()=>{
  // The shared reader resumes on visibility. Keep the sample's original time.
  rate.reset();display();
 });
 // A link notification can describe a different path or refresh the same Kit.
 // The selected verified path decides whether identity/connection actually
 // changed. Clearing every notification creates an artificial missing packet
 // and stops a running USB simulator even while serial input stays fresh.
 window.addEventListener('dronelab:kit-link',display);
 $('liModeSelect')?.addEventListener('change',async e=>{
  const request=++modeUiRequest;modeSaving=true;write('liModeStatus','SAVING • '+e.target.value.toUpperCase());
  try{
   const actual=await window.ZebjusKits.setFlightMode(e.target.value,{transport:getKit().transport});
   if(request===modeUiRequest)write('liModeStatus',actual.pending?'SAVED • PENDING UNTIL DISARM':'SAVED • ACTIVE '+actual.active.toUpperCase());
  }catch(error){if(request===modeUiRequest)write('liModeStatus','NOT VERIFIED • '+error.message)}
  finally{if(request===modeUiRequest){modeSaving=false;}}
 });
 $('liMonitorSelect')?.addEventListener('change',e=>{monitorChoice=e.target.value;wipe();display();});
 window.addEventListener('dronelab:devices-view',display);
 display();
 setInterval(display,UI_TICK_MS);
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initLiveInputs,{once:true});
 else initLiveInputs();
}
