import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../js/serial-rc-decoder.js';
import {createReadableKitMonitor} from '../js/serial-readable-monitor.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const parse=globalThis.ZebjusSerialRcDecoder.parseSerialRc;
const base='ZJTEL,1,A2,3250,1841677,0x68,READY,-5.65,4.29,-0.29,1,2';
const combined=(link='USB/WEB',sequence=32,t=1275)=>
 base+',RC='+link+',RCSEQ='+sequence+',T='+t+',R=1570,P=1420,Y=1645,INPUT_ARMED=1,MOTORS=OFF';
function dashboardRuntime(){
 const source=read('js/classroom-kits.js');
 const start=source.indexOf('function onSerial(e){');
 const end=source.indexOf('\n// Read-only reconnect',start);
 assert.ok(start>0&&end>start,'USB event handler exists');
 const state={connected:true,transport:'usb',kitId:'ZFC-A2-AABBCCDDEEFF',rc:null,owner:false};
 const ctx={state,root:{ZebjusSerialRcDecoder:globalThis.ZebjusSerialRcDecoder},usbCandidate:{},
  autoReconnectAllowed:false,serialClaims:[],Date,render(){ctx.renders++},
  audit(){},wifiNote(){},console,renders:0};
 vm.runInNewContext(source.slice(start,end)+';globalThis.acceptUsb=onSerial;',ctx);
 return {state,accept:line=>ctx.acceptUsb({detail:{line,transport:'usb'}}),ctx};
}
test('same decoder handles legacy RAW and 1.4.11 combined RC frames',()=>{
 const old=parse('ZJRC,AP,ANDROID,8,T=1100,R=1500,P=1530,Y=1620,ARM=1');
 const next=parse(combined());
 assert.equal(old.kind,'frame');assert.equal(old.source,'ANDROID');assert.equal(old.inputArmed,true);
 assert.equal(next.kind,'frame');assert.equal(next.transport,'USB');
 assert.deepEqual([next.throttle,next.roll,next.pitch,next.yaw],[1275,1570,1420,1645]);
 assert.equal(next.inputArmed,true);
 assert.equal(parse(base),null,'legacy 12-field gyro must not reset an active RAW RC packet');
 assert.equal(parse(combined('AP/ANDROID')).source,'ANDROID');
});
test('combined USB RC updates Kit dashboard cards while Serial Monitor prints matching values',()=>{
 const dashboard=dashboardRuntime();
 dashboard.accept(combined('USB/WEB',32,1275));
 const state=dashboard.state.rc;
 assert.deepEqual([state.throttle,state.roll,state.pitch,state.yaw],[1275,1570,1420,1645]);
 assert.equal(state.seq,32);assert.equal(state.source,'WEB');assert.equal(state.active,true);
 assert.equal(dashboard.ctx.renders,1);
 const monitor=createReadableKitMonitor({now:()=>4000});
 const text=monitor.view(combined('USB/WEB',32,1275));
 assert.match(text,/RC USB\/WEB #32.*THR=1275 ROLL=1570 PITCH=1420 YAW=1645/);
 assert.match(text,/MOTORS OFF$/);
});
test('idle combined frame neutralizes dashboard and monitor, without motors/ARM claim',()=>{
 const d=dashboardRuntime();
 d.accept(combined());
 const idle=base+',RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=0,MOTORS=OFF';
 d.accept(idle);
 assert.equal(d.state.rc.active,false);assert.equal(d.state.rc.claimed,false);
 assert.deepEqual([d.state.rc.throttle,d.state.rc.roll,d.state.rc.pitch,d.state.rc.yaw],[1000,1500,1500,1500]);
 assert.equal(d.state.rc.inputArmed,false);
 const monitor=createReadableKitMonitor({now:()=>1000,intervalMs:0});
 assert.match(monitor.view(combined()),/INPUT ARMED/);
 assert.match(monitor.view(idle),/RC IDLE.*THR=1000.*INPUT OFF.*MOTORS OFF/);
});
test('malformed or untrusted frames cannot change dashboard or spoof a live RC input',()=>{
 const d=dashboardRuntime();d.accept(combined());const original=d.state.rc;
 const bad=[
  combined().replace('MOTORS=OFF','MOTORS=ON'),
  combined().replace('T=1275','T=4000'),
  combined().replace('RCSEQ=32','RCSEQ=0'),
  combined().replace('0x68','0x6B'),
  base+',RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=1,MOTORS=OFF',
  'ZJRC,AP,ANDROID,12,T=999,R=1500,P=1500,Y=1500,ARM=1'
 ];
 for(const line of bad){assert.equal(parse(line),null,line);d.accept(line);assert.equal(d.state.rc,original,'bad serial input must not update dashboard')}
 assert.equal(d.ctx.renders,1);
});
test('only verified USB-linked dashboard consumes USB RC frames',()=>{
 const d=dashboardRuntime();
 d.state.transport='sta';
 d.accept(combined());assert.equal(d.state.rc,null);
 d.state.transport='usb';d.state.connected=false;
 d.accept(combined());assert.equal(d.state.rc,null);
});
test('both pages load the shared decoder synchronously before dashboard and offline cache retains it',()=>{
 const html=read('index.html'),lab=read('lab.html'),sw=read('sw.js'),kit=read('js/classroom-kits.js'),monitor=read('js/serial-readable-monitor.js');
 assert.equal(html,lab);
 const asset='js/serial-rc-decoder.js?v=ppm-ch8-20261017';
 assert.ok(html.indexOf(asset)>0&&html.indexOf(asset)<html.indexOf('js/classroom-kits.js?v='));
 assert.ok(sw.includes('./'+asset));
 assert.match(monitor,/import '.\/serial-rc-decoder\.js\?v=ppm-ch8-20261017'/);
 assert.match(kit,/root\.ZebjusSerialRcDecoder\?\.parseSerialRc\(line\)/);
 assert.doesNotMatch(kit,/const rc=\/\^ZJRC,/);
 assert.match(sw,/dronelab-tripod-input-mirror-20261021/);
});
