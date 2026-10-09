/*
  ZEBJUS FlightCore V18.3.83 - RATE/ANGLE FLIGHT CORE + PYTHON CONTROL LAB

  Connection model copied from the proven ZEBJUS Python Lab approach:
    - Saved Wi-Fi -> direct STA connection on boot.
    - No cloud/server is required to find or control the kit on the same LAN.
    - Kit is reached by Kit Name through mDNS: http://<kit-name>.local
    - Webapp caches the last good DHCP IP, then falls back to mDNS.
    - /api/status always exposes permanent Device ID so a cached IP can never
      silently connect to the wrong physical kit.
    - API-only AP is used for Wi-Fi recovery or a selected AP mode. Open the installed app or local WebApp.

  First use:
    1. Power kit. If no valid saved Wi-Fi exists it starts a setup AP.
    2. Join the AP named after the Kit Name, password 12345678.
    3. Choose Kit Name + Wi-Fi + password and press Save Wi-Fi & reconnect.
    4. The profile is saved and acknowledged before reboot attempts STA.
    5. On restart, kit joins that Wi-Fi and advertises <kit-name>.local.
    6. In Drone Lab enter the same Kit Name once. Future reconnect uses cached IP
       first and mDNS as fallback.

  Multi-user rule:
    - One browser may hold the real-kit control lock at a time.
    - Everyone else stays view-only and can still use the simulator.
    - Browser sends lock heartbeat; lock auto-releases after 10 seconds.

  Network modes:
    - Settings can select persistent AP while disarmed; the AP page can return
      to saved Wi-Fi without reaching the enclosed board's BOOT button.
    - If saved Wi-Fi is unavailable at boot or lost while disarmed, AP starts
      automatically; it retries the router only while the recovery AP is idle.
      Explicit AP selection stays selected until saved Wi-Fi is chosen.

  Required libraries:
    - Supported vendor Arduino core 3.3.x
    - No WebSockets / cloud library required for same-Wi-Fi access.
*/

#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include "FlightHttpServer.h"
#include <ESPmDNS.h>
#include <Preferences.h>
#include <esp_random.h>
#include <string.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>
#include <esp_timer.h>
#include "FlightControlMath.h"
#include "VirtualPid.h"
#include <freertos/queue.h>
#include "RcLinkPolicy.h"
#include "RcMonitorProtocol.h"
#include "RcUdpProtocol.h"
#include "SecureSessions.h"
#include "RcPriority.h"
#include <memory>
static const char* ZFC_SRP_GROUP="FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF";
bool secureSendJson(int code,const String& body);
bool secureOwner();
bool securePidPermission();bool secureBrowserRetired(const SecureSession&);
bool securePidCommand(const String& type);
void resetVirtualTraining();
void applyPendingPid();
bool secureLayoutReady();
#include "FlightSetupPolicy.h"
#include "ZEBJUS_FLIGHTCORE_TYPES.h"
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include "src/DroneGPS.h" // Bundled u-blox 7/NEO-7 driver; no external library install.
#endif

// ---------------- General ----------------
static const char* FW_VERSION="18.3.83";
static const char* FW_BUILD_DATE=__DATE__;
static const char* FW_BUILD_TIME=__TIME__;

// ZEBJUS board identity. The silicon family stays an internal implementation detail;
// browser/API users see only stable ZEBJUS FlightCore profile names.
#if defined(CONFIG_IDF_TARGET_ESP32C3)
static const char* BOARD_ID="ZFC-A1";
static const char* BOARD_NAME="ZEBJUS FlightCore Bridge";
static const int RECOVERY_BUTTON_PIN=9;
static const int DEFAULT_PPM_RECEIVER_PIN=18;
static const int I2C_SDA_PIN=SDA;
static const int I2C_SCL_PIN=SCL;
static const bool FLIGHT_CONTROL_ENABLED=false; // A1 stays bridge-only until its motor-pin map is confirmed.
static const int MOTOR_PINS[4]={-1,-1,-1,-1};
#elif defined(CONFIG_IDF_TARGET_ESP32C6)
static const char* BOARD_ID="ZFC-A2";
static const char* BOARD_NAME="ZEBJUS Aerion F1";
static const int RECOVERY_BUTTON_PIN=9;
static const int DEFAULT_PPM_RECEIVER_PIN=16; // XIAO D6; GPIO18/D10 is selectable if the kit is wired that way.
static const int I2C_SDA_PIN=SDA;
static const int I2C_SCL_PIN=SCL;
static const bool FLIGHT_CONTROL_ENABLED=true;
static const int MOTOR_PINS[4]={D1,D2,D3,D0}; // M1,M2,M3,M4 exactly as the proven FC sketches.
#else
static const char* BOARD_ID="ZFC-DEV";
static const char* BOARD_NAME="ZEBJUS FlightCore Developer";
static const int RECOVERY_BUTTON_PIN=9;
static const int DEFAULT_PPM_RECEIVER_PIN=18;
static const int I2C_SDA_PIN=SDA;
static const int I2C_SCL_PIN=SCL;
static const bool FLIGHT_CONTROL_ENABLED=false;
static const int MOTOR_PINS[4]={-1,-1,-1,-1};
#endif

// Factory default Wi-Fi profile. It is seeded only once after first flash / factory reset.
// Students can later change or forget it from the webapp/AP setup page.
// Optional local build defaults. Public release stores router credentials through AP/app setup.
#ifndef ZEBJUS_DEFAULT_WIFI_SSID
#define ZEBJUS_DEFAULT_WIFI_SSID ""
#endif
#ifndef ZEBJUS_DEFAULT_WIFI_PASS
#define ZEBJUS_DEFAULT_WIFI_PASS ""
#endif
static const char* DEFAULT_WIFI_SSID=ZEBJUS_DEFAULT_WIFI_SSID;
static const char* DEFAULT_WIFI_PASS=ZEBJUS_DEFAULT_WIFI_PASS;
static const uint32_t CONNECT_TIMEOUT_MS=20000;
static const uint32_t WIFI_RECOVERY_RETRY_MS=60000;
volatile uint16_t wifiDisconnectReason=0;
String wifiAttemptSSID;
int wifiAttemptStatus=WL_IDLE_STATUS;
uint16_t wifiAttemptReason=0;
bool wifiFallbackAp=false;
uint32_t wifiFallbackAt=0;
static const uint32_t LOCK_TIMEOUT_MS=10000;
static const uint32_t WIFI_LOST_TO_SETUP_MS=20000;
static const uint32_t FORCE_AP_HOLD_MS=5000;
static const uint32_t FACTORY_RESET_HOLD_MS=10000;
static const bool ALLOW_WEB_RC=true; // Browser/AP/Python RC requires the control lock. Fresh valid PPM is primary; authenticated network RC is standby.

// Physical transmitter / PPM receiver mirror.
// The board profile above owns the receiver pin so future FlightCore boards can route it differently.
static const bool ENABLE_PPM_RECEIVER=true;
static const uint32_t PPM_SYNC_US=3000;
static const uint32_t PPM_MIN_US=750;
static const uint32_t PPM_MAX_US=2250;
static const uint32_t PPM_STALE_US=300000;
static const uint32_t WEB_RC_STALE_MS=RcLinkPolicy::LOST_AFTER_MS;
static const uint32_t FLIGHT_LOOP_US=4000;
static const uint32_t ARMED_LOOP_GAP_LIMIT_US=30000; // Disarm after a long scheduler/HTTP stall; arming needs a new CH5 low cycle.
static const uint32_t ARM_GESTURE_HOLD_MS=1000;
static const uint32_t IDLE_AUTO_DISARM_MS=15000; // Only at minimum throttle; centred sticks in flight never disarm.

// Optional: after successful AP setup, show/open your hosted webapp automatically.
// Example: "https://lab.zebjus.com". Leave blank until the final URL is known.
static const char* WEBAPP_URL="";

IPAddress AP_IP(192,168,4,1),AP_GATEWAY(192,168,4,1),AP_SUBNET(255,255,255,0);
FlightHttpServer server(80);
Preferences prefs;

// ---------------- Identity / Wi-Fi ----------------
String deviceId,kitName,apName,apPassword;
String defaultKitName();
bool autoNameRequired=false;
static const int MAX_WIFI=4;
String savedSSID[MAX_WIFI],savedPASS[MAX_WIFI],preferredSSID;
bool setupMode=false,mdnsStarted=false;volatile bool armed=false;
unsigned long wifiLostAt=0,restartAt=0;

// ---------------- Control lock ----------------
String controlOwner="",controlRole="";
volatile bool mobileReserved=false,configurationBusy=false,forceDisarmRequested=false;
volatile bool trainingActive=false;volatile uint32_t trainingExpires=0;volatile uint8_t trainingInput=1,trainingTarget=0;volatile uint32_t trainingRunId=0;bool trainingAppOwned=false;
void serviceTraining();void finishTraining();
bool canBindTrainingWebApp(const String&);bool bindTrainingWebApp(const String&);bool trainingWebAppLive();bool scopedTrainingBrowser();void clearTrainingWebApp();uint32_t requestingWebAppId();
volatile uint32_t trainingWebAppId=0,trainingObserverAt=0;uint64_t trainingWebSession=0;
volatile bool fcSetupActive=false,setupAfterNeutral=false,setupCalibrationCancel=false;
volatile uint32_t fcSetupExpires=0,setupSamples=0,setupTotal=0;
volatile uint8_t setupJob=0,setupCalibrationKind=0;
uint8_t setupAirframe=0,setupInput=0;bool ppmArmLeft=false;
FlightSetupPolicy::ReceiverSetup receiverSetup;
void serviceFcSetup();void saveFcSetup();
volatile uint8_t rcPreference=0; // 0 AUTO, 1 WEB, 2 PPM
SemaphoreHandle_t busMutex=nullptr;TaskHandle_t flightTaskHandle=nullptr;esp_timer_handle_t flightTimer=nullptr;
portMUX_TYPE stateMux=portMUX_INITIALIZER_UNLOCKED;
FlightSettings flightSettings;
float accelScaleX=1,accelScaleY=1,accelScaleZ=1;bool sixFaceValid=false;
float sixFace[6][3]={};uint8_t sixFaceMask=0;
float flightDt=.004f,desiredAngleR=0,desiredAngleP=0,desiredRateR=0,desiredRateP=0,desiredRateY=0;
float filteredRates[3]={},dFilters[8]={};bool rateFilterPrimed=false;
float motorBlendFrom[4]={1000,1000,1000,1000};uint32_t transitionAt=0;
char lastDisarmReason[80]="BOOT",lastEvent[80]="BOOT";uint32_t eventAt=0,disarmAt=0;
float batteryVoltage=0;bool batteryValid=false,batteryLow=false,batteryCritical=false;uint32_t batterySampleMs=0,batteryPollAt=0;
bool barometerAddressPresent=false;
struct BusGuard{bool held;BusGuard():held(!busMutex||xSemaphoreTakeRecursive(busMutex,pdMS_TO_TICKS(2))==pdTRUE){}~BusGuard(){if(held&&busMutex)xSemaphoreGiveRecursive(busMutex);}};
struct ConfigGuard{bool held=false;ConfigGuard(bool acquire=true){if(!acquire)return;portENTER_CRITICAL(&stateMux);if(!armed&&!configurationBusy&&benchModeForGuard()==0){configurationBusy=true;held=true;}portEXIT_CRITICAL(&stateMux);}~ConfigGuard(){if(held)configurationBusy=false;}static int benchModeForGuard();};
volatile unsigned long controlExpiresAt=0;

// Explicit forward declarations keep this sketch independent of Arduino's auto-prototype ordering.
bool i2cWriteReg(uint8_t address,uint8_t reg,uint8_t value);
bool i2cReadReg(uint8_t address,uint8_t reg,uint8_t& value);
bool i2cReadBlock(uint8_t address,uint8_t reg,uint8_t* dst,size_t len);
bool readAnyImu(ImuSample& out);
void disarmFlight(const char* reason);
bool webRcFresh();
void setCalibrationDefaults();

// ---------------- Physical PPM receiver ----------------
int ppmReceiverPin=DEFAULT_PPM_RECEIVER_PIN;
volatile uint16_t ppmCh[10]={1500,1500,1000,1500,1000,1000,1000,1000,1500,1000};
volatile uint16_t ppmPending[10]={};
volatile uint8_t ppmIndex=0;
volatile bool ppmInvalidFrame=false;
volatile uint32_t ppmLastEdgeUs=0,ppmLastFrameUs=0,ppmFrames=0;

// ---------------- Rate/Angle flight core (A2 / XIAO ESP32-C6) ----------------
uint16_t webRcCh[10]={1500,1500,1000,1500,1000,1000,1000,1000,1500,1000};
volatile unsigned long webRcLastMs=0;
RcSourceKind activeRcSource=RC_NONE,lastRcSource=RC_NONE;
FlightModeKind flightMode=FLIGHT_ANGLE,lastFlightMode=FLIGHT_ANGLE;
bool flightReady=false,armLowSeen=false,escPwmReady=false;
uint32_t flightLoopTimerUs=0,flightLoopCount=0,imuFaultCount=0;
uint32_t maxFlightLoopGapUs=0,flightLoopOverruns=0;
volatile uint32_t flightHeartbeatUs=0;
volatile bool flightWatchdogTripped=false;
volatile uint32_t flightWatchdogTrips=0;
uint32_t webRcFrames=0,ppmFrameHz=0,webRcFrameHz=0,flightLoopHz=0;
uint32_t rateWindowMs=0,rateLastPpmFrames=0,rateLastWebFrames=0,rateLastFlightLoops=0;
float rateRoll=0,ratePitch=0,rateYaw=0,gyroBiasRoll=0,gyroBiasPitch=0,gyroBiasYaw=0;
float accelOffsetX=-0.10f,accelOffsetY=0.03f,accelOffsetZ=0.12f,levelTrimRoll=0.0f,levelTrimPitch=0.0f;
float accX=0,accY=0,accZ=0,accAngleRoll=0,accAnglePitch=0,kalmanRoll=0,kalmanPitch=0,flightYaw=0,kalmanRollUnc=4,kalmanPitchUnc=4;
float motorInput[4]={1000,1000,1000,1000};
// Dedicated ESC outputs are the four XIAO motor pads D0..D3. A permutation maps
// CC3D top view: M1 front-left, M2 front-right, M3 rear-right, M4 rear-left.
// Verify physical ESC wiring against this layout; saved NVS routing can override the defaults.
uint8_t motorSlots[4]={1,2,3,0}; // M1=D1, M2=D2, M3=D3, M4=D0
bool ppmEdgeFalling=false,ppmReverse[4]={false,false,false,false};
bool ppmYawStickArm=true; // Physical PPM: yaw right arms, yaw left disarms. Web/AP/Python keep CH5.
uint32_t yawGestureStartedMs=0,idleLastMovementMs=0;
int8_t yawGesture=0;
bool yawGestureLatched=false;
uint16_t idleRcLast[4]={1500,1500,1000,1500};
int servoPin=-1,gpsRxPin=-1,gpsTxPin=-1;bool gpsUbx10Hz=false;uint8_t auxOutputMask=0;uint8_t matrixAddress=0x70,matrixRows[8]={0};
bool servoAttached=false,gpsReady=false;int servoPulseUs=1500;String gpsLine="",gpsLastSentence="";uint32_t gpsSentences=0,gpsLastMs=0;
uint32_t gpsMeasuredHz=0,gpsEpochsThisSecond=0,gpsRateWindowMs=0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
DroneGPS* gpsDriver=nullptr;
#endif

float prevRateErrRoll=0,prevRateErrPitch=0,prevRateErrYaw=0,iRateRoll=0,iRatePitch=0,iRateYaw=0;
float prevAngleErrRoll=0,prevAngleErrPitch=0,iAngleRoll=0,iAnglePitch=0;
unsigned long lastFlightSampleMs=0,lastSourceChangeMs=0;
FlightPidSettings flightPid;uint32_t pidRevision=1,pidSavedRevision=1;volatile bool pidApplyPending=false,pidSaveBusy=false;
struct PidSaveRecord {uint32_t schema=1,revision=1;FlightPidSettings pid;};
volatile BenchModeKind benchMode=BENCH_NONE;
uint8_t benchMotor=0,benchSequenceMotor=0,benchEscStage=0,benchMask=0;
uint16_t benchPulse=1000;
unsigned long benchUntilMs=0,benchStageUntilMs=0;
int ConfigGuard::benchModeForGuard(){return (int)benchMode;}

// ---------------- Wi-Fi test state ----------------
enum WifiTestState{WT_IDLE,WT_RUNNING,WT_SUCCESS,WT_FAILED};
WifiTestState wifiTestState=WT_IDLE;
String testName,testSSID,testPASS,testMessage,testRedirect;
unsigned long wifiTestStarted=0;

// ---------------- Recovery button ----------------
unsigned long recoveryPressedAt=0;
bool factoryResetTriggered=false;

// ---------------- Firmware update state ----------------
bool firmwareUploadActive=false,firmwareUploadSuccess=false;
String firmwareUploadError="",firmwareUploadName="";
size_t firmwareUploadBytes=0;

// ============================================================
// Helpers
// ============================================================
String getDeviceId(){
  uint64_t mac=ESP.getEfuseMac();char b[32];
  snprintf(b,sizeof(b),"ZFC-%012llX",(unsigned long long)(mac&0xFFFFFFFFFFFFULL));
  return String(b);
}
String shortId(){return deviceId.substring(deviceId.length()-6);}
String jsonEscape(String s){s.replace("\\","\\\\");s.replace("\"","\\\"");s.replace("\r","");s.replace("\n","\\n");return s;}
String htmlEscape(String s){s.replace("&","&amp;");s.replace("<","&lt;");s.replace(">","&gt;");s.replace("\"","&quot;");s.replace("'","&#39;");return s;}
String urlEncode(const String& s){const char* hex="0123456789ABCDEF";String out="";for(size_t i=0;i<s.length();i++){uint8_t c=(uint8_t)s[i];if(isalnum(c)||c=='-'||c=='_'||c=='.'||c=='~')out+=(char)c;else{out+='%';out+=hex[c>>4];out+=hex[c&15];}}return out;}
String normalizeDisplayName(String s){
  s.trim();String out="";bool sep=false;
  for(size_t i=0;i<s.length()&&out.length()<28;i++){
    char c=s[i];
    if(isalnum((unsigned char)c)){out+=c;sep=false;}
    else if(c==' '||c=='-'||c=='_'){if(!sep&&out.length()){out+=c==' '?' ':c;sep=true;}}
  }
  while(out.endsWith(" ")||out.endsWith("-")||out.endsWith("_"))out.remove(out.length()-1);
  return out;
}
String hostFromName(String s){
  s=normalizeDisplayName(s);s.toLowerCase();String h="";bool dash=false;
  for(size_t i=0;i<s.length()&&h.length()<32;i++){
    char c=s[i];
    if(isalnum((unsigned char)c)){h+=c;dash=false;}
    else if(c==' '||c=='-'||c=='_'){if(!dash&&h.length()){h+='-';dash=true;}}
  }
  while(h.endsWith("-"))h.remove(h.length()-1);
  return h;
}
void updateApName(){apName=kitName.length()?kitName:defaultKitName();}
void loadApPassword(){
 prefs.begin("zjap",false);apPassword="12345678";if(prefs.getString("pass","")!=apPassword)prefs.putString("pass",apPassword);prefs.end();
}
String defaultKitName(){return "zebjus_drone_1";}
String optionalWebappUrl(){
  String base=String(WEBAPP_URL);base.trim();if(!base.length())return "";
  if(base.endsWith("/"))base.remove(base.length()-1);
  return base+"?kitId="+urlEncode(deviceId)+"&kitName="+urlEncode(kitName)+"&autoconnect=1";
}
void cors(){
  server.sendHeader("Access-Control-Allow-Origin","*");
  server.sendHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers","Content-Type, X-Zebjus-Control");
  server.sendHeader("Access-Control-Max-Age","600");
}
void sendJson(int code,const String& body){if(secureSendJson(code,body))return;cors();server.sendHeader("Cache-Control","no-store");server.send(code,"application/json",body);}
void sendMessage(int code,const String& message){sendJson(code,"{\"ok\":"+String(code>=200&&code<300?"true":"false")+",\"message\":\""+jsonEscape(message)+"\"}");}
bool argBool(const char* name,bool fallback=false){if(!server.hasArg(name))return fallback;String v=server.arg(name);v.toLowerCase();return v=="1"||v=="true"||v=="yes"||v=="on";}

