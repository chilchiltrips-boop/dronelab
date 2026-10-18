// Production UDP dispatcher, enrollment, OTA, status builder and datagram loop.
// Only radio/flash/clock are doubles. The test driver extracts status/loop from
// FlightCoreNetwork.h so malformed production JSON cannot hide in a mock.
#include "host-stubs/ArduinoShim.h"
#include "host-stubs/WebServer.h"
#include <iostream>
#include <chrono>
#include "../FlightCore_Firmware/FlightCoreClassroom.h"
static String zjPpmRcChannelsJson(){return "null";}
static void zjPpmLoop(uint32_t){}
#include "../FlightCore_Firmware/FlightCoreRpc.h"
static ZjNetworkServer zjHttp(80);
static Preferences zjPrefs;
static String zjNetKey="ff112233445566778899aabbccddeeff0";
static String zjNewSecret(size_t n){String out;for(size_t i=0;i<n;i++){char b[3];snprintf(b,3,"%02x",esp_random()%256);out+=b;}return out;}
static String zjJson(const String&);
static const char* zjClientTransport(){return "AP";}
static void zjReply(int,const String&);static bool zjAllow();
#include "../FlightCore_Firmware/FlightCoreEnrollment.h"
static void zjReply(int status,const String& body){
 if(zjRequestSession>=0){const auto& s=zjSessions[zjRequestSession];zjHttp.sendHeader("X-ZJ-Response",zjHmac(s.key,"response|"+String(s.seq)+"|"+String(status)+"|"+body));}
 zjHttp.send(status,"application/json",body);
}
static bool zjAllow(){if(zjSessionAuthenticated())return true;zjReply(401,"{\"error\":\"session_required_or_expired\"}");return false;}
static bool zjNetTesting=false,zjOtaAuthorized=false,zjUsbScanning=false;
static uint32_t zjOtaRebootAt=0;
static constexpr int U_FLASH=0;
struct {size_t writes=0;bool begin(size_t,int){writes=0;return true;}size_t write(const uint8_t*,size_t n){writes+=n;return n;}void abort(){}bool end(bool){return true;}} Update;
#include "../FlightCore_Firmware/FlightCoreOta.h"
static String zjMode="sta",zjPhase="sta_connected",zjApSsid="ZEBJUS",zjWifiTestState="idle",zjSavedSsid="School";
static bool zjApStarted=true;static int zjStaDisconnectReason=0,zjLastStaFailureReason=0,ledMode=1,LED_OFF=0;
#include "udp-version.h"
static String zjMdnsKitHostname(){return "zebjus-drone-1";}
static String zjPpmStatus(){return "{\"active\":false}";}
static String zjUdpStatistics(){return "{\"protocol\":\"ZJUDP1\",\"active\":false}";}
struct AppDesc {uint8_t app_elf_sha256[32]={};} appDesc;
static AppDesc* esp_app_get_description(){return &appDesc;}
static bool gyroReady=true,scanActive=false;static const char* GYRO_BOARD="A1";
static uint32_t gyroSampleSeq=1,lastGyroSample=0,zjLastScanSeq=0;
static constexpr int GYRO_ADDR=0x6b;static float RateRoll=1.25,RatePitch=-2.5,RateYaw=3;
static uint8_t scanCount=1,scanAddresses[1]={0x6b};
#include "udp-network-extract.h"
int main(){
 zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";zjKitName="zebjus_drone_1";clockMs=1000;zjEnrollmentInit();
 zjSetupEnrollmentHttp();zjSetupSecureOtaHttp();
 zjHttp.on("/api/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjStatus());});
 setupHostTelemetry();int commands=0;
 zjHttp.on("/api/command",HTTP_POST,[&](){if(!zjAllow())return;commands++;testDropReplies=1;zjReply(200,"{\"count\":"+String(commands)+"}");});
 zjRpcSetup();if(!zjRpcReady)return 2;
 std::cout<<testRpcPort<<std::endl;
 const auto start=std::chrono::steady_clock::now();
 while(true){clockMs=1000+std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count();lastGyroSample=clockMs;zjRpcLoop();usleep(1000);}
}
