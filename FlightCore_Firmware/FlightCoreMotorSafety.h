#pragma once
#include <stdint.h>

// Hardware-independent A2 BENCH interlock. This component does not write pins,
// authenticate callers, store settings or assert physical motor speed. A hardware
// adapter must enforce its outputs and an independent fail-safe on task failure.
struct ZjMotorInput {
 enum Source : uint8_t { NONE, PPM, WEB, ANDROID_AP, ANDROID_WEBRTC };
 Source source=NONE;
 bool selected=false, valid=false, inputArmed=false, safetySwitch=false;
 uint32_t sequence=0, receivedMs=0;
 uint16_t throttle=1000, yaw=1500;
};

struct ZjMotorSafety {
 enum Mode : uint8_t { DISABLED, READY, INPUT_TEST, SINGLE_TEST, ALL_TEST, CAL_HIGH, CAL_LOW, FAULT };
 enum Reason : uint8_t { NONE, USER_STOP, SESSION_EXPIRED, INPUT_LOST, INPUT_CHANGED,
  ARM_REQUIRED, THROTTLE_HIGH, SWITCH_REQUIRED, TEST_FINISHED, CAL_TIMEOUT, CAL_FINISHED,
  OUTPUT_ERROR, DEADLINE_MISSED, CONFIG_ERROR };
 static constexpr uint32_t SESSION_MS=1500, INPUT_PPM_MS=150, INPUT_NETWORK_MS=300;
 static constexpr uint32_t GESTURE_MS=2000, TEST_MAX_MS=2000, CAL_HIGH_MAX_MS=15000, CAL_LOW_MS=3000;
 static constexpr uint16_t MIN_US=1000, MAX_US=2000, LOW_US=1050, LEFT_US=1100, RIGHT_US=1900;
 static constexpr uint8_t MAX_TEST_PERCENT=20;

 Mode mode=DISABLED;
 Reason reason=NONE;
 bool armed=false, requireSwitch=false, neutralSeen=false, holding=false;
 bool pinsConfirmed=false, benchEnabled=false;
 uint8_t testMotor=0, percent=0;
 uint16_t pulses[4]={MIN_US,MIN_US,MIN_US,MIN_US};
 uint32_t sessionAt=0, modeAt=0, holdAt=0, lastSequence=0, lastInputAt=0;
 ZjMotorInput::Source sessionSource=ZjMotorInput::NONE;