// ============================================================
// NVS: Kit Name + multiple Wi-Fi profiles
// ============================================================
bool isLegacyAutoName(const String& name){return hostFromName(name)==hostFromName("F450-"+shortId())||name=="zebjus_drone_"+deviceId.substring(4)||name==String("FlightCore ")+String(BOARD_ID).substring(4)+"-"+deviceId.substring(4);}
void loadKitName(){
  prefs.begin("zjdrone",true);kitName=normalizeDisplayName(prefs.getString("name",""));prefs.end();
  autoNameRequired=!kitName.length()||isLegacyAutoName(kitName);
  if(autoNameRequired)kitName=defaultKitName();
  updateApName();
}
void saveKitName(const String& name){
  kitName=normalizeDisplayName(name);autoNameRequired=!kitName.length();
  prefs.begin("zjdrone",false);if(kitName.length())prefs.putString("name",kitName);else prefs.remove("name");prefs.end();updateApName();
}
void clearKitName(){prefs.begin("zjdrone",false);prefs.remove("name");prefs.end();kitName="";autoNameRequired=true;updateApName();}
bool saveWiFi(String ssid,String password,bool preferred=true);
void loadSavedWiFi(){
  prefs.begin("zjwifi",true);preferredSSID=prefs.getString("preferred","");
  bool any=false;
  for(int i=0;i<MAX_WIFI;i++){String sk="s"+String(i),pk="p"+String(i);savedSSID[i]=prefs.getString(sk.c_str(),"");savedPASS[i]=prefs.getString(pk.c_str(),"");if(savedSSID[i].length())any=true;}
  prefs.end();

  // Seed an optional local-build Wi-Fi profile once. A normal "Forget All Wi-Fi" will not add it back.
  // A full factory reset clears the seed marker, so firmware defaults are restored.
  prefs.begin("zjsys",false);bool seeded=prefs.getBool("wifi_seeded",false),optout=prefs.getBool("wifi_optout",false);uint8_t seedVersion=prefs.getUChar("wifi_seed_v",0);
  if(!optout&&(!seeded||(!any&&seedVersion<1))){
    if(!any&&strlen(DEFAULT_WIFI_SSID)){
      prefs.end();
      bool installed=saveWiFi(DEFAULT_WIFI_SSID,DEFAULT_WIFI_PASS,true);any=installed;
      prefs.begin("zjsys",false);
      if(installed)Serial.println("Default Wi-Fi profile installed: "+String(DEFAULT_WIFI_SSID));
    }
    if(any){prefs.putBool("wifi_seeded",true);prefs.putUChar("wifi_seed_v",1);}
  }
  if(any&&seedVersion<1){prefs.putBool("wifi_seeded",true);prefs.putUChar("wifi_seed_v",1);}
  prefs.end();
}
int savedIndex(const String& ssid){for(int i=0;i<MAX_WIFI;i++)if(savedSSID[i]==ssid)return i;return -1;}
bool saveWiFi(String ssid,String password,bool preferred){
  ssid.trim();if(!ssid.length()||ssid.length()>32||password.length()>63)return false;if(!prefs.begin("zjwifi",false))return false;
  int idx=savedIndex(ssid);
  if(idx<0){for(int i=0;i<MAX_WIFI;i++)if(!savedSSID[i].length()){idx=i;break;}}
  if(idx<0){idx=prefs.getUChar("next",0)%MAX_WIFI;prefs.putUChar("next",(idx+1)%MAX_WIFI);}
  String sk="s"+String(idx),pk="p"+String(idx);prefs.putString(sk.c_str(),ssid);prefs.putString(pk.c_str(),password);
  if(preferred)prefs.putString("preferred",ssid);
  bool stored=prefs.getString(sk.c_str(),"")==ssid&&prefs.getString(pk.c_str(),"\x01")==password&&(!preferred||prefs.getString("preferred","")==ssid);prefs.end();if(!stored)return false;
  savedSSID[idx]=ssid;savedPASS[idx]=password;if(preferred)preferredSSID=ssid;return true;
}
void clearSavedWiFi(){prefs.begin("zjwifi",false);prefs.clear();prefs.end();prefs.begin("zjsys",false);prefs.putBool("wifi_optout",true);prefs.end();preferredSSID="";for(int i=0;i<MAX_WIFI;i++){savedSSID[i]="";savedPASS[i]="";}}
void forgetSavedWiFi(const String& ssid){
  int idx=savedIndex(ssid);if(idx<0)return;prefs.begin("zjwifi",false);String sk="s"+String(idx),pk="p"+String(idx);prefs.remove(sk.c_str());prefs.remove(pk.c_str());savedSSID[idx]="";savedPASS[idx]="";if(preferredSSID==ssid){preferredSSID="";prefs.remove("preferred");}prefs.end();
  prefs.begin("zjsys",false);prefs.putBool("wifi_optout",true);prefs.end();
}
bool setPreferredWiFi(const String& ssid){int idx=savedIndex(ssid);if(idx<0||!prefs.begin("zjwifi",false))return false;prefs.putString("preferred",ssid);bool stored=prefs.getString("preferred","")==ssid;prefs.end();if(stored)preferredSSID=ssid;return stored;}
void setForceSetupFlag(bool on){prefs.begin("zjsys",false);if(on)prefs.putBool("forceap",true);else prefs.remove("forceap");prefs.end();}
bool consumeForceSetupFlag(){prefs.begin("zjsys",false);bool on=prefs.getBool("forceap",false);if(on)prefs.remove("forceap");prefs.end();return on;}
void setPreferredApMode(bool on){prefs.begin("zjsys",false);if(on)prefs.putBool("preferap",true);else prefs.remove("preferap");prefs.end();}
bool preferredApMode(){prefs.begin("zjsys",true);bool on=prefs.getBool("preferap",false);prefs.end();return on;}
void factoryResetAll(){clearSavedWiFi();clearKitName();prefs.begin("zjsys",false);prefs.clear();prefs.end();prefs.begin("zjpid",false);prefs.clear();prefs.end();prefs.begin("zjcal",false);prefs.clear();prefs.end();prefs.begin("zjio",false);prefs.clear();prefs.end();prefs.begin("zjflight",false);prefs.clear();prefs.end();setCalibrationDefaults();}

// ============================================================
// Wi-Fi + mDNS
// ============================================================
bool tryNetwork(int index){
  if(index<0||index>=MAX_WIFI||!savedSSID[index].length())return false;
  WiFi.setAutoReconnect(false);WiFi.disconnect(false,false);delay(200);wifiDisconnectReason=0;wifiAttemptSSID=savedSSID[index];
  Serial.println("Trying Wi-Fi: "+wifiAttemptSSID);WiFi.setMinSecurity(savedPASS[index].length()?WIFI_AUTH_WPA2_PSK:WIFI_AUTH_OPEN);WiFi.begin(savedSSID[index].c_str(),savedPASS[index].c_str());
  unsigned long t=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-t<CONNECT_TIMEOUT_MS){delay(200);Serial.print(".");}Serial.println();
  wifiAttemptStatus=WiFi.status();wifiAttemptReason=wifiDisconnectReason;if(wifiAttemptStatus!=WL_CONNECTED){Serial.printf("STA failed: status %d, disconnect reason %u\n",wifiAttemptStatus,(unsigned)wifiAttemptReason);WiFi.disconnect(false,false);delay(200);return false;}
  WiFi.setAutoReconnect(true);wifiFallbackAp=false;
  Serial.println("WiFi Connected");Serial.println("SSID : "+WiFi.SSID());Serial.println("IP   : "+WiFi.localIP().toString());return true;
}
bool connectSavedWiFi(){
  bool any=false;for(int i=0;i<MAX_WIFI;i++)if(savedSSID[i].length())any=true;if(!any){Serial.println("No saved Wi-Fi");return false;}
  WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(false);WiFi.setSleep(false);
  int preferred=savedIndex(preferredSSID);if(preferred>=0&&tryNetwork(preferred))return true;
  // Stop the timed-out association before scanning; retry the preferred profile
  // after discovery instead of excluding it forever after the first attempt.
  Serial.println("Scanning saved Wi-Fi profiles...");int n=WiFi.scanNetworks(false,true);if(n<=0){Serial.printf("Saved Wi-Fi scan result: %d\n",n);WiFi.scanDelete();return preferred>=0&&tryNetwork(preferred);}
  bool tried[MAX_WIFI]={false};
  for(int i=0;i<n;i++)if(savedIndex(WiFi.SSID(i))>=0)Serial.printf("Saved Wi-Fi visible: %s, channel %d, RSSI %d dBm\n",WiFi.SSID(i).c_str(),WiFi.channel(i),WiFi.RSSI(i));
  for(int attempt=0;attempt<MAX_WIFI;attempt++){
    int best=-1,bestRssi=-1000;for(int i=0;i<n;i++){int s=savedIndex(WiFi.SSID(i));if(s>=0&&!tried[s]&&WiFi.RSSI(i)>bestRssi){best=s;bestRssi=WiFi.RSSI(i);}}
    if(best<0)break;tried[best]=true;if(tryNetwork(best)){WiFi.scanDelete();return true;}
  }
  WiFi.scanDelete();return preferred>=0&&!tried[preferred]&&tryNetwork(preferred);
}
bool queryResultIsName(int i,const String& candidate,bool ignoreSelf){
  String other=normalizeDisplayName(MDNS.txt(i,"name"));if(!other.length())other=normalizeDisplayName(MDNS.instanceName(i));
  if(hostFromName(other)!=hostFromName(candidate))return false;if(!ignoreSelf)return true;
  String otherId=MDNS.txt(i,"id");if(otherId.length()&&otherId.equalsIgnoreCase(deviceId))return false;
  IPAddress ip=MDNS.address(i);if(ip==WiFi.localIP())return false;return true;
}
bool startProbeMdns(){if(mdnsStarted){MDNS.end();mdnsStarted=false;delay(70);}String probe="zj-probe-"+shortId();probe.toLowerCase();mdnsStarted=MDNS.begin(probe.c_str());return mdnsStarted;}
bool nameExistsOnNetwork(const String& candidate){if(!mdnsStarted&&!startProbeMdns())return false;delay(180);int count=MDNS.queryService("zebjus-drone","tcp");for(int i=0;i<count;i++)if(queryResultIsName(i,candidate,true))return true;return false;}
String chooseFreeAutoNameFromCurrentQuery(int resultCount){
  const String unique=defaultKitName();
  for(int num=1;num<=99;num++){
    String candidate="zebjus_drone_"+String(num);bool used=false;
    for(int i=0;i<resultCount;i++)if(queryResultIsName(i,candidate,false)){used=true;break;}
    if(!used)return candidate;
  }
  return unique;
}
void startKitMdns(){
  if(mdnsStarted){MDNS.end();mdnsStarted=false;delay(70);}String host=hostFromName(kitName);if(!host.length())host="f450-"+shortId();host.toLowerCase();
  if(!MDNS.begin(host.c_str())){Serial.println("mDNS start failed");return;}mdnsStarted=true;MDNS.setInstanceName(kitName);MDNS.addService("zebjus-drone","tcp",80);MDNS.addServiceTxt("zebjus-drone","tcp","name",kitName);MDNS.addServiceTxt("zebjus-drone","tcp","id",deviceId);MDNS.addServiceTxt("zebjus-drone","tcp","ver",FW_VERSION);
  Serial.println("Kit Name : "+kitName);Serial.println("Local    : http://"+host+".local");
}
void ensureUniqueKitName(){
  if(!startProbeMdns()){
    if(!kitName.length())saveKitName(defaultKitName());
    startKitMdns();return;
  }
  delay(150+(ESP.getEfuseMac()%450));
  int count=MDNS.queryService("zebjus-drone","tcp");
  bool conflict=false;
  if(kitName.length())for(int i=0;i<count;i++)if(queryResultIsName(i,kitName,false)){conflict=true;break;}
  if(!kitName.length()||autoNameRequired||conflict){
    String old=kitName;saveKitName(chooseFreeAutoNameFromCurrentQuery(count));autoNameRequired=false;
    if(old.length())Serial.println("Legacy/name conflict -> automatic Kit Name: "+kitName);
    else Serial.println("Automatic Kit Name: "+kitName);
  }
  startKitMdns();
  delay(450);
  int verifyCount=MDNS.queryService("zebjus-drone","tcp");bool duplicate=false;
  for(int i=0;i<verifyCount;i++)if(queryResultIsName(i,kitName,true)){duplicate=true;break;}
  if(duplicate){String replacement=chooseFreeAutoNameFromCurrentQuery(verifyCount);Serial.println("Simultaneous name conflict -> "+replacement);saveKitName(replacement);startKitMdns();}
}

