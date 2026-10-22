/* Read-only Android command cache shared by the host and embedded simulator.
 * No transport polling, Kit ownership, ARM, or physical output APIs belong here.
 */
import {startSimulator,stopSimulator,resetSimulator,getSnapshot} from './tripod-physics.js';
export const INPUT_MAX_AGE_MS=450;
// Read-only verified Kit HTTP RC snapshots arrive slower than paired WebRTC.
// Simulator-only 1s grace absorbs Wi-Fi/browser rendering jitter; it never
// changes firmware failsafes, physical motors, or the 450ms WebRTC policy.
export const KIT_MIRROR_MAX_AGE_MS=1000;
const axesOf=c=>Object.fromEntries(['roll','pitch','yaw'].map(k=>[k,(c[k]-1500)/500]));
const neutral=()=>({throttle:1000,roll:1500,pitch:1500,yaw:1500});
const validPulse=n=>Number.isInteger(n)&&n>=1000&&n<=2000;
export function validMirrorFrame(m){
 return !!m&&m.mirrorVersion===1&&typeof m.sessionId==='string'&&m.sessionId.length>=8&&m.sessionId.length<=80&&
  Number.isSafeInteger(m.seq)&&m.seq>0&&['ap','sta','preview'].includes(m.transport)&&
  ['android-command','android-preview'].includes(m.kind)&&typeof m.kitId==='string'&&m.kitId.length<=80&&
  Number.isFinite(m.inputAgeMs)&&m.inputAgeMs>=0&&m.inputAgeMs<=250&&
  (!m.aux||Object.keys(m.aux).length===2&&['ch5','ch6'].every(k=>validPulse(m.aux[k])))&&
  !!m.channels&&Object.keys(m.channels).length===4&&Object.values(m.channels).every(validPulse)&&
  ['throttle','roll','pitch','yaw'].every(k=>validPulse(m.channels[k]));
}
export function createInputStore({now=()=>performance.now()}={}){
 let peer={connected:false,approved:false,supported:false,sessionId:'',deviceId:''},sample=null,receivedAt=0,lastSeq=0,arrivals=[],rateHz=null,rejected=0;
// Independent read-only stream of firmware-accepted Android RC, never a control grant.
// The monitor alone may feed this cache, after Kit identity and RC freshness validation.
let kitSample=null,kitReceivedAt=0,kitKey='',kitSeq=0,kitRateHz=null,kitMode=null,kitAccepted=null,kitEpoch=0;
let kitConnected=false,kitLinkIdentity='';
 const listeners=new Set();
 const notify=()=>{for(const fn of listeners)fn()};
 function setPeer(value){
  const next={connected:value?.connected===true,approved:value?.approved===true,
   supported:value?.supported===true,sessionId:value?.sessionId||'',deviceId:value?.deviceId||''};
  const changed=JSON.stringify(next)!==JSON.stringify(peer);
  if(!next.connected||!next.approved||next.sessionId!==peer.sessionId||next.deviceId!==peer.deviceId){sample=null;receivedAt=0;lastSeq=0;arrivals=[];rateHz=null;}
  peer=next;if(changed)notify();
 }
 function accept(m){
  if(!peer.connected||!peer.approved||!peer.supported||!validMirrorFrame(m)||m.sessionId!==peer.sessionId||m.seq<=lastSeq){rejected++;return false;}
  const at=now();
  // Count arrivals over a bounded window: inverse inter-packet intervals make
  // normal WebRTC delivery bursts look like thousands of updates per second.
  arrivals=arrivals.filter(t=>at-t<=1000);arrivals.push(at);
  if(arrivals.length>128)arrivals.splice(0,arrivals.length-128);
  const span=at-arrivals[0];rateHz=span>=250?1000*(arrivals.length-1)/span:null;
  lastSeq=m.seq;receivedAt=at;
  sample={...m,aux:m.aux?{...m.aux}:undefined,channels:{...m.channels}};notify();return true;
 }
 function clearKit(){
  const hadLink=kitConnected||!!kitLinkIdentity;
  kitMode=null;kitConnected=false;kitLinkIdentity='';
  const hadSample=kitSample!==null;
  kitSample=null;kitReceivedAt=0;kitKey='';kitSeq=0;kitRateHz=null;kitAccepted=null;kitEpoch=0;
  if(hadSample||hadLink)notify();
 }
 function acceptKit({kit,input}={}){
  const transport=String(kit?.transport||'').toLowerCase();
  const id=String(kit?.kitId||'');
  const priorLink=kitConnected,priorLinkIdentity=kitLinkIdentity;
  kitConnected=kit?.connected===true;
  kitLinkIdentity=kitConnected?id+'|'+transport+'|'+String(kit?.bootId||''):'';
  const linkChanged=priorLink!==kitConnected||priorLinkIdentity!==kitLinkIdentity;
  const vals=input?.values;
  const actual=kit?.flightModeState?.active||kit?.flightMode;
  const priorMode=kitMode;
  kitMode=kit?.connected===true&&['usb','ap','sta'].includes(transport)&&id&&['angle','acro'].includes(actual)?
   {kitId:id,transport,active:actual,saved:kit.flightModeState?.saved||actual,pending:kit.flightModeState?.pending||null}:null;
  const modeChanged=JSON.stringify(priorMode)!==JSON.stringify(kitMode);
  const key=id+'|'+transport+'|'+String(kit?.bootId||'')+'|'+String(input?.ownerId||'');
  // A transient delayed poll is not a new packet; let the Kit freshness clock
  // expire naturally instead of clearing the source at Live Inputs' 400ms UI limit.
  if(kit?.connected===true&&kitSample&&kitKey===key&&
     input?.state==='stale'&&(input?.source==='ANDROID'||transport==='usb')){
   if(modeChanged||linkChanged)notify();
   return false;
  }
  const valid=kit?.connected===true&&['usb','ap','sta'].includes(transport)&&
   id.length>0&&id.length<=80&&input?.state==='live'&&(input?.source==='ANDROID'||transport==='usb'&&['WEB','PPM'].includes(input?.source))&&
   Number.isSafeInteger(input?.seq)&&input.seq>0&&
   Number.isFinite(input?.ageMs)&&input.ageMs>=0&&input.ageMs<=400&&
   vals&&['throttle','roll','pitch','yaw'].every(field=>validPulse(vals[field]));
  if(!valid){
   // Keep trusted Kit mode visible even without a live accepted RC packet.
   // Do not briefly announce mode=null to subscribers during a source loss.
   const hadSample=kitSample!==null;
   kitSample=null;kitReceivedAt=0;kitKey='';kitSeq=0;kitRateHz=null;kitAccepted=null;kitEpoch=0;
   if(hadSample||modeChanged||linkChanged)notify();
   return false;
  }
  if(kitKey!==key){kitSample=null;kitSeq=0;kitKey=key;kitAccepted=null;kitEpoch=0;}
  const accepted=Number.isSafeInteger(input.accepted)?input.accepted:null;
  if(input.seq<=kitSeq){
   // Compact USB telemetry may omit ownerId. An advancing firmware accepted
   // counter proves that a reset sequence belongs to a new accepted producer.
   if(accepted!==null&&kitAccepted!==null&&accepted>kitAccepted){++kitEpoch;kitSeq=0;}
   else{if(modeChanged||linkChanged)notify();return false;}
  }
  kitAccepted=accepted; // Polling the same accepted packet cannot refresh freshness.
  kitSeq=input.seq;kitReceivedAt=now();kitRateHz=Number.isFinite(input.rateHz)?input.rateHz:null;
  kitSample={mirrorVersion:1,sessionId:'verified-kit-'+key+'|'+kitEpoch,seq:input.seq,
   channels:Object.fromEntries(['throttle','roll','pitch','yaw'].map(field=>[field,vals[field]])),
   transport,kind:transport==='usb'?'usb-received':'android-command',aux:{...input.aux},kitId:id,inputAgeMs:input.ageMs,origin:'kit',
   flightMode:['angle','acro'].includes(input.flightMode)?input.flightMode:null,
   inputArm:input.inputArm==='ARMED'?'ARMED':input.inputArm==='DISARMED'?'DISARMED':'STALE'};
  notify();return true;
 }
 function snapshot(){
  const ageMs=sample?Math.max(0,now()-receivedAt)+sample.inputAgeMs:null;
  const kitAgeMs=kitSample?Math.max(0,now()-kitReceivedAt)+kitSample.inputAgeMs:null;
  return {mode:kitMode?{...kitMode}:null,peer:{...peer},sample:sample?{...sample,aux:sample.aux?{...sample.aux}:undefined,channels:{...sample.channels}}:null,ageMs,rateHz,rejected,
   fresh:!!sample&&peer.connected&&peer.approved&&peer.supported&&ageMs<=INPUT_MAX_AGE_MS,
   kit:{connected:kitConnected,identity:kitLinkIdentity,sample:kitSample?{...kitSample,channels:{...kitSample.channels}}:null,
    ageMs:kitAgeMs,rateHz:kitRateHz,fresh:!!kitSample&&kitAgeMs<=KIT_MIRROR_MAX_AGE_MS}};
 }
 return {setPeer,accept,acceptKit,clearKit,snapshot,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)}};
}
export function sharedInputStore(){
 let root=globalThis;
 try{if(globalThis.parent&&globalThis.parent!==globalThis&&globalThis.parent.location.origin===globalThis.location.origin)root=globalThis.parent;}catch{}
 return root.ZebjusSimulatorInputs||(root.ZebjusSimulatorInputs=createInputStore());
}
export function createSimulatorInput(s,store,{onChange=()=>{},onTimeout=()=>{}}={}){
 let choice='auto',locked=null,lockedOrigin='',identity='',lockedKitIdentity='',heldFrame=null,reason='Ready',webSticks={left:{x:0,y:0},right:{x:0,y:0}};
 const androidFrame=(v,origin='auto')=>{
  // Preserve an already-running producer; never hand over silently mid-flight.
  if((origin==='auto'||origin==='webrtc')&&v.fresh&&v.sample)
   return {...v.sample,origin:'webrtc',ageMs:v.ageMs,rateHz:v.rateHz};
  if((origin==='auto'||origin==='kit')&&v.kit?.fresh&&v.kit.sample&&v.kit.sample.transport!=='usb')
   return {...v.kit.sample,origin:'kit',ageMs:v.kit.ageMs,rateHz:v.kit.rateHz};
  return null;
 };
 const usbFrame=v=>v.kit?.fresh&&v.kit.sample?.transport==='usb'?{...v.kit.sample,origin:'kit',ageMs:v.kit.ageMs,rateHz:v.kit.rateHz}:null;
 const frameFor=(v,source,origin='auto')=>source==='usb'?usbFrame(v):androidFrame(v,origin);
 const effective=()=>{const v=store.snapshot();return locked||(choice==='auto'?(usbFrame(v)?'usb':androidFrame(v)?'android':'web'):choice)};
 const key=m=>[m?.origin,m?.sessionId,m?.kitId,m?.transport,m?.kind].join('|');
 function stop(why='Web STOP'){resetSimulator(s);locked=null;lockedOrigin='';identity='';lockedKitIdentity='';heldFrame=null;reason=why;webSticks={left:{x:0,y:0},right:{x:0,y:0}};onChange();}
 function setChoice(value){if(s.running||!['auto','web','android','usb'].includes(value))return false;stop('Input source selected');choice=value;onChange();return true;}
 function applyLatest(){
  if(!s.running||!['android','usb'].includes(locked))return;
  const v=store.snapshot(),frame=frameFor(v,locked,lockedOrigin);
  // A verified Kit disconnect/reboot/transport change is not a transient
  // read-only snapshot gap; stop the virtual source lock immediately.
  if(lockedOrigin==='kit'&&(!v.kit.connected||v.kit.identity!==lockedKitIdentity)){
   stop('Kit link or identity changed • press Run to resume');onTimeout();return;
  }
  if(!frame){
   // Preserve the existing verified USB loss policy. Only Android AP/STA mirror
   // stalls (WebRTC or read-only Kit monitor) may hold a virtual Run.
   if(locked==='usb'){stop('USB input lost • press Run to resume');onTimeout();return;}
   // No simulator-side RC ACK or telemetry-age disarm. The read-only WebRTC/Kit
   // observer can stall while Android and FlightCore RC remain live.
   // Hold the last verified command ONLY in this virtual plant. Firmware,
   // Android and the browser's authenticated read-only monitor are unchanged.
   const pairingLost=lockedOrigin==='webrtc'&&
    (!v.peer.connected||!v.peer.approved||!v.peer.supported||v.peer.sessionId!==heldFrame?.sessionId);
   if(pairingLost){stop('Android pairing lost • press Run to resume');onTimeout();return;}
   if(reason!=='Running • mirror stale (holding last virtual input)'){
    reason='Running • mirror stale (holding last virtual input)';onChange();
   }
   return;
  }
  if(key(frame)!==identity){stop((locked==='usb'?'USB':'Android')+' source changed • press Run to resume');onTimeout();return;}
  heldFrame=frame;reason='Running';
  const c=frame.channels,a=axesOf(c);s.throttle=c.throttle;s.cmdRoll=a.roll;s.cmdPitch=a.pitch;s.cmdYaw=a.yaw;
 }
 function start(){
  if(s.running)return {accepted:true};
  const selected=effective(),v=store.snapshot(),frame=frameFor(v,selected);
  if(selected!=='web'&&!frame){reason=selected==='usb'?'Waiting for fresh verified USB Kit telemetry':v.peer.approved&&!v.peer.supported?'Android app update required or connect a verified AP Kit':'Waiting for fresh Android AP / paired input';return {accepted:false,reason};}
  const throttle=selected!=='web'?frame.channels.throttle:s.throttle;
  if(throttle>1025){reason='LOWER THROTTLE TO 1000 µs';return {accepted:false,reason};}
  s.throttle=throttle;if(!startSimulator(s))return {accepted:false,reason:'LOWER THROTTLE TO 1000 µs'};
  locked=selected;lockedOrigin=selected!=='web'?frame.origin:'';identity=selected!=='web'?key(frame):'';lockedKitIdentity=lockedOrigin==='kit'?v.kit.identity:'';heldFrame=selected!=='web'?frame:null;reason='Running';applyLatest();onChange();return {accepted:true};
 }
 function snapshot(){
  const v=store.snapshot(),source=effective(),remote=source!=='web',
   liveFrame=remote?frameFor(v,source,lockedOrigin||'auto'):null,
   held=remote&&s.running&&locked===source&&!liveFrame?heldFrame:null,
   frame=liveFrame||held,
   ageMs=liveFrame?.ageMs??(held?(lockedOrigin==='kit'?v.kit?.ageMs:v.ageMs):null),
   c=frame?frame.channels:neutral(),a=axesOf(c),p=getSnapshot(s);
  const throttleY=1-2*(c.throttle-1000)/1000;
   const sticks=remote?{left:{x:-a.yaw,y:throttleY},right:{x:a.roll,y:-a.pitch}}:
    {left:{...webSticks.left,y:Math.abs(webSticks.left.y)>.04?webSticks.left.y:1-2*(s.throttle-1000)/1000},right:webSticks.right};
  return {kitMode:v.mode,source:source==='usb'?'usb':remote?'mobile':'web',selectedSource:choice,activeSource:source,locked:!!locked,
   seq:remote?frame?.seq||0:0,appliedAt:0,mode:s.mode,armed:s.running,throttle:Math.round(s.throttle),
   axes:{roll:s.cmdRoll,pitch:s.cmdPitch,yaw:s.cmdYaw},previewAxes:remote&&!s.running?a:{roll:0,pitch:0,yaw:0},sticks,
   input:remote?{aux:{...frame?.aux},channels:{...c},fresh:!!liveFrame,held:!!held,ageMs:ageMs??null,rateHz:frame?.rateHz??null,
    kind:frame?.kind||'',transport:frame?.transport||'',kitId:frame?.kitId||'',
    origin:frame?.origin||lockedOrigin||'',flightMode:frame?.flightMode||null,inputArm:frame?.inputArm||'NOT REPORTED',supported:!!frame||v.peer.supported,paired:!!frame||v.peer.approved}:null,
   reason,angles:{roll:p.roll,pitch:p.pitch,yaw:p.yaw},rates:{roll:p.rollRate,pitch:p.pitchRate,yaw:p.yawRate},
   motors:{rpm:p.motorRPM,requestedRPM:p.motorRequestedRPM,thrust:p.motorThrust,output:p.motorCommands},vertical:p.vertical};
 }
 // Incoming snapshots never start, stop, or reconfigure the virtual controller.
 const unsubscribe=store.subscribe(()=>{applyLatest();onChange()});
 return {start,stop,snapshot,setChoice,tick:applyLatest,dispose:unsubscribe,
  setOwner:()=>false,apply:()=>({accepted:false,reason:'Use read-only input mirror; Run/Stop belongs to WebApp'}),
  webSticks(left,right){webSticks={left:{...left},right:{...right}}},get owner(){return effective()!=='web'?'mobile':'web'}};
}
