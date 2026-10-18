import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/kit-ack-diagnostics.js');
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
 assert.match(read('mobile-android/app/build.gradle'),/versionCode 39\s*versionName '1\.8\.1-udp-arm-start'/);
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
test('stalled Android RC preview is cancelled without relaxing the 350ms firmware watchdog',()=>{
 const controller=read('companion-flight.js'),link=read('companion-network.js');
 const native=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 const firmware=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(controller,/doStop\('ACK_TIMEOUT'\)/);
 assert.match(link,/function cancelPendingRcPreview\(\)/);
 assert.match(link,/native\?\.cancelRequest\?\.\(id\)/);
 assert.match(native,/stages\.put\("responseWaitMs"/);
 assert.match(firmware,/ZJ_RC_DEADMAN_MS=350/);
 assert.match(firmware,/zjRcLastReleaseReason/);
});
