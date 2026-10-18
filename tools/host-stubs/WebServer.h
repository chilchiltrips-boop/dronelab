#pragma once
#include "ArduinoShim.h"
enum HTTPMethod {HTTP_GET=1,HTTP_POST=2};
static constexpr int WL_CONNECTED=3,WIFI_SCAN_RUNNING=-1,WIFI_AP=1,WIFI_AP_STA=3;
struct {int status(){return WL_CONNECTED;}IPAddress localIP(){return IPAddress(192,168,1,70);}IPAddress softAPIP(){return IPAddress(192,168,4,1);}String SSID(){return "School";}int RSSI(){return -45;}int getMode(){return WIFI_AP_STA;}int scanComplete(){return 0;}int channel(){return 6;}} WiFi;
struct HostClient {IPAddress remoteIP(){return IPAddress(192,168,4,2);}IPAddress localIP(){return IPAddress(192,168,4,1);}};
class WebServer {
 HostClient connection;
 public:
 explicit WebServer(int){}virtual ~WebServer(){}virtual HostClient& client(){return connection;}
 template<class... A>void on(A...){}String uri(){return "/api/status";}HTTPMethod method(){return HTTP_GET;}
 String arg(const String&){return "";}String header(const String&){return "";}
 void sendHeader(const String&,const String&,bool=false){}void send(int,const char*,const String&){}
};
