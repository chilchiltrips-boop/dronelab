#pragma once
// Simulation inhibition may be held by the observing computer or foreground app.
// One public target/run identifies the receiver; private lease tokens stay private.
String trainingOwner,trainingSession,trainingCancelled[16];uint8_t trainingCancelledNext=0;
String trainingRequestOwner;uint32_t trainingRequestId=0,trainingRequestWebAppId=0,trainingRequestExpires=0;uint8_t trainingRequestTarget=0;
bool trainingRequestLive(){return trainingRequestTarget&&trainingRequestOwner==controlOwner&&controlRole=="MOBILE"&&FlightSetupPolicy::live(millis(),trainingRequestExpires);}
void clearTrainingRequest(){trainingRequestTarget=0;trainingRequestWebAppId=trainingRequestExpires=0;trainingRequestOwner="";}
bool trainingWasCancelled(const String& token){for(const String& t:trainingCancelled)if(t==token)return true;return false;}
void cancelTrainingToken(const String& token){if(!setupTokenValid(token)||trainingWasCancelled(token))return;trainingCancelled[trainingCancelledNext++%16]=token;}
void finishTraining(){
 clearTrainingWebApp();resetVirtualTraining();
 setupAfterNeutral=true;armLowSeen=false;resetArmGesture();invalidateRcUdp();webRcLastMs=0;benchStop();disarmFlight("Training ended: neutral and manual ARM required");trainingActive=false;trainingTarget=0;trainingRunId++;
}
void serviceTraining(){if(trainingActive&&(!FlightSetupPolicy::live(millis(),trainingExpires)||(trainingAppOwned&&(controlOwner!=trainingOwner||!FlightSetupPolicy::live(millis(),controlExpiresAt)||!trainingWebAppLive()))))finishTraining();}
String trainingJson(){String j=String("{\"ok\":true,\"deviceId\":\"")+deviceId+"\",\"fcPidSupported\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"engine\":\""+String(trainingFcPid?"FC_PID":"WEB")+"\",\"supported\":true,\"selectionSupported\":true,\"simulationRcTransport\":\"UDP\",\"simulationRcProtocol\":\"ZRC2\",\"active\":"+String(trainingActive?"true":"false")+",\"outputsBlocked\":"+String(trainingActive?"true":"false")+",\"input\":\""+String(trainingInput==2?"PPM":"APP")+"\",\"target\":\""+String(trainingTarget==1?"TRIPOD":trainingTarget==2?"FLIGHT":"NONE")+"\",\"controller\":\""+String(trainingAppOwned?"APP":"WEB")+"\",\"runId\":"+String(trainingRunId)+",\"webAppRouting\":true,\"trainingWebAppId\":\""+String(trainingWebAppId?trainingWebAppId:0)+"\",\"leaseMs\":5000}";j.remove(j.length()-1);j+=String(",\"requesting\":")+String(trainingRequestLive()?"true":"false")+",\"requestId\":"+String(trainingRequestId)+",\"requestWebAppId\":\""+String(trainingRequestWebAppId)+"\",\"requestedTarget\":\""+String(trainingRequestTarget==1?"TRIPOD":trainingRequestTarget==2?"FLIGHT":"NONE")+"\"";return j+"}";}
bool trainingCommand(const String& type){
 if(!type.startsWith("training_"))return false;serviceTraining();
 if(type=="training_status"){sendJson(200,trainingJson());return true;}
 if(!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Exact Device ID is required for training");return true;}
 if(type=="training_request"||type=="training_stop"){
  uint32_t browser=requestingWebAppId();if(!browser){sendMessage(403,"Connect this WebApp to the same kit AP first");return true;}
  if(type=="training_stop"){
   if(trainingActive&&!scopedTrainingBrowser()){sendMessage(403,"Another WebApp owns this simulator");return true;}
   if(trainingRequestLive()&&browser!=trainingRequestWebAppId){sendMessage(403,"Another WebApp requested this simulator");return true;}
   clearTrainingRequest();if(trainingActive)finishTraining();sendJson(200,trainingJson());return true;
  }
  String target=server.arg("target");if(target!="TRIPOD"&&target!="FLIGHT"){sendMessage(400,"Choose TRIPOD or FLIGHT on the WebApp");return true;}
  if(!lockActive()||controlRole!="MOBILE"){sendMessage(409,"Connect the Android joystick to this kit first");return true;}
  if(effectiveArmed()||benchMode!=BENCH_NONE||fcSetupActive||configurationBusy||firmwareUploadActive||restartAt){sendMessage(423,"Disarm and stop setup before starting a web simulator");return true;}
  if(trainingActive&&!scopedTrainingBrowser()||trainingRequestLive()&&browser!=trainingRequestWebAppId){sendMessage(423,"Another WebApp is using the Android joystick");return true;}
  trainingRequestOwner=controlOwner;trainingRequestTarget=target=="TRIPOD"?1:2;trainingRequestWebAppId=browser;trainingRequestExpires=millis()+15000;trainingRequestId++;
  sendJson(202,trainingJson());return true;
 }
 const String token=server.arg("session"),owner=server.arg("clientId");if(!setupTokenValid(token)){sendMessage(400,"Unique training session is required");return true;}
 if(type=="training_end"){cancelTrainingToken(token);if(trainingActive&&trainingSession==token&&trainingOwner==owner)finishTraining();sendJson(200,trainingJson());return true;}
 if(type=="training_begin"||type=="training_select"){
  if(!requireControl())return true;
  const bool select=type=="training_select";if(select&&controlRole!="MOBILE"){sendMessage(403,"App mode selection requires the mobile control grant");return true;}
  String target=server.arg("target");if(!select&&!target.length())target="FLIGHT";if(target!="TRIPOD"&&target!="FLIGHT"&&!(select&&target=="REAL")){sendMessage(400,"Choose REAL, TRIPOD or FLIGHT");return true;}
  if(trainingWasCancelled(token)||trainingSession==token&&!trainingActive){sendMessage(409,"Training session cancelled; create a new session");return true;}
  if(armed||benchMode!=BENCH_NONE||fcSetupActive||configurationBusy||firmwareUploadActive||restartAt){sendMessage(423,"Disarm and stop setup / outputs before training");return true;}
  const String input=server.arg("source");if(target!="REAL"&&input!="APP"&&input!="PPM"){sendMessage(400,"Choose APP or PPM");return true;}
  if(select&&target!="REAL"&&(!trainingRequestLive()||server.arg("requestId")!=String(trainingRequestId)||owner!=trainingRequestOwner||server.arg("webAppId")!=String(trainingRequestWebAppId)||target!=(trainingRequestTarget==1?"TRIPOD":"FLIGHT"))){sendMessage(409,"Start the simulator on the connected WebApp first");return true;}
  if(trainingActive&&!select){sendMessage(423,"A training session is already active");return true;}
  if(select&&target!="REAL"&&!canBindTrainingWebApp(server.arg("webAppId"))){sendMessage(409,"Enter the six-digit ID of a connected, paired WebApp on this kit");return true;}
  if(trainingSession.length())cancelTrainingToken(trainingSession);if(trainingActive)finishTraining();
  if(target=="REAL"){finishTraining();sendJson(200,trainingJson());return true;}
  if(select&&!bindTrainingWebApp(server.arg("webAppId"))){sendMessage(409,"Enter the six-digit ID of a connected, paired WebApp on this kit");return true;}
  if(select)clearTrainingRequest();
  trainingOwner=owner;trainingSession=token;trainingInput=input=="PPM"?2:1;trainingTarget=target=="TRIPOD"?1:2;trainingAppOwned=controlRole=="MOBILE";trainingRunId++;trainingExpires=millis()+10000;trainingActive=true;setupAfterNeutral=true;invalidateRcUdp();webRcLastMs=0;benchStop();disarmFlight("Training: physical outputs blocked");sendJson(200,trainingJson());return true;
 }
 if(!trainingActive||token!=trainingSession||owner!=trainingOwner){sendMessage(409,"Training lease expired or belongs to another session");return true;}
 if(type=="training_ping"){trainingExpires=millis()+10000;sendJson(200,trainingJson());return true;}
 sendMessage(400,"Unknown training command");return true;
}
