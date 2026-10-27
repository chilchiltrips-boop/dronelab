import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const code=readFileSync(new URL('../js/classroom-kits.js',import.meta.url),'utf8');
const id='ZFC-A1-012345ABCDEF',other='ZFC-A1-FFFFFFFFFFFF',key='a1'.repeat(16);
const setupFields=()=>({expectedId:id,name:'Room A1',prefix:'',password:'',teacher:'TeacherPrivate#123',enrollConsent:true});
test('Smart USB Kit rename restarts the default name-based AP only after its firmware acknowledgment',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb({enrolled:true});await f.api.connectSetupUsb();
  const result=await f.api.saveUsbSetup({...setupFields(),name:'A1 Renamed'});
  assert.equal(result.rebooting,true);assert.equal(result.verified,false);assert.equal(result.expectedSsid,'A1 Renamed');
  assert.equal(device.apActual,'A1 Renamed');
  assert.ok(f.requests.some(r=>r.route==='USB:ZJADMIN,AP_APPLY,CONFIRM'));
  assert.ok(!f.requests.some(r=>r.route.startsWith('USB:ZJADMIN,APNAME,')||r.route.startsWith('USB:ZJADMIN,APPASS,')));
 }finally{f.dispose()}
});
test('Smart USB Setup enrolls first Teacher, saves only requested AP fields and verifies identity after restart',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb();await f.api.connectSetupUsb();
  assert.equal(f.api.usbSetupState().enrolled,false);assert.equal(f.api.usbSetupState().available,true);
  const result=await f.api.saveUsbSetup({...setupFields(),prefix:'ZEBJUS-A1-LAB',password:'ApPrivate#987'});
  assert.equal(result.rebooting,true);assert.equal(result.verified,false);assert.equal(result.expectedSsid,'ZEBJUS-A1-LAB-123456');
  assert.equal(device.staSsid,'SavedRouter');assert.equal(device.kitCode,'123456');assert.equal(device.pass,'ApPrivate#987');
  const commands=f.requests.map(r=>r.route);
  assert.ok(commands.includes('USB:ZJADMIN,ENROLL,TeacherPrivate#123'));
  assert.ok(!commands.some(s=>s.startsWith('USB:ZJNET,TEST')||s.startsWith('USB:ZJKIT,CODE')||s.startsWith('USB:ZJADMIN,NAME,')));
  await f.api.connectSetupUsb();assert.equal(f.api.usbSetupState().apSsid,result.expectedSsid);assert.equal(f.api.usbSetupState().unlocked,false);
  const publicData=JSON.stringify([...f.storage.values(),f.elements.get('kitEvents').textContent,f.diagnostics]);
  assert.ok(!publicData.includes('TeacherPrivate#123')&&!publicData.includes('ApPrivate#987'),'Secrets escaped into public logs or storage');
 }finally{f.dispose()}
});
test('Smart USB Setup unlocks existing Teacher, rejects wrong passphrase and never overwrites enrollment',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb({enrolled:true,prefix:'SavedPrefix',apActual:'SavedPrefix-123456'});await f.api.connectSetupUsb();
  await assert.rejects(f.api.saveUsbSetup({...setupFields(),name:'Room Renamed',teacher:'IncorrectPass#123'}),/INVALID_ADMIN_PASSPHRASE/);
  assert.equal(device.kitName,'Room A1');assert.equal(device.teacher,'TeacherPrivate#123');
  const saved=await f.api.saveUsbSetup({...setupFields(),name:'Room Renamed'});
  assert.equal(saved.verified,true);assert.equal(saved.rebooting,false);assert.equal(device.kitName,'Room Renamed');
  assert.ok(!f.requests.some(r=>r.route.startsWith('USB:ZJADMIN,ENROLL,')));
 }finally{f.dispose()}
});
test('Smart USB Setup re-verifies an expired Teacher lease and preserves custom AP identity for name-only changes',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb({enrolled:true,prefix:'A1-Custom',apActual:'A1-Custom-123456'});await f.api.connectSetupUsb();
  f.advance(60001);await f.api.read();assert.equal(f.api.usbSetupState().unlocked,false);
  await f.api.saveUsbSetup({...setupFields(),name:'A1 New Room'});
  assert.equal(device.prefix,'A1-Custom');assert.equal(device.apActual,'A1-Custom-123456');
  assert.ok(!f.requests.some(r=>/^USB:ZJADMIN,(?:APNAME|APPASS|AP_APPLY),/.test(r.route)));
 }finally{f.dispose()}
});
test('Smart USB Setup stops on expiration between writes and requires fresh verification before retry',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb({enrolled:true});await f.api.connectSetupUsb();
  device.onCommand=cmd=>{if(cmd.startsWith('ZJADMIN,NAME,'))f.advance(60001)};
  await assert.rejects(f.api.saveUsbSetup({...setupFields(),name:'A1 New Room',password:'ApPrivate#987'}),/ADMIN_LOCKED|verification expired/);
  assert.equal(device.pass,'ExistingAp#123');assert.ok(!f.requests.some(r=>r.route==='USB:ZJADMIN,AP_APPLY,CONFIRM'));
 }finally{f.dispose()}
});
test('Smart USB Setup rejects disconnected/replaced USB and binds A1/A2 settings to immutable ID and port generation',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  const device=f.smartUsb({enrolled:true});await f.api.connectSetupUsb();
  device.open=false;assert.equal(f.api.usbSetupState().available,false);
  await assert.rejects(f.api.saveUsbSetup({...setupFields(),password:'ApPrivate#987'}),/physical USB/);
  device.open=true;device.generation++;device.kitId='ZFC-A2-FFFFFFFFFFFF';device.board='ZFC-A2';device.kitCode='654321';device.kitName='Room A2';
  await f.api.connectSetupUsb();assert.equal(f.api.usbSetupState().kitId,device.kitId);
  await assert.rejects(f.api.saveUsbSetup({...setupFields(),password:'ApPrivate#987'}),/Selected Kit changed/);
  assert.equal(device.pass,'ExistingAp#123');assert.equal(f.api.usbSetupState().unlocked,false);
 }finally{f.dispose()}
});
test('Smart USB Setup reports controller-active Save restriction without releasing ownership',async()=>{
 const f=fixture({mode:'usb',initialize:true});try{
  f.smartUsb({enrolled:true});await f.api.connectSetupUsb();await f.api.toggleControl();
  assert.equal(f.api.usbSetupState().available,false);assert.match(f.api.usbSetupState().reason,/Release diagnostic control/);
  await assert.rejects(f.api.saveUsbSetup({...setupFields(),password:'ApPrivate#987'}),/Release diagnostic control/);
  assert.equal(f.api.getState().owner,true);
 }finally{f.dispose()}
});
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
  requestTransport:mode==='android-relay'?'AP':mode.toUpperCase(),mode:exclusive?mode:'auto',exclusiveWifi:exclusive,apActive:!exclusive||mode==='ap',staConnected:mode==='sta',ip:mode==='sta'?ip:'',apIp:'192.168.4.1',apSsid:'zebjus_drone_2',
  hostname:'zebjus-drone-2.local',setupAuthorized:mode==='ap',otaAuthorized:false,controlAuthorized:mode==='ap',firmwareControl:false,motorsArmed:false,otaAppOnly:true,
  radioHandover:{version:1,lastStaInput:'ANDROID_WEBRTC',state:'IDLE'},rcAccess:{version:1,pathVersion:1,controlPath:'AUTO',selection:'AUTO',paused:false,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}},
  rc:{claimed:false,active:false,throttle:1000,inputArmed:false,motorsDisabled:true},firmwareBuiltAt:'Oct 13 2026 16:00:00'};
 let uploaded=false,claimGate=null,identityGate=null,identityOverride=null,reachableHosts=null,offset=0,digest='';
 let relayState={connected:true,paired:true,approved:true,sessionId:'relay-session-1'},relayGate=null;
 const handoverReply=desired=>{
  const plan=window.ZebjusControlPaths.radioTarget({...status,transport:status.requestTransport.toLowerCase()},desired);
  return {kitId:id,mode:desired,state:'switching',radioHandover:{version:1,profileSaved:true,revision:1,state:'PREPARED',...plan},rcAccess:{...status.rcAccess,version:1,pathVersion:1,controlPath:plan.targetInput,selection:plan.targetInput==='PPM'?'PPM':plan.targetInput==='WEB_STA'?'WEB':'ANDROID',paused:true,handoverPaused:true,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}}};
 };
 const handler=async(route,args={})=>{
  requests.push({route,args});
  if(route==='/api/status')return {...status,rc:{...status.rc}};
  if(route==='/api/telemetry')return {kitId:id,gyroReady:true};
  if(route==='/api/command')return {kitId:id,accepted:true};
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
  if(route==='/api/wifi/mode')return handoverReply(args.mode);
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
 const eventCallbacks=new Map();
 const window={addEventListener:(name,fn)=>{if(!eventCallbacks.has(name))eventCallbacks.set(name,new Set());eventCallbacks.get(name).add(fn);listeners.set(name,e=>{for(const f of eventCallbacks.get(name))f(e)})},removeEventListener:(name,fn)=>eventCallbacks.get(name)?.delete(fn),dispatchEvent:e=>{events.push(e);listeners.get(e.type)?.(e)},ZebjusKitPairingStore:{fromSession:()=>savedKey,restore:async()=>savedKey,saveSession:(_id,k)=>{savedKey=k},remember:async(_id,k)=>{savedKey=k;requests.push({route:'vault:remember'})},forget:async()=>{savedKey=''}},
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
 window.ZebjusDeviceRelay={status:()=>({...relayState}),request:async(route,_method,args)=>{
  const result=await handler(route,args);if(relayGate)await relayGate;return result;
 }};
 for(const file of ['control-path-policy.js','kit-access-policy.js']){const ctx={};vm.runInNewContext(readFileSync(new URL('../js/'+file,import.meta.url),'utf8'),ctx);Object.assign(window,ctx);}
 const smartPolicy={};vm.runInNewContext(readFileSync(new URL('../js/smart-kit-policy.js',import.meta.url),'utf8'),smartPolicy);window.ZebjusSmartKitPolicy=smartPolicy.ZebjusSmartKitPolicy;
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
  relay:patch=>{relayState={...relayState,...patch};listeners.get('dronelab:relay-state')?.({})},blockRelay:p=>relayGate=p,
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
    else if(cmd.startsWith('ZJNET,MODE,')){emit('ZJNET,HANDOVER,'+JSON.stringify(handoverReply(cmd.slice(11))));emit('ZJNET,ACK,MODE,'+cmd.slice(11));}
   }};
  },
  smartUsb:(options={})=>{
   const device={kitId:id,board:'ZFC-A1',kitCode:'123456',kitName:'Room A1',prefix:'',apActual:'Room A1',enrolled:false,teacher:'TeacherPrivate#123',pass:'ExistingAp#123',generation:1,open:true,unlockedAt:0,staSsid:'SavedRouter',...options};
   const emit=line=>listeners.get('dronelab:serial-line')?.({detail:{transport:'usb',line}});
   window.DroneLabSerial={isOpen:()=>device.open,isFlashing:()=>false,generation:()=>device.generation,writeLine:async line=>{
    const cmd=String(line).trim();requests.push({route:'USB:'+cmd});
    device.onCommand?.(cmd);
    if(!device.open)throw Error('USB disconnected');
    if(cmd==='ZJKIT,GET'){emit('ZJKIT,ID,'+device.kitId);emit('ZJKIT,CODE,'+device.kitCode);emit('ZJKIT,NAME,'+device.kitName);}
    else if(cmd==='ZJINFO,GET')emit('ZJINFO,FW,'+device.board+',1.5.10');
    else if(cmd==='ZJNET,PAIR')emit('ZJNET,PAIR,'+device.kitId+','+key);
    else if(cmd==='ZJNET,GET'){emit('ZJNET,AP,ON,'+device.apActual);emit('ZJNET,STA,CONNECTED,192.168.1.20,'+device.staSsid);}
    else if(cmd==='ZJADMIN,GET'){
     emit('ZJADMIN,NAME,'+device.kitName);emit('ZJADMIN,APNAME,'+(device.prefix||'ZEBJUS-AERION-A1'));
     emit('ZJADMIN,AUTH,'+(!device.enrolled?'ENROLL_REQUIRED':device.unlockedAt&&now-device.unlockedAt<60000?'UNLOCKED':'LOCKED'));
    }else if(cmd.startsWith('ZJADMIN,ENROLL,')){
     if(device.enrolled)emit('ZJADMIN,ERR,ALREADY_ENROLLED');else{device.enrolled=true;device.teacher=cmd.slice(15);device.unlockedAt=now;emit('ZJADMIN,ACK,ENROLLED');}
    }else if(cmd.startsWith('ZJADMIN,UNLOCK,')){
     if(cmd.slice(15)!==device.teacher)emit('ZJADMIN,ERR,INVALID_ADMIN_PASSPHRASE');else{device.unlockedAt=now;emit('ZJADMIN,ACK,UNLOCKED_60S');}
    }else if(cmd.startsWith('ZJADMIN,')){
     if(!device.unlockedAt||now-device.unlockedAt>=60000){emit('ZJADMIN,ERR,ADMIN_LOCKED');return;}
     const field=cmd.split(',')[1],value=cmd.split(',').slice(2).join(',');
     if(field==='NAME'){device.kitName=value;emit('ZJADMIN,ACK,NAME');}
     else if(field==='APNAME'){device.prefix=value;emit('ZJADMIN,ACK,APNAME,REBOOT_REQUIRED');}
     else if(field==='APPASS'){device.pass=value;emit('ZJADMIN,ACK,APPASS,REBOOT_REQUIRED');}
     else if(cmd==='ZJADMIN,AP_APPLY,CONFIRM'){device.apActual=device.prefix?device.prefix+'-'+device.kitCode:device.kitName;emit('ZJADMIN,ACK,AP_APPLY,REBOOTING');device.unlockedAt=0;}
    }else if(cmd.startsWith('ZJRC,CLAIM,'))emit('ZJRC,ACK,CLAIM,USB');
   }};
   return device;
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
test('LED POST does not invalidate an authenticated status read already waiting on session renewal',async()=>{
 const f=fixture({paired:true,encrypted:true});let finish;
 try{
  await f.api.connect();f.expireSessions();f.blockEnrollment(new Promise(resolve=>finish=resolve));
  const status=f.api.read();await new Promise(resolve=>setImmediate(resolve));
  const led=f.api.request('/api/command','POST',{line:'ZJLED,1,SET,100'});
  finish();await Promise.all([status,led]);assert.equal(f.api.getState().connected,true);
  assert.equal(f.api.getState().linkVerified,true);
 }finally{finish?.();f.dispose()}
});
test('late heartbeat remains visibly stale while original Kit re-verification retains session identity',async()=>{
 const f=fixture({mode:'ap'});try{
  await f.api.connect();const first=f.api.getState();f.advance(7000);
  assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().linkVerified,true);
  await f.api.read();assert.equal(f.api.getState().connected,true);
  assert.equal(f.api.getState().kitId,first.kitId);assert.equal(f.api.getState().connectionGeneration,first.connectionGeneration);
 }finally{f.dispose()}
});
test('a queued bound LED command is rejected before dispatch after the selected Kit disconnects',async()=>{
 const f=fixture({paired:true,encrypted:true});let finish;
 try{
  await f.api.connect();const binding=f.api.getState();f.expireSessions();f.blockEnrollment(new Promise(resolve=>finish=resolve));
  const read=f.api.request('/api/telemetry');await new Promise(resolve=>setImmediate(resolve));
  const led=f.api.requestBound(binding,'/api/command','POST',{line:'ZJLED,1,SET,100'});
  const outcomes=Promise.allSettled([read,led]);await f.api.disconnect();finish();
  const results=await outcomes;assert.ok(results.every(x=>x.status==='rejected'));
  assert.equal(f.requests.filter(x=>x.route==='/api/command').length,0,'Old session must never dispatch a queued LED command');
 }finally{finish?.();f.dispose()}
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

test('Android relay loss immediately revokes connected state and rejects late replies across sessions',async()=>{
 const f=fixture({mode:'android-relay',initialize:true});let finish;
 try{
  await f.api.connect();assert.equal(f.api.getState().connected,true);
  await f.api.read();assert.equal(f.api.getState().physicalLink,'ap');
  f.blockRelay(new Promise(resolve=>finish=resolve));
  const pending=f.api.request('/api/telemetry');
  f.relay({connected:false,approved:false});
  assert.equal(f.api.getState().connected,false,'cached heartbeat cannot outlive its relay');
  assert.equal(f.api.getState().rc,null);assert.equal(f.api.getMonitorPaths().length,0);
  assert.equal(f.elements.get('kitGlobalState').textContent,'LINK STALE');
  f.relay({connected:true,approved:true,sessionId:'relay-session-2'});
  assert.equal(f.api.getState().connected,false,'new phone session must reverify the Kit');
  finish();await assert.rejects(pending,/relay Kit changed|relay session/);
  f.blockRelay(null);await f.api.connect();assert.equal(f.api.getState().connected,true);
  assert.equal(f.api.getState().owner,false);
 }finally{finish?.();f.dispose()}
});
test('relay verification rejects a phone session replaced while status was in flight',async()=>{
 const f=fixture({mode:'android-relay'});let finish;
 try{
  f.blockRelay(new Promise(resolve=>finish=resolve));const connecting=f.api.connect();
  await new Promise(resolve=>setImmediate(resolve));
  f.relay({sessionId:'relay-session-2'});finish();await connecting;
  assert.equal(f.api.getState().connected,false);
  assert.match(f.elements.get('kitMessage').textContent,/relay session changed/);
 }finally{finish?.();f.dispose()}
});
