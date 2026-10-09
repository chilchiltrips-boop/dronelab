#pragma once
#include "FlightControlMath.h"
#include <string.h>
#include "ZEBJUS_FLIGHTCORE_TYPES.h"
// Uses the same PID equation/gains/mixer as real flight, with isolated controller state.
// This type has no motor, GPIO, I2C or hardware-output interface.
struct VirtualPid {
 float previous[5]={},integral[5]={},derivative[5]={},motors[4]={1000,1000,1000,1000};
 uint32_t run=0,revision=0;bool armed=false,lowSeen=false;
 void reset(){memset(previous,0,sizeof(previous));memset(integral,0,sizeof(integral));memset(derivative,0,sizeof(derivative));for(float& m:motors)m=1000;armed=false;lowSeen=false;}
 float step(int slot,float error,const PidAxis& a,float dt,const FlightSettings& settings){return FlightMath::pidStep(error,a.p,a.i,a.d,dt,settings.dtermHz,previous[slot],integral[slot],derivative[slot]);}
 bool tick(uint32_t runId,uint32_t pidRevision,bool valid,const uint16_t ch[10],const float sensor[5],const FlightPidSettings& p,const FlightSettings& settings,float dt){
  if(run!=runId){reset();run=runId;}if(revision!=pidRevision){memset(previous,0,sizeof(previous));memset(integral,0,sizeof(integral));memset(derivative,0,sizeof(derivative));revision=pidRevision;}
  if(!valid){reset();return false;}
  if(ch[4]<1500){armed=false;if(ch[2]<=1050&&abs(int(ch[0])-1500)<80&&abs(int(ch[1])-1500)<80&&abs(int(ch[3])-1500)<80)lowSeen=true;}
  else if(!armed&&lowSeen&&ch[2]<=1050){armed=true;lowSeen=false;}
  if(!armed||ch[2]<1050){for(float& m:motors)m=1000;memset(integral,0,sizeof(integral));memset(previous,0,sizeof(previous));memset(derivative,0,sizeof(derivative));return true;}
  bool rate=ch[5]>=1500;float rr=settings.maxRate*(ch[0]-1500.f)/500,pr=settings.maxRate*(ch[1]-1500.f)/500,yr=settings.maxRate*(ch[3]-1500.f)/500;
  float oldI[5];memcpy(oldI,integral,sizeof(oldI));
  if(!rate){rr=step(3,settings.maxTilt*(ch[0]-1500.f)/500-sensor[0],p.angleRoll,dt,settings);pr=step(4,settings.maxTilt*(ch[1]-1500.f)/500-sensor[1],p.anglePitch,dt,settings);}
  float r=step(0,rr-sensor[2],rate?p.rateRoll:p.angleRateRoll,dt,settings),t=step(1,pr-sensor[3],rate?p.ratePitch:p.angleRatePitch,dt,settings),y=step(2,yr-sensor[4],rate?p.rateYaw:p.angleRateYaw,dt,settings);
  float throttle=fminf(ch[2],settings.maxThrottle),raw[]={throttle+r-t+y,throttle-r-t-y,throttle-r+t+y,throttle+r+t-y};bool saturated=false;
  for(int i=0;i<4;i++){if(raw[i]<settings.idleUs||raw[i]>settings.maxMotorUs)saturated=true;motors[i]=FlightMath::clamp(raw[i],settings.idleUs,settings.maxMotorUs);}
  if(saturated)memcpy(integral,oldI,sizeof(oldI));return true;
 }
};
