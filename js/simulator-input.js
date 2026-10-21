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
  !!m.channels&&Object.keys(m.channels).length===4&&Object.values(m.channels).every(validPulse)&&
  ['throttle','roll','pitch','yaw'].every(k=>validPulse(m.channels[k]));
}
export function createInputStore({now=()=>performance.now()}={}){
 let peer={connected:false,approved:false,supported:false,sessionId:'',deviceId:''},sample=null,receivedAt=0,lastSeq=0,arrivals=[],rateHz=null,rejected=0;
// Independent read-only stream of firmware-accepted Android RC, never a control grant.
// The monitor alone may feed this cache, after Kit identity and RC freshness validation.
let kitSample=null,kitReceivedAt=0,kitKey='',kitSeq=0,kitRateHz=null;
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
  sample={...m,channels:{...m.channels}};notify();return true;
 }
 function clearKit(){
  const hadSample=kitSample!==null;
  kitSample=null;kitReceivedAt=0;kitKey='';kitSeq=0;kitRateHz=null;
  if(hadSample)notify();
 }
 function acceptKit({kit,input}={}){
  const transport=String(kit?.transport||'').toLowerCase();
  const id=String(kit?.kitId||'');
  const vals=input?.values;
  const key=id+'|'+transport+'|'+String(kit?.bootId||'');
  // A transient delayed poll is not a new packet; let the Kit freshness clock
  // expire naturally instead of clearing the source at Live Inputs' 400ms UI limit.
  if(kit?.connected===true&&kitSample&&kitKey===key&&
     input?.state==='stale'&&input?.source==='ANDROID')return false;
  const valid=kit?.connected===true&&['ap','sta','usb','android-relay'].includes(transport)&&
   id.length>0&&id.length<=80&&['live','preview'].includes(input?.state)&&(input?.source==='ANDROID'||transport==='usb'&&['WEB','ANDROID','PPM'].includes(input?.source))&&
   Number.isSafeInteger(input?.seq)&&input.seq>0&&
   Number.isFinite(input?.ageMs)&&input.ageMs>=0&&input.ageMs<=400&&
   vals&&['throttle','roll','pitch','yaw'].every(field=>validPulse(vals[field]));
  if(!valid){clearKit();return false;}
  if(kitKey!==key){kitSample=null;kitSeq=0;kitKey=key;}
  if(input.seq<=kitSeq)return false; // Polling the same accepted packet cannot refresh freshness.
  kitSeq=input.seq;kitReceivedAt=now();kitRateHz=Number.isFinite(input.rateHz)?input.rateHz:null;
  kitSample={mirrorVersion:1,sessionId:'verified-kit-'+key,seq:input.seq,
   channels:Object.fromEntries(['throttle','roll','pitch','yaw'].map(field=>[field,vals[field]])),
   transport,kind:transport==='usb'?'verified-usb-serial':'android-command',kitId:id,inputAgeMs:input.ageMs,origin:transport==='usb'?'usb':'kit',source:input.source,
   flightMode:['angle','acro'].includes(input.flightMode)?input.flightMode:null,
   previewOnly:input.previewOnly===true,inputArm:input.inputArm==='ARMED'?'ARMED':input.inputArm==='DISARMED'?'DISARMED':'STALE'};
  notify();return true;
 }
 function snapshot(){
  const ageMs=sample?Math.max(0,now()-receivedAt)+sample.inputAgeMs:null;
  const kitAgeMs=kitSample?Math.max(0,now()-kitReceivedAt)+kitSample.inputAgeMs:null;
  return {peer:{...peer},sample:sample?{...sample,channels:{...sample.channels}}:null,ageMs,rateHz,rejected,
   fresh:!!sample&&peer.connected&&peer.approved&&peer.supported&&ageMs<=INPUT_MAX_AGE_MS,
   kit:{sample:kitSample?{...kitSample,channels:{...kitSample.channels}}:null,
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
 let choice='auto',locked=null,lockedOrigin='',identity='',reason='Ready',webSticks={left:{x:0,y:0},right:{x:0,y:0}};
 const androidFrame=(v,origin='auto')=>{
  // Preserve an already-running producer; never hand over silently mid-flight.
  if((origin==='auto'||origin==='webrtc')&&v.fresh&&v.sample)
   return {...v.sample,origin:'webrtc',ageMs:v.ageMs,rateHz:v.rateHz};
  if((origin==='auto'||origin==='kit'||origin==='usb')&&v.kit?.fresh&&v.kit.sample&&
   (origin==='auto'||v.kit.sample.origin===origin))
   return {...v.kit.sample,ageMs:v.kit.ageMs,rateHz:v.kit.rateHz};
  return null;
 };
 const effective=()=>{
  if(locked)return locked;
  const v=store.snapshot(),frame=androidFrame(v);
  if(choice==='auto')return frame?(frame.origin==='usb'?'usb':'android'):'web';
  return choice;
 };
 const key=m=>[m?.origin,m?.sessionId,m?.kitId,m?.transport,m?.kind].join('|');
 function stop(why='Web STOP'){resetSimulator(s);locked=null;lockedOrigin='';identity='';reason=why;webSticks={left:{x:0,y:0},right:{x:0,y:0}};onChange();}
 function setChoice(value){if(s.running||!['auto','web','android','usb'].includes(value))return false;stop('Input source selected');choice=value;onChange();return true;}
 function applyLatest(){
  if(!s.running||!['android','usb'].includes(locked))return;
  const v=store.snapshot(),frame=androidFrame(v,lockedOrigin);
  if(!frame||key(frame)!==identity){stop('Android input lost • press Run to resume');onTimeout();return;}
  const c=frame.channels,a=axesOf(c);s.throttle=c.throttle;s.cmdRoll=a.roll;s.cmdPitch=a.pitch;s.cmdYaw=a.yaw;
 }
 function start(){
  if(s.running)return {accepted:true};
  const selected=effective(),v=store.snapshot(),frame=androidFrame(v);
  if(['android','usb'].includes(selected)&&(!frame||(selected==='usb'&&frame.origin!=='usb')||(selected==='android'&&frame.origin==='usb'))){reason=v.peer.approved&&!v.peer.supported?'Android app update required or connect a verified AP Kit':'Waiting for fresh Android AP / paired input';return {accepted:false,reason};}
  const throttle=['android','usb'].includes(selected)?frame.channels.throttle:s.throttle;
  if(throttle>1025){reason='LOWER THROTTLE TO 1000 µs';return {accepted:false,reason};}
  s.throttle=throttle;if(!startSimulator(s))return {accepted:false,reason:'LOWER THROTTLE TO 1000 µs'};
  locked=selected;lockedOrigin=['android','usb'].includes(selected)?frame.origin:'';identity=['android','usb'].includes(selected)?key(frame):'';reason='Running';applyLatest();onChange();return {accepted:true};
 }
 function snapshot(){
  const v=store.snapshot(),source=effective(),remote=['android','usb'].includes(source),
   frame=remote?androidFrame(v,lockedOrigin||'auto'):null,
   c=frame?frame.channels:neutral(),a=axesOf(c),p=getSnapshot(s);
  const throttleY=1-2*(c.throttle-1000)/1000;
   const sticks=remote?{left:{x:-a.yaw,y:throttleY},right:{x:a.roll,y:-a.pitch}}:
    {left:{...webSticks.left,y:Math.abs(webSticks.left.y)>.04?webSticks.left.y:1-2*(s.throttle-1000)/1000},right:webSticks.right};
  return {source:remote?(source==='usb'?'usb':'mobile'):'web',selectedSource:choice,activeSource:source,locked:!!locked,
   seq:remote?frame?.seq||0:0,appliedAt:0,mode:s.mode,armed:s.running,throttle:Math.round(s.throttle),
   axes:{roll:s.cmdRoll,pitch:s.cmdPitch,yaw:s.cmdYaw},previewAxes:remote&&!s.running?a:{roll:0,pitch:0,yaw:0},sticks,
   input:remote?{channels:{...c},fresh:!!frame,ageMs:frame?.ageMs??null,rateHz:frame?.rateHz??null,
    kind:frame?.kind||'',transport:frame?.transport||'',kitId:frame?.kitId||'',
    origin:frame?.origin||lockedOrigin||'',flightMode:frame?.flightMode||null,inputArm:frame?.inputArm||'NOT REPORTED',supported:!!frame||v.peer.supported,paired:!!frame||v.peer.approved}:null,
   reason,angles:{roll:p.roll,pitch:p.pitch,yaw:p.yaw},rates:{roll:p.rollRate,pitch:p.pitchRate,yaw:p.yawRate},
   motors:{rpm:p.motorRPM,requestedRPM:p.motorRequestedRPM,thrust:p.motorThrust,output:p.motorCommands},vertical:p.vertical};
 }
 // Incoming snapshots never start, stop, or reconfigure the virtual controller.
 const unsubscribe=store.subscribe(()=>{applyLatest();onChange()});
 return {start,stop,snapshot,setChoice,tick:applyLatest,dispose:unsubscribe,
  setOwner:()=>false,apply:()=>({accepted:false,reason:'Use read-only input mirror; Run/Stop belongs to WebApp'}),
  webSticks(left,right){webSticks={left:{...left},right:{...right}}},get owner(){return ['android','usb'].includes(effective())?'mobile':'web'}};
}
