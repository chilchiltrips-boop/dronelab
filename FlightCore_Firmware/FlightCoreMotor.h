#pragma once
#include "FlightCoreA2MotorLayout.h"
#include "FlightCoreMotorSafety.h"
#include "FlightCoreMotorConfig.h"
#include "FlightCoreEscProfile.h"
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include "FlightCoreWizardConfig.h"
#endif
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include <driver/ledc.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
static constexpr int ZJ_MOTOR_PINS[]={D0,D1,D2,D3};
// Arduino-ESP32 3.3.12 allocates the LED's first timer dynamically: channel 5
// still takes timer 0. Reserve timer 3 for ESCs so LED PWM stays 5 kHz / 8-bit.
static constexpr ledc_timer_t ZJ_MOTOR_TIMER=LEDC_TIMER_3;
static portMUX_TYPE zjMotorMux=portMUX_INITIALIZER_UNLOCKED;
static volatile bool zjMotorWatchActive=false,zjMotorWatchTripped=false;
static volatile uint32_t zjMotorServicedAt=0;
static volatile uint32_t zjMotorWatchAt=0,zjMotorWatchLimit=100;
static volatile ZjMotorSafety::Reason zjMotorWatchReason=ZjMotorSafety::DEADLINE_MISSED;
static esp_timer_handle_t zjMotorWatchTimer=nullptr;
static void zjMotorWatch(void*){
 portENTER_CRITICAL(&zjMotorMux);
 if(zjMotorWatchActive&&uint32_t(millis()-zjMotorWatchAt)>=zjMotorWatchLimit){
  zjMotorWatchTripped=true;zjMotorWatchActive=false;
  for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);
 }
 portEXIT_CRITICAL(&zjMotorMux);
}
#endif
static ZjMotorSafety zjMotor;
static ZjMotorConfig zjMotorConfig;
static bool zjMotorConfigValid=true;
// This records an operator's confirmation, not sensor detection of ESC tones.
// Endpoints live in each ESC; this board record survives ordinary power cycles.
static bool zjMotorCalibrationSaved=false,zjMotorCalibrationPending=false;
static const char* ZJ_ESC_CALIBRATION_RECORD="PWM_50HZ_1000_2000:TONES_CONFIRMED";
#if defined(CONFIG_IDF_TARGET_ESP32C6)
static ZjWizardConfig zjWizardSaved;
static ZjMotorConfig zjWizardBenchConfig,zjWizardEscConfig;
static bool zjWizardBench=false,zjWizardCalSlider=false;
static bool zjWizardEscConfirmed=false;
static String zjWizardEscOwner,zjWizardImuOwner;
static bool zjSameMotorWiring(const ZjMotorConfig& a,const ZjMotorConfig& b){
 return a.plus==b.plus&&!memcmp(a.pins,b.pins,sizeof(a.pins))&&!memcmp(a.rotation,b.rotation,sizeof(a.rotation));
}
static bool zjPersistWizard(ZjWizardConfig next,bool configurationChange=true){
 if((configurationChange&&zjWizardSaved.revision>=999999999)||!next.accel.valid())return false;
 next.revision=zjWizardSaved.revision+(configurationChange?1:0);
 char encoded[176];next.encode(encoded,sizeof(encoded));const String value(encoded);
 if(zjKitPrefs.putString("wizardSetup1",value)!=value.length()||zjKitPrefs.getString("wizardSetup1","")!=value)return false;
 zjWizardSaved=next;zjMotorConfig=next.motor;zjMotorConfigValid=true;zjMotorCalibrationSaved=next.esc;
 zjSetAccelModel(next.accel);
 return true;
}
#endif
static void zjMotorLoadCalibration(){
 zjMotorCalibrationSaved=zjKitPrefs.getString("motorCal1","")==ZJ_ESC_CALIBRATION_RECORD;
 zjMotorCalibrationPending=false;
}
static bool zjMotorSaveCalibration(bool saved){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(zjWizardSaved.revision){
  if(zjWizardSaved.esc==saved)return true;
  auto next=zjWizardSaved;next.esc=saved;return zjPersistWizard(next,saved);
 }
#endif
 const String value=saved?String(ZJ_ESC_CALIBRATION_RECORD):String("");
 if(zjKitPrefs.getString("motorCal1","")!=value&&zjKitPrefs.putString("motorCal1",value)!=value.length())return false;
 if(zjKitPrefs.getString("motorCal1","")!=value)return false;
 zjMotorCalibrationSaved=saved;return true;
}
static bool zjMotorSaveConfig(const ZjMotorConfig& next){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 auto updated=zjWizardSaved;updated.motor=next;updated.esc=zjMotorCalibrationSaved;
 if(!zjSameMotorWiring(next,zjMotorConfig))updated.esc=false;
 return zjPersistWizard(updated);
#endif
 char encoded[64];next.encode(encoded,sizeof(encoded));const String value(encoded);
 if(zjKitPrefs.getString("motorConfig2","")!=value&&zjKitPrefs.putString("motorConfig2",value)!=value.length())return false;
 if(zjKitPrefs.getString("motorConfig2","")!=value)return false;
 zjMotorConfig=next;zjMotorConfigValid=true;return true;
}
static String zjMotorOwner,zjMotorToken,zjMotorPath,zjMotorProducer,zjMotorRadio;
static bool zjMotorDriverReady=false;
static uint32_t zjMotorCommandSeq=0,zjMotorInputDuration=0;
static ZjMotorInput zjMotorRtc;
static const char* zjMotorMode(){
 static const char* names[]={"DISABLED","READY","INPUT_TEST","SINGLE_TEST","ALL_TEST","CAL_HIGH","CAL_LOW","FAULT","SLIDER_TEST"};
 return names[zjMotor.mode];
}
static const char* zjMotorReason(){
 static const char* names[]={"NONE","USER_STOP","SESSION_EXPIRED","INPUT_LOST","INPUT_CHANGED","ARM_REQUIRED","THROTTLE_HIGH","SWITCH_REQUIRED","TEST_FINISHED","CAL_TIMEOUT","CAL_FINISHED","OUTPUT_ERROR","DEADLINE_MISSED","CONFIG_ERROR","CONTROL_LOST"};
 return names[zjMotor.reason];
}
static void zjMotorApply(){
 const bool enabled=zjMotor.benchEnabled&&zjMotor.mode!=ZjMotorSafety::FAULT;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 portENTER_CRITICAL(&zjMotorMux);
 if(zjMotorWatchTripped&&enabled){
  if(zjMotorWatchReason==ZjMotorSafety::DEADLINE_MISSED)zjMotor.fault(zjMotorWatchReason);
  else zjMotor.disable(zjMotorWatchReason);
 }
 if(zjMotorDriverReady){
  for(int n=0;n<4;n++){
   const auto& wiring=zjWizardBench?zjWizardBenchConfig:zjMotorConfig;
   const uint32_t duty=zjMotor.benchEnabled?ZJ_ESC_PROFILE.duty(wiring.physicalPulse(n,zjMotor.pulses)):0;
   if(ledc_set_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),duty)!=ESP_OK||
      ledc_update_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n))!=ESP_OK)zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);
  }
  if(!zjMotor.benchEnabled)for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);
 }
 zjMotorServicedAt=millis();zjMotorWatchActive=zjMotor.benchEnabled;
 const bool timed=zjMotor.timedManual()||(zjMotor.timedBench&&zjMotor.mode==ZjMotorSafety::READY);
 zjMotorWatchAt=timed?zjMotor.modeAt:zjMotorServicedAt;
 zjMotorWatchLimit=timed?zjMotor.operationLimit():100;
 zjMotorWatchReason=!timed?ZjMotorSafety::DEADLINE_MISSED:zjMotor.mode==ZjMotorSafety::CAL_HIGH?ZjMotorSafety::CAL_TIMEOUT:
  zjMotor.mode==ZjMotorSafety::CAL_LOW?ZjMotorSafety::CAL_FINISHED:zjMotor.mode==ZjMotorSafety::READY?ZjMotorSafety::SESSION_EXPIRED:ZjMotorSafety::TEST_FINISHED;
 portEXIT_CRITICAL(&zjMotorMux);
