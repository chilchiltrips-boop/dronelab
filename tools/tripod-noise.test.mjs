import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulator,setPID,startSimulator,stepSimulator,DEFAULT_PID} from '../js/tripod-physics.js';
function noiseBench(d,noise){
 const s=createSimulator();s.mode='acro';s.environment.gyroNoise=noise;setPID(s,'rateRoll',{...DEFAULT_PID.rateRoll,d});startSimulator(s);s.throttle=1500;
 let previous=[0,0,0,0],sum=0,term=0,count=0;
 for(let n=0;n<2000;n++){stepSimulator(s);if(n>1500){for(let m=0;m<4;m++)sum+=(s.motorCommands[m]-previous[m])**2;term+=s.memory.rateRoll.d**2;count++;}previous=[...s.motorCommands];}
 return {jitter:Math.sqrt(sum/(count*4)),dRms:Math.sqrt(term/count)};
}
test('filtered high D amplifies measured seeded gyro-noise motor jitter, without canned vibration',()=>{
 const quiet=noiseBench(.16,0),low=noiseBench(0,.07),high=noiseBench(.16,.07);
 assert.equal(quiet.jitter,0);assert.equal(quiet.dRms,0);assert.equal(low.dRms,0);
 assert.ok(high.dRms>.1);assert.ok(high.jitter>low.jitter*2,JSON.stringify({low,high}));
 assert.deepEqual(noiseBench(.16,.07),high);
});
