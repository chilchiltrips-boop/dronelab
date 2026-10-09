#pragma once
// Networking task owns the session names. The control task observes the lease
// and inhibition flags; it never waits for HTTP or NVS writes.
String setupOwner,setupSession,setupCancelled[32];uint8_t setupCancelledNext=0;
TaskHandle_t setupCalibrationTask=nullptr;
void saveFcSetup(){prefs.begin("zjsetup",false);prefs.putUInt("schema",2);prefs.putBytes("rx",&receiverSetup,sizeof(receiverSetup));prefs.putBool("yawleft",ppmArmLeft);prefs.putUChar("layout",setupAirframe);prefs.putUChar("input",setupInput);prefs.end();}
void loadFcSetup(){prefs.begin("zjsetup",true);uint32_t schema=prefs.getUInt("schema",0);FlightSetupPolicy::ReceiverSetup r;
 if(schema==2&&prefs.getBytesLength("rx")==sizeof(r))prefs.getBytes("rx",&r,sizeof(r));
 else if(schema==1){struct Legacy{uint16_t minimum[6],centre[6],maximum[6];uint8_t channel[6];bool calibrated;} old;if(prefs.getBytesLength("rx")==sizeof(old)){prefs.getBytes("rx",&old,sizeof(old));for(int i=0;i<6;i++){r.minimum[i]=old.minimum[i];r.centre[i]=old.centre[i];r.maximum[i]=old.maximum[i];r.channel[i]=old.channel[i];}r.calibrated=old.calibrated;}}
 if((schema==1||schema==2)&&FlightSetupPolicy::valid(r))receiverSetup=r;ppmArmLeft=prefs.getBool("yawleft",false);setupAirframe=prefs.getUChar("layout",0)==1?1:0;setupInput=prefs.getUChar("input",0);if(setupInput>2)setupInput=0;prefs.end();rcPreference=setupInput;}

