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
static std::string ppmCommand(const char* input){
 char command[128];snprintf(command,sizeof(command),"%s",input);
 Serial.output.clear();Serial.capture=true;
 assert(zjPpmSerialCommand(command));
 Serial.capture=false;return Serial.output;
}
static void verifyPpmTransactions(){
 zjAdminUnlocked=true;zjAdminUnlockAt=clockMs;
 assert(ppmCommand("ZJPPM,CAL,2,920,1470,1980")=="ZJPPM,ACK,CAL,2\n");
 assert(ppmCommand("ZJPPM,MAP,8,1,3,4,5")=="ZJPPM,ACK,MAP\n");
 const auto verifyOld=[](){
  assert(zjPpmMin[1]==920&&zjPpmMid[1]==1470&&zjPpmMax[1]==1980);
  assert(zjPpmMap[0]==7&&zjPpmMap[1]==0);
 };
 zjPpmSetup();verifyOld();
 assert(ppmCommand("ZJPPM,MAP,8,8,3,4,5")=="ZJPPM,ERR,MAP_VALUE\n");
 for(unsigned fault=0;fault<6;fault++){
  const auto writes=zjKitPrefs.writes;
  if(fault==0)zjKitPrefs.failWriteAt=writes+1;
  if(fault==1)zjKitPrefs.truncateWriteAt=writes+1;
  if(fault==2)zjKitPrefs.failWriteAt=writes+2;
  if(fault==3){zjKitPrefs.mismatchAfterWrite=writes+1;zjKitPrefs.mismatchKey=ZJ_PPM_CONFIG_KEYS[1];}
  if(fault==5)zjKitPrefs.truncateWriteAt=writes+2;
  if(fault==4){zjKitPrefs.mismatchAfterWrite=writes+2;zjKitPrefs.mismatchKey=ZJ_PPM_CONFIG_HEAD;}
  assert(ppmCommand("ZJPPM,CAL,2,960,1510,2040")=="ZJPPM,NACK,STORAGE_FAILED\n");
  verifyOld();zjPpmSetup();verifyOld();
 }
 assert(ppmCommand("ZJPPM,MAP,2,1,3,4,5")=="ZJPPM,ACK,MAP\n");
 zjPpmSetup();assert(zjPpmMap[0]==1&&zjPpmMin[1]==920);
 zjAdminUnlocked=false;
}
static void verifyFlightInput(){
 zjRcRelease("test");zjPpmLastEdge=clockUs;zjPpmIndex=0;
 acquire();arm();
 auto input=zjRcReceiver();
 const uint16_t throttleUp[8]={1500,1500,1628,1500,1000,1500,1500,1500};
 waitMs(20);zjPpmPublishRmtFrame(throttleUp,clockMs);
 assert(zjPpmBindFlight(11,input,clockMs)==ZjFlightFault::THROTTLE_HIGH);
 assert(!zjPpmFlightReceiver(11).valid);

 const uint16_t neutral[8]={1500,1500,1000,1500,1000,1500,1500,1500};
 waitMs(20);zjPpmPublishRmtFrame(neutral,clockMs);zjPpmLoop(clockMs);
 input=zjRcReceiver();
 assert(zjPpmBindFlight(12,input,clockMs)==ZjFlightFault::NONE);
 const uint32_t generation=zjRcGeneration,accepted=zjRcAccepted;
 for(unsigned n=0;n<100;n++){waitMs(20);zjPpmPublishRmtFrame(throttleUp,clockMs);}
 auto live=zjPpmFlightReceiver(12);
 assert(live.fresh(clockMs,150)&&live.inputArmed&&live.generation==generation);
 assert(live.channels[2]==1628&&live.accepted==accepted+100&&zjRcAccepted==accepted);
 assert(!zjPpmFlightReceiver(11).valid);
 const IPAddress peer(192,168,4,2);
 assert(!zjRcClaim("ANDROID",zjKitCode,true,peer,"AP"));
 assert(!zjRcFrame(1,1000,1500,1500,1500,"ANDROID","observer",true,peer));
 char release[]="ZJRC,RELEASE";
 assert(zjRcSerialCommand(release));
 zjRcLoop(clockMs);
 assert(zjRcOwned&&zjRcSource=="PPM"&&zjRcInputArmed&&zjRcGeneration==generation);

 // The flight lease sees the same low-throttle yaw DISARM even if the
 // main loop has not consumed any frame of the gesture.
 const uint16_t yawLeft[8]={1500,1500,1000,1100,2000,1500,1500,1500};
 for(unsigned n=0;n<=100;n++){waitMs(20);zjPpmPublishRmtFrame(yawLeft,clockMs);}
 assert(!zjPpmFlightReceiver(12).inputArmed&&zjRcInputArmed);
 zjPpmUnbindFlight(12);zjPpmLoop(clockMs);
 assert(!zjRcInputArmed&&zjRcGeneration==generation);

 // Map and calibrate the isolated stream using the stored PPM profile.
 auto config=zjPpmCurrentConfig();
 config.map[0]=1;config.map[1]=0;config.middle[1]=1600;
 zjPpmApplyConfig(config);
 const uint16_t yawRight[8]={1500,1600,1000,1950,1000,1500,1500,1500};
 waitMs(20);zjPpmPublishRmtFrame(neutral,clockMs);zjPpmLoop(clockMs);
 for(unsigned n=0;n<=100;n++){waitMs(20);zjPpmPublishRmtFrame(yawRight,clockMs);zjPpmLoop(clockMs);}
 input=zjRcReceiver();assert(input.inputArmed);
 assert(zjPpmBindFlight(13,input,clockMs)==ZjFlightFault::NONE);
 const uint16_t mapped[8]={1600,1900,1628,1500,1000,1500,1500,1500};
 waitMs(20);zjPpmPublishRmtFrame(mapped,clockMs);
 live=zjPpmFlightReceiver(13);
 assert(live.channels[0]==1875&&live.channels[1]==1600&&live.channels[2]==1628);
 waitMs(151);assert(!zjPpmFlightReceiver(13).fresh(clockMs,150));
 zjPpmPublishRmtFrame(neutral,clockMs);
 waitMs(20);zjPpmPublishRmtFrame(neutral,clockMs);
 assert(!zjPpmFlightReceiver(13).valid); // Recovery cannot restore the old lease.
 zjPpmUnbindFlight(13);zjPpmLoop(clockMs);
 assert(!zjRcOwned&&zjRcLastReleaseReason=="PPM_SIGNAL_LOST");
 zjPpmSetup();
}
int main(){
 clockMs=1000;zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";zjPpmSetup();
 zjKitPrefs.putUShort("ppm1lo",910);
 zjKitPrefs.putString("ppmMap","21345");
 zjPpmSetup();
 assert(zjPpmMin[0]==910&&zjPpmMap[0]==1);
 auto config=zjPpmCurrentConfig();
 config.minimum[0]=950;config.map[0]=0;config.map[1]=1;
 zjKitPrefs.failNextWrite=true;
 assert(!zjPpmSaveConfig(config)&&zjPpmMin[0]==910&&zjPpmMap[0]==1);
 assert(zjPpmSaveConfig(config));
 zjPpmSetup();
 assert(zjPpmMin[0]==950&&zjPpmMap[0]==0&&zjPpmMap[1]==1);
 verifyPpmTransactions();
 zjKitPrefs.clear();
 zjPpmSetup();
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
 verifyFlightInput();
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));
 frame(1000);frame(1000);frame(1000);
 assert(zjRcOwned&&zjRcSource=="ANDROID"&&!zjRcInputArmed);
 std::cout<<"PASS production PPM receiver: CH5-free yaw ARM/DISARM, throttle gate, motor isolation, capture loss, owner arbitration"<<std::endl;
 return 0;
}
