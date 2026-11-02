import test from 'node:test';
import assert from 'node:assert/strict';
import {setupInputSample,setupMonitorSample,describePpmMonitorHealth} from '../js/input-monitor.js';
const channels=[1550,1450,1800,1500,1000,1500,1500,1500];
const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',bootId:'boot-1',transport:'sta',rcAccess:{controlPath:'PPM'}};
const packet=()=>({kitId:kit.kitId,bootId:kit.bootId,selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:20,channels:[...channels],roundTripMs:220,
 ppm:{present:true,ageMs:20,captureHz:50,captureBackend:'RMT_RX',seq:100,channels:[...channels]}});

test('220 ms read latency does not flicker a read-only PPM monitor or certify fresh control',()=>{
 const state=packet();
 for(let elapsed=0;elapsed<1000;elapsed+=50){
  const view=setupMonitorSample(state,10000,kit,10000+elapsed);
  assert.equal(view.monitoring,true);assert.equal(view.valid,false);assert.equal(view.reported,true);
  assert.deepEqual(view.channels,channels);assert.equal(view.age,240+elapsed);
  assert.equal(view.receiverHealth,'PPM LAST VERIFIED 50 Hz');
 }
 assert.equal(setupInputSample(state,10000,10000).valid,false,'motor/RC freshness must remain strict');
});
test('a missed read keeps a bounded observation and never renews its receipt time',()=>{
 const state=packet();
 assert.equal(setupMonitorSample(state,10000,kit,12000).reported,true);
 const expired=setupMonitorSample(state,10000,kit,13501);
 assert.equal(expired.reported,false);assert.equal(expired.monitoring,false);assert.equal(expired.valid,false);
 assert.deepEqual(expired.channels,[]);assert.match(expired.receiverHealth,/UNVERIFIED/);
});
test('confirmed receiver loss clears channels immediately even if the previous sample was recent',()=>{
 const state=packet();state.ppm={...state.ppm,present:false,channels:null};
 const view=setupMonitorSample(state,10000,kit,10030);
 assert.equal(view.monitoring,false);assert.equal(view.valid,false);assert.deepEqual(view.channels,[]);
 assert.match(view.receiverHealth,/SIGNAL ABSENT/);
});
test('a newer absent status wins over an old motor reply and status age belongs to its actual source',()=>{
 const state=packet(),newKit={...kit,ppm:{present:false,channels:null},ppmObservedAt:10020};
 let view=setupMonitorSample(state,10000,newKit,10040);
 assert.deepEqual(view.channels,[]);assert.equal(view.receiverObservedAt,10020);
 const newerPacket={...state,ppm:{...state.ppm,seq:105},roundTripMs:10};
 view=setupMonitorSample(newerPacket,10100,newKit,10110);
 assert.equal(view.monitoring,true);assert.equal(view.receiverObservedAt,10090);
});
test('wrong Kit, reboot, selected path and future observations cannot reuse old channel values',()=>{
 const state=packet();
 for(const current of [{...kit,kitId:'ZFC-A2-OTHER'}, {...kit,bootId:'boot-2'}, {...kit,rcAccess:{controlPath:'ANDROID_AP'}}]){
  const view=setupMonitorSample(state,10000,current,10020);assert.equal(view.valid,false);assert.deepEqual(view.channels,[]);
 }
 assert.deepEqual(setupMonitorSample(state,10000,kit,9999).channels,[]);
});
test('an offline link may show historical values but cannot claim PPM health or input eligibility',()=>{
 const view=setupMonitorSample(packet(),10000,{...kit,connected:false},10100);
 assert.equal(view.reported,true);assert.equal(view.monitoring,false);assert.equal(view.valid,false);
 assert.match(view.receiverHealth,/KIT LINK OFFLINE/);
});
test('PPM monitor without RC ownership and Android samples remain separate from lost input',()=>{
 const state={...packet(),inputValid:false,inputSource:'NONE'};
 let view=setupMonitorSample(state,10000,kit,10050);
 assert.equal(view.monitoring,true);assert.equal(view.controlValid,false);assert.equal(view.valid,false);
 const phone={...state,selectedInput:'ANDROID_AP',inputSource:'ANDROID_AP',inputValid:true,inputAgeMs:10,roundTripMs:30};
 view=setupMonitorSample(phone,10000,{...kit,rcAccess:{controlPath:'ANDROID_AP'}},10020);
 assert.equal(view.valid,true);assert.equal(view.monitoring,true);assert.deepEqual(view.channels,channels);
 phone.inputValid=false;view=setupMonitorSample(phone,10000,{...kit,rcAccess:{controlPath:'ANDROID_AP'}},10020);
 assert.deepEqual(view.channels,[]);assert.equal(view.monitoring,false);
});
test('monitor health labels preserve the existing Live Inputs delayed telemetry contract',()=>{
 const k={...kit,ppm:packet().ppm,ppmObservedAt:10000};
 assert.equal(describePpmMonitorHealth(k,{source:'PPM',state:'stale'},{now:10200}),'PPM LAST VERIFIED 50 Hz • RC TELEMETRY DELAYED');
 assert.equal(describePpmMonitorHealth(k,{source:'PPM',state:'live'},{now:10200}),'PPM INPUT LIVE 50 Hz');
});
