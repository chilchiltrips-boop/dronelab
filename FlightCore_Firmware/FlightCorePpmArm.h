#pragma once
#include <stdint.h>
#include <stdlib.h>

// Working sketch arm_disarm, driven by ordered fresh PPM capture frames.
// The caller resets this state on physical receiver loss or source changes.
struct ZjPpmArmGesture {
 static constexpr uint16_t THROTTLE_LOW_US=1050,YAW_LEFT_US=1100,YAW_RIGHT_US=1900;
 static constexpr uint32_t HOLD_MS=5000,DISARM_HOLD_MS=1000,AUTO_DISARM_MS=15000;
 bool armed=false,consumed=false,haveFrame=false,rearmBlocked=false;
 uint8_t holdDirection=0;
 uint32_t holdAt=0,lastAt=0,movementAt=0;
 uint16_t lastThrottle=1000;

 void reset(){*this=ZjPpmArmGesture{};rearmBlocked=true;}
 void accept(uint16_t throttle,uint16_t yaw,uint32_t capturedAt){
  if(haveFrame&&int32_t(capturedAt-lastAt)<=0)return;
  haveFrame=true;lastAt=capturedAt;
  if(rearmBlocked){
   if(throttle<THROTTLE_LOW_US&&yaw>=1400&&yaw<=1600)rearmBlocked=false;
   else return;
  }
  const uint8_t gesture=throttle<THROTTLE_LOW_US?(yaw>YAW_RIGHT_US?1:yaw<YAW_LEFT_US?2:0):0;
  if(gesture!=holdDirection){holdDirection=gesture;holdAt=capturedAt;consumed=false;}
  const uint32_t holdMs=gesture==1?HOLD_MS:DISARM_HOLD_MS;
  if(gesture&&!consumed&&uint32_t(capturedAt-holdAt)>=holdMs){
   if(gesture==1&&!armed){movementAt=capturedAt;lastThrottle=throttle;}
   armed=gesture==1;consumed=true;
  }
  if(!armed)return;
  if(throttle>=THROTTLE_LOW_US||lastThrottle>=THROTTLE_LOW_US||abs(int(throttle)-int(lastThrottle))>=20){
   lastThrottle=throttle;movementAt=capturedAt;
  }
  if(throttle<THROTTLE_LOW_US&&uint32_t(capturedAt-movementAt)>=AUTO_DISARM_MS){
   armed=false;consumed=true;
  }
 }
};
