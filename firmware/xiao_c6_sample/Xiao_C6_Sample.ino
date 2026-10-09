#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>

// Standalone board demonstration. It does not drive motors, ESCs, or flight outputs.
static const char *VERSION = "sample-1.0.0";
WebServer server(80);
Preferences preferences;
String apPassword, otaKey, apName;
bool uploadAuthorized=false, uploadFailed=false, restartPending=false;
unsigned long restartAt=0, blinkAt=0;
bool ledOn=false;

String randomHex(size_t count) {
  const char alphabet[]="0123456789ABCDEF"; String value; value.reserve(count);
  for(size_t i=0;i<count;i++)value += alphabet[esp_random()%16];
  return value;
}
bool authorized() { return server.header("X-OTA-Key")==otaKey; }
void jsonResponse(int code,const String &text) { server.send(code,"application/json",text); }

void reportInfo() {
  if(!authorized()){ jsonResponse(403,"{\"error\":\"OTA key rejected\"}"); return; }
  String info="{\"ok\":true,\"protocol\":\"dronelab-c6-sample-v1\",\"board\":\"XIAO_ESP32C6\",\"chip\":\"ESP32-C6\",\"version\":\""+String(VERSION)+"\",\"armed\":false,\"flashBytes\":"+String(ESP.getFlashChipSize())+",\"freeSketchBytes\":"+String(ESP.getFreeSketchSpace())+",\"ip\":\""+WiFi.softAPIP().toString()+"\"}";
  jsonResponse(200,info);
}
void receiveFirmware() {
  HTTPUpload &upload=server.upload();
  if(upload.status==UPLOAD_FILE_START){
    uploadAuthorized=authorized(); uploadFailed=!uploadAuthorized;
    if(uploadAuthorized)uploadFailed=!Update.begin(UPDATE_SIZE_UNKNOWN,U_FLASH);
    Serial.println(uploadAuthorized&&!uploadFailed?"OTA starting":"OTA rejected");
  } else if(upload.status==UPLOAD_FILE_WRITE){
    if(!uploadFailed&&Update.write(upload.buf,upload.currentSize)!=upload.currentSize)uploadFailed=true;
  } else if(upload.status==UPLOAD_FILE_END){
    if(!uploadFailed&&!Update.end(true))uploadFailed=true;
    Serial.printf("OTA transfer: %lu bytes • %s\n",(unsigned long)upload.totalSize,uploadFailed?"failed":"verified");
  } else if(upload.status==UPLOAD_FILE_ABORTED){uploadFailed=true;Update.abort();Serial.println("OTA aborted");}
}
void finishFirmware() {
  if(!uploadAuthorized){jsonResponse(403,"{\"error\":\"OTA key rejected\"}");return;}
  if(uploadFailed||Update.hasError()){jsonResponse(500,"{\"error\":\"Firmware write failed\"}");return;}
  jsonResponse(200,"{\"ok\":true,\"message\":\"OTA image written; reboot scheduled\"}");
  restartAt=millis()+1800;restartPending=true;
}
void setup() {
  Serial.begin(115200);
  preferences.begin("dronelab-ota",false);
  apPassword=preferences.getString("ap-pass","");otaKey=preferences.getString("ota-key","");
  if(apPassword.length()<12){apPassword=randomHex(16);preferences.putString("ap-pass",apPassword);}
  if(otaKey.length()<24){otaKey=randomHex(32);preferences.putString("ota-key",otaKey);}
  preferences.end();
  WiFi.mode(WIFI_AP);String mac=WiFi.macAddress();mac.replace(":","");apName="DroneLab-C6-"+mac.substring(mac.length()-6);
  WiFi.softAP(apName.c_str(),apPassword.c_str());
  const char *headers[]={"X-OTA-Key"};server.collectHeaders(headers,1);
  server.on("/api/info",HTTP_GET,reportInfo);
  server.on("/api/firmware",HTTP_POST,finishFirmware,receiveFirmware);
  server.begin();
#ifdef LED_BUILTIN
  pinMode(LED_BUILTIN,OUTPUT);
#endif
  Serial.printf("\nDroneLab XIAO ESP32-C6 %s\nAP: %s\nPassword: %s\nOTA key: %s\nIP: %s\n",VERSION,apName.c_str(),apPassword.c_str(),otaKey.c_str(),WiFi.softAPIP().toString().c_str());
}
void loop() {
  server.handleClient();
  if(restartPending&&int32_t(millis()-restartAt)>=0){delay(100);ESP.restart();}
  if(millis()-blinkAt>=700){blinkAt=millis();ledOn=!ledOn;
#ifdef LED_BUILTIN
    digitalWrite(LED_BUILTIN,ledOn?LOW:HIGH);
#endif
  }
}