 static bool elapsed(uint32_t now,uint32_t start,uint32_t ms){return uint32_t(now-start)>=ms;}
 static bool pulseValid(uint16_t p){return p>=MIN_US&&p<=MAX_US;}
 static uint16_t percentPulse(uint8_t p){return uint16_t(MIN_US+10U*p);}
 void minimum(){for(uint8_t i=0;i<4;i++)pulses[i]=MIN_US;}
 void resetGesture(){neutralSeen=false;holding=false;holdAt=0;lastSequence=0;lastInputAt=0;}
 void disable(Reason why=USER_STOP){
  minimum();mode=DISABLED;reason=why;armed=false;benchEnabled=false;sessionSource=ZjMotorInput::NONE;resetGesture();
 }
 void fault(Reason why){disable(why);mode=FAULT;}
 bool prepare(uint32_t now,bool mappingConfirmed,bool propsRemoved){
  if(mode!=DISABLED||!mappingConfirmed||!propsRemoved)return false;
  pinsConfirmed=true;benchEnabled=true;armed=false;mode=READY;reason=NONE;sessionAt=modeAt=now;
  minimum();resetGesture();return true;
 }
 bool keep(uint32_t now){
  if(!benchEnabled||mode==DISABLED||mode==FAULT)return false;
  if(elapsed(now,sessionAt,SESSION_MS)){disable(SESSION_EXPIRED);return false;}
  sessionAt=now;return true;
 }
 bool startInput(uint32_t now,ZjMotorInput::Source source,bool switchRequired){
  if(mode!=READY||source==ZjMotorInput::NONE||elapsed(now,sessionAt,SESSION_MS))return false;
  mode=INPUT_TEST;sessionSource=source;requireSwitch=switchRequired;armed=false;modeAt=now;reason=NONE;
  minimum();resetGesture();return true;
 }
 bool startSingle(uint32_t now,uint8_t motor,uint8_t requestedPercent,uint32_t durationMs){
  if(mode!=READY||elapsed(now,sessionAt,SESSION_MS)||motor<1||motor>4||
     requestedPercent>MAX_TEST_PERCENT||durationMs==0||durationMs>TEST_MAX_MS)return false;
  testMotor=motor;percent=requestedPercent;modeAt=now;lastInputAt=durationMs;
  mode=SINGLE_TEST;armed=false;reason=NONE;minimum();pulses[motor-1]=percentPulse(percent);return true;
 }
 bool startAll(uint32_t now,uint8_t requestedPercent,uint32_t durationMs){
  if(mode!=READY||elapsed(now,sessionAt,SESSION_MS)||requestedPercent>MAX_TEST_PERCENT||
     durationMs==0||durationMs>TEST_MAX_MS)return false;
  percent=requestedPercent;modeAt=now;lastInputAt=durationMs;
  mode=ALL_TEST;armed=false;reason=NONE;for(uint8_t i=0;i<4;i++)pulses[i]=percentPulse(percent);return true;
 }
 bool startCalibration(uint32_t now,bool powerDisconnectedConfirmed){
  if(mode!=READY||!powerDisconnectedConfirmed||elapsed(now,sessionAt,SESSION_MS))return false;
  mode=CAL_HIGH;modeAt=now;reason=NONE;armed=false;minimum();for(uint8_t i=0;i<4;i++)pulses[i]=MAX_US;return true;
 }
 bool calibrationLow(uint32_t now){
  if(mode!=CAL_HIGH||elapsed(now,modeAt,CAL_HIGH_MAX_MS)||elapsed(now,sessionAt,SESSION_MS))return false;
  mode=CAL_LOW;modeAt=now;minimum();return true;
 }
 bool validInput(uint32_t now,const ZjMotorInput& i)const{
  const uint32_t maximum=i.source==ZjMotorInput::PPM?INPUT_PPM_MS:INPUT_NETWORK_MS;
  return i.selected&&i.valid&&i.source==sessionSource&&i.sequence&&pulseValid(i.throttle)&&pulseValid(i.yaw)&&
   uint32_t(now-i.receivedMs)<=maximum;
 }
 bool armRemote(uint32_t now,const ZjMotorInput& i){
  if(mode!=INPUT_TEST||i.source==ZjMotorInput::PPM||!validInput(now,i)||!i.inputArmed||i.throttle>LOW_US||
     elapsed(now,sessionAt,SESSION_MS))return false;
  armed=true;reason=NONE;return true;
 }
 void update(uint32_t now,const ZjMotorInput& i){
  if(mode==DISABLED||mode==FAULT)return;
  if(elapsed(now,sessionAt,SESSION_MS)){disable(SESSION_EXPIRED);return;}
  if(mode==CAL_HIGH){if(elapsed(now,modeAt,CAL_HIGH_MAX_MS))disable(CAL_TIMEOUT);return;}
  if(mode==CAL_LOW){if(elapsed(now,modeAt,CAL_LOW_MS))disable(CAL_FINISHED);return;}
  if(mode==SINGLE_TEST||mode==ALL_TEST){if(elapsed(now,modeAt,lastInputAt))disable(TEST_FINISHED);return;}
  if(mode!=INPUT_TEST)return;
  if(!validInput(now,i)){
   const bool different=i.selected&&i.source!=sessionSource;
   disable(different?INPUT_CHANGED:INPUT_LOST);return;
  }
  if(requireSwitch&&!i.safetySwitch){if(armed)disable(SWITCH_REQUIRED);else {minimum();resetGesture();}return;}
  if(i.source==ZjMotorInput::PPM){
   // Only new accepted frames can advance the gesture; a held/stale frame
   // must not cause arming or survive a clock wrap as a fresh event.
   if(i.sequence!=lastSequence){
    if(lastSequence&&int32_t(i.sequence-lastSequence)<=0){disable(INPUT_LOST);return;}
    if(lastSequence&&uint32_t(i.receivedMs-lastInputAt)>INPUT_PPM_MS){disable(INPUT_LOST);return;}
    lastSequence=i.sequence;lastInputAt=i.receivedMs;
    const bool low=i.throttle<=LOW_US;
    if(low&&i.yaw>=1400&&i.yaw<=1600){neutralSeen=true;holding=false;}
    else if(low&&neutralSeen&&((!armed&&i.yaw>=RIGHT_US)||(armed&&i.yaw<=LEFT_US))){
     if(!holding){holding=true;holdAt=i.receivedMs;}
     if(elapsed(i.receivedMs,holdAt,GESTURE_MS)){
      if(armed){disable(USER_STOP);return;}
      armed=true;holding=false;neutralSeen=false;reason=NONE;
     }
    }else holding=false;
   }
  }else if(armed&&!i.inputArmed){disable(USER_STOP);return;}
  if(!armed){minimum();return;}
  // Bench-limited, direct throttle only. No flight mixer or stabilization.
  uint16_t value=i.throttle;const uint16_t cap=percentPulse(MAX_TEST_PERCENT);if(value>cap)value=cap;
  for(uint8_t n=0;n<4;n++)pulses[n]=value;
 }
};
