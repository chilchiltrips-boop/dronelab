import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulator,stepSimulator,startSimulator,stopSimulator,setFlightMode,setPID,advanceSimulator,motorMix,thrustTorque,PLANT,STEP} from '../js/tripod-physics.js';
function bench(throttle=1500,env={}){const s=createSimulator();s.environment={...s.environment,batteryV:12.6,...env};for(const bank of Object.keys(s.pid))setPID(s,bank,{p:0,i:0,d:0});setFlightMode(s,'acro');startSimulator(s);s.throttle=throttle;return s}
const advance=(s,t)=>{for(let n=0;n<Math.round(t/STEP);n++)stepSimulator(s);return s};
test('actual motor shaft RPM follows exact first order lag, bounded monotonic, independently of requested RPM',()=>{
 const s=bench(1500);const target=PLANT.maxRPM*(PLANT.idle+(1-PLANT.idle)*.5);let previous=0;
 for(let n=1;n<=30;n++){stepSimulator(s);assert.ok(s.motorRPM[0]>=previous);assert.ok(s.motorRPM[0]<target);previous=s.motorRPM[0];assert.ok(Math.abs(s.motorRPM[0]-target*(1-Math.exp(-n*STEP/s.environment.lag)))<1e-8)}
 assert.ok(Math.abs(s.motorRPM[0]/target-(1-Math.exp(-1)))<1e-10);
 assert.equal(s.motorRequestedRPM[0],target);
});
test('doubling actual omega produces fourfold thrust, positive finite force with explicit SI coefficients',()=>{
 const a=advance(bench(1250),4),b=advance(bench((1000+((.31*2-PLANT.idle)/(1-PLANT.idle))*1000)),4);
 assert.ok(Math.abs(b.motorOmega[0]/a.motorOmega[0]-2)<1e-10);
 assert.ok(Math.abs(b.motorThrust[0]/a.motorThrust[0]-4)<1e-9);assert.ok(PLANT.kT>0&&PLANT.kQ>0);
});
test('throttle steps change force and constrained travel; down-step lag and damped recovery never detach the mast',()=>{
 const s=bench(1000);const stages=[];
 for(const throttle of [1000,1200,1400,1600,1900,1200,1000]){
  s.throttle=throttle;let max=0;
  for(let n=0;n<750;n++){stepSimulator(s);assert.ok(s.vertical.z>=0&&s.vertical.z<=PLANT.travel);assert.ok(Number.isFinite(s.vertical.acceleration));max=Math.max(max,s.vertical.z)}
  stages.push({throttle,rpm:s.motorRPM[0],force:s.vertical.thrust,z:s.vertical.z,max});
 }
 for(let n=1;n<5;n++){assert.ok(stages[n].rpm>stages[n-1].rpm);assert.ok(stages[n].force>stages[n-1].force)}
 assert.ok(stages[3].z>.01);assert.ok(stages[4].max<=PLANT.travel);assert.ok(stages[5].force<stages[4].force);assert.equal(stages[6].z,0);
 s.throttle=1800;advance(s,2);const before=s.motorRPM[0];s.throttle=1000;stepSimulator(s);assert.ok(s.motorRPM[0]<before&&s.motorRPM[0]>PLANT.maxRPM*PLANT.idle);
 stopSimulator(s);assert.deepEqual(s.motorRPM,[0,0,0,0]);assert.deepEqual(s.motorThrust,[0,0,0,0]);advance(s,3);assert.equal(s.vertical.z,0);
});
test('payload changes weight and mount deflection; battery scales omega and force; lag scales time response',()=>{
 const a=advance(bench(1700),3),b=advance(bench(1700,{payloadG:500}),3),c=advance(bench(1700,{batteryV:10.5}),3);
 assert.ok(b.vertical.weight>a.vertical.weight);assert.ok(b.vertical.z<a.vertical.z);assert.ok(c.motorRPM[0]<a.motorRPM[0]);assert.ok(c.vertical.thrust<a.vertical.thrust);
 const fast=advance(bench(1600,{lag:.04}),.12),slow=advance(bench(1600,{lag:.30}),.12);assert.ok(fast.motorRPM[0]>slow.motorRPM[0]);
});
test('mixer signs equal cross-product torque: roll +X up, pitch +Z down, yaw opposes actual rotor spin',()=>{
 const balanced=[1,1,1,1];assert.deepEqual(thrustTorque(balanced),[0,0,0]);
 assert.ok(thrustTorque(motorMix(50,10,0,0))[0]>0);assert.ok(thrustTorque(motorMix(50,0,10,0))[1]>0);assert.ok(thrustTorque(motorMix(50,0,0,10))[2]>0);
 assert.ok(thrustTorque([1,0,0,0])[2]<0);assert.ok(thrustTorque([0,1,0,0])[2]>0);
});
test('vertical state agrees at 30/60/120Hz rendering and extreme tuning remains finite at rig stops',()=>{
 const states=[30,60,120].map(fps=>{const s=bench(1700);for(let n=0;n<fps*3;n++)advanceSimulator(s,1/fps);return [s.vertical.z,s.vertical.velocity,s.motorRPM[0]]});
 for(const a of states)for(let n=0;n<a.length;n++)assert.ok(Math.abs(a[n]-states[0][n])<1e-7);
 const s=bench(1900);setPID(s,'rateRoll',{p:100,i:100,d:100});s.cmdRoll=1;advance(s,8);s.cmdRoll=-1;advance(s,8);assert.ok(Number.isFinite(s.rollRate));assert.ok(Math.abs(s.memory.rateRoll.sum)<=110);assert.ok(s.motorCommands.every(n=>n>=8&&n<=100));
});
