import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/kit-ack-diagnostics.js');
test('input diagnostics retain channels, source selection, PPM loss/recovery and profile ACK without identifiers',()=>{
 const b=bench('web'),rc={source:'PPM',active:true,inputValid:true,inputArmed:false,claimed:true,seq:10,ageMs:25,throttle:1000,roll:1500,pitch:1500,yaw:1500,channels:[1501,1502,1000,1504,1000,1506,1507,1508]};
 const kit={kitId:'private-id',bootId:'private-boot',transport:'sta',rcAccess:{controlPath:'PPM'},ppm:{present:true,ageMs:12,seq:20,losses:0,faults:2}};
 b.api.observeInput(rc,kit);b.api.observeInput(rc,kit);
 assert.equal(b.events().filter(e=>e.event==='input_sample').length,1);
 let data=b.events().find(e=>e.event==='input_sample').data;assert.equal(data.ch1,1501);assert.equal(data.ch8,1508);assert.equal(data.selectedPath,'PPM');assert.equal(data.ppmFaults,2);
 b.api.observeInput({...rc,source:'NONE',active:false},{...kit,ppm:{...kit.ppm,present:false,losses:1}});
 b.api.observeInput(rc,{...kit,ppm:{...kit.ppm,losses:1}});
 assert.equal(b.events().filter(e=>e.event==='ppm_lost').length,1);assert.equal(b.events().filter(e=>e.event==='ppm_recovered').length,1);
 b.api.record('handover_ack',{route:'/api/wifi/mode',targetInput:'ANDROID_AP',lastStaInput:'PPM',profileSaved:true,profileRevision:4,handoverState:'PREPARED',ssid:'private-network'});
 data=b.events().at(-1).data;assert.equal(data.route,'/api/wifi/mode');assert.equal(data.profileRevision,4);
 for(const secret of ['private-id','private-boot','private-network'])assert.ok(!b.api.exportData('csv').includes(secret));
 assert.equal(b.api.reasonClass('input_profile_save_failed'),'PROFILE_SAVE_FAILED');assert.equal(b.api.reasonClass('lower_throttle_and_disarm'),'INPUT_UNSAFE');
});
function bench(client='android',seed){
 const saved=new Map(seed||[]),buttons={},panel={
  open:true,dataset:{client},addEventListener(){},
  querySelector(sel){return sel==='[data-diag-summary]'?{set textContent(v){this.text=v}}:
   sel==='[data-diag-events]'?{set textContent(v){this.text=v}}:
   sel==='[data-diag-export-status]'?{set textContent(v){this.text=v}}:null;},
  querySelectorAll(){return ['json','csv'].map(kind=>({
   dataset:{diagExport:kind},addEventListener(type,handler){buttons[kind]=handler;}
  }));}
 };
 const downloads=[];
 const root={ZebjusNative:{saveDiagnosticLog:(kind,body)=>downloads.push({kind,body})},addEventListener(){}};
 const ctx={window:root,localStorage:{getItem:key=>saved.get(key)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  document:{getElementById:id=>id==='kitAckDiagnostics'?panel:null,readyState:'complete'},
  Date,Math,JSON,Blob,URL,setTimeout,clearTimeout,confirm:()=>true};
 vm.runInNewContext(source,ctx);
 return {root,saved,buttons,downloads,api:root.ZebjusAckDiagnostics,events:()=>JSON.parse(root.ZebjusAckDiagnostics.exportData('json')).events};
}
test('UDP input staleness and missing ACK are distinct, and UDP completion timings survive export',()=>{
 const b=bench();
 assert.equal(b.api.reasonClass('UDP_INPUT_STALE'),'INPUT_STALE');
 assert.equal(b.api.reasonClass('UDP_ACK_TIMEOUT'),'TIMEOUT');
 assert.equal(b.api.reasonClass('UDP_NO_ACK'),'TIMEOUT');
 assert.equal(b.api.reasonClass('Invalid receive ACK'),'ACK_INVALID');
 b.api.record('native_response',{phase:'complete_udp',reason:'INPUT_STALE'});
 assert.equal(b.events().at(-1).data.phase,'complete_udp');
 assert.equal(b.events().at(-1).data.reason,'INPUT_STALE');
});
test('PPM loss reason survives Android and WebApp JSON/CSV exports without permitting arbitrary text',()=>{
 for(const client of ['android','web']){
  const b=bench(client);
  b.api.record('kit_status',{source:'PPM',releaseReason:'PPM_SIGNAL_LOST',lastReleaseAtMs:12345});
  assert.equal(b.events().at(-1).data.releaseReason,'PPM_SIGNAL_LOST');
  assert.equal(b.events().at(-1).data.lastReleaseAtMs,12345);
  assert.match(b.api.exportData('json'),/PPM_SIGNAL_LOST/);
  assert.match(b.api.exportData('csv'),/PPM_SIGNAL_LOST/);
  b.api.record('kit_status',{releaseReason:'PRIVATE_DEVICE_OR_PASSWORD'});
  assert.equal(b.events().at(-1).data.releaseReason,undefined);
 }
});
test('startup failure enums and active controller ownership remain precise without credentials',()=>{
 const b=bench();
 assert.equal(b.api.reasonClass('controller_locked_or_invalid_source'),'OWNER_BUSY');
 assert.equal(b.api.reasonClass('Controller locked by WEB. Release control there.'),'OWNER_BUSY');
 assert.equal(b.api.reasonClass('not_controller_owner'),'OWNER_STALE');
 b.api.record('udp_error',{reason:'UDP_START_BIND_SOCKET_SOCKET',sent:0,ackReceived:0});
 b.api.record('kit_status',{source:'WEB',inputArmed:false,managementProtocol:'ZJM1',udpActive:false,udpReceived:0,udpRejected:2});
 assert.equal(b.events().at(-2).data.reason,'UDP_START_BIND_SOCKET_SOCKET');
 assert.equal(b.events().at(-1).data.source,'WEB');
 assert.equal(b.events().at(-1).data.udpRejected,2);
 b.api.record('kit_status',{releaseReason:'UDP_AUTH_EXPIRED'});
 assert.equal(b.events().at(-1).data.releaseReason,'UDP_AUTH_EXPIRED');
 b.api.record('udp_error',{reason:'UDP_START_BIND_SOCKET_private_secret'});
 assert.equal(b.events().at(-1).data.reason,undefined);
});
test('strict diagnostic allowlist never saves Kit ID, IP, SSID, HMAC keys or raw network errors',()=>{
 const b=bench();
 b.api.record('rc_ack_error',{route:'/api/rc/preview',seq:4,reason:'TIMEOUT',roundTripMs:370,
   kitId:'ZFC-A1-AAAAAAAAAAAA',ip:'192.168.4.1',ssid:'School-Secret',
   key:'0011223344556677',session:'private',password:'abc123',raw:'topsecret'});
 b.api.record('rc_ack_error',{route:'/api/firmware/chunk',reason:'SECRETPASSWORD',outcome:'fail'});
 const json=b.api.exportData('json'),csv=b.api.exportData('csv');
 for(const value of ['ZFC-A1-AAAAAAAAAAAA','192.168.4.1','School-Secret','0011223344556677','topsecret','SECRETPASSWORD'])
  assert.ok(!json.includes(value)&&!csv.includes(value),value+' must never be exported');
 assert.equal(b.events()[2].data.reason,undefined);
 assert.equal(b.events()[1].data.reason,'TIMEOUT');
 assert.equal(b.events()[1].data.seq,4);
});
test('ACK successes are sampled without synchronous storage writes on every joystick packet',()=>{
 const b=bench();
 for(let i=1;i<=50;i++)b.api.record('rc_ack',{seq:i,roundTripMs:30});
 assert.equal(b.events().filter(x=>x.event==='rc_ack').length,10);
 b.api.record('rc_ack',{seq:51,roundTripMs:200});
 assert.equal(b.events().at(-1).data.roundTripMs,200,'slow ACK is always recorded');
});
test('RX/APPLIED ages and authenticated NACK enums survive exports; ARM transitions bypass sampling',()=>{
 for(const client of ['android','web']){
  const b=bench(client);
  b.api.record('udp_ack',{feedbackVersion:2,ackKind:'RX_ACK',lastRxSeq:10,lastAppliedSeq:9,
   receiveAgeMs:2,applyAgeMs:18,appliedKnown:true,inputArmed:false});
  b.api.record('udp_ack',{feedbackVersion:2,ackKind:'APPLIED_ACK',lastRxSeq:11,lastAppliedSeq:11,
   receiveAgeMs:1,applyAgeMs:0,appliedKnown:true,inputArmed:true});
  assert.equal(b.events().at(-1).data.inputArmed,true,'ARM transition must not be sampled away');
  b.api.record('udp_nack',{ackKind:'NACK',nackReason:'STALE',lastRxSeq:11,lastAppliedSeq:11,receiveAgeMs:30,applyAgeMs:30});
  const exported=JSON.parse(b.api.exportData('json'));
  assert.equal(exported.summary.nack,1);assert.equal(exported.summary.lastAppliedSeq,11);
  assert.match(b.api.exportData('csv'),/receiveAgeMs,applyAgeMs/);
  assert.equal(b.events().at(-1).data.nackReason,'STALE');
  for(const reason of ['UDP_NACK_INVALID_FRAME','UDP_NACK_OWNER_CONFLICT','UDP_NACK_APPLY_STALLED','UDP_NACK_AUTH_EXPIRED']){
   b.api.record('udp_error',{reason});assert.equal(b.events().at(-1).data.reason,reason);
  }
  b.api.record('udp_nack',{nackReason:'secret device',ackKind:'secret ack',key:'secret key'});
  assert.deepEqual(b.events().at(-1).data,{});
 }
});
test('errors auto-persist; recovery survives page reload; cap prevents unbounded storage growth',()=>{
 const b=bench();
 for(let i=0;i<400;i++)b.api.record('rc_ack_error',{seq:i,reason:'TIMEOUT'});
 assert.equal(b.events().length,350);
 const reload=bench('android',b.saved);
 assert.equal(reload.events().length,350);
 assert.equal(reload.events()[0].data.seq,51);
 assert.equal(reload.events().at(-2).data.seq,399);
 assert.equal(reload.events().at(-1).event,'app_start');
});
test('Android export uses scoped native Documents save, CSV/JSON represent sanitized values',()=>{
 const b=bench();b.api.record('rc_ack_error',{seq:7,reason:'ACK_INVALID',roundTripMs:450});
 b.buttons.json();b.buttons.csv();
 assert.deepEqual(b.downloads.map(x=>x.kind),['json','csv']);
 assert.match(b.downloads[0].body,/"schema": "zebjus-ack-diagnostics-v1"/);
 assert.match(b.downloads[1].body,/rc_ack_error/);
 assert.match(b.downloads[1].body,/ACK_INVALID/);
});
test('both UIs expose diagnostics and Android implements user-approved SAF exports',()=>{
 const app=read('companion.html'),web=read('index.html'),
  shim=read('android-native-bridge.js'),native=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 for(const page of [app,web]){
  assert.match(page,/id="kitAckDiagnostics"/);
  assert.match(page,/data-diag-export="json"/);
  assert.match(page,/data-diag-export="csv"/);
  assert.match(page,/data-diag-clear/);
  assert.match(page,/js\/kit-ack-diagnostics\.js/);
 }
 assert.match(shim,/saveDiagnosticLog:\(format,content\)=>send\('saveDiagnosticLog',format,content\)/);
 assert.match(native,/case "saveDiagnosticLog":/);
 assert.match(native,/Intent\.ACTION_CREATE_DOCUMENT/);
 assert.match(native,/getContentResolver\(\)\.openOutputStream/);
 assert.match(native,/ACK_DIAGNOSTIC_SAVE_PICKER/);
 assert.match(read('js/classroom-kits.js'),/trace\('web_ack_error'/);
 assert.match(read('companion-network.js'),/trace\('rc_ack_error'/);
 assert.match(read('companion-network.js'),/trace\('kit_status'/);
 assert.match(read('mobile-android/app/build.gradle'),/versionCode 60\s*versionName '1\.8\.21-setup-wizard'/);
});

test('AP native phase timings and firmware release reason are sanitized in CSV/JSON',()=>{
 const b=bench();
 assert.equal(b.api.reasonClass('not_controller_owner'),'OWNER_STALE');
 assert.equal(b.api.reasonClass('rc_not_owned_or_invalid_frame'),'FRAME_REJECTED');
 b.api.record('native_failure',{route:'/api/rc/preview',httpStatus:423,reason:'FRAME_REJECTED',
   roundTripMs:2261,queueMs:14,bindMs:5,sendMs:7,responseWaitMs:2199,readMs:1,
   phase:'complete',ip:'192.168.4.1',token:'top-secret'});
 b.api.record('kit_status',{releaseReason:'ARMED_INPUT_TIMEOUT',lastReleaseAtMs:10420});
 assert.equal(b.events().at(-2).data.responseWaitMs,2199);
 assert.equal(b.events().at(-1).data.releaseReason,'ARMED_INPUT_TIMEOUT');
 for(const x of ['192.168.4.1','top-secret'])assert.ok(!b.api.exportData('json').includes(x));
 b.api.record('native_failure',{phase:'secret-device-info',reason:'secret'});
 assert.equal(b.events().at(-1).data.phase,undefined);
});
test('stalled Android RC preview is cancelled without relaxing the 500ms firmware watchdog',()=>{
 const controller=read('companion-flight.js'),link=read('companion-network.js');
 const native=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 const firmware=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(controller,/doStop\('ACK_TIMEOUT'\)/);
 assert.match(link,/function cancelPendingRcPreview\(\)/);
 assert.match(link,/native\?\.cancelRequest\?\.\(id\)/);
 assert.match(native,/stages\.put\("responseWaitMs"/);
 assert.match(firmware,/ZJ_RC_DEADMAN_MS=500/);
 assert.match(firmware,/zjRcLastReleaseReason/);
});
