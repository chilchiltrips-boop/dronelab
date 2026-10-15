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
  assert.match(h,/src=".\/js\/devices-workspace.js\?v=unified-devices-scroll-20261015"/);
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

test('fixed-height desktop Devices panels scroll independently; mobile stays natural',()=>{
 const css=read('devices-workspace.css');
 const behavior=read('js/devices-workspace.js');
 assert.match(css,/#tab-firmware \.dw-shell\{[\s\S]*?height:var\(--dw-height/);
 assert.match(css,/#tab-firmware \.dw-sidebar\{[\s\S]*?grid-template-rows:auto minmax\(0,1fr\) auto/);
 assert.match(css,/#tab-firmware \.dw-nav-list\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#tab-firmware \.dw-view-content\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/@media\(max-width:780px\)\{[\s\S]*?#tab-firmware \.dw-shell\{[\s\S]*?height:auto/);
 assert.match(css,/#tab-firmware \.firmware-hero\{display:none!important\}/);
 assert.match(behavior,/function sizeWorkspace\(\)/);
 assert.match(behavior,/visualViewport\?\.addEventListener\('resize',scheduleLayout/);
 assert.match(behavior,/viewScroll\.set\(selected,body\(selected\)\?\.scrollTop\|\|0\)/);
});