#endif
 zjMotorEnabled=zjMotorDriverReady&&zjMotor.benchEnabled;
 zjMotorArmed=zjMotorEnabled&&zjMotor.armed;
 zjMotorSessionActive=zjMotor.benchEnabled;
 zjMotorInputTest=zjMotor.mode==ZjMotorSafety::INPUT_TEST;
 if(!zjMotor.benchEnabled){
  zjMotorToken="";zjMotorOwner="";
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  zjWizardBench=false;zjWizardCalSlider=false;
#endif
 }
}
static void zjMotorStop(){zjMotor.disable();zjMotorApply();}
static ZjMotorInput zjMotorReadInput(){
 if(zjRcControlPath=="ANDROID_WEBRTC"){
  auto i=zjMotorRtc;i.selected=zjControlRadio()=="STA"&&!zjRcPaused;return i;
 }
 ZjMotorInput i;
 i.source=zjRcSource=="PPM"?ZjMotorInput::PPM:zjRcSource=="WEB"?ZjMotorInput::WEB:
  zjRcSource=="ANDROID"&&String(zjRcTransport)=="AP"?ZjMotorInput::ANDROID_AP:ZjMotorInput::NONE;
 i.selected=zjRcSourceAllowed(zjRcSource)&&i.source!=ZjMotorInput::NONE;
 i.valid=zjRcOwned&&zjRcHasFrame;i.inputArmed=zjRcInputArmed;i.safetySwitch=zjRcCh5>1700;
 i.throttle=zjRcThrottle;i.yaw=zjRcYaw;i.sequence=zjRcSeq;i.receivedMs=zjRcLast;
 return i;
}
static void zjMotorLoop(){
 const uint32_t now=millis();
 const bool wasCalibrationLow=zjMotor.mode==ZjMotorSafety::CAL_LOW;
 if(zjMotor.benchEnabled){
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&
    (zjMotorPath!=zjRcControlPath||zjMotorProducer!=zjRcOwnerId||zjMotorRadio!=zjControlRadio()))zjMotor.disable(ZjMotorSafety::INPUT_CHANGED);
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&uint32_t(now-zjMotor.modeAt)>=zjMotorInputDuration)zjMotor.disable(ZjMotorSafety::TEST_FINISHED);
  if(zjAccessBusy()||zjMaintenanceActive)zjMotor.disable(ZjMotorSafety::USER_STOP);
  const auto i=zjMotorReadInput();
  // Remote input ARM is still gated by a fresh, low-throttle explicit bench session.
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&!zjMotor.armed&&i.source!=ZjMotorInput::PPM)zjMotor.armRemote(now,i);
  zjMotor.update(now,i);
 }
 zjMotorApply();
 if(wasCalibrationLow&&zjMotor.mode==ZjMotorSafety::OUTPUT_DISABLED&&zjMotor.reason==ZjMotorSafety::CAL_FINISHED)zjMotorCalibrationPending=true;
}
static String zjMotorStatus(){
 zjMotorLoop();
 const auto input=zjMotorReadInput();const bool rtc=zjRcControlPath=="ANDROID_WEBRTC";
 const bool fresh=input.valid&&input.selected&&uint32_t(millis()-input.receivedMs)<=(input.source==ZjMotorInput::PPM?ZjMotorSafety::INPUT_PPM_MS:ZjMotorSafety::INPUT_NETWORK_MS);
 String out="{\"version\":3,\"timedBenchSupported\":true,\"kitId\":"+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+",\"supported\":"+(zjMotorDriverReady?String("true"):String("false"))+
  ",\"mode\":"+zjJson(zjMotorMode())+",\"reason\":"+zjJson(zjMotorReason())+","+zjMotorFlags()+
  ",\"layout\":"+zjJson(zjMotorConfig.layout())+",\"configValid\":"+(zjMotorConfigValid?"true":"false")+
  ",\"calibrationSaveSupported\":"+(zjMotorDriverReady?"true":"false")+",\"escCalibrationSaved\":"+(zjMotorCalibrationSaved?"true":"false")+",\"escCalibrationPending\":"+(zjMotorCalibrationPending?"true":"false")+
  ",\"profile\":\"PWM_50HZ_1000_2000\",\"physicalVerified\":false,\"maxTestPulseUs\":2000,\"maxInputPulseUs\":1200,\"sliderDurationMaxMs\":30000,\"inputDurationMaxMs\":30000,\"commandSequence\":"+String(zjMotorCommandSeq)+
  ",\"selectedInput\":"+zjJson(zjRcControlPath)+",\"inputSource\":"+zjJson(rtc?(input.valid?String("ANDROID_WEBRTC"):String("NONE")):zjRcSource)+
  ",\"inputAgeMs\":"+(input.valid?String(uint32_t(millis()-input.receivedMs)):String("null"))+
  ",\"inputValid\":"+(fresh?"true":"false")+",\"throttle\":"+String(input.throttle)+",\"inputArmed\":"+(input.inputArmed?"true":"false")+",\"channels\":";
 if(!fresh)out+="null";
 else if(!rtc&&zjRcSource=="PPM")out+=zjPpmRcChannelsJson();
 else if(rtc)out+="[null,null,"+String(input.throttle)+","+String(input.yaw)+","+String(input.inputArmed?2000:1000)+",null,null,null]";
 else out+="["+String(zjRcRoll)+","+String(zjRcPitch)+","+String(input.throttle)+","+String(input.yaw)+","+String(zjRcCh5)+","+String(zjRcCh6)+",null,null]";
 out+=",\"ppm\":"+zjPpmStatus()+",\"benchPolicy\":"+zjJson(zjMotor.timedBench?"TIMED_MANUAL":"LIVE_LEASE")+
  ",\"keepaliveRequired\":"+(zjMotor.timedManual()?String("false"):String("true"))+",\"pulseUs\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=String(zjMotorEnabled?zjMotor.pulses[n]:0);}
 out+="],\"layoutPins\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=zjJson(String("D")+String(zjMotorConfig.pins[n]));}
 out+="],\"rotations\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=zjJson(zjMotorConfig.rotation[n]?"CCW":"CW");}
 out+="],\"observedMinimumUs\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=String(zjMotorConfig.minimumUs[n]);}
 out+="],\"sliderMask\":"+String(zjMotor.mode==ZjMotorSafety::SLIDER_TEST?zjMotor.sliderMask:0)+",\"sessionRemainingMs\":"+
  String(zjMotor.benchEnabled&&!zjMotor.timedManual()&&uint32_t(millis()-zjMotor.sessionAt)<zjMotor.leaseMs()?zjMotor.leaseMs()-uint32_t(millis()-zjMotor.sessionAt):0);
 const uint32_t limit=zjMotor.mode==ZjMotorSafety::CAL_HIGH?ZjMotorSafety::CAL_HIGH_MAX_MS:zjMotor.mode==ZjMotorSafety::CAL_LOW?ZjMotorSafety::CAL_LOW_MS:
  zjMotor.mode==ZjMotorSafety::SLIDER_TEST?zjMotor.sliderDuration:zjMotor.mode==ZjMotorSafety::INPUT_TEST?zjMotorInputDuration:(zjMotor.mode==ZjMotorSafety::SINGLE_TEST||zjMotor.mode==ZjMotorSafety::ALL_TEST)?zjMotor.lastInputAt:0;
 out+=",\"remainingMs\":"+String(limit&&uint32_t(millis()-zjMotor.modeAt)<limit?limit-uint32_t(millis()-zjMotor.modeAt):0)+"}";
 return out;
}
#if defined(CONFIG_IDF_TARGET_ESP32C6)
static String zjWizardStatus(){
 const String status=zjMotorStatus();
 char saved[80],candidate[80];
 zjWizardSaved.accel.encode(saved,sizeof(saved));
 const auto imu=zjReadImu(millis());imu.accelCapture.result.encode(candidate,sizeof(candidate));
 return status.substring(0,status.length()-1)+",\"wizardVersion\":1,\"configRevision\":"+String(zjWizardSaved.revision)+
  ",\"accelModel\":"+zjJson(saved)+",\"imu\":"+zjImuStatus()+
  ",\"escConfirmationStaged\":"+(zjWizardEscConfirmed?"true":"false")+
  ",\"capture\":{\"state\":"+zjJson(imu.accelCapture.state)+",\"running\":"+(imu.accelCapture.running?"true":"false")+
  ",\"ready\":"+(imu.accelCapture.ready?"true":"false")+",\"mask\":"+String(imu.accelCapture.mask)+
  ",\"samples\":"+String(imu.accelCapture.samples)+",\"target\":128,\"model\":"+zjJson(candidate)+"},"+
  "\"outputSignal\":{\"profile\":\"PWM_50HZ_1000_2000\",\"hz\":"+String(ZJ_ESC_PROFILE.hz)+
  ",\"minUs\":1000,\"maxUs\":2000,\"timer\":3,\"resolutionBits\":14,\"rapidPrepared\":true,\"oneShotSupported\":false}}";
}
#endif
// A single handler serves USB and authenticated network requests. Tokens never
// appear in broadcast status. STOP invalidates the token before any new output.
static String zjMotorCommand(const String& action,const String& caller,const String& token,const String& a,const String& b,const String& c,bool authorized){
 zjMotorLoop();
 auto error=[](const char* e){return String("{\"error\":\"")+e+"\"}";};
 if(action=="STATUS")return zjMotorStatus();
 if(action=="STOP"){
  if(!authorized&&!(token==zjMotorToken&&caller==zjMotorOwner&&token.length()))return error("authorization_required");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardEscOwner.length()&&!zjWizardEscConfirmed){zjMotorCalibrationPending=false;zjWizardEscOwner="";}
  const bool stoppedSlider=zjWizardCalSlider&&zjMotor.mode==ZjMotorSafety::SLIDER_TEST&&
   token.length()&&token==zjMotorToken&&caller==zjMotorOwner;
  const uint8_t stoppedMask=zjMotor.sliderMask;
  uint16_t stoppedPulse=0;
  if(stoppedSlider)for(int i=0;i<4;i++)if(stoppedMask&(1U<<i)){stoppedPulse=zjMotor.pulses[i];break;}
#endif
  zjMotorStop();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(stoppedSlider){
   const String status=zjMotorStatus();
   return status.substring(0,status.length()-1)+",\"stoppedSlider\":true,\"stoppedMask\":"+String(stoppedMask)+
    ",\"stoppedPulseUs\":"+String(stoppedPulse)+"}";
  }
#endif
  return zjMotorStatus();
 }
 if(!zjMotorDriverReady)return error("a2_motor_driver_required");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(action=="WIZARD_STATUS")return zjWizardStatus();
 if(action=="WIZARD_IMU"||action=="WIZARD_SAVE"||action=="WIZARD_ESC_CONFIRM"){
  if(!authorized)return error("authorization_required");
  if(zjMotor.benchEnabled||zjMotorEnabled||zjAccessBusy()||zjMaintenanceActive||
   zjRcInputArmed||zjRcThrottle>1050||!zjPpmAccessSafe())return error("stop_maintenance_lower_throttle_and_disarm_input");
  if(action=="WIZARD_IMU"){
   if(c!=zjBootId)return error("wizard_board_restarted");
   const bool cancel=a=="CANCEL_GYRO"||a=="CLEAR_ACCEL";
   if(zjImuMaintenanceBusy()&&!cancel)return error("imu_calibration_busy");
   if(cancel&&zjWizardImuOwner.length()&&caller!=zjWizardImuOwner)return error("imu_calibration_owned");
   long face=4;
   ZjImuAction request=ZjImuAction::NONE;
   if(a=="GYRO")request=ZjImuAction::GYRO;
   if(a=="CANCEL_GYRO"||a=="RESET_GYRO")request=ZjImuAction::CANCEL_GYRO;
   if(a=="LEVEL")request=ZjImuAction::LEVEL;
   if(a=="FACE"&&parseNumber(b.c_str(),0,5,face))request=ZjImuAction::FACE;
   if(a=="CLEAR_ACCEL")request=ZjImuAction::CLEAR_ACCEL;
   const auto imu=zjReadImu(millis());
   if(request==ZjImuAction::FACE&&imu.accelCapture.mask&&zjWizardImuOwner!=caller)return error("imu_calibration_owned");
   if(request==ZjImuAction::GYRO&&!imu.gyroConfigured)return error("imu_not_ready");
   if(request==ZjImuAction::NONE||!zjQueueImuAction(request,uint8_t(face)))return error("imu_request_rejected");
   zjWizardImuOwner=caller;
   return zjWizardStatus();
  }
  if(action=="WIZARD_ESC_CONFIRM"){
   if(c!=zjBootId||a!="TONES_CONFIRMED"||b!="BATTERY_DISCONNECTED"||
    !zjMotorCalibrationPending||caller!=zjWizardEscOwner)return error("complete_low_and_confirm_esc_success_tones");
   zjWizardEscConfirmed=true;return zjWizardStatus();
  }
  if(zjImuMaintenanceBusy())return error("imu_calibration_busy");
  const int sep=c.indexOf(':'),nextSep=sep<0?-1:c.indexOf(':',sep+1);
  if(sep<0||nextSep<0||c.substring(0,sep)!=zjBootId)return error("wizard_board_restarted");
  const String esc=c.substring(sep+1,nextSep),accel=c.substring(nextSep+1);
  const bool reset=esc=="0R"||esc=="1R";
  long revision=0;
  if(!parseNumber(b.c_str(),0,999999999,revision)||uint32_t(revision)!=zjWizardSaved.revision)return error("wizard_configuration_changed");
  ZjWizardConfig next=zjWizardSaved;
  if(!next.motor.decode(a.c_str())||(!reset&&esc!="0"&&esc!="1"))return error("invalid_wizard_config");
  next.esc=esc[0]=='1';
  if(!next.esc&&!reset)return error("confirm_esc_calibration_first");
  const bool compatible=zjSameMotorWiring(next.motor,zjMotorConfig);
  for(int i=0;i<4;i++){
   const uint16_t pulse=next.motor.minimumUs[i];
   if(pulse>1500&&!(reset&&compatible&&pulse==zjMotorConfig.minimumUs[i]))return error("wizard_calibration_pulse_out_of_range");
   if(!pulse&&!reset)return error("output_calibration_incomplete");
  }
  if(next.esc&&!(compatible&&zjMotorCalibrationSaved)&&
   !(zjWizardEscConfirmed&&caller==zjWizardEscOwner&&zjSameMotorWiring(next.motor,zjWizardEscConfig)))return error("confirm_esc_calibration_first");
  if(accel=="RESET")next.accel=ZjAccelModel{};
  else if(accel.startsWith("CAPTURED:")){
   const auto imu=zjReadImu(millis());
   if(caller!=zjWizardImuOwner||!imu.accelCapture.ready)return error("accelerometer_capture_required");
   next.accel=imu.accelCapture.result;
   char captured[80];next.accel.encode(captured,sizeof(captured));
   if(accel.substring(9)!=captured)return error("accelerometer_capture_changed");
  }else if(accel!="KEEP")return error("invalid_accelerometer_action");
  if(!zjPersistWizard(next))return error("wizard_save_failed");
  zjMotorCalibrationPending=false;zjWizardEscConfirmed=false;zjWizardEscOwner="";++zjMotorCommandSeq;
  if(accel!="KEEP")zjQueueImuAction(ZjImuAction::CLEAR_ACCEL,0);
  return zjWizardStatus();
 }
