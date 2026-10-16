import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('My Kits is consolidated into one icon navigated Devices & Firmware tab',()=>{
 for(const path of ['index.html','lab.html']){
  const h=read(path);
  assert.ok(h.includes('data-tab="firmware" title="DEVICES &amp; FIRMWARE"'));
  assert.ok(!h.includes('data-tab="settings" title="MY KITS"'));
  assert.match(h,/id="devicesWorkspace"/);
  assert.match(h,/href="#dw-icon-wifi"/);
  for(const view of ['overview','connection','wifi','firmware','mobile','diagnostics','security'])
   for(const prefix of ['dw-panel-','dw-tab-'])assert.ok(h.includes('id="'+prefix+view+'"'),path+' '+prefix+view);
  for(const id of ['fwNetworkFlashBtn','fwUsbFlashBtn','kitWifiScan','kitWifiSave','kitSavedRefresh','kitAdmin','kitMobilePairDetails','connectionDialog','kitConnect'])
   assert.equal(h.split('id="'+id+'"').length-1,1,path+' '+id+' unique control');
  assert.match(h,/src=".\/js\/devices-workspace.js\?v=compact-scroll-header-20261016"/);
 }
});
test('existing controls are moved, never cloned, and keep their kit and WebRTC handlers',()=>{
 const source=read('js/devices-workspace.js');
 for(const selector of ['.firmware-grid','#kitNetworkSettings','#kitAdmin','#kitMobilePairDetails','#kitCenter','#fwSerialMonitorPane'])
  assert.ok(source.includes(selector),'preserved '+selector);
 assert.ok(source.includes('target.append(node)'));
 assert.match(read('pairing-web.js'),/ZebjusDevicesWorkspace\?\.open\('mobile'/);
 assert.match(read('js/classroom-kits.js'),/ZebjusDevicesWorkspace\?\.open\('connection'/);
 assert.match(read('js/firmware-connect.js'),/ZebjusDevicesWorkspace\?\.open\('wifi'/);
 assert.match(read('js/ui-controls.js'),/if\(name==='settings'\)/);
 assert.match(read('devices-workspace.css'),/grid-template-columns:210px minmax\(0,1fr\)/);
});

test('Devices & Firmware uses independent desktop scroll panes and sticky mobile navigation',()=>{
 const css=read('devices-workspace.css'),header=read('v2-header.css'),behavior=read('js/devices-workspace.js');
 assert.match(css,/#tab-firmware\.active\{[\s\S]*?display:flex;[\s\S]*?overflow:hidden/);
 assert.match(css,/#tab-firmware \.dw-shell\{[\s\S]*?height:var\(--dw-height/);
 assert.match(css,/#tab-firmware \.dw-nav-list\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#tab-firmware \.dw-view-content\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#tab-firmware #dw-body-overview\{[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/@media\(max-width:780px\)\{[\s\S]*?#tab-firmware \.dw-sidebar\{[\s\S]*?position:sticky/);
 assert.match(css,/#tab-firmware \.dw-nav-list\{[\s\S]*?overflow-x:auto/);
 assert.doesNotMatch(css,/\/\* Natural page scrolling: header, sidebar and Android download row move/);
 assert.match(header,/#app \.topbar\{position:relative!important;top:auto!important/);
 assert.doesNotMatch(behavior,/root\.scrollTo\(\{top:0/);
 assert.match(css,/#tab-firmware \.firmware-hero\{display:none!important\}/);
});

test('Overview control buttons are kept outside the scrollable identity card',()=>{
 const s=read('js/devices-workspace.js');
 const css=read('devices-workspace.css');
 assert.match(s,/const controlActions=\$\('fwKitTakeControl'\)\?\.closest\('\.fw-connect-actions'\)/);
 assert.match(s,/overview\.insertBefore\(controlActions,overviewContent\)/);
 assert.match(css,/#tab-firmware #dw-body-overview\{[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/#tab-firmware #dw-body-overview>\.fw-kit-detail-card\{[\s\S]*?overflow:visible!important/);
 assert.match(css,/#dw-panel-overview>\.dw-overview-actions/);
 assert.match(read('js/firmware-connect.js'),/bind\('fwKitTakeControl',\(\)=>kit\(\)\.toggleControl\(\)\)/);
});

test('Kit Connection and Firmware Flash use intrinsic-height scrollable rows',()=>{
 const css=read('devices-workspace.css');
 for(const section of ['connection','firmware']){
  assert.ok(css.includes('#tab-firmware #dw-panel-'+section+'>.dw-view-content'));
 }
 assert.match(css,/grid-auto-rows:max-content/);
 assert.match(css,/#tab-firmware #dw-body-connection \.fw-simple-steps>div\{[\s\S]*?height:auto/);
 assert.match(css,/#tab-firmware #dw-body-firmware \.firmware-drop-zone\{/);
 assert.match(css,/#tab-firmware #dw-body-firmware \.firmware-progress-wrap\{/);
 for(const file of ['index.html','lab.html']){
  const html=read(file);
  for(const name of ['Same Wi-Fi','Auto Discover','Verified Connect'])
   assert.ok(html.includes('<strong>'+name+'</strong>'),file+' '+name);
 }
});
test('USB Serial monitor buttons remain in one grouped responsive toolbar',()=>{
 const s=read('js/devices-workspace.js'),css=read('devices-workspace.css');
 assert.match(s,/serialToolbar\.prepend\(serialHeader\)/);
 assert.match(s,/serialAccess\.append\(openSerial,clearSerial\)/);
 assert.match(s,/serialToolbar\.append\(serialAccess\)/);
 assert.match(css,/\.dw-serial-access\{[\s\S]*?display:flex/);
 assert.match(css,/@media\(min-width:1510px\)/);
});

test('unified Kit Connection opens the preserved legacy manual setup within one Advanced disclosure',()=>{
 const js=read('js/devices-workspace.js'),css=read('devices-workspace.css');
 assert.match(js,/const innerManual=\$\('kitAdvancedHardware'\)/);
 assert.match(js,/legacy\.addEventListener\('toggle',exposeAdvanced\)/);
 assert.match(js,/if\(!legacy\.open\)return/);
 assert.match(js,/inner\.open=true;inner\.classList\.add\('dw-unwrapped-advanced'\)/);
 assert.match(css,/#dwLegacyConnection #kitAdvancedHardware\.dw-unwrapped-advanced>summary\{display:none!important\}/);
});

test('header names and verified connection status remain readable at every breakpoint',()=>{
 const css=read('v2-header.css'),kit=read('js/classroom-kits.js');
 assert.match(css,/#app \.topbar \.kit-top-detail b,#app \.topbar \.kit-top-detail small\{[\s\S]*?text-overflow:clip!important/);
 assert.match(css,/#app \.topbar #kitGlobalState\[data-connected="true"\]\{background:#167a4a!important/);
 assert.match(css,/#app \.topbar #kitGlobalState\[data-connected="false"\]\{background:#b32636!important/);
 assert.match(css,/@media\(max-width:660px\)/);
 assert.ok(kit.includes('pill.dataset.connected=String(ready)'), 'Status reflects verified live Kit, not chosen AP/STA');
});
