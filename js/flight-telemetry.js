/* Read-only, versioned FlightCore observation. Transport authentication and USB
 * identity verification happen before this boundary. This cannot authorize RC. */
(function(root){
 'use strict';
 const uint=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
 const vector=(a,size,limit)=>Array.isArray(a)&&a.length===size&&a.every(n=>Number.isFinite(n)&&Math.abs(n)<=limit);
 function modeState(m){
  return m?.supported===true&&['acro','angle'].includes(m.saved)&&['acro','angle'].includes(m.active)&&
   (m.pending===null||m.pending===m.saved)&&((m.pending===null)===(m.saved===m.active))?{...m}:null;
 }
 function normalize(value,binding,previous=null,now=Date.now(),roundTripMs=0){
  const v=value,m=modeState(v?.flightModeState);
  if(v?.version!==1||v.kitId!==binding?.kitId||v.bootId!==binding?.bootId||!binding.bootId||
   !['sequence','sampleSequence','atUs','ageUs','dtUs','missedTicks'].every(k=>uint(v[k]))||!v.sequence||
   !['valid','attitudeValid','levelCalibrated','accelUsed','offAck','authorized','deadlineFault'].every(k=>typeof v[k]==='boolean')||
   !vector(v.rates,3,500)||!vector(v.gravity,3,9)||!vector(v.attitude,2,180)||Math.abs(v.attitude[1])>=90||
   !m||!Number.isInteger(v.owner)||v.owner<0||v.owner>3||!['DISARMED','ARMED','FAILSAFE'].includes(v.state)||
   !/^[A-Z_]{1,40}$/.test(v.reason)||!Number.isFinite(v.measuredHz)||v.measuredHz<0||v.measuredHz>1000||
   !Array.isArray(v.applied)||v.applied.length!==4||!v.applied.every(p=>p===null||p===0||Number.isInteger(p)&&p>=1000&&p<=2000)||
   v.authorized&&(v.state!=='ARMED'||v.owner!==3||v.offAck)||
   v.offAck&&v.applied.some(p=>p!==null&&p!==0)||!Number.isFinite(roundTripMs)||roundTripMs<0)return null;
  const same=previous?.kitId===v.kitId&&previous.bootId===v.bootId&&previous.generation===binding.connectionGeneration;
  if(same&&((v.sequence-previous.sequence)>>>0)>=0x80000000)return null;
  if(same&&v.sequence===previous.sequence)return previous;
  return {...v,rates:[...v.rates],gravity:[...v.gravity],attitude:[...v.attitude],applied:[...v.applied],
   flightModeState:m,generation:binding.connectionGeneration,transport:binding.transport,
   observedAt:now,roundTripMs, sampleObservedAt:same&&v.sampleSequence===previous.sampleSequence?previous.sampleObservedAt:now};
 }
 root.ZebjusFlightTelemetry=Object.freeze({normalize,modeState});
})(globalThis);