#endif
 if(action=="CAL_CONFIRM"){
  if(!authorized)return error("authorization_required");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardEscOwner.length())return error("save_calibration_from_wizard_report");
#endif
  if(a!="TONES_CONFIRMED"||zjMotor.benchEnabled||(!zjMotorCalibrationSaved&&!zjMotorCalibrationPending))return error("complete_low_and_confirm_esc_success_tones");
  if(!zjMotorSaveCalibration(true))return error("esc_calibration_save_failed");
  zjMotorCalibrationPending=false;++zjMotorCommandSeq;return zjMotorStatus();
 }
 const uint32_t now=millis();
 if(action=="BEGIN"||action=="WIZARD_BEGIN"){
  if(!authorized)return error("unlock_usb_teacher_or_authorize_network_control");
  if(!zjMotorConfigValid)return error("saved_motor_config_invalid_factory_reset_required");
  if(zjMotor.benchEnabled)return error("motor_setup_already_owned");
  const bool wizard=action=="WIZARD_BEGIN";
  if(a!="PROPS_REMOVED"||b!="PINS_VERIFIED"||(!wizard&&c!="PWM_50HZ_1000_2000"&&c!="PWM_50HZ_1000_2000_TIMED"))return error("confirm_props_pins_and_esc_profile");
  if(zjAccessBusy()||zjMaintenanceActive||zjRcInputArmed||zjRcThrottle>1050||!zjPpmAccessSafe())return error("stop_maintenance_lower_throttle_and_disarm_input");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjImuMaintenanceBusy())return error("imu_calibration_busy");
  if(wizard){
   const int sep=c.indexOf('|'),nextSep=sep<0?-1:c.indexOf('|',sep+1);long revision=0;
   if(sep<0||nextSep<0||c.substring(0,sep)!=zjBootId||
    !parseNumber(c.substring(sep+1,nextSep).c_str(),0,999999999,revision)||
    uint32_t(revision)!=zjWizardSaved.revision)return error("wizard_configuration_changed");
   if(!zjWizardBenchConfig.decode(c.substring(nextSep+1).c_str()))return error("invalid_wizard_wiring");
  }
  portENTER_CRITICAL(&zjMotorMux);zjMotorWatchTripped=false;portEXIT_CRITICAL(&zjMotorMux);
