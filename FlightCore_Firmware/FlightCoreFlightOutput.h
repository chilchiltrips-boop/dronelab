#pragma once
#include "FlightCoreReceiverSnapshot.h"

// Firmware builds in this repository are unqualified for flight actuation.
// The gate has no RC, USB, browser, persistence or boot-time bypass.
static constexpr bool ZJ_FLIGHT_HARDWARE_QUALIFIED=false;
static constexpr uint16_t ZJ_FLIGHT_STOP_THROTTLE_US=1050;
static constexpr uint16_t ZJ_FLIGHT_THROTTLE_CAP_US=1800;
static constexpr uint32_t ZJ_FLIGHT_OUTPUT_LEASE_US=8000;

struct ZjFlightConditions {
 FlightReceiverSnapshot input;
 uint32_t nowMs=0,inputDeadlineMs=0;
 bool acro=false,imuFresh=false,timingHealthy=false,outputOffAck=false;
 bool emergency=false,escCalibration=false,benchActive=false,maintenance=false;
 bool wiringVerified=false,driverReady=false;
};

enum class ZjFlightState : uint8_t {OUTPUT_OFF,ARMED,FAILSAFE};
enum class ZjFlightFault : uint8_t {NONE,UNQUALIFIED,EMERGENCY_STOP,OUTPUT_RESERVED,
 INPUT_STALE,INPUT_DISARMED,SOURCE_CHANGED,IMU_STALE,DEADLINE_MISSED,MODE_UNSUPPORTED,EXPLICIT_ARM_REQUIRED,THROTTLE_HIGH,OFF_UNVERIFIED,
 SOURCE_UNSUPPORTED,WIRING_UNVERIFIED,OUTPUT_ERROR,PID_INVALID,LOW_THROTTLE,PROFILE_CHANGED,PPM_SIGNAL_LOST};

inline const char* zjFlightFaultName(ZjFlightFault fault){
 const char* const names[]={"NONE","UNQUALIFIED","EMERGENCY_STOP","OUTPUT_RESERVED","INPUT_STALE","INPUT_DISARMED",
  "SOURCE_CHANGED","IMU_STALE","DEADLINE_MISSED","MODE_UNSUPPORTED","EXPLICIT_ARM_REQUIRED","THROTTLE_HIGH","OFF_UNVERIFIED",
  "SOURCE_UNSUPPORTED","WIRING_UNVERIFIED","OUTPUT_ERROR","PID_INVALID","LOW_THROTTLE","PROFILE_CHANGED","PPM_SIGNAL_LOST"};
 return names[static_cast<unsigned>(fault)];
}

enum class ZjOutputOwner : uint8_t {NONE,ESC_CALIBRATION,BENCH,FLIGHT};

struct ZjFlightDriverState {
 uint32_t lease=0,faultAtUs=0;
 uint16_t applied[4]={};
 ZjOutputOwner owner=ZjOutputOwner::NONE;
 ZjFlightFault fault=ZjFlightFault::NONE;
 bool offAck=false,appliedKnown=false;
};

inline bool zjFlightLowThrottle(uint16_t throttle){return throttle<=ZJ_FLIGHT_STOP_THROTTLE_US;}
inline uint16_t zjFlightMixThrottle(uint16_t throttle){
 return throttle>ZJ_FLIGHT_THROTTLE_CAP_US?ZJ_FLIGHT_THROTTLE_CAP_US:throttle;
}

struct ZjFlightOutputGate {
 ZjFlightState state=ZjFlightState::OUTPUT_OFF;
 ZjFlightFault reason=ZjFlightFault::NONE;
 uint32_t generation=0;
 ZjReceiverSource source=ZjReceiverSource::NONE;

 void revoke(ZjFlightFault fault){
  if(state==ZjFlightState::ARMED)
   state=fault==ZjFlightFault::INPUT_DISARMED?ZjFlightState::OUTPUT_OFF:ZjFlightState::FAILSAFE;
  reason=fault;
 }
 ZjFlightFault fault(const ZjFlightConditions& c,bool qualified)const{
  if(c.emergency)return ZjFlightFault::EMERGENCY_STOP;
  if(c.escCalibration||c.benchActive||c.maintenance)return ZjFlightFault::OUTPUT_RESERVED;
  if(!qualified)return ZjFlightFault::UNQUALIFIED;
  if(!c.acro)return ZjFlightFault::MODE_UNSUPPORTED;
  if(!c.driverReady)return ZjFlightFault::OUTPUT_ERROR;
  if(!c.wiringVerified)return ZjFlightFault::WIRING_UNVERIFIED;
  if(!c.timingHealthy)return ZjFlightFault::DEADLINE_MISSED;
  if(!c.imuFresh)return ZjFlightFault::IMU_STALE;
  if(!c.input.fresh(c.nowMs,c.inputDeadlineMs))return ZjFlightFault::INPUT_STALE;
  if(c.input.source!=ZjReceiverSource::PPM)return ZjFlightFault::SOURCE_UNSUPPORTED;
  if(!c.input.inputArmed)return ZjFlightFault::INPUT_DISARMED;
  return ZjFlightFault::NONE;
 }
 bool arm(const ZjFlightConditions& c,bool qualified,bool explicitHandshake){
  if(state==ZjFlightState::ARMED)return false;
  reason=fault(c,qualified);
  if(reason==ZjFlightFault::NONE&&!explicitHandshake)reason=ZjFlightFault::EXPLICIT_ARM_REQUIRED;
  if(reason==ZjFlightFault::NONE&&!zjFlightLowThrottle(c.input.channels[2]))reason=ZjFlightFault::THROTTLE_HIGH;
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
