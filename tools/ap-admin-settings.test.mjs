import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const fw=file('FlightCore_Firmware/FlightCoreClassroom.h');
const network=file('FlightCore_Firmware/FlightCoreNetwork.h');
const ui=file('js/classroom-kits.js');
const monitor=file('firmware-updater.js');

test('Kit AP defaults are optional, persisted, and reset without deleting STA, pairing, or teacher passphrase',()=>{
 assert.match(fw,/ZJ_DEFAULT_AP_PASS="12345678"/);
 assert.match(fw,/zjEffectiveApSsid\(\)/);
 assert.match(network,/zjApPass=zjEffectiveApPassword\(\)/);
 assert.match(network,/zjApSsid=zjEffectiveApSsid\(\)/);
 const reset=fw.split('if(!strcmp(line,"ZJADMIN,AP_RESET,CONFIRM")){')[1]?.split('if(!strcmp(line,"ZJADMIN,AP_APPLY,CONFIRM")){')[0];
 assert.ok(reset,'specific AP reset command exists');
 assert.match(reset,/zjKitPrefs\.remove\("apName"\)/);
 assert.match(reset,/zjKitPrefs\.remove\("apPass"\)/);
 assert.doesNotMatch(reset,/(?:clear\(|remove\("(?:name|adminHash|code|label|key|ssid|pass|profiles)"\))/);
 assert.match(reset,/zjAdminApRestartAt=millis\(\)\+1500/);
 assert.match(network,/!zjSecureOtaActive&&!zjOtaAuthorized&&!zjNetTesting&&!zjUsbScanning&&!zjRcOwned/);
});
test('USB teacher-unlocked credential read is not a public Wi-Fi endpoint',()=>{
 const start=fw.indexOf('static bool zjAdminSerialCommand(char* line)');
 const gate=fw.indexOf('if(!zjAdminAuthorized())',start);
 const reveal=fw.indexOf('if(!strcmp(line,"ZJADMIN,AP_SHOW"))',start);
 assert.ok(gate>start&&reveal>gate,'AP read occurs after teacher unlock guard');
 assert.match(fw,/ZJADMIN,AP_CREDENTIALS,/);
 assert.doesNotMatch(network,/zjHttp\.on\("\/api\/(?:ap|admin)\/.*credentials/);
 assert.match(monitor,/if\(\/\^ZJADMIN,AP_CREDENTIALS,\/\.test\(line\)\)return '\[USB ADMIN\]/);
 assert.match(ui,/waitSerial\(\/\^ZJADMIN,AP_CREDENTIALS,/);
 assert.match(ui,/apRevealTimer=setTimeout\(hideAdminApCredentials,30000\)/);
});
test('both entry pages wire the same teacher security UI and cache versions',()=>{
 const entry=file('index.html'),lab=file('lab.html'),sw=file('sw.js');
 assert.equal(entry,lab);
 for(const id of ['kitAdminCurrentSsid','kitAdminCurrentPass','kitAdminReadAp','kitAdminShowPass','kitAdminResetAp','kitAdminApMessage'])
  assert.ok(entry.includes('id="'+id+'"'),id);
 for(const id of ['kitAdminReadAp','kitAdminResetAp'])
  assert.ok(ui.includes("guardAction('"+id+"'"),id);
 for(const source of [entry,sw]){
  assert.match(source,/classroom-kits\.js\?v=kit-transport-unified-20261017/);
  assert.match(source,/firmware-updater\.js\?v=combined-usb-20261017/);
 }
 assert.match(ui,/hideAdminApCredentials\(\)/);
});
