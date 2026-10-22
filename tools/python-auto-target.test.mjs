import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createI2CBridge,createGyroBridge} from '../js/usb-i2c-bridge.js';
const context={};vm.runInNewContext(readFileSync(new URL('../js/kit-data-interface.js',import.meta.url),'utf8'),context);
const data=context.ZebjusKitData,kitId='ZFC-A2-012345ABCDEF';
const kit={connected:true,kitId,transport:'sta',bootId:'boot-one',controlAuthorized:true,setupAuthorized:true};
const path=transport=>({transport,kitId,verified:true,available:true,fresh:true,permitted:true,generation:4});
test('Python detects the selected verified connection instead of requiring an Auto selection or preferring another open port',()=>{
 for(const transport of ['usb','ap','sta','android-relay']){
  const selected={...kit,transport};
  assert.equal(data.detectPythonTarget(selected,['usb','ap','sta','android-relay'].map(path)).transport,transport);
 }
 assert.equal(data.detectPythonTarget({...kit,connected:false},[path('sta')]),null);
 assert.equal(data.detectPythonTarget(kit,[{...path('sta'),verified:false}]),null);
});
test('Python AUTO resolves fresh verified USB, AP, STA and authorized relay in explicit priority order',()=>{
 const paths=['android-relay','sta','ap','usb'].map(path);
 for(const expected of ['usb','ap','sta','android-relay']){
  assert.equal(data.resolvePythonTarget(kit,paths).transport,expected);
  paths.splice(paths.findIndex(p=>p.transport===expected),1);
 }
 assert.equal(data.resolvePythonTarget(kit,paths).transport,null);
});
test('Python AUTO never selects stale, unverified, unavailable, wrong-ID or unapproved paths',()=>{
 for(const change of [{fresh:false,lastPacketAt:0},{verified:false},{available:false},{kitId:'another-kit'}])
  assert.equal(data.resolvePythonTarget(kit,[{...path('usb'),...change}]).transport,null);
 assert.equal(data.resolvePythonTarget(kit,[{...path('android-relay'),permitted:false}]).transport,null);
 assert.match(data.resolvePythonTarget(kit,[]).reason,/NO VERIFIED KIT/);
});
test('Python operation capabilities select authorized direct Wi-Fi for router setup and reject observer writes',()=>{
 const paths=['usb','ap','sta','android-relay'].map(path);
 assert.equal(data.resolvePythonTarget(kit,paths,'auto','wifi_scan').transport,'ap');
 assert.equal(data.resolvePythonTarget({...kit,rc:{claimed:true}},paths,'auto','wifi_scan').transport,null);
 assert.equal(data.resolvePythonTarget({...kit,setupAuthorized:false},paths,'auto','wifi_test_save').transport,null);
 assert.equal(data.resolvePythonTarget({...kit,controlAuthorized:false},[path('sta')],'auto','led').transport,null);
 assert.equal(data.resolvePythonTarget({...kit,controlAuthorized:false},[path('sta')],'auto','read_gyro').transport,'sta');
 assert.equal(data.resolvePythonTarget(kit,[path('android-relay')],'auto','i2c_scan').transport,null);
 assert.equal(data.resolvePythonTarget(kit,[path('android-relay')],'android-relay','led').transport,'android-relay','explicit manual relay retains firmware/Android-authorized diagnostic commands');
 assert.equal(data.resolvePythonTarget({...kit,connected:false},[path('sta')]).transport,null);
});
test('Python Simulator remains isolated and explicit manual selections are respected',()=>{
 assert.equal(data.resolvePythonTarget(kit,['usb','sta'].map(path),'python').transport,'python');
 assert.equal(data.resolvePythonTarget(kit,['usb','sta'].map(path),'sta').transport,'sta');
 assert.equal(data.resolvePythonTarget(kit,[path('usb')],'ap').transport,null);
});
test('Python session loss cannot silently hand over to another transport, boot, USB generation or Kit',()=>{
 const paths=['usb','sta'].map(path),binding=data.resolvePythonTarget(kit,paths);
 assert.equal(data.validatePythonBinding(binding,kit,paths).transport,'usb');
 assert.throws(()=>data.validatePythonBinding(binding,kit,[path('sta')]),/session changed/);
 assert.throws(()=>data.validatePythonBinding(binding,kit,[{...path('usb'),generation:5}]),/session changed/);
 assert.throws(()=>data.validatePythonBinding(binding,{...kit,kitId:'other'},[path('usb')]),/session changed/);
 const network=data.resolvePythonTarget(kit,[path('sta')]);
 assert.throws(()=>data.validatePythonBinding(network,{...kit,bootId:'rebooted'},[path('sta')]),/session changed/);
 const relayKit={...kit,transport:'android-relay',relaySessionId:'approved-one'},relay=data.resolvePythonTarget(relayKit,[path('android-relay')]);
 assert.throws(()=>data.validatePythonBinding(relay,{...relayKit,relaySessionId:'approved-two'},[path('android-relay')]),/session changed/);
});
test('Python serial parsers reject data from another transport while a hardware operation is bound',async()=>{
 const host=new EventTarget(),bridge=createI2CBridge({host,acceptEvent:e=>e.detail.transport==='usb'}),gyro=createGyroBridge({host,acceptEvent:e=>e.detail.transport==='usb'});
 const emit=(line,transport)=>{const e=new Event('dronelab:serial-line');e.detail={line,transport};host.dispatchEvent(e)};
 const pending=bridge.waitForScan(1000);let resolved=false;pending.then(()=>resolved=true);
 emit('ZJSCAN,A2,12,1,0x68','sta');await Promise.resolve();assert.equal(resolved,false);
 emit('ZJSCAN,A2,13,2,0x68,0x77','usb');assert.deepEqual((await pending).addresses,['0x68','0x77']);
 bridge.close();gyro.close();
});
