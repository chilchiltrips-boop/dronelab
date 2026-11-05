#pragma once
#include <algorithm>
#include <cmath>
#include <stdint.h>

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
 const float raw=state.ready?(actual-state.rate)/dt:0;
 const float derivative=state.derivative+dt/(.030f+dt)*(raw-state.derivative);
 const float p=gains.p*error,d=-gains.d*derivative;
 const float candidate=zjRateClamp(state.integral+gains.i*(error+(state.ready?state.error:error))*dt*.5f,-400,400);
 const float proposed=p+candidate+d;
 if(!std::isfinite(proposed)||!std::isfinite(derivative)){state={};return {};}
 const bool blocked=(proposed>400&&error>0)||(proposed<-400&&error<0)||
  (mixerResidual>.05f&&error>0)||(mixerResidual<-.05f&&error<0);
 const float integral=blocked?state.integral:candidate;
 const float total=p+integral+d;
 state={integral,error,actual,derivative,true};
 return {zjRateClamp(total,-400,400),p,integral,d,true,std::fabs(proposed)>400||std::fabs(total)>400};
}

struct ZjRateMix {
 float pulse[4]={};
 float residual[3]={};
 bool saturated=false;
 uint8_t clipMask=0;
};

// Quad X M1..M4: front left, front right, back right, back left.
inline ZjRateMix zjRateMixQuadX(float throttle,float roll,float pitch,float yaw){
 const float requested[]={throttle-roll-pitch-yaw,throttle+roll-pitch+yaw,
                          throttle+roll+pitch-yaw,throttle-roll+pitch+yaw};
 ZjRateMix mix;
 float removed[4];
 for(unsigned i=0;i<4;i++){
  mix.pulse[i]=zjRateClamp(requested[i],1000,2000);
  removed[i]=requested[i]-mix.pulse[i];
  if(removed[i]!=0)mix.clipMask|=uint8_t(1u<<i);
 }
 mix.saturated=mix.clipMask!=0;
 mix.residual[0]=(-removed[0]+removed[1]+removed[2]-removed[3])*.25f;
 mix.residual[1]=(-removed[0]-removed[1]+removed[2]+removed[3])*.25f;
 mix.residual[2]=(-removed[0]+removed[1]-removed[2]+removed[3])*.25f;
 return mix;
}
inline float zjRateStick(uint16_t pulse){
 const float offset=zjRateClamp(pulse,1000,2000)-1500;
 return std::fabs(offset)<=15?0:offset*.15f;
}

struct ZjAnglePidState {float sum=0,angle=0,derivative=0;bool ready=false;};

// Angle outer loop matches the educational simulator's gain units and limits.
inline float zjStepAnglePid(ZjAnglePidState& state,const ZjRateGains& gains,float target,float measured,float dt){
 const float error=target-measured;
 const float rate=state.ready?(measured-state.angle)/dt:0;
 state.derivative+=(rate-state.derivative)*(1-std::exp(-dt/.1f));
 const float p=gains.p*error,d=-gains.d*state.derivative;
 const float candidate=zjRateClamp(state.sum+error*dt,-45,45);
 const float proposed=p+gains.i*candidate+d;
 if(!((proposed>220&&error>0)||(proposed<-220&&error<0)))state.sum=candidate;
 state.angle=measured;state.ready=true;
 return zjRateClamp(p+gains.i*state.sum+d,-220,220);
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
