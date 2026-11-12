#pragma once
#include <algorithm>
#include <cmath>
#include <stdint.h>
#include <limits>

struct ZjRateGains {float p=0,i=0,d=0;};
struct ZjRatePidState {float integral=0,error=0,rate=0,derivative=0;bool ready=false;};
struct ZjRatePidResult {float output=0,p=0,i=0,d=0;bool valid=false,saturated=false;};

inline float zjRateClamp(float x,float lo,float hi){return std::max(lo,std::min(hi,x));}
inline bool zjRateGainValid(float value){return std::isfinite(value)&&value>=0&&value<=100;}

inline ZjRatePidResult zjStepRatePid(ZjRatePidState& state,const ZjRateGains& gains,
                                    float target,float actual,float dt,float mixerResidual=0){
 const float error=target-actual;
 if(!std::isfinite(dt)||dt<.001f||dt>.008f||!std::isfinite(error)||!std::isfinite(mixerResidual)||
    !zjRateGainValid(gains.p)||!zjRateGainValid(gains.i)||!zjRateGainValid(gains.d)){
  state={};return {};
 }
 // Same pid_equation as reference/ZebjusWorkingFlight.ino.txt.
 const float p=gains.p*error;
 const float integral=zjRateClamp(state.integral+gains.i*(error+state.error)*dt/2.0f,-400,400);
 const float derivative=(error-state.error)/dt;
 const float d=gains.d*derivative;
 const float total=p+integral+d;
 if(!std::isfinite(total)){state={};return {};}
 state={integral,error,actual,derivative,true};
 return {zjRateClamp(total,-400,400),p,integral,d,true,std::fabs(total)>400};
}

struct ZjRateMix {
 float pulse[4]={};
 float residual[3]={};
 bool saturated=false;
 uint8_t clipMask=0;
};

// Working sketch M1..M4 in D0..D3 order. Keep signs and output order together.
inline ZjRateMix zjRateMixQuadX(float throttle,float roll,float pitch,float yaw){
 const float requested[]={throttle+roll-pitch+yaw,throttle-roll-pitch-yaw,
                          throttle-roll+pitch+yaw,throttle+roll+pitch-yaw};
 ZjRateMix mix;
 float removed[4];
 for(unsigned i=0;i<4;i++){
  mix.pulse[i]=zjRateClamp(requested[i],1180,1999);
  removed[i]=requested[i]-mix.pulse[i];
  if(removed[i]!=0)mix.clipMask|=uint8_t(1u<<i);
 }
 mix.saturated=mix.clipMask!=0;
 mix.residual[0]=(removed[0]-removed[1]-removed[2]+removed[3])*.25f;
 mix.residual[1]=(-removed[0]-removed[1]+removed[2]+removed[3])*.25f;
 mix.residual[2]=(removed[0]-removed[1]+removed[2]-removed[3])*.25f;
 return mix;
}
inline float zjRateStick(uint16_t pulse){
 const float offset=zjRateClamp(pulse,1000,2000)-1500;
 return offset*.15f;
}

using ZjAnglePidState = ZjRatePidState;

// The working sketch uses this equation for both cascaded PID loops.
inline float zjStepAnglePid(ZjAnglePidState& state,const ZjRateGains& gains,float target,float measured,float dt){
 const auto result=zjStepRatePid(state,gains,target,measured,dt);
 return result.valid?result.output:std::numeric_limits<float>::quiet_NaN();
}

// Bench estimate from the calibrated gravity vector. Suppress it when tilted
// beyond the valid upright envelope or when acceleration is inconsistent with g.
inline bool zjBenchAngles(float x,float y,float z,float (&angles)[2]){
 const float norm=x*x+y*y+z*z;
 if(!std::isfinite(norm)||norm<.64f||norm>1.44f||z<.5f)return false;
 constexpr float deg=180.0f/3.14159265358979323846f;
 angles[0]=std::atan2(y,z)*deg;
 angles[1]=std::atan2(-x,std::sqrt(y*y+z*z))*deg;
 return true;
}

// Quad + M1..M4: front, right, rear, left. Diagnostic mixer only.
inline ZjRateMix zjRateMixQuadPlus(float throttle,float roll,float pitch,float yaw){
 const float requested[]={throttle-pitch-yaw,throttle+roll+yaw,throttle+pitch-yaw,throttle-roll+yaw};
 ZjRateMix mix;
 float removed[4];
 for(unsigned i=0;i<4;i++){
  mix.pulse[i]=zjRateClamp(requested[i],1000,2000);
  removed[i]=requested[i]-mix.pulse[i];
  if(removed[i]!=0)mix.clipMask|=uint8_t(1u<<i);
 }
 mix.saturated=mix.clipMask!=0;
 mix.residual[0]=(removed[1]-removed[3])*.5f;
 mix.residual[1]=(removed[2]-removed[0])*.5f;
 mix.residual[2]=(-removed[0]+removed[1]-removed[2]+removed[3])*.25f;
 return mix;
}
