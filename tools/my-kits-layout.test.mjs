import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('My Kits shows editable Wi-Fi before optional duplicated hardware diagnostics',()=>{
 for(const file of ['index.html','lab.html']){
  const html=source(file);
  const root=html.indexOf('id="tab-settings"');
  const wifi=html.indexOf('id="kitNetworkSettings"',root);
  const drawer=html.indexOf('id="kitAdvancedHardware"',root);
  const admin=html.indexOf('id="kitAdmin"',root);
  const mobile=html.indexOf('id="kitMobilePairDetails"',root);
  assert.ok(root>=0&&root<wifi&&wifi<drawer&&drawer<admin&&admin<mobile,file+' page order');
  assert.match(html,/class="kit-accordion kit-hardware-advanced" id="kitAdvancedHardware"/);
  assert.ok(!html.includes('id="kitAdvancedHardware" open'),'duplicate hardware drawer is collapsed initially');
  const hiddenTools=html.slice(drawer,admin);
  for(const id of ['kitDiscover','kitConnect','kitSelectedId','kitSetupSteps','kitKnown','kitTakeControl','kitReleaseControl'])
   assert.ok(hiddenTools.includes('id="'+id+'"'),file+' keeps fallback '+id);
  for(const id of ['kitWifiScan','kitWifiSave','kitModeApply','kitSavedRefresh','kitSavedUse','kitSavedForget','kitAdmin','kitMobilePairDetails','kitOpenFirmwareCenter'])
   assert.equal(html.split('id="'+id+'"').length-1,1,file+' unique '+id);
 }
});
test('My Kits firmware shortcut is wired to the existing tab, without bypassing kit authentication',()=>{
 assert.match(source('js/classroom-kits.js'),/kitOpenFirmwareCenter[^\n]+querySelector\('button\.tab\[data-tab="firmware"\]'\)\?\.click\(\)/);
 assert.match(source('classroom-kits.css'),/kit-firmware-shortcut/);
 assert.match(source('firmware-updater.js'),/function networkFlashReadiness/);
 assert.match(source('js/classroom-kits.js'),/async function uploadAppFirmware/);
});
