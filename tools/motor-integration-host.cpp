#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <iostream>
#include "../FlightCore_Firmware/FlightCoreClassroom.h"
static String zjPpmRcChannelsJson(){return "null";}
static String zjBootId="boot-1";
static bool zjMaintenanceActive=false,busy=false;
static bool zjAccessBusy(){return busy;}
static bool zjPpmAccessSafe(){return true;}
static String radio="STA";
static String zjControlRadio(){return radio;}
static String zjJson(const String& s){return String("\"")+s+"\"";}
static constexpr int HTTP_POST=2;
struct {template<class F>void on(const char*,int,F){}} zjHttp;
struct {bool localSta=false;String id="network-owner";} zjSessions[1];
static int zjRequestSession=0;
static bool zjAllow(){return true;}
static String zjArg(const String&){return "";}
static void zjReply(int,const String&){}
#include "../FlightCore_Firmware/FlightCoreMotor.h"
static bool contains(const String& s,const char* text){return std::string(s.c_str()).find(text)!=std::string::npos;}
static String token;
static String cmd(const char* action,const char* a="-",const char* b="-",const char* c="-",const char* owner="USB",bool auth=true){return zjMotorCommand(action,owner,token,a,b,c,auth);}
static void begin(){
 token="";auto s=cmd("BEGIN","PROPS_REMOVED","PINS_VERIFIED","PWM_50HZ_1000_2000");
 assert(!contains(s,"error"));token=zjMotorToken;assert(token.length()==32);assert(zjMotor.mode==ZjMotorSafety::READY);
}
int main(){
 zjKitId="ZFC-A2-012345ABCDEF";zjKitPrefs.begin("test",false);zjMotorDriverReady=true;zjMotorStopHandler=zjMotorStop;
 assert(contains(cmd("SINGLE","1","1100","800"),"motor_session"));
 assert(contains(cmd("BEGIN","PROPS_REMOVED","PINS_VERIFIED","PWM_50HZ_1000_2000","USB",false),"unlock_usb"));
 begin();assert(!contains(cmd("STATUS"),token.c_str()));
 assert(contains(cmd("SINGLE","1","1100","800","intruder"),"not_owner"));
 assert(contains(cmd("SINGLE","1","1300","800"),"invalid_motor"));
 assert(contains(cmd("LAYOUT","A2_QUAD_X"),"A2_QUAD_X"));
 assert(!contains(cmd("SINGLE","2","1100","800"),"error"));
 assert(zjMotorEnabled&&zjMotor.pulses[1]==1100&&zjMotor.pulses[0]==1000);
 clockMs=801;zjMotorLoop();assert(!zjMotorEnabled&&zjMotorToken.isEmpty());
 assert(contains(cmd("KEEP"),"TEST_FINISHED"));assert(!zjMotorEnabled);
 assert(contains(cmd("SINGLE","2","1100","800"),"expired"));
 begin();cmd("CAL_HIGH","POWER_DISCONNECTED");assert(zjMotor.pulses[0]==2000);
 clockMs+=1501;zjMotorLoop();assert(!zjMotorEnabled&&zjMotor.reason==ZjMotorSafety::SESSION_EXPIRED);
 begin();cmd("CAL_HIGH","POWER_DISCONNECTED");cmd("CAL_LOW");assert(zjMotor.pulses[0]==1000);
 for(int n=0;n<8;n++){clockMs+=400;cmd("KEEP");}assert(!zjMotorEnabled&&zjMotor.reason==ZjMotorSafety::CAL_FINISHED);
 begin();busy=true;zjMotorLoop();assert(!zjMotorEnabled);busy=false;
 zjRcOwned=true;zjRcHasFrame=true;zjRcSource="ANDROID";zjRcTransport="AP";radio="AP";zjRcOwnerId="phone";zjRcControlPath="ANDROID_AP";zjRcSeq=1;zjRcLast=clockMs;
 begin();assert(!contains(cmd("INPUT","selected","1000","CONFIRM_ALL_MOTORS"),"error"));
 zjRcInputArmed=true;zjMotorLoop();assert(zjMotor.armed);zjRcThrottle=1900;zjMotorLoop();assert(zjMotor.pulses[0]==1200);
 clockMs+=301;zjMotorLoop();assert(!zjMotorEnabled);
 zjRcInputArmed=false;zjRcThrottle=1000;zjRcLast=clockMs;begin();cmd("INPUT","selected","1000","CONFIRM_ALL_MOTORS");zjRcOwnerId="another-phone";zjMotorLoop();assert(!zjMotorEnabled&&zjMotor.reason==ZjMotorSafety::INPUT_CHANGED);
 zjRcRelease("test");radio="STA";zjRcControlPath="ANDROID_WEBRTC";
 begin();assert(!contains(cmd("RTC","1","1000","1500:0:0"),"error"));cmd("INPUT","selected","1000","CONFIRM_ALL_MOTORS");
 clockMs+=20;cmd("RTC","2","1000","1500:1:0");assert(zjMotor.armed);
 cmd("RTC","3","1800","1500:1:0");assert(zjMotor.pulses[0]==1200);
 assert(contains(cmd("RTC","3","1000","1500:1:0"),"repeated"));
 clockMs+=301;zjMotorLoop();assert(!zjMotorEnabled);
 begin();cmd("SINGLE","1","1100","800");zjMotorEmergencyStop();assert(!zjMotorEnabled&&zjMotorToken.isEmpty());
 std::cout<<"PASS production motor handler: authentication, ownership, NVS, deadlines, input loss, RTC replay and STOP\n";
}
