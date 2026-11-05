// Shared Rate PID contract: deg/s in, microsecond correction out, seconds dt.
// See the matching firmware implementation in FlightCoreRatePid.h.
import {DEFAULT_PID_PROFILE,PID_BANKS} from './pid-profiles.js';
export const RATE_BANKS=PID_BANKS.slice(0,3);
export const RATE_DEFAULTS=Object.fromEntries(RATE_BANKS.map(bank=>[bank,DEFAULT_PID_PROFILE.gains[bank]]));
export const validRateGain=value=>Number.isFinite(value)&&value>=0&&value<=100;
const clip=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

export function stepRatePid(state,gains,target,actual,dt,mixerResidual=0){
 const error=target-actual;
 if(!Number.isFinite(dt)||dt<.001||dt>.008||!Number.isFinite(error)||!Number.isFinite(mixerResidual)||
    !['p','i','d'].every(key=>validRateGain(gains[key])))return null;
 const raw=state.ready?(actual-state.last)/dt:0;
 const derivative=state.derivative+dt/(.030+dt)*(raw-state.derivative);
 const p=gains.p*error,d=-gains.d*derivative;
 const candidate=clip(state.sum+gains.i*(error+(state.ready?state.error:error))*dt*.5,-400,400);
 const proposed=p+candidate+d;
 if(!Number.isFinite(proposed)||!Number.isFinite(derivative))return null;
 const blocked=proposed>400&&error>0||proposed<-400&&error<0||
  mixerResidual>.05&&error>0||mixerResidual<-.05&&error<0;
 const i=blocked?state.sum:candidate,total=p+i+d;
 Object.assign(state,{sum:i,error,target,actual,last:actual,derivative,ready:true,p,i,d,
  output:clip(total,-400,400),saturated:Math.abs(proposed)>400||Math.abs(total)>400});
 return state;
}
