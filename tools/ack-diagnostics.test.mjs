import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/kit-ack-diagnostics.js');
test('motor diagnostics retain stop reasons and pulse ACKs without tokens or unstructured errors',()=>{
 const b=bench('web');
 b.api.record('motor_ack',{route:'/api/motor',transport:'ap',motorAction:'SLIDE',motorMode:'DISABLED',motorReason:'CONTROL_LOST',pulseM1:0,pulseM2:0,pulseM3:0,pulseM4:0,sliderMask:1,sessionRemainingMs:0,commandSequence:81,roundTripMs:790,session:'PRIVATE_TOKEN',kitId:'PRIVATE_DEVICE'});
 const event=b.events().at(-1);assert.equal(event.event,'motor_ack');assert.equal(event.data.motorReason,'CONTROL_LOST');assert.equal(event.data.commandSequence,81);assert.equal(event.data.route,'/api/motor');
 b.api.record('motor_error',{motorAction:'PRIVATE_TOKEN',motorMode:'PRIVATE_MODE',motorReason:'PRIVATE_ERROR'});
 assert.deepEqual(b.events().at(-1).data,{});
 const exported=b.api.exportData('csv');for(const secret of ['PRIVATE_TOKEN','PRIVATE_DEVICE','PRIVATE_MODE','PRIVATE_ERROR'])assert.ok(!exported.includes(secret));
 assert.equal(b.api.reasonClass(Object.assign(Error('original Kit heartbeat is delayed; authenticated re-verification is required'),{code:'KIT_DELAYED'})),'TIMEOUT');
});
test('Wizard diagnostics retain typed calibration, board-save and queue evidence without request secrets',()=>{
 const b=bench('web');
 for(const action of ['CAL_SLIDER','WIZARD_BEGIN','WIZARD_STATUS','WIZARD_SAVE_PAGE','WIZARD_AUTO_ESC_PREPARE','WIZARD_AUTO_ESC_CANCEL','WIZARD_AUTO_ESC_RETRY']){
  b.api.record('motor_ack',{motorAction:action,motorMode:'DISABLED',motorReason:'NONE',queueMs:251,responseWaitMs:917,
   savedMinimumM1:1087,savedMinimumM2:0,savedMinimumM3:0,savedMinimumM4:0,stoppedSlider:true,stoppedMask:1,stoppedPulseUs:1087,
   configRevision:7,configVerified:true,calibrationSlideKeepsSession:true,wizardSaveScope:'M1',
   autoEscState:'SEQUENCE_COMPLETE',autoEscPhase:'OFF',autoEscReason:'NONE',autoEscResultPersisted:true,autoEscSequenceReady:true,
   autoEscCompatible:true,autoEscOutputsOff:true,autoEscResultSource:'CONTROLLER_SEQUENCE_ONLY',escCalibrationSaved:false,escAcceptanceVerified:false,
   session:'PRIVATE_TOKEN',kitId:'PRIVATE_KIT',bootId:'PRIVATE_BOOT',payload:'PRIVATE_PAYLOAD',attemptId:'PRIVATE_ATTEMPT'});
  const data=b.events().at(-1).data;
  assert.equal(data.motorAction,action);assert.equal(data.savedMinimumM1,1087);assert.equal(data.savedMinimumM2,0);
  assert.equal(data.stoppedPulseUs,1087);assert.equal(data.configVerified,true);assert.equal(data.escCalibrationSaved,false);
  assert.equal(data.autoEscState,'SEQUENCE_COMPLETE');assert.equal(data.autoEscResultPersisted,true);assert.equal(data.escAcceptanceVerified,false);
  assert.equal(data.queueMs,251);assert.equal(data.responseWaitMs,917);
 }
 b.api.record('motor_error',{wizardSaveScope:'PRIVATE_SCOPE',autoEscState:'PRIVATE_STATE',autoEscReason:'PRIVATE_REASON',
  autoEscResultSource:'PRIVATE_SOURCE',savedMinimumM1:2500,autoEscOutputsOff:'PRIVATE_VALUE'});
 assert.deepEqual(b.events().at(-1).data,{});
 for(const format of ['csv','json'])for(const secret of ['PRIVATE_TOKEN','PRIVATE_KIT','PRIVATE_BOOT','PRIVATE_PAYLOAD','PRIVATE_ATTEMPT','PRIVATE_SCOPE','PRIVATE_STATE','PRIVATE_REASON','PRIVATE_SOURCE','PRIVATE_VALUE'])
  assert.equal(b.api.exportData(format).includes(secret),false,format+' excludes '+secret);
});
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
test('AP/STA handover diagnosis records exact PPM ARM blocker without IDs or Wi-Fi secrets',()=>{
 const b=bench('web');
 b.api.record('handover_preflight',{mode:'ap',source:'PPM',reason:'INPUT_UNSAFE',
  handoverBlocker:'RC_THROTTLE_HIGH',ppmPresent:true,ppmThrottleUs:1670,
  throttle:1670,inputArmed:true,handMotorDisabled:true,diagnosticArmReleased:false,
  ssid:'PRIVATE_SSID',kitId:'PRIVATE_DEVICE',password:'PRIVATE_PASSWORD'});
 let e=b.events().at(-1);assert.equal(e.event,'handover_preflight');
 assert.equal(e.data.handoverBlocker,'RC_THROTTLE_HIGH');
 assert.equal(e.data.ppmThrottleUs,1670);
 assert.equal(e.data.handMotorDisabled,true);
 b.api.record('handover_ack',{mode:'ap',source:'PPM',handoverBlocker:'NONE',
  diagnosticArmReleased:true,profileSaved:true,profileRevision:9});
 e=b.events().at(-1);assert.equal(e.data.diagnosticArmReleased,true);
 b.api.record('handover_state',{handoverBlocker:'MOTOR_OUTPUT_ACTIVE',
  handoverLastReject:'stop_motor_setup_first'});
 assert.equal(b.events().at(-1).data.handoverLastReject,'stop_motor_setup_first');
 b.api.record('handover_error',{handoverBlocker:'PRIVATE_SSID',handoverLastReject:'PRIVATE_PASSWORD'});
 assert.equal(b.events().at(-1).data.handoverBlocker,undefined);
 assert.equal(b.events().at(-1).data.handoverLastReject,undefined);
 for(const secret of ['PRIVATE_SSID','PRIVATE_DEVICE','PRIVATE_PASSWORD']){
  assert.ok(!b.api.exportData('csv').includes(secret));
  assert.ok(!b.api.exportData('json').includes(secret));
 }
 assert.equal(JSON.parse(b.api.exportData('json')).summary.handoverBlocker,'MOTOR_OUTPUT_ACTIVE');
});
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
 assert.match(read('mobile-android/app/build.gradle'),/versionCode \d+\s*versionName '\d+\.\d+\.\d+-[a-z0-9-]+'/ );
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


