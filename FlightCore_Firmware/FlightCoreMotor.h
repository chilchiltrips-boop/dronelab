#pragma once
#include "FlightCoreA2MotorLayout.h"
#include "FlightCoreMotorSafety.h"
#include "FlightCoreMotorConfig.h"
#include "FlightCoreEscProfile.h"
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include "FlightCoreWizardConfig.h"
#include "FlightCoreAutoEsc.h"
static ZjAutoEscRecord zjAutoEscRecord;
static ZjAutoEscSequence zjAutoEscSequence;
static bool zjAutoEscRecordVerified=true,zjAutoEscFinalized=true,zjAutoEscStorageError=false;
static void zjAutoEscTick(uint32_t now);
static void zjAutoEscLoop();
static bool zjAutoEscCancel(bool discardResult=false);
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
static volatile bool zjMotorPwmOffAck=false;
static volatile ZjMotorSafety::Reason zjMotorWatchReason=ZjMotorSafety::DEADLINE_MISSED;
static esp_timer_handle_t zjMotorWatchTimer=nullptr;
static void zjMotorWatch(void*){
 portENTER_CRITICAL(&zjMotorMux);
 if(zjAutoEscSequence.active()){
  zjAutoEscTick(millis());portEXIT_CRITICAL(&zjMotorMux);return;
 }
 if(zjMotorWatchActive&&uint32_t(millis()-zjMotorWatchAt)>=zjMotorWatchLimit){
  zjMotorWatchTripped=true;zjMotorWatchActive=false;
  bool off=true;
  for(int n=0;n<4;n++)off=(ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0)==ESP_OK)&&off;
  zjMotorPwmOffAck=off;
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
static bool zjWizardEscConfirmed=false,zjWizardRecordVerified=true;
static String zjWizardEscOwner,zjWizardImuOwner;
static String zjWizardCaptureOwner;
static ZjMotorConfig zjWizardCaptureConfig;
static uint16_t zjWizardCapturedMinimum[4]={};
static bool zjSameMotorWiring(const ZjMotorConfig& a,const ZjMotorConfig& b){
 return a.plus==b.plus&&!memcmp(a.pins,b.pins,sizeof(a.pins))&&!memcmp(a.rotation,b.rotation,sizeof(a.rotation));
}
static void zjUseWizardRecord(const ZjWizardConfig& config){
 zjWizardSaved=config;zjMotorConfig=config.motor;zjMotorConfigValid=true;zjMotorCalibrationSaved=config.esc;
 zjSetAccelModel(config.accel);zjWizardRecordVerified=true;
}
static bool zjRecoverWizardReadback(){
 if(zjWizardRecordVerified)return true;
 if(zjMotor.benchEnabled)return false;
 ZjWizardConfig actual;
 const String stored=zjKitPrefs.getString("wizardSetup1","");
 if(!actual.decode(stored.c_str()))return false;
 zjUseWizardRecord(actual);return true;
}
static bool zjPersistWizard(ZjWizardConfig next,bool configurationChange=true){
 if((configurationChange&&zjWizardSaved.revision>=999999999)||!next.accel.valid())return false;
 next.revision=zjWizardSaved.revision+(configurationChange?1:0);
 char encoded[176];next.encode(encoded,sizeof(encoded));const String value(encoded);
 const String previous=zjKitPrefs.getString("wizardSetup1","");
 const size_t written=zjKitPrefs.putString("wizardSetup1",value);
 const String stored=zjKitPrefs.getString("wizardSetup1","");
 if(stored==value){zjUseWizardRecord(next);return true;}
 // A verified earlier record remains usable after a rejected write. If NVS
 // cannot confirm either record, block further actuation and writes.
 ZjWizardConfig actual;
 if(actual.decode(stored.c_str()))zjUseWizardRecord(actual);
 else zjWizardRecordVerified=!zjWizardSaved.revision&&written==0&&stored==previous;
 return false;
}
static const char* zjWizardCapturedAccel(const String& caller,const String& encoded,ZjAccelModel& model){
 const auto imu=zjReadImu(millis());
 if(caller!=zjWizardImuOwner||!imu.accelCapture.ready)return "accelerometer_capture_required";
 char captured[80];imu.accelCapture.result.encode(captured,sizeof(captured));
 if(encoded!=captured)return "accelerometer_capture_changed";
 model=imu.accelCapture.result;return nullptr;
}
#endif
static void zjMotorLoadCalibration(){
 zjMotorCalibrationSaved=zjKitPrefs.getString("motorCal1","")==ZJ_ESC_CALIBRATION_RECORD;
 zjMotorCalibrationPending=false;
}
static bool zjMotorSaveCalibration(bool saved){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(!saved&&!zjAutoEscCancel(true))return false;
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
 if(!zjSameMotorWiring(next,zjMotorConfig)){
  if(!zjAutoEscCancel(true))return false;
  updated.esc=false;
 }
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
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 portENTER_CRITICAL(&zjMotorMux);const auto phase=zjAutoEscSequence.phase;portEXIT_CRITICAL(&zjMotorMux);
 if(phase==ZjAutoEscSequence::HIGH_PHASE||phase==ZjAutoEscSequence::LOW_PHASE)return phase==ZjAutoEscSequence::HIGH_PHASE?"AUTO_CAL_HIGH":"AUTO_CAL_LOW";
#endif
 static const char* names[]={"DISABLED","READY","INPUT_TEST","SINGLE_TEST","ALL_TEST","CAL_HIGH","CAL_LOW","FAULT","SLIDER_TEST"};
 return names[zjMotor.mode];
}
static const char* zjMotorReason(){
 static const char* names[]={"NONE","USER_STOP","SESSION_EXPIRED","INPUT_LOST","INPUT_CHANGED","ARM_REQUIRED","THROTTLE_HIGH","SWITCH_REQUIRED","TEST_FINISHED","CAL_TIMEOUT","CAL_FINISHED","OUTPUT_ERROR","DEADLINE_MISSED","CONFIG_ERROR","CONTROL_LOST"};
 return names[zjMotor.reason];
}
static void zjMotorApply(){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 portENTER_CRITICAL(&zjMotorMux);
 const bool autoActive=zjAutoEscSequence.active();
 portEXIT_CRITICAL(&zjMotorMux);
 if(autoActive){zjMotorEnabled=zjMotorSessionActive=true;zjMotorArmed=zjMotorInputTest=false;return;}
#endif
 const bool enabled=zjMotor.benchEnabled&&zjMotor.mode!=ZjMotorSafety::FAULT;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 portENTER_CRITICAL(&zjMotorMux);
 if(zjMotorWatchTripped&&enabled){
  if(zjMotorWatchReason==ZjMotorSafety::DEADLINE_MISSED)zjMotor.fault(zjMotorWatchReason);
  else zjMotor.disable(zjMotorWatchReason);
 }
 if(zjMotorDriverReady){
  zjMotorPwmOffAck=false;
  for(int n=0;n<4;n++){
   const auto& wiring=zjWizardBench?zjWizardBenchConfig:zjMotorConfig;
   const uint32_t duty=zjMotor.benchEnabled?ZJ_ESC_PROFILE.duty(wiring.physicalPulse(n,zjMotor.pulses)):0;
   if(ledc_set_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),duty)!=ESP_OK||
      ledc_update_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n))!=ESP_OK)zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);
  }
  if(!zjMotor.benchEnabled){
   bool off=true;
   for(int n=0;n<4;n++)off=(ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0)==ESP_OK)&&off;
   zjMotorPwmOffAck=off;
   if(!off)zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);
  }
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
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 zjMotorSessionActive=zjMotorSessionActive||zjAutoEscRecord.state==ZjAutoEscRecord::PENDING;
#endif
 zjMotorInputTest=zjMotor.mode==ZjMotorSafety::INPUT_TEST;
 if(!zjMotor.benchEnabled){
  zjMotorToken="";zjMotorOwner="";
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  zjWizardBench=false;zjWizardCalSlider=false;
#endif
 }
}
static void zjMotorStop(){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 (void)zjAutoEscCancel();
 if(zjWizardEscOwner.length()&&!zjWizardEscConfirmed){zjMotorCalibrationPending=false;zjWizardEscOwner="";}
#endif
 zjMotor.disable();zjMotorApply();
}
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
#if defined(CONFIG_IDF_TARGET_ESP32C6)
static void zjAutoEscWiring(char* out,size_t size){
 auto wiring=zjMotorConfig;memset(wiring.minimumUs,0,sizeof(wiring.minimumUs));wiring.encode(out,size);
}
static bool zjAutoEscCompatible(){
 char wiring[64];zjAutoEscWiring(wiring,sizeof(wiring));
 return zjMotorConfigValid&&zjAutoEscRecordVerified&&zjKitId==zjAutoEscRecord.kit&&!strcmp(wiring,zjAutoEscRecord.wiring);
}
static bool zjAutoEscStore(const ZjAutoEscRecord& next){
 char encoded[144];next.encode(encoded,sizeof(encoded));
 zjKitPrefs.putString("escAuto1",encoded);
 const String stored=zjKitPrefs.getString("escAuto1","");
 if(stored==encoded){zjAutoEscRecord=next;zjAutoEscRecordVerified=true;zjAutoEscStorageError=false;return true;}
 ZjAutoEscRecord actual;zjAutoEscRecordVerified=stored.isEmpty()||actual.decode(stored.c_str());
 if(zjAutoEscRecordVerified)zjAutoEscRecord=actual;
 zjAutoEscStorageError=true;return false;
}
static bool zjAutoEscOutputsOff(){
 if(!zjMotorDriverReady)return false;
 // ledc_stop disables the output but may retain the old duty register. A
 // get_duty value is therefore not evidence of whether PWM is enabled.
 portENTER_CRITICAL(&zjMotorMux);const bool off=zjMotorPwmOffAck;portEXIT_CRITICAL(&zjMotorMux);
 return off;
}
// Called with zjMotorMux held, from the timer task or startup/STOP. No flash,
// network, allocations, input claims or application sessions in this path.
static void zjAutoEscWrite(){
 const uint16_t pulse=zjAutoEscSequence.pulse();bool ok=true;
 zjMotorPwmOffAck=false;
 for(int n=0;n<4;n++){
  if(!pulse)ok=(ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0)==ESP_OK)&&ok;
  else{
   ok=(ledc_set_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),ZJ_ESC_PROFILE.duty(pulse))==ESP_OK)&&ok;
   ok=(ledc_update_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n))==ESP_OK)&&ok;
  }
 }
 if(!ok){
  zjAutoEscSequence.stop(ZjAutoEscRecord::DRIVER_ERROR);
  for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);
 }
 if(!pulse&&ok)zjMotorPwmOffAck=true;
}
static void zjAutoEscTick(uint32_t now){if(zjAutoEscSequence.update(now))zjAutoEscWrite();}
static void zjAutoEscLoop(){
 if(zjAutoEscFinalized)return;
 portENTER_CRITICAL(&zjMotorMux);
 const auto phase=zjAutoEscSequence.phase;const auto reason=zjAutoEscSequence.reason;
 portEXIT_CRITICAL(&zjMotorMux);
 if(phase==ZjAutoEscSequence::HIGH_PHASE||phase==ZjAutoEscSequence::LOW_PHASE)return;
 // OFF must be verified before storing any successful controller result.
 auto result=zjAutoEscRecord;
 result.state=phase==ZjAutoEscSequence::DONE&&zjAutoEscOutputsOff()?ZjAutoEscRecord::COMPLETE:ZjAutoEscRecord::INTERRUPTED;
 result.reason=result.state==ZjAutoEscRecord::COMPLETE?ZjAutoEscRecord::NONE:
  reason==ZjAutoEscRecord::NONE?ZjAutoEscRecord::DRIVER_ERROR:reason;
 zjAutoEscFinalized=true; // A failed result write needs an explicit retry.
 (void)zjAutoEscStore(result);
 zjMotorEnabled=zjMotorArmed=zjMotorSessionActive=false;
}
static bool zjAutoEscCancel(bool discardResult){
 portENTER_CRITICAL(&zjMotorMux);
 const bool running=zjAutoEscSequence.active();
 if(running||(discardResult&&zjAutoEscSequence.phase==ZjAutoEscSequence::DONE)){
  // Retire the RAM retry proof even when persisting cancellation fails.
  zjAutoEscSequence.stop(ZjAutoEscRecord::STOPPED);zjAutoEscWrite();
 }
 portEXIT_CRITICAL(&zjMotorMux);
 if(running||(discardResult&&(!zjAutoEscRecordVerified||zjAutoEscRecord.state!=ZjAutoEscRecord::EMPTY))){
  zjWizardEscConfirmed=zjMotorCalibrationPending=false;zjWizardEscOwner="";
 }
 if(running){zjAutoEscLoop();return !zjAutoEscStorageError;}
 if(!zjAutoEscRecordVerified||zjAutoEscRecord.state==ZjAutoEscRecord::PENDING||
    (discardResult&&zjAutoEscRecord.state!=ZjAutoEscRecord::EMPTY&&zjAutoEscRecord.state!=ZjAutoEscRecord::CANCELLED)){
  auto cancelled=zjAutoEscRecord;cancelled.state=ZjAutoEscRecord::CANCELLED;cancelled.reason=ZjAutoEscRecord::STOPPED;
  if(!cancelled.attempt)cancelled.attempt=1;
  if(!cancelled.kit[0])snprintf(cancelled.kit,sizeof(cancelled.kit),"%s",zjKitId.c_str());
  if(!cancelled.wiring[0])zjAutoEscWiring(cancelled.wiring,sizeof(cancelled.wiring));
  return zjAutoEscStore(cancelled);
 }
 return true;
}
static void zjAutoEscBoot(bool coldPowerOn){
 if(zjAutoEscRecord.state!=ZjAutoEscRecord::PENDING&&zjAutoEscRecord.state!=ZjAutoEscRecord::RUNNING)return;
 auto record=zjAutoEscRecord;
 const bool requested=record.state==ZjAutoEscRecord::PENDING;
 if(!requested||!coldPowerOn||!zjAutoEscCompatible()||!zjWizardRecordVerified||!zjMotorDriverReady||!zjAutoEscOutputsOff()){
  record.state=ZjAutoEscRecord::INTERRUPTED;
  record.reason=!requested?ZjAutoEscRecord::RESET_DURING_SEQUENCE:!coldPowerOn?ZjAutoEscRecord::COLD_POWER_ON_REQUIRED:
   !zjAutoEscCompatible()?ZjAutoEscRecord::SETUP_CHANGED:ZjAutoEscRecord::DRIVER_ERROR;
  (void)zjAutoEscStore(record);return;
 }
 // Consume and read back BEFORE the first HIGH. RUNNING never starts again
 // after reset, brownout, watchdog or power failure, even if saving failed.
 record.state=ZjAutoEscRecord::RUNNING;record.reason=ZjAutoEscRecord::NONE;
 if(!zjAutoEscStore(record))return;
 zjAutoEscFinalized=false;
 portENTER_CRITICAL(&zjMotorMux);
 zjMotorWatchActive=false;zjAutoEscSequence.begin(millis());zjAutoEscWrite();
 const bool active=zjAutoEscSequence.active();
 portEXIT_CRITICAL(&zjMotorMux);
 zjMotorEnabled=zjMotorSessionActive=active;
}
static String zjAutoEscStatus(){
 portENTER_CRITICAL(&zjMotorMux);
 const auto sequence=zjAutoEscSequence;
 portEXIT_CRITICAL(&zjMotorMux);
 const bool compatible=zjAutoEscCompatible(),off=!sequence.active()&&zjAutoEscOutputsOff();
 char id[9];snprintf(id,sizeof(id),"%08lX",static_cast<unsigned long>(zjAutoEscRecord.attempt));
 return String("{\"version\":1,\"attemptId\":")+zjJson(id)+",\"state\":"+zjJson(zjAutoEscRecordVerified?ZjAutoEscRecord::stateName(zjAutoEscRecord.state):"INVALID_RECORD")+
  ",\"phase\":"+zjJson(sequence.phase==ZjAutoEscSequence::HIGH_PHASE?"HIGH":sequence.phase==ZjAutoEscSequence::LOW_PHASE?"LOW":"OFF")+
  ",\"reason\":"+zjJson(zjAutoEscStorageError?"STORAGE_ERROR":ZjAutoEscRecord::reasonName(zjAutoEscRecord.reason))+
  ",\"compatible\":"+(compatible?"true":"false")+",\"outputsOff\":"+(off?"true":"false")+
  ",\"resultPersisted\":"+(!zjAutoEscStorageError&&zjAutoEscRecordVerified&&zjAutoEscRecord.state==ZjAutoEscRecord::COMPLETE?"true":"false")+
  ",\"toneDetectionSupported\":false,\"offVerification\":\"LEDC_STOP_ACK\",\"confirmationSource\":\"OPERATOR\",\"highMs\":5000,\"lowMs\":5000,\"pulseUs\":"+String(sequence.pulse())+
  ",\"remainingMs\":"+String(sequence.remaining(millis()))+",\"confirmed\":"+(compatible&&zjMotorCalibrationSaved?"true":"false")+"}";
}
#endif
static void zjMotorLoop(){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 zjAutoEscLoop();
#endif
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
 for(int n=0;n<4;n++){
  if(n)out+=',';
  uint16_t pulse=zjMotorEnabled?zjMotor.pulses[n]:0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  portENTER_CRITICAL(&zjMotorMux);if(zjAutoEscSequence.active())pulse=zjAutoEscSequence.pulse();portEXIT_CRITICAL(&zjMotorMux);
#endif
  out+=String(pulse);
 }
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
static String zjWizardStatus(uint32_t requestSequence=0){
 zjRecoverWizardReadback();
 const String status=zjMotorStatus();
 char saved[80],candidate[80];
 zjWizardSaved.accel.encode(saved,sizeof(saved));
 const auto imu=zjReadImu(millis());imu.accelCapture.result.encode(candidate,sizeof(candidate));
 return status.substring(0,status.length()-1)+",\"wizardVersion\":1,\"pageSaveVersion\":1,\"configRevision\":"+String(zjWizardSaved.revision)+
  ",\"autoEsc\":"+zjAutoEscStatus()+
  ",\"configVerified\":"+(zjWizardRecordVerified?"true":"false")+
  ",\"accelModel\":"+zjJson(saved)+",\"imu\":"+zjImuStatus()+
  ",\"escConfirmationStaged\":"+(zjWizardEscConfirmed?"true":"false")+
  ",\"imuRequestSequence\":"+String(requestSequence)+",\"capture\":{\"sequence\":"+String(imu.maintenanceSequence)+
  ",\"state\":"+zjJson(imu.accelCapture.state)+",\"running\":"+(imu.accelCapture.running?"true":"false")+
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
  if(!zjMotorCalibrationSaved&&(!zjAutoEscRecordVerified||zjAutoEscRecord.state==ZjAutoEscRecord::PENDING||
   zjAutoEscRecord.state==ZjAutoEscRecord::RUNNING||zjAutoEscRecord.state==ZjAutoEscRecord::COMPLETE)){
   (void)zjAutoEscCancel(true);
   zjWizardEscConfirmed=zjMotorCalibrationPending=false;zjWizardEscOwner="";
  }
  const bool stoppedSlider=zjWizardCalSlider&&zjMotor.mode==ZjMotorSafety::SLIDER_TEST&&
   token.length()&&token==zjMotorToken&&caller==zjMotorOwner;
  const uint8_t stoppedMask=zjMotor.sliderMask;
  uint16_t stoppedPulse=0;
  if(stoppedSlider)for(int i=0;i<4;i++)if(stoppedMask&(1U<<i)){stoppedPulse=zjMotor.pulses[i];break;}
  const auto stoppedConfig=zjWizardBenchConfig;
#endif
  zjMotorStop();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  if(stoppedSlider){
   if(a=="CAPTURE_OUTPUT"){
    if(zjWizardCaptureOwner!=caller||!zjSameMotorWiring(stoppedConfig,zjWizardCaptureConfig)){
     memset(zjWizardCapturedMinimum,0,sizeof(zjWizardCapturedMinimum));
    }
    zjWizardCaptureOwner=caller;zjWizardCaptureConfig=stoppedConfig;
    for(int i=0;i<4;i++)if(stoppedMask&(1U<<i))zjWizardCapturedMinimum[i]=stoppedPulse;
   }
   const String status=zjMotorStatus();
   return status.substring(0,status.length()-1)+",\"stoppedSlider\":true,\"stoppedMask\":"+String(stoppedMask)+
    ",\"stoppedPulseUs\":"+String(stoppedPulse)+"}";
  }
#endif
  return zjMotorStatus();
 }
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(action=="WIZARD_STATUS")return zjWizardStatus();
 // Result inspection and cancellation must remain available after a driver
 // initialization failure. Neither command can enable PWM.
 if(!zjMotorDriverReady&&action!="WIZARD_AUTO_ESC_CANCEL")return error("a2_motor_driver_required");
 const bool autoBusy=!zjAutoEscFinalized||zjAutoEscRecord.state==ZjAutoEscRecord::PENDING||zjAutoEscRecord.state==ZjAutoEscRecord::RUNNING;
 if(autoBusy&&action!="WIZARD_AUTO_ESC_PREPARE"&&action!="WIZARD_AUTO_ESC_CANCEL"&&action!="WIZARD_AUTO_ESC_RETRY")return error("automatic_esc_calibration_pending_or_running");
 if(action=="WIZARD_AUTO_ESC_PREPARE"||action=="WIZARD_AUTO_ESC_CANCEL"||action=="WIZARD_AUTO_ESC_RETRY"){
  if(!authorized)return error("authorization_required");
  if(c!=zjBootId)return error("wizard_board_restarted");
  if(action=="WIZARD_AUTO_ESC_CANCEL"){
   if(a!="CONFIRM_CANCEL")return error("confirm_automatic_calibration_cancel");
   if(!zjAutoEscCancel(true))return error("automatic_calibration_cancel_save_failed");
   zjWizardEscConfirmed=zjMotorCalibrationPending=false;zjWizardEscOwner="";
   return zjWizardStatus();
  }
  if(action=="WIZARD_AUTO_ESC_RETRY"){
   if(!zjAutoEscStorageError||zjAutoEscRecord.state!=ZjAutoEscRecord::RUNNING||!zjAutoEscCompatible()||
    a!=String(zjAutoEscRecord.attempt)||zjAutoEscSequence.phase!=ZjAutoEscSequence::DONE||!zjAutoEscOutputsOff())return error("completed_auto_sequence_required");
   zjAutoEscFinalized=false;zjAutoEscLoop();
   if(zjAutoEscStorageError)return error("automatic_calibration_result_save_failed");
   return zjWizardStatus();
  }
  portENTER_CRITICAL(&zjMotorMux);const bool autoActive=zjAutoEscSequence.active();portEXIT_CRITICAL(&zjMotorMux);
  if(autoActive||zjMotor.benchEnabled||zjMotorEnabled||zjAccessBusy()||zjMaintenanceActive||
   zjRcInputArmed||zjRcThrottle>1050||!zjPpmAccessSafe()||zjImuMaintenanceBusy())return error("stop_maintenance_lower_throttle_and_disarm_input");
  long revision=0;
  if(!parseNumber(b.c_str(),0,999999999,revision)||uint32_t(revision)!=zjWizardSaved.revision)return error("wizard_configuration_changed");
  if(a!="PROPS_REMOVED:WIRING_VERIFIED:POWER_CYCLE_UNDERSTOOD")return error("confirm_props_wiring_and_power_cycle");
  if(!zjRecoverWizardReadback()||!zjMotorConfigValid||!zjAutoEscRecordVerified||!zjAutoEscOutputsOff())return error("verified_setup_and_pwm_off_required");
  if(zjAutoEscRecord.state==ZjAutoEscRecord::PENDING&&zjAutoEscCompatible()&&!zjAutoEscStorageError)return zjWizardStatus();
  // Invalidate old confirmation AND starting pulses before authorizing HIGH.
  // Re-learning endpoints changes the meaning of earlier minimum-pulse tests.
  auto next=zjWizardSaved;next.motor=zjMotorConfig;next.esc=false;
  memset(next.motor.minimumUs,0,sizeof(next.motor.minimumUs));
  bool invalidate=!next.revision||zjMotorCalibrationSaved;
  for(auto pulse:zjMotorConfig.minimumUs)invalidate=invalidate||pulse!=0;
  if(invalidate&&!zjPersistWizard(next))return error("esc_invalidation_save_failed");
  ZjAutoEscRecord request;request.state=ZjAutoEscRecord::PENDING;
  request.attempt=esp_random();if(!request.attempt||request.attempt==zjAutoEscRecord.attempt)request.attempt=zjAutoEscRecord.attempt+1;
  if(!request.attempt)request.attempt=1;
  snprintf(request.kit,sizeof(request.kit),"%s",zjKitId.c_str());zjAutoEscWiring(request.wiring,sizeof(request.wiring));
  if(!zjAutoEscStore(request))return error("automatic_calibration_prepare_save_failed_read_back_before_retry");
  portENTER_CRITICAL(&zjMotorMux);zjAutoEscSequence=ZjAutoEscSequence{};portEXIT_CRITICAL(&zjMotorMux);zjAutoEscFinalized=true;
  zjMotorCalibrationPending=zjWizardEscConfirmed=false;zjWizardEscOwner="";
  memset(zjWizardCapturedMinimum,0,sizeof(zjWizardCapturedMinimum));zjWizardCaptureOwner="";
  ++zjMotorCommandSeq;return zjWizardStatus();
 }
 if(action=="WIZARD_IMU"||action=="WIZARD_SAVE"||action=="WIZARD_SAVE_PAGE"||action=="WIZARD_ESC_CONFIRM"){
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
   const uint32_t sequence=request==ZjImuAction::NONE?0:zjQueueImuAction(request,uint8_t(face));
   if(!sequence)return error("imu_request_rejected");
   zjWizardImuOwner=caller;
   return zjWizardStatus(sequence);
  }
  if(action=="WIZARD_ESC_CONFIRM"){
   if(a=="AUTO_TONES_CONFIRMED"){
    char attempt[9];snprintf(attempt,sizeof(attempt),"%08lX",static_cast<unsigned long>(zjAutoEscRecord.attempt));
    if(c!=zjBootId||b!=String(attempt)+":BATTERY_DISCONNECTED"||!zjAutoEscCompatible()||zjAutoEscStorageError||
     zjAutoEscRecord.state!=ZjAutoEscRecord::COMPLETE||!zjAutoEscOutputsOff())return error("complete_auto_sequence_and_confirm_esc_success_tones");
    zjWizardEscOwner=caller;zjWizardEscConfig=zjMotorConfig;zjMotorCalibrationPending=true;
    zjWizardEscConfirmed=true;return zjWizardStatus();
   }
   if(c!=zjBootId||a!="TONES_CONFIRMED"||b!="BATTERY_DISCONNECTED"||
    !zjMotorCalibrationPending||caller!=zjWizardEscOwner)return error("complete_low_and_confirm_esc_success_tones");
   zjWizardEscConfirmed=true;return zjWizardStatus();
  }
  if(zjImuMaintenanceBusy())return error("imu_calibration_busy");
  if(!zjRecoverWizardReadback())return error("wizard_readback_required");
  if(action=="WIZARD_SAVE_PAGE"){
   const int sep=c.indexOf(':');
   if(sep<0||c.substring(0,sep)!=zjBootId)return error("wizard_board_restarted");
   const String scope=c.substring(sep+1);
   long revision=0;
   if(!parseNumber(b.c_str(),0,999999999,revision)||uint32_t(revision)!=zjWizardSaved.revision)return error("wizard_configuration_changed");
   if(!zjMotorConfigValid&&scope!="RESET_ALL")return error("reset_all_setup_required");
   ZjWizardConfig next=zjWizardSaved;next.motor=zjMotorConfig;next.esc=zjMotorCalibrationSaved;
   bool clearEscProof=false,clearAccelCapture=false,clearOutputCapture=false;
   if(scope=="WIRING"){
    ZjMotorConfig wiring;
    if(!wiring.decode(a.c_str()))return error("invalid_wizard_wiring");
    for(uint16_t pulse:wiring.minimumUs)if(pulse)return error("wiring_save_must_exclude_minimum_pulses");
    if(!zjSameMotorWiring(wiring,zjMotorConfig)){
     next.motor=wiring;next.esc=false;clearEscProof=clearOutputCapture=true;
    }
   }else if(scope=="ACCEL"){
    if(!a.startsWith("CAPTURED:"))return error("accelerometer_capture_required");
    const char* failure=zjWizardCapturedAccel(caller,a.substring(9),next.accel);
    if(failure)return error(failure);
    clearAccelCapture=true;
   }else if(scope=="ESC"){
    if(a!="TONES_CONFIRMED"||(!next.esc&&
     !(zjWizardEscConfirmed&&caller==zjWizardEscOwner&&zjSameMotorWiring(zjMotorConfig,zjWizardEscConfig))))return error("confirm_esc_calibration_first");
    next.esc=true;clearEscProof=true;
   }else if(scope=="ALL"||(scope.length()==2&&scope[0]=='M'&&scope[1]>='1'&&scope[1]<='4')){
    long pulse=0;
    if(!parseNumber(a.c_str(),1000,1500,pulse))return error("wizard_calibration_pulse_out_of_range");
    if(!next.esc)return error("save_esc_calibration_first");
    const uint8_t selected=scope=="ALL"?15:1U<<(scope[1]-'1');
    for(int i=0;i<4;i++)if(selected&(1U<<i)){
     if(next.motor.minimumUs[i]!=pulse&&
      !(caller==zjWizardCaptureOwner&&zjSameMotorWiring(zjMotorConfig,zjWizardCaptureConfig)&&
       zjWizardCapturedMinimum[i]==pulse))return error("confirmed_output_capture_required");
     next.motor.minimumUs[i]=uint16_t(pulse);
    }
   }else if(scope=="RESET_ALL"||scope=="RESET_ACCEL"||scope=="RESET_ESC"||scope=="RESET_OUTPUT"){
    if(a!="CONFIRM_RESET")return error("confirm_wizard_reset");
    if(scope=="RESET_ALL"){next.motor=ZjMotorConfig{};next.accel=ZjAccelModel{};next.esc=false;}
    if(scope=="RESET_ACCEL")next.accel=ZjAccelModel{};
    if(scope=="RESET_ESC"){next.esc=false;memset(next.motor.minimumUs,0,sizeof(next.motor.minimumUs));}
    if(scope=="RESET_OUTPUT")memset(next.motor.minimumUs,0,sizeof(next.motor.minimumUs));
    clearEscProof=scope=="RESET_ALL"||scope=="RESET_ESC";
    clearAccelCapture=scope=="RESET_ALL"||scope=="RESET_ACCEL";
    clearOutputCapture=scope=="RESET_ALL"||scope=="RESET_OUTPUT"||scope=="RESET_ESC";
   }else return error("unsupported_wizard_save_scope");
   char before[176],after[176];
   zjWizardSaved.encode(before,sizeof(before));next.encode(after,sizeof(after));
   if(clearEscProof&&scope!="ESC"&&!zjAutoEscCancel(true))return error("automatic_calibration_cancel_save_failed");
   if((!zjWizardSaved.revision||strcmp(before,after))&&!zjPersistWizard(next))return error("wizard_save_failed");
   if(clearEscProof){zjMotorCalibrationPending=false;zjWizardEscConfirmed=false;zjWizardEscOwner="";}
   if(clearAccelCapture)zjQueueImuAction(ZjImuAction::CLEAR_ACCEL,0);
   if(clearOutputCapture){memset(zjWizardCapturedMinimum,0,sizeof(zjWizardCapturedMinimum));zjWizardCaptureOwner="";}
   ++zjMotorCommandSeq;return zjWizardStatus();
  }
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
   const char* failure=zjWizardCapturedAccel(caller,accel.substring(9),next.accel);
   if(failure)return error(failure);
  }else if(accel!="KEEP")return error("invalid_accelerometer_action");
  if((reset||!compatible)&&!zjAutoEscCancel(true))return error("automatic_calibration_cancel_save_failed");
  if(!zjPersistWizard(next))return error("wizard_save_failed");
  zjMotorCalibrationPending=false;zjWizardEscConfirmed=false;zjWizardEscOwner="";++zjMotorCommandSeq;
  if(accel!="KEEP")zjQueueImuAction(ZjImuAction::CLEAR_ACCEL,0);
  return zjWizardStatus();
 }
