#pragma once
#include "FlightCoreReceiverSnapshot.h"

// Firmware builds in this repository are unqualified for flight actuation.
// The gate has no RC, USB, browser, persistence or boot-time bypass.
static constexpr bool ZJ_FLIGHT_HARDWARE_QUALIFIED=false;

struct ZjFlightConditions {
 FlightReceiverSnapshot input;
 uint32_t nowMs=0,inputDeadlineMs=0;
 bool acro=false,imuFresh=false,timingHealthy=false,outputOffAck=false;
 bool emergency=false,escCalibration=false,benchActive=false,maintenance=false;
};

enum class ZjFlightState : uint8_t {OUTPUT_OFF,ARMED,FAILSAFE};
enum class ZjFlightFault : uint8_t {NONE,UNQUALIFIED,EMERGENCY_STOP,OUTPUT_RESERVED,
 INPUT_STALE,INPUT_DISARMED,SOURCE_CHANGED,IMU_STALE,DEADLINE_MISSED,MODE_UNSUPPORTED,EXPLICIT_ARM_REQUIRED,THROTTLE_HIGH,OFF_UNVERIFIED};

struct ZjFlightOutputGate {
 ZjFlightState state=ZjFlightState::OUTPUT_OFF;
 ZjFlightFault reason=ZjFlightFault::NONE;
 uint32_t generation=0;
 ZjReceiverSource source=ZjReceiverSource::NONE;

 void revoke(ZjFlightFault fault){
  if(state==ZjFlightState::ARMED)state=ZjFlightState::FAILSAFE;
  reason=fault;
 }
 ZjFlightFault fault(const ZjFlightConditions& c,bool qualified)const{
  if(c.emergency)return ZjFlightFault::EMERGENCY_STOP;
  if(c.escCalibration||c.benchActive||c.maintenance)return ZjFlightFault::OUTPUT_RESERVED;
  if(!qualified)return ZjFlightFault::UNQUALIFIED;
  if(!c.acro)return ZjFlightFault::MODE_UNSUPPORTED;
  if(!c.timingHealthy)return ZjFlightFault::DEADLINE_MISSED;
  if(!c.imuFresh)return ZjFlightFault::IMU_STALE;
  if(!c.input.fresh(c.nowMs,c.inputDeadlineMs))return ZjFlightFault::INPUT_STALE;
  if(!c.input.inputArmed)return ZjFlightFault::INPUT_DISARMED;
  return ZjFlightFault::NONE;
 }
 bool arm(const ZjFlightConditions& c,bool qualified,bool explicitHandshake){
  if(state==ZjFlightState::ARMED)return false;
  reason=fault(c,qualified);
  if(reason==ZjFlightFault::NONE&&!explicitHandshake)reason=ZjFlightFault::EXPLICIT_ARM_REQUIRED;
  if(reason==ZjFlightFault::NONE&&c.input.channels[2]>1050)reason=ZjFlightFault::THROTTLE_HIGH;
  if(reason==ZjFlightFault::NONE&&!c.outputOffAck)reason=ZjFlightFault::OFF_UNVERIFIED;
  if(reason!=ZjFlightFault::NONE)return false;
  source=c.input.source;generation=c.input.generation;state=ZjFlightState::ARMED;
  return true;
 }
 bool permit(const ZjFlightConditions& c,bool qualified){
  if(state!=ZjFlightState::ARMED)return false;
  auto faultNow=fault(c,qualified);
  if(faultNow==ZjFlightFault::NONE&&(generation!=c.input.generation||source!=c.input.source))
   faultNow=ZjFlightFault::SOURCE_CHANGED;
  if(faultNow!=ZjFlightFault::NONE){revoke(faultNow);return false;}
  return true;
 }
};
