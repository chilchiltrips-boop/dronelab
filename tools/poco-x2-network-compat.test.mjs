import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bridge=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
const instrument=read('mobile-android/app/src/androidTest/java/in/zebjus/dronelab/companion/FlightTouchInstrumentation.java');
const release=read('.github/workflows/build-qr-android.yml');

test('UDP responses stay bounded and retained stream reads remain API26 compatible',()=>{
 assert.doesNotMatch(bridge,/\.readNBytes\(|\.readAllBytes\(|\.transferTo\(/,
  'InputStream.readNBytes is Android API 33 and crashes an Android 11/12 native thread');
 assert.match(bridge,/static byte\[\] readBoundedResponse\(InputStream source,int maxBytes\)/);
 assert.match(bridge,/int n=source\.read\(buffer,0,Math\.min\(buffer\.length,maxBytes-bytes\.size\(\)\)\)/);
 assert.match(bridge,/if\(maxBytes<0\|\|maxBytes>16000\)/);
 assert.doesNotMatch(bridge,/HttpURLConnection|openConnection/);
 const rpc=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpRpc.java');
 assert.match(rpc,/RESPONSE_MAX=16000/);
 assert.match(rpc,/size>RESPONSE_MAX/);
});
test('POCO X2 API30 emulator must pass BEFORE the signed release can publish',()=>{
 assert.match(instrument,/legacyReaderOnly/);
 assert.match(instrument,/awaitCurrentWeb\(\)/);
 assert.match(instrument,/FlightCoreNativeBridge\.readBoundedResponse\(new ByteArrayInputStream\(tiny\),16000\)/);
 assert.match(instrument,/decoded\.length!=16000/);
 assert.match(release,/legacy_api30:\s*name: POCO X2 legacy Android API 30 networking/);
 assert.match(release,/api-level: 30/);
 assert.match(release,/PASS API30 network response compatibility/);
 assert.match(release,/script: \|\s*# android-emulator-runner runs inline scripts with \/bin\/sh\.[\s\S]*?set -eu\s*adb wait-for-device/);
 assert.match(release,/needs: \[android, native_touch, legacy_api30\]/);
 assert.match(read('mobile-android/app/build.gradle'),/versionCode 56\s*versionName '1\.8\.18-radio-input-handover'/);
});
