#pragma once
// Shared authoritative output state; diagnostic input ARM is a separate field.
static bool zjMotorEnabled=false,zjMotorArmed=false,zjMotorSessionActive=false;
static bool zjMotorInputTest=false;
static void (*zjMotorStopHandler)()=nullptr;
static void (*zjFlightRevokeHandler)(const char*)=nullptr;
static uint32_t zjMotorUpdateMaxUs=0;
static void zjFlightRevoke(const char* reason){if(zjFlightRevokeHandler)zjFlightRevokeHandler(reason);}
static void zjMotorEmergencyStop(){zjFlightRevoke("EMERGENCY_STOP");if(zjMotorStopHandler)zjMotorStopHandler();}
static String zjMotorFlags(){
 return String("\"motorsDisabled\":")+(zjMotorEnabled?"false":"true")+
  ",\"motorsArmed\":"+(zjMotorArmed?"true":"false");
}
