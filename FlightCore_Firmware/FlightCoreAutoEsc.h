#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// Original A2 implementation of a one-use, power-on ESC calibration request.
// PWM has no return channel: COMPLETE proves the controller sequence, never
// that an ESC accepted its endpoints. An operator must confirm the ESC tones.
struct ZjAutoEscRecord {
 enum State : uint8_t { EMPTY, PENDING, RUNNING, COMPLETE, INTERRUPTED, CANCELLED };
 enum Reason : uint8_t { NONE, STOPPED, RESET_DURING_SEQUENCE, COLD_POWER_ON_REQUIRED,
  SETUP_CHANGED, DRIVER_ERROR, DEADLINE_MISSED, STORAGE_ERROR };
 State state=EMPTY;
 Reason reason=NONE;
 uint32_t attempt=0;
 char kit[32]={},wiring[64]={};
 void encode(char* out,size_t size)const{
  snprintf(out,size,"E1|%08lX|%u|%u|%s|%s",static_cast<unsigned long>(attempt),unsigned(state),unsigned(reason),kit,wiring);
 }
 bool decode(const char* raw){
  ZjAutoEscRecord next;unsigned long attemptId=0;unsigned s=0,r=0;char tail=0;
  if(sscanf(raw,"E1|%8lx|%1u|%1u|%31[^|]|%63[^|]%c",&attemptId,&s,&r,next.kit,next.wiring,&tail)!=5||
   !attemptId||attemptId>0xffffffffUL||s<PENDING||s>CANCELLED||r>STORAGE_ERROR)return false;
  next.attempt=uint32_t(attemptId);next.state=State(s);next.reason=Reason(r);
  char canonical[144];next.encode(canonical,sizeof(canonical));
  if(strcmp(raw,canonical))return false;
  *this=next;return true;
 }
 static const char* stateName(State s){
  static const char* names[]={"NONE","AWAITING_POWER_CYCLE","RUNNING","SEQUENCE_COMPLETE","INCOMPLETE","CANCELLED"};return names[s];
 }
 static const char* reasonName(Reason r){
  static const char* names[]={"NONE","STOPPED","RESET_DURING_SEQUENCE","COLD_POWER_ON_REQUIRED","SETUP_CHANGED","DRIVER_ERROR","DEADLINE_MISSED","STORAGE_ERROR"};return names[r];
 }
};

// Driven by the independent 5 ms motor timer, including while Wi-Fi starts.
// A late timer cuts PWM instead of extending HIGH or replaying missed phases.
struct ZjAutoEscSequence {
 enum Phase : uint8_t { OFF_PHASE, HIGH_PHASE, LOW_PHASE, DONE, FAILED };
 static constexpr uint32_t HIGH_MS=5000,LOW_MS=5000,DEADLINE_GRACE_MS=100;
 Phase phase=OFF_PHASE;
 ZjAutoEscRecord::Reason reason=ZjAutoEscRecord::NONE;
 uint32_t phaseAt=0;
 bool active()const{return phase==HIGH_PHASE||phase==LOW_PHASE;}
 void begin(uint32_t now){phase=HIGH_PHASE;reason=ZjAutoEscRecord::NONE;phaseAt=now;}
 void stop(ZjAutoEscRecord::Reason why){phase=FAILED;reason=why;}
 uint16_t pulse()const{return phase==HIGH_PHASE?2000:phase==LOW_PHASE?1000:0;}
 uint32_t remaining(uint32_t now)const{
  const uint32_t limit=phase==HIGH_PHASE?HIGH_MS:phase==LOW_PHASE?LOW_MS:0,elapsed=now-phaseAt;
  return elapsed<limit?limit-elapsed:0;
 }
 bool update(uint32_t now){
  if(!active())return false;
  const uint32_t elapsed=now-phaseAt,limit=phase==HIGH_PHASE?HIGH_MS:LOW_MS;
  if(elapsed<limit)return false;
  if(elapsed>limit+DEADLINE_GRACE_MS)stop(ZjAutoEscRecord::DEADLINE_MISSED);
  else{phase=phase==HIGH_PHASE?LOW_PHASE:DONE;phaseAt=now;}
  return true;
 }
};
