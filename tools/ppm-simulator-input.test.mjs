import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAcceptedInput} from '../js/live-inputs.js';
import {createInputStore,createSimulatorInput,KIT_MIRROR_MAX_AGE_MS} from '../js/simulator-input.js';
import {createSimulator,advanceSimulator} from '../js/tripod-physics.js';

function bench(board='A2',transport='sta'){
 let now=1000,stops=0;
 const kit={connected:true,kitId:'ZFC-'+board+'-012345ABCDEF',transport,bootId:'boot-1',
  flightMode:'angle',flightModeState:{saved:'angle',active:'angle',pending:null}};
 const store=createInputStore({now:()=>now}),s=createSimulator();
 const input=createSimulatorInput(s,store,{onTimeout:()=>stops++});
 function send(seq=1,extra={}){
  const rc={kitId:kit.kitId,source:'PPM',transport:'PPM',ownerId:'PPM',seq,accepted:seq,
   active:true,inputValid:true,failsafe:false,inputArmed:false,ageMs:0,
   throttle:1000,roll:1500,pitch:1500,yaw:1500,ch5:1000,ch6:1500,
   channels:[1500,1500,1000,1500,1000,1500,1500,1500],...extra};
  return store.acceptKit({kit,input:normalizeAcceptedInput(kit,{kitId:kit.kitId,rc,at:now},{now})});
 }
 return {kit,store,s,input,send,stops:()=>stops,advance:ms=>{now+=ms;input.tick()}};
}

for(const board of ['A1','A2'])for(const transport of ['sta','ap','usb']){
 test(board+' accepted PPM over '+transport+' previews and drives virtual PID without hardware ARM',()=>{
  const b=bench(board,transport);
  assert.equal(b.send(1,{roll:1750,pitch:1250,yaw:1600}),true);
  let v=b.input.snapshot();
  assert.equal(v.activeSource,'ppm');assert.equal(v.input.source,'PPM');
  assert.equal(v.input.transport,transport);assert.equal(v.input.inputArm,'DISARMED');
  assert.deepEqual(v.previewAxes,{roll:.5,pitch:-.5,yaw:.2});
  assert.equal(b.s.running,false);assert.equal(b.s.cmdRoll,0);
  assert.equal(b.input.start().accepted,true);
  b.send(2,{throttle:1700,roll:1750,pitch:1250,yaw:1600});
  assert.equal(b.s.throttle,1700);assert.equal(b.s.cmdRoll,.5);assert.equal(b.s.cmdPitch,-.5);assert.equal(b.s.cmdYaw,.2);
  advanceSimulator(b.s,.08);assert.ok(b.s.motorRPM.some(n=>n>0));
  assert.equal(b.input.setChoice('web'),false);
  b.input.stop();b.send(3,{inputArmed:true});
  assert.equal(b.s.running,false,'radio ARM and incoming frames never start the virtual plant');
 });
}

test('explicit PPM needs an accepted verified receiver and low throttle; Auto prefers physical PPM over Android preview',()=>{
 const b=bench();assert.equal(b.input.setChoice('ppm'),true);
 assert.equal(b.input.start().accepted,false);assert.match(b.input.snapshot().reason,/accepted PPM/);
 b.kit.connected=false;assert.equal(b.send(),false);b.kit.connected=true;
 assert.equal(b.send(1,{roll:2200}),false);
 b.send(1,{source:'WEB',ownerId:'WEB'});assert.equal(b.input.start().accepted,false);
 b.send(2,{throttle:1050});assert.equal(b.input.start().accepted,false);
 assert.match(b.input.snapshot().reason,/LOWER THROTTLE/);
 b.send(3,{throttle:1025});assert.equal(b.input.start().accepted,true);b.input.stop();
 b.input.setChoice('auto');
 b.store.setPeer({connected:true,approved:true,supported:true,sessionId:'paired-session-0123'});
 b.store.accept({mirrorVersion:1,sessionId:'paired-session-0123',seq:1,transport:'preview',kind:'android-preview',kitId:'',
  inputAgeMs:0,channels:{throttle:1000,roll:2000,pitch:1500,yaw:1500}});
 assert.equal(b.input.snapshot().activeSource,'ppm');
 assert.equal(b.input.snapshot().input.channels.roll,1500);
});

test('reported PPM signal loss stops and neutralizes the virtual plant; reacquisition needs explicit Run',()=>{
 const b=bench();b.send();b.input.start();b.send(2,{throttle:1800});
 b.send(3,{active:false,inputValid:false,failsafe:true,source:'NONE'});
 assert.equal(b.s.running,false);assert.equal(b.s.throttle,1000);assert.equal(b.stops(),1);
 assert.match(b.input.snapshot().lastStopReason,/PPM input lost/);
 b.send(4);assert.equal(b.s.running,false);
 assert.equal(b.input.start().accepted,true);
});

test('delayed or repeated PPM telemetry never renews freshness or holds virtual throttle indefinitely',()=>{
 const b=bench();b.send(5);b.input.start();b.send(6,{throttle:1750});
 b.advance(450);assert.equal(b.send(6,{throttle:1750}),false);
 assert.equal(b.s.running,true,'a short poll delay can use the bounded mirror grace');
 const delayed={state:'stale',source:'PPM',ownerId:'PPM'};
 assert.equal(b.store.acceptKit({kit:b.kit,input:delayed}),false);
 assert.equal(b.s.running,true);
 b.advance(KIT_MIRROR_MAX_AGE_MS-449);
 assert.equal(b.s.running,false);assert.equal(b.s.throttle,1000);assert.equal(b.stops(),1);
 b.send(7);assert.equal(b.s.running,false);
});

test('PPM lock never hands over to another Kit, transport, boot or accepted producer',()=>{
 for(const change of [b=>b.kit.kitId='ZFC-A1-FFFFFFFFFFFF',b=>b.kit.transport='ap',b=>b.kit.bootId='boot-2',
  b=>b.send(2,{source:'ANDROID',ownerId:'Android'})]){
  const b=bench();b.send();b.input.start();b.send(2,{throttle:1600});change(b);b.send(3);
  assert.equal(b.s.running,false);assert.equal(b.s.throttle,1000);assert.equal(b.stops(),1);
 }
 const b=bench();b.send(1,{source:'ANDROID',ownerId:'Android'});b.input.start();
 b.send(2);assert.equal(b.s.running,false,'Android lock cannot silently retain an old command when PPM replaces the producer');
});

test('PPM does not replace an explicitly selected running WebApp simulator',()=>{
 const b=bench();b.input.setChoice('web');b.input.start();b.s.throttle=1400;
 b.send(1,{throttle:1900});assert.equal(b.s.running,true);
 assert.equal(b.input.snapshot().activeSource,'web');assert.equal(b.s.throttle,1400);
});
