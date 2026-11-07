#pragma once
#include "FlightCoreReceiverSnapshot.h"

// Output capability and measured hardware qualification are different facts.
// The explicit experimental build permits setup-gated Acro/Angle control. Ordinary
// bench packages remain non-actuating. Neither build flag asserts physical PASS.
#if defined(ZJ_A2_EXPERIMENTAL_RATE_FLIGHT)
 #if !defined(CONFIG_IDF_TARGET_ESP32C6)
  #error "Experimental Rate flight must target the A2 ESP32-C6 board"
 #endif
 static constexpr bool ZJ_FLIGHT_OUTPUT_ENABLED=true;
#else
 static constexpr bool ZJ_FLIGHT_OUTPUT_ENABLED=false;
#endif
static constexpr bool ZJ_FLIGHT_HARDWARE_QUALIFIED=false;
static constexpr uint16_t ZJ_FLIGHT_STOP_THROTTLE_US=1050;
// Armed LOW throttle sends ESC minimum (not spin-idle). Disarm/STOP/failsafe sends PWM OFF.
static constexpr uint16_t ZJ_FLIGHT_ARMED_IDLE_US=1000;
static constexpr uint16_t ZJ_FLIGHT_THROTTLE_CAP_US=1800;
static constexpr uint32_t ZJ_FLIGHT_OUTPUT_LEASE_US=8000;

struct ZjFlightConditions {
 FlightReceiverSnapshot input;
 uint32_t nowMs=0,inputDeadlineMs=0;
 bool acro=false,angle=false,attitudeReady=false,levelCalibrated=false,localController=false;
 bool imuFresh=false,timingHealthy=false,outputOffAck=false;
 bool emergency=false,escCalibration=false,benchActive=false,maintenance=false;
 bool wiringVerified=false,driverReady=false,escOperatorConfirmed=false;
 bool setupComplete=false,pidSaved=false,escSequenceComplete=false;
};

enum class ZjFlightState : uint8_t {OUTPUT_OFF,ARMED,FAILSAFE};
enum class ZjFlightFault : uint8_t {NONE,UNQUALIFIED,EMERGENCY_STOP,OUTPUT_RESERVED,
 INPUT_STALE,INPUT_DISARMED,SOURCE_CHANGED,IMU_STALE,DEADLINE_MISSED,MODE_UNSUPPORTED,EXPLICIT_ARM_REQUIRED,THROTTLE_HIGH,OFF_UNVERIFIED,
 SOURCE_UNSUPPORTED,WIRING_UNVERIFIED,OUTPUT_ERROR,PID_INVALID,LOW_THROTTLE,PROFILE_CHANGED,PPM_SIGNAL_LOST,ESC_UNCONFIRMED,
 SETUP_INCOMPLETE,PID_NOT_SAVED,ATTITUDE_INVALID,LEVEL_REQUIRED};

inline const char* zjFlightFaultName(ZjFlightFault fault){
 const char* const names[]={"NONE","UNQUALIFIED","EMERGENCY_STOP","OUTPUT_RESERVED","INPUT_STALE","INPUT_DISARMED",
  "SOURCE_CHANGED","IMU_STALE","DEADLINE_MISSED","MODE_UNSUPPORTED","EXPLICIT_ARM_REQUIRED","THROTTLE_HIGH","OFF_UNVERIFIED",
  "SOURCE_UNSUPPORTED","WIRING_UNVERIFIED","OUTPUT_ERROR","PID_INVALID","LOW_THROTTLE","PROFILE_CHANGED","PPM_SIGNAL_LOST","ESC_UNCONFIRMED",
  "SETUP_INCOMPLETE","PID_NOT_SAVED","ATTITUDE_INVALID","LEVEL_REQUIRED"};
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
inline uint16_t zjFlightArmedLowPulse(uint16_t throttle){return zjFlightLowThrottle(throttle)?ZJ_FLIGHT_ARMED_IDLE_US:0;}
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
 ZjFlightFault fault(const ZjFlightConditions& c,bool enabled)const{
  if(c.emergency)return ZjFlightFault::EMERGENCY_STOP;
  if(c.escCalibration||c.benchActive||c.maintenance)return ZjFlightFault::OUTPUT_RESERVED;
  if(!enabled)return ZjFlightFault::UNQUALIFIED;
  if(!c.acro&&!c.angle)return ZjFlightFault::MODE_UNSUPPORTED;
  if(c.angle&&!c.levelCalibrated)return ZjFlightFault::LEVEL_REQUIRED;
  if(c.angle&&!c.attitudeReady)return ZjFlightFault::ATTITUDE_INVALID;
  if(!c.driverReady)return ZjFlightFault::OUTPUT_ERROR;
  if(!c.setupComplete)return ZjFlightFault::SETUP_INCOMPLETE;
  if(!c.pidSaved)return ZjFlightFault::PID_NOT_SAVED;
  if(!c.wiringVerified)return ZjFlightFault::WIRING_UNVERIFIED;
  if(!c.escOperatorConfirmed&&!c.escSequenceComplete)return ZjFlightFault::ESC_UNCONFIRMED;
  if(!c.timingHealthy)return ZjFlightFault::DEADLINE_MISSED;
  if(!c.imuFresh)return ZjFlightFault::IMU_STALE;
  if(!c.input.fresh(c.nowMs,c.inputDeadlineMs))return ZjFlightFault::INPUT_STALE;
  if(c.input.source!=ZjReceiverSource::PPM&&!c.localController)return ZjFlightFault::SOURCE_UNSUPPORTED;
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

// One accepted, fresh DISARM -> ARM edge per receiver generation. A failed
// attempt is consumed: holding the sticks ARMED cannot retry when a condition
// later becomes healthy. A reboot/new source already reporting ARM is ignored.
struct ZjFlightArmEdge {
 uint32_t generation=0,sequence=0;
 ZjReceiverSource source=ZjReceiverSource::NONE;
 bool seen=false,disarmed=false,armed=false;
 bool accept(const FlightReceiverSnapshot& input,uint32_t now,uint32_t deadline){
  if(!input.fresh(now,deadline)){*this={};return false;}
  if(!seen||generation!=input.generation||source!=input.source){
   *this={};seen=true;generation=input.generation;source=input.source;
  }
  if(sequence&&int32_t(input.sequence-sequence)<=0)return false;
  sequence=input.sequence;
  if(!input.inputArmed){disarmed=true;armed=false;return false;}
  const bool edge=disarmed&&!armed;
  disarmed=false;armed=true;return edge;
 }
};
