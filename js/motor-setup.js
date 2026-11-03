// Shared WebApp/Python motor command client. The firmware owns PWM and deadlines.
const pendingConfirmations=new Set();
export function cancelMotorConfirmations(){for(const cancel of [...pendingConfirmations])cancel();}
export {setupInputSample} from './input-monitor.js';
export function rtcBenchFrame(snapshot,kitId,peerId){
 const s=snapshot?.sample,p=snapshot?.peer;
 if(!snapshot?.fresh||snapshot.ageMs>200||!s?.aux||!p.connected||!p.approved||!p.supported||
  peerId&&peerId!==p.sessionId||s.kitId&&s.kitId!==kitId)throw Error('Fresh paired Android input required; peer or target changed.');
 return {peerId:p.sessionId,seq:s.seq,args:[s.seq,s.channels.throttle,`${s.channels.yaw}:${s.aux.ch5>1700?1:0}:${Math.ceil(snapshot.ageMs)}`]};
}
export function motorStopDescription(state){
 const reasons={CONTROL_LOST:'Slider updates stopped arriving within 750 ms. Outputs stopped; verify the link and start a new test.',SESSION_EXPIRED:'Motor keepalive was not received within 1.5 seconds. Outputs stopped; start a new test after the link is stable.',INPUT_LOST:'The selected input signal was lost. Lower throttle, disarm and check the receiver/controller.',INPUT_CHANGED:'The selected input, controller or radio mode changed. Start a new test after verifying the source.',TEST_FINISHED:'The timed test finished. Start a new test to continue.',CAL_TIMEOUT:'Calibration HIGH timed out. Disconnect motor power before starting calibration again.',CAL_FINISHED:'Calibration LOW finished. Confirm the ESC success tones.',DEADLINE_MISSED:'The board missed its motor service deadline. Outputs stopped; inspect firmware diagnostics.',USER_STOP:'STOP acknowledged. Outputs ended.'};
 return reasons[state?.reason]||state?.reason||'Start at 1000 µs';
}
export function createMotorClient({getKit,request,now=()=>Date.now(),setTimer=setInterval,clearTimer=clearInterval,onState=()=>{},rtcSnapshot=()=>globalThis.ZebjusSimulatorInputs?.snapshot?.(),record=(event,data)=>globalThis.ZebjusAckDiagnostics?.record(event,data)}){
 let session=null,timer=null,rtcTimer=null,sliderTimer=null,busy=false,epoch=0,starting=false,last=null,inFlight=0,stopping=0,samples=0;
 const activeModes=new Set(['READY','SINGLE_TEST','ALL_TEST','INPUT_TEST','CAL_HIGH','CAL_LOW','SLIDER_TEST']);
 const identity=k=>JSON.stringify([k?.kitId,k?.transport,k?.bootId||'',k?.generation,k?.connectionGeneration]);
 const check=(k,readOrStop=false)=>{if(!(k?.connected||readOrStop&&k?.linkVerified===true)||!/^ZFC-A2-/.test(k?.kitId||'')||!['usb','ap','sta'].includes(k?.transport))throw Error('Connect a verified A2 using USB, AP or STA. Android Relay is read-only.');};
 const publish=s=>{const {session:privateToken,...safe}=s;last=safe;onState(safe);return safe;};
 function clearPumps(){clearTimer(timer);timer=null;clearTimer(rtcTimer);rtcTimer=null;clearTimer(sliderTimer);sliderTimer=null;}
 function diagnostic(event,k,action,r={},ms=0){record(event,{route:'/api/motor',transport:k.transport,motorAction:action,motorMode:r.mode,motorReason:r.reason,motorPolicy:r.benchPolicy,motorRemainingMs:r.remainingMs,ppmCaptureBackend:r.ppm?.captureBackend,ppmCaptureHz:r.ppm?.captureHz,ppmCaptureErrors:r.ppm?.captureErrors,ppmPresent:r.ppm?.present,ppmAgeMs:r.ppm?.ageMs,ppmSeq:r.ppm?.seq,ppmLosses:r.ppm?.losses,ppmFaults:r.ppm?.faults,sliderMask:r.sliderMask,sessionRemainingMs:r.sessionRemainingMs,commandSequence:r.commandSequence,roundTripMs:ms,pulseM1:r.pulseUs?.[0],pulseM2:r.pulseUs?.[1],pulseM3:r.pulseUs?.[2],pulseM4:r.pulseUs?.[3]});}
 async function send(action,args=[],s=session){
  const k=getKit(s?.binding),run=epoch,at=now(),readOrStop=action==='STATUS'||action==='STOP';
  const guard=()=>{
   const current=getKit(s?.binding);check(current,readOrStop);
   if(identity(current)!==identity(k)||s&&identity(current)!==s.identity)throw Error('Motor setup stopped: Kit, boot or transport changed.');
   if(action!=='STOP'&&(run!==epoch||s?.token&&session!==s))throw Error('Motor operation cancelled before delivery.');
  };
  guard();inFlight++;
  try{
   const r=await request(k,{action,session:s?.token||'',a:String(args[0]??'-'),b:String(args[1]??'-'),c:String(args[2]??'-')},guard);
   if(r?.error)throw Error(r.error);
   if(r?.kitId!==k.kitId||identity(getKit(s?.binding))!==identity(k)||s?.bootId&&s.bootId!==r.bootId)throw Error('Motor reply identity changed.');
   const ms=Math.max(0,now()-at),value={...r,roundTripMs:ms,receivedAt:now()};
   if(!['KEEP','SLIDE','STATUS'].includes(action)||r.mode!==last?.mode||r.reason!==last?.reason||ms>=250||++samples%10===0)diagnostic('motor_ack',k,action,r,ms);
   // Any terminal ACK retires the token immediately, including SLIDE replies.
   // Late KEEP/STATUS replies must never re-enable a cancelled test in the UI.
   if(run!==epoch||s?.token&&action!=='STOP'&&session!==s)return value;
   if(action==='KEEP'&&session===s)s.keepAt=at;
   if(s&&session===s&&!activeModes.has(r.mode)){clearPumps();session=null;}
   return publish(value);
  }catch(e){diagnostic('motor_error',k,action,{reason:globalThis.ZebjusAckDiagnostics?.reasonClass?.(e)},Math.max(0,now()-at));throw e;}
  finally{inFlight--;}
 }
 async function stop(owner){
  if(owner&&session?.owner!==owner&&starting!==owner)return;
  cancelMotorConfirmations();
  ++epoch;starting=false;clearPumps();
  const s=session;session=null;
  stopping++;
  try{return await send('STOP',[],s)}catch(e){publish({...last,mode:'UNCONFIRMED',reason:e.message});throw e;}finally{stopping--;}
 }
 async function begin(owner='wizard',binding=null){
  if(session||starting||stopping)throw Error('Wait for STOP to finish before starting a new motor setup.');
  check(getKit(binding),true);starting=owner;const run=++epoch,k=getKit(binding);
  const initial={owner,binding,identity:identity(k),token:'',bootId:k.bootId||''};
  try{
   // STATUS reads the boot ID even when USB Kit discovery did not supply one.
   const status=await send('STATUS',[],initial);
   if(run!==epoch)throw Error('Motor start cancelled.');
   if(status.supported!==true)throw Error('Flash A2 FlightCore 1.6.0 or newer with motor setup support.');
   const guard=()=>{check(getKit(binding));if(run!==epoch||identity(getKit(binding))!==initial.identity)throw Error('Motor start cancelled.');};
   guard();
   const beginAt=now();
   const r=await request(getKit(binding),{action:'BEGIN',session:'',a:'PROPS_REMOVED',b:'PINS_VERIFIED',c:status.timedBenchSupported===true?'PWM_50HZ_1000_2000_TIMED':'PWM_50HZ_1000_2000'},guard);
   if(r.error)throw Error(r.error);
   const s={...initial,bootId:r.bootId,token:r.session,started:now(),keepAt:beginAt};
   if(!r.session||r.mode!=='READY'||r.kitId!==k.kitId||r.bootId!==status.bootId)throw Error('Motor setup was not acknowledged.');
   if(run!==epoch||identity(getKit(binding))!==initial.identity){try{await send('STOP',[],s)}catch{}throw Error('Motor start cancelled.');}
   const beginRtt=Math.max(0,now()-beginAt);
   session=s;diagnostic('motor_ack',k,'BEGIN',r,beginRtt);const publicState=publish({...r,roundTripMs:beginRtt,receivedAt:now()});
   timer=setTimer(async()=>{
    if(busy||inFlight||session!==s)return;
    if(now()-s.started>120000){void stop().catch(()=>{});return;}
    busy=true;
    try{await send('KEEP',[],s);}
    catch(e){if(session===s){void stop().catch(()=>{});publish({...last,mode:'UNCONFIRMED',reason:e.message});}}
    finally{busy=false;}
   },400);
   return publicState;
  }finally{if(run===epoch)starting=false;}
 }
 async function command(action,args=[],owner='wizard'){
  if(!session||session.owner!==owner)throw Error('Start your motor setup session first.');
  const s=session,run=epoch;
  if(action==='INPUT'&&last?.selectedInput==='ANDROID_WEBRTC'){
   let frame=rtcBenchFrame(rtcSnapshot(),getKit(s.binding).kitId),pending=false,lastSeq=frame.seq;
   await send('RTC',frame.args,s);
   rtcTimer=setTimer(async()=>{
    if(pending||session!==s)return;
    pending=true;
    try{const next=rtcBenchFrame(rtcSnapshot(),getKit(s.binding).kitId,frame.peerId);if(next.seq>lastSeq){lastSeq=next.seq;await send('RTC',next.args,s);}}
    catch(e){void stop().catch(()=>{});publish({...last,mode:'UNCONFIRMED',reason:e.message});}
    finally{pending=false;}
   },75);
  }
  const r=await send(action,args,s);
  if(run!==epoch)throw Error('Motor operation cancelled.');
  const expected={SLIDER:'SLIDER_TEST',SLIDE:'SLIDER_TEST',SINGLE:'SINGLE_TEST',ALL:'ALL_TEST',INPUT:'INPUT_TEST',CAL_HIGH:'CAL_HIGH',CAL_LOW:'CAL_LOW'}[action];
  if(expected&&r.mode!==expected)throw Error(motorStopDescription(r));
  return r;
 }
 async function startSlider(mask,readPulse,owner='wizard',duration=30000){
  if(last?.version<2||!last?.sliderDurationMaxMs)throw Error('Flash A2 FlightCore 1.7.0+ for live slider tests.');
  await command('SLIDER',[mask,1000,duration],owner);
  const s=session;let pending=false,seq=0;
  const tick=async()=>{
   if(pending||session!==s)return;pending=true;
   try{
    // A busy SLIDE must not starve the separate 1.5 s session lease. Fold a
    // due KEEP into this single-flight pump before the next control update.
    if(now()-s.keepAt>=400){await send('KEEP',[],s);if(session!==s)return;}
    const pulse=Number(readPulse());if(!Number.isInteger(pulse)||pulse<1000||pulse>2000)throw Error('Slider pulse must be 1000–2000 µs.');
    await command('SLIDE',[mask,pulse,++seq],owner);
   }catch(e){if(session===s){void stop(owner).catch(()=>{});publish({...last,mode:'UNCONFIRMED',reason:e.message});}}
   finally{pending=false;}
  };
  sliderTimer=setTimer(tick,150);await tick();
  if(session!==s||last?.mode!=='SLIDER_TEST')throw Error(motorStopDescription(last));
  return last;
 }
 async function confirmCalibration(binding=null){
  if(session||starting||stopping)throw Error('Stop outputs before saving ESC calibration.');
  if(last?.calibrationSaveSupported!==true)throw Error('Flash A2 FlightCore 1.7.5+ to save ESC calibration on the board.');
  const k=getKit(binding);
  if(last.kitId!==k?.kitId)throw Error('Kit changed before saving ESC calibration.');
  const saved=await send('CAL_CONFIRM',['TONES_CONFIRMED'],{binding,identity:identity(k),bootId:last.bootId,token:''});
  if(saved.escCalibrationSaved!==true)throw Error('ESC calibration save was not acknowledged.');
  return saved;
 }
 return {begin,command,startSlider,stop,confirmCalibration,status:()=>send('STATUS'),get state(){return last;},get owner(){return session?.owner||null;},get active(){return !!session;},get busy(){return !!(session||starting||stopping);}};
}

