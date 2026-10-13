#pragma once
// FlightCore AP/STA laboratory transport: no motor outputs or flight arming.
// Native Android or an explicitly trusted local client accesses authenticated HTTP.
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>
#include <ESPmDNS.h>

static WebServer zjHttp(80);
static Preferences zjPrefs;
static String zjNetKey,zjApSsid,zjApPass,zjSavedSsid,zjSavedPass,zjMode="auto",zjPhase="boot",zjPendingSsid,zjPendingPass;
static uint32_t zjNetAttempt=0,zjNetNextRetry=0,zjNetApOffAt=0,zjOtaRebootAt=0,zjLastScanSeq=0;
static bool zjNetTesting=false,zjOtaAuthorized=false,zjOtaComplete=false,zjOtaFailed=false;
static volatile uint8_t zjStaDisconnectReason=0,zjLastStaFailureReason=0;
static volatile uint32_t zjAssociationEpoch=0;static uint32_t zjTestAssociationEpoch=0;
static const uint32_t ZJ_NET_TEST_TIMEOUT_MS=20000;
static String zjWifiTestState="idle";
static bool zjPreviousScanActive=false,zjMdnsReady=false,zjUsbScanning=false;
static int zjUsbScanIndex=0,zjUsbScanCount=0;

// Escapes all user-provided Wi-Fi identifiers before emitting JSON.
static String zjJson(const String& src){
 String out="\"";for(size_t i=0;i<src.length()&&i<128;i++){const char c=src[i];
 if(c=='\"'||c=='\\'){out+='\\';out+=c;}
 else if(c=='\n')out+="\\n";else if(c=='\r')out+="\\r";
 else if(uint8_t(c)>=32)out+=c;
 }return out+"\"";
}
static String zjNewSecret(size_t bytes){
 String s;for(size_t n=0;n<bytes;n++){const uint8_t b=uint8_t(esp_random());if(b<16)s+='0';s+=String(b,HEX);}return s;
}
// CORS enables supported Chromium Local Network Access only for this trusted WebApp
// and the local development harness. Authentication still requires X-ZJ-Key.
static bool zjCorsAllowed(){
 const String origin=zjHttp.header("Origin");
 return origin=="https://chilchiltrips-boop.github.io"||
  origin=="http://localhost:8765"||origin=="http://127.0.0.1:8765"||
  origin=="http://localhost:8000"||origin=="http://127.0.0.1:8000";
}
static void zjCorsHeaders(){
 if(zjCorsAllowed()){
  zjHttp.sendHeader("Access-Control-Allow-Origin",zjHttp.header("Origin"));
  zjHttp.sendHeader("Vary","Origin");
  zjHttp.sendHeader("Access-Control-Expose-Headers","X-ZJ-Response");
  zjHttp.sendHeader("Access-Control-Allow-Headers","X-ZJ-Key, X-ZJ-Device, X-ZJ-Session, X-ZJ-Seq, X-ZJ-Proof, Content-Type");
  zjHttp.sendHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  zjHttp.sendHeader("Access-Control-Max-Age","300");
  if(zjHttp.header("Access-Control-Request-Private-Network")=="true")
   zjHttp.sendHeader("Access-Control-Allow-Private-Network","true");
 }
}
static void zjReply(int status,const String& body);
static bool zjAllow();static const char* zjClientTransport();
#include "FlightCoreEnrollment.h"
#include "FlightCoreSetupPortal.h"
static bool zjAuthenticated(){return zjSessionAuthenticated();}
static bool zjAllow(){if(zjAuthenticated())return true;zjReply(401,"{\"error\":\"session_required_or_expired\"}");return false;}
static bool zjAllowSetup(){if(!zjAllow())return false;if(zjSetupAuthorized())return true;zjReply(403,"{\"error\":\"setup_authorization_required\"}");return false;}
static void zjReply(int status,const String& body){
 zjCorsHeaders();zjHttp.sendHeader("Cache-Control","no-store");
 if(zjRequestSession>=0){const auto& s=zjSessions[zjRequestSession];zjHttp.sendHeader("X-ZJ-Response",zjHmac(s.key,"response|"+String(s.seq)+"|"+String(status)+"|"+body));}
 zjHttp.send(status,"application/json",body);
}
static void zjEnsureAP(){
 if((WiFi.getMode()==WIFI_AP_STA||WiFi.getMode()==WIFI_AP)&&WiFi.softAPIP()==IPAddress(192,168,4,1))return;
 WiFi.mode(WIFI_AP_STA);
 WiFi.softAPConfig(IPAddress(192,168,4,1),IPAddress(192,168,4,1),IPAddress(255,255,255,0));
 const bool started=WiFi.softAP(zjApSsid.c_str(),zjApPass.c_str(),1,false,4);
 if(Serial.availableForWrite()>90){Serial.print("ZJNET,AP,");Serial.print(started?"READY,":"ERROR,");Serial.println(zjApSsid);}
}
static void zjConnectSaved(){
 if(!zjSavedSsid.length()){zjPhase="ap_no_saved_wifi";zjEnsureAP();return;}
 zjEnsureAP();WiFi.begin(zjSavedSsid.c_str(),zjSavedPass.c_str());
 zjNetAttempt=millis();zjNetTesting=false;zjPhase="sta_connecting";
}
static const char* zjClientTransport();
static String zjStatus(){
 const bool sta=WiFi.status()==WL_CONNECTED;
 String out="{\"board\":"+zjJson(FC_BOARD)+",\"version\":"+zjJson(FW_VERSION)+",\"mode\":"+zjJson(zjMode);
 out+=",\"phase\":"+zjJson(zjPhase)+",\"staConnected\":"+(sta?String("true"):String("false"));
 out+=",\"ssid\":"+zjJson(sta?WiFi.SSID():String(""))+",\"ip\":"+zjJson(sta?WiFi.localIP().toString():String(""));
 out+=",\"apSsid\":"+zjJson(zjApSsid)+",\"apIp\":"+zjJson(WiFi.softAPIP().toString());
 out+=",\"apActive\":"+(WiFi.getMode()==WIFI_AP||WiFi.getMode()==WIFI_AP_STA?String("true"):String("false"));
 out+=",\"scanActive\":"+(WiFi.scanComplete()==WIFI_SCAN_RUNNING?String("true"):String("false"))+",\"rcPreviewActive\":"+(zjRcHasFrame?String("true"):String("false"));
 out+=",\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"kitName\":"+zjJson(zjKitName)+",\"rssi\":"+String(sta?WiFi.RSSI():0)+",\"staDisconnectReason\":"+String(zjStaDisconnectReason);
 out+=",\"lastStaFailureReason\":"+String(zjLastStaFailureReason)+",\"wifiTestState\":"+zjJson(zjWifiTestState)+",\"staCredentialsSaved\":"+(zjSavedSsid.length()?String("true"):String("false"));
 const bool ap=WiFi.getMode()==WIFI_AP||WiFi.getMode()==WIFI_AP_STA;
 const String networkState=zjNetTesting?"STA_TESTING":sta?(ap?"AP_STA_COEXISTENCE":"STA_CONNECTED"):zjPhase=="sta_connecting"?"STA_CONNECTING":zjRcOwned?"AP_JOYSTICK_READY":zjSavedSsid.isEmpty()?"AP_ONBOARDING":"NETWORK_RECOVERY";
 out+=",\"networkState\":"+zjJson(networkState);
 out+=",\"bootId\":"+zjJson(zjBootId)+",\"channel\":"+String(WiFi.channel())+",\"setupAuthorized\":"+(zjSetupAuthorized()?String("true"):String("false"))+",\"otaAuthorized\":"+(zjAuthAdmin?String("true"):String("false"))+",\"motorsDisabled\":true";
 out+=",\"rc\":"+zjRcState()+",\"requestTransport\":"+zjJson(zjClientTransport())+",\"firmwareControl\":false,\"motorsArmed\":false,\"otaAppOnly\":true}";
 return out;
}
static const char* zjClientTransport(){return zjHttp.client().localIP()==WiFi.softAPIP()?"AP":"STA";}
static void zjSetupHttp(){
 const char* headers[]={"X-ZJ-Key","Origin","Access-Control-Request-Private-Network","X-ZJ-Device","X-ZJ-Session","X-ZJ-Seq","X-ZJ-Proof"};zjHttp.collectHeaders(headers,7);
 zjSetupEnrollmentHttp();
 zjHttp.on("/",HTTP_GET,[](){zjHttp.sendHeader("Cache-Control","no-store");zjHttp.send_P(200,"text/html",ZJ_SETUP_PORTAL);});
 zjHttp.on("/api/health",HTTP_GET,[](){zjReply(200,"{\"product\":\"ZEBJUS_FLIGHTCORE\",\"board\":"+zjJson(FC_BOARD)+"}");});
 zjHttp.on("/api/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjStatus());});
 zjHttp.on("/api/identify",HTTP_GET,[](){zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"authVersion\":2,\"simpleConnection\":true,\"labelInstalled\":"+(zjLabelSecret.length()?String("true"):String("false"))+",\"name\":"+zjJson(zjKitName)+",\"board\":"+zjJson(FC_BOARD)+"}");});
 zjHttp.on("/api/wifi/scan",HTTP_GET,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting||zjUsbScanning){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  const int n=WiFi.scanComplete();
  if(n==WIFI_SCAN_FAILED){WiFi.scanNetworks(true,false);zjReply(202,"{\"state\":\"scanning\"}");return;}
  if(n==WIFI_SCAN_RUNNING){zjReply(202,"{\"state\":\"scanning\"}");return;}
  String out="{\"state\":\"ready\",\"networks\":[";
  for(int i=0;i<n&&i<24;i++){if(i)out+=',';out+="{\"ssid\":"+zjJson(WiFi.SSID(i))+",\"rssi\":"+String(WiFi.RSSI(i))+",\"secure\":"+(WiFi.encryptionType(i)==WIFI_AUTH_OPEN?String("false"):String("true"))+"}";}
  WiFi.scanDelete();zjReply(200,out+"]}");
 });
 zjHttp.on("/api/wifi/test",HTTP_POST,[](){
  if(!zjAllowSetup())return;
  if(zjRcOwned||zjNetTesting){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  const String ssid=zjArg("ssid"),pass=zjArg("password");
  if(ssid.length()==0||ssid.length()>32||pass.length()>63||(!pass.isEmpty()&&pass.length()<8)){zjReply(400,"{\"error\":\"invalid_ssid_or_password\"}");return;}
  zjPendingSsid=ssid;zjPendingPass=pass;zjStaDisconnectReason=0;zjLastStaFailureReason=0;zjWifiTestState="testing";zjEnsureAP();
  zjTestAssociationEpoch=zjAssociationEpoch;WiFi.disconnect(false,false);WiFi.begin(ssid.c_str(),pass.c_str());zjNetAttempt=millis();zjNetTesting=true;zjPhase="testing_wifi";
  zjReply(202,"{\"state\":\"testing\",\"saved\":false}");
 });
 zjHttp.on("/api/wifi/mode",HTTP_POST,[](){
  if(!zjAllowSetup())return;const String mode=zjArg("mode");
  if(mode!="ap"&&mode!="sta"&&mode!="auto"){zjReply(400,"{\"error\":\"invalid_mode\"}");return;}
  if(zjNetTesting||zjRcOwned){zjReply(409,"{\"error\":\"control_or_wifi_test_busy\"}");return;}
  if(mode=="sta"&&!zjSavedSsid.length()){zjReply(409,"{\"error\":\"save_sta_credentials_first\"}");return;}
  zjRcRelease("NETWORK_MODE_CHANGED");zjMode=mode;zjPrefs.putString("mode",mode);
  zjReply(202,"{\"mode\":"+zjJson(mode)+",\"state\":\"switching\"}");
  if(mode=="ap"){WiFi.disconnect();zjEnsureAP();zjPhase="ap_manual";}
  else if(WiFi.status()==WL_CONNECTED){zjNetApOffAt=mode=="sta"?millis()+3000:0;zjEnsureAP();zjPhase="sta_connected";}
  else zjConnectSaved();
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
  if(zjNetTesting||zjOtaAuthorized||zjOtaRebootAt){zjReply(409,"{\"error\":\"network_or_ota_busy\"}");return;}
  const String source=zjArg("source"),code=zjArg("kitCode");
  if(code!=zjKitCode){zjReply(404,"{\"error\":\"kit_code_mismatch\"}");return;}
  if(!zjRcClaim(source,code,true,zjHttp.client().remoteIP(),zjClientTransport())){
   zjReply(423,"{\"error\":\"controller_locked_or_invalid_source\"}");return;
  }
  zjReply(200,"{\"claimed\":true,\"session\":"+zjJson(zjRcSession)+",\"kitId\":"+zjJson(zjKitId)+",\"motorsArmed\":false}");
 });
 zjHttp.on("/api/rc/release",HTTP_POST,[](){
  if(!zjAllow())return;
  if(!zjRcOwned||!zjRcNetwork||zjArg("session")!=zjRcSession||
     zjHttp.client().remoteIP()!=zjRcOwnerIP){zjReply(423,"{\"error\":\"not_controller_owner\"}");return;}
  zjRcRelease("NETWORK_RELEASE");zjReply(200,"{\"released\":true}");
 });
 zjHttp.on("/api/rc/preview",HTTP_POST,[](){
  if(!zjAllow())return;
  if(zjArg("armed")!="false"){zjReply(403,"{\"error\":\"hardware_arming_disabled\"}");return;}
  long seq=0,t=0,r=0,p=0,y=0;
  const String response=zjArg("responseMode");
  if(!parseNumber(zjArg("seq").c_str(),1,2147483647L,seq)||!parseNumber(zjArg("throttle").c_str(),1000,2000,t)||
     !parseNumber(zjArg("roll").c_str(),1000,2000,r)||!parseNumber(zjArg("pitch").c_str(),1000,2000,p)||!parseNumber(zjArg("yaw").c_str(),1000,2000,y)||
     (response.length()&&response!="Slow"&&response!="Medium"&&response!="Fast")||
     !zjRcFrame(uint32_t(seq),int(t),int(r),int(p),int(y),zjArg("source"),zjArg("session"),true,zjHttp.client().remoteIP())){
   zjReply(423,"{\"error\":\"rc_not_owned_or_invalid_frame\"}");return;
  }
  zjRcResponse=response.length()?response:String("Medium");
  zjReply(200,"{\"received\":true,\"kitId\":"+zjJson(zjKitId)+",\"seq\":"+String(zjRcSeq)+",\"receivedAtMs\":"+String(zjRcLast)+",\"motorsArmed\":false}");
 });
 zjHttp.on("/api/rc/stop",HTTP_POST,[](){if(!zjAllow())return;zjRcRelease("NETWORK_EMERGENCY_STOP");zjReply(200,"{\"stopped\":true,\"motorsDisabled\":true}");});
 zjHttp.on("/api/rc/snapshot",HTTP_GET,[](){if(!zjAllow())return;zjRcLoop(millis());zjReply(200,zjRcState());});

 // Secure-by-default factory flashing remains USB-only. OTA is APP-only with per-device key,
 // ESP chip header check and Update partition guard. Production requires signed-image policy.
 zjHttp.on("/api/ota",HTTP_POST,[](){
  if(!zjAuthenticated()||!zjAuthAdmin){zjReply(401,"{\"error\":\"access_key_required\"}");return;}
  if(zjOtaFailed||!zjOtaComplete||Update.hasError()){zjOtaAuthorized=false;zjReply(400,"{\"error\":\"ota_rejected_or_incomplete\"}");return;}
  zjReply(200,"{\"updated\":true,\"rebooting\":true}");zjOtaRebootAt=millis()+1200;
 },[](){
  HTTPUpload& u=zjHttp.upload();
  if(u.status==UPLOAD_FILE_START){zjOtaAuthorized=zjAuthenticated()&&zjAuthAdmin&&String(zjClientTransport())=="STA"&&!zjRcOwned&&!zjNetTesting&&!zjUsbScanning;zjOtaFailed=!zjOtaAuthorized;zjOtaComplete=false;if(!zjOtaFailed&&(!u.filename.endsWith(".bin")||!Update.begin(UPDATE_SIZE_UNKNOWN,U_FLASH)))zjOtaFailed=true;}
  else if(u.status==UPLOAD_FILE_WRITE&&!zjOtaFailed){
   if(u.totalSize==0){const uint16_t chip=u.currentSize>13?uint16_t(u.buf[12])|uint16_t(u.buf[13])<<8:0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
    if(u.currentSize<24||u.buf[0]!=0xe9||chip!=13){zjOtaFailed=true;Update.abort();return;}
#else
    if(u.currentSize<24||u.buf[0]!=0xe9||chip!=5){zjOtaFailed=true;Update.abort();return;}
#endif
   }
   if(Update.write(u.buf,u.currentSize)!=u.currentSize){zjOtaFailed=true;zjOtaAuthorized=false;Update.abort();}
  }else if(u.status==UPLOAD_FILE_END&&!zjOtaFailed){zjOtaComplete=Update.end(true);zjOtaFailed=!zjOtaComplete;}
  else if(u.status==UPLOAD_FILE_ABORTED){zjOtaFailed=true;zjOtaAuthorized=false;Update.abort();}
 });
 zjHttp.onNotFound([](){
  if(zjHttp.method()==HTTP_OPTIONS){
   if(!zjCorsAllowed()){zjReply(403,"{\"error\":\"origin_denied\"}");return;}
   zjCorsHeaders();zjHttp.send(204,"text/plain","");return;
  }
  zjReply(404,"{\"error\":\"not_found\"}");
 });
 zjHttp.begin();
}
static void zjNetworkSetup(){
 WiFi.onEvent([](WiFiEvent_t event,WiFiEventInfo_t info){
  if(event==ARDUINO_EVENT_WIFI_STA_GOT_IP){zjAssociationEpoch=zjAssociationEpoch+1;zjStaDisconnectReason=0;}
  if(event==ARDUINO_EVENT_WIFI_STA_DISCONNECTED){
   zjStaDisconnectReason=info.wifi_sta_disconnected.reason;
   if(zjNetTesting&&zjStaDisconnectReason!=36&&zjStaDisconnectReason!=0)zjLastStaFailureReason=zjStaDisconnectReason;
  }
 });
 zjPrefs.begin("zj-network",false);
 WiFi.persistent(false);WiFi.setAutoReconnect(false);zjEnrollmentInit();
 zjSavedSsid=zjPrefs.getString("ssid","");zjSavedPass=zjPrefs.getString("pass","");
 const String saved=zjPrefs.getString("staConfig","");if(saved.length()>2){const int n=saved.substring(0,2).toInt();if(n>0&&n<=32&&saved.length()>=size_t(n+2)){zjSavedSsid=saved.substring(2,n+2);zjSavedPass=saved.substring(n+2);}}zjMode=zjPrefs.getString("mode","auto");
 if(zjMode!="auto"&&zjMode!="sta"&&zjMode!="ap")zjMode="auto";
 zjNetKey=zjPrefs.getString("key","");if(zjNetKey.length()!=32){zjNetKey=zjNewSecret(16);zjPrefs.putString("key",zjNetKey);}
 // Classroom AP common WPA2 password; per-device access key remains separate and secret.
 zjApPass=zjKitPrefs.getString("apPass","12345678");
 if(zjApPass.length()<8||zjApPass.length()>63)zjApPass="12345678";
 const uint64_t mac=ESP.getEfuseMac();
 char suffix[7];snprintf(suffix,sizeof(suffix),"%06X",unsigned(mac&0xFFFFFF));
 String apRoot=zjKitPrefs.getString("apName",String("ZEBJUS-AERION-")+GYRO_BOARD);
 if(apRoot.length()<3||apRoot.length()>24)apRoot=String("ZEBJUS-AERION-")+GYRO_BOARD;
 zjApSsid=apRoot+"-"+zjKitCode;
 if(zjMode=="ap"||zjSavedSsid.length()==0){zjEnsureAP();zjPhase="ap_ready";}
 else zjConnectSaved();
 zjSetupHttp();
 Serial.print("ZJNET,AP_NAME,");Serial.println(zjApSsid);
 Serial.println(zjLabelSecret.length()?"ZJNET,LABEL,INSTALLED":"ZJNET,LABEL,MANUFACTURER_SETUP_REQUIRED");
 Serial.println("ZJNET,HELP,AUTO keeps AP visible; use USB ZJNET,SCAN / TEST / MODE; motors disabled");
 Serial.print("ZJNET,MODE,");Serial.println(zjMode);
}
// USB bench provisioning remains available even if saved STA mode has disabled the AP.
// The physical USB terminal MUST NOT echo the Wi-Fi password or access key.
static void zjNetUsbStatus(){
 Serial.print("ZJNET,MODE,");Serial.println(zjMode);
 Serial.print("ZJNET,AP,");Serial.print((WiFi.getMode()==WIFI_AP||WiFi.getMode()==WIFI_AP_STA)?"ON,":"OFF,");Serial.println(zjApSsid);
 Serial.print("ZJNET,STA,");Serial.print(WiFi.status()==WL_CONNECTED?"CONNECTED,":"DISCONNECTED,");
 Serial.print(WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("0.0.0.0"));Serial.print(",");
 Serial.println(WiFi.status()==WL_CONNECTED?WiFi.SSID():String("NONE"));
 Serial.print("ZJNET,PHASE,");Serial.println(zjPhase);
 Serial.print("ZJNET,STA_REASON,");Serial.println(zjStaDisconnectReason);
 Serial.print("ZJNET,TEST_STATE,");Serial.println(zjWifiTestState);
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
 // A local USB-attached teacher can pair the *current browser session* without
 // typing an access key. Never permit this endpoint over AP/STA or HTTP.
 if(!strcmp(line,"ZJNET,PAIR")){
  if(zjRcOwned||zjNetTesting){Serial.println("ZJNET,ERR,PAIR_BUSY");return true;}
  Serial.print("ZJNET,PAIR,");Serial.print(zjKitId);Serial.print(',');
  Serial.println(zjNetKey);return true;
 }
 if(!strcmp(line,"ZJNET,SCAN")){
  if(zjUsbScanning||zjNetTesting||zjRcOwned){Serial.println("ZJNET,ERR,SCAN_BUSY");return true;}
  if(zjMode!="sta"||WiFi.status()!=WL_CONNECTED)zjEnsureAP();
  WiFi.scanDelete();
  WiFi.scanNetworks(true,false);
  zjUsbScanning=true;zjUsbScanIndex=0;zjUsbScanCount=0;
  Serial.println("ZJNET,SCAN,STARTED");return true;
 }
 if(!strncmp(line,"ZJNET,TEST,",11)){
  if(zjRcOwned||zjNetTesting){Serial.println("ZJNET,ERR,CONTROL_OR_WIFI_BUSY");return true;}
  char* args=line+11;char* comma=strchr(args,',');
  if(!comma){Serial.println("ZJNET,ERR,SSID_PASSWORD_REQUIRED");return true;}
  *comma='\0';const String ssid=args,pass=comma+1;
  if(!ssid.length()||ssid.length()>32||pass.length()>63||(!pass.isEmpty()&&pass.length()<8)){
   Serial.println("ZJNET,ERR,INVALID_WIFI_CREDENTIALS");return true;
  }
  zjPendingSsid=ssid;zjPendingPass=pass;zjStaDisconnectReason=0;zjLastStaFailureReason=0;zjWifiTestState="testing";
  zjEnsureAP();zjTestAssociationEpoch=zjAssociationEpoch;WiFi.disconnect(false,false);WiFi.begin(ssid.c_str(),pass.c_str());
  zjNetAttempt=millis();zjNetTesting=true;zjPhase="testing_wifi";
  Serial.println("ZJNET,TEST,STARTED");return true;
 }
 if(!strncmp(line,"ZJNET,MODE,",11)){
  if(zjRcOwned||zjNetTesting){Serial.println("ZJNET,ERR,CONTROL_OR_WIFI_BUSY");return true;}
  const String mode=line+11;
  if(mode!="auto"&&mode!="ap"&&mode!="sta"){Serial.println("ZJNET,ERR,INVALID_MODE");return true;}
  if(mode=="sta"&&!zjSavedSsid.length()){Serial.println("ZJNET,ERR,SAVE_STA_FIRST");return true;}
  zjRcRelease("NETWORK_MODE_CHANGED");zjNetApOffAt=0;zjMode=mode;zjPrefs.putString("mode",mode);
  if(mode=="ap"){WiFi.disconnect();zjEnsureAP();zjPhase="ap_manual";}
  else if(WiFi.status()==WL_CONNECTED){if(mode=="sta")zjNetApOffAt=millis()+3000;else zjEnsureAP();zjPhase="sta_connected";}
  else zjConnectSaved();
  Serial.print("ZJNET,ACK,MODE,");Serial.println(mode);return true;
 }
 return false;
}
static void zjNetworkLoop(uint32_t now){
 zjAuthResetRequest();zjHttp.handleClient();now=millis();
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
   }else{WiFi.scanDelete();zjUsbScanning=false;zjUsbScanIndex=zjUsbScanCount=0;Serial.println("ZJNET,SCAN,END");}
  }else if(n==WIFI_SCAN_FAILED){zjUsbScanning=false;Serial.println("ZJNET,ERR,SCAN_FAILED");}
 }
 if(zjPreviousScanActive&&!scanActive)zjLastScanSeq++;
 zjPreviousScanActive=scanActive;
 if(zjOtaRebootAt&&int32_t(now-zjOtaRebootAt)>=0){ESP.restart();return;}
 if(zjNetTesting){
  if(zjAssociationEpoch!=zjTestAssociationEpoch&&WiFi.status()==WL_CONNECTED&&WiFi.SSID()==zjPendingSsid&&WiFi.localIP()!=IPAddress(0,0,0,0)&&uint32_t(now-zjNetAttempt)>=1200){
   const String record=(zjPendingSsid.length()<10?String("0"):String(""))+String(zjPendingSsid.length())+zjPendingSsid+zjPendingPass;
   if(zjPrefs.putString("staConfig",record)!=record.length()||zjPrefs.getString("staConfig","")!=record){zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="failed";zjPhase="credential_storage_failed";return;}
   zjSavedSsid=zjPendingSsid;zjSavedPass=zjPendingPass;
   zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="saved";zjLastStaFailureReason=0;zjPhase="sta_test_pass_saved";Serial.println("ZJNET,TEST,SAVED");
   zjMode="auto";zjPrefs.putString("mode","auto");zjNetApOffAt=0;zjEnsureAP(); // retain verified STA and Android AP together
  }else if(int32_t(now-zjNetAttempt)>int32_t(ZJ_NET_TEST_TIMEOUT_MS)){
   // Record the last genuine association reason before our own disconnect can emit STA_LEAVING (36).
   if(zjLastStaFailureReason==0&&zjStaDisconnectReason!=36)zjLastStaFailureReason=zjStaDisconnectReason;
   zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjWifiTestState="failed";zjPhase="sta_test_failed_not_saved";
   Serial.print("ZJNET,TEST,FAILED_NOT_SAVED,");Serial.println(zjLastStaFailureReason);
   WiFi.disconnect();zjEnsureAP();zjNetNextRetry=now+30000;
  }
 }else if(zjMode!="ap"){
  if(WiFi.status()==WL_CONNECTED){
   if(zjPhase=="sta_connecting"){zjPhase="sta_connected";if(zjMode=="sta")zjNetApOffAt=now+10000;}
  }else if(zjPhase=="sta_connecting"&&int32_t(now-zjNetAttempt)>12000){
   zjEnsureAP();zjPhase="sta_failed_ap_fallback";zjNetNextRetry=now+30000;
  }else if(zjSavedSsid.length()&&zjPhase!="sta_connecting"&&int32_t(now-zjNetNextRetry)>=0){
   zjConnectSaved();
  }
 }
 if(zjNetApOffAt&&int32_t(now-zjNetApOffAt)>=0){
  zjNetApOffAt=0;
  if(zjMode=="sta"&&WiFi.status()==WL_CONNECTED){WiFi.softAPdisconnect(true);WiFi.mode(WIFI_STA);zjPhase="sta_connected";}
 }
 // Advertise device ID and six-digit selector over STA mDNS, never the access key.
 const bool staUp=WiFi.status()==WL_CONNECTED;
 if(staUp&&!zjMdnsReady){
  // Human-selectable code provides a deterministic same-router hostname;
  // immutable Device ID is still verified separately on every connection.
  const String host=String("zebjus-")+GYRO_BOARD+"-"+zjKitCode;
  if(MDNS.begin(host.c_str())){
   MDNS.addService("zebjus","tcp",80);
   MDNS.addServiceTxt("zebjus","tcp","code",zjKitCode);
   MDNS.addServiceTxt("zebjus","tcp","id",zjKitId);
   MDNS.addServiceTxt("zebjus","tcp","board",FC_BOARD);
   zjMdnsReady=true;
  }
 }else if(!staUp&&zjMdnsReady){MDNS.end();zjMdnsReady=false;}
}
