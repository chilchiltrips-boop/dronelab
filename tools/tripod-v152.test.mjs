import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulator,startSimulator,stepSimulator,setFlightMode,setPID,disturb,startTuningPulse,resetIntegrators} from '../js/tripod-physics.js';
import {simulateResponse} from '../js/tripod-experiments.js';
import {MOTOR_LAYOUT} from '../js/tripod-assembly-model.js';
const compare=(bank,gain,a,b,mode)=>simulateResponse({bank,gain,values:[a,b],mode,axis:'roll',duration:gain==='i'?5:6});
test('Assembly model preserves physical F450 four-motor order and CW/CCW',()=>{
 assert.deepEqual(MOTOR_LAYOUT.map(m=>m.id),['M1','M2','M3','M4']);
 assert.deepEqual(MOTOR_LAYOUT.map(m=>m.spin),[1,-1,1,-1]);
});
test('different Rate P gains create actual transient and overshoot differences',()=>{
 const r=compare('rateRoll','p',.3,2.8,'acro');
 assert.ok(r.results[1].metrics.peakRate>r.results[0].metrics.peakRate+10);
 assert.ok(r.results[1].metrics.reversals!==r.results[0].metrics.reversals);
});
test('I gain corrects more of the same persistent body torque, not acting like P',()=>{
 const r=compare('rateRoll','i',1,35,'acro');
 assert.equal(r.scenario,'bias');
 assert.ok(r.results[1].metrics.lateError<r.results[0].metrics.lateError*.85,
 'I gain had no steady bias correction '+JSON.stringify(r.results.map(x=>x.metrics)));
 assert.ok(Math.abs(r.results[1].metrics.integral)>Math.abs(r.results[0].metrics.integral));
});
test('D gain changes actual response damping',()=>{
 const r=compare('rateRoll','d',0,.2,'acro');
 assert.ok(r.results[1].metrics.overshoot<r.results[0].metrics.overshoot,
 'D gain failed to change actual overshoot');
});
test('Angle outer P vs Rate inner P are independent and produce distinct cascaded response',()=>{
 const outer=compare('angleRoll','p',1,6,'angle'),inner=compare('angleRateRoll','p',.3,2.4,'angle');
 assert.ok(Math.abs(outer.results[0].metrics.peakRate-outer.results[1].metrics.peakRate)>1,'Outer P no measurable response');
 assert.ok(Math.abs(inner.results[0].metrics.peakRate-inner.results[1].metrics.peakRate)>1,'Inner P no measurable response');
 assert.notEqual(outer.results[0].metrics.rms,inner.results[0].metrics.rms);
});
test('PID apply while running retains throttle, attitude, actual motors and integrators reset separately',()=>{
 const s=createSimulator();assert.ok(startSimulator(s));s.throttle=1560;disturb(s,10,-6);for(let t=0;t<125;t++)stepSimulator(s);
 const oldMotors=[...s.motors],oldPose=[s.roll,s.pitch];
 assert.ok(setPID(s,'angleRateRoll',{p:1.35,i:15,d:.035}));
 assert.ok(s.running);assert.equal(s.throttle,1560);
 assert.deepEqual(s.motors,oldMotors);assert.deepEqual([s.roll,s.pitch],oldPose);
 stepSimulator(s);assert.ok(s.memory.angleRateRoll.ready);
 resetIntegrators(s);assert.equal(s.memory.angleRateRoll.sum,0);assert.ok(s.running);
});
test('each physical motor thrust obeys approximate RPM-squared scaling',()=>{
 const s=createSimulator();startSimulator(s);s.throttle=1500;for(let i=0;i<200;i++)stepSimulator(s);
 for(let i=0;i<4;i++)assert.ok(Math.abs(s.motorThrust[i]-8*(s.motorRPM[i]/8500)**2)<1e-6);
});
test('ACRO no-angle-hold; Angle cascade returns to target',()=>{
 const a=createSimulator();setFlightMode(a,'acro');startSimulator(a);a.throttle=1500;disturb(a,17,-12);
 for(let i=0;i<1500;i++)stepSimulator(a);
 assert.ok(Math.abs(a.roll-17)<1);
 const b=createSimulator();startSimulator(b);b.throttle=1700;disturb(b,17,-12);
 for(let i=0;i<1500;i++)stepSimulator(b);
 assert.ok(Math.abs(b.roll)<3 && Math.abs(b.pitch)<3);
});
test('Identical seeded virtual experiments give identical trajectories',()=>{
 const A=compare('rateRoll','p',.4,2,'acro'),B=compare('rateRoll','p',.4,2,'acro');
 assert.deepEqual(A.results[0].samples,B.results[0].samples);
});
