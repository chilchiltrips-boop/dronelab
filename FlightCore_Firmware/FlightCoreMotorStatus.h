#pragma once
#include <atomic>
// Shared authoritative output state; diagnostic input ARM is a separate field.
// The control worker, watchdog and main task share these output flags.
static std::atomic<bool> zjMotorEnabled{false},zjMotorArmed{false},zjMotorSessionActive{false};
static bool zjMotorInputTest=false;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
static std::atomic<bool> zjMotorPwmOffAck{false};
#endif
static void (*zjMotorStopHandler)()=nullptr;
static void (*zjFlightRevokeHandler)(const char*)=nullptr;
static std::atomic<uint32_t> zjMotorUpdateMaxUs{0};
static void zjFlightRevoke(const char* reason){if(zjFlightRevokeHandler)zjFlightRevokeHandler(reason);}
static void zjMotorEmergencyStop(){zjFlightRevoke("EMERGENCY_STOP");if(zjMotorStopHandler)zjMotorStopHandler();}
static bool zjMotorOutputsDisabled(){
 if(zjMotorEnabled||zjMotorArmed)return false;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 return zjMotorPwmOffAck.load();
#else
 return true;
#endif
}
static String zjMotorFlags(){
 return String("\"motorsDisabled\":")+(zjMotorOutputsDisabled()?"true":"false")+
  ",\"motorsArmed\":"+(zjMotorArmed?"true":"false");
}