#else
  if(wizard)return error("a2_motor_driver_required");
#endif
 zjMotor.disable();zjMotorRtc=ZjMotorInput();if(!zjMotor.prepare(now,true,true,c=="PWM_50HZ_1000_2000_TIMED"||wizard))return error("setup_rejected");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  zjWizardBench=wizard;zjWizardCalSlider=false;
 if(wizard)for(auto& pulse:zjMotor.pulses)pulse=0;
#endif
  zjMotorOwner=caller;zjMotorToken=zjRcNewSession();zjMotorCommandSeq=0;zjMotorApply();
  String result=zjMotorStatus();return result.substring(0,result.length()-1)+",\"session\":"+zjJson(zjMotorToken)+"}";
 }
 // An operation deadline invalidates its token. KEEP may read the terminal
 // result but must never resurrect that expired session or reset its deadline.
 if(action=="KEEP"&&!zjMotor.benchEnabled)return zjMotorStatus();
 // A queued update can arrive just after the hard timer ends. Report normal
 // completion as the terminal state, rather than an authentication failure.
 if(token.length()&&!zjMotor.benchEnabled)return zjMotorStatus();
 if(!token.length()||token!=zjMotorToken||caller!=zjMotorOwner||!zjMotor.benchEnabled)return error("motor_session_expired_or_not_owner");
 if(action=="KEEP"){zjMotor.keep(now);zjMotorApply();return zjMotorStatus();}
 bool ok=false;long n=0,p=0,d=0;
 if(action=="RTC"){
  if(zjRcControlPath!="ANDROID_WEBRTC"||zjControlRadio()!="STA"||
    (zjMotor.mode!=ZjMotorSafety::READY&&zjMotor.mode!=ZjMotorSafety::INPUT_TEST))return error("explicit_webrtc_bench_required");
  const int colon=c.indexOf(':');const int second=colon>=0?c.indexOf(':',colon+1):-1;long yaw=0,arm=0,age=0;
  if(!parseNumber(a.c_str(),1,2147483647L,n)||!parseNumber(b.c_str(),1000,2000,p)||colon<0||second<0||
    !parseNumber(c.substring(0,colon).c_str(),1000,2000,yaw)||!parseNumber(c.substring(colon+1,second).c_str(),0,1,arm)||
    !parseNumber(c.substring(second+1).c_str(),0,200,age)||uint32_t(n)<=zjMotorRtc.sequence)return error("invalid_or_repeated_webrtc_frame");
  zjMotorRtc.source=ZjMotorInput::ANDROID_WEBRTC;zjMotorRtc.valid=true;zjMotorRtc.selected=true;
  zjMotorRtc.sequence=n;zjMotorRtc.throttle=p;zjMotorRtc.yaw=yaw;zjMotorRtc.inputArmed=arm;zjMotorRtc.receivedMs=now-age;
  return zjMotorStatus();
 }else if(action=="LAYOUT"){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardBench)return error("save_wiring_from_wizard_report");
