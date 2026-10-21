import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const code=readFileSync(new URL('../js/classroom-kits.js',import.meta.url),'utf8');
const id='ZFC-A1-012345ABCDEF',other='ZFC-A1-FFFFFFFFFFFF',key='a1'.repeat(16);
function fixture({mode='sta',paired=false,initialize=false,encrypted=false,exclusive=false}={}){
 const elements=new Map(),timers=new Set(),events=[],requests=[],storage=new Map(),listeners=new Map(),sessions=[],diagnostics=[];let ready,disposed=false;
 let savedKey=paired?key:'',enrollmentError='',enrollmentGate=null,authAttempts=0,now=Date.now();
 class Clock extends Date{static now(){return now}}
 const element=()=>({value:'',checked:false,textContent:'',dataset:{},style:{},disabled:false,listeners:{},children:[],
  classList:{contains:()=>true,toggle(){},add(){},remove(){}},setAttribute(){},replaceChildren(...children){this.children=children},add(item){this.children.push(item)},append(){},focus(){},
  addEventListener(type,fn){this.listeners[type]=fn},click(){this.listeners.click?.({target:this})}});
 for(const name of [...readFileSync(new URL('../index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]))elements.set(name,element());
 elements.get('kitRememberBrowser').checked=true;
 const ip=mode==='ap'?'192.168.4.1':'192.168.1.20';
 for(const [name,value] of Object.entries({kitCodeInput:'123456',kitTransport:mode,kitIpInput:ip,kitKeyInput:''}))elements.get(name).value=value;
 let status={kitId:id,kitCode:'123456',kitName:'zebjus_drone_2',board:'ZFC-A1',version:encrypted?'1.4.5':'1.4.4',bootId:'b1'.repeat(16),encryptedOta:encrypted,appElfSha256:'0'.repeat(64),
  requestTransport:mode.toUpperCase(),mode:exclusive?mode:'auto',exclusiveWifi:exclusive,apActive:!exclusive||mode==='ap',staConnected:mode==='sta',ip:mode==='sta'?ip:'',apIp:'192.168.4.1',apSsid:'zebjus_drone_2',
  hostname:'zebjus-drone-2.local',setupAuthorized:mode==='ap',otaAuthorized:false,controlAuthorized:mode==='ap',firmwareControl:false,motorsArmed:false,otaAppOnly:true,
  rc:{claimed:false,active:false,motorsDisabled:true},firmwareBuiltAt:'Oct 13 2026 16:00:00'};
 let uploaded=false,claimGate=null,identityGate=null,identityOverride=null,reachableHosts=null,offset=0,digest='';
 const handler=async(route,args={})=>{
  requests.push({route,args});
  if(route==='/api/status')return {...status,rc:{...status.rc}};
  if(route==='/api/telemetry')return {kitId:id,gyroReady:true};
  if(route==='/api/wifi/test'){
   status={...status,staConnected:true,ip:'192.168.1.41',ssid:args.ssid,wifiTestState:'saved',networkState:'AP_STA_COEXISTENCE'};
   return {state:'testing',saved:false};
  }
  if(route==='/api/flight/mode'){
   if(!status.flightModeState)throw Error('unsupported');
   const active=status.rc.inputArmed?status.flightModeState.active:args.flightMode;
   status.flightModeState={supported:true,stabilizationSupported:false,saved:args.flightMode,active,pending:active===args.flightMode?null:args.flightMode};status.flightMode=active;
   return {kitId:id,saved:true,motorsArmed:false,flightMode:active,flightModeState:{...status.flightModeState}};
  }
  if(route==='/api/wifi/mode')return {kitId:id,mode:args.mode,state:'switching'};
  if(route==='/api/rc/claim'){
   if(claimGate)await claimGate;
   status.rc={claimed:true,active:false,source:'WEB',ownerId:'owner-1'};
   return {kitId:id,session:'private-rc-token',ownerId:'owner-1'};
  }
  if(route==='/api/rc/preview')return {kitId:id,received:true};
  if(route==='/api/rc/release'){status.rc={claimed:false};return {released:true};}
  if(route==='/api/firmware/begin'){offset=0;digest=args.sha256;return {kitId:id,offset};}
  if(route==='/api/firmware/chunk'){assert.equal(args.offset,offset);assert.ok(args.data.length<=768);offset+=args.data.length/2;return {kitId:id,offset};}
  if(route==='/api/firmware/end'){uploaded=true;status={...status,version:'1.4.6',bootId:'c2'.repeat(16)};return {kitId:id,updated:true,sha256:digest};}
  throw Error('Unexpected request '+route);
 };
 const window={addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>events.push(e),ZebjusKitPairingStore:{fromSession:()=>savedKey,restore:async()=>savedKey,saveSession:(_id,k)=>{savedKey=k},remember:async(_id,k)=>{savedKey=k;requests.push({route:'vault:remember'})},forget:async()=>{savedKey=''}},
  ZebjusAckDiagnostics:{record:(event,data)=>diagnostics.push({event,data}),reasonClass:()=> 'OTHER'},
  ZfcCrypto:{sha256:bytes=>createHash('sha256').update(bytes).digest()},
  ZebjusKitAuth:{http:base=>base,openLocal:async()=>{
   status={...status,setupAuthorized:status.requestTransport==='AP',otaAuthorized:false,controlAuthorized:status.requestTransport==='AP'};
   const session={expiresAt:now+600000,request:(route,_method,args)=>handler(route,args)};sessions.push(session);return session;
  },open:async(_host,_id,_key,kind)=>{
   authAttempts++;if(enrollmentGate)await enrollmentGate;
   if(enrollmentError){const e=Error(enrollmentError);e.status=enrollmentError==='enrollment_rate_limited'?429:401;throw e}
   assert.equal(kind,'admin');status={...status,setupAuthorized:true,otaAuthorized:true,controlAuthorized:true};
   const session={expiresAt:now+600000,request:(route,_method,args)=>handler(route,args)};sessions.push(session);return session;
  }}};
 const shared={};vm.runInNewContext(readFileSync(new URL('../js/kit-data-interface.js',import.meta.url),'utf8'),shared);window.ZebjusKitData=shared.ZebjusKitData;
 const fetch=async(url,opts={})=>{
  const u=new URL(url);requests.push({host:u.hostname,headers:opts.headers,route:u.pathname});
  if(u.pathname==='/api/identify'){
   if(reachableHosts&&!reachableHosts.has(u.hostname))throw Error('Device is not reachable on this network');
   if(identityGate)await identityGate;
   const mismatch=identityOverride||(uploaded&&u.hostname===ip?other:id);
   return {ok:true,json:async()=>({kitId:mismatch,kitCode:'123456',name:'zebjus_drone_2',board:'ZFC-A1',simpleConnection:true,adminSessions:encrypted,exclusiveWifi:exclusive})};
  }
  if(opts.headers?.['X-ZJ-Key']===key)status={...status,setupAuthorized:true,otaAuthorized:true,controlAuthorized:true};
  return {ok:true,json:()=>handler(u.pathname,Object.fromEntries(new URLSearchParams(opts.body||'')))};
 };
 class XHR{
  upload={};status=200;responseText='{"updated":true}';
  open(){}setRequestHeader(){}send(){uploaded=true;status={...status,version:'1.4.6',bootId:'c2'.repeat(16)};queueMicrotask(()=>this.onload())}
 }
 const document={readyState:'loading',hidden:false,addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')ready=fn},getElementById:name=>elements.get(name)||null,
  querySelectorAll:()=>[],querySelector:()=>({click(){}}),createElement:element};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const timeout=(fn,ms)=>{if(disposed)return 0;const t=setTimeout(fn,ms);timers.add(t);return t};
 vm.runInNewContext(code,{window,document,localStorage,fetch,URL,URLSearchParams,AbortController,XMLHttpRequest:XHR,Uint8Array,Blob,FormData,TextEncoder,Option:class{constructor(text,value){this.text=text;this.value=value}},
  setTimeout:timeout,clearTimeout,setInterval:()=>1,clearInterval(){},Date:Clock,confirm:()=>true,console,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}}});
 if(initialize)ready();
 return {api:window.ZebjusKits,elements,requests,events,diagnostics,storage,blockClaim:p=>claimGate=p,identity:value=>identityOverride=value,
  enrollmentError:value=>enrollmentError=value,blockEnrollment:p=>enrollmentGate=p,authAttempts:()=>authAttempts,savedKey:()=>savedKey,
  expireSessions:()=>{for(const s of sessions)s.expiresAt=now-1},advance:ms=>now+=ms,
  usbPair:k=>listeners.get('dronelab:serial-line')?.({detail:{transport:'usb',line:'ZJNET,PAIR,'+id+','+k}}),
  enableUsb:({usbId=id,usbCode='123456',usbBoard='ZFC-A1'}={})=>{
   window.DroneLabSerial={isOpen:()=>true,isFlashing:()=>false,writeLine:async line=>{
    const cmd=String(line).trim();
    requests.push({route:'USB:'+cmd});
    const emit=value=>listeners.get('dronelab:serial-line')?.({detail:{transport:'usb',line:value}});
    if(cmd==='ZJKIT,GET'){emit('ZJKIT,ID,'+usbId);emit('ZJKIT,CODE,'+usbCode);emit('ZJKIT,NAME,zebjus_drone_2');}
    else if(cmd==='ZJINFO,GET')emit('ZJINFO,FW,'+usbBoard+',1.4.9');
    else if(cmd==='ZJNET,PAIR')emit('ZJNET,PAIR,'+usbId+','+key);
    else if(cmd.startsWith('ZJNET,MODE,'))emit('ZJNET,ACK,MODE,'+cmd.slice(11));
   }};
  },
  serialLine:line=>listeners.get('dronelab:serial-line')?.({detail:{transport:'usb',line}}),
  reachable:hosts=>reachableHosts=new Set(hosts),blockIdentity:p=>identityGate=p,status:patch=>status={...status,...patch},dispose:()=>{disposed=true;for(const t of timers)clearTimeout(t)}};
}
test('WebApp status forwards firmware release reason and time to the diagnostic recorder',async()=>{
 const f=fixture();try{
  await f.api.connect();
  f.status({rc:{claimed:false,active:false,lastReleaseReason:'PPM_SIGNAL_LOST',lastReleaseAtMs:12345}});
  await f.api.read();
  const event=f.diagnostics.filter(e=>e.event==='web_status').at(-1);
  assert.equal(event.data.releaseReason,'PPM_SIGNAL_LOST');
  assert.equal(event.data.lastReleaseAtMs,12345);
 }finally{f.dispose()}
});
test('rejected saved pairing falls back to verified STA monitoring and never replays that credential',async()=>{
 const f=fixture({paired:true,encrypted:true});try{
  f.enrollmentError('enrollment_proof_invalid_or_expired');await f.api.connect();
  assert.equal(f.api.getState().connected,true,'A rejected admin credential must not block STA monitoring');
  assert.equal(f.api.getState().transport,'sta');assert.equal(f.api.getState().otaAuthorized,false);assert.equal(f.api.getState().controlAuthorized,false);
  assert.equal(f.savedKey(),'');assert.match(f.api.getState().authorizationNotice,/USB|pairing/i);
  await f.api.read();await f.api.connect();
  await assert.rejects(f.api.authorizeNetwork(),/USB/);assert.equal(f.authAttempts(),1);
 }finally{f.dispose()}
});
test('new firmware header handover changes the physical mode and waits for discovery permission before STA connects',async()=>{
 const f=fixture({mode:'ap',paired:true,encrypted:true,exclusive:true});try{
  f.reachable(['192.168.4.1']);await f.api.connect();await f.api.connectTransport('sta');
  assert.ok(f.requests.some(r=>r.route==='/api/wifi/mode'&&r.args.mode==='sta'));
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().pendingNetworkMode,'sta');
  f.reachable(['zebjus-drone-2.local']);f.status({requestTransport:'STA',mode:'sta',apActive:false,staConnected:true,ip:'192.168.1.20'});
  await f.api.discoverKits();assert.equal(f.api.getState().connected,false);
  assert.ok(f.events.some(e=>e.type==='dronelab:reconnect-offer'));
  await f.api.acceptReconnectOffer();assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().transport,'sta');
  assert.equal(f.api.getState().apActive,false);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});
test('a remembered kit scan asks once and Later leaves the kit offline without sending authenticated requests',async()=>{
 const f=fixture({paired:true,encrypted:true,exclusive:true});try{
  f.reachable(['zebjus-drone-2.local']);await f.api.discoverKits();
  assert.equal(f.api.getState().connected,false);assert.equal(f.authAttempts(),0);
  assert.equal(f.events.filter(e=>e.type==='dronelab:reconnect-offer').length,1);
  f.api.declineReconnectOffer();await f.api.discoverKits();
  assert.equal(f.events.filter(e=>e.type==='dronelab:reconnect-offer').length,1);assert.equal(f.authAttempts(),0);
 }finally{f.dispose()}
});
test('STA-to-AP applies AP-only mode and reconnects the same saved kit with STA offline',async()=>{
 const f=fixture({paired:true,encrypted:true,exclusive:true});try{
  f.reachable(['192.168.1.20']);await f.api.connect();await f.api.switchNetworkMode('ap');
  assert.ok(f.requests.some(r=>r.route==='/api/wifi/mode'&&r.args.mode==='ap'));
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().pendingNetworkMode,'ap');
  f.reachable(['192.168.4.1']);f.status({requestTransport:'AP',mode:'ap',apActive:true,staConnected:false,ip:''});
  await f.api.discoverKits();await f.api.acceptReconnectOffer();
  assert.equal(f.api.getState().transport,'ap');assert.equal(f.api.getState().staConnected,false);assert.equal(f.api.getState().owner,false);
  await f.api.authorizeNetwork();assert.equal(f.api.getState().otaAuthorized,true,'The same saved pairing also authorizes AP');
 }finally{f.dispose()}
});
test('selecting AP while connected to a STA-failure hotspot persists manual AP instead of leaving automatic retries enabled',async()=>{
 const f=fixture({mode:'ap',paired:true,encrypted:true,exclusive:true});try{
  f.reachable(['192.168.4.1']);f.status({mode:'sta'});await f.api.connect();
  await f.api.connectTransport('ap');
  assert.ok(f.requests.some(r=>r.route==='/api/wifi/mode'&&r.args.mode==='ap'));
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().pendingNetworkMode,'ap');
 }finally{f.dispose()}
});
test('exclusive Test & Save clears the old AP link and waits for verified rediscovery without claiming the password was saved',async()=>{
 const f=fixture({mode:'ap',paired:true,encrypted:true,exclusive:true});try{
  f.reachable(['192.168.4.1']);await f.api.connect();f.elements.get('kitRouterSsid').value='Classroom';f.elements.get('kitRouterPass').value='private-router-pass';
  const before=f.requests.filter(r=>r.route==='/api/status').length,result=await f.api.wifiSave();
  assert.equal(result.state,'handover');assert.equal(result.saved,false);assert.equal(f.api.getState().connected,false);
  assert.equal(f.elements.get('kitRouterPass').value,'');
  assert.equal(f.requests.filter(r=>r.route==='/api/status').length,before);
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('private-router-pass'));
 }finally{f.dispose()}
});
test('late physical USB telemetry cannot bypass the pending Wi-Fi reconnect permission',async()=>{
 const f=fixture({mode:'ap',paired:true,encrypted:true,exclusive:true,initialize:true});try{
  f.reachable(['192.168.4.1']);await f.api.connect();await f.api.switchNetworkMode('sta');f.enableUsb();
  for(const line of ['ZJKIT,ID,'+id,'ZJKIT,CODE,123456','ZJINFO,FW,ZFC-A1,1.4.6'])f.serialLine(line);
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().pendingNetworkMode,'sta');
 }finally{f.dispose()}
});
test('one physical USB pairing is remembered automatically when the default saved-access option is enabled',async()=>{
 const f=fixture({mode:'ap',initialize:true});try{
  await f.api.connect();f.usbPair(key);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.savedKey(),key);assert.ok(f.requests.some(r=>r.route==='vault:remember'));
 }finally{f.dispose()}
});
test('repeated physical acknowledgement of the same pairing preserves an already verified admin session',async()=>{
 const f=fixture({paired:true,encrypted:true,initialize:true});try{
  await f.api.connect();assert.equal(f.authAttempts(),1);f.usbPair(key);f.usbPair(key);await f.api.read();
  assert.equal(f.authAttempts(),1,'Repeated Read Running Firmware responses must not force another enrollment');
 }finally{f.dispose()}
});
test('failed AP authorization preserves setup monitoring; fresh physical USB pairing authorizes again',async()=>{
 const f=fixture({mode:'ap',paired:true,encrypted:true,initialize:true});try{
  await f.api.connect();f.enrollmentError('enrollment_proof_invalid_or_expired');
  await assert.rejects(f.api.authorizeNetwork(),/USB/);await f.api.read();
  assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().setupAuthorized,true);assert.equal(f.api.getState().otaAuthorized,false);
  await assert.rejects(f.api.authorizeNetwork(),/USB/);assert.equal(f.authAttempts(),1);
  f.usbPair('b2'.repeat(16));f.enrollmentError('');await f.api.authorizeNetwork();
  assert.equal(f.api.getState().otaAuthorized,true);assert.equal(f.api.getState().owner,false);assert.equal(f.authAttempts(),2);
 }finally{f.dispose()}
});
test('status and telemetry share one session renewal instead of parallel enrollment challenges',async()=>{
 const f=fixture({paired:true,encrypted:true});try{
  await f.api.connect();f.expireSessions();let finish;f.blockEnrollment(new Promise(resolve=>finish=resolve));
  const pending=Promise.all([f.api.read(),f.api.request('/api/telemetry')]);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.authAttempts(),2,'Only one renewal should start');
  finish();await pending;assert.equal(f.authAttempts(),2);
 }finally{f.dispose()}
});
test('enrollment cooldown retains STA monitoring and blocks repeated authorization until it expires',async()=>{
 const f=fixture({paired:true,encrypted:true});try{
  f.enrollmentError('enrollment_rate_limited');await f.api.connect();
  assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().otaAuthorized,false);
  await assert.rejects(f.api.authorizeNetwork(),/wait|cooldown/i);assert.equal(f.authAttempts(),1);
  assert.equal(f.savedKey(),key,'Rate limiting alone must not erase a valid physical pairing');
  f.advance(31000);f.enrollmentError('');await f.api.read();await f.api.authorizeNetwork();
  assert.equal(f.api.getState().otaAuthorized,true);assert.equal(f.authAttempts(),2);
 }finally{f.dispose()}
});
test('My Kits Connect and Disconnect buttons execute actual identity-bound client actions',async()=>{
 const f=fixture({initialize:true});try{
  f.elements.get('kitConnect').click();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().kitId,id);
  f.elements.get('kitDisconnect').click();await new Promise(r=>setImmediate(r));assert.equal(f.api.getState().connected,false);
 }finally{f.dispose()}
});
test('STA observer stays read-only; physical USB-paired STA exposes control and OTA separately',async()=>{
 for(const paired of [false,true]){const f=fixture({paired});try{
  await f.api.connect();const s=f.api.getState();assert.equal(s.connected,true);assert.equal(s.otaAuthorized,paired);assert.equal(s.controlAuthorized,paired);
  if(!paired)await assert.rejects(f.api.toggleControl(),/STA observer/);
  assert.equal(s.owner,false,'Connecting never claims RC');
 }finally{f.dispose()}}
});
test('AP remains scoped setup until a USB-paired browser explicitly authorizes updates',async()=>{
 const f=fixture({mode:'ap',paired:true});try{
  await f.api.connect();assert.equal(f.api.getState().setupAuthorized,true);assert.equal(f.api.getState().otaAuthorized,false);
  await f.api.authorizeNetwork();assert.equal(f.api.getState().otaAuthorized,true);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});
test('header and Firmware page control use one grant; release neutralizes the same owner',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();await f.api.toggleControl();assert.equal(f.api.getState().owner,true);
  assert.equal(f.elements.get('kitHardwareTarget').checked,true);
  await f.api.toggleControl();assert.equal(f.api.getState().owner,false);
  assert.ok(f.requests.some(r=>r.route==='/api/rc/release'));
 }finally{f.dispose()}
});
test('late control grant after disconnect cannot reactivate the old Kit',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();let finish;f.blockClaim(new Promise(r=>finish=r));
  const pending=f.api.toggleControl();await new Promise(r=>setImmediate(r));await f.api.disconnect();finish();
  await assert.rejects(pending,/changed|cancelled/);assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});
