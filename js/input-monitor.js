const receiverSources=['NONE','PPM','ANDROID','WEB'];
const uint32=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
export const isOlderReceiverCounter=(value,previous)=>uint32(value)&&uint32(previous)&&((value-previous)|0)<0;

export function parseReceiverSnapshot(rc){
 const frame=rc?.receiver;
 if(!frame||receiverSources[frame.sourceId]===undefined||
   !['sequence','receivedAtMs','accepted','generation'].every(key=>uint32(frame[key]))||
   !Number.isInteger(frame.availableMask)||frame.availableMask<0||frame.availableMask>255||
   !['valid','selected','inputArmed'].every(key=>typeof frame[key]==='boolean')||
   !Array.isArray(frame.channels)||frame.channels.length!==8||
   !frame.channels.every((v,i)=>frame.availableMask&(1<<i)?Number.isInteger(v)&&v>=1000&&v<=2000:v===null))return null;
 if(frame.accepted!==rc.accepted)return null;
 if(frame.valid){
  if(!frame.selected||receiverSources[frame.sourceId]!==rc.source||frame.sequence!==rc.seq||
    (frame.availableMask&15)!==15||frame.channels[0]!==rc.roll||frame.channels[1]!==rc.pitch||
    frame.channels[2]!==rc.throttle||frame.channels[3]!==rc.yaw)return null;
 }else if(frame.sourceId!==0||frame.availableMask!==0||frame.inputArmed)return null;
 return frame;
}

// Read-only display observations. These limits never authorize motor output
// or renew the firmware/RC/simulator input freshness deadlines.
export const PPM_OBSERVATION_MS=3500;

export function ppmMonitorEvidence(kit,rc=kit?.rc,rcAt=kit?.rcAt,now=Date.now()){
 const recent=at=>Number.isFinite(at)&&at>0&&at<=now&&now-at<=PPM_OBSERVATION_MS;
 const observedAt=kit?.ppm?.observedAt??kit?.ppmObservedAt;
 const ppm=kit?.connected===true&&recent(observedAt)&&typeof kit.ppm?.present==='boolean'?kit.ppm:null;
 const rcKnown=kit?.connected===true&&recent(rcAt);
 const acceptedPpm=rcKnown&&rc?.source==='PPM'&&rc.active===true&&rc.inputValid!==false&&rc.failsafe!==true;
 const absent=ppm?.present===false&&(!acceptedPpm||observedAt>=rcAt);
 const releaseObservedAt=rc?.releaseObservedAt??rcAt;
 const released=rcKnown&&recent(releaseObservedAt)&&rc?.active!==true&&rc?.lastReleaseReason==='PPM_SIGNAL_LOST';
 const recovered=ppm?.present===true&&observedAt>releaseObservedAt;
 return {ppm,absent,lost:released&&!recovered||absent&&(ppm.signalLost===true||ppm.losses>0)};
}

export function setupInputSample(state,observedAt,at=Date.now()){
 const s=state||{},elapsed=Math.max(0,at-observedAt),source=s.selectedInput==='AUTO'?'AUTO → '+(s.inputSource||'NONE'):(s.selectedInput||'Not selected');
 const monitor=s.ppm&&['PPM','AUTO'].includes(s.selectedInput)&&(!s.inputValid||s.inputSource==='PPM');
 const sample=monitor?{inputValid:s.ppm.present,channels:s.ppm.channels,inputAgeMs:s.ppm.ageMs,inputSource:'PPM'}:s;
 const reported=sample.inputValid===true&&observedAt>0&&elapsed<1000&&Array.isArray(sample.channels);
 const transit=Number.isFinite(s.roundTripMs)?Math.max(0,s.roundTripMs):0;
 const age=Number.isFinite(sample.inputAgeMs)&&sample.inputAgeMs>=0?sample.inputAgeMs+transit+elapsed:null;
 const maximum=sample.inputSource==='PPM'?150:300;
 return {source:monitor?'PPM · receiver monitor':source,reported,valid:reported&&age!==null&&age<=maximum,age,ageUpperBound:transit>0,channels:reported?sample.channels:[],controlValid:s.inputValid===true,captureHz:monitor?s.ppm.captureHz:null};
}

