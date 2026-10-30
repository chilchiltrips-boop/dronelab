#pragma once
// Resource separation for diagnostics. No actuator or physical PID support.
// Callers must authenticate before invoking transitions; no public Kit code
// or status field authorizes a write. State is RAM-only and bound to a boot.
static bool zjMaintenanceActive=false;
static String zjMaintenanceOwner,zjAccessReason="BOOT";
static uint32_t zjMaintenanceRenewedAt=0;
static constexpr uint32_t ZJ_MAINTENANCE_LEASE_MS=30000;
static void zjAccessLoop(){
 if(zjMaintenanceActive&&zjMaintenanceOwner.length()&&
    uint32_t(millis()-zjMaintenanceRenewedAt)>=ZJ_MAINTENANCE_LEASE_MS){
  zjMaintenanceOwner="";zjAccessReason="MAINTENANCE_LEASE_EXPIRED";
  // Keep RC paused until an authenticated, explicit safe resume.
 }
}
static bool zjPpmAccessSafe(){
 return !zjPpmSignalFresh(millis())||
  (zjPpmValues[zjPpmMap[2]]<=1050&&zjPpmValues[zjPpmMap[4]]<=1300);
}
static bool zjAccessCanSwitchRadio(){
 // A monitoring network is not the PPM producer. Preserve its ISR/ownership;
 // a deliberate radio change still requires disarmed, low physical controls.
 return !zjRcOwned||(zjRcSource=="PPM"&&!zjRcInputArmed&&zjRcThrottle<=1050&&zjPpmAccessSafe());
}
static const char* zjAccessChange(const String& action,const String& source,
 const String& caller,bool ownsCurrent,bool stationary,const String& path="",const String& radio=""){
 zjAccessLoop();
 if(zjMotorSessionActive)return "stop_motor_setup_first";
 if(caller.isEmpty())return "authorization_required";
 if(zjHandoverPending)return "radio_handover_pending";
 if(action=="KEEP"){
  if(!zjMaintenanceActive||zjMaintenanceOwner!=caller)return "not_maintenance_owner";
  zjMaintenanceRenewedAt=millis();return nullptr;
 }
 if(action!="BEGIN"&&action!="RESUME"&&action!="SELECT")return "invalid_access_action";
 if(action!="BEGIN"&&source!="PPM"&&source!="WEB"&&source!="ANDROID")return "invalid_rc_source";
 if(action!="BEGIN"&&!path.isEmpty()){
  if((path=="PPM"&&source!="PPM")||(path=="ANDROID_AP"&&source!="ANDROID")||
     (path=="ANDROID_WEBRTC"&&source!="ANDROID")||(path=="WEB_STA"&&source!="WEB")||
     (path!="PPM"&&path!="ANDROID_AP"&&path!="ANDROID_WEBRTC"&&path!="WEB_STA"))return "invalid_control_path";
  if((path=="ANDROID_AP"&&radio!="AP")||((path=="ANDROID_WEBRTC"||path=="WEB_STA")&&radio!="STA"))return "control_path_requires_matching_wifi";
 }
 if(zjMaintenanceActive&&zjMaintenanceOwner.length()&&zjMaintenanceOwner!=caller)return "maintenance_owned_by_other_session";
 if(action=="SELECT"&&zjMaintenanceActive)return "end_maintenance_explicitly";
 if(action=="RESUME"&&!zjMaintenanceActive)return "maintenance_not_active";
 // Never take an Android/Web/USB producer away from another owner, even when
 // its current accepted throttle is low. Its own release or STOP is required.
 if(zjRcOwned&&zjRcSource!="PPM"&&!ownsCurrent)return "rc_owned_by_other_controller";
 if(zjRcInputArmed||zjRcThrottle>1050||!zjPpmAccessSafe())return "lower_throttle_and_disarm";
 if(action=="BEGIN"&&!stationary)return "fresh_stationary_imu_required";
 if(action!="BEGIN"&&source=="PPM"&&!zjPpmSignalFresh(millis()))return "ppm_signal_required";
 zjRcPaused=true;zjRcHandoverPaused=false;zjRcRelease(action=="BEGIN"?"MAINTENANCE_PAUSE":"EXPLICIT_SOURCE_HANDOVER");
 zjPpmSafeFrames=0;zjPpmArmingLowSeen=false;zjPpmInputSwitchArmed=false;
 if(action=="BEGIN"){
  zjMaintenanceActive=true;zjMaintenanceOwner=caller;zjMaintenanceRenewedAt=millis();
  zjAccessReason="MAINTENANCE_PAUSED";
 }else{
  zjRcSelection=source;zjRcControlPath=path.isEmpty()?String("AUTO"):path;
  zjMaintenanceActive=false;zjMaintenanceOwner="";
  zjRcPaused=false;zjAccessReason="EXPLICIT_SOURCE_SELECTED";
 }
 return nullptr;
}
static String zjAccessState(const String& caller,bool stationary){
 zjAccessLoop();
 const bool held=zjMaintenanceActive&&zjMaintenanceOwner.length();
 const uint32_t remaining=held?ZJ_MAINTENANCE_LEASE_MS-uint32_t(millis()-zjMaintenanceRenewedAt):0;
 return String("{\"version\":1,\"pathVersion\":1,\"controlPath\":\"")+zjRcControlPath+"\",\"selection\":\""+zjRcSelection+"\",\"paused\":"+(zjRcPaused?"true":"false")+
  ",\"handoverPaused\":"+(zjRcHandoverPaused?"true":"false")+",\"stationary\":"+(stationary?"true":"false")+",\"reason\":\""+zjAccessReason+
  "\",\"hardwarePidSupported\":false,\"imuCalibrationSupported\":false,\"maintenance\":{\"active\":"+
  (zjMaintenanceActive?"true":"false")+",\"owned\":"+(held&&zjMaintenanceOwner==caller?"true":"false")+
  ",\"leaseRemainingMs\":"+String(remaining)+"}}";
}
static bool zjAccessSerialCommand(char* line,bool stationary,bool busy,const String& radio=""){
 if(strncmp(line,"ZJACCESS,",9))return false;
 char* save=nullptr;char* action=strtok_r(line+9,",",&save),*id=strtok_r(nullptr,",",&save),
  *token=strtok_r(nullptr,",",&save),*source=strtok_r(nullptr,",",&save),*path=strtok_r(nullptr,",",&save);
 if(!action||!id||String(id)!=zjKitId||!token||!zjAdminValue(token,1,24,false)||strtok_r(nullptr,",",&save)){
  Serial.println("ZJACCESS,ERR,INVALID_REQUEST_OR_DEVICE");return true;
 }
 const char* error=nullptr;
 if(String(action)!="GET"){
  if(!zjAdminAuthorized())error="usb_teacher_authorization_required";
  else if(busy)error="network_or_ota_busy";
  else error=zjAccessChange(action,source?String(source):String(""),"USB",zjRcOwned&&!zjRcNetwork&&zjRcSource=="WEB",stationary,path?String(path):String(""),radio);
 }
 Serial.print(error?"ZJACCESS,NACK,":"ZJACCESS,ACK,");Serial.print(id);Serial.print(',');Serial.print(token);Serial.print(',');
 Serial.println(error?String(error):zjAccessState("USB",stationary));return true;
}