#endif
  if(zjMotor.mode!=ZjMotorSafety::READY)return error("stop_outputs_before_saving_layout");
  ZjMotorConfig next=zjMotorConfig;
  char pins[5],rotations[5];for(int i=0;i<4;i++){pins[i]='0'+next.pins[i];rotations[i]='0'+next.rotation[i];}pins[4]=rotations[4]=0;
  if(!next.configure(a.c_str(),b=="-"?pins:b.c_str(),c=="-"?rotations:c.c_str()))return error("invalid_layout_or_duplicate_pin");
  if(!zjMotorSaveConfig(next))return error("layout_save_failed");ok=true;
 }else if(action=="MINIMUM"){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardBench)return error("save_calibration_from_wizard_report");
#endif
  if(zjMotor.mode!=ZjMotorSafety::READY)return error("stop_outputs_before_saving_minimum");
  if(c!="OBSERVED_SPIN"||!parseNumber(a.c_str(),1,4,n)||!parseNumber(b.c_str(),1000,2000,p))return error("confirm_observed_minimum_pulse");
  ZjMotorConfig next=zjMotorConfig;next.setMinimum(n,p);
  if(!zjMotorSaveConfig(next))return error("minimum_save_failed");ok=true;
 }else if(action=="SLIDER"||action=="CAL_SLIDER"){
  if(b!="1000"||!parseNumber(a.c_str(),1,15,n)||!parseNumber(c.c_str(),1,30000,d))return error("start_slider_at_1000_with_valid_selection");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(action=="CAL_SLIDER"){
   if(!zjWizardBench||zjMotor.mode!=ZjMotorSafety::READY)return error("wizard_calibration_session_required");
   zjMotor.timedBench=false;
  }
#endif
  ok=zjMotor.startSlider(now,n,d);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(ok)zjWizardCalSlider=action=="CAL_SLIDER";
#endif
 }else if(action=="SLIDE"){
  if(!parseNumber(a.c_str(),1,15,n)||n!=zjMotor.sliderMask||!parseNumber(b.c_str(),1000,2000,p)||!parseNumber(c.c_str(),1,2147483647L,d))return error("invalid_slider_pulse_selection_or_sequence");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardCalSlider&&p>1500)return error("wizard_calibration_pulse_out_of_range");
  if(zjWizardCalSlider&&p>1000&&uint32_t(now-zjMotor.modeAt)<500)return error("establish_calibration_low_first");
