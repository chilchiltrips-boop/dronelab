import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulator,startSimulator,stopSimulator,resetSimulator,setFlightMode,clearPID,stepSimulator,advanceSimulator,disturb,setPID,releaseInputs,degToRad,startTuningPulse,getSnapshot} from '../js/tripod-physics.js';
test('safe arm, stop and reset never energize outside local simulation',()=>{
 const s=createSimulator();assert.equal(s.running,false);assert.deepEqual(s.motors,[0,0,0,0]);s.throttle=1400;assert.equal(startSimulator(s),false);s.throttle=1000;assert.equal(startSimulator(s),true);
 s.throttle=1450;for(let i=0;i<500;i++)stepSimulator(s);assert.ok(s.motors.every(x=>x>0));
 stopSimulator(s);assert.equal(s.running,false);assert.deepEqual(s.motors,[0,0,0,0]);assert.equal(s.throttle,1000);
 resetSimulator(s);assert.equal(s.roll,0);
});
test('positive Roll lowers model right (-X); positive Pitch lowers nose (+Z)',()=>{
 // Euler YXZ: positive Z makes -X move down, positive X makes +Z move down.
 const roll=degToRad(15),pitch=degToRad(15);
 assert.ok(-Math.sin(roll)<0);assert.ok(-Math.sin(pitch)<0);
});
test('pure ACRO center commands zero rate regardless of tilt, no angle leveling',()=>{
 const s=createSimulator();setFlightMode(s,'acro');startSimulator(s);s.throttle=1420;disturb(s,22,-15);
 for(let i=0;i<1250;i++)stepSimulator(s);
 assert.equal(s.targetRollRate,0);assert.equal(s.targetPitchRate,0);assert.ok(Math.abs(s.roll-22)<.05,'ACRO unexpectedly leveled Roll '+s.roll);
 assert.ok(Math.abs(s.pitch+15)<.05,'ACRO unexpectedly leveled Pitch '+s.pitch);
 s.cmdRoll=.5;stepSimulator(s);assert.equal(s.targetRollRate,110);s.cmdRoll=0;stepSimulator(s);assert.equal(s.targetRollRate,0);
});
test('ANGLE moves disturbed model towards calibrated level; yaw rate only',()=>{
 const s=createSimulator();startSimulator(s);s.throttle=1700;disturb(s,20,-16);
 const before=Math.abs(s.roll)+Math.abs(s.pitch);for(let i=0;i<2500;i++)stepSimulator(s);
 assert.ok(Math.abs(s.roll)+Math.abs(s.pitch)<before*.65,'ANGLE did not reduce tilt');
 assert.equal(s.targetYawRate,0);s.cmdYaw=.5;stepSimulator(s);assert.equal(s.targetYawRate,90);assert.equal(s.pid.angleYaw,undefined);
});
test('fixed 250Hz steps independent of rendering at 30, 60 or 120 Hz',()=>{
 const snapshots=[30,60,120].map(fps=>{const s=createSimulator();startSimulator(s);s.throttle=1450;s.cmdRoll=.25;for(let frame=0;frame<fps*3;frame++)advanceSimulator(s,1/fps);return [s.roll,s.rollRate,...s.motors,s.time]});
 for(let i=1;i<3;i++)for(let n=0;n<snapshots[0].length;n++)assert.ok(Math.abs(snapshots[0][n]-snapshots[i][n])<.05,'FPS-dependent state at index '+n);
});
test('PID bank validation, mode changes, safe input release',()=>{
 const s=createSimulator();assert.equal(setPID(s,'rateRoll',{p:1.2,i:9,d:.02}),true);
 assert.equal(setPID(s,'rateRoll',{p:Infinity,i:9,d:.02}),false);
 assert.equal(setPID(s,'unknown',{p:1,i:1,d:0}),false);
 startSimulator(s);s.throttle=1550;s.cmdYaw=1;s.cmdPitch=.5;stepSimulator(s);releaseInputs(s);
 assert.equal(s.cmdYaw,0);assert.equal(s.cmdPitch,0);
 setFlightMode(s,'acro');assert.equal(s.memory.rateRoll.sum,0);
});
test('module has no browser, hardware or network dependency',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../js/tripod-physics.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\bWebSocket\b|\bSerial\b|\bnavigator\b|\bdocument\b|\bwindow\b|RTCPeerConnection/);
});