function selectedKit(binding){
 const kits=globalThis.ZebjusKits;
 if(binding?.transport==='usb'){
  const k=kits?.getUsbMonitorState?.();
  if(k?.kitId)return {...k,transport:'usb',generation:globalThis.DroneLabSerial?.generation?.()};
 }
 const k=kits?.getState?.();return {...k,generation:k?.transport==='usb'?globalThis.DroneLabSerial?.generation?.():undefined};
}
let requestId=0;
async function hardwareRequest(kit,args,guard){
 if(kit.transport!=='usb')return globalThis.ZebjusKits.requestBound(kit,'/api/motor','POST',args,guard);
 guard?.();
 const serial=globalThis.DroneLabSerial,id='m'+(++requestId),generation=serial?.generation?.();
 if(!serial?.isOpen?.()||serial.isFlashing?.())throw Error('Open the A2 USB runtime at 115200 baud.');
 const packet=['ZJMOTOR',kit.kitId,id,args.action,args.session||'-',args.a,args.b,args.c];
 if(packet.some(v=>typeof v!=='string'||/[\r\n,]/.test(v)))throw Error('Invalid motor command field.');
 return new Promise((resolve,reject)=>{
  const done=(error,value)=>{clearTimeout(timeout);globalThis.removeEventListener('dronelab:serial-line',listener);error?reject(error):resolve(value);};
  const listener=e=>{
   if(e.detail?.transport&&e.detail.transport!=='usb')return;
   const line=String(e.detail?.line||''),prefix='ZJMOTOR,ACK,'+kit.kitId+','+id+',';
   if(!line.startsWith(prefix))return;
   if(serial.generation?.()!==generation){done(Error('USB connection changed.'));return;}
   try{done(null,JSON.parse(line.slice(prefix.length)))}catch{done(Error('Invalid motor acknowledgement.'));}
  };
  const timeout=setTimeout(()=>done(Error('Motor command acknowledgement timed out.')),1400);
  globalThis.addEventListener('dronelab:serial-line',listener);
  serial.writeLine(packet.join(',')+'\n').catch(e=>done(e));
 });
}
export const motorClient=createMotorClient({getKit:selectedKit,request:hardwareRequest,onState:state=>{
 if(typeof globalThis.dispatchEvent==='function')globalThis.dispatchEvent(new CustomEvent('zebjus:motor-state',{detail:state}));
}});
export function confirmMotor(message){
 return new Promise((resolve,reject)=>{
  const d=document.createElement('dialog');d.className='motor-confirm';
  const p=document.createElement('p');p.textContent=message;
  const ok=document.createElement('button');ok.textContent='Confirm / Continue';ok.className='btn';
  const cancel=document.createElement('button');cancel.textContent='Cancel / STOP';cancel.className='btn danger';
  let settled=false;
  const cancelPending=()=>finish(false);
  const hidden=()=>{if(document.hidden)cancelPending();};
  const finish=yes=>{if(settled)return;settled=true;pendingConfirmations.delete(cancelPending);document.removeEventListener('visibilitychange',hidden);globalThis.removeEventListener('pagehide',cancelPending);d.close();d.remove();yes?resolve(true):reject(Error('Motor operation cancelled.'));};
  ok.onclick=()=>finish(true);cancel.onclick=()=>finish(false);d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
  pendingConfirmations.add(cancelPending);document.addEventListener('visibilitychange',hidden);globalThis.addEventListener('pagehide',cancelPending);
  d.append(p,ok,cancel);document.body.append(d);d.showModal();
 });
}
if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void motorClient.stop().catch(()=>{});});
 globalThis.addEventListener('pagehide',()=>{void motorClient.stop().catch(()=>{});});
 globalThis.ZebjusMotorSetup=motorClient;
}
