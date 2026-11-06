import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
test('firmware mode selector only updates panels and ARIA; never flashes or switches during busy',()=>{
 const a=src.indexOf('function setFirmwareTargetMethod(method,focus=false)');
 const b=src.indexOf('function bind()',a);
 assert.ok(a>=0&&b>a);
 const elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,tabIndex:0,attrs:{},focus(){this.focused=true},setAttribute(k,v){this.attrs[k]=v}});
 return elements.get(id)};
 let flashed=0;
 const context={$ ,busy:false,firmwareTargetMethod:'wifi',flashNetworkApp:()=>flashed++,usbFlash:()=>flashed++};
 vm.runInNewContext(src.slice(a,b)+';globalThis.switchMode=setFirmwareTargetMethod;',context);
 context.switchMode('usb',true);
 assert.equal($('#fwTargetWifiPanel').hidden,true);
 assert.equal($('#fwTargetUsbPanel').hidden,false);
 assert.equal($('#fwTargetUsbTab').attrs['aria-selected'],'true');
 assert.equal($('#fwTargetWifiTab').tabIndex,-1);
 assert.equal($('#fwTargetUsbTab').tabIndex,0);
 assert.equal($('#fwTargetUsbTab').focused,true);
 context.switchMode('wifi');
 assert.equal($('#fwTargetWifiPanel').hidden,false);
 assert.equal($('#fwTargetUsbPanel').hidden,true);
 context.busy=true;context.switchMode('usb');
 assert.equal($('#fwTargetUsbPanel').hidden,true,'busy OTA/USB operations lock tabs');
 assert.equal(flashed,0,'switch is presentation only');
});
test('PPM ownership permits OTA setup only with disarm, low throttle, verified motors off and stationary IMU',()=>{
 const a=src.indexOf('function ppmOtaMaintenanceReadiness(device)');
 const b=src.indexOf('function syncFirmwareControls()',a);
 assert.ok(a>=0&&b>a);
 let state={connected:true,transport:'sta',otaAuthorized:true,controlAuthorized:true,
  kitId:'ZFC-A2-012345ABCDEF',board:'ZFC-A2',owner:false,working:false,
  rc:{claimed:true,source:'PPM',inputArmed:false,throttle:1000},
  motorsDisabled:true,motorsArmed:false,
  rcAccess:{version:1,paused:false,stationary:true}};
 const ctx={ZebjusKits:{getState:()=>state},busy:false};
 vm.runInNewContext(src.slice(a,b)+`
  let fw={type:'app',boardId:'ZFC-A2',bytes:new Uint8Array(65536)};
  globalThis.isOtaReady=networkFlashReadiness;
  globalThis.ppmCheck=ppmOtaMaintenanceReadiness;`,ctx);
 assert.equal(ctx.isOtaReady().ready,true);
 assert.match(ctx.isOtaReady().message,/pause RC using authenticated maintenance/);
 for(const patch of [
  {rc:{...state.rc,inputArmed:true}},
  {rc:{...state.rc,throttle:1500}},
  {motorsDisabled:false},
  {motorsArmed:true},
  {rcAccess:{...state.rcAccess,stationary:false}},
  {rc:{...state.rc,source:'ANDROID'}},
  {owner:true},
  {otaAuthorized:false}
 ]){
  state={...state,...patch};
  assert.equal(ctx.isOtaReady().ready,false,JSON.stringify(patch));
 }
 state={...state,owner:false,otaAuthorized:true,rc:{claimed:false,source:'NONE'},rcAccess:{...state.rcAccess,stationary:true}};
 assert.equal(ctx.isOtaReady().ready,true,'unclaimed, authenticated, matched APP still OTA-ready');
});
test('PPM OTA uses firmware-enforced maintenance pause and independent safe readback before upload',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal(html,readFileSync(new URL('../lab.html',import.meta.url),'utf8'));
 assert.doesNotMatch(html,/fwGo(?:Usb|Wifi)FlashBtn|fwFlashShortcutHelp/);
 assert.doesNotMatch(src,/showFlashSetup|fwGo(?:Usb|Wifi)FlashBtn/);
 const begin=src.indexOf("await kitApi.changeRcAccess('BEGIN')");
 const fresh=src.indexOf('await kitApi.read();',begin);
 const upload=src.indexOf('window.ZebjusKits.uploadAppFirmware(',fresh);
 assert.ok(begin>0&&fresh>begin&&upload>fresh,'maintenance pause then fresh device verification then upload');
 assert.match(src,/after\.rc\?\.claimed!==false/);
 assert.match(src,/after\.motorsArmed!==false\|\|after\.motorsDisabled!==true/);
 const access=readFileSync(new URL('../FlightCore_Firmware/FlightCoreAccess.h',import.meta.url),'utf8');
 const ota=readFileSync(new URL('../FlightCore_Firmware/FlightCoreOta.h',import.meta.url),'utf8');
 assert.match(access,/zjRcPaused=true;zjRcHandoverPaused=false;zjRcRelease/);
 assert.match(ota,/if\(zjRcOwned\|\|zjNetTesting\|\|zjUsbScanning/);
});
test('OTA image guard and USB factory erase confirmation remain active',()=>{
 assert.match(src,/if\(erase&&type!=='factory'\)/);
 assert.match(src,/if\(!await confirmInLab\(`Flash firmware over USB/);
 assert.match(src,/if\(!fw\|\|!\(fw\.bytes instanceof Uint8Array\)\|\|fw\.type!=='app'\)/);
 assert.match(src,/fwUsbFlashBtn.*usbFlash/);
 assert.match(src,/fwNetworkFlashBtn.*flashNetworkApp/);
 assert.match(src,/fwUpgradeEraseModeBtn.*selectUpgradeMode\(true\)/);
});
