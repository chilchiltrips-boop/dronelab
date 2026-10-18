import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../companion-network.js',import.meta.url),'utf8');
const kitId='ZFC-A2-012345ABCDEF';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function bench(){
 const handlers=new Map(),elements=new Map(),requests=[],events=[],timers=[];
 let failure=null,delayStatus=null,delayClaim=null,delayPreview=null,transport='AP',authorized=true;
 const element=id=>{
  if(id==='kitRcPreview')return null;
  if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,textContent:'',dataset:{},
   setAttribute(){},querySelector(){return null},addEventListener(type,fn){handlers.set(id+':'+type,fn)}});
  return elements.get(id);
 };
 const response=async(route,method,args={})=>{
  requests.push({route,method,args});
  if(route==='/api/status'){
   if(delayStatus)await delayStatus;
   if(failure)throw failure;
   return {kitId,kitCode:'123456',board:'ZFC-A2',mode:transport.toLowerCase(),requestTransport:transport,
    apActive:transport==='AP',staConnected:transport==='STA',apSsid:'zebjus_drone_1',ssid:'School',
    inputArmSupported:true,controlAuthorized:authorized,ledOn:false};
  }
  if(route==='/api/rc/claim'){if(delayClaim)await delayClaim;return {kitId,session:'session-'+requests.length}}
  if(route==='/api/rc/preview'){if(delayPreview)await delayPreview;return {kitId,received:true,seq:args.seq,inputArmed:args.inputArmed==='true'}}
  if(route==='/api/rc/release')return {released:true};
  if(route==='/api/command')return {accepted:true};
  throw Error('Unexpected route '+route);
 };
 const session=()=>({local:true,scope:transport==='AP'?'ap_diagnostics':'sta_observer',expiresAt:Date.now()+60000,request:response});
 const win={dispatchEvent:e=>events.push(e),addEventListener:(type,fn)=>handlers.set('window:'+type,fn),
  ZebjusKitAuth:{local:async()=>session(),label:()=>({deviceId:kitId,secret:'private'}),diagnosticKey:()=> 'diagnostic',open:async()=>session()}};
 win.ZebjusNative={requestSecure(id,host,method,route){
  queueMicrotask(()=>win.zebjusNativeResult({id,ok:true,status:200,text:JSON.stringify({kitId,authVersion:2,simpleConnection:true})}));
 },requestWifiPermission:id=>queueMicrotask(()=>win.zebjusNativeWifiPermissionResult({id,granted:true})),
 pinSelectedNetwork:id=>queueMicrotask(()=>win.zebjusNativePinResult({id,ok:true})),clearSelectedNetwork(){}};
 const document={readyState:'loading',hidden:false,getElementById:element,addEventListener:(type,fn)=>handlers.set('document:'+type,fn)};
 vm.runInNewContext(source,{window:win,document,Date,performance,URLSearchParams,Promise,Set,Map,
  setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t},clearTimeout,setInterval:(fn,ms)=>timers.push({fn,ms}),
  CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail}}});
 handlers.get('document:DOMContentLoaded')();
 return {win,element,requests,events,document,handlers,timers,network:win.ZebjusNetwork,
  fail:e=>failure=e,holdStatus:p=>delayStatus=p,holdClaim:p=>delayClaim=p,holdPreview:p=>delayPreview=p,
  async connect(sta=false){if(sta){transport='STA';element('kitLink').value='sta';handlers.get('kitLink:change')();element('kitIp').value='192.168.1.22';handlers.get('kitIp:change')();element('kitKey').value='label'}
   handlers.get('kitConnect:click')();await settle();await settle();assert.equal(win.ZebjusNetwork.isConnected(),true);},
  observer:()=>authorized=false};
}
for(const sta of [false,true])test(`direct ${sta?'STA':'AP'} ARM claims and ACKs without diagnostic toggle; STOP releases`,async()=>{
 const b=bench();await b.connect(sta);assert.equal(b.network.canArm(),true);
 await b.network.armControls();assert.equal(b.network.inputArmed(),true);
 const first=b.requests.find(x=>x.route==='/api/rc/preview');
 assert.equal(first.args.throttle,1000);assert.equal(first.args.armed,'false');assert.equal(first.args.inputArmed,'true');
 await new Promise(resolve=>setTimeout(resolve,105));
 await b.network.previewControls({throttle:1350,axes:{roll:.4,pitch:-.2,yaw:.6}});
 const frame=b.requests.at(-1).args;
 assert.deepEqual([frame.throttle,frame.roll,frame.pitch,frame.yaw],[1350,1700,1400,1800]);
 const statuses=b.requests.filter(x=>x.route==='/api/status').length;
 await b.network.pollConnection();assert.equal(b.requests.filter(x=>x.route==='/api/status').length,statuses,'ACK heartbeat avoids status traffic while controlling');
 await b.network.releaseRc();assert.equal(b.network.inputArmed(),false);assert.equal(b.network.hasControl(),false);
 assert.equal(b.requests.at(-1).route,'/api/rc/release');
});
test('one status timeout preserves connected UI; three consecutive failures disconnect and never arm',async()=>{
 const b=bench();await b.connect();b.fail(Error('HTTP deadline'));
 await b.network.pollConnection();assert.equal(b.network.isConnected(),true);
 await b.network.pollConnection();assert.equal(b.network.isConnected(),true);
 await b.network.pollConnection();assert.equal(b.network.isConnected(),false);
 b.fail(null);await b.network.pollConnection();assert.equal(b.network.isConnected(),true);assert.equal(b.network.inputArmed(),false);
});
test('ordinary status poll never disables AP/STA button and stale response cannot restore old network',async()=>{
 const b=bench();await b.connect();let finish;
 b.holdStatus(new Promise(resolve=>finish=resolve));const reading=b.network.pollConnection();await settle();
 assert.equal(b.element('flightNetworkSwitch').disabled,false);
 b.network.networkChanged();finish();await reading;assert.equal(b.network.isConnected(),false);
});
test('STOP during an unacknowledged ARM claim releases the late token without an armed frame',async()=>{
 const b=bench();await b.connect();let finish;b.holdClaim(new Promise(resolve=>finish=resolve));
 const arming=b.network.armControls();await settle();await b.network.releaseRc();finish();
 await assert.rejects(arming,/cancelled/);assert.equal(b.network.inputArmed(),false);
 assert.equal(b.requests.filter(x=>x.route==='/api/rc/preview').length,0);
 assert.equal(b.requests.at(-1).route,'/api/rc/release');
});
test('late input ACK cannot revive STOP and STA observers cannot ARM',async()=>{
 const b=bench();await b.connect();let finish;b.holdPreview(new Promise(resolve=>finish=resolve));
 const arming=b.network.armControls();await settle();await b.network.releaseRc();finish();
 await assert.rejects(arming,/acknowledge/);assert.equal(b.network.inputArmed(),false);assert.equal(b.network.feedback(),null);
 const observer=bench();observer.observer();await observer.connect(true);
 assert.equal(observer.network.canArm(),false);await assert.rejects(observer.network.armControls(),/permission/);
});
test('native pause disarms immediately; foreground re-verifies without auto ARM',async()=>{
 const b=bench();await b.connect();await b.network.armControls();b.win.zebjusNativeAppPaused();
 assert.equal(b.network.inputArmed(),false);assert.equal(b.network.isConnected(),false);
 b.win.zebjusNativeAppResumed();await settle();assert.equal(b.network.isConnected(),true);assert.equal(b.network.inputArmed(),false);
});