#endif
 if(!zjMotorDriverReady)return error("a2_motor_driver_required");
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
  if(!zjRecoverWizardReadback())return error("wizard_readback_required");
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
 zjAutoEscSequence=ZjAutoEscSequence{};zjAutoEscFinalized=true;zjAutoEscStorageError=false;zjAutoEscRecord=ZjAutoEscRecord{};
 const String autoRecord=zjKitPrefs.getString("escAuto1","");
 zjAutoEscRecordVerified=autoRecord.isEmpty()||zjAutoEscRecord.decode(autoRecord.c_str());
 const String wizard=zjKitPrefs.getString("wizardSetup1","");
 zjWizardCaptureOwner="";memset(zjWizardCapturedMinimum,0,sizeof(zjWizardCapturedMinimum));
 zjWizardRecordVerified=true;
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
 zjMotorPwmOffAck=ok;
 if(!ok){for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);}
#endif
 zjHttp.on("/api/motor",HTTP_POST,[](){
  if(!zjAllow())return;
  const bool permitted=zjRequestSession>=0&&!zjSessions[zjRequestSession].localSta;
  const String out=zjMotorCommand(zjArg("action"),zjRequestSession>=0?zjSessions[zjRequestSession].id:String(""),zjArg("session"),zjArg("a"),zjArg("b"),zjArg("c"),permitted);
  zjReply(out.startsWith("{\"error\"")?409:200,out);
 });
}
