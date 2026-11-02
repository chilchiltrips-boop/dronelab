#pragma once
#include <stdint.h>

// Diagnostic PPM stick ARM/DISARM only. Never writes motor pins, changes
// motor bench ownership, or grants an actuator permission.
struct ZjPpmArmGesture {
 static constexpr uint16_t THROTTLE_LOW_US=1050;
 static constexpr uint16_t YAW_LEFT_US=1100,YAW_RIGHT_US=1900;
 static constexpr uint16_t YAW_CENTER_MIN_US=1400,YAW_CENTER_MAX_US=1600;
 static constexpr uint32_t HOLD_MS=2000;
 bool armed=false,neutralSeen=false,holding=false;
 uint8_t holdDirection=0; // 1=ARM, 2=DISARM
 uint32_t holdAt=0,lastAt=0;

 void reset(){
  armed=false;neutralSeen=false;holding=false;holdDirection=0;holdAt=0;lastAt=0;
 }
 void accept(uint16_t throttle,uint16_t yaw,uint32_t capturedAt){
  // Only new, chronologically ordered complete PPM frames count toward a
  // gesture. Physical receiver loss is reset by the PPM mailbox owner.
  if(lastAt&&int32_t(capturedAt-lastAt)<=0)return;
  // The caller uses hardware capture continuity to detect a physical loss.
  // A busy HTTP/main loop may coalesce many valid frames into one mailbox
  // observation; that is NOT a receiver gap and must not clear ARM.
  lastAt=capturedAt;
  if(throttle>THROTTLE_LOW_US){
   holding=false;holdDirection=0;
   if(!armed)neutralSeen=false;
   return;
  }
  if(yaw>=YAW_CENTER_MIN_US&&yaw<=YAW_CENTER_MAX_US){
   holding=false;holdDirection=0;
   if(!armed)neutralSeen=true;
   return;
  }
  // ARM requires yaw centre first; DISARM is always available at low
  // throttle. CH5 is deliberately not inspected here.
  const uint8_t direction=!armed&&neutralSeen&&yaw>=YAW_RIGHT_US?1:
                           armed&&yaw<=YAW_LEFT_US?2:0;
  if(!direction){holding=false;holdDirection=0;return;}
  if(!holding||holdDirection!=direction){
   holding=true;holdDirection=direction;holdAt=capturedAt;return;
  }
  if(uint32_t(capturedAt-holdAt)>=HOLD_MS){
   armed=direction==1;neutralSeen=false;holding=false;holdDirection=0;
  }
 }
};
