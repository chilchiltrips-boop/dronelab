import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),css=read('classroom-kits.css'),kit=read('js/classroom-kits.js'),updater=read('firmware-updater.js'),network=read('FlightCore_Firmware/FlightCoreNetwork.h');

test('header is one horizontal row with real STA/AP network toggle and controller action',()=>{
 for(const id of ['kitTopNetworkSwitch','kitTopControl','kitTopWifiConnect','kitTopConnect','kitTopStop','fwConnectStaBtn','fwConnectApBtn'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const handler of ['toggleHeaderNetwork','toggleHeaderControl','connectHeaderNetwork','applyMode','claim(\'WEB\')'])
  assert.ok(kit.includes(handler),handler);
 assert.match(css,/#app \.topbar-main\{[\s\S]*?flex-wrap:nowrap!important/);
 assert.match(css,/height:82px!important/);
 assert.match(read('v2-header.css'),/grid-template-columns/);
 assert.ok(html.includes('id="kitTopRefresh"'));
});

test('network OTA is APP-only, verified for exact physical A1/A2 kit and never unlocks motor control',()=>{
 assert.match(html,/id="fwNetworkFlashBtn"/);
 assert.match(updater,/function networkFlashReadiness\(\)/);
 assert.match(updater,/fw\.type!=='app'/);
 assert.match(updater,/kit\.transport\.toUpperCase\(\)/);
 assert.match(updater,/validateEspImage\(fw\.bytes,fw\.boardId,'app'\)/);
 assert.match(kit,/async function uploadAppFirmware/);
 assert.match(kit,/pre\.kitId!==deviceId\|\|pre\.kitCode!==kitCode\|\|pre\.board!==boardId/);
 assert.match(kit,/pre\.rc\?\.claimed\|\|pre\.motorsArmed!==false/);
 assert.match(kit,/req\.setRequestHeader\('X-ZJ-Key',key\)/);
 assert.match(kit,/body\.append\('firmware'/);
 assert.match(kit,/d\.kitId!==deviceId\|\|d\.kitCode!==kitCode\|\|d\.board!==boardId/);
 assert.match(network,/zjHttp\.on\("\/api\/ota",HTTP_POST/);
 assert.match(network,/if\(u\.currentSize<24\|\|u\.buf\[0\]!=0xe9/);
 assert.match(network,/zjOtaAuthorized=zjAuthenticated\(\)/);
});
test('network OTA UI excludes USB/relay and does not claim success without runtime version verification',()=>{
 assert.match(updater,/!\['sta','ap'\]\.includes\(device\.transport\)/);
 assert.match(updater,/device\.otaAuthorized!==true/);
 assert.match(kit,/while\(Date\.now\(\)<deadline\)/);
 assert.match(kit,/written:true,verified:false/);
 assert.match(updater,/OTA ACK • RECONNECT PENDING/);
 assert.match(updater,/NETWORK OTA FAILED \/ UNCONFIRMED/);
});

test('header network switch changes physical Wi-Fi mode and never claims physical motor arming',()=>{
 assert.match(kit,/headerNetworkChoice==='ap'/);
 assert.match(kit,/return switchKitNetworkMode\(mode\)/);
 assert.match(html,/id="kitTopControl"[^>]*role="switch"/);
 assert.match(html,/id="kitTopControlLabel"/);
 assert.ok(html.indexOf('id="kitTopStop"')>html.indexOf('id="tab-settings"'),'Emergency stop is not occupying the header');
 assert.ok(html.includes('id="webappVersion"')&&html.indexOf('id="webappVersion"')<html.indexOf('id="kitTopStatus"'));
 assert.match(kit,/await claim\('WEB'\)/);
 assert.match(kit,/if\(\$\('kitHardwareTarget'\)\)\$\('kitHardwareTarget'\)\.checked=true/);
 assert.match(kit,/APP-only OTA/);
 assert.doesNotMatch(kit,/ledcWrite\(/);
});