// ============================================================
// Control lock
// ============================================================
void invalidateRcUdp();
void expireLock(){if(controlOwner.length()&&(long)(millis()-controlExpiresAt)>=0){if(activeRcSource==RC_WEB_AP||activeRcSource==RC_WEB_STA)forceDisarmRequested=true;armLowSeen=false;webRcLastMs=0;invalidateRcUdp();Serial.println("Control lock expired");controlOwner="";controlRole="";mobileReserved=false;rcPreference=setupInput;controlExpiresAt=0;serviceFcSetup();serviceTraining();}}
bool lockMine(const String& id){expireLock();return id.length()&&controlOwner==id;}
bool lockActive(){expireLock();return controlOwner.length();}
bool controlAuthorized(){String id=server.arg("clientId");if(lockMine(id)){controlExpiresAt=millis()+LOCK_TIMEOUT_MS;return true;}return false;}
bool requireControl(){if(server.hasArg("expectedDeviceId")&&!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Device ID mismatch: this request belongs to another kit");return false;}if(controlAuthorized())return true;sendMessage(lockActive()?423:409,lockActive()?"Kit is controlled by another browser. View-only mode is active.":"Take Control before changing real hardware.");return false;}

// ============================================================
// Physical PPM receiver
// ============================================================
void IRAM_ATTR ppmIsr(){
  uint32_t now=micros(),dt=now-ppmLastEdgeUs;ppmLastEdgeUs=now;
  if(dt>PPM_SYNC_US){
    // Four stick axes are required. Missing optional channels never inherit a previous frame.
    if(!ppmInvalidFrame&&ppmIndex>=4){
      for(int i=0;i<10;i++)ppmCh[i]=i<ppmIndex?ppmPending[i]:((i==8)?1500:1000);
      ppmLastFrameUs=now;ppmFrames++;
    }
    ppmIndex=0;ppmInvalidFrame=false;return;
  }
  if(dt<PPM_MIN_US||dt>PPM_MAX_US||ppmIndex>=10){ppmInvalidFrame=true;return;}
  if(!ppmInvalidFrame)ppmPending[ppmIndex++]=(uint16_t)dt;
}
bool receiverFresh(){if(!ENABLE_PPM_RECEIVER||!ppmLastFrameUs)return false;return (uint32_t)(micros()-ppmLastFrameUs)<PPM_STALE_US;}
uint32_t receiverAgeMs(){if(!ppmLastFrameUs)return 0xFFFFFFFFUL;return (uint32_t)(micros()-ppmLastFrameUs)/1000UL;}
String receiverHealth(){if(!ENABLE_PPM_RECEIVER||!ppmFrames)return "NOT_FOUND";return receiverFresh()?"OK":"STALE";}
void copyReceiver(uint16_t out[10]){uint16_t raw[10];noInterrupts();for(int i=0;i<10;i++)raw[i]=ppmCh[i];interrupts();for(int i=0;i<10;i++)out[i]=raw[i];for(int i=0;i<8;i++){int channel=receiverSetup.calibrated?receiverSetup.channel[i]:i;out[i]=channel==255?1000:FlightSetupPolicy::normalise(raw[channel],i,receiverSetup,i<4&&ppmReverse[i]);}}
// Interim authoritative arm guard: final flight-core state OR fresh physical receiver CH5.
// The final Rate/Angle flight core must update `armed` directly.
bool effectiveArmed(){
  if(trainingActive)return false;
  if(FLIGHT_CONTROL_ENABLED)return armed;
  if(armed)return true;
  if(receiverFresh()){uint16_t rc[10];copyReceiver(rc);return rc[4]>1500;}
  return false;
}

// IMU globals are defined in the sensor section below; declare them here because
// the flight-control functions appear before that section in the sketch body.
extern ImuSample lastImu;extern bool lastImuValid;extern ImuKind detectedImu;extern uint8_t detectedImuAddress;

// ============================================================
// A2 real Rate / Angle flight loop
// ============================================================
const char* rcSourceName(RcSourceKind s){return s==RC_PPM?"PPM":s==RC_WEB_AP?"WEB_AP":s==RC_WEB_STA?"WEB_STA":"NONE";}
const char* flightModeName(FlightModeKind m){return m==FLIGHT_RATE?"RATE":"ANGLE";}
bool webRcFresh(){return RcLinkPolicy::live(millis(),webRcLastMs);}
void updateControlRates(){uint32_t now=millis(),elapsed=now-rateWindowMs;if(elapsed<1000)return;uint32_t ppmCount;noInterrupts();ppmCount=ppmFrames;interrupts();ppmFrameHz=(uint32_t)((uint64_t)(ppmCount-rateLastPpmFrames)*1000/elapsed);webRcFrameHz=(uint32_t)((uint64_t)(webRcFrames-rateLastWebFrames)*1000/elapsed);flightLoopHz=(uint32_t)((uint64_t)(flightLoopCount-rateLastFlightLoops)*1000/elapsed);rateLastPpmFrames=ppmCount;rateLastWebFrames=webRcFrames;rateLastFlightLoops=flightLoopCount;rateWindowMs=now;}
RcSourceKind chooseRcSource(){auto src=RcPriority::choose(trainingActive,trainingActive?trainingInput:rcPreference,receiverFresh(),webRcFresh());return src==RcPriority::PPM?RC_PPM:src==RcPriority::NETWORK?(setupMode?RC_WEB_AP:RC_WEB_STA):RC_NONE;}
void copyActiveRc(uint16_t out[10],RcSourceKind src){if(src==RC_PPM){copyReceiver(out);return;}if(src==RC_WEB_AP||src==RC_WEB_STA){portENTER_CRITICAL(&stateMux);for(int i=0;i<10;i++)out[i]=webRcCh[i];uint32_t age=(uint32_t)(millis()-webRcLastMs);portEXIT_CRITICAL(&stateMux);RcLinkPolicy::centreDuringGap(out,age);return;}for(int i=0;i<10;i++)out[i]=(i==2||i==4||i==5||i==6||i==7||i==9)?1000:1500;}
void resetFlightPid(){prevRateErrRoll=prevRateErrPitch=prevRateErrYaw=0;iRateRoll=iRatePitch=iRateYaw=0;prevAngleErrRoll=prevAngleErrPitch=0;iAngleRoll=iAnglePitch=0;for(float& v:dFilters)v=0;}
float pidStep(float error,float kp,float ki,float kd,float& prevErr,float& iTerm){
 const float dt=flightDt;float* states[]={&prevRateErrRoll,&prevRateErrPitch,&prevRateErrYaw,&prevAngleErrRoll,&prevAngleErrPitch};int slot=0;for(int i=0;i<5;i++)if(states[i]==&prevErr){slot=i;break;}
 return FlightMath::pidStep(error,kp,ki,kd,dt,flightSettings.dtermHz,prevErr,iTerm,dFilters[slot]);
}
void kalmanStep(float& state,float& uncertainty,float rate,float measurement){const float dt=flightDt;state+=dt*rate;uncertainty+=dt*dt*16.0f;float gain=uncertainty/(uncertainty+9.0f);state+=gain*(measurement-state);uncertainty=(1.0f-gain)*uncertainty;}
// 250 Hz, 12-bit duty: 4096 / 4000 = 1.024 ticks per microsecond.
// Bench/safe outputs use microseconds; the proven flight mixer writes duty ticks directly.
uint32_t escDutyFromUs(int us){return (uint32_t)((uint64_t)constrain(us,1000,2000)*4096UL+2000UL)/4000UL;}
uint32_t servoDutyFromUs(int us){return (uint32_t)((uint64_t)constrain(us,1000,2000)*4096UL+10000UL)/20000UL;}
int motorPinForIndex(int i){if(i<0||i>3)return -1;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  static const int pads[4]={D0,D1,D2,D3};return pads[motorSlots[i]];
#else
  return MOTOR_PINS[i];
#endif
}
bool motorSlotsValid(const uint8_t m[4]){bool seen[4]={false,false,false,false};for(int i=0;i<4;i++){if(m[i]>3||seen[m[i]])return false;seen[m[i]]=true;}return true;}
bool auxPinAllowed(int pin){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  return pin!=ppmReceiverPin&&(pin==D7||pin==D8||pin==D9||pin==D10);
#else
  (void)pin;return false;
#endif
}
bool ppmPinAllowed(int pin){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  return pin==D6||pin==D10;
#else
  return pin==DEFAULT_PPM_RECEIVER_PIN;
#endif
}
int auxPinIndex(int pin){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  const int pins[4]={D7,D8,D9,D10};for(int i=0;i<4;i++)if(pin==pins[i])return i;
#endif
  return -1;
}
bool auxOutputActive(int pin){int i=auxPinIndex(pin);return i>=0&&(auxOutputMask&(1u<<i));}
String auxOutputsJson(){String j="[";bool first=true;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  const int pins[4]={D7,D8,D9,D10};for(int i=0;i<4;i++)if(auxOutputMask&(1u<<i)){if(!first)j+=",";first=false;j+=String(pins[i]);}
#endif
  return j+"]";}
#include "FlightMatrix.h"
void saveExpansionSettings(){prefs.begin("zjio",false);for(int i=0;i<4;i++){String k="m"+String(i);prefs.putUChar(k.c_str(),motorSlots[i]);}prefs.putInt("ppmpin",ppmReceiverPin);prefs.putBool("edge",ppmEdgeFalling);prefs.putBool("yawarm",ppmYawStickArm);for(int i=0;i<4;i++){String k="r"+String(i);prefs.putBool(k.c_str(),ppmReverse[i]);}prefs.putInt("servo",servoPin);prefs.putInt("gps",gpsRxPin);prefs.putInt("gpstx",gpsTxPin);prefs.putBool("gpsubx",gpsUbx10Hz);prefs.putUChar("matrix",matrixAddress);prefs.putBool("matspi",matrixSpi);prefs.putInt("matdin",matrixDin);prefs.putInt("matclk",matrixClk);prefs.putInt("matcs",matrixCs);prefs.end();}
void loadExpansionSettings(){prefs.begin("zjio",true);uint8_t next[4];for(int i=0;i<4;i++){String k="m"+String(i);next[i]=prefs.getUChar(k.c_str(),motorSlots[i]);}if(motorSlotsValid(next))for(int i=0;i<4;i++)motorSlots[i]=next[i];int ppm=prefs.getInt("ppmpin",DEFAULT_PPM_RECEIVER_PIN);if(ppmPinAllowed(ppm))ppmReceiverPin=ppm;ppmEdgeFalling=prefs.getBool("edge",false);ppmYawStickArm=prefs.getBool("yawarm",true);for(int i=0;i<4;i++){String k="r"+String(i);ppmReverse[i]=prefs.getBool(k.c_str(),false);}int sv=prefs.getInt("servo",-1),gp=prefs.getInt("gps",-1),gt=prefs.getInt("gpstx",-1);if(auxPinAllowed(sv))servoPin=sv;if(auxPinAllowed(gp)&&gp!=servoPin)gpsRxPin=gp;gpsUbx10Hz=prefs.getBool("gpsubx",false);if(gpsUbx10Hz&&gpsRxPin>=0&&auxPinAllowed(gt)&&gt!=gpsRxPin&&gt!=servoPin)gpsTxPin=gt;else if(gpsUbx10Hz){gpsRxPin=-1;gpsUbx10Hz=false;}uint8_t adr=prefs.getUChar("matrix",0x70);if(adr>=0x70&&adr<=0x77)matrixAddress=adr;int md=prefs.getInt("matdin",-1),mc=prefs.getInt("matclk",-1),ms=prefs.getInt("matcs",-1);if(prefs.getBool("matspi",false)&&matrixPinsValid(md,mc,ms)){matrixSpi=true;matrixDin=md;matrixClk=mc;matrixCs=ms;}prefs.end();}
void setupExpansionPeripherals(){matrixSpiBegin();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(servoPin>=0){servoAttached=ledcAttachChannel(servoPin,50,12,4);if(servoAttached&&(!escPwmReady||ledcReadFreq(motorPinForIndex(0))==250))ledcWrite(servoPin,servoDutyFromUs(1500));else{if(servoAttached)ledcDetach(servoPin);servoAttached=false;servoPin=-1;}}
 if(gpsRxPin>=0){
   if(gpsUbx10Hz&&gpsTxPin>=0){
     gpsDriver=new DroneGPS(Serial1,gpsRxPin,gpsTxPin);
     gpsReady=gpsDriver->begin(&Serial,38400,9600,3,350);
     if(!gpsReady)Serial.println(String("DroneGPS configuration failed: ")+DroneGPS::configErrorText(gpsDriver->configurationReport().error));
   }else{Serial1.begin(9600,SERIAL_8N1,gpsRxPin,-1);gpsReady=true;}
   gpsRateWindowMs=millis();
 }
#endif
}
void pollGps(){
 if(!gpsReady)return;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(gpsUbx10Hz&&gpsDriver){
   gpsDriver->update();
   const uint16_t epochs=gpsDriver->takeMessageCounters().completeEpochs;
   if(epochs){gpsEpochsThisSecond+=epochs;gpsLastMs=millis();}
   const uint32_t elapsed=(uint32_t)(millis()-gpsRateWindowMs);
   if(elapsed>=1000){gpsMeasuredHz=(uint32_t)((uint64_t)gpsEpochsThisSecond*1000/elapsed);gpsEpochsThisSecond=0;gpsRateWindowMs=millis();}
   return;
 }
#endif
 int budget=24;while(budget--&&Serial1.available()){char c=(char)Serial1.read();if(c=='\n'){if(gpsLine.length()>5&&gpsLine.startsWith("$")){gpsLastSentence=gpsLine;gpsLastMs=millis();gpsSentences++;}gpsLine="";}else if(c!='\r'){if(gpsLine.length()<96)gpsLine+=c;else gpsLine="";}}
}
String expansionJson(){String j="{\"motors\":[";for(int i=0;i<4;i++){if(i)j+=",";j+="{\"motor\":"+String(i+1)+",\"connector\":\"D"+String(motorSlots[i])+"\",\"gpio\":"+String(motorPinForIndex(i))+"}";}j+="],\"ppmPin\":"+String(ppmReceiverPin)+",\"ppmEdge\":\""+String(ppmEdgeFalling?"FALLING":"RISING")+"\",\"ppmReverse\":[";for(int i=0;i<4;i++){if(i)j+=",";j+=ppmReverse[i]?"true":"false";}j+="],\"ppmArmMode\":\""+String(ppmYawStickArm?(ppmArmLeft?"YAW_LEFT":"YAW_STICK"):"CH5_SWITCH")+"\",\"idleDisarmSeconds\":15,\"servoPin\":"+String(servoPin)+",\"servoReady\":"+String(servoAttached?"true":"false")+",\"gpsRxPin\":"+String(gpsRxPin)+",\"gpsTxPin\":"+String(gpsTxPin)+",\"gpsProtocol\":\""+String(gpsUbx10Hz?"UBX_10HZ":"NMEA_9600")+"\",\"gpsTargetHz\":"+String(gpsUbx10Hz?10:0)+",\"gpsMeasuredHz\":"+String(gpsMeasuredHz)+",\"gpsReady\":"+String(gpsReady?"true":"false")+",\"matrixAddress\":"+String(matrixAddress)+",\"matrixDriver\":\""+String(matrixSpi?"MAX7219":"HT16K33")+"\",\"matrixDinPin\":"+String(matrixDin)+",\"matrixClkPin\":"+String(matrixClk)+",\"matrixCsPin\":"+String(matrixCs)+",\"gpioOutputs\":"+auxOutputsJson()+"}";return j;}
void writeEscMicroseconds(int i,int us){bool blocked=trainingActive||flightWatchdogTripped||configurationBusy||(!armed&&benchMode==BENCH_NONE)||(fcSetupActive&&!FlightSetupPolicy::live(millis(),fcSetupExpires));if((benchMode==BENCH_MOTOR||benchMode==BENCH_ESC_MANUAL)&&!FlightSetupPolicy::live(millis(),benchUntilMs))blocked=true;int pin=motorPinForIndex(i);if(pin>=0)ledcWrite(pin,escDutyFromUs(blocked?1000:us));}
void writeMotorOutputs(float m1,float m2,float m3,float m4){motorInput[0]=m1;motorInput[1]=m2;motorInput[2]=m3;motorInput[3]=m4;if(!FLIGHT_CONTROL_ENABLED)return;for(int i=0;i<4;i++)writeEscMicroseconds(i,(int)motorInput[i]);}
void writeFlightDutyOutputs(float d1,float d2,float d3,float d4){
  const float duty[4]={d1,d2,d3,d4};
  for(int i=0;i<4;i++){
    float pulse=duty[i]/1.024f;
    if(armed&&transitionAt&&(uint32_t)(millis()-transitionAt)<500){float a=(millis()-transitionAt)/500.0f;pulse=motorBlendFrom[i]+a*(pulse-motorBlendFrom[i]);}
    motorInput[i]=pulse;writeEscMicroseconds(i,(int)lroundf(pulse));
  }
}
// RTOS supervisor runs while the main task is in a slow HTTP handler or I2C call.
// A fresh, low-throttle RC frame is required to clear a latched output trip.
void flightOutputSupervisor(void*){
  for(;;){
    if(FLIGHT_CONTROL_ENABLED&&escPwmReady){
      if((armed||benchMode!=BENCH_NONE)&&flightHeartbeatUs&&
         (uint32_t)(micros()-flightHeartbeatUs)>ARMED_LOOP_GAP_LIMIT_US&&
         !flightWatchdogTripped){flightWatchdogTripped=true;flightWatchdogTrips++;}
      if(trainingActive||flightWatchdogTripped||configurationBusy||(!armed&&benchMode==BENCH_NONE)||(fcSetupActive&&!FlightSetupPolicy::live(millis(),fcSetupExpires))||((benchMode==BENCH_MOTOR||benchMode==BENCH_ESC_MANUAL)&&!FlightSetupPolicy::live(millis(),benchUntilMs)))for(int i=0;i<4;i++){
        int pin=motorPinForIndex(i);if(pin>=0)ledcWrite(pin,escDutyFromUs(1000));
      }
    }
    vTaskDelay(pdMS_TO_TICKS(2)>0?pdMS_TO_TICKS(2):1);
  }
}
void motorsSafe(){writeMotorOutputs(1000,1000,1000,1000);}
void setPidDefaults(){
  flightPid.rateRoll={.9f,15.0f,.03f};flightPid.ratePitch=flightPid.rateRoll;flightPid.rateYaw={3.0f,15.0f,0.0f};
  flightPid.angleRateRoll={.9f,15.0f,.03f};flightPid.angleRatePitch=flightPid.angleRateRoll;flightPid.angleRateYaw={3.0f,15.0f,0.0f};
  flightPid.angleRoll={3.0f,0.0f,0.0f};flightPid.anglePitch=flightPid.angleRoll;
}
void loadPidSettings(){setPidDefaults();prefs.begin("zjpid",true);if(prefs.getBytesLength("record_v3")==sizeof(PidSaveRecord)){PidSaveRecord stored;prefs.getBytes("record_v3",&stored,sizeof(stored));if(stored.schema==1&&pidConfigValid(stored.pid)){flightPid=stored.pid;pidRevision=pidSavedRevision=stored.revision;}prefs.end();return;}if(!prefs.getBool("saved",false)){prefs.end();return;}
  #define GP(K,V) V=prefs.getFloat(K,V)
  GP("rrp",flightPid.rateRoll.p);GP("rri",flightPid.rateRoll.i);GP("rrd",flightPid.rateRoll.d);GP("rpp",flightPid.ratePitch.p);GP("rpi",flightPid.ratePitch.i);GP("rpd",flightPid.ratePitch.d);GP("ryp",flightPid.rateYaw.p);GP("ryi",flightPid.rateYaw.i);GP("ryd",flightPid.rateYaw.d);
  GP("arp",flightPid.angleRateRoll.p);GP("ari",flightPid.angleRateRoll.i);GP("ard",flightPid.angleRateRoll.d);GP("app",flightPid.angleRatePitch.p);GP("api",flightPid.angleRatePitch.i);GP("apd",flightPid.angleRatePitch.d);GP("ayp",flightPid.angleRateYaw.p);GP("ayi",flightPid.angleRateYaw.i);GP("ayd",flightPid.angleRateYaw.d);
  GP("orp",flightPid.angleRoll.p);GP("ori",flightPid.angleRoll.i);GP("ord",flightPid.angleRoll.d);GP("opp",flightPid.anglePitch.p);GP("opi",flightPid.anglePitch.i);GP("opd",flightPid.anglePitch.d);
  #undef GP
  prefs.end();
}
void savePidSettings(){prefs.begin("zjpid",false);PidSaveRecord record;record.pid=flightPid;record.revision=++pidRevision;if(prefs.putBytes("record_v3",&record,sizeof(record))==sizeof(record))pidSavedRevision=pidRevision;prefs.putBool("saved",true);
  #define PP(K,V) prefs.putFloat(K,V)
  PP("rrp",flightPid.rateRoll.p);PP("rri",flightPid.rateRoll.i);PP("rrd",flightPid.rateRoll.d);PP("rpp",flightPid.ratePitch.p);PP("rpi",flightPid.ratePitch.i);PP("rpd",flightPid.ratePitch.d);PP("ryp",flightPid.rateYaw.p);PP("ryi",flightPid.rateYaw.i);PP("ryd",flightPid.rateYaw.d);
  PP("arp",flightPid.angleRateRoll.p);PP("ari",flightPid.angleRateRoll.i);PP("ard",flightPid.angleRateRoll.d);PP("app",flightPid.angleRatePitch.p);PP("api",flightPid.angleRatePitch.i);PP("apd",flightPid.angleRatePitch.d);PP("ayp",flightPid.angleRateYaw.p);PP("ayi",flightPid.angleRateYaw.i);PP("ayd",flightPid.angleRateYaw.d);
  PP("orp",flightPid.angleRoll.p);PP("ori",flightPid.angleRoll.i);PP("ord",flightPid.angleRoll.d);PP("opp",flightPid.anglePitch.p);PP("opi",flightPid.anglePitch.i);PP("opd",flightPid.anglePitch.d);
  #undef PP
  prefs.end();
}
void setCalibrationDefaults(){accelOffsetX=-0.10f;accelOffsetY=0.03f;accelOffsetZ=0.12f;levelTrimRoll=0.0f;levelTrimPitch=0.0f;}
void loadCalibrationSettings(){setCalibrationDefaults();prefs.begin("zjcal",true);if(prefs.getBool("saved",false)){accelOffsetX=prefs.getFloat("axoff",accelOffsetX);accelOffsetY=prefs.getFloat("ayoff",accelOffsetY);accelOffsetZ=prefs.getFloat("azoff",accelOffsetZ);levelTrimRoll=prefs.getFloat("rtrim",levelTrimRoll);levelTrimPitch=prefs.getFloat("ptrim",levelTrimPitch);}prefs.end();}
void saveCalibrationSettings(){prefs.begin("zjcal",false);prefs.putBool("saved",true);prefs.putFloat("axoff",accelOffsetX);prefs.putFloat("ayoff",accelOffsetY);prefs.putFloat("azoff",accelOffsetZ);prefs.putFloat("rtrim",levelTrimRoll);prefs.putFloat("ptrim",levelTrimPitch);prefs.end();}
bool calibrationValid(float axo,float ayo,float azo,float rt,float pt){return isfinite(axo)&&isfinite(ayo)&&isfinite(azo)&&isfinite(rt)&&isfinite(pt)&&fabsf(axo)<=0.5f&&fabsf(ayo)<=0.5f&&fabsf(azo)<=0.5f&&fabsf(rt)<=10.0f&&fabsf(pt)<=10.0f;}
String calibrationJson(){String j="{\"accelOffset\":{\"x\":"+String(accelOffsetX,6)+",\"y\":"+String(accelOffsetY,6)+",\"z\":"+String(accelOffsetZ,6)+"}";j+=",\"gyroBias\":{\"roll\":"+String(gyroBiasRoll,5)+",\"pitch\":"+String(gyroBiasPitch,5)+",\"yaw\":"+String(gyroBiasYaw,5)+"}";j+=",\"levelTrim\":{\"roll\":"+String(levelTrimRoll,4)+",\"pitch\":"+String(levelTrimPitch,4)+"}";j+=",\"accel\":{\"x\":"+String(accX,6)+",\"y\":"+String(accY,6)+",\"z\":"+String(accZ,6)+"}";j+=",\"attitude\":{\"roll\":"+String(kalmanRoll,3)+",\"pitch\":"+String(kalmanPitch,3)+",\"yaw\":"+String(flightYaw,3)+"}}";return j;}
bool pidAxisValid(const PidAxis& a,bool angleOuter=false){float pMax=angleOuter?10.0f:8.0f,iMax=angleOuter?10.0f:50.0f,dMax=angleOuter?.5f:.2f;return isfinite(a.p)&&isfinite(a.i)&&isfinite(a.d)&&a.p>=0&&a.p<=pMax&&a.i>=0&&a.i<=iMax&&a.d>=0&&a.d<=dMax;}
bool pidConfigValid(const FlightPidSettings& p){return pidAxisValid(p.rateRoll)&&pidAxisValid(p.ratePitch)&&pidAxisValid(p.rateYaw)&&pidAxisValid(p.angleRateRoll)&&pidAxisValid(p.angleRatePitch)&&pidAxisValid(p.angleRateYaw)&&pidAxisValid(p.angleRoll,true)&&pidAxisValid(p.anglePitch,true);}
String pidAxisJson(const PidAxis& a){return String("{\"P\":")+String(a.p,5)+",\"I\":"+String(a.i,5)+",\"D\":"+String(a.d,5)+"}";}
String pidJson(){String j="{\"rateRoll\":"+pidAxisJson(flightPid.rateRoll)+",\"ratePitch\":"+pidAxisJson(flightPid.ratePitch)+",\"rateYaw\":"+pidAxisJson(flightPid.rateYaw);j+=",\"angleRateRoll\":"+pidAxisJson(flightPid.angleRateRoll)+",\"angleRatePitch\":"+pidAxisJson(flightPid.angleRatePitch)+",\"angleRateYaw\":"+pidAxisJson(flightPid.angleRateYaw);j+=",\"angleRoll\":"+pidAxisJson(flightPid.angleRoll)+",\"anglePitch\":"+pidAxisJson(flightPid.anglePitch)+"}";return j;}
float argFloat(const char* key,float fallback){if(!server.hasArg(key))return fallback;String v=server.arg(key);v.trim();if(!v.length())return fallback;char* end=nullptr;float value=strtof(v.c_str(),&end);return end&&*end==0&&end!=v.c_str()?value:NAN;}
void readPidArgs(FlightPidSettings& n){
  n.rateRoll={argFloat("rateRollP",n.rateRoll.p),argFloat("rateRollI",n.rateRoll.i),argFloat("rateRollD",n.rateRoll.d)};n.ratePitch={argFloat("ratePitchP",n.ratePitch.p),argFloat("ratePitchI",n.ratePitch.i),argFloat("ratePitchD",n.ratePitch.d)};n.rateYaw={argFloat("rateYawP",n.rateYaw.p),argFloat("rateYawI",n.rateYaw.i),argFloat("rateYawD",n.rateYaw.d)};
  n.angleRateRoll={argFloat("angleRateRollP",n.angleRateRoll.p),argFloat("angleRateRollI",n.angleRateRoll.i),argFloat("angleRateRollD",n.angleRateRoll.d)};n.angleRatePitch={argFloat("angleRatePitchP",n.angleRatePitch.p),argFloat("angleRatePitchI",n.angleRatePitch.i),argFloat("angleRatePitchD",n.angleRatePitch.d)};n.angleRateYaw={argFloat("angleRateYawP",n.angleRateYaw.p),argFloat("angleRateYawI",n.angleRateYaw.i),argFloat("angleRateYawD",n.angleRateYaw.d)};
  n.angleRoll={argFloat("angleRollP",n.angleRoll.p),argFloat("angleRollI",n.angleRoll.i),argFloat("angleRollD",n.angleRoll.d)};n.anglePitch={argFloat("anglePitchP",n.anglePitch.p),argFloat("anglePitchI",n.anglePitch.i),argFloat("anglePitchD",n.anglePitch.d)};
}
bool propsRemovedConfirmed(){String c=server.arg("confirm");c.toUpperCase();return c=="PROPS_REMOVED";}
void benchStop(){benchMode=BENCH_NONE;benchMask=0;benchPulse=1000;benchMotor=0;benchSequenceMotor=0;benchEscStage=0;benchUntilMs=benchStageUntilMs=0;motorsSafe();}
void directMotorPulse(int index,int pulse){if(!FLIGHT_CONTROL_ENABLED)return;for(int i=0;i<4;i++){int v=(i==index)?pulse:1000;motorInput[i]=v;writeEscMicroseconds(i,v);}}
void allMotorPulse(int pulse){if(!FLIGHT_CONTROL_ENABLED)return;for(int i=0;i<4;i++){motorInput[i]=pulse;writeEscMicroseconds(i,pulse);}}
void serviceBenchMode(){if(trainingActive){benchStop();return;}if(benchMode==BENCH_NONE)return;if(flightWatchdogTripped){benchStop();return;}unsigned long now=millis();if(benchMode==BENCH_MOTOR){if((long)(now-benchUntilMs)>=0){benchStop();return;}if(benchMask){for(int i=0;i<4;i++){int pulse=(benchMask&(1<<i))?benchPulse:1000;motorInput[i]=pulse;writeEscMicroseconds(i,pulse);}}else directMotorPulse((int)benchMotor-1,benchPulse);return;}if(benchMode==BENCH_MOTOR_SEQUENCE){if((long)(now-benchStageUntilMs)>=0){benchSequenceMotor++;if(benchSequenceMotor>4){benchStop();return;}benchStageUntilMs=now+700;}directMotorPulse((int)benchSequenceMotor-1,1200);return;}if(benchMode==BENCH_ESC_MANUAL){if((long)(now-benchUntilMs)>=0){benchStop();return;}allMotorPulse(benchPulse);return;}if(benchMode==BENCH_ESC_CAL){if(benchEscStage==0){allMotorPulse(2000);if((long)(now-benchStageUntilMs)>=0){benchEscStage=1;benchStageUntilMs=now+3000;}}else if(benchEscStage==1){allMotorPulse(1000);if((long)(now-benchStageUntilMs)>=0){benchStop();}}}}
bool configureMpu6050Flight(){if(detectedImu!=IMU_MPU6050||!detectedImuAddress)return false;return i2cWriteReg(detectedImuAddress,0x6B,0x00)&&i2cWriteReg(detectedImuAddress,0x1A,0x05)&&i2cWriteReg(detectedImuAddress,0x1C,0x10)&&i2cWriteReg(detectedImuAddress,0x1B,0x08)&&i2cWriteReg(detectedImuAddress,0x19,0x03);}
bool readMpuFlight(float& rr,float& rp,float& ry,float& ax,float& ay,float& az){uint8_t b[14];if(!i2cReadBlock(detectedImuAddress,0x3B,b,sizeof(b)))return false;auto be16=[&](int i)->int16_t{return (int16_t)(((uint16_t)b[i]<<8)|b[i+1]);};int16_t rax=be16(0),ray=be16(2),raz=be16(4),rgx=be16(8),rgy=be16(10),rgz=be16(12);ax=((float)rax/4096.0f+accelOffsetX)*accelScaleX;ay=((float)ray/4096.0f+accelOffsetY)*accelScaleY;az=((float)raz/4096.0f+accelOffsetZ)*accelScaleZ;rr=(float)rgx/65.5f;rp=(float)rgy/65.5f;ry=(float)rgz/65.5f;FlightMath::orient(ax,ay,az,flightSettings.orientation);FlightMath::orient(rr,rp,ry,flightSettings.orientation);lastImu.kind=IMU_MPU6050;lastImu.address=detectedImuAddress;lastImu.whoAmI=detectedImuAddress;lastImu.rawAx=rax;lastImu.rawAy=ray;lastImu.rawAz=raz;lastImu.rawGx=rgx;lastImu.rawGy=rgy;lastImu.rawGz=rgz;lastImu.ax=ax;lastImu.ay=ay;lastImu.az=az;lastImu.gx=rr;lastImu.gy=rp;lastImu.gz=ry;lastImu.sampledAt=millis();lastImuValid=true;return true;}
void disarmFlight(const char* reason){
 bool wasArmed=armed;armed=false;motorsSafe();resetFlightPid();transitionAt=0;
 if(wasArmed&&reason&&strlen(reason)){snprintf(lastDisarmReason,sizeof(lastDisarmReason),"%s",reason);disarmAt=millis();snprintf(lastEvent,sizeof(lastEvent),"DISARM: %s",reason);eventAt=millis();}
}
void resetArmGesture(){yawGesture=0;yawGestureStartedMs=0;yawGestureLatched=false;}
void armFlight(const uint16_t rc[10]){
  portENTER_CRITICAL(&stateMux);if(trainingActive||fcSetupActive||setupAfterNeutral||configurationBusy||forceDisarmRequested||firmwareUploadActive){portEXIT_CRITICAL(&stateMux);return;}armed=true;portEXIT_CRITICAL(&stateMux);resetFlightPid();idleLastMovementMs=millis();snprintf(lastEvent,sizeof(lastEvent),"ARM");eventAt=millis();
  for(int i=0;i<4;i++)idleRcLast[i]=rc[i];
  Serial.println(String("ARMED • ")+flightModeName(flightMode)+" • "+rcSourceName(activeRcSource));
}
void serviceArming(const uint16_t rc[10]){
 if(pidSaveBusy||pidApplyPending){armLowSeen=false;resetArmGesture();disarmFlight("PID save in progress");return;}
  const uint32_t now=millis();
  if(trainingActive||fcSetupActive||configurationBusy||firmwareUploadActive||restartAt){disarmFlight("configuration / restart");return;}
  if(setupAfterNeutral){disarmFlight("Setup requires neutral sticks / ARM low");armLowSeen=false;resetArmGesture();if(FlightSetupPolicy::safeAfterSetup(rc))setupAfterNeutral=false;return;}
  if(!armed&&flightSettings.batteryKind&&(!batteryValid||(uint32_t)(now-batterySampleMs)>1000))return;
  if(!armed&&(batteryCritical||fabsf(kalmanRoll)>45||fabsf(kalmanPitch)>45||accZ<.2f||imuFaultCount))return;
  if(activeRcSource==RC_PPM&&ppmYawStickArm){
    // Deliberate 1-second yaw gesture at minimum throttle with roll/pitch near centre.
    int8_t direction=rc[2]<=1050&&abs((int)rc[0]-1500)<=80&&abs((int)rc[1]-1500)<=80
      ?(rc[3]>=1900?1:rc[3]<=1100?-1:0):0;
    if(direction!=yawGesture){yawGesture=direction;yawGestureStartedMs=direction?now:0;yawGestureLatched=false;}
    if(direction&&!yawGestureLatched&&(uint32_t)(now-yawGestureStartedMs)>=ARM_GESTURE_HOLD_MS){
      if(direction==(ppmArmLeft?1:-1)&&armed)disarmFlight("PPM yaw disarm");
      if(direction==(ppmArmLeft?-1:1)&&!armed)armFlight(rc);
      yawGestureLatched=true; // Return yaw to centre before another gesture.
    }
  }else{
    resetArmGesture();
    if(rc[4]<1500){if(armed)disarmFlight("CH5 low");armLowSeen=true;}
    else if(!armed&&armLowSeen&&rc[2]<=1050)armFlight(rc);
  }
  if(!armed)return;
  if(rc[2]>1050){idleLastMovementMs=now;for(int i=0;i<4;i++)idleRcLast[i]=rc[i];return;}
  for(int i=0;i<4;i++)if(abs((int)rc[i]-(int)idleRcLast[i])>=12){
    idleLastMovementMs=now;for(int j=0;j<4;j++)idleRcLast[j]=rc[j];break;
  }
  if((uint32_t)(now-idleLastMovementMs)>=IDLE_AUTO_DISARM_MS){
    disarmFlight("15 s low-throttle stick inactivity");armLowSeen=false;
  }
}
void setupFlightCore(){
  if(!FLIGHT_CONTROL_ENABLED){flightReady=false;return;}
  Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,400000);
  if(!escPwmReady){bool escAttached=true;int attached=0;for(int i=0;i<4;i++){int pin=motorPinForIndex(i);if(pin<0||!ledcAttachChannel(pin,250,12,i)){escAttached=false;break;}attached++;writeEscMicroseconds(i,1000);}if(!escAttached){for(int i=0;i<attached;i++)ledcDetach(motorPinForIndex(i));}escPwmReady=escAttached;}
  if(!escPwmReady){flightReady=false;motorsSafe();Serial.println("FlightCore: ESC PWM attach failed • arming disabled");return;}
  motorsSafe();
  delay(40);
  if(detectedImu!=IMU_MPU6050||!detectedImuAddress){flightReady=false;Serial.println("FlightCore: MPU6050 not detected • ESC outputs held at minimum");return;}
  // Match the proven MPU6050 FC configuration: DLPF=0x05, ±8g, ±500 dps.
  if(!configureMpu6050Flight()){flightReady=false;Serial.println("FlightCore: MPU6050 configuration failed");return;}
  Serial.println("FlightCore: keep the frame LEVEL and STILL • calibrating gyro (2000 samples)");
  gyroBiasRoll=gyroBiasPitch=gyroBiasYaw=0;float gyroSqR=0,gyroSqP=0,gyroSqY=0;int good=0;for(int i=0;i<2000;i++){if(setupCalibrationKind==1&&setupJob==1){if(setupCalibrationCancel||!fcSetupActive){flightReady=false;return;}setupSamples=i+1;}float rr,rp,ry,ax,ay,az;if(readMpuFlight(rr,rp,ry,ax,ay,az)){gyroBiasRoll+=rr;gyroBiasPitch+=rp;gyroBiasYaw+=ry;gyroSqR+=rr*rr;gyroSqP+=rp*rp;gyroSqY+=ry*ry;good++;}delay(1);}
  if(good<1800){flightReady=false;motorsSafe();Serial.println("FlightCore: gyro calibration failed • sensor reads unstable");return;}
  gyroBiasRoll/=good;gyroBiasPitch/=good;gyroBiasYaw/=good;float noiseR=sqrtf(fmaxf(0.0f,gyroSqR/good-gyroBiasRoll*gyroBiasRoll)),noiseP=sqrtf(fmaxf(0.0f,gyroSqP/good-gyroBiasPitch*gyroBiasPitch)),noiseY=sqrtf(fmaxf(0.0f,gyroSqY/good-gyroBiasYaw*gyroBiasYaw));if(noiseR>1.5f||noiseP>1.5f||noiseY>1.5f){flightReady=false;motorsSafe();Serial.println("FlightCore: gyro calibration motion detected • keep frame still and reboot");return;}float rr,rp,ry;if(readMpuFlight(rr,rp,ry,accX,accY,accZ)){accAngleRoll=atan2f(accY,sqrtf(accX*accX+accZ*accZ))*57.2957795f+levelTrimRoll;accAnglePitch=-atan2f(accX,sqrtf(accY*accY+accZ*accZ))*57.2957795f+levelTrimPitch;kalmanRoll=accAngleRoll;kalmanPitch=accAnglePitch;}
  armLowSeen=false;resetArmGesture();flightMode=FLIGHT_ANGLE;lastFlightMode=flightMode;activeRcSource=lastRcSource=RC_NONE;flightLoopTimerUs=micros();flightReady=true;
  Serial.printf("FlightCore READY • gyro bias R %.3f P %.3f Y %.3f dps • 250 Hz ESC pulses in microseconds\n",gyroBiasRoll,gyroBiasPitch,gyroBiasYaw);
}
#include "FlightPidSave.h"
#include "FlightVirtualTraining.h"
void runFlightLoop(){
  applyPendingPid();if(trainingFcPid||virtualArmed)runVirtualTraining();
  if(!FLIGHT_CONTROL_ENABLED||!flightReady||benchMode!=BENCH_NONE||configurationBusy){flightLoopTimerUs=micros();return;}uint32_t now=micros(),gap=(uint32_t)(now-flightLoopTimerUs);if(gap<2000)return;flightDt=constrain(gap*.000001f,.002f,.012f);if(gap>maxFlightLoopGapUs)maxFlightLoopGapUs=gap;if(gap>FLIGHT_LOOP_US*2)flightLoopOverruns++;if(armed&&gap>ARMED_LOOP_GAP_LIMIT_US&&!flightWatchdogTripped){flightWatchdogTripped=true;flightWatchdogTrips++;}flightLoopTimerUs=now;
  uint16_t rc[10];activeRcSource=chooseRcSource();copyActiveRc(rc,activeRcSource);
  if(forceDisarmRequested){disarmFlight("control released");forceDisarmRequested=false;armLowSeen=false;resetArmGesture();}
  if(flightWatchdogTripped){disarmFlight("output supervisor: loop stalled");armLowSeen=false;resetArmGesture();if(activeRcSource!=RC_NONE&&rc[2]<=1050&&abs((int)rc[3]-1500)<=80&&((activeRcSource==RC_PPM&&ppmYawStickArm)||rc[4]<1500))flightWatchdogTripped=false;return;}
  if(activeRcSource!=lastRcSource){
    uint16_t previous[10];copyActiveRc(previous,lastRcSource);
    bool handover=armed&&flightSettings.handover&&activeRcSource!=RC_NONE&&lastRcSource!=RC_NONE&&fabsf(kalmanRoll)<=45&&fabsf(kalmanPitch)<=45&&FlightMath::canHandover(previous,rc,activeRcSource==RC_PPM?receiverFresh():webRcFresh());
    if(armed&&!handover)disarmFlight("RC source changed: no matched standby");
    if(handover){for(int i=0;i<4;i++)motorBlendFrom[i]=motorInput[i];transitionAt=millis();resetFlightPid();snprintf(lastEvent,sizeof(lastEvent),"Matched RC handover -> %s",rcSourceName(activeRcSource));eventAt=millis();}
    armLowSeen=false;resetArmGesture();lastRcSource=activeRcSource;lastSourceChangeMs=millis();
  }
  // Always sample/fuse the MPU6050 at 250 Hz, even when no RC source is active.
  // Python attitude/level tools and telemetry must remain live while DISARMED.
  float rr,rp,ry;if(!readMpuFlight(rr,rp,ry,accX,accY,accZ)){imuFaultCount++;if(imuFaultCount>=3){disarmFlight("IMU read failure");flightReady=false;}return;}imuFaultCount=0;float freshRates[3]={rr-gyroBiasRoll,rp-gyroBiasPitch,ry-gyroBiasYaw};for(int i=0;i<3;i++){filteredRates[i]=rateFilterPrimed?FlightMath::lowPass(filteredRates[i],freshRates[i],flightSettings.gyroHz,flightDt):freshRates[i];}rateFilterPrimed=true;rateRoll=filteredRates[0];ratePitch=filteredRates[1];rateYaw=filteredRates[2];flightYaw+=rateYaw*flightDt;if(flightYaw>180)flightYaw-=360;if(flightYaw<-180)flightYaw+=360;lastFlightSampleMs=millis();
  accAngleRoll=atan2f(accY,sqrtf(accX*accX+accZ*accZ))*57.2957795f+levelTrimRoll;accAnglePitch=-atan2f(accX,sqrtf(accY*accY+accZ*accZ))*57.2957795f+levelTrimPitch;kalmanStep(kalmanRoll,kalmanRollUnc,rateRoll,accAngleRoll);kalmanStep(kalmanPitch,kalmanPitchUnc,ratePitch,accAnglePitch);
  FlightModeKind requested=rc[5]>=1500?FLIGHT_RATE:FLIGHT_ANGLE;if(requested!=flightMode){
    if(armed&&(!flightSettings.modeSwitch||fabsf(kalmanRoll)>45||fabsf(kalmanPitch)>45)){snprintf(lastEvent,sizeof(lastEvent),"Mode change rejected: attitude / setting");eventAt=millis();}
    else{for(int i=0;i<4;i++)motorBlendFrom[i]=motorInput[i];transitionAt=armed?millis():0;flightMode=requested;resetFlightPid();snprintf(lastEvent,sizeof(lastEvent),"Mode -> %s",flightModeName(flightMode));eventAt=millis();}
  }
  flightLoopCount++;
  if(activeRcSource==RC_NONE){armLowSeen=false;resetArmGesture();disarmFlight("RC timeout");return;}
  serviceArming(rc);
  if(!armed||rc[2]<1050){motorsSafe();resetFlightPid();return;}
  float desiredRateRoll=0,desiredRatePitch=0,desiredRateYaw=flightSettings.maxRate*((float)rc[3]-1500.0f)/500.0f;float inputRoll=0,inputPitch=0,inputYaw=0;float oldIR=iRateRoll,oldIP=iRatePitch,oldIY=iRateYaw,oldIAR=iAngleRoll,oldIAP=iAnglePitch;
  if(flightMode==FLIGHT_RATE){desiredRateRoll=flightSettings.maxRate*((float)rc[0]-1500.0f)/500.0f;desiredRatePitch=flightSettings.maxRate*((float)rc[1]-1500.0f)/500.0f;desiredAngleR=kalmanRoll;desiredAngleP=kalmanPitch;inputRoll=pidStep(desiredRateRoll-rateRoll,flightPid.rateRoll.p,flightPid.rateRoll.i,flightPid.rateRoll.d,prevRateErrRoll,iRateRoll);inputPitch=pidStep(desiredRatePitch-ratePitch,flightPid.ratePitch.p,flightPid.ratePitch.i,flightPid.ratePitch.d,prevRateErrPitch,iRatePitch);inputYaw=pidStep(desiredRateYaw-rateYaw,flightPid.rateYaw.p,flightPid.rateYaw.i,flightPid.rateYaw.d,prevRateErrYaw,iRateYaw);}
  else{float desiredAngleRoll=flightSettings.maxTilt*((float)rc[0]-1500.0f)/500.0f,desiredAnglePitch=flightSettings.maxTilt*((float)rc[1]-1500.0f)/500.0f;desiredAngleR=desiredAngleRoll;desiredAngleP=desiredAnglePitch;desiredRateRoll=pidStep(desiredAngleRoll-kalmanRoll,flightPid.angleRoll.p,flightPid.angleRoll.i,flightPid.angleRoll.d,prevAngleErrRoll,iAngleRoll);desiredRatePitch=pidStep(desiredAnglePitch-kalmanPitch,flightPid.anglePitch.p,flightPid.anglePitch.i,flightPid.anglePitch.d,prevAngleErrPitch,iAnglePitch);inputRoll=pidStep(desiredRateRoll-rateRoll,flightPid.angleRateRoll.p,flightPid.angleRateRoll.i,flightPid.angleRateRoll.d,prevRateErrRoll,iRateRoll);inputPitch=pidStep(desiredRatePitch-ratePitch,flightPid.angleRatePitch.p,flightPid.angleRatePitch.i,flightPid.angleRatePitch.d,prevRateErrPitch,iRatePitch);inputYaw=pidStep(desiredRateYaw-rateYaw,flightPid.angleRateYaw.p,flightPid.angleRateYaw.i,flightPid.angleRateYaw.d,prevRateErrYaw,iRateYaw);}
  // Proven duty-tick mixer, CC3D X: M1 FL(+R-P+Y), M2 FR(-R-P-Y),
  // M3 RR(-R+P+Y), M4 RL(+R+P-Y). Mixer and configured idle are physical microseconds.
  desiredRateR=desiredRateRoll;desiredRateP=desiredRatePitch;desiredRateY=desiredRateYaw;
  float throttle=min((float)rc[2],(float)flightSettings.maxThrottle);
  float raw[4]={throttle+inputRoll-inputPitch+inputYaw,throttle-inputRoll-inputPitch-inputYaw,throttle-inputRoll+inputPitch+inputYaw,throttle+inputRoll+inputPitch-inputYaw};
  bool saturated=false;for(float v:raw)if(v<flightSettings.idleUs||v>flightSettings.maxMotorUs)saturated=true;
  if(saturated){iRateRoll=oldIR;iRatePitch=oldIP;iRateYaw=oldIY;iAngleRoll=oldIAR;iAnglePitch=oldIAP;}
  float m1=1.024f*constrain(raw[0],(float)flightSettings.idleUs,(float)flightSettings.maxMotorUs),m2=1.024f*constrain(raw[1],(float)flightSettings.idleUs,(float)flightSettings.maxMotorUs),m3=1.024f*constrain(raw[2],(float)flightSettings.idleUs,(float)flightSettings.maxMotorUs),m4=1.024f*constrain(raw[3],(float)flightSettings.idleUs,(float)flightSettings.maxMotorUs);
  if(flightWatchdogTripped){disarmFlight("output supervisor");return;}
  writeFlightDutyOutputs(m1,m2,m3,m4);
}

// ============================================================
// I2C bus / Python Lab scanner + LSM6DS3 raw sensor API
// ============================================================
String i2cHint(uint8_t address){
  switch(address){
    case 0x1E:return "possible HMC5883L magnetometer";
    case 0x27:return "possible LCD1602 I2C backpack";
    case 0x29:return "possible VL53L0X / VL53L1X ToF sensor";
    case 0x3C:return "possible SSD1306 OLED";
    case 0x68:return "possible MPU6050 / IMU";
    case 0x69:return "possible IMU";
    case 0x6A:return "possible LSM6DS3 / ISM330DHCX IMU";
    case 0x6B:return "possible LSM6DS3 / ISM330DHCX IMU";
    case 0x76:return "possible BMP280 / BMP388 / BMP585 barometer";
    case 0x77:return "possible BMP280 / BMP388 / BMP585 barometer";
    default:return "";
  }
}
String hexAddress(uint8_t address){char b[5];snprintf(b,sizeof(b),"0x%02X",address);return String(b);}
static const uint8_t LSM6DS3_ADDR_PRIMARY=0x6B;
static const uint8_t LSM6DS3_ADDR_SECONDARY=0x6A;
static const uint8_t MPU6050_ADDR_PRIMARY=0x68;
static const uint8_t MPU6050_ADDR_SECONDARY=0x69;
ImuSample lastImu;bool lastImuValid=false;ImuKind detectedImu=IMU_NONE;uint8_t detectedImuAddress=0;

bool i2cProbe(uint8_t address){BusGuard guard;if(!guard.held)return false;Wire.beginTransmission(address);return Wire.endTransmission(true)==0;}
bool i2cWriteReg(uint8_t address,uint8_t reg,uint8_t value){BusGuard guard;if(!guard.held)return false;Wire.beginTransmission(address);Wire.write(reg);Wire.write(value);return Wire.endTransmission(true)==0;}
bool i2cReadReg(uint8_t address,uint8_t reg,uint8_t& value){BusGuard guard;if(!guard.held)return false;Wire.beginTransmission(address);Wire.write(reg);if(Wire.endTransmission(false)!=0)return false;if(Wire.requestFrom((int)address,1,true)!=1)return false;value=Wire.read();return true;}
bool i2cReadBlock(uint8_t address,uint8_t reg,uint8_t* dst,size_t len){BusGuard guard;if(!guard.held)return false;Wire.beginTransmission(address);Wire.write(reg);if(Wire.endTransmission(false)!=0)return false;size_t got=Wire.requestFrom((int)address,(int)len,true);if(got!=len)return false;for(size_t i=0;i<len;i++)dst[i]=Wire.read();return true;}
const char* imuName(ImuKind k){return k==IMU_LSM6DS3?"LSM6DS3":k==IMU_MPU6050?"MPU6050":"NONE";}
uint16_t imuOdrHz(ImuKind k){return k==IMU_LSM6DS3?104:k==IMU_MPU6050?250:0;}
ImuKind detectImu(uint8_t& address,uint8_t& who){
  const uint8_t lsmAddr[2]={LSM6DS3_ADDR_PRIMARY,LSM6DS3_ADDR_SECONDARY};for(uint8_t i=0;i<2;i++){uint8_t a=lsmAddr[i];if(!i2cProbe(a))continue;uint8_t w=0;if(i2cReadReg(a,0x0F,w)&&w==0x69){address=a;who=w;return IMU_LSM6DS3;}}
  const uint8_t mpuAddr[2]={MPU6050_ADDR_PRIMARY,MPU6050_ADDR_SECONDARY};for(uint8_t i=0;i<2;i++){uint8_t a=mpuAddr[i];if(!i2cProbe(a))continue;uint8_t w=0;if(i2cReadReg(a,0x75,w)&&(w==0x68||w==0x69)){address=a;who=w;return IMU_MPU6050;}}
  address=0;who=0;return IMU_NONE;
}
bool readLsm6ds3(uint8_t address,uint8_t who,ImuSample& out){
 if(!i2cWriteReg(address,0x10,0x40)||!i2cWriteReg(address,0x11,0x40))return false;delay(2);uint8_t b[12];if(!i2cReadBlock(address,0x22,b,sizeof(b)))return false;
 auto s16=[&](int i)->int16_t{return (int16_t)(((uint16_t)b[i+1]<<8)|b[i]);};out.kind=IMU_LSM6DS3;out.address=address;out.whoAmI=who;out.rawGx=s16(0);out.rawGy=s16(2);out.rawGz=s16(4);out.rawAx=s16(6);out.rawAy=s16(8);out.rawAz=s16(10);out.gx=out.rawGx*0.00875f;out.gy=out.rawGy*0.00875f;out.gz=out.rawGz*0.00875f;out.ax=out.rawAx*0.000061f;out.ay=out.rawAy*0.000061f;out.az=out.rawAz*0.000061f;out.sampledAt=millis();return true;
}
bool readMpu6050(uint8_t address,uint8_t who,ImuSample& out){
 if(!i2cWriteReg(address,0x6B,0x00))return false;delay(2);i2cWriteReg(address,0x1A,0x05);i2cWriteReg(address,0x19,0x03);i2cWriteReg(address,0x1B,0x08);i2cWriteReg(address,0x1C,0x10);uint8_t b[14];if(!i2cReadBlock(address,0x3B,b,sizeof(b)))return false;
 auto be16=[&](int i)->int16_t{return (int16_t)(((uint16_t)b[i]<<8)|b[i+1]);};out.kind=IMU_MPU6050;out.address=address;out.whoAmI=who;out.rawAx=be16(0);out.rawAy=be16(2);out.rawAz=be16(4);out.rawGx=be16(8);out.rawGy=be16(10);out.rawGz=be16(12);out.ax=out.rawAx/4096.0f+accelOffsetX;out.ay=out.rawAy/4096.0f+accelOffsetY;out.az=out.rawAz/4096.0f+accelOffsetZ;out.gx=out.rawGx/65.5f;out.gy=out.rawGy/65.5f;out.gz=out.rawGz/65.5f;out.sampledAt=millis();return true;
}
bool readAnyImu(ImuSample& out){
 uint8_t address=0,who=0;ImuKind kind=detectedImu;if(kind==IMU_NONE||!detectedImuAddress){kind=detectImu(address,who);}else{address=detectedImuAddress;if(kind==IMU_LSM6DS3){if(!i2cReadReg(address,0x0F,who)||who!=0x69)kind=detectImu(address,who);}else if(kind==IMU_MPU6050){if(!i2cReadReg(address,0x75,who)||(who!=0x68&&who!=0x69))kind=detectImu(address,who);}}
 if(kind==IMU_NONE)return false;bool ok=kind==IMU_LSM6DS3?readLsm6ds3(address,who,out):readMpu6050(address,who,out);if(ok){detectedImu=kind;detectedImuAddress=address;}return ok;
}
void probeImuAtBoot(){Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,100000);delay(2);uint8_t address=0,who=0;detectedImu=detectImu(address,who);detectedImuAddress=address;barometerAddressPresent=i2cProbe(0x76)||i2cProbe(0x77);Wire.end();if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);Serial.println(String("IMU auto-detect: ")+imuName(detectedImu)+(address?String(" @ ")+hexAddress(address):String("")));}
void imuApi(){
 ImuSample sample;
 if(FLIGHT_CONTROL_ENABLED&&flightReady){if(!lastImuValid||(uint32_t)(millis()-lastImu.sampledAt)>100){sendMessage(503,"Flight IMU data stale");return;}sample=lastImu;}
 else{
 if(effectiveArmed()){sendMessage(423,"IMU bench read blocked while armed");return;}
 if(FLIGHT_CONTROL_ENABLED)Wire.setClock(400000);else{Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,100000);delay(2);}bool ok=false;for(uint8_t attempt=0;attempt<3&&!ok;attempt++){ok=readAnyImu(sample);if(!ok)delay(5);}if(!FLIGHT_CONTROL_ENABLED){Wire.end();if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);}else if(detectedImu==IMU_MPU6050)configureMpu6050Flight();
 if(!ok){lastImuValid=false;sendMessage(404,"Supported IMU not found. Supported: LSM6DS3 at 0x6A/0x6B and MPU6050 at 0x68/0x69. Check SDA/SCL/VCC/GND.");return;}
 lastImu=sample;lastImuValid=true;}String hx=hexAddress(sample.address),sensor=imuName((ImuKind)sample.kind),whoHex=String("0x")+(sample.whoAmI<16?"0":"")+String(sample.whoAmI,HEX);whoHex.toUpperCase();
 String j="{\"ok\":true,\"source\":\"real\",\"sensor\":\""+sensor+"\",\"address\":"+String(sample.address)+",\"addressHex\":\""+hx+"\",\"whoAmI\":"+String(sample.whoAmI)+",\"whoAmIHex\":\""+whoHex+"\",\"odrHz\":"+String(imuOdrHz((ImuKind)sample.kind))+",\"accelRangeG\":"+String(sample.kind==IMU_MPU6050?8:2)+",\"gyroRangeDps\":"+String(sample.kind==IMU_MPU6050?500:245);
 j+=",\"accel\":{\"x\":"+String(sample.ax,6)+",\"y\":"+String(sample.ay,6)+",\"z\":"+String(sample.az,6)+"}";j+=",\"gyro\":{\"x\":"+String(sample.gx,4)+",\"y\":"+String(sample.gy,4)+",\"z\":"+String(sample.gz,4)+"}";j+=",\"raw\":{\"ax\":"+String(sample.rawAx)+",\"ay\":"+String(sample.rawAy)+",\"az\":"+String(sample.rawAz)+",\"gx\":"+String(sample.rawGx)+",\"gy\":"+String(sample.rawGy)+",\"gz\":"+String(sample.rawGz)+"},\"sampleMs\":"+String(sample.sampledAt)+"}";sendJson(200,j);
}
void i2cScanApi(){
  if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"I2C scan blocked while armed or motor test runs");return;}
  ConfigGuard cg;if(!cg.held){sendMessage(423,"I2C scan requires idle kit");return;}BusGuard bg;if(!bg.held){sendMessage(503,"I2C busy");return;}uint32_t started=millis();int deviceCount=0,errorCount=0;String devices="[",errors="[";bool firstDevice=true,firstError=true;
  if(FLIGHT_CONTROL_ENABLED)Wire.setClock(100000);else{Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,100000);delay(2);}Serial.println("Scanning I2C bus...\n");
  for(uint8_t address=1;address<127;address++){
    Wire.beginTransmission(address);uint8_t error=Wire.endTransmission(true);
    if(error==0){String hx=hexAddress(address),hint=i2cHint(address);Serial.print("Found device at ");Serial.println(hx);if(!firstDevice)devices+=",";firstDevice=false;devices+="{\"address\":"+String(address)+",\"addressHex\":\""+hx+"\",\"hint\":\""+jsonEscape(hint)+"\"}";deviceCount++;}
    else if(error==4){String hx=hexAddress(address);Serial.print("Unknown I2C error at ");Serial.println(hx);if(!firstError)errors+=",";firstError=false;errors+="{\"address\":"+String(address)+",\"addressHex\":\""+hx+"\",\"code\":4}";errorCount++;}
    delay(1);
  }
  devices+="]";errors+="]";uint32_t elapsed=millis()-started;if(deviceCount==0)Serial.println("No I2C devices found.\n");else{Serial.print("Total I2C devices found: ");Serial.println(deviceCount);}Serial.println("\n-----------------------------\n");
  if(FLIGHT_CONTROL_ENABLED){Wire.setClock(400000);if(detectedImu==IMU_MPU6050)configureMpu6050Flight();}else{Wire.end();if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);}
  String j="{\"ok\":true,\"bus\":0,\"sda\":"+String(I2C_SDA_PIN)+",\"scl\":"+String(I2C_SCL_PIN)+",\"clockHz\":100000,\"count\":"+String(deviceCount)+",\"errorCount\":"+String(errorCount)+",\"durationMs\":"+String(elapsed)+",\"devices\":"+devices+",\"errors\":"+errors+"}";sendJson(200,j);
}

