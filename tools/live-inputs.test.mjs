import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../js/kit-inputs.js';
import {createReadableKitMonitor} from '../js/serial-readable-monitor.js';
import {kitFixture,kitId,combined,snapshot} from './live-inputs-harness.mjs';
const {decodeSerial,createStore}=globalThis.ZebjusKitInputs;

test('combined and legacy receiver frames share strict channel/board/motor validation',()=>{
 const d=decodeSerial(combined());assert.equal(d.throttle,1300);assert.equal(d.inputArmed,true);
 assert.equal(decodeSerial('ZJRC,AP,ANDROID,32,T=1300,R=1600,P=1400,Y=1550,ARM=1').yaw,1550);
 for(const bad of [combined().replace('T=1300','T=999'),combined().replace('RCSEQ=32','RCSEQ=4294967296'),
  combined().replace('MOTORS=OFF','MOTORS=ON'),combined().replace('A2','A3'),combined()+',EXTRA',combined().replace('1,2,RC=','2,2,RC=')])assert.equal(decodeSerial(bad),null);
});
test('duplicate packets and older sequences cannot renew freshness or resurrect ARM',()=>{
 let time=0;const store=createStore({now:()=>time});store.select({connected:true,kitId,transport:'usb'});
 store.observe(decodeSerial(combined()),{serial:true});time=200;store.observe(decodeSerial(combined()),{serial:true});
 time=351;assert.equal(store.view().status,'STALE');assert.equal(store.view().inputArmed,false);assert.equal(store.view().throttle,1000);
 assert.equal(store.observe(decodeSerial(combined(31)),{serial:true}),false);
 assert.equal(store.observe(decodeSerial(combined(33)),{serial:true}),true);assert.equal(store.view().status,'LIVE');
});
test('disconnect, identity, transport, boot and connection generation clear cached samples',()=>{
 let selection={connected:true,kitId,transport:'ap',bootId:'one',generation:1};const store=createStore({now:()=>0});
 for(const next of [{connected:false},{kitId:'ZFC-A2-FFFFFFFFFFFF'},{transport:'sta'},{bootId:'two'},{generation:2}]){
  store.select(selection);store.observe(snapshot());assert.equal(store.view().status,'LIVE');
  store.select({...selection,...next});assert.equal(store.view().inputValid,false);assert.equal(store.view().seq,null);
 }
});
test('snapshot freshness includes round trip and rejects wrong hardware or unsupported motor state',()=>{
 const store=createStore({now:()=>100});store.select({connected:true,kitId,transport:'sta'});
 assert.equal(store.observe(snapshot({kitId:'ZFC-A2-FFFFFFFFFFFF'})),false);
 assert.equal(store.observe(snapshot({motorsDisabled:false})),false);
 assert.equal(store.observe(snapshot({motorsArmed:true})),false);
 assert.equal(store.observe(snapshot({roll:2100})),false);
 store.observe(snapshot({ageMs:250}),{rtt:110});assert.equal(store.view().status,'STALE');assert.equal(store.view().roll,1500);
});
test('USB combined telemetry updates actual Kit cards, PID mirror and Python without taking control',async()=>{
 const f=kitFixture('usb');await f.connect();f.serial(combined());
 assert.equal(f.elements.get('kitValThrottle').textContent,1300);
 assert.match(f.elements.get('kitPidMonitor').textContent,/RC LIVE.*T 1300/);
 let rc=await f.network.readJoystick();assert.equal(rc.input_valid,true);assert.equal(rc.source,'ANDROID');assert.equal(rc.throttle,1300);
 assert.equal(f.api.getState().owner,false);
 f.advance(351);rc=await f.network.readJoystick();f.api.refreshInputReadouts();
 assert.equal(rc.input_valid,false);assert.equal(rc.throttle,1000);assert.equal(f.elements.get('kitRcState').textContent,'STALE');
 f.closeUSB();assert.equal(f.api.getInputs().status,'OFFLINE');await assert.rejects(f.network.readJoystick(),/verified/);
 assert.ok(f.calls.every(p=>!p.includes('/rc/claim')));
});
for(const mode of ['ap','sta','android-relay'])test(mode+' reads identity-bound snapshots, coalesces consumers and neutralizes stale input',async()=>{
 const f=kitFixture(mode);await f.connect();f.calls.length=0;
 const [a,b]=await Promise.all([f.api.readInputs(),f.network.readJoystick()]);
 assert.equal(a.throttle,1300);assert.equal(b.seq,a.seq);assert.equal(a.transport,mode);
 assert.equal(f.calls.filter(p=>p==='/api/rc/snapshot').length,1);
 f.advance(101);f.setRC(snapshot({ageMs:800}));const stale=await f.network.readJoystick();
 assert.equal(stale.input_valid,false);assert.equal(stale.throttle,1000);assert.equal(stale.inputArmed,false);
 f.advance(101);f.setRC(snapshot({kitId:'ZFC-A2-FFFFFFFFFFFF'}));await assert.rejects(f.network.readJoystick(),/identity|Device ID/i);
 assert.equal(f.api.getState().owner,false);assert.ok(f.calls.every(p=>p==='/api/rc/snapshot'));
});
test('a late Android relay snapshot cannot revive a disconnected or reconnected Kit',async()=>{
 const f=kitFixture('android-relay');await f.connect();let finish;f.block(new Promise(r=>finish=r));
 const pending=f.api.readInputs();await new Promise(r=>setImmediate(r));await f.api.disconnect();finish();
 await assert.rejects(pending,/Selected kit changed|connection changed/);assert.equal(f.api.getInputs().status,'OFFLINE');
 f.block(null);await f.connect();assert.equal(f.api.getState().owner,false);
});
test('revoked Android relay read permission does not fall back to a different transport',async()=>{
 const f=kitFixture('android-relay');await f.connect();f.deny();await assert.rejects(f.api.readInputs(),/not granted/);
 f.advance(400);assert.equal(f.api.getInputs().inputValid,false);assert.equal(f.api.getState().owner,false);
});
test('serial packets from network events or another board cannot enter USB receiver state',async()=>{
 const f=kitFixture('usb');await f.connect();f.serial(combined().replace(',A2,',',A1,'));assert.equal(f.api.getInputs().seq,null);
 f.serial(combined());f.serial('ZJRC,RELEASE,LEASE_TIMEOUT');assert.equal(f.api.getInputs().inputArmed,false);
 await f.api.disconnect();f.serial(combined());assert.equal(f.api.getInputs().status,'OFFLINE');
});
test('readable serial monitor also expires repeated combined RC sequence',()=>{
 let time=0;const monitor=createReadableKitMonitor({now:()=>time,intervalMs:0});
 assert.match(monitor.view(combined()),/INPUT ARMED/);time=351;
 assert.match(monitor.view(combined()),/STALE \/ FAILSAFE.*INPUT OFF/);
});
test('both entry points and offline shell include the shared receiver and responsive monitor',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const html=read('index.html');
 assert.equal(html,read('lab.html'));
 for(const file of ['js/kit-inputs.js','js/live-inputs.js','live-inputs.css']){assert.ok(html.includes(file));assert.ok(read('sw.js').includes(file));}
 assert.ok(html.indexOf('js/kit-inputs.js')<html.indexOf('js/classroom-kits.js'));
 assert.match(html,/value="android-relay">FlightCore • Android Relay/);
});