#endif
  ok=zjMotor.slide(now,p,d);
 }else if(action=="SINGLE"||action=="ALL"){
  if(!parseNumber(a.c_str(),1,4,n)||!parseNumber(b.c_str(),1000,2000,p)||!parseNumber(c.c_str(),1,2000,d)||(p-1000)%10)return error("invalid_motor_pulse_or_duration");
  ok=action=="SINGLE"?zjMotor.startSingle(now,n,(p-1000)/10,d):zjMotor.startAll(now,(p-1000)/10,d);
 }else if(action=="CAL_HIGH"){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(zjWizardBench&&zjMotor.mode==ZjMotorSafety::READY){zjMotor.timedBench=false;zjMotor.sessionAt=now;}
#endif
  ok=zjMotor.startCalibration(now,a=="POWER_DISCONNECTED");
  if(ok){
   // Invalidate an older confirmation before HIGH reaches the physical outputs.
   if(!zjMotorSaveCalibration(false)){zjMotorStop();return error("esc_calibration_save_failed");}
   zjMotorCalibrationPending=false;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
   zjWizardEscConfirmed=false;
   zjWizardEscOwner=zjWizardBench?caller:String("");
   zjWizardEscConfig=zjWizardBench?zjWizardBenchConfig:zjMotorConfig;
#endif
  }
 }
 else if(action=="CAL_LOW")ok=zjMotor.calibrationLow(now);
 else if(action=="INPUT"){
  const auto i=zjMotorReadInput();
  if(a!="selected"||!parseNumber(b.c_str(),100,30000,d)||c!="CONFIRM_ALL_MOTORS"||!i.valid||!i.selected||i.throttle>1050||i.inputArmed)return error("fresh_selected_low_disarmed_input_required");
  zjMotorPath=zjRcControlPath;zjMotorProducer=zjRcOwnerId;zjMotorRadio=zjControlRadio();zjMotorInputDuration=d;
  ok=zjMotor.startInput(now,i.source,false);
 }else return error("unsupported_motor_operation");
 if(!ok)return error("invalid_motor_transition");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(zjWizardCalSlider)for(int i=0;i<4;i++)if(!(zjMotor.sliderMask&(1U<<i)))zjMotor.pulses[i]=0;
