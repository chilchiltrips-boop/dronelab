import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputStore,createSimulatorInput,validMirrorFrame} from '../js/simulator-input.js';
import {createSimulator,advanceSimulator} from '../js/tripod-physics.js';
const frame=(seq=1,channels={},extra={})=>({mirrorVersion:1,sessionId:'test-session-0123456789',seq,
 channels:{throttle:1000,roll:1500,pitch:1500,yaw:1500,...channels},transport:'ap',kind:'android-command',kitId:'KIT-A2',inputAgeMs:0,...extra});
function bench(){let time=0,stops=0;const store=createInputStore({now:()=>time}),s=createSimulator();
 store.setPeer({connected:true,approved:true,supported:true,sessionId:frame().sessionId,deviceId:'phone-1'});
 const input=createSimulatorInput(s,store,{onTimeout:()=>stops++});
 return {store,s,input,advance:n=>{time+=n;input.tick()},stops:()=>stops};}
test('Android mirror previews while stopped; only Web Run starts physics and Web Stop never restarts from incoming data',()=>{
 const {store,s,input}=bench();store.accept(frame(1,{roll:1600,yaw:1400}));
 assert.equal(s.running,false);assert.equal(s.cmdRoll,0);assert.equal(input.snapshot().previewAxes.roll,.2);
 assert.equal(input.start().accepted,true);store.accept(frame(2,{throttle:1400,roll:1600,pitch:1450,yaw:1400}));
 assert.equal(s.throttle,1400);assert.equal(s.cmdRoll,.2);assert.equal(s.cmdPitch,-.1);assert.equal(s.cmdYaw,-.2);
 advanceSimulator(s,.04);assert.ok(s.motorRPM.some(v=>v>0));
 input.stop();store.accept(frame(3,{throttle:1600}));assert.equal(s.running,false);assert.equal(s.throttle,1000);assert.equal(s.cmdRoll,0);
});
test('Auto picks fresh Android before Run, locks during Run, and never changes to Web on data loss',()=>{
 const b=bench();assert.equal(b.input.snapshot().activeSource,'web');b.store.accept(frame());assert.equal(b.input.snapshot().activeSource,'android');
 b.input.start();assert.equal(b.input.setChoice('web'),false);b.advance(451);
 assert.equal(b.s.running,false);assert.equal(b.s.throttle,1000);assert.equal(b.stops(),1);
 b.store.accept(frame(2));assert.equal(b.s.running,false);assert.equal(b.input.start().accepted,true);
});
test('Auto locked to Web ignores Android arrival, ARM metadata and pairing loss',()=>{
 const {store,s,input}=bench();input.start();s.throttle=1400;
 store.accept(frame(1,{throttle:1800},{armed:true}));assert.equal(s.throttle,1400);assert.equal(input.snapshot().source,'web');
 store.setPeer({connected:false});assert.equal(s.running,true);assert.equal(s.throttle,1400);
});
test('low throttle start uses the same 1025µs bound for local and Android sources',()=>{
 const {store,s,input}=bench();input.setChoice('android');store.accept(frame(1,{throttle:1050}));assert.equal(input.start().accepted,false);
 store.accept(frame(2,{throttle:1025}));assert.equal(input.start().accepted,true);input.stop();input.setChoice('web');s.throttle=1050;assert.equal(input.start().accepted,false);
});
test('malformed, wrong session, duplicate, out-of-order and delayed source frames cannot refresh the cache',()=>{
 const {store,input,advance}=bench();assert.equal(store.accept(frame(2)),true);
 for(const m of [frame(1),frame(2),frame(3,{}, {sessionId:'old-session-0000'}),frame(3,{roll:NaN}),frame(3,{throttle:2001}),frame(3,{}, {inputAgeMs:251})])assert.equal(store.accept(m),false);
 advance(451);assert.equal(store.snapshot().fresh,false);assert.equal(input.snapshot().input,null);
 assert.equal(validMirrorFrame(frame(5,{yaw:1000})),true);
});
test('new Kit, transport, session or producer kind stops an Android run without auto resume',()=>{
 for(const change of [{kitId:'KIT-B'},{transport:'sta'},{kind:'android-preview'}]){
  const {store,s,input}=bench();store.accept(frame());input.start();store.accept(frame(2,{},change));assert.equal(s.running,false);
 }
 const {store,s,input}=bench();store.accept(frame());input.start();store.setPeer({connected:false});assert.equal(s.running,false);
 store.setPeer({connected:true,approved:true,supported:true,sessionId:'new-session-0000',deviceId:'phone-2'});
 assert.equal(store.accept(frame(20)),false);assert.equal(s.running,false);
});
test('Android input never overwrites Web mode or PID and requires no hardware ARM',()=>{
 const {store,s,input}=bench();s.mode='acro';store.accept(frame(1,{}, {armed:false,mode:'angle'}));input.start();
 assert.equal(s.running,true);assert.equal(s.mode,'acro');store.accept(frame(2,{throttle:1350},{armed:false,mode:'angle'}));assert.equal(s.mode,'acro');assert.equal(s.running,true);
});
test('old APK has a clear update-required state and cannot become an Auto Android source',()=>{
 const {store,input}=bench();store.setPeer({connected:true,approved:true,supported:false,sessionId:frame().sessionId});
 assert.equal(store.accept(frame()),false);assert.equal(input.snapshot().activeSource,'web');input.setChoice('android');assert.match(input.start().reason,/update required/);
});
test('receive rate measures a window instead of inflating WebRTC arrival bursts',()=>{
 const {store,advance}=bench();store.accept(frame());
 assert.equal(store.snapshot().rateHz,null);
 for(let seq=2;seq<=21;seq++){advance(50);store.accept(frame(seq));}
 assert.equal(store.snapshot().rateHz,20);
 for(let seq=22;seq<=31;seq++){advance(.01);store.accept(frame(seq));}
 assert.ok(store.snapshot().rateHz>=20&&store.snapshot().rateHz<40);
 store.setPeer({connected:false});assert.equal(store.snapshot().rateHz,null);
});

