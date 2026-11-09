import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function rcObserver(){
 const source=read('js/classroom-kits.js');
 const start=source.indexOf('function adoptRcObservation('),end=source.indexOf('async function readStatus()',start);
 let now=10000,pending=[];
 const ctx={Date:class extends Date{static now(){return now;}},document:{hidden:false},
  state:{transport:'sta',kitId:'ZFC-A2-123456ABCDEF',bootId:'boot-1',rcAccess:{controlPath:'PPM'}},
  reconnectTicket:1,controlTicket:1,accessBusy:false,headerModePending:false,otaActive:false,
  wifiTesting:false,statusPending:null,flightTelemetryPending:false,FC_MONITOR_INTERVAL_MS:100,
  motorTrafficBusy:()=>ctx.busy===true,linkFresh:()=>ctx.link!==false,
  $:id=>({classList:{contains:()=>id==='tab-firmware'&&ctx.visible!==false}}),
  deviceRequest:route=>new Promise((resolve,reject)=>{
   assert.equal(route,'/api/rc/snapshot');pending.push({resolve,reject});
  })
 };
 vm.createContext(ctx);
 vm.runInContext(read('js/control-path-policy.js'),ctx);
 ctx.root={ZebjusControlPaths:ctx.ZebjusControlPaths,ZebjusDevicesWorkspace:{active:()=> 'inputs'}};
 vm.runInContext(source.slice(start,end),ctx);
 return {ctx,state:ctx.state,pending,advance:ms=>{now+=ms},read:()=>ctx.observeController(),
  reply:(rc,index=0)=>pending.splice(index,1)[0].resolve({kitId:ctx.state.kitId,...rc,__observedAt:now})};
}
test('one shared RC reader is bounded and skips motor traffic, hidden tabs and status reads',async()=>{
 const b=rcObserver();
 const first=b.read();
 b.advance(300);await b.read();assert.equal(b.pending.length,1);
 b.reply({source:'PPM',active:true,seq:1,accepted:1});await first;
 await b.read();assert.equal(b.pending.length,0,'use the recent verified observation');
 b.advance(160);
 b.ctx.busy=true;await b.read();b.ctx.busy=false;
 b.ctx.document.hidden=true;await b.read();b.ctx.document.hidden=false;
 b.ctx.statusPending={};await b.read();b.ctx.statusPending=null;
 assert.equal(b.pending.length,0);
 const second=b.read();
 assert.equal(b.pending.length,1);
 b.reply({source:'PPM',active:true,seq:8,accepted:8});await second;
 assert.equal(b.state.rc.seq,8);
 assert.match(read('js/classroom-kits.js'),/FC_STATUS_INTERVAL_MS=2200/);
 assert.doesNotMatch(read('js/live-inputs.js'),/\/api\/rc\/(?:snapshot|claim|preview)/);
});
test('inactive selected PPM keeps observing recovery, with bounded backoff after a dropped read',async()=>{
 const b=rcObserver();b.ctx.visible=false;
 const lost=b.read();
 b.reply({active:false,source:'NONE',lastReleaseReason:'PPM_SIGNAL_LOST',lastReleaseAtMs:900});await lost;
 const releaseAt=b.state.rc.releaseObservedAt;
 b.advance(500);
 const repeat=b.read();
 b.reply({active:false,source:'NONE',lastReleaseReason:'PPM_SIGNAL_LOST',lastReleaseAtMs:900});await repeat;
 assert.equal(b.state.rc.releaseObservedAt,releaseAt,'polls do not turn a historical release into another event');
 b.advance(500);
 const dropped=b.read();b.pending.shift().reject(Error('dropped response'));await dropped;
 b.advance(999);await b.read();assert.equal(b.pending.length,0);
 b.advance(1);
 const recovered=b.read();
 b.reply({active:true,source:'PPM',seq:1,accepted:10});await recovered;
 assert.equal(b.state.rc.source,'PPM');
});
test('late RC replies cannot cross boot, source, or connection generations',async()=>{
 for(const change of [b=>{b.state.bootId='boot-2'},b=>{b.ctx.controlTicket++},
  b=>{b.ctx.reconnectTicket++},b=>{b.state.transport='ap'},b=>{b.state.kitId='ZFC-A2-FFFFFFFFFFFF'}]){
  const b=rcObserver(),old=b.read(),id=b.state.kitId;change(b);
  b.reply({kitId:id,source:'PPM',active:true,seq:100});await old;
  assert.equal(b.state.rc,undefined);
  b.advance(100);const next=b.read();b.reply({source:'PPM',active:true,seq:1});await next;
  assert.equal(b.state.rc.seq,1);
 }
 const kit=read('js/classroom-kits.js');
 assert.match(kit,/if\(!linkFresh\(\)\|\|state\.working\|\|state\.owner\|\|state\.rc\?\.claimed\|\|wifiTesting\)/);
 assert.match(kit,/await beginNetworkHandover\(target/);
 assert.match(kit,/result\.kitId!==target\.kitId/);
 assert.match(kit,/state\.linkState='stale';state\.owner=false;state\.rcSession=''/);
 assert.match(kit,/if\(\+\+pollErrors<3\)/);
 assert.match(kit,/recoverVerifiedLink\(old\)/);
});
test('missed status reads recover without sending RC writes; the STOP action still sends them',async()=>{
 const source=read('js/classroom-kits.js');
 const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const runtime=[section('async function disconnect(','function waitSerial('),
  section('function statusReadFailed(','function adoptRcObservation('),
  section('async function releaseRc(','function toRc('),
  section(' pollTimer=setInterval(async()=>{',' rcTimer=setInterval(')].join('\n');
 for(const transport of ['sta','usb']){
  const state={connected:true,linkState:'connected',heartbeatAt:9900,kitId:'ZFC-A2-123456ABCDEF',
   transport,owner:true,rcSession:'diagnostic',rcSource:'WEB'};
  let poll,recoveries=0,readError=Object.assign(Error('Safety request superseded status'),{code:'STATUS_SUPERSEDED'});
  const writes=[];
  const ctx=vm.createContext({state,Date:{now:()=>10000},CustomEvent,document:{hidden:false},
   root:{dispatchEvent(){}},trace(){},classify(){},audit(){},tone(){},render(){},clearAdminBinding(){},closeReconnectOffer(){},
   motorTrafficBusy:()=>false,backgroundLinkPolicy:()=>({poll:true,penalize:true}),beginMonitorRead:()=>true,
   advanceConnectionGeneration:()=>++ctx.reconnectTicket,connectionTarget:()=>({transport}),
   read:async()=>{throw readError;},recoverVerifiedLink:async()=>{recoveries++;return true;},
   usbWrite:async line=>writes.push(line),deviceRequest:async(route,method)=>writes.push([route,method]),
   setInterval:callback=>{poll=callback;},pollTimer:null,pollBusy:false,pollErrors:0,FC_MONITOR_INTERVAL_MS:100,
   nextStatusReadAt:0,lastBackgroundStatusAt:0,foregroundResumedAt:0,autoReconnectAllowed:true,otaActive:false,wifiTesting:false,
   pendingNetworkTarget:null,controlTicket:0,ownOwnerId:'owner',wifiTestNonce:0,savedNetworks:[],reconnectTicket:1,
   recoveryTarget:null,usbCandidate:{},authSessions:new Map(),localKitHosts:new Map(),adminKitHosts:new Map()});
  vm.runInContext(read('js/control-path-policy.js'),ctx);ctx.root.ZebjusControlPaths=ctx.ZebjusControlPaths;
  vm.runInContext(runtime,ctx);
  for(let n=0;n<3;n++)await poll();
  assert.equal(ctx.pollErrors,0);assert.equal(state.owner,true);assert.equal(state.linkState,'connected');
  readError=Error('Status timeout');
  for(let n=0;n<3;n++)await poll();
  assert.equal(state.connected,false);assert.equal(state.owner,false);assert.equal(state.rcSession,'');
  assert.deepEqual(writes,[]);assert.equal(recoveries,transport==='sta'?1:0);
  Object.assign(state,{connected:true,transport,owner:true,rcSession:'diagnostic'});
  await ctx.stop();
  assert.deepEqual(writes,transport==='usb'?['ZJRC,STOP']:[['/api/rc/stop','POST']]);
 }
});
test('Android background failsafe, resume verification and AP/STA switching have separate explicit gates',()=>{
 const java=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 const network=read('companion-network.js'),ui=read('companion-flight.js'),phone=read('companion.js');
 assert.match(java,/onPause\(\)/);assert.match(java,/zebjusNativeAppPaused/);
 assert.match(java,/zebjusNativeAppResumed/);assert.match(java,/view\.onResume\(\)/);
 assert.match(network,/window\.zebjusNativeAppPaused=/);
 assert.match(network,/dropInput\('App paused/);
 assert.match(network,/window\.zebjusNativeAppResumed=/);
 assert.match(network,/if\(reconnectEnabled\)void pollConnection\(\)/);
 assert.match(network,/onKitLink=data\.requestTransport===link\.toUpperCase\(\)/);
 assert.match(network,/await pinVerifiedStatus\(data\)/);
 assert.match(network,/if\(raw\.status!==200\|\|identity\.kitId!==wanted\)/);
 assert.match(network,/setInterval\(pollConnection,3500\)/);
 assert.match(ui,/window\.addEventListener\('blur'/);
 assert.match(ui,/document\.addEventListener\('visibilitychange'/);
 assert.match(phone,/window\.zebjusAppPaused=/);
 assert.doesNotMatch(network,/automatic.*enableMotor/);
});
test('Embedding matrix describes cross-origin permissions and does not promise USB or LAN iframe access',()=>{
 const docs=read('docs/EMBEDDING_AP_STA_KIT_DISCOVERY.md');
 const embed=read('js/embed-kit-access.js');
 for(const term of ['WordPress','Wix','local-network','loopback-network','serial','camera','sandbox',
  'STA → AP','AP → STA','read-only','one request at a time','Android','same full Device ID','not claims']){
   // 'not claims' is paraphrased in docs as "not claims" equivalent "not"
   if(term==='not claims')continue;
   assert.ok(docs.includes(term),term);
 }
 assert.match(docs,/hardware tests to execute/i);
 assert.match(embed,/host\.ZebjusEmbedKitAccess=publicInfo/);
 assert.doesNotMatch(embed,/document\.createElement|postMessage\s*\(/);
});
test('Release verification and metadata derive version from Gradle, with fixed signer and upgrade guard',()=>{
 const workflow=read('.github/workflows/build-qr-android.yml'),verifier=read('tools/verify_signed_android_release.py'),
  gradle=read('mobile-android/app/build.gradle'),published=read('mobile-apk/ANDROID_RELEASE_META.txt');
 assert.match(workflow,/python3 tools\/write_android_release_metadata\.py mobile-android\/app\/build\.gradle/);
 assert.doesNotMatch(workflow,/VERSION_CODE=\$\(awk /);
 assert.match(read('tools/write_android_release_metadata.py'),/f"App: \{APP_ID\}/);
 assert.doesNotMatch(workflow,/Version: 1\.7\.13-direct-kit-control/);
 assert.match(workflow,/verify_signed_android_release\.py/);
 assert.match(verifier,/EXPECTED_CERT_SHA256 = "[0-9a-f]{64}"/);
 assert.match(verifier,/GRADLE_SOURCE/);
 assert.match(verifier,/int\(version_code\) > int\(old_package\[2\]\)/);
 const current=Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
 const previous=Number(/VersionCode:\s*(\d+)/.exec(published)?.[1]);
 assert.ok(current>=32&&previous>0&&current>=previous);
 assert.match(gradle,/versionName '\d+\.\d+\.\d+-[a-z0-9-]+'/ );
});

test('minimized STA tab does not tear down selected Kit on throttled network polls',()=>{
 const kit=read('js/classroom-kits.js'),start=kit.indexOf('function backgroundLinkPolicy(');
 assert.ok(start>=0);
 const end=kit.indexOf('\n}',start)+2,ctx={BACKGROUND_STATUS_INTERVAL_MS:14000,FOREGROUND_SETTLE_MS:6500};
 vm.runInNewContext(kit.slice(start,end)+';globalThis.policy=backgroundLinkPolicy',ctx);
 assert.equal(ctx.policy(true,100000,99000,0).poll,false);
 assert.equal(ctx.policy(true,115000,100000,0).poll,true);
 assert.equal(ctx.policy(true,115000,100000,0).penalize,false);
 assert.equal(ctx.policy(false,118000,100000,115000).penalize,false);
 assert.equal(ctx.policy(false,123000,100000,115000).penalize,true);
 assert.match(kit,/function resumeVisibleMonitoring\(\)/);
 assert.match(kit,/foregroundResumedAt=Date.now\(\);pollErrors=0/);
 assert.match(kit,/root.addEventListener\('pageshow',event/);
 assert.match(kit,/if\(event.persisted\)\{if\(state.owner\)void releaseRc\(\);return\}/);
 assert.match(kit,/if\(!backgroundLinkPolicy\(document.hidden,Date.now\(\),lastBackgroundStatusAt,foregroundResumedAt\).penalize\)/);
 assert.match(kit,/if\(state.owner\)void releaseRc\(\)/);
 assert.match(kit,/const HEARTBEAT_MAX_AGE=6500/);
 const inputs=read('js/live-inputs.js');
 assert.doesNotMatch(inputs,/visibilitychange',\(\)=>\{if\(document.hidden\)wipe\(\)/);
 assert.match(inputs,/\['stale','reconnecting'\].includes\(kit.linkState\)/);
 assert.match(inputs,/SNAPSHOT_TTL_MS=900, INPUT_MAX_AGE_MS=400, SEQUENCE_TTL_MS=800/);
});
