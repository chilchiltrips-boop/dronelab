// Execute the production PPM ISR, mailbox, ownership and loss handling.
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
static void frame(int arm,bool process=true,int roll=1500,int throttle=1000){
 static bool started=false;
 if(!started){zjPpmLastEdge=clockUs;edge(4000);started=true;}
 const int channels[8]={roll,1500,throttle,1500,arm,1500,1500,1500};
 for(int value:channels)edge(value);
 edge(4000);
 if(process)zjPpmLoop(clockMs);
}
static void acquire(){
 frame(1000);frame(1000);frame(1000);
 assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcInputArmed);
 frame(2000);assert(zjRcInputArmed);
}
int main(){
 clockMs=1000;zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";zjPpmSetup();
 acquire();
 // A completed packet must retain its arrival time while the loop is occupied.
 frame(2000,false);waitMs(500);zjPpmLoop(clockMs);
 assert(!zjRcOwned&&!zjRcInputArmed&&!zjPpmSignalFresh(clockMs));
 assert(zjRcLastReleaseReason=="PPM_SIGNAL_LOST"&&zjPpmLostCount==1);
 // Resuming with ARM still high must not restore the expired input session.
 frame(2000);frame(2000);assert(!zjRcOwned&&!zjRcInputArmed);
 acquire();
 // The mailbox holds the latest complete frame rather than the oldest unread one.
 frame(2000,false,1100);frame(2000,false,1900);zjPpmLoop(clockMs);
 assert(zjRcInputArmed&&zjRcRoll==1900);
 // A fresh resumed packet cannot hide a gap in the previously accepted input.
 waitMs(200);frame(2000,false);frame(2000);assert(!zjRcOwned&&!zjRcInputArmed);
 assert(zjRcLastReleaseReason=="PPM_SIGNAL_LOST");
 acquire();
 // Clock captured before the mailbox snapshot must not falsely expire a packet.
 frame(2000,false);zjPpmLoop(clockMs-1);
 assert(zjRcInputArmed&&zjPpmSignalFresh(clockMs));
 // A real loss still releases PPM and requires a new low-switch sequence.
 waitMs(151);zjPpmLoop(clockMs);assert(!zjRcOwned&&!zjRcInputArmed);
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));
 frame(1000);frame(1000);frame(1000);frame(2000);
 assert(zjRcOwned&&zjRcSource=="ANDROID"&&!zjRcInputArmed);
 std::cout<<"PASS production PPM receiver: arrival timestamps, latest mailbox, loss/re-arm, clock race, ownership"<<std::endl;
 return 0;
}
