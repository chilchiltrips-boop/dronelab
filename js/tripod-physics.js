/* F450 tripod educational dynamics. 250 Hz deterministic, physical motor thrust and
 * three-axis rigid-body rotational equations. No hardware/browser dependencies.
 * Teaching approximation: no aerodynamic measurement-based calibration claimed.
 */
export const STEP=.004;
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const degToRad=d=>d*Math.PI/180;
const DEG=180/Math.PI;
const wrap=a=>((a+180)%360+360)%360-180;
const clone=x=>JSON.parse(JSON.stringify(x));
export const DEFAULT_PID={
 rateRoll:{p:.9,i:15,d:.03},ratePitch:{p:.9,i:15,d:.03},rateYaw:{p:3,i:15,d:0},
 angleRoll:{p:3,i:0,d:0},anglePitch:{p:3,i:0,d:0}
};
export const DEFAULT_ENV={batteryV:12.2,payloadG:0,cgX:0,cgY:0,wind:0,lag:.12,gyroNoise:.07,noiseSeed:7919};
// SI-unit educational estimates, not measured aircraft calibration.
export const PLANT=Object.freeze({mass:1.12,g:9.81,maxRPM:8500,kT:11/(8500*Math.PI/30)**2,kQ:.020*11/(8500*Math.PI/30)**2,idle:.08,spring:100,damper:14,travel:.12});
export const MOTOR_GEOMETRY=[
 {x:-.325,z:.325,spin:1},{x:.325,z:.325,spin:-1},
 {x:.325,z:-.325,spin:1},{x:-.325,z:-.325,spin:-1}
];
const newPID=()=>({sum:0,last:0,ready:false,p:0,i:0,d:0,error:0,target:0,actual:0,output:0,derivative:0,saturated:false});
export function resetMetrics(s){s.metrics={rmsError:0,peakRate:0,motorSpread:0,ringing:0,liveError:0,samples:0,previousSign:0,lastCross:0,outputVariance:0,saturation:0,integral:0,overshoot:0}}
export function createSimulator(){
 const s={running:false,mode:'angle',throttle:1000,cmdRoll:0,cmdPitch:0,cmdYaw:0,pendingPID:{},mixResidual:[0,0,0],
 roll:0,pitch:0,yaw:0,rollRate:0,pitchRate:0,yawRate:0,
 gyroRoll:0,gyroPitch:0,gyroYaw:0,trimRoll:0,trimPitch:0,
 targetRoll:0,targetPitch:0,targetRollRate:0,targetPitchRate:0,targetYawRate:0,
 environment:clone(DEFAULT_ENV),pid:clone(DEFAULT_PID),memory:Object.fromEntries(Object.keys(DEFAULT_PID).map(k=>[k,newPID()])),
 motors:[0,0,0,0],motorCommands:[0,0,0,0],motorRPM:[0,0,0,0],motorRequestedRPM:[0,0,0,0],motorOmega:[0,0,0,0],motorThrust:[0,0,0,0],motorTorque:[0,0,0],motorSaturated:[false,false,false,false],
 vertical:{z:0,velocity:0,acceleration:0,thrust:0,weight:PLANT.mass*PLANT.g,ratio:0,support:PLANT.mass*PLANT.g,stop:'BOTTOM'},
 lift:0,anglePID:{roll:0,pitch:0},ratePID:{roll:0,pitch:0,yaw:0},
 inertia:[.045,.085,.048],pulse:null,time:0,accumulator:0,live:{bank:'angleRoll',...newPID()},metrics:{},profile:'F450 educational 3S'};
 resetMetrics(s);return s;
}
export function clearPID(s){for(const key of Object.keys(s.memory))s.memory[key]=newPID();s.live={bank:'angleRoll',...newPID()}}
export function resetIntegrators(s){for(const m of Object.values(s.memory)){m.sum=0;m.i=0}resetMetrics(s)}
export function releaseInputs(s){s.cmdRoll=s.cmdPitch=s.cmdYaw=0}
export function stopSimulator(s){
 s.running=false;s.throttle=1000;s.pulse=null;releaseInputs(s);clearPID(s);
 for(const field of ['motors','motorCommands','motorRPM','motorRequestedRPM','motorOmega','motorThrust','motorTorque','mixResidual'])s[field].fill(0);
 s.pendingPID={};s.vertical.thrust=s.vertical.ratio=0;
 s.motorSaturated.fill(false);s.lift=s.accumulator=0;s.rollRate=s.pitchRate=s.yawRate=0;s.gyroRoll=s.gyroPitch=s.gyroYaw=0;
 s.targetRollRate=s.targetPitchRate=s.targetYawRate=0;
}
export function startSimulator(s){
 if(s.running)return true;if(s.throttle>1025)return false;
 s.running=true;clearPID(s);resetMetrics(s);return true;
}
export function resetSimulator(s){stopSimulator(s);s.vertical.z=s.vertical.velocity=s.vertical.acceleration=0;s.vertical.stop='BOTTOM';s.roll=s.pitch=s.yaw=s.trimRoll=s.trimPitch=s.time=0;s.targetRoll=s.targetPitch=0;resetMetrics(s)}
export function setFlightMode(s,mode){
 if(!['angle','acro'].includes(mode))return false;
 if(s.mode!==mode){s.mode=mode;s.pulse=null;clearPID(s);resetMetrics(s)}
 return true;
}
export function setPID(s,bank,params){
 if(!Object.hasOwn(s.pid,bank)||!['p','i','d'].every(k=>Number.isFinite(params[k])&&params[k]>=0&&params[k]<=100))return false;
 if(s.running){s.pendingPID[bank]={...params};return true;}
 applyPID(s,bank,params);return true;
}
function applyPID(s,bank,params){
 const m=s.memory[bank],outer=bank==='angleRoll'||bank==='anglePitch';
 // Bumpless gain change where possible: preserve old output by adapting integral state.
 const previous=m.output,nextI=outer?params.i:params.i*.012;
 const sum=nextI>0?(previous-params.p*m.error+params.d*m.derivative)/nextI:0;
 s.pid[bank]={p:params.p,i:params.i,d:params.d};
 if(s.running&&m.ready&&Number.isFinite(sum))m.sum=clamp(sum,outer?-45:-110,outer?45:110);
 // Preserve derivative measurement history; changing D must not introduce a kick.
 return true;
}
export function calibrateLevel(s){s.trimRoll=clamp(s.roll,-45,45);s.trimPitch=clamp(s.pitch,-45,45);clearPID(s)}
export function disturb(s,roll,pitch){s.roll=clamp(roll,-38,38);s.pitch=clamp(pitch,-38,38);s.rollRate=s.pitchRate=s.gyroRoll=s.gyroPitch=0;clearPID(s)}
export function startTuningPulse(s,axis='roll',amplitude=14){
 if(!s.running||s.throttle<1250||!['roll','pitch','yaw'].includes(axis))return false;
 s.pulse={axis,start:s.time,until:s.time+.56,amplitude:clamp(amplitude,3,25)};resetMetrics(s);return true;
}
function computePID(s,bank,target,actual,outer=false){
 const m=s.memory[bank],g=s.pid[bank],error=target-actual;
 const rate=m.ready?(actual-m.last)/STEP:0,memoryTime=outer?.10:.032;
 m.derivative+=(rate-m.derivative)*(1-Math.exp(-STEP/memoryTime));
 const p=g.p*error,d=outer?-g.d*m.derivative:-g.d*m.derivative;
 let proposed=clamp(m.sum+error*STEP,outer?-45:-110,outer?45:110);
 const factor=outer?1:.012,maxOut=outer?220:450;
 const proposedOut=p+g.i*proposed*factor+d;
 const axis=bank.endsWith('Roll')?0:bank.endsWith('Pitch')?1:2;
 if((Math.abs(proposedOut)>maxOut&&Math.sign(proposedOut)===Math.sign(error))||(!outer&&Math.abs(s.mixResidual[axis])>.05&&Math.sign(s.mixResidual[axis])===Math.sign(error)))proposed=m.sum;
 m.sum=proposed;m.last=actual;m.ready=true;
 m.p=p;m.i=g.i*m.sum*factor;m.d=d;m.error=error;m.target=target;m.actual=actual;
 m.output=clamp(p+m.i+d,-maxOut,maxOut);m.saturated=Math.abs(proposedOut)>maxOut;
 return m.output;
}
export function motorMix(base,r,p,y){return [base-r-p-y,base+r-p+y,base+r+p-y,base-r+p+y]}
export function thrustTorque(forces){
 let pitch=0,roll=0,yaw=0;
 for(let i=0;i<4;i++){const m=MOTOR_GEOMETRY[i],f=forces[i];pitch-=m.z*f;roll+=m.x*f;yaw-=m.spin*.020*f;}
 return [roll,pitch,yaw];
}
function verticalStep(s){
 const v=s.vertical,mass=PLANT.mass+Math.max(0,s.environment.payloadG)/1000;
 v.weight=mass*PLANT.g;
 v.thrust=s.motorThrust.reduce((a,b)=>a+b,0)*Math.max(0,Math.cos(degToRad(s.roll))*Math.cos(degToRad(s.pitch)));
 v.ratio=v.thrust/v.weight;
 const force=v.thrust-v.weight-PLANT.spring*v.z-PLANT.damper*v.velocity;
 v.acceleration=force/mass;v.velocity+=v.acceleration*STEP;v.z+=v.velocity*STEP;v.support=0;v.stop='MOVING';
 if(v.z<=0){v.z=0;if(v.velocity<0)v.velocity=0;v.support=Math.max(0,-force);if(force<=0)v.acceleration=0;v.stop='BOTTOM';}
 if(v.z>=PLANT.travel){v.z=PLANT.travel;if(v.velocity>0)v.velocity=0;v.support=-Math.max(0,force);if(force>=0)v.acceleration=0;v.stop='UPPER STOP';}
 s.lift=v.ratio;
}
export function stepSimulator(s){
 if(!s.running){verticalStep(s);return s;}
 for(const [bank,values] of Object.entries(s.pendingPID))applyPID(s,bank,values);s.pendingPID={};
 const dt=STEP;s.time+=dt;
 const e=s.environment,enabled=s.running;
 const p=s.pulse&&s.time<s.pulse.until?s.pulse:null;
 if(s.pulse&&s.time>=s.pulse.until)s.pulse=null;
 const anglePulse=axis=>p?.axis===axis?p.amplitude:0,ratePulse=axis=>p?.axis===axis?p.amplitude*(axis==='yaw'?5:4):0;
 // Both ANGLE and ACRO share exactly one inner rate controller per axis.
 const bankR='rateRoll',bankP='ratePitch',bankY='rateYaw';
 s.targetRoll=s.trimRoll+s.cmdRoll*26+(s.mode==='angle'?anglePulse('roll'):0);
 s.targetPitch=s.trimPitch+s.cmdPitch*26+(s.mode==='angle'?anglePulse('pitch'):0);
 s.targetRollRate=s.mode==='acro'?s.cmdRoll*220+ratePulse('roll'):computePID(s,'angleRoll',s.targetRoll,s.roll,true);
 s.targetPitchRate=s.mode==='acro'?s.cmdPitch*220+ratePulse('pitch'):computePID(s,'anglePitch',s.targetPitch,s.pitch,true);
 s.targetYawRate=s.cmdYaw*180+ratePulse('yaw');
 const gyroAlpha=1-Math.exp(-dt/.02);
 s.gyroRoll+=(s.rollRate-s.gyroRoll)*gyroAlpha;
 s.gyroPitch+=(s.pitchRate-s.gyroPitch)*gyroAlpha;
 s.gyroYaw+=(s.yawRate-s.gyroYaw)*gyroAlpha;
 const noise=clamp(e.gyroNoise??.07,0,2)+e.wind*.001,clock=s.time*89.17+(e.noiseSeed??7919)*.001;
 const uR=computePID(s,bankR,s.targetRollRate,s.gyroRoll+noise*Math.sin(clock));
 const uP=computePID(s,bankP,s.targetPitchRate,s.gyroPitch+noise*Math.cos(clock*.87));
 const uY=computePID(s,bankY,s.targetYawRate,s.gyroYaw+noise*.45*Math.sin(clock*1.13));
 s.anglePID.roll=s.memory.angleRoll.output;s.anglePID.pitch=s.memory.anglePitch.output;
 s.ratePID.roll=uR;s.ratePID.pitch=uP;s.ratePID.yaw=uY;
 const base=enabled?100*(PLANT.idle+(1-PLANT.idle)*clamp((s.throttle-1000)/1000,0,1)):0;
 const r=clamp(uR*.052,-38,38),pMix=clamp(uP*.052,-38,38),y=clamp(uY*.035,-30,30);
 const mix=motorMix(base,r,pMix,y);
 const alpha=1-Math.exp(-dt/clamp(e.lag,.04,.30)),battery=clamp(e.batteryV/12.6,.65,1);
 for(let i=0;i<4;i++){
  s.motorSaturated[i]=mix[i]<PLANT.idle*100||mix[i]>100;
  s.motorCommands[i]=enabled?clamp(mix[i],PLANT.idle*100,100):0;
  s.motorRequestedRPM[i]=PLANT.maxRPM*battery*s.motorCommands[i]/100;
  const requestedOmega=s.motorRequestedRPM[i]*Math.PI/30;
  s.motorOmega[i]+=alpha*(requestedOmega-s.motorOmega[i]);
  s.motorRPM[i]=s.motorOmega[i]*30/Math.PI;
  s.motors[i]=100*s.motorRPM[i]/PLANT.maxRPM;
  s.motorThrust[i]=PLANT.kT*s.motorOmega[i]**2;
 }
 // Torque from real individual motor forces at X-frame arm coordinates.
 let [tZ,tX,tY]=thrustTorque(s.motorThrust);
 const [a,b,c,d]=s.motorCommands;
 s.mixResidual=[uR-(-a+b+c-d)/(4*.052),uP-(-a-b+c+d)/(4*.052),uY-(-a+b-c+d)/(4*.035)];
 const roll=s.rollRate/DEG,pitch=s.pitchRate/DEG,yaw=s.yawRate/DEG;
 const Ixx=.045*(1+e.payloadG/900),Iyy=.085*(1+e.payloadG/850),Izz=.048*(1+e.payloadG/900);
 // ω×Iω cross-coupling for axes X=pitch, Y=yaw, Z=roll.
 const crossX=(Izz-Iyy)*yaw*roll,crossY=(Ixx-Izz)*roll*pitch,crossZ=(Iyy-Ixx)*pitch*yaw;
 const wind=e.wind/100;
 const weight=(PLANT.mass+e.payloadG/1000)*PLANT.g;
 const biasX=e.cgY*.001*weight,biasZ=e.cgX*.001*weight;
 tX+=biasX+wind*.060*Math.cos(.87*s.time);
 tZ+=biasZ+wind*.060*Math.sin(1.17*s.time);
 tY+=wind*.016*Math.cos(1.51*s.time);
 const pitchAccel=(tX-crossX-.022*pitch)/Ixx,rollAccel=(tZ-crossZ-.022*roll)/Izz,yawAccel=(tY-crossY-.028*yaw)/Iyy;
 s.pitchRate=clamp(s.pitchRate+pitchAccel*DEG*dt,-720,720);
 s.rollRate=clamp(s.rollRate+rollAccel*DEG*dt,-720,720);
 s.yawRate=clamp(s.yawRate+yawAccel*DEG*dt,-720,720);
 // Tripod is gimbaled: mechanical travel limits; it does not spring-level ACRO.
 // Exact YXZ Euler kinematics for the body-frame gyro rates (X=pitch,Y=yaw,Z=roll).
 const cr=Math.cos(degToRad(s.roll)),sr=Math.sin(degToRad(s.roll)),sp=Math.sin(degToRad(s.pitch));
 const yawDot=(sr*s.pitchRate+cr*s.yawRate)/Math.cos(degToRad(s.pitch));
 const pitchDot=cr*s.pitchRate-sr*s.yawRate,rollDot=s.rollRate+sp*yawDot;
 s.roll=clamp(s.roll+rollDot*dt,-45,45);
 s.pitch=clamp(s.pitch+pitchDot*dt,-45,45);
 s.yaw=wrap(s.yaw+yawDot*dt);
 if(Math.abs(s.roll)>=45&&Math.sign(s.roll)===Math.sign(s.rollRate))s.rollRate=0;
 if(Math.abs(s.pitch)>=45&&Math.sign(s.pitch)===Math.sign(s.pitchRate))s.pitchRate=0;
 s.motorTorque=[tZ,tX,tY];
 verticalStep(s);
 const selected=s.mode==='angle'?'angleRoll':bankR;s.live={bank:selected,...s.memory[selected]};
 const target=s.mode==='acro'?s.targetRollRate:s.targetRoll,actual=s.mode==='acro'?s.rollRate:s.roll,error=target-actual;
 const m=s.metrics;m.samples++;
 m.rmsError=Math.sqrt(.993*m.rmsError*m.rmsError+.007*error*error);
 m.liveError=error;m.peakRate=Math.max(m.peakRate*.9995,Math.abs(s.rollRate),Math.abs(s.pitchRate));
 m.motorSpread=Math.max(...s.motors)-Math.min(...s.motors);m.integral=s.memory[bankR].sum;
 m.outputVariance=.985*m.outputVariance+.015*(uR*uR+uP*uP)/2;
 m.saturation+=s.motorSaturated.some(Boolean)?1:0;
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
 targetRoll:s.targetRoll,targetPitch:s.targetPitch,targetRollRate:s.targetRollRate,targetPitchRate:s.targetPitchRate,targetYawRate:s.targetYawRate,
 motors:[...s.motors],motorRPM:[...s.motorRPM],motorRequestedRPM:[...s.motorRequestedRPM],motorThrust:[...s.motorThrust],motorCommands:[...s.motorCommands],motorTorque:[...s.motorTorque],vertical:{...s.vertical},
 lift:s.lift,environment:{...s.environment},pulse:s.pulse?{...s.pulse}:null,live:{...s.live},metrics:{...s.metrics},
 controllers:Object.fromEntries(Object.entries(s.memory).map(([k,m])=>[k,{...m}]))};
}
