import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulator,startSimulator,stopSimulator,resetSimulator,setFlightMode,clearPID,stepSimulator,advanceSimulator,disturb,setPID,releaseInputs,degToRad} from '../js/tripod-physics.js';
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
