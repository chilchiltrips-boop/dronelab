#pragma once
#include <stdint.h>

// All differences are modulo 2^32. Callers must service within half a wrap.
// Rates count actual events over >=1 s windows; unknown before first window.
struct ZjRateCounter {
 uint32_t at=0,events=0,lastEventUs=0;
 float hz=0;
 bool started=false,known=false;
 void reset(uint32_t now){at=lastEventUs=now;events=0;hz=0;started=true;known=false;}
 void update(uint32_t now){
  if(!started){reset(now);return;}
  const uint32_t elapsed=now-at;
  if(elapsed>=1000000){hz=float(events)*1000000.0f/float(elapsed);events=0;at=now;known=true;}
 }
 void event(uint32_t now){if(!started)reset(now);++events;lastEventUs=now;update(now);}
 float actual(uint32_t now)const{return !known?0:uint32_t(now-lastEventUs)>=1000000?0:hz;}
};

// Shared sensor contract: timestamps refer to host acquisition, not an inferred
// conversion/interrupt time. A held sample retains its sequence and timestamp.
// GPS/barometer/magnetometer can use this without waiting in a control tick.
struct ZjSampleStamp {
 uint32_t sequence=0,atUs=0,errors=0,missed=0;
 uint16_t expectedHz=0;
 bool valid=false;
 void accept(uint32_t now){atUs=now;++sequence;valid=true;}
 uint32_t ageUs(uint32_t now)const{return uint32_t(now-atUs);}
 bool fresh(uint32_t now,uint32_t maxAgeUs)const{return valid&&ageUs(now)<=maxAgeUs;}
};

// Non-actuating scheduler math. No sensor I/O, motor API, memory allocation,
// authentication, JSON or printing belongs here. Never replay obsolete ticks.
struct ZjControlScheduler {
 static constexpr uint32_t TARGET_HZ=250,PERIOD_US=4000;
 uint32_t nextDueUs=0,lastTickUs=0,lastSuccessfulUs=0,ticks=0;
 uint32_t intervalUs=0,minIntervalUs=0,maxIntervalUs=0,jitterUs=0,maxJitterUs=0;
 uint32_t maxIntervalAtUs=0;
 uint32_t executionUs=0,maxExecutionUs=0,missedTicks=0,deadlineMisses=0,overruns=0;
 bool started=false;
 ZjRateCounter rate;
 void start(uint32_t now){*this=ZjControlScheduler{};started=true;nextDueUs=now+PERIOD_US;rate.reset(now);}
 bool begin(uint32_t now){
  if(!started)start(now);
  if(int32_t(now-nextDueUs)<0)return false;
  const uint32_t late=now-nextDueUs,skipped=late/PERIOD_US;
  missedTicks+=skipped;deadlineMisses+=skipped;nextDueUs+=(skipped+1)*PERIOD_US;
  jitterUs=late;if(late>maxJitterUs)maxJitterUs=late;
  if(ticks){intervalUs=now-lastTickUs;if(!minIntervalUs||intervalUs<minIntervalUs)minIntervalUs=intervalUs;if(intervalUs>maxIntervalUs){maxIntervalUs=intervalUs;maxIntervalAtUs=now;}}
  lastTickUs=now;++ticks;rate.event(now);return true;
 }
 void finish(uint32_t now){
  executionUs=now-lastTickUs;if(executionUs>maxExecutionUs)maxExecutionUs=executionUs;
  if(executionUs>=PERIOD_US)++overruns;
  if(int32_t(now-nextDueUs)>=0)++deadlineMisses;
  lastSuccessfulUs=now;
 }
 bool healthy(uint32_t now)const{return started&&ticks&&uint32_t(now-lastSuccessfulUs)<3*PERIOD_US&&executionUs<PERIOD_US;}
};
