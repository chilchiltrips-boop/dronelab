import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createMotorClient,setupInputSample,motorStopDescription} from '../js/motor-setup.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function dataApi(){const context={AbortController};vm.runInNewContext(read('js/kit-data-interface.js'),context);return context.ZebjusKitData;}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};

test('30-second USB motor tests retain physical heartbeat polling while network bench polls yield',async()=>{
 const source=read('js/classroom-kits.js');
 const policy=/const motorTrafficBusy=[^\n]+/.exec(source)[0];
 const start=source.indexOf(' pollTimer=setInterval(async()=>{'),end=source.indexOf(' rcTimer=setInterval',start);
 assert.ok(start>=0&&end>start);
 for(const transport of ['usb','ap','sta']){
  let at=100000,reads=0,poll;class Clock extends Date{static now(){return at;}}
  const state={connected:true,working:false,transport,heartbeatAt:at};
  const context={state,root:{ZebjusMotorSetup:{busy:true}},document:{hidden:false},Date:Clock,otaActive:false,wifiTesting:false,pollBusy:false,reconnectTicket:1,pollErrors:0,lastBackgroundStatusAt:0,foregroundResumedAt:0,
   FC_MONITOR_INTERVAL_MS:100,nextStatusReadAt:0,observeMonitor:()=>{},beginMonitorRead:()=>true,
   backgroundLinkPolicy:()=>({poll:true,penalize:true}),read:async()=>{reads++;state.heartbeatAt=at;context.nextStatusReadAt=at+2200;},setInterval:(fn,ms)=>{assert.equal(ms,100);poll=fn;return 1;}};
  vm.runInNewContext('let pollTimer;'+policy+source.slice(start,end),context);
  for(let elapsed=0;elapsed<=30000;elapsed+=100){at=100000+elapsed;await poll();if(transport==='usb')assert.ok(at-state.heartbeatAt<6500);}
  assert.equal(reads,transport==='usb'?14:0,transport+' heartbeat scheduling during motor test');
 }
});

test('STOP cancels an obsolete read and queued motion without overlapping signed work',async()=>{
 const queue=dataApi().createRequestScheduler(),order=[];
 const read=queue.schedule('kit',signal=>new Promise((_,reject)=>{
  signal.addEventListener('abort',()=>{
   order.push('cancel status');reject(signal.reason);
  },{once:true});
 }),{read:true,generation:1});
 await turn();
 const motion=queue.schedule('kit',()=>assert.fail('motion replayed'),{generation:1,motion:true,priority:80});
 const diagnostic=queue.schedule('kit',()=>order.push('new status'),{generation:1});
 const cancelled=[assert.rejects(read,{code:'SAFETY_CANCELLED'}),assert.rejects(motion,{code:'SAFETY_CANCELLED'})];
 const stop=queue.schedule('kit',()=>order.push('STOP ACK'),{priority:100,generation:1,preempt:true});
 await Promise.all([...cancelled,stop,diagnostic]);
 assert.deepEqual(order,['cancel status','STOP ACK','new status']);
 assert.equal(queue.metrics().cancelledStaleRequests,2);
});

