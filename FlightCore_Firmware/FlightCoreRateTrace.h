#pragma once
#include "FlightCoreFlightOutput.h"

enum class ZjRateTraceEvent : uint8_t {SAMPLE,INPUT_ARM,PREVIEW_START,FLIGHT_ARM,DISARM,STOP,FAILSAFE,EXPORT};

enum ZjRateTraceFlag : uint16_t {
 ZJ_TRACE_INPUT_ARMED=1, ZJ_TRACE_INPUT_FRESH=2, ZJ_TRACE_IMU_VALID=4, ZJ_TRACE_PID_VALID=8,
 ZJ_TRACE_APPLIED_KNOWN=16, ZJ_TRACE_OFF_ACK=32, ZJ_TRACE_FLIGHT_ARMED=64,
 ZJ_TRACE_ANGLE=128, ZJ_TRACE_PREVIEW=256, ZJ_TRACE_THROTTLE_CAPPED=512
};

struct ZjRateTraceAxis {
 float target=0,measured=0,p=0,i=0,d=0,correction=0;
};

struct ZjRateTraceSample {
 uint32_t atUs=0,dtUs=0,triggerUs=0,inputSeq=0,inputAccepted=0,inputGeneration=0;
 uint32_t imuAgeUs=UINT32_MAX,missedTicks=0,revision=0,pidGeneration=0;
 ZjRateTraceAxis axes[3];
 uint16_t channels[4]={},requested[4]={},applied[4]={};
 uint16_t inputAgeMs=UINT16_MAX,flags=0,throttleUsed=0;
 uint8_t profile=0,pidSaturationMask=0,mixClipMask=0;
 ZjReceiverSource source=ZjReceiverSource::NONE;
 ZjOutputOwner owner=ZjOutputOwner::NONE;
 ZjRateTraceEvent event=ZjRateTraceEvent::SAMPLE;
 ZjFlightFault reason=ZjFlightFault::NONE;
};

// Caller serializes access. No allocation, serialization, waiting or I/O.
// Periodic rows and event rows have separate storage so the fault never
// displaces pre-trigger history. The next capture starts a new generation.
struct ZjRateTrace {
 static constexpr uint16_t SAMPLE_HZ=50,CAPACITY=10*SAMPLE_HZ,MAX_ROWS=CAPACITY+3;
 static constexpr uint32_t PERIOD_US=1000000/SAMPLE_HZ;
 ZjRateTraceSample rows[CAPACITY],start,arm,terminal,last;
 uint32_t capture=0,nextAt=0;
 uint16_t count=0,head=0,armIndex=0;
 bool active=false,frozen=false,haveArm=false;

 void begin(const ZjRateTraceSample& value,bool preview){
  if(!++capture)++capture;
  active=true;frozen=haveArm=false;count=head=armIndex=0;
  start=value;start.event=preview?ZjRateTraceEvent::PREVIEW_START:ZjRateTraceEvent::INPUT_ARM;
  nextAt=value.atUs;last=value;
 }
 void observe(const ZjRateTraceSample& value){
  if(!active)return;
  last=value;
  if(int32_t(value.atUs-nextAt)<0)return;
  // Maintain the 50 Hz grid through scheduler jitter without replaying ticks.
  nextAt+=((value.atUs-nextAt)/PERIOD_US+1)*PERIOD_US;
  rows[head]=value;head=(head+1)%CAPACITY;
  if(count<CAPACITY)++count;else if(armIndex) --armIndex;
 }
 void flightArm(const ZjRateTraceSample& value){
  if(!active||haveArm)return;
  arm=value;arm.event=ZjRateTraceEvent::FLIGHT_ARM;
  haveArm=true;armIndex=count;
 }
 void freeze(const ZjRateTraceSample& value,ZjRateTraceEvent event,ZjFlightFault reason){
  if(!active)return;
  terminal=value;terminal.event=event;terminal.reason=reason;
  active=false;frozen=true;
 }
 uint16_t size()const{return frozen?count+2+(haveArm?1:0):0;}
 bool read(uint16_t index,ZjRateTraceSample& value)const{
  if(index>=size())return false;
  if(index==0)value=start;
  else if(index==size()-1)value=terminal;
  else if(haveArm&&index==1+armIndex)value=arm;
  else{
   const uint16_t ordinal=index-1-(haveArm&&index>1+armIndex?1:0);
   value=rows[(head+CAPACITY-count+ordinal)%CAPACITY];
  }
  return true;
 }
};

static_assert(sizeof(ZjRateTrace)<=76*1024,"Flight trace RAM budget exceeded");
