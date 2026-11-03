#pragma once
#include "FlightCoreMotorConfig.h"
#include "FlightCoreAccelCalibration.h"

struct ZjWizardConfig {
 ZjMotorConfig motor;
 ZjAccelModel accel;
 uint32_t revision=0;
 bool esc=false;

 void encode(char* out,size_t size) const {
  char wiring[64],imu[80];
  motor.encode(wiring,sizeof(wiring));accel.encode(imu,sizeof(imu));
  snprintf(out,size,"W1|%lu|%u|%s|%s",static_cast<unsigned long>(revision),unsigned(esc),wiring,imu);
 }
 bool decode(const char* raw){
  ZjWizardConfig next;unsigned long rev=0;unsigned flag=0;
  char wiring[64],imu[80],tail=0;
  if(sscanf(raw,"W1|%9lu|%1u|%63[^|]|%79[^|]%c",&rev,&flag,wiring,imu,&tail)!=4||
   !rev||flag>1||!next.motor.decode(wiring)||!next.accel.decode(imu))return false;
  next.revision=uint32_t(rev);next.esc=flag;
  char canonical[176];next.encode(canonical,sizeof(canonical));
  if(strcmp(canonical,raw))return false;
  *this=next;return true;
 }
};
