import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('companion-network.js'),bridge=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java'),activity=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java'),html=read('companion.html'),network=read('FlightCore_Firmware/FlightCoreNetwork.h'),kit=read('js/classroom-kits.js');
test('Android teacher OTA is signed AES-GCM/HMAC admin session with exact published SHA-256 APP and physical board',()=>{
 for(const token of ["ZebjusKitAuth.open(nativeTransport,id,credential,'admin')","/api/firmware/begin","/api/firmware/chunk","/api/firmware/end","/api/firmware/abort","firmware-catalog.json","ZfcCrypto.sha256(bytes)","pre.rc?.claimed","pre.bootId","appElfSha256","expectedBuild","kitOtaAdminKey"])assert.ok(client.includes(token),token);
 assert.match(client,/const chunkSize=Number\(pre\.otaChunkMaxBytes\)>=2048\?2048:/);
 assert.match(client,/ack\.kitId!==id\|\|ack\.offset!==offset\+chunk\.length/);
 assert.match(client,/result\.version/);
 assert.doesNotMatch(client,/native\.pickAppFirmware\(/);
 assert.match(html,/id="kitOtaFile"[^>]+type="file"|id="kitOtaFile" type="file"/);
 assert.match(html,/id="kitOtaAdminKey"/);
});
test('native Android blocks raw-key methods and only allows explicit encrypted chunk routes',()=>{
 for(const path of ['/api/firmware/begin','/api/firmware/chunk','/api/firmware/end','/api/firmware/abort'])assert.ok(bridge.includes('route.equals("'+path+'")'));
 assert.match(bridge,/Legacy raw-key requests are disabled/);
 assert.match(bridge,/route\.startsWith\("\/api\/firmware\/"\)\?8800:2500/);
 assert.doesNotMatch(bridge,/multipart\/form-data/);
 assert.doesNotMatch(bridge,/pickAppFirmware/);
 assert.match(activity,/onShowFileChooser/);
 assert.match(activity,/pendingFirmwareFilePicker/);
 assert.match(activity,/SECURE_OTA_FILE_PICKER/);
});
test('old privileged bearer header cannot bypass scoped encrypted sessions',()=>{
 const enrollment=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 const ota=read('FlightCore_Firmware/FlightCoreOta.h');
 assert.match(enrollment,/if\(zjHttp\.header\("X-ZJ-Key"\)\.length\(\)\)return false/);
 assert.doesNotMatch(enrollment,/zjEqual\(provided,zjNetKey\)/);
 assert.match(enrollment,/zjHttp\.header\("X-ZJ-Session"\)/);
 assert.match(enrollment,/zjHttp\.header\("X-ZJ-Proof"\)/);
 assert.match(enrollment,/mbedtls_gcm_auth_decrypt/);
 assert.match(network,/Access-Control-Allow-Headers","X-ZJ-Device,/);
 assert.doesNotMatch(network,/Access-Control-Allow-Headers","X-ZJ-Key,/);
 assert.match(ota,/zjRequestSession<0\|\|!zjSessions\[zjRequestSession\]\.admin/);
 assert.match(bridge,/if\(publicRoute&&headers\.length\(\)!=0\)/);
 assert.match(bridge,/!headers\.has\("X-ZJ-Proof"\)/);
 assert.match(bridge,/form\.matches\("payload=\[a-fA-F0-9\]\{56,8704\}"\)/);
 assert.doesNotMatch(bridge,/connection\.setRequestProperty\("X-ZJ-Key"/);
});
test('legacy raw-key multipart firmware endpoint cannot write flash on new FlightCore',()=>{
 assert.match(network,/legacy_ota_disabled_use_encrypted_session/);
 const segment=network.slice(network.indexOf('zjHttp.on("/api/ota"'),network.indexOf('zjHttp.on("/api/reboot"'));
 assert.doesNotMatch(segment,/Update\.(?:begin|write|end)/);
 assert.match(kit,/Legacy raw-key multipart OTA is disabled/);
 assert.doesNotMatch(kit,/new XMLHttpRequest/);
});
