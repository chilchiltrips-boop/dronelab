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
static bool zjPreviousScanActive=false,zjMdnsReady=false;

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
static bool zjAuthenticated(){
 const String provided=zjHttp.header("X-ZJ-Key");
 if(provided.length()!=zjNetKey.length()||provided.length()<24)return false;
 uint8_t diff=0;for(size_t i=0;i<provided.length();i++)diff|=uint8_t(provided[i]^zjNetKey[i]);return diff==0;
}
static bool zjAllow(){if(zjAuthenticated())return true;zjHttp.send(401,"application/json","{\"error\":\"access_key_required\"}");return false;}
static void zjReply(int status,const String& body){zjHttp.sendHeader("Cache-Control","no-store");zjHttp.send(status,"application/json",body);}
static void zjEnsureAP(){
 if((WiFi.getMode()==WIFI_AP_STA||WiFi.getMode()==WIFI_AP)&&WiFi.softAPIP()==IPAddress(192,168,4,1))return;
 WiFi.mode(WIFI_AP_STA);
 WiFi.softAPConfig(IPAddress(192,168,4,1),IPAddress(192,168,4,1),IPAddress(255,255,255,0));
 WiFi.softAP(zjApSsid.c_str(),zjApPass.c_str(),1,false,4);
}
static void zjConnectSaved(){
 if(!zjSavedSsid.length()){zjPhase="ap_no_saved_wifi";zjEnsureAP();return;}
 zjEnsureAP();WiFi.begin(zjSavedSsid.c_str(),zjSavedPass.c_str());
 zjNetAttempt=millis();zjNetTesting=false;zjPhase="sta_connecting";
}
static String zjStatus(){
 const bool sta=WiFi.status()==WL_CONNECTED;
 String out="{\"board\":"+zjJson(FC_BOARD)+",\"version\":"+zjJson(FW_VERSION)+",\"mode\":"+zjJson(zjMode);
 out+=",\"phase\":"+zjJson(zjPhase)+",\"staConnected\":"+(sta?String("true"):String("false"));
 out+=",\"ssid\":"+zjJson(sta?WiFi.SSID():String(""))+",\"ip\":"+zjJson(sta?WiFi.localIP().toString():String(""));
 out+=",\"apSsid\":"+zjJson(zjApSsid)+",\"apIp\":"+zjJson(WiFi.softAPIP().toString());
 out+=",\"scanActive\":"+(zjNetTesting?String("true"):String("false"))+",\"rcPreviewActive\":"+(zjRcHasFrame?String("true"):String("false"));
 out+=",\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"kitName\":"+zjJson(zjKitName);
 out+=",\"rc\":"+zjRcState()+",\"firmwareControl\":false,\"motorsArmed\":false,\"otaAppOnly\":true}";
 return out;
}
static const char* zjClientTransport(){const IPAddress ip=zjHttp.client().remoteIP();return ip[0]==192&&ip[1]==168&&ip[2]==4?"AP":"STA";}
static void zjSetupHttp(){
 const char* headers[]={"X-ZJ-Key"};zjHttp.collectHeaders(headers,1);
 zjHttp.on("/api/health",HTTP_GET,[](){zjReply(200,"{\"product\":\"ZEBJUS_FLIGHTCORE\",\"board\":"+zjJson(FC_BOARD)+"}");});
 zjHttp.on("/api/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjStatus());});
 zjHttp.on("/api/identify",HTTP_GET,[](){zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"kitCode\":"+zjJson(zjKitCode)+",\"name\":"+zjJson(zjKitName)+",\"board\":"+zjJson(FC_BOARD)+"}");});
 zjHttp.on("/api/wifi/scan",HTTP_GET,[](){
  if(!zjAllow())return;
  const int n=WiFi.scanComplete();
  if(n==WIFI_SCAN_FAILED){WiFi.scanNetworks(true,false);zjReply(202,"{\"state\":\"scanning\"}");return;}
  if(n==WIFI_SCAN_RUNNING){zjReply(202,"{\"state\":\"scanning\"}");return;}
  String out="{\"state\":\"ready\",\"networks\":[";
  for(int i=0;i<n&&i<24;i++){if(i)out+=',';out+="{\"ssid\":"+zjJson(WiFi.SSID(i))+",\"rssi\":"+String(WiFi.RSSI(i))+",\"secure\":"+(WiFi.encryptionType(i)==WIFI_AUTH_OPEN?String("false"):String("true"))+"}";}
  WiFi.scanDelete();zjReply(200,out+"]}");
 });
 zjHttp.on("/api/wifi/test",HTTP_POST,[](){
  if(!zjAllow())return;
  const String ssid=zjHttp.arg("ssid"),pass=zjHttp.arg("password");
  if(ssid.length()==0||ssid.length()>32||pass.length()>63||(!pass.isEmpty()&&pass.length()<8)){zjReply(400,"{\"error\":\"invalid_ssid_or_password\"}");return;}
  zjPendingSsid=ssid;zjPendingPass=pass;zjEnsureAP();
  WiFi.begin(ssid.c_str(),pass.c_str());zjNetAttempt=millis();zjNetTesting=true;zjPhase="testing_wifi";
  zjReply(202,"{\"state\":\"testing\",\"saved\":false}");
 });
 zjHttp.on("/api/wifi/mode",HTTP_POST,[](){
  if(!zjAllow())return;const String mode=zjHttp.arg("mode");
  if(mode!="ap"&&mode!="sta"&&mode!="auto"){zjReply(400,"{\"error\":\"invalid_mode\"}");return;}
  if(mode=="sta"&&!zjSavedSsid.length()){zjReply(409,"{\"error\":\"save_sta_credentials_first\"}");return;}
  zjRcRelease("NETWORK_MODE_CHANGED");zjMode=mode;zjPrefs.putString("mode",mode);
  zjReply(202,"{\"mode\":"+zjJson(mode)+",\"state\":\"switching\"}");
  if(mode=="ap"){WiFi.disconnect();zjEnsureAP();zjPhase="ap_manual";}
  else if(WiFi.status()==WL_CONNECTED){zjNetApOffAt=millis()+3000;zjPhase="sta_connected";}
  else zjConnectSaved();
 });
 zjHttp.on("/api/telemetry",HTTP_GET,[](){
  if(!zjAllow())return;
  String out="{\"board\":"+zjJson(GYRO_BOARD)+",\"millis\":"+String(millis())+",\"gyroReady\":"+(gyroReady?String("true"):String("false"));
  out+=",\"address\":"+String(GYRO_ADDR)+",\"roll\":"+String(RateRoll,3)+",\"pitch\":"+String(RatePitch,3)+",\"yaw\":"+String(RateYaw,3);
  out+=",\"scanner\":[";
  for(uint8_t i=0;i<scanCount;i++){if(i)out+=',';out+=String(scanAddresses[i]);}
  out+="],\"scannerRunning\":"+(scanActive?String("true"):String("false"))+",\"scanSequence\":"+String(zjLastScanSeq);
  out+=",\"rcSeq\":"+String(zjRcSeq)+",\"rcAlive\":"+(zjRcHasFrame?String("true"):String("false"))+",\"rc\":"+zjRcState()+"}";
  zjReply(200,out);
 });
 zjHttp.on("/api/command",HTTP_POST,[](){
  if(!zjAllow())return;const String cmd=zjHttp.arg("line");
  if(cmd.length()<5||cmd.length()>=sizeof(serialLine)||cmd.indexOf('\n')>=0||cmd.indexOf('\r')>=0){zjReply(400,"{\"error\":\"invalid_command\"}");return;}
  if(cmd!="ZJI2C,SCAN"&&cmd!="ZJINFO,GET"&&!cmd.startsWith("ZJLED,")&&!cmd.startsWith("ZJTEL,RATE,")){zjReply(403,"{\"error\":\"command_not_allowed\"}");return;}
  char line[sizeof(serialLine)];cmd.toCharArray(line,sizeof(line));serialCommand(line);
  zjReply(200,"{\"accepted\":true,\"motorControl\":false}");
 });
 // RC diagnostics only: motors always disarmed. Kit code selects; access key authorizes.
 zjHttp.on("/api/rc/claim",HTTP_POST,[](){
  if(!zjAllow())return;
  const String source=zjHttp.arg("source"),code=zjHttp.arg("kitCode");
  if(code!=zjKitCode){zjReply(404,"{\"error\":\"kit_code_mismatch\"}");return;}
  if(!zjRcClaim(source,code,true,zjHttp.client().remoteIP(),zjClientTransport())){
   zjReply(423,"{\"error\":\"controller_locked_or_invalid_source\"}");return;
  }
  zjReply(200,"{\"claimed\":true,\"session\":"+zjJson(zjRcSession)+",\"kitId\":"+zjJson(zjKitId)+",\"motorsArmed\":false}");
 });
 zjHttp.on("/api/rc/release",HTTP_POST,[](){
  if(!zjAllow())return;
  if(!zjRcOwned||!zjRcNetwork||zjHttp.arg("session")!=zjRcSession||
     zjHttp.client().remoteIP()!=zjRcOwnerIP){zjReply(423,"{\"error\":\"not_controller_owner\"}");return;}
  zjRcRelease("NETWORK_RELEASE");zjReply(200,"{\"released\":true}");
 });
 zjHttp.on("/api/rc/preview",HTTP_POST,[](){
  if(!zjAllow())return;
  if(zjHttp.arg("armed")!="false"){zjReply(403,"{\"error\":\"hardware_arming_disabled\"}");return;}
  const long seq=zjHttp.arg("seq").toInt();
  const int t=zjHttp.arg("throttle").toInt(),r=zjHttp.arg("roll").toInt();
  const int p=zjHttp.arg("pitch").toInt(),y=zjHttp.arg("yaw").toInt();
  if(seq<=0||!zjRcFrame(uint32_t(seq),t,r,p,y,zjHttp.arg("source"),
     zjHttp.arg("session"),true,zjHttp.client().remoteIP())){
   zjReply(423,"{\"error\":\"rc_not_owned_or_invalid_frame\"}");return;
  }
  zjReply(200,"{\"received\":true,\"kitId\":"+zjJson(zjKitId)+",\"motorsArmed\":false}");
 });
 // Secure-by-default factory flashing remains USB-only. OTA is APP-only with per-device key,
 // ESP chip header check and Update partition guard. Production requires signed-image policy.
 zjHttp.on("/api/ota",HTTP_POST,[](){
  if(!zjAuthenticated()){zjReply(401,"{\"error\":\"access_key_required\"}");return;}
  if(zjOtaFailed||!zjOtaComplete||Update.hasError()){zjReply(400,"{\"error\":\"ota_rejected_or_incomplete\"}");return;}
  zjReply(200,"{\"updated\":true,\"rebooting\":true}");zjOtaRebootAt=millis()+1200;
 },[](){
  HTTPUpload& u=zjHttp.upload();
  if(u.status==UPLOAD_FILE_START){zjOtaAuthorized=zjAuthenticated();zjOtaFailed=!zjOtaAuthorized;zjOtaComplete=false;if(!zjOtaFailed&&(!u.filename.endsWith(".bin")||!Update.begin(UPDATE_SIZE_UNKNOWN,U_FLASH)))zjOtaFailed=true;}
  else if(u.status==UPLOAD_FILE_WRITE&&!zjOtaFailed){
   if(u.totalSize==0){const uint16_t chip=u.currentSize>13?uint16_t(u.buf[12])|uint16_t(u.buf[13])<<8:0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
    if(u.currentSize<24||u.buf[0]!=0xe9||chip!=13){zjOtaFailed=true;Update.abort();return;}
#else
    if(u.currentSize<24||u.buf[0]!=0xe9||chip!=5){zjOtaFailed=true;Update.abort();return;}
#endif
   }
   if(Update.write(u.buf,u.currentSize)!=u.currentSize){zjOtaFailed=true;Update.abort();}
  }else if(u.status==UPLOAD_FILE_END&&!zjOtaFailed){zjOtaComplete=Update.end(true);zjOtaFailed=!zjOtaComplete;}
  else if(u.status==UPLOAD_FILE_ABORTED){zjOtaFailed=true;Update.abort();}
 });
 zjHttp.onNotFound([](){zjReply(404,"{\"error\":\"not_found\"}");});
 zjHttp.begin();
}
static void zjNetworkSetup(){
 zjPrefs.begin("zj-network",false);
 zjSavedSsid=zjPrefs.getString("ssid","");zjSavedPass=zjPrefs.getString("pass","");zjMode=zjPrefs.getString("mode","auto");
 zjNetKey=zjPrefs.getString("key","");if(zjNetKey.length()!=32){zjNetKey=zjNewSecret(16);zjPrefs.putString("key",zjNetKey);}
 // Classroom AP common WPA2 password; per-device access key remains separate and secret.
 zjApPass="12345678";
 const uint64_t mac=ESP.getEfuseMac();
 char suffix[7];snprintf(suffix,sizeof(suffix),"%06X",unsigned(mac&0xFFFFFF));
 zjApSsid=String("ZEBJUS-AERION-")+GYRO_BOARD+"-"+zjKitCode;
 if(zjMode=="ap"||zjSavedSsid.length()==0){zjEnsureAP();zjPhase="ap_ready";}
 else zjConnectSaved();
 zjSetupHttp();
 Serial.print("ZJNET,ACCESS,");Serial.print(zjApSsid);Serial.print(',');Serial.print(zjApPass);Serial.print(',');Serial.println(zjNetKey);
 Serial.println("ZJNET,HELP,Use AP 192.168.4.1 or STA IP; authenticated local API; motors disabled");
}
static void zjNetworkLoop(uint32_t now){
 zjHttp.handleClient();
 if(zjPreviousScanActive&&!scanActive)zjLastScanSeq++;
 zjPreviousScanActive=scanActive;
 if(zjOtaRebootAt&&int32_t(now-zjOtaRebootAt)>=0){ESP.restart();return;}
 if(zjNetTesting){
  if(WiFi.status()==WL_CONNECTED&&WiFi.SSID()==zjPendingSsid){
   zjSavedSsid=zjPendingSsid;zjSavedPass=zjPendingPass;
   zjPrefs.putString("ssid",zjSavedSsid);zjPrefs.putString("pass",zjSavedPass);
   zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjPhase="sta_test_pass_saved";
   if(zjMode!="ap")zjNetApOffAt=now+10000;
   else{WiFi.disconnect();zjEnsureAP();zjPhase="ap_ready_credentials_saved";}
  }else if(now-zjNetAttempt>12000){
   WiFi.disconnect();zjPendingPass="";zjPendingSsid="";zjNetTesting=false;zjPhase="sta_test_failed_not_saved";
   zjEnsureAP();
  }
 }else if(zjMode!="ap"){
  if(WiFi.status()==WL_CONNECTED){
   if(zjPhase=="sta_connecting"){zjPhase="sta_connected";zjNetApOffAt=now+10000;}
  }else if(zjPhase=="sta_connecting"&&now-zjNetAttempt>12000){
   zjEnsureAP();zjPhase="sta_failed_ap_fallback";zjNetNextRetry=now+30000;
  }else if(zjSavedSsid.length()&&zjPhase!="sta_connecting"&&int32_t(now-zjNetNextRetry)>=0){
   zjConnectSaved();
  }
 }
 if(zjNetApOffAt&&int32_t(now-zjNetApOffAt)>=0){
  zjNetApOffAt=0;
  if(zjMode!="ap"&&WiFi.status()==WL_CONNECTED){WiFi.softAPdisconnect(true);WiFi.mode(WIFI_STA);zjPhase="sta_connected";}
 }
 // Advertise device ID and six-digit selector over STA mDNS, never the access key.
 const bool staUp=WiFi.status()==WL_CONNECTED;
 if(staUp&&!zjMdnsReady){
  const String host=String("zebjus-")+GYRO_BOARD+"-"+zjKitId.substring(zjKitId.length()-6);
  if(MDNS.begin(host.c_str())){
   MDNS.addService("zebjus","tcp",80);
   MDNS.addServiceTxt("zebjus","tcp","code",zjKitCode);
   MDNS.addServiceTxt("zebjus","tcp","id",zjKitId);
   MDNS.addServiceTxt("zebjus","tcp","board",FC_BOARD);
   zjMdnsReady=true;
  }
 }else if(!staUp&&zjMdnsReady){MDNS.end();zjMdnsReady=false;}
}
