/* Shared WebApp/Android presentation policy. Firmware accepts Kit RC;
 * the simulator accepts virtual input. UI selection grants neither authority. */
(function(root){
 'use strict';
 const paths=Object.freeze([
  {id:'ANDROID_AP',label:'Android AP',source:'ANDROID',radio:'ap',target:'Kit'},
  {id:'ANDROID_WEBRTC',label:'Android WebRTC',source:'ANDROID',radio:'sta',target:'Simulator'},
  {id:'PPM',label:'PPM RX/TX',source:'PPM',radio:'',target:'Kit'},
  {id:'WEB_STA',label:'WebApp Joystick',source:'WEB',radio:'sta',target:'Kit'}
 ]);
 const find=id=>paths.find(p=>p.id===id)||null;
 function radio(kit={}){
  return kit.staConnected===true?'sta':kit.apActive===true?'ap':
   ['ap','sta'].includes(kit.physicalLink)?kit.physicalLink:
   ['ap','sta'].includes(kit.transport)?kit.transport:'';
 }
 function sameBinding(a={},b={}){
  return !!a.kitId&&a.kitId===b.kitId&&a.bootId===b.bootId&&
   a.transport===b.transport&&a.connectionGeneration===b.connectionGeneration&&a.relaySessionId===b.relaySessionId;
 }
 function failureState({error,heartbeatAt=0,now=Date.now(),maxAge=6500}={}){
  const fatal=[401,403].includes(Number(error?.status))||/identity|device id|kit id|mismatch|boot changed|session changed|signature|proof|unauthoriz/i.test(String(error?.message||''));
  return {fatal,state:!fatal&&heartbeatAt>0&&now-heartbeatAt<=maxAge?'delayed':'stale'};
 }
 function radioTarget(kit,mode){
  if(!['ap','sta','auto'].includes(mode))throw Error('Invalid Wi-Fi mode');
  let sta=kit.radioHandover?.lastStaInput||'ANDROID_WEBRTC';
  if(radio(kit)==='sta'){
   if(['PPM','WEB_STA','ANDROID_WEBRTC'].includes(kit.rcAccess?.controlPath))sta=kit.rcAccess.controlPath;
   else if(kit.rc?.source==='PPM')sta='PPM';
   else if(kit.rc?.source==='WEB')sta='WEB_STA';
  }
  return {mode,targetInput:mode==='ap'?'ANDROID_AP':sta,lastStaInput:sta};
 }
 function acceptRcObservation(previous,next){
  if(!previous?.active||!next?.active||previous.source!==next.source||previous.ownerId!==next.ownerId||Number(next.seq)>=Number(previous.seq))return true;
  // PPM reacquisition resets the lease sequence, but accepted is a boot-wide
  // firmware counter. A newer accepted frame proves this is a new acquisition,
  // including when loss/recovery happened entirely between observer polls.
  const a=previous.accepted,b=next.accepted;
  if(next.source!=='PPM'||![a,b].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff))return false;
  const advance=(b-a)>>>0;
  return advance>0&&advance<0x80000000;
 }
 function confirmedHandover(reply,plan){
  const h=reply?.radioHandover,a=reply?.rcAccess,path=find(plan.targetInput);
  return !!path&&h?.version===1&&h.profileSaved===true&&Number.isSafeInteger(h.revision)&&h.revision>0&&
   h.mode===plan.mode&&h.targetInput===plan.targetInput&&h.lastStaInput===plan.lastStaInput&&
   h.state==='PREPARED'&&a?.version===1&&a.pathVersion===1&&a.controlPath===plan.targetInput&&a.selection===path.source&&
   a.paused===true&&a.handoverPaused===true&&a.maintenance?.active===false&&a.maintenance.owned===false&&a.maintenance.leaseRemainingMs===0;
 }
 function describe({kit={},peer={},virtual={},client='web',pending=false,now=Date.now()}={}){
  const connected=kit.connected===true,rc=kit.rc||{},access=kit.rcAccess,
   mode=radio(kit),capable=access?.pathVersion===1&&(access.controlPath==='AUTO'||!!find(access.controlPath)),
   selected=capable&&find(access.controlPath)?access.controlPath:null,
   paused=access?.paused===true,safe=rc.inputArmed!==true&&(!Number.isFinite(rc.throttle)||rc.throttle<=1050),
   authorized=kit.transport==='usb'?kit.adminUnlocked===true:kit.controlAuthorized===true,
   other=rc.claimed===true&&rc.source!=='PPM'&&!kit.owner,
   paired=peer.connected===true&&(peer.approved===true||peer.paired===true),
   ppm=kit.ppm?.present===true&&(kit.transport!=='usb'||Number.isFinite(kit.ppm.observedAt)&&now-kit.ppm.observedAt<=900)||rc.source==='PPM'&&rc.active===true&&rc.inputValid!==false,
   busy=pending||kit.working===true||kit.networkBusy===true||kit.otaInProgress===true,
   observedAge=Number.isFinite(kit.rcAt)&&kit.rcAt>0?Math.max(0,now-kit.rcAt):Infinity,
   ageKnown=Number.isFinite(rc.ageMs)&&rc.ageMs>=0,
   currentRc=connected&&rc.active===true&&rc.inputValid!==false&&rc.failsafe!==true&&
    Number.isSafeInteger(rc.seq)&&rc.seq>0&&observedAge<=900&&
    (ageKnown?rc.ageMs+observedAge<=400:kit.transport==='usb'&&observedAge<=400),
   kitActive=currentRc?(rc.source==='PPM'?'PPM':rc.source==='WEB'?'WEB_STA':rc.source==='ANDROID'&&mode==='ap'?'ANDROID_AP':null):null,
   virtualActive=selected==='ANDROID_WEBRTC'&&virtual.running===true&&virtual.origin==='webrtc'&&virtual.fresh===true?'ANDROID_WEBRTC':null,
   active=paused?null:virtualActive||kitActive;
  const options=paths.map(path=>{
   let reason='Ready',status='READY';
   if(!connected){status='NOT CONNECTED';reason='Connect and verify a Kit';}
   else if(path.radio&&mode!==path.radio){status='UNAVAILABLE';reason='Unavailable in '+(mode||'unknown').toUpperCase()+' mode';}
   else if(!capable){status='UPDATE REQUIRED';reason='Install FlightCore 1.5.12 for four-path selection';}
   else if(busy){status='BUSY';reason='Wait for the current operation';}
   else if(kit.linkState==='delayed'){status='VERIFYING';reason='Waiting for a fresh Kit status';}
   else if(!authorized){status='READ-ONLY';reason=kit.transport==='usb'?'Unlock teacher admin on this USB Kit':'Diagnostic authorization required';}
   else if(paused){status='PAUSED';reason='End maintenance safely before selecting input';}
   else if(!safe){status='LOCKED';reason='Lower throttle and disarm';}
   else if(other&&selected!==path.id){status='IN USE';reason='Release the current controller first';}
   else if(path.id==='PPM'&&!ppm){status='NOT CONNECTED';reason='No fresh PPM receiver signal';}
   else if(path.id==='ANDROID_WEBRTC'&&!paired){status='NOT CONNECTED';reason='Pair Android and approve WebRTC';}
   else if(path.id==='ANDROID_AP'&&client==='web'&&kitActive!=='ANDROID_AP'){status='AVAILABLE';reason='Select, then connect Android to this Kit hotspot';}
   const selectable=['READY','AVAILABLE'].includes(status);
   return {...path,status:active===path.id?'ACTIVE':status,reason,selectable};
  });
  const item=find(selected),actual=find(active);
  const telemetryAgeMs=Number.isFinite(kit.heartbeatAt)&&kit.heartbeatAt>0?Math.max(0,now-kit.heartbeatAt):null;
  const telemetryLabel=connected?(kit.linkState==='delayed'?'Telemetry delayed':telemetryAgeMs===null?'Telemetry age unknown':'Telemetry '+(telemetryAgeMs<3500?'fresh':(telemetryAgeMs/1000).toFixed(1)+' s ago')):'Telemetry offline';
  const switching=access?.handoverPaused===true;
  const rcState=switching?(kit.radioHandover?.state==='FAILED'?'RC handover failed':'RC switching'):paused?'RC Paused':active?actual.label:selected==='PPM'&&kit.ppm?.present===false?'PPM Signal Lost':selected==='ANDROID_AP'&&kit.radioHandover?.state==='WAITING_CONTROLLER'?'Waiting for Android':selected==='ANDROID_WEBRTC'&&!paired?'WebRTC Disconnected':rc.active===true?'RC telemetry delayed':'RC Idle';
  return {paths:options,selected,active,mode,capable,paused,safe,busy,authorized,telemetryAgeMs,telemetryLabel,
   selectedLabel:item?.label||(capable&&access.controlPath==='AUTO'?'Auto':access?.selection&&access.selection!=='AUTO'?'Legacy '+access.selection:'Not selected'),activeLabel:rcState,
   target:actual?.target||item?.target||'Kit',
   connection:connected?(kit.linkState==='delayed'?'Response delayed':mode?mode.toUpperCase()+' Connected':String(kit.transport||'').toUpperCase()+' Connected'):kit.linkVerified?'Reconnecting':'Offline',
   joystickLocked:paused||selected==='PPM'||kitActive==='PPM'||!connected,
   reason:switching?(kit.radioHandover?.state==='FAILED'?'Wi-Fi/input handover failed. Lower throttle, disarm and retry.':'Input saved; waiting for Kit Wi-Fi handover.'):paused?'RC paused; telemetry remains available':selected==='PPM'||kitActive==='PPM'?'PPM controls RC; joysticks locked; telemetry available':
    selected==='ANDROID_WEBRTC'?'Android input targets the virtual simulator; Kit RC is not claimed':
    kit.linkState==='delayed'?'Kit response delayed; checking the same Device ID':'Only the selected controller may claim RC'};
 }
 root.ZebjusControlPaths=Object.freeze({paths,find,radio,sameBinding,failureState,radioTarget,acceptRcObservation,confirmedHandover,describe});
})(globalThis);
