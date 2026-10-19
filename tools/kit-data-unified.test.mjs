import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ctx={};
vm.runInNewContext(read('js/kit-data-interface.js'),ctx);
const data=ctx.ZebjusKitData;
const kit=(transport='android-relay')=>({connected:true,kitId:'ZFC-A2-123456ABCDEF',kitName:'zebjus_drone_1',transport,physicalLink:'sta'});
test('AP / STA / verified Android Relay are the same read-only network Kit interface',()=>{
 for(const t of ['ap','sta','android-relay'])assert.equal(data.isNetwork(t),true,t);
 assert.equal(data.isNetwork('usb'),false);
 assert.equal(data.matchesTarget(kit(),'android-relay'),true);
 assert.equal(data.matchesTarget(kit(),'sta'),true,'Android Relay physical STA can serve STA Python read');
 assert.equal(data.matchesTarget(kit(),'ap'),false);
 assert.equal(data.matchesTarget(kit('usb'),'usb'),true);
 assert.equal(data.matchesTarget({...kit(),connected:false},'sta'),false);
});
test('a data read must be bound to same current Kit ID and transport',()=>{
 const before=kit(),reply={kitId:before.kitId,rc:{}};
 assert.equal(data.validateReply(before,{...before},reply),reply);
 for(const change of [{kitId:'ZFC-A2-000000000000'},{transport:'sta'},{connected:false}]){
  assert.throws(()=>data.validateReply(before,{...before,...change},reply),/identity|transport/);
 }
 assert.throws(()=>data.validateReply(before,before,{}),/Device ID/);
 assert.throws(()=>data.validateReply(before,before,{kitId:'ZFC-A2-000000000000'}),/Device ID/);
});
test('USB joystick is only accepted from fresh verified physical serial data',()=>{
 const t=kit('usb'),fresh={...t,rc:{active:true,seq:12,source:'ANDROID',throttle:1135,roll:1500,pitch:1410,yaw:1660,inputArmed:true},rcAt:3000};
 let r=data.usbJoystick(fresh,3220);
 assert.equal(r.input_valid,true);assert.equal(r.throttle,1135);assert.equal(r.source,'ANDROID');
 assert.equal(r.age_ms,220);assert.equal(r.motors_disabled,true);assert.equal(r.motorsArmed,false);
 r=data.usbJoystick(fresh,3400);
 assert.equal(r.input_valid,false);assert.equal(r.failsafe,true);assert.equal(r.throttle,1000);assert.equal(r.yaw,1500);
 assert.equal(data.usbJoystick({...fresh,rc:{...fresh.rc,roll:2500}},3100).input_valid,false);
 assert.throws(()=>data.usbJoystick({...fresh,connected:false},3100),/USBDisconnected/);
});
test('network/Python/Live Inputs all route via identity-checked transport without claiming control',()=>{
 const net=read('js/network-lab.js'),py=read('js/python-lab.js'),live=read('js/live-inputs.js'),kits=read('js/classroom-kits.js');
 assert.match(net,/dataInterface\(\)\.validateReply\(selected,after,result,\{requireKitId\}\)/);
 assert.match(net,/dataInterface\(\)\?\.isNetwork\(kit\.transport\)/);
 assert.match(net,/contract\.usbJoystick\(before\)/);
 assert.match(py,/selectedPythonKit\(\)/);assert.match(py,/kitData\(\)\?\.matchesTarget\(before,/);
 assert.match(py,/window\.DroneLabNetwork\.readJoystick\(\)/);
 assert.match(live,/window\.ZebjusKitData\?\.isNetwork\(kit\.transport\)/);
 assert.match(kits,/if\(state\.transport==='android-relay'\)\{/);
 assert.match(kits,/Android Relay Device ID mismatch/);
 for(const s of [net,live,py])assert.doesNotMatch(s,/\.claim\(/);
});
test('Python target includes Relay without implying privileged Wi-Fi credential writes',()=>{
 const html=read('index.html'),lab=read('lab.html'),net=read('js/network-lab.js');
 assert.equal(html,lab);
 assert.match(html,/<option value="android-relay">FlightCore • Android WebRTC Relay<\/option>/);
 assert.match(net,/Wi-Fi credential provisioning over Android Relay is not supported/);
 const iface='js/kit-data-interface.js?v=kit-transport-unified-20261017';
 assert.ok(html.includes(iface));
 assert.ok(html.indexOf(iface)<html.indexOf('js/network-lab.js?v=kit-transport-unified-20261017'));
});
test('Android controller names actual Kit versus WebRTC simulator, never claims motors armed',()=>{
 const html=read('companion.html'),control=read('companion-flight.js'),css=read('companion.css');
 assert.match(html,/id="flightTarget"/);
 assert.match(control,/TARGET • SIMULATOR \/ WEBRTC/);
 assert.match(control,/TARGET • KIT \/ /);
 assert.match(control,/TARGET • PREVIEW ONLY/);
 assert.match(control,/FlightCore diagnostic input • MOTOR OUTPUTS DISABLED/);
 assert.match(control,/if\(directKit\(\)\)window\.ZebjusNetwork\?\.previewControls/);
 assert.match(control,/s\?\.connected&&window\.ZebjusNetwork\?\.hasControl\?\.\(\)/);
 assert.match(css,/\.flight-sim-badge\[data-target=kit\]/);
});
test('new assets are cached for offline Wix and module versions stay in sync',()=>{
 const html=read('index.html'),sw=read('sw.js');
 for(const path of ['js/kit-data-interface.js','js/network-lab.js','js/classroom-kits.js','js/python-lab.js','js/live-inputs.js']){
  const full=path+'?v='+(path==='js/live-inputs.js'?'ppm-ch8-20261017':'kit-transport-unified-20261017');
  assert.ok(html.includes(full),full+' HTML');
  assert.ok(sw.includes('./'+full),full+' SW');
 }
 assert.match(sw,/dronelab-udp-session-guard-20261019/);
});
