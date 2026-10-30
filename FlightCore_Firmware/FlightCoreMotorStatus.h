#pragma once
// Shared authoritative output state; diagnostic input ARM is a separate field.
static bool zjMotorEnabled=false,zjMotorArmed=false,zjMotorSessionActive=false;
static bool zjMotorInputTest=false;
static void (*zjMotorStopHandler)()=nullptr;
static void zjMotorEmergencyStop(){if(zjMotorStopHandler)zjMotorStopHandler();}
static String zjMotorFlags(){
 return String("\"motorsDisabled\":")+(zjMotorEnabled?"false":"true")+
  ",\"motorsArmed\":"+(zjMotorArmed?"true":"false");
}
