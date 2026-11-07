#pragma once
#include <cmath>
#include <stdint.h>
#include <algorithm>

// Roll/pitch only. Body axes are the calibrated MPU6050 axes (+Z up at level).
// A saved Quick Level trim is subtracted before this estimator. Yaw remains a
// rate; this six-axis sensor does not provide an absolute compass heading.
struct ZjAttitudeEstimate {
 float roll=0,pitch=0,varianceRoll=4,variancePitch=4;
 uint32_t sequence=0,atUs=0,accelAtUs=0;
 bool valid=false,accelUsed=false,levelCalibrated=false;
};

struct ZjAttitudeFilter {
 ZjAttitudeEstimate value;
 uint32_t previousAtUs=0,calibration=0;
 bool initialized=false;
 void reset(){value={};previousAtUs=0;initialized=false;}
 static float wrap(float a){return std::remainder(a,360.0f);}
 static bool gravityAngles(const float (&g)[3],float& roll,float& pitch){
  const float norm=g[0]*g[0]+g[1]*g[1]+g[2]*g[2];
  if(!std::isfinite(norm)||norm<.81f||norm>1.21f)return false;
  constexpr float degrees=57.29577951308232f;
  roll=std::atan2(g[1],g[2])*degrees;
  pitch=std::atan2(-g[0],std::hypot(g[1],g[2]))*degrees;
  return std::isfinite(roll)&&std::isfinite(pitch);
 }
 bool step(uint32_t sequence,uint32_t atUs,const float (&rate)[3],const float (&gravity)[3],
           bool sampleValid,bool level,uint32_t calibrationId){
  if(calibration!=calibrationId){reset();calibration=calibrationId;}
  if(!sampleValid||!sequence||!std::isfinite(rate[0])||!std::isfinite(rate[1])||!std::isfinite(rate[2])){
   reset();return false;
  }
  if(initialized&&sequence==value.sequence)return value.valid;
  if(initialized&&int32_t(sequence-value.sequence)<=0){reset();return false;}
  float roll=0,pitch=0;
  const bool accel=gravityAngles(gravity,roll,pitch);
  const float dt=initialized?uint32_t(atUs-previousAtUs)*.000001f:.004f;
  if(initialized&&(dt<.001f||dt>.012f)){reset();return false;}
  if(!initialized){
   if(!accel)return false;
   value.roll=roll;value.pitch=pitch;value.varianceRoll=value.variancePitch=4;
   value.accelAtUs=atUs;initialized=true;
  }else{
   // Euler rate conversion couples body rates during simultaneous rotations.
   // Pitch singularities are outside the supported ±80 degree envelope.
   constexpr float radians=.017453292519943295f;
   const float r=value.roll*radians,p=value.pitch*radians;
   if(std::fabs(value.pitch)>=80){reset();return false;}
   const float rollRate=rate[0]+std::sin(r)*std::tan(p)*rate[1]+std::cos(r)*std::tan(p)*rate[2];
   const float pitchRate=std::cos(r)*rate[1]-std::sin(r)*rate[2];
   value.roll=wrap(value.roll+dt*rollRate);value.pitch+=dt*pitchRate;
   value.varianceRoll+=dt*dt*16;value.variancePitch+=dt*dt*16;
   if(accel){
    // User reference: gyro uncertainty 4 deg/s, acceleration angle noise 3 deg.
    const float kr=value.varianceRoll/(value.varianceRoll+9);
    const float kp=value.variancePitch/(value.variancePitch+9);
    value.roll=wrap(value.roll+kr*wrap(roll-value.roll));value.pitch+=kp*(pitch-value.pitch);
    value.varianceRoll*=1-kr;value.variancePitch*=1-kp;value.accelAtUs=atUs;
   }
  }
  previousAtUs=atUs;value.sequence=sequence;value.atUs=atUs;
  value.accelUsed=accel;value.levelCalibrated=level;
  value.valid=std::isfinite(value.roll)&&std::isfinite(value.pitch)&&std::fabs(value.pitch)<80&&
   uint32_t(atUs-value.accelAtUs)<=500000;
  if(!value.valid){reset();return false;}
  return true;
 }
};

inline float zjAngleStick(uint16_t pulse){
 const float offset=float(std::max(1000,std::min(2000,int(pulse))))-1500;
 return std::fabs(offset)<=15?0:offset*.10f; // degrees, bounded ±50°
}