// All generic expansion bus work is kept off the armed flight loop.
void expansionBusBegin(){if(FLIGHT_CONTROL_ENABLED)Wire.setClock(100000);else Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,100000);}
void expansionBusEnd(){if(FLIGHT_CONTROL_ENABLED)Wire.setClock(400000);else{Wire.end();if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);}}
bool expansionBusAvailable(){if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Expansion I2C is blocked while armed or motor test runs");return false;}return true;}
bool expansionPinConfigAllowed(){if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"Auxiliary pin outputs require the verified A2 XIAO profile");return false;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Pin changes are blocked while armed or during bench output");return false;}return true;}
String matrixRowsJson(){String j="[";for(int i=0;i<8;i++){if(i)j+=",";j+=String(matrixRows[i]);}return j+"]";}
int parseEightRows(const String& csv,uint8_t out[8]){int start=0,n=0;while(start<csv.length()&&n<8){int end=csv.indexOf(',',start);if(end<0)end=csv.length();String v=csv.substring(start,end);v.trim();if(!v.length())return -1;for(size_t i=0;i<v.length();i++)if(v[i]<'0'||v[i]>'9')return -1;int row=v.toInt();if(row<0||row>255)return -1;out[n++]=(uint8_t)row;start=end+1;}return start>=csv.length()?n:-1;}
// XIAO ESP32-C6 orange user LED on GPIO15; active low. The scheduler never delays flight control.
#if defined(CONFIG_IDF_TARGET_ESP32C6)
const int USER_LED_PIN=15;
#else
const int USER_LED_PIN=-1;
#endif
uint16_t userLedIntervalMs=0;
uint32_t userLedLastMs=0;
bool userLedLit=false;
void serviceUserLed(){
 if(USER_LED_PIN<0||!userLedIntervalMs)return;
 uint32_t now=millis();
 if((uint32_t)(now-userLedLastMs)>=userLedIntervalMs){userLedLastMs=now;userLedLit=!userLedLit;digitalWrite(USER_LED_PIN,userLedLit?LOW:HIGH);}
}
void expansionReadCommand(const String& type){
 if(type=="led_read"){sendJson(200,"{\"ok\":true,\"command\":\"led_read\",\"supported\":"+String(USER_LED_PIN>=0?"true":"false")+",\"gpio\":"+String(USER_LED_PIN)+",\"on\":"+String(userLedLit?"true":"false")+",\"intervalMs\":"+String(userLedIntervalMs)+"}");return;}
 if(type=="pinmap_get"){sendJson(200,"{\"ok\":true,\"command\":\"pinmap_get\",\"expansion\":"+expansionJson()+"}");return;}
 if(type=="gps_read"){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(gpsUbx10Hz&&gpsDriver){
    const DroneGPSData& g=gpsDriver->data();const DroneGPSConfigReport& c=gpsDriver->configurationReport();
    const bool fresh=gpsDriver->dataFresh(),rateOk=fresh&&gpsMeasuredHz>=9&&gpsMeasuredHz<=11;
    String j="{\"ok\":true,\"command\":\"gps_read\",\"protocol\":\"UBX_10HZ\",\"targetHz\":10,\"measuredHz\":"+String(gpsMeasuredHz)+",\"rateOk\":"+String(rateOk?"true":"false")+",\"configured\":"+String(gpsReady?"true":"false")+",\"configError\":\""+jsonEscape(DroneGPS::configErrorText(c.error))+"\",\"fresh\":"+String(fresh?"true":"false")+",\"ageMs\":"+String(gpsLastMs?millis()-gpsLastMs:0)+",\"readyForEkf\":"+String(gpsDriver->readyForEkf()?"true":"false")+",\"fixValid\":"+String(g.fixValid?"true":"false")+",\"satellites\":"+String(g.satellites)+",\"latitude\":"+String(g.latitude,7)+",\"longitude\":"+String(g.longitude,7)+",\"altitudeM\":"+String(g.altitudeMSLM,2)+",\"horizontalAccuracyM\":"+String(g.horizontalAccuracyM,2)+",\"speedAccuracyMps\":"+String(g.speedAccuracyMps,2)+",\"pdop\":"+String(g.positionDOP,2)+"}";
    sendJson(200,j);return;
  }
#endif
  String j="{\"ok\":true,\"command\":\"gps_read\",\"protocol\":\""+String(gpsUbx10Hz?"UBX_10HZ":"NMEA_9600")+"\",\"ready\":"+String(gpsReady?"true":"false")+",\"sentence\":\""+jsonEscape(gpsLastSentence)+"\",\"sentences\":"+String(gpsSentences)+",\"measuredHz\":0,\"ageMs\":"+String(gpsLastMs?millis()-gpsLastMs:0)+"}";sendJson(200,j);return;
 }
 if(type=="matrix_read"){sendJson(200,"{\"ok\":true,\"command\":\"matrix_read\",\"address\":"+String(matrixAddress)+",\"rows\":"+matrixRowsJson()+"}");return;}
 if(type=="gpio_read"){int pin=server.arg("pin").toInt();if(!auxPinAllowed(pin)||pin==servoPin||pin==gpsRxPin||pin==gpsTxPin||matrixUsesPin(pin)){sendMessage(400,"Choose an unreserved A2 D7-D10 GPIO");return;}if(effectiveArmed()){sendMessage(423,"GPIO bench read blocked while armed");return;}String mode=server.arg("mode");if(mode.length()==0)mode="pullup";if(mode!="pullup"&&mode!="pulldown"&&mode!="floating"){sendMessage(400,"Input mode must be pullup, pulldown or floating");return;}if(!auxOutputActive(pin))pinMode(pin,mode=="pullup"?INPUT_PULLUP:mode=="pulldown"?INPUT_PULLDOWN:INPUT);sendJson(200,"{\"ok\":true,\"command\":\"gpio_read\",\"pin\":"+String(pin)+",\"value\":"+String(digitalRead(pin)) +",\"mode\":\""+mode+"\"}");return;}
 if(type=="i2c_read"){
  if(!expansionBusAvailable())return;int address=server.arg("address").toInt(),reg=server.arg("reg").toInt(),length=server.arg("length").toInt();if(address<8||address>0x77||reg<0||reg>255||length<1||length>16){sendMessage(400,"I2C read needs address 8-119, register 0-255, length 1-16");return;}
  expansionBusBegin();Wire.beginTransmission((uint8_t)address);Wire.write((uint8_t)reg);int error=Wire.endTransmission(false);int got=error==0?Wire.requestFrom(address,length,true):0;String values="[";for(int i=0;i<got;i++){if(i)values+=",";values+=String(Wire.read());}values+="]";expansionBusEnd();if(error||got!=length){sendMessage(502,"I2C device did not return the requested bytes; check address/register/wiring");return;}
  sendJson(200,"{\"ok\":true,\"command\":\"i2c_read\",\"address\":"+String(address)+",\"reg\":"+String(reg)+",\"bytes\":"+values+"}");return;
 }
}
void expansionWriteCommand(const String& type){
 if(type=="ppm_config"){if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"PPM changes blocked while armed or bench outputs run");return;}}else if(type!="i2c_write"&&type!="matrix_write"&&!expansionPinConfigAllowed())return;
 if(type=="motor_map_set"){
  uint8_t next[4];for(int i=0;i<4;i++){String key="m"+String(i+1)+"slot";if(!server.hasArg(key)){sendMessage(400,"Specify all four motor slots 0-3");return;}int v=server.arg(key).toInt();if(v<0||v>3){sendMessage(400,"Motor slot must be D0-D3");return;}next[i]=(uint8_t)v;}
  if(!motorSlotsValid(next)){sendMessage(400,"Each D0-D3 motor connector must appear exactly once");return;}for(int i=0;i<4;i++)motorSlots[i]=next[i];saveExpansionSettings();sendJson(200,"{\"ok\":true,\"command\":\"motor_map_set\",\"rebooting\":true,\"expansion\":"+expansionJson()+"}");restartAt=millis()+800;return;
 }
 if(type=="ppm_config"){
  if(!server.hasArg("edge")){sendMessage(400,"PPM edge is required: RISING or FALLING");return;}String edge=server.arg("edge");edge.toUpperCase();if(edge!="RISING"&&edge!="FALLING"){sendMessage(400,"PPM edge must be RISING or FALLING");return;}bool reverse[4];for(int i=0;i<4;i++){String k="reverse"+String(i);if(!server.hasArg(k)){sendMessage(400,"Specify reverse0..reverse3 for roll/pitch/throttle/yaw");return;}reverse[i]=server.arg(k)=="1"||server.arg(k)=="true";}String mode=server.hasArg("armMode")?server.arg("armMode"):String(ppmYawStickArm?(ppmArmLeft?"YAW_LEFT":"YAW_STICK"):"CH5_SWITCH");mode.toUpperCase();if(mode!="YAW_STICK"&&mode!="YAW_LEFT"&&mode!="CH5_SWITCH"){sendMessage(400,"PPM armMode must be YAW_STICK or CH5_SWITCH");return;}int pin=server.hasArg("pin")?server.arg("pin").toInt():ppmReceiverPin;if(!ppmPinAllowed(pin)){sendMessage(400,"PPM pin must be A2 D6/GPIO16 or D10/GPIO18");return;}if(pin!=ppmReceiverPin&&(pin==servoPin||pin==gpsRxPin||pin==gpsTxPin||matrixUsesPin(pin)||auxOutputActive(pin))){sendMessage(409,"Selected PPM pin is assigned to servo, GPS or GPIO. Release it first.");return;}if(ENABLE_PPM_RECEIVER&&ppmReceiverPin>=0)detachInterrupt(digitalPinToInterrupt(ppmReceiverPin));noInterrupts();ppmLastFrameUs=0;ppmLastEdgeUs=0;ppmIndex=0;ppmInvalidFrame=false;interrupts();ppmReceiverPin=pin;ppmEdgeFalling=edge=="FALLING";for(int i=0;i<4;i++)ppmReverse[i]=reverse[i];ppmYawStickArm=mode!="CH5_SWITCH";ppmArmLeft=mode=="YAW_LEFT";saveFcSetup();armLowSeen=false;resetArmGesture();saveExpansionSettings();if(ENABLE_PPM_RECEIVER&&ppmReceiverPin>=0){pinMode(ppmReceiverPin,ppmEdgeFalling?INPUT_PULLDOWN:INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(ppmReceiverPin),ppmIsr,ppmEdgeFalling?FALLING:RISING);}sendJson(200,"{\"ok\":true,\"command\":\"ppm_config\",\"expansion\":"+expansionJson()+"}");return;
 }
 if(type=="servo_config"){
  int pin=server.arg("pin").toInt();if(pin!=-1&&(!auxPinAllowed(pin)||pin==gpsRxPin||pin==gpsTxPin||matrixUsesPin(pin)||auxOutputActive(pin))){sendMessage(400,"Servo needs an unreserved D7-D10 pin or -1 to disable");return;}int old=servoPin;if(servoAttached){ledcWrite(old,servoDutyFromUs(1500));ledcDetach(old);servoAttached=false;}servoPin=pin;servoPulseUs=1500;
  if(pin>=0){servoAttached=ledcAttachChannel(pin,50,12,4);if(!servoAttached||(escPwmReady&&ledcReadFreq(motorPinForIndex(0))!=250)){if(servoAttached)ledcDetach(pin);servoPin=old;if(old>=0){servoAttached=ledcAttachChannel(old,50,12,4);if(servoAttached)ledcWrite(old,servoDutyFromUs(1500));}sendMessage(503,"Servo PWM channel unavailable or ESC timer affected; mapping unchanged");return;}ledcWrite(pin,servoDutyFromUs(1500));}
  saveExpansionSettings();sendJson(200,"{\"ok\":true,\"command\":\"servo_config\",\"expansion\":"+expansionJson()+"}");return;
 }
 if(type=="servo_write"){if(!servoAttached){sendMessage(409,"Configure a free servo pin first");return;}int pulse=server.arg("pulseUs").toInt();if(pulse<1000||pulse>2000){sendMessage(400,"Servo pulse must be 1000-2000 us");return;}servoPulseUs=pulse;ledcWrite(servoPin,servoDutyFromUs(pulse));sendJson(200,"{\"ok\":true,\"command\":\"servo_write\",\"pulseUs\":"+String(pulse)+"}");return;}
 if(type=="gps_config"){
  int pin=server.arg("pin").toInt();String protocol=server.hasArg("protocol")?server.arg("protocol"):"NMEA_9600";protocol.toUpperCase();
  if(protocol!="NMEA_9600"&&protocol!="UBX_10HZ"){sendMessage(400,"GPS protocol must be NMEA_9600 or UBX_10HZ");return;}
  const bool ubx=pin>=0&&protocol=="UBX_10HZ";int tx=ubx?(server.hasArg("txPin")?server.arg("txPin").toInt():-1):-1;
  if(pin!=-1&&(!auxPinAllowed(pin)||pin==servoPin||matrixUsesPin(pin)||auxOutputActive(pin))){sendMessage(400,"GPS RX needs a free A2 D7-D10 pin");return;}
  if(ubx&&(!auxPinAllowed(tx)||tx==pin||tx==servoPin||matrixUsesPin(tx)||auxOutputActive(tx))){sendMessage(400,"UBX 10 Hz needs a second free A2 D7-D10 TX pin for GPS RX");return;}
  Serial1.end();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(gpsDriver){delete gpsDriver;gpsDriver=nullptr;}
#endif
  gpsRxPin=pin;gpsTxPin=tx;gpsUbx10Hz=ubx;gpsReady=false;gpsLine="";gpsLastSentence="";gpsSentences=0;gpsLastMs=0;gpsMeasuredHz=0;gpsEpochsThisSecond=0;
  saveExpansionSettings();
  if(ubx){sendJson(200,"{\"ok\":true,\"command\":\"gps_config\",\"rebooting\":true,\"message\":\"Configuring bundled DroneGPS after restart; read gps_read for measured epoch Hz\",\"expansion\":"+expansionJson()+"}");restartAt=millis()+800;return;}
  if(pin>=0){Serial1.begin(9600,SERIAL_8N1,pin,-1);gpsReady=true;}
  sendJson(200,"{\"ok\":true,\"command\":\"gps_config\",\"expansion\":"+expansionJson()+"}");return;
 }
 if(type=="led_set"){
  if(USER_LED_PIN<0){sendMessage(403,"Onboard user LED available on ZEBJUS Aerion F1 only");return;}
  String mode=server.arg("mode");int interval=server.arg("intervalMs").toInt();
  if(mode!="on"&&mode!="off"&&mode!="blink"){sendMessage(400,"LED mode must be on, off or blink");return;}
  if(mode=="blink"&&(interval<100||interval>5000)){sendMessage(400,"Blink intervalMs must be 100-5000");return;}
  userLedIntervalMs=mode=="blink"?(uint16_t)interval:0;
  userLedLastMs=millis();userLedLit=mode!="off";digitalWrite(USER_LED_PIN,userLedLit?LOW:HIGH);
  sendJson(200,"{\"ok\":true,\"command\":\"led_set\",\"mode\":\""+mode+"\",\"intervalMs\":"+String(userLedIntervalMs)+"}");return;
 }
 if(type=="gpio_write"){
  int pin=server.arg("pin").toInt(),value=server.arg("value").toInt();if(!auxPinAllowed(pin)||pin==servoPin||pin==gpsRxPin||pin==gpsTxPin||matrixUsesPin(pin)||value<0||value>1){sendMessage(400,"GPIO write needs an unreserved A2 D7-D10 pin and value 0/1");return;}auxOutputMask|=(1u<<auxPinIndex(pin));pinMode(pin,OUTPUT);digitalWrite(pin,value?HIGH:LOW);sendJson(200,"{\"ok\":true,\"command\":\"gpio_write\",\"pin\":"+String(pin)+",\"value\":"+String(value)+"}");return;
 }
 if(type=="gpio_release"){
  int pin=server.arg("pin").toInt();if(!auxPinAllowed(pin)||!auxOutputActive(pin)){sendMessage(400,"GPIO release needs an active D7-D10 output");return;}
  digitalWrite(pin,LOW);pinMode(pin,INPUT);auxOutputMask&=~(1u<<auxPinIndex(pin));sendJson(200,"{\"ok\":true,\"command\":\"gpio_release\",\"expansion\":"+expansionJson()+"}");return;
 }
 if(type=="matrix_config"||type=="matrix_write"||type=="i2c_write"){
  if(type=="matrix_config"&&server.arg("driver")=="MAX7219"){if(!expansionPinConfigAllowed())return;int din=server.arg("dinPin").toInt(),clk=server.arg("clkPin").toInt(),cs=server.arg("csPin").toInt();if(!server.hasArg("dinPin")||!server.hasArg("clkPin")||!server.hasArg("csPin")||!matrixPinsValid(din,clk,cs)){sendMessage(400,"MAX7219 needs three distinct free A2 D7-D10 pins: dinPin, clkPin, csPin");return;}matrixSpiRelease();matrixSpi=true;matrixDin=din;matrixClk=clk;matrixCs=cs;matrixSpiBegin();saveExpansionSettings();sendJson(200,"{\"ok\":true,\"command\":\"matrix_config\",\"expansion\":"+expansionJson()+"}");return;}
  if(type=="matrix_write"&&matrixSpi){if(!expansionPinConfigAllowed())return;uint8_t rows[8];if(parseEightRows(server.arg("rows"),rows)!=8){sendMessage(400,"Matrix needs eight bytes (0-255)");return;}for(int i=0;i<8;i++){matrixRows[i]=rows[i];matrixSpiSend(i+1,rows[i]);}sendJson(200,"{\"ok\":true,\"command\":\"matrix_write\",\"rows\":"+matrixRowsJson()+"}");return;}
  if(!expansionBusAvailable())return;
  if(type=="matrix_config"){int addr=server.arg("address").toInt();if(addr<0x70||addr>0x77){sendMessage(400,"HT16K33 address must be 0x70-0x77 (112-119)");return;}if(server.hasArg("driver")&&server.arg("driver")!="HT16K33"){sendMessage(400,"Choose HT16K33 or MAX7219");return;}matrixSpiRelease();matrixAddress=addr;saveExpansionSettings();sendJson(200,"{\"ok\":true,\"command\":\"matrix_config\",\"expansion\":"+expansionJson()+"}");return;}
  if(type=="matrix_write"){
   uint8_t rows[8];if(parseEightRows(server.arg("rows"),rows)!=8){sendMessage(400,"HT16K33 rows needs exactly eight decimal bytes (0-255)");return;}expansionBusBegin();Wire.beginTransmission(matrixAddress);Wire.write(0x21);int error=Wire.endTransmission();if(!error){Wire.beginTransmission(matrixAddress);Wire.write(0x81);error=Wire.endTransmission();}if(!error){Wire.beginTransmission(matrixAddress);Wire.write(0xE8);error=Wire.endTransmission();}if(!error){Wire.beginTransmission(matrixAddress);Wire.write(0x00);for(int i=0;i<8;i++){Wire.write(rows[i]);Wire.write(0);}error=Wire.endTransmission();}expansionBusEnd();if(error){sendMessage(502,"HT16K33 matrix not responding; check 0x70-0x77 and 3.3 V logic");return;}for(int i=0;i<8;i++)matrixRows[i]=rows[i];sendJson(200,"{\"ok\":true,\"command\":\"matrix_write\",\"rows\":"+matrixRowsJson()+"}");return;
  }
  int address=server.arg("address").toInt(),reg=server.arg("reg").toInt();String bytes=server.arg("bytes");if(address<8||address>0x77||address==detectedImuAddress||reg<0||reg>255||!bytes.length()){sendMessage(400,"I2C write needs a non-IMU address 8-119, register 0-255 and decimal bytes");return;}uint8_t values[8];int n=0,start=0;while(start<bytes.length()&&n<8){int end=bytes.indexOf(',',start);if(end<0)end=bytes.length();String b=bytes.substring(start,end);b.trim();if(!b.length()){sendMessage(400,"Empty I2C byte");return;}for(size_t i=0;i<b.length();i++)if(b[i]<'0'||b[i]>'9'){sendMessage(400,"I2C bytes must be decimal 0-255");return;}int v=b.toInt();if(v<0||v>255){sendMessage(400,"I2C byte out of range");return;}values[n++]=v;start=end+1;}if(start<bytes.length()){sendMessage(400,"I2C write maximum is eight bytes");return;}expansionBusBegin();Wire.beginTransmission((uint8_t)address);Wire.write((uint8_t)reg);for(int i=0;i<n;i++)Wire.write(values[i]);int error=Wire.endTransmission();expansionBusEnd();if(error){sendMessage(502,"I2C write NACK; check device address/wiring");return;}sendJson(200,"{\"ok\":true,\"command\":\"i2c_write\",\"written\":"+String(n)+"}");return;
 }
 sendMessage(400,"Unknown expansion command: "+type);
}


