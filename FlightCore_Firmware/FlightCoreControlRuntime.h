#pragma once
#include "FlightCoreTiming.h"
#include "FlightCoreRatePid.h"
#include "FlightCoreRateTrace.h"
static ZjImuAcquisition zjImuDriver;
static ZjControlScheduler zjControl;

static bool zjControlRuntimeReady=false;
struct ZjRateShadowResult {
 uint32_t revision=0,generation=0,computeMaxUs=0,imuReadMaxUs=0,imuSampleAgeUs=0;
 uint32_t phaseMaxUs[5]={};
 bool deadlineFault=false,outputAuthorized=false,actuating=false,angle=false;
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
static ZjRateGains zjShadowGains[ZJ_PID_GAIN_COUNT/3];
static uint32_t zjShadowRevision=0,zjShadowGeneration=0,zjFlightRevokeEpoch=0,zjFlightLease=0,zjFlightArmAt=0;
static uint32_t zjShadowInputArmEpoch=0,zjLastPublishedInputGeneration=0;
static bool zjLastPublishedInputArmed=false;
static uint8_t zjShadowProfile=0;
static bool zjShadowAngle=false,zjShadowPlus=false,zjShadowPreview=false;
static bool zjPidLayoutMatches(bool plus);
static ZjFlightConditions zjFlightMainConditions();
static ZjFlightDriverState zjFlightDriverRead();
static bool zjFlightDriverClaim(uint32_t lease);
static ZjFlightDriverState zjFlightDriverSubmit(uint32_t lease,const uint16_t (&pulse)[4],uint32_t deadlineUs);
static void zjFlightDriverStop(uint32_t lease,ZjFlightFault fault);
static ZjFlightOutputGate zjFlightOutputGate;
static ZjFlightConditions zjFlightPolicy;
static ZjRateTrace zjFlightTrace;
static ZjFlightFault zjTracePendingFault=ZjFlightFault::NONE;
static uint32_t zjTraceFaultAt=0;
static FlightReceiverSnapshot zjTraceFaultInput;
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
static ZjFlightFault zjControlReleaseReason(const char* reason){
 if(strstr(reason,"STOP"))return ZjFlightFault::EMERGENCY_STOP;
 if(!strcmp(reason,"PPM_SIGNAL_LOST"))return ZjFlightFault::PPM_SIGNAL_LOST;
 if(strstr(reason,"TIMEOUT")||strstr(reason,"STALE"))return ZjFlightFault::INPUT_STALE;
 if(!strcmp(reason,"INPUT_DISARMED")||!strcmp(reason,"USB_RELEASE")||!strcmp(reason,"NETWORK_RELEASE"))
  return ZjFlightFault::INPUT_DISARMED;
 return ZjFlightFault::SOURCE_CHANGED;
}
static void zjControlRevoke(const char* reason){
 const auto fault=zjControlReleaseReason(reason);
 const uint32_t at=micros();
 portENTER_CRITICAL(&zjTimingMux);
 ++zjFlightRevokeEpoch;
 if(zjFlightTrace.active&&zjTracePendingFault==ZjFlightFault::NONE){
  zjTracePendingFault=fault;zjTraceFaultAt=at;zjTraceFaultInput=zjFlightPolicy.input;
 }
 zjFlightOutputGate.revoke(fault);
 if(zjFlightLease)zjFlightDriverStop(zjFlightLease,fault);
 zjFlightLease=0;zjFlightPolicy.input={};zjShadowRequested=false;
 portEXIT_CRITICAL(&zjTimingMux);
}
static ZjFlightFault zjControlArmFlight(){
 if(!ZJ_FLIGHT_HARDWARE_QUALIFIED)return ZjFlightFault::UNQUALIFIED;
 auto conditions=zjFlightMainConditions();
 portENTER_CRITICAL(&zjTimingMux);
 const uint32_t at=micros();
 conditions.nowMs=millis();conditions.inputDeadlineMs=ZJ_PPM_LOST_MS;
 conditions.imuFresh=zjImuMailbox.gyroReady&&zjImuMailbox.sample.fresh(at,12000);
 conditions.timingHealthy=zjControlRuntimeReady&&zjControl.healthy(at)&&
  zjControl.intervalUs>=1000&&zjControl.intervalUs<=8000&&uint32_t(at-zjControl.lastSuccessfulUs)<ZJ_FLIGHT_OUTPUT_LEASE_US;
 conditions.outputOffAck=zjFlightDriverRead().offAck;
 auto result=ZjFlightFault::OUTPUT_RESERVED;
 if(!zjFlightLease){
  if(zjFlightOutputGate.arm(conditions,ZJ_FLIGHT_HARDWARE_QUALIFIED,true)){
   if(!++zjFlightRevokeEpoch)++zjFlightRevokeEpoch;
   if(zjFlightDriverClaim(zjFlightRevokeEpoch)){
    zjFlightLease=zjFlightRevokeEpoch;zjFlightArmAt=at;
    zjFlightPolicy=conditions;zjShadowRequested=true;
    if(zjFlightTrace.active){
     auto arm=zjFlightTrace.last;arm.atUs=arm.triggerUs=at;arm.flags|=ZJ_TRACE_FLIGHT_ARMED;
     zjFlightTrace.flightArm(arm);
    }
    result=ZjFlightFault::NONE;
   }else zjFlightOutputGate.revoke(ZjFlightFault::OFF_UNVERIFIED);
  }
  if(!zjFlightLease)result=zjFlightOutputGate.reason;
 }
 portEXIT_CRITICAL(&zjTimingMux);
 return result;
}
static ZjRateTraceEvent zjTraceTerminalEvent(ZjFlightFault fault){
 if(fault==ZjFlightFault::EMERGENCY_STOP)return ZjRateTraceEvent::STOP;
 if(fault==ZjFlightFault::INPUT_DISARMED)return ZjRateTraceEvent::DISARM;
 return ZjRateTraceEvent::FAILSAFE;
}
static void zjTraceReceiver(ZjRateTraceSample& trace,const FlightReceiverSnapshot& input,uint32_t nowMs,bool fresh){
 trace.source=input.source;trace.inputSeq=input.sequence;trace.inputAccepted=input.accepted;trace.inputGeneration=input.generation;
 if(input.valid){
  std::copy_n(input.channels,4,trace.channels);
  trace.inputAgeMs=std::min(uint32_t(nowMs-input.receivedAtMs),uint32_t(UINT16_MAX-1));
 }
 if(input.inputArmed)trace.flags|=ZJ_TRACE_INPUT_ARMED;
 if(fresh)trace.flags|=ZJ_TRACE_INPUT_FRESH;
}
static void zjTraceDriver(ZjRateTraceSample& trace,const ZjFlightDriverState& driver){
 trace.owner=driver.owner;
 if(driver.offAck)trace.flags|=ZJ_TRACE_OFF_ACK;
 if(driver.appliedKnown){
  trace.flags|=ZJ_TRACE_APPLIED_KNOWN;
  std::copy_n(driver.applied,4,trace.applied);
 }
}
static void zjControlTask(void*){
 const uint32_t started=micros();
 ZjControlScheduler control;control.start(started);
 ZjRatePidState pid[3]={};
 ZjAnglePidState outer[2]={};
 ZjRateShadowResult previous;
 uint32_t lastEpoch=0,lastGeneration=0;
 uint32_t recordedInputArm=0,recordedPreview=0,recordedFlightLease=0;
 ZjReceiverSource lastSource=ZjReceiverSource::NONE;
 bool lastRequested=false,lastPreview=false;
 const auto resetControllers=[&](){
  for(auto& axis:pid)axis={};
  for(auto& axis:outer)axis={};
 };
 for(;;){
  ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
  const auto previousWorst=control.maxIntervalUs,previousMissed=control.missedTicks;
  if(!control.begin(micros()))continue;

  ZjRateGains gains[ZJ_PID_GAIN_COUNT/3];
  float rates[3],gravity[3];
  bool requested,imuReady,level,plus,preview;
  uint32_t epoch,lease,inputArmEpoch;
  ZjRateShadowResult next;
  ZjSampleStamp imuSample;
  ZjFlightConditions conditions;
  ZjRateTraceSample trace;
  portENTER_CRITICAL(&zjTimingMux);
  imuSample=zjImuMailbox.sample;conditions=zjFlightPolicy;
  rates[0]=zjImuMailbox.RateRoll;rates[1]=zjImuMailbox.RatePitch;rates[2]=zjImuMailbox.RateYaw;
  imuReady=zjImuMailbox.gyroReady;next.imuReadMaxUs=zjImuMailbox.gyroMaxReadUs;
  for(unsigned i=0;i<3;i++)gravity[i]=zjImuMailbox.accelG[i]-zjImuMailbox.accelModel.trim[i]/1000.0f;
  level=zjImuMailbox.accelModel.level;
  std::copy_n(zjShadowGains,ZJ_PID_GAIN_COUNT/3,gains);
  requested=zjShadowRequested;epoch=zjFlightRevokeEpoch;lease=zjFlightLease;inputArmEpoch=zjShadowInputArmEpoch;
  next.revision=zjShadowRevision;next.generation=zjShadowGeneration;trace.profile=zjShadowProfile;
  next.angle=zjShadowAngle;plus=zjShadowPlus;preview=zjShadowPreview;
  portEXIT_CRITICAL(&zjTimingMux);

  const auto& input=conditions.input;
  conditions.nowMs=millis();
  conditions.inputDeadlineMs=input.source==ZjReceiverSource::PPM?ZJ_PPM_LOST_MS:ZJ_RC_DEADMAN_MS;
  const bool inputFresh=input.fresh(conditions.nowMs,conditions.inputDeadlineMs);
  const uint32_t at=micros();
  next.imuSampleAgeUs=imuSample.valid?imuSample.ageUs(at):UINT32_MAX;
  conditions.imuFresh=imuReady&&imuSample.fresh(at,12000)&&
   std::isfinite(rates[0])&&std::isfinite(rates[1])&&std::isfinite(rates[2]);
  conditions.timingHealthy=control.intervalUs>=1000&&control.intervalUs<=8000&&control.missedTicks==previousMissed;
  const unsigned phase=uint32_t(at-started)<1000000?0:!imuReady?1:lease?4:requested?3:2;
  const char* const labels[]={"STARTUP","IMU_CALIBRATION","DISARMED","RC_DIAGNOSTIC","RATE_FLIGHT"};
  next.maxIntervalPhase=control.maxIntervalUs>previousWorst?labels[phase]:previous.maxIntervalPhase;
  std::copy_n(previous.phaseMaxUs,5,next.phaseMaxUs);
  next.phaseMaxUs[phase]=std::max(next.phaseMaxUs[phase],control.intervalUs);
  next.computeMaxUs=previous.computeMaxUs;

  trace.atUs=control.lastTickUs;trace.dtUs=control.intervalUs;trace.imuAgeUs=next.imuSampleAgeUs;
  trace.missedTicks=control.missedTicks;trace.revision=next.revision;trace.pidGeneration=next.generation;
  zjTraceReceiver(trace,input,conditions.nowMs,inputFresh);
  if(conditions.imuFresh)trace.flags|=ZJ_TRACE_IMU_VALID;
  if(next.angle)trace.flags|=ZJ_TRACE_ANGLE;
  if(preview)trace.flags|=ZJ_TRACE_PREVIEW;
  const uint16_t commands[]={input.channels[0],input.channels[1],input.channels[3]};
  for(unsigned i=0;i<3;i++){
   trace.axes[i].target=preview?0:zjRateStick(commands[i]);
   trace.axes[i].measured=std::isfinite(rates[i])?rates[i]:0;
  }
  const bool sourceChanged=lastRequested&&(lastGeneration!=input.generation||lastSource!=input.source);
  const bool profileChanged=lastRequested&&(previous.generation!=next.generation||previous.angle!=next.angle);
  if(lastEpoch!=epoch||sourceChanged||profileChanged||lastPreview!=preview){
   resetControllers();
   previous.mix={};
  }

  auto fault=ZjFlightFault::NONE;
  if(requested){
   float angles[2]={};
   if(!preview&&!inputFresh){
    next.reason="INPUT_STALE";
    fault=input.source==ZjReceiverSource::PPM?ZjFlightFault::PPM_SIGNAL_LOST:ZjFlightFault::INPUT_STALE;
   }else if(!conditions.imuFresh){
    next.reason="IMU_STALE";fault=ZjFlightFault::IMU_STALE;
   }else if(!conditions.timingHealthy){
    next.reason="TIMING_FAULT";fault=ZjFlightFault::DEADLINE_MISSED;
   }else if(!preview&&zjFlightLowThrottle(input.channels[2])){
    next.reason="LOW_THROTTLE";trace.reason=ZjFlightFault::LOW_THROTTLE;
    trace.throttleUsed=1000;
    for(auto& pulse:next.mix.pulse)pulse=1000;
   }else if(next.angle&&(!level||!zjBenchAngles(gravity[0],gravity[1],gravity[2],angles))){
    next.reason="ANGLE_LEVEL_REQUIRED";fault=ZjFlightFault::MODE_UNSUPPORTED;
   }else{
    const uint32_t computeStarted=micros();
    const float dt=control.intervalUs*.000001f;
    float correction[3]={};
    for(unsigned i=0;i<3;i++){
     auto& axis=trace.axes[i];
     if(next.angle&&i<2)axis.target=zjStepAnglePid(outer[i],gains[i+3],axis.target*(26.0f/75.0f),angles[i],dt);
     const auto pidResult=zjStepRatePid(pid[i],gains[i],axis.target,axis.measured,dt,previous.mix.residual[i]);
     axis.p=pidResult.p;axis.i=pidResult.i;axis.d=pidResult.d;axis.correction=correction[i]=pidResult.output;
     if(pidResult.saturated)trace.pidSaturationMask|=uint8_t(1u<<i);
     if(!pidResult.valid)fault=ZjFlightFault::PID_INVALID;
    }
    if(fault==ZjFlightFault::NONE){
     trace.flags|=ZJ_TRACE_PID_VALID;
     next.reason=preview?"BENCH_PREVIEW":"READY";
     trace.throttleUsed=preview?1000:zjFlightMixThrottle(input.channels[2]);
     if(!preview&&trace.throttleUsed!=input.channels[2])trace.flags|=ZJ_TRACE_THROTTLE_CAPPED;
     next.mix=(plus?zjRateMixQuadPlus:zjRateMixQuadX)(trace.throttleUsed,correction[0],correction[1],correction[2]);
    }else next.reason="PID_INVALID";
    next.computeMaxUs=std::max(next.computeMaxUs,uint32_t(micros()-computeStarted));
   }
  }
  for(unsigned i=0;i<4;i++)trace.requested[i]=uint16_t(next.mix.pulse[i]+.5f);
  trace.mixClipMask=next.mix.clipMask;
  if(!(trace.flags&ZJ_TRACE_PID_VALID))resetControllers();

  portENTER_CRITICAL(&zjTimingMux);
  if(epoch!=zjFlightRevokeEpoch){
   next.reason="DISARMED";next.mix={};
   lease=0;
  }
  if(lease){
   if(!requested&&fault==ZjFlightFault::NONE)fault=ZjFlightFault::OUTPUT_RESERVED;
   if(profileChanged&&fault==ZjFlightFault::NONE)fault=ZjFlightFault::PROFILE_CHANGED;
   conditions.nowMs=millis();
   conditions.imuFresh=conditions.imuFresh&&imuSample.fresh(micros(),12000);
   if(fault==ZjFlightFault::NONE&&!zjFlightOutputGate.permit(conditions,ZJ_FLIGHT_HARDWARE_QUALIFIED))
    fault=zjFlightOutputGate.reason;
   if(fault==ZjFlightFault::NONE){
    const auto driver=zjFlightDriverSubmit(lease,trace.requested,control.nextDueUs);
    if(driver.lease!=lease)fault=driver.fault==ZjFlightFault::NONE?ZjFlightFault::OUTPUT_ERROR:driver.fault;
   }
  }
  const auto deadlines=control.deadlineMisses;
  control.finish(micros());
  if(requested&&control.deadlineMisses!=deadlines)fault=ZjFlightFault::DEADLINE_MISSED;
  if(fault==ZjFlightFault::DEADLINE_MISSED){
   next.deadlineFault=true;next.reason="TIMING_FAULT";
  }
  if(lease&&fault!=ZjFlightFault::NONE){
   zjFlightOutputGate.revoke(fault);zjFlightDriverStop(lease,fault);zjFlightLease=0;
   next.mix={};
  }
  next.outputAuthorized=zjFlightLease!=0;
  const bool newCapture=preview?next.generation!=recordedPreview:
   inputArmEpoch!=recordedInputArm||(lease&&lease!=recordedFlightLease);
  const bool startCapture=requested&&epoch==zjFlightRevokeEpoch&&newCapture&&!zjFlightTrace.active;
  if(zjFlightTrace.active||startCapture||zjFlightLease){
   const auto driver=zjFlightDriverRead();
   zjTraceDriver(trace,driver);
   next.actuating=driver.owner==ZjOutputOwner::FLIGHT&&driver.appliedKnown&&driver.applied[0];
  }
  if(zjFlightLease)trace.flags|=ZJ_TRACE_FLIGHT_ARMED;
  if(startCapture){
   zjFlightTrace.begin(trace,preview);
   if(preview)recordedPreview=next.generation;else recordedInputArm=inputArmEpoch;
  }
  if(zjFlightTrace.active){
   if(lease)recordedFlightLease=lease;
   if(lease&&!zjFlightTrace.haveArm){
    auto arm=trace;arm.triggerUs=zjFlightArmAt;zjFlightTrace.flightArm(arm);
   }
   if(zjTracePendingFault!=ZjFlightFault::NONE){
    fault=zjTracePendingFault;trace.triggerUs=zjTraceFaultAt;
    // Preserve the last owned frame, including its real timestamp, if main
    // loop release removed the receiver before this control tick ran.
    if(zjTraceFaultInput.valid){
     trace.flags&=~(ZJ_TRACE_INPUT_ARMED|ZJ_TRACE_INPUT_FRESH);
     if(input.sequence!=zjTraceFaultInput.sequence||input.generation!=zjTraceFaultInput.generation){
      trace.flags&=~(ZJ_TRACE_PID_VALID|ZJ_TRACE_THROTTLE_CAPPED);
      trace.throttleUsed=trace.pidSaturationMask=trace.mixClipMask=0;
      for(auto& pulse:trace.requested)pulse=0;
      const auto& channels=zjTraceFaultInput.channels;
      const uint16_t sticks[]={channels[0],channels[1],channels[3]};
      for(unsigned n=0;n<3;n++)trace.axes[n]={zjRateStick(sticks[n]),trace.axes[n].measured};
     }
     zjTraceReceiver(trace,zjTraceFaultInput,conditions.nowMs,false);
    }
   }else if(fault==ZjFlightFault::NONE){
    if(sourceChanged&&!preview)fault=ZjFlightFault::SOURCE_CHANGED;
    else if(profileChanged)fault=ZjFlightFault::PROFILE_CHANGED;
    else if(!requested)fault=conditions.benchActive||conditions.escCalibration||conditions.maintenance?
     ZjFlightFault::OUTPUT_RESERVED:ZjFlightFault::INPUT_DISARMED;
   }
   if(fault!=ZjFlightFault::NONE){
    if(zjTracePendingFault==ZjFlightFault::NONE)trace.triggerUs=trace.atUs;
    zjFlightTrace.freeze(trace,zjTraceTerminalEvent(fault),fault);
   }else zjFlightTrace.observe(trace);
  }
  zjTracePendingFault=ZjFlightFault::NONE;
  zjControl=control;zjRateShadow=next;
  portEXIT_CRITICAL(&zjTimingMux);

  if(fault!=ZjFlightFault::NONE){
   resetControllers();
   next.mix={};
  }
  lastEpoch=epoch;lastGeneration=input.generation;lastSource=input.source;
  lastRequested=requested;lastPreview=preview;previous=next;
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
 const auto conditions=zjFlightMainConditions();
 const bool plus=ZJ_PID_PROFILES[zjPidActive.profile].plus;
 const bool preview=zjPidPreview&&!conditions.input.inputArmed;
 const bool requested=(conditions.input.inputArmed||preview)&&!conditions.benchActive&&!conditions.escCalibration&&
  !conditions.maintenance&&conditions.wiringVerified;
 ZjRateGains gains[ZJ_PID_GAIN_COUNT/3];
 for(unsigned i=0;i<ZJ_PID_GAIN_COUNT/3;i++)gains[i]=zjPidActive.axis(i);
 portENTER_CRITICAL(&zjTimingMux);
 const auto& input=conditions.input;
 if(input.inputArmed&&(!zjLastPublishedInputArmed||input.generation!=zjLastPublishedInputGeneration))
  if(!++zjShadowInputArmEpoch)++zjShadowInputArmEpoch;
 zjLastPublishedInputArmed=input.inputArmed;zjLastPublishedInputGeneration=input.generation;
 zjFlightPolicy=conditions;zjShadowRequested=requested;zjShadowRevision=zjPidActive.revision;
 zjShadowGeneration=zjPidGeneration;zjShadowProfile=zjPidActive.profile;
 zjShadowAngle=zjFlightMode=="angle";zjShadowPlus=plus;zjShadowPreview=preview;
 std::copy_n(gains,ZJ_PID_GAIN_COUNT/3,zjShadowGains);
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
