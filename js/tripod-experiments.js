import {createSimulator,startSimulator,stepSimulator,setPID,setFlightMode,startTuningPulse,DEFAULT_PID} from './tripod-physics.js';
/* Replayable A/B bench: identical PID setup, environment, disturbance and time.
 * This pure computation never changes the live running aircraft. */
export function simulateResponse({basePID=DEFAULT_PID,bank='rateRoll',gain='p',values=[.4,2],mode=null,environment={},axis='roll',duration=6.5}={}){
 if(!['p','i','d'].includes(gain)||!Object.hasOwn(basePID,bank))throw Error('Invalid PID comparison bank/gain');
 if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isFinite(v)||v<0||v>100))throw Error('Invalid comparison values');
 const flightMode=mode||((bank.startsWith('rate')&&!bank.startsWith('angle'))?'acro':'angle');
 const scenario=gain==='i'?'bias':'pulse';
 const results=values.map(value=>{
  const s=createSimulator();s.pid=JSON.parse(JSON.stringify(basePID));s.environment={...s.environment,...environment};
  if(scenario==='bias'){s.environment.cgX=axis==='roll'?2:0;s.environment.cgY=axis==='pitch'?2:0;if(axis==='yaw')s.environment.wind=50;}
  setFlightMode(s,flightMode);setPID(s,bank,{...s.pid[bank],[gain]:value});
  startSimulator(s);s.throttle=1500;
  const samples=[],steps=Math.round(duration/.004);
  let peakAbs=0,peakRate=0,errorSum=0,motorActivity=0,cmdPrev=[0,0,0,0],reversals=0,lastSign=0,overshoot=0,saturation=0;
  for(let t=0;t<steps;t++){
   if(scenario==='pulse'&&t===75)startTuningPulse(s,axis,12);
   stepSimulator(s);
   const axisC=axis[0].toUpperCase()+axis.slice(1),target=axis==='yaw'?s.targetYawRate:(flightMode==='acro'?s['target'+axisC+'Rate']:s['target'+axisC]);
   const actual=axis==='yaw'?s.yawRate:(flightMode==='acro'?s[axis+'Rate']:s[axis]),err=target-actual;
   errorSum+=err*err;peakAbs=Math.max(peakAbs,Math.abs(actual));peakRate=Math.max(peakRate,Math.abs(s[axis+'Rate']));
   if(scenario==='pulse'&&target===0)overshoot=Math.max(overshoot,Math.abs(actual));
   const sign=Math.abs(err)>.5?Math.sign(err):0;if(sign&&lastSign&&sign!==lastSign)reversals++;if(sign)lastSign=sign;
   for(let m=0;m<4;m++){motorActivity+=(s.motorCommands[m]-cmdPrev[m])**2;cmdPrev[m]=s.motorCommands[m];}
   if(s.motorSaturated.some(Boolean))saturation++;
   if(t%15===0)samples.push({t:s.time,target,actual,integral:s.memory[bank].i,output:s.memory[bank].output,terms:{p:s.memory[bank].p,i:s.memory[bank].i,d:s.memory[bank].d},motors:[...s.motorCommands],rpm:[...s.motorRPM],thrust:[...s.motorThrust],vertical:{...s.vertical},outerRate:s['target'+axisC+'Rate'],measuredRate:s[axis+'Rate']});
  }
  const late=samples.slice(-35),lateError=late.reduce((total,x)=>total+Math.abs(x.target-x.actual),0)/late.length;
  // Rise time is 10→90% of initial commanded pulse, not a hand-authored visual.
  const active=scenario==='pulse'?samples.filter(x=>Math.abs(x.target)>1):[];
  const commandPeak=Math.max(0,...active.map(x=>Math.abs(x.target)));
  const startTime=active.length?active[0].t:0;
  const rise10=active.find(x=>Math.abs(x.actual)>=commandPeak*.1)?.t;
  const rise90=active.find(x=>Math.abs(x.actual)>=commandPeak*.9)?.t;
  const riseTime=Number.isFinite(rise10)&&Number.isFinite(rise90)?Math.max(0,rise90-rise10):null;
  // Settling requires all remaining samples to remain within 5% of the command.
  const after=scenario==='pulse'?samples.filter(x=>x.t>startTime+.56):[];
  const settleTolerance=Math.max(.5,commandPeak*.05);
  let settlingTime=null;
  for(let i=0;i<after.length;i++){
   if(after.slice(i).every(x=>Math.abs(x.actual-x.target)<=settleTolerance)){
    settlingTime=after[i].t-(startTime+.56);break;
   }
  }
  const overshootPct=commandPeak>1?100*Math.max(0,peakAbs-commandPeak)/commandPeak:null;
  return {value,bank,gain,scenario,mode:flightMode,axis,samples,
   metrics:{peak:peakAbs,peakRate,rms:Math.sqrt(errorSum/steps),lateError,overshoot,overshootPct,riseTime,settlingTime,
    motorActivity:Math.sqrt(motorActivity/steps),reversals,saturationPct:100*saturation/steps,saturationSeconds:saturation*.004,verticalPeak:Math.max(...samples.map(x=>x.vertical.z)),verticalFinal:s.vertical.z,
    finalAngle:s[axis]??0,integral:s.memory[bank].i,finalRate:s[axis+'Rate']??0}};
 });
 return {bank,gain,scenario,axis,mode:flightMode,results};
}
