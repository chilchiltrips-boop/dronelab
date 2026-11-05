#pragma once
// Signed local AP/STA reads and verified physical USB share the same snapshot.
// Only the small page copy uses the control lock. JSON and I/O run in loop().
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
static constexpr unsigned ZJ_TRACE_NETWORK_PAGE=8,ZJ_TRACE_USB_PAGE=4;

static void zjTraceJsonRow(String& out,const ZjRateTraceSample& row){
 const uint32_t values[]={row.atUs,row.dtUs,row.triggerUs,uint32_t(row.event),uint32_t(row.reason),uint32_t(row.source),
  row.inputSeq,row.inputAccepted,row.inputGeneration,row.inputAgeMs,row.imuAgeUs,row.missedTicks,row.revision,row.pidGeneration,
  row.profile,row.flags,row.throttleUsed,row.pidSaturationMask,row.mixClipMask,uint32_t(row.owner)};
 out+='[';
 for(unsigned i=0;i<sizeof(values)/sizeof(values[0]);i++){
  if(i)out+=',';
  out+=String(values[i]);
 }
 for(const auto* pulses:{row.channels,row.requested,row.applied})
  for(unsigned i=0;i<4;i++){out+=',';out+=String(pulses[i]);}
 for(const auto& axis:row.axes){
  const float terms[]={axis.target,axis.measured,axis.p,axis.i,axis.d,axis.correction};
  for(const auto value:terms){out+=',';out+=std::isfinite(value)?String(value,3):String("null");}
 }
 out+=']';
}

static const char* zjFlightTracePage(const String& boot,const String& captureArg,const String& offsetArg,unsigned limit,String& out){
 if(!zjControlRuntimeReady)return "UNSUPPORTED";
 if(boot!="-"&&boot!=zjBootId)return "BOOT_CHANGED";
 if(zjRcInputArmed||zjMotorEnabled||zjMotorArmed||zjMotorSessionActive||zjMaintenanceActive||
    zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt)return "DISARM_BEFORE_TRACE_READ";
 uint32_t expected=0,offset=0;
 if(!zjPidUnsigned(captureArg,UINT32_MAX,expected)||!zjPidUnsigned(offsetArg,ZjRateTrace::MAX_ROWS,offset)||
    (!expected&&offset))return "INVALID_TRACE_REQUEST";
 if(expected&&boot=="-")return "BOOT_CHANGED";

 ZjRateTraceSample rows[ZJ_TRACE_NETWORK_PAGE];
 uint32_t capture=0;
 unsigned total=0,count=0;
 const char* error=nullptr;
 portENTER_CRITICAL(&zjTimingMux);
 if(zjFlightTrace.active){
  // Export can end a disarmed shadow preview. An input/flight run must
  // first be frozen by its terminal control tick so that event is retained.
  if(!expected&&zjTracePendingFault==ZjFlightFault::NONE&&(zjFlightTrace.last.flags&ZJ_TRACE_PREVIEW)){
   auto last=zjFlightTrace.last;last.triggerUs=micros();
   zjFlightTrace.freeze(last,ZjRateTraceEvent::EXPORT,ZjFlightFault::NONE);
  }else error="TRACE_STILL_RECORDING";
 }
 total=zjFlightTrace.size();capture=total?zjFlightTrace.capture:0;
 if(!error&&expected&&expected!=capture)error="TRACE_CHANGED";
 if(!error&&total&&offset>=total)error="INVALID_TRACE_OFFSET";
 if(!error){
  count=std::min<unsigned>(limit,total-offset);
  for(unsigned n=0;n<count;n++)zjFlightTrace.read(offset+n,rows[n]);
 }
 portEXIT_CRITICAL(&zjTimingMux);
 if(error)return error;

 out.reserve(192+count*380);
 out=String("{\"version\":1,\"kitId\":")+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+
  ",\"firmwareVersion\":"+zjJson(FW_VERSION)+
  ",\"capture\":"+String(capture)+",\"offset\":"+String(offset)+",\"total\":"+String(total)+
  ",\"sampleHz\":"+String(ZjRateTrace::SAMPLE_HZ)+",\"rows\":[";
 for(unsigned n=0;n<count;n++){
  if(n)out+=',';
  zjTraceJsonRow(out,rows[n]);
 }
 out+="]}";
 return nullptr;
}
#endif

static void zjSetupFlightTraceHttp(){
 zjHttp.on("/api/flight/trace",HTTP_POST,[](){
  if(!zjAllow())return;
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
  const String boot=zjArg("bootId");
  String body;
  const char* error=boot!=zjBootId?"BOOT_CHANGED":
   zjFlightTracePage(boot,zjArg("capture"),zjArg("offset"),ZJ_TRACE_NETWORK_PAGE,body);
  if(error)zjReply(409,String("{\"error\":")+zjJson(error)+"}");
  else zjReply(200,body);
#else
  zjReply(404,"{\"error\":\"UNSUPPORTED\"}");
#endif
 });
}

static bool zjFlightSerialCommand(char* line){
 const bool trace=!strncmp(line,"ZJTRACE,",8);
 if(!trace&&strncmp(line,"ZJFLIGHT,",9))return false;
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
 char* rest=nullptr;
 const String action=strtok_r(line+(trace?8:9),",",&rest);
 const String kit=strtok_r(nullptr,",",&rest),request=strtok_r(nullptr,",",&rest);
 const String boot=strtok_r(nullptr,",",&rest);
 if(kit!=zjKitId||!zjPidToken(request)){Serial.println("ZJFLIGHT,ERR,INVALID_REQUEST_OR_DEVICE");return true;}
 String reply;
 const char* error=nullptr;
 if(trace&&action=="READ"){
  const String capture=strtok_r(nullptr,",",&rest),offset=strtok_r(nullptr,",",&rest);
  error=strtok_r(nullptr,",",&rest)?"INVALID_TRACE_REQUEST":zjFlightTracePage(boot,capture,offset,ZJ_TRACE_USB_PAGE,reply);
 }else if(!trace&&action=="ARM"){
  static uint32_t lastArmNonce=0;
  uint32_t nonce=0;
  const String value=strtok_r(nullptr,",",&rest);
  if(!zjAdminAuthorized())error="ADMIN_LOCKED";
  else if(boot!=zjBootId)error="BOOT_CHANGED";
  else if(strtok_r(nullptr,",",&rest)||!zjPidUnsigned(value,UINT32_MAX,nonce)||nonce<=lastArmNonce)error="INVALID_OR_REPLAYED_ARM";
  else{
   lastArmNonce=nonce;
   const auto fault=zjControlArmFlight();
   if(fault!=ZjFlightFault::NONE)error=zjFlightFaultName(fault);
   else reply="ARMED";
  }
 }else error="UNSUPPORTED_ACTION";
 Serial.print(trace?"ZJTRACE,":"ZJFLIGHT,");
 Serial.print(error?"NACK,":"ACK,");
 Serial.print(kit);Serial.print(',');Serial.print(request);Serial.print(',');
 if(error)Serial.println(error);else Serial.println(reply);
#else
 Serial.println("ZJFLIGHT,ERR,UNSUPPORTED");
#endif
 return true;
}
