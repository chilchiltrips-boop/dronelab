// Execute production PPM ISR, mailbox, yaw diagnostic ARM and loss handling.
#define ZJ_SHIM_EXTERNAL_MICROS
#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <iostream>
#define IRAM_ATTR
using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
static void portENTER_CRITICAL(portMUX_TYPE*){}
static void portEXIT_CRITICAL(portMUX_TYPE*){}
static void portENTER_CRITICAL_ISR(portMUX_TYPE*){}
static void portEXIT_CRITICAL_ISR(portMUX_TYPE*){}
static uint32_t clockUs=1000000;
static uint32_t micros(){return clockUs;}
constexpr int INPUT_PULLDOWN=1,RISING=1;
static void pinMode(int,int){}
static int digitalPinToInterrupt(int pin){return pin;}
static void attachInterrupt(int,void(*)(),int){}
#include "../FlightCore_Firmware/FlightCoreClassroom.h"
#include "../FlightCore_Firmware/FlightCorePpm.h"

static void edge(uint32_t us){clockUs+=us;clockMs=clockUs/1000;zjPpmInterrupt();}
static void waitMs(uint32_t ms){clockUs+=ms*1000;clockMs=clockUs/1000;}
static void frame(int ch5=1000,bool process=true,int roll=1500,int throttle=1000,int yaw=1500){
 static bool started=false;
 if(!started){zjPpmLastEdge=clockUs;edge(4000);started=true;}
 const int channels[8]={roll,1500,throttle,yaw,ch5,1500,1500,1500};
 for(int value:channels)edge(value);
 edge(4000);
 if(process)zjPpmLoop(clockMs);
}
static void hold(int yaw,int throttle=1000){
 // >2 s of continuous, individually accepted PPM frames, alternating CH5
 // proves the arm state is entirely independent of the fifth channel.
 for(unsigned n=0;n<140;n++)frame(n%2?2000:1000,true,1500,throttle,yaw);
}
static void acquire(){
 frame(2000);frame(1000);frame(2000);
 assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcInputArmed);
}
static void arm(){
 frame(2000,true,1500,1000,1500); // yaw centre is required before ARM
 hold(2000);
 assert(zjRcInputArmed&&zjPpmArm.armed);
 assert(std::string(zjPpmStatus().c_str()).find("\"armStatus\":\"ARMED\"")!=std::string::npos);
 assert(std::string(zjPpmStatus().c_str()).find("\"motorsDisabled\":true")!=std::string::npos);
}
int main(){
 clockMs=1000;zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";zjPpmSetup();
 acquire();
 // Neither CH5=2000 nor high-throttle yaw-right arms diagnostics.
 hold(2000,1200);assert(!zjRcInputArmed);
 arm();
 hold(1100);assert(!zjRcInputArmed&&!zjPpmArm.armed); // yaw-left DISARM
 assert(zjRcOwned&&zjRcSource=="PPM");
 arm();
 // Hardware mailbox captures during a busy HTTP/main loop without false loss.
 const auto losses=zjPpmLostCount;
 for(unsigned n=0;n<40;n++)frame(2000,false);
 zjPpmLoop(clockMs);assert(zjRcInputArmed&&zjPpmLostCount==losses);
 // Monitoring works independently of source ownership or high throttle.
 zjRcRelease("test");zjRcControlPath="ANDROID_AP";
 frame(2000,true,1900,1800);
 assert(!zjRcOwned&&zjPpmSignalFresh(clockMs)&&zjPpmValues[2]==1800);
 assert(std::string(zjPpmStatus().c_str()).find("\"channels\":[1900,1500,1800")!=std::string::npos);
 zjRcControlPath="AUTO";acquire();arm();
 // Unconsumed frames must retain their physical timestamps, not appear new.
 frame(2000,false);waitMs(500);zjPpmLoop(clockMs);
 assert(!zjRcOwned&&!zjRcInputArmed&&!zjPpmSignalFresh(clockMs));
 assert(zjRcLastReleaseReason=="PPM_SIGNAL_LOST"&&zjPpmLostCount==1);
 // After signal loss, right yaw alone cannot re-arm even if PPM reclaims.
 hold(2000);assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcInputArmed);
 arm();
 // Latest frame wins even after busy consumer delay.
 frame(2000,false,1100);frame(2000,false,1900);zjPpmLoop(clockMs);
 assert(zjRcInputArmed&&zjRcRoll==1900);
 // A true >150ms receiver gap releases PPM even if a new frame arrives.
 waitMs(200);frame(2000,false);frame(2000);
 assert(!zjRcInputArmed&&zjRcLastReleaseReason=="PPM_SIGNAL_LOST");
 acquire();arm();
 frame(2000,false);zjPpmLoop(clockMs-1);
 assert(zjRcInputArmed&&zjPpmSignalFresh(clockMs));
 waitMs(151);zjPpmLoop(clockMs);assert(!zjRcOwned&&!zjRcInputArmed);
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));
 frame(1000);frame(1000);frame(1000);hold(2000);
 assert(zjRcOwned&&zjRcSource=="ANDROID"&&!zjRcInputArmed);
 std::cout<<"PASS production PPM receiver: CH5-free yaw ARM/DISARM, throttle gate, motor isolation, capture loss, owner arbitration"<<std::endl;
 return 0;
}
