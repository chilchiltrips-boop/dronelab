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