// A channel monitor shows the last board observation, not a motor-control
// frame. Keep its observation state stable across a normal network round trip
// while exposing the strict 150/300 ms eligibility separately in `valid`.
export function setupMonitorSample(state,observedAt,kit={},at=Date.now()){
 const s=state||{},age=Math.max(0,at-observedAt),transit=Math.max(0,Number(s.roundTripMs)||0);
 const matching=!!state&&observedAt>0&&at>=observedAt&&
  (!s.kitId||s.kitId===kit.kitId)&&(!s.bootId||!kit.bootId||s.bootId===kit.bootId);
 const path=kit.rcAccess?.controlPath||s.selectedInput;
 const samePath=!kit.rcAccess?.controlPath||path===s.selectedInput;
 const strict=setupInputSample(matching&&samePath&&kit.connected?s:null,observedAt,at);
 const empty={...strict,reported:false,valid:false,monitoring:false,channels:[],observationAgeMs:age,receiver:null,receiverObservedAt:0};
 if(!matching||!samePath)return empty;
 // Prefer the newer conservative observation, including a newer ABSENT
 // report. An old motor-status reply must not override fresh receiver loss.
 const observations=[{ppm:s.ppm,at:observedAt-transit,transitKnown:true},{ppm:kit.ppm,at:kit.ppm?.observedAt??kit.ppmObservedAt,transitKnown:false}]
  .filter(o=>o.ppm&&typeof o.ppm.present==='boolean'&&Number.isFinite(o.at)&&o.at>0&&o.at<=at)
  .sort((a,b)=>b.at-a.at);
 const receiver=observations[0],known=receiver&&at-receiver.at<=PPM_OBSERVATION_MS;
 const receiverKit={...kit,ppm:known?receiver.ppm:null,ppmObservedAt:known?receiver.at:0};
 const evidence=ppmMonitorEvidence(receiverKit,kit.rc,kit.rcAt,at);
 const ppmSelected=['PPM','AUTO'].includes(path)&&(!s.inputValid||s.inputSource==='PPM'||path==='PPM');
 const physical=ppmSelected&&!!receiver;
 const packet=physical?{valid:known&&receiver.ppm.present,channels:receiver.ppm.channels,ageMs:receiver.ppm.ageMs}: {valid:s.inputValid===true,channels:s.channels,ageMs:s.inputAgeMs};
 const elapsed=physical?at-receiver.at:age+transit;
 const values=Array.isArray(packet.channels)&&packet.channels.length>0&&packet.channels.length<=8&&packet.channels.some(Number.isInteger)&&packet.channels.every(v=>v==null||Number.isInteger(v)&&v>=1000&&v<=2000);
 const reported=packet.valid&&values&&elapsed<=PPM_OBSERVATION_MS&&!(ppmSelected&&(evidence.lost||evidence.absent));
 const packetAge=Number.isFinite(packet.ageMs)&&packet.ageMs>=0?packet.ageMs:null;
 const boardFresh=packetAge!==null&&packetAge<=(physical||s.inputSource==='PPM'?150:300);
 return {...strict,reported,channels:reported?packet.channels:[],
  // `valid` stays strict and never becomes true merely because a display
  // observation is retained or the receiver was previously verified.
  valid:strict.valid&&reported&&kit.connected===true,
  monitoring:kit.connected===true&&reported&&boardFresh,
  age:packetAge===null?null:packetAge+elapsed,ageUpperBound:physical?receiver.transitKnown:transit>0,
  source:physical?'PPM · receiver monitor':strict.source,
  observationAgeMs:elapsed,captureHz:known?receiver.ppm.captureHz:null,
  receiver:known?receiver.ppm:null,receiverObservedAt:known?receiver.at:0,
  receiverLost:ppmSelected&&evidence.lost,
  monitorDelayed:reported&&elapsed>=1000,
  receiverHealth:describePpmMonitorHealth(receiverKit,
   {source:ppmSelected?'PPM':s.inputSource,state:'stale'},{now:at,monitorOnly:true})};
}

// A stale WebApp RC snapshot is NOT proof of physical PPM signal loss.
// Receiver health is the most recent authenticated FlightCore /api/status
// observation, explicitly age bounded. Never use this health label to make
// an old controller frame LIVE, ARM a motor, or refresh simulator inputs.
export function describePpmMonitorHealth(kit,input,{now=Date.now(),monitorOnly=false,rc=kit?.rc,rcAt=kit?.rcAt}={}){
 if(kit?.connected!==true)return 'KIT LINK OFFLINE • PPM UNVERIFIED';
 const staleRc=input?.source==='PPM'&&input?.state==='stale';
 const {ppm,absent,lost}=ppmMonitorEvidence(kit,rc,rcAt,now);
 if(lost)return 'PPM SIGNAL LOST • FLIGHTCORE REPORTED';
 if(absent)return 'PPM SIGNAL ABSENT • WAITING FOR RECEIVER';
 const measured=ppm?.captureHz,hz=Number.isFinite(measured)&&measured>0?' '+Math.round(measured)+' Hz':'';
 if(!ppm?.present)return input?.source==='PPM'&&input.state==='live'?'PPM INPUT LIVE':
  staleRc?'PPM UNVERIFIED • RC TELEMETRY DELAYED':'PPM SIGNAL NOT VERIFIED';
 if(monitorOnly)return 'PPM LAST VERIFIED'+hz;
 if(input?.source==='PPM'&&input?.state==='live')return 'PPM INPUT LIVE'+hz;
 if(staleRc)return 'PPM LAST VERIFIED'+hz+' • RC TELEMETRY DELAYED';
 if(input?.source==='PPM')return 'PPM PRESENT'+hz+' • RC DATA NOT LIVE';
 return 'PPM PRESENT'+hz+' • RC NOT SELECTED/ACCEPTED';
}

