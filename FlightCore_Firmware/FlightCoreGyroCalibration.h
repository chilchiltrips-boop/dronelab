#pragma once
#include <stdint.h>
#include <math.h>

// A2 zero-rate bias only. This does not estimate attitude or drive actuators.
// Gyro variation checks cannot distinguish every constant rotation from bias;
// the board must be held still during the acquisition window.
struct ZjGyroCalibration {
 static constexpr uint32_t TARGET=2000,SETTLE_MS=250,DEADLINE_MS=15000;
 static constexpr float MAX_RATE=25.0f,MAX_SPREAD=1.5f,MAX_STDDEV=0.35f;
 const char* state="STARTING";
 const char* error="NONE";
 const char* lastFailure="NONE";
 uint32_t failures=0,lastFailureMs=0,lastFailureAttempt=0;
 uint32_t attempt=0,samples=0,validTotal=0,restarts=0,startedMs=0,endedMs=0;
 uint32_t lastSampleUs=0,maxGapUs=0,missedSamples=0,cooldownMs=0;
 bool haveSampleTime=false,cooling=false;
 double mean[3]={},m2[3]={};
 float minimum[3]={},maximum[3]={},bias[3]={},stddev[3]={};
 bool is(const char* value)const{
  const char* a=state;while(*a&&*value&&*a==*value){++a;++value;}return *a==*value;
 }
 bool waiting()const{return is("SETTLING")||is("CALIBRATING");}
 uint32_t duration(uint32_t now)const{return attempt?uint32_t((waiting()?now:endedMs)-startedMs):0;}
 void clearWindow(){samples=0;for(int i=0;i<3;i++){mean[i]=m2[i]=0;minimum[i]=maximum[i]=stddev[i]=0;}}
 void start(uint32_t now){
  if(!++attempt)++attempt;
  state="SETTLING";error="NONE";startedMs=endedMs=now;
  validTotal=restarts=maxGapUs=missedSamples=0;haveSampleTime=cooling=false;clearWindow();
  for(float& v:bias)v=0;
 }
 void fail(const char* reason,uint32_t now,bool sensor=false){
  ++failures;lastFailure=reason;lastFailureMs=now;lastFailureAttempt=attempt;
  state=sensor?"SENSOR_ERROR":"FAILED";error=reason;endedMs=now;
 }
 void tick(uint32_t now){
  if(!waiting())return;
  if(uint32_t(now-startedMs)>=DEADLINE_MS){fail("CALIBRATION_TIMEOUT",now);return;}
  if(is("SETTLING")&&uint32_t(now-startedMs)>=SETTLE_MS)state="CALIBRATING";
 }
 void restart(uint32_t now){++restarts;clearWindow();cooling=true;cooldownMs=now;}
 bool feed(const float raw[3],uint32_t now,uint32_t atUs){
  tick(now);if(!is("CALIBRATING"))return false;
  for(int i=0;i<3;i++)if(!isfinite(raw[i])){fail("INVALID_SAMPLE",now);return false;}
  ++validTotal;
  if(haveSampleTime){const uint32_t gap=atUs-lastSampleUs;if(gap>maxGapUs)maxGapUs=gap;if(gap>=2000)missedSamples+=gap/1000-1;}
  lastSampleUs=atUs;haveSampleTime=true;
  if(cooling){if(uint32_t(now-cooldownMs)<200)return false;cooling=false;}
  for(int i=0;i<3;i++){
   if(fabsf(raw[i])>MAX_RATE||(samples&&(raw[i]<minimum[i]-MAX_SPREAD||raw[i]>maximum[i]+MAX_SPREAD))){restart(now);return false;}
  }
  for(int i=0;i<3;i++){
   const float low=samples?fminf(minimum[i],raw[i]):raw[i],high=samples?fmaxf(maximum[i],raw[i]):raw[i];
   if(high-low>MAX_SPREAD){restart(now);return false;}
   minimum[i]=low;maximum[i]=high;
   const double delta=raw[i]-mean[i];mean[i]+=delta/double(samples+1);m2[i]+=delta*(raw[i]-mean[i]);
  }
  if(++samples<TARGET)return false;
  for(int i=0;i<3;i++){
   stddev[i]=sqrt(m2[i]/double(samples-1));
   if(stddev[i]>MAX_STDDEV){restart(now);return false;}
  }
  for(int i=0;i<3;i++)bias[i]=float(mean[i]);
  state="READY";error="NONE";endedMs=now;return true;
 }
};
