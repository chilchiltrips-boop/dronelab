#pragma once
#include <stdint.h>

// The mapped auxiliary input defaults to physical CH5. The middle band holds
// the previous mode, exactly as flight_mode in the supplied working sketch.
struct ZjPpmModeSwitch {
 static constexpr uint16_t ANGLE_MAX_US=1400,ACRO_MIN_US=1600;
 bool angle=true,known=false,haveFrame=false;
 uint32_t lastAt=0;
 void reset(bool fallbackAngle=true){*this=ZjPpmModeSwitch{};angle=fallbackAngle;}
 void accept(uint16_t pulse,uint32_t capturedAt){
  if(pulse<1000||pulse>2000||(haveFrame&&int32_t(capturedAt-lastAt)<=0))return;
  haveFrame=true;lastAt=capturedAt;
  if(pulse<ANGLE_MAX_US){angle=true;known=true;}
  else if(pulse>ACRO_MIN_US){angle=false;known=true;}
 }
};

inline bool zjSelectPpmAngle(bool current,bool requested,bool flying,bool level,bool attitudeReady){
 return flying&&requested&&!current&&!attitudeReady?current:requested;
}