test('STOP aborts obsolete local session enrollment and then uses a signed request',{timeout:2500},async()=>{
 const source=read('js/classroom-kits.js'),id='ZFC-A2-012345ABCDEF',ip='192.168.4.1';
 const boot='a'.repeat(32),session='b'.repeat(32),key='c'.repeat(64),started=deferred(),order=[];
 const env={AbortController,TextEncoder,TextDecoder,Uint8Array,URLSearchParams,crypto:webcrypto,setTimeout,clearTimeout,
  state:{kitId:id,bootId:boot},reconnectTicket:1,localKitHosts:new Map([[ip,id]]),adminKitHosts:new Map(),
  authSessions:new Map(),secureIds:new Set(),pairedKeys:new Map()};
 let enrollments=0;
 env.fetch=async(url,options)=>{
  const route=new URL(url).pathname;
  if(route==='/api/auth/local'){
   if(++enrollments===1)return new Promise((_,reject)=>{
    order.push('old enrollment');started.resolve();
    options.signal.addEventListener('abort',()=>{order.push('aborted');reject(options.signal.reason);},{once:true});
   });
   order.push('STOP enrollment');
   return {status:200,text:async()=>JSON.stringify({kitId:id,bootId:boot,session,key,
    scope:'ap_diagnostics',expiresMs:60000,setupExpiresMs:0}),headers:{get:()=>null}};
  }
  assert.equal(route,'/api/motor');
  assert.equal(options.headers['X-ZJ-Seq'],'1');
  assert.ok(options.headers['X-ZJ-Proof']);
  const text=JSON.stringify({kitId:id,motorsDisabled:true});
  order.push('STOP dispatched');
  return {status:200,text:async()=>text,headers:{get:()=>env.ZebjusKitAuth.mac(key,'response|1|200|'+text)}};
 };
 vm.createContext(env);
 for(const file of ['vendor/crypto/zfc-crypto.js','js/kit-auth.js','js/kit-local-auth.js','js/kit-data-interface.js'])
  vm.runInContext(read(file),env);
 env.root=env;env.requestScheduler=env.ZebjusKitData.createRequestScheduler();
 vm.runInContext(source.slice(source.indexOf('async function openNetworkSession'),source.indexOf('async function ',source.indexOf('async function openNetworkSession')+20)),env);
 vm.runInContext(source.slice(source.indexOf('function wifiDirect('),source.indexOf('async function deviceRequest(')),env);
 const readback=assert.rejects(env.wifiDirect(ip,'','/api/status'),{code:'SAFETY_CANCELLED'});
 await started.promise;
 const stopped=await env.wifiDirect(ip,'','/api/motor','POST',{action:'STOP'});
 await readback;
 assert.equal(stopped.motorsDisabled,true);
 assert.deepEqual(order,['old enrollment','aborted','STOP enrollment','STOP dispatched']);
});