#include "FlightFeatures.h"
#include "FlightRcTransport.h"
#include "FlightSetup.h"
#include "FlightTraining.h"

// ============================================================
// Status / telemetry / commands
// ============================================================
String bootDiagnosticsJson();
String statusJson(const String& clientId=""){
  expireLock();bool connected=setupMode?WiFi.softAPgetStationNum()>0:WiFi.status()==WL_CONNECTED;String mode=setupMode?"AP / DIRECT":"STA / LOCAL";
  String j="{\"ok\":true,\"kit\":\"ZEBJUS_FLIGHTCORE\",\"version\":\""+String(FW_VERSION)+"\",\"firmware\":\""+String(FW_VERSION)+"\",\"firmwareBuiltAt\":\""+String(FW_BUILD_DATE)+" "+String(FW_BUILD_TIME)+" UTC\"";
  j+=",\"name\":\""+jsonEscape(kitName)+"\",\"deviceName\":\""+jsonEscape(kitName)+"\",\"hostname\":\""+hostFromName(kitName)+"\",\"deviceId\":\""+deviceId+"\",\"boardId\":\""+String(BOARD_ID)+"\",\"boardName\":\""+String(BOARD_NAME)+"\"";
  j+=",\"connected\":"+String(connected?"true":"false")+",\"ssid\":\""+jsonEscape(setupMode?apName:connected?WiFi.SSID():"")+"\",\"ip\":\""+(setupMode?WiFi.softAPIP().toString():WiFi.localIP().toString())+"\",\"rssi\":"+String(connected?WiFi.RSSI():0);
  j+=",\"wifiDiagnostics\":{\"preferredSsid\":\""+jsonEscape(preferredSSID)+"\",\"attemptedSsid\":\""+jsonEscape(wifiAttemptSSID)+"\",\"attemptStatus\":"+String(wifiAttemptStatus)+",\"disconnectReason\":"+String(wifiAttemptReason)+",\"recoveryAp\":"+String(wifiFallbackAp?"true":"false")+",\"retryWhenIdleMs\":"+String(WIFI_RECOVERY_RETRY_MS)+"}";
  j+=",\"mode\":\""+mode+"\",\"apPreferred\":"+String(preferredApMode()?"true":"false")+",\"apSsid\":\""+jsonEscape(apName)+"\",\"armed\":"+String(effectiveArmed()?"true":"false")+",\"locked\":"+String(lockActive()?"true":"false")+",\"lockMine\":"+String(lockMine(clientId)?"true":"false")+",\"lockTimeoutMs\":"+String(LOCK_TIMEOUT_MS)+",\"rcTimeoutMs\":"+String(WEB_RC_STALE_MS)+",\"rcCenterMs\":"+String(RcLinkPolicy::CENTER_AFTER_MS)+",\"benchRc\":"+String((ALLOW_WEB_RC&&FLIGHT_CONTROL_ENABLED)?"true":"false")+",\"webRc\":"+String((ALLOW_WEB_RC&&FLIGHT_CONTROL_ENABLED)?"true":"false")+",\"apRc\":"+String((ALLOW_WEB_RC&&FLIGHT_CONTROL_ENABLED)?"true":"false")+",\"firmwareRole\":\""+String(FLIGHT_CONTROL_ENABLED?"RATE_ANGLE_FLIGHT_CORE":"WIFI_SENSOR_BRIDGE")+"\",\"flightCoreIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"flightReady\":"+String(flightReady?"true":"false")+",\"escOutputs\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"pidIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"pidWritable\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"calibrationIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"flightMode\":\""+String(flightModeName(flightMode))+"\",\"rcSource\":\""+String(rcSourceName(activeRcSource))+"\",\"rcPolicy\":\"PPM_FIRST_THEN_NETWORK\",\"otaUpdate\":true,\"receiverHealth\":\""+receiverHealth()+"\",\"receiverPin\":"+String(ppmReceiverPin)+",\"i2cScan\":true,\"imuRead\":true,\"imuModel\":\""+String(imuName(detectedImu))+"\",\"i2cSda\":"+String(I2C_SDA_PIN)+",\"i2cScl\":"+String(I2C_SCL_PIN)+",\"benchMode\":"+String((int)benchMode)+",\"loopCount\":"+String(flightLoopCount)+",\"maxLoopGapUs\":"+String(maxFlightLoopGapUs)+",\"loopOverruns\":"+String(flightLoopOverruns)+",\"outputWatchdogTripped\":"+String(flightWatchdogTripped?"true":"false")+",\"outputWatchdogTrips\":"+String(flightWatchdogTrips)+",\"ppmFrameHz\":"+String(ppmFrameHz)+",\"webRcFrameHz\":"+String(webRcFrameHz)+",\"flightLoopHz\":"+String(flightLoopHz)+",\"expansion\":"+expansionJson()+",\"pid\":"+pidJson()+"}";
  j.remove(j.length()-1);j+=bootDiagnosticsJson();j+=",\"rcMonitorPort\":"+String(RcMonitorProtocol::PORT)+",\"securityRequired\":true,\"securityProtocol\":\"ZFC3\",\"pidRevision\":"+String(pidRevision)+",\"savedRevision\":"+String(pidSavedRevision)+",\"rcMonitorProtocol\":\"ZFC3_NDJSON\""+rcTransportJson()+flightFeatureJson(server.arg("clientId"))+"}";return j;
}
void statusApi(){sendJson(200,statusJson(server.arg("clientId")));}
void telemetryApi(){
  uint16_t rc[10];RcSourceKind src=(FLIGHT_CONTROL_ENABLED||trainingActive)?chooseRcSource():RC_PPM;copyActiveRc(rc,src);String rx=src==RC_WEB_AP||src==RC_WEB_STA?String(webRcFresh()?"OK":"STALE"):receiverHealth();uint32_t age=receiverAgeMs();
  // Live RC polling does not allocate PID/config/sensor payloads or touch I2C.
  if(server.arg("stream")=="rc"){
    const String client=server.arg("clientId");
    String j="{\"ok\":true,\"kit\":\"ZEBJUS_FLIGHTCORE\",\"deviceId\":\""+deviceId+"\",\"name\":\""+jsonEscape(kitName)+"\",\"ip\":\""+(setupMode?WiFi.softAPIP().toString():WiFi.localIP().toString())+"\",\"mode\":\""+String(setupMode?"AP / DIRECT":"STA / LOCAL")+"\",\"armed\":"+String(effectiveArmed()?"true":"false")+",\"flightReady\":"+String(flightReady?"true":"false")+",\"flightMode\":\""+String(flightModeName(flightMode))+"\",\"locked\":"+String(lockActive()?"true":"false")+",\"lockMine\":"+String(lockMine(client)?"true":"false")+",\"viewOnly\":"+String(lockActive()&&!lockMine(client)?"true":"false")+",\"controlRole\":\""+controlRole+"\",\"trainingSelection\":true,\"trainingActive\":"+String(trainingActive?"true":"false")+",\"trainingTarget\":\""+String(trainingTarget==1?"TRIPOD":trainingTarget==2?"FLIGHT":"NONE")+"\",\"trainingController\":\""+String(trainingAppOwned?"APP":"WEB")+"\",\"trainingRunId\":"+String(trainingRunId)+",\"trainingWebAppId\":\""+String(trainingWebAppId?trainingWebAppId:0)+"\",\"rcSource\":\""+String(rcSourceName(src))+"\",\"receiverHealth\":\""+rx+"\",\"rcAgeMs\":"+String(src==RC_PPM?(age==0xFFFFFFFFUL?999999UL:age):(webRcLastMs?(uint32_t)(millis()-webRcLastMs):999999UL))+",\"rc\":[";
    for(int i=0;i<10;i++){if(i)j+=",";j+=String(rc[i]);}j+="]";j+=",\"roll\":"+String(kalmanRoll,3)+",\"pitch\":"+String(kalmanPitch,3)+",\"yaw\":"+String(flightYaw,3)+",\"webRcFrameHz\":"+String(webRcFrameHz)+",\"ppmFrameHz\":"+String(ppmFrameHz)+",\"flightLoopHz\":"+String(flightLoopHz)+rcTransportJson()+",\"batteryValid\":"+String(batteryValid?"true":"false")+",\"battery\":"+(batteryValid?String(batteryVoltage,3):String("null"))+"}";sendJson(200,j);return;
  }
  if(!FLIGHT_CONTROL_ENABLED&&!trainingActive&&!effectiveArmed()){Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN,100000);delay(1);ImuSample sample;if(readAnyImu(sample)){lastImu=sample;lastImuValid=true;}Wire.end();if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);}
  bool imuFresh=lastImuValid&&(uint32_t)(millis()-lastImu.sampledAt)<2500UL;String imuHealth=lastImuValid?(imuFresh?"OK":"STALE"):"NOT_FOUND";
  String j="{\"ok\":true,\"kit\":\"ZEBJUS_FLIGHTCORE\",\"name\":\""+jsonEscape(kitName)+"\",\"ip\":\""+(setupMode?WiFi.softAPIP().toString():WiFi.localIP().toString())+"\",\"mode\":\""+String(setupMode?"AP / DIRECT":"STA / LOCAL")+"\",\"locked\":"+String(lockActive()?"true":"false")+",\"lockMine\":"+String(lockMine(server.arg("clientId"))?"true":"false")+",\"type\":\"telemetry\",\"source\":\""+String(FLIGHT_CONTROL_ENABLED?"flight_core":"bridge")+"\",\"flightCoreIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"flightReady\":"+String(flightReady?"true":"false")+",\"flightMode\":\""+String(flightModeName(flightMode))+"\",\"rcSource\":\""+String(rcSourceName(src))+"\",\"roll\":"+String(FLIGHT_CONTROL_ENABLED?kalmanRoll:0.0f,3)+",\"pitch\":"+String(FLIGHT_CONTROL_ENABLED?kalmanPitch:0.0f,3)+",\"yaw\":"+String(FLIGHT_CONTROL_ENABLED?flightYaw:0.0f,3)+",\"gyroX\":"+String(FLIGHT_CONTROL_ENABLED?rateRoll:(lastImuValid?lastImu.gx:0.0f),4)+",\"gyroY\":"+String(FLIGHT_CONTROL_ENABLED?ratePitch:(lastImuValid?lastImu.gy:0.0f),4)+",\"gyroZ\":"+String(FLIGHT_CONTROL_ENABLED?rateYaw:(lastImuValid?lastImu.gz:0.0f),4)+",\"accX\":"+String(lastImuValid?lastImu.ax:0.0f,6)+",\"accY\":"+String(lastImuValid?lastImu.ay:0.0f,6)+",\"accZ\":"+String(lastImuValid?lastImu.az:0.0f,6)+",\"imuModel\":\""+String(imuName(detectedImu))+"\",\"sampleMs\":"+String(lastImuValid?lastImu.sampledAt:0)+",\"battery\":"+(batteryValid?String(batteryVoltage,3):String("null"))+",\"batteryValid\":"+String(batteryValid?"true":"false")+",\"armed\":"+String(effectiveArmed()?"true":"false");
  j+=",\"rc\":[";for(int i=0;i<10;i++){if(i)j+=",";j+=String(rc[i]);}j+="]";
  j+=",\"expansion\":"+expansionJson();j+=",\"motors\":["+String((int)motorInput[0])+","+String((int)motorInput[1])+","+String((int)motorInput[2])+","+String((int)motorInput[3])+"]";
  j+=",\"rcAgeMs\":"+String(src==RC_PPM?(age==0xFFFFFFFFUL?999999UL:age):(webRcLastMs?(uint32_t)(millis()-webRcLastMs):999999UL))+",\"receiverHealth\":\""+rx+"\"";
  j+=",\"imuHealth\":\""+imuHealth+"\",\"barometerHealth\":\"NOT_FOUND\",\"lidarHealth\":\"NOT_FOUND\",\"loopCount\":"+String(flightLoopCount)+",\"maxLoopGapUs\":"+String(maxFlightLoopGapUs)+",\"loopOverruns\":"+String(flightLoopOverruns)+",\"outputWatchdogTripped\":"+String(flightWatchdogTripped?"true":"false")+",\"outputWatchdogTrips\":"+String(flightWatchdogTrips)+",\"ppmFrameHz\":"+String(ppmFrameHz)+",\"webRcFrameHz\":"+String(webRcFrameHz)+",\"flightLoopHz\":"+String(flightLoopHz);
  j+=",\"sensorHealth\":{\"imu\":\""+imuHealth+"\",\"barometer\":\"NOT_FOUND\",\"lidar\":\"NOT_FOUND\",\"receiver\":\""+rx+"\"}";j+=bootDiagnosticsJson();j+=rcTransportJson()+flightFeatureJson(server.arg("clientId"))+"}";sendJson(200,j);
}
void buildRcMonitorPacket(char* out,size_t capacity){
 RcSourceKind src=chooseRcSource();uint16_t rc[10];copyActiveRc(rc,src);
 uint32_t last=webRcLastMs,now=millis();
 uint32_t age=src==RC_PPM?receiverAgeMs():last?(uint32_t)(now-last):999999;
 if(age==0xFFFFFFFFUL)age=999999;
 bool active=trainingActive,ownerLive=(int32_t)(controlExpiresAt-now)>0;char channels[80];size_t used=0;
 for(int i=0;i<10;i++)used+=snprintf(channels+used,sizeof(channels)-used,i?",%u":"%u",rc[i]);
 snprintf(out,capacity,"{\"ok\":true,\"kit\":\"ZEBJUS_FLIGHTCORE\",\"type\":\"rc_live\",\"deviceId\":\"%s\",\"controllerMs\":%lu,\"rcFrameCount\":%lu,\"rcSource\":\"%s\",\"rcAgeMs\":%lu,\"rc\":[%s],\"armed\":%s,\"flightReady\":%s,\"flightMode\":\"%s\",\"trainingSelection\":true,\"trainingActive\":%s,\"trainingTarget\":\"%s\",\"trainingController\":\"%s\",\"trainingInput\":\"%s\",\"trainingRunId\":%lu,\"trainingWebAppId\":\"%lu\",\"outputsBlocked\":%s,\"virtualArmed\":%s,\"controlRole\":\"%s\",\"receiverHealth\":\"%s\",\"roll\":%.3f,\"pitch\":%.3f,\"yaw\":%.3f,\"webRcFrameHz\":%lu,\"ppmFrameHz\":%lu,\"flightLoopHz\":%lu,\"observerTransport\":\"NDJSON1\"}",
 deviceId.c_str(),(unsigned long)now,(unsigned long)(src==RC_PPM?ppmFrames:webRcFrames),rcSourceName(src),(unsigned long)age,channels,effectiveArmed()?"true":"false",flightReady?"true":"false",flightModeName(flightMode),active?"true":"false",trainingTarget==1?"TRIPOD":trainingTarget==2?"FLIGHT":"NONE",trainingAppOwned?"APP":"WEB",trainingInput==2?"PPM":"APP",(unsigned long)trainingRunId,(unsigned long)trainingWebAppId,active?"true":"false",active&&src!=RC_NONE&&rc[4]>1500?"true":"false",ownerLive?(mobileReserved?"MOBILE":"WEB"):"",src!=RC_NONE?"OK":"STALE",kalmanRoll,kalmanPitch,flightYaw,(unsigned long)webRcFrameHz,(unsigned long)ppmFrameHz,(unsigned long)flightLoopHz);
}
#include "FlightRcMonitor.h"
String bootDiagnosticsJson(){return String(",\"boot\":{\"resetReasonCode\":")+String((int)esp_reset_reason())+",\"uptimeMs\":"+String(millis())+",\"freeHeapBytes\":"+String(ESP.getFreeHeap())+",\"rcMonitorRunning\":"+String(rcMonitorTaskHandle?"true":"false")+",\"rcMonitorFreeStackBytes\":"+(rcMonitorTaskHandle?String((unsigned)uxTaskGetStackHighWaterMark(rcMonitorTaskHandle)):String("null"))+"}";}

