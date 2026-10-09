/* Standalone educational Tripod physics. No DOM, network, receivers or motors. */
export const STEP=0.004;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const degToRad=x=>x*Math.PI/180;
export const DEFAULT_PID={
 rateRoll:{p:.9,i:15,d:.03},ratePitch:{p:.9,i:15,d:.03},rateYaw:{p:3,i:15,d:0},
 angleRateRoll:{p:.9,i:15,d:.03},angleRatePitch:{p:.9,i:15,d:.03},angleRateYaw:{p:3,i:15,d:0},
 angleRoll:{p:3,i:0,d:0},anglePitch:{p:3,i:0,d:0}
};
export const DEFAULT_ENV={batteryV:12.2,payloadG:0,cgX:0,cgY:0,wind:0,lag:.12};
const copy=o=>JSON.parse(JSON.stringify(o));
const zeroPID=()=>({sum:0,last:0,ready:false,p:0,i:0,d:0,error:0,target:0,actual:0,output:0});
const wrap=a=>((a+180)%360+360)%360-180;
export function createSimulator(){
 return {running:false,mode:'angle',throttle:1000,cmdRoll:0,cmdPitch:0,cmdYaw:0,
 roll:0,pitch:0,yaw:0,rollRate:0,pitchRate:0,yawRate:0,
 targetRoll:0,targetPitch:0,targetRollRate:0,targetPitchRate:0,targetYawRate:0,
 trimRoll:0,trimPitch:0,environment:copy(DEFAULT_ENV),pid:copy(DEFAULT_PID),
 memory:Object.fromEntries(Object.keys(DEFAULT_PID).map(k=>[k,zeroPID()])),
 motors:[0,0,0,0],motorCommands:[0,0,0,0],lift:0,
 live:{bank:'rateRoll',...zeroPID()},time:0,accumulator:0};
}
export function clearPID(s){for(const key of Object.keys(s.memory))s.memory[key]=zeroPID();s.live={bank:'rateRoll',...zeroPID()}}
export function releaseInputs(s){s.cmdRoll=0;s.cmdPitch=0;s.cmdYaw=0}
export function stopSimulator(s){
 s.running=false;s.throttle=1000;releaseInputs(s);clearPID(s);
 s.motors.fill(0);s.motorCommands.fill(0);s.lift=0;s.accumulator=0;
 s.rollRate=0;s.pitchRate=0;s.yawRate=0;
 s.targetRollRate=0;s.targetPitchRate=0;s.targetYawRate=0;
}
export function startSimulator(s){
 if(s.running)return true;
 if(s.throttle>1025)return false;
 s.running=true;clearPID(s);return true;
}
export function resetSimulator(s){
 stopSimulator(s);s.roll=s.pitch=s.yaw=0;s.trimRoll=s.trimPitch=0;
 s.time=0;s.targetRoll=s.targetPitch=0;
}
export function setFlightMode(s,mode){
 if(mode!=='angle'&&mode!=='acro')return false;
 if(mode!==s.mode){s.mode=mode;clearPID(s)}
 return true;
}
export function setPID(s,bank,params){
 if(!Object.hasOwn(s.pid,bank))return false;
 if(!['p','i','d'].every(k=>Number.isFinite(params[k])&&params[k]>=0&&params[k]<=100))return false;
 s.pid[bank]={p:params.p,i:params.i,d:params.d};clearPID(s);return true;
}
export function calibrateLevel(s){s.trimRoll=clamp(s.roll,-45,45);s.trimPitch=clamp(s.pitch,-45,45);clearPID(s)}
export function disturb(s,roll,pitch){s.roll=clamp(roll,-38,38);s.pitch=clamp(pitch,-38,38);s.rollRate=0;s.pitchRate=0;clearPID(s)}
function computePID(s,bank,target,actual,outer=false){
 const memory=s.memory[bank],g=s.pid[bank],error=target-actual;
 memory.sum=clamp(memory.sum+error*STEP,outer?-45:-110,outer?45:110);
 const derivative=memory.ready?(error-memory.last)/STEP:0;
 memory.ready=true;memory.last=error;
 memory.p=g.p*error;memory.i=g.i*memory.sum*(outer?1:.012);
 memory.d=g.d*derivative;
 memory.error=error;memory.target=target;memory.actual=actual;
 memory.output=outer?clamp(memory.p+memory.i+memory.d,-220,220):memory.p+memory.i+memory.d;
 return memory.output;
}
export function stepSimulator(s){
 if(!s.running)return s;
 s.time+=STEP;
 const e=s.environment;
 const rateRoll=s.mode==='angle'?'angleRateRoll':'rateRoll';
 const ratePitch=s.mode==='angle'?'angleRatePitch':'ratePitch';
 const rateYaw=s.mode==='angle'?'angleRateYaw':'rateYaw';
 s.targetRoll=s.trimRoll+s.cmdRoll*26;
 s.targetPitch=s.trimPitch+s.cmdPitch*26;
 // Pure ACRO never references roll/pitch in computing requested rate.
 s.targetRollRate=s.mode==='acro'?s.cmdRoll*220:computePID(s,'angleRoll',s.targetRoll,s.roll,true);
 s.targetPitchRate=s.mode==='acro'?s.cmdPitch*220:computePID(s,'anglePitch',s.targetPitch,s.pitch,true);
 s.targetYawRate=s.cmdYaw*180;
 const uR=computePID(s,rateRoll,s.targetRollRate,s.rollRate);
 const uP=computePID(s,ratePitch,s.targetPitchRate,s.pitchRate);
 const uY=computePID(s,rateYaw,s.targetYawRate,s.yawRate);
 const authority=clamp((s.throttle-1050)/650,0,1);
 const battery=clamp(e.batteryV/12.6,.65,1)**2;
 const effectiveness=(.10+.90*authority)*battery;
 const inertia=1+e.payloadG/900;
 const wind=e.wind/100;
 // A stable, intentionally simple teaching plant, not physical aerodynamics.
 s.rollRate+=STEP*((uR*3.9*effectiveness/inertia)+(e.cgX*.11)+(wind*22*Math.sin(s.time*1.31))-(s.rollRate*.38));
 s.pitchRate+=STEP*((uP*3.9*effectiveness/(inertia*1.08))+(e.cgY*.11)+(wind*19*Math.cos(s.time*.91))-(s.pitchRate*.38));
 s.yawRate+=STEP*(uY*3.2*effectiveness/(inertia*1.35)-s.yawRate*.34);
 s.roll=clamp(s.roll+s.rollRate*STEP,-45,45);
 s.pitch=clamp(s.pitch+s.pitchRate*STEP,-45,45);
 s.yaw=wrap(s.yaw+s.yawRate*STEP);
 if(Math.abs(s.roll)>=45&&Math.sign(s.roll)===Math.sign(s.rollRate))s.rollRate=0;
 if(Math.abs(s.pitch)>=45&&Math.sign(s.pitch)===Math.sign(s.pitchRate))s.pitchRate=0;
 const base=clamp((s.throttle-1000)/10,0,100),rc=clamp(uR*.058,-36,36),pc=clamp(uP*.058,-36,36),yc=clamp(uY*.038,-26,26);
 const mixes=[base+rc-pc+yc,base-rc-pc-yc,base-rc+pc+yc,base+rc+pc-yc];
 const alpha=1-Math.exp(-STEP/clamp(e.lag,.04,.30));
 for(let i=0;i<4;i++){
   s.motorCommands[i]=clamp(mixes[i],0,100);
   s.motors[i]+=alpha*(s.motorCommands[i]-s.motors[i]);
 }
 s.lift=(base/100)**2*battery/(1+e.payloadG/1200);
 const loop=s.mode==='angle'?'angleRoll':rateRoll;
 s.live={bank:loop,...s.memory[loop]};
 return s;
}
export function advanceSimulator(s,dt){
 // Prevent huge background-tab catchup. All test frame cadences use the same 4ms steps.
 s.accumulator=Math.min(.064,s.accumulator+clamp(dt,0,.064));
 while(s.accumulator+1e-10>=STEP){stepSimulator(s);s.accumulator-=STEP}
 return s;
}
export function getSnapshot(s){
 return {running:s.running,mode:s.mode,throttle:s.throttle,roll:s.roll,pitch:s.pitch,yaw:s.yaw,
 rollRate:s.rollRate,pitchRate:s.pitchRate,yawRate:s.yawRate,
 targetRoll:s.targetRoll,targetPitch:s.targetPitch,targetRollRate:s.targetRollRate,targetPitchRate:s.targetPitchRate,
 targetYawRate:s.targetYawRate,motors:[...s.motors],lift:s.lift,environment:{...s.environment},live:{...s.live}};
}
