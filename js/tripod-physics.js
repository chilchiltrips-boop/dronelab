/* Browser-only educational tripod control plant, with actual motor-lag feedback. */
export const STEP=.004;
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const degToRad=d=>d*Math.PI/180;
export const DEFAULT_PID={
 rateRoll:{p:.9,i:15,d:.03},ratePitch:{p:.9,i:15,d:.03},rateYaw:{p:3,i:15,d:0},
 angleRateRoll:{p:.9,i:15,d:.03},angleRatePitch:{p:.9,i:15,d:.03},angleRateYaw:{p:3,i:15,d:0},
 angleRoll:{p:3,i:0,d:0},anglePitch:{p:3,i:0,d:0}
};
export const DEFAULT_ENV={batteryV:12.2,payloadG:0,cgX:0,cgY:0,wind:0,lag:.12};
const copy=x=>JSON.parse(JSON.stringify(x));
const zeroPID=()=>({sum:0,last:0,ready:false,p:0,i:0,d:0,error:0,target:0,actual:0,output:0});
const wrap=v=>((v+180)%360+360)%360-180;
export function createSimulator(){
 return {running:false,mode:'angle',throttle:1000,cmdRoll:0,cmdPitch:0,cmdYaw:0,
 roll:0,pitch:0,yaw:0,rollRate:0,pitchRate:0,yawRate:0,
 gyroRoll:0,gyroPitch:0,gyroYaw:0,trimRoll:0,trimPitch:0,
 targetRoll:0,targetPitch:0,targetRollRate:0,targetPitchRate:0,targetYawRate:0,
 environment:copy(DEFAULT_ENV),pid:copy(DEFAULT_PID),memory:Object.fromEntries(Object.keys(DEFAULT_PID).map(k=>[k,zeroPID()])),
 motors:[0,0,0,0],motorCommands:[0,0,0,0],motorTorque:[0,0,0],lift:0,
 pulse:null,metrics:{rmsError:0,peakRate:0,motorSpread:0,ringing:0,liveError:0,samples:0,previousSign:0,lastCross:0},time:0,accumulator:0,live:{bank:'rateRoll',...zeroPID()}};
}
export function clearPID(s){for(const key of Object.keys(s.memory))s.memory[key]=zeroPID();s.live={bank:'rateRoll',...zeroPID()}}
export function releaseInputs(s){s.cmdRoll=s.cmdPitch=s.cmdYaw=0}
export function stopSimulator(s){
 s.running=false;s.throttle=1000;s.pulse=null;releaseInputs(s);clearPID(s);
 s.motors.fill(0);s.motorCommands.fill(0);s.motorTorque.fill(0);s.lift=s.accumulator=0;
 s.rollRate=s.pitchRate=s.yawRate=0;s.gyroRoll=s.gyroPitch=s.gyroYaw=0;
 s.targetRollRate=s.targetPitchRate=s.targetYawRate=0;
}
export function startSimulator(s){
 if(s.running)return true;if(s.throttle>1025)return false;
 s.running=true;clearPID(s);return true;
}
export function resetSimulator(s){
 stopSimulator(s);s.roll=s.pitch=s.yaw=0;s.trimRoll=s.trimPitch=0;s.time=0;
 s.targetRoll=s.targetPitch=0;resetMetrics(s);
}
export function setFlightMode(s,mode){
 if(mode!=='angle'&&mode!=='acro')return false;
 if(s.mode!==mode){s.mode=mode;s.pulse=null;clearPID(s);resetMetrics(s)}
 return true;
}
export function setPID(s,bank,params){
 if(!Object.hasOwn(s.pid,bank))return false;
 if(!['p','i','d'].every(k=>Number.isFinite(params[k])&&params[k]>=0&&params[k]<=100))return false;
 s.pid[bank]={p:params.p,i:params.i,d:params.d};clearPID(s);resetMetrics(s);return true;
}
export function calibrateLevel(s){s.trimRoll=clamp(s.roll,-45,45);s.trimPitch=clamp(s.pitch,-45,45);clearPID(s)}
export function disturb(s,roll,pitch){
 s.roll=clamp(roll,-38,38);s.pitch=clamp(pitch,-38,38);
 s.rollRate=s.pitchRate=s.gyroRoll=s.gyroPitch=0;clearPID(s);
}
export function resetMetrics(s){s.metrics={rmsError:0,peakRate:0,motorSpread:0,ringing:0,liveError:0,samples:0,previousSign:0,lastCross:0}}
export function startTuningPulse(s,axis='roll',amplitude=14){
 if(!s.running||s.throttle<1250||!['roll','pitch','yaw'].includes(axis))return false;
 s.pulse={axis,start:s.time,until:s.time+.56,amplitude:clamp(amplitude,3,25)};
 clearPID(s);resetMetrics(s);return true;
}
function computePID(s,bank,target,actual,outer=false){
 const m=s.memory[bank],g=s.pid[bank],error=target-actual;
 m.sum=clamp(m.sum+error*STEP,outer?-45:-110,outer?45:110);
 // Anti-windup: at neutral rate setpoint, reject residual gyro/integral bias.
 if(!outer&&Math.abs(target)<1&&Math.abs(actual)<6)m.sum*=.99;
 const derivative=m.ready?(error-m.last)/STEP:0;
 m.ready=true;m.last=error;m.p=g.p*error;m.i=g.i*m.sum*(outer?1:.012);m.d=g.d*derivative;
 m.error=error;m.target=target;m.actual=actual;
 m.output=outer?clamp(m.p+m.i+m.d,-220,220):clamp(m.p+m.i+m.d,-750,750);
 return m.output;
}
export function stepSimulator(s){
 if(!s.running)return s;
 s.time+=STEP;
 const e=s.environment,armed=s.throttle>1050;
 const pulse=s.pulse&&s.time<s.pulse.until?s.pulse:null;
 if(s.pulse&&s.time>=s.pulse.until)s.pulse=null;
 const angleBonus=axis=>pulse&&pulse.axis===axis?(pulse.amplitude):0;
 const rateBonus=axis=>pulse&&pulse.axis===axis?(axis==='yaw'?pulse.amplitude*6:pulse.amplitude*4):0;
 const rKey=s.mode==='angle'?'angleRateRoll':'rateRoll',pKey=s.mode==='angle'?'angleRatePitch':'ratePitch',yKey=s.mode==='angle'?'angleRateYaw':'rateYaw';
 s.targetRoll=s.trimRoll+s.cmdRoll*26+(s.mode==='angle'?angleBonus('roll'):0);
 s.targetPitch=s.trimPitch+s.cmdPitch*26+(s.mode==='angle'?angleBonus('pitch'):0);
 // Pure ACRO: NEVER capture an attitude / steer toward trim. Zero stick+no pulse = 0 dps.
 s.targetRollRate=s.mode==='acro'?s.cmdRoll*220+rateBonus('roll'):computePID(s,'angleRoll',s.targetRoll,s.roll,true);
 s.targetPitchRate=s.mode==='acro'?s.cmdPitch*220+rateBonus('pitch'):computePID(s,'anglePitch',s.targetPitch,s.pitch,true);
 s.targetYawRate=s.cmdYaw*180+rateBonus('yaw');
 const gyroAlpha=1-Math.exp(-STEP/.024);
 s.gyroRoll+=(s.rollRate-s.gyroRoll)*gyroAlpha;
 s.gyroPitch+=(s.pitchRate-s.gyroPitch)*gyroAlpha;
 s.gyroYaw+=(s.yawRate-s.gyroYaw)*gyroAlpha;
 const noise=.045+(e.wind/100)*.035,measurement=s.time*81.7;
 const uR=computePID(s,rKey,s.targetRollRate,s.gyroRoll+noise*Math.sin(measurement));
 const uP=computePID(s,pKey,s.targetPitchRate,s.gyroPitch+noise*Math.cos(measurement*1.11));
 const uY=computePID(s,yKey,s.targetYawRate,s.gyroYaw+noise*.4*Math.sin(measurement*.85));
 const base=armed?clamp((s.throttle-1000)/10,0,100):0;
 const rc=clamp(uR*.058,-40,40),pc=clamp(uP*.058,-40,40),yc=clamp(uY*.038,-28,28);
 const mix=[base+rc-pc+yc,base-rc-pc-yc,base-rc+pc+yc,base+rc+pc-yc];
 const alpha=1-Math.exp(-STEP/clamp(e.lag,.04,.30));
 for(let i=0;i<4;i++){
   s.motorCommands[i]=armed?clamp(mix[i],0,100):0;
   s.motors[i]+=(s.motorCommands[i]-s.motors[i])*alpha;
 }
 // Physical effect is now driven by the displayed *ACTUAL* motor speeds.
 // Mixer algebra recovers roll / pitch / yaw torque from the four delayed motors.
 const [m1,m2,m3,m4]=s.motors;
 const torR=(m1-m2-m3+m4)/(.058*4),torP=(-m1-m2+m3+m4)/(.058*4),torY=(m1-m2+m3-m4)/(.038*4);
 s.motorTorque=[torR,torP,torY];
 const authority=clamp((s.throttle-1050)/650,0,1);
 const battery=clamp(e.batteryV/12.6,.65,1)**2;
 const effectiveness=(.10+.90*authority)*battery*(armed?1:0);
 const inertia=1+e.payloadG/900,wind=e.wind/100;
 const cgRoll=e.cgX*.11,cgPitch=e.cgY*.11;
 // Derive motion from actual delayed motors, not instant PID values. 
 s.rollRate+=STEP*(torR*3.9*effectiveness/inertia+cgRoll+wind*22*Math.sin(s.time*1.31)-s.rollRate*.38);
 s.pitchRate+=STEP*(torP*3.9*effectiveness/(inertia*1.08)+cgPitch+wind*19*Math.cos(s.time*.91)-s.pitchRate*.38);
 s.yawRate+=STEP*(torY*3.2*effectiveness/(inertia*1.35)-s.yawRate*.34);
 s.roll=clamp(s.roll+s.rollRate*STEP,-45,45);
 s.pitch=clamp(s.pitch+s.pitchRate*STEP,-45,45);
 s.yaw=wrap(s.yaw+s.yawRate*STEP);
 if(Math.abs(s.roll)>=45&&Math.sign(s.roll)===Math.sign(s.rollRate))s.rollRate=0;
 if(Math.abs(s.pitch)>=45&&Math.sign(s.pitch)===Math.sign(s.pitchRate))s.pitchRate=0;
 s.lift=(base/100)**2*battery/(1+e.payloadG/1200);
 const selected=s.mode==='angle'?'angleRoll':rKey;s.live={bank:selected,...s.memory[selected]};
 const target=s.mode==='acro'?s.targetRollRate:s.targetRoll,actual=s.mode==='acro'?s.rollRate:s.roll,error=target-actual;
 const m=s.metrics;m.samples=Math.min(100000,m.samples+1);
 const k=.006;
 m.rmsError=Math.sqrt((1-k)*m.rmsError*m.rmsError+k*error*error);
 m.liveError=error;
 m.peakRate=Math.max(m.peakRate*.999,Math.abs(s.rollRate),Math.abs(s.pitchRate));
 m.motorSpread=Math.max(...s.motors)-Math.min(...s.motors);
 const sign=Math.abs(error)>1?Math.sign(error):0;
 if(sign&&m.previousSign&&sign!==m.previousSign&&s.time-m.lastCross>.15){m.ringing++;m.lastCross=s.time}
 if(sign)m.previousSign=sign;
 return s;
}
export function advanceSimulator(s,dt){
 s.accumulator=Math.min(.064,s.accumulator+clamp(dt,0,.064));
 while(s.accumulator+1e-10>=STEP){stepSimulator(s);s.accumulator-=STEP}
 return s;
}
export function getSnapshot(s){
 return {running:s.running,mode:s.mode,throttle:s.throttle,time:s.time,
 roll:s.roll,pitch:s.pitch,yaw:s.yaw,rollRate:s.rollRate,pitchRate:s.pitchRate,yawRate:s.yawRate,
 targetRoll:s.targetRoll,targetPitch:s.targetPitch,targetRollRate:s.targetRollRate,targetPitchRate:s.targetPitchRate,
 targetYawRate:s.targetYawRate,motors:[...s.motors],motorTorque:[...s.motorTorque],motorCommands:[...s.motorCommands],
 lift:s.lift,environment:{...s.environment},live:{...s.live},pulse:s.pulse?{...s.pulse}:null,metrics:{...s.metrics}};
}
