#pragma once
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Axis-aligned corrections only. Use fixed-point storage to make readback
// deterministic and keep the serial command record small.
struct ZjAccelModel {
 bool six=false, level=false;
 int16_t offset[3]={}, scale[3]={1000,1000,1000}, trim[3]={};
 float correct(float raw, int axis) const {
  return (raw-offset[axis]/1000.0f)*scale[axis]/1000.0f;
 }
 bool valid() const {
  for(int i=0;i<3;i++){
   if(abs(offset[i])>250||scale[i]<750||scale[i]>1250||abs(trim[i])>300)return false;
   if(!six&&(offset[i]||scale[i]!=1000))return false;
   if(!level&&trim[i])return false;
  }
  return true;
 }
 void encode(char* out,size_t size) const {
  snprintf(out,size,"%d:%d:%d:%d:%d:%d:%d:%d:%d:%d:%d",six,level,
   offset[0],offset[1],offset[2],scale[0],scale[1],scale[2],trim[0],trim[1],trim[2]);
 }
 bool decode(const char* raw){
  int sixFlag=0,levelFlag=0,v[9]={};char tail=0;
  if(sscanf(raw,"%1d:%1d:%5d:%5d:%5d:%5d:%5d:%5d:%5d:%5d:%5d%c",
   &sixFlag,&levelFlag,&v[0],&v[1],&v[2],&v[3],&v[4],&v[5],&v[6],&v[7],&v[8],&tail)!=11||
   (sixFlag!=0&&sixFlag!=1)||(levelFlag!=0&&levelFlag!=1))return false;
  ZjAccelModel next;next.six=sixFlag;next.level=levelFlag;
  for(int i=0;i<3;i++){
   if(abs(v[i])>250||v[i+3]<750||v[i+3]>1250||abs(v[i+6])>300)return false;
   next.offset[i]=v[i];next.scale[i]=v[i+3];next.trim[i]=v[i+6];
  }
  char canonical[80];next.encode(canonical,sizeof(canonical));
  if(!next.valid()||strcmp(raw,canonical))return false;
  *this=next;return true;
 }
};

struct ZjAccelCapture {
 static constexpr uint16_t TARGET=128;
 static constexpr uint32_t TIMEOUT_MS=6000;
 ZjAccelModel result;
 float faces[6][3]={}, sum[3]={}, low[3]={}, high[3]={};
 uint8_t face=4,mask=0;
 uint16_t samples=0;
 uint32_t started=0;
 bool running=false,quick=false,ready=false;
 const char* state="IDLE";

 void start(uint32_t now,uint8_t pose,bool isQuick,const ZjAccelModel& saved){
  if(isQuick)mask=0;
  face=pose;quick=isQuick;ready=false;running=true;started=now;samples=0;state="CAPTURING";
  result=saved;
  for(int i=0;i<3;i++)sum[i]=low[i]=high[i]=0;
 }
 void fail(const char* reason){running=false;ready=false;state=reason;}
 void tick(uint32_t now){
  if(running&&uint32_t(now-started)>=TIMEOUT_MS)fail("TIMEOUT");
 }
 void feed(const float raw[3],const float rates[3]){
  if(!running)return;
  const int axis=face/2;const float sign=(face&1)?-1.0f:1.0f;
  float magnitudeSquared=0;
  for(int i=0;i<3;i++){
   const float sample=quick?result.correct(raw[i],i):raw[i];
   if(!isfinite(sample)||!isfinite(rates[i])||fabsf(rates[i])>3.0f){fail("MOVING_OR_INVALID");return;}
   if(i==axis?(sample*sign<0.70f||sample*sign>1.30f):fabsf(sample)>0.28f){fail("WRONG_ORIENTATION");return;}
   magnitudeSquared+=sample*sample;
   low[i]=samples?fminf(low[i],sample):sample;high[i]=samples?fmaxf(high[i],sample):sample;
   if(high[i]-low[i]>0.08f){fail("UNSTABLE");return;}
   sum[i]+=sample;
  }
  if(magnitudeSquared<0.75f*0.75f||magnitudeSquared>1.30f*1.30f){fail("GRAVITY_OUT_OF_RANGE");return;}
  if(++samples<TARGET)return;
  running=false;
  if(quick){
   result.level=true;
   for(int i=0;i<3;i++)result.trim[i]=lroundf(1000*(sum[i]/TARGET-(i==2?1.0f:0.0f)));
  }else{
   for(int i=0;i<3;i++)faces[face][i]=sum[i]/TARGET;
   mask|=1U<<face;
   if(mask!=63){state="FACE_CAPTURED";return;}
   result=ZjAccelModel{};result.six=true;
   for(int i=0;i<3;i++){
    const float p=faces[2*i][i],n=faces[2*i+1][i],span=p-n;
    if(span<1.6f||span>2.67f){fail("FIT_OUT_OF_RANGE");return;}
    result.offset[i]=lroundf(500*(p+n));result.scale[i]=lroundf(2000/span);
   }
   for(int f=0;f<6;f++)for(int i=0;i<3;i++){
    const float expected=f/2==i?((f&1)?-1.0f:1.0f):0.0f;
    if(fabsf(result.correct(faces[f][i],i)-expected)>0.20f){fail("FIT_RESIDUAL");return;}
   }
  }
  if(!result.valid()){fail("FIT_OUT_OF_RANGE");return;}
  ready=true;state="CAPTURED";
 }
};
