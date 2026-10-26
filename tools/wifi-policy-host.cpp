#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <iostream>
#include <vector>
constexpr int WIFI_AP=2,WIFI_STA=1,WL_CONNECTED=3;
struct Wifi {
 int modeValue=0,link=0,clients=0;bool ap=false;std::vector<String> attempts;
 void setSleep(bool){}void setAutoReconnect(bool){}void disconnect(bool=false,bool=false){link=0;}
 int getMode(){return modeValue;}int status(){return link;}
 bool mode(int next){modeValue=next;ap=next&WIFI_AP;return true;}
 IPAddress softAPIP(){return ap?IPAddress(192,168,4,1):IPAddress();}
 bool softAPConfig(IPAddress,IPAddress,IPAddress){return true;}
 bool softAP(const char*,const char*,int,bool,int){ap=true;return true;}
 bool softAPdisconnect(bool){ap=false;modeValue&=~WIFI_AP;return true;}
 int softAPgetStationNum(){return clients;}
 void begin(const char* ssid,const char*){assert(!ap&&modeValue==WIFI_STA);attempts.emplace_back(ssid);}
} WiFi;
static String zjMode="auto",zjPhase,zjSavedSsid="Router1",zjSavedPass="password1",zjApSsid="Kit",zjApPass="12345678",zjPendingSsid="New router",zjPendingPass="password2",zjWifiTestState;
struct Profile{String ssid,pass;};static Profile zjWifiProfiles[2]={{"Router1","password1"},{"Router2","password2"}};
static int zjWifiCount=2,zjWifiAttemptIndex=0;
static bool zjApStarted=false,zjNetTesting=false,zjRcOwned=false,zjOtaAuthorized=false,zjSecureOtaActive=false,zjUsbScanning=false;
static uint32_t zjNetAttempt=0,zjOtaRebootAt=0,zjNetNextRetry=0,zjTestConnectedAt=0,zjTestAssociationEpoch=0,zjAssociationEpoch=0;
static uint8_t zjStaDisconnectReason=0,zjLastStaFailureReason=0;
static const uint32_t ZJ_NET_TEST_TIMEOUT_MS=20000;
// Radio safety is supplied by FlightCoreAccess in production; access-host.cpp
// executes that real PPM/disarm policy. This fixture isolates radio behavior.
static bool zjAccessCanSwitchRadio(){return !zjRcOwned;}
#include "../FlightCore_Firmware/FlightCoreWifiPolicy.h"
static void tick(uint32_t ms){clockMs+=ms;zjWifiPolicyLoop(clockMs);}
int main(){
 clockMs=1000;zjMode="ap";zjEnsureAP();tick(90000);
 assert(WiFi.ap&&WiFi.getMode()==WIFI_AP&&WiFi.attempts.empty());
 zjMode="sta";zjScheduleMode("sta");tick(399);assert(WiFi.ap);
 tick(1);assert(!WiFi.ap&&WiFi.getMode()==WIFI_STA&&WiFi.attempts.size()==1);
 tick(20001);assert(!WiFi.ap&&WiFi.attempts.size()==2&&WiFi.attempts.back()=="Router2");
 WiFi.link=WL_CONNECTED;tick(1);assert(!WiFi.ap&&zjPhase=="sta_connected");
 // A lost router tries all saved profiles before AP fallback. Profiles remain.
 WiFi.link=0;tick(1);tick(20001);tick(20001);
 assert(WiFi.ap&&WiFi.getMode()==WIFI_AP&&zjPhase=="sta_failed_ap_fallback");
 assert(zjWifiProfiles[0].ssid=="Router1"&&zjWifiProfiles[1].ssid=="Router2");
 WiFi.clients=1;tick(30001);assert(WiFi.ap);
 WiFi.clients=0;tick(30001);assert(!WiFi.ap&&zjPhase=="sta_connecting");
 // Explicit AP persists until a new user choice, despite saved credentials.
 zjMode="ap";zjScheduleMode("ap");tick(400);tick(90000);
 assert(WiFi.ap&&WiFi.getMode()==WIFI_AP&&WiFi.status()!=WL_CONNECTED);
 // Test & Save acknowledges over AP, then removes it BEFORE any association.
 zjScheduleWifiTest();tick(399);assert(WiFi.ap&&zjNetTesting);
 tick(1);assert(!WiFi.ap&&WiFi.getMode()==WIFI_STA&&zjNetTesting&&WiFi.attempts.back()=="New router");
 // Deadline arithmetic must survive the 32-bit millis() wrap.
 zjNetTesting=false;zjMode="ap";clockMs=0xfffffff0;zjScheduleMode("ap");tick(399);assert(!WiFi.ap);tick(1);assert(WiFi.ap);
 std::cout<<"PASS actual exclusive Wi-Fi policy: AP only, STA only, all-profile fallback, manual choice, test handover, clock wrap\n";
}
