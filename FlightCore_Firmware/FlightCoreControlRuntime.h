#pragma once
#include "FlightCoreTiming.h"
static ZjImuAcquisition zjImuDriver;
static ZjControlScheduler zjControl;
static ZjControlInputSnapshot zjControlInput,zjControlConsumedInput;
static ZjSampleStamp zjControlConsumedImu;
static bool zjControlRuntimeReady=false;
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
#include <esp_timer.h>
#include <freertos/semphr.h>
static SemaphoreHandle_t zjI2cMutex=nullptr;
static portMUX_TYPE zjTimingMux=portMUX_INITIALIZER_UNLOCKED;
static ZjImuAcquisition zjImuMailbox;
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
  zjImuDriver.updateGyro(millis());zjReleaseI2c();
  portENTER_CRITICAL(&zjTimingMux);zjImuMailbox=zjImuDriver;portEXIT_CRITICAL(&zjTimingMux);
 }
}
static void zjControlTask(void*){
 ZjControlScheduler control;control.start(micros());
 for(;;){
  ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
  if(!control.begin(micros()))continue;
  // Reusing observations never advances their sequence or freshness. This
  // shadow tick has no command path and cannot grant motor authorization.
  portENTER_CRITICAL(&zjTimingMux);
  zjControlConsumedImu=zjImuMailbox.sample;zjControlConsumedInput=zjControlInput;
  zjControlConsumedImu.valid=zjControlConsumedImu.fresh(micros(),12000);
  zjControlConsumedInput.valid=zjControlConsumedInput.valid&&uint32_t(millis()-zjControlConsumedInput.receivedMs)<=(zjControlConsumedInput.source==1?ZJ_PPM_LOST_MS:ZJ_RC_DEADMAN_MS);
  portEXIT_CRITICAL(&zjTimingMux);
  control.finish(micros());
  portENTER_CRITICAL(&zjTimingMux);zjControl=control;portEXIT_CRITICAL(&zjTimingMux);
 }
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
 if(!ok){
  if(zjControlTimer){esp_timer_stop(zjControlTimer);esp_timer_delete(zjControlTimer);zjControlTimer=nullptr;}
  if(zjImuTimer){esp_timer_stop(zjImuTimer);esp_timer_delete(zjImuTimer);zjImuTimer=nullptr;}
  if(zjControlTaskHandle){vTaskDelete(zjControlTaskHandle);zjControlTaskHandle=nullptr;}
  if(zjImuTaskHandle){vTaskDelete(zjImuTaskHandle);zjImuTaskHandle=nullptr;}
  // No fallback claims 250Hz. Existing bench authorization remains separate.
 }
}
static void zjPublishControlInput(uint32_t receivedMs){
 ZjControlInputSnapshot value;value.sequence=zjRcSeq;value.receivedMs=receivedMs;value.observedUs=micros();
 value.valid=zjRcOwned&&zjRcHasFrame&&uint32_t(millis()-receivedMs)<=ZJ_RC_DEADMAN_MS;
 value.throttle=zjRcThrottle;value.roll=zjRcRoll;value.pitch=zjRcPitch;value.yaw=zjRcYaw;
 value.source=zjRcSource=="PPM"?1:zjRcSource=="ANDROID"?2:zjRcSource=="WEB"?3:0;
 portENTER_CRITICAL(&zjTimingMux);zjControlInput=value;portEXIT_CRITICAL(&zjTimingMux);
}
#else
// A1 retains its main-loop sensor service. Host fixtures use the real driver
// synchronously and exercise the scheduler arithmetic with a simulated clock.
static bool zjTryI2c(){return true;}
static void zjReleaseI2c(){}
static ZjControlScheduler zjReadControl(){return zjControl;}
static ZjImuAcquisition zjReadImu(uint32_t now){zjImuDriver.updateGyro(now);return zjImuDriver;}
static void zjControlRuntimeSetup(){zjImuDriver.lastGyroProbe=millis()-2500;}
static void zjPublishControlInput(uint32_t receivedMs){}
#endif
