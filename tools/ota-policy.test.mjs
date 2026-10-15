import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const context={};vm.runInNewContext(read('js/kit-network-policy.js'),context);
const policy=context.ZebjusKitNetworkPolicy;
test('Selected authenticated Wi-Fi Kit wins over an unrelated connected USB board and manual profile',()=>{
 const target=policy.otaTarget({method:'wifi',
  kit:{connected:true,transport:'sta',kitId:'ZFC-A2-012345ABCDEF',board:'ZFC-A2'},
  usbBoard:'ZFC-A1',manualBoard:'ZFC-A1',defaultBoard:'ZFC-A1'});
 assert.equal(target.boardId,'ZFC-A2');assert.equal(target.kitId,'ZFC-A2-012345ABCDEF');
 assert.equal(policy.otaTarget({method:'usb',usbBoard:'ZFC-A1',manualBoard:'ZFC-A2'}).boardId,'ZFC-A1');
 assert.equal(policy.otaTarget({method:'wifi',kit:{connected:true,transport:'sta',kitId:'ZFC-A1-012345ABCDEF',board:'ZFC-A2'},usbBoard:'ZFC-A1'}).kitId,'');
});
test('Network connection failures retry but invalid identity and access cannot loop',()=>{
 assert.equal(policy.retryDisposition({status:401,message:'expired'}).retry,false);
 assert.equal(policy.retryDisposition('Device ID changed').retry,false);
 assert.equal(policy.retryDisposition('Board mismatch').retry,false);
 assert.equal(policy.retryDisposition('connection timed out').retry,true);
 assert.equal(policy.retryDisposition({status:429,message:'rate limited'}).delayMs,30000);
 assert.ok(policy.requestTimeout('/api/firmware/chunk','POST','ap')>policy.requestTimeout('/api/firmware/chunk','POST','sta'));
 assert.ok(policy.requestTimeout('/api/firmware/chunk','POST','sta')>policy.requestTimeout('/api/status','GET','sta'));
});
test('OTA authenticated envelope expansion is scoped and Android native has matching bounds',()=>{
 const enroll=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 const ota=read('FlightCore_Firmware/FlightCoreOta.h'),status=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const android=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 assert.match(enroll,/ZJ_AUTH_PAYLOAD_HEX_MAX=8704/);
 assert.match(enroll,/ZJ_AUTH_STANDARD_PAYLOAD_HEX_MAX=4352/);
 assert.match(enroll,/s\.admin&&zjHttp\.method\(\)==HTTP_POST&&zjHttp\.uri\(\)=="\/api\/firmware\/chunk"/);
 assert.match(enroll,/!otaChunk&&payload\.length\(\)>ZJ_AUTH_STANDARD_PAYLOAD_HEX_MAX/);
 assert.match(ota,/ZJ_OTA_CHUNK_MAX_BYTES=2048/);
 assert.match(status,/otaChunkMaxBytes\\":2048/);
 assert.match(android,/payload=\[a-fA-F0-9\]\{56,8704\}/);
 assert.match(android,/\?8800:2500/);
});
test('Preferred saved Wi-Fi first with bounded reason-aware STA retries',()=>{
 const wifi=read('FlightCore_Firmware/FlightCoreWifiPolicy.h');
 const profiles=read('FlightCore_Firmware/FlightCoreWifiProfiles.h');
 const retry=read('FlightCore_Firmware/FlightCoreWifiRetryPolicy.h');
 assert.match(profiles,/next\[0\]=\{ssid,pass\}/);
 assert.match(wifi,/zjWifiAttemptIndex=0;zjWifiTried=0/);
 assert.match(wifi,/zjSavedAttemptTimeoutMs\(zjStaDisconnectReason\)/);
 assert.match(wifi,/zjSavedRetryDelayMs\(zjStaDisconnectReason\)/);
 assert.match(retry,/reason==201/);assert.match(retry,/reason==202/);
});
test('Service Worker does not pre-download factory images and plotting/CV wheels',()=>{
 const sw=read('sw.js');
 assert.match(sw,/const essential=core\.filter/);
 assert.match(sw,/kind==='app'&&image\?\.available/);
 assert.match(sw,/vendor\\\/pyodide/);
});
