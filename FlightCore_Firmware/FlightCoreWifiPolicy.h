#pragma once
// Exactly one connected Wi-Fi interface: manual AP, or STA with AP fallback.
// Arduino's scan API may briefly enable an unassociated STA interface while
// listing routers from AP setup; it must never associate until the AP is off.
#include "FlightCoreWifiRetryPolicy.h"
static uint32_t zjNetSwitchAt=0,zjTestStartAt=0;
static String zjPendingMode;
static int zjWifiTried=0;
static void zjEnsureAP(){
 WiFi.setAutoReconnect(false);WiFi.disconnect(false,false);
 if(zjApStarted&&WiFi.getMode()==WIFI_AP&&WiFi.softAPIP()==IPAddress(192,168,4,1))return;
 WiFi.mode(WIFI_AP);
 WiFi.softAPConfig(IPAddress(192,168,4,1),IPAddress(192,168,4,1),IPAddress(255,255,255,0));
 const bool started=WiFi.softAP(zjApSsid.c_str(),zjApPass.c_str(),1,false,4);zjApStarted=started;
 if(Serial.availableForWrite()>90){Serial.print("ZJNET,AP,");Serial.print(started?"READY,":"ERROR,");Serial.println(zjApSsid);}
}
static void zjEnsureSTA(){
 WiFi.setAutoReconnect(false);
 if(zjApStarted||(WiFi.getMode()&WIFI_AP))WiFi.softAPdisconnect(true);
 zjApStarted=false;WiFi.mode(WIFI_STA);WiFi.disconnect(false,false);
}
static void zjConnectSaved(bool reset=true){
 if(!zjSavedSsid.length()){zjPhase="ap_no_saved_wifi";zjEnsureAP();return;}
 if(reset){
   // Always begin from the saved preferred profile after reboot, STA selection,
   // or AP fallback. Earlier authentication failures must not reorder NVS.
   zjWifiAttemptIndex=0;zjWifiTried=0;
  }
 zjEnsureSTA();
 if(zjWifiCount){zjWifiAttemptIndex%=zjWifiCount;WiFi.begin(zjWifiProfiles[zjWifiAttemptIndex].ssid.c_str(),zjWifiProfiles[zjWifiAttemptIndex].pass.c_str());}
 else WiFi.begin(zjSavedSsid.c_str(),zjSavedPass.c_str());
 zjStaDisconnectReason=0;zjNetAttempt=millis();zjNetTesting=false;zjPhase="sta_connecting";
}
static void zjScheduleMode(const String& mode){
 zjPendingMode=mode;zjNetSwitchAt=millis()+400;
}
static void zjScheduleWifiTest(){
 zjStaDisconnectReason=0;zjLastStaFailureReason=0;zjWifiTestState="testing";
 zjNetTesting=true;zjTestStartAt=millis()+400;zjPhase="testing_wifi";
}
static void zjWifiPolicyLoop(uint32_t now){
 // Send the signed HTTP / USB acknowledgement before removing its interface.
 if(zjPendingMode.length()&&int32_t(now-zjNetSwitchAt)>=0){
  const String mode=zjPendingMode;zjPendingMode="";
  if(mode=="ap"){zjEnsureAP();zjPhase="ap_manual";}
  else zjConnectSaved();
 }
 if(zjNetTesting&&zjTestStartAt&&int32_t(now-zjTestStartAt)>=0){
  zjTestStartAt=0;zjTestConnectedAt=0;zjTestAssociationEpoch=zjAssociationEpoch;
  zjEnsureSTA();WiFi.begin(zjPendingSsid.c_str(),zjPendingPass.c_str());zjNetAttempt=millis();
 }
 if(zjNetTesting||zjPendingMode.length())return;
 if(zjMode=="ap")return; // manual AP never leaves for a saved router
 if(WiFi.status()==WL_CONNECTED){
  // Enforce the invariant even after a scan or a legacy mode migration.
  if(zjApStarted||(WiFi.getMode()&WIFI_AP)){WiFi.softAPdisconnect(true);zjApStarted=false;WiFi.mode(WIFI_STA);}
  zjPhase="sta_connected";return;
 }
 if(zjPhase=="sta_connecting"){
  if(int32_t(now-zjNetAttempt)<=int32_t(zjSavedAttemptTimeoutMs(zjStaDisconnectReason)))return;
  const int count=zjWifiCount?zjWifiCount:1;
  if(++zjWifiTried<count){zjWifiAttemptIndex=(zjWifiAttemptIndex+1)%count;zjConnectSaved(false);return;}
  zjEnsureAP();zjPhase="sta_failed_ap_fallback";
   zjNetNextRetry=millis()+zjSavedRetryDelayMs(zjStaDisconnectReason);return;
 }
 if(zjSavedSsid.length()&&int32_t(now-zjNetNextRetry)>=0){
  // Keep fallback AP available while somebody is using it. A manual STA
  // selection overrides this idle retry guard through zjScheduleMode().
  if(zjRcOwned||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt||zjUsbScanning||WiFi.softAPgetStationNum()>0)zjNetNextRetry=now+30000;
  else zjConnectSaved();
 }
}
