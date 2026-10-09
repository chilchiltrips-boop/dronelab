#pragma once
// Included after core helpers: configuration APIs remain on the networking task.
void loadFlightSettings(){prefs.begin("zjflight",true);if(prefs.getUInt("schema",0)==1){prefs.getBytes("config",&flightSettings,sizeof(flightSettings));}prefs.end();if(!FlightMath::valid(flightSettings))flightSettings=FlightSettings();prefs.begin("zjcal",true);accelScaleX=prefs.getFloat("scaleX",1);accelScaleY=prefs.getFloat("scaleY",1);accelScaleZ=prefs.getFloat("scaleZ",1);sixFaceValid=prefs.getBool("sixValid",false);prefs.end();}
void saveFlightSettings(){prefs.begin("zjflight",false);prefs.putUInt("schema",1);prefs.putBytes("config",&flightSettings,sizeof(flightSettings));prefs.end();}
void saveSixCalibration(){saveCalibrationSettings();prefs.begin("zjcal",false);prefs.putFloat("scaleX",accelScaleX);prefs.putFloat("scaleY",accelScaleY);prefs.putFloat("scaleZ",accelScaleZ);prefs.putBool("sixValid",sixFaceValid);prefs.end();}
String flightSettingsJson(){const FlightSettings& c=flightSettings;return String("{\"schema\":1,\"maxTilt\":")+String(c.maxTilt)+",\"maxRate\":"+String(c.maxRate)+",\"gyroHz\":"+String(c.gyroHz)+",\"dtermHz\":"+String(c.dtermHz)+",\"orientation\":"+String(c.orientation)+",\"idleUs\":"+String(c.idleUs)+",\"maxMotorUs\":"+String(c.maxMotorUs)+",\"maxThrottle\":"+String(c.maxThrottle)+",\"modeSwitch\":"+String(c.modeSwitch?"true":"false")+",\"handover\":"+String(c.handover?"true":"false")+",\"batteryKind\":"+String(c.batteryKind)+",\"batteryAddress\":"+String(c.batteryAddress)+",\"cells\":"+String(c.cells)+",\"batteryFactor\":"+String(c.batteryFactor,5)+",\"lowCell\":"+String(c.lowCell)+",\"criticalCell\":"+String(c.criticalCell)+"}";}
String capabilityJson(){bool ready=FLIGHT_CONTROL_ENABLED&&flightReady&&detectedImu==IMU_MPU6050;return String("{\"angle\":")+(ready?"true":"false")+",\"rate\":"+(ready?"true":"false")+",\"altitude\":false,\"position\":false,\"navigation\":false,\"inflightModeSwitch\":"+String(ready&&flightSettings.modeSwitch?"true":"false")+",\"inflightHandover\":"+String(ready&&flightSettings.handover?"true":"false")+",\"mobileReservation\":true,\"settingsSchema\":1}";}
String sensorStatusJson(){bool fresh=lastImuValid&&(uint32_t)(millis()-lastImu.sampledAt)<100;return String("{\"imu\":{\"model\":\"")+imuName(detectedImu)+"\",\"detected\":"+String(detectedImu!=IMU_NONE?"true":"false")+",\"fresh\":"+String(fresh?"true":"false")+",\"gyroCalibrated\":"+String(flightReady?"true":"false")+",\"sixFaceCalibrated\":"+String(sixFaceValid?"true":"false")+",\"usedInFlight\":"+String(FLIGHT_CONTROL_ENABLED&&flightReady?"true":"false")+"},\"battery\":{\"configured\":"+String(flightSettings.batteryKind!=0?"true":"false")+",\"fresh\":"+String(batteryValid?"true":"false")+",\"usedForArming\":"+String(flightSettings.batteryKind!=0?"true":"false")+"},\"gps\":{\"configured\":"+String(gpsRxPin>=0?"true":"false")+",\"fresh\":"+String(gpsLastMs&&(uint32_t)(millis()-gpsLastMs)<1000?"true":"false")+",\"usedInFlight\":false},\"barometer\":{\"addressPresent\":"+String(barometerAddressPresent?"true":"false")+",\"modelVerified\":false,\"fresh\":false,\"usedInFlight\":false},\"rangefinder\":{\"fresh\":false,\"usedInFlight\":false}}";}
String flightFeatureJson(const String& client){
 return String(",\"simulationRcTransport\":\"UDP\",\"simulationRcProtocol\":\"ZRC2\",\"simulationReady\":true,\"outputsBlocked\":")+String(trainingActive?"true":"false")+",\"virtualArmed\":"+String(trainingActive&&webRcFresh()&&webRcCh[4]>1500?"true":"false")+",\"trainingSelection\":true,\"trainingTarget\":\""+String(trainingTarget==1?"TRIPOD":trainingTarget==2?"FLIGHT":"NONE")+"\",\"trainingController\":\""+String(trainingAppOwned?"APP":"WEB")+"\",\"trainingRunId\":"+String(trainingRunId)+",\"trainingWebAppId\":\""+String(trainingWebAppId?trainingWebAppId:0)+"\",\"webAppRouting\":true,\"trainingActive\":"+String(trainingActive?"true":"false")+",\"trainingInput\":\""+String(trainingInput==2?"PPM":"APP")+"\",\"deviceId\":\""+deviceId+"\",\"controlRole\":\""+controlRole+"\",\"mobileReserved\":"+String(mobileReserved?"true":"false")+",\"viewOnly\":"+String(controlOwner.length()&&controlOwner!=client?"true":"false")+",\"capabilities\":"+capabilityJson()+",\"flightSettings\":"+flightSettingsJson()+",\"sensors\":"+sensorStatusJson()+",\"rcPreference\":\""+(rcPreference==2?"PPM":rcPreference==1?"WEB":"AUTO")+"\",\"targetAngle\":["+String(desiredAngleR,3)+","+String(desiredAngleP,3)+"],\"targetRate\":["+String(desiredRateR,3)+","+String(desiredRateP,3)+","+String(desiredRateY,3)+"],\"lastDisarmReason\":\""+jsonEscape(lastDisarmReason)+"\",\"lastDisarmAt\":"+String(disarmAt)+",\"lastEvent\":\""+jsonEscape(lastEvent)+"\",\"eventAt\":"+String(eventAt)+",\"loopPeriodUs\":"+String((uint32_t)(flightDt*1000000))+",\"controlTask\":\""+(flightTaskHandle?"TIMER_250HZ":"UNAVAILABLE")+"\",\"batteryLow\":"+String(batteryLow?"true":"false")+",\"batteryCritical\":"+String(batteryCritical?"true":"false")+",\"batteryAgeMs\":"+String(batterySampleMs?millis()-batterySampleMs:999999)+",\"batteryFailsafe\":\"WARN_IN_FLIGHT_BLOCK_CRITICAL_ARM\"";
}
void serviceBattery(){
 uint32_t now=millis();if(now-batteryPollAt<100)return;batteryPollAt=now;
 if(!flightSettings.batteryKind){batteryValid=batteryLow=batteryCritical=false;return;}
 if(configurationBusy)return;
 uint8_t b[2];if(!i2cReadBlock(flightSettings.batteryAddress,2,b,2)){if(!batterySampleMs||(uint32_t)(now-batterySampleMs)>1000)batteryValid=false;return;}
 uint16_t raw=((uint16_t)b[0]<<8)|b[1];float v=flightSettings.batteryKind==1?(raw>>3)*.004f:raw*.00125f;v*=flightSettings.batteryFactor;
 if(v<flightSettings.cells*2.0f||v>flightSettings.cells*4.5f){batteryValid=false;return;}
 batteryVoltage=batteryValid?batteryVoltage*.8f+v*.2f:v;batteryValid=true;batterySampleMs=now;
 float perCell=batteryVoltage/flightSettings.cells;batteryLow=perCell<flightSettings.lowCell;batteryCritical=perCell<flightSettings.criticalCell;
}
void flightTimerTick(void*){if(flightTaskHandle)xTaskNotifyGive(flightTaskHandle);}
void flightControlTask(void*){
 for(;;){ulTaskNotifyTake(pdTRUE,portMAX_DELAY);serviceTraining();serviceFcSetup();serviceBenchMode();runFlightLoop();flightHeartbeatUs=micros();}
}
void startFlightTask(){
 if(!FLIGHT_CONTROL_ENABLED)return;flightLoopTimerUs=micros();flightHeartbeatUs=micros();
 if(xTaskCreate(flightControlTask,"aerion-control",6144,nullptr,19,&flightTaskHandle)!=pdPASS){flightReady=false;motorsSafe();return;}
 esp_timer_create_args_t args={};args.callback=flightTimerTick;args.name="aerion-250hz";args.dispatch_method=ESP_TIMER_TASK;
 if(esp_timer_create(&args,&flightTimer)!=ESP_OK||esp_timer_start_periodic(flightTimer,4000)!=ESP_OK){flightReady=false;motorsSafe();}
}
bool extendedFlightCommand(const String& type){
 if(type=="flight_settings_get"||type=="diagnostics_get"||type=="sensor_status"||type=="snapshot_get"||type=="sixface_get"){
  String j="{\"ok\":true,\"firmware\":\""+String(FW_VERSION)+"\",\"boardId\":\""+String(BOARD_ID)+"\",\"pid\":"+pidJson()+",\"calibration\":"+calibrationJson()+",\"accelScale\":["+String(accelScaleX,6)+","+String(accelScaleY,6)+","+String(accelScaleZ,6)+"],\"sixFaceMask\":"+String(sixFaceMask)+",\"sixFaceValid\":"+String(sixFaceValid?"true":"false")+flightFeatureJson(server.arg("clientId"))+"}";sendJson(200,j);return true;
 }
 if(type!="flight_settings_set"&&type!="sixface_capture"&&type!="sixface_commit"&&type!="sixface_reset"&&type!="settings_restore")return false;
 if(!requireControl())return true;if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"Flight settings need the Aerion F1 flight profile");return true;}
 ConfigGuard cg;if(!cg.held){sendMessage(423,"Configuration blocked while motors operate");return true;}
 if(type=="flight_settings_set"||type=="settings_restore"){
  if(server.hasArg("schema")&&server.arg("schema")!="1"){sendMessage(409,"Unsupported settings schema");return true;}
  if(server.hasArg("boardId")&&server.arg("boardId")!=String(BOARD_ID)){sendMessage(409,"Settings belong to a different profile");return true;}
  FlightSettings n=flightSettings;
  n.maxTilt=argFloat("maxTilt",n.maxTilt);n.maxRate=argFloat("maxRate",n.maxRate);n.gyroHz=argFloat("gyroHz",n.gyroHz);n.dtermHz=argFloat("dtermHz",n.dtermHz);
  n.lowCell=argFloat("lowCell",n.lowCell);n.criticalCell=argFloat("criticalCell",n.criticalCell);n.batteryFactor=argFloat("batteryFactor",n.batteryFactor);
  #define INT_SETTING(k,lo,hi) if(server.hasArg(#k)){float v=argFloat(#k,NAN);if(!isfinite(v)||floorf(v)!=v||v<lo||v>hi){sendMessage(400,"Invalid setting: " #k);return true;}n.k=v;}
  INT_SETTING(idleUs,1050,1250);INT_SETTING(maxMotorUs,1700,2000);INT_SETTING(maxThrottle,1300,1900);INT_SETTING(orientation,0,7);INT_SETTING(batteryKind,0,2);INT_SETTING(batteryAddress,64,79);INT_SETTING(cells,1,6);
  #undef INT_SETTING
  n.modeSwitch=argBool("modeSwitch",n.modeSwitch);n.handover=argBool("handover",n.handover);
  if(!FlightMath::valid(n)){sendMessage(400,"Settings outside supported limits");return true;}
  FlightPidSettings nextPid=flightPid;float offsets[5]={accelOffsetX,accelOffsetY,accelOffsetZ,levelTrimRoll,levelTrimPitch},scales[3]={accelScaleX,accelScaleY,accelScaleZ};
  if(type=="settings_restore"){
   if(server.arg("backupSchema")!="1"||server.arg("boardId")!=String(BOARD_ID)||!server.arg("expectedDeviceId").equalsIgnoreCase(deviceId)){sendMessage(409,"Backup schema / profile / Device ID mismatch");return true;}
   const char* required[]={"schema","maxTilt","maxRate","gyroHz","dtermHz","orientation","idleUs","maxMotorUs","maxThrottle","modeSwitch","handover","batteryKind","batteryAddress","cells","batteryFactor","lowCell","criticalCell","sixFaceValid"};
   for(const char* key:required)if(!server.hasArg(key)){sendMessage(400,"Incomplete backup; nothing changed");return true;}
   const char* axes[]={"rateRoll","ratePitch","rateYaw","angleRateRoll","angleRatePitch","angleRateYaw","angleRoll","anglePitch"};
   for(const char* axis:axes)for(const char* term:{"P","I","D"})if(!server.hasArg(String(axis)+term)){sendMessage(400,"Incomplete PID backup; nothing changed");return true;}
   readPidArgs(nextPid);offsets[0]=argFloat("accelOffsetX",NAN);offsets[1]=argFloat("accelOffsetY",NAN);offsets[2]=argFloat("accelOffsetZ",NAN);offsets[3]=argFloat("levelTrimRoll",NAN);offsets[4]=argFloat("levelTrimPitch",NAN);
   scales[0]=argFloat("scaleX",NAN);scales[1]=argFloat("scaleY",NAN);scales[2]=argFloat("scaleZ",NAN);
   if(!pidConfigValid(nextPid)||!calibrationValid(offsets[0],offsets[1],offsets[2],offsets[3],offsets[4])){sendMessage(400,"Backup PID / calibration invalid; nothing changed");return true;}
   for(float v:scales)if(!isfinite(v)||v<.8f||v>1.2f){sendMessage(400,"Backup scale invalid; nothing changed");return true;}
  }
  bool mountChanged=n.orientation!=flightSettings.orientation;
  if(type=="settings_restore"){flightPid=nextPid;accelOffsetX=offsets[0];accelOffsetY=offsets[1];accelOffsetZ=offsets[2];levelTrimRoll=offsets[3];levelTrimPitch=offsets[4];accelScaleX=scales[0];accelScaleY=scales[1];accelScaleZ=scales[2];sixFaceValid=argBool("sixFaceValid");savePidSettings();saveSixCalibration();}
  flightSettings=n;saveFlightSettings();resetFlightPid();rateFilterPrimed=false;
  if(mountChanged){setupFlightCore();}sendJson(200,"{\"ok\":true,\"saved\":true,\"flightSettings\":"+flightSettingsJson()+"}");return true;
 }
 if(type=="sixface_reset"){sixFaceMask=0;sendMessage(200,"Six-face captures cleared. Stored calibration is retained until a complete replacement is saved.");return true;}
 if(detectedImu!=IMU_MPU6050){sendMessage(403,"Six-face calibration requires MPU6050");return true;}
 if(type=="sixface_capture"){
  int face=server.arg("face").toInt();if(face<0||face>5){sendMessage(400,"Choose X+, X-, Y+, Y-, Z+, Z-");return true;}
  float sum[3]={},sq[3]={};int good=0;for(int i=0;i<120;i++){float r,p,y,x,a,z;if(readMpuFlight(r,p,y,x,a,z)){float raw[3]={lastImu.rawAx/4096.0f,lastImu.rawAy/4096.0f,lastImu.rawAz/4096.0f};for(int k=0;k<3;k++){sum[k]+=raw[k];sq[k]+=raw[k]*raw[k];}good++;}delay(4);}
  if(good<108){sendMessage(500,"IMU samples missing");return true;}float noise=0;for(int k=0;k<3;k++){sum[k]/=good;noise+=fmaxf(0,sq[k]/good-sum[k]*sum[k]);}
  int axis=face/2;float expected=face%2?-1:1;if(sqrtf(noise)>.035f||fabsf(sum[axis]-expected)>.25f){sendMessage(400,"Keep the selected sensor axis pointing up/down and hold still");return true;}
  for(int k=0;k<3;k++)sixFace[face][k]=sum[k];sixFaceMask|=1<<face;sendJson(200,"{\"ok\":true,\"sixFaceMask\":"+String(sixFaceMask)+"}");return true;
 }
 float off[3],scale[3];if(sixFaceMask!=63||!FlightMath::sixPoint(sixFace,off,scale)){sendMessage(400,"Capture all six stable faces before saving");return true;}
 accelOffsetX=off[0];accelOffsetY=off[1];accelOffsetZ=off[2];accelScaleX=scale[0];accelScaleY=scale[1];accelScaleZ=scale[2];sixFaceValid=true;saveSixCalibration();setupFlightCore();sendJson(200,"{\"ok\":true,\"saved\":true,\"calibration\":"+calibrationJson()+"}");return true;
}
