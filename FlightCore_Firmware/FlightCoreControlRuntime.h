#pragma once
#include "FlightCoreTiming.h"
#include "FlightCoreRatePid.h"
#include "FlightCoreFlightOutput.h"
static ZjImuAcquisition zjImuDriver;
static ZjControlScheduler zjControl;
static FlightReceiverSnapshot zjControlInput;

static bool zjControlRuntimeReady=false;
struct ZjRateShadowResult {
 uint32_t revision=0,computeMaxUs=0,imuReadMaxUs=0,imuSampleAgeUs=0;
 uint32_t phaseMaxUs[4]={};
 bool deadlineFault=false,outputAuthorized=false;
 const char* maxIntervalPhase="STARTUP";
 const char* reason="DISARMED";
 ZjRateMix mix;
};
static ZjRateShadowResult zjRateShadow;
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
#include <esp_timer.h>
#include <freertos/semphr.h>
static SemaphoreHandle_t zjI2cMutex=nullptr;
static portMUX_TYPE zjTimingMux=portMUX_INITIALIZER_UNLOCKED;
static ZjImuAcquisition zjImuMailbox;
static ZjRateGains zjShadowGains[3];
static uint32_t zjShadowRevision=0,zjFlightRevokeEpoch=0;
static ZjFlightOutputGate zjFlightOutputGate;
static bool zjShadowRequested=false;
static ZjAccelModel zjSavedAccelModel;
static ZjImuAction zjPendingImuAction=ZjImuAction::NONE;
static uint8_t zjPendingImuFace=0;
static uint32_t zjImuRequestSequence=0;
static bool zjImuActionInFlight=false;
static void zjSetAccelModel(const ZjAccelModel& model){
 portENTER_CRITICAL(&zjTimingMux);zjSavedAccelModel=model;portEXIT_CRITICAL(&zjTimingMux);
}
static bool zjImuMaintenanceBusy(){
 portENTER_CRITICAL(&zjTimingMux);
 const bool busy=zjPendingImuAction!=ZjImuAction::NONE||zjImuActionInFlight||zjImuMailbox.manualGyro||zjImuMailbox.accelCapture.running;
 portEXIT_CRITICAL(&zjTimingMux);return busy;
}
static uint32_t zjQueueImuAction(ZjImuAction action,uint8_t face){
 portENTER_CRITICAL(&zjTimingMux);
 const bool accepted=zjControlRuntimeReady&&zjPendingImuAction==ZjImuAction::NONE&&!zjImuActionInFlight;
 if(accepted){
  zjPendingImuAction=action;zjPendingImuFace=face;
  if(!++zjImuRequestSequence)++zjImuRequestSequence;
 }
 const uint32_t sequence=accepted?zjImuRequestSequence:0;
 portEXIT_CRITICAL(&zjTimingMux);return sequence;
}
static TaskHandle_t zjControlTaskHandle=nullptr,zjImuTaskHandle=nullptr;
static esp_timer_handle_t zjControlTimer=nullptr,zjImuTimer=nullptr;
// TASK dispatch, never ISR: notify only. Both callbacks share esp_timer with
// the motor watchdog, so I2C and all computation run in separate workers.
static void zjControlWake(void*){xTaskNotifyGive(zjControlTaskHandle);}
static void zjImuWake(void*){xTaskNotifyGive(zjImuTaskHandle);}
static bool zjTryI2c(){return zjI2cMutex&&xSemaphoreTake(zjI2cMutex,0)==pdTRUE;}
static void zjReleaseI2c(){xSemaphoreGive(zjI2cMutex);}
static void zjImuTask(void*){
 for(;;){
  ulTaskNotifyTake(pdTRUE,portMAX_DELAY); // coalesce notifications, no catch-up reads
  if(!zjTryI2c())continue; // on-demand scanner owns at most one bounded transaction
  portENTER_CRITICAL(&zjTimingMux);
  const auto action=zjPendingImuAction;const uint8_t face=zjPendingImuFace;
  const uint32_t sequence=zjImuRequestSequence;
  zjImuActionInFlight=action!=ZjImuAction::NONE;zjPendingImuAction=ZjImuAction::NONE;
  zjImuDriver.accelModel=zjSavedAccelModel;
  portEXIT_CRITICAL(&zjTimingMux);
  const uint32_t now=millis();
  if(action!=ZjImuAction::NONE){
   zjImuDriver.imuAction(action,face,now);
   zjImuDriver.maintenanceSequence=sequence;
  }
  zjImuDriver.updateGyro(now);zjReleaseI2c();
  portENTER_CRITICAL(&zjTimingMux);
  zjImuMailbox=zjImuDriver;zjImuActionInFlight=false;
  portEXIT_CRITICAL(&zjTimingMux);
 }
}
static void zjControlRevoke(const char* reason){
 portENTER_CRITICAL(&zjTimingMux);
 ++zjFlightRevokeEpoch;
 zjFlightOutputGate.revoke(!strcmp(reason,"EMERGENCY_STOP")?ZjFlightFault::EMERGENCY_STOP:ZjFlightFault::SOURCE_CHANGED);
 zjControlInput={};zjShadowRequested=false;
 portEXIT_CRITICAL(&zjTimingMux);
}
static void zjControlTask(void*){
 const uint32_t started=micros();
 ZjControlScheduler control;control.start(started);
 ZjRatePidState pid[3]={};
 ZjRateShadowResult previous;
 uint32_t lastEpoch=0,lastGeneration=0;
 ZjReceiverSource lastSource=ZjReceiverSource::NONE;
 for(;;){
  ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
  const auto previousWorst=control.maxIntervalUs,previousMissed=control.missedTicks;
  if(!control.begin(micros()))continue;
  ZjRateGains gains[3];
  float rates[3];
  bool requested,imuReady;
  uint32_t epoch;
  ZjRateShadowResult next;
  ZjSampleStamp imuSample;
  ZjFlightConditions conditions;
  portENTER_CRITICAL(&zjTimingMux);
  imuSample=zjImuMailbox.sample;conditions.input=zjControlInput;
  rates[0]=zjImuMailbox.RateRoll;rates[1]=zjImuMailbox.RatePitch;rates[2]=zjImuMailbox.RateYaw;
  imuReady=zjImuMailbox.gyroReady;next.imuReadMaxUs=zjImuMailbox.gyroMaxReadUs;
  for(unsigned i=0;i<3;i++)gains[i]=zjShadowGains[i];
  requested=zjShadowRequested;epoch=zjFlightRevokeEpoch;next.revision=zjShadowRevision;
  portEXIT_CRITICAL(&zjTimingMux);
  const auto& input=conditions.input;
  conditions.nowMs=millis();
  conditions.inputDeadlineMs=input.source==ZjReceiverSource::PPM?ZJ_PPM_LOST_MS:ZJ_RC_DEADMAN_MS;
  conditions.acro=requested;
  const uint32_t at=micros();
  next.imuSampleAgeUs=imuSample.valid?imuSample.ageUs(at):UINT32_MAX;
  conditions.imuFresh=imuReady&&imuSample.fresh(at,12000);
  conditions.timingHealthy=control.intervalUs>=1000&&control.intervalUs<=8000&&control.missedTicks==previousMissed;
  const unsigned phase=uint32_t(at-started)<1000000?0:!imuReady?1:requested?3:2;
  const char* const labels[]={"STARTUP","IMU_CALIBRATION","DISARMED","RC_DIAGNOSTIC"};
  next.maxIntervalPhase=control.maxIntervalUs>previousWorst?labels[phase]:previous.maxIntervalPhase;
  for(unsigned i=0;i<4;i++)next.phaseMaxUs[i]=previous.phaseMaxUs[i];
  next.phaseMaxUs[phase]=std::max(next.phaseMaxUs[phase],control.intervalUs);
  next.computeMaxUs=previous.computeMaxUs;
  if(requested){
   if(!input.fresh(conditions.nowMs,conditions.inputDeadlineMs))next.reason="INPUT_STALE";
   else if(!conditions.imuFresh)next.reason="IMU_STALE";
   else if(!conditions.timingHealthy){next.reason="TIMING_FAULT";next.deadlineFault=true;}
   else{
    if(lastEpoch!=epoch||lastGeneration!=input.generation||lastSource!=input.source||previous.revision!=next.revision){
     for(auto& axis:pid)axis={};
     previous.mix={};
    }
    const uint32_t computeStarted=micros();
    const uint16_t commands[]={input.channels[0],input.channels[1],input.channels[3]};
    ZjRatePidResult correction[3];
    bool valid=true;
    for(unsigned i=0;i<3;i++){
     correction[i]=zjStepRatePid(pid[i],gains[i],zjRateStick(commands[i]),rates[i],
                                 control.intervalUs*.000001f,previous.mix.residual[i]);
     valid=valid&&correction[i].valid;
    }
    if(valid){
     next.reason="READY";
     next.mix=zjRateMixQuadX(input.channels[2],correction[0].output,correction[1].output,correction[2].output);
    }else next.reason="PID_INVALID";
    next.computeMaxUs=std::max(next.computeMaxUs,uint32_t(micros()-computeStarted));
   }
  }
  const auto deadlines=control.deadlineMisses;
  control.finish(micros());
  if(requested&&control.deadlineMisses!=deadlines){
   conditions.timingHealthy=false;next.deadlineFault=true;next.reason="TIMING_FAULT";next.mix={};
  }
  portENTER_CRITICAL(&zjTimingMux);
  if(epoch!=zjFlightRevokeEpoch){next.reason="DISARMED";next.mix={};}
  if(next.deadlineFault)zjFlightOutputGate.revoke(ZjFlightFault::DEADLINE_MISSED);
  // Qualification is locked out and no command reaches the actuator driver.
  // The same independent gate is exercised with a mock actuator on the host.
  next.outputAuthorized=zjFlightOutputGate.permit(conditions,ZJ_FLIGHT_HARDWARE_QUALIFIED)&&next.mix.pulse[0]!=0;
  zjControl=control;zjRateShadow=next;
  portEXIT_CRITICAL(&zjTimingMux);
  if(!next.mix.pulse[0])for(auto& axis:pid)axis={};
  lastEpoch=epoch;lastGeneration=input.generation;lastSource=input.source;previous=next;
 }
}
static ZjRateShadowResult zjReadRateShadow(){
 portENTER_CRITICAL(&zjTimingMux);auto result=zjRateShadow;portEXIT_CRITICAL(&zjTimingMux);return result;
}
static ZjControlScheduler zjReadControl(){
 portENTER_CRITICAL(&zjTimingMux);auto value=zjControl;portEXIT_CRITICAL(&zjTimingMux);return value;
}
static ZjImuAcquisition zjReadImu(uint32_t){
 portENTER_CRITICAL(&zjTimingMux);auto value=zjImuMailbox;portEXIT_CRITICAL(&zjTimingMux);return value;
}
static void zjControlRuntimeSetup(){
 zjI2cMutex=xSemaphoreCreateMutex();zjImuDriver.lastGyroProbe=millis()-2500;
 bool ok=zjI2cMutex!=nullptr;
 if(ok)ok=xTaskCreate(zjControlTask,"zj-shadow-250",4096,nullptr,3,&zjControlTaskHandle)==pdPASS;
 if(ok)ok=xTaskCreate(zjImuTask,"zj-imu",6144,nullptr,3,&zjImuTaskHandle)==pdPASS;
 esp_timer_create_args_t tick={};tick.callback=zjControlWake;tick.name="zj-shadow";tick.skip_unhandled_events=true;
 esp_timer_create_args_t imu={};imu.callback=zjImuWake;imu.name="zj-imu-wake";imu.skip_unhandled_events=true;
 if(ok)ok=esp_timer_create(&tick,&zjControlTimer)==ESP_OK;
 if(ok)ok=esp_timer_create(&imu,&zjImuTimer)==ESP_OK;
 if(ok)ok=esp_timer_start_periodic(zjControlTimer,4000)==ESP_OK;
 if(ok)ok=esp_timer_start_periodic(zjImuTimer,1000)==ESP_OK;
 zjControlRuntimeReady=ok;
 if(ok)zjFlightRevokeHandler=zjControlRevoke;
 if(!ok){
  if(zjControlTimer){esp_timer_stop(zjControlTimer);esp_timer_delete(zjControlTimer);zjControlTimer=nullptr;}
  if(zjImuTimer){esp_timer_stop(zjImuTimer);esp_timer_delete(zjImuTimer);zjImuTimer=nullptr;}
  if(zjControlTaskHandle){vTaskDelete(zjControlTaskHandle);zjControlTaskHandle=nullptr;}
  if(zjImuTaskHandle){vTaskDelete(zjImuTaskHandle);zjImuTaskHandle=nullptr;}
  // No fallback claims 250Hz. Existing bench authorization remains separate.
 }
}
static void zjPublishControlInput(){
 const auto value=zjRcReceiver();
 const bool requested=zjFlightMode=="acro"&&value.inputArmed&&!zjMotorSessionActive&&!zjMotorEnabled&&!zjMotorArmed;
 const ZjRateGains gains[]={zjPidSettings.axis(0),zjPidSettings.axis(1),zjPidSettings.axis(2)};
 portENTER_CRITICAL(&zjTimingMux);
 zjControlInput=value;zjShadowRequested=requested;zjShadowRevision=zjPidSettings.revision;
 for(unsigned i=0;i<3;i++)zjShadowGains[i]=gains[i];
 portEXIT_CRITICAL(&zjTimingMux);
}
#else
// A1 retains its main-loop sensor service. Host fixtures use the real driver
// synchronously and exercise the scheduler arithmetic with a simulated clock.
static bool zjTryI2c(){return true;}
static void zjReleaseI2c(){}
static bool zjImuMaintenanceBusy(){return false;}
static ZjRateShadowResult zjReadRateShadow(){return zjRateShadow;}
static ZjControlScheduler zjReadControl(){return zjControl;}
static ZjImuAcquisition zjReadImu(uint32_t now){zjImuDriver.updateGyro(now);return zjImuDriver;}
static void zjControlRuntimeSetup(){zjImuDriver.lastGyroProbe=millis()-2500;}
static void zjPublishControlInput(){}
#endif