void acquireApi(){
 String id=server.arg("clientId");id.trim();if(!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Verify the exact Device ID before taking control");return;}if(id.length()<4){sendMessage(400,"Invalid session ID");return;}
 if(wifiTestState==WT_RUNNING||wifiTestState==WT_SUCCESS||restartAt){sendMessage(423,"Kit is changing Wi-Fi");return;}expireLock();String role=server.arg("clientRole");role=role=="MOBILE"?"MOBILE":"WEB";
 // A foreground mobile connection can reserve a disarmed, idle AP kit. Never steal armed / bench outputs.
 if(fcSetupActive&&controlOwner!=id){sendMessage(423,"FC setup owns this kit");return;}
 const bool webTransfer=role=="WEB"&&controlRole=="MOBILE"&&argBool("takeover")&&!trainingActive&&!rcUdpToken&&!effectiveArmed()&&benchMode==BENCH_NONE;
 if(controlOwner.length()&&controlOwner!=id&&!webTransfer&&!(role=="MOBILE"&&controlRole!="MOBILE"&&!effectiveArmed()&&benchMode==BENCH_NONE)){sendMessage(423,controlRole=="MOBILE"?"Mobile app owns this kit. Laptop is VIEW ONLY.":"Another session controls this kit. VIEW ONLY.");return;}
 if(controlOwner!=id){if(webTransfer&&trainingActive)finishTraining();invalidateRcUdp();webRcLastMs=0;forceDisarmRequested=false;setupAfterNeutral=true;armLowSeen=false;resetArmGesture();}
 const bool simulationUdp=trainingActive&&trainingAppOwned&&trainingInput==1&&trainingOwner==id&&role=="MOBILE"&&server.arg("rcTransport")=="UDP2";
 if(server.hasArg("simulationRunId")&&(!simulationUdp||server.arg("simulationRunId")!=String(trainingRunId))){sendMessage(409,"Simulator grant belongs to an expired run");return;}
 controlOwner=id;controlRole=role;mobileReserved=role=="MOBILE";controlExpiresAt=millis()+LOCK_TIMEOUT_MS;
 if(trainingActive&&!simulationUdp)invalidateRcUdp();
 if(role=="MOBILE"&&rcUdpTaskHandle&&(!trainingActive||simulationUdp)){portENTER_CRITICAL(&stateMux);if(!rcUdpToken||rcUdpSimulation!=simulationUdp){rcUdpToken=((uint64_t)esp_random()<<32)|esp_random();if(!rcUdpToken)rcUdpToken=1;rcUdpSequenceSeen=false;}rcUdpSimulation=simulationUdp;portEXIT_CRITICAL(&stateMux);}
 sendJson(200,"{\"ok\":true,\"deviceId\":\""+deviceId+"\",\"lockMine\":true,\"controlRole\":\""+role+"\",\"lockTimeoutMs\":"+String(LOCK_TIMEOUT_MS)+",\"rcTimeoutMs\":"+String(WEB_RC_STALE_MS)+",\"rcCenterMs\":"+String(RcLinkPolicy::CENTER_AFTER_MS)+",\"trainingRunId\":"+String(trainingRunId)+",\"simulationOutputsBlocked\":"+String(trainingActive?"true":"false")+",\"simulationRcTransport\":\""+String(trainingActive&&!simulationUdp?"HTTP":"UDP")+"\""+rcUdpGrantJson()+"}");
}
void lockPingApi(){if(!requireControl())return;controlExpiresAt=millis()+LOCK_TIMEOUT_MS;sendJson(200,"{\"ok\":true}");}
void releaseApi(){String id=server.arg("clientId");if(server.hasArg("expectedDeviceId")&&!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Device ID mismatch: release belongs to another kit");return;}if(lockMine(id)){invalidateRcUdp();if(activeRcSource==RC_WEB_AP||activeRcSource==RC_WEB_STA)forceDisarmRequested=true;armLowSeen=false;webRcLastMs=0;controlOwner="";controlRole="";mobileReserved=false;rcPreference=setupInput;controlExpiresAt=0;serviceFcSetup();serviceTraining();}sendJson(200,"{\"ok\":true}");}
int parseRcCsv(const String& csv,uint16_t out[10]){int n=0,start=0;while(n<10&&start<(int)csv.length()){int comma=csv.indexOf(',',start);String part=comma<0?csv.substring(start):csv.substring(start,comma);part.trim();if(!part.length()||part.length()>4)return -1;for(size_t k=0;k<part.length();k++)if(!isdigit((unsigned char)part[k]))return -1;long v=part.toInt();if(v<1000||v>2000)return -1;out[n++]=(uint16_t)v;if(comma<0)break;start=comma+1;if(start>=(int)csv.length())return -1;}if(n==10&&csv.indexOf(',',start)>=0)return -1;return n;}
void commandApi(){
  String type=server.arg("type");
  if(server.hasArg("expectedDeviceId")&&!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Device ID mismatch: this command belongs to another kit");return;}
  if(virtualTrainingCommand(type))return;
  if(trainingCommand(type))return;
  if(securePidCommand(type))return;
  if(trainingActive&&type!="rc_frame"&&type!="rc_source_set"&&type!="flight_stop"&&type!="ping"&&type!="pid_get"&&type!="receiver_read"&&type!="ppm_read"&&type!="bench_status"&&type!="pinmap_get"&&type!="snapshot_get"&&type!="diagnostics_get"&&type!="sensor_status"&&type!="flight_settings_get"&&type!="calibration_get"&&type!="attitude_read"){sendMessage(423,"End flight training before hardware configuration or bench output");return;}
  if(type=="flight_stop"){if(!requireControl())return;forceDisarmRequested=true;sendMessage(200,"Disarm requested");return;}
  if(type=="rc_source_set"){
    if(!requireControl())return;String source=server.arg("source");source.toUpperCase();uint8_t next=source=="AUTO"?0:source=="WEB"?1:source=="PPM"?2:255;
    if(next==255){sendMessage(400,"Choose AUTO, WEB or PPM");return;}
    auto candidate=RcPriority::choose(trainingActive,trainingActive?trainingInput:next,receiverFresh(),webRcFresh());RcSourceKind wanted=candidate==RcPriority::PPM?RC_PPM:candidate==RcPriority::NETWORK?(setupMode?RC_WEB_AP:RC_WEB_STA):RC_NONE;
    if(armed&&wanted!=activeRcSource){uint16_t old[10],incoming[10];copyActiveRc(old,activeRcSource);copyActiveRc(incoming,wanted);bool fresh=wanted==RC_PPM?receiverFresh():webRcFresh();
      if(!flightSettings.handover||fabsf(kalmanRoll)>45||fabsf(kalmanPitch)>45||!FlightMath::canHandover(old,incoming,fresh)){sendMessage(409,"Handover rejected: match sticks/throttle, ARM channel and fresh standby first");return;}}
    rcPreference=next;sendMessage(200,"RC preference accepted; flight task validates the transition");return;
  }
  if(fcSetupCommand(type))return;
  if(fcSetupActive&&type!="pid_get"&&type!="pid_set"&&type!="motor_stop"&&type!="pinmap_get"&&type!="receiver_read"&&type!="ppm_read"&&type!="bench_status"&&type!="flight_settings_get"&&type!="snapshot_get"&&type!="flight_settings_set"&&type!="ping"){sendMessage(423,"Finish FC setup before other hardware commands");return;}
  if(extendedFlightCommand(type))return;
  if(type=="ping"){sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"ping\",\"message\":\"PONG from "+jsonEscape(kitName)+" / "+deviceId+"\"}");return;}
  // Read-only commands intentionally work in View Only mode. They never alter motors, PID, calibration or RC state.
  if(type=="pid_get"){sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"pid_get\",\"pid\":"+pidJson()+"}");return;}
  if(type=="receiver_read"||type=="ppm_read"){uint16_t rc[10];RcSourceKind src=chooseRcSource();copyActiveRc(rc,src);String j="{\"ok\":true,\"type\":\"ack\",\"command\":\"receiver_read\",\"source\":\""+String(rcSourceName(src))+"\",\"ppmFresh\":"+String(receiverFresh()?"true":"false")+",\"channels\":[";for(int i=0;i<10;i++){if(i)j+=",";j+=String(rc[i]);}j+="],\"ppmFrameHz\":"+String(ppmFrameHz)+",\"webRcFrameHz\":"+String(webRcFrameHz)+",\"flightLoopHz\":"+String(flightLoopHz)+"}";sendJson(200,j);return;}
  if(type=="attitude_read"){uint32_t age=lastFlightSampleMs?(uint32_t)(millis()-lastFlightSampleMs):0xFFFFFFFFu;String j="{\"ok\":true,\"type\":\"ack\",\"command\":\"attitude_read\",\"source\":\"MPU6050_KALMAN\",\"flightReady\":"+String(flightReady?"true":"false")+",\"sampleMs\":"+String(lastFlightSampleMs)+",\"sampleAgeMs\":"+String(age)+",\"roll\":"+String(kalmanRoll,3)+",\"pitch\":"+String(kalmanPitch,3)+",\"yaw\":"+String(flightYaw,3)+",\"accRoll\":"+String(accAngleRoll,3)+",\"accPitch\":"+String(accAnglePitch,3)+",\"rateRoll\":"+String(rateRoll,3)+",\"ratePitch\":"+String(ratePitch,3)+",\"rateYaw\":"+String(rateYaw,3)+"}";sendJson(200,j);return;}
  if(type=="calibration_get"){sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"calibration_get\",\"calibration\":"+calibrationJson()+"}");return;}
  if(type=="pinmap_get"||type=="gps_read"||type=="matrix_read"||type=="gpio_read"||type=="i2c_read"||type=="led_read"){expansionReadCommand(type);return;}
  if(type=="bench_status"){sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"bench_status\",\"benchMode\":"+String((int)benchMode)+",\"motor\":"+String((int)benchMotor)+",\"pulse\":"+String((int)benchPulse)+"}");return;}

  // Everything below this line changes hardware state and requires the selected browser to own control.
  if(!requireControl())return;
  bool configMutation=type=="pid_set"||type=="pid_defaults"||type=="calibration_set"||type=="calibration_defaults"||type=="level_calibrate"||type=="calibrate_level"||type=="calibrate_gyro"||type=="motor_map_set"||type=="ppm_config"||type=="servo_config"||type=="gps_config"||type=="i2c_write"||type=="matrix_config"||type=="motor_test"||type=="motor_order_test"||type=="esc_calibrate";
  ConfigGuard configGuard;if(!configMutation&&configGuard.held)configurationBusy=false;
  if(configMutation&&!configGuard.held){sendMessage(423,"Disarm and stop bench outputs before configuration");return;}
  if(type=="ap_credentials"){
    sendJson(200,"{\"ok\":true,\"apSsid\":\""+jsonEscape(apName)+"\",\"apPassword\":\""+jsonEscape(apPassword)+"\",\"deviceId\":\""+deviceId+"\"}");return;
  }
  if(type=="network_mode_set"){
    if(server.arg("mode")!="AP"){sendMessage(400,"Choose AP mode from Settings");return;}
    if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Network mode change blocked while armed or bench outputs active");return;}
    if(setupMode){sendMessage(409,"AP mode is already active");return;}
    updateApName();setPreferredApMode(true);
    sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"network_mode_set\",\"apSsid\":\""+jsonEscape(apName)+"\",\"apPassword\":\""+jsonEscape(apPassword)+"\",\"deviceId\":\""+deviceId+"\",\"message\":\"Restarting in AP mode. Connect to this kit AP and open http://192.168.4.1/\"}");
    restartAt=millis()+900;return;
  }
  if(type=="led_set"){expansionWriteCommand(type);return;}
  if(type=="motor_map_set"||type=="ppm_config"||type=="servo_config"||type=="servo_write"||type=="gps_config"||type=="gpio_write"||type=="gpio_release"||type=="matrix_config"||type=="matrix_write"||type=="i2c_write"){expansionWriteCommand(type);return;}
  if(type=="pid_set"){
    if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"PID write is not available on this board profile.");return;}if(effectiveArmed()){sendMessage(423,"PID edit blocked while armed. Land, disarm, then tune.");return;}if(benchMode!=BENCH_NONE){sendMessage(423,"PID edit blocked during bench motor/ESC operation.");return;}
    FlightPidSettings next=flightPid;readPidArgs(next);if(!pidConfigValid(next)){sendMessage(400,"PID values outside guarded limits. Rate P 0-8, I 0-50, D 0-0.2; outer angle P/I 0-10, D 0-0.5.");return;}flightPid=next;resetFlightPid();savePidSettings();sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"pid_set\",\"saved\":true,\"pid\":"+pidJson()+",\"message\":\"PID saved to FlightCore NVS\"}");return;
  }
  if(type=="pid_defaults"){if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"PID restore unavailable on this board profile.");return;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"PID restore blocked while armed or during bench output.");return;}setPidDefaults();savePidSettings();resetFlightPid();sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"pid_defaults\",\"pid\":"+pidJson()+"}");return;}
  if(type=="calibration_set"){
    if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"Persistent flight calibration is unavailable on this board profile.");return;}if(effectiveArmed()){sendMessage(423,"Calibration edit blocked while armed.");return;}if(benchMode!=BENCH_NONE){sendMessage(423,"Calibration edit blocked during bench output.");return;}
    float axo=argFloat("accelOffsetX",accelOffsetX),ayo=argFloat("accelOffsetY",accelOffsetY),azo=argFloat("accelOffsetZ",accelOffsetZ),rt=argFloat("levelTrimRoll",levelTrimRoll),pt=argFloat("levelTrimPitch",levelTrimPitch);if(!calibrationValid(axo,ayo,azo,rt,pt)){sendMessage(400,"Calibration outside guarded limits: accel offsets +/-0.5 g, level trim +/-10 deg.");return;}accelOffsetX=axo;accelOffsetY=ayo;accelOffsetZ=azo;levelTrimRoll=rt;levelTrimPitch=pt;saveCalibrationSettings();kalmanRollUnc=kalmanPitchUnc=4;resetFlightPid();sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"calibration_set\",\"saved\":true,\"calibration\":"+calibrationJson()+",\"message\":\"Level calibration saved to FlightCore NVS\"}");return;
  }
  if(type=="calibration_defaults"){if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"Calibration restore unavailable on this board profile.");return;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Calibration restore blocked while armed or during bench output.");return;}setCalibrationDefaults();saveCalibrationSettings();kalmanRollUnc=kalmanPitchUnc=4;sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"calibration_defaults\",\"calibration\":"+calibrationJson()+"}");return;}
  if(type=="level_calibrate"||type=="calibrate_level"){
    if(!FLIGHT_CONTROL_ENABLED||detectedImu!=IMU_MPU6050){sendMessage(403,"MPU6050 flight profile required");return;}
    float sum[3]={},square[3]={},g[3]={};int good=0;
    for(int i=0;i<120;i++){float r,p,y,x,a,z;if(readMpuFlight(r,p,y,x,a,z)){float raw[3]={lastImu.rawAx/4096.0f,lastImu.rawAy/4096.0f,lastImu.rawAz/4096.0f};for(int k=0;k<3;k++){sum[k]+=raw[k];square[k]+=raw[k]*raw[k];}g[0]+=r;g[1]+=p;g[2]+=y;good++;}delay(4);}
    if(good<108){sendMessage(500,"Unstable IMU reads");return;}float noise=0;for(int k=0;k<3;k++){sum[k]/=good;noise+=fmaxf(0,square[k]/good-sum[k]*sum[k]);}
    float bx=sum[0],by=sum[1],bz=sum[2];FlightMath::orient(bx,by,bz,flightSettings.orientation);
    if(sqrtf(noise)>.035f||fabsf(bx)>.2f||fabsf(by)>.2f||bz<.75f||bz>1.25f){sendMessage(400,"Place the frame level and still with its top facing up");return;}
    float ex=0,ey=0,ez=1; // inverse mounting: transpose by probing the orthonormal basis
    float x0=1,y0=0,z0=0,x1=0,y1=1,z1=0,x2=0,y2=0,z2=1;FlightMath::orient(x0,y0,z0,flightSettings.orientation);FlightMath::orient(x1,y1,z1,flightSettings.orientation);FlightMath::orient(x2,y2,z2,flightSettings.orientation);ex=z0;ey=z1;ez=z2;
    accelOffsetX=ex/accelScaleX-sum[0];accelOffsetY=ey/accelScaleY-sum[1];accelOffsetZ=ez/accelScaleZ-sum[2];gyroBiasRoll=g[0]/good;gyroBiasPitch=g[1]/good;gyroBiasYaw=g[2]/good;saveCalibrationSettings();kalmanRoll=levelTrimRoll;kalmanPitch=levelTrimPitch;resetFlightPid();rateFilterPrimed=false;sendJson(200,"{\"ok\":true,\"calibration\":"+calibrationJson()+"}");return;
  }
  if(type=="calibrate_gyro"){
    if(effectiveArmed()){sendMessage(423,"Gyro calibration blocked while armed.");return;}if(benchMode!=BENCH_NONE){sendMessage(423,"Gyro calibration blocked during bench output.");return;}setupFlightCore();if(flightReady)sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"calibrate_gyro\",\"calibration\":"+calibrationJson()+",\"message\":\"Gyro calibrated\"}");else sendMessage(500,"Gyro calibration failed. Keep frame level/still and check MPU6050.");return;
  }
  if(type=="motor_stop"){benchStop();sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"motor_stop\"}");return;}
  if(type=="motor_test"){
    if(!FLIGHT_CONTROL_ENABLED||!escPwmReady){sendMessage(403,"Motor outputs unavailable on this board profile.");return;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Motor test blocked while armed or another bench test is running.");return;}if(!propsRemovedConfirmed()){sendMessage(412,"Motor test requires confirm=PROPS_REMOVED.");return;}int motor=constrain(server.arg("motor").toInt(),1,4),pulse=constrain(server.arg("pulse").toInt(),1050,1300),duration=constrain(server.arg("durationMs").toInt(),100,3000);benchMode=BENCH_MOTOR;benchMotor=motor;benchPulse=pulse;benchUntilMs=millis()+duration;directMotorPulse(motor-1,pulse);sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"motor_test\",\"motor\":"+String(motor)+",\"pulse\":"+String(pulse)+",\"durationMs\":"+String(duration)+"}");return;
  }
  if(type=="motor_order_test"){
    if(!FLIGHT_CONTROL_ENABLED||!escPwmReady){sendMessage(403,"Motor outputs unavailable on this board profile.");return;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Motor order test blocked while armed or another bench test is running.");return;}if(!propsRemovedConfirmed()){sendMessage(412,"Motor order test requires confirm=PROPS_REMOVED.");return;}benchMode=BENCH_MOTOR_SEQUENCE;benchSequenceMotor=1;benchStageUntilMs=millis()+700;directMotorPulse(0,1200);sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"motor_order_test\",\"message\":\"M1-M4 sequence started\"}");return;
  }
  if(type=="esc_calibrate"){
    if(!FLIGHT_CONTROL_ENABLED||!escPwmReady){sendMessage(403,"ESC outputs unavailable on this board profile.");return;}if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"ESC calibration blocked while armed or another bench test is running.");return;}if(!propsRemovedConfirmed()){sendMessage(412,"ESC calibration requires confirm=PROPS_REMOVED.");return;}benchMode=BENCH_ESC_CAL;benchEscStage=0;benchStageUntilMs=millis()+3000;allMotorPulse(2000);sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"esc_calibrate\",\"message\":\"ESC calibration started: 3 s high, then 3 s low\"}");return;
  }
  if(type=="rc_frame"){
    if(server.hasArg("simulationRunId")&&(!trainingActive||server.arg("simulationRunId")!=String(trainingRunId))){sendMessage(409,"RC frame belongs to an expired simulator run");return;}
    if(!ALLOW_WEB_RC||(!FLIGHT_CONTROL_ENABLED&&!trainingActive)){sendMessage(403,"Real web/AP RC is not enabled on this board profile.");return;}if(fcSetupActive||benchMode!=BENCH_NONE){sendMessage(423,"RC blocked during FC setup / bench operation.");return;}
    uint16_t next[10]={1500,1500,1000,1500,1000,1000,1000,1000,1500,1000};int count=parseRcCsv(server.arg("channels"),next);if(count<6){sendMessage(400,"rc_frame requires at least CH1..CH6");return;}
    bool safe=next[0]==1500&&next[1]==1500&&next[2]==1000&&next[3]==1500&&next[4]==1000;
    portENTER_CRITICAL(&stateMux);if(rcUdpToken&&!safe){portEXIT_CRITICAL(&stateMux);sendMessage(423,"Native UDP stream owns RC; stop it before HTTP control");return;}if(safe){rcUdpToken=0;rcUdpSequenceSeen=false;rcUdpSimulation=false;}for(int i=0;i<10;i++)webRcCh[i]=next[i];webRcLastMs=millis();webRcFrames++;if(trainingActive&&trainingAppOwned&&trainingInput==1)trainingExpires=webRcLastMs+10000;portEXIT_CRITICAL(&stateMux);RcSourceKind chosen=chooseRcSource();sendJson(200,"{\"ok\":true,\"type\":\"ack\",\"command\":\"rc_frame\",\"activeSource\":\""+String(rcSourceName(chosen))+"\",\"deviceId\":\""+deviceId+"\",\"armed\":"+String(armed?"true":"false")+",\"virtualArmed\":"+String(trainingActive&&next[4]>1500?"true":"false")+",\"outputsBlocked\":"+String(trainingActive?"true":"false")+",\"trainingRunId\":"+String(trainingRunId)+",\"flightReady\":"+String(flightReady?"true":"false")+",\"lastDisarmReason\":\""+jsonEscape(lastDisarmReason)+"\",\"message\":\"RC frame accepted\"}");return;
  }
  sendMessage(400,"Unknown command: "+type);
}
void renameApi(){
  if(!requireControl())return;if(effectiveArmed()){sendMessage(423,"Rename blocked while armed");return;}String requested=normalizeDisplayName(server.arg("name"));if(requested.length()<3){sendMessage(400,"Kit Name must be at least 3 characters");return;}
  String old=kitName;if(hostFromName(requested)==hostFromName(old)){saveKitName(requested);startKitMdns();sendJson(200,"{\"ok\":true,\"status\":"+statusJson(server.arg("clientId"))+"}");return;}
  if(!startProbeMdns()){startKitMdns();sendMessage(500,"Could not check Kit Name on this Wi-Fi");return;}
  bool conflict=nameExistsOnNetwork(requested);if(conflict){saveKitName(old);startKitMdns();sendMessage(409,"That Kit Name is already in use on this Wi-Fi. Choose another name.");return;}
  saveKitName(requested);startKitMdns();sendJson(200,"{\"ok\":true,\"status\":"+statusJson(server.arg("clientId"))+"}");
}