test('PPM capture and finite motor deadlines are exported without confusing completion with authentication',()=>{
 const b=bench();
 assert.equal(b.api.reasonClass('motor_session_expired_or_not_owner'),'OWNER_STALE');
 b.api.record('motor_ack',{motorAction:'SLIDE',motorMode:'DISABLED',motorReason:'TEST_FINISHED',motorPolicy:'TIMED_MANUAL',motorRemainingMs:0,ppmCaptureBackend:'RMT_RX',ppmCaptureHz:50,ppmCaptureErrors:0,token:'private-token'});
 const d=b.events().at(-1).data;assert.equal(d.motorReason,'TEST_FINISHED');assert.equal(d.ppmCaptureHz,50);assert.equal(d.ppmCaptureBackend,'RMT_RX');assert.equal(d.motorRemainingMs,0);
 assert.ok(!b.api.exportData('csv').includes('private-token'));
 b.api.record('motor_ack',{ppmCaptureBackend:'private-hostname',motorPolicy:'private-token',ppmCaptureHz:-1});
 assert.equal(b.events().at(-1).data.ppmCaptureBackend,undefined);
});

test('RX-loss disconnect is NETWORK; verified reboot and sticky STA evidence survive export without identifiers',()=>{
 for(const client of ['web','android']){
  const b=bench(client),kit={kitId:'PRIVATE_KIT',transport:'sta'};
  assert.equal(b.api.reasonClass('Wi-Fi link lost • automatic identity-checked reconnect'),'NETWORK');
  assert.equal(b.api.reasonClass('Device identity changed • verify the Kit again'),'IDENTITY');
  const status={kitId:kit.kitId,bootId:'a'.repeat(32),uptimeMs:210000,resetReasonCode:1,resetReason:'POWERON',
   staDisconnectCount:2,staLastDisconnectReason:200,staLastDisconnectAtMs:205000,
   flightModeState:{source:'PPM_CH5',active:'acro',requested:'acro',pending:null}};
  b.api.record('web_status',b.api.observeSystem(status,kit));
  b.api.observeSystem(status,kit);assert.equal(b.events().filter(e=>e.event==='boot_changed').length,0);
  b.api.record('web_status',b.api.observeSystem({...status,bootId:'b'.repeat(32),uptimeMs:1200,resetReasonCode:9,resetReason:'BROWNOUT'},kit));
  const data=b.events().find(e=>e.event==='boot_changed').data;
  assert.equal(data.bootEpoch,2);assert.equal(data.uptimeMs,1200);assert.equal(data.resetReason,'BROWNOUT');
  assert.equal(data.staLastDisconnectReason,200);assert.equal(data.staLastDisconnectAtMs,205000);
  assert.equal(data.flightMode,'acro');assert.equal(data.flightModeSource,'PPM_CH5');
  assert.equal(Object.keys(b.api.observeSystem({...status,kitId:'wrong'},kit)).length,0);
  b.api.record('boot_changed',{resetReason:'PRIVATE_REASON',uptimeMs:-1,bootEpoch:Infinity,staDisconnectCount:'secret',flightModeSource:'PRIVATE_MODE'});
  assert.deepEqual(b.events().at(-1).data,{});
  for(const format of ['csv','json'])for(const secret of ['PRIVATE_KIT','PRIVATE_REASON','PRIVATE_MODE','a'.repeat(32),'b'.repeat(32)])assert.ok(!b.api.exportData(format).includes(secret));
 }
});
