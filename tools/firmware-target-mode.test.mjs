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
test('a loaded firmware exposes both flashing shortcuts that only reveal the correct panel',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="fwGoUsbFlashBtn"/);
 assert.match(html,/id="fwGoWifiFlashBtn"/);
 assert.equal(html,readFileSync(new URL('../lab.html',import.meta.url),'utf8'));
 assert.match(src,/fwGoUsbFlashBtn.*showFlashSetup\('usb'\)/);
 assert.match(src,/fwGoWifiFlashBtn.*showFlashSetup\('wifi'\)/);
 const a=src.indexOf('function setFirmwareTargetMethod(method,focus=false)');
 const b=src.indexOf('function bind()',a);
 let flashed=0;
 const elements=new Map(),$=id=>{
  if(!elements.has(id))elements.set(id,{
   hidden:false,tabIndex:0,attrs:{},focus(){},
   setAttribute(k,v){this.attrs[k]=v},
   scrollIntoView(args){this.scrolled=args}
  });
  return elements.get(id);
 };
 const context={$ ,fw:{version:'1.7.19'},busy:false,firmwareTargetMethod:'wifi',
  flashNetworkApp:()=>flashed++,usbFlash:()=>flashed++};
 vm.runInNewContext(src.slice(a,b)+';globalThis.jumpToFlash=showFlashSetup;',context);
 context.jumpToFlash('usb');
 assert.equal($('#fwTargetUsbPanel').hidden,false);
 assert.equal($('#fwTargetWifiPanel').hidden,true);
 assert.equal($('#fwTargetUsbPanel').scrolled.block,'center');
 assert.match($('#fwFlashShortcutHelp').textContent,/Nothing flashed yet/);
 context.jumpToFlash('wifi');
 assert.equal($('#fwTargetWifiPanel').hidden,false);
 assert.equal($('#fwTargetUsbPanel').hidden,true);
 context.busy=true;
 context.jumpToFlash('usb');
 assert.equal($('#fwTargetUsbPanel').hidden,true);
 assert.equal(flashed,0,'shortcuts must not call any flash transport');
});
test('OTA image guard and USB factory erase confirmation remain active',()=>{
 assert.match(src,/if\(erase&&type!=='factory'\)/);
 assert.match(src,/if\(!await confirmInLab\(`Flash firmware over USB/);
 assert.match(src,/if\(!fw\|\|!\(fw\.bytes instanceof Uint8Array\)\|\|fw\.type!=='app'\)/);
 assert.match(src,/fwUsbFlashBtn.*usbFlash/);
 assert.match(src,/fwNetworkFlashBtn.*flashNetworkApp/);
 assert.match(src,/fwUpgradeEraseModeBtn.*selectUpgradeMode\(true\)/);
});
