#pragma once
#include <WebServer.h>
// Chrome may open an idle speculative socket before the app's API request.
// Do not let that one socket monopolise the single-client HTTP server for 5 s.
class FlightHttpServer : public WebServer {
public:
 using WebServer::WebServer;
 bool secureContext=false;String securePath,keys[64],values[64];int secureCount=0;
 String arg(const String& name) const {if(!secureContext)return WebServer::arg(name);for(int i=0;i<secureCount;i++)if(keys[i]==name)return values[i];return String();}
 String arg(int i) const {return secureContext?(i>=0&&i<secureCount?values[i]:String()):WebServer::arg(i);}
 bool hasArg(const String& name) const {if(!secureContext)return WebServer::hasArg(name);for(int i=0;i<secureCount;i++)if(keys[i]==name)return true;return false;}
 void setSecureArg(const String& k,const String& v){for(int i=0;i<secureCount;i++)if(keys[i]==k){values[i]=v;return;}if(secureCount<64){keys[secureCount]=k;values[secureCount++]=v;}}
 void handleClient() override {
  if(_currentStatus==HC_WAIT_READ&&!_currentClient.available()&&
     (uint32_t)(millis()-_statusChange)>250){
   _currentClient.stop();_currentClient=NetworkClient();_currentStatus=HC_NONE;
   _currentUpload.reset();_currentRaw.reset();
  }
  WebServer::handleClient();
 }
};
