#pragma once
// FlightCore AP/STA laboratory transport: no motor outputs or flight arming.
// Native Android or an explicitly trusted local client accesses authenticated HTTP.
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>
#include <ESPmDNS.h>
#include <esp_app_desc.h>

static WebServer zjHttp(80);
static Preferences zjPrefs;
static String zjNetKey,zjApSsid,zjApPass,zjSavedSsid,zjSavedPass,zjMode="auto",zjPhase="boot",zjPendingSsid,zjPendingPass;
static uint32_t zjNetAttempt=0,zjNetNextRetry=0,zjOtaRebootAt=0,zjLastScanSeq=0;
static bool zjNetTesting=false,zjOtaAuthorized=false,zjOtaComplete=false,zjOtaFailed=false;
static volatile uint8_t zjStaDisconnectReason=0,zjLastStaFailureReason=0;
static volatile uint32_t zjAssociationEpoch=0;static uint32_t zjTestAssociationEpoch=0;
static const uint32_t ZJ_NET_TEST_TIMEOUT_MS=20000;
static String zjWifiTestState="idle";
static bool zjPreviousScanActive=false,zjMdnsReady=false,zjUsbScanning=false;
static int zjUsbScanIndex=0,zjUsbScanCount=0;
static uint32_t zjTestConnectedAt=0;
static bool zjNameChecked=false;
static int zjWifiAttemptIndex=0;
static String zjAdvertisedName;
static uint32_t zjNameVerifyAt=0;
static bool zjNameVerified=false;
static volatile bool zjApStarted=false;
// Kit AP router setup is available to AP-local signed sessions; RC and OTA remain separate.


