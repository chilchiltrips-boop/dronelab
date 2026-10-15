import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Firmware reconnect is blocked without a verified kit or during a protected operation',()=>{
 const src=read('firmware-updater.js'),a=src.indexOf('function syncFirmwareControls(){'),b=src.indexOf('function setBusy(',a);
 assert.ok(a>=0&&b>a);
 const nodes=new Map(),get=sel=>{
  if(!nodes.has(sel))nodes.set(sel,{disabled:false,checked:false,textContent:'',title:'',
   classList:{toggle(){}},setAttribute(){}});
  return nodes.get(sel);
 };
 let selected={connected:false,kitId:'',transport:'none'};
 const context={busy:false,fw:null,loader:null,monitorPort:null,navigator:{serial:{}},isSecureContext:true,
  ZebjusKits:{getState:()=>selected,reconnect:async()=>true},
  $:get,usbFlashReadiness:()=>({ready:false,message:'USB missing'}),
  networkFlashReadiness:()=>({ready:false,message:'Kit missing'}),
  school:()=>null};
 vm.runInNewContext(src.slice(a,b)+';globalThis.runSync=syncFirmwareControls;',context);
 context.runSync();assert.equal(get('#fwReconnectBtn').disabled,true);
 selected={connected:false,kitId:'ZFC-A1-012345ABCDEF',transport:'sta',working:false,owner:false};
 context.runSync();assert.equal(get('#fwReconnectBtn').disabled,false,'An identified stale kit may be reconnected');
 for(const busyFlag of ['otaInProgress','working','owner']){
  selected={...selected,[busyFlag]:true};context.runSync();
  assert.equal(get('#fwReconnectBtn').disabled,true,busyFlag+' must block reconnect');
  selected={...selected,[busyFlag]:false};
 }
 context.runSync();assert.equal(get('#fwReconnectBtn').disabled,false);
});
test('Overview telemetry is not requested by other tabs or during STA/AP/OTA operations',async()=>{
 const src=read('js/firmware-connect.js'),a=src.indexOf('async function sampleHealth(){'),b=src.indexOf('function init(){',a);
 assert.ok(a>=0&&b>a);
 let kitStatus={connected:true,kitId:'ZFC-A1-012345ABCDEF'},view='overview',calls=0;
 const nodes={'tab-firmware':{classList:{contains:()=>true}},fwKitDemoMode:{checked:false}};
 const context={state:()=>kitStatus,root:{ZebjusDevicesWorkspace:{active:()=>view}},
  $:id=>nodes[id],kit:()=>({request:async()=>{calls++;return{kitId:kitStatus.kitId,gyroReady:true}}}),
  line(){},telemetry:null,telemetryTime:0,healthAt:0,Date};
 vm.runInNewContext(src.slice(a,b)+';globalThis.runSample=sampleHealth;',context);
 view='firmware';await context.runSample();assert.equal(calls,0);
 view='wifi';await context.runSample();assert.equal(calls,0);
 view='overview';kitStatus={...kitStatus,otaInProgress:true};await context.runSample();assert.equal(calls,0);
 kitStatus={...kitStatus,otaInProgress:false,working:true};await context.runSample();assert.equal(calls,0);
 kitStatus={...kitStatus,working:false};await context.runSample();assert.equal(calls,1);
});
test('Closing embedded WebRTC connection settings preserves originating navigation',()=>{
 const src=read('pairing-web.js');
 assert.ok(src.includes('previousMobileTab=active'));
 assert.ok(src.includes("previousHardwareView=view==='mobile'?'overview':view"));
 assert.match(src,/document\.querySelector\('\.tab\[data-tab=/);
 assert.ok(src.includes("ZebjusDevicesWorkspace?.open(view==='mobile'?'overview':view"));
 assert.doesNotMatch(src,/function closeSettings\(\)\{stopCamera\(\);if\(inlineSettings\(\)\)\{document\.querySelector/);
});