void savedWifiApi(){
  String current=WiFi.status()==WL_CONNECTED?WiFi.SSID():"";String j="{\"ok\":true,\"profiles\":[";bool first=true;
  for(int i=0;i<MAX_WIFI;i++){if(!savedSSID[i].length())continue;if(!first)j+=",";first=false;j+="{\"ssid\":\""+jsonEscape(savedSSID[i])+"\",\"current\":"+String(savedSSID[i]==current?"true":"false")+",\"preferred\":"+String(savedSSID[i]==preferredSSID?"true":"false")+",\"passwordSaved\":"+String(savedPASS[i].length()?"true":"false")+"}";}
  j+="]}";sendJson(200,j);
}
void setWifiApi(){
  if((!setupMode||lockActive())&&!requireControl())return;if(effectiveArmed()||benchMode!=BENCH_NONE||trainingActive||fcSetupActive){sendMessage(423,"Disarm and stop simulator / setup before saving Wi-Fi");return;}
  String ssid=server.arg("ssid"),pass=server.arg("password");ssid.trim();if(!ssid.length()||ssid.length()>32||pass.length()>63){sendMessage(400,"SSID must be 1-32 bytes; password at most 63 bytes");return;}
  if(!saveWiFi(ssid,pass,true)){sendMessage(500,"Wi-Fi could not be saved. Retry before changing networks.");return;}
  String name=normalizeDisplayName(server.arg("name"));if(name.length()>=3)saveKitName(name);setPreferredApMode(false);setForceSetupFlag(false);invalidateRcUdp();webRcLastMs=0;disarmFlight("Wi-Fi saved; reconnect pending");
  // Keep the AP channel and TCP socket intact until the encrypted saved ACK is sent.
  // Reboot connects the verified NVS profile; an unreachable router falls back to AP.
  restartAt=millis()+2500;wifiTestState=WT_SUCCESS;testSSID=ssid;testMessage="Wi-Fi saved. Restarting to connect; if unavailable, reconnect to the kit AP.";
  sendJson(200,"{\"ok\":true,\"profileSaved\":true,\"status\":\"saved\",\"ssid\":\""+jsonEscape(ssid)+"\",\"name\":\""+jsonEscape(kitName)+"\",\"restartInMs\":2500,\"connectionVerified\":false,\"message\":\""+testMessage+"\"}");
}
void useWifiApi(){
  if(!requireControl())return;if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Wi-Fi change blocked while armed or bench outputs active");return;}String ssid=server.arg("ssid");if(savedIndex(ssid)<0){sendMessage(404,"Saved Wi-Fi profile not found");return;}if(!setPreferredWiFi(ssid)){sendMessage(500,"Preferred Wi-Fi could not be saved");return;}setPreferredApMode(false);setForceSetupFlag(false);sendMessage(200,"Preferred Wi-Fi selected. Kit will restart.");restartAt=millis()+900;
}
void forgetWifiApi(){
  if(!requireControl())return;if(effectiveArmed()){sendMessage(423,"Wi-Fi change blocked while armed");return;}String ssid=server.arg("ssid");if(savedIndex(ssid)<0){sendMessage(404,"Saved Wi-Fi profile not found");return;}forgetSavedWiFi(ssid);sendMessage(200,"Saved Wi-Fi profile removed");
}
void resetNameApi(){
  if(!requireControl())return;if(effectiveArmed()){sendMessage(423,"Auto-name reset blocked while armed");return;}
  clearKitName();
  sendMessage(200,"Auto name reset. Kit will restart and choose the first free zebjus_drone_N name on this Wi-Fi.");
  restartAt=millis()+900;
}