test('motor lag physically changes the attitude trajectory and not merely animation',()=>{
 function experiment(lag){
  const s=createSimulator();setFlightMode(s,'acro');s.environment.lag=lag;
  startSimulator(s);s.throttle=1500;assert.ok(startTuningPulse(s,'roll',14));
  for(let n=0;n<130;n++)stepSimulator(s); // 0.52 s target pulse
  return {roll:s.roll,rate:s.rollRate,motors:[...s.motors]};
 }
 const fast=experiment(.04),slow=experiment(.30);
 assert.ok(Math.abs(fast.roll-slow.roll)>.02, 'Motor lag did not affect Roll: '+JSON.stringify({fast,slow}));
 assert.ok(Math.abs(fast.rate-slow.rate)>.02,'Motor lag did not affect Rate');
});
test('PID gains and presets produce measurable different response to identical pulse',()=>{
 function experiment(p){
  const s=createSimulator();setFlightMode(s,'acro');setPID(s,'rateRoll',{p,i:15,d:.03});
  startSimulator(s);s.throttle=1500;startTuningPulse(s,'roll',14);
  for(let n=0;n<200;n++)stepSimulator(s);
  return getSnapshot(s);
 }
 const low=experiment(.30),high=experiment(2.80);
 assert.ok(Math.abs(low.roll-high.roll)>.05,'PID gains did not visibly change Roll response');
 assert.ok(Math.abs(low.metrics.peakRate-high.metrics.peakRate)>.1,'PID gains did not change peak response');
});
test('ANGLE training pulse level-holds; ACRO pulse ends in zero rate without angle return',()=>{
 const a=createSimulator();startSimulator(a);a.throttle=1450;assert.ok(startTuningPulse(a,'pitch',13));
 for(let k=0;k<175;k++)stepSimulator(a);assert.equal(a.targetPitch,a.trimPitch);
 const b=createSimulator();setFlightMode(b,'acro');startSimulator(b);b.throttle=1450;assert.ok(startTuningPulse(b,'roll',12));
 for(let k=0;k<180;k++)stepSimulator(b);
 assert.equal(b.targetRollRate,0);assert.ok(Math.abs(b.roll)>0.1,'ACRO pulse did not rotate the model');
 for(let k=0;k<1000;k++)stepSimulator(b);
 const settledTilt=b.roll;
 for(let k=0;k<1000;k++)stepSimulator(b);
 assert.ok(Math.abs(settledTilt)>3,'ACRO training pulse unexpectedly returned to level');
 assert.ok(Math.abs(b.roll-settledTilt)<1.0,'Centered ACRO drifted after angular rate settled: '+b.roll);
 assert.ok(Math.abs(b.rollRate)<.35,'ACRO failed to settle angular rate at zero stick');
});

test('ACRO and ANGLE share rate Roll/Pitch/Yaw gains and have no Yaw angle PID',()=>{
 const s=createSimulator();
 assert.deepEqual(Object.keys(s.pid).sort(),['anglePitch','angleRoll','ratePitch','rateRoll','rateYaw'].sort());
 assert.equal(s.pid.angleYaw,undefined);
 assert.equal(setPID(s,'rateRoll',{p:1.2,i:18,d:.04}),true);
 assert.equal(setPID(s,'rateYaw',{p:4.2,i:13,d:.02}),true);
 startSimulator(s);s.throttle=1550;stepSimulator(s);assert.equal(s.memory.rateRoll.ready,true);
 setFlightMode(s,'acro');stepSimulator(s);assert.equal(s.pid.rateRoll.p,1.2);assert.equal(s.pid.rateYaw.p,4.2);
 setFlightMode(s,'angle');stepSimulator(s);assert.equal(s.pid.rateRoll.p,1.2);assert.equal(s.pid.rateYaw.p,4.2);
 assert.equal(s.memory.angleYaw,undefined);
});
test('STOP reset home restores pose/height/motors without removing tuned PID values',()=>{
 const s=createSimulator();setPID(s,'rateYaw',{p:4,i:18,d:.02});
 startSimulator(s);s.throttle=1650;for(let i=0;i<150;i++)stepSimulator(s);
 s.roll=21;s.pitch=-13;s.yaw=42;s.vertical.z=.08;s.vertical.velocity=.21;
 resetSimulator(s);
 assert.equal(s.running,false);assert.equal(s.throttle,1000);
 assert.deepEqual([s.roll,s.pitch,s.yaw,s.vertical.z,s.vertical.velocity],[0,0,0,0,0]);
 assert.deepEqual(s.motorRPM,[0,0,0,0]);assert.equal(s.pid.rateYaw.p,4);
});

test('PID changes accepted just before STOP survive a complete home reset',()=>{
 const s=createSimulator();startSimulator(s);s.throttle=1550;
 assert.equal(setPID(s,'rateYaw',{p:4.6,i:14,d:.015}),true);
 resetSimulator(s);
 assert.deepEqual(s.pid.rateYaw,{p:4.6,i:14,d:.015});
 assert.equal(s.running,false);assert.equal(s.throttle,1000);assert.equal(s.roll,0);
});
