#pragma once
#include <stdint.h>

// AUX1 (physical CH5 by default) selects Angle/Acro; it never grants ARM.
// Accept only ordered capture timestamps. The centre band holds the mode;
// 60 ms at either endpoint rejects a single noisy pulse without delaying RC.
struct ZjPpmModeSwitch {
 static constexpr uint16_t ANGLE_MAX_US=1300,ACRO_MIN_US=1700;
 static constexpr uint32_t HOLD_MS=60;
 bool angle=true,known=false,holding=false,candidateAngle=true,haveFrame=false;
 uint32_t lastAt=0,holdAt=0;
 void reset(bool fallbackAngle=true){*this=ZjPpmModeSwitch{};angle=fallbackAngle;}
 void accept(uint16_t pulse,uint32_t capturedAt){
  if(pulse<1000||pulse>2000||(haveFrame&&int32_t(capturedAt-lastAt)<=0))return;
  if(haveFrame&&uint32_t(capturedAt-lastAt)>150)holding=false;
  haveFrame=true;lastAt=capturedAt;
  if(pulse>ANGLE_MAX_US&&pulse<ACRO_MIN_US){holding=false;return;}
  const bool desired=pulse<=ANGLE_MAX_US;
  if(!holding||candidateAngle!=desired){holding=true;candidateAngle=desired;holdAt=capturedAt;return;}
  if(uint32_t(capturedAt-holdAt)>=HOLD_MS){angle=desired;known=true;}
 }
};

// Enter Angle only with a calibrated, fresh attitude. An unavailable target
// mode leaves the currently flying Acro controller in control of its lease.
inline bool zjSelectPpmAngle(bool current,bool requested,bool flying,bool level,bool attitudeReady){
 return flying&&requested&&!current&&(!level||!attitudeReady)?current:requested;
}