const verifiedKit=(seq=1,values={})=>({kit:{connected:true,kitId:'KIT-A2',transport:'ap',bootId:'boot-1'},
 input:{state:'live',source:'ANDROID',seq,ageMs:12,rateHz:5,
 values:{throttle:1000,roll:1500,pitch:1500,yaw:1500,...values}}});
test('verified AP Kit accepted Android RC feeds Auto simulator only after explicit Web Run',()=>{
 const b=bench();b.store.setPeer({connected:false});
 assert.equal(b.store.acceptKit(verifiedKit(1,{roll:1750})),true);
 assert.equal(b.input.snapshot().activeSource,'android');
 assert.equal(b.input.snapshot().input.origin,'kit');
 assert.equal(b.input.snapshot().previewAxes.roll,.5);
 assert.equal(b.s.running,false);
 assert.equal(b.s.cmdRoll,0);
 assert.equal(b.input.start().accepted,true);
 b.store.acceptKit(verifiedKit(2,{throttle:1325,roll:1750,pitch:1250,yaw:1650}));
 assert.equal(b.s.throttle,1325);assert.equal(b.s.cmdRoll,.5);
 assert.equal(b.s.cmdPitch,-.5);assert.equal(b.s.cmdYaw,.3);
 advanceSimulator(b.s,.04);assert.ok(b.s.motorRPM.some(n=>n>0));
 b.input.stop('Web STOP');
 b.store.acceptKit(verifiedKit(3,{throttle:1700,roll:2000}));
 assert.equal(b.s.running,false);assert.equal(b.s.throttle,1000);
 assert.equal(b.s.cmdRoll,0);
});
test('Kit input rejects idle, stale, non-Android, unverified, malformed and repeated frames',()=>{
 const b=bench();b.store.setPeer({connected:false});
 for(const modify of [
   p=>{p.kit.connected=false},p=>{p.kit.transport='usb'},
   p=>{p.input.source='WEB'},p=>{p.input.state='stale'},
   p=>{p.input.ageMs=401},p=>{p.input.values.roll=2001}
 ]){
  const packet=verifiedKit();modify(packet);
  assert.equal(b.store.acceptKit(packet),false);
  assert.equal(b.store.snapshot().kit.fresh,false);
 }
 assert.equal(b.store.acceptKit(verifiedKit(5,{yaw:1300})),true);
 b.advance(180);assert.equal(b.store.acceptKit(verifiedKit(5,{yaw:1800})),false);
 b.advance(260);assert.equal(b.store.snapshot().kit.fresh,false);
 assert.equal(b.input.snapshot().activeSource,'web');
 assert.equal(b.store.acceptKit(verifiedKit(4)),false);
 assert.equal(b.store.acceptKit(verifiedKit(6)),true);
 assert.equal(b.input.snapshot().input.channels.yaw,1500);
});
test('Kit source locked during Run; loss and identity handover stop only virtual simulator',()=>{
 const b=bench();b.store.setPeer({connected:false});
 b.store.acceptKit(verifiedKit());b.input.start();
 assert.equal(b.input.setChoice('web'),false);
 b.store.acceptKit(verifiedKit(2,{throttle:1375}));
 assert.equal(b.s.throttle,1375);
 const other=verifiedKit(3);other.kit.kitId='OTHER';
 b.store.acceptKit(other);assert.equal(b.s.running,false);
 assert.equal(b.s.throttle,1000);assert.equal(b.stops(),1);
 b.store.acceptKit(verifiedKit(4));assert.equal(b.s.running,false); // never auto resume
 b.input.start();b.advance(451);
 assert.equal(b.s.running,false);assert.equal(b.stops(),2);
});
test('WebRTC and Kit mirrors do not silently replace a locked stream',()=>{
 const b=bench();
 b.store.acceptKit(verifiedKit());
 b.input.start();assert.equal(b.input.snapshot().input.origin,'kit');
 b.store.accept(frame(1,{roll:1999}));
 assert.equal(b.s.running,true);assert.equal(b.input.snapshot().input.origin,'kit');
 b.store.acceptKit(verifiedKit(2,{roll:1700}));
 assert.equal(b.s.cmdRoll,.4);
 b.input.stop(); // Auto now prefers an approved fresh WebRTC source
 assert.equal(b.input.snapshot().input.origin,'webrtc');
 assert.equal(b.input.start().accepted,true);
 b.store.acceptKit(verifiedKit(3,{throttle:1900}));
 assert.equal(b.s.running,true);assert.equal(b.s.throttle,1000);
});
