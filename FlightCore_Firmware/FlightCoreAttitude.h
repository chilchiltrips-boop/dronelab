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
 bool fresh(uint32_t now)const{return valid&&uint32_t(now-atUs)<=12000;}
};

struct ZjAttitudeFaultDetail {
 const char* reason=nullptr;
 uint32_t sampleIntervalUs=0,gravityAgeUs=UINT32_MAX;
 float gravitySquared=-1;
};

struct ZjAttitudeFilter {
 ZjAttitudeEstimate value;
 ZjAttitudeFaultDetail failure;
 uint32_t previousAtUs=0,calibration=0;
 bool initialized=false;
 void reset(){value={};previousAtUs=0;initialized=false;}
 bool reject(const char* reason,uint32_t atUs,uint32_t intervalUs,const float (&gravity)[3]){
  failure={reason,intervalUs,initialized?uint32_t(atUs-value.accelAtUs):UINT32_MAX,
   gravity[0]*gravity[0]+gravity[1]*gravity[1]+gravity[2]*gravity[2]};
  reset();
  return false;
 }
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
  failure={};
  if(calibration!=calibrationId){reset();calibration=calibrationId;}
  const uint32_t intervalUs=initialized?uint32_t(atUs-previousAtUs):0;
  if(!sampleValid||!sequence||!std::isfinite(rate[0])||!std::isfinite(rate[1])||!std::isfinite(rate[2]))
   return reject("IMU_INPUT_INVALID",atUs,intervalUs,gravity);
  if(initialized&&sequence==value.sequence)return value.valid;
  if(initialized&&int32_t(sequence-value.sequence)<=0)
   return reject("SAMPLE_ORDER",atUs,intervalUs,gravity);
  // A delayed I2C read can complete close to the next scheduled read. Keep
  // the previous estimate and its timestamp until enough real time elapses.
  if(initialized&&intervalUs<1000)return value.valid;
  if(initialized&&intervalUs>12000)return reject("SAMPLE_GAP",atUs,intervalUs,gravity);
  float roll=0,pitch=0;
  const bool accel=gravityAngles(gravity,roll,pitch);
  const float dt=initialized?intervalUs*.000001f:.004f;
  if(!initialized){
   if(!accel)return reject("GRAVITY_UNAVAILABLE",atUs,intervalUs,gravity);
   value.roll=roll;value.pitch=pitch;value.varianceRoll=value.variancePitch=4;
   value.accelAtUs=atUs;initialized=true;
  }else{
   // Euler rate conversion couples body rates during simultaneous rotations.
   // Pitch singularities are outside the supported ±80 degree envelope.
   constexpr float radians=.017453292519943295f;
   const float r=value.roll*radians,p=value.pitch*radians;
   if(std::fabs(value.pitch)>=80)return reject("PITCH_LIMIT",atUs,intervalUs,gravity);
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
  if(!std::isfinite(value.roll)||!std::isfinite(value.pitch))return reject("NONFINITE_ESTIMATE",atUs,intervalUs,gravity);
  if(std::fabs(value.pitch)>=80)return reject("PITCH_LIMIT",atUs,intervalUs,gravity);
  if(uint32_t(atUs-value.accelAtUs)>500000)return reject("GRAVITY_TIMEOUT",atUs,intervalUs,gravity);
  value.valid=true;
  return true;
 }
};

inline float zjAngleStick(uint16_t pulse){
 const float offset=float(std::max(1000,std::min(2000,int(pulse))))-1500;
 return std::fabs(offset)<=15?0:offset*.10f; // degrees, bounded ±50°
}
