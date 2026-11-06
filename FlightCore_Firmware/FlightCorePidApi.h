#pragma once
// Included after signed network authentication and the motor/maintenance guards.
static bool zjPidLayoutMatches(bool plus);
static String zjPidConfigJson(const ZjPidSettings& config){
 String out=String("{\"profile\":")+zjJson(ZJ_PID_PROFILES[config.profile].id);
 for(unsigned axis=0;axis<ZJ_PID_GAIN_COUNT/3;axis++){
  const auto gains=config.axis(axis);
  out+=String(",\"")+ZJ_PID_AXES[axis]+"\":{\"p\":"+String(gains.p,3)+",\"i\":"+String(gains.i,3)+",\"d\":"+String(gains.d,3)+"}";
 }
 return out+"}";
}
static String zjPidReply(const String& requestId=""){
 if(zjPidStorageUncertain)zjPidLoad(zjKitPrefs);
 const auto shadow=zjReadRateShadow();
 const char* storage=zjPidStorageCorrupt?"CORRUPT":!zjPidSettings.persisted?"DEFAULTS":
  zjPidLoadedSlot>=0&&zjPidLoadedSlot!=zjPidHead.slot?"RECOVERED":"VERIFIED";
 return String("{\"version\":1,\"schemaVersion\":2,\"supported\":")+(zjPidSupported()?"true":"false")+
  ",\"actuating\":"+(shadow.actuating?"true":"false")+",\"kitId\":"+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+
  ",\"revision\":"+String(zjPidSettings.revision)+",\"persisted\":"+(zjPidSettings.persisted?"true":"false")+
  ",\"requestId\":"+zjJson(requestId)+",\"savedRequestId\":"+zjJson(zjPidSettings.requestId)+
  ",\"storageState\":"+zjJson(storage)+",\"wiredLayout\":"+zjJson(zjPidLayoutMatches(true)?"A2_QUAD_PLUS":zjPidLayoutMatches(false)?"A2_QUAD_X":"")+
  ",\"saved\":"+zjPidConfigJson(zjPidSettings)+
  ",\"active\":"+zjPidConfigJson(zjPidActive)+",\"activeRequestId\":"+zjJson(zjPidActive.requestId)+
  ",\"activeGeneration\":"+String(zjPidGeneration)+",\"preview\":"+(zjPidPreview?"true":"false")+
  ",\"diagnosticState\":"+zjJson(shadow.reason)+"}";
}
static bool zjPidWriteIdle(){
 return zjMotorOutputsDisabled()&&!zjMotorSessionActive&&!zjRcInputArmed&&zjRcThrottle<=1050&&
  !zjNetTesting&&!zjUsbScanning&&!zjOtaAuthorized&&!zjSecureOtaActive&&!zjOtaRebootAt&&
  !zjMaintenanceActive&&!zjHandoverPending&&!zjImuMaintenanceBusy();
}
enum class ZjPidAction {SET,RESET,APPLY};
static const char* zjPidChange(ZjPidAction action,const String& boot,const String& requestId,const String& expected,
                                const String& expectedGeneration,const String& profileId,const String& gains){
 if(!zjPidSupported())return "UNSUPPORTED";
 if(boot!=zjBootId)return "BOOT_CHANGED";
 if(!zjPidWriteIdle())return "DISARM_OR_WAIT_FOR_MAINTENANCE";
 if(zjPidStorageCorrupt||zjPidStorageUncertain)return "PID_STORAGE_UNVERIFIED";
 uint32_t revision=0,generation=0;
 const int profile=zjPidProfileIndex(profileId);
 if(profile<0||!zjPidToken(requestId)||!zjPidUnsigned(expected,UINT32_MAX,revision)||
    !zjPidUnsigned(expectedGeneration,UINT32_MAX,generation))return "INVALID_PID_SETTINGS";
 ZjPidSettings next(profile);
 if(action==ZjPidAction::RESET?!gains.isEmpty():!zjPidParseGains(gains,next))return "INVALID_PID_SETTINGS";
 if(!zjPidLayoutMatches(ZJ_PID_PROFILES[profile].plus))return "PROFILE_WIRING_MISMATCH";
 next.requestId=requestId;
 if(action!=ZjPidAction::APPLY&&requestId==zjPidSettings.requestId)
  return zjPidSave(zjKitPrefs,next,revision);
 if(action==ZjPidAction::APPLY&&zjPidPreview&&requestId==zjPidActive.requestId)
  return revision==zjPidSettings.revision&&zjPidSame(next,zjPidActive)?nullptr:"REQUEST_ID_REUSED";
 if(revision!=zjPidSettings.revision||generation!=zjPidGeneration)return "REVISION_CONFLICT";
 if(action==ZjPidAction::APPLY){
  next.revision=revision;zjPidActivate(next,true);return nullptr;
 }
 return zjPidSave(zjKitPrefs,next,revision);
}
static void zjPidHttpChange(ZjPidAction action){
 if(!zjAllow())return;
 if(!zjAuthAdmin&&(zjRequestSession<0||zjSessions[zjRequestSession].localSta||
    (zjRcOwned&&zjRcNetwork))){
  zjReply(403,"{\"error\":\"PID_WRITE_NOT_AUTHORIZED\"}");return;
 }
 const String id=zjArg("requestId");
 const char* error=zjPidChange(action,zjArg("bootId"),id,zjArg("expectedRevision"),
  zjArg("expectedGeneration"),zjArg("profile"),zjArg("gains"));
 if(error){
  const String reason(error);
  zjReply(reason.startsWith("STORAGE")?500:reason=="INVALID_PID_SETTINGS"?400:409,
   String("{\"error\":")+zjJson(reason)+"}");
  return;
 }
 zjReply(200,zjPidReply(id));
}
static void zjSetupPidHttp(){
 zjHttp.on("/api/pid/settings",HTTP_GET,[](){if(zjAllow())zjReply(200,zjPidReply());});
 zjHttp.on("/api/pid/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjPidReply());});
 zjHttp.on("/api/pid/settings",HTTP_POST,[](){zjPidHttpChange(ZjPidAction::SET);});
 zjHttp.on("/api/pid/reset",HTTP_POST,[](){zjPidHttpChange(ZjPidAction::RESET);});
 zjHttp.on("/api/pid/apply",HTTP_POST,[](){zjPidHttpChange(ZjPidAction::APPLY);});
}
static bool zjPidSerialCommand(char* line){
 if(strncmp(line,"ZJPID,",6))return false;
 char* rest=nullptr;
 const String action=strtok_r(line+6,",",&rest);
 const String kit=strtok_r(nullptr,",",&rest),request=strtok_r(nullptr,",",&rest);
 if(kit!=zjKitId||!zjPidToken(request)){Serial.println("ZJPID,ERR,INVALID_REQUEST_OR_DEVICE");return true;}
 const char* error=nullptr;
 if(action=="GET"){
  if(strtok_r(nullptr,",",&rest))error="INVALID_PID_SETTINGS";
 }else if(action=="SET"||action=="RESET"||action=="APPLY"){
  const String boot=strtok_r(nullptr,",",&rest),revision=strtok_r(nullptr,",",&rest);
  const String generation=strtok_r(nullptr,",",&rest),profile=strtok_r(nullptr,",",&rest),gains=strtok_r(nullptr,",",&rest);
  if(strtok_r(nullptr,",",&rest))error="INVALID_PID_SETTINGS";
  else if(!zjAdminAuthorized())error="ADMIN_LOCKED";
  else error=zjPidChange(action=="RESET"?ZjPidAction::RESET:action=="APPLY"?ZjPidAction::APPLY:ZjPidAction::SET,
   boot,request,revision,generation,profile,gains);
 }else error="INVALID_PID_ACTION";
 Serial.print(error?"ZJPID,NACK,":"ZJPID,ACK,");
 Serial.print(kit);Serial.print(',');Serial.print(request);Serial.print(',');
 if(error)Serial.println(error);else Serial.println(zjPidReply(request));
 return true;
}
