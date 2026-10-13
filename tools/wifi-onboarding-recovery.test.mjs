import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
const admin=read('FlightCore_Firmware/FlightCoreClassroom.h');
const ino=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
const kits=read('js/classroom-kits.js');
const page=read('index.html');
const native=read('companion-network.js');
const cockpit=read('companion-flight.js');
test('AUTO retains AP; STA-only explicitly disables hotspot',()=>{
 assert.match(ino,/FW_VERSION="1\.4\.4"/);
 assert.match(fw,/if\(zjMode=="sta"&&WiFi\.status\(\)==WL_CONNECTED\)/);
 assert.match(fw,/zjMode="auto";zjPrefs\.putString\("mode","auto"\);zjNetApOffAt=0;zjEnsureAP\(\)/);
 assert.match(fw,/zjNetApOffAt=mode=="sta"/);
 assert.match(fw,/ZJNET,AP,/);
 assert.match(fw,/apActive/);
 assert.match(fw,/requestTransport/);
});
test('First-time STA onboarding can be done over verified USB, with asynchronous scan and save on success',()=>{
 for(const cmd of ['ZJNET,GET','ZJNET,SCAN','ZJNET,TEST,','ZJNET,MODE,','ZJNET,TEST,SAVED','ZJNET,SCAN,COUNT','ZJNET,SCAN,ITEM','ZJNET,SCAN,END'])
  assert.ok(fw.includes(cmd),cmd);
 assert.match(ino,/if\(zjNetSerialCommand\(line\)\)return;/);
 for(const id of ['kitWifiScan','kitWifiNetworks','kitWifiStatus','fwOpenKitNetwork'])
  assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(kits,/async function scanWifi\(/);
 assert.match(kits,/async function wifiSave\(/);
 assert.match(kits,/async function applyMode\(/);
 assert.match(kits,/USB kit auto-verified/);
 assert.match(read('firmware-updater.js'),/ZJKIT,GET/);
 assert.match(read('firmware-updater.js'),/ZJNET,GET/);
});
test('Controller preview accepts verified AP or STA transport, separately from WebRTC, and drops virtual ARM',()=>{
 assert.match(native,/data\.requestTransport===link\.toUpperCase\(\)/);
 assert.match(native,/link==='ap'\?data\.apActive===true:data\.staConnected===true/);
 assert.match(native,/onKitLink/);
 assert.doesNotMatch(native,/onKitAp=!data\.staConnected/);
 assert.match(native,/seq:\+\+rcSeq/);
 assert.match(cockpit,/previewControls\?\.\(diagnosticInput\(\)\)/);
 assert.match(cockpit,/let diagnosticThrottle=1000/);
 assert.doesNotMatch(cockpit,/previewControls\?\.\(\{seq:\+\+seq,throttle/);
 assert.match(kits,/\.\.\.frame,armed:false/);
 assert.match(kits,/throttle:1000,axes:\{roll:0,pitch:0,yaw:0\},armed:false/);
 assert.match(fw,/hardware_arming_disabled/);
});
test('Teacher admin authorization is enforced on device, not just CSS/JS',()=>{
 assert.match(admin,/mbedtls_sha256/);
 assert.match(admin,/ZJADMIN,ENROLL,/);
 assert.match(admin,/ZJADMIN,UNLOCK,/);
 assert.match(admin,/ZJADMIN,ERR,ADMIN_LOCKED/);
 assert.match(admin,/if\(!zjAdminAuthorized\(\)\)/);
 assert.match(admin,/zjAdminFailures>=3/);
 assert.match(page,/id="kitAdminSecret"/);
 assert.match(kits,/function adminAccess\(/);
 assert.match(kits,/adminUnlockedUntil/);
 assert.doesNotMatch(admin,/static const char\*.*DEFAULT_ADMIN_PASSWORD/);
});
test('Python status distinguishes direct network and Android relay, network diagnostics does not impersonate USB',()=>{
 assert.match(read('js/python-lab.js'),/Direct '\+transport\.toUpperCase\(\)/);
 assert.match(page,/id="kitNetworkMonitor"/);
 assert.match(kits,/Network telemetry is a remote readout/);
 assert.match(kits,/Network mode:/);
});