// Escapes all user-provided Wi-Fi identifiers before emitting JSON.
static String zjJson(const String& src){
 String out="\"";for(size_t i=0;i<src.length()&&i<128;i++){const char c=src[i];
 if(c=='\"'||c=='\\'){out+='\\';out+=c;}
 else if(c=='\n')out+="\\n";else if(c=='\r')out+="\\r";
 else if(uint8_t(c)>=32)out+=c;
 }return out+"\"";
}
#include "FlightCoreWifiProfiles.h"
static String zjNewSecret(size_t bytes){
 String s;for(size_t n=0;n<bytes;n++){const uint8_t b=uint8_t(esp_random());if(b<16)s+='0';s+=String(b,HEX);}return s;
}
// CORS enables supported Chromium Local Network Access only for this trusted WebApp
// and the local development harness. Privileged routes require signed sessions.
static bool zjCorsAllowed(){
 const String origin=zjHttp.header("Origin");
 return origin=="https://chilchiltrips-boop.github.io"||
  origin=="http://localhost:8765"||origin=="http://127.0.0.1:8765"||
  origin=="http://localhost:8000"||origin=="http://127.0.0.1:8000"||
  origin=="http://localhost:4173"||origin=="http://127.0.0.1:4173";
}
static void zjCorsHeaders(){
 if(zjCorsAllowed()){
  zjHttp.sendHeader("Access-Control-Allow-Origin",zjHttp.header("Origin"));
  zjHttp.sendHeader("Vary","Origin");
  zjHttp.sendHeader("Access-Control-Expose-Headers","X-ZJ-Response");
  zjHttp.sendHeader("Access-Control-Allow-Headers","X-ZJ-Device, X-ZJ-Session, X-ZJ-Seq, X-ZJ-Proof, Content-Type");
  zjHttp.sendHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  zjHttp.sendHeader("Access-Control-Max-Age","300");
  if(zjHttp.header("Access-Control-Request-Private-Network")=="true")
   zjHttp.sendHeader("Access-Control-Allow-Private-Network","true");
 }
}
static void zjReply(int status,const String& body);
static bool zjAllow();static const char* zjClientTransport();
#include "FlightCoreEnrollment.h"
#include "FlightCoreUdp.h"
#include "FlightCoreOta.h"
#include "FlightCoreSetupPortal.h"
static bool zjAuthenticated(){return zjSessionAuthenticated();}
static bool zjAllow(){if(zjAuthenticated())return true;zjReply(401,"{\"error\":\"session_required_or_expired\"}");return false;}
static bool zjAllowSetup(){if(!zjAllow())return false;if(zjSetupAuthorized())return true;zjReply(403,"{\"error\":\"setup_authorization_required\"}");return false;}
// A paired diagnostic STA client may change ONLY the Wi-Fi operating mode.
// SSID/password changes, owner enrollment and firmware OTA keep their stricter scopes.
static bool zjAllowModeChange(){
 if(!zjAllow())return false;
 if(zjSetupAuthorized())return true;
 if(zjRequestSession>=0){
  const auto& session=zjSessions[zjRequestSession];
  if(!session.local&&!session.localSta&&!session.setup&&!session.admin&&
     String(zjClientTransport())=="STA"&&session.id.length()==32)return true;
 }
 zjReply(403,"{\"error\":\"mode_change_requires_paired_kit_or_ap_setup\"}");return false;
}
static void zjReply(int status,const String& body){
 zjCorsHeaders();zjHttp.sendHeader("Cache-Control","no-store");
 if(zjRequestSession>=0){const auto& s=zjSessions[zjRequestSession];zjHttp.sendHeader("X-ZJ-Response",zjHmac(s.key,"response|"+String(s.seq)+"|"+String(status)+"|"+body));}
 zjHttp.send(status,"application/json",body);
}
#include "FlightCoreWifiPolicy.h"
static const char* zjClientTransport();
static String zjMdnsKitHostname();
static String zjStatus(){
 const bool sta=WiFi.status()==WL_CONNECTED;
 String out="{\"board\":"+zjJson(FC_BOARD)+",\"version\":"+zjJson(FW_VERSION)+",\"mode\":"+zjJson(zjMode);
 out+=",\"phase\":"+zjJson(zjPhase)+",\"staConnected\":"+(sta?String("true"):String("false"));
 out+=",\"ssid\":"+zjJson(sta?WiFi.SSID():String(""))+",\"ip\":"+zjJson(sta?WiFi.localIP().toString():String(""));
 out+=",\"apSsid\":"+zjJson(zjApSsid)+",\"apIp\":"+zjJson(WiFi.softAPIP().toString());
 out+=",\"apActive\":"+(zjApStarted&&(WiFi.getMode()==WIFI_AP||WiFi.getMode()==WIFI_AP_STA)?String("true"):String("false"));
 out+=",\"scanActive\":"+(WiFi.scanComplete()==WIFI_SCAN_RUNNING?String("true"):String("false"))+",\"rcPreviewActive\":"+(zjRcHasFrame?String("true"):String("false"));
 out+=",\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"kitName\":"+zjJson(zjKitName)+",\"rssi\":"+String(sta?WiFi.RSSI():0)+",\"staDisconnectReason\":"+String(zjStaDisconnectReason);
 out+=",\"lastStaFailureReason\":"+String(zjLastStaFailureReason)+",\"wifiTestState\":"+zjJson(zjWifiTestState)+",\"staCredentialsSaved\":"+(zjSavedSsid.length()?String("true"):String("false"));
 const String networkState=zjNetTesting?"STA_TESTING":sta?"STA_CONNECTED":zjPhase=="sta_connecting"?"STA_CONNECTING":zjRcOwned?"AP_JOYSTICK_READY":zjSavedSsid.isEmpty()?"AP_ONBOARDING":"NETWORK_RECOVERY";
 out+=",\"networkState\":"+zjJson(networkState)+",\"exclusiveWifi\":true";
 out+=",\"bootId\":"+zjJson(zjBootId)+",\"channel\":"+String(WiFi.channel())+",\"setupAuthorized\":"+(zjSetupAuthorized()?String("true"):String("false"))+",\"otaAuthorized\":"+(zjAuthAdmin?String("true"):String("false"))+",\"motorsDisabled\":true";
 out+=",\"controlAuthorized\":"+((zjAuthAdmin||zjRequestSession>=0&&!zjSessions[zjRequestSession].localSta)?String("true"):String("false"));
 out+=",\"inputArmSupported\":true,\"ledOn\":"+(ledMode!=LED_OFF?String("true"):String("false"));
 out+=",\"hostname\":"+zjJson(zjMdnsKitHostname()+".local")+",\"firmwareBuiltAt\":"+zjJson(String(__DATE__)+" "+__TIME__)+",\"partitionLayout\":\"ZFC_DUAL_1E0000\",\"otaMaxBytes\":1966080,\"encryptedOta\":true,\"otaChunkMaxBytes\":2048";
 out+=",\"appElfSha256\":"+zjJson(zjHexBytes(esp_app_get_description()->app_elf_sha256,32));
 // Signed admin-only status makes timed-out OTA writes recoverable without
 // repeating a flash write blindly. This is scoped to the current enrollment.
 if(zjAuthAdmin&&zjRequestSession>=0&&zjSessions[zjRequestSession].admin){
  const bool owned=zjSecureOtaActive&&zjSecureOtaSession==zjSessions[zjRequestSession].id;
  out+=",\"ota\":{\"active\":"+(zjSecureOtaActive?String("true"):String("false"));
  out+=",\"owned\":"+(owned?String("true"):String("false"));
  out+=",\"offset\":"+String(zjSecureOtaOffset)+",\"size\":"+String(zjSecureOtaSize);
  out+=",\"sha256\":"+zjJson(zjSecureOtaHash);
  out+=",\"rebootPending\":"+(zjOtaRebootAt?String("true"):String("false"))+"}";
 }
 out+=",\"ppm\":"+zjPpmStatus()+",\"rc\":"+zjRcState()+",\"requestTransport\":"+zjJson(zjClientTransport())+",\"firmwareControl\":false,\"motorsArmed\":false,\"otaAppOnly\":true}";
 out+=",\"udp\":"+zjUdpStatistics();
 return out;
}
static const char* zjClientTransport(){return zjHttp.client().localIP()==WiFi.softAPIP()?"AP":"STA";}
static String zjMdnsKitHostname(){
 // Keep the original deterministic address until a custom Kit Name is saved.
 // User-friendly "zebjus_drone_7" becomes DNS-safe "zebjus-drone-7.local".
 String host=zjKitName;host.toLowerCase();host.replace("_","-");
 if(zjKitName!=FC_LABEL&&host.length()>=3&&host.length()<=31){
  bool valid=true;for(size_t i=0;i<host.length();i++){
   const char c=host[i];
   if(!(c>='a'&&c<='z')&&!(c>='0'&&c<='9')&&c!='-')valid=false;
  }
  if(host[0]=='-'||host[host.length()-1]=='-')valid=false;
  if(valid)return host;
 }
 return String("zebjus-")+GYRO_BOARD+"-"+zjKitCode;
}
static void zjChooseNetworkName(bool verification=false){
 // Query only while idle. A browser cannot enumerate mDNS services itself.
 // Keep a saved custom name; allocate a free legacy-style name for new kits.
 const int count=MDNS.queryService("zebjus","tcp");
 bool conflict=false;
 for(int i=0;i<count;i++){
  const String other=MDNS.txt(i,"id");
  // On simultaneous startup, the lower immutable ID keeps its name; only the
  // other board moves, so both cannot repeatedly choose the same replacement.
  if(other!=zjKitId&&MDNS.txt(i,"name")==zjKitName&&(!verification||other.compareTo(zjKitId)<0))conflict=true;
 }
 if(verification&&!conflict)return;
 if(!zjKitAutoName&&!conflict)return;
 String next="zebjus_drone_"+zjKitId.substring(zjKitId.length()-6);
 for(int n=1;n<=30;n++){
  const String candidate="zebjus_drone_"+String(n);bool used=false;
  for(int i=0;i<count;i++)if(MDNS.txt(i,"id")!=zjKitId&&MDNS.txt(i,"name")==candidate)used=true;
  if(!used){next=candidate;break;}
 }
 if(zjKitPrefs.putString("name",next)==next.length()&&zjKitPrefs.getString("name","")==next){
  zjKitName=next;zjKitAutoName=true;zjKitPrefs.putString("autoName","1");
 }
}
static void zjSetupHttp(){
 const char* headers[]={"X-ZJ-Key","Origin","Access-Control-Request-Private-Network","X-ZJ-Device","X-ZJ-Session","X-ZJ-Seq","X-ZJ-Proof"};zjHttp.collectHeaders(headers,7); // raw-key header is collected only to reject it
 zjSetupEnrollmentHttp();
 zjSetupSecureOtaHttp();
 zjHttp.on("/",HTTP_GET,[](){zjHttp.sendHeader("Cache-Control","no-store");zjHttp.send_P(200,"text/html",ZJ_SETUP_PORTAL);});
 zjHttp.on("/api/health",HTTP_GET,[](){zjReply(200,"{\"product\":\"ZEBJUS_FLIGHTCORE\",\"board\":"+zjJson(FC_BOARD)+"}");});
 zjHttp.on("/api/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjStatus());});
 zjHttp.on("/api/identify",HTTP_GET,[](){zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"authVersion\":2,\"simpleConnection\":true,\"adminSessions\":true,\"exclusiveWifi\":true,\"labelInstalled\":"+(zjLabelSecret.length()?String("true"):String("false"))+",\"name\":"+zjJson(zjKitName)+",\"hostname\":"+zjJson(zjMdnsKitHostname()+".local")+",\"board\":"+zjJson(FC_BOARD)+"}");});
 // AP-local Kit identity maintenance; full immutable Device ID is never changed.
 zjHttp.on("/api/kit/name",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if((String(zjClientTransport())!="AP"&&!zjAuthAdmin)||zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){
   zjReply(403,"{\"error\":\"rename_requires_idle_kit_ap\"}");return;
  }
  String name=zjArg("name");name.trim();
  if(name.length()<3||name.length()>31){zjReply(400,"{\"error\":\"invalid_kit_name\"}");return;}
  for(size_t i=0;i<name.length();i++){const char c=name[i];
   if(!(c>='A'&&c<='Z')&&!(c>='a'&&c<='z')&&!(c>='0'&&c<='9')&&c!='-'&&c!='_'){
    zjReply(400,"{\"error\":\"invalid_kit_name\"}");return;
   }
  }
  if(zjKitPrefs.putString("name",name)!=name.length()){zjReply(500,"{\"error\":\"name_save_failed\"}");return;}
  zjKitName=name;
  zjKitAutoName=false;zjKitPrefs.putString("autoName","0");zjNameChecked=false;
  if(zjMdnsReady){MDNS.end();zjMdnsReady=false;}
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"kitName\":"+zjJson(zjKitName)+",\"saved\":true}");
 });
 zjHttp.on("/api/kit/name/reset",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if((String(zjClientTransport())!="AP"&&!zjAuthAdmin)||zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){
   zjReply(403,"{\"error\":\"rename_requires_idle_kit_ap\"}");return;
  }
  const String autoName="zebjus_drone_1";
  if(zjKitPrefs.putString("name",autoName)!=autoName.length()){zjReply(500,"{\"error\":\"name_reset_failed\"}");return;}
  zjKitName=autoName;
  zjKitAutoName=true;zjKitPrefs.putString("autoName","1");zjNameChecked=false;
  if(zjMdnsReady){MDNS.end();zjMdnsReady=false;}
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"kitName\":"+zjJson(zjKitName)+",\"reset\":true}");
 });
 zjHttp.on("/api/wifi/scan",HTTP_GET,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting||zjUsbScanning){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  const int n=WiFi.scanComplete();
  if(n==WIFI_SCAN_FAILED){WiFi.scanNetworks(true,false);zjReply(202,"{\"state\":\"scanning\"}");return;}
  if(n==WIFI_SCAN_RUNNING){zjReply(202,"{\"state\":\"scanning\"}");return;}
  String out="{\"state\":\"ready\",\"networks\":[";
  for(int i=0;i<n&&i<24;i++){if(i)out+=',';out+="{\"ssid\":"+zjJson(WiFi.SSID(i))+",\"rssi\":"+String(WiFi.RSSI(i))+",\"secure\":"+(WiFi.encryptionType(i)==WIFI_AUTH_OPEN?String("false"):String("true"))+"}";}
  WiFi.scanDelete();zjReply(200,out+"]}");if(zjApStarted&&WiFi.status()!=WL_CONNECTED)WiFi.mode(WIFI_AP);
 });
 zjHttp.on("/api/wifi/test",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  const String ssid=zjArg("ssid"),pass=zjArg("password");
  if(ssid.length()==0||ssid.length()>32||pass.length()>63||(!pass.isEmpty()&&pass.length()<8)){zjReply(400,"{\"error\":\"invalid_ssid_or_password\"}");return;}
  zjPendingSsid=ssid;zjPendingPass=pass;zjScheduleWifiTest();
  zjReply(202,"{\"state\":\"testing\",\"saved\":false}");
 });
 zjHttp.on("/api/wifi/saved",HTTP_GET,[](){if(zjAllowSetup())zjReply(200,zjProfilesStatus());});
 zjHttp.on("/api/wifi/use",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjUsbScanning){zjReply(409,"{\"error\":\"network_busy\"}");return;}
  if(!zjSelectProfile(zjArg("ssid"))){zjReply(400,"{\"error\":\"profile_missing_or_storage_failed\"}");return;}
  zjMode="sta";zjPrefs.putString("mode","sta");
  zjReply(202,"{\"selected\":true}");zjScheduleMode("sta");
 });
 zjHttp.on("/api/wifi/forget",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjUsbScanning){zjReply(409,"{\"error\":\"network_busy\"}");return;}
  if(!zjForgetProfile(zjArg("ssid"))){zjReply(400,"{\"error\":\"profile_missing_or_storage_failed\"}");return;}
  zjReply(200,zjProfilesStatus());
 });
 zjHttp.on("/api/wifi/mode",HTTP_POST,[](){
  if(!zjAllowModeChange())return;const String mode=zjArg("mode");
  if(mode!="ap"&&mode!="sta"&&mode!="auto"){zjReply(400,"{\"error\":\"invalid_mode\"}");return;}
  if(zjNetTesting||zjRcOwned||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  if(mode=="sta"&&!zjSavedSsid.length()){zjReply(409,"{\"error\":\"save_sta_credentials_first\"}");return;}
  if(zjPrefs.putString("mode",mode)!=mode.length()){zjReply(500,"{\"error\":\"mode_save_failed\"}");return;}
  zjRcRelease("NETWORK_MODE_CHANGED");zjMode=mode;
  zjReply(202,"{\"kitId\":"+zjJson(zjKitId)+",\"mode\":"+zjJson(mode)+",\"state\":\"switching\"}");
  zjScheduleMode(mode);
 });
 zjHttp.on("/api/telemetry",HTTP_GET,[](){
  if(!zjAllow())return;
  String out="{\"kitId\":"+zjJson(zjKitId)+",\"board\":"+zjJson(GYRO_BOARD)+",\"millis\":"+String(millis())+",\"gyroReady\":"+(gyroReady?String("true"):String("false"));
  out+=",\"address\":"+String(GYRO_ADDR)+",\"roll\":"+String(RateRoll,3)+",\"pitch\":"+String(RatePitch,3)+",\"yaw\":"+String(RateYaw,3);
  out+=",\"scanner\":[";
  for(uint8_t i=0;i<scanCount;i++){if(i)out+=',';out+=String(scanAddresses[i]);}
  out+="],\"scannerRunning\":"+(scanActive?String("true"):String("false"))+",\"scanSequence\":"+String(zjLastScanSeq);
  out+=",\"rcSeq\":"+String(zjRcSeq)+",\"rcAlive\":"+(zjRcHasFrame?String("true"):String("false"))+",\"rc\":"+zjRcState()+"}";
  zjReply(200,out);
 });
 zjHttp.on("/api/command",HTTP_POST,[](){
  if(!zjAllow())return;const String cmd=zjArg("line");
  if(cmd.length()<5||cmd.length()>=sizeof(serialLine)||cmd.indexOf('\n')>=0||cmd.indexOf('\r')>=0){zjReply(400,"{\"error\":\"invalid_command\"}");return;}
  if(cmd!="ZJI2C,SCAN"&&cmd!="ZJINFO,GET"&&!cmd.startsWith("ZJLED,")&&!cmd.startsWith("ZJTEL,RATE,")){zjReply(403,"{\"error\":\"command_not_allowed\"}");return;}
  char line[sizeof(serialLine)];cmd.toCharArray(line,sizeof(line));serialCommand(line);
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"accepted\":true,\"motorControl\":false}");
 });
 // RC diagnostics only: motors always disarmed. Kit code selects; access key authorizes.
 zjHttp.on("/api/rc/claim",HTTP_POST,[](){
  if(!zjAllow())return;
  if(zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){zjReply(409,"{\"error\":\"network_or_ota_busy\"}");return;}
  const String source=zjArg("source"),code=zjArg("kitCode");
  if(code!=zjKitCode){zjReply(404,"{\"error\":\"kit_code_mismatch\"}");return;}
  if(!zjRcClaim(source,code,true,zjHttp.client().remoteIP(),zjClientTransport())){
   zjReply(423,"{\"error\":\"controller_locked_or_invalid_source\"}");return;
  }
  zjUdpInvalidate();
  bool udpReady=false;
  if(source=="ANDROID"&&zjArg("udpProtocol")=="ZJUDP1"&&zjRequestSession>=0){
   const auto& sc=zjSessions[zjRequestSession];
   if(!sc.localSta&&uint32_t(millis()-sc.at)<1800000)
    udpReady=zjUdpBind(sc.key,zjRcSession,zjHttp.client().remoteIP());
  }
  zjReply(200,"{\"claimed\":true,\"session\":"+zjJson(zjRcSession)+",\"ownerId\":"+zjJson(zjRcOwnerId)+",\"kitId\":"+zjJson(zjKitId)+",\"motorsArmed\":false,\"udpPort\":"+String(udpReady?ZJ_UDP_PORT:0)+",\"udpProtocol\":"+zjJson(udpReady?String("ZJUDP1"):String("HTTP"))+",\"udpChannels\":7,\"udpAckFields\":5}");
 });
 zjHttp.on("/api/rc/release",HTTP_POST,[](){
  if(!zjAllow())return;
  if(!zjRcOwned||!zjRcNetwork||zjArg("session")!=zjRcSession||
     zjHttp.client().remoteIP()!=zjRcOwnerIP){zjReply(423,"{\"error\":\"not_controller_owner\"}");return;}
  zjUdpInvalidate();zjRcRelease("NETWORK_RELEASE");zjReply(200,"{\"released\":true}");
 });
 zjHttp.on("/api/rc/preview",HTTP_POST,[](){
  if(!zjAllow())return;
  if(zjUdpEnabled()){zjReply(423,"{\"error\":\"udp_rc_owned_use_udp_or_release\"}");return;}
  if(zjArg("armed")!="false"){zjReply(403,"{\"error\":\"hardware_arming_disabled\"}");return;}
  const String inputArm=zjArg("inputArmed");
  if(inputArm.length()&&inputArm!="true"&&inputArm!="false"){zjReply(400,"{\"error\":\"invalid_input_arm\"}");return;}
  long seq=0,t=0,r=0,p=0,y=0;
  const String response=zjArg("responseMode");
  if(!parseNumber(zjArg("seq").c_str(),1,2147483647L,seq)||!parseNumber(zjArg("throttle").c_str(),1000,2000,t)||
     !parseNumber(zjArg("roll").c_str(),1000,2000,r)||!parseNumber(zjArg("pitch").c_str(),1000,2000,p)||!parseNumber(zjArg("yaw").c_str(),1000,2000,y)||
     (response.length()&&response!="Slow"&&response!="Medium"&&response!="Fast")||
     !zjRcFrame(uint32_t(seq),int(t),int(r),int(p),int(y),zjArg("source"),zjArg("session"),true,zjHttp.client().remoteIP(),inputArm=="true")){
   zjReply(423,"{\"error\":\"rc_not_owned_or_invalid_frame\"}");return;
  }
  zjRcResponse=response.length()?response:String("Medium");
  if(zjArg("ledKeep")=="true"&&ledMode!=LED_OFF)leaseStart=millis();
  zjReply(200,"{\"received\":true,\"kitId\":"+zjJson(zjKitId)+",\"seq\":"+String(zjRcSeq)+",\"receivedAtMs\":"+String(zjRcLast)+",\"inputArmed\":"+(zjRcInputArmed?String("true"):String("false"))+",\"ledOn\":"+(ledMode!=LED_OFF?String("true"):String("false"))+",\"motorsArmed\":false}");
 });
 zjHttp.on("/api/rc/stop",HTTP_POST,[](){if(!zjAllow())return;zjUdpInvalidate();zjRcRelease("NETWORK_EMERGENCY_STOP");zjReply(200,"{\"stopped\":true,\"motorsDisabled\":true}");});
 zjHttp.on("/api/rc/snapshot",HTTP_GET,[](){if(!zjAllow())return;zjPpmLoop(millis());zjRcLoop(millis());zjReply(200,zjRcState());});
 zjHttp.on("/api/ppm/status",HTTP_GET,[](){if(!zjAllow())return;zjPpmLoop(millis());zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"ppm\":"+zjPpmStatus()+"}");});

 // Factory flashing remains USB-only. APP OTA requires an encrypted, signed
 // admin session and an exact, board-matched SHA-256 image. Publisher
 // signature verification / Secure Boot is a separate production requirement.
 // Raw-key multipart OTA is retired: authenticated encrypted chunk OTA only.
 zjHttp.on("/api/ota",HTTP_POST,[](){zjReply(410,"{\"error\":\"legacy_ota_disabled_use_encrypted_session\"}");},[](){
  if(zjHttp.upload().status==UPLOAD_FILE_START)zjOtaFailed=true;
 });
 zjHttp.on("/api/reboot",HTTP_POST,[](){
  if(!zjAllow())return;
  if(!zjAuthAdmin||zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){zjReply(403,"{\"error\":\"reboot_requires_idle_authorized_kit\"}");return;}
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"rebooting\":true}");zjOtaRebootAt=millis()+1200;
 });
 zjHttp.onNotFound([](){
  if(zjHttp.method()==HTTP_OPTIONS){
   if(!zjCorsAllowed()){zjReply(403,"{\"error\":\"origin_denied\"}");return;}
   zjCorsHeaders();zjHttp.send(204,"text/plain","");return;
  }
  zjReply(404,"{\"error\":\"not_found\"}");
 });
 zjHttp.begin();zjUdpSetup();
}
static void zjNetworkSetup(){
 WiFi.onEvent([](WiFiEvent_t event,WiFiEventInfo_t info){
  if(event==ARDUINO_EVENT_WIFI_AP_START)zjApStarted=true;
  if(event==ARDUINO_EVENT_WIFI_AP_STOP)zjApStarted=false;
  if(event==ARDUINO_EVENT_WIFI_STA_GOT_IP){zjAssociationEpoch=zjAssociationEpoch+1;zjStaDisconnectReason=0;}
  if(event==ARDUINO_EVENT_WIFI_STA_DISCONNECTED){
   zjStaDisconnectReason=info.wifi_sta_disconnected.reason;
   if(zjNetTesting&&zjStaDisconnectReason!=36&&zjStaDisconnectReason!=0)zjLastStaFailureReason=zjStaDisconnectReason;
  }
 });
 zjPrefs.begin("zj-network",false);
 WiFi.persistent(false);WiFi.setSleep(false);WiFi.setAutoReconnect(false);zjEnrollmentInit();
 zjSavedSsid=zjPrefs.getString("ssid","");zjSavedPass=zjPrefs.getString("pass","");
 const String saved=zjPrefs.getString("staConfig","");if(saved.length()>2){const int n=saved.substring(0,2).toInt();if(n>0&&n<=32&&saved.length()>=size_t(n+2)){zjSavedSsid=saved.substring(2,n+2);zjSavedPass=saved.substring(n+2);}}zjMode=zjPrefs.getString("mode","auto");
 zjLoadProfiles();
 if(zjMode!="auto"&&zjMode!="sta"&&zjMode!="ap")zjMode="auto";
 zjNetKey=zjPrefs.getString("key","");if(zjNetKey.length()!=32){zjNetKey=zjNewSecret(16);zjPrefs.putString("key",zjNetKey);}
 // Default remains 12345678 until a teacher optionally changes it.
 zjApPass=zjEffectiveApPassword();
 const uint64_t mac=ESP.getEfuseMac();
 char suffix[7];snprintf(suffix,sizeof(suffix),"%06X",unsigned(mac&0xFFFFFF));
 String apRoot=zjKitPrefs.getString("apName",String("ZEBJUS-AERION-")+GYRO_BOARD);
 if(apRoot.length()<3||apRoot.length()>24)apRoot=String("ZEBJUS-AERION-")+GYRO_BOARD;
 zjApSsid=zjEffectiveApSsid();
 if(zjMode=="ap"||zjSavedSsid.length()==0){zjEnsureAP();zjPhase="ap_ready";}
 else zjConnectSaved();
 zjSetupHttp();
 Serial.print("ZJNET,AP_NAME,");Serial.println(zjApSsid);
 Serial.println(zjLabelSecret.length()?"ZJNET,LABEL,INSTALLED":"ZJNET,LABEL,MANUFACTURER_SETUP_REQUIRED");
 Serial.println("ZJNET,HELP,JOIN_AP_SCAN_WIFI_TEST_SAVE_THEN_CONNECT_STA; motors disabled");
 Serial.print("ZJNET,MODE,");Serial.println(zjMode);
}
// USB bench provisioning remains available even if saved STA mode has disabled the AP.
// The physical USB terminal MUST NOT echo the Wi-Fi password or access key.
static void zjNetUsbStatus(){
 Serial.print("ZJNET,MODE,");Serial.println(zjMode);
 Serial.print("ZJNET,AP,");Serial.print(zjApStarted&&(WiFi.getMode()==WIFI_AP||WiFi.getMode()==WIFI_AP_STA)?"ON,":"OFF,");Serial.println(zjApSsid);
 Serial.print("ZJNET,STA,");Serial.print(WiFi.status()==WL_CONNECTED?"CONNECTED,":"DISCONNECTED,");
 Serial.print(WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("0.0.0.0"));Serial.print(",");
 Serial.println(WiFi.status()==WL_CONNECTED?WiFi.SSID():String("NONE"));
 Serial.print("ZJNET,PHASE,");Serial.println(zjPhase);
 Serial.print("ZJNET,STA_REASON,");Serial.println(zjStaDisconnectReason);
 Serial.print("ZJNET,TEST_STATE,");Serial.println(zjWifiTestState);
 Serial.print("ZJNET,SAVED,");Serial.println(zjProfilesStatus());
}
static bool zjNetSerialCommand(char* line){
 if(!strncmp(line,"ZJNET,LABEL,",12)||!strcmp(line,"ZJNET,REVOKE_LABEL,CONFIRM")){
  if(!zjAdminAuthorized()||zjRcOwned||zjNetTesting){Serial.println("ZJNET,ERR,ADMIN_LOCKED_OR_BUSY");return true;}
  const bool revoke=!strcmp(line,"ZJNET,REVOKE_LABEL,CONFIRM");const String label=revoke?String(""):String(line+12);
  if(!revoke&&!zjHex(label,64)){Serial.println("ZJNET,ERR,LABEL_MUST_BE_256_BITS");return true;}
  zjPrefs.putString("label",label);zjEnrollmentInit();zjRcRelease("ENROLLMENT_REVOKED");
  Serial.println("ZJNET,ACK,LABEL_UPDATED");return true;
 }

 if(!strcmp(line,"ZJNET,GET")){zjNetUsbStatus();return true;}
 if(!strcmp(line,"ZJNET,SAVED")){Serial.print("ZJNET,SAVED,");Serial.println(zjProfilesStatus());return true;}
 if(!strncmp(line,"ZJNET,USE,",10)||!strncmp(line,"ZJNET,FORGET,",13)){
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjUsbScanning){Serial.println("ZJNET,ERR,NETWORK_BUSY");return true;}
  const bool use=!strncmp(line,"ZJNET,USE,",10);const String ssid=line+(use?10:13);
  const bool saved=use?zjSelectProfile(ssid):zjForgetProfile(ssid);
  if(!saved){Serial.println("ZJNET,ERR,PROFILE_OR_STORAGE_FAILED");return true;}
  Serial.println("ZJNET,ACK,PROFILE");
  if(use){zjMode="sta";zjPrefs.putString("mode","sta");zjScheduleMode("sta");}
  zjNetUsbStatus();return true;
 }
 // A local USB-attached teacher can pair the *current browser session* without
 // typing an access key. Never permit this endpoint over AP/STA or HTTP.
 if(!strcmp(line,"ZJNET,PAIR")){
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){Serial.println("ZJNET,ERR,PAIR_BUSY");return true;}
  Serial.print("ZJNET,PAIR,");Serial.print(zjKitId);Serial.print(',');
  Serial.println(zjNetKey);return true;
 }
 if(!strcmp(line,"ZJNET,SCAN")){
  if(zjUsbScanning||zjNetTesting||zjRcOwned){Serial.println("ZJNET,ERR,SCAN_BUSY");return true;}
  if(WiFi.status()!=WL_CONNECTED)zjEnsureAP();
  WiFi.scanDelete();
  WiFi.scanNetworks(true,false);
  zjUsbScanning=true;zjUsbScanIndex=0;zjUsbScanCount=0;
  Serial.println("ZJNET,SCAN,STARTED");return true;
 }
 if(!strncmp(line,"ZJNET,TEST,",11)){
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){Serial.println("ZJNET,ERR,CONTROL_OR_WIFI_BUSY");return true;}
  char* args=line+11;char* comma=strchr(args,',');
  if(!comma){Serial.println("ZJNET,ERR,SSID_PASSWORD_REQUIRED");return true;}
  *comma='\0';const String ssid=args,pass=comma+1;
  if(!ssid.length()||ssid.length()>32||pass.length()>63||(!pass.isEmpty()&&pass.length()<8)){
   Serial.println("ZJNET,ERR,INVALID_WIFI_CREDENTIALS");return true;
  }
  zjPendingSsid=ssid;zjPendingPass=pass;zjScheduleWifiTest();
  Serial.println("ZJNET,TEST,STARTED");return true;
 }
 if(!strncmp(line,"ZJNET,MODE,",11)){
  if(zjRcOwned||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt){Serial.println("ZJNET,ERR,CONTROL_OR_WIFI_BUSY");return true;}
  const String mode=line+11;
  if(mode!="auto"&&mode!="ap"&&mode!="sta"){Serial.println("ZJNET,ERR,INVALID_MODE");return true;}
  if(mode=="sta"&&!zjSavedSsid.length()){Serial.println("ZJNET,ERR,SAVE_STA_FIRST");return true;}
  zjRcRelease("NETWORK_MODE_CHANGED");zjMode=mode;zjPrefs.putString("mode",mode);zjScheduleMode(mode);
  Serial.print("ZJNET,ACK,MODE,");Serial.println(mode);return true;
 }
 return false;
}
static void zjNetworkLoop(uint32_t now){
 zjAuthResetRequest();zjHttp.handleClient();now=millis();zjUdpLoop(now);
 zjWifiPolicyLoop(now);now=millis();
 zjSecureOtaLoop(now);
 zjPpmLoop(now);
 zjRcLoop(now);
 if(zjUsbScanning&&Serial.availableForWrite()>128){
  const int n=WiFi.scanComplete();
  if(n>=0&&zjUsbScanCount==0){zjUsbScanCount=n+1;Serial.print("ZJNET,SCAN,COUNT,");Serial.println(n);}
  if(zjUsbScanCount>0){
   if(zjUsbScanIndex<n&&zjUsbScanIndex<24){
    const String ssid=WiFi.SSID(zjUsbScanIndex);
    Serial.print("ZJNET,SCAN,ITEM,");Serial.print(ssid);
    Serial.print(',');Serial.print(WiFi.RSSI(zjUsbScanIndex));Serial.print(',');
    Serial.println(WiFi.encryptionType(zjUsbScanIndex)==WIFI_AUTH_OPEN?"OPEN":"SECURE");
    zjUsbScanIndex++;
   }else{WiFi.scanDelete();zjUsbScanning=false;zjUsbScanIndex=zjUsbScanCount=0;Serial.println("ZJNET,SCAN,END");if(zjApStarted&&WiFi.status()!=WL_CONNECTED)WiFi.mode(WIFI_AP);}
  }else if(n==WIFI_SCAN_FAILED){zjUsbScanning=false;Serial.println("ZJNET,ERR,SCAN_FAILED");}
 }
 if(zjPreviousScanActive&&!scanActive)zjLastScanSeq++;
 zjPreviousScanActive=scanActive;
 if(zjOtaRebootAt&&int32_t(now-zjOtaRebootAt)>=0){ESP.restart();return;}
 // Flush the USB ACK; never restart during OTA, RC ownership, scan or Wi-Fi test.
 if(zjAdminApRestartAt&&int32_t(now-zjAdminApRestartAt)>=0&&
    !zjSecureOtaActive&&!zjOtaAuthorized&&!zjNetTesting&&!zjUsbScanning&&!zjRcOwned){
  zjAdminApRestartAt=0;ESP.restart();return;
 }
 if(zjNetTesting&&!zjTestStartAt){
  const bool associated=zjAssociationEpoch!=zjTestAssociationEpoch&&WiFi.status()==WL_CONNECTED&&WiFi.SSID()==zjPendingSsid&&WiFi.localIP()!=IPAddress(0,0,0,0);
  if(associated&&!zjTestConnectedAt)zjTestConnectedAt=now;
  if(!associated)zjTestConnectedAt=0;
  if(associated&&zjTestConnectedAt&&uint32_t(now-zjTestConnectedAt)>=1200){
   if(!zjRememberProfile(zjPendingSsid,zjPendingPass)){zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="failed";zjPhase="credential_storage_failed";zjEnsureAP();zjNetNextRetry=now+30000;return;}
   zjSavedSsid=zjPendingSsid;zjSavedPass=zjPendingPass;
   zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="saved";zjLastStaFailureReason=0;zjPhase="sta_test_pass_saved";Serial.println("ZJNET,TEST,SAVED");
   zjMode="sta";zjPrefs.putString("mode","sta"); // successful test stays STA-only
  }else if(int32_t(now-zjNetAttempt)>int32_t(ZJ_NET_TEST_TIMEOUT_MS)){
   // Record the last genuine association reason before our own disconnect can emit STA_LEAVING (36).
   if(zjLastStaFailureReason==0&&zjStaDisconnectReason!=36)zjLastStaFailureReason=zjStaDisconnectReason;
   zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="failed";zjPhase="sta_test_failed_not_saved";
   Serial.print("ZJNET,TEST,FAILED_NOT_SAVED,");Serial.println(zjLastStaFailureReason);
   WiFi.disconnect();zjEnsureAP();zjNetNextRetry=now+30000;
  }
 }
 // Advertise device ID and six-digit selector over STA mDNS, never the access key.
 const bool staUp=WiFi.status()==WL_CONNECTED;
 if(zjMdnsReady&&zjAdvertisedName!=zjKitName){MDNS.end();zjMdnsReady=false;}
 if(staUp&&!zjMdnsReady){
  // A saved Kit Name is a DNS-safe .local hostname; otherwise use board+code.
  // Immutable Device ID is verified separately on every connection.
  const String host=zjMdnsKitHostname();
  if(MDNS.begin(host.c_str())){
   if(!zjNameChecked&&!zjRcOwned&&!zjOtaAuthorized&&!zjNetTesting){
    zjChooseNetworkName();zjNameChecked=true;
    MDNS.end();const String chosen=zjMdnsKitHostname();if(!MDNS.begin(chosen.c_str()))return;
   }
   MDNS.addService("zebjus","tcp",80);
   MDNS.addServiceTxt("zebjus","tcp","name",zjKitName);
   MDNS.addServiceTxt("zebjus","tcp","code",zjKitCode);
   MDNS.addServiceTxt("zebjus","tcp","id",zjKitId);
   MDNS.addServiceTxt("zebjus","tcp","board",FC_BOARD);
   zjMdnsReady=true;zjAdvertisedName=zjKitName;
   if(!zjNameVerified)zjNameVerifyAt=millis()+2500;
  }
 }else if(!staUp&&zjMdnsReady){MDNS.end();zjMdnsReady=false;zjNameChecked=false;zjNameVerified=false;}
 if(staUp&&zjMdnsReady&&zjNameVerifyAt&&int32_t(now-zjNameVerifyAt)>=0&&!zjRcOwned&&!zjNetTesting&&!zjOtaAuthorized){
  zjChooseNetworkName(true);zjNameVerifyAt=0;zjNameVerified=true;
 }
}