// ============================================================
// Local AP setup
// ============================================================



void noPortal(){cors();server.sendHeader("Cache-Control","no-store");server.send(204);}
#include "WIFI_SETUP_PAGE.h"
void wifiSetupPage(){if(!setupMode){noPortal();return;}server.sendHeader("Cache-Control","no-store");server.send_P(200,"text/html",WIFI_SETUP_PAGE);}
void wifiScanApi(){
 if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,"Disarm before Wi-Fi scan");return;}
 if(lockActive()&&!lockMine(server.arg("clientId"))){sendMessage(423,"View-only session cannot scan / change kit radio");return;}
 if(wifiTestState==WT_RUNNING||wifiTestState==WT_SUCCESS){sendMessage(423,"Wait for Wi-Fi test");return;}
 static bool scanActive=false;int n=WiFi.scanComplete();
 if(!scanActive){if(setupMode){WiFi.setAutoReconnect(false);WiFi.mode(WIFI_AP_STA);}WiFi.scanDelete();WiFi.scanNetworks(true);scanActive=true;sendJson(202,"{\"ok\":true,\"scanning\":true,\"networks\":[]}");return;}
 if(n==WIFI_SCAN_RUNNING){sendJson(202,"{\"ok\":true,\"scanning\":true,\"networks\":[]}");return;}
 if(n<0){scanActive=false;sendMessage(503,"Wi-Fi scan failed");return;}
 String j="{\"ok\":true,\"scanning\":false,\"networks\":[";bool first=true;
 for(int i=0;i<n;i++){String ssid=WiFi.SSID(i);if(!ssid.length())continue;if(!first)j+=",";first=false;j+="{\"ssid\":\""+jsonEscape(ssid)+"\",\"rssi\":"+String(WiFi.RSSI(i))+",\"secure\":"+String(WiFi.encryptionType(i)!=WIFI_AUTH_OPEN?"true":"false")+"}";}
 // Leave the unassociated STA scan interface enabled until reboot. Toggling
 // it off here can disconnect Android's local-only AP connection after a scan.
 j+="]}";WiFi.scanDelete();scanActive=false;sendJson(200,j);
}
void startWifiTestApi(){
  // Compatibility route: saving never depends on a live STA test or status polling.
  setWifiApi();
}
void wifiTestStatusApi(){
  String st=wifiTestState==WT_RUNNING?"testing":wifiTestState==WT_SUCCESS?"success":wifiTestState==WT_FAILED?"failed":"idle";
  String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():"";uint32_t remaining=restartAt&&(long)(restartAt-millis())>0?restartAt-millis():0;
  String j="{\"ok\":true,\"status\":\""+st+"\",\"ssid\":\""+jsonEscape(testSSID)+"\",\"name\":\""+jsonEscape(kitName)+"\",\"deviceId\":\""+deviceId+"\",\"staIp\":\""+ip+"\",\"restartInMs\":"+String(remaining)+",\"message\":\""+jsonEscape(testMessage)+"\",\"redirect\":\""+jsonEscape(testRedirect)+"\"}";sendJson(200,j);
}
void processWifiTest(){
  if(wifiTestState!=WT_RUNNING)return;
  if(WiFi.status()==WL_CONNECTED){
    Serial.println("Wi-Fi test connected: "+WiFi.localIP().toString());
    bool probe=startProbeMdns();int count=0;bool conflict=false;
    if(probe){delay(180);count=MDNS.queryService("zebjus-drone","tcp");for(int i=0;i<count;i++)if(queryResultIsName(i,testName,true)){conflict=true;break;}}
    if(!testName.length()||conflict)testName=probe?chooseFreeAutoNameFromCurrentQuery(count):defaultKitName();
    if(mdnsStarted){MDNS.end();mdnsStarted=false;}
    if(!saveWiFi(testSSID,testPASS,true)){wifiTestState=WT_FAILED;testMessage="Connected, but Wi-Fi could not be saved. Retry.";WiFi.disconnect(false,false);WiFi.mode(WIFI_AP);return;}
    saveKitName(testName);autoNameRequired=false;setPreferredApMode(false);setForceSetupFlag(false);testRedirect=optionalWebappUrl();testMessage=probe?"Wi-Fi verified and saved. Restarting in STA mode.":"Wi-Fi saved. mDNS unavailable; use the STA IP. Restarting.";wifiTestState=WT_SUCCESS;restartAt=millis()+7500;testPASS="";Serial.println("Setup verified. Saved Kit Name: "+kitName);return;
  }
  if(millis()-wifiTestStarted>CONNECT_TIMEOUT_MS){wifiTestState=WT_FAILED;testMessage="Could not connect. Check password and signal.";WiFi.disconnect(false,false);WiFi.mode(WIFI_AP);}
}

bool allowDisruptiveAdminAction(const char* action){
  if(effectiveArmed()||benchMode!=BENCH_NONE){sendMessage(423,String(action)+" blocked while armed or bench outputs active");return false;}
  if(setupMode&&!lockActive())return true;
  if(!requireControl())return false;
  return true;
}
void resetWifiApi(){if(!allowDisruptiveAdminAction("Wi-Fi reset"))return;clearSavedWiFi();sendMessage(200,"Saved Wi-Fi cleared; restarting in setup mode");setForceSetupFlag(true);restartAt=millis()+700;}
void returnToSavedWifiApi(){
  if(!setupMode){sendMessage(409,"Kit is already on saved Wi-Fi");return;}
  if(!allowDisruptiveAdminAction("Wi-Fi mode change"))return;
  if(wifiTestState==WT_RUNNING||wifiTestState==WT_SUCCESS){sendMessage(423,"Wait for Wi-Fi setup to finish");return;}
  bool hasSaved=false;for(int i=0;i<MAX_WIFI;i++)if(savedSSID[i].length()){hasSaved=true;break;}
  if(!hasSaved){sendMessage(409,"No saved Wi-Fi profile. Save and test a network first.");return;}
  setPreferredApMode(false);setForceSetupFlag(false);
  sendMessage(200,"Trying saved Wi-Fi after restart. If it is unavailable, AP returns automatically.");restartAt=millis()+900;
}
void factoryResetApi(){if(!allowDisruptiveAdminAction("Factory reset"))return;factoryResetAll();setForceSetupFlag(true);sendMessage(200,"Factory reset scheduled");restartAt=millis()+700;}

// ============================================================
// Firmware update / reboot
// ============================================================
void firmwareInfoApi(){
  String j="{\"ok\":true,\"product\":\"ZEBJUS_FLIGHTCORE\",\"firmware\":\""+String(FW_VERSION)+"\",\"firmwareBuiltAt\":\""+String(FW_BUILD_DATE)+" "+String(FW_BUILD_TIME)+" UTC\",\"boardId\":\""+String(BOARD_ID)+"\",\"boardName\":\""+String(BOARD_NAME)+"\",\"flashBytes\":"+String(ESP.getFlashChipSize())+",\"freeSketchBytes\":"+String(ESP.getFreeSketchSpace())+",\"partitionLayout\":\""+String(secureLayoutReady()?"ZFC_DUAL_1E0000":"LEGACY")+"\",\"migrationRequired\":"+String(secureLayoutReady()?"false":"true")+",\"otaSlotBytes\":"+String(esp_ota_get_next_update_partition(nullptr)?esp_ota_get_next_update_partition(nullptr)->size:0)+",\"secureProtocol\":\"ZFC3\",\"ota\":"+String(secureLayoutReady()?"true":"false")+",\"firmwareRole\":\""+String(FLIGHT_CONTROL_ENABLED?"RATE_ANGLE_FLIGHT_CORE":"WIFI_SENSOR_BRIDGE")+"\",\"flightCoreIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"flightReady\":"+String(flightReady?"true":"false")+",\"escOutputs\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"pidIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"pidWritable\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"calibrationIntegrated\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"webRc\":"+String((ALLOW_WEB_RC&&FLIGHT_CONTROL_ENABLED)?"true":"false")+",\"ppmRc\":true,\"i2cScan\":true,\"imuRead\":true,\"imuModel\":\""+String(imuName(detectedImu))+"\",\"i2cSda\":"+String(I2C_SDA_PIN)+",\"i2cScl\":"+String(I2C_SCL_PIN)+",\"armed\":"+String(effectiveArmed()?"true":"false")+"}";sendJson(200,j);
}
void rebootApi(){
  if(!requireControl())return;if(effectiveArmed()){sendMessage(423,"Reboot blocked while armed");return;}sendMessage(200,"Reboot scheduled");restartAt=millis()+850;
}
void firmwareUploadDone(){
  if(!firmwareUploadActive){sendMessage(400,"No firmware upload was started");return;}
  if(!firmwareUploadSuccess){String m=firmwareUploadError.length()?firmwareUploadError:"Firmware update failed";firmwareUploadActive=false;sendMessage(500,m);return;}
  String j="{\"ok\":true,\"message\":\"Firmware written successfully; rebooting\",\"bytes\":"+String(firmwareUploadBytes)+",\"file\":\""+jsonEscape(firmwareUploadName)+"\",\"rebooting\":true}";sendJson(200,j);firmwareUploadActive=false;restartAt=millis()+1100;
}
void firmwareUploadHandler(){
  HTTPUpload& upload=server.upload();
  if(upload.status==UPLOAD_FILE_START){
    firmwareUploadActive=true;firmwareUploadSuccess=false;firmwareUploadError="";firmwareUploadName=upload.filename;firmwareUploadBytes=0;
    if(effectiveArmed()||benchMode!=BENCH_NONE){firmwareUploadError="Firmware update blocked while armed or bench outputs active";return;}
    if(server.hasArg("expectedDeviceId")&&!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){firmwareUploadError="Firmware Device ID mismatch";return;}
    String targetBoard=server.arg("boardId");targetBoard.trim();if(targetBoard.length()&&targetBoard!=String(BOARD_ID)){firmwareUploadError="Firmware board profile mismatch";return;}
    if(!controlAuthorized()){firmwareUploadError=lockActive()?"Another browser controls this kit":"Take Control before firmware update";return;}
    if(!Update.begin(UPDATE_SIZE_UNKNOWN,U_FLASH)){firmwareUploadError=String("Update begin failed: ")+Update.errorString();return;}
    Serial.println("Firmware upload started: "+firmwareUploadName);
  }else if(upload.status==UPLOAD_FILE_WRITE){
    if(firmwareUploadError.length())return;
    if(firmwareUploadBytes==0){
      // ESP image header: magic at 0, little-endian chip ID at 12. OTA accepts APP only.
      const uint16_t expectedChip=FLIGHT_CONTROL_ENABLED?13:5;
      if(upload.currentSize<24||upload.buf[0]!=0xE9||uint16_t(upload.buf[12]|(uint16_t(upload.buf[13])<<8))!=expectedChip){firmwareUploadError="Wrong or invalid application image for this controller profile";Update.abort();return;}
    }
    size_t written=Update.write(upload.buf,upload.currentSize);firmwareUploadBytes+=written;
    if(written!=upload.currentSize)firmwareUploadError=String("Flash write failed: ")+Update.errorString();
  }else if(upload.status==UPLOAD_FILE_END){
    if(firmwareUploadError.length()){Update.abort();return;}
    if(!Update.end(true)){firmwareUploadError=String("Firmware finalize failed: ")+Update.errorString();return;}
    firmwareUploadSuccess=true;Serial.printf("Firmware upload complete: %u bytes\n",(unsigned)firmwareUploadBytes);
  }else if(upload.status==UPLOAD_FILE_ABORTED){
    Update.abort();firmwareUploadError="Firmware upload aborted";Serial.println("Firmware upload aborted");
  }
}

// ============================================================
// Routes / modes
// ============================================================
#include "FlightSecurity.h"
void setupRoutes(){
  const char* headers[]={"X-Zebjus-Control","User-Agent"};server.collectHeaders(headers,2);
  server.on("/",HTTP_GET,wifiSetupPage);server.on("/setup",HTTP_GET,wifiSetupPage);
  server.on("/api/status",HTTP_GET,secureDiscovery);
  server.on("/api/security/hello",HTTP_POST,pairingHello);
  server.on("/api/security/proof",HTTP_POST,pairingProof);
  server.on("/api/security/request",HTTP_POST,secureRequest);
  server.on("/api/firmware/info",HTTP_GET,firmwareInfoApi);
  // Captive portal probes
  server.on("/generate_204",HTTP_GET,noPortal);server.on("/gen_204",HTTP_GET,noPortal);server.on("/hotspot-detect.html",HTTP_GET,noPortal);server.on("/library/test/success.html",HTTP_GET,noPortal);server.on("/connecttest.txt",HTTP_GET,noPortal);server.on("/ncsi.txt",HTTP_GET,noPortal);server.on("/fwlink",HTTP_GET,noPortal);server.on("/redirect",HTTP_GET,noPortal);server.on("/canonical.html",HTTP_GET,noPortal);server.on("/success.txt",HTTP_GET,noPortal);
  server.onNotFound([](){if(server.method()==HTTP_OPTIONS){cors();server.send(204);return;}sendMessage(404,"Not found");});
}
void startNormalServer(){
  setupMode=false;WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.setSleep(false);ensureUniqueKitName();server.begin();startRcUdp();startRcMonitor();wifiLostAt=0;
  Serial.println("==============================");Serial.println("ZEBJUS FlightCore V18.3.83 LOCAL MODE");Serial.println("Controller: "+String(BOARD_NAME)+" ["+String(BOARD_ID)+"]");Serial.println("Device ID: "+deviceId);Serial.println("Kit Name : "+kitName);Serial.println("SSID     : "+WiFi.SSID());Serial.println("IP       : "+WiFi.localIP().toString());Serial.println("mDNS     : http://"+hostFromName(kitName)+".local");
}
void startSetupMode(){
  invalidateRcUdp();setupMode=true;wifiFallbackAt=millis();controlOwner="";controlRole="";mobileReserved=false;rcPreference=setupInput;controlExpiresAt=0;serviceFcSetup();serviceTraining();if(mdnsStarted){MDNS.end();mdnsStarted=false;}WiFi.setAutoReconnect(false);WiFi.disconnect(false,false);delay(120);WiFi.mode(WIFI_AP);WiFi.setSleep(false);updateApName();WiFi.softAPConfig(AP_IP,AP_GATEWAY,AP_SUBNET);bool ok=WiFi.softAP(apName.c_str(),apPassword.c_str());server.begin();startRcUdp();startRcMonitor();wifiTestState=WT_IDLE;
  Serial.println("==============================");Serial.println("ZEBJUS FlightCore SETUP MODE");Serial.println("AP Status: "+String(ok?"STARTED":"FAILED"));Serial.println("SSID     : "+apName);Serial.println("Password : "+apPassword);Serial.println("Write the AP SSID and password on the kit case before closing it.");Serial.println("Setup    : http://192.168.4.1");Serial.println("Controller: "+String(BOARD_NAME)+" ["+String(BOARD_ID)+"]");Serial.println("Device ID: "+deviceId);Serial.println("Kit Name : "+kitName);
}

// ============================================================
// Recovery / runtime
// ============================================================
void checkRecoveryButton(){
  if(RECOVERY_BUTTON_PIN<0)return;if(effectiveArmed()||benchMode!=BENCH_NONE){recoveryPressedAt=0;return;}int state=digitalRead(RECOVERY_BUTTON_PIN);
  if(state==LOW){if(!recoveryPressedAt)recoveryPressedAt=millis();unsigned long held=millis()-recoveryPressedAt;if(held>=FACTORY_RESET_HOLD_MS&&!factoryResetTriggered){factoryResetTriggered=true;Serial.println("BOOT 10s -> FACTORY RESET");factoryResetAll();setForceSetupFlag(true);delay(150);ESP.restart();}}
  else if(recoveryPressedAt){unsigned long held=millis()-recoveryPressedAt;recoveryPressedAt=0;if(!factoryResetTriggered&&held>=FORCE_AP_HOLD_MS){Serial.println("BOOT 5s release -> SELECT AP MODE");setPreferredApMode(true);setForceSetupFlag(true);delay(120);ESP.restart();}factoryResetTriggered=false;}
}
void networkHealth(){
  if(setupMode){
    // Recovery AP stays stable while any phone/computer or control session uses
    // it. Explicit AP mode never retries STA behind the user's back.
    if(!wifiFallbackAp||restartAt)return;
    if(WiFi.softAPgetStationNum()||lockActive()||effectiveArmed()||benchMode!=BENCH_NONE||fcSetupActive||trainingActive||firmwareUploadActive){wifiFallbackAt=millis();return;}
    if(millis()-wifiFallbackAt>=WIFI_RECOVERY_RETRY_MS){Serial.println("Recovery AP idle -> retry saved router Wi-Fi");restartAt=millis()+250;}
    return;
  }
  if(WiFi.status()==WL_CONNECTED){wifiLostAt=0;return;}if(effectiveArmed())return;if(!wifiLostAt)wifiLostAt=millis();if(millis()-wifiLostAt>WIFI_LOST_TO_SETUP_MS){Serial.println("Wi-Fi unavailable -> setup AP recovery");setForceSetupFlag(true);delay(100);ESP.restart();}
}

void setup(){
  if(USER_LED_PIN>=0){pinMode(USER_LED_PIN,OUTPUT);digitalWrite(USER_LED_PIN,HIGH);}
  Serial.begin(115200);delay(300);Serial.printf("Boot: reset reason %u, free heap %u bytes\n",(unsigned)esp_reset_reason(),(unsigned)ESP.getFreeHeap());WiFi.persistent(false);WiFi.setAutoReconnect(false);WiFi.onEvent([](WiFiEvent_t,WiFiEventInfo_t info){wifiDisconnectReason=info.wifi_sta_disconnected.reason;},ARDUINO_EVENT_WIFI_STA_DISCONNECTED);if(RECOVERY_BUTTON_PIN>=0)pinMode(RECOVERY_BUTTON_PIN,INPUT_PULLUP);loadExpansionSettings();if(ENABLE_PPM_RECEIVER&&ppmReceiverPin>=0){pinMode(ppmReceiverPin,ppmEdgeFalling?INPUT_PULLDOWN:INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(ppmReceiverPin),ppmIsr,ppmEdgeFalling?FALLING:RISING);}
  busMutex=xSemaphoreCreateRecursiveMutex();deviceId=getDeviceId();loadFlightSettings();loadFcSetup();loadKitName();updateApName();loadApPassword();loadSavedWiFi();loadPidSettings();startPidSaveWorker();loadCalibrationSettings();initPairing();probeImuAtBoot();setupFlightCore();flightHeartbeatUs=micros();if(FLIGHT_CONTROL_ENABLED&&xTaskCreate(flightOutputSupervisor,"fc-output-guard",3072,nullptr,21,nullptr)!=pdPASS){flightReady=false;motorsSafe();Serial.println("Output supervisor unavailable: arming disabled");}setupExpansionPeripherals();setupRoutes();startFlightTask();
  Serial.println("\n==============================\nZEBJUS FlightCore V18.3.83 LOCAL Wi-Fi + I2C\nBoard: "+String(BOARD_NAME)+" ["+String(BOARD_ID)+"]\nID: "+deviceId+"\n==============================");
  bool forceApOnce=consumeForceSetupFlag(),explicitAp=preferredApMode(),anySaved=false;for(int i=0;i<MAX_WIFI;i++)if(savedSSID[i].length())anySaved=true;wifiFallbackAp=!explicitAp&&anySaved;
  // AP-only: both the Android controller and the browser join this kit.
  // Ignore an old router preference left by earlier firmware versions.
  (void)forceApOnce;(void)explicitAp;wifiFallbackAp=false;startSetupMode();
}
void loop(){
  serviceSecureOta();servicePairing();serviceUserLed();pollGps();server.handleClient();updateControlRates();serviceBattery();expireLock();if(!FLIGHT_CONTROL_ENABLED)serviceTraining();processWifiTest();checkRecoveryButton();networkHealth();
  if(restartAt&&(long)(millis()-restartAt)>=0){motorsSafe();ESP.restart();}
  delay(1);
}