test('signed request queue gives STOP and motor commands priority without interrupting an active read',async()=>{
 const queue=dataApi().createRequestScheduler(),hold=deferred(),order=[];
 let active=0,maximum=0;
 const run=(name,pause=false)=>async()=>{maximum=Math.max(maximum,++active);order.push(name);if(pause)await hold.promise;active--;return name;};
 const first=queue.schedule('kit',run('inflight status',true));await turn();
 const reads=[queue.schedule('kit',run('telemetry')),queue.schedule('kit',run('next status'))];
 const slide=queue.schedule('kit',run('SLIDE'),{priority:80});
 const stop=queue.schedule('kit',run('STOP'),{priority:100});
 assert.deepEqual(order,['inflight status']);hold.resolve();
 await Promise.all([first,...reads,slide,stop]);
 assert.deepEqual(order,['inflight status','STOP','SLIDE','telemetry','next status']);assert.equal(maximum,1);
});
test('a queued control update expires before transmission rather than renewing an old pulse',async()=>{
 let at=1000,sent=false;const queue=dataApi().createRequestScheduler({now:()=>at}),hold=deferred();
 const first=queue.schedule('kit',()=>hold.promise);await turn();
 const update=queue.schedule('kit',()=>{sent=true;},{priority:80,maxQueueMs:250});
 const rejected=assert.rejects(update,e=>e.code==='REQUEST_QUEUE_STALE'&&e.queueMs===251);at+=251;hold.resolve();await first;await rejected;assert.equal(sent,false);
});
function motorHarness({send,now}={}){
 const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',bootId:'b1',transport:'usb',generation:1};
 const timers=new Map(),calls=[],events=[];
 const state={kitId:kit.kitId,bootId:kit.bootId,version:2,supported:true,mode:'READY',reason:'NONE',sliderDurationMaxMs:30000,pulseUs:[1000,1000,1000,1000]};
 const client=createMotorClient({getKit:()=>kit,...(now?{now}:{}),setTimer:(fn,ms)=>(timers.set(ms,fn),ms),clearTimer:id=>timers.delete(id),record:(...entry)=>events.push(entry),request:async(k,a,guard)=>{
  guard?.();calls.push(a.action);
  const special=await send?.(a,state,guard);if(special)return special;
  if(['SLIDER','CAL_SLIDER'].includes(a.action))state.mode='SLIDER_TEST';if(a.action==='STOP'){state.mode='DISABLED';state.reason='USER_STOP';}
  return {...state,session:a.action==='BEGIN'?'token':undefined};
 }});
 return {client,kit,timers,calls,state,events};
}
test('leaving the page preserves a stored automatic ESC request or timed phase on USB/AP/STA; explicit STOP still aborts',async()=>{
 for(const transport of ['usb','ap','sta'])for(const phase of ['PENDING','HIGH','LOW']){
  const h=motorHarness();h.kit.transport=transport;
  Object.assign(h.state,{mode:phase==='PENDING'?'DISABLED':'AUTO_CAL_'+phase,
   pulseUs:Array(4).fill(phase==='PENDING'?0:phase==='HIGH'?2000:1000),
   autoEsc:{version:1,state:phase==='PENDING'?'AWAITING_POWER_CYCLE':'RUNNING',phase:phase==='PENDING'?'OFF':phase,outputsOff:phase==='PENDING'}});
  await h.client.wizardStatus();const before=h.calls.length;
  await h.client.leavePage();assert.equal(h.calls.length,before,transport+' '+phase+' does not send a lifecycle STOP');
  assert.equal(h.client.active,false);assert.equal(h.timers.size,0);
  await h.client.stop();assert.equal(h.calls.at(-1),'STOP');assert.equal(h.client.state.mode,'DISABLED');
 }
});
test('leaving the page still stops owned bench output and unverified automatic states',async()=>{
 const h=motorHarness();await h.client.begin();await h.client.startSlider(1,()=>1100);
 await h.client.leavePage();assert.equal(h.calls.at(-1),'STOP');assert.equal(h.client.active,false);assert.equal(h.timers.size,0);
 for(const state of [
  {mode:'UNCONFIRMED',autoEsc:{version:1,state:'AWAITING_POWER_CYCLE',outputsOff:true}},
  {mode:'DISABLED',autoEsc:{version:1,state:'AWAITING_POWER_CYCLE',outputsOff:false}},
  {mode:'SLIDER_TEST',autoEsc:{version:1,state:'RUNNING',phase:'HIGH'}},
  {mode:'AUTO_CAL_HIGH',autoEsc:{version:1,state:'RUNNING',phase:'LOW'}}
 ]){
  const uncertain=motorHarness();Object.assign(uncertain.state,state);await uncertain.client.status();
  await uncertain.client.leavePage();assert.equal(uncertain.calls.at(-1),'STOP');
 }
});
test('terminal SLIDE acknowledgment immediately clears all pumps and cannot report a successful start',async()=>{
 const h=motorHarness({send:async(a,state)=>a.action==='SLIDE'?{...state,mode:'DISABLED',reason:'CONTROL_LOST'}:null});
 await h.client.begin();await assert.rejects(h.client.startSlider(1,()=>1100),/750 ms/);
 assert.equal(h.client.active,false);assert.equal(h.timers.size,0);assert.equal(h.client.state.reason,'CONTROL_LOST');
 assert.ok(h.events.some(([event,data])=>event==='motor_ack'&&data.motorReason==='CONTROL_LOST'));
});
test('an old KEEP reply after STOP cannot replace the terminal output state or restart pumps',async()=>{
 const hold=deferred(),h=motorHarness({send:async a=>a.action==='KEEP'?hold.promise:null});
 await h.client.begin();const keep=h.timers.get(400)();await turn();await h.client.stop();
 hold.resolve({...h.state,mode:'READY',reason:'NONE'});await keep;
 assert.equal(h.client.state.mode,'DISABLED');assert.equal(h.client.state.reason,'USER_STOP');assert.equal(h.client.active,false);assert.equal(h.timers.size,0);
});
test('STOP invalidates a queued SLIDE before the transport can send it',async()=>{
 const queue=dataApi().createRequestScheduler(),hold=deferred();let queued=false;
 const h=motorHarness({send:async(a,state,guard)=>{
  if(a.action!=='SLIDE'||!queued)return null;
  return queue.schedule('kit',()=>{throw Error('cancelled SLIDE was transmitted');},{priority:80,guard});
 }});
 await h.client.begin();await h.client.startSlider(1,()=>1100);
 const background=queue.schedule('kit',()=>hold.promise);await turn();queued=true;
 const slide=h.timers.get(150)();await turn();await h.client.stop();hold.resolve();await background;await slide;
 assert.equal(h.client.active,false);assert.equal(h.client.state.mode,'DISABLED');assert.equal(h.timers.size,0);
});
test('low-rate motor KEEP never queues behind a motor request already in flight',async()=>{
 const hold=deferred();let delay=false;
 const h=motorHarness({send:async(a,state)=>delay&&a.action==='SLIDE'?hold.promise:null});
 await h.client.begin();await h.client.startSlider(1,()=>1100);delay=true;
 const slide=h.timers.get(150)();await turn();await h.timers.get(400)();
 assert.equal(h.calls.filter(action=>action==='KEEP').length,0);
 hold.resolve({...h.state});await slide;await h.client.stop();
});
test('legacy slider fallback refreshes control before its separate session lease',async()=>{
 let at=1000;const h=motorHarness({now:()=>at});await h.client.begin();await h.client.startSlider(1,()=>1100);
 at+=500;const before=h.calls.length;await h.timers.get(150)();
 assert.deepEqual(h.calls.slice(before),['SLIDE','KEEP']);await h.client.stop();
});
test('slider startup drains an existing heartbeat and owns every later KEEP',async()=>{
 let at=1000;const hold=deferred();let wait=true;
 const h=motorHarness({now:()=>at,send:async a=>wait&&a.action==='KEEP'?hold.promise:null});
 h.state.calibrationSlideKeepsSession=true;
 await h.client.begin();at+=500;
 const keep=h.timers.get(400)();await turn();
 const starting=h.client.startSlider(1,()=>1000,'wizard',30000,true);await turn();
 await h.timers.get(400)();
 assert.equal(h.calls.filter(a=>a==='KEEP').length,1);
 assert.equal(h.calls.includes('CAL_SLIDER'),false,'wait for the already-sent heartbeat');
 wait=false;hold.resolve({...h.state});await keep;await starting;
 at+=500;const before=h.calls.length;await h.timers.get(400)();await h.timers.get(150)();
 assert.deepEqual(h.calls.slice(before),['SLIDE']);await h.client.stop();
});
test('a fallback heartbeat in the slider pump cannot overlap another slider or KEEP',async()=>{
 let at=1000;const hold=deferred();let delay=false;
 const h=motorHarness({now:()=>at,send:async a=>delay&&a.action==='KEEP'?hold.promise:null});
 await h.client.begin();await h.client.startSlider(1,()=>1000);at+=500;delay=true;
 const update=h.timers.get(150)();await turn();const before=h.calls.length;
 await h.timers.get(400)();await h.timers.get(150)();
 assert.equal(h.calls.length,before);assert.equal(h.calls.at(-1),'KEEP');
 delay=false;hold.resolve({...h.state});await update;await h.client.stop();
});
test('slow BEGIN and CAL_SLIDER acknowledgements do not put KEEP before the first minimum pulse',async()=>{
 for(const renewal of [false,true]){
  let at=1000;const h=motorHarness({now:()=>at,send:async a=>{
   if(a.action==='BEGIN')at+=556;if(a.action==='CAL_SLIDER')at+=273;
  }});h.state.calibrationSlideKeepsSession=renewal;
  await h.client.begin();await h.client.startSlider(1,()=>1500,'wizard',30000,true);
  assert.deepEqual(h.calls.slice(0,4),['STATUS','BEGIN','CAL_SLIDER','SLIDE']);
  assert.equal(h.calls.filter(a=>a==='KEEP').length,renewal?0:1);await h.client.stop();
 }
});
test('a 600 ms slider ACK immediately sends the latest target with one request in flight; STOP cancels catch-up',async()=>{
 let at=1000,desired=1000,delay=false,active=0,maximum=0;const held=[],pulses=[];
 const h=motorHarness({now:()=>at,send:async(a,state)=>{
  if(a.action!=='SLIDE'||!delay)return;
  pulses.push(Number(a.b));maximum=Math.max(maximum,++active);
  return await new Promise(resolve=>held.push(()=>{active--;resolve({...state});}));
 }});h.state.calibrationSlideKeepsSession=true;
 await h.client.begin();await h.client.startSlider(1,()=>desired,'wizard',30000,true);
 delay=true;desired=1100;at+=600;const update=h.timers.get(150)();await turn();
 desired=1200;await h.timers.get(400)();await h.timers.get(150)();assert.equal(held.length,1);
 at+=600;held[0]();await update;await turn();
 assert.deepEqual(pulses,[1100,1200]);assert.equal(maximum,1);
 assert.equal(h.calls.filter(a=>a==='KEEP').length,0);
 await h.client.stop();const before=h.calls.length;held[1]();await turn();
 assert.equal(h.calls.length,before);assert.equal(h.client.state.mode,'DISABLED');assert.equal(h.timers.size,0);
});
test('STOP while startup waits for KEEP cannot deliver CAL_SLIDER after the delayed acknowledgement',async()=>{
 let at=1000;const hold=deferred();const h=motorHarness({now:()=>at,send:async a=>a.action==='KEEP'?hold.promise:null});
 await h.client.begin();at+=500;const keep=h.timers.get(400)();await turn();
 const starting=h.client.startSlider(1,()=>1000,'wizard',30000,true);
 const rejected=assert.rejects(starting,/cancelled/);await h.client.stop();hold.resolve({...h.state});await keep;await rejected;
 assert.equal(h.calls.includes('CAL_SLIDER'),false);assert.equal(h.client.state.mode,'DISABLED');assert.equal(h.timers.size,0);
});
test('input sample age advances between packets and lost input never becomes a neutral live frame',()=>{
 const frame={selectedInput:'AUTO',inputSource:'PPM',inputValid:true,inputAgeMs:20,channels:[1530,1450,1100,1700,1000,1500,1600,1700]};
 let sample=setupInputSample(frame,1000,1050);assert.equal(sample.source,'AUTO → PPM');assert.equal(sample.valid,true);assert.equal(sample.age,70);
 sample=setupInputSample(frame,1000,1250);assert.equal(sample.valid,false);assert.equal(sample.reported,true);assert.equal(sample.channels[2],1100);assert.equal(sample.age,270);
 sample=setupInputSample(frame,1000,2000);assert.equal(sample.reported,false);assert.deepEqual(sample.channels,[]);
 sample=setupInputSample({...frame,inputValid:false,channels:null},1000,1020);assert.equal(sample.valid,false);assert.deepEqual(sample.channels,[]);
 sample=setupInputSample({...frame,roundTripMs:2560},1000,1000);assert.equal(sample.valid,false,'a slow response must not make an old input sample fresh again');assert.equal(sample.age,2580);assert.equal(sample.ageUpperBound,true);
});
test('motor stop guidance distinguishes control loss, input loss and expected test completion',()=>{
 assert.match(motorStopDescription({reason:'CONTROL_LOST'}),/750 ms/);
 assert.match(motorStopDescription({reason:'INPUT_LOST'}),/input signal/);
 assert.match(motorStopDescription({reason:'TEST_FINISHED'}),/timed test finished/);
});
async function networkHarness(){
 let at=100000;class Clock extends Date{static now(){return at;}}
 const kitId='ZFC-A2-012345ABCDEF',kitCode='432198',bootId='b'.repeat(32),calls=[];
 let replyBoot=bootId,fail=false;
 const status={kitId,kitCode,bootId,board:'ZFC-A2',version:'1.7.0',requestTransport:'AP',mode:'ap',apActive:true,staConnected:false,controlAuthorized:true,setupAuthorized:true,ppm:{present:true,ageMs:20,seq:10,losses:0,faults:0},rc:{source:'NONE',active:false,inputArmed:false}};
 const elements={kitCodeInput:{value:''},kitTransport:{value:'ap'},kitIpInput:{value:''},kitKeyInput:{value:''}};
 const window={addEventListener(){},dispatchEvent(){},ZebjusKitPairingStore:{fromSession:()=>'',restore:async()=>''},ZebjusKitAuth:{http:()=>({}),openLocal:async()=>({expiresAt:at+1800000,request:async(route,method,args)=>{
  calls.push({route,method,args});if(fail)throw Error('network timed out');
  return route==='/api/motor'?{kitId,bootId:replyBoot,supported:true,mode:'DISABLED',reason:'USER_STOP',motorsDisabled:true,motorsArmed:false,
   ...(args?.action==='WIZARD_STATUS'?{wizardVersion:1,configRevision:3,configVerified:true}:{})}:status;
 }})}};
 const context={window,Date:Clock,document:{readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[],querySelector:()=>null},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},fetch:async()=>({ok:true,json:async()=>({kitId,kitCode,board:'ZFC-A2',simpleConnection:true})}),setTimeout,clearTimeout,AbortController,URLSearchParams,console,CustomEvent:class{}};
 vm.createContext(context);vm.runInContext(read('js/kit-data-interface.js'),context);window.ZebjusKitData=context.ZebjusKitData;
 vm.runInContext(read('js/control-path-policy.js'),context);window.ZebjusControlPaths=context.ZebjusControlPaths;
 vm.runInContext(read('js/classroom-kits.js'),context);await window.ZebjusKits.findKitAp();
 const api=window.ZebjusKits,binding=api.getState();
 assert.equal(binding.connected,true);
 return {api,binding,calls,advance:ms=>at+=ms,wrongBoot:()=>replyBoot='c'.repeat(32),fail:()=>fail=true};
}
test('a delayed original Kit can reverify with motor STATUS; writes stay blocked until the signed same-boot reply',async()=>{
 const h=await networkHarness();h.advance(7000);assert.equal(h.api.getState().connected,false);assert.equal(h.api.getState().linkVerified,true);
 await assert.rejects(h.api.requestBound(h.binding,'/api/motor','POST',{action:'BEGIN'}),e=>e.code==='KIT_DELAYED');
 const count=h.calls.length;
 await h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'});
 assert.equal(h.calls.length,count+1);assert.equal(h.api.getState().connected,true);
 const heartbeat=h.api.getState().heartbeatAt;h.advance(1000);
 await h.api.requestBound(h.binding,'/api/motor','POST',{action:'KEEP'});
 assert.ok(h.api.getState().heartbeatAt>heartbeat);
 assert.ok(h.api.getState().ppmObservedAt<h.api.getState().heartbeatAt,'motor ACK must not make an old PPM observation fresh');
});
test('motor STOP remains deliverable on a delayed verified link and identity changes cannot refresh heartbeat',async()=>{
 const h=await networkHarness();h.advance(7000);
 await h.api.requestBound(h.binding,'/api/motor','POST',{action:'STOP'});assert.equal(h.api.getState().connected,true);
 h.advance(7000);const before=h.api.getState().heartbeatAt;h.wrongBoot();
 await assert.rejects(h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'}),/boot identity changed/);
 assert.equal(h.api.getState().heartbeatAt,before);assert.equal(h.api.getState().connected,false);
});
test('motor STATUS requests coalesce and failed verification never restores freshness',async()=>{
 const h=await networkHarness(),before=h.calls.length;
 await Promise.all([h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'}),h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'})]);
 assert.equal(h.calls.length,before+1);h.advance(7000);h.fail();
 await assert.rejects(h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'}),/timed out/);assert.equal(h.api.getState().connected,false);
});
test('WIZARD_STATUS coalesces separately from STATUS, retains dispatch timing and never reuses a completed read',async()=>{
 const h=await networkHarness(),before=h.calls.length;
 const [one,two,basic]=await Promise.all([
  h.api.requestBound(h.binding,'/api/motor','POST',{action:'WIZARD_STATUS'}),
  h.api.requestBound(h.binding,'/api/motor','POST',{action:'WIZARD_STATUS'}),
  h.api.requestBound(h.binding,'/api/motor','POST',{action:'STATUS'})
 ]);
 assert.equal(h.calls.length,before+2);assert.equal(one.wizardVersion,1);assert.equal(two.configRevision,3);assert.equal(basic.wizardVersion,undefined);
 assert.equal(one.__requestTiming.queueMs,0);assert.equal(one.__requestTiming.responseWaitMs,0);
 assert.equal(Object.keys(one).includes('__requestTiming'),false,'timing stays outside the firmware payload');
 await h.api.requestBound(h.binding,'/api/motor','POST',{action:'WIZARD_STATUS'});assert.equal(h.calls.length,before+3);
});
test('read-only Wizard status has monitoring priority while calibration and STOP retain control priority',()=>{
 const source=read('js/classroom-kits.js'),start=source.indexOf('function wifiDirect('),end=source.indexOf('async function wifiDirectRequest(',start);
 const priorities=[];const context={state:{kitId:'ZFC-A2-012345ABCDEF'},reconnectTicket:1,Date,
  requestScheduler:{schedule:(key,run,options)=>{priorities.push(options.priority);return Promise.resolve({});}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 for(const action of ['STATUS','WIZARD_STATUS','CAL_SLIDER','SLIDE','STOP'])context.wifiDirect('kit-host','secret','/api/motor','POST',{action});
 assert.deepEqual(priorities,[40,40,80,80,100]);
});