#endif
 ++zjMotorCommandSeq;zjMotorApply();return zjMotorStatus();
}
static bool zjMotorSerial(char* line){
 if(strncmp(line,"ZJMOTOR,",8))return false;
 char* save=nullptr;char* id=strtok_r(line+8,",",&save),*request=strtok_r(nullptr,",",&save),*action=strtok_r(nullptr,",",&save),*token=strtok_r(nullptr,",",&save),
  *a=strtok_r(nullptr,",",&save),*b=strtok_r(nullptr,",",&save),*c=strtok_r(nullptr,",",&save);
 if(!id||String(id)!=zjKitId||!request||!zjAdminValue(request,1,24,false)||!action||!token||!a||!b||!c||strtok_r(nullptr,",",&save)){Serial.println("ZJMOTOR,ERR,INVALID_REQUEST");return true;}
 const String out=zjMotorCommand(action,"USB",String(token)=="-"?String(""):String(token),a,b,c,zjAdminAuthorized());
 Serial.print("ZJMOTOR,ACK,");Serial.print(zjKitId);Serial.print(',');Serial.print(request);Serial.print(',');Serial.println(out);return true;
}
static void zjMotorSetup(){
 zjMotorStopHandler=zjMotorStop;
 zjMotorLoadCalibration();
 const String saved=zjKitPrefs.getString("motorConfig2","");
 zjMotorConfigValid=!saved.length()||zjMotorConfig.decode(saved.c_str());
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 const String wizard=zjKitPrefs.getString("wizardSetup1","");
 if(wizard.length()){
  zjMotorConfigValid=zjWizardSaved.decode(wizard.c_str());
  zjMotorConfig=zjWizardSaved.motor;zjMotorCalibrationSaved=zjWizardSaved.esc;
 }else{zjWizardSaved.motor=zjMotorConfig;zjWizardSaved.esc=zjMotorCalibrationSaved;}
 zjSetAccelModel(zjWizardSaved.accel);
 ledc_timer_config_t timer={};timer.speed_mode=LEDC_LOW_SPEED_MODE;timer.duty_resolution=LEDC_TIMER_14_BIT;timer.timer_num=ZJ_MOTOR_TIMER;timer.freq_hz=50;timer.clk_cfg=LEDC_AUTO_CLK;
 bool ok=ZJ_ESC_PROFILE.deployable()&&ledc_timer_config(&timer)==ESP_OK;
 for(int n=0;n<4;n++){
  ledc_channel_config_t channel={};channel.gpio_num=ZJ_MOTOR_PINS[n];channel.speed_mode=LEDC_LOW_SPEED_MODE;channel.channel=ledc_channel_t(n);channel.timer_sel=ZJ_MOTOR_TIMER;channel.duty=0;
  ok=(ledc_channel_config(&channel)==ESP_OK)&&ok;
 }
 esp_timer_create_args_t args={};args.callback=zjMotorWatch;args.name="motor_deadline";
 ok=(esp_timer_create(&args,&zjMotorWatchTimer)==ESP_OK)&&ok;
 if(ok)ok=esp_timer_start_periodic(zjMotorWatchTimer,5000)==ESP_OK;
 zjMotorDriverReady=ok;
 if(!ok){for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);}
#endif
 zjHttp.on("/api/motor",HTTP_POST,[](){
  if(!zjAllow())return;
  const bool permitted=zjRequestSession>=0&&!zjSessions[zjRequestSession].localSta;
  const String out=zjMotorCommand(zjArg("action"),zjRequestSession>=0?zjSessions[zjRequestSession].id:String(""),zjArg("session"),zjArg("a"),zjArg("b"),zjArg("c"),permitted);
  zjReply(out.startsWith("{\"error\"")?409:200,out);
 });
}
