import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/flight-telemetry.js';
import {buildFlightData,appendFlightSample} from '../js/flight-data-model.js';
const {normalize}=globalThis.ZebjusFlightTelemetry;
const binding={kitId:'ZFC-A2-012345ABCDEF',bootId:'a'.repeat(32),connectionGeneration:1,transport:'sta'};
const snapshot=()=>({version:1,kitId:binding.kitId,bootId:binding.bootId,sequence:100,sampleSequence:98,atUs:400000,ageUs:4000,
 valid:true,rates:[1,2,3],gravity:[0,.5,.866],attitude:[30,0],attitudeValid:true,levelCalibrated:true,accelUsed:true,
 offAck:true,authorized:false,deadlineFault:false,owner:0,state:'DISARMED',reason:'NONE',applied:[0,0,0,0],
 dtUs:4000,measuredHz:250,missedTicks:0,flightModeState:{supported:true,saved:'angle',active:'angle',pending:null}});
const kit=(transport='sta')=>({...binding,transport,connected:true,linkVerified:true,linkState:'connected',board:'ZFC-A2',
 rcAccess:{pathVersion:1,controlPath:'PPM'},rc:{source:'NONE',active:false,inputArmed:false},rcAt:1000,
 ppm:{present:false},ppmObservedAt:1000,flight:{enabled:true,qualified:false},
 flightTelemetry:normalize(snapshot(),{...binding,transport},null,1000,20)});
test('compact telemetry validates identity, boot, finite data and output consistency',()=>{
 assert.ok(normalize(snapshot(),binding));
 for(const patch of [{kitId:'other'},{bootId:'b'.repeat(32)},{rates:[NaN,0,0]},{attitude:[0,Infinity]},
  {offAck:true,applied:[1000,0,0,0]},{authorized:true},{owner:4},{flightModeState:{supported:true,saved:'acro',active:'angle',pending:null}}])
  assert.equal(normalize({...snapshot(),...patch},binding),null);
});
test('duplicate/out-of-order packets never renew sample freshness; reconnect rebinds counters',()=>{
 const first=normalize(snapshot(),binding,null,1000,20);
 assert.equal(normalize(snapshot(),binding,first,1100,20),first);
 assert.equal(normalize({...snapshot(),sequence:99},binding,first,1100,20),null);
 const repeated=normalize({...snapshot(),sequence:101},binding,first,1100,20);
 assert.equal(repeated.sampleObservedAt,1000);
 assert.equal(normalize({...snapshot(),sequence:2},{...binding,connectionGeneration:2},first,1100,20).sampleObservedAt,1100);
});
test('AP/STA/USB fused tilt works with transmitter OFF and expires on stale IMU or excessive delay',()=>{
 for(const transport of ['sta','ap','usb']){
  const data=buildFlightData(kit(transport),1050);
  assert.deepEqual(data.tilt,{roll:30,pitch:0,fused:true,stationary:false,levelCalibrated:true});
  assert.equal(data.rc.state,'waiting');assert.equal(data.output.disabled,true);
  assert.equal(data.modeState.saved,'angle');assert.equal(data.imuAgeMs,74);
  assert.equal(buildFlightData(kit(transport),1550).tilt,null);
 }
 const k=kit();k.flightTelemetry.roundTripMs=400;
 assert.equal(buildFlightData(k,1050).tilt,null);
 for(const patch of [{generation:2},{bootId:'b'.repeat(32)},{transport:'usb'},{valid:false},{attitudeValid:false}]){
  const k=kit();Object.assign(k.flightTelemetry,patch);assert.equal(buildFlightData(k,1050).tilt,null);
 }
});
test('compact output fault and saved pending mode appear immediately, without authorizing control',()=>{
 const k=kit();Object.assign(k.flightTelemetry,{state:'FAILSAFE',reason:'IMU_STALE',flightModeState:{supported:true,saved:'angle',active:'acro',pending:'angle'}});
 const data=buildFlightData(k,1050);
 assert.equal(data.health.output.state,'error');assert.equal(data.modeState.pending,'angle');
 assert.equal(k.motorsDisabled,undefined); // presentation never mutates Kit authorization
});
test('ten Hz rate chart retains a full sixty-second history, bounded to 1200 points',()=>{
 let history=[];
 for(let n=0;n<1300;n++){
  const k=kit();k.flightTelemetry=normalize({...snapshot(),sequence:n+1,sampleSequence:n+1},binding,null,1000+n*100,20);
  history=appendFlightSample(history,buildFlightData(k,1000+n*100));
 }
 assert.equal(history.length,1200);
 assert.ok(history.at(-1).at-history[0].at>=60000);
});
