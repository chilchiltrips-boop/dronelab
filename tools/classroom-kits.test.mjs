import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const kit=read('js/classroom-kits.js'),html=read('index.html'),fw=read('FlightCore_Firmware/FlightCoreNetwork.h'),cl=read('FlightCore_Firmware/FlightCoreClassroom.h');
test('PID input mirror sends no Kit keepalive even with an old enabled physical target',()=>{
 const fn=kit.slice(kit.indexOf('function webControls(){'),kit.indexOf('async function identify(){'));
 let writes=0,pid=true;
 const elements={'tab-pid':{classList:{contains:()=>pid}},'tab-python':{classList:{contains:()=>!pid}},kitHardwareTarget:{checked:true},pidFrame:{contentWindow:{ZebjusTraining:{hardwareInput:()=>null}}}};
 const context={$:id=>elements[id],root:{ZebjusPythonHardwareActive:true},state:{connected:true,owner:true,rcSource:'WEB'},document:{hidden:false},sendFrame:()=>writes++};
 vm.runInNewContext(fn+';webControls()',context);assert.equal(writes,0);
 pid=false;vm.runInNewContext(fn+';webControls()',context);assert.equal(writes,1,'Explicit Python hardware session remains independent');
});
test('MY KITS script is parseable and exposes a single verified device session API',()=>{
 const win={},doc={readyState:'loading',addEventListener:()=>{}};
 vm.runInNewContext(kit,{window:win,document:doc,URLSearchParams,Promise,Error});
 for(const name of ['connect','disconnect','read','claim','releaseRc','stop','sendFrame','ingestAndroid','getState','targetHardware','view'])assert.equal(typeof win.ZebjusKits[name],'function',name);
 const s=win.ZebjusKits.getState();
 assert.equal(s.connected,false);assert.equal(s.owner,false);
});
test('MY KITS navigation, pairing and admin controls appear without removing existing tabs',()=>{
 for(const id of ['kitTopStatus','kitTopConnect','kitTopNetworkSwitch','kitCenter','kitCodeInput','kitTransport','kitIpInput','kitKeyInput','kitSelectedId','kitTakeControl','kitReleaseControl','kitStop','kitAdmin','kitAdminRead','kitAdminApply','kitFactoryReset','kitHardwareTarget','kitPidMonitor','kitMobilePairDetails','connectionDialog','fwUsbFlashBtn','pythonTarget'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const n of ['ASSEMBLY LAB','2D WIRING','PYTHON LAB','PID TUNING','DEVICES &amp; FIRMWARE'])assert.ok(html.includes(n),n);
  assert.ok(!html.includes('data-tab="settings" title="MY KITS"'));
 const css=read('classroom-kits.css');
 for(const t of ['.kit-top-status','.kit-center','.kit-connect-grid','@media(max-width:520px)','prefers-reduced-motion',':focus-visible'])assert.ok(css.includes(t),t);
});
test('Public kit codes are selectors, authentication is per-device and admin is physical USB only',()=>{
 for(const t of ['kitCode','kitId','zjRcClaim','X-ZJ-Key','zjAuthenticated()','zjCorsAllowed','Access-Control-Allow-Origin','Access-Control-Allow-Private-Network','HTTP_OPTIONS','origin_denied'])assert.ok(fw.includes(t),t);
 assert.ok(fw.includes('origin=="https://chilchiltrips-boop.github.io"')&&!fw.includes('"Access-Control-Allow-Origin","*"'));
 for(const t of ['ZJADMIN,GET','ZJADMIN,NAME,','ZJADMIN,APNAME,','ZJADMIN,APPASS,','ZJADMIN,ROTATE_KEY,CONFIRM','ZJADMIN,FACTORY_RESET,CONFIRM','CONTROLLER_ACTIVE','zjKitPrefs.putString("apName"'])assert.ok(cl.includes(t),t);
 assert.ok(!fw.includes('/api/admin/'),'remote AP password/key rotation must not be exposed over HTTP');
});
test('Remote WebRTC simulator inputs never claim physical Kit ownership; local control is separate',()=>{
 for(const s of ["state.transport==='ap'","state.physicalLink==='ap'","state.owner","state.rcSource","kitHardwareTarget","armed:'false'","350","targetAddressSpace:'local'"])assert.ok(kit.includes(s),s);
 const pairing=read('pairing-web.js'),host=read('pairing-host-bridge.js'),pid=read('js/tripod-page.js');
 assert.ok(!pairing.includes('window.ZebjusKits?.ingestAndroid?.(m)'),'simulator receiver must not send physical Kit diagnostic frames');
 assert.ok(pairing.includes('Remote Phase 1 is simulator-only'));
 assert.ok(host.includes('hardwareInput(){'));
 assert.ok(pid.includes('hardwareInput:()=>'));
 assert.doesNotMatch(pid,/ZebjusKits/,'Simulator must never call physical Kit APIs');
 assert.ok(pid.includes('hardwareInput:()=>null'));
});
test('Network/session changes cannot silently reassign firmware control',()=>{
 for(const t of ['kitId!==state.kitId','kitCode!==state.kitCode','state.owner=false','releaseRc()','RC frame rejected:','state.rcSession','ZJRC,CLAIM,','ZJRC,SET,','ZJRC,RELEASE','ZJRC,STOP'])assert.ok(kit.includes(t),t);
 assert.ok(!kit.includes('localStorage.setItem(key,')||kit.includes('localStorage.setItem(key,JSON.stringify(next))'),'only public verified kit registry may persist');
 assert.ok(kit.includes("state.key=''"),'control keys cleared on disconnect');
});
test('Offline bundle includes new UI so an AP-only classroom can reuse the cached shell',()=>{
 const sw=read('sw.js');
 for(const u of ['./classroom-kits.css?v=embed-clean-20261017','./js/classroom-kits.js?v=kit-transport-unified-20261017'])assert.ok(sw.includes(u),u);
});
test('WebApp observes Android RX/APPLIED diagnostics without claiming its controller',async()=>{
 const kitId='ZFC-A2-012345ABCDEF',kitCode='432198',records=[],routes=[];
 const elements={kitCodeInput:{value:''},kitTransport:{value:'sta'},kitIpInput:{value:''},kitKeyInput:{value:''}};
 const udp={protocol:'ZJUDP1',feedbackVersion:2,active:true,received:12,applied:9,rejected:1,
  lastRxSeq:12,lastAppliedSeq:11,receiveAgeMs:3,applyAgeMs:19,nackReason:'STALE'};
 const status={kitId,kitCode,board:'ZFC-A2',version:'1.5.5',requestTransport:'AP',mode:'ap',
  apActive:true,staConnected:false,setupAuthorized:true,udp,managementProtocol:'ZJM1',
  rc:{claimed:true,source:'ANDROID',inputArmed:true,motorsDisabled:true}};
 const window={addEventListener(){},dispatchEvent(){},
  ZebjusKitPairingStore:{fromSession:()=>'',restore:async()=>''},
  ZebjusAckDiagnostics:{record:(...entry)=>records.push(entry)},
  ZebjusKitAuth:{http:()=>({}),openLocal:async()=>({expiresAt:Date.now()+60000,
   request:async route=>{routes.push(route);assert.equal(route,'/api/status');return status;}})}};
 const document={readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[],querySelector:()=>null};
 const shared={};vm.runInNewContext(read('js/control-path-policy.js'),shared);window.ZebjusControlPaths=shared.ZebjusControlPaths;
 vm.runInNewContext(kit,{window,document,localStorage:{getItem:()=>null,setItem(){}},
  fetch:async()=>({ok:true,json:async()=>({kitId,kitCode,board:'ZFC-A2',simpleConnection:true})}),
  setTimeout,clearTimeout,AbortController,URLSearchParams,console,CustomEvent:class{}});
 await window.ZebjusKits.findKitAp();await window.ZebjusKits.read();
 assert.equal(window.ZebjusKits.getState().owner,false);
 assert.equal(window.ZebjusKits.getState().rc.source,'ANDROID');
 assert.equal(window.ZebjusKits.getState().udp.lastAppliedSeq,11);
 const event=records.filter(([kind])=>kind==='web_status').at(-1)[1];
 for(const field of ['feedbackVersion','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','nackReason'])assert.equal(event[field],udp[field]);
 assert.ok(routes.every(route=>route==='/api/status'),'observer never claims, releases or publishes a frame');
});
