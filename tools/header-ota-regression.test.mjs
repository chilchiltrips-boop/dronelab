import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),css=read('classroom-kits.css'),kit=read('js/classroom-kits.js'),updater=read('firmware-updater.js'),network=read('FlightCore_Firmware/FlightCoreNetwork.h');

test('header is two horizontal rows with real STA/AP network toggle and controller action',()=>{
 for(const id of ['kitTopNetworkSwitch','kitRcAccess','kitDiagnosticAccess','kitTopWifiConnect','kitTopConnect','kitTopStop','fwConnectStaBtn','fwConnectApBtn'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const handler of ['toggleHeaderNetwork','toggleHeaderControl','connectHeaderNetwork','applyMode','claim(\'WEB\')'])
  assert.ok(kit.includes(handler),handler);
 const header=read('v2-header.css');
 assert.match(header,/#app \.topbar-main\{[\s\S]*?flex-wrap:nowrap!important/);
 assert.match(header,/@media\(min-width:736px\)[^\n]*height:64px!important/);
 assert.ok(html.includes('id="workspaceFileMenu"'));
 assert.doesNotMatch(html,/<aside class="app-navigation"/);
 assert.doesNotMatch(html,/<details class="v2-workspace-tools"/);
 assert.ok(html.includes('id="kitTopRefresh"'));
});

test('network OTA is APP-only, verified for exact physical A1/A2 kit and never unlocks motor control',()=>{
 assert.match(html,/id="fwNetworkFlashBtn"/);
 assert.match(updater,/function networkFlashReadiness\(\)/);
 assert.match(updater,/fw\.type!=='app'/);
 assert.match(updater,/kit\.transport\.toUpperCase\(\)/);
 assert.match(updater,/validateEspImage\(fw\.bytes,fw\.boardId,'app'\)/);
 assert.match(kit,/async function uploadAppFirmware/);
 assert.match(kit,/\/api\/firmware\/begin/);
 assert.doesNotMatch(kit,/new XMLHttpRequest/);
 assert.match(kit,/pre\.kitId!==deviceId\|\|pre\.kitCode!==kitCode\|\|pre\.board!==boardId/);
 assert.match(kit,/pre\.rc\?\.claimed\|\|pre\.motorsArmed!==false/);
 assert.match(kit,/d\.kitId!==deviceId\|\|d\.kitCode!==kitCode\|\|d\.board!==boardId/);
 assert.match(network,/zjHttp\.on\("\/api\/ota",HTTP_POST/);
 assert.match(network,/legacy_ota_disabled_use_encrypted_session/);
 assert.doesNotMatch(network,/Update\.begin\(UPDATE_SIZE_UNKNOWN/);
 assert.match(read('FlightCore_Firmware/FlightCoreOta.h'),/zjSecureOtaAccess\(true\)/);
});
test('network OTA UI excludes USB/relay and does not claim success without runtime version verification',()=>{
 assert.match(updater,/!\['sta','ap'\]\.includes\(device\.transport\)/);
 assert.match(updater,/device\.otaAuthorized!==true/);
 assert.match(kit,/while\(Date\.now\(\)<deadline\)/);
 assert.match(kit,/written:true,verified:false/);
 assert.match(updater,/OTA ACK • RECONNECT PENDING/);
 assert.match(updater,/NETWORK OTA INTERRUPTED \/ UNCONFIRMED/);
});

test('header network switch changes physical Wi-Fi mode and never claims physical motor arming',()=>{
 assert.match(kit,/headerNetworkChoice==='ap'/);
 assert.match(kit,/return switchKitNetworkMode\(mode\)/);
 assert.doesNotMatch(html,/id="kitTopControl"/);
 assert.match(html,/id="kitRcAccess"/);
 assert.match(html,/id="kitDiagnosticAccess"/);
 assert.match(html,/id="fwKitTakeControl"[^>]*>Use WebApp RC/);
 assert.ok(html.indexOf('id="kitTopStop"')>html.indexOf('id="tab-settings"'),'Emergency stop is not occupying the header');
 assert.ok(html.includes('id="webappVersion"')&&html.indexOf('id="webappVersion"')<html.indexOf('id="kitTopStatus"'));
 assert.match(kit,/await claim\('WEB'\)/);
 assert.match(kit,/if\(\$\('kitHardwareTarget'\)\)\$\('kitHardwareTarget'\)\.checked=true/);
 assert.match(kit,/APP-only OTA/);
 assert.doesNotMatch(kit,/ledcWrite\(/);
});

test('OTA locks polling before its first request and tolerates longer flash writes',()=>{
 const auth=read('js/kit-auth.js');
 assert.match(auth,/firmwareWrite\?20000:4200/);
 assert.match(auth,/timedOut=true;control.abort\(\)/);
 const begin=kit.indexOf('async function uploadAppFirmware');
 const pre=kit.indexOf("const pre=await wifiDirect(ip,key,'/api/status')",begin);
 const lock=kit.indexOf('state.working=true;otaActive=true;render();',begin);
 assert.ok(begin>=0&&lock>begin&&lock<pre,'prevent background status polling before preflight');
 assert.match(kit,/if\(ticket!==reconnectTicket\|\|state.working\)return/);
 assert.match(updater,/no confirmed write ACK/);
});

test('firmware target matches safe screenshot-style OTA/USB workflow',()=>{
 for(const p of ['index.html','lab.html']){
  const h=read(p);
  for(const id of ['fwCheckKitBtn','fwConnectUsbBtn','fwUpgradeModeBtn','fwUpgradeEraseModeBtn','fwUsbManualBoot','fwEraseUsb','fwNetworkFlashBtn','fwUsbFlashBtn'])
   assert.ok(h.includes('id="'+id+'"'),p+' '+id);
  assert.ok(h.indexOf('id="fwNetworkFlashBtn"')<h.indexOf('id="fwUsbFlashBtn"'));
  assert.match(h,/Online Kit OTA/);assert.match(h,/USB Web Serial/);
 }
 assert.match(read('firmware.css'),/fw-target-choices/);
 assert.match(updater,/function selectUpgradeMode\(factory\)/);
 assert.match(updater,/if\(erase&&type!=='factory'\)/);
 assert.match(updater,/fwCheckKitBtn.*refreshKit/);
});

test('during a real OTA, kit status reports updating instead of false offline or online',()=>{
 assert.match(kit,/otaActive\?\(state.connected\?'OTA UPLOADING':'OTA RECONNECTING'\)/);
 assert.match(kit,/otaActive\?'Firmware update/);
 assert.match(kit,/if\(otaActive\)return discoveredKits/);
 assert.match(kit,/otaInProgress:otaActive/);
 assert.match(kit,/state.working=true;otaActive=true;render\(\)/);
});

test('firmware source and target are side by side on desktop and monitor remains full width',()=>{
 for(const page of ['index.html','lab.html']){
  const html=read(page);
  const source=html.indexOf('class="form-card firmware-source-card"');
  const target=html.indexOf('class="form-card firmware-target-card firmware-target-v2"');
  const monitor=html.indexOf('class="form-card firmware-control-card"');
  assert.ok(source>=0&&source<target&&target<monitor,'preserve three firmware steps in desktop reading order');
 }
 const css=read('firmware.css');
 assert.match(css,/@media\(min-width:1180px\)\{\s*\.firmware-page \.firmware-grid\{grid-template-columns:minmax\(0,1\.16fr\) minmax\(0,\.84fr\)\}/);
 assert.match(css,/\.firmware-page \.firmware-grid>\.firmware-control-card\{grid-column:1\/-1/);
 assert.match(css,/@media\(max-width:1179px\)/);
 assert.match(css,/\.firmware-page \.firmware-target-v2 \.firmware-target-option\{[\s\S]*?min-height:57px/);
 assert.doesNotMatch(css,/Full-width firmware steps:/);
});

test('OTA and USB target modes use accessible, mutually exclusive panels',()=>{
 for(const path of ['index.html','lab.html']){
  const html=read(path);
  for(const id of ['fwTargetWifiTab','fwTargetUsbTab','fwTargetWifiPanel','fwTargetUsbPanel'])
   assert.equal(html.split('id="'+id+'"').length-1,1,path+' '+id);
  assert.match(html,/id="fwTargetWifiTab"[^>]*aria-selected="true"[^>]*aria-controls="fwTargetWifiPanel"/);
  assert.match(html,/id="fwTargetUsbTab"[^>]*aria-selected="false"[^>]*aria-controls="fwTargetUsbPanel"/);
  assert.match(html,/id="fwTargetUsbPanel"[^>]*hidden/);
  const wifi=html.slice(html.indexOf('id="fwTargetWifiPanel"'),html.indexOf('id="fwTargetUsbPanel"'));
  const usb=html.slice(html.indexOf('id="fwTargetUsbPanel"'),html.indexOf('class="fw-target-advanced"'));
  for(const id of ['fwCheckKitBtn','fwNetworkFlashBtn'])assert.ok(wifi.includes('id="'+id+'"'));
  for(const id of ['fwConnectUsbBtn','fwUsbManualBoot','fwEraseUsb','fwUpgradeModeBtn','fwUpgradeEraseModeBtn','fwUsbFlashBtn'])
   assert.ok(usb.includes('id="'+id+'"'));
  assert.ok(!wifi.includes('id="fwEraseUsb"'));
  assert.ok(html.indexOf('class="firmware-source-card"')<html.indexOf('id="fwTargetWifiPanel"'));
  assert.ok(html.indexOf('class="form-card firmware-control-card"')>html.indexOf('id="fwTargetUsbPanel"'));
 }
 assert.match(read('devices-workspace.css'),/\.fw-method-panel\[hidden\]\{display:none!important\}/);
 assert.match(read('devices-workspace.css'),/\.firmware-grid>\.firmware-control-card\{grid-column:1\/-1\}/);
 assert.match(updater,/function setFirmwareTargetMethod\(method,focus=false\)/);
 assert.match(updater,/tab\.addEventListener\('keydown'/);
 assert.match(updater,/if\(factory&&\$\('\.fw-usb-recovery'\)\)/);
});
