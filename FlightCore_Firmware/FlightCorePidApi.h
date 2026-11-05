#pragma once
// Included after signed network authentication and the motor/maintenance guards.
static String zjPidReply(const String& requestId=""){
 String out=String("{\"version\":1,\"schemaVersion\":1,\"supported\":")+
  (zjPidSupported()?"true":"false")+",\"actuating\":false,\"kitId\":"+zjJson(zjKitId)+
  ",\"bootId\":"+zjJson(zjBootId)+",\"revision\":"+String(zjPidSettings.revision)+
  ",\"persisted\":"+(zjPidSettings.persisted?"true":"false")+
  ",\"requestId\":"+zjJson(requestId)+",\"savedRequestId\":"+zjJson(zjPidSettings.requestId);
 for(unsigned axis=0;axis<3;axis++){
  const auto gains=zjPidSettings.axis(axis);
  out+=String(",\"")+ZJ_PID_AXES[axis]+"\":{\"p\":"+String(gains.p,3)+",\"i\":"+String(gains.i,3)+",\"d\":"+String(gains.d,3)+"}";
 }
 return out+"}";
}
static bool zjPidWriteIdle(){
 return !zjMotorArmed&&!zjMotorEnabled&&!zjMotorSessionActive&&!zjRcInputArmed&&zjRcThrottle<=1050&&
  !zjNetTesting&&!zjUsbScanning&&!zjOtaAuthorized&&!zjSecureOtaActive&&!zjOtaRebootAt&&
  !zjMaintenanceActive&&!zjHandoverPending&&!zjImuMaintenanceBusy();
}
static const char* zjPidChange(bool reset,const String& boot,const String& requestId,const String& expected,const String& gains){
 if(!zjPidSupported())return "UNSUPPORTED";
 if(boot!=zjBootId)return "BOOT_CHANGED";
 if(!zjPidWriteIdle())return "DISARM_OR_WAIT_FOR_MAINTENANCE";
 ZjPidSettings next;
 uint32_t revision=0;
 if(!zjPidToken(requestId)||!zjPidUnsigned(expected,UINT32_MAX,revision)||
    (reset?!gains.isEmpty():!zjPidParseGains(gains,next)))return "INVALID_PID_SETTINGS";
 next.requestId=requestId;
 return zjPidSave(zjKitPrefs,next,revision);
}
static void zjPidHttpChange(bool reset){
 if(!zjAllow())return;
 if(!zjAuthAdmin&&(zjRequestSession<0||zjSessions[zjRequestSession].localSta||
    (zjRcOwned&&zjRcNetwork))){
  zjReply(403,"{\"error\":\"PID_WRITE_NOT_AUTHORIZED\"}");return;
 }
 const String id=zjArg("requestId");
 const char* error=zjPidChange(reset,zjArg("bootId"),id,zjArg("expectedRevision"),zjArg("gains"));
 if(error){
  const String reason(error);
  zjReply(reason=="STORAGE_FAILED"?500:reason=="INVALID_PID_SETTINGS"?400:409,
   String("{\"error\":")+zjJson(reason)+"}");
  return;
 }
 zjReply(200,zjPidReply(id));
}
static void zjSetupPidHttp(){
 zjHttp.on("/api/pid/settings",HTTP_GET,[](){if(zjAllow())zjReply(200,zjPidReply());});
 zjHttp.on("/api/pid/status",HTTP_GET,[](){if(zjAllow())zjReply(200,zjPidReply());});
 zjHttp.on("/api/pid/settings",HTTP_POST,[](){zjPidHttpChange(false);});
 zjHttp.on("/api/pid/reset",HTTP_POST,[](){zjPidHttpChange(true);});
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
 }else if(action=="SET"||action=="RESET"){
  const String boot=strtok_r(nullptr,",",&rest),revision=strtok_r(nullptr,",",&rest),gains=strtok_r(nullptr,",",&rest);
  if(strtok_r(nullptr,",",&rest))error="INVALID_PID_SETTINGS";
  else if(!zjAdminAuthorized())error="ADMIN_LOCKED";
  else error=zjPidChange(action=="RESET",boot,request,revision,gains);
 }else error="INVALID_PID_ACTION";
 Serial.print(error?"ZJPID,NACK,":"ZJPID,ACK,");
 Serial.print(kit);Serial.print(',');Serial.print(request);Serial.print(',');
 if(error)Serial.println(error);else Serial.println(zjPidReply(request));
 return true;
}
