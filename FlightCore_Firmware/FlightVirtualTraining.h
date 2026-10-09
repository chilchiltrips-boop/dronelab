#pragma once
VirtualPid virtualPid;volatile bool trainingFcPid=false;uint32_t virtualSensorAt=0,virtualSensorSeq=0;String virtualSensorOwner;float virtualSensor[5]={},virtualMotors[4]={1000,1000,1000,1000};bool virtualArmed=false;uint32_t virtualOutputAt=0,virtualOutputSeq=0;
void resetVirtualTraining(){portENTER_CRITICAL(&stateMux);trainingFcPid=false;virtualSensorAt=virtualSensorSeq=virtualOutputAt=virtualOutputSeq=0;virtualArmed=false;for(float& m:virtualMotors)m=1000;portEXIT_CRITICAL(&stateMux);virtualSensorOwner="";}
void runVirtualTraining(){
 uint16_t rc[10];float sensors[5];FlightPidSettings pid;uint32_t now=millis(),sample=0,sequence=0,run=0,revision=0;bool enabled=false;
 portENTER_CRITICAL(&stateMux);enabled=trainingActive&&trainingFcPid&&!armed&&benchMode==BENCH_NONE;sample=virtualSensorAt;sequence=virtualSensorSeq;run=trainingRunId;revision=pidRevision;pid=flightPid;memcpy(sensors,virtualSensor,sizeof(sensors));portEXIT_CRITICAL(&stateMux);
 copyActiveRc(rc,trainingInput==2?RC_PPM:chooseRcSource());bool fresh=enabled&&sample&&now-sample<=180&&(trainingInput==2?receiverFresh():webRcFresh());
 virtualPid.tick(run,revision,fresh,rc,sensors,pid,flightSettings,.004f);
 portENTER_CRITICAL(&stateMux);virtualArmed=enabled&&virtualPid.armed;memcpy(virtualMotors,virtualPid.motors,sizeof(virtualMotors));virtualOutputSeq=sequence;virtualOutputAt=now;portEXIT_CRITICAL(&stateMux);
}
String virtualTrainingJson(){float motors[4];bool a;uint32_t seq,at;portENTER_CRITICAL(&stateMux);memcpy(motors,virtualMotors,sizeof(motors));a=virtualArmed;seq=virtualOutputSeq;at=virtualOutputAt;portEXIT_CRITICAL(&stateMux);
 String j="{\"ok\":true,\"deviceId\":\""+deviceId+"\",\"runId\":"+String(trainingRunId)+",\"engine\":\""+String(trainingFcPid?"FC_PID":"WEB")+"\",\"outputsBlocked\":"+String(trainingActive?"true":"false")+",\"virtualArmed\":"+String(a?"true":"false")+",\"sensorSeq\":"+String(seq)+",\"sampleMs\":"+String(at)+",\"pidRevision\":"+String(pidRevision)+",\"motors\":[";for(int i=0;i<4;i++){if(i)j+=",";j+=String(motors[i],3);}return j+"]}";
}
bool virtualTrainingCommand(const String& type){
 if(type!="training_sensor"&&type!="training_engine")return false;
 if(!FLIGHT_CONTROL_ENABLED||!server.secureContext||!trainingActive||armed||benchMode!=BENCH_NONE||!trainingAppOwned||server.arg("runId").toInt()!=trainingRunId){sendMessage(423,"FC PID training needs a paired kit, active app run and blocked physical outputs");return true;}
 if(type=="training_engine"){
  String engine=server.arg("engine");if(engine!="FC_PID"&&engine!="WEB"){sendMessage(400,"Choose WEB or FC_PID");return true;}
  if(virtualSensorOwner.length()&&virtualSensorOwner!=server.arg("clientId")){sendMessage(423,"Another paired laptop owns the sensor bridge");return true;}
  if(engine=="WEB"){resetVirtualTraining();sendJson(200,virtualTrainingJson());return true;}
  virtualSensorOwner=server.arg("clientId");portENTER_CRITICAL(&stateMux);virtualSensorAt=virtualSensorSeq=0;trainingFcPid=true;portEXIT_CRITICAL(&stateMux);sendJson(200,virtualTrainingJson());return true;
 }
 if(!trainingFcPid||virtualSensorOwner!=server.arg("clientId")){sendMessage(403,"Start the FC PID bridge on this laptop first");return true;}
 float sensors[]={argFloat("roll",NAN),argFloat("pitch",NAN),argFloat("rollRate",NAN),argFloat("pitchRate",NAN),argFloat("yawRate",NAN)};uint32_t seq=strtoul(server.arg("sensorSeq").c_str(),nullptr,10);
 bool valid=seq>virtualSensorSeq;for(int i=0;i<5;i++)if(!isfinite(sensors[i])||fabsf(sensors[i])>(i<2?180:1000))valid=false;
 if(!valid){sendMessage(409,"Invalid or replayed virtual sensor sample");return true;}
 portENTER_CRITICAL(&stateMux);memcpy(virtualSensor,sensors,sizeof(sensors));virtualSensorSeq=seq;virtualSensorAt=millis();portEXIT_CRITICAL(&stateMux);sendJson(200,virtualTrainingJson());return true;
}
