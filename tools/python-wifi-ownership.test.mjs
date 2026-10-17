import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Python hardware networking is bound to actual verified AP/STA transport without acquiring Android RC ownership',()=>{
 const p=read('js/python-lab.js'),k=read('js/classroom-kits.js');
 assert.match(p,/kitData\(\)\?\.matchesTarget\(kit,target\)/);
 assert.doesNotMatch(p,/!kit\.owner\|\|kit\.rcSource!=='WEB'/);
 assert.match(p,/readJoystick\(\)/);
 assert.match(p,/window\.ZebjusPythonHardwareActive=false/);
 assert.match(k,/const pythonActive=.*ZebjusPythonHardwareActive===true/);
 assert.match(k,/throttle:1000,axes:\{roll:0,pitch:0,yaw:0\},armed:false/);
});
test('Python Wi-Fi scan and provisioning use authenticated safe allowlisted requests',()=>{
 const w=read('python-lab-worker.js'),n=read('js/network-lab.js'),p=read('js/python-lab.js');
 assert.match(w,/wifiScan:\(\)=>rpc\('wifi_scan'\)/);
 assert.match(w,/wifiTestSave:\(ssid,password\)=>rpc\('wifi_test_save'/);
 assert.match(w,/async def wifi_scan\(self\)/);
 assert.match(w,/async def wifi_test_save\(self, ssid, password\)/);
 assert.match(p,/pythonWifiScan\(\)/);
 assert.match(p,/pythonWifiTestSave\(m\.args\?\.ssid,m\.args\?\.password\)/);
 assert.match(n,/request\('\/api\/wifi\/scan'\)/);
 assert.match(n,/request\('\/api\/wifi\/test','POST'/);
 assert.match(n,/if\(kit\.rc\?\.claimed\)throw Error/);
 assert.match(n,/if\(!kit\.setupAuthorized\)throw Error/);
 assert.match(n,/state\.wifiTestState==='saved'/);
 assert.match(n,/state:'unverified'/);
});
test('USB flash log also receives sanitized Wi-Fi mode, save and failure messages',()=>{
 const kit=read('js/classroom-kits.js'),fw=read('firmware-updater.js'),page=read('index.html');
 assert.match(kit,/dronelab:kit-network-event/);
 assert.match(fw,/addEventListener\('dronelab:kit-network-event'/);
 assert.match(fw,/\[KIT NETWORK\]/);
 assert.match(page,/Private Device Access Key/);
 assert.match(page,/value="wifi_scan"/);
 assert.match(page,/value="wifi_save"/);
});
