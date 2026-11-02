#pragma once
// One NVS value commits the desired radio AND input profile before radio loss.
// Saving a selection never arms input or restores a previous controller lease.
static bool zjHandoverSaved=false;
static String zjHandoverState="IDLE",zjHandoverError,zjHandoverTargetInput="AUTO";
static String zjLastStaInput="ANDROID_WEBRTC",zjHandoverPreviousMode;
static uint32_t zjHandoverRevision=0;
static String zjHandoverLastReject="NONE";
static bool zjHandoverDiagnosticArmReleased=false;
// PPM INPUT ARM is a diagnostic flag, not an actuator enable. Switching radio
// may clear it only at low physical throttle with every motor output disabled.
static bool zjPpmDiagnosticRadioSafe(){
 return zjRcOwned&&zjRcSource=="PPM"&&!zjRcNetwork&&
  zjPpmSignalFresh(millis())&&
  !zjMotorSessionActive&&!zjMotorEnabled&&!zjMotorArmed&&
  zjRcThrottle<=1050&&zjPpmAccessSafe();
}
static const char* zjHandoverBlocker(){
 if(zjHandoverPending)return "HANDOVER_PENDING";
 if(zjMotorSessionActive||zjMotorEnabled||zjMotorArmed)return "MOTOR_OUTPUT_ACTIVE";
 if(zjMaintenanceActive)return "MAINTENANCE_ACTIVE";
 if(zjRcOwned&&zjRcSource!="PPM")return "OTHER_CONTROLLER_ACTIVE";
 if(zjRcThrottle>1050)return "RC_THROTTLE_HIGH";
 if(!zjPpmAccessSafe())return "PPM_THROTTLE_HIGH";
 if(zjRcInputArmed&&!zjPpmDiagnosticRadioSafe())return zjRcSource=="PPM"?"PPM_ARM_UNSAFE":"INPUT_ARMED";
 return "NONE";
}
static bool zjStaInputPath(const String& path){return path=="PPM"||path=="WEB_STA"||path=="ANDROID_WEBRTC";}
static String zjPathSource(const String& path){return path=="PPM"?String("PPM"):path=="WEB_STA"?String("WEB"):String("ANDROID");}
static bool zjRadioProfileValid(const String& mode,const String& path,const String& sta){
 return (mode=="ap"||mode=="sta"||mode=="auto")&&zjStaInputPath(sta)&&
  (mode=="ap"?path=="ANDROID_AP":zjStaInputPath(path));
}
static void zjLoadRadioProfile(){
 const String record=zjPrefs.getString("inputProfile","");
 const int a=record.indexOf('|'),b=record.indexOf('|',a+1),c=record.indexOf('|',b+1),d=record.indexOf('|',c+1);
 if(a!=1||record.substring(0,a)!="1"||b<=a||c<=b||d<=c)return;
 const String mode=record.substring(a+1,b),path=record.substring(b+1,c),sta=record.substring(c+1,d);
 const String revision=record.substring(d+1);long parsed=0;
 if(!zjRadioProfileValid(mode,path,sta)||!parseNumber(revision.c_str(),1,1000000000,parsed))return;
 zjMode=mode;zjRcControlPath=path;zjRcSelection=zjPathSource(path);
 zjLastStaInput=sta;zjHandoverTargetInput=path;zjHandoverRevision=uint32_t(parsed);zjHandoverSaved=true;
 zjHandoverState="WAITING_CONTROLLER"; // All RC leases/ARM remain reset on boot.
}
static void zjForgetRadioProfile(){
 zjPrefs.remove("inputProfile");zjHandoverSaved=false;zjHandoverPending=false;
 zjHandoverState="IDLE";zjHandoverError="";zjHandoverLastReject="NONE";zjHandoverDiagnosticArmReleased=false;zjRcControlPath="AUTO";zjRcSelection="AUTO";
}
static const char* zjPrepareRadioHandover(const String& mode,const String& currentRadio,const String& staHint=""){
 const auto reject=[](const char* reason){zjHandoverLastReject=reason;return reason;};
 if(mode!="ap"&&mode!="sta"&&mode!="auto")return reject("invalid_mode");
 const String blocker=zjHandoverBlocker();
 if(blocker=="HANDOVER_PENDING")return reject("handover_busy");
 if(blocker=="MOTOR_OUTPUT_ACTIVE")return reject("stop_motor_setup_first");
 if(blocker=="MAINTENANCE_ACTIVE")return reject("maintenance_active");
 if(blocker=="OTHER_CONTROLLER_ACTIVE")return reject("release_current_controller_first");
 if(blocker!="NONE")return reject("lower_throttle_and_disarm");
 if(mode!="ap"&&!zjSavedSsid.length())return reject("save_sta_credentials_first");
 if(staHint.length()&&!zjStaInputPath(staHint))return reject("invalid_sta_input");
 String sta=zjLastStaInput;
 if(currentRadio=="STA"){
  if(zjStaInputPath(zjRcControlPath))sta=zjRcControlPath;
  else if(zjRcSource=="PPM")sta="PPM";
  else if(zjRcSource=="WEB")sta="WEB_STA";
  // A client releases its own AUTO lease before mode handover. Carry the
  // inferred STA path through that release without changing the old selection
  // or persisting anything until this combined profile is validated and saved.
  else if(zjRcControlPath=="AUTO"&&zjRcSource=="NONE"&&staHint.length())sta=staHint;
 }
 if(staHint.length()&&staHint!=sta)return reject("input_profile_changed");
 const String path=mode=="ap"?String("ANDROID_AP"):sta;
 const uint32_t revision=zjHandoverRevision>=1000000000?1:zjHandoverRevision+1;
 const String record=String("1|")+mode+"|"+path+"|"+sta+"|"+String(revision);
 if(zjPrefs.putString("inputProfile",record)!=record.length()||zjPrefs.getString("inputProfile","")!=record)
  return reject("input_profile_save_failed");
 // No state change above this line: a failed save preserves the old controller.
 zjHandoverPreviousMode=zjMode;zjHandoverRevision=revision;zjLastStaInput=sta;
 zjHandoverDiagnosticArmReleased=zjRcSource=="PPM"&&zjRcInputArmed;
 zjHandoverTargetInput=path;zjHandoverSaved=true;zjHandoverError="";zjHandoverLastReject="NONE";
 zjRcPaused=true;zjRcHandoverPaused=true;zjRcRelease("RADIO_HANDOVER");
 zjPpmSafeFrames=0; // receiver gesture resets on release/new owner
 zjRcControlPath=path;zjRcSelection=zjPathSource(path);zjMode=mode;
 zjHandoverPending=true;zjHandoverState="PREPARED";
 return nullptr;
}
static bool zjRadioHandoverMayApply(){
 if(!zjHandoverPending)return zjAccessCanSwitchRadio();
 if(!zjMotorSessionActive&&!zjMotorEnabled&&!zjMotorArmed&&!zjRcInputArmed&&zjRcThrottle<=1050&&zjPpmAccessSafe())return true;
 zjHandoverPending=false;zjHandoverState="FAILED";zjHandoverError="CONTROLS_CHANGED";
 zjMode=zjHandoverPreviousMode;return false; // RC stays paused; no blind resume.
}
static void zjRadioHandoverApplied(const String& physical){
 if(!zjHandoverPending)return;
 const bool matches=(zjMode=="ap"?physical=="AP":physical=="STA");
 if(!matches)return;
 zjHandoverPending=false;zjHandoverState="WAITING_CONTROLLER";zjRcPaused=false;zjRcHandoverPaused=false;
 // PPM admission still needs its fresh low/ARM-OFF handshake; Android/Web need
 // a NEW explicit claim/ARM. No old session or armed frame is restored.
}
static void zjRadioHandoverFailed(const String& reason){
 if(!zjHandoverPending)return;
 zjHandoverPending=false;zjHandoverState="FAILED";zjHandoverError=reason;zjRcPaused=true;
}
static String zjRadioHandoverStatus(){
 const bool ppmFresh=zjPpmSignalFresh(millis());
 return String("{\"version\":1,\"profileSaved\":")+(zjHandoverSaved?"true":"false")+
  ",\"revision\":"+String(zjHandoverRevision)+",\"state\":\""+zjHandoverState+"\",\"error\":\""+zjHandoverError+
  "\",\"mode\":\""+zjMode+"\",\"targetInput\":\""+zjHandoverTargetInput+"\",\"lastStaInput\":\""+zjLastStaInput+
  "\",\"preflightBlocker\":\""+zjHandoverBlocker()+"\",\"lastReject\":\""+zjHandoverLastReject+
  "\",\"ppmPresent\":"+(ppmFresh?"true":"false")+",\"ppmThrottleUs\":"+String(ppmFresh?zjPpmValues[zjPpmMap[2]]:0)+
  ",\"rcSource\":\""+zjRcSource+"\",\"rcInputArmed\":"+(zjRcInputArmed?"true":"false")+
  ",\"rcThrottleUs\":"+String(zjRcThrottle)+",\"motorsDisabled\":"+(zjMotorEnabled?"false":"true")+
  ",\"motorSessionActive\":"+(zjMotorSessionActive?"true":"false")+
  ",\"diagnosticArmReleased\":"+(zjHandoverDiagnosticArmReleased?"true":"false")+"}";
}
