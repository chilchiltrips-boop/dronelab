import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../js/flight-telemetry.js';
import '../js/kit-access-policy.js';
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
test('AP/STA/USB fused tilt works with transmitter OFF and short delivery gaps hold only a labeled pose',()=>{
 for(const transport of ['sta','ap','usb']){
  const k=kit(transport),data=buildFlightData(k,1050);
  assert.deepEqual(data.tilt,{roll:30,pitch:0,fused:true,stationary:false,levelCalibrated:true});
  assert.equal(data.rc.state,'waiting');assert.equal(data.output.disabled,true);
  assert.equal(data.modeState.saved,'angle');assert.equal(data.imuAgeMs,74);
  const delayed=buildFlightData(k,1550);
  assert.equal(delayed.tilt,null);assert.equal(delayed.rates,null);assert.equal(delayed.sample,null);
  assert.deepEqual(delayed.lastTilt,{...data.tilt,delayed:true});
  assert.equal(delayed.health.imu.label,'Monitor delayed');
  assert.equal(delayed.output.fault,null);assert.equal(delayed.output.disabled,true);
  assert.equal(buildFlightData(k,3100).lastTilt,null);
  k.flightTelemetry=normalize({...snapshot(),sequence:101,sampleSequence:99,attitude:[40,5]},k,k.flightTelemetry,3100,20);
  const recovered=buildFlightData(k,3150);
  assert.equal(recovered.tilt.roll,40);assert.equal(recovered.lastTilt,null);
 }
 const k=kit();k.flightTelemetry.roundTripMs=400;
 const delayed=buildFlightData(k,1050);
 assert.equal(delayed.tilt,null);assert.equal(delayed.lastTilt.roll,30);assert.equal(delayed.telemetry.delayed,true);
});
test('invalid FC estimates and retired bindings never supply a held attitude',()=>{
 for(const patch of [{generation:2},{bootId:'b'.repeat(32)},{transport:'usb'},{kitId:'ZFC-A2-111111111111'},
  {valid:false},{ageUs:13000},{attitudeValid:false}]){
  const k=kit();Object.assign(k.flightTelemetry,patch);
  for(const now of [1050,1550]){
   const data=buildFlightData(k,now);
   assert.equal(data.tilt,null);assert.equal(data.lastTilt,null);
  }
 }
 const k=kit();Object.assign(k.flightTelemetry,{attitudeValid:false,state:'FAILSAFE',reason:'ATTITUDE_INVALID'});
 const fault=buildFlightData(k,1050);
 assert.equal(fault.health.attitude.label,'FC attitude invalid');assert.equal(fault.health.attitude.state,'error');
 assert.equal(fault.health.imu.state,'good');assert.equal(fault.output.fault,'ATTITUDE_INVALID');
 k.flightTelemetry.valid=false;
 assert.equal(buildFlightData(k,1050).health.imu.label,'FC IMU sample invalid');
 assert.equal(buildFlightData({...kit(),linkVerified:false},1550).lastTilt,null);
});
test('compact output fault and saved pending mode appear immediately, without authorizing control',()=>{
 const k=kit();Object.assign(k.flightTelemetry,{state:'FAILSAFE',reason:'IMU_STALE',flightModeState:{supported:true,saved:'angle',active:'acro',pending:'angle'}});
 const data=buildFlightData(k,1050);
 assert.equal(data.health.output.state,'error');assert.equal(data.modeState.pending,'angle');
 assert.equal(k.motorsDisabled,undefined); // presentation never mutates Kit authorization
});
test('compact FLIGHT owner remains armed in WebApp and Android while BENCH remains separate',()=>{
 const k=kit('ap');Object.assign(k.flightTelemetry,{owner:3,authorized:true,offAck:false,state:'ARMED',applied:[1000,1000,1000,1000]});
 k.flight={version:1,enabled:true,authorized:false,canArm:false,state:'DISARMED'};
 const data=buildFlightData(k,1050);
 assert.equal(data.output.armed,true);assert.equal(data.health.output.label,'Angle flight armed');
 const source=readFileSync('companion-network.js','utf8');
 const getter=source.slice(source.indexOf('function getState(){'),source.indexOf('function selectedInputAllowsAndroid()'));
 const context=vm.createContext({flightTelemetry:k.flightTelemetry,verifiedKitId:k.kitId,kitSnapshot:k,linkEpoch:1,link:'ap',
  online:true,onKitLink:true,controlLinkFresh:()=>true,window:{ZebjusKitAccessPolicy:globalThis.ZebjusKitAccessPolicy},
  rcSession:'active',controlAuthorized:true,connecting:false,controlPathBusy:false,otaBusy:false,kitSnapshotAt:1000,
  lastStatus:1000,statusFailures:0,Date:{now:()=>1050}});
 const current=vm.runInContext(getter+';getState()',context);
 assert.equal(current.motorsArmed,true);
 assert.equal(globalThis.ZebjusKitAccessPolicy.outputLabel(current,1050),'ANGLE FLIGHT ARMED');
 assert.equal(k.motorsArmed,undefined,'presentation must not mutate authorization state');
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

test('compact telemetry preserves CH5 active/requested modes independently of the saved default',()=>{
 const mode={supported:true,saved:'angle',active:'acro',pending:null,source:'PPM_CH5',requested:'acro',ch5Supported:true};
 assert.equal(normalize({...snapshot(),flightModeState:mode},binding).flightModeState.active,'acro');
 assert.equal(normalize({...snapshot(),flightModeState:{...mode,requested:'angle',pending:'angle'}},binding).flightModeState.pending,'angle');
 for(const change of [{pending:'angle'},{requested:'angle'},{source:'OTHER'},{ch5Supported:false}])
  assert.equal(normalize({...snapshot(),flightModeState:{...mode,...change}},binding),null);
});