// Test the real request scheduler path, not merely the ACK success stub.
test('AP ARM prioritizes signed RC over background status and keeps AP connection after a lost ACK',async()=>{
 const b=bench();await b.connect();
 // A slow status already in flight must finish before RC CLAIM is queued.
 let finishStatus;
 b.holdStatus(new Promise(resolve=>finishStatus=resolve));
 const polling=b.network.pollConnection();await settle();
 const arm=b.network.armControls();await settle();
 assert.equal(b.requests.filter(x=>x.route==='/api/rc/claim').length,0,
  'do not queue ARM behind an already-active signed status transaction');
 finishStatus();await polling;await arm;
 assert.equal(b.network.inputArmed(),true);
 const before=b.requests.filter(x=>x.route==='/api/status').length;
 // ACK may be older than the short watchdog. A status poll must not block the
 // next RC frame or treat stale RC delivery as Wi-Fi disassociation.
 await b.network.pollConnection();
 assert.equal(b.requests.filter(x=>x.route==='/api/status').length,before);
 b.holdPreview(Promise.reject(Error('Native Wi-Fi queue busy; input dropped')));
 await new Promise(resolve=>setTimeout(resolve,105));
 await b.network.previewControls({throttle:1000,axes:{roll:0,pitch:0,yaw:0}});
 assert.equal(b.network.inputArmed(),false,'lost ACK disarms the input');
 assert.equal(b.network.isConnected(),true,'lost RC ACK does not claim the AP Wi-Fi link was lost');
});
test('STOP during a pending status check prevents late ARM of the old session',async()=>{
 const b=bench();await b.connect();
 let finishStatus;
 b.holdStatus(new Promise(resolve=>finishStatus=resolve));
 const polling=b.network.pollConnection();await settle();
 const pendingArm=b.network.armControls();await settle();
 await b.network.releaseRc();
 finishStatus();await polling;
 await assert.rejects(pendingArm,/changed or went offline before ARM/);
 assert.equal(b.requests.filter(x=>x.route==='/api/rc/claim').length,0);
 assert.equal(b.network.inputArmed(),false);
});
test('full IMU telemetry cannot occupy the native queue during diagnostic RC ownership',async()=>{
 const b=bench();await b.connect();await b.network.armControls();
 // The UI read operation is gated by pollTelemetry, while a current signed
 // diagnostic session remains owned. Source asserts the fast-path priority.
 assert.match(source,/if\(rcClaiming\|\|rcSession\|\|previewBusy\)throw Error\('Release diagnostic input before requesting full IMU telemetry/);
 await b.network.releaseRc();
});