bool setupTokenValid(const String& s){if(s.length()<12||s.length()>60)return false;for(char c:s)if(!isalnum((unsigned char)c)&&c!='-')return false;return true;}
void setupRememberCancelled(const String& s){if(!setupTokenValid(s))return;for(const String& v:setupCancelled)if(v==s)return;setupCancelled[setupCancelledNext++%32]=s;}
bool setupWasCancelled(const String& s){for(const String& v:setupCancelled)if(v==s)return true;return false;}
void serviceFcSetup(){
 if(fcSetupActive&&(!FlightSetupPolicy::live(millis(),fcSetupExpires)||!FlightSetupPolicy::live(millis(),controlExpiresAt)||forceDisarmRequested)){
  fcSetupActive=false;setupCalibrationCancel=true;setupAfterNeutral=true;armLowSeen=false;resetArmGesture();benchStop();disarmFlight("FC setup lease / owner lost");
 }
}
void finishFcSetup(){fcSetupActive=false;setupCalibrationCancel=true;setupAfterNeutral=true;armLowSeen=false;resetArmGesture();benchStop();disarmFlight("FC setup stopped");invalidateRcUdp();webRcLastMs=0;rcPreference=setupInput;}
String receiverSetupJson(){String j="{\"calibrated\":"+String(receiverSetup.calibrated?"true":"false")+",\"armMode\":\""+String(!ppmYawStickArm?"CH5_SWITCH":ppmArmLeft?"YAW_LEFT":"YAW_RIGHT")+"\",\"map\":[";for(int i=0;i<8;i++){if(i)j+=",";j+=String(receiverSetup.channel[i]==255?0:receiverSetup.channel[i]+1);}j+="],\"minimum\":[";for(int i=0;i<8;i++){if(i)j+=",";j+=String(receiverSetup.minimum[i]);}j+="],\"centre\":[";for(int i=0;i<8;i++){if(i)j+=",";j+=String(receiverSetup.centre[i]);}j+="],\"maximum\":[";for(int i=0;i<8;i++){if(i)j+=",";j+=String(receiverSetup.maximum[i]);}j+="],\"reverse\":[";for(int i=0;i<4;i++){if(i)j+=",";j+=String(ppmReverse[i]?"true":"false");}return j+"],\"txMode\":"+String(receiverSetup.txMode)+"}";}
String fcSetupStatus(){uint16_t raw[10],rc[10];noInterrupts();for(int i=0;i<10;i++)raw[i]=ppmCh[i];interrupts();copyReceiver(rc);String j="{\"ok\":true,\"deviceId\":\""+deviceId+"\",\"boardId\":\""+String(BOARD_ID)+"\",\"firmware\":\""+String(FW_VERSION)+"\",\"supported\":"+String(FLIGHT_CONTROL_ENABLED?"true":"false")+",\"active\":"+String(fcSetupActive?"true":"false")+",\"session\":\""+(setupOwner==server.arg("clientId")?setupSession:String(""))+"\",\"armed\":"+String(armed?"true":"false")+",\"flightReady\":"+String(flightReady?"true":"false")+",\"airframe\":\""+String(setupAirframe?"QUAD_H":"QUAD_X")+"\",\"input\":\""+String(setupInput==2?"PPM":setupInput==1?"WEB":"AUTO")+"\",\"job\":"+String(setupJob)+",\"samples\":"+String(setupSamples)+",\"total\":"+String(setupTotal)+",\"benchMode\":"+String((int)benchMode)+",\"mask\":"+String(benchMask)+",\"pulse\":"+String(benchPulse)+",\"escStage\":"+String(benchEscStage)+",\"ppmFresh\":"+String(receiverFresh()?"true":"false")+",\"receiver\":"+receiverSetupJson()+",\"raw\":[";for(int i=0;i<10;i++){if(i)j+=",";j+=String(raw[i]);}j+="],\"channels\":[";for(int i=0;i<10;i++){if(i)j+=",";j+=String(rc[i]);}return j+"]}";}
bool setupLevelCalibration(){
 float sum[3]={},sq[3]={},g[3]={};int good=0;
 for(int i=0;i<120;i++){if(setupCalibrationCancel||!fcSetupActive)return false;float r,p,y,x,a,z;if(readMpuFlight(r,p,y,x,a,z)){float raw[3]={lastImu.rawAx/4096.0f,lastImu.rawAy/4096.0f,lastImu.rawAz/4096.0f};for(int k=0;k<3;k++){sum[k]+=raw[k];sq[k]+=raw[k]*raw[k];}g[0]+=r;g[1]+=p;g[2]+=y;good++;}setupSamples=i+1;delay(4);}
 if(good<108)return false;float noise=0;for(int k=0;k<3;k++){sum[k]/=good;noise+=fmaxf(0,sq[k]/good-sum[k]*sum[k]);}
 float x=sum[0],y=sum[1],z=sum[2];FlightMath::orient(x,y,z,flightSettings.orientation);if(sqrtf(noise)>.035f||fabsf(x)>.2f||fabsf(y)>.2f||z<.75f||z>1.25f)return false;
 float x0=1,y0=0,z0=0,x1=0,y1=1,z1=0,x2=0,y2=0,z2=1;FlightMath::orient(x0,y0,z0,flightSettings.orientation);FlightMath::orient(x1,y1,z1,flightSettings.orientation);FlightMath::orient(x2,y2,z2,flightSettings.orientation);
 if(setupCalibrationCancel||!fcSetupActive)return false;accelOffsetX=z0/accelScaleX-sum[0];accelOffsetY=z1/accelScaleY-sum[1];accelOffsetZ=z2/accelScaleZ-sum[2];gyroBiasRoll=g[0]/good;gyroBiasPitch=g[1]/good;gyroBiasYaw=g[2]/good;saveCalibrationSettings();kalmanRoll=levelTrimRoll;kalmanPitch=levelTrimPitch;resetFlightPid();rateFilterPrimed=false;return true;
}
void setupCalibrationWorker(void*){
 bool ok=false;if(setupCalibrationKind==1){setupFlightCore();ok=flightReady;}else ok=setupLevelCalibration();
 if(setupCalibrationCancel||!fcSetupActive)ok=false;setupJob=ok?2:3;configurationBusy=false;setupCalibrationTask=nullptr;vTaskDelete(nullptr);
}
bool fcSetupCommand(const String& type){
 if(type=="setup_status"){serviceFcSetup();sendJson(200,fcSetupStatus());return true;}
 if(type=="receiver_setup_get"){sendJson(200,"{\"ok\":true,\"receiver\":"+receiverSetupJson()+"}");return true;}
 if(!type.startsWith("setup_")&&type!="airframe_set"&&type!="input_set"&&type!="receiver_setup_set")return false;
 if(!requireControl())return true;
 String session=server.arg("session");if(!setupTokenValid(session)){sendMessage(400,"Unique setup session required");return true;}
 if(type=="setup_end"){setupRememberCancelled(session);if(session==setupSession&&setupOwner==server.arg("clientId")&&(fcSetupActive||configurationBusy))finishFcSetup();sendJson(200,"{\"ok\":true,\"stopped\":true}");return true;}
 if(!FLIGHT_CONTROL_ENABLED){sendMessage(403,"Flight setup requires A2 Aerion F1; A1 is bridge-only");return true;}
 serviceFcSetup();
 if(type=="setup_begin"){
  if(setupWasCancelled(session)||(setupSession==session&&!fcSetupActive)){sendMessage(409,"Setup session already cancelled; start a new session");return true;}
  if(fcSetupActive&&session!=setupSession){sendMessage(423,"Another setup session is active");return true;}
  if(trainingActive||armed||benchMode!=BENCH_NONE||configurationBusy||firmwareUploadActive){sendMessage(423,"Disarm and stop outputs before setup");return true;}
  if(server.arg("confirm")!="PROPS_REMOVED"){sendMessage(412,"Remove propellers before setup");return true;}
  if(setupSession.length()&&setupSession!=session)setupRememberCancelled(setupSession);setupSession=session;setupOwner=server.arg("clientId");setupCalibrationCancel=false;setupAfterNeutral=true;fcSetupExpires=millis()+5000;fcSetupActive=true;invalidateRcUdp();webRcLastMs=0;disarmFlight("FC setup");resetArmGesture();sendJson(200,fcSetupStatus());return true;
 }
 if(!fcSetupActive||session!=setupSession||setupOwner!=server.arg("clientId")){sendMessage(409,"Setup lease expired or wrong session");return true;}
 if(type=="setup_ping"){fcSetupExpires=millis()+5000;sendJson(200,fcSetupStatus());return true;}
 if(configurationBusy){sendMessage(423,"Calibration is running");return true;}
 if(type=="setup_calibrate"){
  if(benchMode!=BENCH_NONE||setupCalibrationTask){sendMessage(423,"Stop outputs before calibration");return true;}
  String kind=server.arg("kind");if(kind!="gyro"&&kind!="level"){sendMessage(400,"Choose gyro or level");return true;}
  setupCalibrationKind=kind=="gyro"?1:2;setupSamples=0;setupTotal=setupCalibrationKind==1?2000:120;setupJob=1;setupCalibrationCancel=false;configurationBusy=true;motorsSafe();
  if(xTaskCreate(setupCalibrationWorker,"fc-calibration",6144,nullptr,2,&setupCalibrationTask)!=pdPASS){configurationBusy=false;setupJob=3;sendMessage(503,"Calibration task unavailable");return true;}sendJson(200,fcSetupStatus());return true;
 }
 if(type=="setup_motor"){
  int mask=server.arg("mask").toInt(),pulse=server.arg("pulse").toInt(),duration=server.arg("durationMs").toInt();if(flightWatchdogTripped||!escPwmReady||benchMode!=BENCH_NONE||mask<1||mask>15||pulse<1000||pulse>1300||duration<100||duration>2000){sendMessage(400,"Motor mask 1-15, pulse 1000-1300, duration 100-2000 required; outputs must be idle");return true;}
  if(server.arg("confirm")!="PROPS_REMOVED"){sendMessage(412,"Confirm propellers removed");return true;}
  benchMask=mask;benchMotor=0;benchPulse=pulse;benchUntilMs=millis()+duration;benchMode=BENCH_MOTOR;sendJson(200,fcSetupStatus());return true;
 }
 if(type=="setup_esc"){
  String stage=server.arg("stage");if(flightWatchdogTripped||!escPwmReady||server.arg("confirm")!="PROPS_REMOVED"||(stage!="HIGH"&&stage!="LOW")){sendMessage(400,"PWM ESC only: confirm props removed and choose HIGH or LOW");return true;}
  if(stage=="HIGH"&&benchMode!=BENCH_NONE){sendMessage(423,"Stop outputs first");return true;}if(stage=="LOW"&&benchMode!=BENCH_ESC_MANUAL){sendMessage(409,"Start HIGH first");return true;}
  benchEscStage=stage=="HIGH"?0:1;benchPulse=stage=="HIGH"?2000:1000;benchUntilMs=millis()+(stage=="HIGH"?12000:3000);benchMode=BENCH_ESC_MANUAL;sendJson(200,fcSetupStatus());return true;
 }
 if(benchMode!=BENCH_NONE){sendMessage(423,"Wait for outputs to stop");return true;}
 if(type=="airframe_set"){String f=server.arg("airframe");if(f!="QUAD_X"&&f!="QUAD_H"){sendMessage(400,"Supported airframes: QUAD_X, QUAD_H");return true;}setupAirframe=f=="QUAD_H";saveFcSetup();sendJson(200,fcSetupStatus());return true;}
 if(type=="input_set"){String source=server.arg("source");if(source!="WEB"&&source!="PPM"){sendMessage(400,"Choose WEB or PPM");return true;}setupInput=source=="PPM"?2:1;rcPreference=setupInput;saveFcSetup();sendJson(200,fcSetupStatus());return true;}
 if(type=="receiver_setup_set"){
  FlightSetupPolicy::ReceiverSetup next;bool rev[4]={};next.txMode=server.hasArg("txMode")?server.arg("txMode").toInt():receiverSetup.txMode;
  for(int i=0;i<8;i++){String k=String(i);int mapped=server.hasArg("map"+k)?server.arg("map"+k).toInt():0;if(i>=4&&mapped==0){next.channel[i]=255;continue;}
   if(mapped<1||mapped>10||!server.hasArg("min"+k)||!server.hasArg("max"+k)||!server.hasArg("centre"+k)){sendMessage(400,"Four stick channels and endpoints required; switch / AUX channels are optional");return true;}
   next.minimum[i]=server.arg("min"+k).toInt();next.maximum[i]=server.arg("max"+k).toInt();next.centre[i]=server.arg("centre"+k).toInt();next.channel[i]=mapped-1;if(i<4)rev[i]=argBool(("reverse"+k).c_str(),false);
  }
  if(!FlightSetupPolicy::valid(next)){sendMessage(400,"Use distinct CH1-10; four required axes, optional switches, span >=400 and centred directional sticks");return true;}
  String mode=server.arg("armMode");if(mode!="YAW_RIGHT"&&mode!="YAW_LEFT"&&mode!="CH5_SWITCH"){sendMessage(400,"Choose YAW_RIGHT, YAW_LEFT or CH5_SWITCH");return true;}if(mode=="CH5_SWITCH"&&next.channel[4]==255){sendMessage(400,"Detect an ARM switch first or select yaw-stick arming");return true;}next.calibrated=true;receiverSetup=next;for(int i=0;i<4;i++)ppmReverse[i]=rev[i];ppmYawStickArm=mode!="CH5_SWITCH";ppmArmLeft=mode=="YAW_LEFT";armLowSeen=false;resetArmGesture();saveExpansionSettings();saveFcSetup();sendJson(200,"{\"ok\":true,\"receiver\":"+receiverSetupJson()+"}");return true;
 }
 sendMessage(400,"Unknown setup command");return true;
}