test('cached metadata retains the verified STA address while AP is the live request transport',async()=>{
 const f=fixture({mode:'ap'});try{
  f.status({staConnected:true,ip:'192.168.1.41'});await f.api.connect();
  const saved=JSON.parse(f.storage.get('zebjus.classroom.last.v1'));assert.equal(saved.ip,'192.168.1.41');assert.equal(saved.id,id);
  assert.ok(!JSON.stringify(saved).includes(key));assert.equal(f.api.getState().transport,'ap');
 }finally{f.dispose()}
});
test('Connect STA never falls back to the AP gateway when the computer has not joined the router',async()=>{
 const f=fixture({mode:'ap'});try{
  f.reachable(['192.168.4.1']);await f.api.connect();
  const before=f.requests.filter(r=>r.route==='/api/status').length;
  await assert.rejects(f.api.connectTransport('sta'),/STA.*not reachable|join.*router/i);
  assert.equal(f.api.getState().transport,'ap');assert.equal(f.api.getState().connected,true,'The working AP setup link remains available');
  assert.equal(f.requests.filter(r=>r.route==='/api/status').length,before,'STA selection does not reconnect through AP');
  assert.equal(f.elements.get('kitTransport').value,'sta');
 }finally{f.dispose()}
});
test('authenticated AP status cannot satisfy a requested STA connection',async()=>{
 const f=fixture({paired:true});try{
  f.status({requestTransport:'AP'});await f.api.connect();
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().owner,false);
  assert.match(f.elements.get('kitMessage').textContent,/requested STA.*AP|STA.*AP/i);
  assert.equal(f.storage.has('zebjus.classroom.last.v1'),false,'Wrong-interface responses are not remembered as verified connections');
 }finally{f.dispose()}
});
test('AP-to-STA handover rediscovers the selected Kit Name after its router address changes',async()=>{
 const f=fixture({mode:'ap'});try{
  f.reachable(['192.168.4.1']);f.status({staConnected:true,ip:'192.168.1.41',ssid:'Classroom'});await f.api.connect();
  f.reachable(['zebjus-drone-2.local']);f.status({requestTransport:'STA',ip:'192.168.1.56',setupAuthorized:false,controlAuthorized:false});
  await f.api.handoverSta();
  const s=f.api.getState();assert.equal(s.kitId,id);assert.equal(s.transport,'sta');assert.equal(s.connected,true);assert.equal(s.owner,false);
  assert.equal(JSON.parse(f.storage.get('zebjus.classroom.last.v1')).ip,'192.168.1.56');
 }finally{f.dispose()}
});
test('verified router save adopts its router state while the browser remains on AP',async()=>{
 const f=fixture({mode:'ap'});try{
  await f.api.connect();f.elements.get('kitRouterSsid').value='Classroom';f.elements.get('kitRouterPass').value='router-password';
  await f.api.wifiSave();await new Promise(resolve=>setTimeout(resolve,1350));
  const s=f.api.getState();assert.equal(s.staConnected,true);assert.equal(s.ssid,'Classroom');assert.equal(s.staIp,'192.168.1.41');
  assert.equal(s.transport,'ap');assert.equal(s.mode,'auto');assert.equal(s.owner,false);
  assert.match(f.elements.get('kitWifiStatus').textContent,/browser still uses AP.*computer Wi-Fi settings/);
  assert.equal(JSON.parse(f.storage.get('zebjus.classroom.last.v1')).ip,'192.168.1.41');
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('router-password'));
 }finally{f.dispose()}
});
test('Disconnect cancels late STA handover and header discovery replies',async()=>{
 for(const action of ['handoverSta','connectTransport']){const f=fixture({mode:'ap'});try{
  f.status({staConnected:true,ip:'192.168.1.41'});await f.api.connect();
  let finish;f.blockIdentity(new Promise(resolve=>finish=resolve));
  const pending=f.api[action]('sta');await new Promise(resolve=>setImmediate(resolve));
  await f.api.disconnect();finish();await assert.rejects(pending,/cancelled/);
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}}
});
test('legacy multipart OTA is rejected; encrypted OTA remains the upgrade path',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();const bytes=new Uint8Array(32768);bytes[0]=0xe9;bytes[12]=5;
  await assert.rejects(f.api.uploadAppFirmware({bytes,name:'APP.bin',boardId:'ZFC-A1',version:'1.4.6'}),/Legacy raw-key multipart OTA is disabled/);
  assert.equal(f.api.getState().owner,false);
  assert.ok(!f.requests.some(r=>r.route==='/api/ota'));
 }finally{f.dispose()}
});
test('selection rejects changed hardware before trusting discovery or sending a saved key',async()=>{
 const f=fixture({paired:true});try{
  f.identity(other);
  await assert.rejects(f.api.connectDiscoveredKit({kitId:id,kitCode:'123456',ip:'192.168.1.20'}),/Device ID or Kit Code mismatch/);
  assert.equal(f.api.getState().connected,false);assert.ok(!f.requests.some(r=>r.headers?.['X-ZJ-Key']));
 }finally{f.dispose()}
});
test('new firmware uses ordered encrypted OTA commands and verifies full SHA-256 before reconnect',async()=>{
 const f=fixture({paired:true,encrypted:true});try{
  await f.api.connect();const bytes=new Uint8Array(32768);bytes[0]=0xe9;bytes[12]=5;
  const result=await f.api.uploadAppFirmware({bytes,name:'APP.bin',boardId:'ZFC-A1',version:'1.4.6'});
  assert.equal(result.verified,true);
  assert.equal(f.requests.filter(r=>r.route==='/api/firmware/chunk').length,Math.ceil(bytes.length/384));
  assert.equal(f.requests.find(r=>r.route==='/api/firmware/begin').args.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.ok(!f.requests.some(r=>r.headers?.['X-ZJ-Key']),'new firmware does not send its private USB pairing key in an HTTP header');
 }finally{f.dispose()}
});

test('STA observer with matching physical USB becomes explicitly authorized; Take Control then works without hidden auto-arming',async()=>{
 const f=fixture({mode:'sta',paired:false,encrypted:true,exclusive:true,initialize:true});try{
  await f.api.connect();assert.equal(f.api.getState().controlAuthorized,false);
  assert.equal(f.elements.get('kitTakeControl').disabled,true);
  f.enableUsb();await f.api.read();
  assert.equal(f.elements.get('kitPairUsb').disabled,false,'explicit same-Kit USB authorization offered');
  assert.equal(f.elements.get('kitTakeControl').disabled,true,'still read-only until physical enrollment');
  await f.api.pairAndAuthorizeSelectedKit();
  assert.equal(f.api.getState().controlAuthorized,true);
  assert.equal(f.api.getState().owner,false,'authorization never claims diagnostic input automatically');
  assert.equal(f.elements.get('kitTakeControl').disabled,false);
  assert.ok(f.requests.some(v=>v.route==='USB:ZJNET,PAIR'));
  assert.equal(f.authAttempts(),1);
  await f.api.toggleControl();assert.equal(f.api.getState().owner,true);
  await f.api.toggleControl();assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});

test('same physical USB Kit can switch a verified STA link to AP without unavailable STA setup grant',async()=>{
 const f=fixture({mode:'sta',paired:false,encrypted:true,exclusive:true,initialize:true});try{
  await f.api.connect();f.enableUsb();
  await f.api.switchNetworkMode('ap');
  const messages=f.requests.filter(v=>String(v.route).startsWith('USB:')).map(v=>v.route);
  assert.ok(messages.indexOf('USB:ZJKIT,GET')<messages.indexOf('USB:ZJNET,MODE,ap'));
  assert.ok(messages.includes('USB:ZJINFO,GET'));
  assert.ok(messages.includes('USB:ZJNET,MODE,ap'));
  assert.equal(f.requests.some(v=>v.route==='/api/wifi/mode'),false,'network observer is never promoted implicitly');
  assert.equal(f.api.getState().connected,false,'STA link is retired after authenticated radio-mode acknowledgment');
  assert.equal(f.api.getState().pendingNetworkMode,'ap','await same-device AP rediscovery');
  assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});

test('wrong USB Device ID or board is rejected before STA authorization and mode writes',async()=>{
 for(const usb of [{usbId:other},{usbBoard:'ZFC-A2'},{usbCode:'999999'}]){
  const f=fixture({mode:'sta',paired:false,encrypted:true,exclusive:true,initialize:true});try{
   await f.api.connect();f.enableUsb(usb);
   await assert.rejects(f.api.pairAndAuthorizeSelectedKit(),/mismatch|differs|identity/i);
   await assert.rejects(f.api.switchNetworkMode('ap'),/mismatch|differs|identity/i);
   assert.equal(f.requests.some(v=>v.route==='USB:ZJNET,PAIR'),false);
   assert.equal(f.requests.some(v=>v.route==='USB:ZJNET,MODE,ap'),false);
   assert.equal(f.api.getState().connected,true);
   assert.equal(f.api.getState().owner,false);
  }finally{f.dispose()}
 }
});

test('USB not attached leaves read-only STA Take Control disabled and mode change uses signed network policy',async()=>{
 const f=fixture({mode:'sta',paired:false,encrypted:true,exclusive:true,initialize:true});try{
  await f.api.connect();
  assert.equal(f.elements.get('kitPairUsb').disabled,true);
  assert.equal(f.elements.get('kitTakeControl').disabled,true);
  await assert.rejects(f.api.pairAndAuthorizeSelectedKit(),/USB Serial/);
  assert.equal(f.requests.some(v=>String(v.route).startsWith('USB:')),false);
 }finally{f.dispose()}
});

for(const mode of ['ap','sta'])test('WebApp '+mode+' mode writes verify read-back without changing armed input ownership',async()=>{
 const f=fixture({mode,paired:true,encrypted:true});try{
  f.status({flightMode:'angle',flightModeState:{supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null},rc:{claimed:true,inputArmed:true,source:'ANDROID'}});
  await f.api.connect();const actual=await f.api.setFlightMode('acro');
  assert.equal(actual.saved,'acro');assert.equal(actual.active,'angle');assert.equal(actual.pending,'acro');
  assert.equal(f.api.getState().flightMode,'angle');assert.equal(f.api.getState().flightModeState.pending,'acro');
  assert.equal(f.requests.filter(x=>['/api/rc/claim','/api/rc/release','/api/rc/stop'].includes(x.route)).length,0);
  assert.equal(f.requests.filter(x=>x.route==='/api/status').at(-1).route,'/api/status');
 }finally{f.dispose()}
});
test('WebApp old firmware fails with an actionable unsupported status and never sends a mode write',async()=>{
 const f=fixture({mode:'ap'});try{await f.api.connect();await assert.rejects(f.api.setFlightMode('acro'),/UNSUPPORTED/);
  assert.equal(f.requests.some(x=>x.route==='/api/flight/mode'),false);
 }finally{f.dispose()}
});
