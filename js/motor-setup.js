// Shared WebApp/Python motor command client. The firmware owns PWM and deadlines.
export function rtcBenchFrame(snapshot,kitId,peerId){
 const s=snapshot?.sample,p=snapshot?.peer;
 if(!snapshot?.fresh||snapshot.ageMs>200||!s?.aux||!p.connected||!p.approved||!p.supported||
  peerId&&peerId!==p.sessionId||s.kitId&&s.kitId!==kitId)throw Error('Fresh paired Android input required; peer or target changed.');
 return {peerId:p.sessionId,seq:s.seq,args:[s.seq,s.channels.throttle,`${s.channels.yaw}:${s.aux.ch5>1700?1:0}:${Math.ceil(snapshot.ageMs)}`]};
}
export function createMotorClient({getKit,request,now=()=>Date.now(),setTimer=setInterval,clearTimer=clearInterval,onState=()=>{},rtcSnapshot=()=>globalThis.ZebjusSimulatorInputs?.snapshot?.()}){
 let session=null,timer=null,rtcTimer=null,sliderTimer=null,busy=false,epoch=0,starting=false,last=null;
 const identity=k=>JSON.stringify([k?.kitId,k?.transport,k?.bootId||'',k?.generation,k?.connectionGeneration]);
 const check=k=>{if(!k?.connected||!/^ZFC-A2-/.test(k.kitId||'')||!['usb','ap','sta'].includes(k.transport))throw Error('Connect a verified A2 using USB, AP or STA. Android Relay is read-only.');};
 const publish=s=>{last=s;onState(s);return s;};
 async function send(action,args=[],s=session){
  const k=getKit(s?.binding);check(k);
  if(s&&identity(k)!==s.identity)throw Error('Motor setup stopped: Kit, boot or transport changed.');
  const r=await request(k,{action,session:s?.token||'',a:String(args[0]??'-'),b:String(args[1]??'-'),c:String(args[2]??'-')});
  if(r?.error)throw Error(r.error);
  if(r?.kitId!==k.kitId||identity(getKit(s?.binding))!==identity(k)||s?.bootId&&s.bootId!==r.bootId)throw Error('Motor reply identity changed.');
  return action!=='STOP'&&s?.token&&session!==s?r:publish(r);
 }
 async function stop(owner){
  if(owner&&session?.owner!==owner&&starting!==owner)return;
  ++epoch;starting=false;clearTimer(timer);timer=null;clearTimer(rtcTimer);rtcTimer=null;
  clearTimer(sliderTimer);sliderTimer=null;
  const s=session;session=null;
  try{return await send('STOP',[],s)}catch(e){publish({...last,mode:'UNCONFIRMED',reason:e.message});throw e;}
 }
 async function begin(owner='wizard',binding=null){
  if(session||starting)throw Error('Stop the current motor setup first.');
  check(getKit(binding));starting=owner;const run=++epoch,k=getKit(binding);
  const initial={owner,binding,identity:identity(k),token:'',bootId:k.bootId||''};
  try{
   // STATUS reads the boot ID even when USB Kit discovery did not supply one.
   const status=await send('STATUS',[],initial);
   if(run!==epoch)throw Error('Motor start cancelled.');
   if(status.supported!==true)throw Error('Flash A2 FlightCore 1.6.0 or newer with motor setup support.');
   const r=await request(k,{action:'BEGIN',session:'',a:'PROPS_REMOVED',b:'PINS_VERIFIED',c:'PWM_50HZ_1000_2000'});
   if(r.error)throw Error(r.error);
   const s={...initial,bootId:r.bootId,token:r.session,started:now()};
   if(!r.session||r.kitId!==k.kitId||r.bootId!==status.bootId)throw Error('Motor setup was not acknowledged.');
   if(run!==epoch||identity(getKit(binding))!==initial.identity){try{await send('STOP',[],s)}catch{}throw Error('Motor start cancelled.');}
   session=s;publish(r);
   timer=setTimer(async()=>{
    if(busy||!session)return;
    if(now()-s.started>120000){void stop().catch(()=>{});return;}
    busy=true;
    try{const state=await send('KEEP',[],s);if(session!==s)return;if(!['READY','SINGLE_TEST','ALL_TEST','INPUT_TEST','CAL_HIGH','CAL_LOW','SLIDER_TEST'].includes(state.mode)){clearTimer(timer);timer=null;clearTimer(rtcTimer);rtcTimer=null;clearTimer(sliderTimer);sliderTimer=null;session=null;}}
    catch(e){if(session===s){void stop().catch(()=>{});publish({...last,mode:'UNCONFIRMED',reason:e.message});}}
    finally{busy=false;}
   },400);
   return r;
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
  return r;
 }
 async function startSlider(mask,readPulse,owner='wizard',duration=30000){
  if(last?.version<2||!last?.sliderDurationMaxMs)throw Error('Flash A2 FlightCore 1.7.0+ for live slider tests.');
  await command('SLIDER',[mask,1000,duration],owner);
  const s=session;let pending=false,seq=0;
  const tick=async()=>{
   if(pending||session!==s)return;pending=true;
   try{
    const pulse=Number(readPulse());if(!Number.isInteger(pulse)||pulse<1000||pulse>2000)throw Error('Slider pulse must be 1000–2000 µs.');
    await command('SLIDE',[mask,pulse,++seq],owner);
   }catch(e){if(session===s){void stop(owner).catch(()=>{});publish({...last,mode:'UNCONFIRMED',reason:e.message});}}
   finally{pending=false;}
  };
  sliderTimer=setTimer(tick,150);await tick();return last;
 }
 return {begin,command,startSlider,stop,status:()=>send('STATUS'),get state(){return last;},get owner(){return session?.owner||null;},get active(){return !!session;}};
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
async function hardwareRequest(kit,args){
 if(kit.transport!=='usb')return globalThis.ZebjusKits.requestBound(kit,'/api/motor','POST',args);
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
  const finish=yes=>{d.close();d.remove();yes?resolve(true):reject(Error('Motor operation cancelled.'));};
  ok.onclick=()=>finish(true);cancel.onclick=()=>finish(false);d.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
  d.append(p,ok,cancel);document.body.append(d);d.showModal();
 });
}
if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void motorClient.stop().catch(()=>{});});
 globalThis.addEventListener('pagehide',()=>{void motorClient.stop().catch(()=>{});});
 globalThis.ZebjusMotorSetup=motorClient;
}
